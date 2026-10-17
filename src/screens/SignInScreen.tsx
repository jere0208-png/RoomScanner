/**
 * LA PORTE D'ENTRÉE — un compte avant le premier scan.
 *
 * Trois chemins, du plus court au plus long : Apple (natif, un geste),
 * Google (à câbler — le bouton le dit au lieu de mentir), e-mail (local,
 * prénom + adresse, zéro mot de passe : l'app n'a pas de serveur, un mot de
 * passe ne protégerait rien et en ferait perdre un).
 *
 * LE REFUS D'UN DEUXIÈME COMPTE S'EXPLIQUE. Le trousseau retient le compte
 * créé sur ce téléphone ; en créer un autre remettrait le palier gratuit à
 * zéro. Le message dit pourquoi, plutôt qu'un « erreur » sec.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { LogoMark } from '../components/LogoMark';
import { LightRibbon } from '../components/LightRibbon';
import { useAccountStore } from '../store/accountStore';
import { connexionWeb } from '../native/account';
import { SERVEUR } from '../config/serveur';
import { dark, useTheme, type Palette } from '../theme';
import { alerte } from '../ui/alerte';
import { signaler } from '../ui/panne';

/** Le logo Apple (règles de « Se connecter avec Apple »). */
const LOGO_APPLE =
  'M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z';

/** Le « G » de Google, en ses quatre couleurs (règles de la marque). */
const LOGO_GOOGLE: [string, string][] = [
  ['M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z', '#FFC107'],
  ['M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z', '#FF3D00'],
  ['M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z', '#4CAF50'],
  ['M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z', '#1976D2'],
];

export function SignInScreen() {
  const c = useTheme();
  const s = themed(c);
  const { width: largeur } = useWindowDimensions();
  const sombre = c === dark;
  const connecter = useAccountStore((st) => st.connecter);
  const entrerEnInvite = useAccountStore((st) => st.entrerEnInvite);
  const connecterApple = useAccountStore((st) => st.connecterApple);
  const [parEmail, setParEmail] = useState(false);
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  /*
    LE CODE REÇU PAR E-MAIL — la preuve qu'on possède l'adresse. Sans lui,
    n'importe qui se connectait au compte de n'importe qui en tapant son
    e-mail. `codeEnvoye` : l'adresse à laquelle il est parti.
  */
  const [codeEnvoye, setCodeEnvoye] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const demanderCodeEmail = useAccountStore((st) => st.demanderCodeEmail);

  /*
    LA VRAIE CAUSE, SANS ACCUSER INTERNET — revue « Nadia » : une faute dans
    l'adresse donnait « Vérifiez votre accès à internet… ». Quand le serveur
    ou la saisie donnent une raison, c'est elle qu'on lit ; le conseil du
    réseau ne vient que quand on n'en sait pas plus.
  */
  const refuse = (raison?: string) => {
    if (raison) {
      alerte('La connexion n’a pas abouti', raison);
      return;
    }
    // Sans raison connue : c'est celle-là qui mérite le journal.
    const p = signaler('connexion', raison, 'connexion');
    alerte(p.titre, p.message);
  };

  const viaApple = async () => {
    const r = await connecterApple();
    if (!r.ok) refuse(r.raison);
  };

  const viaGoogle = async () => {
    // Sans serveur configuré (src/config/serveur.ts), on le dit — on ne
    // simule pas une connexion.
    if (!SERVEUR.url) {
      alerte(
        'Bientôt disponible',
        'La connexion Google passe par le serveur EchoPlan, qui reste à ' +
          'configurer. Utilisez Apple ou l’e-mail en attendant.',
      );
      return;
    }
    try {
      // La feuille web fait tout le flux OAuth côté serveur, et rend
      // l'identité par le schéma de retour — signée, non forgeable.
      const retour = await connexionWeb(
        `${SERVEUR.url}/auth-google.php`,
        SERVEUR.schemaRetour,
      );
      const champ = (nom: string) => {
        const m = new RegExp(`[?&]${nom}=([^&]*)`).exec(retour);
        return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
      };
      const id = champ('id');
      if (!id.startsWith('google:')) {
        refuse('Le retour de Google est illisible.');
        return;
      }
      const r = await connecter(
        {
          id,
          prenom: champ('prenom') || undefined,
          email: champ('email') || undefined,
          methode: 'google',
        },
        // La signature de la page de connexion : le serveur la vérifie.
        { sig: champ('sig') },
      );
      if (!r.ok) refuse(r.raison);
    } catch (e) {
      refuse((e as Error).message);
    }
  };

  const adresseSaisie = () => email.trim().toLowerCase();

  /** Le compte par e-mail, une fois l'adresse prouvée (ou sans serveur). */
  const entrerParEmail = async (adresse: string, preuve?: { code: string }) => {
    const r = await connecter(
      {
        id: `email:${adresse}`,
        prenom: prenom.trim() || undefined,
        email: adresse,
        methode: 'email',
      },
      preuve,
    );
    if (!r.ok) refuse(r.raison);
  };

  /** Premier temps : le code part à l'adresse. */
  const viaEmail = async () => {
    const adresse = adresseSaisie();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresse)) {
      alerte('Adresse à vérifier', 'Cette adresse semble incomplète (exemple : prenom@gmail.com).');
      return;
    }
    const r = await demanderCodeEmail(adresse);
    if (!r.ok) {
      refuse(r.raison);
      return;
    }
    if (r.sansServeur) {
      await entrerParEmail(adresse);
      return;
    }
    setCode('');
    setCodeEnvoye(adresse);
  };

  /** Second temps : le code reçu, qui part avec la connexion. */
  const validerCode = async () => {
    if (!codeEnvoye) return;
    const chiffres = code.replace(/\D/g, '');
    if (chiffres.length !== 6) {
      alerte('Code à six chiffres', 'Le code reçu par e-mail compte six chiffres : recopiez-le en entier.');
      return;
    }
    await entrerParEmail(codeEnvoye, { code: chiffres });
  };

  /** L'onde derrière un bouton : le même ruban que l'accueil, en plus bas,
   *  posé en absolu pour ne rien pousser — le bouton flotte dessus. */
  const ruban = (
    <View style={s.ruban} pointerEvents="none">
      <LightRibbon width={largeur} palette={c} sombre={sombre} height={56} />
    </View>
  );

  return (
    // La zone sûre par le composant, pas à la main : le premier jet posait
    // les mentions SOUS l'indicateur d'accueil de l'iPhone.
    <SafeAreaView style={s.fond} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={s.colonne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.haut}>
        <LogoMark size={92} />
        <Text style={s.titre}>EchoPlan</Text>
        <Text style={s.sousTitre}>
          Scannez un logement, repartez avec le plan coté et la 3D — puis
          entrez dedans.
        </Text>
      </View>

      <View style={s.boutons}>
        <View style={s.slot}>
          {ruban}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continuer avec Apple"
            style={({ pressed }) => [s.btn, s.btnApple, pressed && s.enfonce]}
            onPress={viaApple}>
            {/*
              LE LOGO APPLE SUR LE BOUTON — vu sur les captures du simulateur :
              le bouton n'avait que du texte, et les règles d'Apple veulent
              son logo sur « Continuer avec Apple ».
            */}
            <View style={s.btnLigne}>
              <Svg width={17} height={20} viewBox="0 0 814 1000">
                <Path d={LOGO_APPLE} fill={StyleSheet.flatten(s.btnAppleTexte).color as string} />
              </Svg>
              <Text style={s.btnAppleTexte}>Continuer avec Apple</Text>
            </View>
          </Pressable>
        </View>
        <View style={s.slot}>
          {ruban}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continuer avec Google"
            style={({ pressed }) => [s.btn, s.btnClair, pressed && s.enfonce]}
            onPress={viaGoogle}>
            <View style={s.btnLigne}>
              <Svg width={19} height={19} viewBox="0 0 48 48">
                {LOGO_GOOGLE.map(([d, fill]) => (
                  <Path key={fill} d={d} fill={fill} />
                ))}
              </Svg>
              <Text style={s.btnClairTexte}>Continuer avec Google</Text>
            </View>
          </Pressable>
        </View>

        {!parEmail ? (
          <View style={s.slot}>
            {ruban}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continuer avec un e-mail"
              style={({ pressed }) => [s.btn, s.btnClair, pressed && s.enfonce]}
              onPress={() => setParEmail(true)}>
              <Text style={s.btnClairTexte}>Continuer avec un e-mail</Text>
            </Pressable>
          </View>
        ) : codeEnvoye ? (
          <View style={s.formulaire}>
            <Text style={s.codeEnvoye}>{`Code envoyé à ${codeEnvoye}. Il est valable quinze minutes.`}</Text>
            <TextInput
              style={s.champ}
              placeholder="Code à 6 chiffres"
              placeholderTextColor={c.inkFaint}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={validerCode}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Se connecter"
              style={({ pressed }) => [s.btn, s.btnBleu, pressed && s.enfonce]}
              onPress={validerCode}>
              <Text style={s.btnBleuTexte}>Se connecter</Text>
            </Pressable>
            <View style={s.codeActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Renvoyer le code" onPress={viaEmail} hitSlop={8}>
                <Text style={s.codeLien}>Renvoyer le code</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Changer d’adresse"
                onPress={() => setCodeEnvoye(null)}
                hitSlop={8}>
                <Text style={s.codeLien}>Changer d’adresse</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={s.formulaire}>
            <TextInput
              style={s.champ}
              placeholder="Prénom"
              placeholderTextColor={c.inkFaint}
              value={prenom}
              onChangeText={setPrenom}
              autoCapitalize="words"
            />
            <TextInput
              style={s.champ}
              placeholder="adresse@exemple.fr"
              placeholderTextColor={c.inkFaint}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Recevoir un code"
              style={({ pressed }) => [s.btn, s.btnBleu, pressed && s.enfonce]}
              onPress={viaEmail}>
              <Text style={s.btnBleuTexte}>Recevoir un code</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/*
        LA PORTE SANS COMPTE — sous les trois connexions, discrète mais
        entière. Le cœur de l'app est local ; un curieux qui vient
        d'installer ne doit pas buter sur un formulaire avant sa première
        seconde d'usage (et la revue Apple refuse qu'on l'y oblige). Le
        palier gratuit, lui, se compte par appareil : l'invité n'y échappe
        pas.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Découvrir sans compte"
        hitSlop={6}
        style={({ pressed }) => [s.sansCompte, pressed && s.enfonce]}
        onPress={entrerEnInvite}>
        <Text style={s.sansCompteTexte}>Découvrir sans compte</Text>
      </Pressable>

      {/* Revue de lisibilité : « DXF » ne parle qu'au dessinateur — le
          grand public lit ici la règle du jeu, pas un format de fichier.
          Revue des découvreurs : le capteur ne se dit plus ici. Il était
          répété de la connexion à l'accueil ; l'accueil le dit, une fois,
          sur la tuile du scan — à l'appareil qui n'en a pas, et à lui seul. */}
      <Text style={s.mentions}>
        Scanner et dessiner vos plans, c’est gratuit et sans limite ; le Pro
        les envoie en PDF ou en 3D, et les garde en ligne.
      </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const themed = (c: Palette) =>
  StyleSheet.create({
    fond: { flex: 1, backgroundColor: c.bg },
    colonne: {
      flex: 1,
      paddingHorizontal: 28,
      paddingTop: 24,
      paddingBottom: 12,
      justifyContent: 'space-between',
    },
    haut: { alignItems: 'center', marginTop: 36 },
    /* Chaque bouton flotte sur son onde : la bande, posée en absolu et
       débordant des marges, ne pousse rien et ne reçoit pas le doigt. */
    slot: { justifyContent: 'center' },
    ruban: {
      position: 'absolute',
      left: -28,
      right: -28,
      alignItems: 'center',
    },
    titre: { color: c.ink, fontSize: 30, fontWeight: '800', marginTop: 18 },
    sousTitre: {
      color: c.inkSoft,
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
      marginTop: 10,
      maxWidth: 300,
    },
    boutons: { gap: 12 },
    btn: {
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    enfonce: { transform: [{ scale: 0.97 }] },
    btnLigne: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    /*
      LE BOUTON APPLE EST NOIR SUR CLAIR, ET BLANC SUR SOMBRE.

      Relevé du patron, capture à l'appui : « le bouton Apple est noir
      différent ». Il l'était, et c'était un noir qui n'appartenait à
      personne : `#0B0D12` écrit en dur, c'est-à-dire l'ENCRE DU THÈME
      CLAIR. Sur fond clair, un bouton noir — la règle d'Apple, et le dessin
      juste. Sur fond sombre, la page vaut `#0D1015` et le bouton
      `#0B0D12` : un noir PLUS SOMBRE que la page, à un cheveu près. Il ne
      se lisait plus comme un bouton mais comme un trou, et c'était le seul
      des trois à ne pas avoir de contour pour le rattraper.

      Apple pose ce bouton en NOIR ou en BLANC — jamais dans une nuance de la
      charte d'à côté — et l'on prend celui qui tranche. C'est ce qu'on ne
      suivait qu'à moitié.
    */
    btnApple: { backgroundColor: c === dark ? '#FFFFFF' : '#000000' },
    btnAppleTexte: {
      color: c === dark ? '#000000' : '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
    btnClair: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.lineStrong,
    },
    btnClairTexte: { color: c.ink, fontSize: 16, fontWeight: '600' },
    btnBleu: { backgroundColor: c.blue },
    btnBleuTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    /* Un lien, pas un quatrième bouton : la porte est offerte, pas vendue. */
    sansCompte: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
    sansCompteTexte: {
      color: c.inkSoft,
      fontSize: 14.5,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
    formulaire: { gap: 10 },
    codeEnvoye: { color: c.inkSoft, fontSize: 14, lineHeight: 19, textAlign: 'center' },
    codeActions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
    codeLien: { color: c.blue, fontSize: 14, fontWeight: '600' },
    champ: {
      height: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.lineStrong,
      backgroundColor: c.surface,
      color: c.ink,
      paddingHorizontal: 14,
      fontSize: 15,
    },
    mentions: {
      color: c.inkFaint,
      fontSize: 12,
      lineHeight: 17,
      textAlign: 'center',
    },
  });

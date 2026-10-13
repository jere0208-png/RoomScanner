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
import { LogoMark } from '../components/LogoMark';
import { LightRibbon } from '../components/LightRibbon';
import { useAccountStore } from '../store/accountStore';
import { connexionWeb } from '../native/account';
import { SERVEUR } from '../config/serveur';
import { dark, useTheme, type Palette } from '../theme';
import { alerte } from '../ui/alerte';
import { panne as expliquer } from '../ui/panne';

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
  const refuse = (raison?: string) =>
    raison
      ? alerte('La connexion n’a pas abouti', raison)
      : alerte(expliquer('connexion', raison).titre, expliquer('connexion', raison).message);

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
            <Text style={s.btnAppleTexte}>Continuer avec Apple</Text>
          </Pressable>
        </View>
        <View style={s.slot}>
          {ruban}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continuer avec Google"
            style={({ pressed }) => [s.btn, s.btnClair, pressed && s.enfonce]}
            onPress={viaGoogle}>
            <Text style={s.btnClairTexte}>Continuer avec Google</Text>
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

      <Text style={s.mentions}>
        Scanner est gratuit et sans limite ; le Pro envoie vos plans en PDF,
        DXF ou 3D, et les garde en ligne.
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

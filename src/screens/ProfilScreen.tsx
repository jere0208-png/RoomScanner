/**
 * LA PAGE PROFIL — tout ce qui touche à l'utilisateur, au même endroit.
 *
 * Le compte tenait dans une carte modale ouverte depuis l'accueil : avatar,
 * nom, trois boutons, et c'était tout. Rien n'avait donc de place pour
 * grandir — ni les réglages, ni l'abonnement, ni l'apparence — et l'accueil
 * ramassait ce qui débordait : le bouton de thème y flottait dans un coin,
 * seul réglage de l'application à vivre sur l'écran d'arrivée, à portée
 * d'un doigt qui visait le scan.
 *
 * Le patron a donné un design à suivre, et cette page le suit : une barre
 * sobre, l'identité en tête, puis des sections titrées — l'abonnement en
 * carte, l'apparence en ronds, le reste en rangées à chevron. Chaque bloc
 * est une chose qu'on vient FAIRE ici, jamais une décoration.
 */
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import { MoreDots } from '../components/MoreDots';
import { MenuCompte } from '../components/MenuCompte';
import { SupportSheet } from '../components/SupportSheet';
import { ThemeGlyph } from '../components/ThemeGlyph';
import { ContourVif, TexteVif } from '../components/ContourVif';
import { SOLAIRES } from '../ui/solaires';
import { PLANS_GRATUITS, useAccountStore } from '../store/accountStore';
import { useScanStore, type ThemePref } from '../store/scanStore';
import { radius, shadowCard, useTheme, type Palette } from '../theme';
import { alerte } from '../ui/alerte';
import { panne as expliquer } from '../ui/panne';

/**
 * LES TROIS APPARENCES, DANS L'ORDRE DU DESIGN.
 *
 * « Système » vient en premier parce que c'est le réglage par défaut et le
 * bon conseil : le téléphone sait mieux que nous quand la nuit tombe. Les
 * deux autres sont des choix délibérés, qui l'emportent tant qu'on ne les
 * reprend pas.
 */
/**
 * UNE DATE EN TOUTES LETTRES, SANS `Intl`.
 *
 * `toLocaleDateString('fr-FR', { month: 'long' })` dépend de la variante
 * d'Hermès embarquée : sur certains builds elle rend « November ». Douze
 * mots dans un tableau ne dépendent de rien, et c'est la date d'un
 * PRÉLÈVEMENT — on ne la laisse pas au hasard d'une compilation.
 */
const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
export function dateEnLettres(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

const APPARENCES: { cle: ThemePref; mot: string; label: string }[] = [
  { cle: 'system', mot: 'Système', label: 'Thème système' },
  { cle: 'light', mot: 'Clair', label: 'Thème clair' },
  { cle: 'dark', mot: 'Sombre', label: 'Thème sombre' },
];

export function ProfilScreen() {
  const c = useTheme();
  const s = themed(c);
  const insets = useSafeAreaInsets();
  const setScreen = useScanStore((st) => st.setScreen);
  const themePref = useScanStore((st) => st.themePref);
  const setThemePref = useScanStore((st) => st.setThemePref);
  const saves = useScanStore((st) => st.saves);
  const compte = useAccountStore((st) => st.compte);
  const pro = useAccountStore((st) => st.pro);
  const proVia = useAccountStore((st) => st.proVia);
  const plansUtilises = useAccountStore((st) => st.plansUtilises);
  const bonusEssais = useAccountStore((st) => st.bonusEssais);
  const ouvrirPaywall = useAccountStore((st) => st.ouvrirPaywall);
  const proEcheance = useAccountStore((st) => st.proEcheance);
  const proReconduit = useAccountStore((st) => st.proReconduit);
  const restaurerPro = useAccountStore((st) => st.restaurerPro);
  const [menu, setMenu] = useState(false);
  /** Le mot au service client : sujet, message, photo. */
  const [support, setSupport] = useState(false);

  const restant = Math.max(0, PLANS_GRATUITS + bonusEssais - plansUtilises);
  const nom = compte?.prenom || compte?.email || 'Mon compte';

  const restaurer = async () => {
    try {
      const ok = await restaurerPro();
      alerte(
        ok ? 'Abonnement restauré' : 'Aucun achat trouvé',
        ok
          ? 'Votre Pro est de retour.'
          : 'L’App Store ne connaît pas d’abonnement pour ce compte Apple.',
      );
    } catch (e) {
      alerte(
        expliquer('restauration', e).titre,
        expliquer('restauration', e).message,
      );
    }
  };

  return (
    /* Le bord gauche ramène à l'accueil, comme la flèche. En enveloppe : la
       page défile, et une bande posée dessus lui volerait ses appuis. */
    <RetourGlisse
      onRetour={() => setScreen('home')}
      style={[s.fond, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[s.contenu, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}>
        <View style={s.barre}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retour"
            style={s.rondBarre}
            hitSlop={10}
            onPress={() => setScreen('home')}>
            <BackChevron color={c.ink} />
          </Pressable>
          <Text style={s.titreBarre}>Profil</Text>
          {/*
            LA PORTE VERS UN HUMAIN — relevé du patron : une icône de tchat
            pour le service client. L'application n'avait aucun endroit où
            dire quelque chose à son auteur ; elle en a un, et il est là où
            l'on va déjà quand quelque chose cloche avec son compte.
          */}
          <View style={s.barreDroite}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Écrire au service client"
              style={s.rondBarre}
              hitSlop={10}
              onPress={() => setSupport(true)}>
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path d={SOLAIRES.tchat} fill={c.ink} fillRule="evenodd" />
              </Svg>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Plus d’options"
              style={s.rondBarre}
              hitSlop={10}
              onPress={() => setMenu(true)}>
              <MoreDots color={c.ink} size={20} />
            </Pressable>
          </View>
        </View>

        {/*
          L'IDENTITÉ EN TÊTE, ET RIEN QUI SE CLIQUE.

          Le design pose un grand avatar, le nom, l'adresse. On n'a pas de
          photo à montrer — l'app ne demande pas la pellicule pour ça — donc
          l'avatar est notre silhouette Solar, cerclée d'or quand le compte
          est Pro : le grade se VOIT sans qu'on l'écrive, exactement comme
          sur l'accueil.
        */}
        {pro ? (
          <ContourVif rayon={44} fond={c.bg} style={s.avatarCadre}>
            <View style={s.avatarDedans}>
              <Svg width={84} height={84} viewBox="0 0 24 24">
                <Path d={SOLAIRES.avatar} fill={c.blue} fillRule="evenodd" />
              </Svg>
            </View>
          </ContourVif>
        ) : (
          <View style={s.avatar}>
            <Svg width={88} height={88} viewBox="0 0 24 24">
              <Path d={SOLAIRES.avatar} fill={c.blue} fillRule="evenodd" />
            </Svg>
          </View>
        )}
        {pro ? (
          <TexteVif texte={nom} taille={21} fond={c.bg} style={s.nomOr} />
        ) : (
          <Text style={s.nom} numberOfLines={1}>
            {nom}
          </Text>
        )}
        {!!compte?.email && (
          <Text style={s.email} numberOfLines={1}>
            {compte.email}
          </Text>
        )}

        <Text style={s.section}>Abonnement</Text>
        {/*
          LA CARTE DIT L'ÉTAT, PAS L'ENVIE.

          En gratuit elle vend, en Pro elle rassure : proposer d'acheter ce
          qu'on a déjà est la faute qui fait douter d'un paiement passé — et
          c'est la première chose qu'on vient vérifier ici après avoir payé.
        */}
        <View style={s.carteAbo}>
          {/* Le rond garde le BLEU de l'app, Pro ou pas — relevé du
              patron. Il passait au vert en Pro : une couleur qui ne sert
              qu'ici, sur un écran qui n'en a pas d'autre, se lit comme une
              alerte plutôt que comme un grade. */}
          <View style={s.rondEtoile}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path d={SOLAIRES.etoile} fill="#FFFFFF" fillRule="evenodd" />
            </Svg>
          </View>
          <View style={s.aboTextes}>
            <Text style={s.aboTitre}>
              {pro ? 'EchoPlan Pro' : 'Passer en Pro'}
            </Text>
            <Text style={s.aboSous} numberOfLines={2}>
              {pro
                ? proVia === 'code'
                  ? 'Débloqué par code · relevés illimités'
                  : 'Abonnement actif · relevés illimités'
                : `Plan gratuit · ${restant} relevé${
                    restant > 1 ? 's' : ''
                  } restant${restant > 1 ? 's' : ''}`}
            </Text>
            {/*
              JUSQU'À QUAND — relevé du patron : « sur le profil on doit voir
              la date d'expiration de l'abonnement ».

              C'est la question qu'on vient poser ici après avoir payé, et
              « actif » n'y répond pas. Le mot dit aussi ce qui va SE PASSER :
              un abonnement en cours se RECONDUIT, un abonnement résilié
              court JUSQU'À sa date puis s'arrête. Confondre les deux, c'est
              soit faire attendre un prélèvement qui ne viendra pas, soit
              laisser quelqu'un perdre ses relevés illimités sans prévenir.

              Rien ne s'écrit sans date : le Pro par code n'en a pas (il est
              donné une fois), et l'App Store peut être muet — une échéance
              inventée serait pire que pas d'échéance.
            */}
            {pro && proVia !== 'code' && !!proEcheance && (
              <Text style={s.aboDate}>
                {proReconduit
                  ? `Renouvellement le ${dateEnLettres(proEcheance)}`
                  : `Actif jusqu’au ${dateEnLettres(proEcheance)}`}
              </Text>
            )}
          </View>
          {!pro && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voir l’offre Pro"
              style={({ pressed }) => [s.boutonAbo, pressed && s.enfonce]}
              onPress={ouvrirPaywall}>
              <Text style={s.boutonAboTexte}>Voir l’offre</Text>
            </Pressable>
          )}
        </View>

        <Text style={s.section}>Apparence</Text>
        {/*
          TROIS RONDS, PAS UNE LISTE — c'est le design du patron, et c'est
          le bon geste : trois choix exclusifs se comparent d'un coup d'œil
          quand ils sont côte à côte, alors qu'une liste les fait lire un
          par un. Le choix du moment porte l'anneau bleu ; sans marque, on
          ne sait pas d'où l'on part.
        */}
        <View style={s.apparences}>
          {APPARENCES.map((a) => {
            const actif = themePref === a.cle;
            return (
              <Pressable
                key={a.cle}
                accessibilityRole="button"
                accessibilityLabel={a.label}
                accessibilityState={{ selected: actif }}
                style={s.apparence}
                onPress={() => setThemePref(a.cle)}>
                <View style={[s.apparenceRond, actif && s.apparenceRondActif]}>
                  {a.cle === 'system' ? (
                    <Svg width={24} height={24} viewBox="0 0 24 24">
                      <Path
                        d={SOLAIRES.telephone}
                        fill={actif ? c.blue : c.inkSoft}
                        fillRule="evenodd"
                      />
                    </Svg>
                  ) : (
                    <ThemeGlyph
                      quoi={a.cle === 'dark' ? 'lune' : 'soleil'}
                      size={24}
                      color={actif ? c.blue : c.inkSoft}
                    />
                  )}
                </View>
                <Text style={[s.apparenceMot, actif && s.apparenceMotActif]}>
                  {a.mot}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={s.section}>Données et compte</Text>
        <Rangee
          s={s}
          c={c}
          icone="rooms"
          label="Mes scans"
          note={saves.length ? String(saves.length) : undefined}
          onPress={() => setScreen('library')}
        />
        <Rangee
          s={s}
          c={c}
          icone="save"
          label="Restaurer l’achat"
          onPress={restaurer}
        />
        <Rangee
          s={s}
          c={c}
          icone="bouclier"
          label="Confidentialité des données"
          onPress={() => setScreen('confidentialite')}
        />
      </ScrollView>

      <MenuCompte visible={menu} fermer={() => setMenu(false)} />
      <SupportSheet visible={support} fermer={() => setSupport(false)} />
    </RetourGlisse>
  );
}

/** Une rangée de réglage : icône, mot, chevron — le motif du design. */
function Rangee({
  s,
  c,
  icone,
  label,
  note,
  onPress,
}: {
  s: ReturnType<typeof themed>;
  c: Palette;
  icone: keyof typeof SOLAIRES;
  label: string;
  note?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.rangee, pressed && s.rangeeEnfoncee]}
      onPress={onPress}>
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path d={SOLAIRES[icone]} fill={c.inkSoft} fillRule="evenodd" />
      </Svg>
      <Text style={s.rangeeMot}>{label}</Text>
      {!!note && <Text style={s.rangeeNote}>{note}</Text>}
      {/* Le chevron pointe à droite : la même flèche que le retour, retournée. */}
      <View style={s.chevronDroit}>
        <BackChevron color={c.inkFaint} size={20} weight={2.2} />
      </View>
    </Pressable>
  );
}

const themed = (c: Palette) =>
  StyleSheet.create({
    fond: { flex: 1, backgroundColor: c.bg },
    contenu: { paddingHorizontal: 22 },
    barre: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      marginBottom: 18,
    },
    // Les deux ronds de la barre sont jumeaux : deux tailles inégales sur
    // la même ligne se lisent comme un accident.
    rondBarre: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadowCard,
      shadowOpacity: 0.07,
    },
    titreBarre: { color: c.ink, fontSize: 17, fontWeight: '700' },
    // Deux ronds jumeaux à droite : le tchat, puis le menu.
    barreDroite: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    /*
      L'ICÔNE EST LE DISQUE — relevé du patron : « refais l'avatar en bleu
      et le contour autour de l'icône, sans marge blanche ».

      La silhouette Solar est un cercle PLEIN dont le buste est découpé :
      peinte en bleu, elle EST l'avatar, et il n'y a plus de disque de
      fond à poser derrière — c'est lui qui faisait la marge claire. Le
      cadre ne garde donc que le centrage.
    */
    avatar: { alignSelf: 'center' },
    // Le contour AU RAS : quatre-vingt-huit pour une icône de
    // quatre-vingt-quatre, soit l'épaisseur du trait de chaque côté. Le
    // même réglage que sur l'accueil, où l'anneau avait déjà dû se
    // rapprocher — un disque clair entre les deux se lit comme un défaut.
    avatarCadre: { width: 88, height: 88, alignSelf: 'center' },
    avatarDedans: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
    nom: {
      color: c.ink,
      fontSize: 21,
      fontWeight: '800',
      textAlign: 'center',
      marginTop: 12,
    },
    nomOr: { alignSelf: 'center', marginTop: 12 },
    email: {
      color: c.inkFaint,
      fontSize: 13.5,
      textAlign: 'center',
      marginTop: 3,
    },
    // Les titres de section : petits, gras, à gauche — ils découpent la
    // page sans jamais se disputer la vedette avec le nom.
    section: {
      color: c.ink,
      fontSize: 16,
      fontWeight: '800',
      marginTop: 26,
      marginBottom: 10,
    },
    carteAbo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      paddingVertical: 14,
      paddingHorizontal: 14,
      ...shadowCard,
      shadowOpacity: 0.06,
    },
    rondEtoile: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    aboTextes: { flex: 1, minWidth: 0 },
    aboTitre: { color: c.ink, fontSize: 15.5, fontWeight: '700' },
    aboSous: { color: c.inkSoft, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
    // La date se lit d'un ton en dessous : c'est une précision, pas le
    // titre — mais elle porte la graisse, parce qu'on vient la chercher.
    aboDate: { color: c.blue, fontSize: 12, fontWeight: '700', marginTop: 3 },
    // Le bouton de la carte est PLEIN et sombre, comme dans le design : sur
    // une carte blanche, c'est le seul contraste qui dit « touche ici ».
    boutonAbo: {
      backgroundColor: c.ink,
      borderRadius: radius.pill,
      paddingHorizontal: 15,
      paddingVertical: 9,
    },
    boutonAboTexte: { color: c.bg, fontSize: 13, fontWeight: '800' },
    apparences: { flexDirection: 'row', gap: 12 },
    apparence: { flex: 1, alignItems: 'center', gap: 7 },
    apparenceRond: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: 'transparent',
      ...shadowCard,
      shadowOpacity: 0.06,
    },
    apparenceRondActif: { borderColor: c.blue, backgroundColor: c.blueSoft },
    apparenceMot: { color: c.inkSoft, fontSize: 12.5, fontWeight: '600' },
    apparenceMotActif: { color: c.blue, fontWeight: '800' },
    rangee: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingVertical: 15,
      paddingHorizontal: 14,
      marginBottom: 10,
      ...shadowCard,
      shadowOpacity: 0.05,
    },
    rangeeEnfoncee: { backgroundColor: c.surfaceSunken },
    rangeeMot: { flex: 1, color: c.ink, fontSize: 14.5, fontWeight: '600' },
    rangeeNote: { color: c.inkFaint, fontSize: 13, fontWeight: '700' },
    chevronDroit: { transform: [{ rotate: '180deg' }] },
    enfonce: { transform: [{ scale: 0.97 }] },
  });

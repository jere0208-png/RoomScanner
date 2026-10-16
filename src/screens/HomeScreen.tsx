/**
 * L'ACCUEIL — une page qui a une identité, et qui montre le travail.
 *
 * Relevé du patron : « fais une refonte de la page d'accueil avec une vraie
 * identité, plus qu'un logo et trois boutons ; un design épuré et unique,
 * ludique et compréhensible, un petit message d'accueil moderne, les projets
 * directement visibles sur la page ».
 *
 * L'ancien accueil était une marque, une feuille quadrillée et trois boutons
 * empilés. Juste pour qui le voyait la première fois ; vide pour qui revenait
 * le dixième jour : ses plans étaient à un écran de là, derrière « Mes
 * scans ». La page se lit maintenant de haut en bas comme une journée :
 *
 *   — EN HAUT À DROITE : la cloche des notifications et le rond du compte ;
 *     puis un mot d'accueil à l'heure qu'il est, au prénom — deux tons, la
 *     question en retrait ;
 *   — PAR OÙ COMMENCER : quatre tuiles en moulinet autour de la marque,
 *     chacune sa couleur, son geste et sa flèche. Scanner, dessiner, voir un
 *     exemple, comprendre — les quatre portes d'une application qu'on
 *     découvre, et le moulinet est ce qu'on reconnaît d'un coup d'œil. La
 *     marque n'apparaît qu'une fois, là, en noir, et elle « écoute » ;
 *   — MES PLANS : les trois derniers, avec leur vignette, ouverts d'un
 *     appui. Le relevé interrompu passe en tête. Pour qui n'a encore rien,
 *     une carte dit où ils apparaîtront.
 *
 * Relevé du patron, sur la première version : « ne mets pas la date et le
 * logo en haut, le logo est déjà au centre, évitons la répétition abusive » ;
 * et « ne fais plus l'option de tracer avec le doigt ».
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RoomScan } from 'react-native-room-scan';
import { dark, ombreBouton as ombreBoutonDouce, radius, themedStyles, useTheme, type Palette } from '../theme';
import { GlisserPourSupprimer } from '../components/GlisserPourSupprimer';
import { BandeauAnnuler, useSuppressionDifferee } from '../components/BandeauAnnuler';
import { Avatar } from '../components/Avatar';
import { LogoEcho } from '../components/LogoMark';
import { horsCorbeille, useScanStore, type SavedScan } from '../store/scanStore';
import { useAccountStore } from '../store/accountStore';
import { nombreNonLus, useNotifications } from '../store/notifications';
import { CLOCHE } from './NotificationsScreen';
import { useRoomScan } from '../native/useRoomScan';
import { SOLAIRES } from '../ui/solaires';
import { haptic } from '../ui/haptic';
import { alerte } from '../ui/alerte';
import { sansPerdreLeReleve } from '../ui/releveInterrompu';
import { pourChercher } from '../ui/mots';
import { PlanThumb, detailsDuScan } from './LibraryScreen';
import { etatDAttente, useMaintenant } from '../ui/miseDeCote';

/**
 * « il y a un quart d'heure » plutôt qu'une date.
 *
 * Ce qu'on veut savoir d'un relevé interrompu, ce n'est pas le jour : c'est
 * s'il s'agit de celui qu'on vient de perdre, ou d'un vieux fond de tiroir.
 */
export function quand(at: number, maintenant = Date.now()): string {
  const min = Math.max(0, Math.round((maintenant - at) / 60000));
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  if (j === 1) return 'hier';
  return `il y a ${j} jours`;
}



/** Le mot d'accueil qui va avec l'heure. */
export function salutation(heure = new Date().getHours()): string {
  if (heure >= 5 && heure < 12) return 'Bonjour';
  if (heure >= 12 && heure < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

/**
 * LA QUESTION SOUS LE SALUT — elle dit où l'on en est.
 *
 * Un relevé interrompu passe avant tout : c'est du travail en danger. Puis
 * celui qui n'a encore rien fait, à qui l'on propose le premier plan ; puis
 * l'habitué, à qui l'on demande ce qu'on mesure aujourd'hui.
 */
export function questionDuJour(x: { brouillon: boolean; plans: number }): string {
  if (x.brouillon) return 'Un relevé vous attend.';
  if (x.plans === 0) return 'Prêt pour votre premier plan ?';
  return 'Que mesure-t-on aujourd’hui ?';
}

/**
 * LES QUATRE TEINTES DU MOULINET — des pastels en clair, des fonds profonds
 * en sombre. Ni le bleu de l'action ni le rouge de l'alerte : une tuile
 * d'accueil invite, elle ne presse pas.
 */
export const TEINTES_TUILES = {
  clair: { scan: '#CDF1F6', dessin: '#F6E6C6', exemple: '#E3E0FA', guide: '#DCE9E3' },
  sombre: { scan: '#123A40', dessin: '#3B311F', exemple: '#2B2847', guide: '#20342C' },
} as const;

/** Le nombre de plans à partir duquel on cherche plutôt qu'on ne parcourt. */
export const RECHERCHE_DES = 6;
/** Les plans montrés sur l'accueil : les derniers touchés. */
export const PLANS_A_LACCUEIL = 3;

/* Hauteurs du moulinet : chaque colonne fait la même hauteur totale, mais
   pas au même endroit — c'est ce décalage qui fait tourner l'ensemble.
   Ce sont des hauteurs MINIMALES (revue de lisibilité : à hauteur fixe, les
   sous-titres se coupaient en « Avec vos mesures, san… ») : une tuile dont
   le texte grandit grandit avec lui, et le moyeu suit la coupe mesurée. */
export const HAUTE = 152;
export const BASSE = 126;
const ECART = 12;
const MOYEU = 56;
/**
 * Au-delà de ce grossissement du texte (réglage « Taille du texte » d'iOS),
 * deux tuiles côte à côte ne laissent plus qu'un mot par ligne : le
 * moulinet se déplie en une colonne.
 */
export const GRAND_TEXTE = 1.35;

/**
 * LE SCAN DEMANDE LE CAPTEUR — dit avec les mots de l'Apple Store, pas
 * « iPhone Pro » : l'iPad Pro en a un aussi, et l'iPhone 15 n'en a pas.
 */
export const PHRASE_LIDAR = 'iPhone ou iPad avec capteur LiDAR';

export function HomeScreen() {
  const supported = useScanStore((s) => s.supported);
  const raccourciEnAttente = useScanStore((s) => s.raccourciEnAttente);
  const setRaccourciEnAttente = useScanStore((s) => s.setRaccourciEnAttente);
  const setSupported = useScanStore((s) => s.setSupported);
  const error = useScanStore((s) => s.error);
  const saves = useScanStore((s) => s.saves);
  const brouillon = useScanStore((s) => s.brouillon);
  const reprendreBrouillon = useScanStore((s) => s.reprendreBrouillon);
  const oublierBrouillon = useScanStore((s) => s.oublierBrouillon);
  const commencerAuClavier = useScanStore((s) => s.commencerAuClavier);
  const ouvrirExemple = useScanStore((s) => s.ouvrirExemple);
  const openSave = useScanStore((s) => s.openSave);
  const setScreen = useScanStore((s) => s.setScreen);
  const { start } = useRoomScan();
  const peutCreerPlan = useAccountStore((s) => s.peutCreerPlan);
  const ouvrirSurprise = useAccountStore((s) => s.ouvrirSurprise);
  const compte = useAccountStore((s) => s.compte);
  const c = useTheme();
  const sombre = c === dark;
  const styles = getStyles(c);
  const insets = useSafeAreaInsets();
  const teintes = sombre ? TEINTES_TUILES.sombre : TEINTES_TUILES.clair;
  const { fontScale } = useWindowDimensions();
  const uneColonne = fontScale > GRAND_TEXTE;
  /*
    LE MOYEU SE POSE SUR LA COUPE MESURÉE — les tuiles ont une hauteur
    minimale, plus une hauteur fixe : il suit donc la hauteur réelle des
    deux tuiles du haut, et non plus deux constantes.
  */
  const [hautGauche, setHautGauche] = useState(HAUTE);
  const [hautDroite, setHautDroite] = useState(BASSE);

  useEffect(() => {
    RoomScan.isSupported().then(setSupported);
  }, [setSupported]);

  /*
    L'ARRIVÉE : une cascade, bloc après bloc, puis les tuiles qui se posent
    l'une après l'autre en grandissant d'un rien. Au pilote natif : rien ne
    passe par le fil JavaScript pendant qu'on regarde.
  */
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(reveal, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reveal]);
  const fadeIn = (i: number, grandit = false) => {
    const range = [i * 0.08, Math.min(i * 0.08 + 0.42, 1)];
    const v = (a: number, b: number) =>
      reveal.interpolate({ inputRange: range, outputRange: [a, b], extrapolate: 'clamp' });
    return {
      opacity: v(0, 1),
      transform: [{ translateY: v(12, 0) }, ...(grandit ? [{ scale: v(0.94, 1) }] : [])],
    };
  };



  /*
    LE RACCOURCI SE CONSOMME ICI — « Dis Siri, nouveau relevé ». Même chemin
    que la tuile, même garde ; et l'on attend que la compatibilité soit
    connue, sans quoi la demande se perdrait.
  */
  useEffect(() => {
    if (!raccourciEnAttente || supported === null) return;
    setRaccourciEnAttente(false);
    if (supported !== true) return;
    if (!peutCreerPlan()) {
      ouvrirSurprise();
      return;
    }
    // Siri passait outre la question : voir `sansPerdreLeReleve`.
    sansPerdreLeReleve(start, 'Un nouveau scan', 'Nouveau scan');
  }, [raccourciEnAttente, supported, setRaccourciEnAttente, peutCreerPlan, ouvrirSurprise, start]);

  const scanner = () => {
    if (!peutCreerPlan()) {
      ouvrirSurprise();
      return;
    }
    /*
      UN RELEVÉ INTERROMPU ATTEND — correctif de l'audit : un nouveau scan
      l'effaçait sans prévenir. On demande.
    */
    sansPerdreLeReleve(start, 'Un nouveau scan', 'Nouveau scan');
  };
  /** Jeter un relevé interrompu se confirme : il ne revient pas. */
  const jeterLeBrouillon = () =>
    alerte(
      'Jeter le relevé interrompu ?',
      'Les murs déjà relevés seront perdus.',
      [
        { label: 'Garder' },
        { label: 'Jeter', danger: true, onPress: oublierBrouillon },
      ],
    );
  const dessiner = () => {
    if (!peutCreerPlan()) {
      ouvrirSurprise();
      return;
    }
    sansPerdreLeReleve(commencerAuClavier, 'Un plan vierge', 'Plan vierge');
  };
  /** Un plan lu est un plan créé : le même palier que les autres. */
  const lirePlanPapier = () => {
    if (!peutCreerPlan()) {
      ouvrirSurprise();
      return;
    }
    sansPerdreLeReleve(() => setScreen('lecture'), 'Un plan lu', 'Lire un plan');
  };
  const voirLExemple = () => sansPerdreLeReleve(ouvrirExemple, 'L’exemple', 'Voir l’exemple');

  /* Les plans : les derniers touchés, ou ceux que la recherche retient. */
  const [cherche, setCherche] = useState('');
  // Les comptes à rebours des plans non enregistrés avancent ici aussi.
  const maintenant = useMaintenant();
  const recents = useMemo(
    () => horsCorbeille(saves).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    [saves],
  );
  /*
    UN PLAN SE JETTE D'UN GLISSÉ — relevé du patron : « on doit pouvoir
    supprimer un plan en slidant comme les notifications, sur la gauche ».
    La ligne part tout de suite ; le plan, lui, attend quelques secondes
    qu'on se ravise (voir `BandeauAnnuler`).
  */
  // À la corbeille, pas effacé : il s'y restaure pendant 30 jours.
  const mettreALaCorbeille = useScanStore((s) => s.mettreALaCorbeille);
  const suppression = useSuppressionDifferee(mettreALaCorbeille);
  const montres = useMemo(() => {
    const q = pourChercher(cherche.trim());
    const vivants = recents.filter((s) => s.id !== suppression.masque);
    if (!q) return vivants.slice(0, PLANS_A_LACCUEIL);
    return vivants.filter((s) => pourChercher(s.name ?? '').includes(q)).slice(0, 8);
  }, [recents, cherche, suppression.masque]);

  const prenom = compte?.prenom?.trim().split(/\s+/)[0];
  const question = questionDuJour({ brouillon: !!brouillon, plans: recents.length });


  const scanIndisponible = supported === false;
  /* Le nombre de la pastille : ce qu'on n'a pas encore lu. */
  const nonLus = useNotifications((n) => nombreNonLus(n));

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.page, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {/*
          EN HAUT À DROITE, DEUX RONDS JUMEAUX — la cloche et le compte. Rien
          à gauche : ni date, ni logo. La marque est au centre du moulinet,
          et une fois suffit.
        */}
        <Animated.View style={[styles.entete, fadeIn(0)]}>
          <View style={styles.flex} />
          {/*
            LA CLOCHE — la boîte des messages de l'éditeur. La pastille rouge
            dit combien on n'en a pas lu ; au-delà de neuf, « 9+ » : un
            nombre qui déborde du rond ne se lit plus.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={nonLus > 0 ? `Notifications, ${nonLus} non lue${nonLus > 1 ? 's' : ''}` : 'Notifications'}
            style={styles.rondEntete}
            hitSlop={8}
            onPress={() => setScreen('notifications')}>
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path d={CLOCHE} fill={c.ink} fillRule="evenodd" />
            </Svg>
            {nonLus > 0 && (
              <View style={styles.pastille} testID="pastille-notifications">
                <Text style={styles.pastilleMot}>{nonLus > 9 ? '9+' : String(nonLus)}</Text>
              </View>
            )}
          </Pressable>
          {/*
            LE COMPTE EST UN ROND, EN HAUT À DROITE — l'initiale ou la
            silhouette, jamais le nom en couleur. C'est la porte de la page
            du compte, et de là, de l'offre.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mon compte"
            style={styles.profilBloc}
            hitSlop={12}
            onPress={() => setScreen('profil')}>
            <Avatar compte={compte} taille={40} />
          </Pressable>
        </Animated.View>

        {/*
          LE MOT D'ACCUEIL — deux tons. Le salut à l'encre, la question en
          retrait : on lit qui l'on est, puis ce qu'on vient faire.
        */}
        <Animated.Text style={[styles.salut, fadeIn(1)]} accessibilityRole="header">
          {`${salutation()}${prenom ? `, ${prenom}` : ''}.`}
          {'\n'}
          <Text style={styles.question}>{question}</Text>
        </Animated.Text>

        {saves.length >= RECHERCHE_DES && (
          <Animated.View style={[styles.recherche, fadeIn(2)]}>
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Circle cx={11} cy={11} r={6.5} stroke={c.inkFaint} strokeWidth={2} fill="none" />
              <Path d="m16 16 4 4" stroke={c.inkFaint} strokeWidth={2} strokeLinecap="round" />
            </Svg>
            <TextInput
              value={cherche}
              onChangeText={setCherche}
              placeholder="Rechercher un plan"
              placeholderTextColor={c.inkFaint}
              style={styles.rechercheChamp}
              accessibilityLabel="Rechercher un plan"
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </Animated.View>
        )}

        {!cherche && (
          <>
            <Animated.Text style={[styles.section, fadeIn(2)]}>Par où commencer ?</Animated.Text>

            {/*
              LE MOULINET — quatre tuiles autour de la marque.

              Deux colonnes de même hauteur totale, coupées à deux hauteurs
              différentes : c'est ce décalage qui fait tourner l'ensemble, et
              qui distingue l'accueil d'une grille de réglages. Le moyeu est
              cerné du fond de la page — il « mord » dans les quatre coins
              intérieurs, comme un rivet.
            */}
            <View style={[styles.moulinet, uneColonne && styles.moulinetColonne]}>
              <View style={[styles.colonne, uneColonne && styles.colonneEntiere]}>
                <Animated.View style={fadeIn(3, true)}>
                  {scanIndisponible ? (
                    /*
                      LA TUILE ÉTEINTE SE LIT — revue de lisibilité : grisée à
                      50 %, elle tombait à 2:1, et seule une phrase plus bas
                      disait pourquoi. Elle garde son opacité, prend un fond
                      neutre et un cadenas qui dit « Indisponible » ; plus de
                      flèche, puisqu'elle n'ouvre rien ; et son appui propose
                      le dessin, la porte qui reste.
                    */
                    <Tuile
                      c={c}
                      fond={c.surfaceSunken}
                      hauteur={HAUTE}
                      icone={SOLAIRES.scanner}
                      titre={'Scanner\nmon logement'}
                      sous={PHRASE_LIDAR}
                      label="Scan indisponible sur cet appareil"
                      eteinte
                      onLayout={setHautGauche}
                      onPress={() =>
                        alerte(
                          'Scan indisponible ici',
                          `Le scan demande un ${PHRASE_LIDAR}. Tout le reste fonctionne : dessinez le plan avec vos mesures, ou ouvrez l’exemple.`,
                          [{ label: 'Plus tard' }, { label: 'Dessiner le plan', onPress: dessiner }],
                        )
                      }
                    />
                  ) : (
                    <Tuile
                      c={c}
                      fond={teintes.scan}
                      hauteur={HAUTE}
                      icone={SOLAIRES.scanner}
                      titre={'Scanner\nmon logement'}
                      sous={supported === null ? 'Vérification…' : 'Pièce après pièce'}
                      label="Commencer le scan"
                      desactivee={supported !== true}
                      onLayout={setHautGauche}
                      onPress={scanner}
                    />
                  )}
                </Animated.View>
                <Animated.View style={fadeIn(5, true)}>
                  <Tuile
                    c={c}
                    fond={teintes.exemple}
                    hauteur={BASSE}
                    icone={SOLAIRES.maison}
                    titre={'Voir un\nexemple'}
                    sous="Un T2 de 46 m² à visiter"
                    label="Voir un exemple"
                    onPress={voirLExemple}
                  />
                </Animated.View>
              </View>
              <View style={[styles.colonne, uneColonne && styles.colonneEntiere]}>
                <Animated.View style={fadeIn(4, true)}>
                  <Tuile
                    c={c}
                    fond={teintes.dessin}
                    hauteur={BASSE}
                    icone={SOLAIRES.crayon}
                    titre={'Dessiner\nun plan'}
                    // Plus court : il se coupait en « Avec vos mesures, san… ».
                    sous="Avec vos mesures"
                    label="Dessiner un plan sans scanner"
                    onLayout={setHautDroite}
                    onPress={dessiner}
                  />
                </Animated.View>
                <Animated.View style={fadeIn(6, true)}>
                  {/*
                    LIRE UN PLAN PAPIER — relevé du patron : « à la place de
                    "Comment ça marche" ». La feuille d'un architecte devient
                    un plan coté ; le film, lui, se revoit depuis le profil.
                  */}
                  <Tuile
                    c={c}
                    fond={teintes.guide}
                    hauteur={HAUTE}
                    icone={SOLAIRES.planPapier}
                    titre={'Lire un\nplan papier'}
                    // Revue « Sophie » : avec un PDF en main, « une photo »
                    // faisait hésiter. Et « … de l'architecte » se coupait.
                    sous="Photo ou PDF"
                    label="Lire un plan papier"
                    onPress={lirePlanPapier}
                  />
                </Animated.View>
              </View>
              {/*
                LE MOYEU ÉCOUTE — le glyphe à l'encre, noir sur blanc : la
                sobriété d'un outil de pro. Ses deux ondes s'allument l'une
                après l'autre, comme un écho, et l'angle des murs s'éclaire
                quand l'onde l'atteint — un mur détecté. Voir `LogoEcho`.
              */}
              {/* En une colonne, il n'y a plus de croisement où le poser. */}
              {!uneColonne && (
                <View
                  pointerEvents="none"
                  style={[styles.moyeu, { top: (hautGauche + hautDroite + ECART) / 2 }]}>
                  <LogoEcho size={34} teinte={c.ink} />
                </View>
              )}
            </View>

            {scanIndisponible && (
              <View style={styles.avisBloc} testID="avis-lidar">
                <Text style={styles.avis}>
                  {`Le scan demande un ${PHRASE_LIDAR}. Pas de souci : dessinez le plan avec vos mesures, tout le reste fonctionne.`}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Dessiner le plan"
                  hitSlop={10}
                  onPress={dessiner}>
                  <Text style={styles.avisLien}>Dessiner le plan</Text>
                </Pressable>
              </View>
            )}
          </>
        )}

        {error && (
          <View style={styles.erreur}>
            <Text style={styles.erreurTexte}>{error}</Text>
          </View>
        )}

        {/*
          MES PLANS — les derniers touchés, sur l'accueil même. L'en-tête
          porte la porte de la bibliothèque, avec son compte.
        */}
        {(saves.length > 0 || brouillon) && (
          <Animated.View style={fadeIn(7)}>
            <View style={styles.sectionLigne}>
              {/* « Mes plans », comme la bibliothèque qu'il ouvre (c'était
                  « Vos plans » ici, « Mes scans » là-bas). */}
              <Text style={styles.sectionTitre}>{cherche ? 'Résultats' : 'Mes plans'}</Text>
              {saves.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mes plans"
                  hitSlop={10}
                  style={styles.toutVoir}
                  onPress={() => setScreen('library')}>
                  <Text style={styles.toutVoirTexte}>Tout voir</Text>
                  <View accessibilityLabel="Nombre de plans" style={styles.compteur}>
                    <Text style={styles.compteurTexte}>{saves.length}</Text>
                  </View>
                </Pressable>
              )}
            </View>

            {/*
              LE RELEVÉ INTERROMPU — proposé, jamais imposé, et en tête :
              c'est du travail qu'on peut encore perdre.
            */}
            {brouillon && !cherche && (
              <View style={[styles.carte, styles.carteSeule]}>
                <View style={[styles.vignette, styles.vignetteBrouillon]}>
                  <Svg width={24} height={24} viewBox="0 0 24 24">
                    <Circle cx={12} cy={12} r={9} stroke={c.amber} strokeWidth={2} fill="none" />
                    <Path d="M12 7v5l3 2" stroke={c.amber} strokeWidth={2} strokeLinecap="round" fill="none" />
                  </Svg>
                </View>
                <View style={styles.carteTextes}>
                  <Text style={styles.carteNom} numberOfLines={1}>Relevé interrompu</Text>
                  <Text style={styles.carteMeta} numberOfLines={2}>
                    {`${brouillon.walls.length} mur${brouillon.walls.length > 1 ? 's' : ''} relevés${
                      brouillon.name ? ` · ${brouillon.name}` : ''
                    }, ${quand(brouillon.at)}.`}
                  </Text>
                </View>
                <View style={styles.brouillonGestes}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Reprendre le relevé"
                    style={styles.reprendre}
                    onPress={reprendreBrouillon}>
                    <Text style={styles.reprendreTexte}>Reprendre</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Jeter le relevé interrompu"
                    hitSlop={8}
                    onPress={jeterLeBrouillon}>
                    <Text style={styles.jeter}>Jeter</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {montres.map((s) => (
              <GlisserPourSupprimer
                key={s.id}
                libelle={s.name}
                rayon={20}
                style={styles.carteGlissante}
                onSupprimer={() => suppression.jeter(s.id, s.name)}>
                {(refermer) => (
                  <CartePlan
                    scan={s}
                    maintenant={maintenant}
                    c={c}
                    styles={styles}
                    onPress={() => {
                      if (refermer()) return;
                      openSave(s.id);
                    }}
                  />
                )}
              </GlisserPourSupprimer>
            ))}
            {cherche && montres.length === 0 && (
              <Text style={styles.rien}>Aucun plan ne porte ce nom.</Text>
            )}
          </Animated.View>
        )}

        {/*
          MES PLANS, AVANT LE PREMIER — la place ne reste pas vide : une
          carte dit ce qui viendra s'y ranger, et comment l'y faire venir.
        */}
        {saves.length === 0 && !brouillon && (
          <Animated.View style={fadeIn(7)}>
            <Text style={[styles.sectionTitre, styles.sectionSeule]}>Mes plans</Text>
            <View style={styles.videCarte} testID="plans-vide">
              <View style={styles.videVignette}>
                <Svg width={44} height={34} viewBox="0 0 44 34">
                  <Path
                    d="M3 3H41V31H3Z M26 3V31 M3 19H26 M14 19V31 M26 17H41"
                    stroke={c.inkFaint}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeDasharray="4 3"
                    fill="none"
                  />
                </Svg>
              </View>
              <View style={styles.carteTextes}>
                <Text style={styles.carteNom}>Ils apparaîtront ici</Text>
                <Text style={styles.carteMeta}>
                  Vos relevés et vos dessins se rangeront ici, prêts à reprendre.
                </Text>
              </View>
            </View>
          </Animated.View>
        )}

        <Animated.Text style={[styles.promesse, fadeIn(8)]}>
          Votre logement en 3D et en plan coté, en quelques minutes.
        </Animated.Text>
      </ScrollView>
      {suppression.enAttente && (
        <BandeauAnnuler
          // La corbeille le garde 30 jours, copie en ligne comprise.
          texte={`« ${suppression.enAttente.nom} » mis à la corbeille`}
          bas={insets.bottom + 18}
          onAnnuler={suppression.annuler}
        />
      )}
    </View>
  );
}

/**
 * UNE TUILE DU MOULINET — son pictogramme dans une pastille, sa flèche en
 * haut à droite, son titre en bas. Elle s'enfonce d'un rien sous le doigt,
 * au ressort, et revient quand on la lâche.
 */
function Tuile({
  c,
  fond,
  hauteur,
  icone,
  titre,
  sous,
  label,
  onPress,
  desactivee,
  eteinte,
  onLayout,
}: {
  c: Palette;
  fond: string;
  /** La hauteur MINIMALE : le texte peut la faire grandir. */
  hauteur: number;
  icone: string;
  titre: string;
  sous: string;
  label: string;
  onPress: () => void;
  desactivee?: boolean;
  /** Indisponible sur cet appareil : neutre, lisible, un cadenas, pas de flèche. */
  eteinte?: boolean;
  /** La hauteur réelle, pour poser le moyeu sur la coupe. */
  onLayout?: (hauteur: number) => void;
}) {
  const styles = getStyles(c);
  const appui = useRef(new Animated.Value(1)).current;
  const vers = (v: number) =>
    Animated.spring(appui, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  const pastille = c === dark ? 'rgba(255,255,255,0.14)' : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={sous}
      accessibilityState={{ disabled: !!desactivee }}
      disabled={desactivee}
      onPressIn={() => vers(0.96)}
      onPressOut={() => vers(1)}
      onPress={() => {
        haptic('leger');
        onPress();
      }}>
      <Animated.View
        onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout.height) : undefined}
        style={[
          styles.tuile,
          { backgroundColor: fond, minHeight: hauteur, transform: [{ scale: appui }] },
          eteinte && styles.tuileEteinte,
        ]}>
        {/*
          LE ROND DE L'ICÔNE SE RESSERRE, PAS L'ICÔNE ; LA FLÈCHE SE FAIT
          DISCRÈTE — relevé du patron : « réduis les flèches et leur bloc
          arrière arrondi des quatre bulles ; réduis très légèrement le bloc
          blanc rond des icônes, sans réduire les icônes ». L'icône dit ce que
          fait la bulle ; la flèche dit seulement qu'elle s'ouvre.
        */}
        <View style={styles.tuileHaut}>
          <View style={[styles.rondIcone, { backgroundColor: pastille }]}>
            <Svg width={19} height={19} viewBox="0 0 24 24">
              <Path d={icone} fill={c.ink} fillRule="evenodd" />
            </Svg>
          </View>
          {eteinte ? (
            <View style={styles.cadenas} testID="cadenas-scan">
              <Svg width={11} height={11} viewBox="0 0 24 24">
                <Path d={CADENAS} fill={c.inkSoft} fillRule="evenodd" />
              </Svg>
              <Text style={styles.cadenasMot}>Indisponible</Text>
            </View>
          ) : desactivee ? null : (
            <View style={[styles.rondFleche, { backgroundColor: pastille }]} testID="fleche-tuile">
              <Svg width={12} height={12} viewBox="0 0 24 24">
                <Path d="M7 17 17 7M9 7h8v8" stroke={c.ink} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </Svg>
            </View>
          )}
        </View>
        <View style={styles.tuileBas}>
          <Text style={[styles.tuileTitre, eteinte && styles.tuileTitreEteint]}>{titre}</Text>
          {/* Deux lignes : un sous-titre coupé ne dit plus rien. */}
          <Text style={styles.tuileSous} numberOfLines={2}>{sous}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** Un petit cadenas plein : l'anse et le corps. */
const CADENAS =
  'M12 2.5a5 5 0 0 0-5 5V10H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7.5a5 5 0 0 0-5-5Zm3 7.5V7.5a3 3 0 1 0-6 0V10h6Z';

/** Un plan de l'accueil : sa vignette, son nom, ce qu'il contient, quand. */
function CartePlan({
  scan,
  maintenant,
  c,
  styles,
  onPress,
}: {
  scan: SavedScan;
  maintenant: number;
  c: Palette;
  styles: ReturnType<typeof getStyles>;
  onPress: () => void;
}) {
  const attente = etatDAttente(scan, maintenant);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir ${scan.name}`}
      style={({ pressed }) => [styles.carte, pressed && styles.cartePressee]}
      onPress={onPress}>
      <View style={styles.vignette}>
        <PlanThumb scan={scan} c={c} />
      </View>
      <View style={styles.carteTextes}>
        <Text style={styles.carteNom} numberOfLines={1}>{scan.name}</Text>
        {/* Ce qui attend d'être enregistré le dit, comme dans « Mes plans ». */}
        {attente ? (
          <>
            <Text
              style={[styles.carteMeta, styles.carteMetaAttente]}
              numberOfLines={1}
              accessibilityLabel={attente.texte}>
              {attente.titre}
            </Text>
            {/* Le compte à rebours, petit et gris, sous l'état : il ne se coupe plus. */}
            <Text style={styles.carteDelai} numberOfLines={1}>
              {attente.delai}
            </Text>
          </>
        ) : (
          <Text style={styles.carteMeta} numberOfLines={1}>
            {`${detailsDuScan(scan)} · ${quand(scan.updatedAt ?? scan.createdAt ?? Date.now())}`}
          </Text>
        )}
      </View>
      <Svg width={14} height={14} viewBox="0 0 24 24">
        <Path d="m9 6 6 6-6 6" stroke={c.inkFaint} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </Pressable>
  );
}

const getStyles = themedStyles((c: Palette) => {
  const ombre = c === dark
    ? {}
    : {
        shadowColor: '#101828',
        shadowOpacity: 0.06,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
      };
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    page: { paddingHorizontal: 20 },
    flex: { flex: 1 },
    entete: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
    /* Les deux ronds de l'en-tête sont jumeaux, comme ceux du profil. */
    rondEntete: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...ombreBoutonDouce,
    },
    /* Le rouge d'iOS, cerné du fond : la pastille se détache du rond. */
    pastille: {
      position: 'absolute',
      top: -3,
      right: -3,
      minWidth: 19,
      height: 19,
      borderRadius: 9.5,
      paddingHorizontal: 5,
      backgroundColor: c.danger,
      borderWidth: 2,
      borderColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pastilleMot: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '700' },
    profilBloc: { padding: 2 },
    salut: {
      color: c.ink,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '700',
      letterSpacing: -0.8,
      marginTop: 22,
    },
    question: { color: c.inkFaint },
    recherche: {
      marginTop: 18,
      height: 46,
      borderRadius: 23,
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.lineStrong,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 16,
    },
    rechercheChamp: { flex: 1, color: c.ink, fontSize: 15, paddingVertical: 0 },
    section: {
      color: c.ink,
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: -0.4,
      marginTop: 24,
      marginBottom: 12,
    },
    moulinet: { flexDirection: 'row', gap: ECART },
    moulinetColonne: { flexDirection: 'column' },
    colonne: { flex: 1, gap: ECART },
    colonneEntiere: { flex: 0 },
    tuile: {
      borderRadius: 26,
      padding: 14,
      justifyContent: 'space-between',
    },
    /* Pleine opacité : le fond neutre et le cadenas disent « éteinte ». */
    tuileEteinte: { borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
    tuileTitreEteint: { color: c.inkSoft },
    tuileBas: { marginTop: 10 },
    cadenas: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      height: 24,
      borderRadius: 12,
      backgroundColor: c.surface,
    },
    cadenasMot: { color: c.inkSoft, fontSize: 12, fontWeight: '600' },
    tuileHaut: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    rondIcone: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rondFleche: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tuileTitre: { color: c.ink, fontSize: 17, lineHeight: 20, fontWeight: '700', letterSpacing: -0.3 },
    tuileSous: { color: c.inkSoft, fontSize: 12.5, fontWeight: '500', marginTop: 4 },
    /* Le moyeu se pose au croisement des deux coupes — la moyenne des deux
       hauteurs où chaque colonne se coupe. */
    moyeu: {
      position: 'absolute',
      left: '50%',
      top: (HAUTE + BASSE + ECART) / 2,
      width: MOYEU,
      height: MOYEU,
      marginLeft: -MOYEU / 2,
      marginTop: -MOYEU / 2,
      borderRadius: MOYEU / 2,
      backgroundColor: c.surface,
      borderWidth: 6,
      borderColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avisBloc: { marginTop: 12, gap: 6 },
    avis: { color: c.inkSoft, fontSize: 13, lineHeight: 18 },
    avisLien: { color: c.blue, fontSize: 14, fontWeight: '600' },
    erreur: {
      backgroundColor: c === dark ? '#3A1517' : '#FDECEC',
      borderRadius: radius.md,
      padding: 14,
      marginTop: 14,
    },
    erreurTexte: { color: c === dark ? '#F3A6A8' : '#A33A3E', fontSize: 13, lineHeight: 18 },
    sectionLigne: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 26,
      marginBottom: 10,
    },
    sectionTitre: { color: c.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
    toutVoir: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    toutVoirTexte: { color: c.blue, fontSize: 14.5, fontWeight: '600' },
    compteur: {
      backgroundColor: c.blueSoft,
      borderRadius: radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 1,
    },
    compteurTexte: { color: c.blue, fontSize: 12.5, fontWeight: '700' },
    carte: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.surface,
      borderRadius: 20,
      paddingVertical: 10,
      paddingLeft: 10,
      paddingRight: 14,
      ...ombre,
    },
    cartePressee: { opacity: 0.85 },
    vignette: {
      width: 78,
      height: 62,
      borderRadius: 14,
      backgroundColor: c.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    vignetteBrouillon: { backgroundColor: c === dark ? '#3A2F1A' : '#FBF1E0' },
    carteTextes: { flex: 1, minWidth: 0 },
    carteNom: { color: c.ink, fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
    carteMeta: { color: c.inkSoft, fontSize: 12.5, marginTop: 3, lineHeight: 17 },
    // Ce qui attend d'être enregistré, en ambre : voir `ui/miseDeCote`.
    carteMetaAttente: { color: c.amber, fontWeight: '600' },
    carteDelai: { color: c.inkFaint, fontSize: 11, marginTop: 1, lineHeight: 14 },
    /* La carte glissante porte l'écart entre deux cartes : la corbeille s'y arrête. */
    carteGlissante: { marginBottom: 10 },
    /* Une carte hors du cadre de balayage porte elle-même son écart. */
    carteSeule: { marginBottom: 10 },
    brouillonGestes: { alignItems: 'center', gap: 6 },
    reprendre: {
      backgroundColor: c.blue,
      borderRadius: radius.pill,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    reprendreTexte: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
    jeter: { color: c.inkFaint, fontSize: 12.5, fontWeight: '600' },
    rien: { color: c.inkFaint, fontSize: 14, marginTop: 6 },
    sectionSeule: { marginTop: 26, marginBottom: 10 },
    videCarte: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 20,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: c.lineStrong,
      paddingVertical: 12,
      paddingLeft: 10,
      paddingRight: 14,
    },
    videVignette: {
      width: 78,
      height: 62,
      borderRadius: 14,
      backgroundColor: c.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    promesse: {
      color: c.inkFaint,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 20,
      lineHeight: 17,
    },
  });
});

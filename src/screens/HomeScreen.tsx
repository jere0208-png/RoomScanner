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
 *   — QUI ET QUAND : la date, le compte, et un mot d'accueil à l'heure qu'il
 *     est, au prénom — deux tons, la question en retrait ;
 *   — PAR OÙ COMMENCER : quatre tuiles en moulinet autour de la marque,
 *     chacune sa couleur, son geste et sa flèche. Scanner, dessiner, voir un
 *     exemple, comprendre — les quatre portes d'une application qu'on
 *     découvre, et le moulinet est ce qu'on reconnaît d'un coup d'œil ;
 *   — VOS PLANS : les trois derniers, avec leur vignette, ouverts d'un
 *     appui. Le relevé interrompu passe en tête. Pour qui n'a encore rien,
 *     la place n'est pas vide : c'est la feuille où l'on trace sa première
 *     pièce du doigt.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RoomScan } from 'react-native-room-scan';
import { dark, radius, themedStyles, useTheme, type Palette } from '../theme';
import { Avatar } from '../components/Avatar';
import { LogoMark } from '../components/LogoMark';
import { Quadrillage } from '../components/Quadrillage';
import { TraceUnePiece } from '../components/TraceUnePiece';
import { useScanStore, type SavedScan } from '../store/scanStore';
import { useAccountStore } from '../store/accountStore';
import { usePremieresFois } from '../store/premieresFois';
import { useRoomScan } from '../native/useRoomScan';
import { SOLAIRES } from '../ui/solaires';
import { haptic } from '../ui/haptic';
import { alerte } from '../ui/alerte';
import { pourChercher } from '../ui/mots';
import { PlanThumb, detailsDuScan } from './LibraryScreen';

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

/**
 * LA TAILLE DE L'INCRUSTATION, et son retrait — les mêmes que l'écran de
 * lancement et que l'attente qui le suit (voir le banc `lancement`).
 *
 * Le glyphe ne trône plus au centre : il déborde dans l'angle, derrière le
 * mot d'accueil, comme un tampon sur le papier. Sept centièmes d'opacité :
 * on le sent, on ne le lit pas.
 */
const FILIGRANE_LOGO = 240;
const FILIGRANE_OPACITE = 0.07;

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/**
 * « Vendredi 9 octobre ». Écrite à la main : `toLocaleDateString` et ses
 * options ne sont pas garanties par tous les moteurs JavaScript, et une date
 * en anglais sur un accueil en français se voit avant tout le reste.
 */
export function dateDuJour(d = new Date()): string {
  const j = JOURS[d.getDay()];
  return `${j.charAt(0).toUpperCase()}${j.slice(1)} ${d.getDate()} ${MOIS[d.getMonth()]}`;
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
   pas au même endroit — c'est ce décalage qui fait tourner l'ensemble. */
const HAUTE = 152;
const BASSE = 126;
const ECART = 12;
const MOYEU = 56;

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
  const revoir = usePremieresFois((s) => s.revoir);
  const c = useTheme();
  const sombre = c === dark;
  const styles = getStyles(c);
  const insets = useSafeAreaInsets();
  const teintes = sombre ? TEINTES_TUILES.sombre : TEINTES_TUILES.clair;

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
    LE MOYEU RESPIRE — une seule chose bouge sur la page quand plus rien
    n'arrive : la marque, au centre du moulinet, qui gonfle d'un souffle
    toutes les trois secondes. Assez pour qu'on la remarque, pas assez
    pour qu'on la regarde.
  */
  const souffle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(souffle, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(souffle, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [souffle]);

  /**
   * LA PIÈCE TRACÉE OUVRE UN PLAN, avec elle dedans — voir `TraceUnePiece`.
   * La règle du palier se consulte ici comme aux autres portes (elle laisse
   * tout passer depuis le modèle « exporter et partager », mais une porte
   * qui ne la consulte pas serait celle qu'on oublie le jour où elle change).
   */
  const tracerLaPiece = useCallback(
    (largeur: number, profondeur: number) => {
      if (!peutCreerPlan()) {
        ouvrirSurprise();
        return;
      }
      commencerAuClavier();
      useScanStore.getState().addRoomRect({ x: 0, z: 0 }, { x: largeur, z: profondeur });
    },
    [peutCreerPlan, ouvrirSurprise, commencerAuClavier],
  );

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
    start();
  }, [raccourciEnAttente, supported, setRaccourciEnAttente, peutCreerPlan, ouvrirSurprise, start]);

  const scanner = () => {
    if (!peutCreerPlan()) {
      ouvrirSurprise();
      return;
    }
    start();
  };
  const dessiner = () => {
    if (!peutCreerPlan()) {
      ouvrirSurprise();
      return;
    }
    commencerAuClavier();
  };

  /* Les plans : les derniers touchés, ou ceux que la recherche retient. */
  const [cherche, setCherche] = useState('');
  const recents = useMemo(
    () => [...saves].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    [saves],
  );
  const montres = useMemo(() => {
    const q = pourChercher(cherche.trim());
    if (!q) return recents.slice(0, PLANS_A_LACCUEIL);
    return recents.filter((s) => pourChercher(s.name ?? '').includes(q)).slice(0, 8);
  }, [recents, cherche]);

  const prenom = compte?.prenom?.trim().split(/\s+/)[0];
  const question = questionDuJour({ brouillon: !!brouillon, plans: saves.length });

  /* La feuille du tracé se mesure : le quadrillage couvre exactement sa carte. */
  const [feuille, setFeuille] = useState({ w: 0, h: 0 });
  const mesurerFeuille = (e: LayoutChangeEvent) =>
    setFeuille({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const scanIndisponible = supported === false;
  /* Le défilement se coupe le temps qu'un doigt trace sur la feuille. */
  const [trace, setTrace] = useState(false);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.page, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!trace}
        keyboardShouldPersistTaps="handled">
        {/*
          LE GLYPHE DANS L'ANGLE — un tampon sur le papier, derrière le mot
          d'accueil. Il ne reçoit jamais le doigt.
        */}
        {/* Son angle de murs file dans la barre d'état, ses ondes passent
            derrière le salut — jamais derrière le rond du compte. */}
        <View style={[styles.filigrane, { top: insets.top - 84 }]} pointerEvents="none">
          <LogoMark size={FILIGRANE_LOGO} opacite={FILIGRANE_OPACITE} />
        </View>

        {/* QUI ET QUAND. */}
        <Animated.View style={[styles.entete, fadeIn(0)]}>
          <View style={styles.marque} accessibilityLabel="EchoPlan">
            <LogoMark size={30} teinte="#FFFFFF" />
          </View>
          <Text style={styles.date}>{dateDuJour()}</Text>
          <View style={styles.flex} />
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
            <View style={styles.moulinet}>
              <View style={styles.colonne}>
                <Animated.View style={fadeIn(3, true)}>
                  {scanIndisponible ? (
                    <Tuile
                      c={c}
                      fond={teintes.scan}
                      hauteur={HAUTE}
                      icone={SOLAIRES.model}
                      titre={'Scanner\nune pièce'}
                      sous="Demande un iPhone Pro"
                      label="Scan indisponible sur cet appareil"
                      eteinte
                      onPress={() =>
                        alerte(
                          'Scan indisponible',
                          'Le scan demande un iPhone Pro (capteur LiDAR). Tout le reste fonctionne : dessinez votre plan au doigt, ou ouvrez l’exemple.',
                        )
                      }
                    />
                  ) : (
                    <Tuile
                      c={c}
                      fond={teintes.scan}
                      hauteur={HAUTE}
                      icone={SOLAIRES.model}
                      titre={'Scanner\nune pièce'}
                      sous={supported === null ? 'Vérification…' : 'LiDAR · 2 minutes'}
                      label="Commencer le scan"
                      desactivee={supported !== true}
                      onPress={scanner}
                    />
                  )}
                </Animated.View>
                <Animated.View style={fadeIn(5, true)}>
                  <Tuile
                    c={c}
                    fond={teintes.exemple}
                    hauteur={BASSE}
                    icone={SOLAIRES.marcher}
                    titre={'Voir un\nexemple'}
                    sous="Un T2 de 48 m² à visiter"
                    label="Voir un exemple"
                    onPress={ouvrirExemple}
                  />
                </Animated.View>
              </View>
              <View style={styles.colonne}>
                <Animated.View style={fadeIn(4, true)}>
                  <Tuile
                    c={c}
                    fond={teintes.dessin}
                    hauteur={BASSE}
                    icone={SOLAIRES.crayon}
                    titre={'Dessiner\nun plan'}
                    sous="Au doigt, sans capteur"
                    label="Dessiner un plan sans scanner"
                    onPress={dessiner}
                  />
                </Animated.View>
                <Animated.View style={fadeIn(6, true)}>
                  <Tuile
                    c={c}
                    fond={teintes.guide}
                    hauteur={HAUTE}
                    icone={SOLAIRES.etoile}
                    titre={'Comment\nça marche'}
                    sous="En quatre images"
                    label="Comment ça marche"
                    onPress={() => revoir('accueil')}
                  />
                </Animated.View>
              </View>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.moyeu,
                  {
                    transform: [
                      { scale: souffle.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
                    ],
                  },
                ]}>
                <LogoMark size={34} teinte={c.blue} />
              </Animated.View>
            </View>

            {scanIndisponible && (
              <Text style={styles.avis}>
                Cet appareil n’est pas compatible avec le scan (il faut un iPhone Pro,
                capteur LiDAR). Dessinez votre plan au doigt : tout le reste fonctionne.
              </Text>
            )}
          </>
        )}

        {error && (
          <View style={styles.erreur}>
            <Text style={styles.erreurTexte}>{error}</Text>
          </View>
        )}

        {/*
          VOS PLANS — les derniers touchés, sur l'accueil même. L'en-tête
          porte la porte de la bibliothèque, avec son compte.
        */}
        {(saves.length > 0 || brouillon) && (
          <Animated.View style={fadeIn(7)}>
            <View style={styles.sectionLigne}>
              <Text style={styles.sectionTitre}>{cherche ? 'Résultats' : 'Vos plans'}</Text>
              {saves.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mes scans"
                  hitSlop={10}
                  style={styles.toutVoir}
                  onPress={() => setScreen('library')}>
                  <Text style={styles.toutVoirTexte}>Tout voir</Text>
                  <View accessibilityLabel="Nombre de scans" style={styles.compteur}>
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
              <View style={styles.carte}>
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
                    onPress={oublierBrouillon}>
                    <Text style={styles.jeter}>Jeter</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {montres.map((s) => (
              <CartePlan key={s.id} scan={s} c={c} styles={styles} onPress={() => openSave(s.id)} />
            ))}
            {cherche && montres.length === 0 && (
              <Text style={styles.rien}>Aucun plan ne porte ce nom.</Text>
            )}
          </Animated.View>
        )}

        {/*
          LA PREMIÈRE PIÈCE, AU DOIGT — pour qui n'a encore aucun plan.

          La place des projets n'est pas laissée vide : c'est la feuille de
          l'architecte, où l'on trace un rectangle du doigt — un carreau vaut
          vingt-cinq centimètres — et l'on arrive dans l'éditeur avec sa
          première pièce déjà posée.
        */}
        {saves.length === 0 && (
          <Animated.View style={[styles.feuilleCarte, fadeIn(7)]}>
            <View style={styles.feuille} onLayout={mesurerFeuille}>
              {feuille.w > 0 && (
                <Quadrillage width={feuille.w} height={feuille.h} palette={c} force={1} cle="accueil" />
              )}
              {feuille.h > 120 && (
                <TraceUnePiece
                  width={feuille.w}
                  height={feuille.h}
                  palette={c}
                  onTracee={tracerLaPiece}
                  onGeste={setTrace}
                />
              )}
            </View>
          </Animated.View>
        )}

        <Animated.Text style={[styles.promesse, fadeIn(8)]}>
          Votre logement en 3D et en plan coté, en quelques minutes.
        </Animated.Text>
      </ScrollView>
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
}: {
  c: Palette;
  fond: string;
  hauteur: number;
  icone: string;
  titre: string;
  sous: string;
  label: string;
  onPress: () => void;
  desactivee?: boolean;
  eteinte?: boolean;
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
        style={[
          styles.tuile,
          { backgroundColor: fond, height: hauteur, transform: [{ scale: appui }] },
          (desactivee || eteinte) && styles.tuileEteinte,
        ]}>
        <View style={styles.tuileHaut}>
          <View style={[styles.rond, { backgroundColor: pastille }]}>
            <Svg width={19} height={19} viewBox="0 0 24 24">
              <Path d={icone} fill={c.ink} fillRule="evenodd" />
            </Svg>
          </View>
          <View style={[styles.rond, { backgroundColor: pastille }]}>
            <Svg width={16} height={16} viewBox="0 0 24 24">
              <Path d="M7 17 17 7M9 7h8v8" stroke={c.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </Svg>
          </View>
        </View>
        <View>
          <Text style={styles.tuileTitre}>{titre}</Text>
          <Text style={styles.tuileSous} numberOfLines={1}>{sous}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** Un plan de l'accueil : sa vignette, son nom, ce qu'il contient, quand. */
function CartePlan({
  scan,
  c,
  styles,
  onPress,
}: {
  scan: SavedScan;
  c: Palette;
  styles: ReturnType<typeof getStyles>;
  onPress: () => void;
}) {
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
        <Text style={styles.carteMeta} numberOfLines={1}>
          {`${detailsDuScan(scan)} · ${quand(scan.updatedAt ?? scan.createdAt ?? Date.now())}`}
        </Text>
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
    filigrane: { position: 'absolute', right: -70 },
    entete: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
    marque: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    date: { color: c.inkSoft, fontSize: 14, fontWeight: '600' },
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
    colonne: { flex: 1, gap: ECART },
    tuile: {
      borderRadius: 26,
      padding: 14,
      justifyContent: 'space-between',
    },
    tuileEteinte: { opacity: 0.5 },
    tuileHaut: { flexDirection: 'row', justifyContent: 'space-between' },
    rond: {
      width: 36,
      height: 36,
      borderRadius: 18,
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
    avis: { color: c.inkSoft, fontSize: 13, lineHeight: 18, marginTop: 12 },
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
      marginBottom: 10,
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
    feuilleCarte: {
      marginTop: 22,
      backgroundColor: c.surface,
      borderRadius: 24,
      padding: 8,
      ...ombre,
    },
    feuille: { height: 280, borderRadius: 18, overflow: 'hidden' },
    promesse: {
      color: c.inkFaint,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 20,
      lineHeight: 17,
    },
  });
});

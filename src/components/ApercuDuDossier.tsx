/**
 * L'APERÇU DU DOSSIER — les vraies feuilles du PDF, avant de l'envoyer.
 *
 * Relevé du patron : « lors de l'export PDF, si l'utilisateur n'a pas
 * d'abonnement, donne-lui la possibilité de voir son PDF flouté, mais assez
 * pour voir que c'est son plan, avec de gros filigranes EchoPlan. C'est une
 * technique de confiance, et son PDF doit donner l'envie d'acheter pour
 * déflouter et télécharger. »
 *
 * — CE SONT LES FEUILLES DU DOCUMENT, pas une maquette : le PDF bâti pendant
 *   qu'on compose, rendu page par page par le natif (`apercuPdf`). Ce qu'on
 *   voit ici est ce qui partira.
 * — SANS ABONNEMENT, ELLES SONT FLOUTÉES ET FILIGRANÉES — gravé dans l'image :
 *   on reconnaît son logement, on ne lit pas une cote. Un bouton les
 *   défloute : c'est l'offre, au moment où elle a un sens.
 * — ABONNÉ, ELLES SONT NETTES, et le jour où l'abonnement arrive, elles se
 *   défloutent sous les yeux.
 * — EN ATTENDANT LE NATIF, OU SANS LUI (banc d'essai, Android), chaque
 *   feuille se montre en MINIATURE DESSINÉE — son plan, ses tableaux, son
 *   mur —, atténuée et filigranée sans abonnement. Revue « clair-22 » : ces
 *   cartes portaient une icône grise sur fond gris sous « Aperçu flouté :
 *   votre plan est là », et « ça fait cassé ». On ne montre jamais une case
 *   vide en promettant un plan.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { FeuilleDuDossier } from '../export/pdf';
import { light, radius, shadowCard, useTheme, type Palette } from '../theme';
import { haptic } from '../ui/haptic';
import { cadrerLePlan, type MurDuFond } from './ExportFond';

/**
 * Les feuilles du dossier sont des A4 DEBOUT — relevé du testeur
 * « rénovation » : l'aperçu montrait des feuilles couchées quand le PDF
 * sort en portrait (595 × 842, voir `PAGE_W`/`PAGE_H` dans pdf.ts). C'est
 * le rapport largeur / hauteur.
 */
export const FORMAT_FEUILLE = 595 / 842;

const CADENAS =
  'M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1Zm2 0h6V7a3 3 0 0 0-6 0v3Z';

/** Le compte des feuilles, dit comme on le dirait : « 1 plan, 4 murs… ». */
export function resumeDuDossier(sommaire: FeuilleDuDossier[]): string {
  const n = (g: FeuilleDuDossier['genre']) => sommaire.filter((f) => f.genre === g).length;
  const bouts: string[] = [];
  const dire = (k: number, un: string, plusieurs: string) => {
    if (k > 0) bouts.push(`${k} ${k > 1 ? plusieurs : un}`);
  };
  dire(n('garde'), 'page de garde', 'pages de garde');
  dire(n('plan'), 'plan', 'plans');
  // L'état existant et le projet : un avant, un après.
  dire(n('phases'), 'plan avant/après', 'plans avant/après');
  // Un métré sur deux feuilles reste UN métré.
  dire(Math.min(1, n('metre')), 'métré', 'métrés');
  dire(Math.min(1, n('menuiseries')), 'carnet des menuiseries', 'carnets des menuiseries');
  dire(n('achats'), 'liste d’achats', 'listes d’achats');
  dire(n('perspective'), 'vue 3D', 'vues 3D');
  dire(n('elevation'), 'mur de face', 'murs de face');
  dire(n('gaines'), 'plan des gaines', 'plans des gaines');
  dire(n('unifilaire') + n('multifilaire'), 'schéma', 'schémas');
  dire(n('existant'), 'tableau existant', 'tableaux existants');
  return bouts.join(' · ');
}

/**
 * CHAQUE IMAGE SOUS SA FEUILLE — les feuilles rendues d'un dossier, rangées
 * dans le sommaire d'un autre.
 *
 * Pendant que le dossier se rebâtit, l'ancien aperçu reste à l'écran (revue
 * « électricien » : il se figeait, il se met maintenant à jour sans gêner).
 * Mais cocher « Page de garde » décale toutes les feuilles d'un cran : rangée
 * par son rang, chaque image se serait montrée sous la feuille voisine. Elle
 * suit donc sa feuille — même genre, même titre, et la k-ième des feuilles
 * de même titre sous la k-ième. Une feuille nouvelle n'a pas encore
 * d'image : sa miniature dessinée la remplace (`''`).
 */
export function imagesAlignees(
  sommaire: FeuilleDuDossier[],
  rendues: FeuilleDuDossier[],
  pages: string[],
): string[] {
  const parFeuille = new Map<string, string[]>();
  rendues.forEach((f, i) => {
    if (!pages[i]) return;
    const k = `${f.genre}|${f.titre}`;
    const lot = parFeuille.get(k) ?? [];
    lot.push(pages[i]);
    parFeuille.set(k, lot);
  });
  const deja = new Map<string, number>();
  return sommaire.map((f) => {
    const k = `${f.genre}|${f.titre}`;
    const rang = deja.get(k) ?? 0;
    deja.set(k, rang + 1);
    return parFeuille.get(k)?.[rang] ?? '';
  });
}

export function ApercuDuDossier({
  sommaire,
  images,
  enCours,
  net,
  murs = [],
  onDebloquer,
}: {
  sommaire: FeuilleDuDossier[];
  /** Les feuilles rendues, dans l'ordre ; `null` tant qu'elles ne le sont pas. */
  images: string[] | null;
  /** Le dossier se rebâtit : les cartes respirent en attendant. */
  enCours: boolean;
  /** Abonné : les feuilles sont nettes, sans filigrane. */
  net: boolean;
  /** Les murs du niveau exporté : la miniature dessine LEUR plan. */
  murs?: MurDuFond[];
  /** Sans abonnement : ouvre l'offre, pour obtenir le PDF net. */
  onDebloquer: () => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const [ouverte, setOuverte] = useState<number | null>(null);
  const total = sommaire.length;
  /** Des feuilles déjà rendues, et le dossier qui se rebâtit : l'aperçu se met à jour. */
  const miseAJour = enCours && !!images?.some(Boolean);

  /* LE COMPTE BAT QUAND IL CHANGE : on voit ce qu'une option ajoute. */
  const pulse = useRef(new Animated.Value(1)).current;
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    pulse.setValue(0.86);
    Animated.timing(pulse, { toValue: 1, duration: 300, easing: Easing.out(Easing.back(2.4)), useNativeDriver: true }).start();
  }, [total, pulse]);

  /* L'attente respire : les cartes vides battent doucement. */
  const souffle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enCours) return;
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(souffle, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(souffle, { toValue: 0, duration: 650, useNativeDriver: true }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [enCours, souffle]);

  /* LE JOUR OÙ L'ABONNEMENT ARRIVE, LE DOSSIER SE DÉFLOUTE — et ça se sent. */
  const etaitNet = useRef(net);
  useEffect(() => {
    if (net && !etaitNet.current) haptic('succes');
    etaitNet.current = net;
  }, [net]);

  return (
    <View style={s.bloc} testID="apercu-du-dossier">
      <View style={s.tete}>
        <View style={s.teteTexte}>
          <Text style={s.titre}>Votre dossier</Text>
          <Text style={s.resume} numberOfLines={2}>
            {resumeDuDossier(sommaire)}
          </Text>
          {/* L'ANCIEN APERÇU RESTE, ET LE DIT — le nouveau se bâtit sans
              figer l'écran ; on voit qu'il arrive. */}
          {miseAJour && (
            <View style={s.maj} accessibilityLiveRegion="polite" testID="apercu-mise-a-jour">
              <ActivityIndicator size="small" color={c.inkFaint} style={s.majRoue} />
              <Text style={s.majTexte}>Mise à jour…</Text>
            </View>
          )}
        </View>
        {/* UN COMPTE, PAS UN BOUTON — revue « clair-22 » : la pastille bleue
            pleine « 4 feuilles » appelait le doigt, et rien ne se passait.
            Du texte, à l'encre, qui bat quand il change. */}
        <Animated.View
          testID="compte-feuilles"
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${total} feuille${total > 1 ? 's' : ''}`}
          style={[s.compte, { transform: [{ scale: pulse }] }]}>
          <Text style={s.compteChiffre}>{total}</Text>
          <Text style={s.compteMot}>feuille{total > 1 ? 's' : ''}</Text>
        </Animated.View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rangee}>
        {sommaire.map((f, i) => {
          const im = images?.[i];
          return (
            <Pressable
              key={`${i}-${f.titre}`}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Feuille ${i + 1} : ${f.titre}${net ? '' : im ? ', aperçu flouté' : ', aperçu atténué'}`}
              onPress={() => {
                setOuverte(i);
                haptic('leger');
              }}
              style={s.carte}>
              <View style={[s.feuille, miseAJour && im ? s.feuillePerimee : null]}>
                {im ? (
                  <PageImage base64={im} style={s.image} />
                ) : (
                  <Animated.View
                    style={[
                      s.attente,
                      enCours && { opacity: souffle.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                    ]}>
                    <MiniatureFeuille feuille={f} murs={murs} net={net} largeur={CARTE} />
                  </Animated.View>
                )}
                {!net && (
                  <View style={s.verrou}>
                    <Svg width={10} height={10} viewBox="0 0 24 24">
                      <Path d={CADENAS} fill="#FFFFFF" />
                    </Svg>
                  </View>
                )}
              </View>
              <Text style={s.legende} numberOfLines={1}>
                {i + 1} · {f.titre}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* « DÉFLOUTER » N'EXISTE PAS — revue « clair-22 ». On dit ce
          qu'on obtient : le PDF, net, sans filigrane. */}
      {!net && (
        <Pressable accessibilityRole="button" accessibilityLabel="Débloquer le PDF" onPress={onDebloquer} style={s.offre}>
          <Svg width={16} height={16} viewBox="0 0 24 24">
            <Path d={CADENAS} fill={c.blue} />
          </Svg>
          <Text style={s.offreTexte}>
            Votre dossier en aperçu. Avec Pro, le PDF part net et sans filigrane.
          </Text>
        </Pressable>
      )}

      <Visionneuse
        sommaire={sommaire}
        images={images}
        depart={ouverte}
        net={net}
        murs={murs}
        onClose={() => setOuverte(null)}
        onDebloquer={() => {
          setOuverte(null);
          onDebloquer();
        }}
      />
    </View>
  );
}

/** Une feuille rendue : elle apparaît en fondu — celle qui se défloute aussi. */
function PageImage({ base64, style }: { base64: string; style: object }) {
  const fondu = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fondu.setValue(0.35);
    Animated.timing(fondu, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [base64, fondu]);
  return (
    <Animated.Image
      source={{ uri: `data:image/jpeg;base64,${base64}` }}
      resizeMode="contain"
      style={[style, { opacity: fondu }]}
    />
  );
}

/** Le grossissement le plus fort d'une feuille : une cote de 7 pt se lit. */
export const ZOOM_MAX = 3;
/** Deux appuis plus rapprochés que ceci font un double-tap. */
const DOUBLE_TAP_MS = 280;

/**
 * UNE FEUILLE QU'ON PINCE — revue de l'export : ouverte en grand, l'image de
 * 1 100 px restait figée, et l'on ne pouvait pas relire une cote ou un sigle
 * avant d'envoyer le dossier. Elle vit maintenant dans un défilement iOS qui
 * zoome : on pince jusqu'à trois fois, un double-tap grossit là où l'on a
 * touché, un autre revient à la feuille entière. Tout est natif — c'est le
 * zoom de Photos, sans dépendance. Non grossie, la feuille ne défile pas :
 * le glissé horizontal reste à la rangée, qui passe à la suivante.
 */
function PageZoomable({
  larg,
  haut,
  hauteurPage,
  largeurPage,
  children,
}: {
  larg: number;
  haut: number;
  hauteurPage: number;
  largeurPage: number;
  children: React.ReactNode;
}) {
  const zoom = useRef<ScrollView | null>(null);
  const echelle = useRef(1);
  const dernierAppui = useRef(0);
  const doubleTap = (x: number, y: number) => {
    const sv = zoom.current;
    if (!sv?.scrollResponderZoomTo) return;
    if (echelle.current > 1.05) {
      // Déjà grossie : on revient à la feuille entière.
      sv.scrollResponderZoomTo({ x: 0, y: 0, width: larg, height: haut, animated: true });
      return;
    }
    // Le point touché au centre, grossi de moitié du maximum et plus.
    const w = larg / (ZOOM_MAX * 0.8);
    const h = haut / (ZOOM_MAX * 0.8);
    sv.scrollResponderZoomTo({
      x: Math.min(Math.max(0, x - w / 2), larg - w),
      y: Math.min(Math.max(0, y - h / 2), haut - h),
      width: w,
      height: h,
      animated: true,
    });
  };
  return (
    <ScrollView
      ref={zoom}
      style={{ width: largeurPage, height: hauteurPage }}
      contentContainerStyle={{ width: larg, height: haut }}
      minimumZoomScale={1}
      maximumZoomScale={ZOOM_MAX}
      centerContent
      bouncesZoom
      alwaysBounceVertical={false}
      scrollEventThrottle={64}
      onScroll={(e) => {
        echelle.current = e.nativeEvent.zoomScale ?? 1;
      }}>
      <Pressable
        accessible={false}
        style={{ width: larg, height: haut }}
        onPress={(e) => {
          const t = Date.now();
          if (t - dernierAppui.current < DOUBLE_TAP_MS) {
            dernierAppui.current = 0;
            doubleTap(e.nativeEvent.locationX, e.nativeEvent.locationY);
            return;
          }
          dernierAppui.current = t;
        }}>
        {children}
      </Pressable>
    </ScrollView>
  );
}

/**
 * Les feuilles en grand, l'une après l'autre, du doigt.
 *
 * UNE LISTE QUI NE CHARGE QUE LES VOISINES — revue de performance : les 19
 * à 40 images de 1 100 px étaient montées et décodées d'un coup dans la
 * rangée horizontale. Une liste paginée ne garde que la feuille vue et ses
 * deux voisines (`windowSize` 3) : la mémoire d'un gros dossier ne dépend
 * plus de son nombre de feuilles.
 */
function Visionneuse({
  sommaire,
  images,
  depart,
  net,
  murs,
  onClose,
  onDebloquer,
}: {
  sommaire: FeuilleDuDossier[];
  images: string[] | null;
  depart: number | null;
  net: boolean;
  murs: MurDuFond[];
  onClose: () => void;
  onDebloquer: () => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const { width, height } = useWindowDimensions();
  const [ici, setIci] = useState(0);
  /*
    L'OUVERTURE EN COURS : la feuille de départ, et un numéro qui remonte la
    liste à chaque ouverture — elle repart de la feuille touchée, pas de
    celle où l'on avait laissé la précédente. Elle survit à la fermeture le
    temps du fondu : la visionneuse ne se vide pas sous les yeux.
  */
  const [ouverture, setOuverture] = useState<{ n: number; depart: number } | null>(null);
  useEffect(() => {
    if (depart === null) return;
    setIci(depart);
    setOuverture((o) => ({ n: (o?.n ?? 0) + 1, depart }));
  }, [depart]);
  // Debout, c'est la HAUTEUR qui plafonne : la feuille garde ses
  // proportions et rétrécit en largeur, la miniature dessinée tient dedans.
  const larg = Math.min(width - 24, height * 0.62 * FORMAT_FEUILLE);
  const haut = larg / FORMAT_FEUILLE;
  return (
    <Modal visible={depart !== null} animationType="fade" onRequestClose={onClose} transparent>
      <View style={s.voile}>
        <View style={s.voileTete}>
          <Text style={s.voileTitre} numberOfLines={1}>
            {ici + 1} / {sommaire.length} · {sommaire[ici]?.titre ?? ''}
          </Text>
          <TouchableOpacity accessibilityLabel="Fermer l’aperçu" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} onPress={onClose}>
            <Text style={s.voileCroix}>✕</Text>
          </TouchableOpacity>
        </View>
        {ouverture !== null && (
          <FlatList
            key={ouverture.n}
            testID="visionneuse-feuilles"
            style={s.visionneuse}
            data={sommaire}
            keyExtractor={(f, i) => `${i}-${f.titre}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            // La feuille touchée d'abord : on y est déjà en ouvrant.
            initialScrollIndex={Math.min(ouverture.depart, Math.max(0, sommaire.length - 1))}
            getItemLayout={(_d, i) => ({ length: width, offset: width * i, index: i })}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            windowSize={3}
            onMomentumScrollEnd={(e) => setIci(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)))}
            renderItem={({ item: f, index: i }) => (
              <View style={[s.page, { width }]}>
                <PageZoomable larg={larg} haut={haut} largeurPage={width} hauteurPage={haut}>
                  {images?.[i] ? (
                    <Image
                      source={{ uri: `data:image/jpeg;base64,${images[i]}` }}
                      resizeMode="contain"
                      style={{ width: larg, height: haut, borderRadius: 6 }}
                      accessibilityLabel={`Feuille ${i + 1} : ${f.titre}`}
                    />
                  ) : (
                    <View style={[s.pageVide, { width: larg, height: haut }]}>
                      <MiniatureFeuille feuille={f} murs={murs} net={net} largeur={larg} />
                    </View>
                  )}
                </PageZoomable>
              </View>
            )}
          />
        )}
        {!net && (
          <View style={s.voilePied}>
            <Text style={s.voileArgument}>
              C’est bien votre plan. Sans flou ni filigrane, il est prêt à partir.
            </Text>
            <TouchableOpacity accessibilityLabel="Débloquer le PDF" style={s.voileBouton} onPress={onDebloquer}>
              <Svg width={16} height={16} viewBox="0 0 24 24">
                <Path d={CADENAS} fill="#FFFFFF" />
              </Svg>
              <Text style={s.voileBoutonTexte}>Débloquer le PDF</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

// Une carte debout : 148 de large font 209 de haut, à peu près la surface
// de l'ancienne carte couchée de 196 — la rangée ne mange pas l'écran.
const CARTE = 148;

/** Le filigrane de la miniature : le même mot que celui gravé par le natif. */
export const FILIGRANE_MINIATURE = 'EchoPlan';

/**
 * UNE FEUILLE EN MINIATURE DESSINÉE — ce qu'elle montre, pas une icône.
 *
 * La page de garde, le plan, les gaines et les vues 3D portent LE PLAN
 * relevé (les murs du niveau exporté) ; le métré, la liste d'achats, les
 * schémas, leurs tableaux ; un mur de face, son mur et ses ouvertures. Le
 * cartouche en bas à droite, comme sur chaque feuille du dossier.
 *
 * Sans abonnement : atténuée, et barrée du filigrane « EchoPlan » — on
 * reconnaît son logement, on n'y lit pas une cote. Le dessin garde la
 * palette CLAIRE : c'est du papier, il reste blanc la nuit.
 */
export function MiniatureFeuille({
  feuille,
  murs,
  net,
  largeur,
}: {
  feuille: FeuilleDuDossier;
  murs: MurDuFond[];
  net: boolean;
  largeur: number;
}) {
  const c = light;
  const w = largeur;
  const h = largeur / FORMAT_FEUILLE;
  const m = w * 0.06;
  const trait = Math.max(1.2, w / 110);
  const plan = (boite: { x: number; y: number; w: number; h: number }, couleur = c.ink, epais = trait) =>
    cadrerLePlan(murs, boite).map((sg, i) => (
      <Line key={`m${i}`} {...sg} stroke={couleur} strokeWidth={epais} strokeLinecap="round" />
    ));
  const lignes = (x: number, y: number, lw: number, n: number, pas: number) =>
    Array.from({ length: n }, (_, i) => (
      <Rect key={`l${i}`} x={x} y={y + i * pas} width={lw * (i % 3 === 2 ? 0.7 : 1)} height={Math.max(2, h / 60)} rx={1} fill={c.lineStrong} />
    ));
  const tableau = (x: number, y: number, tw: number, th: number, entete: string) => {
    const rangs = 6;
    const rh = th / rangs;
    return (
      <G>
        <Rect x={x} y={y} width={tw} height={rh} rx={2} fill={entete} opacity={0.85} />
        {Array.from({ length: rangs - 1 }, (_, r) => (
          <G key={`r${r}`}>
            <Line x1={x} y1={y + (r + 2) * rh} x2={x + tw} y2={y + (r + 2) * rh} stroke={c.line} strokeWidth={0.8} />
            <Rect x={x + tw * 0.04} y={y + (r + 1.4) * rh} width={tw * 0.42} height={Math.max(2, rh * 0.22)} rx={1} fill={c.lineStrong} />
            <Rect x={x + tw * 0.78} y={y + (r + 1.4) * rh} width={tw * 0.16} height={Math.max(2, rh * 0.22)} rx={1} fill={c.lineStrong} />
          </G>
        ))}
      </G>
    );
  };
  let corps: React.ReactNode;
  switch (feuille.genre) {
    case 'garde':
      corps = (
        <G>
          <Rect x={m} y={m} width={w * 0.34} height={h * 0.07} rx={2} fill={c.ink} />
          {lignes(m, m + h * 0.16, w * 0.3, 5, h * 0.08)}
          {plan({ x: w * 0.46, y: m, w: w * 0.48, h: h * 0.7 })}
        </G>
      );
      break;
    case 'plan':
    case 'gaines':
      corps = (
        <G>
          {plan({ x: m * 1.5, y: m, w: w * 0.7, h: h * 0.8 })}
          {feuille.genre === 'gaines' && plan({ x: m * 1.5, y: m, w: w * 0.7, h: h * 0.8 }, c.blue, trait * 0.6)}
        </G>
      );
      break;
    case 'perspective':
      // Le plan couché : une vue plongeante, sans calcul de 3D.
      corps = (
        <G transform={`translate(${w * 0.18} ${h * 0.1}) skewX(-28) scale(1 0.62)`}>
          {plan({ x: w * 0.12, y: 0, w: w * 0.62, h: h * 1.1 }, c.ink, trait * 1.1)}
        </G>
      );
      break;
    case 'elevation': {
      const mx = m * 1.5;
      const sol = h * 0.72;
      const haut = h * 0.42;
      corps = (
        <G>
          <Rect x={mx} y={sol - haut} width={w * 0.7} height={haut} fill="none" stroke={c.ink} strokeWidth={trait} />
          <Rect x={mx + w * 0.12} y={sol - haut * 0.8} width={w * 0.1} height={haut * 0.8} fill={c.blueSoft} stroke={c.ink} strokeWidth={trait * 0.7} />
          <Rect x={mx + w * 0.42} y={sol - haut * 0.78} width={w * 0.16} height={haut * 0.4} fill={c.blueSoft} stroke={c.ink} strokeWidth={trait * 0.7} />
          <Line x1={mx} y1={sol + h * 0.06} x2={mx + w * 0.7} y2={sol + h * 0.06} stroke={c.inkFaint} strokeWidth={trait * 0.6} />
        </G>
      );
      break;
    }
    default:
      // Métré, liste d'achats, tableau existant, schémas : des tableaux.
      corps = tableau(m, m, w * 0.62, h * 0.74, feuille.genre === 'achats' ? '#1E8E4E' : c.blue);
  }
  return (
    <Svg width={w} height={h} testID={`miniature-${feuille.genre}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x={0} y={0} width={w} height={h} fill="#FFFFFF" />
      <G opacity={net ? 1 : 0.5}>
        {corps}
        {/* Le cartouche, comme sur chaque feuille. */}
        <Rect x={w * 0.72} y={h * 0.8} width={w * 0.22} height={h * 0.13} rx={1.5} fill="none" stroke={c.lineStrong} strokeWidth={0.8} />
      </G>
      {!net && (
        <SvgText
          x={w / 2}
          y={h / 2 + w * 0.05}
          fill={c.blue}
          opacity={0.3}
          fontSize={w * 0.15}
          fontWeight="800"
          textAnchor="middle"
          transform={`rotate(-24 ${w / 2} ${h / 2})`}>
          {FILIGRANE_MINIATURE}
        </SvgText>
      )}
    </Svg>
  );
}

const getStyles = (c: Palette) =>
  StyleSheet.create({
    bloc: { gap: 10 },
    tete: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    teteTexte: { flex: 1 },
    titre: { color: c.ink, fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },
    resume: { color: c.inkFaint, fontSize: 13, marginTop: 2, lineHeight: 18 },
    compte: { minWidth: 52, alignItems: 'flex-end' },
    compteChiffre: { color: c.ink, fontSize: 22, fontWeight: '700', lineHeight: 24 },
    compteMot: { color: c.inkFaint, fontSize: 11.5, fontWeight: '600' },
    rangee: { gap: 12, paddingVertical: 4, paddingRight: 8 },
    carte: { width: CARTE },
    feuille: {
      width: CARTE,
      height: CARTE / FORMAT_FEUILLE,
      borderRadius: 10,
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.line,
      ...shadowCard,
      shadowOpacity: 0.08,
    },
    /** Une image d'avant la dernière option : encore là, un peu en retrait. */
    feuillePerimee: { opacity: 0.6 },
    maj: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    majRoue: { transform: [{ scale: 0.75 }] },
    majTexte: { color: c.inkFaint, fontSize: 12.5, fontWeight: '600' },
    image: { width: '100%', height: '100%' },
    attente: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
    verrou: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    legende: { color: c.inkSoft, fontSize: 12.5, fontWeight: '600', marginTop: 6 },
    offre: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.blueSoft,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    offreTexte: { color: c.ink, fontSize: 13, lineHeight: 18, flex: 1, fontWeight: '600' },
    voile: { flex: 1, backgroundColor: 'rgba(11,13,18,0.94)', paddingTop: 58, paddingBottom: 34 },
    voileTete: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginBottom: 14 },
    voileTitre: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', flex: 1 },
    voileCroix: { color: '#FFFFFF', fontSize: 19, fontWeight: '700' },
    // La rangée prend la place qui reste entre l'en-tête et le pied ; la
    // feuille s'y centre.
    visionneuse: { flex: 1 },
    page: { alignItems: 'center', justifyContent: 'center' },
    pageVide: { backgroundColor: '#FFFFFF', borderRadius: 6, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    voilePied: { paddingHorizontal: 18, gap: 12 },
    voileArgument: { color: 'rgba(255,255,255,0.86)', fontSize: 14, lineHeight: 20, textAlign: 'center' },
    voileBouton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: c.blue,
      borderRadius: radius.pill,
      paddingVertical: 15,
    },
    voileBoutonTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  });

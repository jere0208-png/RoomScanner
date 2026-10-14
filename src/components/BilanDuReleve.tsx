/**
 * LE BILAN DU RELEVÉ — la seconde où le scan s'arrête, mise en scène.
 *
 * Relevé du patron : « repense la chose en modernité et ludique ». Les
 * applications de relevé ouvrent le plan sans un mot ; ici, le relevé se
 * NOTE : un anneau qui se remplit jusqu'à son score, trois étoiles qui
 * tombent une à une, les chiffres qui montent (pièces, mètres carrés, murs,
 * portes, fenêtres, meubles), des cotillons quand c'est réussi — et, pour le
 * critère le plus faible, le geste qui le corrige la prochaine fois.
 *
 * TOUT SUR UN ÉCRAN, SANS DÉFILER — relevé du patron : « propose une refonte
 * de la page de la note du scan, plus moderne et dynamique. Pas de scroll à
 * faire, tout sur la même page d'écran, de manière responsive. » La carte
 * empilait l'anneau, les étoiles, six chiffres, cinq barres, le conseil et
 * trois boutons : plus haut qu'un téléphone, il fallait la faire défiler.
 * Elle devient une page entière, découpée en blocs qui se partagent la
 * hauteur de l'écran :
 *   — le HÉROS, en dégradé : l'anneau du score, la mention, les étoiles ;
 *   — six TUILES, chacune son icône et son nombre ;
 *   — cinq JAUGES rondes pour les critères, la plus faible en ambre, et le
 *     conseil dans une bulle qui la désigne ;
 *   — deux PORTES illustrées (la 3D, la réalité augmentée) et le bouton qui
 *     ramène au plan.
 * Les tailles se calent sur la hauteur utile (`k`, de 0 sur un iPhone SE à
 * 1 sur un grand écran) : un SE la tient entière, un Pro Max la respire.
 *
 * Le score, lui, ne s'invente pas : voir `geometry/bilan`.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Degrade } from './Degrade';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import type { BilanDuReleve, CleDuCritere } from '../geometry/bilan';
import { haptic } from '../ui/haptic';
import { SOLAIRES, type IconeSolaire } from '../ui/solaires';
import { useTheme, type Palette } from '../theme';

/** Un nombre qui monte jusqu'à sa cible, à l'ouverture de la page. */
function useCompteur(
  cible: number,
  duree: number,
  delai: number,
  actif: boolean,
): number {
  const [vu, setVu] = useState(0);
  useEffect(() => {
    if (!actif) {
      setVu(0);
      return;
    }
    const v = new Animated.Value(0);
    const id = v.addListener(({ value }) => setVu(Math.round(value)));
    const anim = Animated.timing(v, {
      toValue: cible,
      duration: duree,
      delay: delai,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start();
    return () => {
      anim.stop();
      v.removeListener(id);
    };
  }, [cible, duree, delai, actif]);
  return vu;
}

/** Entre deux tailles, selon la hauteur de l'écran (`k` de 0 à 1). */
const entre = (k: number, petit: number, grand: number) => Math.round(petit + (grand - petit) * k);

/** Le dessin d'une icône Solar, à la taille et la teinte voulues. */
function Icone({ nom, taille, teinte }: { nom: IconeSolaire; taille: number; teinte: string }) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 24 24">
      <Path d={SOLAIRES[nom]} fill={teinte} fillRule="evenodd" />
    </Svg>
  );
}


/** L'anneau du score : il se remplit jusqu'à sa note, en blanc sur le héros. */
function Anneau({ score, actif, taille, trait }: { score: number; actif: boolean; taille: number; trait: number }) {
  const vu = useCompteur(score, 1100, 250, actif);
  const r = taille / 2 - trait / 2 - 2;
  const tour = 2 * Math.PI * r;
  return (
    <View style={{ width: taille, height: taille }} accessibilityLabel={`Qualité du relevé : ${score} sur 100`}>
      <Svg width={taille} height={taille}>
        <Circle cx={taille / 2} cy={taille / 2} r={r} stroke="rgba(255,255,255,0.22)" strokeWidth={trait} fill="none" />
        <Circle
          cx={taille / 2}
          cy={taille / 2}
          r={r}
          stroke="#FFFFFF"
          strokeWidth={trait}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${tour} ${tour}`}
          strokeDashoffset={tour * (1 - vu / 100)}
          transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, base.centre]} pointerEvents="none">
        <Text style={[base.score, { fontSize: Math.round(taille * 0.3) }]}>{vu}</Text>
        <Text style={base.sur}>/ 100</Text>
      </View>
    </View>
  );
}

const ETOILE =
  'M12 2.6l2.85 5.78 6.38.93-4.61 4.5 1.09 6.35L12 17.16l-5.71 3 1.09-6.35-4.61-4.5 6.38-.93z';

/** Trois étoiles, qui tombent l'une après l'autre quand l'anneau a fini. */
function Etoiles({ n, actif, taille }: { n: number; actif: boolean; taille: number }) {
  const echelles = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (!actif) {
      echelles.forEach((e) => e.setValue(0));
      return;
    }
    const anims = echelles.map((e, i) =>
      Animated.spring(e, {
        toValue: 1,
        delay: 1250 + i * 220,
        friction: 4,
        tension: 140,
        useNativeDriver: true,
      }),
    );
    Animated.parallel(anims).start();
    // La dernière étoile tombée, la main le sent.
    const t = setTimeout(() => haptic(n >= 2 ? 'succes' : 'leger'), 1300 + (n - 1) * 220);
    return () => {
      clearTimeout(t);
      anims.forEach((a) => a.stop());
    };
  }, [actif, n, echelles]);
  return (
    <View style={base.etoiles} accessibilityLabel={`${n} étoile${n > 1 ? 's' : ''} sur 3`}>
      {echelles.map((e, i) => (
        <Animated.View key={i} style={{ transform: [{ scale: e }] }}>
          <Svg width={taille} height={taille} viewBox="0 0 24 24">
            <Path d={ETOILE} fill={i < n ? '#FFC94A' : 'rgba(255,255,255,0.25)'} />
          </Svg>
        </Animated.View>
      ))}
    </View>
  );
}

/** Des cotillons qui tombent sur la page : seulement quand c'est réussi. */
function Cotillons({ actif, c }: { actif: boolean; c: Palette }) {
  const morceaux = useMemo(() => {
    // Un hasard fixe : les mêmes cotillons à chaque bilan, pas de saut au rendu.
    let g = 7;
    const h = () => ((g = (g * 16807) % 2147483647) - 1) / 2147483646;
    const teintes = [c.blue, c.amber, c.green, c.sky, c.danger, '#FFFFFF'];
    return Array.from({ length: 34 }, (_, i) => ({
      x: h(),
      derive: (h() - 0.5) * 80,
      tour: (h() - 0.5) * 720,
      delai: h() * 500,
      duree: 1500 + h() * 900,
      w: 6 + h() * 5,
      hauteur: 9 + h() * 7,
      teinte: teintes[i % teintes.length],
      v: new Animated.Value(0),
    }));
  }, [c]);
  const { height } = useWindowDimensions();
  useEffect(() => {
    if (!actif) return;
    const anims = morceaux.map((m) =>
      Animated.timing(m.v, {
        toValue: 1,
        duration: m.duree,
        delay: 900 + m.delai,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    );
    morceaux.forEach((m) => m.v.setValue(0));
    Animated.parallel(anims).start();
    return () => anims.forEach((a) => a.stop());
  }, [actif, morceaux]);
  if (!actif) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {morceaux.map((m, i) => (
        <Animated.View
          key={i}
          style={[
            base.cotillon,
            {
              left: `${Math.round(m.x * 100)}%`,
              width: m.w,
              height: m.hauteur,
              backgroundColor: m.teinte,
              opacity: m.v.interpolate({ inputRange: [0, 0.05, 0.85, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateY: m.v.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.85] }) },
                { translateX: m.v.interpolate({ inputRange: [0, 1], outputRange: [0, m.derive] }) },
                { rotate: m.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${m.tour}deg`] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

/** Une tuile : l'icône dans sa pastille, le nombre qui monte, son nom. */
function Tuile({
  valeur,
  libelle,
  icone,
  teinte,
  hauteur,
  delai,
  actif,
  s,
}: {
  valeur: number;
  libelle: string;
  icone: IconeSolaire;
  teinte: string;
  hauteur: number;
  delai: number;
  actif: boolean;
  s: Styles;
}) {
  const vu = useCompteur(valeur, 800, delai, actif);
  return (
    <View style={[s.tuile, { height: hauteur }]} accessibilityLabel={`${valeur} ${libelle}`}>
      <View style={[s.tuileIcone, { backgroundColor: `${teinte}1F` }]}>
        <Icone nom={icone} taille={18} teinte={teinte} />
      </View>
      <View style={base.flexe}>
        <Text style={s.tuileValeur} numberOfLines={1}>
          {vu}
        </Text>
        <Text style={s.tuileLibelle} numberOfLines={1}>
          {libelle}
        </Text>
      </View>
    </View>
  );
}

/** Le nom court de chaque critère, et son icône : la jauge se lit d'un coup d'œil. */
const CRITERE: Record<CleDuCritere, { court: string; icone: IconeSolaire }> = {
  structure: { court: 'Pièces', icone: 'maison' },
  precision: { court: 'Murs', icone: 'oeil' },
  murs: { court: 'Image des murs', icone: 'rouleau' },
  sol: { court: 'Image du sol', icone: 'surface' },
  plafond: { court: 'Plafond', icone: 'plafond' },
};

/** Une jauge ronde : elle se remplit jusqu'à la part du critère. */
function Jauge({
  part,
  cle,
  libelle,
  faible,
  taille,
  delai,
  actif,
  points,
  sur,
  s,
  c,
}: {
  part: number;
  cle: CleDuCritere;
  libelle: string;
  faible: boolean;
  taille: number;
  delai: number;
  actif: boolean;
  points: number;
  sur: number;
  s: Styles;
  c: Palette;
}) {
  const vu = useCompteur(Math.round(part * 100), 900, delai, actif);
  const r = taille / 2 - 4;
  const tour = 2 * Math.PI * r;
  const teinte = faible ? c.amber : part >= 0.85 ? c.green : part >= 0.5 ? c.blue : c.amber;
  return (
    <View style={s.jaugeColonne} accessibilityLabel={`${libelle} : ${points} sur ${sur}`}>
      <View style={{ width: taille, height: taille }}>
        <Svg width={taille} height={taille}>
          <Circle cx={taille / 2} cy={taille / 2} r={r} stroke={c.line} strokeWidth={5} fill="none" />
          <Circle
            cx={taille / 2}
            cy={taille / 2}
            r={r}
            stroke={teinte}
            strokeWidth={5}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${tour} ${tour}`}
            strokeDashoffset={tour * (1 - vu / 100)}
            transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, base.centre]} pointerEvents="none">
          <Icone nom={CRITERE[cle].icone} taille={Math.round(taille * 0.42)} teinte={faible ? c.amber : c.inkSoft} />
        </View>
      </View>
      <Text style={[s.jaugeNom, faible && { color: c.amber }]} numberOfLines={2}>
        {CRITERE[cle].court}
      </Text>
    </View>
  );
}

/** Le cube de la 3D, au trait. */
const CUBE = 'M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4zM4 7.4l8 4.6 8-4.6M12 12v9.2';

export function BilanDuReleveCarte({
  bilan,
  onFermer,
  onVoir3D,
  onRealiteAugmentee,
}: {
  bilan: BilanDuReleve | null;
  onFermer: () => void;
  onVoir3D: () => void;
  onRealiteAugmentee: () => void;
}) {
  const c = useTheme();
  const s = styles(c);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const actif = !!bilan;
  const monte = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!actif) return;
    monte.setValue(0);
    Animated.spring(monte, { toValue: 1, friction: 8, tension: 70, useNativeDriver: true }).start();
  }, [actif, monte]);
  if (!bilan) return null;

  // La hauteur utile décide des tailles : voir l'en-tête du module.
  const utile = height - insets.top - insets.bottom;
  const k = Math.max(0, Math.min(1, (utile - 620) / 260));
  const anneau = entre(k, 108, 150);
  const heros = entre(k, 134, 196);
  const tuile = entre(k, 58, 76);
  const jauge = entre(k, 40, 52);
  const porte = entre(k, 72, 104);
  const bouton = entre(k, 50, 56);

  const chiffres: [number, string, IconeSolaire, string][] = [
    [bilan.pieces, bilan.pieces > 1 ? 'pièces' : 'pièce', 'rooms', c.blue],
    [bilan.surface, 'm²', 'surface', '#7C5CFF'],
    [bilan.murs, 'murs', 'murs', c.inkSoft],
    [bilan.portes, bilan.portes > 1 ? 'portes' : 'porte', 'ouvertures', c.amber],
    [bilan.fenetres, bilan.fenetres > 1 ? 'fenêtres' : 'fenêtre', 'volets', c.sky],
    [bilan.meubles, bilan.meubles > 1 ? 'meubles' : 'meuble', 'meubles', c.green],
  ];
  // Le critère le plus faible : c'est lui que le conseil relève.
  const parts = bilan.criteres.map((x) => x.points / Math.max(1, x.sur));
  const faible = bilan.conseil ? parts.reduce((m, p, i) => (p < parts[m] ? i : m), 0) : -1;
  const apparition = (decalage: number) => ({
    opacity: monte,
    transform: [{ translateY: monte.interpolate({ inputRange: [0, 1], outputRange: [40 + decalage, 0] }) }],
  });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onFermer}>
      <View style={[s.page, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        <View style={[s.colonne, { gap: entre(k, 8, 12) }]}>
          <View style={s.haut}>
            <View style={s.pastille}>
              <Text style={s.pastilleTexte}>Relevé terminé</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer le bilan"
              hitSlop={10}
              style={({ pressed }) => [s.fermer, pressed && s.enfonce]}
              onPress={onFermer}>
              <Svg width={14} height={14} viewBox="0 0 14 14">
                <Path d="M2 2 L12 12 M12 2 L2 12" stroke={c.inkSoft} strokeWidth={2.2} strokeLinecap="round" />
              </Svg>
            </Pressable>
          </View>

          {/* LE HÉROS : le score, la mention, les étoiles. */}
          <Animated.View style={[s.heros, { height: heros }, apparition(0)]}>
            <Degrade id="bilan-heros" de="#2D6BFF" a="#5B3DF5" />
            <View style={[s.bulleDeco, { width: heros * 1.2, height: heros * 1.2, borderRadius: heros * 0.6, top: -heros * 0.55, right: -heros * 0.3 }]} />
            <Anneau score={bilan.score} actif={actif} taille={anneau} trait={entre(k, 9, 11)} />
            <View style={s.herosDroite}>
              <Text style={[s.mention, { fontSize: entre(k, 24, 30) }]} numberOfLines={1} adjustsFontSizeToFit>
                {bilan.mention}
              </Text>
              <Etoiles n={bilan.etoiles} actif={actif} taille={entre(k, 24, 30)} />
              <Text style={s.resume} numberOfLines={1}>
                {`${bilan.pieces} pièce${bilan.pieces > 1 ? 's' : ''} · ${bilan.surface} m²`}
              </Text>
            </View>
          </Animated.View>

          {/* LES SIX CHIFFRES, en tuiles. */}
          <Animated.View style={[s.grille, apparition(20)]}>
            {chiffres.map(([v, l, icone, teinte], i) => (
              <View key={l} style={s.case}>
                <Tuile valeur={v} libelle={l} icone={icone} teinte={teinte} hauteur={tuile} delai={300 + i * 90} actif={actif} s={s} />
              </View>
            ))}
          </Animated.View>

          {/* LES CRITÈRES EN JAUGES, et le conseil qui désigne le plus faible. */}
          <Animated.View style={[s.qualite, apparition(40)]}>
            <View style={s.jauges}>
              {bilan.criteres.map((x, i) => (
                <Jauge
                  key={x.cle}
                  part={parts[i]}
                  cle={x.cle}
                  libelle={x.libelle}
                  faible={i === faible}
                  taille={jauge}
                  delai={500 + i * 110}
                  actif={actif}
                  points={x.points}
                  sur={x.sur}
                  s={s}
                  c={c}
                />
              ))}
            </View>
            {bilan.conseil && (
              <View style={s.conseil}>
                {faible >= 0 && <View style={[s.conseilFleche, { left: `${((faible + 0.5) * 100) / bilan.criteres.length}%` }]} />}
                <Icone nom="lumiere" taille={18} teinte={c.amber} />
                <Text style={s.conseilTexte} numberOfLines={3}>
                  {bilan.conseil}
                </Text>
              </View>
            )}
          </Animated.View>

          {/* LES DEUX PORTES, puis le retour au plan. */}
          <Animated.View style={[s.portes, { height: porte }, apparition(60)]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voir en 3D"
              style={({ pressed }) => [s.porte, pressed && s.enfonce]}
              onPress={onVoir3D}>
              <Degrade id="bilan-3d" de="#111827" a="#374151" />
              <Svg width={entre(k, 26, 32)} height={entre(k, 26, 32)} viewBox="0 0 24 24">
                <Path d={CUBE} stroke="#FFFFFF" strokeWidth={1.9} strokeLinejoin="round" fill="none" />
              </Svg>
              <View style={base.flexe}>
                <Text style={s.porteTitre} numberOfLines={1}>
                  Voir en 3D
                </Text>
                <Text style={s.porteSous} numberOfLines={1}>
                  Tournez autour
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voir en réalité augmentée"
              style={({ pressed }) => [s.porte, pressed && s.enfonce]}
              onPress={onRealiteAugmentee}>
              <Degrade id="bilan-ra" de="#06B6D4" a="#2563EB" />
              <Icone nom="maison" taille={entre(k, 26, 32)} teinte="#FFFFFF" />
              <View style={base.flexe}>
                <Text style={s.porteTitre} numberOfLines={1}>
                  Chez moi
                </Text>
                <Text style={s.porteSous} numberOfLines={1}>
                  Réalité augmentée
                </Text>
              </View>
            </Pressable>
          </Animated.View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continuer sur le plan"
            style={({ pressed }) => [s.continuer, { height: bouton }, pressed && s.enfonce]}
            onPress={onFermer}>
            <Text style={s.continuerTexte}>Continuer sur le plan</Text>
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path d="M5 12h13M13 6l6 6-6 6" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </Svg>
          </Pressable>
        </View>
        {/* Par-dessus tout : les cotillons tombent devant la page. */}
        <Cotillons actif={bilan.etoiles >= 2} c={c} />
      </View>
    </Modal>
  );
}

/** Ce qui ne dépend pas du thème. */
const base = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  flexe: { flex: 1 },
  score: { color: '#FFFFFF', fontWeight: '900', fontVariant: ['tabular-nums'] },
  sur: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '700', marginTop: -2 },
  etoiles: { flexDirection: 'row', gap: 4 },
  cotillon: { position: 'absolute', top: -16, borderRadius: 2 },
});

type Styles = ReturnType<typeof creer>;
const cache = new WeakMap<Palette, Styles>();
const styles = (c: Palette): Styles => {
  let s = cache.get(c);
  if (!s) {
    s = creer(c);
    cache.set(c, s);
  }
  return s;
};

const creer = (c: Palette) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 16 },
    // Sur une tablette, la page garde la largeur d'un téléphone, au milieu.
    colonne: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', justifyContent: 'space-between' },
    haut: { height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pastille: { backgroundColor: c.blueSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    pastilleTexte: { color: c.blue, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
    fermer: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    heros: {
      borderRadius: 28,
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingHorizontal: 18,
      shadowColor: '#2D6BFF',
      shadowOpacity: 0.35,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
    },
    bulleDeco: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.07)' },
    herosDroite: { flex: 1, gap: 6 },
    mention: { color: '#FFFFFF', fontWeight: '900', letterSpacing: -0.4 },
    resume: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
    grille: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, rowGap: 8 },
    case: { width: '33.333%', paddingHorizontal: 4 },
    tuile: {
      backgroundColor: c.surface,
      borderRadius: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 10,
      shadowColor: '#101828',
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
    },
    tuileIcone: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    tuileValeur: { color: c.ink, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
    tuileLibelle: { color: c.inkSoft, fontSize: 11.5, fontWeight: '600' },
    qualite: {
      backgroundColor: c.surface,
      borderRadius: 22,
      paddingTop: 12,
      paddingBottom: 10,
      paddingHorizontal: 8,
      shadowColor: '#101828',
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
    },
    jauges: { flexDirection: 'row' },
    jaugeColonne: { flex: 1, alignItems: 'center', gap: 5 },
    jaugeNom: { color: c.inkSoft, fontSize: 10.5, fontWeight: '700', textAlign: 'center', lineHeight: 12.5, maxWidth: 70 },
    conseil: {
      marginTop: 10,
      marginHorizontal: 4,
      backgroundColor: `${c.amber}1F`,
      borderRadius: 14,
      paddingHorizontal: 11,
      paddingVertical: 9,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    conseilFleche: {
      position: 'absolute',
      top: -6,
      width: 12,
      height: 12,
      marginLeft: -6,
      backgroundColor: `${c.amber}1F`,
      transform: [{ rotate: '45deg' }],
    },
    conseilTexte: { flex: 1, color: c.ink, fontSize: 12.5, lineHeight: 16.5 },
    portes: { flexDirection: 'row', gap: 10 },
    porte: {
      flex: 1,
      borderRadius: 22,
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
    },
    porteTitre: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '800' },
    porteSous: { color: 'rgba(255,255,255,0.82)', fontSize: 11.5, fontWeight: '600' },
    continuer: {
      borderRadius: 18,
      backgroundColor: c.blue,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      shadowColor: c.blue,
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },
    continuerTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    enfonce: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  });

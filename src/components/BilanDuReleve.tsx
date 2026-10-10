/**
 * LA CARTE DU BILAN — la seconde où le scan s'arrête, mise en scène.
 *
 * Relevé du patron : « repense la chose en modernité et ludique ». Les
 * applications de relevé ouvrent le plan sans un mot ; ici, le relevé se
 * NOTE : un anneau qui se remplit jusqu'à son score, trois étoiles qui
 * tombent une à une, les chiffres qui montent (pièces, mètres carrés, murs,
 * portes, fenêtres, meubles), des cotillons quand c'est réussi — et, pour le
 * critère le plus faible, le geste qui le corrige la prochaine fois.
 *
 * Puis deux portes, les deux nouveautés qu'on a envie d'ouvrir tout de
 * suite : la 3D, et la maquette posée chez soi en réalité augmentée.
 *
 * Le score, lui, ne s'invente pas : voir `geometry/bilan`.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { BilanDuReleve } from '../geometry/bilan';
import { haptic } from '../ui/haptic';
import { useTheme, type Palette } from '../theme';

/** Un nombre qui monte jusqu'à sa cible, à l'ouverture de la carte. */
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

const RAYON = 54;
const TOUR = 2 * Math.PI * RAYON;

/** L'anneau du score : il se remplit jusqu'à sa note. */
function Anneau({
  score,
  actif,
  c,
}: {
  score: number;
  actif: boolean;
  c: Palette;
}) {
  const vu = useCompteur(score, 1100, 250, actif);
  const teinte = score >= 85 ? c.green : score >= 60 ? c.blue : c.amber;
  const s = styles(c);
  return (
    <View
      style={s.anneau}
      accessibilityLabel={`Qualité du relevé : ${score} sur 100`}
    >
      <Svg width={132} height={132} viewBox="0 0 132 132">
        <Circle
          cx={66}
          cy={66}
          r={RAYON}
          stroke={c.line}
          strokeWidth={11}
          fill="none"
        />
        <Circle
          cx={66}
          cy={66}
          r={RAYON}
          stroke={teinte}
          strokeWidth={11}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${TOUR} ${TOUR}`}
          strokeDashoffset={TOUR * (1 - vu / 100)}
          transform="rotate(-90 66 66)"
        />
      </Svg>
      <View style={s.anneauCentre} pointerEvents="none">
        <Text style={s.anneauScore}>{vu}</Text>
        <Text style={s.anneauSur}>/ 100</Text>
      </View>
    </View>
  );
}

const ETOILE =
  'M12 2.6l2.85 5.78 6.38.93-4.61 4.5 1.09 6.35L12 17.16l-5.71 3 1.09-6.35-4.61-4.5 6.38-.93z';

/** Trois étoiles, qui tombent l'une après l'autre quand l'anneau a fini. */
function Etoiles({ n, actif, c }: { n: number; actif: boolean; c: Palette }) {
  const echelles = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (!actif) {
      echelles.forEach(e => e.setValue(0));
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
    const t = setTimeout(
      () => haptic(n >= 2 ? 'succes' : 'leger'),
      1300 + (n - 1) * 220,
    );
    return () => {
      clearTimeout(t);
      anims.forEach(a => a.stop());
    };
  }, [actif, n, echelles]);
  return (
    <View
      style={styles(c).etoiles}
      accessibilityLabel={`${n} étoile${n > 1 ? 's' : ''} sur 3`}
    >
      {echelles.map((e, i) => (
        <Animated.View key={i} style={{ transform: [{ scale: e }] }}>
          <Svg width={34} height={34} viewBox="0 0 24 24">
            <Path d={ETOILE} fill={i < n ? c.amber : c.line} />
          </Svg>
        </Animated.View>
      ))}
    </View>
  );
}

/** Des cotillons qui tombent sur la carte : seulement quand c'est réussi. */
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
  useEffect(() => {
    if (!actif) return;
    const anims = morceaux.map(m =>
      Animated.timing(m.v, {
        toValue: 1,
        duration: m.duree,
        delay: 900 + m.delai,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    );
    morceaux.forEach(m => m.v.setValue(0));
    Animated.parallel(anims).start();
    return () => anims.forEach(a => a.stop());
  }, [actif, morceaux]);
  if (!actif) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {morceaux.map((m, i) => (
        <Animated.View
          key={i}
          style={[
            styles(c).cotillon,
            {
              left: `${Math.round(m.x * 100)}%`,
              width: m.w,
              height: m.hauteur,
              backgroundColor: m.teinte,
              opacity: m.v.interpolate({
                inputRange: [0, 0.05, 0.85, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  translateY: m.v.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 560],
                  }),
                },
                {
                  translateX: m.v.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, m.derive],
                  }),
                },
                {
                  rotate: m.v.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', `${m.tour}deg`],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

function Chiffre({
  valeur,
  libelle,
  delai,
  actif,
  c,
}: {
  valeur: number;
  libelle: string;
  delai: number;
  actif: boolean;
  c: Palette;
}) {
  const vu = useCompteur(valeur, 800, delai, actif);
  const s = styles(c);
  return (
    <View style={s.chiffre} accessibilityLabel={`${valeur} ${libelle}`}>
      <Text style={s.chiffreValeur}>{vu}</Text>
      <Text style={s.chiffreLibelle}>{libelle}</Text>
    </View>
  );
}

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
  const actif = !!bilan;
  const monte = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!actif) return;
    monte.setValue(0);
    Animated.spring(monte, {
      toValue: 1,
      friction: 8,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [actif, monte]);
  if (!bilan) return null;
  const chiffres: [number, string][] = [
    [bilan.pieces, bilan.pieces > 1 ? 'pièces' : 'pièce'],
    [bilan.surface, 'm²'],
    [bilan.murs, 'murs'],
    [bilan.portes, bilan.portes > 1 ? 'portes' : 'porte'],
    [bilan.fenetres, bilan.fenetres > 1 ? 'fenêtres' : 'fenêtre'],
    [bilan.meubles, bilan.meubles > 1 ? 'meubles' : 'meuble'],
  ];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onFermer}>
      <View style={s.voile}>
        <Animated.View
          style={[
            s.carte,
            {
              opacity: monte,
              transform: [
                {
                  translateY: monte.interpolate({
                    inputRange: [0, 1],
                    outputRange: [60, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={s.contenu}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={s.surtitre}>Relevé terminé</Text>
            <Anneau score={bilan.score} actif={actif} c={c} />
            <Etoiles n={bilan.etoiles} actif={actif} c={c} />
            <Text style={s.mention}>{bilan.mention}</Text>
            <View style={s.grille}>
              {chiffres.map(([v, l], i) => (
                <Chiffre
                  key={l}
                  valeur={v}
                  libelle={l}
                  delai={300 + i * 90}
                  actif={actif}
                  c={c}
                />
              ))}
            </View>
            <View style={s.criteres}>
              {bilan.criteres.map(k => (
                <View
                  key={k.cle}
                  style={s.critere}
                  accessibilityLabel={`${k.libelle} : ${k.points} sur ${k.sur}`}
                >
                  <Text style={s.critereLibelle}>{k.libelle}</Text>
                  <View style={s.barre}>
                    <View
                      style={[
                        s.barrePleine,
                        {
                          width: `${Math.round((100 * k.points) / k.sur)}%`,
                          backgroundColor:
                            k.points >= k.sur * 0.85
                              ? c.green
                              : k.points >= k.sur * 0.5
                              ? c.blue
                              : c.amber,
                        },
                      ]}
                    />
                  </View>
                  <Text style={s.criterePoints}>{`${k.points}/${k.sur}`}</Text>
                </View>
              ))}
            </View>
            {bilan.conseil && (
              <View style={s.conseil}>
                <Text style={s.conseilTitre}>Pour la prochaine fois</Text>
                <Text style={s.conseilTexte}>{bilan.conseil}</Text>
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voir en 3D"
              style={({ pressed }) => [s.cta, pressed && s.enfonce]}
              onPress={onVoir3D}
            >
              <Text style={s.ctaTexte}>Voir en 3D</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voir en réalité augmentée"
              style={({ pressed }) => [s.ctaRA, pressed && s.enfonce]}
              onPress={onRealiteAugmentee}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24">
                <Path
                  d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4zM4 7.4l8 4.6 8-4.6M12 12v9.2"
                  stroke={c.blue}
                  strokeWidth={1.9}
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
              <Text style={s.ctaRATexte}>Chez moi, en réalité augmentée</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continuer sur le plan"
              onPress={onFermer}
            >
              <Text style={s.continuer}>Continuer sur le plan</Text>
            </Pressable>
          </ScrollView>
          {/* Par-dessus le contenu : les cotillons tombent devant la carte. */}
          <Cotillons actif={bilan.etoiles >= 2} c={c} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const cache = new WeakMap<Palette, ReturnType<typeof creer>>();
const styles = (c: Palette) => {
  let s = cache.get(c);
  if (!s) {
    s = creer(c);
    cache.set(c, s);
  }
  return s;
};

const creer = (c: Palette) =>
  StyleSheet.create({
    voile: {
      flex: 1,
      backgroundColor: 'rgba(8, 10, 14, 0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
    },
    carte: {
      maxWidth: 440,
      maxHeight: '94%',
      width: '100%',
      alignSelf: 'center',
      backgroundColor: c.surface,
      borderRadius: 26,
      overflow: 'hidden',
    },
    contenu: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 14,
      alignItems: 'center',
      gap: 8,
    },
    cotillon: { position: 'absolute', top: -16, borderRadius: 2 },
    surtitre: {
      color: c.inkSoft,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    anneau: {
      width: 132,
      height: 132,
      alignItems: 'center',
      justifyContent: 'center',
    },
    anneauCentre: { position: 'absolute', alignItems: 'center' },
    anneauScore: {
      color: c.ink,
      fontSize: 38,
      fontWeight: '900',
      fontVariant: ['tabular-nums'],
    },
    anneauSur: {
      color: c.inkFaint,
      fontSize: 12,
      fontWeight: '700',
      marginTop: -4,
    },
    etoiles: { flexDirection: 'row', gap: 6, marginTop: -2 },
    mention: { color: c.ink, fontSize: 19, fontWeight: '800' },
    grille: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignSelf: 'stretch',
      marginTop: 2,
    },
    chiffre: { width: '33.33%', alignItems: 'center', paddingVertical: 6 },
    chiffreValeur: {
      color: c.ink,
      fontSize: 22,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    chiffreLibelle: { color: c.inkSoft, fontSize: 12, fontWeight: '600' },
    criteres: { alignSelf: 'stretch', gap: 6, marginTop: 2 },
    critere: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    critereLibelle: {
      width: 132,
      color: c.inkSoft,
      fontSize: 12.5,
      fontWeight: '600',
    },
    barre: {
      flex: 1,
      height: 7,
      borderRadius: 4,
      backgroundColor: c.surfaceSunken,
      overflow: 'hidden',
    },
    barrePleine: { height: 7, borderRadius: 4 },
    criterePoints: {
      width: 38,
      textAlign: 'right',
      color: c.inkFaint,
      fontSize: 12,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    conseil: {
      alignSelf: 'stretch',
      backgroundColor: c.blueSoft,
      borderRadius: 14,
      padding: 12,
      marginTop: 4,
      gap: 2,
    },
    conseilTitre: { color: c.blue, fontSize: 12, fontWeight: '800' },
    conseilTexte: { color: c.ink, fontSize: 13.5, lineHeight: 19 },
    cta: {
      alignSelf: 'stretch',
      height: 50,
      borderRadius: 15,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },
    ctaTexte: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    ctaRA: {
      alignSelf: 'stretch',
      height: 48,
      borderRadius: 15,
      backgroundColor: c.blueSoft,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    ctaRATexte: { color: c.blue, fontSize: 14.5, fontWeight: '800' },
    enfonce: { transform: [{ scale: 0.98 }] },
    continuer: {
      color: c.inkFaint,
      fontSize: 14,
      fontWeight: '600',
      padding: 8,
    },
  });

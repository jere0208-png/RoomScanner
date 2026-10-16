/**
 * LES DEUX GRANDES ICÔNES DU CHOIX D'USAGE — dessinées ici, animées en léger
 * relief.
 *
 * Demande du patron : « une belle fiche moderne au début pour le choix si on
 * veut l'élec ou pas, avec des grosses icônes que tu animes en JS légèrement
 * pour un effet 3D léger ».
 *
 * CHAQUE ICÔNE EST FAITE DE COUCHES (le fond, le sujet, le détail qui flotte).
 * Le relief vient de deux choses, toutes deux sur le pilote natif : la carte
 * pivote de quelques degrés en perspective (rotateX / rotateY déphasés, une
 * lente orbite), et les couches glissent chacune à leur profondeur — la plus
 * proche bouge le plus, comme une parallaxe. Rien ne tourne sur le fil JS.
 *
 * « RÉDUIRE LES ANIMATIONS » : l'icône reste immobile, bien posée.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useReduceMotion } from '../ui/useReduceMotion';

const TAILLE = 132;

/** L'orbite lente commune : une valeur qui tourne de 0 à 1, en boucle. */
function useOrbite(dephasage: number, immobile: boolean) {
  const t = useRef(new Animated.Value(dephasage)).current;
  useEffect(() => {
    if (immobile) {
      t.setValue(0.125);
      return;
    }
    t.setValue(dephasage);
    const boucle = Animated.loop(
      Animated.timing(t, {
        toValue: dephasage + 1,
        duration: 7000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    boucle.start();
    return () => boucle.stop();
  }, [t, dephasage, immobile]);
  return t;
}

/*
  Une sinusoïde approchée par interpolation (le pilote natif ne sait pas
  calculer un sinus) : huit points par tour suffisent à l'œil. La valeur
  court sur deux tours au plus (déphasage 0 ou 0,5, plus un tour).
*/
const PAS = Array.from({ length: 17 }, (_, i) => i / 8);
const SIN = PAS.map((x) => Math.sin(x * Math.PI * 2));
const COS = PAS.map((x) => Math.cos(x * Math.PI * 2));
const ondeN = (t: Animated.Value, base: number[], amplitude: number) =>
  t.interpolate({ inputRange: PAS, outputRange: base.map((v) => v * amplitude) });
const onde = (t: Animated.Value, base: number[], amplitude: number, unite: string) =>
  t.interpolate({ inputRange: PAS, outputRange: base.map((v) => `${(v * amplitude).toFixed(3)}${unite}`) });

/** Le relief : la carte qui pivote, et les couches qui glissent à leur profondeur. */
function Relief({ dephasage, couches }: { dephasage: number; couches: React.ReactNode[] }) {
  const immobile = useReduceMotion();
  const t = useOrbite(dephasage, immobile);
  const rotY = onde(t, SIN, 9, 'deg');
  const rotX = onde(t, COS, 6, 'deg');
  const flotte = ondeN(t, COS, 3);
  return (
    <Animated.View
      style={[
        styles.cadre,
        {
          transform: [{ perspective: 700 }, { rotateX: rotX }, { rotateY: rotY }, { translateY: flotte }],
        },
      ]}>
      {couches.map((c, i) => {
        // Plus la couche est haute, plus elle se déplace : la parallaxe.
        const k = i * 2.2;
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { transform: [{ translateX: ondeN(t, SIN, k) }, { translateY: ondeN(t, COS, -k * 0.7) }] },
            ]}>
            {c}
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

/* --------------------------------------------------------------- aménager */

/** Une pièce en isométrie : parquet, deux murs, un canapé, une cote qui flotte. */
export function IconeAmenager({ teinte, sombre }: { teinte: string; sombre: boolean }) {
  const mur = sombre ? '#2A3240' : '#FFFFFF';
  const murOmbre = sombre ? '#222935' : '#D9E0EA';
  const fond = (
    <Svg width={TAILLE} height={TAILLE} viewBox="12 10 108 108">
      <Defs>
        <LinearGradient id="parquet" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#E9C9A0" />
          <Stop offset="1" stopColor="#D6A877" />
        </LinearGradient>
      </Defs>
      {/* L'ombre portée, sous la pièce. */}
      <Ellipse cx="66" cy="112" rx="44" ry="8" fill="#000" opacity={sombre ? 0.35 : 0.1} />
      {/* Le sol. */}
      <Path d="M66 54 L112 78 L66 102 L20 78 Z" fill="url(#parquet)" />
      <Path d="M43 66 L89 90 M54 60 L100 84 M32 72 L78 96" stroke="#C99A69" strokeWidth={1} opacity={0.55} />
      {/* Les deux murs du fond. */}
      <Path d="M20 78 L20 40 L66 16 L66 54 Z" fill={murOmbre} />
      <Path d="M66 54 L66 16 L112 40 L112 78 Z" fill={mur} />
      {/* L'arase des murs : un liseré qui dessine le volume. */}
      <Path d="M20 40 L66 16 L112 40" fill="none" stroke={sombre ? '#3A4352' : '#C5CEDB'} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M66 16 L66 54" stroke={sombre ? '#3A4352' : '#C5CEDB'} strokeWidth={1} />
      {/* Une fenêtre. */}
      <Path d="M80 39 L98 48 L98 64 L80 55 Z" fill={teinte} opacity={0.28} />
      <Path d="M89 43.5 L89 59.5" stroke={mur} strokeWidth={1.4} />
    </Svg>
  );
  const sujet = (
    <Svg width={TAILLE} height={TAILLE} viewBox="12 10 108 108">
      {/* Le canapé : assise, dossier, accoudoirs. */}
      <Path d="M44 78 L66 89 L80 82 L58 71 Z" fill={teinte} />
      <Path d="M44 78 L44 84 L66 95 L66 89 Z" fill={teinte} opacity={0.75} />
      <Path d="M66 89 L66 95 L80 88 L80 82 Z" fill={teinte} opacity={0.55} />
      <Path d="M44 78 L44 70 L58 63 L58 71 Z" fill={teinte} opacity={0.85} />
      <Path d="M58 63 L80 74 L80 82 L58 71 Z" fill={teinte} opacity={0.92} />
      {/* Une plante. */}
      <Path d="M92 74 L97 76.5 L97 82 L92 79.5 Z" fill="#C97B4F" />
      <Circle cx="94.5" cy="69" r="6" fill="#4FA36B" />
      <Circle cx="98" cy="65" r="4" fill="#5DB97A" />
    </Svg>
  );
  const flottant = (
    <Svg width={TAILLE} height={TAILLE} viewBox="12 10 108 108">
      {/* La cote, le long du bord avant du sol : traits d'attache, ligne,
          et sa pastille — comme sur un vrai plan coté. */}
      <G opacity={0.95}>
        <Path d="M16 86 L60 109" stroke={teinte} strokeWidth={2.2} strokeLinecap="round" />
        <Path d="M20 80 L13 87.5 M66 104 L58 111" stroke={teinte} strokeWidth={2.2} strokeLinecap="round" />
        <Rect x="24" y="90.5" width="28" height="13" rx="6.5" fill={teinte} transform="rotate(27.6 38 97)" />
        <Path d="M31.5 93.6 L44.5 100.4" stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.9} />
      </G>
    </Svg>
  );
  return <Relief dephasage={0} couches={[fond, sujet, flottant]} />;
}

/* ------------------------------------------------------------- électricité */

/** Une plaque de prise en relief, un halo, un éclair qui flotte devant. */
export function IconeElec({ teinte, sombre }: { teinte: string; sombre: boolean }) {
  const plaque = sombre ? '#2A3240' : '#FFFFFF';
  const tranche = sombre ? '#1C222C' : '#E3E7EE';
  const fond = (
    <Svg width={TAILLE} height={TAILLE} viewBox="0 0 132 132">
      <Defs>
        <LinearGradient id="halo" x1="0.5" y1="0" x2="0.5" y2="1">
          <Stop offset="0" stopColor={teinte} stopOpacity={0.35} />
          <Stop offset="1" stopColor={teinte} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="66" cy="112" rx="38" ry="7" fill="#000" opacity={sombre ? 0.35 : 0.1} />
      <Circle cx="66" cy="60" r="50" fill="url(#halo)" />
    </Svg>
  );
  const sujet = (
    <Svg width={TAILLE} height={TAILLE} viewBox="0 0 132 132">
      {/* La tranche de la plaque, puis sa face : le relief. */}
      <Rect x="31" y="30" width="70" height="70" rx="18" fill={tranche} />
      <Rect x="31" y="25" width="70" height="70" rx="18" fill={plaque} />
      <Circle cx="66" cy="60" r="24" fill={sombre ? '#1C222C' : '#F1F3F7'} />
      <Circle cx="66" cy="60" r="24" fill="none" stroke={sombre ? '#3A4352' : '#E1E5EC'} strokeWidth={1.5} />
      {/* Les deux alvéoles et la terre. */}
      <Circle cx="57" cy="60" r="4" fill={sombre ? '#0D1015' : '#1B2230'} />
      <Circle cx="75" cy="60" r="4" fill={sombre ? '#0D1015' : '#1B2230'} />
      <Rect x="63.5" y="44" width="5" height="7" rx="2" fill={sombre ? '#55606F' : '#B9C0CC'} />
    </Svg>
  );
  const flottant = (
    <Svg width={TAILLE} height={TAILLE} viewBox="0 0 132 132">
      {/* L'éclair, devant la plaque, avec son liseré clair. */}
      <Path
        d="M93 6 L74 40 L88 40 L78 70 L104 30 L89 30 L99 6 Z"
        fill={teinte}
        stroke={sombre ? '#0D1015' : '#FFFFFF'}
        strokeWidth={3}
        strokeLinejoin="round"
      />
    </Svg>
  );
  return <Relief dephasage={0.5} couches={[fond, sujet, flottant]} />;
}

const styles = StyleSheet.create({
  cadre: { width: TAILLE, height: TAILLE, alignItems: 'center', justifyContent: 'center' },
});

/** Pour le banc : la taille d'une icône. */
export const TAILLE_ICONE_USAGE = TAILLE;

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme';

/**
 * Le logo EchoPlan : des ondes d'écho, de plus en plus nettes, dont la
 * dernière se cristallise en angle de murs (le plan).
 *
 * LE GLYPHE SEUL, SANS SON ÉCRIN — relevé du patron : « sur la page
 * d'accueil, la première image (icône de l'app) est trop visible. Récupère
 * que ce qui est dedans (l'angle et les 3 traits d'écho), supprime le fond
 * blanc, et incruste-le dans le fond en faible opacité. Pas de contour
 * rien. »
 *
 * Il portait son fond blanc et son liseré : une icône d'application, posée
 * en haut de l'accueil, au-dessus du logotype. Deux fois la même marque
 * l'une sur l'autre, et la plus bavarde des deux — un badge — passait
 * devant celle qui porte le NOM. Le glyphe reste, l'écrin s'en va : c'est
 * une incrustation, pas une image.
 */
/**
 * Le glyphe remplit son bloc comme sur l'icône du téléphone : même
 * agrandissement (`ZOOM` de tools/gen-icons.mjs), même recentrage — la boîte
 * des tracés (x 22,5–55,5 · y 20,5–53,5, centre (39, 37)) se recale sur le
 * centre du bloc. Sans lui, l'accueil montrait un glyphe de timbre-poste au
 * milieu d'un grand bloc blanc, à côté d'une icône qui le porte plein cadre.
 */
const ZOOM = 1.45;
const X = (x: number) => +(38 + (x - 39) * ZOOM).toFixed(2);
const Y = (y: number) => +(38 + (y - 37) * ZOOM).toFixed(2);
const R = (r: number) => +(r * ZOOM).toFixed(2);

export function LogoMark({
  size = 76,
  /**
   * L'encre du glyphe. Par défaut celle du thème : incrusté dans le fond,
   * il doit rester lisible en sombre comme en clair — un noir en dur y
   * disparaîtrait.
   */
  teinte,
  /** Son retrait. À 1, c'est la marque ; en dessous, c'est un filigrane. */
  opacite = 1,
}: {
  size?: number;
  teinte?: string;
  opacite?: number;
}) {
  const c = useTheme();
  const ink = teinte ?? c.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 76 76" opacity={opacite}>
      {/* Deux ondes d'écho, balayage symétrique autour de la diagonale :
          le radar vise exactement l'angle des murs. */}
      <Path
        d={`M${X(25.96)} ${Y(40.04)} A${R(11)} ${R(11)} 0 0 1 ${X(35.96)} ${Y(50.04)}`}
        stroke={ink}
        strokeWidth={R(4.5)}
        strokeLinecap="round"
        fill="none"
        opacity={0.7}
      />
      <Path
        d={`M${X(26.66)} ${Y(32.07)} A${R(19)} ${R(19)} 0 0 1 ${X(43.93)} ${Y(49.34)}`}
        stroke={ink}
        strokeWidth={R(4.5)}
        strokeLinecap="round"
        fill="none"
        opacity={0.9}
      />
      {/* La dernière onde devient un angle de murs : le plan */}
      <Path
        d={`M${X(25)} ${Y(23)} H${X(53)} V${Y(51)}`}
        stroke={ink}
        strokeWidth={R(5)}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** Les trois tracés du glyphe, dans le repère 76 × 76 du dessin. */
const ONDE_COURTE = `M${X(25.96)} ${Y(40.04)} A${R(11)} ${R(11)} 0 0 1 ${X(35.96)} ${Y(50.04)}`;
const ONDE_LONGUE = `M${X(26.66)} ${Y(32.07)} A${R(19)} ${R(19)} 0 0 1 ${X(43.93)} ${Y(49.34)}`;
const ANGLE = `M${X(25)} ${Y(23)} H${X(53)} V${Y(51)}`;

const COUCHE = { position: 'absolute', top: 0, left: 0 } as const;

/** La durée d'un écho : l'émission, le retour, puis le silence. */
export const DUREE_ECHO = 2600;

/*
  CE QUE FAIT CHAQUE TRACÉ AU COURS D'UN ÉCHO — en fraction du cycle.
  L'onde courte part la première, la longue la suit, et l'angle des murs
  s'éclaire au moment où l'onde l'atteint : le mur est « détecté ». Puis
  tout retombe, et le silence avant l'écho suivant fait partie du geste.
*/
export const COURBES_ECHO = {
  courte: { entree: [0, 0.1, 0.42, 1], sortie: [0.18, 1, 0.18, 0.18] },
  longue: { entree: [0, 0.1, 0.24, 0.56, 1], sortie: [0.18, 0.18, 1, 0.18, 0.18] },
  angle: { entree: [0, 0.26, 0.34, 0.78, 1], sortie: [0.4, 0.4, 1, 0.42, 0.4] },
} as const;

/**
 * LE GLYPHE QUI ÉCOUTE — relevé du patron : « une animation des deux vagues
 * du logo qui varient en intensité comme un écho, et les traits rectilignes
 * agissent en fonction, comme si c'était un mur détecté ».
 *
 * Chaque tracé vit dans sa propre couche, et ce sont les COUCHES dont
 * l'opacité varie : une opacité de vue s'anime au pilote natif, une
 * propriété de tracé SVG non. Une seule horloge mène les trois — ils ne
 * peuvent pas se désaccorder.
 */
export function LogoEcho({
  size = 34,
  teinte,
  anime = true,
}: {
  size?: number;
  teinte?: string;
  /** Faux : le glyphe au repos, plein (les bancs, la réduction des animations). */
  anime?: boolean;
}) {
  const c = useTheme();
  const ink = teinte ?? c.ink;
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!anime) return;
    const boucle = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: DUREE_ECHO, easing: Easing.linear, useNativeDriver: true }),
    );
    boucle.start();
    return () => boucle.stop();
  }, [anime, t]);
  const couche = (cle: keyof typeof COURBES_ECHO, d: string, largeur: number) => (
    <Animated.View
      key={cle}
      testID={`echo-${cle}`}
      style={[
        COUCHE,
        { width: size, height: size },
        anime
          ? {
              opacity: t.interpolate({
                inputRange: COURBES_ECHO[cle].entree as unknown as number[],
                outputRange: COURBES_ECHO[cle].sortie as unknown as number[],
              }),
            }
          : null,
      ]}>
      <Svg width={size} height={size} viewBox="0 0 76 76">
        <Path
          d={d}
          stroke={ink}
          strokeWidth={largeur}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
  return (
    <View style={{ width: size, height: size }} accessibilityLabel="EchoPlan">
      {couche('courte', ONDE_COURTE, R(4.5))}
      {couche('longue', ONDE_LONGUE, R(4.5))}
      {couche('angle', ANGLE, R(5))}
    </View>
  );
}

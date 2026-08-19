import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme';

/**
 * Le logo EchoPlan : des ondes d'écho, de plus en plus nettes, dont la
 * dernière se cristallise en angle de murs (le plan).
 * Fond blanc, glyphe noir — dans les deux thèmes.
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

export function LogoMark({ size = 76 }: { size?: number }) {
  const c = useTheme();
  const ink = '#0B0D12';
  return (
    <Svg width={size} height={size} viewBox="0 0 76 76">
      <Rect
        x={0.5}
        y={0.5}
        width={75}
        height={75}
        rx={20}
        fill="#FFFFFF"
        stroke={c.line}
        strokeWidth={1}
      />
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

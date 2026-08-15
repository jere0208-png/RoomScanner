import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme';

/**
 * Le logo EchoPlan : des ondes d'écho, de plus en plus nettes, dont la
 * dernière se cristallise en angle de murs (le plan).
 * Fond blanc, glyphe noir — dans les deux thèmes.
 */
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
        d="M25.96 40.04 A11 11 0 0 1 35.96 50.04"
        stroke={ink}
        strokeWidth={4.5}
        strokeLinecap="round"
        fill="none"
        opacity={0.7}
      />
      <Path
        d="M26.66 32.07 A19 19 0 0 1 43.93 49.34"
        stroke={ink}
        strokeWidth={4.5}
        strokeLinecap="round"
        fill="none"
        opacity={0.9}
      />
      {/* La dernière onde devient un angle de murs : le plan */}
      <Path
        d="M25 23 H53 V51"
        stroke={ink}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/**
 * LA PASTILLE D'UNE NATURE DE MUR — un tronçon de mur, dessiné comme sur le
 * plan : noir plein, gris cerné, boucles de l'isolant, jaune, rouge.
 *
 * On choisit ce qu'on VOIT : le menu « Nature du mur » montre le rendu que le
 * plan prendra, pas seulement son nom (voir `natureMurs`).
 */
import React from 'react';
import Svg, { Polyline, Rect } from 'react-native-svg';
import { useTheme } from '../theme';
import { bouclesDuDoublage, renduNature, type NatureMur } from '../geometry/natureMurs';

const L = 36;
const H = 12;

export function PastilleNature({ nature }: { nature: NatureMur }) {
  const c = useTheme();
  const r = renduNature(nature, c.ink, c.surface);
  // Les boucles d'un doublage de 12 cm sur 36 : les mêmes qu'au plan, à l'échelle 1 px = 1 cm.
  const boucles =
    nature === 'doublage'
      ? bouclesDuDoublage({ a1: { x: 0, z: 0 }, b1: { x: L, z: 0 }, b2: { x: L, z: H }, a2: { x: 0, z: H } } as never)
      : null;
  return (
    <Svg width={L + 2} height={H + 2} viewBox={`-1 -1 ${L + 2} ${H + 2}`}>
      <Rect
        x={0}
        y={0}
        width={L}
        height={H}
        fill={r.fond}
        stroke={nature === 'porteur' ? 'none' : r.contour}
        strokeWidth={1}
        strokeDasharray={r.tirets ? [4, 2] : undefined}
      />
      {boucles ? (
        <Polyline points={boucles.map((p) => `${p.x},${p.z}`).join(' ')} fill="none" stroke={r.contour} strokeWidth={0.7} />
      ) : null}
    </Svg>
  );
}

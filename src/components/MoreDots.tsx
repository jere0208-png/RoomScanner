/**
 * Les trois points — le pendant de la croix, pour toute l'app.
 *
 * Même raison d'être que `CloseCross` : le caractère « ⋯ » se pose sur une
 * ligne de base et tombe deux pixels trop haut dans son rond, d'une police
 * système à l'autre. Trois ronds en SVG sont centrés par construction, et
 * leur taille se décide.
 *
 * Ce glyphe dit « il y a plus à faire ici », là où la croix dit « ça
 * disparaît ». Les confondre coûte cher : la croix d'une ligne de la
 * bibliothèque supprimait un relevé de visite, à portée d'un doigt qui
 * glisse.
 */
import React from 'react';
import Svg, { Circle } from 'react-native-svg';

export function MoreDots({
  size = 22,
  color,
  /** Rayon d'un point, en unités de la boîte 24×24. */
  dot = 2,
  /** Écart entre deux centres, en unités de la boîte. */
  gap = 6.5,
}: {
  size?: number;
  color: string;
  dot?: number;
  gap?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {[-gap, 0, gap].map((d) => (
        <Circle key={d} cx={12 + d} cy={12} r={dot} fill={color} />
      ))}
    </Svg>
  );
}

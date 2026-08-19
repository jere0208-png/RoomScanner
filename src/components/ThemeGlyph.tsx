/**
 * Le soleil et la lune du bouton de thème — tracés, plus caractères.
 *
 * Ils s'écrivaient « ☀ » et « ☾ ». Sur iOS, la police système rend le
 * premier en EMOJI COULEUR : un soleil jaune, ombré, avec son relief — au
 * milieu d'une interface qui n'a pas une seule autre couleur à cet endroit,
 * et dont tous les autres pictogrammes sont des traits gris. Le bouton
 * paraissait collé là par erreur.
 *
 * Un caractère ne se règle ni en couleur (l'emoji ignore `color`), ni en
 * graisse, ni en centrage : c'est la même leçon que la croix de fermeture et
 * le chevron de retour, et c'est la troisième fois qu'elle se paie. Deux
 * tracés la referment.
 */
import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

export function ThemeGlyph({
  /** `soleil` = passer en clair, `lune` = passer en sombre. */
  quoi,
  size = 21,
  color,
}: {
  quoi: 'soleil' | 'lune';
  size?: number;
  color: string;
}) {
  if (quoi === 'lune') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {/*
          Le croissant est un SEUL contour, pas un disque mordu par un autre :
          deux formes superposées demanderaient de connaître la couleur du
          fond, qui change justement avec le thème.
        */}
        <Path
          d="M20 14.5 A8.5 8.5 0 1 1 9.5 4 A7 7 0 0 0 20 14.5 z"
          fill={color}
        />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={4.6} fill={color} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
        const r = (a * Math.PI) / 180;
        const x = 12 + Math.cos(r);
        const y = 12 + Math.sin(r);
        return (
          <Path
            key={a}
            d={`M${(x + Math.cos(r) * 6.4).toFixed(2)} ${(y + Math.sin(r) * 6.4).toFixed(2)} L${(x + Math.cos(r) * 9).toFixed(2)} ${(y + Math.sin(r) * 9).toFixed(2)}`}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}
    </Svg>
  );
}

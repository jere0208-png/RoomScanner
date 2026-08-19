/**
 * Le chevron de retour — un tracé, plus un caractère.
 *
 * Il s'écrivait au clavier : « ‹ ». Même piège que la croix de fermeture,
 * et il se voyait à un endroit précis — l'en-tête d'un scan, où le bouton
 * de retour côtoie le partage et le « … ». Ces deux-là sont des icônes
 * vectorielles, centrées dans leur rond par construction ; le chevron, lui,
 * se pose sur une LIGNE DE BASE. Il tombait donc trop bas, on l'avait
 * remonté de trois points à la main, et ce réglage empirique ne vaut que
 * pour une police et une taille : d'un iPhone à l'autre, le retour paraît
 * désaligné de ses voisins.
 *
 * Deux segments réglent la question pour de bon — centrés dans leur boîte,
 * épais de ce qu'on décide, terminés en rond comme le reste du jeu.
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';

export function BackChevron({
  size = 22,
  color,
  weight = 2.4,
}: {
  size?: number;
  color: string;
  weight?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M14.5 5.5 L8 12 l6.5 6.5"
        stroke={color}
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/**
 * La croix de fermeture — une seule, pour toute l'app.
 *
 * Elle était écrite au clavier : le caractère « ✕ ». Ça paraît suffisant, et
 * ça ne l'est pas. Un glyphe se pose sur une LIGNE DE BASE, pas au centre de
 * sa boîte : dans un rond de 30 px, il tombe systématiquement deux ou trois
 * pixels trop haut, décalé à gauche, et le décalage change avec la police du
 * système — donc entre deux iPhone. Sa graisse, elle, ne se règle pas du
 * tout : `fontWeight` n'épaissit que ce que la police prévoit, et les polices
 * système dessinent cette croix maigre.
 *
 * Deux traits en SVG règlent les trois problèmes d'un coup : centrés dans
 * leur boîte par construction, épais de ce qu'on décide, terminés en rond
 * comme toutes les autres icônes de l'app. Une croix reconnaissable, la même
 * partout — c'est le bouton qu'on vise le plus souvent, il mérite d'exister.
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';

export function CloseCross({
  size = 30,
  color,
  /** Épaisseur du trait, en unités de la boîte 24×24. */
  weight = 3,
  /** Longueur des branches, en unités de la boîte : 10 = croix pleine. */
  reach = 9.5,
}: {
  size?: number;
  color: string;
  weight?: number;
  reach?: number;
}) {
  const a = 12 - reach / 2;
  const b = 12 + reach / 2;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={`M${a} ${a} L${b} ${b}`}
        stroke={color}
        strokeWidth={weight}
        strokeLinecap="round"
      />
      <Path
        d={`M${b} ${a} L${a} ${b}`}
        stroke={color}
        strokeWidth={weight}
        strokeLinecap="round"
      />
    </Svg>
  );
}

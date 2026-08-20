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
import Svg, { Path } from 'react-native-svg';
import { SOLAIRES } from '../ui/solaires';

/**
 * Depuis la refonte Solar, la lune et le soleil viennent du MÊME jeu que
 * tout le reste (fiches SVGRepo 526045 et 526341, désignées par le
 * patron) : deux silhouettes pleines, régénérées par l'outil comme les
 * autres — le dessin maison n'avait plus de raison de faire bande à part.
 */
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
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={quoi === 'lune' ? SOLAIRES.lune : SOLAIRES.soleil}
        fill={color}
        fillRule="evenodd"
      />
    </Svg>
  );
}

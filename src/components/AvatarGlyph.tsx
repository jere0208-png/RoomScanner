/**
 * L'AVATAR DE L'ACCUEIL — la fiche, pas le portrait.
 *
 * Relevé du patron, deux liens en deux temps. D'abord un « user-circle »
 * duotone de Phosphor : un rond qui respire, là où la silhouette pleine
 * faisait une tache. Puis, la chose vue sur l'appareil :
 * `svgrepo.com/svg/334969/user-detail`, « au lieu de l'avatar ».
 *
 * Et c'est plus juste. Ce bouton n'ouvre pas un portrait : il ouvre le
 * COMPTE — l'abonnement, l'apparence, les réglages. Une silhouette suivie de
 * ses trois lignes dit exactement cela : quelqu'un, et ce qu'on sait de lui.
 * Un rond de profil promettait une photo qui n'existe pas.
 *
 * C'est un tracé de BOXICONS SOLID (MIT), recopié du dépôt d'origine sans
 * retouche : un chemin réécrit à la main dérive au premier caractère oublié,
 * et personne ne le voit avant l'écran. Le reste de l'app est en Solar Bold ;
 * l'avatar reste l'exception, comme il l'était déjà.
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';

/** bxs:user-detail — la silhouette, et les trois lignes de sa fiche. */
const FICHE =
  'M15 11h7v2h-7zm1 4h6v2h-6zm-2-8h8v2h-8zM4 19h10v-1c0-2.757-2.243-5-5-5H7c-2.757 0-5 2.243-5 5v1zm4-7c1.995 0 3.5-1.505 3.5-3.5S9.995 5 8 5S4.5 6.505 4.5 8.5S6.005 12 8 12';

export function AvatarGlyph({
  size = 34,
  teinte,
}: {
  size?: number;
  teinte: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      <Path d={FICHE} fill={teinte} fillRule="evenodd" />
    </Svg>
  );
}

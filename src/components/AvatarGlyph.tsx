/**
 * L'AVATAR DE L'ACCUEIL — relevé du patron, lien à l'appui :
 * `svgrepo.com/svg/364064/user-circle-minus-duotone`, « utilise cette icône
 * pour l'avatar à l'accueil et enlève le contour présent ».
 *
 * C'est un « user-circle » de la collection PHOSPHOR ICONS (MIT), en
 * variante DUOTONE : un aplat en retrait pour le corps du rond, un tracé
 * plein par-dessus. Le reste de l'app est en Solar Bold — une silhouette
 * pleine, sans contour ; celle-ci est la seule exception, et c'est voulu :
 * l'avatar n'est pas un outil, c'est une porte vers le compte, et un rond
 * qui respire s'y lit mieux qu'une tache noire.
 *
 * Les deux tracés viennent du dépôt d'origine (`phosphor-icons/core`,
 * assets/duotone), sans retouche : un chemin recopié à la main dérive au
 * premier caractère oublié, et personne ne le voit avant l'écran.
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';

/** L'aplat du fond : le rond, en retrait. */
const FOND =
  'M224,128a95.76,95.76,0,0,1-31.8,71.37A72,72,0,0,0,128,160a40,40,0,1,0-40-40,40,40,0,0,0,40,40,72,72,0,0,0-64.2,39.37h0A96,96,0,1,1,224,128Z';
/** Le tracé plein : le cercle ouvert, la tête, les épaules, et la barre. */
const TRAIT =
  'M168,56a8,8,0,0,1,8-8h48a8,8,0,0,1,0,16H176A8,8,0,0,1,168,56Zm58.08,37.33a103.93,103.93,0,1,1-80.76-67.89,8,8,0,0,1-2.64,15.78A88.07,88.07,0,0,0,40,128a87.62,87.62,0,0,0,22.24,58.41A79.66,79.66,0,0,1,98.3,157.66a48,48,0,1,1,59.4,0,79.66,79.66,0,0,1,36.06,28.75A88,88,0,0,0,211,98.67a8,8,0,0,1,15.09-5.34ZM128,152a32,32,0,1,0-32-32A32,32,0,0,0,128,152Zm0,64a87.57,87.57,0,0,0,53.92-18.5,64,64,0,0,0-107.84,0A87.57,87.57,0,0,0,128,216Z';

export function AvatarGlyph({
  size = 34,
  teinte,
}: {
  size?: number;
  teinte: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" pointerEvents="none">
      {/* Le duotone tient à cette opacité : sans elle, les deux tracés se
          confondent en une tache et l'icône perd son air. */}
      <Path d={FOND} fill={teinte} opacity={0.2} />
      <Path d={TRAIT} fill={teinte} />
    </Svg>
  );
}

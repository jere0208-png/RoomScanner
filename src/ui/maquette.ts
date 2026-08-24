/**
 * LA PALETTE DE LA MAQUETTE 3D — celle d'un plan d'architecte, pas d'un
 * logiciel de CAO.
 *
 * Relevé du patron, image de référence à l'appui : « j'aimerais que le rendu
 * d'un plan 3D soit tel quel, fais en sorte d'avoir le même réalisme en
 * optimisant la fluidité ».
 *
 * L'image qu'il montre est une maquette de présentation : crème, sable,
 * blanc cassé, et des touches d'ambre sur ce qui se pose — lits, canapés,
 * fauteuils. Notre rendu, lui, était BLEU-GRIS et cerné de traits foncés :
 * la palette d'un écran technique, pas celle d'une maquette qu'on montre à
 * un client.
 *
 * TOUT LE GAIN EST DANS LA COULEUR, ET IL NE COÛTE RIEN. Le moteur savait
 * déjà l'essentiel — l'ombrage par orientation de face (`shadeFill`), les
 * deux nappes d'ombre au pied des meubles, le tri en profondeur. Rien de
 * tout cela n'a été ajouté : c'est la palette qui les rendait invisibles.
 * Un dégradé par face, une ombre floutée, une occlusion calculée auraient
 * coûté un nœud de plus par face — et le relevé demande justement
 * l'inverse : « en optimisant la fluidité ».
 *
 * TROIS CHOIX, ET LEUR RAISON :
 *
 *   — les TRAITS s'effacent. Ils étaient d'un bleu-gris franc, et c'est ce
 *     qui donnait l'air « dessin technique » : sur une maquette, une arête
 *     est une couture, pas un trait d'encre. Ils restent — sans eux, deux
 *     pans de même teinte se confondent — mais à peine plus foncés que ce
 *     qu'ils bordent ;
 *   — l'OMBRE se réchauffe. Le côté sombre d'un mur tirait sur le bleu ;
 *     dans une pièce éclairée par le jour, il tire sur le brun ;
 *   — les MEUBLES MOELLEUX prennent l'ambre. C'est la signature de ce
 *     style : le bâti est neutre, et ce qu'on POSE dedans porte la couleur.
 *     Elle sert aussi à lire le plan — on repère un lit d'un coup d'œil,
 *     là où quinze volumes gris se ressemblent tous.
 */
import type { ScenePalette } from '../geometry/scene3d';

export const MAQUETTE: ScenePalette = {
  /* Le sol : un sable clair, pas un gris d'écran. */
  floor: '#EDE4D6',
  floorStroke: '#DCD1BF',
  /* Le bâti : blanc CASSÉ. Un blanc pur à côté d'un sable paraît bleu. */
  wall: '#FFFCF6',
  wallStroke: '#E0D6C5',
  /* L'arase des murs, vue de dessus : c'est elle qui reçoit le plus de
     lumière, elle est donc la plus claire des trois. */
  wallTop: '#F7F1E6',
  wallTopStroke: '#DCD2C0',
  opening: '#CDC3B2',
  /* Les menuiseries gardent leurs teintes : elles ne décorent pas, elles
     DÉSIGNENT — une porte, une fenêtre, un passage libre. */
  door: '#E8A13B',
  window: '#3EB8E5',
  passage: '#2F6BFF',
  object: '#E7DCC8',
  objectTop: '#F2EADB',
  objectStroke: '#CDC1AC',
};

/**
 * L'AMBRE DU MOBILIER MOELLEUX.
 *
 * Lits, canapés, fauteuils : ce qui accueille le corps. Sur la maquette du
 * patron, ce sont les seules taches de couleur — le reste est neutre.
 */
export const AMBRE_MEUBLE = '#EFC978';

/**
 * CE QUI PORTE L'AMBRE.
 *
 * La liste est courte et volontairement fermée : un tapis, une table ou un
 * placard restent neutres. Si tout portait la couleur, elle ne dirait plus
 * rien — c'est le contraste qui fait lire le plan.
 */
export const MEUBLE_MOELLEUX = /bed|sofa|couch|armchair|chair|stool/i;

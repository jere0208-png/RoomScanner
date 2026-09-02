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
import { roomUse } from '../geometry/nfc15100';

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
 * LA MAQUETTE À LA TOMBÉE DU JOUR — pour qu'on VOIE les lumières s'allumer.
 *
 * L'application savait déjà quoi allume quoi, tenait l'état des lampes
 * allumées et posait leurs halos. Mais en plein jour, un halo ambre sur un
 * sol crème ne se voit pas : on touchait un interrupteur, et « il ne se
 * passait rien ». Le crépuscule n'ajoute donc aucune fonction — il crée la
 * CONDITION pour que celles d'avant se voient enfin.
 *
 * ON DESCEND LA LUMIÈRE, ON GARDE LA TEINTE. Un crépuscule qui vire au
 * bleu-gris refait l'écran technique que la maquette a justement fui : le
 * sable devient une pénombre de sable, le blanc cassé une paroi sourde. La
 * conversion passe donc par la LUMINOSITÉ de chaque canal, pondérée pour
 * garder la chaleur — et les menuiseries n'y touchent pas : une porte et
 * une fenêtre DÉSIGNENT, elles ne sont pas de la matière qu'on éteint.
 *
 * La fonction est PURE : deux appels donnent la même nuit. Un rendu qui la
 * recalcule ne s'enfonce pas dans le noir à chaque image.
 */
export function crepuscule(pal: ScenePalette): ScenePalette {
  const eteindre = (hex: string, garde = 0.24): string => {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    // Un fond de nuit très légèrement bleuté sous une teinte gardée chaude :
    // c'est la lumière du soir, pas un filtre gris.
    const melange = (v: number, fond: number) =>
      Math.round(Math.max(0, Math.min(255, v * garde + fond)));
    const hex2 = (v: number) => v.toString(16).padStart(2, '0');
    return `#${hex2(melange(r, 16))}${hex2(melange(g, 15))}${hex2(melange(b, 20))}`;
  };
  return {
    ...pal,
    floor: eteindre(pal.floor),
    floorStroke: eteindre(pal.floorStroke, 0.2),
    wall: eteindre(pal.wall),
    wallStroke: eteindre(pal.wallStroke, 0.2),
    wallTop: eteindre(pal.wallTop, 0.28),
    wallTopStroke: eteindre(pal.wallTopStroke, 0.2),
    opening: eteindre(pal.opening),
    object: eteindre(pal.object),
    objectTop: eteindre(pal.objectTop, 0.28),
    objectStroke: eteindre(pal.objectStroke, 0.2),
  };
}

/**
 * L'ÉCLAT D'UNE LAMPE ALLUMÉE — deux jeux, selon l'heure.
 *
 * De jour, un halo doit se deviner sans manger la maquette : on reste
 * discret. De NUIT, c'est l'inverse — la lampe est la seule chose qui
 * éclaire, et un halo timide dans une pénombre se lit comme une panne. Les
 * bornes vivent ici, à côté de la palette qu'elles accompagnent, pour être
 * mesurables : le banc vérifie que la nuit éclaire PLUS que le jour, ce
 * qu'une paire de nombres perdus dans un rendu ne garantirait pas.
 */
export const ECLAT_LAMPE = {
  jour: { nappe: [0.28, 0.5] as [number, number], coeur: [0.55, 0.8] as [number, number] },
  nuit: { nappe: [0.5, 0.78] as [number, number], coeur: [0.8, 0.98] as [number, number] },
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

/**
 * LA MATIÈRE DU SOL, D'APRÈS L'USAGE DE LA PIÈCE — relevé du patron :
 * « revoir aussi le sol et murs pour un réalisme profond ». Carrelage dans
 * les pièces d'eau et la cuisine, parquet partout ailleurs : la règle des
 * logements français, et celle qu'on lit d'un coup d'œil sur la maquette.
 * L'usage vient du NOM de la pièce — la même lecture que le contrôle
 * NF C 15-100, pour que la maquette et la norme parlent du même logement.
 */
export function matieresDesSols(
  pieces: { id: string; name?: string | null; kind?: string | null }[],
): Record<string, 'parquet' | 'carrelage'> {
  const out: Record<string, 'parquet' | 'carrelage'> = {};
  for (const p of pieces) {
    const usage = roomUse(p.name ?? '', p.kind as never);
    out[p.id] =
      usage === 'cuisine' || usage === 'sdb' || usage === 'wc'
        ? 'carrelage'
        : 'parquet';
  }
  return out;
}

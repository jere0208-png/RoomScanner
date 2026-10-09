/**
 * LE FILM « COMMENT ÇA MARCHE » — ses chapitres, et ce que le scan trace.
 *
 * Relevé du patron : « les tutos de comment ça marche sont mal faits : un
 * tutoriel réaliste, sous forme de vidéo en motion design, fluide et rapide,
 * avec une coupure entre chaque étape et un bouton « Suivant » qui apparaît
 * et débloque la suite. Pas de design fait rapidement pour la présentation
 * des plans. »
 *
 * Les images du film sont des RENDUS de l'appartement d'exemple
 * (`data/exemple`) — ses murs, son parquet, ses meubles à leurs cotes
 * (`geometry/modeles3d`) —, et le plan est tracé avec la géométrie de l'app :
 * le film montre ce que l'app fait, pas une illustration.
 */

export type SorteDArete = 'sol' | 'angle' | 'plafond' | 'baie' | 'meuble';

/**
 * LES ARÊTES QUE LE SCAN TRACE sur la vue de la pièce (`assets/film/piece.jpg`),
 * en fractions de l'image (0 à 1). Elles sont PROJETÉES par la caméra même du
 * rendu : chaque trait tombe pile sur le mur, la baie ou le meuble qu'il relève.
 */
export const ARETES_DU_SCAN: { a: [number, number]; b: [number, number]; sorte: SorteDArete }[] = [
  { a: [-0.02, 0.6516], b: [0.3151, 0.5825], sorte: 'sol' },
  { a: [0.3151, 0.5825], b: [0.4422, 0.5563], sorte: 'sol' },
  { a: [1.02, 0.6088], b: [0.4422, 0.5563], sorte: 'sol' },
  { a: [0.3152, 0.5841], b: [0.288, 0.1152], sorte: 'angle' },
  { a: [-0.02, 0.0673], b: [0.288, 0.1152], sorte: 'plafond' },
  { a: [0.288, 0.1152], b: [0.4347, 0.138], sorte: 'plafond' },
  { a: [1.02, 0.0975], b: [0.4347, 0.138], sorte: 'plafond' },
  { a: [-0.02, 0.1859], b: [0.2173, 0.2053], sorte: 'baie' },
  { a: [-0.0087, 0.6513], b: [0.2485, 0.598], sorte: 'baie' },
  { a: [-0.0087, 0.6513], b: [-0.02, 0.5821], sorte: 'baie' },
  { a: [0.2485, 0.598], b: [0.2173, 0.2053], sorte: 'baie' },
  { a: [0.5579, 0.5683], b: [0.5645, 0.2072], sorte: 'baie' },
  { a: [1.02, 0.6106], b: [0.5579, 0.5683], sorte: 'baie' },
  { a: [1.02, 0.1887], b: [0.5645, 0.2072], sorte: 'baie' },
  { a: [-0.02, 0.6645], b: [0.1699, 0.6238], sorte: 'meuble' },
  { a: [-0.02, 0.486], b: [0.1536, 0.468], sorte: 'meuble' },
  { a: [-0.02, 0.7956], b: [0.3511, 0.686], sorte: 'meuble' },
  { a: [-0.02, 0.6621], b: [0.3462, 0.5842], sorte: 'meuble' },
  { a: [0.1536, 0.468], b: [0.4853, 0.4893], sorte: 'meuble' },
  { a: [0.1699, 0.6238], b: [0.4861, 0.6649], sorte: 'meuble' },
  { a: [0.1699, 0.6238], b: [0.1536, 0.468], sorte: 'meuble' },
  { a: [0.245, 0.7936], b: [-0.02, 0.7415], sorte: 'meuble' },
  { a: [0.2593, 0.9593], b: [-0.02, 0.8858], sorte: 'meuble' },
  { a: [0.2593, 0.9593], b: [0.245, 0.7936], sorte: 'meuble' },
  { a: [0.3462, 0.5842], b: [0.7262, 0.6243], sorte: 'meuble' },
  { a: [0.3511, 0.686], b: [0.7179, 0.7394], sorte: 'meuble' },
  { a: [0.3511, 0.686], b: [0.3462, 0.5842], sorte: 'meuble' },
  { a: [0.4853, 0.4893], b: [-0.02, 0.567], sorte: 'meuble' },
  { a: [0.4861, 0.6649], b: [-0.02, 0.823], sorte: 'meuble' },
  { a: [0.4861, 0.6649], b: [0.4853, 0.4893], sorte: 'meuble' },
  { a: [0.7179, 0.7394], b: [0.2593, 0.9593], sorte: 'meuble' },
  { a: [0.7179, 0.7394], b: [0.7262, 0.6243], sorte: 'meuble' },
  { a: [0.7262, 0.6243], b: [0.245, 0.7936], sorte: 'meuble' },
  { a: [0.738, 0.6883], b: [0.8911, 0.6223], sorte: 'meuble' },
  { a: [0.738, 0.6883], b: [0.7554, 0.4639], sorte: 'meuble' },
  { a: [0.7554, 0.4639], b: [0.9142, 0.4364], sorte: 'meuble' },
  { a: [0.8911, 0.6223], b: [1.02, 0.6351], sorte: 'meuble' },
  { a: [0.8911, 0.6223], b: [0.9142, 0.4364], sorte: 'meuble' },
  { a: [0.9142, 0.4364], b: [1.02, 0.4405], sorte: 'meuble' },
  { a: [1.02, 0.7241], b: [0.738, 0.6883], sorte: 'meuble' },
  { a: [1.02, 0.4771], b: [0.7554, 0.4639], sorte: 'meuble' }
];

export interface Chapitre {
  cle: 'scan' | 'plan' | 'meubles' | '3d' | 'partage';
  titre: string;
  phrase: string;
  /** La durée du chapitre, en millisecondes : rapide, sans précipiter. */
  duree: number;
}

export const CHAPITRES: Chapitre[] = [
  {
    cle: 'scan',
    titre: 'Scannez la pièce',
    phrase: 'Balayez lentement avec l’iPhone : murs, ouvertures et meubles sont relevés en direct.',
    duree: 5200,
  },
  {
    cle: 'plan',
    titre: 'Le plan se dessine',
    phrase: 'Coté au centimètre, pièce par pièce, avec ses surfaces.',
    duree: 4600,
  },
  {
    cle: 'meubles',
    titre: 'Aménagez-le',
    phrase: 'Glissez un meuble du catalogue : il se pose à ses vraies dimensions.',
    duree: 5000,
  },
  {
    cle: '3d',
    titre: 'Visitez-le en 3D',
    phrase: 'Le logement se lève, meublé — et l’on y entre à hauteur d’œil.',
    duree: 5200,
  },
  {
    cle: 'partage',
    titre: 'Partagez un dossier pro',
    phrase: 'Un PDF à imprimer, un DXF pour l’architecte, la 3D pour vos proches.',
    duree: 4800,
  },
];

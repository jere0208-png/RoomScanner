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
  { a: [-0.02, 0.6291], b: [0.4725, 0.578], sorte: 'sol' },
  { a: [0.4725, 0.578], b: [1.02, 0.6729], sorte: 'sol' },
  { a: [0.4725, 0.5794], b: [0.4697, 0.1836], sorte: 'angle' },
  { a: [-0.02, 0.1461], b: [0.4697, 0.1836], sorte: 'plafond' },
  { a: [0.4697, 0.1836], b: [1.02, 0.113], sorte: 'plafond' },
  { a: [-0.02, 0.6309], b: [0.3358, 0.5937], sorte: 'baie' },
  { a: [-0.02, 0.2197], b: [0.3207, 0.2365], sorte: 'baie' },
  { a: [0.3358, 0.5937], b: [0.3207, 0.2365], sorte: 'baie' },
  { a: [-0.02, 0.7088], b: [0.3071, 0.6651], sorte: 'meuble' },
  { a: [-0.02, 0.6069], b: [0.3026, 0.5761], sorte: 'meuble' },
  { a: [0.268, 0.7127], b: [-0.02, 0.6184], sorte: 'meuble' },
  { a: [0.2764, 0.8489], b: [-0.02, 0.7162], sorte: 'meuble' },
  { a: [0.2764, 0.8489], b: [0.268, 0.7127], sorte: 'meuble' },
  { a: [0.2991, 0.4902], b: [0.58, 0.4736], sorte: 'meuble' },
  { a: [0.3026, 0.5761], b: [0.6791, 0.6505], sorte: 'meuble' },
  { a: [0.3065, 0.638], b: [0.5774, 0.6049], sorte: 'meuble' },
  { a: [0.3065, 0.638], b: [0.2991, 0.4902], sorte: 'meuble' },
  { a: [0.3071, 0.6651], b: [0.6737, 0.7658], sorte: 'meuble' },
  { a: [0.3071, 0.6651], b: [0.3026, 0.5761], sorte: 'meuble' },
  { a: [0.5774, 0.6049], b: [1.02, 0.6844], sorte: 'meuble' },
  { a: [0.5774, 0.6049], b: [0.58, 0.4736], sorte: 'meuble' },
  { a: [0.58, 0.4736], b: [1.02, 0.5116], sorte: 'meuble' },
  { a: [0.6359, 0.885], b: [1.0008, 0.7886], sorte: 'meuble' },
  { a: [0.6359, 0.885], b: [0.648, 0.5644], sorte: 'meuble' },
  { a: [0.648, 0.5644], b: [1.02, 0.5249], sorte: 'meuble' },
  { a: [0.6737, 0.7658], b: [0.2764, 0.8489], sorte: 'meuble' },
  { a: [0.6737, 0.7658], b: [0.6791, 0.6505], sorte: 'meuble' },
  { a: [0.6791, 0.6505], b: [0.268, 0.7127], sorte: 'meuble' },
  { a: [0.8911, 0.7848], b: [0.3065, 0.638], sorte: 'meuble' },
  { a: [0.8911, 0.7848], b: [0.9143, 0.5655], sorte: 'meuble' },
  { a: [0.9143, 0.5655], b: [0.2991, 0.4902], sorte: 'meuble' },
  { a: [1.0008, 0.7886], b: [1.02, 0.7932], sorte: 'meuble' },
  { a: [1.0008, 0.7886], b: [1.02, 0.647], sorte: 'meuble' },
  { a: [1.0081, 1.02], b: [0.6359, 0.885], sorte: 'meuble' },
  { a: [1.02, 0.7531], b: [0.8911, 0.7848], sorte: 'meuble' },
  { a: [1.02, 0.5525], b: [0.9143, 0.5655], sorte: 'meuble' },
  { a: [1.02, 0.6178], b: [0.648, 0.5644], sorte: 'meuble' }
];

export interface Chapitre {
  cle: 'scan' | 'plan' | 'meubles' | '3d' | 'partage';
  titre: string;
  phrase: string;
  /**
   * La durée du chapitre, en millisecondes. Relevés du patron : « fais la
   * vidéo tuto plus rapide » — dix-sept secondes en tout —, puis « augmente
   * encore la vitesse du tutoriel vidéo » : onze secondes. Chaque animation
   * d'un chapitre suit son horloge, de 0 à 1 sur cette durée : tout le film
   * accélère d'un même pas, rien ne se désynchronise. Le texte, lui, reste à
   * l'écran tant qu'on n'a pas touché « Suivant ».
   */
  duree: number;
}

export const CHAPITRES: Chapitre[] = [
  {
    cle: 'scan',
    titre: 'Scannez la pièce',
    phrase: 'Balayez lentement avec l’iPhone : murs, ouvertures et meubles sont relevés en direct.',
    duree: 2400,
  },
  {
    cle: 'plan',
    titre: 'Le plan se dessine',
    phrase: 'Coté au centimètre, pièce par pièce, avec ses surfaces.',
    duree: 2100,
  },
  {
    cle: 'meubles',
    titre: 'Aménagez-le',
    phrase: 'Glissez un meuble du catalogue : il se pose à ses vraies dimensions.',
    duree: 2200,
  },
  {
    cle: '3d',
    titre: 'Visitez-le en 3D',
    phrase: 'Le logement se lève, meublé — et l’on y entre à hauteur d’œil.',
    duree: 2400,
  },
  {
    cle: 'partage',
    titre: 'Partagez un dossier pro',
    phrase: 'Un PDF à imprimer, un DXF pour l’architecte, la 3D pour vos proches.',
    duree: 1900,
  },
];

/** La durée du film entier, en millisecondes — ce que l'accueil annonce. */
export const DUREE_DU_FILM = CHAPITRES.reduce((t, c) => t + c.duree, 0);

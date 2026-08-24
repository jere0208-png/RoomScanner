/**
 * CE QUE L'APP REÇOIT QUAND ON PHOTOGRAPHIE UN PLAN.
 *
 * Deux choses, et deux seulement : une image en niveaux de gris, et les
 * TEXTES que le téléphone y a lus. Le reste — les murs, les portes, les
 * symboles, l'échelle — se déduit ici, en JavaScript, et c'est délibéré :
 * ce qui se déduit se teste, et un moteur de lecture qui vivrait en Swift
 * ne serait éprouvé nulle part.
 *
 * L'OCR, LUI, RESTE NATIF. iOS sait lire un texte imprimé depuis dix ans
 * (`VNRecognizeTextRequest`), gratuitement, dans toutes les langues, et
 * mieux que tout ce qu'on écrirait ici. On ne le refait donc pas : on
 * déclare ce qu'il rend, et on s'en sert pour caler l'échelle sur les cotes
 * écrites du plan. Un plan sans aucun texte lisible se cale autrement (voir
 * `echelle.ts`) — il n'est jamais refusé.
 */
import type { ImageGrise } from './image';

/** Un texte reconnu sur l'image, et l'endroit où il se trouve. */
export interface TexteLu {
  texte: string;
  /** Boîte du texte, en PIXELS de l'image : coin haut-gauche puis taille. */
  x: number;
  y: number;
  l: number;
  h: number;
  /** Confiance du lecteur natif, de 0 à 1, quand il la donne. */
  sur?: number;
}

/** La photo d'un plan, telle qu'elle arrive au moteur de lecture. */
export interface PhotoDePlan {
  image: ImageGrise;
  /** Ce que l'OCR a lu. Vide = on se passera des cotes écrites. */
  textes?: TexteLu[];
  /**
   * Résolution de l'image si elle vient d'un PDF ou d'un scanner, en points
   * par pouce. Avec une échelle déclarée (« 1:50 »), elle suffit à caler le
   * plan sans lire une seule cote — c'est le cas le plus favorable, et le
   * plus rare : une photo de chantier n'a pas de DPI.
   */
  dpi?: number;
  /** Échelle imprimée sur le plan, quand quelqu'un l'a saisie : 50 pour 1:50. */
  echelleDeclaree?: number;
}

/** Le centre d'une boîte de texte — l'accroche d'une cote à sa ligne. */
export function centreDuTexte(t: TexteLu): { x: number; y: number } {
  return { x: t.x + t.l / 2, y: t.y + t.h / 2 };
}

/**
 * UNE COTE TAPÉE, LUE COMME ON LA DIT — et refusée à voix haute.
 *
 * Revues « Bernard » et « Inès » : chaque champ lisait sa cote avec un
 * simple `parseFloat`, qui s'arrête à la première lettre. « 3m40 » faisait
 * une pièce de 3,00 m, « 2m15 » une porte de 2 cm, « 410 » tapé dans
 * « Cotes » un mur de 410 m — une pièce de 311 m², sans un mot. Une seule
 * lecture désormais, celle du chantier (`lireCote` du lecteur de plans) :
 * « 3,40 », « 3.40 », « 3m40 », « 3 m 40 », « 340 cm », « 3,40 m ». Ce
 * qu'elle ne comprend pas, elle le dit ; ce qui sort du commun, elle le
 * fait confirmer, avec la lecture probable à un appui.
 */
import { lireCote as lireUneCote } from '../geometry/lecturePlan';

const ZERO = /^\s*0+(?:[.,]0*)?\s*(?:m|cm|mm)?\s*$/i;

/** Une cote d'un champ EN MÈTRES (m). null : illisible. */
export function lireMetres(texte: string, { zero = false }: { zero?: boolean } = {}): number | null {
  if (zero && ZERO.test(texte)) return 0;
  const lu = lireUneCote(texte);
  if (!lu) return null;
  if (lu.unite === 'cm') return lu.valeur / 100;
  if (lu.unite === 'mm') return lu.valeur / 1000;
  return lu.valeur;
}

/**
 * Une cote d'un champ EN CENTIMÈTRES, rendue en mètres. null : illisible.
 *
 * Un nombre à virgule sous `seuilMetres` n'est pas une cote en centimètres
 * dans un logement : « 0,90 » pour une porte, c'est 90 cm (revues
 * « Sophie » et « Hugo »). Le seuil se règle au champ : pour un retrait de
 * ruban, « 2,5 » est bien 2,5 cm (revue « Bernard »).
 */
export function lireCentimetres(
  texte: string,
  { zero = false, seuilMetres = 5 }: { zero?: boolean; seuilMetres?: number } = {},
): number | null {
  if (zero && ZERO.test(texte)) return 0;
  const lu = lireUneCote(texte);
  if (!lu) return null;
  if (lu.unite === 'm') return lu.valeur;
  if (lu.unite === 'cm') return lu.valeur / 100;
  if (lu.unite === 'mm') return lu.valeur / 1000;
  return lu.decimal && lu.valeur < seuilMetres ? lu.valeur : lu.valeur / 100;
}

/** Ce qui ne va pas dans une cote : le message, et la lecture qu'on propose. */
export interface FauteDeCote {
  message: string;
  /** La cote probable, prête à mettre dans le champ (« 4,10 »). */
  proposition?: string;
  /**
   * Une cote HORS DU COMMUN, pas impossible : valider une seconde fois la
   * garde telle quelle.
   */
  douteuse?: boolean;
}

/** Les bornes d'une cote en mètres : impossible dessous, dessus ; inhabituelle au-delà de `douteux`. */
export interface BornesDeCote {
  min: number;
  max: number;
  douteux?: number;
  /** Zéro est une cote (« au sol »). */
  zero?: boolean;
  /** Ce qu'est la chose (« pour une pièce ») : il se lit dans le message. */
  pour?: string;
  /**
   * EN DESSOUS, INHABITUEL AUSSI — revue « Hugo » : un plafond à 0,50 m
   * passait sans un mot. À confirmer, comme au-dessus de `douteux`.
   */
  douteuxBas?: number;
  /**
   * La plus petite lecture qu'on PROPOSE — revue « Hugo » : « 999 » en
   * hauteur proposait « 1,00 m », un plafond à un mètre.
   */
  plausible?: number;
}

const enM = (v: number) => `${v.toFixed(2).replace('.', ',')} m`;
const champ = (v: number) => v.toFixed(2).replace('.', ',');

/** Les pièces d'un logement : de 0,60 m à 30 m, au-delà de 12 m on vérifie. */
export const BORNES_PIECE: BornesDeCote = { min: 0.6, max: 30, douteux: 12, pour: 'pour une pièce' };
/** Un mur : de 5 cm à 60 m. */
export const BORNES_MUR: BornesDeCote = { min: 0.05, max: 60, douteux: 20, pour: 'pour un mur' };
/** Une hauteur sous plafond, d'un mur ou d'une pièce. */
export const BORNES_HAUTEUR: BornesDeCote = {
  min: 0.3,
  max: 12,
  douteux: 4.5,
  douteuxBas: 1.8,
  plausible: 1.8,
  pour: 'pour une hauteur sous plafond',
};
/** Une menuiserie : de 20 cm à 8 m, au-delà de 4 m on vérifie. */
export const BORNES_MENUISERIE: BornesDeCote = { min: 0.2, max: 8, douteux: 4, pour: 'pour une menuiserie' };
/** Le bas d'une fenêtre : du sol (zéro) à 3 m. */
export const BORNES_ALLEGE: BornesDeCote = { min: 0, max: 3, zero: true, pour: 'pour un bas de fenêtre' };

/** Le vérificateur d'une feuille de saisie en mètres (`PromptData.verifier`). */
export const verifierMetres =
  (quoi: string, bornes: BornesDeCote) =>
  (texte: string): FauteDeCote | null =>
    fauteDeMetres(texte, quoi, bornes);

/**
 * Le vérificateur d'une feuille de saisie en CENTIMÈTRES : lisible, et
 * entre `min` et `max` mètres.
 */
export const verifierCentimetres =
  (quoi: string, min: number, max: number, opts: { zero?: boolean; seuilMetres?: number } = {}) =>
  (texte: string): FauteDeCote | null => {
    const v = lireCentimetres(texte, opts);
    if (v === null) {
      return { message: `${quoi} : « ${texte.trim()} » ne se lit pas. Tapez une cote en centimètres, par exemple 25.` };
    }
    if (v < min) return { message: `${quoi} : ${Math.round(v * 1000) / 10} cm, c'est trop peu.` };
    if (v > max) return { message: `${quoi} : ${enM(v)}, c'est trop.` };
    return null;
  };

/**
 * La faute d'une cote tapée en mètres, dite en clair — ou rien.
 *
 * LES CENTIMÈTRES ET LES VIRGULES OUBLIÉES SE RECONNAISSENT : « 410 » pour
 * une pièce, c'est 4,10 m tapé en centimètres ; « 41 », une virgule
 * oubliée. On propose la bonne lecture, on ne la fait pas à la place de
 * celui qui tape.
 */
export function fauteDeMetres(texte: string, quoi: string, bornes: BornesDeCote): FauteDeCote | null {
  // « 0 » se lit très bien : c'est seulement trop peu (revue « Hugo »).
  if (!bornes.zero && ZERO.test(texte)) {
    return { message: `${quoi} : 0,00 m, c'est trop peu ${bornes.pour ?? ''}.`.replace(' .', '.') };
  }
  const v = lireMetres(texte, { zero: bornes.zero });
  if (!texte.trim() || v === null) {
    return {
      message: texte.trim()
        ? `${quoi} : « ${texte.trim()} » ne se lit pas. Tapez une cote en mètres, par exemple 3,60 ou 3m60.`
        : `${quoi} : tapez une cote en mètres, par exemple 3,60.`,
    };
  }
  const plafond = bornes.douteux ?? bornes.max;
  const dansLesBornes = (x: number) => x >= Math.max(bornes.min, bornes.plausible ?? 0) && x <= plafond;
  const lu = lireUneCote(texte);
  // Un entier sans unité, trop grand : des centimètres, des millimètres, ou une virgule oubliée.
  const probable =
    lu && lu.unite === null && !lu.decimal ? [v / 100, v / 10, v / 1000].find(dansLesBornes) : undefined;
  if (v > bornes.max) {
    if (probable !== undefined) {
      return {
        message: `${quoi} : ${enM(v)} ? Vouliez-vous dire ${enM(probable)} ? Les cotes se tapent en mètres.`,
        proposition: champ(probable),
      };
    }
    return { message: `${quoi} : ${enM(v)}, c'est trop ${bornes.pour ?? ''}.`.replace(' .', '.') };
  }
  if (v < bornes.min) {
    return { message: `${quoi} : ${enM(v)}, c'est trop peu ${bornes.pour ?? ''}.`.replace(' .', '.') };
  }
  if (bornes.douteuxBas !== undefined && v < bornes.douteuxBas) {
    return {
      message:
        `${quoi} : ${enM(v)}, c'est inhabituel ${bornes.pour ?? ''}.`.replace(' .', '.') +
        ` Validez encore pour garder ${enM(v)}.`,
      douteuse: true,
    };
  }
  if (bornes.douteux !== undefined && v > bornes.douteux) {
    return {
      message:
        `${quoi} : ${enM(v)}, c'est inhabituel ${bornes.pour ?? ''}.`.replace(' .', '.') +
        (probable !== undefined ? ` Vouliez-vous dire ${enM(probable)} ?` : '') +
        ` Validez encore pour garder ${enM(v)}.`,
      ...(probable !== undefined ? { proposition: champ(probable) } : {}),
      douteuse: true,
    };
  }
  return null;
}

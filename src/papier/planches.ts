/**
 * LES PLANCHES DE RÉFÉRENCE — des plans dont on connaît les cotes.
 *
 * Elles ne servent pas à l'app : elles servent à l'ÉPROUVER. Chacune est un
 * appartement écrit à la main, en mètres, avec ses murs, ses menuiseries,
 * ses appareils et ses cotes ; le simulateur en fait une photo, le lecteur
 * la relit, et l'on compare ce qui est ressorti à ce qui était entré.
 *
 * Elles vivent ici, et non dans un banc, parce que plusieurs bancs les
 * partagent — et parce qu'un fichier posé dans `__tests__` est pris par
 * Jest pour une suite d'essais, ce qu'une liste de murs n'est pas.
 */
import type { Planche } from './simulateur';

/**
 * Le T1 de référence : une pièce, un placard, une porte, une fenêtre, six
 * appareils et deux cotes. C'est le plus petit plan qui contienne tout ce
 * qu'un lecteur doit savoir traiter.
 */
export const T1: Planche = {
  murs: [
    { a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, ep: 0.2 },
    { a: { x: 4, y: 0 }, b: { x: 4, y: 3 }, ep: 0.2 },
    { a: { x: 4, y: 3 }, b: { x: 0, y: 3 }, ep: 0.2 },
    { a: { x: 0, y: 3 }, b: { x: 0, y: 0 }, ep: 0.2 },
    { a: { x: 2.6, y: 0 }, b: { x: 2.6, y: 3 }, ep: 0.1 },
  ],
  ouvertures: [
    { mur: 4, at: 2.2, largeur: 0.83, nature: 'porte', cote: 1 },
    { mur: 0, at: 1.3, largeur: 1.2, nature: 'fenetre' },
  ],
  symboles: [
    { cle: 'prise', at: { x: 0.6, y: 0.35 }, angle: 0 },
    { cle: 'prise', at: { x: 2.2, y: 2.65 }, angle: Math.PI },
    { cle: 'inter', at: { x: 2.35, y: 0.35 } },
    { cle: 'dcl', at: { x: 1.3, y: 1.5 } },
    { cle: 'spot', at: { x: 3.3, y: 1 } },
    { cle: 'rj45', at: { x: 0.35, y: 1.8 }, angle: -Math.PI / 2 },
  ],
  cotes: [
    { a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, deport: -0.45 },
    { a: { x: 4, y: 0 }, b: { x: 4, y: 3 }, deport: -0.45 },
  ],
  etiquettes: [{ at: { x: 1.3, y: 0.7 }, texte: 'SEJOUR' }],
};


/**
 * L'ENCRE DU PLAN ÉLECTRIQUE — le rouge des plans d'architecte.
 *
 * Relevé du patron, plan d'électricité d'architecte à l'appui : « fais pareil
 * pour le plan électrique, comme le plan d'architecte ». Sur ce plan-là, TOUT
 * l'appareillage est d'une seule encre rouge, en traits fins — prises,
 * commandes, points lumineux, liaisons de commande en arcs tiretés —, et le
 * reste (mobilier, portes, sols) s'efface en gris : on lit l'électricité d'un
 * coup d'œil, posée sur un fond d'architecture calme.
 *
 * Les couleurs par famille (orange, violet, bleu) restent celles du
 * catalogue, de la 3D et des élévations ; le PLAN parle la langue du métier.
 */
import type { Palette } from '../theme';

/** Le rouge du plan imprimé : celui du papier, quel que soit le thème. */
export const ENCRE_ELEC = '#D7263D';

/** Le rouge à l'écran : plus clair sur un fond sombre, pour se lire autant. */
export function encreElectrique(c: Palette): string {
  const v = parseInt(c.bg.slice(1, 3), 16);
  return Number.isFinite(v) && v < 128 ? '#FF6B78' : ENCRE_ELEC;
}

/**
 * LE BLEU DES FENÊTRES — relevé du patron : « les fenêtres devraient être en
 * bleu plutôt que noir ; un bleu doux, qui ne fait pas mal aux yeux ». Le
 * dormant et le vitrage d'une fenêtre se tracent dans ce bleu de ciel voilé :
 * on reconnaît la baie d'un coup d'œil, sans qu'elle crie sur le noir du
 * poché.
 */
export const BLEU_FENETRE = '#86AECF';

/** À l'écran : un peu plus clair sur un fond sombre. */
export function bleuFenetre(c: Palette): string {
  const v = parseInt(c.bg.slice(1, 3), 16);
  return Number.isFinite(v) && v < 128 ? '#7FA9D1' : BLEU_FENETRE;
}

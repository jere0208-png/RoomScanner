/**
 * LA LEVÉE DU MODÈLE — le logement qui se construit sous les yeux.
 *
 * Quatrième des dix améliorations demandées : après un scan, on ne tombe
 * plus sur une maquette déjà debout. Les murs MONTENT du sol en une
 * seconde. C'est le moment le plus fort du produit — celui qu'on montre à
 * quelqu'un — et il ne coûte presque rien : la scène est déjà bâtie, c'est
 * la PROJECTION qu'on anime.
 *
 * POURQUOI LA COURBE VIT ICI, ET PAS DANS LA VUE. Elle se mesure : un banc
 * peut vérifier qu'elle part du sol, finit d'aplomb, ne redescend jamais et
 * ne dépasse pas. Trois lignes perdues dans un rendu de trois mille ne se
 * vérifient pas — et une animation qui redescend d'un cheveu se lit comme
 * un tremblement.
 *
 * DÉPART FRANC, ARRIVÉE DOUCE. C'est le geste d'un plan qu'on relève, celui
 * que la maison emploie déjà pour incliner la 3D (`incliner`). Une courbe
 * qui démarre lentement donne l'impression que l'application a ramé.
 */

/** Ce que dure la levée, en millisecondes. */
export const DUREE_LEVEE = 1100;

/**
 * La hauteur du modèle à l'instant `t` (ms depuis le départ), de 0 (à plat
 * sur le sol) à 1 (d'aplomb).
 */
export function hauteurLevee(t: number): number {
  if (!Number.isFinite(t) || t <= 0) return 0;
  if (t >= DUREE_LEVEE) return 1;
  const u = t / DUREE_LEVEE;
  // Cubique sortante : la même que l'inclinaison de la vue.
  return 1 - Math.pow(1 - u, 3);
}

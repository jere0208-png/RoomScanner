/**
 * ÉCARTER UNE ÉTIQUETTE DE CE QUI EST DÉJÀ POSÉ.
 *
 * Trouvé à l'œil, en regardant le dossier complet rendu en image : une note
 * posée au milieu d'une pièce — « colonne montante ici » — tombait
 * exactement sur le cartouche « 12,0 m² · surface au sol ». Les deux
 * réservent leur fond blanc, la note se peint en dernier, et le lecteur perd
 * les DEUX informations d'un coup.
 *
 * Sur l'écran, on déplace la note d'un appui. Sur le papier, non : ce qui
 * est imprimé est imprimé.
 *
 * LA PUNAISE NE BOUGE PAS, LE MOT SI. C'est le point visé qui porte le sens
 * — « gaine à reprendre » ne veut rien dire trois mètres plus loin — mais
 * l'étiquette peut se poser un peu plus haut ou un peu plus bas sans rien
 * perdre. C'est déjà ce que fait le cartouche d'une pièce face aux meubles.
 */

/** Une emprise rectangulaire à l'écran ou sur la page. */
export interface Boite {
  x: number;
  y: number;
  w: number;
  h: number;
}

const seTouchent = (a: Boite, b: Boite) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Cherche la position libre la plus PROCHE, en montant et en descendant.
 *
 * On n'essaie que la verticale : décaler latéralement éloignerait
 * l'étiquette de sa punaise, qui la relie à son point. Et l'on ne cherche
 * pas loin — mieux vaut un chevauchement à l'endroit juste qu'une étiquette
 * lisible posée là où elle ne veut rien dire.
 *
 * @param voulu     Où l'étiquette se poserait sans obstacle.
 * @param obstacles Ce qui est déjà sur la page.
 * @param portee    Distance maximale de recherche, dans l'unité du dessin.
 */
export function ecarterDe(
  voulu: Boite,
  obstacles: Boite[],
  portee = 60,
): Boite {
  if (!obstacles.some((o) => seTouchent(voulu, o))) return voulu;
  const pas = 4;
  for (let d = pas; d <= portee; d += pas) {
    for (const signe of [-1, 1]) {
      const essai = { ...voulu, y: voulu.y + signe * d };
      if (!obstacles.some((o) => seTouchent(essai, o))) return essai;
    }
  }
  return voulu;
}

/**
 * LA RÉCOMPENSE DU PLAN AUX NORMES — dite une fois, au bon moment.
 *
 * Troisième des dix améliorations demandées : quand le contrôle NF C 15-100
 * tombe à ZÉRO réserve, l'application le dit. Ce moment n'existait nulle
 * part — l'écran comptait les réserves et les listait ; passer de « 1 » à
 * « 0 » ne produisait rien, le compteur disparaissait, c'est tout. Or c'est
 * LE moment du travail d'électricien : celui où le plan devient montrable
 * au client et défendable au Consuel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS GARDES, ET CHACUNE VAUT SON POIDS.
 *
 * IL FAUT AVOIR EU DES RÉSERVES AVANT. Un plan vide n'en a aucune :
 * féliciter quelqu'un qui vient d'ouvrir l'application, c'est lui apprendre
 * du même coup que les félicitations de cette application ne valent rien.
 * La maison connaît la règle — « une fête sur un plan vide serait une
 * moquerie » (`resumerLeReleve`).
 *
 * IL FAUT DU TRAVAIL RÉEL. Des appareils posés, pas un plan de murs nus :
 * c'est la même raison, dite autrement.
 *
 * ET ÇA NE SE DIT QU'UNE FOIS PAR PLAN. Une fête qui repasse à chaque
 * aller-retour du contrôle — on pose une prise de trop, on la retire —
 * devient un clignotant. L'état vit ici, en mémoire, et se remet à neuf
 * quand un AUTRE plan s'ouvre : la récompense appartient au plan, pas à la
 * session.
 */
import { astuce } from './astuce';

/** A-t-on déjà fêté CE plan ? Et avait-il des réserves à lever ? */
let deja = false;
let euDesReserves = false;

/** Un plan s'ouvre : la fête suivante appartient à celui-là. */
export function resetCelebration(): void {
  deja = false;
  euDesReserves = false;
}

/**
 * À appeler quand le contrôle a recompté. Ne dit rien, sauf le jour où le
 * plan bascule aux normes — et ce jour-là, une seule fois.
 */
export function celebrerSiAuxNormes(etat: {
  /** Réserves du contrôle NF C 15-100, toutes pièces confondues. */
  reserves: number;
  /** Appareils posés sur le plan : la preuve qu'on a travaillé. */
  appareils: number;
}): void {
  if (etat.reserves > 0) {
    // On retient qu'il y avait à faire : c'est ce qui rendra la fête
    // méritée quand le compte tombera à zéro.
    if (etat.appareils > 0) euDesReserves = true;
    return;
  }
  if (deja || !euDesReserves || etat.appareils === 0) return;
  deja = true;
  astuce('Plan aux normes NF C 15-100 : plus aucune réserve.', {
    icone: 'bouclier',
    fete: true,
  });
}

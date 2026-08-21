/**
 * LE TÉLÉMÈTRE LASER — ce qu'on fait d'une mesure qui arrive.
 *
 * Le télémètre envoie un nombre. Il ne sait pas quel mur on vise, ni si
 * c'est bien celui qu'on a sélectionné sur le plan : braqué sur la cloison
 * d'en face, il donne une cote parfaitement valable — et qui écraserait un
 * relevé juste.
 *
 * Ces règles sont donc toutes défensives. Elles ne calculent rien : elles
 * décident ce qu'on accepte d'inscrire sur un plan, et ce sur quoi on
 * demande confirmation.
 */

/** En deçà, ce n'est pas une cote de bâtiment : main devant l'objectif, poche. */
const MINI = 0.05;
/** Au-delà, on n'est plus dans un logement. */
const MAXI = 200;

/** Une mesure qu'on peut inscrire sur un plan. */
export function mesurePlausible(metres: number): boolean {
  return Number.isFinite(metres) && metres >= MINI && metres <= MAXI;
}

/**
 * La cote telle qu'on l'écrit : au centimètre.
 *
 * Le laser donne le millimètre ; un plan de bâtiment se cote au centimètre.
 * Inscrire 3,472 m sur une élévation, c'est promettre une précision que la
 * maçonnerie n'a pas — et que personne ne pourra vérifier au chantier.
 */
export function auCentimetre(metres: number): number {
  return Math.round(metres * 100) / 100;
}

/**
 * L'écart entre ce que le laser dit et ce que le scan avait relevé.
 *
 * `suspect` ne veut pas dire « faux » : il veut dire « demande
 * confirmation ». C'est le seul garde-fou contre le geste qui coûte cher —
 * viser le mauvais mur et écraser une cote juste par une autre cote juste,
 * prise ailleurs.
 *
 * Le jugement se fait EN PROPORTION, pas en centimètres secs : vingt
 * centimètres sur un mur de six mètres, c'est un scan moyen ; vingt
 * centimètres sur un placard de quatre-vingts, c'est un autre objet.
 */
export function ecartAuScan(
  mesure: number,
  releve: number | null | undefined,
): { ecart: number; part: number; suspect: boolean } {
  if (!releve || releve <= 0) return { ecart: 0, part: 0, suspect: false };
  const ecart = mesure - releve;
  const part = Math.abs(ecart) / releve;
  /*
    UN CINQUIÈME, OU TRENTE CENTIMÈTRES.

    En dessous, on reste dans ce que le LiDAR se permet sur une pièce
    encombrée — c'est précisément ce qu'on vient corriger, et faire
    confirmer chaque correction rendrait l'outil inutilisable. Au-delà des
    deux, ce n'est plus une imprécision : c'est un autre mur.
  */
  const suspect = part > 0.2 && Math.abs(ecart) > 0.15;
  return { ecart, part, suspect };
}

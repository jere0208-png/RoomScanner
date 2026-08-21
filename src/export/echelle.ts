/**
 * L'ÉCHELLE VRAIE — ce qui sépare un joli plan d'un plan d'exécution.
 *
 * Le document sortait « ~ 1:100 » : le plan était mis à la feuille, puis
 * l'échelle DÉDUITE de la place occupée et arrondie pour l'affichage. Le
 * tilde disait la vérité — ce n'était l'échelle de rien. Un architecte, un
 * bureau d'études, un économiste de la construction posent leur kutch sur le
 * papier : à 1:98,3, toutes leurs cotes sont fausses, et le document ne vaut
 * plus que comme illustration.
 *
 * On renverse le calcul. On choisit une échelle NORMALISÉE — celles qu'on
 * trouve sur une règle de dessinateur —, la plus grande qui tienne dans le
 * cadre, et l'on trace à celle-là exactement. Le plan occupe un peu moins de
 * place : c'est le prix, et c'est ainsi que travaille tout le monde.
 */

/** Un point PostScript vaut 1/72 de pouce, soit 0,352778 mm. */
export const PT_PAR_MM = 72 / 25.4;

/**
 * Les échelles du bâtiment, du plus grand au plus petit détail.
 *
 * 1:20 et 1:25 pour un détail d'exécution, 1:50 pour un plan de logement —
 * c'est celui du permis et du chantier —, 1:100 pour un étage entier, au-delà
 * pour un immeuble. Aucune règle ne porte de 1:37.
 */
export const ECHELLES_BATIMENT = [20, 25, 50, 75, 100, 125, 150, 200] as const;

export interface EchelleChoisie {
  /** Le dénominateur : 50 pour 1:50. */
  ratio: number;
  /** Points PostScript par mètre réel, à appliquer au tracé. */
  ptParMetre: number;
  /** Ce qui s'imprime au cartouche. Sans tilde : il n'y a plus à mentir. */
  label: string;
}

/**
 * La plus grande échelle normalisée qui tienne dans la place donnée.
 *
 * `dispoPt` est la largeur (ou la hauteur) utile du cadre, `metres`
 * l'étendue du plan dans la même direction.
 *
 * DEUX BORNES, et elles disent le métier. Un plan minuscule ne se dessine
 * pas à 1:5 — ce n'est pas une échelle de logement, et le trait de mur ferait
 * un centimètre de large : on plafonne au premier cran. Un immeuble de
 * quatre-vingt-dix mètres, à l'inverse, sort de la série : on continue par
 * crans de cinquante plutôt que de rendre une échelle bâtarde.
 */
export function echelleNormalisee(
  dispoPt: number,
  metres: number,
): EchelleChoisie {
  const etendue = Math.max(metres, 0.5);
  // Le ratio minimal pour que le plan tienne : 1 m = 1000/ratio mm de papier.
  const mini = (1000 * etendue * PT_PAR_MM) / Math.max(dispoPt, 1);
  let ratio =
    ECHELLES_BATIMENT.find((v) => v >= mini) ?? Math.ceil(mini / 50) * 50;
  if (ratio < ECHELLES_BATIMENT[0]) ratio = ECHELLES_BATIMENT[0];
  return {
    ratio,
    ptParMetre: (1000 / ratio) * PT_PAR_MM,
    label: `1:${ratio}`,
  };
}

export interface Regle {
  /** Pas des graduations, en mètres entiers. */
  pas: number;
  /** Longueur totale de la règle, en mètres. */
  total: number;
  /** La même, en points, prête à dessiner. */
  longueurPt: number;
}

/**
 * LA RÈGLE GRAPHIQUE — la preuve de l'échelle, imprimée à côté d'elle.
 *
 * Un cartouche qui annonce 1:50 se croit sur parole ; une règle se vérifie,
 * et elle survit à une photocopie qui aurait réduit la feuille. C'est la
 * raison d'être de ce peigne sur tous les plans d'architecte.
 *
 * Les graduations sont des MÈTRES ENTIERS : personne ne lit une règle
 * graduée tous les 3,7 m.
 */
export function graduationsRegle(ratio: number, largeurPt: number): Regle {
  const ptParMetre = (1000 / ratio) * PT_PAR_MM;
  const tient = largeurPt / ptParMetre;
  /*
    Des pas qu'on lit d'un coup d'œil, et jamais plus de quatre intervalles.

    LA SÉRIE DESCEND SOUS LE MÈTRE : à 1:20, un mètre occupe cinq
    centimètres de papier, et une règle de cinq mètres ne tiendrait pas dans
    la case du cartouche. Les plans de détail portent des barres de
    cinquante ou vingt centimètres — c'est ce qu'on lit sur les documents
    d'exécution.
  */
  const SERIE = [0.2, 0.5, 1, 2, 5, 10, 20, 50];
  const pas =
    SERIE.find((p) => p <= tient && tient / p <= 4) ??
    // Rien ne tient : on prend le plus petit pas, et la règle sortira
    // écourtée plutôt qu'absente.
    SERIE[0];
  const n = Math.max(1, Math.floor(tient / pas));
  const total = Math.round(n * pas * 1e6) / 1e6;
  return { pas, total, longueurPt: total * ptParMetre };
}

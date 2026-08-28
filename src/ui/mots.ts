/**
 * LES PETITS MOTS QUI TRAHISSENT UNE APPLICATION.
 *
 * « 4 murs · 9,8 m² · 1 objets » : la ligne de résumé d'un relevé, dans la
 * bibliothèque. L'application sait pourtant accorder — le choix d'après-scan
 * dit « 1 meuble détecté », la visite client dit « 1 pièce » — mais chaque
 * endroit refaisait le calcul dans son coin, et trois d'entre eux l'avaient
 * oublié. Un pluriel fautif sur un dossier qu'on montre au client, c'est le
 * genre de détail qui fait douter du reste.
 *
 * Un seul endroit, donc, et plus personne ne l'oublie.
 */

/**
 * « 1 objet », « 2 objets », « 0 mur ».
 *
 * ZÉRO RESTE AU SINGULIER : c'est la règle du français, et l'app est
 * française. Le pluriel irrégulier se donne à la main — le jour où l'on
 * comptera des bureaux, on ne dira pas « 2 bureauxs ».
 */
export function pluriel(n: number, mot: string, pluriels?: string): string {
  return `${n} ${n > 1 ? pluriels ?? `${mot}s` : mot}`;
}

/** Une surface au sol, telle que le relevé la donne. */
export interface SurfaceResumee {
  area: number;
  /** Faux quand le contour ne se referme pas : la valeur est approchée. */
  exact: boolean;
}

/**
 * LA LIGNE DE RÉSUMÉ D'UN RELEVÉ — ce qu'on lit sans ouvrir le plan.
 *
 * Elle ne dit QUE ce qu'il y a : pas de « 0 objet » pour remplir, pas de
 * « 1 pièce » qui n'apprend rien puisque c'est le cas normal. Ce qui manque
 * se voit à l'absence, et une ligne courte se lit d'un coup d'œil dans une
 * liste de trente relevés.
 */
export function resumeDuScan(x: {
  pieces: number;
  murs: number;
  objets: number;
  surface: SurfaceResumee | null;
}): string {
  const fr1 = (v: number) => v.toFixed(1).replace('.', ',');
  return [
    ...(x.pieces > 1 ? [pluriel(x.pieces, 'pièce')] : []),
    pluriel(x.murs, 'mur'),
    ...(x.surface
      ? [`${x.surface.exact ? '' : '≈ '}${fr1(x.surface.area)} m²`]
      : []),
    ...(x.objets > 0 ? [pluriel(x.objets, 'objet')] : []),
  ].join(' · ');
}

/**
 * LE TEXTE TEL QU'ON LE CHERCHE — sans casse, sans accents, sans apostrophes.
 *
 * Personne ne tape « Boîte d'encastrement » avec son accent circonflexe et
 * son apostrophe typographique : on tape « boite ». Un champ de recherche qui
 * exige l'orthographe exacte d'un libellé ne sert à rien sur un téléphone,
 * et il ne le dit pas — il rend simplement une liste vide.
 *
 * Ce n'est pas `sansAccent` de l'export DXF : celui-là translittère pour un
 * format ASCII, garde la casse et remplace les tirets. Ici on compare, on
 * n'écrit pas.
 */
export function pourChercher(s: string): string {
  return s
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, ' ');
}

/**
 * « a », « a et b », « a, b et c ».
 *
 * Une énumération séparée par des virgules jusqu'au bout — « 9 prises, 5
 * commandes, 1 RJ45 » — se lit comme une liste tronquée : on attend la suite.
 * Le « et » dit que c'est fini. C'est le genre de détail qui distingue une
 * phrase d'un tableau mis à plat.
 */
export function enumerer(morceaux: string[]): string {
  if (morceaux.length === 0) return '';
  if (morceaux.length === 1) return morceaux[0];
  return `${morceaux.slice(0, -1).join(', ')} et ${morceaux[morceaux.length - 1]}`;
}

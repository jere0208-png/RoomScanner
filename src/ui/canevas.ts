/**
 * LE DESSIN 3D, MIS À PLAT POUR UNE SEULE VUE NATIVE.
 *
 * Relevé du patron : « le meublé est lourd, à peine quelques meubles et une
 * latence est largement visible ; pourtant sur MagicScan, un grand nombre
 * de meubles et aucun problème ». La comparaison désigne la vraie limite :
 * ces applications dessinent leur 3D dans un canevas accéléré, là où nous
 * posions une VUE NATIVE PAR FACE — cinq cent cinquante, réconciliées par
 * React et repeintes à chaque image.
 *
 * Le calcul, lui, n'a jamais été en cause : trois dixièmes de milliseconde
 * pour trier et projeter un logement meublé. On garde donc TOUT ce qui a été
 * écrit — scène, tri du peintre, écorché, appareillage — et l'on change
 * seulement la dernière étape : au lieu de trois cents balises, un tableau
 * de nombres qu'une seule vue dessine d'un trait.
 *
 * POURQUOI DES NOMBRES ET NON DU TEXTE. Le format évident aurait été
 * d'envoyer les chemins SVG (« M12 30L…»), lisibles et courts à écrire. Mais
 * ce qui passe le pont soixante fois par seconde doit se lire sans être
 * analysé : un tableau de nombres se convertit d'un bloc, une chaîne se
 * découpe caractère par caractère. À trois cents formes, l'écart n'est pas
 * théorique.
 *
 * LE FORMAT, en un seul tableau plat :
 *
 *   [ index du style, nombre de points, x, y, x, y, … ] × nombre de formes
 *
 * Les styles voyagent à part, une chaîne par style, parce qu'ils se
 * répètent : deux cents faces d'un mur partagent la même. Un point de plus
 * dans le tableau des formes coûte deux nombres ; un style de plus, une
 * chaîne — c'est le bon partage.
 */
import type { FaceTracee } from './traces';

/** Le dessin d'une scène, prêt pour la vue native. */
export interface DessinCanevas {
  /** Les formes, à plat : voir le format ci-dessus. */
  formes: number[];
  /**
   * Un style par entrée, sous la forme
   * `fond,trait,épaisseur,pointillé,opacité du fond,opacité du trait`.
   * `none` dit qu'il n'y a rien à peindre ou rien à border.
   */
  styles: string[];
}

/**
 * Met les faces à plat. Elles arrivent DÉJÀ TRIÉES : cette fonction ne
 * réordonne rien, elle transcrit — l'ordre de peinture est la seule chose
 * qui empêche un meuble de traverser une cloison.
 */
export function mettreAPlat(faces: FaceTracee[]): DessinCanevas {
  const formes: number[] = [];
  const styles: string[] = [];
  /** Le style déjà envoyé porte son rang : on ne le redit pas. */
  const rangs = new Map<string, number>();
  for (const f of faces) {
    const trait = f.proj.length === 2;
    const style =
      `${trait ? 'none' : f.fill},${f.stroke},${f.dashed ? 1.8 : 1},` +
      `${f.dashed ? 1 : 0},${f.voile},${trait ? f.voile : 0.25 + 0.75 * f.voile}`;
    let rang = rangs.get(style);
    if (rang === undefined) {
      rang = styles.length;
      rangs.set(style, rang);
      styles.push(style);
    }
    formes.push(rang, f.proj.length);
    for (const p of f.proj) formes.push(p.sx, p.sy);
  }
  return { formes, styles };
}

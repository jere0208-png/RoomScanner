/**
 * OÙ POSER LES VALEURS DE COTE, ET LESQUELLES RENONCER.
 *
 * Un chiffre illisible sur un plan coté est pire qu'un chiffre absent :
 * absent, on va le chercher ; empilé sur un autre, on croit l'avoir lu. Le
 * PDF arbitrait déjà ; l'écran, lui, écrivait toutes les valeurs sans
 * regarder — sur un mur en dents de scie, trois cotes de vingt centimètres
 * se recouvraient en une tache grise.
 *
 * Deux règles, et elles sont ici parce qu'elles n'ont rien à voir avec le
 * dessin : ce sont des rectangles qui se marchent dessus.
 */

export interface Cadre {
  w: number;
  h: number;
}

/** Un point à l'écran, en pixels. */
export interface Px {
  x: number;
  y: number;
}

/**
 * LE MILIEU VISIBLE D'UN SEGMENT — pas son milieu tout court.
 *
 * Une cote se pose au milieu de son mur. Zoomé sur un angle, le milieu d'un
 * mur de cinq mètres est à deux écrans de là : la cote existe, elle est
 * simplement dessinée dans le vide, et l'on croit que l'app cesse de coter
 * dès qu'on approche. Or c'est justement au zoom qu'on lit les cotes.
 *
 * On rend donc le milieu de la PORTION VISIBLE. Le mur entièrement hors
 * champ rend `null` : il n'y a rien à écrire.
 */
export function milieuVisible(a: Px, b: Px, cadre: Cadre, marge = 26): Px | null {
  const x0 = -marge;
  const y0 = -marge;
  const x1 = cadre.w + marge;
  const y1 = cadre.h + marge;
  // Découpe paramétrique du segment contre le rectangle (Liang-Barsky).
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const essais: [number, number][] = [
    [-dx, a.x - x0],
    [dx, x1 - a.x],
    [-dy, a.y - y0],
    [dy, y1 - a.y],
  ];
  for (const [p, q] of essais) {
    if (Math.abs(p) < 1e-9) {
      // Parallèle à ce bord : hors du cadre, il n'y a rien à garder.
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  if (t1 <= t0) return null;
  const t = (t0 + t1) / 2;
  return { x: a.x + dx * t, y: a.y + dy * t };
}

/** Une étiquette candidate, avec ce qui la départage. */
export interface Etiquette {
  id: string;
  /** Centre de l'étiquette, en pixels. */
  at: Px;
  /** Largeur et hauteur du texte, en pixels, ROTATION COMPRISE. */
  taille: { w: number; h: number };
  /**
   * Ce qui tranche quand deux se disputent la place : la plus grande cote
   * gagne. C'est ce que ferait un dessinateur — on lit d'abord les grandes
   * dimensions, et un retour de vingt centimètres se retrouve au métré.
   */
  poids: number;
}

/**
 * Les étiquettes qu'on garde : les plus lourdes d'abord, et l'on renonce à
 * celles qui viendraient recouvrir une déjà posée.
 *
 * `jeu` est l'écart minimal entre deux boîtes : à zéro, deux chiffres qui se
 * frôlent se lisent encore comme un seul nombre.
 */
export function cotesLisibles(list: Etiquette[], jeu = 2): Set<string> {
  const gardees: { x: number; y: number; w: number; h: number }[] = [];
  const out = new Set<string>();
  const boites = [...list].sort((u, v) => v.poids - u.poids);
  for (const e of boites) {
    const b = {
      x: e.at.x - e.taille.w / 2,
      y: e.at.y - e.taille.h / 2,
      w: e.taille.w,
      h: e.taille.h,
    };
    const libre = gardees.every(
      (o) =>
        b.x > o.x + o.w + jeu ||
        o.x > b.x + b.w + jeu ||
        b.y > o.y + o.h + jeu ||
        o.y > b.y + b.h + jeu,
    );
    if (!libre) continue;
    gardees.push(b);
    out.add(e.id);
  }
  return out;
}

/**
 * L'encombrement d'un texte pivoté, en pixels.
 *
 * Une cote verticale n'occupe pas un ruban horizontal : sans tenir compte de
 * l'angle, deux cotes perpendiculaires paraissent se croiser alors qu'elles
 * se rangent très bien — et deux cotes parallèles se croient libres.
 */
export function encombrement(
  texte: string,
  fontSize: number,
  angleDeg: number,
): { w: number; h: number } {
  // 0,55 em par signe : la police du plan est plus étroite qu'un Helvetica
  // plein, et une estimation généreuse ne peut que sacrifier une cote de
  // plus — jamais en laisser passer une illisible.
  const l = texte.length * fontSize * 0.55;
  const r = (Math.abs(angleDeg) * Math.PI) / 180;
  return {
    w: l * Math.cos(r) + fontSize * Math.sin(r),
    h: l * Math.sin(r) + fontSize * Math.cos(r),
  };
}

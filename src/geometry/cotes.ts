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
/**
 * UNE ÉTIQUETTE QUI PEUT SE POSER À PLUSIEURS ENDROITS.
 *
 * Relevé du patron : « fais un tour pour le placement intelligent des cotes
 * SUR TOUTE LONGUEUR. Il faut absolument pas que 2 cotes se touchent ou qu'un
 * élément vienne entraver la lecture d'une cote. »
 *
 * « Sur toute longueur » est la clé, et c'est ce qui manquait : une cote de
 * mur se posait au MILIEU de son mur, un point et pas deux. Quand ce point
 * était pris, elle n'avait qu'un recours — disparaître. Or une cote peut
 * glisser le long de ce qu'elle mesure sans rien perdre : elle reste attachée
 * au même mur, elle dit la même chose. C'est ce que fait un dessinateur.
 *
 * Les places sont proposées de la MEILLEURE à la moins bonne : le milieu
 * d'abord, puis de part et d'autre, puis l'autre côté du mur. La première
 * libre gagne.
 */
export interface EtiquetteMobile extends Omit<Etiquette, 'at'> {
  /** Où elle voudrait se poser, par ordre de préférence. */
  places: Place[];
}

/**
 * UNE PLACE, ET CE À QUOI ELLE SE RATTACHE QUAND ELLE S'EN ÉLOIGNE.
 *
 * Revue des six testeurs (capture clair-11) : « 4,93 m » posé sur le trait
 * des fenêtres, « 3,60 m » en travers du canapé. Quand la place contre le
 * mur est prise par une menuiserie ou un meuble, la cote se DÉCALE — hors de
 * la pièce pour une façade —, et un trait d'attache la relie au nu de ce
 * qu'elle mesure : on ne se demande pas de quel mur elle parle.
 */
export interface Place extends Px {
  /** Le point du mur où mène le trait d'attache ; absent, la cote est contre lui. */
  attache?: Px;
}

/** Un rectangle à l'écran, en pixels, aligné sur les axes. */
export interface Boite {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * La boîte qui enveloppe des points — un meuble tourné, une baie dans
 * l'épaisseur de sa façade, le quart de cercle d'une porte.
 *
 * Enveloppante, donc un peu plus grande que le dessin quand il est en biais :
 * une cote qui renonce à un coin vide coûte moins qu'une cote posée sur un lit.
 */
export function boiteDePoints(pts: Px[]): Boite {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * EN DESSOUS DE SOIXANTE CENTIMÈTRES, UNE COTE DOIT SE MÉRITER.
 *
 * Revue des six testeurs : « 0,53 m » flottait au milieu d'une cloison sans
 * qu'on sache ce qu'il mesurait — le bout de refend entre deux jonctions,
 * que rien ne distingue à l'œil du mur qui le prolonge. Une si petite cote ne
 * se montre que si elle tient DANS la longueur de ce qu'elle mesure (elle y
 * est alors visiblement attachée) ; sinon elle attend qu'on zoome, et la
 * valeur reste au métré.
 */
export const PETITE_COTE = 0.6;

/** Une petite cote se lit-elle contre ce qu'elle mesure ? Longueurs en pixels. */
export function petiteCoteLisible(
  longueurM: number,
  longueurPx: number,
  etiquetteLePx: number,
): boolean {
  return longueurM >= PETITE_COTE || etiquetteLePx <= longueurPx;
}

/**
 * Pose chaque étiquette à la première de ses places qui soit libre.
 *
 * Les plus lourdes passent d'abord et prennent la meilleure place ; les
 * suivantes se rangent autour. Celle qui ne trouve aucune place libre RENONCE
 * — c'est la règle de la maison : un chiffre illisible est pire qu'un chiffre
 * absent, absent on va le chercher, empilé on croit l'avoir lu.
 *
 * `jeu` est l'écart minimal entre deux boîtes : à zéro, deux chiffres qui se
 * frôlent se lisent encore comme un seul nombre.
 *
 * `prises` est ce qui occupe déjà le plan et ne bougera pas — un cartouche de
 * pièce, par exemple.
 */
export function placerEtiquettes(
  list: EtiquetteMobile[],
  prises: Boite[] = [],
  jeu = 2,
  /**
   * CE QUE LA COTE NE DOIT PAS RECOUVRIR, sans être une étiquette : les
   * meubles, les menuiseries et le battant des portes (revue des six
   * testeurs — « 2,93 m » sur les WC, « 3,00 m » sur une fenêtre). Elles
   * réservent leur place comme un cartouche ; seules les étiquettes en ont
   * une, elles, à se disputer.
   */
  encombrants: Boite[] = [],
): Map<string, Place> {
  const occupees = [...prises, ...encombrants];
  const out = new Map<string, Place>();
  for (const e of [...list].sort((u, v) => v.poids - u.poids)) {
    for (const p of e.places) {
      const b = {
        x: p.x - e.taille.w / 2,
        y: p.y - e.taille.h / 2,
        w: e.taille.w,
        h: e.taille.h,
      };
      const libre = occupees.every(
        (o) =>
          b.x > o.x + o.w + jeu ||
          o.x > b.x + b.w + jeu ||
          b.y > o.y + o.h + jeu ||
          o.y > b.y + b.h + jeu,
      );
      if (!libre) continue;
      occupees.push(b);
      out.set(e.id, p);
      break;
    }
  }
  return out;
}

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
 * CE DONT UNE PLAQUE DE COTE DÉBORDE, de chaque côté du chiffre.
 *
 * Relevé du patron : « le bloc blanc arrière ne doit pas être si gros, il
 * doit dépasser de 2px les chiffres sur les côtés ».
 *
 * Deux points. C'est assez pour détacher le nombre de ce qu'il survole — un
 * poché de mur, un semis de sol, un tireté de gaine — et assez peu pour que
 * la plaque ne mange pas le dessin. Elle en prenait six de plus : sur un plan
 * couvert de cotes, cela fait beaucoup de blanc.
 */
export const DEBORD_PLAQUE = 2;

/**
 * LA PLAQUE BLANCHE D'UN CHIFFRE DE COTE — taillée sur le texte.
 *
 * Elle était ÉCRITE EN DUR, et à quatre endroits : « 26 × 14 » à l'écran pour
 * la chaîne, « len × 7,2 + 14 » pour les cotes de spot, « 22 × 10 » et
 * « 18 × 9 » dans le dossier. Quatre tailles pour la même chose, dont aucune
 * ne suivait son texte : la plaque d'une cote à deux chiffres était aussi
 * large que celle d'une cote à quatre.
 *
 * ELLE SE CALCULE DONC, sur la même estimation de largeur que tout le reste
 * du plan (`encombrement`, 0,55 em par signe) — deux estimations différentes
 * pour un même texte finiraient par diverger.
 *
 * LA HAUTEUR SERRE PLUS QUE LA LARGEUR, et c'est voulu : un chiffre n'occupe
 * pas toute sa police en hauteur — ni jambage, ni accent, ni majuscule. Une
 * plaque à la hauteur de la police laisserait au-dessus et au-dessous un
 * blanc que rien ne remplit. On prend la hauteur des CHIFFRES (~0,72 em) et
 * l'on redonne le même débord de deux points.
 */
export function plaqueDeCote(
  texte: string,
  fontSize: number,
): { w: number; h: number } {
  return {
    w: texte.length * fontSize * 0.55 + 2 * DEBORD_PLAQUE,
    h: fontSize * 0.72 + 2 * DEBORD_PLAQUE,
  };
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

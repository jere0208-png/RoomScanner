/**
 * DESSINER SUR DU PAPIER — les quelques traits dont un plan est fait.
 *
 * Ce fichier ne sert pas à afficher : il sert à FABRIQUER des plans papier,
 * pour éprouver celui qui les relit. Un lecteur de plan ne se teste pas sur
 * des nombres — il se teste sur des images, et il en faut beaucoup : le même
 * appartement à trois échelles, photographié de travers, à l'ombre, au
 * crayon plutôt qu'au tire-ligne.
 *
 * Les mêmes primitives dessinent les GABARITS de symboles. C'est voulu, et
 * c'est même la clef de la reconnaissance : le symbole de référence et le
 * symbole imprimé sur la planche sortent du même dessin, et l'appariement
 * compare donc deux images faites pareil — ce qui reste vrai le jour où le
 * plan vient d'un autre logiciel, puisqu'on ne compare pas des pixels mais
 * des descripteurs invariants.
 *
 * On dessine SOMBRE SUR CLAIR, avec un demi-pixel d'adoucissement : un trait
 * parfaitement dur n'existe sur aucune photo, et un lecteur réglé sur des
 * traits durs se casse la figure sur la première vraie feuille.
 */
import type { ImageGrise } from './image';

export interface P {
  x: number;
  y: number;
}

export type Forme =
  | { t: 'seg'; a: P; b: P; w?: number }
  | { t: 'arc'; c: P; r: number; a0: number; a1: number; w?: number }
  | { t: 'disque'; c: P; r: number }
  | { t: 'poly'; pts: P[]; w?: number; ferme?: boolean }
  /**
   * UN POLYGONE PLEIN — la maçonnerie des plans modernes.
   *
   * On a d'abord cru qu'un mur se dessinait toujours par deux traits
   * parallèles ; les vrais plans démentent. Sur un plan d'implantation
   * électrique courant, les murs porteurs sont des APLATS noirs et les
   * cloisons des aplats gris. La planche d'essai doit donc savoir les
   * imprimer, sans quoi le lecteur ne serait jamais éprouvé sur le cas le
   * plus fréquent.
   */
  | { t: 'aplat'; pts: P[] };

/** Distance d'un point à un segment — la seule géométrie du fichier. */
function distSeg(px: number, py: number, a: P, b: P): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : ((px - a.x) * vx + (py - a.y) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = px - (a.x + vx * t);
  const dy = py - (a.y + vy * t);
  return Math.hypot(dx, dy);
}

function poser(img: ImageGrise, x: number, y: number, part: number, encre: number) {
  if (x < 0 || y < 0 || x >= img.l || y >= img.h || part <= 0) return;
  const i = y * img.l + x;
  const p = Math.min(1, part);
  // On ne repeint jamais plus clair : deux traits qui se croisent restent
  // noirs à leur croisement, comme sur une vraie impression.
  const v = Math.round(img.px[i] * (1 - p) + encre * p);
  if (v < img.px[i]) img.px[i] = v;
}

/**
 * Le rectangle à parcourir pour une forme, marge comprise.
 * Parcourir l'image entière par forme coûterait cent fois plus cher.
 */
function cadre(f: Forme, marge: number) {
  const pts: P[] =
    f.t === 'seg'
      ? [f.a, f.b]
      : f.t === 'poly' || f.t === 'aplat'
      ? f.pts
      : [
          { x: f.c.x - f.r, y: f.c.y - f.r },
          { x: f.c.x + f.r, y: f.c.y + f.r },
        ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    x0: Math.floor(Math.min(...xs) - marge),
    y0: Math.floor(Math.min(...ys) - marge),
    x1: Math.ceil(Math.max(...xs) + marge),
    y1: Math.ceil(Math.max(...ys) + marge),
  };
}

/** L'angle ramené dans [0, 2π[. */
const tour = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

function dansLArc(ang: number, a0: number, a1: number): boolean {
  // LE CERCLE ENTIER EST UN CAS À PART. Ramené dans un tour, « de 0 à 2π »
  // devient « de 0 à 0 » : le cercle d'un point lumineux se réduisait alors
  // à un point unique posé sur sa droite, et le symbole perdait sa forme la
  // plus reconnaissable. On le voit sur l'image, jamais dans un nombre.
  if (Math.abs(a1 - a0) >= Math.PI * 2 - 1e-9) return true;
  const d = tour(a1 - a0);
  return tour(ang - a0) <= d + 1e-9;
}

/**
 * Trace des formes sur l'image.
 *
 * `trait` est l'épaisseur par défaut (px) ; `encre` la valeur du noir — un
 * plan au crayon gris clair et un plan au trait noir ne se lisent pas de la
 * même façon, et le lecteur doit tenir les deux.
 */
export function tracer(
  img: ImageGrise,
  formes: Forme[],
  reglage: { trait?: number; encre?: number } = {},
): void {
  const trait = reglage.trait ?? 2;
  const noir = reglage.encre ?? 20;
  for (const f of formes) {
    const w = ('w' in f ? f.w : undefined) ?? (f.t === 'disque' || f.t === 'aplat' ? 0 : trait);
    const demi = f.t === 'disque' || f.t === 'aplat' ? 0 : w / 2;
    const { x0, y0, x1, y1 } = cadre(f, demi + 1.5);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const cx = x + 0.5;
        const cy = y + 0.5;
        let d: number;
        if (f.t === 'seg') {
          d = distSeg(cx, cy, f.a, f.b) - demi;
        } else if (f.t === 'disque') {
          d = Math.hypot(cx - f.c.x, cy - f.c.y) - f.r;
        } else if (f.t === 'arc') {
          const ang = Math.atan2(cy - f.c.y, cx - f.c.x);
          if (!dansLArc(ang, f.a0, f.a1)) {
            // Hors de l'ouverture de l'arc : seuls comptent ses deux bouts,
            // sans quoi un arc aurait des extrémités carrées flottantes.
            const b0 = { x: f.c.x + f.r * Math.cos(f.a0), y: f.c.y + f.r * Math.sin(f.a0) };
            const b1 = { x: f.c.x + f.r * Math.cos(f.a1), y: f.c.y + f.r * Math.sin(f.a1) };
            d = Math.min(Math.hypot(cx - b0.x, cy - b0.y), Math.hypot(cx - b1.x, cy - b1.y)) - demi;
          } else {
            d = Math.abs(Math.hypot(cx - f.c.x, cy - f.c.y) - f.r) - demi;
          }
        } else if (f.t === 'aplat') {
          // Dedans ou dehors : la règle du pair-impair, et l'on adoucit le
          // bord d'un demi-pixel comme partout ailleurs.
          d = dansLePoly(cx, cy, f.pts) ? -0.5 : bordDuPoly(cx, cy, f.pts);
        } else {
          d = Infinity;
          const n = f.pts.length;
          for (let i = 0; i + 1 < n; i++) {
            d = Math.min(d, distSeg(cx, cy, f.pts[i], f.pts[i + 1]));
          }
          if (f.ferme && n > 2) d = Math.min(d, distSeg(cx, cy, f.pts[n - 1], f.pts[0]));
          d -= demi;
        }
        // Un demi-pixel d'adoucissement : le trait a un bord, pas une marche.
        poser(img, x, y, Math.min(1, 0.5 - d), noir);
      }
    }
  }
}

/** Le test du pair-impair : une demi-droite qui sort du polygone. */
function dansLePoly(x: number, y: number, pts: P[]): boolean {
  let dedans = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      dedans = !dedans;
    }
  }
  return dedans;
}

/** Distance au bord d'un polygone — pour adoucir sa lisière. */
function bordDuPoly(x: number, y: number, pts: P[]): number {
  let d = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    d = Math.min(d, distSeg(x, y, pts[i], pts[j]));
  }
  return d;
}

/** Applique une transformation à des formes — poser un gabarit, c'est ça. */
export function transformer(
  formes: Forme[],
  p: { x: number; y: number; echelle: number; angle?: number },
): Forme[] {
  const co = Math.cos(p.angle ?? 0);
  const si = Math.sin(p.angle ?? 0);
  const P = (q: P): P => ({
    x: p.x + (q.x * co - q.y * si) * p.echelle,
    y: p.y + (q.x * si + q.y * co) * p.echelle,
  });
  return formes.map((f) => {
    if (f.t === 'seg') return { ...f, a: P(f.a), b: P(f.b), w: f.w && f.w * p.echelle };
    if (f.t === 'poly') return { ...f, pts: f.pts.map(P), w: f.w && f.w * p.echelle };
    if (f.t === 'aplat') return { ...f, pts: f.pts.map(P) };
    if (f.t === 'disque') return { ...f, c: P(f.c), r: f.r * p.echelle };
    return {
      ...f,
      c: P(f.c),
      r: f.r * p.echelle,
      a0: f.a0 + (p.angle ?? 0),
      a1: f.a1 + (p.angle ?? 0),
      w: f.w && f.w * p.echelle,
    };
  });
}

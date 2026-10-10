/**
 * LE POCHÉ — la maçonnerie d'un plan, d'un seul tenant.
 *
 * Relevé du patron, plans d'architecte à l'appui : « pas de triangle de
 * jonction, tout est clean, on veut pareil. On ne doit pas peindre mais revoir
 * le système de jonction lui-même pour qu'il s'adapte et fasse un mur en
 * continu avec celui qu'il rencontre. Les murs extérieurs (périphériques à la
 * construction) sont plus épais. »
 *
 * Un plan d'architecte ne dessine pas des murs : il dessine LA MAÇONNERIE, une
 * seule forme noire où les murs se fondent les uns dans les autres. Le plan de
 * l'app dessinait chaque mur pour lui-même, en onglet contre ses voisins : à
 * deux murs, les onglets se rejoignaient (avec une couture d'anticrénelage) ;
 * à trois, ils laissaient un triangle au cœur du nœud.
 *
 * Ici, la maçonnerie est l'UNION exacte des corps de murs (`wallQuads`) ET du
 * cœur de chaque nœud de trois murs ou plus (`jonctionsDeMurs` : le polygone
 * que bordent leurs coupes, et qui fait partie du mur) — le « nettoyage des
 * murs » d'un logiciel d'architecte :
 *   — chaque bord de chaque mur est découpé là où il croise un autre bord ;
 *   — un morceau de bord n'est gardé que s'il sépare vraiment la maçonnerie
 *     du vide (on regarde un dixième de millimètre de part et d'autre) ;
 *   — les morceaux gardés se chaînent en contours, et les points alignés
 *     s'effacent : le mur qui continue au-delà d'une jonction en T est UN
 *     trait droit, d'un angle à l'autre.
 * Une jonction n'a donc plus rien à boucher : elle n'existe plus en tant que
 * telle, le mur rencontré continue.
 *
 * LES FAÇADES S'ÉPAISSISSENT VERS LE DEHORS. Un bord du contour extérieur qui
 * donne sur le dehors (aucune pièce à trente centimètres) reçoit une bande
 * de `SUREPAISSEUR_FACADE`, angles saillants compris : la façade prend
 * l'épaisseur d'un vrai mur de façade, et l'intérieur — les pièces, leurs
 * surfaces, les faces où l'on pose les appareils — ne bouge pas d'un
 * millimètre.
 *
 * LES BAIES SONT DES VIDES, pas des aplats posés sur le noir : leur rectangle
 * est retranché de la maçonnerie, à travers toute son épaisseur.
 *
 * Les corps de murs, eux, restent : ils donnent les FACES (`wallFace`), donc
 * les cotes de l'établi. Ils ne sont simplement plus dessinés.
 */
import {
  epaisseurDe,
  jonctionsDeMurs,
  pointOnSeg,
  roomParts,
  wallQuadsOf,
  type Pt,
  type RoomShape,
  type WallSeg,
} from './floorplan';

/** Ce que la façade gagne vers le dehors : un mur de 14 devient un mur de 24. */
export const SUREPAISSEUR_FACADE = 0.1;

type Poly = Pt[];

// ------------------------------------------------------------ outils plans

const cross = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;

/** Aire signée : positive quand le contour tourne en laissant l'intérieur à sa gauche. */
export function aireSignee(p: Poly): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.z - b.x * a.z;
  }
  return s / 2;
}

function dansPoly(pt: Pt, poly: Poly): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > pt.z !== b.z > pt.z && pt.x < ((b.x - a.x) * (pt.z - a.z)) / (b.z - a.z) + a.x) dedans = !dedans;
  }
  return dedans;
}

interface Boite {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
const boiteDe = (pts: Pt[]): Boite => ({
  x0: Math.min(...pts.map((p) => p.x)),
  x1: Math.max(...pts.map((p) => p.x)),
  z0: Math.min(...pts.map((p) => p.z)),
  z1: Math.max(...pts.map((p) => p.z)),
});

/**
 * LA RÉGION ∪A − ∪B, en contours — le moteur du poché.
 *
 * Tous les bords sont découpés à leurs croisements ; un morceau est gardé
 * s'il a la région d'un côté et pas de l'autre, et orienté pour la laisser à
 * sa gauche. Les contours qui en sortent se remplissent en pair-impair : les
 * pièces sont des trous dans la maçonnerie.
 */
export function region(A: Poly[], B: Poly[] = []): Poly[] {
  const polys = [...A, ...B].filter((p) => p.length >= 3);
  const boitesA = A.map(boiteDe);
  const boitesB = B.map(boiteDe);
  const dansA = (p: Pt) => A.some((q, i) => p.x >= boitesA[i].x0 && p.x <= boitesA[i].x1 && p.z >= boitesA[i].z0 && p.z <= boitesA[i].z1 && dansPoly(p, q));
  const dansB = (p: Pt) => B.some((q, i) => p.x >= boitesB[i].x0 && p.x <= boitesB[i].x1 && p.z >= boitesB[i].z0 && p.z <= boitesB[i].z1 && dansPoly(p, q));
  const dansR = (p: Pt) => dansA(p) && !dansB(p);

  const aretes: { a: Pt; b: Pt; boite: Boite }[] = [];
  for (const p of polys) {
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-9) continue;
      aretes.push({ a, b, boite: boiteDe([a, b]) });
    }
  }

  // Les points se recollent au micron : deux calculs du même croisement
  // doivent tomber sur le même sommet, sinon les contours ne se ferment pas.
  const grille = new Map<string, Pt>();
  const Q = 1e-6;
  const canon = (p: Pt): Pt => {
    const ix = Math.round(p.x / Q);
    const iz = Math.round(p.z / Q);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const deja = grille.get(`${ix + dx}:${iz + dz}`);
        if (deja && Math.abs(deja.x - p.x) <= 1.5 * Q && Math.abs(deja.z - p.z) <= 1.5 * Q) return deja;
      }
    }
    grille.set(`${ix}:${iz}`, p);
    return p;
  };
  const cle = (p: Pt) => `${Math.round(p.x / Q)}:${Math.round(p.z / Q)}`;

  /*
    LES CROISEMENTS, PAR BALAYAGE — les bords triés par leur abscisse
    gauche : un bord ne se compare qu'à ceux qui commencent avant sa fin, et
    chaque croisement se calcule UNE fois, pour les deux bords. Le poché se
    refait à chaque image d'un mur qu'on fait glisser.
  */
  const coupes: number[][] = aretes.map(() => [0, 1]);
  const ordre = aretes.map((_, i) => i).sort((i, j) => aretes[i].boite.x0 - aretes[j].boite.x0);
  for (let oi = 0; oi < ordre.length; oi++) {
    const i = ordre[oi];
    const e = aretes[i];
    const ex = e.b.x - e.a.x;
    const ez = e.b.z - e.a.z;
    const l2e = ex * ex + ez * ez;
    for (let oj = oi + 1; oj < ordre.length; oj++) {
      const j = ordre[oj];
      const f = aretes[j];
      if (f.boite.x0 > e.boite.x1 + 1e-7) break;
      if (f.boite.z0 > e.boite.z1 + 1e-7 || e.boite.z0 > f.boite.z1 + 1e-7) continue;
      const fx = f.b.x - f.a.x;
      const fz = f.b.z - f.a.z;
      const l2f = fx * fx + fz * fz;
      const d = cross(ex, ez, fx, fz);
      const wx = f.a.x - e.a.x;
      const wz = f.a.z - e.a.z;
      if (Math.abs(d) > 1e-12 * Math.sqrt(l2e * l2f)) {
        const t = cross(wx, wz, fx, fz) / d;
        const u = cross(wx, wz, ex, ez) / d;
        if (t > -1e-9 && t < 1 + 1e-9 && u > -1e-9 && u < 1 + 1e-9) {
          coupes[i].push(Math.min(1, Math.max(0, t)));
          coupes[j].push(Math.min(1, Math.max(0, u)));
        }
      } else if (Math.abs(cross(wx, wz, ex, ez)) / Math.sqrt(l2e) < 1e-7) {
        // Colinéaires : chacun se coupe aux bouts de l'autre.
        for (const q of [f.a, f.b]) {
          const t = ((q.x - e.a.x) * ex + (q.z - e.a.z) * ez) / l2e;
          if (t > 1e-9 && t < 1 - 1e-9) coupes[i].push(t);
        }
        for (const q of [e.a, e.b]) {
          const u = ((q.x - f.a.x) * fx + (q.z - f.a.z) * fz) / l2f;
          if (u > 1e-9 && u < 1 - 1e-9) coupes[j].push(u);
        }
      }
    }
  }

  const morceaux: { a: Pt; b: Pt }[] = [];
  for (let i = 0; i < aretes.length; i++) {
    const e = aretes[i];
    const ex = e.b.x - e.a.x;
    const ez = e.b.z - e.a.z;
    const ts = coupes[i];
    ts.sort((x, y) => x - y);
    let prec = 0;
    for (let k = 1; k < ts.length; k++) {
      const t = ts[k];
      if (t - prec < 1e-9) continue;
      const a = { x: e.a.x + ex * prec, z: e.a.z + ez * prec };
      const b = { x: e.a.x + ex * t, z: e.a.z + ez * t };
      prec = t;
      // Le morceau sépare-t-il la région du reste ? On regarde de part et d'autre.
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 1e-8) continue;
      const nx = -(b.z - a.z) / L;
      const nz = (b.x - a.x) / L;
      const eps = 2e-5;
      const gauche = dansR({ x: mx + nx * eps, z: mz + nz * eps });
      const droite = dansR({ x: mx - nx * eps, z: mz - nz * eps });
      if (gauche === droite) continue;
      morceaux.push(gauche ? { a: canon(a), b: canon(b) } : { a: canon(b), b: canon(a) });
    }
  }

  // Un même bord vu par deux murs n'en fait qu'un.
  const vus = new Set<string>();
  const uniques = morceaux.filter((m) => {
    const k = `${cle(m.a)}>${cle(m.b)}`;
    if (vus.has(k) || cle(m.a) === cle(m.b)) return false;
    vus.add(k);
    return true;
  });

  // Les morceaux se chaînent en contours.
  const partants = new Map<string, number[]>();
  uniques.forEach((m, i) => {
    const k = cle(m.a);
    const l = partants.get(k) ?? [];
    l.push(i);
    partants.set(k, l);
  });
  const pris = new Array(uniques.length).fill(false);
  const contours: Poly[] = [];
  for (let i = 0; i < uniques.length; i++) {
    if (pris[i]) continue;
    const depart = cle(uniques[i].a);
    const pts: Pt[] = [uniques[i].a];
    let cour = i;
    for (let garde = 0; garde < uniques.length + 2; garde++) {
      pris[cour] = true;
      const fin = uniques[cour].b;
      if (cle(fin) === depart) break;
      pts.push(fin);
      const suite = (partants.get(cle(fin)) ?? []).find((j) => !pris[j]);
      if (suite === undefined) break;
      cour = suite;
    }
    const simple = simplifier(pts);
    if (simple.length >= 3 && Math.abs(aireSignee(simple)) > 1e-8) contours.push(simple);
  }
  return contours;
}

/** Retire les sommets alignés et les doublons : un mur droit est UN trait. */
function simplifier(p: Poly): Poly {
  let pts = p.slice();
  let change = true;
  while (change && pts.length >= 3) {
    change = false;
    const out: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const bcx = c.x - b.x;
      const bcz = c.z - b.z;
      const lab = Math.hypot(abx, abz);
      const lbc = Math.hypot(bcx, bcz);
      if (lab < 1e-7) {
        change = true;
        continue;
      }
      if (lbc > 1e-7 && Math.abs(cross(abx, abz, bcx, bcz)) / (lab * lbc) < 1e-7 && abx * bcx + abz * bcz > 0) {
        change = true;
        continue;
      }
      out.push(b);
    }
    pts = out;
  }
  return pts;
}

// ------------------------------------------------------------ le poché

export interface BaieDuPoche {
  id: string;
  type: string;
  a: Pt;
  b: Pt;
  /** Normale unitaire du mur porteur. */
  n: Pt;
  /** Jusqu'où va la maçonnerie, de part et d'autre de l'axe (m). */
  plus: number;
  moins: number;
}

export interface Poche {
  /** Les contours de la maçonnerie, à remplir en pair-impair. */
  contours: Poly[];
  /** Chaque baie, avec l'épaisseur du mur où elle se loge. */
  baies: BaieDuPoche[];
}

/** Le mur qui porte une baie : celui dont l'axe la contient. */
function porteurDe(o: WallSeg, walls: WallSeg[]): WallSeg | null {
  let mieux: WallSeg | null = null;
  let ecart = Infinity;
  for (const w of walls) {
    if (w.type !== 'wall' && w.type !== undefined) continue;
    const da = pointOnSeg(o.a, w.a, w.b);
    const db = pointOnSeg(o.b, w.a, w.b);
    const tol = Math.max(epaisseurDe(w), 0.1);
    if (da.dist > tol || db.dist > tol) continue;
    if (da.t < -0.02 || da.t > 1.02 || db.t < -0.02 || db.t > 1.02) continue;
    const e = da.dist + db.dist;
    if (e < ecart) {
      ecart = e;
      mieux = w;
    }
  }
  return mieux;
}

let memo: { walls: WallSeg[]; openings: WallSeg[]; rooms: RoomShape[] | undefined; facade: number; poche: Poche } | null = null;

/**
 * LE POCHÉ D'UN PLAN : la maçonnerie d'un seul tenant, façades épaissies,
 * baies découpées. Mémoïsé sur l'identité des listes, comme `wallQuadsOf`.
 */
export function pocheDesMurs(
  walls: WallSeg[],
  openings: WallSeg[] = [],
  rooms?: RoomShape[],
  facade = SUREPAISSEUR_FACADE,
): Poche {
  if (memo && memo.walls === walls && memo.openings === openings && memo.rooms === rooms && memo.facade === facade) {
    return memo.poche;
  }
  const quads = wallQuadsOf(walls);
  const corps: Poly[] = [];
  for (const w of walls) {
    if (Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z) < 1e-6) continue;
    const q = quads.get(w.id);
    if (!q) continue;
    corps.push([q.a1, q.b1, q.b2, q.a2]);
  }
  // Le cœur des nœuds de trois murs : la maçonnerie commune, sans laquelle
  // les murs ne se toucheraient qu'en un point.
  corps.push(...jonctionsDeMurs(walls));

  // Les pièces : ce qui est dedans. Une façade donne sur ce qui n'en est pas.
  const pieces = roomParts(walls, rooms)
    .map((p) => p.surface?.pts)
    .filter((p): p is Pt[] => !!p && p.length >= 3);
  const dansUnePiece = (p: Pt) => pieces.some((poly) => dansPoly(p, poly));

  // 1. La maçonnerie à l'épaisseur des murs.
  const brute = region(corps);

  // 2. La bande de façade, le long des bords extérieurs qui donnent dehors.
  const bandes: Poly[] = [];
  if (facade > 0) {
    for (const c of brute) {
      if (aireSignee(c) <= 0) continue; // un trou : une pièce, pas le dehors
      const n = c.length;
      const dehors: boolean[] = [];
      const normales: Pt[] = [];
      for (let i = 0; i < n; i++) {
        const a = c[i];
        const b = c[(i + 1) % n];
        const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        // La région est à gauche : le dehors, à droite.
        const nr = { x: (b.z - a.z) / L, z: -(b.x - a.x) / L };
        normales.push(nr);
        const m = { x: (a.x + b.x) / 2 + nr.x * 0.3, z: (a.z + b.z) / 2 + nr.z * 0.3 };
        const d = !dansUnePiece(m);
        dehors.push(d);
        if (d) {
          bandes.push([a, b, { x: b.x + nr.x * facade, z: b.z + nr.z * facade }, { x: a.x + nr.x * facade, z: a.z + nr.z * facade }]);
        }
      }
      // Les angles saillants entre deux bords de façade : le coin plein.
      for (let i = 0; i < n; i++) {
        const prec = (i - 1 + n) % n;
        if (!dehors[i] || !dehors[prec]) continue;
        const p = c[i];
        const a = c[prec];
        const b = c[(i + 1) % n];
        const tourne = cross(p.x - a.x, p.z - a.z, b.x - p.x, b.z - p.z);
        if (tourne <= 1e-12) continue; // un angle rentrant : les bandes s'y recouvrent déjà
        const n1 = normales[prec];
        const n2 = normales[i];
        const dot = n1.x * n2.x + n1.z * n2.z;
        const k = 1 + dot < 0.15 ? 0 : facade / (1 + dot);
        const m = k > 0 ? { x: p.x + (n1.x + n2.x) * k, z: p.z + (n1.z + n2.z) * k } : { x: p.x + n2.x * facade, z: p.z + n2.z * facade };
        bandes.push([p, { x: p.x + n1.x * facade, z: p.z + n1.z * facade }, m, { x: p.x + n2.x * facade, z: p.z + n2.z * facade }]);
      }
    }
  }

  // 3. Les baies : un vide à travers toute l'épaisseur.
  const vides: Poly[] = [];
  const baies: BaieDuPoche[] = [];
  for (const o of openings) {
    const w = porteurDe(o, walls);
    const dx = o.b.x - o.a.x;
    const dz = o.b.z - o.a.z;
    const L = Math.hypot(dx, dz);
    if (L < 1e-4) continue;
    const ux = (w ? w.b.x - w.a.x : dx) / (w ? Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z) : L);
    const uz = (w ? w.b.z - w.a.z : dz) / (w ? Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z) : L);
    const n = { x: -uz, z: ux };
    const h = (w ? epaisseurDe(w) : 0.14) / 2;
    // Les deux bouts, ramenés sur l'axe du mur porteur.
    const sur = (p: Pt) => {
      if (!w) return p;
      const t = (p.x - w.a.x) * ux + (p.z - w.a.z) * uz;
      return { x: w.a.x + ux * t, z: w.a.z + uz * t };
    };
    const a = sur(o.a);
    const b = sur(o.b);
    const milieu = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const coteDehors = (s: number) => !dansUnePiece({ x: milieu.x + n.x * s * (h + 0.3), z: milieu.z + n.z * s * (h + 0.3) });
    const plusDehors = coteDehors(1);
    const moinsDehors = coteDehors(-1);
    // Une façade n'a de dehors que d'un côté ; deux dehors, c'est un mur isolé.
    const plus = h + (plusDehors && !moinsDehors ? facade : 0);
    const moins = h + (moinsDehors && !plusDehors ? facade : 0);
    baies.push({ id: o.id, type: o.type, a, b, n, plus, moins });
    const e = 0.02;
    vides.push([
      { x: a.x + n.x * (plus + e), z: a.z + n.z * (plus + e) },
      { x: b.x + n.x * (plus + e), z: b.z + n.z * (plus + e) },
      { x: b.x - n.x * (moins + e), z: b.z - n.z * (moins + e) },
      { x: a.x - n.x * (moins + e), z: a.z - n.z * (moins + e) },
    ]);
  }

  const contours = region([...corps, ...bandes], vides);
  const poche = { contours, baies };
  memo = { walls, openings, rooms, facade, poche };
  return poche;
}

/** Les contours en chemin SVG, à remplir en pair-impair. */
export function cheminDuPoche(contours: Poly[], toPx: (p: Pt) => { x: number; y: number }): string {
  return contours
    .map(
      (c) =>
        c
          .map((p, i) => {
            const q = toPx(p);
            return `${i === 0 ? 'M' : 'L'}${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
          })
          .join(' ') + ' Z',
    )
    .join(' ');
}

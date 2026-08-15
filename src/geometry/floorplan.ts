import type { ObjectData, SurfaceData, SurfaceTexture } from 'react-native-room-scan';

/** Épaisseur donnée aux murs dans tous les rendus (m). */
export const WALL_T = 0.14;

/** Point au sol, en mètres (repère monde, plan XZ). */
export interface Pt {
  x: number;
  z: number;
}

/** Segment de mur au sol, en mètres (repère monde, plan XZ). */
export interface WallSeg {
  id: string;
  type: 'wall' | 'door' | 'window' | 'opening';
  a: Pt;
  b: Pt;
  height: number;
  /** Hauteur du centre de la surface (m, repère monde) — sert à la vue 3D. */
  yCenter: number;
  /** Couleur moyenne relevée pendant le scan (#RRGGBB), si captée. */
  color?: string;
  /** Grille de couleurs relevée sur la face intérieure, si captée. */
  texture?: SurfaceTexture;
}

/** Empreinte au sol d'un objet (rectangle orienté). */
export interface ObjectFootprint {
  id: string;
  category: string;
  cx: number;
  cz: number;
  width: number;
  depth: number;
  height: number;
  yCenter: number;
  /** Rotation autour de Y, en radians. */
  yaw: number;
  /** Couleur moyenne relevée pendant le scan (#RRGGBB), si captée. */
  color?: string;
}

/**
 * Convertit une surface native en segment au sol.
 * iOS livre une matrice 4x4 colonne-major : colonne 0 = direction du mur,
 * colonne 3 = position. Android livre directement ax/az/bx/bz.
 */
export function toSegment(s: SurfaceData): WallSeg {
  const skin = { color: s.color, texture: s.texture };
  if (s.ax !== undefined) {
    return {
      id: s.id,
      type: s.type,
      a: { x: s.ax!, z: s.az! },
      b: { x: s.bx!, z: s.bz! },
      height: s.height,
      yCenter: s.height / 2,
      ...skin,
    };
  }
  const m = s.transform!;
  const dir = { x: m[0], z: m[2] };
  const pos = { x: m[12], z: m[14] };
  const h = s.length / 2;
  return {
    id: s.id,
    type: s.type,
    a: { x: pos.x - dir.x * h, z: pos.z - dir.z * h },
    b: { x: pos.x + dir.x * h, z: pos.z + dir.z * h },
    height: s.height,
    yCenter: m[13],
    ...skin,
  };
}

export function toFootprint(o: ObjectData): ObjectFootprint {
  const m = o.transform;
  return {
    id: o.id,
    category: o.category,
    cx: m[12],
    cz: m[14],
    width: o.width,
    depth: o.depth,
    height: o.height,
    yCenter: m[13],
    yaw: Math.atan2(m[2], m[0]),
    color: o.color,
  };
}

/**
 * Si les murs forment une boucle fermée (chaque coin relie exactement
 * deux murs), renvoie les coins ordonnés le long de la boucle — sinon null.
 * Sert au calcul de surface et au sol de la vue 3D.
 */
export function closedLoop(walls: WallSeg[]): { x: number; z: number }[] | null {
  if (walls.length < 3) return null;
  const key = (p: { x: number; z: number }) => `${p.x.toFixed(3)}:${p.z.toFixed(3)}`;
  const adj = new Map<string, { wallId: string; to: { x: number; z: number } }[]>();
  for (const w of walls) {
    for (const [from, to] of [
      [w.a, w.b],
      [w.b, w.a],
    ] as const) {
      const k = key(from);
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k)!.push({ wallId: w.id, to });
    }
  }
  for (const [, edges] of adj) {
    if (edges.length !== 2) return null;
  }
  const start = walls[0].a;
  const used = new Set<string>();
  const pts: { x: number; z: number }[] = [];
  let cur = start;
  for (let i = 0; i < walls.length; i++) {
    pts.push(cur);
    const next = adj.get(key(cur))!.find((e) => !used.has(e.wallId));
    if (!next) return null;
    used.add(next.wallId);
    cur = next.to;
  }
  if (key(cur) !== key(start) || used.size !== walls.length) return null;
  return pts;
}

/** Aire (m²) d'un polygone par la formule du lacet. */
export function loopAreaM2(pts: { x: number; z: number }[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    sum += p.x * q.z - q.x * p.z;
  }
  return Math.abs(sum) / 2;
}

export function segLength(w: WallSeg): number {
  return Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
}

// ------------------------------------------------------ jonctions de murs

const nodeKey = (p: Pt) => `${p.x.toFixed(3)}:${p.z.toFixed(3)}`;
/** Normale « gauche » d'une direction unitaire. */
const perp = (d: Pt): Pt => ({ x: -d.z, z: d.x });

/**
 * Corps d'un mur au sol : quadrilatère à coins d'onglet.
 * `a1/b1` longent la face +n (n = normale gauche de a→b), `b2/a2` la face −n.
 */
export interface WallQuad {
  a1: Pt;
  b1: Pt;
  b2: Pt;
  a2: Pt;
}

interface Arm {
  wallId: string;
  end: 'a' | 'b';
  /** Direction unitaire du mur EN PARTANT du nœud. */
  dir: Pt;
  angle: number;
}

/** Intersection de deux droites (point + direction). Null si parallèles. */
function lineCross(p1: Pt, d1: Pt, p2: Pt, d2: Pt): Pt | null {
  const den = d1.x * d2.z - d1.z * d2.x;
  if (Math.abs(den) < 1e-9) return null;
  const s = ((p2.x - p1.x) * d2.z - (p2.z - p1.z) * d2.x) / den;
  return { x: p1.x + d1.x * s, z: p1.z + d1.z * s };
}

/** Distance d'un point à un segment, et position relative le long du segment. */
function pointOnSeg(p: Pt, a: Pt, b: Pt): { dist: number; t: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-12) return { dist: Math.hypot(p.x - a.x, p.z - a.z), t: 0 };
  const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2;
  const tc = Math.min(1, Math.max(0, t));
  return {
    dist: Math.hypot(p.x - (a.x + dx * tc), p.z - (a.z + dz * tc)),
    t,
  };
}

/**
 * Géométrie des murs épais avec de VRAIES jonctions.
 *
 * À chaque nœud, les bras (murs qui s'y rejoignent) sont triés par angle ;
 * entre deux bras consécutifs, les deux faces qui bordent le secteur sont
 * prolongées et coupées l'une par l'autre : c'est l'onglet. Le coin est donc
 * partagé au point près par les deux murs — plus d'interpénétration, plus de
 * trou, et le résultat est identique en 2D, en 3D et dans le PDF.
 *
 * Cas particuliers : une extrémité libre reçoit un about droit ; si elle
 * s'appuie sur le flanc d'un autre mur (jonction en T), elle est prolongée
 * d'une demi-épaisseur pour entrer dans son corps sans laisser de fente.
 */
export function wallQuads(walls: WallSeg[], t = WALL_T): Map<string, WallQuad> {
  const half = t / 2;
  const arms = new Map<string, Arm[]>();

  for (const w of walls) {
    const dx = w.b.x - w.a.x;
    const dz = w.b.z - w.a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const u = { x: dx / len, z: dz / len };
    for (const end of ['a', 'b'] as const) {
      const dir = end === 'a' ? u : { x: -u.x, z: -u.z };
      const k = nodeKey(w[end]);
      const list = arms.get(k) ?? [];
      list.push({ wallId: w.id, end, dir, angle: Math.atan2(dir.z, dir.x) });
      arms.set(k, list);
    }
  }

  const out = new Map<string, WallQuad>();
  const corner = (id: string, end: 'a' | 'b', side: 1 | -1, p: Pt) => {
    const q =
      out.get(id) ??
      ({ a1: p, b1: p, b2: p, a2: p } as WallQuad);
    if (end === 'a') {
      if (side === 1) q.a1 = p;
      else q.a2 = p;
    } else if (side === 1) {
      q.b1 = p;
    } else {
      q.b2 = p;
    }
    out.set(id, q);
  };

  for (const [k, list] of arms) {
    const [xs, zs] = k.split(':');
    const P: Pt = { x: parseFloat(xs), z: parseFloat(zs) };

    // Extrémité libre : about droit, prolongé si elle bute sur un autre mur.
    if (list.length === 1) {
      const arm = list[0];
      const tee = walls.some((v) => {
        if (v.id === arm.wallId) return false;
        const { dist, t: pos } = pointOnSeg(P, v.a, v.b);
        return dist < t && pos > 0.02 && pos < 0.98;
      });
      // Le prolongement part À L'OPPOSÉ du corps du mur, dans celui du voisin.
      const C = tee
        ? { x: P.x - arm.dir.x * half, z: P.z - arm.dir.z * half }
        : P;
      const nrm = perp(arm.dir);
      // +perp(dir) vaut +n en 'a' (dir = u) mais −n en 'b' (dir = −u).
      const sPlus: 1 | -1 = arm.end === 'a' ? 1 : -1;
      corner(arm.wallId, arm.end, sPlus, {
        x: C.x + nrm.x * half,
        z: C.z + nrm.z * half,
      });
      corner(arm.wallId, arm.end, sPlus === 1 ? -1 : 1, {
        x: C.x - nrm.x * half,
        z: C.z - nrm.z * half,
      });
      continue;
    }

    const sorted = [...list].sort((p, q) => p.angle - q.angle);
    for (let i = 0; i < sorted.length; i++) {
      const A = sorted[i];
      const B = sorted[(i + 1) % sorted.length];
      const na = perp(A.dir);
      const nb = perp(B.dir);
      // Faces qui bordent le secteur A→B : côté +perp pour A, −perp pour B.
      const pa = { x: P.x + na.x * half, z: P.z + na.z * half };
      const pb = { x: P.x - nb.x * half, z: P.z - nb.z * half };
      let X = lineCross(pa, A.dir, pb, B.dir);
      // Murs alignés (secteur plat ou replié) : pas d'onglet, on reste au bord.
      if (!X) X = pa;
      // Angle très aigu : l'onglet part à l'infini, on l'écrête.
      const d = Math.hypot(X.x - P.x, X.z - P.z);
      const maxOut = t * 3;
      if (d > maxOut) {
        X = {
          x: P.x + ((X.x - P.x) / d) * maxOut,
          z: P.z + ((X.z - P.z) / d) * maxOut,
        };
      }
      corner(A.wallId, A.end, A.end === 'a' ? 1 : -1, X);
      corner(B.wallId, B.end, B.end === 'a' ? -1 : 1, X);
    }
  }

  // Murs de longueur nulle ignorés plus haut : quad dégénéré mais défini.
  for (const w of walls) {
    if (!out.has(w.id)) {
      out.set(w.id, { a1: w.a, b1: w.b, b2: w.b, a2: w.a });
    }
  }
  return out;
}

/** Contour fermé d'un corps de mur, dans l'ordre de tracé. */
export function quadPoints(q: WallQuad): Pt[] {
  return [q.a1, q.b1, q.b2, q.a2];
}

// -------------------------------------------------------- surface au sol

export interface RoomSurface {
  /** Contour de la pièce (polygone fermé, sens quelconque). */
  pts: Pt[];
  /** Aire en m². */
  area: number;
  /** false = la boucle de murs n'était pas fermée, le contour est reconstitué. */
  exact: boolean;
}

/**
 * Contour et surface au sol de la pièce.
 * Boucle fermée → contour exact. Sinon, la plus longue chaîne de murs est
 * refermée sur elle-même : la surface reste indicative (`exact: false`).
 */
export function roomSurface(walls: WallSeg[]): RoomSurface | null {
  const loop = closedLoop(walls);
  if (loop) return { pts: loop, area: loopAreaM2(loop), exact: true };

  const chain = longestChain(walls);
  if (chain.length < 3) return null;
  return { pts: chain, area: loopAreaM2(chain), exact: false };
}

/** Plus longue suite de murs bout à bout (les coins sont déjà soudés). */
function longestChain(walls: WallSeg[]): Pt[] {
  const adj = new Map<string, { wallId: string; to: Pt }[]>();
  for (const w of walls) {
    for (const [from, to] of [
      [w.a, w.b],
      [w.b, w.a],
    ] as const) {
      const k = nodeKey(from);
      const l = adj.get(k) ?? [];
      l.push({ wallId: w.id, to });
      adj.set(k, l);
    }
  }
  let best: Pt[] = [];
  for (const w of walls) {
    for (const start of [w.a, w.b]) {
      const used = new Set<string>();
      const pts: Pt[] = [start];
      let cur = start;
      for (;;) {
        const next = (adj.get(nodeKey(cur)) ?? []).find(
          (e) => !used.has(e.wallId),
        );
        if (!next) break;
        used.add(next.wallId);
        cur = next.to;
        if (nodeKey(cur) === nodeKey(start)) break;
        pts.push(cur);
      }
      if (pts.length > best.length) best = pts;
    }
  }
  return best;
}

/** Barycentre des extrémités de murs : « l'intérieur » de la pièce. */
export function wallsCentroid(walls: WallSeg[]): { x: number; z: number } {
  if (walls.length === 0) return { x: 0, z: 0 };
  let x = 0;
  let z = 0;
  for (const w of walls) {
    x += w.a.x + w.b.x;
    z += w.a.z + w.b.z;
  }
  return { x: x / (walls.length * 2), z: z / (walls.length * 2) };
}

/**
 * Recale un meuble DEVANT les murs : tout coin de son empreinte qui pénètre
 * l'épaisseur d'un mur (ou passe derrière) pousse le meuble vers l'intérieur
 * de la pièce. Utilisé par le plan 2D, la vue 3D et le PDF.
 */
export function clampFootprint(
  f: ObjectFootprint,
  walls: WallSeg[],
  interior: { x: number; z: number },
  wallT = WALL_T,
  margin = 0.02,
): ObjectFootprint {
  let cx = f.cx;
  let cz = f.cz;
  const cos = Math.cos(f.yaw);
  const sin = Math.sin(f.yaw);
  const localCorners: [number, number][] = [
    [-f.width / 2, -f.depth / 2],
    [f.width / 2, -f.depth / 2],
    [f.width / 2, f.depth / 2],
    [-f.width / 2, f.depth / 2],
  ];
  for (const w of walls) {
    const dx = w.b.x - w.a.x;
    const dz = w.b.z - w.a.z;
    const len = Math.hypot(dx, dz) || 1;
    // Ne considérer que les murs que le meuble longe réellement.
    const t = ((cx - w.a.x) * dx + (cz - w.a.z) * dz) / (len * len);
    if (t < -0.1 || t > 1.1) continue;
    const nx = -dz / len;
    const nz = dx / len;
    // Le meuble reste de SON côté du mur (jamais poussé à travers) :
    // le côté est celui de son centre — au pire tie-break vers l'intérieur.
    const dCenter = (cx - w.a.x) * nx + (cz - w.a.z) * nz;
    const side =
      Math.abs(dCenter) > 1e-6
        ? Math.sign(dCenter)
        : Math.sign((interior.x - w.a.x) * nx + (interior.z - w.a.z) * nz) || 1;
    let minCorner = Infinity;
    for (const [lx, lz] of localCorners) {
      const px = cx + lx * cos - lz * sin;
      const pz = cz + lx * sin + lz * cos;
      const d = side * ((px - w.a.x) * nx + (pz - w.a.z) * nz);
      if (d < minCorner) minCorner = d;
    }
    const need = wallT / 2 + margin - minCorner;
    // Petite pénétration = frottement de détection : on écarte le meuble.
    // Grosse valeur = il vit ailleurs : on ne le téléporte pas.
    if (need > 0 && need < 0.3) {
      cx += nx * side * need;
      cz += nz * side * need;
    }
  }
  return { ...f, cx, cz };
}

/**
 * Soudure des coins : les extrémités distantes de moins de `tol` mètres
 * sont ramenées sur un point commun (moyenne du cluster), puis une extrémité
 * restée libre qui frôle le flanc d'un autre mur est projetée dessus
 * (jonction en T). Le plan devient réellement connexe : les onglets de
 * `wallQuads` ont alors de vrais nœuds à traiter.
 *
 * Ne modifie pas les murs reçus : renvoie de nouveaux segments.
 */
export function weldCorners(walls: WallSeg[], tol = 0.15): WallSeg[] {
  const out = walls.map((w) => ({ ...w, a: { ...w.a }, b: { ...w.b } }));
  const points: { wall: WallSeg; end: 'a' | 'b' }[] = [];
  for (const w of out) {
    points.push({ wall: w, end: 'a' }, { wall: w, end: 'b' });
  }

  const assigned = new Set<number>();
  const welded = new Set<number>();
  for (let i = 0; i < points.length; i++) {
    if (assigned.has(i)) continue;
    const pi = points[i].wall[points[i].end];
    const cluster = [i];
    for (let j = i + 1; j < points.length; j++) {
      if (assigned.has(j)) continue;
      const pj = points[j].wall[points[j].end];
      if (Math.hypot(pi.x - pj.x, pi.z - pj.z) < tol) cluster.push(j);
    }
    if (cluster.length > 1) {
      const cx =
        cluster.reduce((s, k) => s + points[k].wall[points[k].end].x, 0) /
        cluster.length;
      const cz =
        cluster.reduce((s, k) => s + points[k].wall[points[k].end].z, 0) /
        cluster.length;
      for (const k of cluster) {
        points[k].wall[points[k].end] = { x: cx, z: cz };
        assigned.add(k);
        welded.add(k);
      }
    }
  }

  // Jonctions en T : extrémité libre posée sur le flanc d'un autre mur.
  const teeTol = tol * 1.6;
  for (let i = 0; i < points.length; i++) {
    if (welded.has(i)) continue;
    const { wall, end } = points[i];
    const p = wall[end];
    let best: { d: number; q: Pt } | null = null;
    for (const v of out) {
      if (v.id === wall.id) continue;
      const dx = v.b.x - v.a.x;
      const dz = v.b.z - v.a.z;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-9) continue;
      const t = ((p.x - v.a.x) * dx + (p.z - v.a.z) * dz) / len2;
      if (t < 0.03 || t > 0.97) continue; // proche d'un bout : c'est un coin
      const q = { x: v.a.x + dx * t, z: v.a.z + dz * t };
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d < teeTol && (!best || d < best.d)) best = { d, q };
    }
    if (best) wall[end] = best.q;
  }

  return out;
}

export interface Bounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export function bounds(walls: WallSeg[]): Bounds {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
  }
  if (!isFinite(minX)) return { minX: -2, minZ: -2, maxX: 2, maxZ: 2 };
  return { minX, minZ, maxX, maxZ };
}

/** Projection mètres → pixels pour le rendu SVG du plan. */
export function makeMapping(b: Bounds, viewW: number, viewH: number, margin = 40) {
  const w = Math.max(b.maxX - b.minX, 0.5);
  const h = Math.max(b.maxZ - b.minZ, 0.5);
  const scale = Math.min((viewW - margin * 2) / w, (viewH - margin * 2) / h);
  const ox = (viewW - w * scale) / 2 - b.minX * scale;
  const oz = (viewH - h * scale) / 2 - b.minZ * scale;
  return {
    scale,
    toPx: (p: { x: number; z: number }) => ({ x: p.x * scale + ox, y: p.z * scale + oz }),
    toMeters: (px: { x: number; y: number }) => ({ x: (px.x - ox) / scale, z: (px.y - oz) / scale }),
  };
}

export type Mapping = ReturnType<typeof makeMapping>;

/** Snap angulaire : colle le mur à l'horizontale/verticale s'il en est à moins de `deg` degrés. */
export function snapAngle(fixed: { x: number; z: number }, moving: { x: number; z: number }, deg = 5) {
  const dx = moving.x - fixed.x;
  const dz = moving.z - fixed.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return moving;
  const angle = Math.atan2(dz, dx);
  const step = Math.PI / 2;
  const snapped = Math.round(angle / step) * step;
  if (Math.abs(angle - snapped) < (deg * Math.PI) / 180) {
    return { x: fixed.x + len * Math.cos(snapped), z: fixed.z + len * Math.sin(snapped) };
  }
  return moving;
}

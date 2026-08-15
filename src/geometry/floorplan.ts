import type { ObjectData, SurfaceData, SurfaceTexture } from 'react-native-room-scan';

/** Épaisseur donnée aux murs dans tous les rendus (m). */
export const WALL_T = 0.14;

/** Point au sol, en mètres (repère monde, plan XZ). */
export interface Pt {
  x: number;
  z: number;
}

/**
 * Pièce d'appartenance par défaut : les scans d'avant le multi-pièces, et
 * tout élément dont la pièce n'a pas été renseignée, tombent ici.
 */
export const DEFAULT_ROOM_ID = 'room-1';

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
  /** Pièce à laquelle ce mur appartient (scan multi-pièces). */
  roomId?: string;
}

/** Pièce d'un élément, valeur par défaut comprise. */
export const roomOf = (item: { roomId?: string }): string =>
  item.roomId ?? DEFAULT_ROOM_ID;

/**
 * Répartit des éléments par pièce, en conservant l'ordre d'apparition des
 * pièces. Toute la géométrie (soudure, boucles, surfaces, sols) se calcule
 * pièce par pièce : deux pièces mitoyennes ont chacune leur mur, et rien ne
 * doit les fusionner.
 */
export function groupByRoom<T extends { roomId?: string }>(
  items: T[],
): { roomId: string; items: T[] }[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = roomOf(item);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }
  return order.map((roomId) => ({ roomId, items: map.get(roomId)! }));
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
export function toSegment(s: SurfaceData, roomId?: string): WallSeg {
  const skin = { color: s.color, texture: s.texture, roomId };
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
  /** Position du nœud (m). */
  p: Pt;
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
export function pointOnSeg(p: Pt, a: Pt, b: Pt): { dist: number; t: number } {
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
  // Deux pièces mitoyennes ont chacune leur mur : leurs bouts ne se
  // prolongent pas l'un dans l'autre, seuls les murs d'une même pièce
  // forment des jonctions.
  const roomById = new Map(walls.map((w) => [w.id, roomOf(w)]));

  for (const w of walls) {
    const dx = w.b.x - w.a.x;
    const dz = w.b.z - w.a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const u = { x: dx / len, z: dz / len };
    for (const end of ['a', 'b'] as const) {
      const dir = end === 'a' ? u : { x: -u.x, z: -u.z };
      // Nœud identifié PAR PIÈCE : deux pièces qui se touchent au même point
      // gardent chacune son angle, elles ne s'assemblent pas en onglet.
      const k = `${roomOf(w)}|${nodeKey(w[end])}`;
      const list = arms.get(k) ?? [];
      list.push({
        wallId: w.id,
        end,
        p: w[end],
        dir,
        angle: Math.atan2(dir.z, dir.x),
      });
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

  for (const [, list] of arms) {
    const P: Pt = list[0].p;

    // Extrémité libre : about droit, prolongé si elle bute sur un autre mur.
    if (list.length === 1) {
      const arm = list[0];
      const armRoom = roomById.get(arm.wallId);
      const tee = walls.some((v) => {
        if (v.id === arm.wallId || roomOf(v) !== armRoom) return false;
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

/** Une pièce du plan : ses murs, son contour au sol, son centre. */
export interface RoomPart {
  roomId: string;
  walls: WallSeg[];
  surface: RoomSurface | null;
  centroid: Pt;
  /** Où poser le cartouche : au large, jamais dans un mur ni contre lui. */
  labelAt: Pt;
}

/** Complète une pièce : contour, centre, et point de pose du cartouche. */
function makePart(roomId: string, items: WallSeg[]): RoomPart {
  const surface = roomSurface(items);
  const centroid = wallsCentroid(items);
  return {
    roomId,
    walls: items,
    surface,
    centroid,
    labelAt: surface ? interiorPole(surface.pts) : centroid,
  };
}

/** Ce qu'il faut savoir d'une pièce pour la dessiner : ses murs. */
export interface RoomShape {
  id: string;
  /** Murs qui la bordent. Absent = anciens scans, on retombe sur `roomId`. */
  wallIds?: string[];
}

/**
 * Découpe le plan en pièces. C'est LE point d'entrée du rendu multi-pièces :
 * plan 2D, vue 3D et PDF itèrent tous là-dessus, ce qui garantit que les
 * trois montrent les mêmes contours et les mêmes surfaces.
 *
 * La liste des murs vient de la pièce, pas l'inverse : un refend borde deux
 * pièces à la fois, il figure donc dans les deux listes. Faute de liste
 * (scans d'avant la détection automatique), on regroupe par `roomId`.
 */
export function roomParts(walls: WallSeg[], rooms?: RoomShape[]): RoomPart[] {
  if (rooms && rooms.some((r) => r.wallIds)) {
    const byId = new Map(walls.map((w) => [w.id, w]));
    return rooms.map((r) =>
      makePart(
        r.id,
        (r.wallIds ?? [])
          .map((id) => byId.get(id))
          .filter((w): w is WallSeg => !!w),
      ),
    );
  }
  return groupByRoom(walls).map(({ roomId, items }) => makePart(roomId, items));
}

/** Aire cumulée des pièces ; `exact` tombe dès qu'un contour est reconstitué. */
export function totalArea(
  parts: RoomPart[],
): { area: number; exact: boolean } | null {
  const known = parts.filter((p) => p.surface);
  if (known.length === 0) return null;
  return {
    area: known.reduce((s, p) => s + p.surface!.area, 0),
    exact: known.every((p) => p.surface!.exact),
  };
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

/** Distance d'un point au bord d'un polygone, négative à l'extérieur. */
function signedDistToEdge(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    best = Math.min(best, pointOnSeg(p, poly[j], poly[i]).dist);
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside ? best : -best;
}

/**
 * Point le plus « au large » d'une pièce : celui qui maximise la distance au
 * mur le plus proche.
 *
 * Le barycentre ne convient pas — dans une pièce en L il tombe volontiers
 * dans le mur, ou juste contre. C'est pourtant là qu'on pose le nom de la
 * pièce et sa surface. On balaye donc une grille, puis on affine autour du
 * meilleur point tant que le pas dépasse la précision demandée.
 */
export function interiorPole(poly: Pt[], precision = 0.05): Pt {
  if (poly.length < 3) {
    return poly[0] ?? { x: 0, z: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const w = maxX - minX;
  const h = maxZ - minZ;
  let best = { x: minX + w / 2, z: minZ + h / 2 };
  let bestD = signedDistToEdge(best, poly);
  const N = 12;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const p = { x: minX + (w * i) / N, z: minZ + (h * j) / N };
      const d = signedDistToEdge(p, poly);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  // Affinage : on descend le pas tant qu'il reste au-dessus de la précision.
  let step = Math.max(w, h) / N;
  while (step > precision) {
    let moved = false;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const p = { x: best.x + dx * step, z: best.z + dz * step };
      const d = signedDistToEdge(p, poly);
      if (d > bestD) {
        bestD = d;
        best = p;
        moved = true;
      }
    }
    if (!moved) step /= 2;
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
    // Le meuble est ramené du côté de SA pièce, pas du côté où RoomPlan a
    // cru voir son centre : une télé posée à plat contre un mur ressort
    // volontiers à cheval dessus, et se voyait alors depuis l'autre pièce.
    const side =
      Math.sign((interior.x - w.a.x) * nx + (interior.z - w.a.z) * nz) || 1;
    let minCorner = Infinity;
    for (const [lx, lz] of localCorners) {
      const px = cx + lx * cos - lz * sin;
      const pz = cz + lx * sin + lz * cos;
      const d = side * ((px - w.a.x) * nx + (pz - w.a.z) * nz);
      if (d < minCorner) minCorner = d;
    }
    const need = wallT / 2 + margin - minCorner;
    // On accepte de déplacer jusqu'à la profondeur du meuble : de quoi
    // dégager une télé ou une étagère entièrement enfoncée dans la cloison.
    // Au-delà, le meuble vit ailleurs — on ne le téléporte pas.
    if (need > 0 && need < Math.max(0.3, f.depth + wallT)) {
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
 * La soudure s'arrête AUX LIMITES DE LA PIÈCE : deux pièces voisines ont
 * chacune son mur, souvent à quelques centimètres l'un de l'autre. Les
 * confondre refermerait les deux contours l'un sur l'autre et ferait
 * disparaître les surfaces au sol.
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
    const room = roomOf(points[i].wall);
    const cluster = [i];
    for (let j = i + 1; j < points.length; j++) {
      if (assigned.has(j)) continue;
      if (roomOf(points[j].wall) !== room) continue;
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
    const room = roomOf(wall);
    let best: { d: number; q: Pt } | null = null;
    for (const v of out) {
      if (v.id === wall.id || roomOf(v) !== room) continue;
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

// --------------------------------------- découpe aux jonctions en T

/** Portion [u0, u1] d'une grille de couleurs, colonnes ré-échantillonnées. */
function sliceTexture(
  tex: SurfaceTexture | undefined,
  u0: number,
  u1: number,
): SurfaceTexture | undefined {
  if (!tex || tex.cols < 1 || tex.rows < 1) return undefined;
  const cols = Math.max(1, Math.round(tex.cols * (u1 - u0)));
  const texels: string[] = [];
  for (let r = 0; r < tex.rows; r++) {
    for (let i = 0; i < cols; i++) {
      const u = u0 + (u1 - u0) * ((i + 0.5) / cols);
      const c = Math.min(tex.cols - 1, Math.max(0, Math.floor(u * tex.cols)));
      texels.push(tex.texels[r * tex.cols + c]);
    }
  }
  return { cols, rows: tex.rows, texels };
}

/**
 * Coupe chaque mur là où un autre vient buter contre son flanc.
 *
 * C'est la condition SANS LAQUELLE la détection des pièces ne trouve rien
 * de réel : RoomPlan livre le mur d'enveloppe d'un seul tenant, et la cloison
 * qui sépare deux pièces vient s'y appuyer en son milieu. Tant que ce mur
 * n'est pas coupé au point de contact, ce point n'est pas un nœud du graphe,
 * aucun cycle ne passe par la cloison, et l'appartement entier ressort comme
 * une pièce unique.
 *
 * Le premier morceau garde l'identifiant d'origine : les ouvertures et les
 * sélections en cours continuent de le désigner.
 */
export function splitAtJunctions(walls: WallSeg[], tol = 0.08): WallSeg[] {
  const out: WallSeg[] = [];
  for (const w of walls) {
    const len = segLength(w);
    if (len < 1e-6) {
      out.push(w);
      continue;
    }
    const cuts: number[] = [];
    for (const v of walls) {
      if (v.id === w.id) continue;
      for (const end of ['a', 'b'] as const) {
        const { dist, t } = pointOnSeg(v[end], w.a, w.b);
        if (dist > tol || t <= 0 || t >= 1) continue;
        // Trop près d'un bout : c'est un coin, pas un T — rien à couper.
        if (t * len < 0.2 || (1 - t) * len < 0.2) continue;
        cuts.push(t);
      }
    }
    if (cuts.length === 0) {
      out.push(w);
      continue;
    }
    cuts.sort((a, b) => a - b);
    const uniq = cuts.filter((t, i) => i === 0 || t - cuts[i - 1] > 0.02);
    let prev = 0;
    let n = 0;
    for (const t of [...uniq, 1]) {
      if (t - prev < 1e-6) continue;
      const at = (u: number): Pt => ({
        x: w.a.x + (w.b.x - w.a.x) * u,
        z: w.a.z + (w.b.z - w.a.z) * u,
      });
      out.push({
        ...w,
        id: n === 0 ? w.id : `${w.id}#${n}`,
        a: at(prev),
        b: at(t),
        texture: sliceTexture(w.texture, prev, t),
      });
      prev = t;
      n++;
    }
  }
  return out;
}

// ------------------------------------------- détection des pièces

/** Une pièce trouvée dans le graphe des murs. */
export interface DetectedRoom {
  /** Contour du sol, dans l'ordre du parcours. */
  outline: Pt[];
  /** Murs qui la bordent — un refend est dans DEUX pièces. */
  wallIds: string[];
  /** Aire en m². */
  area: number;
}

/** Aire signée : le sens de parcours distingue l'intérieur de l'extérieur. */
function signedArea(pts: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    sum += p.x * q.z - q.x * p.z;
  }
  return sum / 2;
}

/**
 * Découpe le plan en pièces, tout seul.
 *
 * Un appartement scanné d'une traite est UN graphe de murs : les pièces en
 * sont les faces. On les énumère par le parcours classique des faces d'un
 * graphe planaire — à chaque nœud, on repart par l'arête qui suit
 * immédiatement, dans le sens horaire, celle par laquelle on est arrivé. Le
 * parcours ferme naturellement chaque pièce, et la face extérieure (le tour
 * de l'appartement) sort avec l'orientation inverse : c'est à ça qu'on la
 * reconnaît et qu'on la jette.
 *
 * Un refend appartient donc à deux pièces à la fois — d'où `wallIds` plutôt
 * qu'un `roomId` posé sur le mur. Les murs qui ne ferment rien (bouts
 * pendants, cloison isolée) ne créent pas de pièce : le parcours les longe
 * à l'aller et au retour, leur contribution à l'aire est nulle.
 */
export function detectRooms(walls: WallSeg[], minArea = 1.2): DetectedRoom[] {
  interface HalfEdge {
    wallId: string;
    from: Pt;
    to: Pt;
    angle: number;
  }
  const outgoing = new Map<string, HalfEdge[]>();
  const edges: HalfEdge[] = [];
  for (const w of walls) {
    if (segLength(w) < 1e-6) continue;
    for (const [from, to] of [
      [w.a, w.b],
      [w.b, w.a],
    ] as const) {
      const he: HalfEdge = {
        wallId: w.id,
        from,
        to,
        angle: Math.atan2(to.z - from.z, to.x - from.x),
      };
      edges.push(he);
      const k = nodeKey(from);
      const list = outgoing.get(k) ?? [];
      list.push(he);
      outgoing.set(k, list);
    }
  }
  for (const list of outgoing.values()) list.sort((a, b) => a.angle - b.angle);

  /** Arête suivante de la face : la précédente en angle autour du nœud. */
  const nextOf = (he: HalfEdge): HalfEdge | null => {
    const list = outgoing.get(nodeKey(he.to));
    if (!list || list.length === 0) return null;
    // On repart de l'inverse de l'arête d'arrivée, puis on tourne d'un cran.
    const back = he.angle > 0 ? he.angle - Math.PI : he.angle + Math.PI;
    let idx = list.findIndex(
      (e) => e.wallId === he.wallId && nodeKey(e.to) === nodeKey(he.from),
    );
    if (idx < 0) {
      // Nœud non partagé au point près : on se rabat sur l'angle.
      idx = list.findIndex((e) => Math.abs(e.angle - back) < 1e-6);
      if (idx < 0) return null;
    }
    return list[(idx - 1 + list.length) % list.length];
  };

  const seen = new Set<HalfEdge>();
  const faces: { pts: Pt[]; wallIds: string[]; area: number }[] = [];
  for (const start of edges) {
    if (seen.has(start)) continue;
    const pts: Pt[] = [];
    const ids = new Set<string>();
    let he: HalfEdge | null = start;
    // Garde-fou : un graphe abîmé ne doit pas boucler indéfiniment.
    for (let guard = 0; he && !seen.has(he) && guard <= edges.length; guard++) {
      seen.add(he);
      pts.push(he.from);
      ids.add(he.wallId);
      he = nextOf(he);
    }
    if (pts.length < 3) continue;
    faces.push({ pts, wallIds: [...ids], area: signedArea(pts) });
  }

  // Les faces intérieures tournent toutes dans le même sens ; le contour
  // extérieur, lui, sort à l'envers.
  return faces
    .filter((f) => f.area > 0 && f.area >= minArea)
    .map((f) => ({ outline: f.pts, wallIds: f.wallIds, area: f.area }))
    .sort((a, b) => b.area - a.area);
}

// ------------------------------------------- fusion des murs colinéaires

/** Direction unitaire d'un mur, de a vers b. */
function unit(w: WallSeg): Pt {
  const dx = w.b.x - w.a.x;
  const dz = w.b.z - w.a.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

/**
 * Recompose la grille de couleurs d'un mur fusionné : une colonne tous les
 * ~50 cm, chacune échantillonnée dans le morceau qu'elle recouvre. Sans ça,
 * la texture d'un morceau d'1 m serait étirée sur toute la longueur.
 */
function mergeTextures(
  pieces: { wall: WallSeg; from: Pt; to: Pt; len: number }[],
  total: number,
): SurfaceTexture | undefined {
  if (!pieces.some((p) => p.wall.texture)) return undefined;
  const rows = Math.max(...pieces.map((p) => p.wall.texture?.rows ?? 1));
  const cols = Math.min(24, Math.max(4, Math.round(total / 0.5)));
  const texels: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      const u = ((i + 0.5) / cols) * total;
      // Morceau qui porte cette colonne, et position relative dedans.
      let acc = 0;
      let piece = pieces[pieces.length - 1];
      let local = 1;
      for (const p of pieces) {
        if (u <= acc + p.len || p === pieces[pieces.length - 1]) {
          piece = p;
          local = p.len > 0 ? Math.min(1, Math.max(0, (u - acc) / p.len)) : 0;
          break;
        }
        acc += p.len;
      }
      const tex = piece.wall.texture;
      // `from`/`to` peut être l'inverse du sens propre au morceau : la
      // colonne 0 de sa grille reste son extrémité A d'origine.
      const flipped = piece.from !== piece.wall.a;
      const uu = flipped ? 1 - local : local;
      const cell = tex
        ? tex.texels[
            Math.min(tex.rows - 1, Math.floor(((r + 0.5) / rows) * tex.rows)) *
              tex.cols +
              Math.min(tex.cols - 1, Math.floor(uu * tex.cols))
          ]
        : undefined;
      texels.push(cell ?? piece.wall.color ?? '#FFFFFF');
    }
  }
  return { cols, rows, texels };
}

/**
 * Fusionne les murs colinéaires bout à bout d'une même pièce.
 *
 * RoomPlan livre volontiers un mur droit en deux ou trois morceaux : le plan
 * hérite d'autant de cotes, la vue 3D montre des raccords là où il n'y a
 * qu'une surface, et déplacer le « coin » fantôme entre deux morceaux plie un
 * mur qui devrait rester droit. On ne fusionne qu'à coup sûr : même pièce,
 * extrémités déjà soudées, directions alignées à `angleDeg` près, hauteurs
 * comparables, et jamais un nœud qui porte un troisième mur (un vrai T).
 */
export function mergeColinear(
  walls: WallSeg[],
  angleDeg = 4,
  heightTol = 0.12,
): WallSeg[] {
  const cosMin = Math.cos((angleDeg * Math.PI) / 180);
  const out: WallSeg[] = [];

  for (const { items } of groupByRoom(walls)) {
    // Bras par nœud : une fusion demande exactement deux murs qui s'y touchent.
    const arms = new Map<string, { wall: WallSeg; end: 'a' | 'b' }[]>();
    for (const w of items) {
      for (const end of ['a', 'b'] as const) {
        const k = nodeKey(w[end]);
        const list = arms.get(k) ?? [];
        list.push({ wall: w, end });
        arms.set(k, list);
      }
    }

    /** Le mur qui prolonge `w` au nœud `end`, s'il le prolonge vraiment. */
    const nextAt = (w: WallSeg, end: 'a' | 'b'): WallSeg | null => {
      const list = arms.get(nodeKey(w[end])) ?? [];
      if (list.length !== 2) return null;
      const other = list.find((x) => x.wall.id !== w.id);
      if (!other) return null;
      if (Math.abs(other.wall.height - w.height) > heightTol) return null;
      const u = unit(w);
      const v = unit(other.wall);
      // Directions comparées dans le sens du parcours : le mur suivant doit
      // repartir du nœud dans la même direction qu'on y arrivait.
      const inbound = end === 'b' ? u : { x: -u.x, z: -u.z };
      const outbound = other.end === 'a' ? v : { x: -v.x, z: -v.z };
      const dot = inbound.x * outbound.x + inbound.z * outbound.z;
      return dot >= cosMin ? other.wall : null;
    };

    const seen = new Set<string>();
    for (const start of items) {
      if (seen.has(start.id)) continue;
      // Remonter jusqu'au début de la chaîne, sans jamais boucler.
      let head = start;
      let headEnd: 'a' | 'b' = 'a';
      const guard = new Set<string>([start.id]);
      for (;;) {
        const prev = nextAt(head, headEnd);
        if (!prev || guard.has(prev.id)) break;
        guard.add(prev.id);
        headEnd = nodeKey(prev.a) === nodeKey(head[headEnd]) ? 'b' : 'a';
        head = prev;
      }

      // `head[headEnd]` est l'extrémité libre : c'est de là que part la
      // chaîne, qu'on déroule maintenant bout à bout jusqu'à l'autre bout.
      const pieces: { wall: WallSeg; from: Pt; to: Pt; len: number }[] = [];
      let cur: WallSeg | null = head;
      let from: Pt = head[headEnd];
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        const to = nodeKey(cur.a) === nodeKey(from) ? cur.b : cur.a;
        pieces.push({ wall: cur, from, to, len: segLength(cur) });
        const end: 'a' | 'b' = nodeKey(cur.b) === nodeKey(to) ? 'b' : 'a';
        const next: WallSeg | null = nextAt(cur, end);
        from = to;
        cur = next;
      }

      if (pieces.length === 1) {
        out.push(pieces[0].wall);
        continue;
      }
      // Le plus long morceau donne son identité au mur reconstitué.
      const main = pieces.reduce((a, b) => (b.len > a.len ? b : a));
      const total = pieces.reduce((s, p) => s + p.len, 0);
      out.push({
        ...main.wall,
        a: pieces[0].from,
        b: pieces[pieces.length - 1].to,
        height: Math.max(...pieces.map((p) => p.wall.height)),
        texture: mergeTextures(pieces, total),
      });
    }
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

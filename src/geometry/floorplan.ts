import type { ObjectData, SurfaceData } from 'react-native-room-scan';

/** Segment de mur au sol, en mètres (repère monde, plan XZ). */
export interface WallSeg {
  id: string;
  type: 'wall' | 'door' | 'window' | 'opening';
  a: { x: number; z: number };
  b: { x: number; z: number };
  height: number;
  /** Hauteur du centre de la surface (m, repère monde) — sert à la vue 3D. */
  yCenter: number;
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
}

/**
 * Convertit une surface native en segment au sol.
 * iOS livre une matrice 4x4 colonne-major : colonne 0 = direction du mur,
 * colonne 3 = position. Android livre directement ax/az/bx/bz.
 */
export function toSegment(s: SurfaceData): WallSeg {
  if (s.ax !== undefined) {
    return {
      id: s.id,
      type: s.type,
      a: { x: s.ax!, z: s.az! },
      b: { x: s.bx!, z: s.bz! },
      height: s.height,
      yCenter: s.height / 2,
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
  wallT = 0.14,
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
    let nx = -dz / len;
    let nz = dx / len;
    if (nx * (interior.x - w.a.x) + nz * (interior.z - w.a.z) < 0) {
      nx = -nx;
      nz = -nz;
    }
    let shift = 0;
    for (const [lx, lz] of localCorners) {
      const px = cx + lx * cos - lz * sin;
      const pz = cz + lx * sin + lz * cos;
      const d = (px - w.a.x) * nx + (pz - w.a.z) * nz;
      const need = wallT / 2 + margin - d;
      if (need > shift) shift = need;
    }
    // shift énorme = objet d'une autre zone : ne pas le téléporter.
    if (shift > 0 && shift < 1) {
      cx += nx * shift;
      cz += nz * shift;
    }
  }
  return { ...f, cx, cz };
}

/**
 * Soudure des coins : les extrémités distantes de moins de `tol` mètres
 * sont ramenées sur un point commun (moyenne du cluster). Rend le plan
 * propre ET permet de déplacer un coin en entraînant les murs adjacents.
 */
export function weldCorners(walls: WallSeg[], tol = 0.15): WallSeg[] {
  type Pt = { x: number; z: number };
  const points: { wall: WallSeg; end: 'a' | 'b'; p: Pt }[] = [];
  for (const w of walls) {
    points.push({ wall: w, end: 'a', p: w.a });
    points.push({ wall: w, end: 'b', p: w.b });
  }
  const assigned = new Set<number>();
  for (let i = 0; i < points.length; i++) {
    if (assigned.has(i)) continue;
    const cluster = [i];
    for (let j = i + 1; j < points.length; j++) {
      if (assigned.has(j)) continue;
      if (Math.hypot(points[i].p.x - points[j].p.x, points[i].p.z - points[j].p.z) < tol) {
        cluster.push(j);
      }
    }
    if (cluster.length > 1) {
      const cx = cluster.reduce((s, k) => s + points[k].p.x, 0) / cluster.length;
      const cz = cluster.reduce((s, k) => s + points[k].p.z, 0) / cluster.length;
      for (const k of cluster) {
        points[k].wall[points[k].end] = { x: cx, z: cz };
        assigned.add(k);
      }
    }
  }
  return walls;
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

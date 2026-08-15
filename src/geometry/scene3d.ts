/**
 * Construction de la scène 3D — partagée par la vue de l'app et par le PDF.
 *
 * Les deux rendus doivent montrer EXACTEMENT le même volume : mêmes onglets
 * de murs, mêmes bandes, mêmes couleurs relevées. Tout est donc calculé ici,
 * chaque rendu ne s'occupant plus que de projeter et de peindre.
 */
import type { FloorData, ObjectData, SurfaceTexture } from 'react-native-room-scan';
import {
  clampFootprint,
  quadPoints,
  roomOf,
  roomParts,
  toFootprint,
  wallQuads,
  wallsCentroid,
  type Pt,
  type RoomSurface,
  type WallSeg,
} from './floorplan';
import { floorColorAt, mixHex, pointInPolygon, sampleTexture } from './appearance';

export interface P3 {
  x: number;
  y: number;
  z: number;
}

export interface Face3D {
  pts: P3[];
  fill: string | null;
  stroke: string | null;
  /** Ombrage recalculé à la projection, selon l'orientation du pan. */
  shade?: boolean;
  /** La teinte vient du scan : l'ombrage doit conserver sa couleur. */
  captured?: boolean;
  /** Biais de tri (m) : les ouvertures passent juste devant leur mur. */
  bias?: number;
  isFloor?: boolean;
}

/** Couleurs neutres du rendu (l'app suit son thème, le PDF le sien). */
export interface ScenePalette {
  floor: string;
  floorStroke: string;
  wall: string;
  wallStroke: string;
  wallTop: string;
  wallTopStroke: string;
  opening: string;
  door: string;
  window: string;
  object: string;
  objectTop: string;
  objectStroke: string;
}

export interface SceneOptions {
  palette: ScenePalette;
  /** Portes et fenêtres teintées. */
  colorOpenings?: boolean;
  /** Sol visible (surface de la pièce). */
  showSurfaces?: boolean;
  /** Couleurs et textures relevées pendant le scan. */
  showTextures?: boolean;
  /** Relevé du sol par pièce, indexé par identifiant de pièce. */
  floors?: Record<string, FloorData | null | undefined>;
}

/** Découpe des pans : au-delà, le tri « du peintre » devient faux localement. */
const STEP = 0.6;
/** Nombre maximum de rangées de texels rendues sur un mur. */
const MAX_TEX_ROWS = 4;

const lerp2 = (P: Pt, Q: Pt, t: number): Pt => ({
  x: P.x + (Q.x - P.x) * t,
  z: P.z + (Q.z - P.z) * t,
});

const vquad = (p: Pt, q: Pt, yb: number, yt: number): P3[] => [
  { x: p.x, y: yb, z: p.z },
  { x: q.x, y: yb, z: q.z },
  { x: q.x, y: yt, z: q.z },
  { x: p.x, y: yt, z: p.z },
];

/**
 * Ombrage d'un pan vertical selon l'angle de vue : les faces tournées vers
 * la caméra sont claires, celles de profil s'assombrissent. `ct`/`st` sont
 * le cosinus et le sinus de l'azimut de la caméra.
 */
export function shadeFill(face: Face3D, ct: number, st: number): string | null {
  if (!face.shade || !face.fill) return face.fill;
  const a = face.pts[0];
  const b = face.pts[1];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const facing = ((-dz / len) * st + (dx / len) * ct + 1) / 2;
  return face.captured
    ? mixHex(
        mixHex(face.fill, '#3B424E', 0.34),
        mixHex(face.fill, '#FFFFFF', 0.24),
        facing,
      )
    : mixHex('#BFC9D8', '#FCFDFF', facing);
}

/** Une pièce telle que la scène l'a rendue : de quoi poser cotes et semis. */
export interface SceneRoom {
  roomId: string;
  /** Contour et aire du sol, si la pièce en a un. */
  surface: RoomSurface | null;
  /** Centre de la pièce (pose du cartouche). */
  centroid: Pt;
  /** Couleur de fond du sol effectivement employée. */
  floorFill: string;
}

export interface Scene {
  faces: Face3D[];
  /** Une entrée par pièce du scan. */
  rooms: SceneRoom[];
  /** Niveau du sol dans le repère monde (m). */
  floorY: number;
}

/** Construit la scène complète : sol, murs, ouvertures, meubles. */
export function buildScene(
  walls: WallSeg[],
  openings: WallSeg[],
  objects: ObjectData[],
  opts: SceneOptions,
): Scene {
  const { palette: pal } = opts;
  const faces: Face3D[] = [];
  const parts = roomParts(walls);
  // Les nœuds de `wallQuads` sont déjà cloisonnés par pièce : un seul appel
  // suffit, deux pièces mitoyennes n'y forment pas d'onglet commun.
  const quads = wallQuads(walls);
  const interiorOf = new Map(parts.map((p) => [p.roomId, p.centroid]));
  const wallsOf = new Map(parts.map((p) => [p.roomId, p.walls]));
  const fallbackInterior = wallsCentroid(walls);
  const floorY =
    walls.length > 0 ? Math.min(...walls.map((w) => w.yCenter - w.height / 2)) : 0;

  // --------------------------------------------------------------- sols
  // Un sol par pièce : sa couleur moyenne, puis le détail des cases
  // entièrement contenues dans SON contour.
  const rooms: SceneRoom[] = parts.map((part) => {
    const floor = opts.floors?.[part.roomId] ?? null;
    const floorFill = (opts.showTextures ? floor?.color : undefined) ?? pal.floor;
    const surface = part.surface;
    if (surface && opts.showSurfaces) {
      faces.push({
        pts: surface.pts.map((p) => ({ x: p.x, y: 0, z: p.z })),
        fill: floorFill,
        stroke: pal.floorStroke,
        isFloor: true,
      });
      const ftex = opts.showTextures ? floor?.texture : undefined;
      if (ftex && ftex.cols > 0 && ftex.rows > 0) {
        const cw = (ftex.maxX - ftex.minX) / ftex.cols;
        const ch = (ftex.maxZ - ftex.minZ) / ftex.rows;
        for (let r = 0; r < ftex.rows; r++) {
          for (let i = 0; i < ftex.cols; i++) {
            const x0 = ftex.minX + i * cw;
            const z0 = ftex.minZ + r * ch;
            const cell: Pt[] = [
              { x: x0, z: z0 },
              { x: x0 + cw, z: z0 },
              { x: x0 + cw, z: z0 + ch },
              { x: x0, z: z0 + ch },
            ];
            if (!cell.every((p) => pointInPolygon(p, surface.pts))) continue;
            const col = floorColorAt(floor, { x: x0 + cw / 2, z: z0 + ch / 2 });
            if (!col) continue;
            faces.push({
              pts: cell.map((p) => ({ x: p.x, y: 0, z: p.z })),
              fill: col,
              stroke: null,
              isFloor: true,
            });
          }
        }
      }
    }
    return { roomId: part.roomId, surface, centroid: part.centroid, floorFill };
  });

  /**
   * Pan vertical découpé en bandes. Avec une texture, chaque bande est en
   * plus découpée en hauteur : la grille de couleurs relevée au scan se
   * retrouve telle quelle sur le mur.
   */
  const pushStrips = (
    p: Pt,
    q: Pt,
    yb: number,
    yt: number,
    fill: string,
    o: {
      shade?: boolean;
      captured?: boolean;
      tex?: SurfaceTexture;
      flipU?: boolean;
    } = {},
  ) => {
    const cols = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / STEP));
    const rows = o.tex ? Math.min(MAX_TEX_ROWS, Math.max(1, o.tex.rows)) : 1;
    for (let i = 0; i < cols; i++) {
      const s0 = lerp2(p, q, i / cols);
      const s1 = lerp2(p, q, (i + 1) / cols);
      for (let r = 0; r < rows; r++) {
        const top = yt - ((yt - yb) * r) / rows;
        const bot = yt - ((yt - yb) * (r + 1)) / rows;
        let paint = fill;
        if (o.tex) {
          const u = (i + 0.5) / cols;
          const s = sampleTexture(o.tex, o.flipU ? 1 - u : u, (r + 0.5) / rows);
          if (s) paint = s;
        }
        faces.push({
          pts: vquad(s0, s1, bot, top),
          fill: paint,
          stroke: null,
          shade: o.shade,
          captured: o.captured || !!o.tex,
        });
      }
    }
  };

  const pushTopStrips = (
    e1a: Pt,
    e1b: Pt,
    e2a: Pt,
    e2b: Pt,
    y: number,
    fill: string,
  ) => {
    const n = Math.max(1, Math.ceil(Math.hypot(e1b.x - e1a.x, e1b.z - e1a.z) / STEP));
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      faces.push({
        pts: [
          lerp2(e1a, e1b, t0),
          lerp2(e1a, e1b, t1),
          lerp2(e2a, e2b, t1),
          lerp2(e2a, e2b, t0),
        ].map((p) => ({ x: p.x, y, z: p.z })),
        fill,
        stroke: null,
      });
    }
  };

  const pushOutline = (pts: P3[], stroke: string) => {
    faces.push({ pts, fill: null, stroke, bias: 0.001 });
  };

  // --------------------------------------------------------------- murs
  for (const w of walls) {
    const q = quads.get(w.id);
    if (!q) continue;
    const { a1, b1, b2, a2 } = q;
    // Seule la face tournée vers la pièce a été vue par la caméra — et c'est
    // le centre de SA pièce qui dit de quel côté elle regarde.
    const interior = interiorOf.get(roomOf(w)) ?? fallbackInterior;
    const mid = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
    const len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z) || 1;
    const nrm = { x: -(w.b.z - w.a.z) / len, z: (w.b.x - w.a.x) / len };
    const plusIsInner =
      (interior.x - mid.x) * nrm.x + (interior.z - mid.z) * nrm.z > 0;
    const tex = opts.showTextures ? w.texture : undefined;
    const avg = opts.showTextures ? w.color : undefined;

    for (const [p, r, inner, flipU] of [
      [a1, b1, plusIsInner, false],
      [b2, a2, !plusIsInner, true],
    ] as [Pt, Pt, boolean, boolean][]) {
      pushStrips(p, r, 0, w.height, avg ?? pal.wall, {
        shade: true,
        captured: !!avg,
        tex: inner ? tex : undefined,
        flipU,
      });
      pushOutline(vquad(p, r, 0, w.height), pal.wallStroke);
    }
    // Chants : trop étroits pour être découpés.
    for (const [p, r] of [
      [a2, a1],
      [b1, b2],
    ] as const) {
      faces.push({
        pts: vquad(p, r, 0, w.height),
        fill: avg ?? pal.wall,
        stroke: pal.wallStroke,
        shade: true,
        captured: !!avg,
      });
    }
    pushTopStrips(
      a1,
      b1,
      a2,
      b2,
      w.height,
      avg ? mixHex(avg, '#FFFFFF', 0.45) : pal.wallTop,
    );
    pushOutline(
      quadPoints(q).map((p) => ({ x: p.x, y: w.height, z: p.z })),
      pal.wallTopStroke,
    );
  }

  // -------------------------------------------------- portes / fenêtres
  for (const o of openings) {
    const yb = Math.max(0, o.yCenter - o.height / 2 - floorY);
    const captured = opts.showTextures ? o.color : undefined;
    faces.push({
      pts: vquad(o.a, o.b, yb, yb + o.height),
      fill: opts.colorOpenings
        ? o.type === 'door'
          ? pal.door
          : pal.window
        : captured ?? pal.opening,
      stroke: null,
      bias: 0.12,
    });
  }

  // ------------------------------------------------------------ meubles
  // Un meuble n'est recalé que contre les murs de SA pièce : sinon la
  // cloison d'à côté le repousserait au milieu du salon.
  for (const obj of objects.map((o) =>
    clampFootprint(
      toFootprint(o),
      wallsOf.get(roomOf(o)) ?? walls,
      interiorOf.get(roomOf(o)) ?? fallbackInterior,
    ),
  )) {
    const cosY = Math.cos(obj.yaw);
    const sinY = Math.sin(obj.yaw);
    const hw = obj.width / 2;
    const hd = obj.depth / 2;
    const corners = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ].map(([lx, lz]) => ({
      x: obj.cx + lx * cosY - lz * sinY,
      z: obj.cz + lx * sinY + lz * cosY,
    }));
    const yb = Math.max(0, obj.yCenter - obj.height / 2 - floorY);
    const yt = yb + obj.height;
    const skin = opts.showTextures ? obj.color : undefined;
    for (let i = 0; i < 4; i++) {
      const p = corners[i];
      const q = corners[(i + 1) % 4];
      pushStrips(p, q, yb, yt, skin ?? pal.object, {
        shade: !!skin,
        captured: !!skin,
      });
      pushOutline(vquad(p, q, yb, yt), pal.objectStroke);
    }
    pushTopStrips(
      corners[0],
      corners[1],
      corners[3],
      corners[2],
      yt,
      skin ? mixHex(skin, '#FFFFFF', 0.35) : pal.objectTop,
    );
    pushOutline(
      corners.map((p) => ({ x: p.x, y: yt, z: p.z })),
      pal.objectStroke,
    );
  }

  return { faces, rooms, floorY };
}

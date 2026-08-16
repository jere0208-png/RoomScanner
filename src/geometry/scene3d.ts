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
  pointOnSeg,
  roomOf,
  roomParts,
  toFootprint,
  wallQuads,
  wallsCentroid,
  WALL_T,
  type RoomShape,
  type Pt,
  type RoomSurface,
  type WallSeg,
} from './floorplan';
import { floorColorAt, mixHex, pointInPolygon, sampleTexture } from './appearance';
import { furnitureParts, type FurnPart } from './furniture3d';
import {
  FIXTURES,
  PLAQUE,
  assemblySymbol,
  boxOffsets,
  faceX,
  facePoint,
  postsOf,
  symbolPolylines,
  wallFace,
  SYMBOL_SPAN,
  type Fixture,
  type FixtureKind,
} from './electrical';

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
  /** Biais de tri (m), pour départager deux faces à la même profondeur. */
  bias?: number;
  isFloor?: boolean;
  /** Trait pointillé : réservé aux passages, qui sont des vides. */
  dashed?: boolean;
  /**
   * Point dont la profondeur classe la face, à la place de son propre centre.
   *
   * Une ARÊTE doit se trier avec le pan qu'elle borde, pas pour elle-même :
   * l'arête basse d'un mur est à y = 0 alors que le pan a son centre à
   * mi-hauteur. Comme la profondeur croît avec l'altitude, l'arête basse
   * passait AVANT son propre pan, qui la repeignait aussitôt. C'est ce qui
   * effaçait le silhouettage — et pourquoi il réapparaissait pendant un
   * geste, où un pan non découpé porte un contour d'un seul tenant, centré
   * comme lui.
   */
  depthAt?: P3;
  /**
   * Plusieurs points de tri, dont on retient LE PLUS PROCHE de la caméra.
   *
   * Une façade d'appareil large — un tableau électrique fait 55 cm —
   * recouvre deux tuiles de mur, et le tri ne peut pas se contenter d'une
   * seule : celle qu'on n'aurait pas prise passerait après, et repeindrait
   * la moitié du tableau. On donne donc les tuiles RECOUVERTES, avancées
   * d'un millimètre ; le maximum, calculé à la projection, tombe
   * exactement sur la bonne, quel que soit l'angle. Réservé aux faces
   * tournées vers la pièce : vues de dos elles sont écartées, et rien ne
   * peut donc traverser un mur par ce chemin.
   */
  depthRefs?: P3[];
  /**
   * Normale sortante d'une face de VOLUME. Sa présence dit que la face
   * appartient à un solide fermé : quand elle tourne le dos à la caméra, on
   * ne la dessine pas du tout. C'est ce qui empêche définitivement les deux
   * faces d'un même mur — distantes de 14 cm — de se disputer l'affichage.
   */
  normal?: P3;
}

/** Orientation de la caméra, telle que les deux rendus la calculent. */
export interface CameraTrig {
  /** cos/sin de l'azimut. */
  ct: number;
  st: number;
  /** cos/sin de l'inclinaison. */
  cp: number;
  sp: number;
}

/**
 * Face d'un solide qui tourne le dos à la caméra : à jeter avant même de la
 * projeter. La profondeur croît vers la caméra (`rz * sp + y * cp`), donc son
 * gradient `(st·sp, cp, ct·sp)` est la direction de l'observateur.
 */
export function isHiddenFace(face: Face3D, cam: CameraTrig): boolean {
  const n = face.normal;
  if (!n) return false;
  return n.x * cam.st * cam.sp + n.y * cam.cp + n.z * cam.ct * cam.sp <= 0;
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
  /** Baie libre ou porte ouverte : un vide, tracé en pointillé. */
  passage: string;
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
  /** Pièces du scan, avec les murs qui bordent chacune. */
  rooms?: RoomShape[];
  /** Appareillage électrique posé sur les faces de murs. */
  fixtures?: Fixture[];
  /**
   * Rendu allégé pendant un geste : les pans ne sont plus découpés en bandes,
   * ce qui divise le nombre de polygones par cinq. Le volume reste complet,
   * contours compris — seule la finesse du tri en profondeur baisse, et le
   * rendu exact revient dès que le doigt se lève.
   */
  coarse?: boolean;
}

/** Décalage de la lumière par rapport à l'azimut de la caméra (35°). */
const LIGHT_COS = Math.cos((35 * Math.PI) / 180);
const LIGHT_SIN = Math.sin((35 * Math.PI) / 180);

/** Découpe des pans : au-delà, le tri « du peintre » devient faux localement. */
const STEP = 0.6;
/** Mode « geste » : pans d'un seul tenant, pour tenir 60 images par seconde. */
const COARSE_STEP = 1e6;
/** Nombre maximum de rangées de texels rendues sur un mur. */
const MAX_TEX_ROWS = 4;
/** Ce qui se pose forcément par terre : rien de tout ça ne se suspend. */
const POSE_AU_SOL =
  /bed|sofa|couch|table|desk|chair|stool|refrigerator|fridge|stove|oven|dishwasher|washer|dryer|toilet|bathtub|shower|storage|cabinet|wardrobe|plant/i;

/** Épaisseur d'une plaque d'appareillage (8 mm), et côté d'un mécanisme. */
const PLAQUE_EP = 0.008;
const MECANISME = 0.045;

const lerp2 = (P: Pt, Q: Pt, t: number): Pt => ({
  x: P.x + (Q.x - P.x) * t,
  z: P.z + (Q.z - P.z) * t,
});

/** Normale sortante d'un pan p→q, avec la convention de `vquad`. */
const outwardOf = (p: Pt, q: Pt): P3 => {
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: -dz / len, y: 0, z: dx / len };
};

/** Ouverture rattachée à un mur, en fraction de longueur et en hauteur. */
export interface WallHole {
  seg: WallSeg;
  t0: number;
  t1: number;
  y0: number;
  y1: number;
}

/**
 * Rattache chaque porte/fenêtre au mur qui la porte.
 *
 * RoomPlan livre les ouvertures comme des surfaces indépendantes, posées dans
 * le plan de leur mur mais sans lien avec lui. Sans ce rattachement, on ne
 * peut que les poser PAR-DESSUS le mur — et c'est exactement ce qui les
 * faisait passer devant ou derrière selon l'angle de vue.
 *
 * La clé `used:<id>` marque les ouvertures effectivement rattachées.
 */
export function assignOpenings(
  walls: WallSeg[],
  openings: WallSeg[],
  floorY: number,
): Map<string, WallHole[]> {
  const out = new Map<string, WallHole[]>();
  for (const o of openings) {
    const od = { x: o.b.x - o.a.x, z: o.b.z - o.a.z };
    const ol = Math.hypot(od.x, od.z) || 1;
    const ou = { x: od.x / ol, z: od.z / ol };
    const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };

    let best: { wall: WallSeg; dist: number } | null = null;
    for (const w of walls) {
      if (roomOf(w) !== roomOf(o)) continue;
      const wd = { x: w.b.x - w.a.x, z: w.b.z - w.a.z };
      const wl = Math.hypot(wd.x, wd.z) || 1;
      // Parallèle à moins de ~25°, et posée à même le mur.
      if (Math.abs((wd.x * ou.x + wd.z * ou.z) / wl) < 0.9) continue;
      const { dist } = pointOnSeg(mid, w.a, w.b);
      if (dist > 0.6) continue;
      if (!best || dist < best.dist) best = { wall: w, dist };
    }
    if (!best) continue;

    const w = best.wall;
    const wd = { x: w.b.x - w.a.x, z: w.b.z - w.a.z };
    const wl2 = wd.x * wd.x + wd.z * wd.z || 1;
    const along = (p: Pt) =>
      ((p.x - w.a.x) * wd.x + (p.z - w.a.z) * wd.z) / wl2;
    const ta = along(o.a);
    const tb = along(o.b);
    const t0 = Math.max(0, Math.min(ta, tb));
    const t1 = Math.min(1, Math.max(ta, tb));
    if (t1 - t0 < 1e-3) continue;
    const y0 = Math.max(0, o.yCenter - o.height / 2 - floorY);
    const y1 = Math.min(w.height, y0 + o.height);
    if (y1 - y0 < 1e-3) continue;

    const list = out.get(w.id) ?? [];
    list.push({ seg: o, t0, t1, y0, y1 });
    out.set(w.id, list);
    out.set(`used:${o.id}`, []);
  }
  return out;
}

/** Un morceau plein de mur : trumeau, linteau ou allège. */
export interface WallPanel {
  t0: number;
  t1: number;
  y0: number;
  y1: number;
}

/**
 * Découpe un mur autour de ses ouvertures. Le mur ne se construit JAMAIS
 * dans le vide laissé par une porte : à gauche et à droite un trumeau pleine
 * hauteur, au-dessus un linteau, en dessous une allège s'il y en a une.
 * Deux ouvertures qui se chevauchent sont fusionnées plutôt que superposées.
 */
export function wallPanels(holes: WallHole[], height: number): WallPanel[] {
  if (holes.length === 0) return [{ t0: 0, t1: 1, y0: 0, y1: height }];
  const sorted = [...holes].sort((a, b) => a.t0 - b.t0);
  const out: WallPanel[] = [];
  let cursor = 0;
  for (const hole of sorted) {
    const t0 = Math.max(cursor, hole.t0);
    const t1 = Math.max(t0, Math.min(1, hole.t1));
    if (t1 - t0 < 1e-4) continue;
    if (t0 - cursor > 1e-4) out.push({ t0: cursor, t1: t0, y0: 0, y1: height });
    if (hole.y0 > 1e-3) out.push({ t0, t1, y0: 0, y1: hole.y0 });
    if (hole.y1 < height - 1e-3) {
      out.push({ t0, t1, y0: hole.y1, y1: height });
    }
    cursor = t1;
  }
  if (cursor < 1 - 1e-4) out.push({ t0: cursor, t1: 1, y0: 0, y1: height });
  return out;
}

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
  let nx: number;
  let nz: number;
  if (face.normal) {
    nx = face.normal.x;
    nz = face.normal.z;
  } else {
    const a = face.pts[0];
    const b = face.pts[1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    nx = -dz / len;
    nz = dx / len;
  }
  // Lumière DÉCALÉE de la caméra (35°). Éclairée dans l'axe du regard, deux
  // faces symétriques par rapport à celui-ci reçoivent exactement la même
  // teinte : l'arête entre elles s'efface et le meuble paraît amputé d'un
  // flanc. Le décalage garantit que deux faces voisines diffèrent toujours.
  const lx = st * LIGHT_COS + ct * LIGHT_SIN;
  const lz = ct * LIGHT_COS - st * LIGHT_SIN;
  const facing = (nx * lx + nz * lz + 1) / 2;
  return face.captured
    ? mixHex(
        mixHex(face.fill, '#3B424E', 0.34),
        mixHex(face.fill, '#FFFFFF', 0.24),
        facing,
      )
    : mixHex(
        mixHex(face.fill, '#8A94A6', 0.35),
        mixHex(face.fill, '#FFFFFF', 0.35),
        facing,
      );
}

/** Une pièce telle que la scène l'a rendue : de quoi poser cotes et semis. */
export interface SceneRoom {
  roomId: string;
  /** Contour et aire du sol, si la pièce en a un. */
  surface: RoomSurface | null;
  /** Centre de la pièce. */
  centroid: Pt;
  /** Où poser le cartouche : au large, jamais dans un mur. */
  labelAt: Pt;
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

/**
 * Cadrage d'une scène : centre et rayon englobants.
 *
 * Le centre vient de la BOÎTE englobante, pas de la moyenne des points : la
 * moyenne dépend du nombre de sommets, donc du découpage en bandes, et le
 * modèle sauterait au moment où le rendu passe en mode geste. La boîte, elle,
 * ne dépend que des extrémités — identique dans les deux modes. La vue de
 * l'app et le PDF partagent ce calcul, donc le même cadrage.
 */
export function sceneFraming(faces: Face3D[]): {
  center: P3;
  radius3d: number;
} {
  let lo = { x: Infinity, y: Infinity, z: Infinity };
  let hi = { x: -Infinity, y: -Infinity, z: -Infinity };
  let n = 0;
  for (const f of faces) {
    for (const p of f.pts) {
      n++;
      lo = { x: Math.min(lo.x, p.x), y: Math.min(lo.y, p.y), z: Math.min(lo.z, p.z) };
      hi = { x: Math.max(hi.x, p.x), y: Math.max(hi.y, p.y), z: Math.max(hi.z, p.z) };
    }
  }
  if (n === 0) return { center: { x: 0, y: 0, z: 0 }, radius3d: 1 };
  const center = {
    x: (lo.x + hi.x) / 2,
    y: (lo.y + hi.y) / 2,
    z: (lo.z + hi.z) / 2,
  };
  const radius3d = Math.max(
    0.5,
    Math.hypot(hi.x - center.x, hi.y - center.y, hi.z - center.z),
  );
  return { center, radius3d };
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
  const parts = roomParts(walls, opts.rooms);
  // Les nœuds de `wallQuads` sont déjà cloisonnés par pièce : un seul appel
  // suffit, deux pièces mitoyennes n'y forment pas d'onglet commun.
  const quads = wallQuads(walls);
  const interiorOf = new Map(parts.map((p) => [p.roomId, p.labelAt]));
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
    return {
      roomId: part.roomId,
      surface,
      centroid: part.centroid,
      labelAt: part.labelAt,
      floorFill,
    };
  });

  const step = opts.coarse ? COARSE_STEP : STEP;

  /**
   * Arête isolée. Un contour ne peut PAS être un grand polygone posé sur tout
   * le pan : sa profondeur moyenne le placerait devant un meuble pourtant
   * plus proche, et on verrait le trait le traverser. Chaque arête est donc
   * un segment à part, trié à sa propre profondeur.
   */
  /**
   * Biais de tri des arêtes, en mètres.
   *
   * Il valait 4 mm — dérisoire à côté d'une épaisseur de mur de 14 cm : la
   * moindre face voisine, dessinée après, effaçait le trait. Le silhouettage
   * disparaissait alors sur fond blanc, sauf pendant un geste où un pan n'est
   * pas découpé et son contour redevient un quadrilatère plus large.
   *
   * 5 cm : une arête l'emporte sur tout ce qui la frôle (faces coplanaires,
   * bandes voisines, menuiserie en retrait de 22 %), mais reste masquée par
   * une géométrie franchement plus proche — un mur devant en cache toujours
   * un autre.
   */
  const EDGE_BIAS = 0.02;

  /** `at` = centre du pan bordé : c'est lui qui donne sa place à l'arête. */
  const pushEdge = (p: P3, q: P3, stroke: string, normal?: P3, at?: P3) => {
    faces.push({
      pts: [p, q],
      fill: null,
      stroke,
      bias: EDGE_BIAS,
      normal,
      depthAt: at,
    });
  };

  /** Contour d'un quadrilatère non découpé : un seul polygone suffit. */
  const pushOutline = (pts: P3[], stroke: string, normal?: P3) => {
    faces.push({ pts, fill: null, stroke, bias: EDGE_BIAS, normal });
  };

  /**
   * Pan vertical découpé en bandes. Avec une texture, chaque bande est en
   * plus découpée en hauteur : la grille de couleurs relevée au scan se
   * retrouve telle quelle sur le mur.
   *
   * `outline` fait dessiner le contour du pan SANS ses coupures internes :
   * les bandes sont un artifice de tri, elles ne doivent pas se voir.
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
      /** Position dans la texture aux extrémités p et q (0 = extrémité A). */
      uFrom?: number;
      uTo?: number;
      outline?: string;
      normal?: P3;
    } = {},
  ) => {
    const cols = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / step));
    // PAS de découpe en hauteur — sauf pour poser une texture.
    //
    // Je l'avais ajoutée sur un raisonnement : un pan pleine hauteur se trie
    // sur une profondeur moyenne dominée par son altitude, donc un meuble
    // pourrait le traverser. Sur l'appareil, elle a surtout produit des
    // défauts visibles : deux surfaces voisines découpées sur des grilles
    // DIFFÉRENTES (un trumeau de 2,5 m et une fenêtre de 1,1 m ne tombent pas
    // sur les mêmes coupures) s'entrelacent au tri et dessinent un escalier
    // le long des ouvertures. Le vrai remède au meuble traversant était
    // ailleurs — c'est `clampFootprint` qui le sort du mur.
    const rows = o.tex
      ? Math.min(MAX_TEX_ROWS, Math.max(1, o.tex.rows))
      : 1;
    for (let i = 0; i < cols; i++) {
      const s0 = lerp2(p, q, i / cols);
      const s1 = lerp2(p, q, (i + 1) / cols);
      for (let r = 0; r < rows; r++) {
        const top = yt - ((yt - yb) * r) / rows;
        const bot = yt - ((yt - yb) * (r + 1)) / rows;
        let paint = fill;
        if (o.tex) {
          const uf = o.uFrom ?? 0;
          const ut = o.uTo ?? 1;
          const u = uf + (ut - uf) * ((i + 0.5) / cols);
          const s = sampleTexture(o.tex, u, (r + 0.5) / rows);
          if (s) paint = s;
        }
        faces.push({
          pts: vquad(s0, s1, bot, top),
          fill: paint,
          stroke: null,
          shade: o.shade,
          captured: o.captured || !!o.tex,
          normal: o.normal,
        });

        // Contour du POURTOUR, tuile par tuile.
        //
        // Une arête doit se trier avec la TUILE qu'elle borde, pas avec le pan
        // entier : depuis qu'on découpe aussi en hauteur, les tuiles d'un même
        // pan s'étalent sur près d'un mètre de profondeur. Une arête calée sur
        // le milieu du pan passait donc avant les tuiles hautes, qui la
        // repeignaient en escalier — c'est exactement ce qu'on voyait le long
        // des fenêtres, et ce qui laissait des bouts d'arêtes en l'air.
        if (!o.outline) continue;
        const tuile: P3 = {
          x: (s0.x + s1.x) / 2,
          y: (bot + top) / 2,
          z: (s0.z + s1.z) / 2,
        };
        const E = (a: P3, b: P3) => pushEdge(a, b, o.outline!, o.normal, tuile);
        if (r === 0) {
          E({ x: s0.x, y: yt, z: s0.z }, { x: s1.x, y: yt, z: s1.z });
        }
        if (r === rows - 1) {
          E({ x: s0.x, y: yb, z: s0.z }, { x: s1.x, y: yb, z: s1.z });
        }
        if (i === 0) {
          E({ x: s0.x, y: bot, z: s0.z }, { x: s0.x, y: top, z: s0.z });
        }
        if (i === cols - 1) {
          E({ x: s1.x, y: bot, z: s1.z }, { x: s1.x, y: top, z: s1.z });
        }
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
    outline?: string,
    /** +1 = dessus d'un volume, −1 = dessous (linteau vu d'en dessous). */
    facing: 1 | -1 = 1,
  ) => {
    const n = Math.max(1, Math.ceil(Math.hypot(e1b.x - e1a.x, e1b.z - e1a.z) / step));
    const at = (p: Pt): P3 => ({ x: p.x, y, z: p.z });
    const normal: P3 = { x: 0, y: facing, z: 0 };
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const c1 = lerp2(e1a, e1b, t0);
      const c2 = lerp2(e1a, e1b, t1);
      const c3 = lerp2(e2a, e2b, t1);
      const c4 = lerp2(e2a, e2b, t0);
      faces.push({ pts: [c1, c2, c3, c4].map(at), fill, stroke: null, normal });
      if (!outline) continue;
      if (n === 1) {
        pushOutline([c1, c2, c3, c4].map(at), outline, normal);
        continue;
      }
      const mid: P3 = {
        x: (c1.x + c2.x + c3.x + c4.x) / 4,
        y,
        z: (c1.z + c2.z + c3.z + c4.z) / 4,
      };
      pushEdge(at(c1), at(c2), outline, normal, mid);
      pushEdge(at(c4), at(c3), outline, normal, mid);
      if (i === 0) pushEdge(at(c1), at(c4), outline, normal, mid);
      if (i === n - 1) pushEdge(at(c2), at(c3), outline, normal, mid);
    }
  };

  /**
   * Un VOLUME découpé dans l'épaisseur d'un mur, entre deux abscisses le long
   * de celui-ci. `t0`/`t1` sont des fractions de la longueur du mur, `shrink`
   * un retrait sur l'épaisseur (la porte est en retrait dans son tableau).
   *
   * Les quatre faces verticales, le dessus et le dessous portent chacun leur
   * normale sortante : le rendu jette celles qui tournent le dos. Deux faces
   * d'un même volume ne peuvent donc plus jamais se disputer l'affichage,
   * quel que soit l'angle de vue — c'est ce qui faisait clignoter les murs.
   */
  const pushWallBlock = (
    q: { a1: Pt; b1: Pt; b2: Pt; a2: Pt },
    t0: number,
    t1: number,
    yb: number,
    yt: number,
    o: {
      fill: string;
      top: string;
      stroke: string;
      topStroke: string;
      captured?: boolean;
      /** Texture appliquée à la face +n (`plus`) ou −n. */
      tex?: SurfaceTexture;
      texOnPlus?: boolean;
      shrink?: number;
      /** Dessous fermé : un linteau se regarde par en dessous. */
      closeBottom?: boolean;
      /** Ombrage selon l'orientation (les meubles restent en aplat). */
      shade?: boolean;
    },
  ) => {
    if (t1 - t0 < 1e-4 || yt - yb < 1e-4) return;
    const s = o.shrink ?? 0;
    // p1/q1 longent la face +n, p2/q2 la face −n.
    const p1 = lerp2(lerp2(q.a1, q.b1, t0), lerp2(q.a2, q.b2, t0), s);
    const r1 = lerp2(lerp2(q.a1, q.b1, t1), lerp2(q.a2, q.b2, t1), s);
    const p2 = lerp2(lerp2(q.a2, q.b2, t0), lerp2(q.a1, q.b1, t0), s);
    const r2 = lerp2(lerp2(q.a2, q.b2, t1), lerp2(q.a1, q.b1, t1), s);

    const face = (p: Pt, r: Pt, tex?: SurfaceTexture, uFrom = 0, uTo = 1) =>
      pushStrips(p, r, yb, yt, o.fill, {
        shade: o.shade ?? true,
        captured: o.captured,
        tex,
        uFrom,
        uTo,
        outline: o.stroke,
        normal: outwardOf(p, r),
      });

    face(p1, r1, o.texOnPlus ? o.tex : undefined, t0, t1);
    face(r2, p2, o.texOnPlus ? undefined : o.tex, t1, t0);
    // Tableaux (chants) : trop étroits pour mériter un découpage.
    face(p2, p1);
    face(r1, r2);
    pushTopStrips(p1, r1, p2, r2, yt, o.top, o.topStroke);
    if (o.closeBottom) {
      pushTopStrips(r1, p1, r2, p2, yb, o.top, o.topStroke, -1);
    }
  };

  // --------------------------------------------------------------- murs
  // Chaque ouverture est rattachée à son mur, puis le mur est bâti AUTOUR
  // d'elle : trumeaux de part et d'autre, linteau au-dessus, allège en
  // dessous. Plus rien ne se superpose, donc plus une seule couleur qui en
  // recouvre une autre selon l'angle.
  const holes = assignOpenings(walls, openings, floorY);
  for (const w of walls) {
    const q = quads.get(w.id);
    if (!q) continue;
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
    const skin = {
      fill: avg ?? pal.wall,
      top: avg ? mixHex(avg, '#FFFFFF', 0.45) : pal.wallTop,
      stroke: pal.wallStroke,
      topStroke: pal.wallTopStroke,
      captured: !!avg,
      tex,
      texOnPlus: plusIsInner,
    };

    const mine = holes.get(w.id) ?? [];
    for (const panel of wallPanels(mine, w.height)) {
      pushWallBlock(q, panel.t0, panel.t1, panel.y0, panel.y1, {
        ...skin,
        closeBottom: panel.y0 > 1e-3,
      });
    }

    // ---------------------------------------- portes / fenêtres du mur
    for (const hole of mine) {
      // Une baie libre ou une porte ouverte, ça se TRAVERSE : pas de panneau,
      // juste le pourtour du vide, en pointillé, sur les deux faces du mur.
      if (hole.seg.open) {
        const p1 = lerp2(q.a1, q.b1, hole.t0);
        const r1 = lerp2(q.a1, q.b1, hole.t1);
        const p2 = lerp2(q.a2, q.b2, hole.t0);
        const r2 = lerp2(q.a2, q.b2, hole.t1);
        for (const [p, r] of [
          [p1, r1],
          [r2, p2],
        ] as [Pt, Pt][]) {
          faces.push({
            pts: vquad(p, r, hole.y0, hole.y1),
            fill: null,
            stroke: pal.passage,
            dashed: true,
            bias: 0.006,
            normal: outwardOf(p, r),
          });
        }
        continue;
      }
      const captured = opts.showTextures ? hole.seg.color : undefined;
      const paint = opts.colorOpenings
        ? hole.seg.type === 'door'
          ? pal.door
          : pal.window
        : captured ?? pal.opening;
      pushWallBlock(q, hole.t0, hole.t1, hole.y0, hole.y1, {
        fill: paint,
        top: mixHex(paint, '#FFFFFF', 0.3),
        stroke: pal.wallStroke,
        topStroke: pal.wallStroke,
        captured: !!captured,
        // En retrait dans l'épaisseur : le tableau du mur reste visible
        // autour, et le bloc se lit comme une menuiserie posée dedans.
        shrink: 0.22,
        closeBottom: true,
      });
    }
  }

  // ------------------------------------------- appareillage électrique
  // Une prise est un petit VOLUME plaqué sur la face du mur, pas une
  // pastille peinte dessus : elle porte ses normales sortantes comme le
  // reste du modèle, donc elle disparaît d'elle-même dès qu'on passe
  // derrière son mur, et rien ne peut la faire flotter au travers.
  const wallById = new Map(walls.map((w) => [w.id, w]));

  /**
   * Les appareils réunis se dessinent ENSEMBLE.
   *
   * Deux prises côte à côte, ce ne sont pas deux plaques qui se chevauchent :
   * c'est UNE plaque de 151 mm et deux mécanismes de 45 mm à 71 mm
   * d'entraxe. C'est ce que voit l'électricien sur le mur, et ce que le
   * modèle doit montrer — sans quoi une double prise ressemble à une prise
   * posée de travers sur une autre.
   */
  const lots = new Map<string, Fixture[]>();
  for (const f of opts.fixtures ?? []) {
    const cle = f.group ? `g:${f.group}:${f.wallId}:${f.side}` : `s:${f.id}`;
    const l = lots.get(cle);
    if (l) l.push(f);
    else lots.set(cle, [f]);
  }

  for (const lot of lots.values()) {
    const w = wallById.get(lot[0].wallId);
    if (!w) continue;
    const face = wallFace(w, quads.get(w.id), lot[0].side);
    const avant = faces.length;
    const nrm = { x: face.nx, y: 0, z: face.nz };

    /** Un point de la face : `dx` le long du mur, `out` en saillie. */
    const at = (fx: number, out: number): Pt => ({
      x: face.A.x + face.ux * fx + face.nx * out,
      z: face.A.z + face.uz * fx + face.nz * out,
    });

    /** Grave un symbole sur une façade, à l'échelle donnée. */
    const graver = (
      cx: number,
      cy: number,
      taille: number,
      out: number,
      kind: FixtureKind,
      trait: string,
    ) => {
      const k = taille / SYMBOL_SPAN;
      for (const ligne of symbolPolylines(assemblySymbol(kind))) {
        const pts3 = ligne.pts.map((pt) => {
          const sol = at(cx + pt.x * k, out);
          return { x: sol.x, y: cy - pt.y * k, z: sol.z };
        });
        if (pts3.length < 2) continue;
        faces.push({
          pts: pts3,
          fill: null,
          stroke: trait,
          bias: EDGE_BIAS,
          normal: nrm,
        });
      }
    };

    /** Un volume plaqué sur le mur : de `out0` à `out1` en saillie. */
    const poser = (
      cx: number,
      largeur: number,
      cy: number,
      hauteur: number,
      out0: number,
      out1: number,
      fill: string,
      stroke: string,
    ) => {
      const hx = largeur / 2;
      pushWallBlock(
        {
          a1: at(cx - hx, out1),
          b1: at(cx + hx, out1),
          b2: at(cx + hx, out0),
          a2: at(cx - hx, out0),
        },
        0,
        1,
        Math.max(0, cy - hauteur / 2),
        Math.max(0, cy - hauteur / 2) + hauteur,
        {
          fill,
          top: mixHex(fill, '#FFFFFF', 0.3),
          stroke,
          topStroke: stroke,
          shade: true,
          closeBottom: true,
        },
      );
    };

    // Les postes réels : une boîte d'encastrement par mécanisme, à
    // l'entraxe, qu'ils viennent d'un appareil multiposte du catalogue ou de
    // deux appareils réunis à la main.
    const postes: { x: number; y: number; kind: FixtureKind }[] = [];
    for (const f of lot) {
      const sp = FIXTURES[f.kind];
      const gauche = faceX(face, f.along) - sp.w / 2;
      const kinds = postsOf(f.kind);
      const offs = boxOffsets(f.kind);
      kinds.forEach((k, i) =>
        postes.push({ x: gauche + offs[i], y: f.height, kind: k }),
      );
    }

    // Un appareil hors gabarit — tableau, applique, thermostat large — n'est
    // pas de l'appareillage encastré : il garde son volume propre.
    const encastre = lot.every((f) => FIXTURES[f.kind].h <= 0.12);
    let x0: number;
    let x1: number;
    let y0: number;
    let y1: number;

    if (encastre) {
      x0 = Math.min(...postes.map((q) => q.x)) - PLAQUE / 2;
      x1 = Math.max(...postes.map((q) => q.x)) + PLAQUE / 2;
      y0 = Math.min(...postes.map((q) => q.y)) - PLAQUE / 2;
      y1 = Math.max(...postes.map((q) => q.y)) + PLAQUE / 2;
      // La plaque : blanche, comme sur le mur, et fine (8 mm).
      const blanc = mixHex(pal.object, '#FFFFFF', 0.72);
      poser(
        (x0 + x1) / 2,
        x1 - x0,
        (y0 + y1) / 2,
        y1 - y0,
        0.001,
        PLAQUE_EP,
        blanc,
        pal.objectStroke,
      );
      // Puis un mécanisme par poste, en saillie de la plaque.
      for (const q of postes) {
        const sp = FIXTURES[q.kind];
        const col = sp.color;
        poser(
          q.x,
          MECANISME,
          q.y,
          MECANISME,
          PLAQUE_EP,
          Math.max(PLAQUE_EP + 0.004, sp.depth),
          col,
          mixHex(col, '#000000', 0.4),
        );
        graver(
          q.x,
          q.y,
          MECANISME * 0.82,
          Math.max(PLAQUE_EP + 0.004, sp.depth) + 0.0015,
          q.kind,
          mixHex(col, '#000000', 0.55),
        );
      }
    } else {
      const f = lot[0];
      const sp = FIXTURES[f.kind];
      const cx = faceX(face, f.along);
      x0 = cx - sp.w / 2;
      x1 = cx + sp.w / 2;
      y0 = f.height - sp.h / 2;
      y1 = f.height + sp.h / 2;
      poser(
        cx,
        sp.w,
        f.height,
        sp.h,
        0.001,
        sp.depth,
        sp.color,
        mixHex(sp.color, '#000000', 0.4),
      );
      graver(
        cx,
        f.height,
        sp.h,
        sp.depth + 0.0015,
        f.kind,
        mixHex(sp.color, '#000000', 0.55),
      );
    }

    // ---- Le tri en profondeur : un appareil se range AVEC SA TUILE.
    //
    // Deux erreurs successives, et la seconde vaut d'être écrite. Un pan de
    // mur se découpe en tuiles et chacune se trie sur SON centre, donc à
    // mi-hauteur du pan ; une prise se triait sur son propre centre, à
    // 25 cm du sol. Le terme d'altitude de la profondeur la mettait un
    // mètre DERRIÈRE le mur qui la porte, et le mur la repeignait : à
    // l'écran, plus un seul appareil, seulement ses cotes.
    //
    // Le premier remède — même hauteur, plus un biais d'une demi-tuile — a
    // guéri ça et provoqué l'inverse : un biais est une avance CONSTANTE,
    // qui faisait aussi passer l'appareil devant le mur vu de dos. On voyait
    // les prises au travers des cloisons.
    //
    // Le bon repère n'a rien d'approximatif : c'est le centre exact de la
    // tuile qui porte l'appareil, avancé d'un millimètre vers la pièce. Vu
    // de face, ce millimètre compte positivement et l'appareil passe juste
    // après sa tuile ; vu de dos, il compte négativement et le mur le
    // recouvre. Aucun biais, donc aucun cas où l'un l'emporte à tort.
    const xm = (x0 + x1) / 2;
    const ym = (y0 + y1) / 2;
    const saillie = 0.001 + PLAQUE_EP;
    const texMur = opts.showTextures ? w.texture : undefined;
    const rows = texMur ? Math.min(MAX_TEX_ROWS, Math.max(1, texMur.rows)) : 1;
    const xOf = (t: number) => (lot[0].side > 0 ? t : 1 - t) * face.len;
    let xa = 0;
    let xb = face.len;
    let ya = 0;
    let yz = w.height;
    for (const panel of wallPanels(holes.get(w.id) ?? [], w.height)) {
      const e0 = xOf(panel.t0);
      const e1 = xOf(panel.t1);
      const lo = Math.min(e0, e1);
      const hi = Math.max(e0, e1);
      if (xm < lo - 1e-6 || xm > hi + 1e-6) continue;
      if (ym < panel.y0 - 1e-6 || ym > panel.y1 + 1e-6) continue;
      xa = lo;
      xb = hi;
      ya = panel.y0;
      yz = panel.y1;
      break;
    }
    const largeurPan = Math.max(1e-6, xb - xa);
    const cols = Math.max(1, Math.ceil(largeurPan / step));
    const tw = largeurPan / cols;
    const hautPan = Math.max(1e-6, yz - ya);
    const rh = hautPan / rows;
    const ri = Math.min(rows - 1, Math.max(0, Math.floor((ym - ya) / rh)));
    const yTuile = ya + (ri + 0.5) * rh;
    /** Le point de tri de la tuile qui contient cette abscisse de face. */
    const tuileDe = (xf: number): P3 => {
      const k = Math.min(cols - 1, Math.max(0, Math.floor((xf - xa) / tw)));
      const a2 = facePoint(face, xa + (k + 0.5) * tw, saillie);
      return { x: a2.x, y: yTuile, z: a2.z };
    };
    const c0 = Math.min(cols - 1, Math.max(0, Math.floor((x0 - xa) / tw)));
    const c1 = Math.min(cols - 1, Math.max(0, Math.floor((x1 - xa) / tw)));
    const refs: P3[] = [];
    for (let k = c0; k <= c1; k++) {
      const a2 = facePoint(face, xa + (k + 0.5) * tw, saillie);
      refs.push({ x: a2.x, y: yTuile, z: a2.z });
    }
    // Le DOS d'une plaque n'existe pour personne : il est plaqué au nu du
    // mur, à un millimètre. On ne peut le voir qu'en se plaçant DANS la
    // maçonnerie — c'est-à-dire jamais —, et large comme il est, il se
    // triait mal vu de l'autre côté de la cloison : il traversait.
    for (let i = faces.length - 1; i >= avant; i--) {
      const nf = faces[i].normal;
      if (nf && nf.x * face.nx + nf.z * face.nz < -0.9) faces.splice(i, 1);
    }
    for (let i = avant; i < faces.length; i++) {
      const fa = faces[i];
      const nf = fa.normal;
      const devant = !!nf && nf.x * face.nx + nf.z * face.nz > 0.9;
      // La façade se compare à TOUTES les tuiles qu'elle recouvre. Les
      // flancs, eux, tiennent chacun dans UNE tuile : on prend la leur, pas
      // celle du milieu de l'appareil — sinon un flanc de tableau se
      // retrouvait trié avec une tuile voisine, et repassait devant le dos
      // du mur quand on regardait la cloison de l'autre côté.
      if (devant && refs.length > 1) {
        fa.depthRefs = refs;
      } else {
        const cxf =
          fa.pts.reduce(
            (s2, q) => s2 + (q.x - face.A.x) * face.ux + (q.z - face.A.z) * face.uz,
            0,
          ) / fa.pts.length;
        fa.depthAt = tuileDe(cxf);
      }
    }
  }

  // ------------------------- ouvertures sans mur d'accueil identifiable
  // Rare (mur supprimé à l'édition) : le bloc est posé sur sa propre emprise.
  for (const o of openings) {
    if (holes.has(`used:${o.id}`)) continue;
    const yb = Math.max(0, o.yCenter - o.height / 2 - floorY);
    const captured = opts.showTextures ? o.color : undefined;
    const paint = opts.colorOpenings
      ? o.type === 'door'
        ? pal.door
        : pal.window
      : captured ?? pal.opening;
    const dx = o.b.x - o.a.x;
    const dz = o.b.z - o.a.z;
    const l = Math.hypot(dx, dz) || 1;
    const h = { x: (-dz / l) * (WALL_T / 2), z: (dx / l) * (WALL_T / 2) };
    const box = {
      a1: { x: o.a.x + h.x, z: o.a.z + h.z },
      b1: { x: o.b.x + h.x, z: o.b.z + h.z },
      b2: { x: o.b.x - h.x, z: o.b.z - h.z },
      a2: { x: o.a.x - h.x, z: o.a.z - h.z },
    };
    pushWallBlock(box, 0, 1, yb, yb + o.height, {
      fill: paint,
      top: mixHex(paint, '#FFFFFF', 0.3),
      stroke: pal.wallStroke,
      topStroke: pal.wallStroke,
      captured: !!captured,
      closeBottom: true,
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
    /**
     * Un meuble POSE PAR TERRE.
     *
     * Le catalogue place le meuble en supposant le sol à l'altitude zéro,
     * or le sol d'un scan est où ARKit l'a trouvé — souvent 50 cm plus bas.
     * Le lit flottait donc en l'air. On rattrape ici tout ce qui plane à
     * moins de 45 cm sans raison : aucun meuble de cette liste ne se
     * suspend, et une télé murale, elle, est bien plus haut.
     */
    let yb = Math.max(0, obj.yCenter - obj.height / 2 - floorY);
    if (yb > 0 && yb < 0.45 && POSE_AU_SOL.test(obj.category ?? '')) yb = 0;
    const skin = opts.showTextures ? obj.color : undefined;
    const teintes = {
      body: skin ?? pal.object,
      soft: mixHex(skin ?? pal.object, '#FFFFFF', 0.45),
      dark: mixHex(skin ?? pal.object, '#0B0D12', 0.42),
    };
    // Un meuble est un VOLUME, comme un mur : ses faces portent leur normale
    // sortante et celles qui tournent le dos ne sont pas dessinées. Sans ça,
    // les quatre flancs se disputaient l'ordre d'affichage et l'un ou l'autre
    // clignotait au fil de la rotation.
    //
    // L'ordre des coins est celui qui donne des normales SORTANTES avec la
    // convention de `pushWallBlock` : c3→c2 borde le côté +n.
    /**
     * Une pièce du meuble, posée dans son repère.
     *
     * `pushWallBlock` attend un quadrilatère au sol et deux altitudes : on
     * lui donne l'emprise de la pièce, tournée comme le meuble. L'ordre des
     * coins est celui qui donne des normales SORTANTES — c3→c2 borde le
     * côté +n —, sans quoi les quatre flancs se disputent l'affichage.
     */
    const poser = (part: FurnPart) => {
      const bloc = [
        [part.x0, part.z0],
        [part.x1, part.z0],
        [part.x1, part.z1],
        [part.x0, part.z1],
      ].map(([ux, uz]) => {
        const lx = (ux - 0.5) * obj.width;
        const lz = (uz - 0.5) * obj.depth;
        return {
          x: obj.cx + lx * cosY - lz * sinY,
          z: obj.cz + lx * sinY + lz * cosY,
        };
      });
      const fond = yb + part.y0 * obj.height;
      const haut = yb + part.y1 * obj.height;
      if (haut - fond < 1e-4) return;
      const fill = teintes[part.tone];
      pushWallBlock(
        { a1: bloc[3], b1: bloc[2], b2: bloc[1], a2: bloc[0] },
        0,
        1,
        fond,
        haut,
        {
          fill,
          top: mixHex(fill, '#FFFFFF', 0.3),
          stroke: pal.objectStroke,
          topStroke: pal.objectStroke,
          captured: !!skin,
          // Toujours ombré : deux flancs du même aplat ne se distinguent
          // que par leur contour, et un meuble paraît alors amputé d'une
          // face.
          shade: true,
          // Une télé ou une étagère ne touchent pas le sol : leur dessous se
          // voit depuis le bas de la pièce.
          closeBottom: fond > 1e-3,
        },
      );
    };

    // La silhouette du meuble, s'il en a une ; sinon, la boîte pleine.
    // Elle reste montée PENDANT les gestes : voir le lit se changer en
    // caisse dès qu'on tourne la pièce, puis redevenir un lit au relâcher,
    // c'est pire que tout — et une douzaine de faces de plus par meuble ne
    // se sent pas.
    const morceaux = furnitureParts(obj.category ?? '');
    if (morceaux.length === 0) {
      poser({ x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1, tone: 'body' });
    } else {
      for (const part of morceaux) poser(part);
    }
  }

  return { faces, rooms, floorY };
}

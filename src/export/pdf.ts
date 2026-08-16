/* eslint-disable no-bitwise -- encodeurs binaires (octets PDF, base64) */
/**
 * Générateur PDF maison (aucune dépendance) — rendu « plan d'architecte » :
 * murs pochés, symboles de portes/fenêtres, lignes de cote extérieures,
 * cadre de feuille et cartouche avec logo EchoPlan. En option, une feuille
 * de vues 3D avec les mesures portées sur les murs.
 * PDF 1.4 non compressé, A4, polices Helvetica (WinAnsi).
 */
import type { FloorData, ObjectData } from 'react-native-room-scan';
import {
  clampFootprint,
  quadPoints,
  roomExtent,
  roomHeight,
  roomOf,
  roomParts,
  segLength,
  toFootprint,
  wallAreaM2,
  wallQuads,
  WALL_T,
  type RoomShape,
  type WallSeg,
} from '../geometry/floorplan';
import { dotStep, floorDots, mixHex } from '../geometry/appearance';
import {
  FIXTURES,
  FIXTURE_TAG,
  assemblySymbol,
  faceX,
  facePoint,
  stackRanks,
  wallFace,
  type Fixture,
  type FixtureKind,
  type SymbolStroke,
} from '../geometry/electrical';
import type { Differential, MaterialList } from '../geometry/nfc15100';
import {
  WIRE_COLORS,
  type MultiWireSchema,
  type SchemaRow,
} from '../geometry/schema';
import type { BuyRow, PullRow } from '../geometry/conduits';
import { planFrameAngle } from '../geometry/floorplan';
import {
  buildScene,
  isHiddenFace,
  sceneFraming,
  shadeFill,
  type P3,
  type ScenePalette,
} from '../geometry/scene3d';
import { frCategory, furnKind, furnitureStrokes } from '../geometry/furniture';

const PAGE_W = 595;
const PAGE_H = 842;

// Couleurs du plan
const INK = '#141922';
const GREY = '#5A6472';
const GREY_LIGHT = '#98A1AE';
const AMBER = '#B97F26';
const SKY = '#2E93BD';

// ------------------------------------------------------------ encodage

/** Ramène une chaîne en Latin-1 (les autres signes → '?'). */
function latin1(s: string): string {
  let out = '';
  for (const ch of s) {
    out += ch.codePointAt(0)! <= 0xff ? ch : '?';
  }
  return out;
}

function escText(s: string): string {
  return latin1(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Tronque une chaîne pour tenir dans maxW points (Helvetica ≈ 0,52 em/signe). */
function fitText(s: string, size: number, maxW: number): string {
  const perChar = size * 0.52;
  const max = Math.max(1, Math.floor(maxW / perChar));
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** Paramètres de cadrage validés dans l'aperçu (fractions de demi-boîte). */
export interface PlanViewParams {
  zoom: number;
  fx: number;
  fy: number;
}
export interface View3DParams {
  theta: number;
  tilt: number;
  zoom: number;
  fx: number;
  fy: number;
}
export interface PdfOptions {
  plan?: PlanViewParams;
  views?: [View3DParams, View3DParams];
  colorOpenings?: boolean;
  /** Cotes sur le plan 2D / sur les vues 3D. */
  measures2D?: boolean;
  measures3D?: boolean;
  /** Surface au sol (fond pointillé + valeur en m²). Activée par défaut. */
  surfaces?: boolean;
  /** Couleurs et textures relevées pendant le scan. */
  textures?: boolean;
  /** Feuille de métré par pièce (surfaces, périmètres, murs nets). */
  metre?: boolean;
  /**
   * Schémas unifilaire et multifilaire : deux feuilles de plus, tirées des
   * circuits déjà calculés. Absent = pas de schéma, et le dossier garde sa
   * pagination d'avant.
   */
  schemas?: {
    rows: SchemaRow[];
    differentials: Differential[];
    multi: MultiWireSchema[];
  } | null;
}

function bytesOf(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out;
}

// ------------------------------------------------------- document PDF

function buildDocument(pageStreams: string[]): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const f1 = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  const f2 = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );
  const contentIds = pageStreams.map((s) =>
    add(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`),
  );
  const pageIds = contentIds.map((cid) =>
    add(
      `<< /Type /Page /Parent @P 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cid} 0 R >>`,
    ),
  );
  const pagesId = add(
    `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
  );
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  for (const i of pageIds) {
    objects[i - 1] = objects[i - 1].replace('@P', String(pagesId));
  }

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    out += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  out +=
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n` +
    `startxref\n${xref}\n%%EOF`;
  return bytesOf(out);
}

// -------------------------------------------------- primitives de dessin

interface Pt {
  x: number;
  y: number;
}
const n2 = (v: number) => (Math.round(v * 100) / 100).toString();
const hexRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

class Draw {
  ops: string[] = [];

  line(x1: number, y1: number, x2: number, y2: number, w: number, hex: string) {
    this.path([{ x: x1, y: y1 }, { x: x2, y: y2 }], w, hex);
  }

  /** Polyligne à bouts et angles ronds. */
  path(pts: Pt[], w: number, hex: string) {
    if (pts.length < 2) return;
    const [r, g, b] = hexRgb(hex);
    this.ops.push(
      `${n2(r)} ${n2(g)} ${n2(b)} RG ${n2(w)} w 1 J 1 j ` +
        pts.map((p, i) => `${n2(p.x)} ${n2(p.y)} ${i === 0 ? 'm' : 'l'}`).join(' ') +
        ' S',
    );
  }

  /** Ligne brisée en tireté : le cheminement d'une gaine. */
  dashedPath(pts: Pt[], w: number, hex: string, dash: [number, number]) {
    if (pts.length < 2) return;
    const [r, g, b] = hexRgb(hex);
    this.ops.push(
      `q [${dash[0]} ${dash[1]}] 0 d ${n2(r)} ${n2(g)} ${n2(b)} RG ${n2(w)} w 1 J 1 j ` +
        pts.map((p, i) => `${n2(p.x)} ${n2(p.y)} ${i === 0 ? 'm' : 'l'}`).join(' ') +
        ' S Q',
    );
  }

  poly(
    pts: Pt[],
    fillHex: string | null,
    strokeHex: string | null,
    sw = 0.8,
    dashed = false,
  ) {
    if (pts.length < 3) return;
    let op = dashed ? '[4 3] 0 d ' : '[] 0 d ';
    if (fillHex) {
      const [r, g, b] = hexRgb(fillHex);
      op += `${n2(r)} ${n2(g)} ${n2(b)} rg `;
    }
    if (strokeHex) {
      const [r, g, b] = hexRgb(strokeHex);
      op += `${n2(r)} ${n2(g)} ${n2(b)} RG ${n2(sw)} w 1 j `;
    }
    op += pts
      .map((p, i) => `${n2(p.x)} ${n2(p.y)} ${i === 0 ? 'm' : 'l'}`)
      .join(' ');
    op += fillHex && strokeHex ? ' b' : fillHex ? ' f' : ' s';
    this.ops.push(op);
  }

  rect(x: number, y: number, w: number, h: number, fill: string | null, stroke: string | null, sw = 1) {
    this.poly(
      [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ],
      fill,
      stroke,
      sw,
    );
  }

  /**
   * Fenêtre de découpe : tout ce qui suit est rogné à ce rectangle, jusqu'au
   * `restore()`. C'est la seule façon sûre de contenir un dessin dont
   * l'échelle vient de l'utilisateur — un plan zoomé dans l'aperçu d'export
   * débordait de sa zone et allait barrer le cartouche.
   */
  save() {
    this.ops.push('q');
  }

  restore() {
    this.ops.push('Q');
  }

  clip(x: number, y: number, w: number, h: number) {
    this.ops.push(`${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re W n`);
  }

  circle(cx: number, cy: number, r: number, fill: string) {
    const pts: Pt[] = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    this.poly(pts, fill, null);
  }

  /** Texte ancré au centre (ou à gauche), tournable (degrés, sens trigo). */
  text(
    str: string,
    x: number,
    y: number,
    size: number,
    hex: string,
    opts: { bold?: boolean; angle?: number; align?: 'center' | 'left' } = {},
  ) {
    const s = escText(str);
    const [r, g, b] = hexRgb(hex);
    const a = ((opts.angle ?? 0) * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const w = opts.align === 'left' ? 0 : latin1(str).length * size * 0.5;
    const tx = x - (w / 2) * cos;
    const ty = y - (w / 2) * sin;
    this.ops.push(
      `BT /${opts.bold ? 'F2' : 'F1'} ${n2(size)} Tf ${n2(r)} ${n2(g)} ${n2(b)} rg ` +
        `${n2(cos)} ${n2(sin)} ${n2(-sin)} ${n2(cos)} ${n2(tx)} ${n2(ty)} Tm (${s}) Tj ET`,
    );
  }

  stream(): string {
    return this.ops.join('\n');
  }
}

// ------------------------------------------------ logo vectoriel EchoPlan

/** Le logo de l'app, redessiné en vectoriel PDF (repère 76 → size) :
 *  fond blanc, glyphe noir, ondes en gris croissant vers l'angle. */
function drawLogo(d: Draw, x: number, y: number, size: number) {
  const k = size / 76;
  const X = (gx: number) => x + gx * k;
  const Y = (gy: number) => y + (76 - gy) * k; // repère glyphe (y bas) → PDF (y haut)
  d.rect(x, y, size, size, '#FFFFFF', '#D6DBE3', 0.8);
  for (const arc of [
    { r: 11, o: '#4A4E55' }, // ≈ noir à 70 %
    { r: 19, o: '#23262B' }, // ≈ noir à 90 %
  ]) {
    const pts: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = ((-85 + (80 * i) / 12) * Math.PI) / 180;
      pts.push({ x: X(25 + arc.r * Math.cos(a)), y: Y(51 + arc.r * Math.sin(a)) });
    }
    d.path(pts, 4.5 * k, arc.o);
  }
  d.path(
    [
      { x: X(25), y: Y(23) },
      { x: X(53), y: Y(23) },
      { x: X(53), y: Y(51) },
    ],
    5 * k,
    '#0B0D12',
  );
}

// --------------------------------------------------- cadre et cartouche

const FRAME = { x: 30, y: 30, w: PAGE_W - 60, h: PAGE_H - 60 };
const TITLE_H = 66;

function drawSheetChrome(
  d: Draw,
  info: {
    project: string;
    filename: string;
    sheetTitle: string;
    sheet: string;
    scaleLabel: string | null;
  },
) {
  // Cadre de feuille
  d.rect(FRAME.x, FRAME.y, FRAME.w, FRAME.h, null, INK, 1.2);

  // Cartouche — chaque texte est tronqué à la largeur de sa colonne.
  const ty = FRAME.y;
  d.line(FRAME.x, ty + TITLE_H, FRAME.x + FRAME.w, ty + TITLE_H, 1.2, INK);
  const cols = [FRAME.x + 148, FRAME.x + 318, FRAME.x + 408];
  const colEnd = [cols[1], cols[2], FRAME.x + FRAME.w];
  const width = (i: number) => colEnd[i] - cols[i] - 22;
  for (const cx of cols) {
    d.line(cx, ty, cx, ty + TITLE_H, 0.8, INK);
  }

  // Bloc marque
  drawLogo(d, FRAME.x + 12, ty + 14, 38);
  d.text('EchoPlan', FRAME.x + 58, ty + 36, 13, INK, { bold: true, align: 'left' });
  d.text('Scan 3D & plans', FRAME.x + 58, ty + 22, 7.5, GREY, { align: 'left' });

  // Bloc projet
  d.text('PROJET', cols[0] + 12, ty + 50, 6.5, GREY_LIGHT, { align: 'left' });
  d.text(fitText(info.project, 10.5, width(0)), cols[0] + 12, ty + 37, 10.5, INK, {
    bold: true,
    align: 'left',
  });
  d.text('FICHIER', cols[0] + 12, ty + 24, 6.5, GREY_LIGHT, { align: 'left' });
  d.text(fitText(info.filename, 8, width(0)), cols[0] + 12, ty + 12, 8, GREY, {
    align: 'left',
  });

  // Bloc date / échelle
  const now = new Date();
  const two = (v: number) => String(v).padStart(2, '0');
  d.text('DATE', cols[1] + 12, ty + 50, 6.5, GREY_LIGHT, { align: 'left' });
  d.text(
    `${two(now.getDate())}/${two(now.getMonth() + 1)}/${now.getFullYear()}`,
    cols[1] + 12,
    ty + 38,
    9.5,
    INK,
    { align: 'left' },
  );
  d.text('ÉCHELLE', cols[1] + 12, ty + 24, 6.5, GREY_LIGHT, { align: 'left' });
  d.text(fitText(info.scaleLabel ?? '—', 9.5, width(1)), cols[1] + 12, ty + 12, 9.5, INK, {
    align: 'left',
  });

  // Bloc feuille
  d.text('DOCUMENT', cols[2] + 12, ty + 50, 6.5, GREY_LIGHT, { align: 'left' });
  d.text(fitText(info.sheetTitle, 8.5, width(2)), cols[2] + 12, ty + 38, 8.5, INK, {
    align: 'left',
  });
  d.text('FEUILLE', cols[2] + 12, ty + 24, 6.5, GREY_LIGHT, { align: 'left' });
  d.text(info.sheet, cols[2] + 12, ty + 12, 10, INK, { bold: true, align: 'left' });
}

// ----------------------------------------------------------- géométrie 3D

/** Palette 3D de la feuille imprimée (encres du plan, pas du thème écran). */
const PDF_SCENE: ScenePalette = {
  floor: '#EFF1F5',
  floorStroke: '#C9D1DC',
  wall: '#FFFFFF',
  wallStroke: '#77828F',
  wallTop: '#F2F5F9',
  wallTopStroke: '#77828F',
  opening: '#B9C2CE',
  door: '#E8A13B',
  window: '#3EB8E5',
  passage: '#2F6BFF',
  object: '#D8E1F2',
  objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};

function draw3DView(
  d: Draw,
  walls: WallSeg[],
  openings: WallSeg[],
  objects: ObjectData[],
  box: { x: number; y: number; w: number; h: number },
  view: View3DParams,
  opts: {
    colorOpenings?: boolean;
    showDims?: boolean;
    showSurfaces?: boolean;
    showTextures?: boolean;
    floors?: Record<string, FloorData | null | undefined>;
    roomNames?: Record<string, string>;
    rooms?: RoomShape[];
    fixtures?: Fixture[];
  } = {},
) {
  const thetaDeg = view.theta;
  const tiltDeg = view.tilt;
  const showDims = opts.showDims ?? true;
  // Exactement la même scène que la vue 3D de l'app.
  const scene = buildScene(walls, openings, objects, {
    palette: PDF_SCENE,
    colorOpenings: opts.colorOpenings,
    showSurfaces: opts.showSurfaces,
    showTextures: opts.showTextures,
    floors: opts.floors,
    rooms: opts.rooms,
    fixtures: opts.fixtures,
  });
  const faces = scene.faces;
  if (faces.length === 0) return;
  // Même cadrage que la vue 3D de l'app : boîte englobante, pas moyenne.
  const { center: ctr, radius3d: r3 } = sceneFraming(faces);
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const ct = Math.cos(rad(thetaDeg));
  const st = Math.sin(rad(thetaDeg));
  const cp = Math.cos(rad(tiltDeg));
  const sp = Math.sin(rad(tiltDeg));
  const scale = ((Math.min(box.w, box.h) * 0.46) / r3) * view.zoom;
  const cx = box.x + box.w / 2 + view.fx * (box.w / 2);
  const cy = box.y + box.h / 2 - view.fy * (box.h / 2);

  const project = (p: P3) => {
    const x = p.x - ctr.x;
    const y = p.y - ctr.y;
    const z = p.z - ctr.z;
    const rx = x * ct - z * st;
    const rz = x * st + z * ct;
    return {
      x: cx + rx * scale,
      y: cy - (rz * cp - y * sp) * scale, // PDF : y vers le haut
      depth: rz * sp + y * cp,
    };
  };

  // Même masquage des faces arrière que dans la vue de l'app : le PDF doit
  // montrer exactement le même volume.
  const cam = { ct, st, cp, sp };
  const polys = faces
    .filter((f) => !isHiddenFace(f, cam))
    .map((f) => {
      const pts = f.pts.map(project);
      // Une arête se trie avec le pan qu'elle borde (`depthAt`).
      const depth = f.isFloor
        ? -Infinity
        : (f.depthRefs
            ? Math.max(...f.depthRefs.map((r) => project(r).depth))
            : f.depthAt ? project(f.depthAt).depth
                     : pts.reduce((s, p) => s + p.depth, 0) / pts.length) +
          (f.bias ?? 0);
      const fill = shadeFill(f, ct, st);
      // Pan sans contour propre : bordé de sa propre couleur, sinon la couture
      // entre deux bandes voisines se voit à l'impression.
      return { pts, depth, fill, stroke: f.stroke ?? fill, dashed: !!f.dashed };
    });
  // Cotes insérées dans le tri de profondeur : un mur proche les recouvre.
  type Item =
    | {
        kind: 'poly';
        depth: number;
        pts: Pt[];
        fill: string | null;
        stroke: string | null;
        dashed?: boolean;
      }
    | { kind: 'dot'; depth: number; x: number; y: number; color: string }
    | { kind: 'label'; depth: number; x: number; y: number; text: string }
    | { kind: 'area'; depth: number; x: number; y: number; text: string };
  const items: Item[] = polys.map((p) => ({ kind: 'poly' as const, ...p }));

  // Semis du sol et surface : mêmes repères que sur le plan 2D, pièce
  // par pièce — chaque sol garde sa teinte et porte son propre libellé.
  if (opts.showSurfaces) {
    const budget = Math.max(150, Math.round(600 / Math.max(1, scene.rooms.length)));
    for (const room of scene.rooms) {
      if (!room.surface) continue;
      const dotColor = mixHex(room.floorFill, '#4A5361', 0.55);
      for (const p of floorDots(room.surface.pts, dotStep(scale, 13), budget)) {
        const q = project({ x: p.x, y: 0, z: p.z });
        items.push({ kind: 'dot', depth: -Infinity, x: q.x, y: q.y, color: dotColor });
      }
      const q = project({ x: room.labelAt.x, y: 0, z: room.labelAt.z });
      const name = opts.roomNames?.[room.roomId] ?? '';
      const area = `${room.surface.exact ? '' : '≈ '}${fr1(room.surface.area)} m²`;
      // Au large, et par-dessus les murs : c'est une annotation.
      items.push({
        kind: 'area',
        depth: Infinity,
        x: q.x,
        y: q.y,
        text: name ? `${name} · ${area}` : area,
      });
    }
  }

  for (const w of showDims ? walls : []) {
    const mid = project({
      x: (w.a.x + w.b.x) / 2,
      y: w.height,
      z: (w.a.z + w.b.z) / 2,
    });
    items.push({
      kind: 'label',
      depth: mid.depth + 0.03,
      x: mid.x,
      y: mid.y + 5,
      text: `${segLength(w).toFixed(2).replace('.', ',')} m`,
    });
  }
  items.sort((p, q) => p.depth - q.depth);
  for (const item of items) {
    if (item.kind === 'poly') {
      if (item.pts.length === 2 && item.stroke) {
        // Arête isolée : `poly` refuse deux points, il faut un trait.
        d.line(
          item.pts[0].x,
          item.pts[0].y,
          item.pts[1].x,
          item.pts[1].y,
          item.dashed ? 1.3 : 0.7,
          item.stroke,
        );
      } else {
        d.poly(item.pts, item.fill, item.stroke, item.dashed ? 1.3 : 0.7, item.dashed);
      }
    } else if (item.kind === 'dot') {
      d.circle(item.x, item.y, 0.55, item.color);
    } else if (item.kind === 'area') {
      d.text(item.text, item.x, item.y, 9.5, INK, { bold: true });
    } else {
      d.text(item.text, item.x, item.y, 8, '#2A3340');
    }
  }
}

// -------------------------------------------------------------- pages

const fr1 = (v: number) => v.toFixed(1).replace('.', ',');
const frLen = (v: number) => v.toFixed(2).replace('.', ',');

/** Ce qui est commun à toutes les feuilles d'un même export. */
interface SheetContext {
  name: string;
  filename: string;
  walls: WallSeg[];
  openings: WallSeg[];
  objects: ObjectData[];
  /** Relevé du sol par pièce. */
  floors: Record<string, FloorData | null | undefined>;
  /** Nom donné à chaque pièce (vide = pièce non nommée). */
  roomNames: Record<string, string>;
  /** Pièces du scan, avec les murs qui bordent chacune. */
  rooms?: RoomShape[];
  /** Appareillage électrique posé sur les murs. */
  fixtures?: Fixture[];
  colorOpenings: boolean;
  showSurfaces: boolean;
  showTextures: boolean;
  /** Cheminement des gaines, en coordonnées MONDE (`Pt` est ici la page). */
  routes?: { id: string; path: { x: number; z: number }[] }[];
}

function planPage(
  ctx: SheetContext,
  sheet: string,
  planView?: PlanViewParams,
  showDims = true,
): string {
  const {
    name,
    filename,
    walls,
    openings,
    objects,
    colorOpenings,
    showSurfaces,
    showTextures,
    floors,
    roomNames,
  } = ctx;
  const d = new Draw();
  // Une entrée par pièce : contour, centre, teinte de sol. Tout ce qui suit
  // (meubles, ouvertures, cotes, cartouches) se règle sur la pièce concernée.
  const parts = roomParts(walls, ctx.rooms);
  const fillOf = (roomId: string) => {
    const captured = showTextures ? floors[roomId]?.color : undefined;
    return captured ? mixHex(captured, '#FFFFFF', 0.42) : '#F5F7FA';
  };
  const partOf = new Map(parts.map((p) => [p.roomId, p]));
  // Le « dedans » d'une pièce : le point au large, pas le barycentre des
  // extrémités de murs — celui-ci sort de la pièce dès qu'elle est en L.
  const centerOf = (roomId: string) =>
    partOf.get(roomId)?.labelAt ?? { x: 0, z: 0 };

  // Zone de dessin (cotes extérieures comprises)
  const box = {
    x: FRAME.x + 70,
    y: FRAME.y + TITLE_H + 70,
    w: FRAME.w - 140,
    h: FRAME.h - TITLE_H - 140,
  };
  /**
   * Le plan se dessine SUR LA TRAME DU LOGEMENT, pas dans le repère du scan.
   *
   * ARKit oriente son monde selon l'endroit où le scan a commencé : un
   * appartement scanné de biais sortait de biais, ses cotes en écharpe,
   * leurs attaches filant vers les coins de la feuille. Une rotation de la
   * géométrie avant projection remet les murs d'aplomb — c'est ce que fait
   * n'importe quel dessinateur avant de coter.
   */
  const trame = planFrameAngle(walls);
  const cosT = Math.cos(-trame);
  const sinT = Math.sin(-trame);
  const R = (p: { x: number; z: number }) => ({
    x: p.x * cosT - p.z * sinT,
    z: p.x * sinT + p.z * cosT,
  });
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity;
  for (const w of walls) {
    for (const p0 of [w.a, w.b]) {
      const p = R(p0);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
  }
  let scaleLabel: string | null = null;
  if (isFinite(minX)) {
    // Rien du plan ne peut sortir de la feuille : le zoom choisi dans
    // l'aperçu s'applique tel quel, et un plan agrandi allait jusqu'à
    // traverser le cartouche.
    d.save();
    d.clip(
      FRAME.x + 2,
      FRAME.y + TITLE_H + 2,
      FRAME.w - 4,
      FRAME.h - TITLE_H - 4,
    );
    const fit = Math.min(
      box.w / Math.max(maxX - minX, 0.5),
      box.h / Math.max(maxZ - minZ, 0.5),
    );
    // Cadrage validé dans l'aperçu : zoom et décalage du plan.
    const scale = fit * (planView?.zoom ?? 1);
    // 1 m = scale pt = scale × 0,3528 mm → ratio réel arrondi à l'usage.
    const ratio = 1000 / (scale * 0.352778);
    const nice = [20, 25, 50, 75, 100, 125, 150, 200].find((v) => v >= ratio) ?? 250;
    scaleLabel = `~ 1:${nice}`;

    const cxw = (minX + maxX) / 2;
    const czw = (minZ + maxZ) / 2;
    const bcx = box.x + box.w / 2 + (planView?.fx ?? 0) * (box.w / 2);
    const bcy = box.y + box.h / 2 - (planView?.fy ?? 0) * (box.h / 2);
    const px = (p0: { x: number; z: number }): Pt => {
      const p = R(p0);
      return {
        x: bcx + (p.x - cxw) * scale,
        y: bcy + (czw - p.z) * scale,
      };
    };
    /** Dans le cadre de dessin ? Rien ne doit fuir vers les bords. */
    const dansLeCadre = (q: Pt) =>
      q.x > box.x - 30 &&
      q.x < box.x + box.w + 30 &&
      q.y > box.y - 30 &&
      q.y < box.y + box.h + 30;

    // Surfaces au sol : un aplat et un semis par pièce, pour les distinguer
    // d'emblée des murs pochés en noir.
    if (showSurfaces) {
      const budget = Math.max(300, Math.round(1500 / Math.max(1, parts.length)));
      for (const part of parts) {
        if (!part.surface) continue;
        const fill = fillOf(part.roomId);
        d.poly(part.surface.pts.map(px), fill, null);
        const dotColor = mixHex(fill, '#3D4551', 0.55);
        for (const p of floorDots(part.surface.pts, dotStep(scale, 13), budget)) {
          const q = px(p);
          d.circle(q.x, q.y, 0.55, dotColor);
        }
      }
    }

    // Meubles : contour + symbole d'architecte, recalés devant les murs
    // de LEUR pièce.
    for (const o of objects.map((ob) =>
      clampFootprint(
        toFootprint(ob),
        partOf.get(roomOf(ob))?.walls ?? walls,
        centerOf(roomOf(ob)),
      ),
    )) {
      const cosY = Math.cos(o.yaw);
      const sinY = Math.sin(o.yaw);
      const hw = o.width / 2;
      const hd = o.depth / 2;
      const loc = (lx: number, lz: number) =>
        px({ x: o.cx + lx * cosY - lz * sinY, z: o.cz + lx * sinY + lz * cosY });
      const pts = [
        [-hw, -hd],
        [hw, -hd],
        [hw, hd],
        [-hw, hd],
      ].map(([lx, lz]) => loc(lx, lz));
      d.poly(pts, '#FFFFFF', '#9FACBF', 0.8);
      for (const line of furnitureStrokes(furnKind(o.category), o.width, o.depth)) {
        d.path(line.map((p) => loc(p.x, p.y)), 0.7, '#9FACBF');
      }
      // Nom du meuble au centre, si la place le permet.
      if (o.width * scale > 42 && o.depth * scale > 16) {
        const ctr2 = loc(0, 0);
        d.text(frCategory(o.category), ctr2.x, ctr2.y - 2.5, 7, GREY);
      }
    }

    // Murs pochés (noir plein, jonctions d'onglet partagées)
    const quads = wallQuads(walls);
    for (const w of walls) {
      const q = quads.get(w.id);
      if (q) d.poly(quadPoints(q).map(px), INK, null);
    }

    // Ouvertures : trouée blanche + symbole
    for (const o of openings) {
      const room = roomOf(o);
      const centroid = centerOf(room);
      const dx = o.b.x - o.a.x;
      const dz = o.b.z - o.a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * (WALL_T / 2 + 0.02);
      const nz = (dx / len) * (WALL_T / 2 + 0.02);
      d.poly(
        [
          { x: o.a.x + nx, z: o.a.z + nz },
          { x: o.b.x + nx, z: o.b.z + nz },
          { x: o.b.x - nx, z: o.b.z - nz },
          { x: o.a.x - nx, z: o.a.z - nz },
        ].map(px),
        showSurfaces && partOf.get(room)?.surface ? fillOf(room) : '#FFFFFF',
        null,
      );

      // Côté intérieur de la pièce
      const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
      let inx = -dz / len;
      let inz = dx / len;
      if (inx * (centroid.x - mid.x) + inz * (centroid.z - mid.z) < 0) {
        inx = -inx;
        inz = -inz;
      }

      if (o.type === 'door') {
        // Battant + arc d'ouverture (charnière en A)
        const leafEnd = { x: o.a.x + inx * len, z: o.a.z + inz * len };
        d.line(px(o.a).x, px(o.a).y, px(leafEnd).x, px(leafEnd).y, 1.4,
               colorOpenings ? AMBER : GREY);
        const arc: Pt[] = [];
        const a0 = Math.atan2(dz, dx);
        const a1 = Math.atan2(inz, inx);
        for (let i = 0; i <= 10; i++) {
          const t = a0 + ((a1 - a0) * i) / 10;
          arc.push(px({ x: o.a.x + Math.cos(t) * len, z: o.a.z + Math.sin(t) * len }));
        }
        d.path(arc, 0.8, GREY);
      } else {
        // Fenêtre / ouverture : double trait dans la trouée
        const wx = (-dz / len) * (WALL_T / 4);
        const wz = (dx / len) * (WALL_T / 4);
        const color = colorOpenings && o.type === 'window' ? SKY : GREY;
        d.line(px({ x: o.a.x + wx, z: o.a.z + wz }).x, px({ x: o.a.x + wx, z: o.a.z + wz }).y,
               px({ x: o.b.x + wx, z: o.b.z + wz }).x, px({ x: o.b.x + wx, z: o.b.z + wz }).y, 1, color);
        d.line(px({ x: o.a.x - wx, z: o.a.z - wz }).x, px({ x: o.a.x - wx, z: o.a.z - wz }).y,
               px({ x: o.b.x - wx, z: o.b.z - wz }).x, px({ x: o.b.x - wx, z: o.b.z - wz }).y, 1, color);
      }
    }

    // Lignes de cote extérieures (attaches + tirets à 45°)
    for (const w of showDims ? walls : []) {
      const a = px(w.a);
      const b = px(w.b);
      const dx2 = b.x - a.x;
      const dy2 = b.y - a.y;
      const norm = Math.hypot(dx2, dy2) || 1;
      const ux2 = dx2 / norm;
      const uy2 = dy2 / norm;
      let nx2 = -uy2;
      let ny2 = ux2;
      // vers l'extérieur : à l'opposé du centre de SA pièce
      const midPt = px({ x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 });
      const cPt = px(centerOf(roomOf(w)));
      if (nx2 * (cPt.x - midPt.x) + ny2 * (cPt.y - midPt.y) > 0) {
        nx2 = -nx2;
        ny2 = -ny2;
      }
      const off = WALL_T * scale + 16;
      const A = { x: a.x + nx2 * off, y: a.y + ny2 * off };
      const B = { x: b.x + nx2 * off, y: b.y + ny2 * off };
      // attaches
      d.line(a.x + nx2 * 4, a.y + ny2 * 4, A.x + nx2 * 4, A.y + ny2 * 4, 0.6, GREY);
      d.line(b.x + nx2 * 4, b.y + ny2 * 4, B.x + nx2 * 4, B.y + ny2 * 4, 0.6, GREY);
      // ligne de cote
      d.line(A.x, A.y, B.x, B.y, 0.8, INK);
      // tirets à 45°
      const t = 3.2;
      for (const P of [A, B]) {
        d.line(P.x - (ux2 + nx2) * t, P.y - (uy2 + ny2) * t, P.x + (ux2 + nx2) * t, P.y + (uy2 + ny2) * t, 1, INK);
      }
      // valeur
      let angle = (Math.atan2(dy2, dx2) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      d.text(
        `${frLen(segLength(w))} m`,
        (A.x + B.x) / 2 + nx2 * 8,
        (A.y + B.y) / 2 + ny2 * 8 - 3,
        8.5,
        INK,
        { angle },
      );
    }

    // ---------------------------------------- cotes des menuiseries
    // Une porte se commande à sa largeur : elle doit figurer sur le plan,
    // posée le long du mur qui la porte, à l'intérieur pour ne pas se
    // mêler aux cotes extérieures.
    if (showDims) {
      for (const o of openings) {
        const a = px(o.a);
        const b = px(o.b);
        const norm = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        if (norm < 22) continue;
        const ux2 = (b.x - a.x) / norm;
        const uy2 = (b.y - a.y) / norm;
        let nx2 = -uy2;
        let ny2 = ux2;
        const midPt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const cPt = px(centerOf(roomOf(o)));
        // Vers l'INTÉRIEUR : dehors, la cote du mur occupe déjà la place.
        if (nx2 * (cPt.x - midPt.x) + ny2 * (cPt.y - midPt.y) < 0) {
          nx2 = -nx2;
          ny2 = -ny2;
        }
        const off = WALL_T * scale + 12;
        const A = { x: a.x + nx2 * off, y: a.y + ny2 * off };
        const B = { x: b.x + nx2 * off, y: b.y + ny2 * off };
        if (!dansLeCadre(A) || !dansLeCadre(B)) continue;
        d.line(A.x, A.y, B.x, B.y, 0.7, GREY);
        for (const P of [A, B]) {
          d.line(
            P.x - (ux2 + nx2) * 2.6,
            P.y - (uy2 + ny2) * 2.6,
            P.x + (ux2 + nx2) * 2.6,
            P.y + (uy2 + ny2) * 2.6,
            0.9,
            GREY,
          );
        }
        let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        d.text(
          frLen(segLength(o)),
          (A.x + B.x) / 2 + nx2 * 7,
          (A.y + B.y) / 2 + ny2 * 7 - 2.5,
          7.5,
          GREY,
          { angle },
        );
      }
    }

    // ------------------------------------------------- plan des gaines
    // Le cheminement passe SOUS les symboles : c'est un tracé de chantier,
    // pas une annotation. En tireté fin, il se lit sans manger le plan, et
    // il se superpose au métré du tableau de tirage — même source, mêmes
    // longueurs.
    if (ctx.routes && ctx.routes.length > 0) {
      for (const r of ctx.routes) {
        if (r.path.length < 2) continue;
        // Un tireté fin : lisible sans manger le plan, et distinct du trait
        // plein des murs comme du pointillé des passages.
        d.dashedPath(r.path.map(px), 0.7, '#2F6BFF', [4, 3]);
      }
    }

    // ------------------------------------------- appareillage électrique
    // Même convention qu'à l'écran : le symbole se pose DANS la pièce,
    // devant la face qui le porte, relié au mur par un filet. Les appareils
    // qui tombent au même point s'échelonnent le long de ce filet.
    if (ctx.fixtures && ctx.fixtures.length > 0) {
      const murQuads = wallQuads(walls);
      const byId = new Map(walls.map((w) => [w.id, w]));
      const poses = ctx.fixtures
        .map((f) => {
          const w = byId.get(f.wallId);
          if (!w) return null;
          const face = wallFace(w, murQuads.get(w.id), f.side);
          return { f, face, along: faceX(face, f.along) };
        })
        .filter((v): v is NonNullable<typeof v> => !!v);
      const ranks = stackRanks(
        poses.map((v) => ({
          id: v.f.id,
          wallId: v.f.wallId,
          side: v.f.side,
          x: v.along,
        })),
      );
      for (const { f, face, along } of poses) {
        const spec = FIXTURES[f.kind];
        // Une cote d'appareil devenue folle — un mur recoupé depuis la pose,
        // par exemple — enverrait son symbole à l'autre bout de la feuille.
        // On la borne à la face, et on jette ce qui sortirait du cadre.
        const x = Math.max(0, Math.min(face.len, along));
        const out = 0.2 + (ranks.get(f.id) ?? 0) * 0.24;
        const anchor = px(facePoint(face, x, 0.02));
        const q = px(facePoint(face, x, out));
        if (!dansLeCadre(q)) continue;
        d.path([anchor, q], 0.6, spec.color);
        d.circle(q.x, q.y, 6.5, '#FFFFFF');
        drawSymbol(d, assemblySymbol(f.kind), q.x, q.y, 0.5, spec.color, 0.9);
        const tag = FIXTURE_TAG[f.kind];
        if (tag) d.text(tag, q.x + 13, q.y + 4, 5.5, spec.color, { align: 'left' });
      }
      // La légende, au pied de la feuille, à gauche du cartouche.
      const presents = [...new Set(ctx.fixtures.map((f) => f.kind))];
      drawElecLegend(d, presents, FRAME.x + 16, FRAME.y + TITLE_H + 26 + presents.length * 15);
    }

    // Cartouche au centre de chaque pièce : son nom, sa surface. Le texte
    // rétrécit à mesure que les pièces se multiplient et se resserrent.
    if (showSurfaces) {
      const big = parts.length === 1;
      for (const part of parts) {
        if (!part.surface) continue;
        const cp2 = px(part.labelAt);
        const label = roomNames[part.roomId] ?? '';
        const area = `${part.surface.exact ? '' : '≈ '}${fr1(part.surface.area)} m²`;
        // Nom au-dessus, surface en dessous (l'axe y du PDF monte).
        if (label) {
          d.text(label, cp2.x, cp2.y + 3, big ? 14 : 10.5, INK, { bold: true });
          d.text(area, cp2.x, cp2.y - 9, big ? 11 : 9, GREY);
        } else {
          d.text(area, cp2.x, cp2.y + 4, big ? 15 : 11, INK, { bold: true });
          d.text('surface au sol', cp2.x, cp2.y - 10, 8, GREY);
        }
      }
    }

    d.restore();
  }

  drawSheetChrome(d, {
    project: name,
    filename,
    sheetTitle: 'Plan d’ensemble coté',
    sheet,
    scaleLabel,
  });
  return d.stream();
}

/**
 * Feuille de métré : une ligne par pièce.
 *
 * C'est ce qui transforme le plan en document de travail — surface au sol
 * pour un revêtement, surface murale nette pour de la peinture, cotes
 * hors-tout pour se repérer. Le total en pied de tableau est celui qu'on
 * recopie dans un devis.
 */
function metrePage(ctx: SheetContext, sheet: string): string {
  const d = new Draw();
  const parts = roomParts(ctx.walls, ctx.rooms);
  const x0 = FRAME.x + 24;
  const w = FRAME.w - 48;
  // Colonnes : nom, cotes, sol, périmètre, hauteur, murs nets.
  const cols = [0, 0.28, 0.46, 0.6, 0.73, 0.85].map((f) => x0 + f * w);
  const heads = ['Pièce', 'Cotes (m)', 'Sol (m²)', 'Périm. (m)', 'H. (m)', 'Murs (m²)'];
  let y = FRAME.y + FRAME.h - TITLE_H - 46;

  d.text('Métré par pièce', x0, y + 24, 13, INK, { bold: true, align: 'left' });
  for (let i = 0; i < heads.length; i++) {
    d.text(heads[i], cols[i], y, 8.5, GREY, { align: 'left' });
  }
  y -= 6;
  d.line(x0, y, x0 + w, y, 0.8, INK);

  let totalArea2 = 0;
  let totalWalls = 0;
  for (const part of parts) {
    if (y < FRAME.y + 90) break;
    y -= 20;
    const name = ctx.roomNames[part.roomId] || part.roomId;
    const ext = part.surface
      ? roomExtent(part.surface.pts)
      : { width: 0, depth: 0 };
    const perim = part.walls.reduce((s, x) => s + segLength(x), 0);
    const h = roomHeight(part.walls);
    const nets = wallAreaM2(part.walls, ctx.openings);
    totalArea2 += part.surface?.area ?? 0;
    totalWalls += nets;
    const cells = [
      fitText(name, 10, cols[1] - cols[0] - 6),
      `${frLen(ext.width)} × ${frLen(ext.depth)}`,
      part.surface ? `${part.surface.exact ? '' : '≈ '}${fr1(part.surface.area)}` : '—',
      fr1(perim),
      frLen(h),
      fr1(nets),
    ];
    for (let i = 0; i < cells.length; i++) {
      d.text(cells[i], cols[i], y, i === 0 ? 10 : 9.5, i === 0 ? INK : '#2A3340', {
        align: 'left',
        bold: i === 0,
      });
    }
    d.line(x0, y - 7, x0 + w, y - 7, 0.4, GREY_LIGHT);
  }

  y -= 26;
  d.line(x0, y + 12, x0 + w, y + 12, 0.8, INK);
  d.text('Total', cols[0], y, 10, INK, { align: 'left', bold: true });
  d.text(fr1(totalArea2), cols[2], y, 10, INK, { align: 'left', bold: true });
  d.text(fr1(totalWalls), cols[5], y, 10, INK, { align: 'left', bold: true });

  y -= 26;
  d.text(
    'Surface murale nette : périmètre × hauteur, portes et fenêtres déduites.',
    x0,
    y,
    8,
    GREY,
    { align: 'left' },
  );

  drawSheetChrome(d, {
    project: ctx.name,
    filename: ctx.filename,
    sheetTitle: 'Métré par pièce',
    sheet,
    scaleLabel: null,
  });
  return d.stream();
}

/**
 * Schéma unifilaire : l'architecture de l'installation.
 *
 * Ce que lit un contrôleur ou un confrère avant tout le reste — d'où part
 * quoi, sous quelle protection, avec quelle section. On ne réinvente aucun
 * circuit : ce sont exactement ceux de la liste du matériel, mis en forme.
 * Un document qui contredirait la liste ne servirait à rien.
 */
function unifilairePage(
  ctx: SheetContext,
  sheet: string,
  rows: SchemaRow[],
  diffs: Differential[],
): string {
  const d = new Draw();
  const x0 = FRAME.x + 30;
  const w = FRAME.w - 60;
  let y = FRAME.y + FRAME.h - TITLE_H - 46;

  d.text('Schéma unifilaire', x0, y + 22, 13, INK, { bold: true, align: 'left' });
  d.text(
    'Origine, protections, départs. Sections et calibres selon NF C 15-100.',
    x0,
    y + 8,
    8,
    GREY,
    { align: 'left' },
  );
  y -= 14;

  // ---------------------------------------------------------- l'origine
  const cx = x0 + 34;
  d.rect(cx - 26, y - 20, 52, 20, '#FFFFFF', INK, 1);
  d.text('AGCP', cx, y - 8, 8, INK, { bold: true });
  d.text('500 mA S', cx, y - 17, 6.5, GREY);
  d.text('Disjoncteur de branchement', cx + 40, y - 12, 7.5, GREY, {
    align: 'left',
  });
  y -= 20;
  d.line(cx, y, cx, y - 16, 1, INK);
  y -= 16;

  // Le peigne horizontal : tous les différentiels y pendent.
  const parDiff = new Map<string, SchemaRow[]>();
  const libres: SchemaRow[] = [];
  for (const r of rows) {
    if (!r.under) libres.push(r);
    else parDiff.set(r.under, [...(parDiff.get(r.under) ?? []), r]);
  }

  const dessineDepart = (r: SchemaRow, bx: number, by: number) => {
    // Le disjoncteur : un rectangle, sa valeur, et le trait qui descend.
    d.line(bx, by, bx, by - 12, 0.9, INK);
    d.rect(bx - 13, by - 30, 26, 18, '#FFFFFF', INK, 0.9);
    d.text(r.breaker === null ? 'com.' : `${r.breaker} A`, bx, by - 24, 7.5, INK, {
      bold: true,
    });
    d.line(bx, by - 30, bx, by - 44, 0.9, INK);
    // La barre oblique et le nombre de conducteurs : la convention de
    // l'unifilaire, qui dit en un signe ce que le multifilaire détaille.
    d.line(bx - 4, by - 40, bx + 4, by - 34, 0.9, INK);
    d.text(`${r.wires}`, bx + 8, by - 39, 7, GREY, { align: 'left' });
    d.text(r.mark, bx, by - 52, 8, INK, { bold: true });
    const detail =
      r.section === null
        ? `ICTA Ø${r.conduit}`
        : `${r.section} mm² · ICTA Ø${r.conduit}`;
    d.text(detail, bx, by - 61, 6.5, GREY);
  };

  const blocs: { titre: string; sous: string; rows: SchemaRow[] }[] = [];
  diffs.forEach((diff, i) => {
    const list = parDiff.get(`ID${i + 1}`) ?? [];
    if (list.length === 0) return;
    blocs.push({
      titre: `ID${i + 1}`,
      sous: `${diff.rating} A · 30 mA · type ${diff.type}`,
      rows: list,
    });
  });
  if (libres.length > 0) {
    blocs.push({
      titre: 'GTL',
      sous: 'coffret de communication',
      rows: libres,
    });
  }

  for (const bloc of blocs) {
    if (y < FRAME.y + 130) break;
    // Le différentiel, puis son peigne.
    d.rect(cx - 26, y - 20, 52, 20, '#FFFFFF', INK, 1);
    d.text(bloc.titre, cx, y - 8, 8, INK, { bold: true });
    d.text(bloc.sous, cx + 40, y - 12, 7.5, GREY, { align: 'left' });
    y -= 20;
    const nb = bloc.rows.length;
    const largeur = Math.min(w - 60, Math.max(60, nb * 62));
    const gauche = x0 + 30;
    d.line(cx, y, cx, y - 14, 1, INK);
    y -= 14;
    d.line(gauche, y, gauche + largeur, y, 1, INK);
    bloc.rows.forEach((r, i) => {
      const bx = gauche + (nb === 1 ? largeur / 2 : (i * largeur) / (nb - 1));
      dessineDepart(r, bx, y);
      // Le nom du circuit, à la verticale sous le repère.
      d.text(r.label, bx, y - 71, 6.5, GREY);
    });
    y -= 92;
  }

  // -------------------------------------------------------- le tableau
  if (y > FRAME.y + 110) {
    y -= 4;
    d.line(x0, y, x0 + w, y, 0.6, GREY_LIGHT);
    y -= 14;
    d.text('Départs', x0, y, 8.5, GREY, { align: 'left' });
    d.text('Protection · section · gaine', x0 + w, y, 8.5, GREY, {
      align: 'left',
    });
    y -= 12;
    for (const r of rows) {
      if (y < FRAME.y + 70) break;
      d.text(`${r.mark} — ${r.label}`, x0, y, 8, INK, { align: 'left' });
      d.text(r.points, x0 + 150, y, 7.5, GREY, { align: 'left' });
      const droite =
        r.breaker === null
          ? `coffret com. · ICTA Ø${r.conduit}`
          : `${r.breaker} A · ${r.section} mm² · ICTA Ø${r.conduit}`;
      d.text(droite, x0 + w - 4, y, 7.5, INK, { align: 'left' });
      y -= 12;
    }
  }

  drawSheetChrome(d, {
    project: ctx.name,
    filename: ctx.filename,
    sheetTitle: 'Schéma unifilaire',
    sheet,
    scaleLabel: null,
  });
  return d.stream();
}

/**
 * Schéma multifilaire : le câblage, conducteur par conducteur.
 *
 * Les couleurs sont normatives — bleu pour le neutre, vert/jaune pour la
 * terre, et ces deux-là ne servent à rien d'autre. Un schéma qui les
 * emploierait à tort serait faux avant d'être lu, c'est pourquoi elles ne
 * sont pas choisies ici mais reprises de `WIRE_COLORS`.
 */
function multifilairePage(
  ctx: SheetContext,
  sheet: string,
  schemas: MultiWireSchema[],
): string {
  const d = new Draw();
  const x0 = FRAME.x + 30;
  const w = FRAME.w - 60;
  let y = FRAME.y + FRAME.h - TITLE_H - 46;

  d.text('Schéma multifilaire', x0, y + 22, 13, INK, { bold: true, align: 'left' });
  d.text(
    'Un conducteur par trait, à sa couleur normalisée (NF C 15-100).',
    x0,
    y + 8,
    8,
    GREY,
    { align: 'left' },
  );
  y -= 16;

  // La légende des couleurs, une fois pour toute la feuille.
  let lx = x0;
  for (const role of ['phase', 'neutre', 'terre', 'navette', 'retour'] as const) {
    const { color, label } = WIRE_COLORS[role];
    d.line(lx, y, lx + 14, y, 2, color);
    d.text(label, lx + 18, y - 3, 6.5, GREY, { align: 'left' });
    lx += 104;
  }
  y -= 18;

  for (const sch of schemas) {
    const haut = 34 + sch.wires.length * 9;
    if (y - haut < FRAME.y + 80) break;
    d.line(x0, y, x0 + w, y, 0.6, GREY_LIGHT);
    y -= 14;
    d.text(`${sch.mark} — ${sch.label}`, x0, y, 9, INK, {
      bold: true,
      align: 'left',
    });
    y -= 12;

    // Le disjoncteur à gauche, les appareils à droite, les fils entre.
    const gx = x0 + 6;
    const dx = x0 + w - 6;
    d.rect(gx, y - sch.wires.length * 9 - 4, 22, sch.wires.length * 9 + 8, '#FFFFFF', INK, 0.9);
    d.text(sch.mark, gx + 11, y - sch.wires.length * 9 / 2 - 2, 7, INK, {
      bold: true,
    });

    sch.wires.forEach((fil, i) => {
      const fy = y - i * 9 - 6;
      d.line(gx + 22, fy, dx - 90, fy, 1.6, fil.color);
      d.text(
        fil.section > 0 ? `${fil.role} ${fil.section}` : fil.role,
        dx - 86,
        fy - 2.5,
        6.5,
        fil.color,
        { align: 'left' },
      );
    });

    // Ce que dessert le circuit, en boîtes alignées à droite.
    const cy = y - (sch.wires.length * 9) / 2 - 2;
    const noms = sch.devices.slice(0, 4).map((x) => x.label);
    if (sch.devices.length > 4) noms.push(`+${sch.devices.length - 4}`);
    d.text(noms.join(' · ') || '—', dx, cy, 7, INK, { align: 'left' });

    y -= sch.wires.length * 9 + 10;
    if (sch.note) {
      d.text(sch.note, x0 + 6, y, 6.5, GREY, { align: 'left' });
      y -= 12;
    }
    y -= 6;
  }

  drawSheetChrome(d, {
    project: ctx.name,
    filename: ctx.filename,
    sheetTitle: 'Schéma multifilaire',
    sheet,
    scaleLabel: null,
  });
  return d.stream();
}

const DEFAULT_PDF_VIEWS: [View3DParams, View3DParams] = [
  { theta: -32, tilt: 58, zoom: 1, fx: 0, fy: 0 },
  { theta: 148, tilt: 42, zoom: 1, fx: 0, fy: 0 },
];

function threeDPage(
  ctx: SheetContext,
  sheet: string,
  views: [View3DParams, View3DParams] = DEFAULT_PDF_VIEWS,
  showDims = true,
): string {
  const d = new Draw();
  const opts = {
    colorOpenings: ctx.colorOpenings,
    showSurfaces: ctx.showSurfaces,
    showTextures: ctx.showTextures,
    floors: ctx.floors,
    roomNames: ctx.roomNames,
    rooms: ctx.rooms,
    fixtures: ctx.fixtures,
    showDims,
  };
  const top = FRAME.y + FRAME.h;
  d.text('Vue 1', FRAME.x + 20, top - 30, 10, GREY, { align: 'left' });
  draw3DView(d, ctx.walls, ctx.openings, ctx.objects,
    { x: FRAME.x + 30, y: FRAME.y + TITLE_H + 375, w: FRAME.w - 60, h: 290 },
    views[0], opts);
  d.text('Vue 2', FRAME.x + 20, FRAME.y + TITLE_H + 350, 10, GREY, { align: 'left' });
  draw3DView(d, ctx.walls, ctx.openings, ctx.objects,
    { x: FRAME.x + 30, y: FRAME.y + TITLE_H + 30, w: FRAME.w - 60, h: 290 },
    views[1], opts);

  drawSheetChrome(d, {
    project: ctx.name,
    filename: ctx.filename,
    sheetTitle: showDims ? 'Vues 3D cotées' : 'Vues 3D',
    sheet,
    scaleLabel: null,
  });
  return d.stream();
}

// ---------------------------------------------------------------- API

export interface ScanForPdf {
  name: string;
  walls: WallSeg[];
  openings: WallSeg[];
  objects: ObjectData[];
  /** Couleurs du sol relevées au scan, par pièce. */
  floors?: Record<string, FloorData | null | undefined>;
  /** Nom donné à chaque pièce, par identifiant de pièce. */
  roomNames?: Record<string, string>;
  /** Pièces du scan, avec les murs qui bordent chacune. */
  rooms?: RoomShape[];
  /** Appareillage électrique posé sur les murs. */
  fixtures?: Fixture[];
  /** Cheminement des gaines, du tableau à chaque appareil (repère monde). */
  routes?: { id: string; path: { x: number; z: number }[] }[];
}


// -------------------------------------- symboles électriques, en vectoriel

/**
 * Trace un symbole d'appareillage dans le PDF.
 *
 * Les symboles sont écrits une seule fois, en données de chemin SVG, et
 * servent au plan de l'app comme à ce PDF : deux jeux de dessins finiraient
 * par diverger. Il faut donc les relire ici — le générateur PDF ne parle pas
 * SVG.
 *
 * Le sous-ensemble employé se limite à `M m H V L A a Z`, et **tous les arcs
 * sont des demi-cercles dont la corde est le diamètre** (c'est ainsi que les
 * symboles sont écrits : deux demi-arcs pour un cercle, un seul pour le
 * socle de prise). Le centre est donc le milieu de la corde, et l'arc se
 * réduit à un échantillonnage de douze segments — pas besoin de la
 * paramétrisation générale des arcs SVG, qui serait une source de bogues
 * pour rien.
 */
function drawSymbol(
  d: Draw,
  paths: SymbolStroke[],
  cx: number,
  cy: number,
  k: number,
  color: string,
  width = 1.1,
) {
  // Repère du symbole : x vers la droite, y vers le BAS (comme en SVG) —
  // le PDF ayant son y vers le haut, on inverse ici.
  const P = (x: number, y: number): Pt => ({ x: cx + x * k, y: cy - y * k });
  for (const seg of paths) {
    const toks = seg.d.match(/[MmHVLAaZz]|-?\d*\.?\d+/g) ?? [];
    let i = 0;
    let x = 0;
    let y = 0;
    let pts: Pt[] = [];
    const flush = () => {
      if (pts.length >= 2) {
        if (seg.fill) d.poly(pts, color, color, width);
        else d.path(pts, width, color);
      }
      pts = [];
    };
    const num = () => parseFloat(toks[i++]);
    while (i < toks.length) {
      const cmd = toks[i++];
      switch (cmd) {
        case 'M':
          flush();
          x = num();
          y = num();
          pts.push(P(x, y));
          break;
        case 'm':
          x += num();
          y += num();
          if (pts.length === 0) pts.push(P(x, y));
          break;
        case 'H':
          x = num();
          pts.push(P(x, y));
          break;
        case 'V':
          y = num();
          pts.push(P(x, y));
          break;
        case 'L':
          x = num();
          y = num();
          pts.push(P(x, y));
          break;
        case 'A':
        case 'a': {
          const r = num();
          num(); // ry, toujours égal à rx dans nos symboles
          num(); // rotation
          num(); // grand arc
          const sweep = num();
          const ex = cmd === 'A' ? num() : x + num();
          const ey = cmd === 'A' ? num() : y + num();
          // Demi-cercle : le centre est le milieu de la corde.
          const mx = (x + ex) / 2;
          const my = (y + ey) / 2;
          const a0 = Math.atan2(y - my, x - mx);
          const a1 = Math.atan2(ey - my, ex - mx);
          let span = a1 - a0;
          // Le sens du balayage est celui de l'écran (y vers le bas).
          if (sweep === 1 && span < 0) span += Math.PI * 2;
          if (sweep === 0 && span > 0) span -= Math.PI * 2;
          for (let t = 1; t <= 12; t++) {
            const a = a0 + (span * t) / 12;
            pts.push(P(mx + r * Math.cos(a), my + r * Math.sin(a)));
          }
          x = ex;
          y = ey;
          break;
        }
        case 'Z':
        case 'z':
          if (pts.length >= 2) pts.push(pts[0]);
          break;
        default:
          break;
      }
    }
    flush();
  }
}

/**
 * La légende des symboles — **seulement ceux qui figurent sur le plan**.
 * Une légende qui liste tout un catalogue n'apprend rien ; celle-ci se lit
 * en trois secondes parce qu'elle ne parle que de ce qu'on a sous les yeux.
 */
function drawElecLegend(d: Draw, kinds: FixtureKind[], x: number, y: number) {
  if (kinds.length === 0) return;
  const lineH = 15;
  const w = 132;
  const h = 22 + kinds.length * lineH;
  d.rect(x, y - h, w, h, '#FFFFFF', '#D6DBE3', 0.8);
  d.text('APPAREILLAGE', x + 10, y - 14, 6.5, GREY_LIGHT, { align: 'left' });
  kinds.forEach((kind, i) => {
    const cy = y - 26 - i * lineH;
    const spec = FIXTURES[kind];
    drawSymbol(d, assemblySymbol(kind), x + 18, cy - 1, 0.38, spec.color, 0.9);
    const tag = FIXTURE_TAG[kind];
    d.text(
      fitText(tag ? `${spec.label} (${tag})` : spec.label, 7.5, w - 44),
      x + 32,
      cy - 3,
      7.5,
      INK,
      { align: 'left' },
    );
  });
}

// ------------------------------------------ feuille « liste du matériel »

/** Découpe un texte en lignes qui tiennent dans `maxW` points. */
function wrapText(str: string, size: number, maxW: number): string[] {
  const perChar = size * 0.52;
  const max = Math.max(8, Math.floor(maxW / perChar));
  const out: string[] = [];
  let line = '';
  for (const word of str.split(' ')) {
    if (line.length + word.length + 1 > max) {
      if (line) out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out;
}

/**
 * La liste du matériel, prête à chiffrer.
 *
 * Une feuille par section, qui déborde sur autant de pages que nécessaire :
 * l'appareillage pièce par pièce, le tableau (un disjoncteur par circuit,
 * les différentiels), puis les constats de conformité. C'est le document
 * qu'on envoie à un client ou à un fournisseur — il porte donc le cartouche
 * et le logo comme les autres feuilles.
 */
export function buildMaterialPdf(
  name: string,
  list: MaterialList,
  /**
   * Ce que lit le patron avant tout le reste : ce qu'il faut tirer, et ce
   * qu'il faut acheter. Optionnel — sans plan des gaines, la liste garde sa
   * forme d'avant.
   */
  tirage?: { pull: PullRow[]; buy: BuyRow[] },
): Uint8Array {
  const x0 = FRAME.x + 24;
  const w = FRAME.w - 48;
  const TOP = FRAME.y + FRAME.h - TITLE_H - 40;
  const BOTTOM = FRAME.y + 54;

  const pages: Draw[] = [];
  let d = new Draw();
  pages.push(d);
  let y = TOP;
  const need = (h: number) => {
    if (y - h < BOTTOM) {
      d = new Draw();
      pages.push(d);
      y = TOP;
    }
  };
  const titre = (t: string) => {
    need(46);
    y -= 6;
    d.text(t, x0, y, 13, INK, { bold: true, align: 'left' });
    y -= 8;
    d.line(x0, y, x0 + w, y, 1, INK);
    y -= 16;
  };
  const ligne = (
    gauche: string,
    droite: string,
    o: { bold?: boolean; grey?: boolean; indent?: number } = {},
  ) => {
    need(16);
    const col = o.grey ? GREY : INK;
    d.text(fitText(gauche, 10, w - 80 - (o.indent ?? 0)), x0 + (o.indent ?? 0), y, 10, col, {
      align: 'left',
      bold: o.bold,
    });
    if (droite) {
      d.text(droite, x0 + w - 60, y, 10, col, { align: 'left', bold: o.bold });
    }
    y -= 15;
  };
  const note = (t: string) => {
    for (const l of wrapText(t, 8.5, w)) {
      need(12);
      d.text(l, x0, y, 8.5, GREY, { align: 'left' });
      y -= 11;
    }
  };

  // ------------------------------------------------------------ en-tête
  const appareils = list.rooms.reduce(
    (n, r) => n + r.rows.reduce((m, x) => m + x.quantity, 0),
    0,
  );
  d.text('Liste du matériel', x0, y, 19, INK, { bold: true, align: 'left' });
  y -= 20;
  d.text(
    `${appareils} appareil${appareils > 1 ? 's' : ''} · ` +
      `${list.circuits.length} circuit${list.circuits.length > 1 ? 's' : ''} · ` +
      `${list.rooms.length} pièce${list.rooms.length > 1 ? 's' : ''}`,
    x0,
    y,
    10,
    GREY,
    { align: 'left' },
  );
  y -= 22;

  // ------------------------------------------------ appareillage par pièce
  titre('Appareillage par pièce');
  for (const room of list.rooms) {
    if (room.rows.length === 0) continue;
    need(30);
    d.text(room.room, x0, y, 11, INK, { bold: true, align: 'left' });
    d.text(
      `${room.use} · ${room.area.toFixed(1).replace('.', ',')} m²`,
      x0 + w - 130,
      y,
      9,
      GREY,
      { align: 'left' },
    );
    y -= 15;
    for (const row of room.rows) {
      ligne(row.label, `${row.quantity}`, { indent: 14 });
    }
    y -= 6;
  }
  if (appareils === 0) {
    note('Aucun appareil posé pour l’instant.');
  }

  // ------------------------------------------------------------- tableau
  titre('Tableau électrique');
  ligne('Circuit', 'Protection', { bold: true, grey: true });
  for (const c of list.circuits) {
    const protection =
      c.breaker === null
        ? 'coffret com.'
        : `${c.breaker} A · ${c.section} mm²`;
    ligne(
      `${c.label} — ${c.points} point${c.points > 1 ? 's' : ''}` +
        (c.rooms.length ? ` (${c.rooms.join(', ')})` : '') +
        // Le métré, à même la ligne du circuit : c'est là qu'on le cherche
        // au moment de chiffrer.
        (c.cable ? ` · ${c.cable} m de câble` : ''),
      protection,
    );
    if (c.note) note(`   ${c.note}`);
  }
  if (list.circuits.length === 0) note('Aucun circuit : rien à protéger.');

  // ------------------------------------------------------------- tirage
  if (tirage && tirage.pull.length > 0) {
    y -= 8;
    titre('Tirage — gaines et conducteurs');
    ligne('Circuit', 'Gaine · longueur', { bold: true, grey: true });
    for (const r of tirage.pull) {
      const droite =
        r.conduitLength > 0
          ? `ICTA Ø${r.conduit} · ${r.conduitLength} m`
          : `ICTA Ø${r.conduit}`;
      ligne(
        `${r.label} — ${r.runs} départ${r.runs > 1 ? 's' : ''}` +
          (r.cableLength > 0 ? ` · ${r.cableLength} m de conducteur` : ''),
        droite,
      );
    }
    note(
      '   Remplissage NF C 15-100 : la section des conducteurs ne dépasse ' +
        'pas le tiers de celle du conduit.',
    );
    if (tirage.pull.every((r) => r.conduitLength === 0)) {
      note('   Posez le tableau sur le plan pour obtenir les longueurs.');
    }
  }

  // -------------------------------------------------------- à commander
  if (tirage && tirage.buy.length > 0) {
    y -= 8;
    titre('À commander');
    for (const r of tirage.buy) {
      ligne(
        r.label + (r.note ? ` — ${r.note}` : ''),
        `${r.quantity} ${r.unit}`,
      );
    }
  }

  if (list.differentials.length > 0) {
    y -= 8;
    ligne('Protection différentielle 30 mA', '', { bold: true });
    for (const diff of list.differentials) {
      ligne(
        `${diff.label} — ${diff.rating} A type ${diff.type}` +
          (diff.circuits.length ? ` : ${diff.circuits.join(', ')}` : ''),
        '',
        { indent: 14 },
      );
    }
    note(
      'Un différentiel de type A au minimum : les courants de défaut de la ' +
        'cuisson et du lave-linge peuvent comporter une composante continue ' +
        'qu’un type AC ne détecte pas.',
    );
  }

  // -------------------------------------------------------- fournitures
  if (list.board.length > 0) {
    titre('Fournitures de tableau');
    for (const row of list.board) {
      ligne(row.label, row.quantity > 1 ? `${row.quantity}` : '1');
    }
  }

  // -------------------------------------------------------- conformité
  titre('Conformité');
  const alertes = list.issues.filter((i) => i.severity === 'alerte');
  if (alertes.length === 0) {
    ligne('Aucun écart relevé sur ce qui est vérifiable.', '');
  }
  for (const issue of list.issues) {
    need(30);
    d.circle(x0 + 3, y + 3, 2.6, issue.severity === 'alerte' ? '#C0392B' : '#98A1AE');
    d.text(fitText(issue.message, 10, w - 30), x0 + 14, y, 10, INK, {
      align: 'left',
      bold: issue.severity === 'alerte',
    });
    y -= 13;
    for (const l of wrapText(issue.regle, 8.5, w - 14)) {
      need(11);
      d.text(l, x0 + 14, y, 8.5, GREY, { align: 'left' });
      y -= 10;
    }
    y -= 6;
  }

  y -= 10;
  note(
    'Document d’aide au chiffrage établi d’après les exigences usuelles de ' +
      'la NF C 15-100. Il ne vaut pas attestation de conformité : les ' +
      'volumes de la salle d’eau, les points d’éclairage en plafond et la ' +
      'puissance réellement raccordée ne sont pas vérifiés par l’application.',
  );

  const filename = pdfFilename(`${name} - materiel`);
  pages.forEach((p, i) =>
    drawSheetChrome(p, {
      project: name,
      filename,
      sheetTitle: 'Liste du matériel',
      sheet: `${i + 1} / ${pages.length}`,
      scaleLabel: null,
    }),
  );
  return buildDocument(pages.map((p) => p.stream()));
}

export function materialFilename(name: string): string {
  return pdfFilename(`${name} - materiel`);
}

export function pdfFilename(name: string): string {
  const clean = latin1(name)
    .replace(/[^\w\- ]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `${clean || 'echoplan'}.pdf`;
}

export function buildScanPdf(
  scan: ScanForPdf,
  include3D: boolean,
  opts: PdfOptions = {},
): Uint8Array {
  const filename = pdfFilename(scan.name);
  const withMetre = opts.metre ?? true;
  // Les schémas ne s'impriment que s'il y a une installation à montrer.
  const schemas = opts.schemas ?? null;
  const withSchema = !!schemas && schemas.rows.length > 0;
  const total =
    1 + (withMetre ? 1 : 0) + (include3D ? 1 : 0) + (withSchema ? 2 : 0);
  const ctx: SheetContext = {
    name: scan.name,
    filename,
    walls: scan.walls,
    openings: scan.openings,
    objects: scan.objects,
    floors: scan.floors ?? {},
    roomNames: scan.roomNames ?? {},
    rooms: scan.rooms,
    fixtures: scan.fixtures ?? [],
    routes: scan.routes,
    colorOpenings: opts.colorOpenings ?? false,
    showSurfaces: opts.surfaces ?? true,
    showTextures: opts.textures ?? false,
  };
  const pages = [planPage(ctx, `1 / ${total}`, opts.plan, opts.measures2D ?? true)];
  if (withMetre) {
    pages.push(metrePage(ctx, `${pages.length + 1} / ${total}`));
  }
  if (include3D) {
    pages.push(
      threeDPage(ctx, `${pages.length + 1} / ${total}`, opts.views, opts.measures3D ?? true),
    );
  }
  if (withSchema && schemas) {
    pages.push(
      unifilairePage(
        ctx,
        `${pages.length + 1} / ${total}`,
        schemas.rows,
        schemas.differentials,
      ),
    );
    pages.push(
      multifilairePage(ctx, `${pages.length + 1} / ${total}`, schemas.multi),
    );
  }
  return buildDocument(pages);
}

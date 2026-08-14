/* eslint-disable no-bitwise -- encodeurs binaires (octets PDF, base64) */
/**
 * Générateur PDF maison (aucune dépendance) — rendu « plan d'architecte » :
 * murs pochés, symboles de portes/fenêtres, lignes de cote extérieures,
 * cadre de feuille et cartouche avec logo EchoPlan. En option, une feuille
 * de vues 3D avec les mesures portées sur les murs.
 * PDF 1.4 non compressé, A4, polices Helvetica (WinAnsi).
 */
import type { ObjectData } from 'react-native-room-scan';
import {
  closedLoop,
  loopAreaM2,
  segLength,
  toFootprint,
  type WallSeg,
} from '../geometry/floorplan';
import { furnKind, furnitureStrokes } from '../geometry/furniture';

const PAGE_W = 595;
const PAGE_H = 842;
const WALL_T = 0.14;

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

  poly(pts: Pt[], fillHex: string | null, strokeHex: string | null, sw = 0.8) {
    if (pts.length < 3) return;
    let op = '';
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
    { r: 11, o: '#B7BABF' }, // ≈ noir à 30 %
    { r: 19, o: '#6D7178' }, // ≈ noir à 60 %
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

interface P3 {
  x: number;
  y: number;
  z: number;
}
interface Face {
  pts: P3[];
  fill: string;
  stroke: string | null;
  shade?: boolean;
  bias?: number;
  isFloor?: boolean;
}

const mixHex = (a: string, b: string, t: number): string => {
  const cl = Math.max(0, Math.min(1, t));
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa
    .map((v, i) => Math.round(v + (pb[i] - v) * cl).toString(16).padStart(2, '0'))
    .join('')}`;
};

const cornerKey = (p: { x: number; z: number }) =>
  `${p.x.toFixed(3)}:${p.z.toFixed(3)}`;

function cornerCounts(walls: WallSeg[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      const k = cornerKey(p);
      const l = m.get(k) ?? [];
      l.push(w.id);
      m.set(k, l);
    }
  }
  for (const l of m.values()) l.sort();
  return m;
}

/** Rectangle épais d'un mur au sol. Aux coins partagés, UN mur traverse
 *  (prolongé de T/2), l'autre s'arrête contre lui : angle net. */
function thickWallRect(w: WallSeg, counts: Map<string, string[]>) {
  const dx = w.b.x - w.a.x;
  const dz = w.b.z - w.a.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const extFor = (k: string) => {
    const l = counts.get(k) ?? [];
    if (l.length < 2) return 0;
    return l[0] === w.id ? WALL_T / 2 : -WALL_T / 2;
  };
  const extA = extFor(cornerKey(w.a));
  const extB = extFor(cornerKey(w.b));
  const pa = { x: w.a.x - ux * extA, z: w.a.z - uz * extA };
  const pb = { x: w.b.x + ux * extB, z: w.b.z + uz * extB };
  const nx = (-dz / len) * (WALL_T / 2);
  const nz = (dx / len) * (WALL_T / 2);
  return {
    corners: [
      { x: pa.x + nx, z: pa.z + nz },
      { x: pb.x + nx, z: pb.z + nz },
      { x: pb.x - nx, z: pb.z - nz },
      { x: pa.x - nx, z: pa.z - nz },
    ],
    ux,
    uz,
    nx,
    nz,
  };
}

function buildFaces(
  walls: WallSeg[],
  openings: WallSeg[],
  objects: ObjectData[],
  colorOpenings = false,
) {
  const floorY =
    walls.length > 0 ? Math.min(...walls.map((w) => w.yCenter - w.height / 2)) : 0;
  const faces: Face[] = [];

  const loop = closedLoop(walls);
  if (loop) {
    faces.push({
      pts: loop.map((p) => ({ x: p.x, y: 0, z: p.z })),
      fill: '#EFF1F5',
      stroke: '#C9D1DC',
      isFloor: true,
    });
  }

  const vquad = (
    p: { x: number; z: number },
    q: { x: number; z: number },
    yb: number,
    yt: number,
  ): P3[] => [
    { x: p.x, y: yb, z: p.z },
    { x: q.x, y: yb, z: q.z },
    { x: q.x, y: yt, z: q.z },
    { x: p.x, y: yt, z: p.z },
  ];

  const counts = cornerCounts(walls);
  for (const w of walls) {
    const { corners } = thickWallRect(w, counts);
    const [a1, b1, b2, a2] = corners;
    const sides: [typeof a1, typeof a1][] = [
      [a1, b1],
      [b2, a2],
      [a2, a1],
      [b1, b2],
    ];
    for (const [p, q] of sides) {
      faces.push({
        pts: vquad(p, q, 0, w.height),
        fill: '#FFFFFF',
        stroke: '#77828F',
        shade: true,
      });
    }
    faces.push({
      pts: corners.map((p) => ({ x: p.x, y: w.height, z: p.z })),
      fill: '#F2F5F9',
      stroke: '#77828F',
    });
  }

  for (const o of openings) {
    const yb = Math.max(0, o.yCenter - o.height / 2 - floorY);
    faces.push({
      pts: vquad(o.a, o.b, yb, yb + o.height),
      fill: colorOpenings
        ? o.type === 'door'
          ? '#E8A13B'
          : '#3EB8E5'
        : '#B9C2CE',
      stroke: null,
      bias: 0.12,
    });
  }

  for (const obj of objects.map(toFootprint)) {
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
    for (let i = 0; i < 4; i++) {
      faces.push({
        pts: vquad(corners[i], corners[(i + 1) % 4], yb, yt),
        fill: '#D8E1F2',
        stroke: '#9FACBF',
      });
    }
    faces.push({
      pts: corners.map((p) => ({ x: p.x, y: yt, z: p.z })),
      fill: '#E9EEF9',
      stroke: '#9FACBF',
    });
  }

  return faces;
}

function draw3DView(
  d: Draw,
  walls: WallSeg[],
  openings: WallSeg[],
  objects: ObjectData[],
  box: { x: number; y: number; w: number; h: number },
  view: View3DParams,
  colorOpenings = false,
) {
  const thetaDeg = view.theta;
  const tiltDeg = view.tilt;
  const faces = buildFaces(walls, openings, objects, colorOpenings);
  const all = faces.flatMap((f) => f.pts);
  if (all.length === 0) return;
  const ctr = {
    x: all.reduce((s, p) => s + p.x, 0) / all.length,
    y: all.reduce((s, p) => s + p.y, 0) / all.length,
    z: all.reduce((s, p) => s + p.z, 0) / all.length,
  };
  const r3 = Math.max(
    0.5,
    ...all.map((p) => Math.hypot(p.x - ctr.x, p.y - ctr.y, p.z - ctr.z)),
  );
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

  const polys = faces.map((f) => {
    const pts = f.pts.map(project);
    const depth = f.isFloor
      ? -Infinity
      : pts.reduce((s, p) => s + p.depth, 0) / pts.length + (f.bias ?? 0);
    let fill = f.fill;
    if (f.shade) {
      const a = f.pts[0];
      const b = f.pts[1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const facing = ((-dz / len) * st + (dx / len) * ct + 1) / 2;
      fill = mixHex('#BFC9D8', '#FCFDFF', facing);
    }
    return { pts, depth, fill, stroke: f.stroke };
  });
  polys.sort((p, q) => p.depth - q.depth);
  for (const p of polys) {
    d.poly(p.pts, p.fill, p.stroke, 0.7);
  }

  // Cotes portées au milieu de l'arête haute de chaque mur.
  for (const w of walls) {
    const mid = project({
      x: (w.a.x + w.b.x) / 2,
      y: w.height,
      z: (w.a.z + w.b.z) / 2,
    });
    d.text(`${segLength(w).toFixed(2).replace('.', ',')} m`, mid.x, mid.y + 5, 8, '#2A3340');
  }
}

// -------------------------------------------------------------- pages

const fr1 = (v: number) => v.toFixed(1).replace('.', ',');
const frLen = (v: number) => v.toFixed(2).replace('.', ',');

function planPage(
  name: string,
  filename: string,
  walls: WallSeg[],
  openings: WallSeg[],
  objects: ObjectData[],
  sheet: string,
  planView?: PlanViewParams,
  colorOpenings = false,
): string {
  const d = new Draw();
  const loop = closedLoop(walls);
  const area = loop ? loopAreaM2(loop) : null;

  // Zone de dessin (cotes extérieures comprises)
  const box = {
    x: FRAME.x + 70,
    y: FRAME.y + TITLE_H + 70,
    w: FRAME.w - 140,
    h: FRAME.h - TITLE_H - 140,
  };
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity;
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
  }
  let scaleLabel: string | null = null;
  if (isFinite(minX)) {
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
    const px = (p: { x: number; z: number }): Pt => ({
      x: bcx + (p.x - cxw) * scale,
      y: bcy + (czw - p.z) * scale,
    });

    const centroid = loop
      ? {
          x: loop.reduce((s, p) => s + p.x, 0) / loop.length,
          z: loop.reduce((s, p) => s + p.z, 0) / loop.length,
        }
      : { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };

    // Sol
    if (loop) {
      d.poly(loop.map(px), '#F5F7FA', null);
    }

    // Meubles : contour + symbole d'architecte (lit, canapé, TV…)
    for (const o of objects.map(toFootprint)) {
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
    }

    // Murs pochés (noir plein, coins prolongés)
    const counts = cornerCounts(walls);
    for (const w of walls) {
      d.poly(thickWallRect(w, counts).corners.map(px), INK, null);
    }

    // Ouvertures : trouée blanche + symbole
    for (const o of openings) {
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
        '#FFFFFF',
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
    for (const w of walls) {
      const a = px(w.a);
      const b = px(w.b);
      const dx2 = b.x - a.x;
      const dy2 = b.y - a.y;
      const norm = Math.hypot(dx2, dy2) || 1;
      const ux2 = dx2 / norm;
      const uy2 = dy2 / norm;
      let nx2 = -uy2;
      let ny2 = ux2;
      // vers l'extérieur : à l'opposé du centre de la pièce
      const midPt = px({ x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 });
      const cPt = px(centroid);
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

    // Surface au centre
    if (area !== null) {
      const cp2 = px(centroid);
      d.text(`${fr1(area)} m²`, cp2.x, cp2.y + 4, 15, INK, { bold: true });
      d.text('surface au sol', cp2.x, cp2.y - 10, 8, GREY);
    }
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

const DEFAULT_PDF_VIEWS: [View3DParams, View3DParams] = [
  { theta: -32, tilt: 58, zoom: 1, fx: 0, fy: 0 },
  { theta: 148, tilt: 42, zoom: 1, fx: 0, fy: 0 },
];

function threeDPage(
  name: string,
  filename: string,
  walls: WallSeg[],
  openings: WallSeg[],
  objects: ObjectData[],
  sheet: string,
  views: [View3DParams, View3DParams] = DEFAULT_PDF_VIEWS,
  colorOpenings = false,
): string {
  const d = new Draw();
  const top = FRAME.y + FRAME.h;
  d.text('Vue 1', FRAME.x + 20, top - 30, 10, GREY, { align: 'left' });
  draw3DView(d, walls, openings, objects,
    { x: FRAME.x + 30, y: FRAME.y + TITLE_H + 375, w: FRAME.w - 60, h: 290 },
    views[0], colorOpenings);
  d.text('Vue 2', FRAME.x + 20, FRAME.y + TITLE_H + 350, 10, GREY, { align: 'left' });
  draw3DView(d, walls, openings, objects,
    { x: FRAME.x + 30, y: FRAME.y + TITLE_H + 30, w: FRAME.w - 60, h: 290 },
    views[1], colorOpenings);

  drawSheetChrome(d, {
    project: name,
    filename,
    sheetTitle: 'Vues 3D cotées',
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
  const total = include3D ? 2 : 1;
  const pages = [
    planPage(
      scan.name, filename, scan.walls, scan.openings, scan.objects,
      `1 / ${total}`, opts.plan, opts.colorOpenings ?? false,
    ),
  ];
  if (include3D) {
    pages.push(
      threeDPage(
        scan.name, filename, scan.walls, scan.openings, scan.objects,
        `2 / ${total}`, opts.views, opts.colorOpenings ?? false,
      ),
    );
  }
  return buildDocument(pages);
}

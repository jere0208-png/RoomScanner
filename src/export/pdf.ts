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
  castToWall,
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
  faceXofT,
  facePoint,
  interiorSide,
  masonryRuns,
  stackRanks,
  wallFace,
  type Fixture,
  type FixtureKind,
  type SymbolStroke,
} from '../geometry/electrical';
import type { Differential, MaterialList } from '../geometry/nfc15100';
import {
  WIRE_COLORS,
  circuitColor,
  type MultiWireSchema,
  type SchemaRow,
} from '../geometry/schema';
import type { BuyRow, PullRow } from '../geometry/conduits';
import {
  CEILINGS,
  CEILING_SYMBOL,
  linkAnchor,
  linkCurve,
  type CeilingFixture,
} from '../geometry/ceiling';
import { planFrameAngle } from '../geometry/floorplan';
import { assignOpenings } from '../geometry/scene3d';
import { wallRuns } from '../geometry/floorplan';
import {
  faceDepth,
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
/**
 * Les signes typographiques que WinAnsi loge entre 0x80 et 0x9F.
 *
 * C'est LA case oubliée de l'encodage. Le document déclare bien ses polices
 * en `/WinAnsiEncoding`, mais l'écriture, elle, se contentait du Latin-1 :
 * tout ce qui dépassait 0xFF devenait un point d'interrogation. Or l'app
 * écrit en français typographié — apostrophes courbes, tirets cadratins,
 * points de suspension, et jusqu'au « ≈ » des cotes approchées. Des noms
 * comme « Éclairage — retour lampe » sortaient donc troués : « Éclairage ?
 * retour lampe ».
 *
 * WinAnsi les loge tous, simplement pas là où Unicode les met.
 */
const WIN_ANSI: Record<string, number> = {
  '\u20AC': 0x80, // €
  '\u201A': 0x82,
  '\u0192': 0x83,
  '\u201E': 0x84,
  '\u2026': 0x85, // …
  '\u2020': 0x86,
  '\u2021': 0x87,
  '\u02C6': 0x88,
  '\u2030': 0x89, // ‰
  '\u0160': 0x8a,
  '\u2039': 0x8b,
  '\u0152': 0x8c, // Œ
  '\u017D': 0x8e,
  '\u2018': 0x91,
  '\u2019': 0x92, // ’
  '\u201C': 0x93,
  '\u201D': 0x94,
  '\u2022': 0x95, // •
  '\u2013': 0x96, // –
  '\u2014': 0x97, // —
  '\u02DC': 0x98,
  '\u2122': 0x99,
  '\u0161': 0x9a,
  '\u203A': 0x9b,
  '\u0153': 0x9c, // œ
  '\u017E': 0x9e,
  '\u0178': 0x9f,
};

/**
 * Ce qu'aucun encodage 8 bits ne sait écrire, et son équivalent lisible.
 *
 * Mieux vaut un « ~ » qu'un « ? » : le premier dit « environ », le second
 * dit « l'application a un bug ».
 */
const REMPLACE: Record<string, string> = {
  '\u2248': '~', // ≈
  '\u2260': '<>',
  '\u2264': '<=',
  '\u2265': '>=',
  '\u00A0': ' ',
  '\u202F': ' ', // espace fine insécable
  '\u2212': '-',
  '\u2192': '->',
};

/** Une chaîne telle que le PDF l'écrira : un octet WinAnsi par signe. */
function latin1(s: string): string {
  let out = '';
  for (const ch of s) {
    const win = WIN_ANSI[ch];
    if (win !== undefined) {
      out += String.fromCharCode(win);
      continue;
    }
    const alt = REMPLACE[ch];
    if (alt !== undefined) {
      out += alt;
      continue;
    }
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
   * Le plafond : une feuille d'implantation de plus, avec les liens de
   * commande. Absente si rien n'est posé au plafond — une feuille vide
   * dans un dossier, c'est une feuille qu'on tourne en se demandant si on
   * a raté quelque chose.
   */
  ceiling?: CeilingFixture[];
  /**
   * Le cadrage de CETTE feuille-là.
   *
   * Elle reprenait celui du plan d'ensemble, ce qui obligeait à choisir :
   * ou l'appartement entier sur les deux, ou une pièce serrée sur les
   * deux. Or on ne les regarde pas pour la même raison. À défaut, elle
   * garde le cadrage du plan — c'est le comportement d'avant.
   */
  ceilingPlan?: PlanViewParams;
  /**
   * Les élévations : un mur vu de face par feuille.
   *
   * C'est le dossier de pose — celui qu'on tient devant le mur, la
   * perceuse dans l'autre main. Optionnel, parce qu'un logement de douze
   * murs fait douze feuilles de plus, et qu'un plan pour l'architecte
   * n'en a que faire.
   */
  elevations?: boolean;
  /**
   * Schémas unifilaire et multifilaire : deux feuilles de plus, tirées des
   * circuits déjà calculés. Absent = pas de schéma, et le dossier garde sa
   * pagination d'avant.
   */
  schemas?: {
    rows: SchemaRow[];
    differentials: Differential[];
    multi: MultiWireSchema[];
    /** Repère de circuit par appareil : ce qui relie le plan au tableau. */
    marks: Map<string, string>;
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

/**
 * UNE PHOTO DANS LE DOSSIER — le JPEG entre tel quel.
 *
 * Un PDF sait porter un JPEG SANS LE TOUCHER : le flux compressé de
 * l'appareil photo devient le contenu de l'objet image, et le lecteur le
 * décode lui-même (`/DCTDecode`). On n'a donc ni à décompresser, ni à
 * réencoder — ce qu'aucune bibliothèque ne ferait ici de toute façon.
 *
 * Reste à lire ses DIMENSIONS, que le PDF exige et que le JPEG ne dit
 * qu'à l'intérieur : dans le marqueur SOF, quelque part après l'en-tête.
 * On parcourt donc les segments jusqu'à lui.
 */
export interface PdfImage {
  /** Nom de ressource dans la page : Im0, Im1… */
  name: string;
  /** Le JPEG, un octet par signe (ce que rend `fromBase64`). */
  data: string;
  w: number;
  h: number;
  /** 1 = gris, 3 = couleur, 4 = CMJN. */
  comps: number;
}

const B64_INV: Record<string, number> = {};
for (let i = 0; i < 64; i++) {
  B64_INV['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'[i]] = i;
}

/** Base64 → chaîne d'octets. Tolère un préfixe `data:` et les sauts de ligne. */
export function fromBase64(b64: string): string {
  const src = b64.slice(b64.indexOf(',') + 1).replace(/[^A-Za-z0-9+/]/g, '');
  let out = '';
  for (let i = 0; i < src.length; i += 4) {
    const a = B64_INV[src[i]] ?? 0;
    const b = B64_INV[src[i + 1]] ?? 0;
    const c = B64_INV[src[i + 2]] ?? 0;
    const d = B64_INV[src[i + 3]] ?? 0;
    out += String.fromCharCode((a << 2) | (b >> 4));
    if (i + 2 < src.length) out += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (i + 3 < src.length) out += String.fromCharCode(((c & 3) << 6) | d);
  }
  return out;
}

/**
 * Les dimensions d'un JPEG, lues dans son marqueur SOF.
 *
 * `null` si ce n'est pas un JPEG lisible — auquel cas la photo est
 * simplement absente de la feuille. Un dossier sans photo se lit ; un
 * dossier qui refuse de s'exporter, non.
 */
export function jpegSize(
  data: string,
): { w: number; h: number; comps: number } | null {
  if (data.charCodeAt(0) !== 0xff || data.charCodeAt(1) !== 0xd8) return null;
  let i = 2;
  while (i + 9 < data.length) {
    if (data.charCodeAt(i) !== 0xff) {
      i += 1;
      continue;
    }
    const marqueur = data.charCodeAt(i + 1);
    // Les SOF\* portent la taille ; C4 (Huffman), C8 et CC n'en sont pas.
    if (
      marqueur >= 0xc0 &&
      marqueur <= 0xcf &&
      marqueur !== 0xc4 &&
      marqueur !== 0xc8 &&
      marqueur !== 0xcc
    ) {
      return {
        h: (data.charCodeAt(i + 5) << 8) | data.charCodeAt(i + 6),
        w: (data.charCodeAt(i + 7) << 8) | data.charCodeAt(i + 8),
        comps: data.charCodeAt(i + 9),
      };
    }
    if (marqueur === 0xd8 || (marqueur >= 0xd0 && marqueur <= 0xd9)) {
      i += 2;
      continue;
    }
    const taille = (data.charCodeAt(i + 2) << 8) | data.charCodeAt(i + 3);
    if (taille < 2) return null;
    i += 2 + taille;
  }
  return null;
}

/** Prépare une photo pour le document, ou `null` si elle est illisible. */
export function pdfImage(name: string, base64: string): PdfImage | null {
  const data = fromBase64(base64);
  const taille = jpegSize(data);
  if (!taille || taille.w < 2 || taille.h < 2) return null;
  return { name, data, ...taille };
}

// ------------------------------------------------------- document PDF

function buildDocument(
  pageStreams: string[],
  images: PdfImage[] = [],
): Uint8Array {
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
  const COULEUR = ['', '/DeviceGray', '', '/DeviceRGB', '/DeviceCMYK'];
  const imgIds = images.map((im) =>
    add(
      `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} ` +
        `/ColorSpace ${COULEUR[im.comps] ?? '/DeviceRGB'} /BitsPerComponent 8 ` +
        `/Filter /DCTDecode /Length ${im.data.length} >>\nstream\n${im.data}\nendstream`,
    ),
  );
  // Toutes les images sont déclarées sur toutes les pages : une ressource
  // qu'une page n'appelle pas ne coûte rien, et ça évite de tenir une
  // comptabilité page par page pour rien.
  const xobj =
    images.length > 0
      ? ` /XObject << ${images
          .map((im, i) => `/${im.name} ${imgIds[i]} 0 R`)
          .join(' ')} >>`
      : '';
  const contentIds = pageStreams.map((s) =>
    add(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`),
  );
  const pageIds = contentIds.map((cid) =>
    add(
      `<< /Type /Page /Parent @P 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${xobj} >> ` +
        `/Contents ${cid} 0 R >>`,
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
    opts: {
      bold?: boolean;
      angle?: number;
      /**
       * `right` cale la FIN du texte sur (x, y).
       *
       * Sans lui, une colonne de valeurs se posait à gauche d'un x fixe et
       * grandissait vers la droite : « 1 couronne de 100 m » sortait du
       * cadre de la feuille, tranchée par le bord.
       */
      align?: 'center' | 'left' | 'right';
    } = {},
  ) {
    const s = escText(str);
    const [r, g, b] = hexRgb(hex);
    const a = ((opts.angle ?? 0) * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const large = latin1(str).length * size * 0.5;
    const w =
      opts.align === 'left' ? 0 : opts.align === 'right' ? large * 2 : large;
    const tx = x - (w / 2) * cos;
    const ty = y - (w / 2) * sin;
    this.ops.push(
      `BT /${opts.bold ? 'F2' : 'F1'} ${n2(size)} Tf ${n2(r)} ${n2(g)} ${n2(b)} rg ` +
        `${n2(cos)} ${n2(sin)} ${n2(-sin)} ${n2(cos)} ${n2(tx)} ${n2(ty)} Tm (${s}) Tj ET`,
    );
  }

  /**
   * Une image, posée dans un rectangle.
   *
   * Le repère d'une image PDF est le carré unité : c'est la matrice qui
   * lui donne sa taille et sa place. D'où le `cm` — largeur, hauteur,
   * puis coin bas gauche — encadré d'un `q`/`Q` pour ne pas contaminer
   * ce qui suit.
   */
  image(name: string, x: number, y: number, w: number, h: number) {
    this.ops.push(
      `q ${n2(w)} 0 0 ${n2(h)} ${n2(x)} ${n2(y)} cm /${name} Do Q`,
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
/**
 * LA MARGE D'UN CADRE DE LÉGENDE — la même sur les quatre côtés.
 *
 * Chaque boîte avait ses propres retraits, ajustés à l'œil : le texte se
 * retrouvait collé en bas d'un cadre et flottant dans un autre, et il
 * suffisait d'ajouter une ligne pour que tout se décale. Un seul nombre,
 * appliqué partout, et la question ne se pose plus — y compris pour les
 * cadres qu'on ajoutera demain.
 */
const CADRE_MARGE = 10;
/** Hauteur d'une ligne de légende, texte compris. */
const CADRE_LIGNE = 12;
/** Largeur du trait de couleur qui précède un libellé, et son écart. */
const CADRE_PUCE = 18;

/**
 * Dessine un cadre de légende : titre(s), lignes colorées, marges égales.
 *
 * Le cadre se dimensionne SUR SON CONTENU. On lui donne des sections, il
 * rend sa hauteur — personne n'a plus à compter les lignes à la main.
 */
/** Une ligne de légende : sa vignette à gauche, son libellé à droite. */
interface LegendLine {
  texte: string;
  /** Un trait de couleur — pour un circuit, un conducteur, un lien. */
  couleur?: string;
  /** Ou un symbole dessiné — pour un appareil. */
  symbole?: { paths: SymbolStroke[]; color: string };
}

interface LegendSection {
  titre?: string;
  lignes: LegendLine[];
}

/**
 * Un cadre de légende, à UNE OU DEUX COLONNES.
 *
 * La feuille du plafond en portait deux, côte à côte et se recouvrant :
 * celle des appareils muraux, qui cherche le coin le plus libre, et celle du
 * plafond, posée à gauche. Deux cadres blancs l'un sur l'autre, dont on ne
 * lisait ni l'un ni l'autre. Un plan n'a qu'une légende — avec deux
 * colonnes s'il le faut.
 */
function drawLegendBox(
  d: Draw,
  x: number,
  y: number,
  larg: number,
  colonnes: LegendSection[][],
): number {
  const rangsDe = (sections: LegendSection[]) =>
    sections.reduce(
      (n, sec) => n + (sec.titre ? 1 : 0) + sec.lignes.length,
      0,
    );
  const rangs = Math.max(...colonnes.map(rangsDe));
  const haut = rangs * CADRE_LIGNE + CADRE_MARGE * 2;
  d.rect(x, y, larg, haut, '#FFFFFFEE', '#D8DEE7', 0.6);
  const largCol = (larg - CADRE_MARGE * (colonnes.length + 1)) / colonnes.length;
  colonnes.forEach((sections, ci) => {
    const tx = x + CADRE_MARGE + ci * (largCol + CADRE_MARGE);
    let base = y + haut - CADRE_MARGE - CADRE_LIGNE + 3.5;
    for (const sec of sections) {
      if (sec.titre) {
        d.text(sec.titre, tx, base, 6, GREY_LIGHT, { align: 'left' });
        base -= CADRE_LIGNE;
      }
      for (const ligne of sec.lignes) {
        if (ligne.symbole) {
          drawSymbol(
            d,
            ligne.symbole.paths,
            tx + 7,
            base + 2.5,
            0.42,
            ligne.symbole.color,
            0.9,
          );
        } else if (ligne.couleur) {
          d.line(
            tx,
            base + 2.5,
            tx + CADRE_PUCE - 4,
            base + 2.5,
            2,
            ligne.couleur,
          );
        }
        d.text(
          fitText(ligne.texte, 7, largCol - CADRE_PUCE),
          tx + CADRE_PUCE,
          base,
          7,
          INK,
          { align: 'left' },
        );
        base -= CADRE_LIGNE;
      }
    }
  });
  return haut;
}
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
  /**
   * LE ZOOM DE L'ÉCRAN, MAIS BORNÉ — et surtout, la case est un cadre.
   *
   * À l'écran, la vue 3D vit dans un cadre qui la ROGNE : on zoome, le
   * modèle grandit, et ce qui dépasse disparaît derrière le bord. Le PDF
   * reprenait le même zoom sans le même rognage : un modèle agrandi
   * trois fois s'étalait sur toute la feuille, traversait la case voisine
   * et recouvrait le cartouche. C'est ce qu'on voyait — des murs coupés
   * par le bord du papier et deux vues emmêlées.
   *
   * Deux garde-fous, tous deux nécessaires : le zoom est ramené dans des
   * limites raisonnables, et le dessin est BORNÉ à sa case. La seconde
   * suffirait à sauver la feuille ; la première évite qu'on n'imprime,
   * en toute rigueur, un bout de mur pris de trop près.
   */
  const zoom = Math.min(2.2, Math.max(0.5, view.zoom || 1));
  const scale = ((Math.min(box.w, box.h) * 0.46) / r3) * zoom;
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

  // Le cadre de la case : rien n'en sort, quel que soit le zoom.
  d.save();
  d.clip(box.x, box.y, box.w, box.h);

  // Même masquage des faces arrière que dans la vue de l'app : le PDF doit
  // montrer exactement le même volume.
  const cam = { ct, st, cp, sp };
  const polys = faces
    .filter((f) => !isHiddenFace(f, cam))
    .map((f) => {
      const pts = f.pts.map(project);
      // Une arête se trie avec le pan qu'elle borde (`depthAt`), et une
      // façade large avec les tuiles qu'elle recouvre : la règle est écrite
      // une fois, dans `scene3d`.
      const depth = faceDepth(f, project, cam);
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
  d.restore();

  // Le liseré de la case : il dit où s'arrête la vue, et rend lisible un
  // modèle qui touche le bord.
  d.rect(box.x, box.y, box.w, box.h, null, '#E3E7EE', 0.8);
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

/**
 * Ce qu'on dessine PAR-DESSUS le plan, une fois murs, meubles et appareils
 * en place : le tracé d'un schéma, par exemple. La fonction reçoit de quoi
 * passer du monde à la page, et l'échelle en points par mètre.
 */
type PlanOverlay = (
  d: Draw,
  px: (p: { x: number; z: number }) => Pt,
  scale: number,
  box: { x: number; y: number; w: number; h: number },
) => void;

function planPage(
  ctx: SheetContext,
  sheet: string,
  planView?: PlanViewParams,
  showDims = true,
  extra?: {
    title: string;
    sub?: string;
    overlay?: PlanOverlay;
    /**
     * Tait la légende d'appareillage.
     *
     * Sur une feuille de schéma, la surcouche en dessine une qui dit tout —
     * appareils ET conducteurs. Deux boîtes cherchant chacune le coin le
     * plus libre finissaient l'une sur l'autre, et c'était illisible.
     */
    hideLegend?: boolean;
  },
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

    /**
     * Les cotes extérieures — et la place que prend leur valeur.
     *
     * Le plan à l'écran saute la valeur d'un mur trop court pour la porter ;
     * le PDF, lui, les écrivait toutes. Sur un logement aux retours de mur
     * nombreux, ou simplement à petite échelle, deux valeurs voisines se
     * chevauchaient — et un chiffre illisible sur un plan coté est pire
     * qu'un chiffre absent : on ne sait même pas qu'il manque.
     *
     * On place donc les valeurs comme un dessinateur : les GRANDES COTES
     * d'abord (ce sont celles qu'on lit), chacune poussée vers l'extérieur
     * tant qu'elle rencontre une voisine déjà posée. Trois tentatives, puis
     * on renonce à la valeur — la ligne de cote et ses tirets restent, la
     * longueur se retrouve au métré.
     */
    const posees: { x: number; y: number; w: number; h: number }[] = [];
    /** Boîte d'un texte pivoté, à la louche : Helvetica ≈ 0,5 em par signe. */
    const boite = (txt: string, cx: number, cy: number, size: number, ang: number) => {
      const l = txt.length * size * 0.5;
      const r = (Math.abs(ang) * Math.PI) / 180;
      const w2 = l * Math.cos(r) + size * Math.sin(r);
      const h2 = l * Math.sin(r) + size * Math.cos(r);
      return { x: cx - w2 / 2, y: cy - h2 / 2, w: w2, h: h2 };
    };
    /**
     * L'étiquette tient-elle ENTIÈREMENT dans la fenêtre de la feuille ?
     *
     * On se règle sur la fenêtre de découpe, pas sur la zone de dessin : le
     * plan est cadré au plus juste dans celle-ci, et ses cotes extérieures
     * débordent forcément de quelques dizaines de points. Ce qui compte,
     * c'est qu'aucun chiffre ne se fasse trancher par le bord.
     */
    const dansLaFenetre = (b: { x: number; y: number; w: number; h: number }) =>
      b.x > FRAME.x + 4 &&
      b.x + b.w < FRAME.x + FRAME.w - 4 &&
      b.y > FRAME.y + TITLE_H + 4 &&
      b.y + b.h < FRAME.y + FRAME.h - 4;
    const libre = (b: { x: number; y: number; w: number; h: number }) =>
      posees.every(
        (o) =>
          b.x > o.x + o.w + 1.5 ||
          o.x > b.x + b.w + 1.5 ||
          b.y > o.y + o.h + 1.5 ||
          o.y > b.y + b.h + 1.5,
      );

    // Les plus longues d'abord : à égalité de place, c'est la grande cote
    // qui doit gagner.
    const cotes = showDims
      ? [...walls].sort((u, v) => segLength(v) - segLength(u))
      : [];
    for (const w of cotes) {
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
      const texte = `${frLen(segLength(w))} m`;
      const mx = (A.x + B.x) / 2;
      const my = (A.y + B.y) / 2;
      let place: { x: number; y: number } | null = null;
      for (const ecart of [8, 19, 30]) {
        const q = { x: mx + nx2 * ecart, y: my + ny2 * ecart };
        const bb = boite(texte, q.x, q.y, 8.5, angle);
        if (libre(bb) && dansLaFenetre(bb)) {
          posees.push(bb);
          place = q;
          break;
        }
      }
      // Rien de libre : la ligne de cote reste, la valeur cède la place.
      if (!place) continue;
      d.text(
        texte,
        place.x,
        place.y - 3,
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
        // La largeur de porte entre dans le même jeu de places que les cotes
        // de murs : deux menuiseries voisines ne doivent pas se marcher
        // dessus, et une porte ne doit pas se poser sur une cote.
        const txt = frLen(segLength(o));
        const qx = (A.x + B.x) / 2 + nx2 * 7;
        const qy = (A.y + B.y) / 2 + ny2 * 7;
        const bb = boite(txt, qx, qy, 7.5, angle);
        if (!libre(bb) || !dansLaFenetre(bb)) continue;
        posees.push(bb);
        d.text(txt, qx, qy - 2.5, 7.5, GREY, { angle });
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
      /**
       * La légende se pose dans le coin le plus LIBRE, pas toujours à
       * gauche.
       *
       * Elle était clouée en bas à gauche. Sur un logement en L, ou dès
       * qu'on décalait le cadrage dans l'aperçu, elle se posait en plein
       * milieu des pièces — masquant les murs qu'elle était censée
       * expliquer. On mesure donc l'emprise du plan sur la page, et on
       * choisit le coin qu'il recouvre le moins.
       */
      const presents = extra?.hideLegend
        ? []
        : [...new Set(ctx.fixtures.map((f) => f.kind))];
      if (presents.length > 0) {
        const lw = 132;
        const lh = 22 + presents.length * 15;
        const marge = 16;
        const gauche = FRAME.x + marge;
        const droite = FRAME.x + FRAME.w - marge - lw;
        const bas = FRAME.y + TITLE_H + marge + lh;
        const haut = FRAME.y + FRAME.h - TITLE_H - marge;
        // L'emprise du plan sur la feuille, coins compris.
        const c1 = px({ x: minX, z: minZ });
        const c2 = px({ x: maxX, z: maxZ });
        const plan = {
          x0: Math.min(c1.x, c2.x),
          x1: Math.max(c1.x, c2.x),
          y0: Math.min(c1.y, c2.y),
          y1: Math.max(c1.y, c2.y),
        };
        /** Surface du plan qu'un emplacement viendrait couvrir. */
        const gene = (lx: number, ly: number) => {
          const ox = Math.min(plan.x1, lx + lw) - Math.max(plan.x0, lx);
          const oy = Math.min(plan.y1, ly) - Math.max(plan.y0, ly - lh);
          return Math.max(0, ox) * Math.max(0, oy);
        };
        const coins = [
          { x: gauche, y: bas },
          { x: droite, y: bas },
          { x: droite, y: haut },
          { x: gauche, y: haut },
        ];
        const choisi = coins.reduce((meilleur, coin) =>
          gene(coin.x, coin.y) < gene(meilleur.x, meilleur.y) ? coin : meilleur,
        );
        drawElecLegend(d, presents, choisi.x, choisi.y);
      }
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

    // La surcouche vient EN DERNIER, dans la même fenêtre de découpe : un
    // schéma se lit par-dessus le plan, jamais dessous.
    if (extra?.overlay) extra.overlay(d, px, scale, box);

    d.restore();
  }

  if (extra) {
    d.text(extra.title, FRAME.x + 24, FRAME.y + FRAME.h - TITLE_H - 24, 13, INK, {
      bold: true,
      align: 'left',
    });
    if (extra.sub) {
      d.text(extra.sub, FRAME.x + 24, FRAME.y + FRAME.h - TITLE_H - 38, 8, GREY, {
        align: 'left',
      });
    }
  }

  drawSheetChrome(d, {
    project: name,
    filename,
    sheetTitle: extra?.title ?? 'Plan d’ensemble coté',
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
/**
 * Le schéma unifilaire — EN COLONNE, une ligne par départ.
 *
 * Il était dessiné en peigne : les départs s'alignaient horizontalement
 * sous leur différentiel. C'est la forme qu'on voit dans les manuels, et
 * elle ne tient que pour trois ou quatre circuits. Au-delà, la largeur de
 * la feuille est fixe : les départs se resserrent, les libellés se touchent,
 * et les différentiels qui ne rentraient plus étaient purement abandonnés
 * en cours de page — sans que rien ne le dise.
 *
 * Un tableau réel se lit de haut en bas, dans l'ordre des modules. Le
 * schéma suit donc cet ordre : une barre verticale, les différentiels
 * dessus, et chaque départ sur SA ligne, avec son disjoncteur, son nombre
 * de conducteurs, sa section et sa gaine alignés en colonnes. On en met
 * vingt sans se serrer, et ce qui ne tiendrait pas est ANNONCÉ.
 */
/**
 * LES ÉTIQUETTES DU TABLEAU, à découper.
 *
 * À la mise en service, il faut étiqueter chaque disjoncteur. On le fait au
 * feutre sur une bande adhésive, dans un tableau mal éclairé, en relisant
 * un plan posé par terre — et c'est la dernière tâche du chantier, celle
 * qu'on bâcle. Six mois plus tard, personne ne sait quel disjoncteur coupe
 * la chambre.
 *
 * Cette feuille les imprime dans l'ORDRE DU TABLEAU, aux dimensions d'un
 * porte-étiquette de rang modulaire, avec les traits de coupe. On découpe,
 * on glisse, c'est fini.
 */
function labelsPage(
  ctx: SheetContext,
  sheet: string,
  rows: SchemaRow[],
): string {
  const d = new Draw();
  const x0 = FRAME.x + 30;
  const w = FRAME.w - 60;
  let y = FRAME.y + FRAME.h - TITLE_H - 46;

  d.text('Étiquettes de tableau', x0, y + 22, 13, INK, {
    bold: true,
    align: 'left',
  });
  d.text(
    'Dans l’ordre des modules. À découper sur les traits, à glisser dans ' +
      'les porte-étiquettes.',
    x0,
    y + 8,
    8,
    GREY,
    { align: 'left' },
  );
  y -= 18;

  // Un porte-étiquette de rang fait environ 45 mm de large sur 8 de haut.
  const LARG = (45 / 25.4) * 72;
  const HAUT = (9 / 25.4) * 72;
  const COLS = Math.max(1, Math.floor(w / (LARG + 12)));
  const PAS_X = LARG + 12;
  const PAS_Y = HAUT + 10;
  const BAS = FRAME.y + TITLE_H + 40;

  let i = 0;
  let restants = 0;
  for (const r of rows) {
    const col = i % COLS;
    const rang = Math.floor(i / COLS);
    const ex = x0 + col * PAS_X;
    const ey = y - rang * PAS_Y;
    if (ey - HAUT < BAS) {
      restants += 1;
      i += 1;
      continue;
    }
    // Le cadre de coupe : tireté, parce qu'on découpe dessus.
    d.dashedPath(
      [
        { x: ex, y: ey },
        { x: ex + LARG, y: ey },
        { x: ex + LARG, y: ey - HAUT },
        { x: ex, y: ey - HAUT },
        { x: ex, y: ey },
      ],
      0.5,
      '#B9C2CE',
      [2, 2],
    );
    // Le repère, en gras à gauche : c'est ce qu'on lit en premier.
    d.text(r.mark, ex + 6, ey - HAUT + 3, 7.5, INK, {
      align: 'left',
      bold: true,
    });
    // Le libellé, tronqué à la place réelle : une étiquette qui déborde ne
    // rentre pas dans son porte-étiquette.
    d.text(fitText(r.label, 7, LARG - 58), ex + 24, ey - HAUT + 3, 7, INK, {
      align: 'left',
    });
    const calibre = r.breaker === null ? 'com.' : `${r.breaker} A`;
    d.text(calibre, ex + LARG - 5, ey - HAUT + 3, 7, GREY, { align: 'right' });
    i += 1;
  }

  if (restants > 0) {
    const bas = y - Math.ceil(i / COLS) * PAS_Y;
    d.text(
      `${restants} étiquette${restants > 1 ? 's' : ''} de plus — la feuille ` +
        'est pleine.',
      x0,
      Math.max(BAS + 4, bas),
      7.5,
      GREY,
      { align: 'left' },
    );
  }

  drawSheetChrome(d, {
    project: ctx.name,
    filename: ctx.filename,
    sheetTitle: 'Étiquettes de tableau',
    sheet,
    scaleLabel: null,
  });
  return d.stream();
}

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
  y -= 10;

  // Les colonnes du schéma, fixées une fois : tout s'y aligne.
  const BUS = x0 + 26; // la barre verticale
  const DISJ = x0 + 74; // le disjoncteur
  const NOM = x0 + 132; // repère et libellé
  const CABLE = x0 + w; // section et gaine, calés à droite
  const PAS = 27; // hauteur d'une ligne de départ

  // ---------------------------------------------------------- l'origine
  d.rect(BUS - 30, y - 26, 60, 24, '#FFFFFF', INK, 1.2);
  d.text('AGCP', BUS, y - 12, 8.5, INK, { bold: true });
  d.text('500 mA S', BUS, y - 21, 6.5, GREY);
  d.text(
    'Disjoncteur de branchement — origine de l’installation',
    BUS + 42,
    y - 16,
    7.5,
    GREY,
    { align: 'left' },
  );
  y -= 26;

  // Les départs, rangés sous leur différentiel.
  const parDiff = new Map<string, SchemaRow[]>();
  const libres: SchemaRow[] = [];
  for (const r of rows) {
    if (!r.under) libres.push(r);
    else parDiff.set(r.under, [...(parDiff.get(r.under) ?? []), r]);
  }
  const blocs: { titre: string; sous: string; rows: SchemaRow[] }[] = [];
  diffs.forEach((diff, i2) => {
    const list = parDiff.get(`ID${i2 + 1}`) ?? [];
    if (list.length === 0) return;
    blocs.push({
      titre: `ID${i2 + 1}`,
      sous: `${diff.rating} A · 30 mA · type ${diff.type}`,
      rows: list,
    });
  });
  if (libres.length > 0) {
    blocs.push({
      titre: 'GTL',
      sous: 'coffret de communication, sans disjoncteur',
      rows: libres,
    });
  }

  /** Une ligne de départ, avec tout ce qui se lit dessus. */
  const ligneDepart = (r: SchemaRow, cy: number, teinte: string) => {
    // La dérivation depuis la barre.
    d.line(BUS, cy, DISJ - 16, cy, 0.9, INK);
    // Le disjoncteur : un module, sa valeur.
    d.rect(DISJ - 16, cy - 9, 32, 18, '#FFFFFF', INK, 0.9);
    d.text(r.breaker === null ? 'com.' : `${r.breaker} A`, DISJ, cy - 3, 7.5, INK, {
      bold: true,
    });
    /**
     * LE TRAIT S'ARRÊTE AVANT LE TEXTE.
     *
     * Il allait d'un bout à l'autre de la ligne et passait DERRIÈRE le
     * libellé : « Prises 1 » sortait barré, comme raturé. Un trait qui
     * traverse un mot le rend illisible et, pire, lui donne l'air annulé.
     * Le départ se lit donc : dérivation, disjoncteur, nombre de
     * conducteurs, repère — puis le texte, seul, sur fond blanc.
     */
    const finTrait = NOM - 24;
    d.line(DISJ + 16, cy, finTrait, cy, 0.9, INK);
    // La barre oblique et le nombre de conducteurs : la convention de
    // l'unifilaire, qui dit en un signe ce que le multifilaire détaille.
    const oblique = DISJ + 34;
    d.line(oblique - 4, cy - 5, oblique + 4, cy + 5, 0.9, INK);
    d.text(`${r.wires}`, oblique + 7, cy + 2, 7, GREY, { align: 'left' });
    // Le repère, à sa teinte de circuit : la même que sur le plan.
    markerAt(d, { x: NOM - 14, y: cy }, r.mark, teinte);
    // Le libellé dispose de toute la place jusqu'à la colonne de droite.
    const largeurNom = CABLE - NOM - 96;
    d.text(fitText(r.label, 8, largeurNom), NOM, cy - 3, 8, INK, {
      align: 'left',
    });
    if (r.points) {
      d.text(fitText(r.points, 6.5, largeurNom), NOM, cy - 12, 6.5, GREY_LIGHT, {
        align: 'left',
      });
    }
    const droite =
      r.section === null
        ? `ICTA Ø${r.conduit}`
        : `${String(r.section).replace('.', ',')} mm² · ICTA Ø${r.conduit}`;
    d.text(droite, CABLE, cy - 3, 7.5, INK, { align: 'right' });
  };

  const BAS = FRAME.y + TITLE_H + 30;
  let restants = 0;
  let indexGlobal = 0;

  for (const bloc of blocs) {
    // Un bloc s'annonce, et ses départs suivent. On ne commence pas un
    // différentiel qu'on ne pourrait pas honorer d'au moins une ligne.
    if (y - 34 - PAS < BAS) {
      restants += bloc.rows.length;
      continue;
    }
    y -= 16;
    d.line(BUS, y + 16, BUS, y, 1.2, INK);
    d.rect(BUS - 30, y - 20, 60, 20, '#F3F6FB', INK, 1);
    d.text(bloc.titre, BUS, y - 8, 8, INK, { bold: true });
    d.text(bloc.sous, BUS + 42, y - 12, 7.5, GREY, { align: 'left' });
    y -= 20;

    const debut = y;
    for (const r of bloc.rows) {
      if (y - PAS < BAS) {
        restants += 1;
        indexGlobal += 1;
        continue;
      }
      y -= PAS;
      ligneDepart(r, y + PAS / 2 - 2, circuitColor(indexGlobal));
      indexGlobal += 1;
    }
    // La barre qui porte les dérivations de ce différentiel.
    d.line(BUS, debut, BUS, y + 4, 1.2, INK);
    y -= 8;
  }

  if (restants > 0) {
    y -= 6;
    d.text(
      `${restants} départ${restants > 1 ? 's' : ''} de plus — voir la liste du ` +
        'matériel, où le tableau est donné en entier.',
      x0,
      y,
      7.5,
      GREY,
      { align: 'left' },
    );
    y -= 12;
  }

  // Le rappel de lecture, en pied : un schéma se lit avec sa convention.
  if (y > BAS + 24) {
    d.line(x0, BAS + 16, x0 + w, BAS + 16, 0.6, GREY_LIGHT);
    d.text(
      'La barre oblique et son chiffre donnent le nombre de conducteurs du ' +
        'départ. Repères identiques à ceux du plan.',
      x0,
      BAS + 4,
      7,
      GREY_LIGHT,
      { align: 'left' },
    );
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
 * Les deux schémas se lisent SUR LE PLAN.
 *
 * Un unifilaire hors sol dit d'où part quoi ; il ne dit pas où ça passe. Sur
 * le chantier, la question est toujours la même — « ce départ, il va où ? » —
 * et la réponse se lit sur le plan de la pièce, pas sur un peigne abstrait.
 * On dessine donc les circuits À LEUR PLACE : le tracé depuis le tableau,
 * repéré C1, C2…, et le cartouche de départs en pied de feuille.
 *
 * Tout est borné par la fenêtre de découpe du plan (`d.clip`) : rien ne peut
 * sortir du cadre, quel que soit le zoom demandé.
 */
/** Repère rond posé sur un tracé : « C1 » dans une pastille blanche. */
function markerAt(d: Draw, at: Pt, texte: string, couleur: string) {
  d.circle(at.x, at.y, 7.5, '#FFFFFF');
  d.poly(
    [
      { x: at.x - 7.5, y: at.y },
      { x: at.x, y: at.y + 7.5 },
      { x: at.x + 7.5, y: at.y },
      { x: at.x, y: at.y - 7.5 },
    ],
    null,
    couleur,
    0.8,
  );
  d.text(texte, at.x, at.y - 2.6, 6.5, couleur, { bold: true });
}

function schemaPlanPage(
  ctx: SheetContext,
  sheet: string,
  planView: PlanViewParams | undefined,
  rows: SchemaRow[],
  routes: { id: string; path: { x: number; z: number }[] }[],
  fixtureCircuit: Map<string, string>,
  mode: 'uni' | 'multi',
  multi: MultiWireSchema[],
): string {
  const parMarque = new Map(rows.map((r) => [r.mark, r]));
  const filsDe = new Map(multi.map((m) => [m.mark, m.wires]));

  const overlay: PlanOverlay = (d, px, scale, box) => {
    for (const r of routes) {
      const mark = fixtureCircuit.get(r.id);
      if (!mark) continue;
      const idx = rows.findIndex((x) => x.mark === mark);
      const couleur = circuitColor(idx < 0 ? 0 : idx);
      const pts = r.path.map(px);
      if (pts.length < 2) continue;

      if (mode === 'uni') {
        /**
         * CHAQUE CIRCUIT SUR SA VOIE, ici aussi.
         *
         * Les faisceaux du multifilaire avaient reçu leur écartement, pas
         * les traits de l'unifilaire : deux départs longeant le même mur se
         * posaient l'un sur l'autre. On voyait alors un trait rouge faire
         * le tour de la pièce et frôler des prises qu'il ne dessert pas,
         * pendant que le bleu qui les alimente disparaissait dessous. Un
         * professionnel ne peut rien faire d'un plan pareil.
         */
        const voie = (idx - (rows.length - 1) / 2) * Math.max(2, scale * 0.03);
        const ecarte = pts.map((q, i2) => {
          const prev = pts[Math.max(0, i2 - 1)];
          const next = pts[Math.min(pts.length - 1, i2 + 1)];
          const dx2 = next.x - prev.x;
          const dy2 = next.y - prev.y;
          const l2 = Math.hypot(dx2, dy2) || 1;
          return { x: q.x - (dy2 / l2) * voie, y: q.y + (dx2 / l2) * voie };
        });
        d.path(ecarte, 1.4, couleur);
        /**
         * LE POINT DE RACCORDEMENT.
         *
         * Sans lui, le trait PASSE près de l'appareil sans qu'on sache s'il
         * s'y arrête ou s'il continue vers un autre. Une pastille pleine à
         * l'arrivée, et la question ne se pose plus : ce trait-là finit
         * ici, sur cet appareil.
         */
        const fin = ecarte[ecarte.length - 1];
        d.circle(fin.x, fin.y, 2.6, couleur);
        const a = pts[0];
        const b = pts[1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l = Math.hypot(dx, dy) || 1;
        const m = { x: a.x + (dx / l) * 16, y: a.y + (dy / l) * 16 };
        const n = { x: -dy / l, y: dx / l };
        d.line(
          m.x - n.x * 4 - (dx / l) * 3,
          m.y - n.y * 4 - (dy / l) * 3,
          m.x + n.x * 4 + (dx / l) * 3,
          m.y + n.y * 4 + (dy / l) * 3,
          0.9,
          couleur,
        );
        const nb = parMarque.get(mark)?.wires ?? 3;
        d.text(`${nb}`, m.x + n.x * 8, m.y + n.y * 8 - 2, 6, couleur, {
          bold: true,
        });
      } else {
        // MULTIFILAIRE : un trait par conducteur, décalé de sa voisine, à
        // sa couleur normalisée. L'écartement suit l'échelle du plan pour
        // rester lisible sans jamais devenir un ruban.
        const fils = filsDe.get(mark) ?? [];
        const pas = Math.max(1.1, Math.min(2.2, scale * 0.02));
        /**
         * CHAQUE CIRCUIT SUR SA VOIE.
         *
         * Les conducteurs d'un même départ s'écartaient bien les uns des
         * autres, mais deux départs qui longent le même mur se posaient au
         * même endroit : six traits par-dessus six autres, et plus personne
         * ne sait lequel va où. On décale donc le faisceau entier, circuit
         * par circuit, comme des câbles voisins dans une même goulotte.
         */
        const voie =
          (idx - (rows.length - 1) / 2) * (fils.length + 1.2) * pas;
        fils.forEach((fil, k) => {
          const dec = voie + (k - (fils.length - 1) / 2) * pas;
          const decale = pts.map((q, i) => {
            const prev = pts[Math.max(0, i - 1)];
            const next = pts[Math.min(pts.length - 1, i + 1)];
            const dx2 = next.x - prev.x;
            const dy2 = next.y - prev.y;
            const l2 = Math.hypot(dx2, dy2) || 1;
            return { x: q.x - (dy2 / l2) * dec, y: q.y + (dx2 / l2) * dec };
          });
          d.path(decale, 0.7, fil.color);
        });
      }

      /**
       * LE REPÈRE SUR CHAQUE APPAREIL, décalé pour ne rien recouvrir.
       *
       * Le plan montre les appareils à la couleur de LEUR TYPE — orange
       * pour une prise, violet pour une RJ45 — et les circuits à la
       * couleur du DÉPART. Rien ne reliait les deux : on voyait des prises
       * orange et un trait bleu sans pouvoir dire lesquelles il alimente.
       * Le repère, posé sur l'appareil à la teinte de son circuit, fait ce
       * lien en un coup d'œil.
       */
      const bout = pts[pts.length - 1];
      const avant = pts[Math.max(0, pts.length - 2)];
      const dxb = bout.x - avant.x;
      const dyb = bout.y - avant.y;
      const lb = Math.hypot(dxb, dyb) || 1;
      markerAt(
        d,
        { x: bout.x + (dxb / lb) * 11, y: bout.y + (dyb / lb) * 11 },
        mark,
        couleur,
      );
    }

    /**
     * UNE SEULE LÉGENDE, et elle dit tout.
     *
     * Il y en avait deux : celle des appareils, qui cherchait le coin le
     * plus libre, et celle des conducteurs, clouée en bas à gauche. Elles
     * se retrouvaient l'une sur l'autre — deux cadres blancs superposés,
     * dont on ne lisait ni l'un ni l'autre. Sur une feuille de schéma, le
     * dessinateur n'en met qu'une : les départs, puis les couleurs.
     */
    // Ce que chaque départ DESSERT : sans ça, la légende nomme des
    // circuits sans dire ce qu'on trouve au bout.
    const departs: LegendLine[] = rows.map((r, i) => ({
      couleur: circuitColor(i),
      texte:
        `${r.mark} · ${r.label}${r.breaker === null ? '' : ` · ${r.breaker} A`}` +
        (r.points ? ` · ${r.points}` : ''),
    }));
    const fils: LegendLine[] =
      mode === 'multi'
        ? (['phase', 'neutre', 'terre', 'navette', 'retour'] as const).map(
            (r) => ({
              couleur: WIRE_COLORS[r].color,
              texte: WIRE_COLORS[r].label,
            }),
          )
        : [];
    // Une seule boîte, deux sections, et des marges égales partout.
    drawLegendBox(d, box.x + 8, box.y + 8, 152, [
      [
        { titre: 'DÉPARTS', lignes: departs },
        ...(fils.length > 0 ? [{ titre: 'CONDUCTEURS', lignes: fils }] : []),
      ],
    ]);
  };

  const titre =
    mode === 'uni' ? 'Unifilaire sur plan' : 'Multifilaire sur plan';
  const sous =
    mode === 'uni'
      ? 'Un trait par circuit, du tableau à ses appareils. Calibres et ' +
        'sections selon NF C 15-100.'
      : 'Un trait par conducteur, à sa couleur normalisée (NF C 15-100).';
  return planPage(ctx, sheet, planView, false, {
    title: titre,
    sub: sous,
    overlay,
    hideLegend: true,
  });
}

/**
 * LA FEUILLE D'IMPLANTATION — celle qu'on donne à l'équipe.
 *
 * Le plan coté dit où sont les murs, la liste dit ce qu'il faut acheter ;
 * aucun des deux ne dit QUEL INTERRUPTEUR ALLUME QUOI. C'est pourtant la
 * seule question qu'on se pose une fois les gaines tirées, et celle qui
 * coûte une matinée quand personne n'y a répondu par écrit.
 *
 * Cette feuille porte donc les appareils de plafond à leur place, les
 * commandes murales, et le trait pointillé courbe qui va de l'une à
 * l'autre — courbe, pour qu'on ne le confonde ni avec une cote ni avec un
 * cheminement de gaine. Les cotes du plan restent : on pose un point
 * lumineux au mètre près, pas à l'œil.
 */
function ceilingPage(
  ctx: SheetContext,
  sheet: string,
  planView: PlanViewParams | undefined,
  ceiling: CeilingFixture[],
): string {
  const quads = wallQuads(ctx.walls);
  const murs = new Map(ctx.walls.map((w) => [w.id, w]));

  const overlay: PlanOverlay = (d, px, scale, box) => {
    // Les liens d'abord : ils passent SOUS les symboles, jamais dessus.
    for (const cl of ceiling) {
      for (const fid of cl.commands ?? []) {
        const f = (ctx.fixtures ?? []).find((x) => x.id === fid);
        const w = f ? murs.get(f.wallId) : undefined;
        if (!f || !w) continue;
        const face = wallFace(w, quads.get(w.id), f.side);
        const depart = facePoint(face, faceX(face, f.along), 0.16);
        const arrivee = linkAnchor(
          { x: depart.x, z: depart.z },
          cl.at,
          CEILINGS[cl.kind].d * 0.7,
        );
        const courbe = linkCurve({ x: depart.x, z: depart.z }, arrivee).map(px);
        d.dashedPath(courbe, 0.7, GREY, [1.6, 3]);
      }
    }

    /**
     * LES COTES DE CHAQUE APPAREIL — sans elles, la feuille ne se pose pas.
     *
     * Le plan portait les cotes des MURS, et on croyait la feuille
     * complète : elle disait où sont les cloisons, jamais où percer le
     * plafond. Or un point lumineux ne se place pas à l'œil — on tend un
     * mètre depuis deux murs qui se coupent, et c'est exactement ce qu'on
     * lit à l'écran en déplaçant l'appareil, en pointillés bleus.
     *
     * Les deux cotes partent donc d'équerre AVEC LA TRAME du logement, et
     * non avec les axes du monde : ARKit oriente son repère selon
     * l'endroit où le relevé a commencé, et un scan de biais est le cas
     * normal. Ce sont les mêmes valeurs qu'à l'écran, au centimètre près.
     */
    const trame = planFrameAngle(ctx.walls);
    const cos = Math.cos(trame);
    const sin = Math.sin(trame);
    const AXES = [
      { x: -cos, z: -sin },
      { x: sin, z: -cos },
    ];
    // Les étiquettes déjà posées : deux nombres l'un sur l'autre ne se
    // lisent ni l'un ni l'autre, et une cote illisible ne vaut rien.
    const prises: { x: number; y: number }[] = [];
    const libre = (p: { x: number; y: number }) =>
      prises.every((q) => Math.abs(q.x - p.x) > 22 || Math.abs(q.y - p.y) > 11);
    for (const cl of ceiling) {
      for (const axe of AXES) {
        const dist = castToWall(cl.at, axe, ctx.walls);
        if (dist === null || dist < 0.02) continue;
        const bout = {
          x: cl.at.x + axe.x * dist,
          z: cl.at.z + axe.z * dist,
        };
        const a = px(cl.at);
        const b = px(bout);
        d.dashedPath([a, b], 0.6, SKY, [2, 3]);
        // Le repère au pied de la cote : on voit sur quel mur elle bute.
        const nx = (b.y - a.y) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
        const ny = -(b.x - a.x) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
        d.line(b.x - nx * 3, b.y - ny * 3, b.x + nx * 3, b.y + ny * 3, 0.8, SKY);
        // L'étiquette glisse vers le mur tant qu'elle en gêne une autre.
        let t = 0.5;
        let p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        for (let n = 0; n < 4 && !libre(p); n++) {
          t += 0.16;
          p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        }
        prises.push(p);
        d.rect(p.x - 11, p.y - 5, 22, 10, '#FFFFFF', null);
        d.text(`${Math.round(dist * 100)}`, p.x, p.y - 2.5, 6.5, SKY, {
          bold: true,
        });
      }
    }

    // Puis les appareils, à leur diamètre réel, jamais plus petits que
    // lisibles : un spot de 9 cm ferait deux points à l'échelle 1:100.
    for (const cl of ceiling) {
      const spec = CEILINGS[cl.kind];
      const q = px(cl.at);
      const r = Math.max(7, Math.min(16, (spec.d / 2) * scale));
      d.circle(q.x, q.y, r + 2, '#FFFFFF');
      drawSymbol(d, CEILING_SYMBOL[cl.kind], q.x, q.y, r / 9, spec.color, 1.1);
      d.text(spec.short, q.x, q.y - r - 8, 6.5, spec.color, { bold: true });
    }

    /**
     * LA LÉGENDE, EN UN SEUL CADRE À DEUX COLONNES.
     *
     * Cette feuille en portait deux : celle de l'appareillage, que la page
     * de plan pose dans le coin qu'elle juge le plus libre, et celle du
     * plafond, clouée en bas à gauche. Elles se recouvraient, et on ne
     * lisait plus ni l'une ni l'autre. Un plan n'a qu'une légende : on
     * demande donc à la page de ne pas dessiner la sienne
     * (`hideLegend`), et on réunit tout ici — les commandes murales à
     * gauche, ce qu'elles allument à droite. C'est aussi l'ordre dans
     * lequel on lit le plan.
     */
    const vus = [...new Set(ceiling.map((c) => c.kind))];
    if (vus.length === 0) return;
    // On ne montre au mur que ce qui commande : sur une feuille de
    // plafond, une prise de courant n'apprend rien.
    const commandes = [
      ...new Set(
        (ctx.fixtures ?? [])
          .filter((f) => ceiling.some((c) => (c.commands ?? []).includes(f.id)))
          .map((f) => f.kind),
      ),
    ];
    const colGauche: LegendSection[] = [
      {
        titre: 'COMMANDES',
        lignes: commandes.map((k) => ({
          texte: FIXTURES[k].label,
          symbole: { paths: assemblySymbol(k), color: FIXTURES[k].color },
        })),
      },
    ];
    const colDroite: LegendSection[] = [
      {
        titre: 'PLAFOND',
        lignes: vus.map((k) => ({
          texte: CEILINGS[k].label,
          symbole: { paths: CEILING_SYMBOL[k], color: CEILINGS[k].color },
        })),
      },
      { lignes: [{ couleur: GREY, texte: 'Lien de commande' }] },
    ];
    const colonnes =
      commandes.length > 0 ? [colGauche, colDroite] : [colDroite];
    drawLegendBox(
      d,
      box.x + 8,
      box.y + 8,
      colonnes.length > 1 ? 300 : 154,
      colonnes,
    );
  };

  return planPage(ctx, sheet, planView, true, {
    title: 'Plan d\u2019implantation — plafond',
    sub:
      'Points lumineux, détection et ventilation, avec le lien de commande ' +
      'de chaque appareil. Cotes du plan d’ensemble.',
    overlay,
    // La légende de l'appareillage est reprise dans le cadre ci-dessus.
    hideLegend: true,
  });
}

/**
 * L'ÉLÉVATION D'UN MUR — la feuille qu'on tient devant le mur.
 *
 * Le plan vu de dessus dit où sont les cloisons, jamais à quelle hauteur
 * percer. C'est pourtant la seule question du compagnon qui a la
 * perceuse en main, et jusqu'ici la réponse ne vivait QUE dans l'app :
 * face au mur, à l'écran, dans un téléphone qu'on ne sort pas les mains
 * pleines de plâtre. Ces feuilles la mettent sur le papier, un mur par
 * page, avec les trois cotes qui comptent — depuis la gauche, depuis le
 * sol, la longueur du retour quand le mur est percé — et la photo de
 * repérage dessous quand elle existe : trois jours plus tard, c'est elle
 * qui répond à « c'était quel mur, déjà ? ».
 */
function elevationPage(
  ctx: SheetContext,
  sheet: string,
  wall: WallSeg,
  photo: PdfImage | null,
): string {
  const d = new Draw();
  const walls = ctx.walls;
  const rooms = ctx.rooms ?? [];
  const side = interiorSide(wall, walls, rooms);
  const face = wallFace(wall, wallQuads(walls).get(wall.id), side);
  const H = wall.height;
  const mine = (ctx.fixtures ?? []).filter((f) => f.wallId === wall.id);
  const piece = ctx.roomNames[roomOf(wall) ?? ''] ?? '';

  // ------------------------------------------------------------- cadre
  const hautTitre = FRAME.y + FRAME.h - TITLE_H - 40;
  d.text(
    `Élévation — ${piece || 'mur'}`,
    FRAME.x + 30,
    hautTitre,
    13,
    INK,
    { bold: true, align: 'left' },
  );
  d.text(
    `Mur de ${face.len.toFixed(2).replace('.', ',')} m sous ` +
      `${H.toFixed(2).replace('.', ',')} m · ` +
      `${mine.length} appareil${mine.length > 1 ? 's' : ''} · cotes en cm ` +
      'depuis le nu du mur et depuis le sol.',
    FRAME.x + 30,
    hautTitre - 14,
    8,
    GREY,
    { align: 'left' },
  );

  // La photo prend le bas de la feuille ; sans elle, le dessin descend.
  const BAS = FRAME.y + TITLE_H + 34;
  const hautPhoto = photo ? BAS + 190 : BAS;
  const zone = {
    x: FRAME.x + 52,
    y: hautPhoto + 46,
    w: FRAME.w - 104,
    h: hautTitre - 40 - (hautPhoto + 46),
  };
  const scale = Math.min(zone.w / face.len, zone.h / H);
  const x0 = zone.x + (zone.w - face.len * scale) / 2;
  /**
   * Le dessin se CENTRE dans sa zone.
   *
   * Un mur large est bridé par la largeur de la feuille : à 6 m de long, il
   * ne fait plus que 18 cm de haut sur le papier. Calé en bas, il laissait
   * un tiers de page vide au-dessus, et les cotes du bas se retrouvaient
   * coincées contre le cartouche. Centré, la feuille respire des deux côtés.
   */
  const y0 = zone.y + Math.max(0, (zone.h - H * scale) / 2);
  const px = (x: number) => x0 + x * scale;
  const py = (y: number) => y0 + y * scale;

  // ------------------------------------------------------------- le mur
  d.rect(px(0), py(0), face.len * scale, H * scale, '#F4F6F9', INK, 1.2);
  // Le sol : trait franc et hachures, comme sur la face à l'écran.
  d.line(px(0) - 12, py(0), px(face.len) + 12, py(0), 2, INK);
  for (let x = px(0) - 10; x < px(face.len) + 10; x += 9) {
    d.line(x, py(0) - 6, x + 5, py(0), 0.6, GREY_LIGHT);
  }

  // Les hauteurs de référence, en filigrane : ce sont les quatre lignes
  // sur lesquelles une installation se pose.
  for (const r of HAUTEURS_REF) {
    if (r.y >= H - 0.05) continue;
    d.dashedPath(
      [
        { x: px(0), y: py(r.y) },
        { x: px(face.len), y: py(r.y) },
      ],
      0.5,
      '#C7D2E0',
      [2, 5],
    );
    d.text(r.nom, px(face.len) - 3, py(r.y) + 3, 6, GREY_LIGHT, {
      align: 'right',
    });
  }

  // ---------------------------------------------------- baies et retours
  const solY = Math.min(...walls.map((w) => w.yCenter - w.height / 2));
  const trous = assignOpenings(walls, ctx.openings, solY).get(wall.id) ?? [];
  for (const t of trous) {
    const xa = faceXofT(face, t.t0);
    const xb = faceXofT(face, t.t1);
    const gx = Math.min(xa, xb);
    const larg = Math.abs(xb - xa);
    d.rect(
      px(gx),
      py(t.y0),
      larg * scale,
      (t.y1 - t.y0) * scale,
      '#EAF2FA',
      SKY,
      1,
    );
    if (larg * scale > 40) {
      d.text(
        t.seg.type === 'window' ? 'Fenêtre' : t.seg.open ? 'Passage' : 'Porte',
        px(gx + larg / 2),
        py(t.y1) + 5,
        7,
        SKY,
        { bold: true },
      );
      d.text(
        `${Math.round(larg * 100)} × ${Math.round((t.y1 - t.y0) * 100)}`,
        px(gx + larg / 2),
        py(t.y0) - 11,
        6.5,
        SKY,
      );
    }
  }

  const retours = masonryRuns(
    wallRuns(wall, ctx.openings),
    segLength(wall),
    face,
  );
  if (retours.length > 1) {
    for (const r of retours) {
      const m = (r.x0 + r.x1) / 2;
      const yr = py(H) - 14;
      d.line(px(r.x0) + 1, yr, px(r.x1) - 1, yr, 0.8, GREY);
      for (const x of [r.x0, r.x1]) d.line(px(x), yr - 3, px(x), yr + 3, 1, GREY);
      d.dashedPath(
        [
          { x: px(m), y: py(0) + 2 },
          { x: px(m), y: py(H) - 20 },
        ],
        0.5,
        '#C7D2E0',
        [2, 5],
      );
      d.circle(px(m), yr, 8.5, '#FFFFFF');
      d.text(`${Math.round((r.x1 - r.x0) * 100)}`, px(m), yr - 2.5, 7, GREY, {
        bold: true,
      });
    }
  }

  // -------------------------------------------------------- la longueur
  const yCote = py(H) + 22;
  d.line(px(0), yCote, px(face.len), yCote, 0.8, INK);
  for (const x of [0, face.len]) {
    d.line(px(x), yCote - 4, px(x), yCote + 4, 1.2, INK);
  }
  d.circle(px(face.len / 2), yCote, 15, '#FFFFFF');
  d.text(
    `${face.len.toFixed(2).replace('.', ',')} m`,
    px(face.len / 2),
    yCote - 3.5,
    10,
    INK,
    { bold: true },
  );
  // La hauteur sous plafond, debout à gauche.
  d.text(
    `H ${H.toFixed(2).replace('.', ',')} m`,
    px(0) - 16,
    py(H / 2),
    8,
    GREY,
    { angle: 90 },
  );

  // ------------------------------------------------------- l'appareillage
  /**
   * Les cotes du bas, sur DEUX RANGS.
   *
   * Deux appareils voisins — une prise et sa commande à quarante
   * centimètres — écrivent leurs nombres l'un sur l'autre à l'échelle
   * d'une feuille. On alterne donc les rangs dès qu'ils se touchent :
   * c'est ce que fait un dessinateur, et ça se lit sans effort.
   */
  const poses = mine
    .filter((f) => f.side === side)
    .map((f) => ({ f, x: faceX(face, f.along) }))
    .sort((a, b) => a.x - b.x);
  let dernier = -Infinity;
  let rang = 0;
  for (const { f, x } of poses) {
    const spec = FIXTURES[f.kind];
    // Le symbole, sur un disque blanc pour rester lisible sur une baie.
    d.circle(px(x), py(f.height), 9, '#FFFFFF');
    drawSymbol(d, assemblySymbol(f.kind), px(x), py(f.height), 0.62, spec.color, 1);
    const tag = FIXTURE_TAG[f.kind];
    if (tag) {
      d.text(tag, px(x) + 12, py(f.height) + 4, 6, spec.color, { align: 'left' });
    }
    // Sa hauteur, à gauche du symbole, sur un trait de rappel.
    d.dashedPath(
      [
        { x: px(0) - 8, y: py(f.height) },
        { x: px(x) - 10, y: py(f.height) },
      ],
      0.5,
      '#B9C2CE',
      [2, 3],
    );
    d.circle(px(0) - 22, py(f.height), 9, '#FFFFFF');
    d.text(`${Math.round(f.height * 100)}`, px(0) - 22, py(f.height) - 2.5, 7, INK, {
      bold: true,
    });
    // Sa distance au bord gauche, en bas.
    rang = x * scale - dernier < 46 ? 1 - rang : 0;
    dernier = x * scale;
    const yb = py(0) - 16 - rang * 15;
    d.dashedPath(
      [
        { x: px(x), y: py(f.height) - 10 },
        { x: px(x), y: yb + 6 },
      ],
      0.5,
      '#B9C2CE',
      [2, 3],
    );
    d.line(px(0), yb, px(x), yb, 0.6, GREY);
    d.line(px(0), yb - 3, px(0), yb + 3, 1, GREY);
    d.line(px(x), yb - 3, px(x), yb + 3, 1, GREY);
    d.circle(px(x / 2), yb, 9, '#FFFFFF');
    d.text(`${Math.round(x * 100)}`, px(x / 2), yb - 2.5, 7, GREY, { bold: true });
  }

  if (poses.length === 0) {
    d.text(
      'Aucun appareil sur ce mur.',
      px(face.len / 2),
      py(H / 2),
      9,
      GREY_LIGHT,
    );
  }

  // ------------------------------------------------------------ la photo
  if (photo) {
    const hMax = 150;
    const wMax = 210;
    const k = Math.min(wMax / photo.w, hMax / photo.h);
    const pw = photo.w * k;
    const ph = photo.h * k;
    const pxp = FRAME.x + (FRAME.w - pw) / 2;
    const pyp = BAS + 14;
    d.rect(pxp - 3, pyp - 3, pw + 6, ph + 6, '#FFFFFF', '#D6DBE3', 0.8);
    d.image(photo.name, pxp, pyp, pw, ph);
    d.text(
      'Photo de repérage',
      FRAME.x + FRAME.w / 2,
      pyp + ph + 9,
      7,
      GREY_LIGHT,
    );
  }

  drawSheetChrome(d, {
    project: ctx.name,
    filename: ctx.filename,
    sheetTitle: `Élévation — ${piece || 'mur'}`,
    sheet,
    // Un mètre vaut 2834,6 points à l'échelle 1:1 (72 pt par pouce).
    scaleLabel: `1:${Math.round(2834.6 / Math.max(scale, 1e-6))}`,
  });
  return d.stream();
}

/** Les hauteurs de référence d'une installation — les mêmes qu'à l'écran. */
const HAUTEURS_REF = [
  { y: 0.25, nom: 'plinthe 25' },
  { y: 1.1, nom: 'commande 110' },
  { y: 1.35, nom: 'tableau 135' },
  { y: 2.1, nom: 'applique 210' },
];

/**
 * Les murs qui méritent leur feuille, dans l'ordre où on visite le
 * logement : pièce par pièce, et dans chaque pièce l'ordre du relevé.
 */
function elevationWalls(ctx: SheetContext): WallSeg[] {
  const ordre = new Map((ctx.rooms ?? []).map((r, i) => [r.id, i]));
  return ctx.walls
    .filter((w) => w.type === 'wall' && segLength(w) > 0.3)
    .map((w, i) => ({ w, i, r: ordre.get(roomOf(w) ?? '') ?? 999 }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((e) => e.w);
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
  /**
   * Les photos de repérage, une par mur au plus, en JPEG base64.
   *
   * L'app les garde en fichiers ; le PDF, lui, ne peut embarquer que des
   * octets. C'est donc l'écran d'export qui les relit et les réduit avant
   * de les passer ici — une photo d'appareil pleine résolution pèse
   * quatre mégaoctets, et un dossier de douze murs deviendrait
   * impartageable.
   */
  photos?: { wallId: string; base64: string }[];
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
  /**
   * Une ligne à deux colonnes : la désignation, et sa valeur.
   *
   * La valeur était posée à gauche d'un x fixe et s'étendait vers la
   * droite : dès qu'elle dépassait soixante points — « 1 couronne de
   * 100 m » — elle sortait du cadre. Elle se cale désormais sur le bord
   * DROIT de la colonne, et la désignation se tronque à ce qui reste.
   */
  const COL_VAL = 118;
  const ligne = (
    gauche: string,
    droite: string,
    o: { bold?: boolean; grey?: boolean; indent?: number } = {},
  ) => {
    need(16);
    const col = o.grey ? GREY : INK;
    const dispo = w - COL_VAL - 10 - (o.indent ?? 0);
    d.text(fitText(gauche, 10, dispo), x0 + (o.indent ?? 0), y, 10, col, {
      align: 'left',
      bold: o.bold,
    });
    if (droite) {
      d.text(fitText(droite, 10, COL_VAL), x0 + w, y, 10, col, {
        align: 'right',
        bold: o.bold,
      });
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
      x0 + w,
      y,
      9,
      GREY,
      { align: 'right' },
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
        : `${c.breaker} A · ${String(c.section).replace('.', ',')} mm²`;
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
      // « ≈ » comme sur les surfaces : la même réserve, écrite pareil.
      const approche = r.approx && r.conduitLength > 0 ? '≈ ' : '';
      const droite =
        r.conduitLength > 0
          ? `ICTA Ø${r.conduit} · ${approche}${r.conduitLength} m`
          : `ICTA Ø${r.conduit}`;
      ligne(
        `${r.label} — ${r.runs} départ${r.runs > 1 ? 's' : ''}` +
          (r.cableLength > 0
            ? ` · ${approche}${r.cableLength} m de conducteur`
            : ''),
        droite,
      );
    }
    note(
      '   Remplissage NF C 15-100 : la section des conducteurs ne dépasse ' +
        'pas le tiers de celle du conduit.',
    );
    if (tirage.pull.some((r) => r.approx && r.conduitLength > 0)) {
      note(
        '   Les longueurs marquées « ≈ » longent un contour reconstitué : ' +
          'la pièce n’a pas été relevée en boucle fermée. Prévoyez une ' +
          'marge, ou refaites le tour de la pièce.',
      );
    }
    if (tirage.pull.every((r) => r.conduitLength === 0)) {
      note('   Posez le tableau sur le plan pour obtenir les longueurs.');
    }
  }

  // -------------------------------------------------------- à commander
  //
  // C'EST LA PAGE QU'ON TEND AU COMPTOIR. Elle était une suite de phrases
  // — « Plaque 1 poste — 82 mm de large ... 5 plaques » — où la
  // désignation, la précision et l'unité se mélangeaient sur une seule
  // ligne, et où la quantité débordait de la feuille. Un fournisseur lit
  // un bordereau : un rayon, une désignation, une quantité, une unité.
  // C'est exactement ce qu'on lui donne maintenant.
  if (tirage && tirage.buy.length > 0) {
    y -= 8;
    titre('À commander');
    const COL_U = 62; // l'unité, calée à droite
    const COL_Q = 34; // la quantité, juste avant
    const xU = x0 + w;
    const xQ = xU - COL_U;
    const largeurDesignation = w - COL_U - COL_Q - 12;

    need(20);
    d.text('Désignation', x0, y, 8, GREY_LIGHT, { align: 'left', bold: true });
    d.text('Qté', xQ, y, 8, GREY_LIGHT, { align: 'right', bold: true });
    d.text('Unité', xU, y, 8, GREY_LIGHT, { align: 'right', bold: true });
    y -= 6;
    d.line(x0, y, x0 + w, y, 0.6, '#D6DBE3');
    y -= 12;

    let famille = '';
    let bande = 0;
    for (const r of tirage.buy) {
      if (r.family !== famille) {
        famille = r.family;
        bande = 0;
        need(30);
        y -= 4;
        // Le rayon, en bandeau : on parcourt le magasin dans cet ordre.
        d.rect(x0, y - 4, w, 15, '#EEF2F8', null);
        d.text(famille.toUpperCase(), x0 + 7, y, 7.5, INK, {
          align: 'left',
          bold: true,
        });
        y -= 19;
      }
      const hauteur = r.spec || r.note ? 24 : 15;
      need(hauteur + 2);
      // Une bande sur deux, très pâle : l'œil suit la ligne jusqu'à sa
      // quantité sans avoir à poser le doigt sur la feuille.
      if (bande % 2 === 1) {
        d.rect(x0, y - hauteur + 11, w, hauteur, '#FAFBFD', null);
      }
      bande += 1;
      d.text(fitText(r.label, 10, largeurDesignation), x0 + 3, y, 10, INK, {
        align: 'left',
      });
      d.text(`${r.quantity}`, xQ, y, 10, INK, { align: 'right', bold: true });
      d.text(fitText(r.unit, 9, COL_U - 6), xU - 3, y, 9, GREY, {
        align: 'right',
      });
      y -= 12;
      const dessous = [r.spec, r.note].filter(Boolean).join(' · ');
      if (dessous) {
        d.text(fitText(dessous, 8, largeurDesignation), x0 + 3, y, 8, GREY_LIGHT, {
          align: 'left',
        });
        y -= 12;
      }
      y -= 3;
    }
    y -= 4;
    note(
      '   Quantités établies sur le relevé, chutes non comprises. Les ' +
        'longueurs de conduit et de conducteur sont mesurées sur le plan, ' +
        'pas estimées au mètre carré.',
    );
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

/**
 * De quoi ordonner les murs avant même d'avoir monté le contexte complet :
 * la pagination doit être connue dès la première feuille.
 */
function ctxTemporaire(scan: ScanForPdf): SheetContext {
  return {
    name: scan.name,
    filename: '',
    walls: scan.walls,
    openings: scan.openings,
    objects: scan.objects,
    floors: scan.floors ?? {},
    roomNames: scan.roomNames ?? {},
    rooms: scan.rooms,
    fixtures: scan.fixtures ?? [],
    colorOpenings: false,
    showSurfaces: false,
    showTextures: false,
  };
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
  const withCeiling = (opts.ceiling?.length ?? 0) > 0;
  const murs = opts.elevations ? elevationWalls(ctxTemporaire(scan)) : [];
  /**
   * Les photos, prêtes à être posées : une par mur, la dernière prise.
   *
   * Une photo illisible — fichier tronqué, format inattendu — est
   * simplement laissée de côté : la feuille sort sans elle. Un dossier
   * qui refuse de s'exporter serait bien pire qu'un dossier sans photo.
   */
  const photos = new Map<string, PdfImage>();
  const images: PdfImage[] = [];
  (scan.photos ?? []).forEach((p, i) => {
    if (photos.has(p.wallId)) return;
    const im = pdfImage(`Im${i}`, p.base64);
    if (!im) return;
    photos.set(p.wallId, im);
    images.push(im);
  });
  // Trois feuilles : l'unifilaire hors sol, puis les deux schémas sur le
  // plan. Les tracés viennent des mêmes cheminements que le métré.
  const total =
    1 +
    (withMetre ? 1 : 0) +
    (include3D ? 1 : 0) +
    (withCeiling ? 1 : 0) +
    murs.length +
    (withSchema ? 4 : 0);
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
  if (withCeiling) {
    pages.push(
      ceilingPage(
        ctx,
        `${pages.length + 1} / ${total}`,
        opts.ceilingPlan ?? opts.plan,
        opts.ceiling!,
      ),
    );
  }
  if (withMetre) {
    pages.push(metrePage(ctx, `${pages.length + 1} / ${total}`));
  }
  if (include3D) {
    pages.push(
      threeDPage(ctx, `${pages.length + 1} / ${total}`, opts.views, opts.measures3D ?? true),
    );
  }
  // Les élévations viennent après les plans et avant les schémas : on lit
  // le logement, puis chaque mur, puis le tableau.
  for (const w of murs) {
    pages.push(
      elevationPage(
        ctx,
        `${pages.length + 1} / ${total}`,
        w,
        photos.get(w.id) ?? null,
      ),
    );
  }
  if (withSchema && schemas) {
    // Les étiquettes d'abord : c'est la feuille qu'on détache du dossier.
    pages.push(
      labelsPage(ctx, `${pages.length + 1} / ${total}`, schemas.rows),
    );
    // D'abord l'architecture hors sol — d'où part quoi, sous quelle
    // protection —, puis les deux MÊMES schémas posés sur le plan : c'est
    // là qu'on lit où passe un départ, et c'est la question du chantier.
    pages.push(
      unifilairePage(
        ctx,
        `${pages.length + 1} / ${total}`,
        schemas.rows,
        schemas.differentials,
      ),
    );
    pages.push(
      schemaPlanPage(
        ctx,
        `${pages.length + 1} / ${total}`,
        opts.plan,
        schemas.rows,
        scan.routes ?? [],
        schemas.marks,
        'uni',
        schemas.multi,
      ),
    );
    pages.push(
      schemaPlanPage(
        ctx,
        `${pages.length + 1} / ${total}`,
        opts.plan,
        schemas.rows,
        scan.routes ?? [],
        schemas.marks,
        'multi',
        schemas.multi,
      ),
    );
  }
  return buildDocument(pages, images);
}

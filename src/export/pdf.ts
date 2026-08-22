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
  empriseDuCoffre,
  massifsTechniques,
  arcDuBattant,
  pivotsDesBattants,
  wallAreaM2,
  wallQuads,
  WALL_T,
  type RoomShape,
  type WallSeg,
} from '../geometry/floorplan';
import {
  diagnosticExistant,
  modulesLibres,
  type TableauExistant,
} from '../geometry/existant';
import {
  echelleElevation,
  echelleNormalisee,
  graduationsRegle,
} from './echelle';
import { ecarterDe } from '../ui/ecarter';
import { dotStep, floorDots, mixHex } from '../geometry/appearance';
import { wallLabel, type DeviceName } from '../geometry/naming';
import {
  FIXTURES,
  FIXTURE_TAG,
  assemblySymbol,
  faceX,
  faceXofT,
  facePoint,
  interiorSide,
  masonryRuns,
  postsOf,
  retourALaCote,
  postsSymbol,
  stackRanks,
  wallFace,
  ENTRAXE,
  PLAQUE,
  SYMBOL_SPAN,
  type Fixture,
  type FixtureKind,
  type SymbolStroke,
} from '../geometry/electrical';
import {
  wallFurniture,
  type Circuit,
  type Differential,
  type MaterialList,
} from '../geometry/nfc15100';
import {
  circuitColor,
  markColor,
  type MultiWireSchema,
  type SchemaRow,
} from '../geometry/schema';
import type { BuyRow, PullRow } from '../geometry/conduits';
import {
  CEILINGS,
  ceilingChain,
  CEILING_SYMBOL,
  lightingLoad,
  linkAnchor,
  linkCurve,
  type CeilingFixture,
} from '../geometry/ceiling';
import { planFrameAngle } from '../geometry/floorplan';
import { assignOpenings } from '../geometry/scene3d';
import { wallRuns } from '../geometry/floorplan';
import {
  ajusterBlocs,
  cutawayOpacity,
  faceDepth,
  buildScene,
  isHiddenFace,
  roomRanks,
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
  /**
   * Les perspectives à imprimer, une par page.
   *
   * Une liste, et non plus une paire : deux vues se partageaient une feuille
   * A4, chacune dans une case du tiers de la page, et sur un logement de
   * quatre pièces on n'y distinguait plus une porte d'une fenêtre. Autant
   * d'angles qu'il en faut pour montrer le logement, chacun en grand.
   */
  views?: View3DParams[];
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
   * Le tableau trouve sur place, en renovation. Sa presence ajoute la
   * feuille « installation existante » ; son absence ne change rien.
   */
  existant?: TableauExistant;
  /**
   * Le plafond, posé SUR le plan d'ensemble : points lumineux, détection,
   * ventilation, leurs cotes aux murs et le lien de commande de chacun.
   * Vide = le plan reste celui du sol.
   */
  ceiling?: CeilingFixture[];
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
   * Toutes les élévations, et pas seulement celles des murs équipés.
   *
   * Réduire le dossier aux murs qui portent quelque chose lui a fait perdre
   * ce qu'un électricien vient parfois y chercher : le mur VU DE FACE, avec
   * ses retours cotés, même sans un seul appareil dessus — c'est le dessin
   * sur lequel on décide où percer AVANT d'avoir rien posé. Les deux usages
   * sont justes ; celui-ci se demande.
   */
  toutesElevations?: boolean;
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
  /**
   * Les repères de circuit à écrire SUR LE PLAN.
   *
   * Ils vivaient dans `schemas`, donc n'existaient qu'avec la feuille de
   * schéma cochée : le plan des gaines sortait muet sur les départs alors
   * que l'app les connaissait. Ils voyagent maintenant à part — la feuille
   * de schéma commande les PAGES, pas ce que le plan sait dire.
   */
  marks?: Map<string, string> | null;
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
  // Les états de transparence de l'écorché : /GA1 = 10 %… /GA9 = 90 %.
  // Déclarés en dur sur toutes les pages — un état qu'une page n'appelle
  // pas ne coûte rien, comme les images.
  const gstates =
    ' /ExtGState << ' +
    Array.from({ length: 9 }, (_, i) => {
      const a = (i + 1) / 10;
      return `/GA${i + 1} << /ca ${a} /CA ${a} >>`;
    }).join(' ') +
    ' >>';
  const contentIds = pageStreams.map((s) =>
    add(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`),
  );
  const pageIds = contentIds.map((cid) =>
    add(
      `<< /Type /Page /Parent @P 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${xobj}${gstates} >> ` +
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

  /** Polyligne à bouts et angles ronds — pleine, quel que soit l'état.
   *  Sans le `[] 0 d`, un trait dessiné après un `poly(…, dashed)` héritait
   *  du motif de tireté resté dans l'état graphique et sortait pointillé. */
  path(pts: Pt[], w: number, hex: string) {
    if (pts.length < 2) return;
    const [r, g, b] = hexRgb(hex);
    this.ops.push(
      `${n2(r)} ${n2(g)} ${n2(b)} RG ${n2(w)} w [] 0 d 1 J 1 j ` +
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
    /**
     * Transparence, par dixièmes (0,1 à 0,9) : l'écorché de la vue 3D.
     * Les états `/GA1`…`/GA9` sont déclarés une fois par `buildDocument` ;
     * en dessous, on encadre l'opérateur de `q … Q` pour que l'état ne
     * contamine pas la suite du flux.
     */
    alpha = 1,
  ) {
    if (pts.length < 3) return;
    const ga = Math.round(Math.min(1, Math.max(0.1, alpha)) * 10);
    let op = ga < 10 ? `q /GA${ga} gs ` : '';
    op += dashed ? '[4 3] 0 d ' : '[] 0 d ';
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
    if (ga < 10) op += ' Q';
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
 * LA LIGNE DE TITRE, EN HAUT DE LA FEUILLE.
 *
 * Elle se calculait depuis le BAS du cadre, en retirant la hauteur du
 * cartouche : le titre se posait donc à quatre-vingt-dix points du bord
 * supérieur, avec un grand vide au-dessus et le dessin collé dessous. Un
 * plan d'exécution titre en haut à gauche, à une marge du bord — c'est
 * là que l'œil va chercher de quoi il s'agit.
 */
const TETE = FRAME.y + FRAME.h - 30;
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
    /** Le denominateur de l echelle : la regle graphique en depend. */
    scaleRatio?: number | null;
    /**
     * L'échelle du dessin en points par mètre : quand elle est là, le
     * cartouche dessine une BARRE D'ÉCHELLE graphique sous le ratio.
     * « ~ 1:75 » ne survit ni à la photocopie ni à « ajuster à la page » ;
     * la barre, elle, se mesure au double-décimètre quel que soit le
     * tirage — c'est pour ça que tous les plans en portent une.
     */
    metersToPoints?: number;
    /** À qui est le dossier : à défaut, on retombe sur le nom du fichier. */
    client?: string;
    address?: string;
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

  /*
    LE BLOC MARQUE, PLUS GRAND.

    Le logo tenait dans trente-huit points au creux d'un cartouche qui en
    fait soixante-six : sur une feuille imprimée, il passait pour une
    vignette de pied de page. C'est pourtant la seule marque du document —
    celle qu'on voit quand le dossier traîne sur un chantier, plié en deux
    sur un établi. Il occupe maintenant cinquante points, et le nom se
    décale d'autant.
  */
  drawLogo(d, FRAME.x + 12, ty + 8, 50);
  d.text('EchoPlan', FRAME.x + 70, ty + 38, 14, INK, { bold: true, align: 'left' });
  d.text('Scan 3D & plans', FRAME.x + 70, ty + 23, 7.5, GREY, { align: 'left' });

  // Bloc projet
  d.text('PROJET', cols[0] + 12, ty + 50, 6.5, GREY_LIGHT, { align: 'left' });
  d.text(fitText(info.project, 10.5, width(0)), cols[0] + 12, ty + 37, 10.5, INK, {
    bold: true,
    align: 'left',
  });
  /**
   * LA SECONDE LIGNE DIT À QUI EST LE DOSSIER.
   *
   * Elle portait le nom du fichier — que le lecteur a déjà sous les yeux,
   * puisqu'il l'a ouvert. Un plan d'exécution porte le nom du client et
   * l'adresse du chantier : c'est ce qu'on cherche sur une pile de plans,
   * et ce qui distingue deux T3 identiques de la même rue. Sans client
   * renseigné, on garde le fichier plutôt qu'une ligne vide.
   */
  const aQui = [info.client, info.address].filter(Boolean).join(' · ');
  d.text(aQui ? 'CLIENT' : 'FICHIER', cols[0] + 12, ty + 24, 6.5, GREY_LIGHT, {
    align: 'left',
  });
  d.text(fitText(aQui || info.filename, 8, width(0)), cols[0] + 12, ty + 12, 8, GREY, {
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
  /*
    LA RÈGLE GRAPHIQUE — la preuve de l'échelle annoncée juste au-dessus.

    Un cartouche qui dit 1:50 se croit sur parole ; une règle se VÉRIFIE, et
    elle survit à la photocopie qui a réduit la feuille — ce qui arrive à
    tous les plans de chantier.

    Ses graduations viennent de `graduationsRegle`, la même règle que celle
    qui sert à choisir l'échelle : deux calculs séparés auraient fini par
    dire deux choses différentes du même dessin.
  */
  if (info.metersToPoints && info.scaleRatio) {
    const r = graduationsRegle(info.scaleRatio, width(1) - 16);
    const bx = cols[1] + 12;
    const by = ty + 3.5;
    const wl = r.longueurPt;
    // Deux moitiés, l'une pleine l'autre vide : le peigne se lit d'un coup
    // d'œil, même mal imprimé.
    d.rect(bx, by, wl / 2, 3, INK, INK, 0.4);
    d.rect(bx + wl / 2, by, wl / 2, 3, '#FFFFFF', INK, 0.4);
    d.text(
      r.total < 1 ? `${Math.round(r.total * 100)} cm` : `${r.total} m`,
      bx + wl + 3,
      by,
      5,
      GREY,
      { align: 'left' },
    );
  }

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
  // Même ordre de calques que dans l'app : pièce par pièce, mur du fond,
  // contenu, mur de devant.
  const rangs = roomRanks(scene.rooms, cam);
  const polys = faces
    .filter((f) => !isHiddenFace(f, cam))
    .map((f) => {
      const pts = f.pts.map(project);
      // Une arête se trie avec le pan qu'elle borde (`depthAt`), et une
      // façade large avec les tuiles qu'elle recouvre : la règle est écrite
      // une fois, dans `scene3d`.
      const depth = faceDepth(f, project, cam, rangs);
      const fill = shadeFill(f, ct, st);
      // Pan sans contour propre : bordé de sa propre couleur, sinon la couture
      // entre deux bandes voisines se voit à l'impression.
      return {
        pts,
        depth,
        fill,
        stroke: f.stroke ?? fill,
        dashed: !!f.dashed,
        // L'écorché de la vue app : un mur qui fait face à l'objectif
        // s'efface, sans quoi le canapé du séjour est invisible sur le
        // papier alors qu'il se voit à l'écran.
        alpha:
          f.cutaway && f.normal ? cutawayOpacity(f.normal, cam) : 1,
        // De quoi départager les faces d'un même meuble à l'écran : le PDF
        // peint dans le même ordre que l'application, sans quoi le dossier
        // d'un canapé s'imprimerait par-dessus son assise.
        proj: pts.map((q) => ({ sx: q.x, sy: q.y, depth: q.depth })),
        owner: f.ownerId,
        room: f.roomId,
        pan: f.panId,
        bord: f.bordDe,
      };
    });
  ajusterBlocs(polys);
  type Item =
    | {
        kind: 'poly';
        depth: number;
        pts: Pt[];
        fill: string | null;
        stroke: string | null;
        dashed?: boolean;
        alpha?: number;
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
    // Par-dessus la maçonnerie, comme les étiquettes de surface : insérée
    // dans le tri de profondeur, une cote se faisait TRANCHER par le mur
    // voisin du coin — « 3,00 m » sortait en « m » orphelin. Une cote est
    // une annotation ; son halo blanc la détache de ce qu'elle survole.
    items.push({
      kind: 'label',
      depth: Infinity,
      x: mid.x,
      y: mid.y + 5,
      text: `${segLength(w).toFixed(2).replace('.', ',')} m`,
    });
  }
  items.sort((p, q) => p.depth - q.depth);
  /** Le halo d'une annotation : un cartouche blanc sous le texte. */
  const halo = (x: number, y: number, size: number, texte: string) => {
    const demiW = (texte.length * size * 0.52) / 2 + 2;
    d.poly(
      [
        { x: x - demiW, y: y - size * 0.25 },
        { x: x + demiW, y: y - size * 0.25 },
        { x: x + demiW, y: y + size * 0.8 },
        { x: x - demiW, y: y + size * 0.8 },
      ],
      '#FFFFFF',
      null,
    );
  };
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
        d.poly(
          item.pts,
          item.fill,
          item.stroke,
          item.dashed ? 1.3 : 0.7,
          item.dashed,
          item.alpha ?? 1,
        );
      }
    } else if (item.kind === 'dot') {
      d.circle(item.x, item.y, 0.55, item.color);
    } else if (item.kind === 'area') {
      halo(item.x, item.y, 9.5, item.text);
      d.text(item.text, item.x, item.y, 9.5, INK, { bold: true });
    } else {
      halo(item.x, item.y, 8, item.text);
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
  /** Client et chantier, pour le cartouche. */
  client?: string;
  address?: string;
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
  /**
   * Repère de circuit par appareil (C1, C2…) : le lien entre le plan et le
   * tableau. L'écran l'écrit sous chaque symbole depuis toujours ; le
   * dossier imprimé le taisait, et celui qui tire les gaines devait
   * deviner de quel départ dépend chaque prise.
   */
  marks?: Map<string, string>;
  colorOpenings: boolean;
  showSurfaces: boolean;
  showTextures: boolean;
  /** Cheminement des gaines, en coordonnées MONDE (`Pt` est ici la page). */
  routes?: { id: string; path: { x: number; z: number }[] }[];
  /**
   * Le PLAFOND, posé sur le plan d'ensemble.
   *
   * Il a eu sa feuille à lui pendant un temps, et c'était une erreur : on
   * ne pose pas un point lumineux sans regarder où tombent les cloisons et
   * les meubles, donc on lisait les deux feuilles côte à côte, en
   * reportant les cotes de l'une sur l'autre. Un plan d'électricien porte
   * le sol ET le plafond — c'est la même pièce.
   */
  ceiling?: CeilingFixture[];
  /** Les mots écrits sur le plan, déjà filtrés à l'étage imprimé. */
  notes?: { id: string; text: string; at: { x: number; z: number } }[];
  /**
   * Le cap du scan : d'où vient le nord, en degrés horaires sur l'axe −Z.
   * `null` = boussole muette (scan ancien, appareil sans magnétomètre) : on
   * ne nomme alors aucun mur, plutôt que d'inventer une orientation.
   */
  north?: number | null;
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

/**
 * OÙ POINTE UN CAP SUR LA FEUILLE.
 *
 * Trois repères se superposent ici, et il suffit d'en retourner un pour
 * imprimer une boussole qui ment : le monde du scan (où le nord se trouve
 * à « moins north » degrés de l'axe −Z, comme dans la vue 3D), la TRAME
 * (le plan est redressé avant projection), et la page (dont l'axe Y monte,
 * alors que le Z du monde descend sur le dessin).
 *
 * Le signe du nord était pris à l'envers : la rose imprimée était le
 * MIROIR de la réalité dès que le scan n'avait pas démarré plein nord —
 * est et ouest échangés — alors que les murs, sur la même feuille,
 * portaient les bons noms (« mur nord », « mur est ») : la feuille se
 * contredisait elle-même. Si l'erreur a tenu si longtemps, c'est qu'à
 * nord = 0 les deux calculs tombent juste ensemble.
 *
 * Le banc d'épreuve vérifie désormais l'accord entre l'aiguille et le nom
 * du mur, sur des dizaines de caps et de trames.
 */
export function northPageDir(
  bearing: number,
  north: number,
  trame: number,
): { x: number; y: number } {
  const a = ((bearing - north) * Math.PI) / 180 - trame;
  return { x: Math.sin(a), y: Math.cos(a) };
}

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
  /*
    UN SCAN SANS MUR LE DIT, il ne sort pas en page blanche.

    Le cas d'un premier utilisateur dont le relevé a échoué : la feuille
    s'imprimait entièrement vide, sans un mot — on dirait un export cassé.
    Le document explique ce qui manque et quoi refaire.
  */
  if (walls.length === 0) {
    d.text(
      extra?.title ?? 'Plan d’ensemble coté',
      FRAME.x + 30,
      TETE,
      13,
      INK,
      { bold: true, align: 'left' },
    );
    d.text('Aucun mur relevé.', PAGE_W / 2, PAGE_H / 2 + 8, 12, INK, {
      bold: true,
    });
    d.text(
      'Reprenez le scan en longeant les murs, l’appareil face à la maçonnerie.',
      PAGE_W / 2,
      PAGE_H / 2 - 8,
      9,
      GREY,
    );
    drawSheetChrome(d, {
      project: name,
      filename,
      client: ctx.client,
      address: ctx.address,
      sheetTitle: extra?.title ?? 'Plan d’ensemble coté',
      sheet,
      scaleLabel: null,
    });
    return d.stream();
  }
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

  /**
   * LE BANDEAU DU TITRE EST RÉSERVÉ, pas partagé.
   *
   * Le titre s'écrivait par-dessus le dessin : sur un logement haut, le
   * plan montait jusqu'en tête de feuille et le barrait de ses murs —
   * « Plan d'implantation » rayé par une cloison. Le dessin s'arrête
   * donc sous le bandeau, et la fenêtre de découpe avec lui : c'est la
   * seule façon d'en être sûr, puisque le zoom vient de l'utilisateur.
   */
  const BANDEAU = 44;
  // Zone de dessin (cotes extérieures comprises)
  /*
    LA LÉGENDE RÉSERVE SA PLACE AVANT LE CADRAGE.

    Posée « au coin le plus vide », elle ne mesurait que l'emprise des
    murs : les chaînes de cotes qui longent les quatre bords ne comptaient
    pas, et sur un logement large elle finissait SUR la chaîne du bas — vu
    sur la feuille du T3, une cote à moitié mangée. Le dessin lui cède donc
    une bande en pied de feuille, et elle s'y pose toujours, à gauche.
  */
  const kindsLegende = extra?.hideLegend
    ? []
    : [...new Set((ctx.fixtures ?? []).map((f) => f.kind))];
  const plafondLegende = extra?.hideLegend
    ? []
    : [...new Set((ctx.ceiling ?? []).map((c) => c.kind))];
  const rangsLegende = Math.max(
    kindsLegende.length > 0 ? kindsLegende.length + 1 : 0,
    plafondLegende.length > 0 ? plafondLegende.length + 2 : 0,
  );
  const legendeW =
    kindsLegende.length > 0 && plafondLegende.length > 0
      ? 300
      : plafondLegende.length > 0
        ? 154
        : 132;
  const legendeH =
    plafondLegende.length > 0
      ? rangsLegende * CADRE_LIGNE + CADRE_MARGE * 2
      : 22 + kindsLegende.length * 15;
  const avecLegende = kindsLegende.length > 0 || plafondLegende.length > 0;
  // 16 pt sous la légende, et 48 pt entre elle et le dessin : la place des
  // chaînes de cotes qui pendent sous le cadre.
  const reserve = avecLegende ? Math.max(0, legendeH + 16 + 48 - 70) : 0;
  /*
    LA MARGE AUTOUR DU DESSIN — et l'effet de seuil qu'elle provoque.

    Relevé du patron, dossier rendu en image à l'appui : « je trouve le plan
    trop petit et illisible, trop de marge blanche non utilisée ». La mesure
    lui donne raison et dit où : un T3 de sept mètres demande 397 points de
    large au cinquantième, la boîte en offrait 395. Il manquait DEUX POINTS
    — sept dixièmes de millimètre — et le cran était refusé : on retombait à
    1:75, un plan une fois et demie plus petit au milieu de cinq centimètres
    de blanc.

    L'échelle normalisée n'y est pour rien et n'a pas bougé : un architecte
    pose son kutch sur le papier. C'était la marge, à soixante-dix points
    de chaque côté — deux centimètres et demi — là où les chaînes de cotes
    et leurs repères en demandent la moitié. Cinquante suffisent, et un cran
    d'échelle se gagne.
  */
  const MARGE = 50;
  const box = {
    x: FRAME.x + MARGE,
    y: FRAME.y + TITLE_H + MARGE + reserve,
    w: FRAME.w - MARGE * 2,
    h: FRAME.h - TITLE_H - MARGE * 2 - BANDEAU - reserve,
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
  let echellePtParM: number | undefined;
  /** Le denominateur choisi : la regle graphique en depend. */
  let echelleRatio: number | null = null;
  if (isFinite(minX)) {
    // Rien du plan ne peut sortir de la feuille : le zoom choisi dans
    // l'aperçu s'applique tel quel, et un plan agrandi allait jusqu'à
    // traverser le cartouche.
    d.save();
    d.clip(
      FRAME.x + 2,
      FRAME.y + TITLE_H + 2,
      FRAME.w - 4,
      FRAME.h - TITLE_H - 4 - BANDEAU,
    );
    /*
      UNE ÉCHELLE VRAIE, PAS UNE MISE À LA FEUILLE.

      Le plan était étiré jusqu'aux bords du cadre et l'échelle DÉDUITE de
      la place occupée : « ~ 1:100 » — le tilde disait la vérité, ce n'était
      l'échelle de rien. Un architecte, un bureau d'études, un économiste de
      la construction posent leur kutch sur le papier : à 1:98,3 toutes
      leurs cotes sont fausses, et le document ne vaut plus que comme
      illustration.

      On choisit donc l'échelle NORMALISÉE la plus grande qui tienne dans le
      cadre, et l'on trace à celle-là exactement. Le plan occupe un peu
      moins de place : c'est le prix, et c'est ainsi que travaille tout le
      monde.

      LE ZOOM DE L'APERÇU CHOISIT L'ÉCHELLE au lieu de la casser : zoomer
      fait passer de 1:100 à 1:75, puis à 1:50 — on reste toujours sur un
      cran de la série.
    */
    const zoom = planView?.zoom ?? 1;
    // Chaque direction impose son échelle ; on garde la plus contraignante,
    // c'est-à-dire le plus grand dénominateur — sinon le plan déborde dans
    // l'autre sens.
    const eLarg = echelleNormalisee(box.w * zoom, maxX - minX);
    const eHaut = echelleNormalisee(box.h * zoom, maxZ - minZ);
    const choisie = eLarg.ratio >= eHaut.ratio ? eLarg : eHaut;
    const scale = choisie.ptParMetre;
    scaleLabel = choisie.label;
    echellePtParM = scale;
    echelleRatio = choisie.ratio;

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

    /*
      LES RECOINS TECHNIQUES, POCHÉS COMME LA MAÇONNERIE — la même encre
      qu'à l'écran. Un vide blanc au milieu d'un plan imprimé se lit comme
      une pièce qu'on aurait oublié de nommer ; c'est du plein.
    */
    for (const contour of massifsTechniques(walls, openings)) {
      d.poly(contour.map(px), INK, null);
    }

    /*
      DE QUEL BOUT CHAQUE PORTE PIVOTE : le même calcul qu'à l'écran, pour
      que deux battants voisins ne se croisent pas sur le papier non plus.
    */
    const pivotsPorte = pivotsDesBattants(
      openings
        .filter((o) => o.type === 'door')
        // Le bord choisi à la main passe avant : le dossier imprime la
        // porte telle qu'elle s'ouvre sur place, pas telle qu'elle arrange
        // le dessin.
        .map((o) => ({ id: o.id, a: o.a, b: o.b, pivot: o.pivot })),
    );

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
      // Une porte qui ouvre vers l'AUTRE pièce — placard, cellier, porte
      // palière : le vantail bascule de l'autre côté du dormant.
      if (o.versExterieur) {
        inx = -inx;
        inz = -inz;
      }

      if (o.type === 'door') {
        // Battant + arc d'ouverture, sur la charnière CHOISIE : deux
        // portes en vis-à-vis se rangent dos à dos plutôt que de croiser
        // leurs quarts de cercle.
        const gond = pivotsPorte.get(o.id) === 'b' ? o.b : o.a;
        const opp = gond === o.a ? o.b : o.a;
        const leafEnd = { x: gond.x + inx * len, z: gond.z + inz * len };
        d.line(px(gond).x, px(gond).y, px(leafEnd).x, px(leafEnd).y, 1.4,
               colorOpenings ? AMBER : GREY);
        /*
          L'ARC DU BATTANT — le calcul commun.

          Il vivait ici recopié, et il portait le même défaut latent que
          l'export CAO : sur certaines orientations, l'écart d'angle passait
          la coupure à ±π et le tracé prenait le chemin long — un tour
          complet qui traverse le mur. Un seul calcul, une seule correction.
        */
        d.path(
          arcDuBattant(gond, opp, { x: inx, z: inz }, len, 10).map(px),
          0.8,
          GREY,
        );
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
      /**
       * UN ENSEMBLE SE DESSINE UNE FOIS, avec tous ses postes.
       *
       * Le papier dessinait un symbole PAR APPAREIL : une double prise
       * sortait en deux symboles distants de 71 mm — deux pixels à
       * l'échelle d'un logement — qui se recouvraient. Sur le mur, c'est
       * pourtant UNE plaque, à deux mécanismes. L'écran le savait depuis
       * longtemps ; le dossier imprimé, non.
       */
      const lots = new Map<string, typeof poses>();
      for (const v of poses) {
        const cle = v.f.group
          ? `g:${v.f.group}:${v.f.wallId}:${v.f.side}`
          : `s:${v.f.id}`;
        const l = lots.get(cle);
        if (l) l.push(v);
        else lots.set(cle, [v]);
      }
      const unites = [...lots.values()].map((membres) => {
        const tri = [...membres].sort((a, b) => a.along - b.along);
        const xs = tri.map((m) => m.along);
        return {
          f: tri[0].f,
          face: tri[0].face,
          // Le symbole se pose au MILIEU de la plaque : c'est ce qu'on
          // voit sur le mur, et ce que l'écran dessine déjà.
          along: (Math.min(...xs) + Math.max(...xs)) / 2,
          postes: tri.flatMap((m) => postsOf(m.f.kind)),
          membres: tri,
        };
      });
      // L'échelonnement compte les PLAQUES, pas les postes : deux appareils
      // d'un même ensemble ne s'écartent pas l'un de l'autre.
      const ranks = stackRanks(
        unites.map((v) => ({
          id: v.f.id,
          wallId: v.f.wallId,
          side: v.f.side,
          x: v.along,
        })),
      );
      /*
        LES LIENS MURAUX D'ABORD — même règle que le plafond : ils passent
        SOUS les symboles, jamais dessus. Et le filet s'ancre LÀ OÙ EST le
        symbole (0,2 + rang × 0,24 du mur) : ancré à 0,16 fixe, il
        s'arrêtait vingt-huit centimètres avant un appareil échelonné.
      */
      const sortie = (g: Fixture) => 0.2 + (ranks.get(g.id) ?? 0) * 0.24;
      /** L'unité qui porte cet appareil : un lien vise une PLAQUE. */
      const uniteDe = (id: string) =>
        unites.find((u) => u.membres.some((m) => m.f.id === id));
      for (const v of unites) {
        for (const cid of v.membres.flatMap((m) => m.f.commands ?? [])) {
          const cible = uniteDe(cid);
          if (!cible || cible === v) continue;
          const de = facePoint(
            v.face,
            Math.max(0, Math.min(v.face.len, v.along)),
            sortie(v.f),
          );
          const vers = facePoint(
            cible.face,
            Math.max(0, Math.min(cible.face.len, cible.along)),
            sortie(cible.f),
          );
          d.dashedPath(
            linkCurve({ x: de.x, z: de.z }, { x: vers.x, z: vers.z }).map(px),
            0.7,
            GREY,
            [1.6, 3],
          );
        }
      }
      for (const { f, face, along, postes, membres } of unites) {
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
        /*
          LE DISQUE PREND LA MESURE DE LA PLAQUE.

          Relu à l'œil sur le document : un rond fait pour un poste laissait
          les symboles d'un ensemble de trois déborder des deux côtés, et
          le fond blanc ne protégeait plus rien. Le rayon suit donc l'empan
          RÉEL du symbole composé — même pas d'entraxe que `postsSymbol`,
          demi-symbole aux extrémités, le tout à l'échelle du dessin.
        */
        const ech = 0.5;
        const pas = (ENTRAXE / PLAQUE) * SYMBOL_SPAN;
        /*
          L'EMPAN DU SYMBOLE — il portait un disque blanc, il ne sert plus
          qu'à poser ce qui l'entoure : le sigle à sa droite, le repère de
          circuit dessous. Même calcul, un dessin de moins.
        */
        const rayon =
          6.5 + ((Math.max(1, postes.length) - 1) * pas * ech) / 2;
        /*
          PLUS DE PASTILLE BLANCHE SOUS LE SYMBOLE — relevé du patron :
          « enlève le bloc blanc derrière les icônes des éléments
          électriques ».

          Elle protégeait le symbole des hachures du mur, et elle perçait le
          mur : une rangée de disques blancs mangeait la maçonnerie qu'on
          est venu lire. Le symbole se pose au nu du mur, du côté de la
          pièce, où le fond est clair de toute façon.
        */

        drawSymbol(d, postsSymbol(postes, f.kind), q.x, q.y, ech, spec.color, 0.9);
        /*
          LE SIGLE CUMULÉ. Le plan reste sobre — seuls les appareils qui se
          distinguent portent un mot (20 A, RJ, TV) —, mais une plaque
          annonce TOUT ce qu'elle porte : « RJ » sous une prise + RJ45,
          « RJ + TV » sous une plaque de communication.
        */
        const tags = [
          ...new Set(postes.map((k) => FIXTURE_TAG[k]).filter(Boolean)),
        ].join(' + ');
        if (tags) {
          // À DROITE DU DISQUE, pas à droite du centre : sur une plaque de
          // trois postes, le sigle tombait en plein sur le dernier symbole.
          d.text(tags, q.x + rayon + 5, q.y + 4, 5.5, spec.color, {
            align: 'left',
          });
        }
        /*
          LE REPÈRE DE CIRCUIT, sous l'appareil — celui-là même qu'on lit à
          l'écran et qu'on retrouve sur le tableau. Le dossier le taisait :
          celui qui tire les gaines devait deviner de quel départ dépend
          chaque prise, alors que l'app le sait.
        */
        const mark = ctx.marks?.get(membres[0].f.id);
        if (mark) {
          // SOUS le disque (l'axe y du PDF monte) : écrit à onze points du
          // centre, il se posait sur les pieds des symboles.
          d.text(mark, q.x, q.y - rayon - 6, 5.5, markColor(mark), {
            bold: true,
          });
        }
      }
    }

    {
      /**
       * LE PLAFOND NE DÉPEND PAS DE L'APPAREILLAGE MURAL.
       *
       * Ce bloc vivait À L'INTÉRIEUR de celui des prises : un logement où
       * l'on avait posé six spots mais pas encore une seule prise sortait
       * avec un plan muet — ni symbole, ni cote, ni lien de commande. C'est
       * l'ordre de travail le plus naturel qui était puni : on équipe
       * souvent le plafond d'abord, pièce par pièce.
       */
      const quadsMur = wallQuads(walls);
      const murParId = new Map(walls.map((w) => [w.id, w]));
      /**
       * LE PLAFOND, SUR LE MÊME PLAN.
       *
       * Il a eu sa feuille à lui, et c'était une erreur : on ne place pas
       * un point lumineux sans voir où tombent les cloisons, les meubles
       * et les commandes murales qui l'allument. On lisait donc les deux
       * feuilles côte à côte en reportant les cotes de l'une sur
       * l'autre. Sol et plafond sont la même pièce : un seul plan.
       */
      const plafond = ctx.ceiling ?? [];
      if (plafond.length > 0) {
        // Les liens d'abord : ils passent SOUS les symboles, jamais dessus.
        for (const cl of plafond) {
          for (const fid of cl.commands ?? []) {
            const f = (ctx.fixtures ?? []).find((x) => x.id === fid);
            const w = f ? murParId.get(f.wallId) : undefined;
            if (!f || !w) continue;
            const face = wallFace(w, quadsMur.get(w.id), f.side);
            const depart = facePoint(face, faceX(face, f.along), 0.16);
            const arrivee = linkAnchor(
              { x: depart.x, z: depart.z },
              cl.at,
              CEILINGS[cl.kind].d * 0.7,
            );
            d.dashedPath(
              linkCurve({ x: depart.x, z: depart.z }, arrivee).map(px),
              0.7,
              GREY,
              [1.6, 3],
            );
          }
        }

        /**
         * LES COTES DE CHAQUE APPAREIL — sans elles, on ne pose pas.
         *
         * Le plan portait les cotes des MURS, et on le croyait complet :
         * il disait où sont les cloisons, jamais où percer le plafond. Un
         * point lumineux ne se place pas à l'œil — on tend un mètre
         * depuis deux murs, et c'est exactement ce que l'écran montre en
         * pointillés bleus quand on le déplace. Les deux cotes partent
         * d'équerre AVEC LA TRAME du logement, comme le dessin lui-même.
         */
        const cosP = Math.cos(trame);
        const sinP = Math.sin(trame);
        const prises: Pt[] = [];
        const libreIci = (p: Pt) =>
          prises.every(
            (q) => Math.abs(q.x - p.x) > 22 || Math.abs(q.y - p.y) > 11,
          );
        for (const cl of plafond) {
          for (const axe of [
            { x: -cosP, z: -sinP },
            { x: sinP, z: -cosP },
          ]) {
            const dist = castToWall(cl.at, axe, walls);
            if (dist === null || dist < 0.02) continue;
            const a = px(cl.at);
            const b = px({
              x: cl.at.x + axe.x * dist,
              z: cl.at.z + axe.z * dist,
            });
            if (!dansLeCadre(a) || !dansLeCadre(b)) continue;
            d.dashedPath([a, b], 0.6, SKY, [2, 3]);
            const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const nx = (b.y - a.y) / l;
            const ny = -(b.x - a.x) / l;
            d.line(b.x - nx * 3, b.y - ny * 3, b.x + nx * 3, b.y + ny * 3, 0.8, SKY);
            // L'étiquette glisse vers le mur tant qu'elle en gêne une autre.
            let t = 0.5;
            let p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
            for (let n = 0; n < 4 && !libreIci(p); n++) {
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

        /**
         * ET LES ÉCARTS D'UNE LIGNE, en chaîne.
         *
         * Deux cotes par spot suffisent à le POSER ; elles ne suffisent pas
         * à poser une LIGNE. Sur le chantier, on tend un cordeau et on
         * perçea intervalles : ce qu'on lit alors, c'est « 68, 150, 150,
         * 150, 68 » — du mur au premier, entre chacun, du dernier au mur.
         * Sans cette chaîne, l'électricien refait la soustraction sous le
         * plafond, le mètre à bout de bras.
         */
        for (const row of new Set(
          plafond.map((cl) => cl.row).filter(Boolean),
        )) {
          const lot = plafond.filter((cl) => cl.row === row);
          const chaine = ceilingChain(lot, walls, trame);
          if (!chaine) continue;
          // Le « Pt » de ce fichier est un point de PAGE (x, y) ; celui de la
          // géométrie est un point du MONDE (x, z). On nomme donc ce qu'on
          // manipule, plutôt que d'emprunter le mauvais type.
          const jalons: ({ x: number; z: number } | null)[] = [
            chaine.bouts[0],
            ...chaine.points,
            chaine.bouts[1],
          ];
          chaine.cotes.forEach((val, i) => {
            const A = jalons[i];
            const B = jalons[i + 1];
            if (val === null || !A || !B) return;
            const a = px(A);
            const b = px(B);
            if (!dansLeCadre(a) || !dansLeCadre(b)) return;
            if (Math.hypot(b.x - a.x, b.y - a.y) < 14) return;
            d.dashedPath([a, b], 0.6, GREY, [2, 2]);
            const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            d.rect(m.x - 9, m.y - 4.5, 18, 9, '#FFFFFFDD', null, 0);
            d.text(`${Math.round(val * 100)}`, m.x, m.y - 2.5, 6.5, INK, {
              bold: true,
            });
          });
        }

        // Puis les appareils, à leur diamètre réel, jamais plus petits
        // que lisibles : un spot de 9 cm ferait deux points au 1:100.
        for (const cl of plafond) {
          const spec = CEILINGS[cl.kind];
          const q = px(cl.at);
          if (!dansLeCadre(q)) continue;
          const r = Math.max(7, Math.min(16, (spec.d / 2) * scale));
          d.circle(q.x, q.y, r + 2, '#FFFFFF');
          drawSymbol(d, CEILING_SYMBOL[cl.kind], q.x, q.y, r / 9, spec.color, 1.1);
          d.text(spec.short, q.x, q.y - r - 8, 6.5, spec.color, { bold: true });
        }
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
      const presents = kindsLegende;
      const vusPlafond = plafondLegende;
      if (presents.length > 0 || vusPlafond.length > 0) {
        const lw = legendeW;
        const lh = legendeH;
        void lw;
        // Dans SA bande, réservée avant le cadrage : plus aucun coin à
        // choisir, plus rien à recouvrir.
        const choisi = { x: FRAME.x + 16, y: FRAME.y + TITLE_H + 16 + lh };
        if (vusPlafond.length === 0) {
          drawElecLegend(d, presents, choisi.x, choisi.y);
        } else {
          const colonnes: LegendSection[][] = [];
          if (presents.length > 0) {
            colonnes.push([
              {
                titre: 'APPAREILLAGE',
                lignes: presents.map((k) => ({
                  texte: FIXTURES[k].label,
                  symbole: { paths: assemblySymbol(k), color: FIXTURES[k].color },
                })),
              },
            ]);
          }
          colonnes.push([
            {
              titre: 'PLAFOND',
              lignes: vusPlafond.map((k) => ({
                texte: CEILINGS[k].label,
                symbole: { paths: CEILING_SYMBOL[k], color: CEILINGS[k].color },
              })),
            },
            { lignes: [{ couleur: GREY, texte: 'Lien de commande' }] },
          ]);
          drawLegendBox(d, choisi.x, choisi.y - lh, lw, colonnes);
        }
      }
    }

    /*
      CE QUI RÉSERVE DÉJÀ SA PLACE SUR LA FEUILLE.

      Les cartouches de pièce posent leur fond blanc — « on réserve la place
      du cartouche », comme sur un plan papier. Les notes viennent APRÈS eux
      et s'en écartent : sans ça, une note posée au milieu d'une pièce
      s'écrit en travers de sa surface, et le lecteur perd les deux.
    */
    const emprises: { x: number; y: number; w: number; h: number }[] = [];

    // Cartouche au centre de chaque pièce : son nom, sa surface. Le texte
    // rétrécit à mesure que les pièces se multiplient et se resserrent.
    if (showSurfaces) {
      const big = parts.length === 1;
      for (const part of parts) {
        if (!part.surface) continue;
        const cp2 = px(part.labelAt);
        const label = roomNames[part.roomId] ?? '';
        const area = `${part.surface.exact ? '' : '≈ '}${fr1(part.surface.area)} m²`;
        /*
          LE CARTOUCHE POSE SON PROPRE FOND.

          « Au large » ne veut pas dire « seul » : la cote d'un refend tombe
          dans la pièce qu'il borde, et elle venait s'écrire en travers de
          « Chambre · 12,0 m² ». Déplacer l'un ou l'autre ne règle qu'un cas
          — le prochain élément qui passe par là recommencerait. Un
          rectangle blanc à la taille du texte règle tous les cas d'un coup,
          et c'est ce que fait un plan papier : on réserve la place du
          cartouche.
        */
        const gros = big ? 14 : 10.5;
        const larg =
          Math.max(latin1(label).length * gros, latin1(area).length * (big ? 11 : 9)) *
            0.52 +
          10;
        // On retient l'emprise : les notes s'en écarteront, sans quoi
        // elles se peignent par-dessus (elles passent en dernier) et le
        // lecteur perd les DEUX informations d'un coup.
        emprises.push({
          x: cp2.x - larg / 2,
          y: cp2.y - (label ? 15 : 16),
          w: larg,
          h: label ? 30 : 32,
        });
        d.rect(
          cp2.x - larg / 2,
          cp2.y - (label ? 15 : 16),
          larg,
          label ? 30 : 32,
          '#FFFFFF',
          null,
        );
        // Nom au-dessus, surface en dessous (l'axe y du PDF monte).
        if (label) {
          d.text(label, cp2.x, cp2.y + 3, gros, INK, { bold: true });
          d.text(area, cp2.x, cp2.y - 9, big ? 11 : 9, GREY);
        } else {
          d.text(area, cp2.x, cp2.y + 4, big ? 15 : 11, INK, { bold: true });
          d.text('surface au sol', cp2.x, cp2.y - 10, 8, GREY);
        }
      }
      /*
        LES MOTS ÉCRITS SUR LE PLAN.

        « Colonne montante ici », « attente TV à confirmer avec le client »,
        « gaine à reprendre » : ce qu'on écrivait au crayon dans la marge du
        relevé papier. Elles n'entrent dans aucun métré et ne pèsent sur
        aucun contrôle — leur seul travail est de passer de celui qui relève
        à celui qui pose, et celui qui pose lit CETTE feuille.

        Elles s'impriment EN DERNIER, par-dessus murs, meubles et appareils :
        une remarque à moitié cachée sous un canapé n'est pas une remarque.
        Et la punaise tombe au point visé, le cartouche à côté — sans quoi il
        couvre exactement ce que la note désigne.
      */
      for (const note of ctx.notes ?? []) {
        const q = px(note.at);
        if (!dansLeCadre(q)) continue;
        const mot = fitText(note.text, 6.5, 150);
        const larg = latin1(mot).length * 6.5 * 0.5 + 10;
        /*
          LA PUNAISE NE BOUGE PAS, LE MOT SI.

          Le point visé porte le sens — « gaine à reprendre » ne veut rien
          dire trois mètres plus loin — mais l'étiquette peut monter ou
          descendre sans rien perdre, et c'est ce qui l'empêche de couvrir
          le cartouche de la pièce.
        */
        const pose = ecarterDe(
          { x: q.x + 5, y: q.y - 5.5, w: larg, h: 11 },
          emprises,
        );
        d.path([q, { x: q.x + 5, y: q.y - 3.5 }, { x: q.x + 5, y: q.y + 3.5 }, q], 0.8, INK);
        // Le filet qui relie la punaise à son étiquette quand elle s'est
        // écartée : sans lui, on ne sait plus quel mot désigne quel point.
        if (Math.abs(pose.y - (q.y - 5.5)) > 0.5) {
          d.line(q.x + 5, q.y, pose.x, pose.y + 5.5, 0.5, GREY);
        }
        d.rect(pose.x, pose.y, larg, 11, '#FFFFFFEE', INK, 0.5);
        d.text(mot, pose.x + 5, pose.y + 3.3, 6.5, INK, { align: 'left' });
        // Une note posée réserve sa place à son tour : deux notes voisines
        // se couvriraient l'une l'autre.
        emprises.push(pose);
      }
    }

    /*
      LE NUMÉRO DE CHAQUE MUR, DANS SON ÉPAISSEUR.

      Une pastille blanche cerclée d'encre, posée sur le poché : elle se
      détache du noir du mur, et son cercle la garde lisible quand le mur
      est trop fin pour la contenir. C'est le repère qui renvoie aux
      feuilles d'élévation — sans lui, une feuille « Séjour, nord » ne
      désigne rien de sûr sur un plan qui compte quatre pans au nord.

      Elle se dessine APRÈS le mobilier et les cotes, AVANT la surcouche de
      schéma : c'est une annotation du plan, pas du schéma.
    */
    {
      const numeros = wallNumbers(ctx);
      for (const w of walls) {
        const n = numeros.get(w.id);
        if (!n) continue;
        const p = px(wallTagAt(w, openings));
        const r = 6.2;
        d.circle(p.x, p.y, r + 0.9, INK);
        d.circle(p.x, p.y, r, '#FFFFFF');
        d.text(String(n), p.x, p.y - 2.4, 7, INK, { bold: true });
      }
    }

    // La surcouche vient EN DERNIER, dans la même fenêtre de découpe : un
    // schéma se lit par-dessus le plan, jamais dessous.
    if (extra?.overlay) extra.overlay(d, px, scale, box);

    d.restore();
  }

  /**
   * Et il y a TOUJOURS un titre.
   *
   * La première feuille n'en portait pas : le dossier s'ouvrait sur un
   * dessin sans nom, et il fallait descendre au cartouche pour savoir ce
   * qu'on regardait. Toutes les autres en ont un ; celle-là aussi
   * désormais, et le sous-titre dit ce qu'elle contient vraiment.
   */
  const titre = extra?.title ?? 'Plan d\u2019ensemble cot\u00e9';
  /*
    LA SURFACE TOTALE, EN CLAIR SOUS LE TITRE \u2014 tout plan r\u00e9el l'\u00e9crit.

    C'est le premier chiffre qu'on cherche sur un plan de logement, et il
    fallait aller l'additionner soi-m\u00eame sur le m\u00e9tr\u00e9. \u00ab \u2248 \u00bb d\u00e8s qu'une
    pi\u00e8ce n'est pas relev\u00e9e en boucle ferm\u00e9e, comme partout ailleurs.
  */
  const surfaces = parts.filter((p) => p.surface);
  const totalM2 = surfaces.reduce((t, p) => t + (p.surface?.area ?? 0), 0);
  const exact = surfaces.every((p) => p.surface?.exact);
  const mentionSurface =
    totalM2 > 0
      ? ` \u00b7 Surface relev\u00e9e : ${exact ? '' : '\u2248 '}${totalM2
          .toFixed(1)
          .replace('.', ',')} m\u00b2`
      : '';
  const sous =
    (extra?.sub ??
      (ctx.ceiling && ctx.ceiling.length > 0
        ? 'Murs, ouvertures et surfaces, avec l\u2019appareillage et le plafond \u2014 ' +
          'cotes en m\u00e8tres, cotes d\u2019appareil en centim\u00e8tres.'
        : 'Murs, ouvertures et surfaces relev\u00e9s au scan \u2014 cotes en m\u00e8tres.')) +
    (extra?.sub ? '' : mentionSurface);
  d.text(titre, FRAME.x + 24, TETE, 13, INK, {
    bold: true,
    align: 'left',
  });
  d.text(sous, FRAME.x + 24, TETE - 14, 8, GREY, {
    align: 'left',
  });

  /**
   * LA ROSE DES VENTS — pour dire DE QUEL MUR on parle.
   *
   * « Le mur de gauche » ne veut rien dire une fois la feuille retournée,
   * et un identifiant de mur encore moins. Le nord, lui, se vérifie sur
   * place avec n'importe quel téléphone : c'est la seule désignation qui
   * traverse le chantier. Elle est relevée au magnétomètre pendant le
   * scan, et tourne avec la trame du plan comme le dessin lui-même.
   */
  if (ctx.north !== null && ctx.north !== undefined) {
    const cx = FRAME.x + FRAME.w - 44;
    const cy = TETE - 12;
    const nord = ctx.north;
    const dir = (deg: number) => northPageDir(deg, nord, planFrameAngle(walls));
    d.circle(cx, cy, 17, '#FFFFFF');
    d.poly(
      [
        { x: cx + dir(0).x * 15, y: cy + dir(0).y * 15 },
        { x: cx + dir(120).x * 5, y: cy + dir(120).y * 5 },
        { x: cx + dir(240).x * 5, y: cy + dir(240).y * 5 },
      ],
      '#C4453B',
      null,
    );
    for (const [lettre, deg] of [
      ['N', 0],
      ['E', 90],
      ['S', 180],
      ['O', 270],
    ] as [string, number][]) {
      const p = dir(deg);
      d.text(
        lettre,
        cx + p.x * 22,
        cy + p.y * 22 - 2.5,
        lettre === 'N' ? 7.5 : 6.5,
        lettre === 'N' ? INK : GREY_LIGHT,
        { bold: true },
      );
    }
  }

  drawSheetChrome(d, {
    project: name,
    filename,
    client: ctx.client,
    address: ctx.address,
    sheetTitle: titre,
    sheet,
    scaleLabel,
    scaleRatio: echelleRatio,
    metersToPoints: echellePtParM,
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
  /**
   * UNE COLONNE POUR L'ÉCLAIRAGE.
   *
   * Le bilan par pièce — combien de points lumineux, quelle puissance —
   * était calculé depuis des semaines et n'allait nulle part. C'est
   * pourtant ce qu'on additionne pour dimensionner un départ d'éclairage :
   * la norme borne le NOMBRE de points par circuit, le chiffrage borne la
   * puissance. La colonne reste vide tant qu'aucun plafond n'est équipé.
   */
  const eclairage = lightingLoad(ctx.ceiling ?? []);
  const avecEclairage = (ctx.ceiling?.length ?? 0) > 0;
  // Colonnes : nom, cotes, sol, périmètre, hauteur, murs nets, éclairage.
  const cols = avecEclairage
    ? [0, 0.26, 0.42, 0.55, 0.66, 0.76, 0.88].map((f) => x0 + f * w)
    : [0, 0.28, 0.46, 0.6, 0.73, 0.85].map((f) => x0 + f * w);
  const heads = [
    'Pièce',
    'Cotes (m)',
    'Sol (m²)',
    'Périm. (m)',
    'H. (m)',
    'Murs (m²)',
    ...(avecEclairage ? ['Éclairage'] : []),
  ];
  let y = TETE - 22;

  d.text('Métré par pièce', x0, y + 24, 13, INK, { bold: true, align: 'left' });
  for (let i = 0; i < heads.length; i++) {
    d.text(heads[i], cols[i], y, 8.5, GREY, { align: 'left' });
  }
  y -= 6;
  d.line(x0, y, x0 + w, y, 0.8, INK);

  // Rien de relevé : le tableau le dit, plutôt que d'aligner des zéros.
  if (parts.length === 0) {
    y -= 24;
    d.text('Aucune pièce relevée pour l’instant.', x0, y, 10, GREY, {
      align: 'left',
    });
  }
  let totalArea2 = 0;
  let totalWalls = 0;
  let totalPoints = 0;
  let totalWatts = 0;
  for (const part of parts) {
    if (y < FRAME.y + 90) break;
    y -= 20;
    // Jamais l'identifiant interne sur un document client : une pièce
    // sans nom prend son rang, comme partout ailleurs dans l'app.
    const name =
      ctx.roomNames[part.roomId] || `Pièce ${parts.indexOf(part) + 1}`;
    const ext = part.surface
      ? roomExtent(part.surface.pts)
      : { width: 0, depth: 0 };
    const perim = part.walls.reduce((s, x) => s + segLength(x), 0);
    const h = roomHeight(part.walls);
    const nets = wallAreaM2(part.walls, ctx.openings);
    totalArea2 += part.surface?.area ?? 0;
    totalWalls += nets;
    totalPoints += eclairage.get(part.roomId)?.points ?? 0;
    totalWatts += eclairage.get(part.roomId)?.watts ?? 0;
    const lum = eclairage.get(part.roomId);
    const cells = [
      fitText(name, 10, cols[1] - cols[0] - 6),
      `${frLen(ext.width)} × ${frLen(ext.depth)}`,
      part.surface ? `${part.surface.exact ? '' : '≈ '}${fr1(part.surface.area)}` : '—',
      fr1(perim),
      frLen(h),
      fr1(nets),
      ...(avecEclairage
        ? [lum && lum.points > 0 ? `${lum.points} pts · ${lum.watts} W` : '—']
        : []),
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
  if (avecEclairage && totalPoints > 0) {
    d.text(`${totalPoints} pts · ${totalWatts} W`, cols[6], y, 10, INK, {
      align: 'left',
      bold: true,
    });
  }

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
    client: ctx.client,
    address: ctx.address,
    sheetTitle: 'Métré par pièce',
    sheet,
    scaleLabel: null,
  });
  return d.stream();
}

/**
 * L'INSTALLATION EXISTANTE — ce qu'on a trouvé, et ce qu'il faut reprendre.
 *
 * C'est la feuille que le client garde et relit : le tableau tel qu'il est
 * aujourd'hui, puis les constats, du plus grave au moins pressant. Chaque
 * remède est écrit pour devenir une ligne de devis — c'est la même phrase
 * qu'on lui dira au téléphone.
 *
 * Elle ne s'imprime QUE si un tableau a été relevé : un chantier neuf n'a
 * rien à dire de l'existant, et une page vide dans un dossier remis au
 * client donne l'impression d'un travail bâclé.
 */
function existantPage(
  ctx: SheetContext,
  sheet: string,
  tableau: TableauExistant,
): string {
  const d = new Draw();
  const x0 = FRAME.x + 24;
  const w = FRAME.w - 48;
  let y = TETE - 22;

  const constats = diagnosticExistant(
    tableau.departs,
    tableau.rangees && tableau.parRangee
      ? { rangees: tableau.rangees, parRangee: tableau.parRangee }
      : undefined,
  );

  d.text('Installation existante', x0, y + 24, 13, INK, {
    bold: true,
    align: 'left',
  });

  /* ------------------------------------------------ le tableau tel quel */
  const cols = [0, 0.34, 0.5, 0.72].map((f) => x0 + f * w);
  ['Module', 'Calibre', 'Protège', 'Sous'].forEach((t, i) => {
    d.text(t, cols[i], y, 8.5, GREY, { align: 'left' });
  });
  y -= 6;
  d.line(x0, y, x0 + w, y, 0.8, INK);

  /* Les différentiels sont numérotés D1, D2… : c'est ainsi qu'on renvoie
     chaque départ au sien, sans redessiner un unifilaire. */
  const rang = new Map(
    tableau.departs
      .filter((x) => x.organe === 'differentiel')
      .map((x, i) => [x.id, `D${i + 1}`]),
  );
  for (const dep of tableau.departs) {
    y -= 17;
    if (y < FRAME.y + 90) break;
    const nom =
      dep.organe === 'differentiel'
        ? `${rang.get(dep.id) ?? 'D'} — Différentiel ${dep.sensibilite ?? 30} mA${
            dep.typeDiff ? ` type ${dep.typeDiff}` : ''
          }`
        : dep.organe === 'fusible'
          ? 'Porte-fusible'
          : dep.organe === 'agcp'
            ? 'Disjoncteur d’abonné'
            : 'Disjoncteur';
    d.text(nom, cols[0], y, 9.5, INK, { align: 'left' });
    d.text(dep.calibre ? `${dep.calibre} A` : '—', cols[1], y, 9.5, INK, {
      align: 'left',
    });
    d.text(dep.usage || '—', cols[2], y, 9.5, GREY, { align: 'left' });
    d.text(
      dep.sousDifferentiel ? (rang.get(dep.sousDifferentiel) ?? '—') : '—',
      cols[3],
      y,
      9.5,
      GREY,
      { align: 'left' },
    );
  }

  if (tableau.rangees && tableau.parRangee) {
    y -= 20;
    const places = tableau.rangees * tableau.parRangee;
    d.text(
      `Tableau : ${tableau.rangees} rangée(s) de ${tableau.parRangee} — ` +
        `${modulesLibres(
          tableau.departs,
          tableau.rangees,
          tableau.parRangee,
        )} module(s) libre(s) sur ${places}.`,
      x0,
      y,
      9.5,
      GREY,
      { align: 'left' },
    );
  }

  /* --------------------------------------------- ce qu'il faut reprendre */
  y -= 30;
  d.text('Ce qu’il faut reprendre', x0, y, 12, INK, {
    bold: true,
    align: 'left',
  });
  y -= 8;
  d.line(x0, y, x0 + w, y, 0.8, INK);

  for (const k of constats) {
    if (y < FRAME.y + 80) break;
    y -= 20;
    const mot =
      k.gravite === 'danger'
        ? 'DANGER'
        : k.gravite === 'ecart'
          ? 'ÉCART'
          : 'À VÉRIFIER';
    d.text(mot, x0, y, 8, k.gravite === 'danger' ? '#C0392B' : GREY, {
      bold: true,
      align: 'left',
    });
    d.text(k.titre, x0 + 62, y, 10, INK, { bold: true, align: 'left' });
    y -= 13;
    for (const ligne of wrapText(k.detail, 9, w - 62)) {
      d.text(ligne, x0 + 62, y, 9, GREY, { align: 'left' });
      y -= 11;
    }
    /* La fleche ne survit pas au jeu de caracteres du PDF : elle sortait
       en « -> ». Un mot le dit mieux, et c'est celui qu'on emploie devant
       le client. */
    d.text(`À faire : ${k.remede}`, x0 + 62, y, 9, INK, { align: 'left' });
    y -= 4;
  }

  drawSheetChrome(d, {
    project: ctx.name,
    filename: ctx.filename,
    client: ctx.client,
    address: ctx.address,
    sheetTitle: 'Installation existante',
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

function unifilairePage(
  ctx: SheetContext,
  sheet: string,
  rows: SchemaRow[],
  diffs: Differential[],
  /**
   * CE QUE CHAQUE DÉPART DESSERT, NOMMÉ.
   *
   * « Prises 1 · C3 » ne se lit qu'avec le plan à côté et un doigt
   * dessus. Un vrai schéma nomme : « Séjour, mur nord — Prise plinthe 1,
   * Prise plinthe 2 ». Trois informations, et on trouve l'appareil sans
   * rien ouvrir d'autre. Vide (pas de boussole, pas de pièces nommées) :
   * on retombe sur le résumé d'avant.
   */
  detail?: Map<string, string>,
): string {
  const d = new Draw();
  const x0 = FRAME.x + 30;
  const w = FRAME.w - 60;
  let y = TETE - 22;

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
    y - 12,
    7.5,
    GREY,
    { align: 'left' },
  );
  // Deux mentions qu'un schéma réel porte toujours : la coupure d'urgence
  // (c'est l'AGCP, encore faut-il le dire) et le parafoudre, que l'app ne
  // peut pas trancher — il dépend de la commune et du branchement.
  d.text(
    'Coupure d’urgence assurée par l’AGCP, à garder accessible · parafoudre selon exposition, à vérifier.',
    BUS + 42,
    y - 22,
    6.5,
    GREY_LIGHT,
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
    // L'oblique au MILIEU du segment, le chiffre à son épaule : posé au bout,
    // le chiffre tombait sous le disque blanc de la pastille de repère,
    // dessinée après lui — la légende promettait un chiffre invisible.
    const oblique = (DISJ + 16 + finTrait) / 2;
    d.line(oblique - 4, cy - 5, oblique + 4, cy + 5, 0.9, INK);
    d.text(`${r.wires}`, oblique + 7, cy + 4, 7, GREY);
    // Le repère, à sa teinte de circuit : la même que sur le plan.
    markerAt(d, { x: NOM - 14, y: cy }, r.mark, teinte);
    // Le libellé dispose de toute la place jusqu'à la colonne de droite.
    const largeurNom = CABLE - NOM - 96;
    d.text(fitText(r.label, 8, largeurNom), NOM, cy - 3, 8, INK, {
      align: 'left',
    });
    const dessert = detail?.get(r.mark) || r.points;
    if (dessert) {
      // Toute la largeur : la colonne de droite est vide à cette hauteur,
      // et « Applique murale 1 » sortait en « Ap… » avec de la place libre.
      d.text(fitText(dessert, 6.5, CABLE - NOM), NOM, cy - 12, 6.5, GREY_LIGHT, {
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
    client: ctx.client,
    address: ctx.address,
    sheetTitle: 'Schéma unifilaire',
    sheet,
    scaleLabel: null,
  });
  return d.stream();
}

/**
 * LA FEUILLE MULTIFILAIRE — le câblage, un trait par conducteur.
 *
 * `multiWire` était calculé à chaque export puis JETÉ : aucune feuille ne le
 * dessinait, alors que le README promet le schéma de câblage dans le dossier
 * et que ses couleurs normatives (`WIRE_COLORS`) étaient prêtes et testées.
 * Un bloc par circuit : le repère à sa teinte de plan, puis chaque
 * conducteur en trait plein à sa couleur, nommé en clair — et la note qui
 * dit le principe quand le câblage dépend du chantier (va-et-vient,
 * courants faibles).
 */
function multifilairePage(
  ctx: SheetContext,
  sheet: string,
  multi: MultiWireSchema[],
  rows: SchemaRow[],
): string {
  const d = new Draw();
  const x0 = FRAME.x + 30;
  const w = FRAME.w - 60;
  let y = TETE - 22;

  d.text('Schéma multifilaire', x0, y + 22, 13, INK, { bold: true, align: 'left' });
  d.text(
    'Un trait par conducteur, aux couleurs de la norme. Le câblage exact se choisit sur place.',
    x0,
    y + 8,
    8,
    GREY,
    { align: 'left' },
  );
  y -= 8;

  const BAS = FRAME.y + TITLE_H + 30;
  const FIL_H = 10;
  // La même teinte de repère que sur le plan et l'unifilaire : l'ordre du
  // tableau fait la roue des couleurs, ici comme là-bas.
  const ordre = new Map(rows.map((r, i) => [r.mark, i]));
  // Les libellés à gauche, les traits à droite : la colonne des traits
  // commence après le plus long libellé de conducteur.
  const DEBUT_TRAIT = x0 + 168;
  let restants = 0;

  for (const m of multi) {
    const noteLignes = m.note ? wrapText(m.note, 7.5, w - 26) : [];
    const h = 22 + m.wires.length * FIL_H + noteLignes.length * 10 + 12;
    if (y - h < BAS) {
      restants += 1;
      continue;
    }
    const teinte = circuitColor(ordre.get(m.mark) ?? 0);
    markerAt(d, { x: x0 + 10, y: y - 8 }, m.mark, teinte);
    d.text(m.label, x0 + 26, y - 11, 9, INK, { bold: true, align: 'left' });
    if (m.devices.length > 0) {
      d.text(
        `${m.devices.length} appareil${m.devices.length > 1 ? 's' : ''}`,
        x0 + w,
        y - 11,
        7.5,
        GREY_LIGHT,
        { align: 'right' },
      );
    }
    y -= 24;
    for (const fil of m.wires) {
      d.text(fil.label, x0 + 26, y - 2, 6.5, fil.color, { align: 'left' });
      d.line(DEBUT_TRAIT, y, x0 + w, y, 1.4, fil.color);
      // La terre est BICOLORE sur le chantier : un tireté jaune court sur
      // le vert — c'est à cette livrée qu'on la reconnaît d'un coup d'œil.
      if (fil.role === 'terre') {
        d.dashedPath(
          [
            { x: DEBUT_TRAIT, y },
            { x: x0 + w, y },
          ],
          0.7,
          '#E7C51B',
          [4, 4],
        );
      }
      y -= FIL_H;
    }
    for (const l of noteLignes) {
      d.text(l, x0 + 26, y - 2, 7.5, GREY, { align: 'left' });
      y -= 10;
    }
    y -= 12;
  }

  if (restants > 0) {
    y -= 4;
    d.text(
      `${restants} circuit${restants > 1 ? 's' : ''} de plus — même câblage ` +
        'type, sections et calibres sur l’unifilaire.',
      x0,
      y,
      7.5,
      GREY,
      { align: 'left' },
    );
  }

  drawSheetChrome(d, {
    project: ctx.name,
    filename: ctx.filename,
    client: ctx.client,
    address: ctx.address,
    sheetTitle: 'Schéma multifilaire',
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
  cliches: { im: PdfImage; along?: number }[],
): string {
  const d = new Draw();
  const walls = ctx.walls;
  const rooms = ctx.rooms ?? [];
  const side = interiorSide(wall, walls, rooms);
  const face = wallFace(wall, wallQuads(walls).get(wall.id), side);
  const H = wall.height;
  const mine = (ctx.fixtures ?? []).filter((f) => f.wallId === wall.id);
  /* Ce qui est posé sur l'AUTRE face : on ne perce pas dos à dos. */
  const dos = mine.filter((f) => f.side !== side);
  const piece = ctx.roomNames[roomOf(wall) ?? ''] ?? '';
  /**
   * DE QUEL MUR S'AGIT-IL ? Celui du nord, celui de l'est.
   *
   * « Élévation — Chambre » sur quatre feuilles d'affilée ne dit pas
   * laquelle on tient. L'orientation, elle, se vérifie sur place.
   */
  const centre = roomParts(ctx.walls, ctx.rooms).find(
    (p) => p.roomId === roomOf(wall),
  )?.labelAt;
  const cardinal = centre ? wallLabel(wall, centre, ctx.north ?? null) : null;
  // Le numéro du mur, tel qu'il est écrit sur le plan : c'est par lui qu'on
  // retrouve le pan dont parle cette feuille.
  const numero = wallNumbers(ctx).get(wall.id);
  // Nom de pièce et cardinal, sans bégayer : une pièce sans nom donnait
  // « mur, mur nord-est » — le cardinal commence déjà par « mur », le
  // bouche-trou ne sert que s'il n'y a ni l'un ni l'autre.
  const quoi = [piece, cardinal].filter(Boolean).join(', ') || 'mur';

  // ------------------------------------------------------------- cadre
  const hautTitre = TETE;
  d.text(
    `Élévation — ${numero ? `Mur ${numero} · ` : ''}${quoi}`,
    FRAME.x + 30,
    hautTitre,
    13,
    INK,
    { bold: true, align: 'left' },
  );
  const poses0 = mine.length - dos.length;
  d.text(
    `Mur de ${face.len.toFixed(2).replace('.', ',')} m sous ` +
      `${H.toFixed(2).replace('.', ',')} m · ` +
      `${poses0} appareil${poses0 > 1 ? 's' : ''} · cotes en cm ` +
      'depuis le nu du mur et depuis le sol.' +
      // La légende n'existe que s'il y a quelque chose à expliquer : on
      // ne commente pas ce qui n'est pas dessiné.
      (dos.length > 0
        ? ` En clair : ${dos.length} appareil${
            dos.length > 1 ? 's' : ''
          } de l’autre face.`
        : ''),
    FRAME.x + 30,
    hautTitre - 14,
    8,
    GREY,
    { align: 'left' },
  );

  // Les photos prennent le bas de la feuille ; sans elles, le dessin descend.
  const BAS = FRAME.y + TITLE_H + 34;
  const hautPhoto = cliches.length > 0 ? BAS + 190 : BAS;
  // Le dessin s'arrête SOUS le sous-titre, cote de longueur comprise : la
  // cote du haut dépasse le mur de 22 points, et c'est elle qui venait
  // barrer la ligne « Mur de 2,32 m sous 2,51 m ».
  /*
    LA MARGE LATÉRALE — et le cran d'échelle qu'elle décide.

    Cinquante-deux points de chaque côté laissaient 431 points au dessin.
    Un mur courant de 3,86 m demande 438 points au vingt-cinquième : il
    manquait sept points, le cran était refusé, et le mur sortait DEUX FOIS
    plus petit. Le même effet de seuil que sur le plan d'ensemble — relevé
    du patron : « trop petit et illisible, trop de marge blanche ».

    Quarante suffisent : la cote de longueur et ses attaches débordent de
    douze points, les repères de bord d'autant.
  */
  const MARGE_ELEV = 40;
  const zone = {
    x: FRAME.x + MARGE_ELEV,
    y: hautPhoto + 46,
    w: FRAME.w - MARGE_ELEV * 2,
    h: hautTitre - 62 - (hautPhoto + 46),
  };
  /*
    L'ÉCHELLE VRAIE, ICI AUSSI.

    Le dessin était mis à la feuille et l'échelle DÉDUITE de la place
    occupée, puis arrondie au cartouche : « 1:25 » sans tilde pour un tracé
    à 1:25,4. C'est la feuille qu'on tient devant le mur, la perceuse dans
    l'autre main, et sur laquelle on reporte une cote au kutch — un pour
    cent et demi sur deux mètres cinquante, ce sont quatre centimètres.
  */
  const echelle = echelleElevation(zone.w, zone.h, face.len, H);
  const scale = echelle.ptParMetre;
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

  const solY = Math.min(...walls.map((w) => w.yCenter - w.height / 2));

  /*
    LES MEUBLES DEVANT LE MUR — ce que l'écran montre depuis toujours, et
    que le papier taisait.

    C'est le plus grave des trois écarts : la feuille imprimée montrait un
    mur LIBRE là où se dresse une bibliothèque. On emporte le dossier, on
    perce, et l'on découvre le caisson. Contre le mur (douze centimètres ou
    moins), la silhouette prend la convention du plan — bleu, trait plein ;
    plus loin, elle reste en creux.
  */
  for (const m of wallFurniture(face, ctx.objects ?? [], solY)) {
    const haut = Math.min(m.top, H);
    const bas = Math.min(m.base, haut);
    const contre = m.ecart <= 0.12;
    const larg = Math.max(2, (m.to - m.from) * scale);
    d.rect(
      px(m.from),
      py(bas),
      larg,
      Math.max(1, (haut - bas) * scale),
      contre ? '#EDF3FF' : '#F2F4F7',
      contre ? '#2F6BFF' : GREY_LIGHT,
      contre ? 1.1 : 0.7,
    );
    if (larg > 46) {
      d.text(
        `${frCategory(m.category)} ${Math.round(m.top * 100)}`,
        px((m.from + m.to) / 2),
        py(haut) - 11,
        7,
        GREY,
      );
    }
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
    /*
      LE COFFRE DE VOLET, au-dessus de sa baie — la zone où l'on ne perce
      pas. Le scan ne le voit pas ; déclaré à la main, il s'imprime comme
      il s'affiche : hachuré, ambre, coté.
    */
    const coffre = empriseDuCoffre(t.seg, gx);
    if (coffre) {
      const hc = (coffre.y1 - coffre.y0) * scale;
      d.rect(
        px(coffre.x0),
        py(coffre.y0),
        (coffre.x1 - coffre.x0) * scale,
        hc,
        '#FDF3E2',
        AMBER,
        1,
      );
      if (larg * scale > 60 && hc > 9) {
        d.text(
          `COFFRE ${Math.round((t.seg.coffre ?? 0) * 100)}`,
          px(coffre.x0 + (coffre.x1 - coffre.x0) / 2),
          py(coffre.y0) + hc / 2 - 2.5,
          6.5,
          AMBER,
          { bold: true },
        );
      }
    }
    if (larg * scale > 40) {
      d.text(
        t.seg.type === 'window' ? 'Fenêtre' : t.seg.open ? 'Passage' : 'Porte',
        px(gx + larg / 2),
        // Au-dessus du COFFRE quand il y en a un : posé sur le linteau, le
        // nom de la baie tombait en plein dans le bandeau ambre.
        py(t.y1 + (t.seg.coffre ?? 0)) + 5,
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
      /*
        L'ALLÈGE, COTÉE DU SOL AU REPOS DE LA BAIE.

        « 120 × 110 » dit la taille de la fenêtre, pas où elle commence —
        c'est pourtant la hauteur d'allège qui décide d'une prise sous
        fenêtre ou d'un convecteur, et il fallait la mesurer à la règle.
        Sur le jambage gauche, pour laisser le centre à l'étiquette de
        taille ; rien pour une porte, son allège est le sol.
      */
      if (t.y0 > 0.02) {
        const xa2 = px(gx) + 8;
        d.line(xa2, py(0), xa2, py(t.y0), 0.6, SKY);
        for (const yTick of [0, t.y0]) {
          d.line(xa2 - 3, py(yTick), xa2 + 3, py(yTick), 1, SKY);
        }
        const ym = (py(0) + py(t.y0)) / 2;
        d.circle(xa2, ym, 8, '#FFFFFF');
        d.text(`${Math.round(t.y0 * 100)}`, xa2, ym - 2.5, 7, SKY, {
          bold: true,
        });
      }
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
  /*
    LA HAUTEUR SOUS PLAFOND, DEBOUT À DROITE.

    Elle était à gauche, à mi-hauteur du mur — exactement là où les cotes
    d'appareils posent leurs pastilles. Un interrupteur à 1,10 m dans un mur
    de 2,50 m tombe à mi-hauteur : on lisait « 110 » et « 2,50 m » l'un sur
    l'autre. La droite du dessin, elle, est vide — les retours sont en haut,
    la longueur en bas, les hauteurs à gauche.
  */
  d.text(
    `H ${H.toFixed(2).replace('.', ',')} m`,
    px(face.len) + 18,
    py(H / 2),
    8,
    GREY,
    { angle: 90 },
  );

  // ------------------------------------------------------- l'appareillage
  const poses = mine
    .filter((f) => f.side === side)
    .map((f) => ({ f, x: faceX(face, f.along) }))
    .sort((a, b) => a.x - b.x);

  /*
    ET CE QUI EST POSÉ DE L'AUTRE CÔTÉ, en clair.

    Un mur a deux faces, et l'on ne perce pas dos à dos : une prise de la
    chambre tombant au même endroit qu'une prise du séjour, ce sont deux
    boîtes qui se rencontrent dans la cloison. L'écran garde donc les
    appareils de l'autre face en fantôme ; la feuille imprimée les jetait
    purement et simplement.
  */
  for (const f of dos) {
    const x = faceX(face, f.along);
    const pale = mixHex(FIXTURES[f.kind].color, '#FFFFFF', 0.62);
    drawSymbol(d, assemblySymbol(f.kind), px(x), py(f.height), 0.62, pale, 0.8);
  }

  /**
   * LES DISQUES D'ABORD, LES SYMBOLES ENSUITE.
   *
   * Chaque appareil se pose sur un disque blanc pour rester lisible sur une
   * baie. Dessinés appareil par appareil, le disque du second effaçait le
   * symbole du premier : une RJ45 à 3 cm d'une prise, et il ne restait
   * qu'une moitié de dessin. En deux passes, un disque ne peut plus rien
   * recouvrir d'autre que le mur.
   */
  const serre = (x: number, y: number) =>
    poses.some(
      (o) =>
        (o.x !== x || o.f.height !== y) &&
        Math.hypot((o.x - x) * scale, (o.f.height - y) * scale) < 18,
    );
  for (const { f, x } of poses) {
    d.circle(px(x), py(f.height), serre(x, f.height) ? 6 : 9, '#FFFFFF');
  }
  for (const { f, x } of poses) {
    const spec = FIXTURES[f.kind];
    drawSymbol(d, assemblySymbol(f.kind), px(x), py(f.height), 0.62, spec.color, 1);
    const tag = FIXTURE_TAG[f.kind];
    if (!tag) continue;
    // Le sigle va à droite s'il y a la place, au-dessus sinon : à droite
    // d'une prise serrée contre sa voisine, il tombait sur elle.
    const place = !poses.some(
      (o) => o.x > x && (o.x - x) * scale < 34 && Math.abs(o.f.height - f.height) * scale < 16,
    );
    if (place) {
      d.text(tag, px(x) + 12, py(f.height) + 4, 6, spec.color, { align: 'left' });
    } else {
      d.text(tag, px(x), py(f.height) + 14, 6, spec.color);
    }
  }

  /*
    LA PLAQUE COMMUNE D'UN ENSEMBLE — un cadre autour des postes réunis.

    C'est ce qu'on visse, et ça se voit sur le mur : deux mécanismes sous
    une seule plaque, ce n'est pas la même fourniture ni la même boîte que
    deux appareils voisins. L'écran l'encadre ; le papier ne le disait pas,
    et rien ne distinguait un ensemble de deux appareils côte à côte.
  */
  for (const g of new Set(poses.map((p) => p.f.group).filter(Boolean))) {
    const lot = poses.filter((p) => p.f.group === g);
    if (lot.length < 2) continue;
    const xs = lot.map((p) => p.x);
    const ys = lot.map((p) => p.f.height);
    const larg = Math.max(...lot.map((p) => FIXTURES[p.f.kind].w));
    const haut = Math.max(...lot.map((p) => FIXTURES[p.f.kind].h));
    const gx0 = Math.min(...xs) - larg / 2;
    const gx1 = Math.max(...xs) + larg / 2;
    const gy0 = Math.min(...ys) - haut / 2;
    const gy1 = Math.max(...ys) + haut / 2;
    d.rect(
      px(gx0) - 3,
      py(gy0) - 3,
      (gx1 - gx0) * scale + 6,
      (gy1 - gy0) * scale + 6,
      null,
      GREY_LIGHT,
      0.95,
    );
  }

  /**
   * LES HAUTEURS, à gauche, sur autant de colonnes qu'il faut.
   *
   * Deux appareils à 22 et 25 cm écrivaient leurs nombres au même
   * endroit : on lisait « 25 » par-dessus un « 22 » à moitié effacé.
   * Quand deux cotes se touchent, la seconde recule d'une colonne.
   */
  /*
    UNE HAUTEUR, UNE PASTILLE. Trois prises à 25 cm écrivaient « 25 » trois
    fois, en colonnes qui reculaient vers la gauche : l'anti-collision est
    fait pour des hauteurs VOISINES, pas identiques. On regroupe donc au
    centimètre, et le fil de rappel court jusqu'à l'appareil le plus loin.
  */
  const parCote = new Map<number, number>();
  for (const { f, x } of poses) {
    const cm = Math.round(f.height * 100);
    parCote.set(cm, Math.max(parCote.get(cm) ?? -Infinity, x));
  }
  const hauteurs = [...parCote.entries()].sort((a, b) => a[0] - b[0]);
  let hPrec = -Infinity;
  let colonne = 0;
  for (const [cm, xMax] of hauteurs) {
    const y = py(cm / 100);
    colonne = y - hPrec < 12 ? colonne + 1 : 0;
    if (colonne > 2) colonne = 0;
    hPrec = y;
    const lx = px(0) - 22 - colonne * 26;
    d.dashedPath(
      [
        { x: lx + 11, y },
        { x: px(xMax) - 10, y },
      ],
      0.5,
      '#B9C2CE',
      [2, 3],
    );
    d.circle(lx, y, 9, '#FFFFFF');
    d.text(`${cm}`, lx, y - 2.5, 7, INK, { bold: true });
  }

  /**
   * LA CHAÎNE DE COTES DU BAS — des segments, pas des rayons.
   *
   * Chaque appareil traçait sa distance depuis le bord gauche : quatre
   * appareils, quatre traits partant du même point, empilés sur deux rangs
   * et se traversant l'un l'autre — le nombre d'un trait tombait sur le
   * trait du suivant. Un dessinateur cote AUTREMENT : bord → premier
   * appareil → suivant → … → bord. C'est aussi ce qu'on fait au mètre, et
   * plus rien ne se croise.
   */
  const yb = py(0) - 20;
  const bornes = [0, ...poses.map((p) => p.x), face.len];
  for (const { x } of poses) {
    d.dashedPath(
      [
        { x: px(x), y: py(0) },
        { x: px(x), y: yb + 5 },
      ],
      0.5,
      '#B9C2CE',
      [2, 3],
    );
  }
  d.line(px(0), yb, px(face.len), yb, 0.6, GREY);
  for (const b of bornes) d.line(px(b), yb - 4, px(b), yb + 4, 1, GREY);
  let etage = 0;
  for (let i = 0; i < bornes.length - 1; i++) {
    const larg = bornes[i + 1] - bornes[i];
    if (larg < 0.02) continue;
    const m = (bornes[i] + bornes[i + 1]) / 2;
    // Un segment trop étroit pour son nombre l'écrit un cran plus bas,
    // avec un trait de rappel : mieux vaut décaler que superposer.
    const tient = larg * scale > 26;
    etage = tient ? 0 : etage === 0 ? 1 : 0;
    const yv = yb - etage * 13;
    if (!tient) d.line(px(m), yb - 3, px(m), yv + 4, 0.5, '#B9C2CE');
    d.circle(px(m), yv, 9, '#FFFFFF');
    d.text(`${Math.round(larg * 100)}`, px(m), yv - 2.5, 7, GREY, { bold: true });
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
  /*
    PLUSIEURS VIGNETTES, CHACUNE LÉGENDÉE — relevé du patron.

    Le dossier n'en gardait qu'une par mur. Sur un mur percé, le pan de
    gauche et le tableau de droite sont deux chantiers : on photographie
    l'un sans l'autre, et la feuille doit dire lequel on regarde. La
    punaise (`along`) porte cette réponse, et le retour se déduit d'elle.
  */
  if (cliches.length > 0) {
    const marge = 14;
    const hMax = 150;
    // Trois vignettes de front tiennent encore la lecture ; au-delà, elles
    // deviennent des timbres. La bande n'en porte donc pas plus, et la
    // légende dit combien restent à l'app.
    const montrees = cliches.slice(0, 3);
    const reste = cliches.length - montrees.length;
    const wMax = Math.min(
      210,
      (FRAME.w - marge * (montrees.length + 1)) / montrees.length,
    );
    // Toutes à la même hauteur : des vignettes qui dansent d'un cliché à
    // l'autre donnent une bande bancale.
    const hCommune = Math.min(
      hMax,
      ...montrees.map((c) => (c.im.h * wMax) / c.im.w),
    );
    const largeurs = montrees.map((c) =>
      Math.min(wMax, (c.im.w * hCommune) / c.im.h),
    );
    const totale =
      largeurs.reduce((t, w2) => t + w2, 0) + marge * (montrees.length - 1);
    let cx = FRAME.x + (FRAME.w - totale) / 2;
    const pyp = BAS + 14;
    montrees.forEach((c, i) => {
      const pw = largeurs[i];
      d.rect(cx - 3, pyp - 3, pw + 6, hCommune + 6, '#FFFFFF', '#D6DBE3', 0.8);
      d.image(c.im.name, cx, pyp, pw, hCommune);
      /*
        LA LÉGENDE NOMME LE PAN. `retourALaCote` rend 0 pour un mur d'un
        seul tenant : on écrit alors la mention d'autrefois, qui suffit.
      */
      const n =
        c.along === undefined
          ? 0
          : retourALaCote(retours, faceX(face, c.along));
      const legende =
        n > 0
          ? `Retour ${n}`
          : montrees.length > 1
          ? `Photo ${i + 1}`
          : 'Photo de repérage';
      d.text(
        i === montrees.length - 1 && reste > 0
          ? `${legende} · +${reste}`
          : legende,
        cx + pw / 2,
        pyp + hCommune + 9,
        7,
        GREY_LIGHT,
      );
      cx += pw + marge;
    });
  }

  drawSheetChrome(d, {
    project: ctx.name,
    filename: ctx.filename,
    client: ctx.client,
    address: ctx.address,
    sheetTitle: `Élévation — ${quoi}`,
    sheet,
    // Un mètre vaut 2834,6 points à l'échelle 1:1 (72 pt par pouce).
    // Plus d'arrondi : le cartouche dit l'échelle à laquelle on a tracé.
    scaleLabel: echelle.label,
    metersToPoints: scale,
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
/**
 * LES MURS DU DOSSIER, DANS L'ORDRE OÙ ON LES LIT.
 *
 * Pièce par pièce, et dans l'ordre du relevé à l'intérieur de chacune :
 * c'est l'ordre dans lequel on fait le tour d'un logement, et celui des
 * feuilles d'élévation.
 *
 * Les murs de moins de 30 cm en sont écartés — un tableau de fenêtre, un
 * bout de refend : rien qu'on désigne, et rien où poser une pastille.
 */
function wallsInOrder(ctx: SheetContext): WallSeg[] {
  const ordre = new Map((ctx.rooms ?? []).map((r, i) => [r.id, i]));
  return ctx.walls
    .filter((w) => w.type === 'wall' && segLength(w) > 0.3)
    .map((w, i) => ({ w, i, r: ordre.get(roomOf(w) ?? '') ?? 999 }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((e) => e.w);
}

/**
 * LE NUMÉRO DE CHAQUE MUR — le seul repère qui traverse le dossier.
 *
 * Les élévations ne couvrent plus que les murs équipés : « Élévation —
 * Séjour, nord » ne suffit donc plus à retrouver DE QUEL pan il s'agit,
 * puisque rien, sur le plan, ne le désignait. Le numéro fait ce lien, et
 * il est le même partout : sur la pastille du plan, dans le titre de la
 * feuille, dans le renvoi des cotes.
 *
 * Il numérote TOUS les murs, équipés ou non : une numérotation qui sauterait
 * les murs nus renverrait, sur le plan, à des numéros absents des feuilles —
 * et personne ne saurait si le mur 5 manque parce qu'il est nu ou parce que
 * la feuille s'est perdue.
 */
function wallNumbers(ctx: SheetContext): Map<string, number> {
  return new Map(wallsInOrder(ctx).map((w, i) => [w.id, i + 1]));
}

/**
 * Où poser la pastille : au milieu du plus long RETOUR de maçonnerie.
 *
 * Au milieu du mur tout court, elle tombe en plein sur la porte dès que la
 * baie est centrée — c'est-à-dire souvent. Le plus long tronçon plein est
 * toujours du mur, et c'est là qu'il y a la place.
 */
function wallTagAt(w: WallSeg, openings: WallSeg[]): { x: number; z: number } {
  const pleins = wallRuns(w, openings)
    .filter((r) => r.kind === 'mur')
    .sort((a, b) => b.length - a.length);
  const t = pleins.length > 0 ? (pleins[0].t0 + pleins[0].t1) / 2 : 0.5;
  return {
    x: w.a.x + (w.b.x - w.a.x) * t,
    z: w.a.z + (w.b.z - w.a.z) * t,
  };
}

/**
 * LES MURS QUI MÉRITENT UNE FEUILLE : ceux qui portent quelque chose.
 *
 * Quatre murs donnaient quatre feuilles, dont trois annonçaient « Aucun
 * appareil ». On feuillette du vide, et la seule feuille utile se perd au
 * milieu — dans un dossier qu'on ouvre les mains pleines de plâtre, c'est
 * le pire défaut possible.
 *
 * UN MUR PHOTOGRAPHIÉ EN EST UN AUSSI. On ne sort pas l'appareil photo
 * pour rien : un mur qu'on a pris en photo est un mur sur lequel on a
 * quelque chose à dire — un existant à montrer, une contrainte à
 * expliquer. Sa vignette disparaissait purement et simplement du dossier
 * tant qu'aucune prise n'y était posée.
 */
function elevationWalls(
  ctx: SheetContext,
  toutes = false,
  photographies: Set<string> = new Set(),
): WallSeg[] {
  if (toutes) return wallsInOrder(ctx);
  const equipes = new Set((ctx.fixtures ?? []).map((f) => f.wallId));
  return wallsInOrder(ctx).filter(
    (w) => equipes.has(w.id) || photographies.has(w.id),
  );
}

/**
 * UNE SEULE perspective par défaut.
 *
 * Le dossier en portait deux d'office, dos à dos sur la même feuille — la
 * seconde ne montrait souvent que l'envers des mêmes murs. On en imprime
 * une, en grand ; les autres angles s'ajoutent avant l'export, quand ils
 * apportent quelque chose.
 */
const DEFAULT_PDF_VIEWS: View3DParams[] = [
  { theta: -32, tilt: 58, zoom: 1, fx: 0, fy: 0 },
];

/**
 * UNE PERSPECTIVE, TOUTE LA PAGE.
 *
 * Deux vues se partageaient une feuille : chacune tenait dans une case de
 * 290 points, soit le tiers d'un A4. Sur un logement de quatre pièces, on
 * n'y distinguait plus une porte d'une fenêtre — et c'est justement ce
 * qu'un client regarde en premier, avant même de lire une cote.
 *
 * Chaque angle a donc sa page, et le dossier en porte autant qu'on en a
 * réglé avant l'export. Le titre les numérote : « Perspective 2 » désigne
 * quelque chose, « Vues 3D » répété quatre fois ne désigne rien.
 */
function threeDPage(
  ctx: SheetContext,
  sheet: string,
  view: View3DParams,
  showDims = true,
  rang = 1,
  combien = 1,
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
  const titre = combien > 1 ? `Perspective ${rang}` : 'Perspective';
  d.text(titre, FRAME.x + 24, FRAME.y + FRAME.h - 20, 13, INK, {
    bold: true,
    align: 'left',
  });
  d.text(
    `Vue d'ensemble du logement — angle ${Math.round(view.theta)}°, ` +
      `inclinaison ${Math.round(view.tilt)}°.`,
    FRAME.x + 24,
    FRAME.y + FRAME.h - 34,
    8,
    GREY,
    { align: 'left' },
  );
  // Toute la hauteur disponible entre le cartouche et le titre.
  draw3DView(
    d,
    ctx.walls,
    ctx.openings,
    ctx.objects,
    {
      x: FRAME.x + 24,
      y: FRAME.y + TITLE_H + 24,
      w: FRAME.w - 48,
      h: FRAME.h - TITLE_H - 72,
    },
    view,
    opts,
  );

  drawSheetChrome(d, {
    project: ctx.name,
    filename: ctx.filename,
    client: ctx.client,
    address: ctx.address,
    sheetTitle: showDims ? `${titre} cotée` : titre,
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
   * LES MOTS ÉCRITS SUR LE PLAN.
   *
   * Une note qui ne vit qu'à l'écran n'a servi qu'à celui qui l'a écrite —
   * or l'intérêt de ces phrases est justement de passer du relevé à celui
   * qui pose, et celui qui pose lit le PDF sur le chantier. Elles arrivent
   * DÉJÀ FILTRÉES à l'étage imprimé, comme les murs.
   */
  notes?: { id: string; text: string; at: { x: number; z: number } }[];
  /**
   * Cap du scan, pour nommer les murs par leur orientation — et dessiner
   * la rose des vents, DE SÉRIE, sur la seule feuille du plan 2D. Elle a
   * été une option ; le patron a tranché : un dossier qui désigne ses murs
   * par leur cardinal imprime le repère qui permet de le vérifier sur
   * place. Sans cap relevé, ni nom ni rose — on n'invente pas un nord.
   */
  north?: number | null;
  /** À qui est ce dossier : le client, et l'adresse du chantier. */
  client?: string;
  address?: string;
  /**
   * Le nom de chaque appareil : « Prise plinthe 2 », sa pièce, son mur.
   * Calculé par l'écran d'export, qui connaît le placement et la boussole.
   */
  deviceNames?: Map<string, DeviceName>;
  /**
   * Les photos de repérage, en JPEG base64.
   *
   * L'app les garde en fichiers ; le PDF, lui, ne peut embarquer que des
   * octets. C'est donc l'écran d'export qui les relit et les réduit avant
   * de les passer ici — une photo d'appareil pleine résolution pèse
   * quatre mégaoctets, et un dossier de douze murs deviendrait
   * impartageable.
   *
   * PLUSIEURS PAR MUR — relevé du patron. Le dossier n'en gardait qu'une :
   * « deux vignettes de la même cloison n'apprennent rien de plus ». C'est
   * faux dès qu'un mur est percé — le pan de gauche et le tableau de
   * droite sont deux chantiers. `along` dit à quelle cote la punaise est
   * plantée : c'est elle qui nomme le retour sur la feuille.
   */
  photos?: { wallId: string; base64: string; along?: number }[];
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
/**
 * LE TABLEAU, EN IMAGE — la moitié manquante du dossier d'exécution.
 *
 * L'app savait répartir l'appareillage en circuits et proposer la protection
 * de chacun ; elle en donnait la LISTE. Or un tableau ne se monte pas avec
 * une liste : on le monte rangée par rangée, module par module, et ce qu'on
 * cherche sur le chantier c'est « qu'est-ce qui va où ».
 *
 * Le dessin suit la façon dont on l'équipe réellement :
 *
 * - **une rangée par interrupteur différentiel**, lui-même en tête de sa
 *   rangée (deux modules), suivi des disjoncteurs qu'il protège ;
 * - **treize modules par rangée**, la largeur d'un coffret courant. Un
 *   différentiel qui déborde passe à la rangée suivante plutôt que d'être
 *   dessiné hors du coffret ;
 * - **la réserve reste dessinée**, en emplacements vides : la norme demande
 *   20 % de modules libres, et un tableau plein à ras bord est un tableau
 *   qu'on ne pourra pas faire évoluer. On la voit, donc on la compte ;
 * - **les modules sont numérotés**, et la légende dessous dit le circuit, sa
 *   section et son calibre. Un libellé de circuit ne tient pas dans quatorze
 *   points de large ; le numéro, si — c'est d'ailleurs ce qu'on écrit sur
 *   l'étiquette du tableau.
 *
 * Les courants faibles n'y figurent pas : ils ne sont pas protégés par un
 * disjoncteur et rejoignent le coffret de communication, qui est un autre
 * boîtier.
 */
const MODULES_PAR_RANGEE = 13;

export interface BoardModule {
  /** Numéro d'ordre, celui qu'on écrit sur l'étiquette. */
  numero: number;
  /** Ce qui s'écrit dans le module : le calibre, ou « ID ». */
  marque: string;
  /** Largeur en modules : deux pour un différentiel, un pour le reste. */
  largeur: number;
  /** La légende de la ligne, sous le dessin. */
  legende: string;
  differentiel: boolean;
}

export interface BoardRow {
  label: string;
  modules: BoardModule[];
  /** Emplacements laissés libres dans la rangée. */
  libres: number;
}

/**
 * Répartit circuits et différentiels en rangées de treize modules.
 *
 * Exportée : c'est un calcul, pas un dessin, et c'est lui qu'on vérifie.
 */
export function boardRows(list: MaterialList): BoardRow[] {
  const parLabel = new Map(list.circuits.map((c) => [c.label, c]));
  const rows: BoardRow[] = [];
  let numero = 0;
  for (const diff of list.differentials) {
    const proteges = diff.circuits
      .map((l) => parLabel.get(l))
      .filter((c): c is Circuit => !!c);
    // Le différentiel en tête, puis ses disjoncteurs, treize par treize.
    let reste = proteges;
    let premiere = true;
    do {
      const place = MODULES_PAR_RANGEE - (premiere ? 2 : 0);
      const lot = reste.slice(0, place);
      reste = reste.slice(place);
      const modules: BoardModule[] = [];
      if (premiere) {
        numero += 1;
        modules.push({
          numero,
          marque: 'ID',
          largeur: 2,
          legende: `${diff.label} — ${diff.rating} A · 30 mA · type ${diff.type}`,
          differentiel: true,
        });
      }
      for (const c of lot) {
        numero += 1;
        modules.push({
          numero,
          marque: c.breaker === null ? '—' : `${c.breaker}`,
          largeur: 1,
          legende:
            `${c.label} · ${c.breaker} A · ` +
            `${String(c.section).replace('.', ',')} mm²` +
            (c.rooms.length > 0 ? ` (${c.rooms.join(', ')})` : ''),
          differentiel: false,
        });
      }
      const pris = modules.reduce((n, m) => n + m.largeur, 0);
      rows.push({
        label: `${diff.label} · type ${diff.type}`,
        modules,
        libres: Math.max(0, MODULES_PAR_RANGEE - pris),
      });
      premiere = false;
    } while (reste.length > 0);
  }
  return rows;
}

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
  const TOP = TETE - 22;
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
    // Sans valeur à droite, la désignation dispose de TOUTE la ligne :
    // réserver la colonne d'une valeur absente tronquait la liste des
    // circuits d'un différentiel en « Spéciali… », la place libre à côté.
    const dispo = w - (droite ? COL_VAL + 10 : 0) - (o.indent ?? 0);
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
    // L'usage déduit ne se rappelle que s'il apprend quelque chose : pour
    // une pièce non renommée, il EST le nom, et la feuille bégayait
    // « Cuisine … Cuisine · 20,0 m² ».
    const surface = `${room.area.toFixed(1).replace('.', ',')} m²`;
    d.text(
      room.use && room.use !== room.room ? `${room.use} · ${surface}` : surface,
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
  /*
    LE COFFRET, DESSINÉ — puis sa légende.

    On monte un tableau rangée par rangée, module par module : c'est cette
    image-là qu'on cherche sur le chantier, pas une liste. Elle vient donc
    AVANT le tableau des protections, qui reste pour le chiffrage.
  */
  const rangees = boardRows(list);
  if (rangees.length > 0) {
    titre('Tableau électrique');
    // Le coffret prend la LARGEUR DE LA FEUILLE : bridés à vingt points, les
    // modules se serraient dans le quart gauche de la page, illisibles, et
    // les trois quarts restaient blancs.
    const MOD_W = (w - 12) / MODULES_PAR_RANGEE;
    const MOD_H = 30;
    // Deux points d'écart entre rangées, plus la légende de chacune.
    for (const r of rangees) {
      // La rangée et ses légendes ne se coupent jamais en deux pages.
      need(MOD_H + 26 + r.modules.length * 11);
      const x1 = x0 + 6;
      // Le rail : un cadre qui tient les treize emplacements.
      d.rect(
        x1 - 4,
        y - MOD_H - 4,
        MOD_W * MODULES_PAR_RANGEE + 8,
        MOD_H + 8,
        null,
        GREY_LIGHT,
        0.8,
      );
      let mx = x1;
      for (const m of r.modules) {
        const mw = MOD_W * m.largeur;
        d.rect(mx, y - MOD_H, mw - 2, MOD_H, m.differentiel ? '#EEF2FA' : '#FFFFFF', INK, 0.9);
        // Le calibre, gros : c'est ce qu'on lit en levant les yeux.
        d.text(m.marque, mx + (mw - 2) / 2, y - 13, 10.5, INK, {
          bold: true,
          align: 'center',
        });
        // Le numéro d'ordre, en pied de module : celui de l'étiquette.
        d.text(`${m.numero}`, mx + (mw - 2) / 2, y - MOD_H + 5, 7.5, GREY, {
          align: 'center',
        });
        mx += mw;
      }
      // La RÉSERVE, dessinée vide : la norme en demande 20 %, et un tableau
      // plein à ras bord est un tableau qu'on ne fera pas évoluer.
      for (let i = 0; i < r.libres; i++) {
        d.rect(mx, y - MOD_H, MOD_W - 2, MOD_H, null, GREY_LIGHT, 0.6);
        mx += MOD_W;
      }
      y -= MOD_H + 10;
      if (r.libres > 0) {
        d.text(
          `${r.libres} module${r.libres > 1 ? 's' : ''} de réserve`,
          x0 + w,
          y,
          7.5,
          GREY_LIGHT,
          { align: 'right' },
        );
      }
      y -= 10;
      for (const m of r.modules) {
        ligne(`${m.numero} — ${m.legende}`, '', { indent: 10, grey: true });
      }
      y -= 8;
    }
    const vdi = list.circuits.filter((c) => c.nature === 'vdi').length;
    if (vdi > 0) {
      note(
        `   Les courants faibles (${vdi} circuit${vdi > 1 ? 's' : ''}) ne sont ` +
          'pas protégés par un disjoncteur : ils rejoignent le coffret de ' +
          'communication.',
      );
    }
    y -= 6;
  }

  titre(rangees.length > 0 ? 'Protections, circuit par circuit' : 'Tableau électrique');
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
      // Le label porte déjà son type (« Différentiel type A 1 ») : le
      // répéter écrivait « type A … type A » sur chaque ligne. Et la liste
      // des circuits SE REPLIE : sur un T3, elle dépasse la ligne et
      // sortait tronquée en « Spéci… » — ce que protège un différentiel ne
      // se devine pas.
      const texteDiff =
        `${diff.label} — ${diff.rating} A · 30 mA` +
        (diff.circuits.length ? ` : ${diff.circuits.join(', ')}` : '');
      for (const l of wrapText(texteDiff, 10, w - 14)) {
        need(16);
        d.text(l, x0 + 14, y, 10, INK, { align: 'left' });
        y -= 15;
      }
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
      // Quantité zéro = un total, pas un article : la colonne reste vide.
      ligne(row.label, row.quantity > 0 ? `${row.quantity}` : '');
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
/**
 * Ce que chaque circuit dessert, en clair et nommé.
 *
 * Les noms viennent de l'écran d'export, qui seul connaît le placement des
 * appareils dans les pièces et le cap de la boussole. On les regroupe ici
 * par circuit — le repère C1, C2… que porte déjà le plan — en gardant
 * l'ordre du tableau, et groupés par pièce : c'est ainsi qu'on relit un
 * départ, pièce par pièce.
 */
function detailDesDeparts(
  scan: ScanForPdf,
  marks: Map<string, string>,
  rows: SchemaRow[],
): Map<string, string> {
  const noms = scan.deviceNames;
  const out = new Map<string, string>();
  if (!noms || noms.size === 0) return out;
  for (const r of rows) {
    const parPiece = new Map<string, string[]>();
    for (const f of scan.fixtures ?? []) {
      if (marks.get(f.id) !== r.mark) continue;
      const n = noms.get(f.id);
      if (!n) continue;
      const ou = [n.piece, n.mur].filter(Boolean).join(', ');
      parPiece.set(ou, [...(parPiece.get(ou) ?? []), n.nom]);
    }
    const morceaux = [...parPiece.entries()].map(([ou, liste]) =>
      ou ? `${ou} \u2014 ${liste.join(', ')}` : liste.join(', '),
    );
    if (morceaux.length > 0) out.set(r.mark, morceaux.join(' \u00b7 '));
  }
  return out;
}

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
    north: scan.north ?? null,
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
  /* La feuille de l existant : seulement si un tableau a ete releve. */
  const existant = opts.existant?.departs.length ? opts.existant : null;
  // Les schémas ne s'impriment que s'il y a une installation à montrer.
  const schemas = opts.schemas ?? null;
  const withSchema = !!schemas && schemas.rows.length > 0;

  const murs = opts.elevations
    ? elevationWalls(
        ctxTemporaire(scan),
        opts.toutesElevations,
        // Un mur photographié mérite sa feuille : sinon la vignette qu'on
        // est allé chercher sur le chantier n'arrive nulle part.
        new Set((scan.photos ?? []).map((p) => p.wallId)),
      )
    : [];
  /**
   * Les photos, prêtes à être posées : TOUTES celles de chaque mur, dans
   * l'ordre où elles ont été prises.
   *
   * Une photo illisible — fichier tronqué, format inattendu — est
   * simplement laissée de côté : la feuille sort sans elle. Un dossier
   * qui refuse de s'exporter serait bien pire qu'un dossier sans photo.
   */
  const photos = new Map<string, { im: PdfImage; along?: number }[]>();
  const images: PdfImage[] = [];
  (scan.photos ?? []).forEach((p, i) => {
    const im = pdfImage(`Im${i}`, p.base64);
    if (!im) return;
    const lot = photos.get(p.wallId) ?? [];
    lot.push({ im, along: p.along });
    photos.set(p.wallId, lot);
    images.push(im);
  });
  // Trois feuilles : l'unifilaire hors sol, puis les deux schémas sur le
  // plan. Les tracés viennent des mêmes cheminements que le métré.
  // Au moins une perspective quand on en demande : sans réglage, c'est la
  // vue de trois quarts par défaut. Sauf sans le moindre mur — la
  // perspective d'un logement vide est une page blanche, pas une feuille.
  const vues =
    scan.walls.length === 0
      ? []
      : opts.views && opts.views.length > 0
        ? opts.views
        : [...DEFAULT_PDF_VIEWS];
  // Deux feuilles de schéma : l'unifilaire, puis le multifilaire quand il
  // a de la matière (un appelant qui ne fournit pas les conducteurs garde
  // l'unifilaire seul plutôt qu'une page blanche).
  const withMulti = withSchema && (schemas?.multi.length ?? 0) > 0;
  const total =
    1 +
    (withMetre ? 1 : 0) +
    (existant ? 1 : 0) +
    (include3D ? vues.length : 0) +
    murs.length +
    (withSchema ? 1 : 0) +
    (withMulti ? 1 : 0);
  const ctx: SheetContext = {
    name: scan.name,
    filename,
    client: scan.client,
    address: scan.address,
    walls: scan.walls,
    openings: scan.openings,
    objects: scan.objects,
    floors: scan.floors ?? {},
    roomNames: scan.roomNames ?? {},
    rooms: scan.rooms,
    fixtures: scan.fixtures ?? [],
    // Les repères passés à part, ou ceux du schéma quand il est demandé.
    marks: opts.marks ?? schemas?.marks ?? undefined,
    routes: scan.routes,
    ceiling: opts.ceiling ?? [],
    notes: scan.notes,
    north: scan.north ?? null,
    colorOpenings: opts.colorOpenings ?? false,
    showSurfaces: opts.surfaces ?? true,
    showTextures: opts.textures ?? false,
  };
  const pages = [planPage(ctx, `1 / ${total}`, opts.plan, opts.measures2D ?? true)];
  if (withMetre) {
    pages.push(metrePage(ctx, `${pages.length + 1} / ${total}`));
  }
  /*
    L'EXISTANT VIENT JUSTE APRÈS LE MÉTRÉ.

    C'est l'ordre de la visite : voici le logement, voici ce qu'il y a
    dedans aujourd'hui, voici ce qu'on propose. Le client lit le dossier
    dans cet ordre-là, et c'est dans cet ordre qu'on lui en parle.
  */
  if (existant) {
    pages.push(existantPage(ctx, `${pages.length + 1} / ${total}`, existant));
  }
  if (include3D) {
    vues.forEach((v, i) => {
      pages.push(
        threeDPage(
          ctx,
          `${pages.length + 1} / ${total}`,
          v,
          opts.measures3D ?? true,
          i + 1,
          vues.length,
        ),
      );
    });
  }
  // Les élévations viennent après les plans et avant les schémas : on lit
  // le logement, puis chaque mur, puis le tableau.
  for (const w of murs) {
    pages.push(
      elevationPage(
        ctx,
        `${pages.length + 1} / ${total}`,
        w,
        photos.get(w.id) ?? [],
      ),
    );
  }
  if (withSchema && schemas) {
    /**
     * LES SCHÉMAS HORS SOL : unifilaire, puis multifilaire.
     *
     * Le dossier portait aussi les deux mêmes schémas POSÉS SUR LE PLAN,
     * un par mode de tracé. Ils promettaient de montrer où passe chaque
     * départ et ne montraient qu'un écheveau : sur un logement réel, une
     * dizaine de circuits se croisent, et aucun d'eux ne se suit à l'œil.
     * Le cheminement se lit sur le plan des gaines, l'architecture sur
     * l'unifilaire, le câblage sur le multifilaire.
     */
    pages.push(
      unifilairePage(
        ctx,
        `${pages.length + 1} / ${total}`,
        schemas.rows,
        schemas.differentials,
        detailDesDeparts(scan, schemas.marks, schemas.rows),
      ),
    );
    if (withMulti) {
      pages.push(
        multifilairePage(
          ctx,
          `${pages.length + 1} / ${total}`,
          schemas.multi,
          schemas.rows,
        ),
      );
    }
  }
  return buildDocument(pages, images);
}

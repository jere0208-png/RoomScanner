/* eslint-disable no-bitwise -- encodeurs binaires (octets PDF, base64) */
/**
 * Générateur PDF maison (aucune dépendance) — rendu « plan d'architecte » :
 * murs pochés, symboles de portes/fenêtres, lignes de cote extérieures,
 * cadre de feuille et cartouche avec logo EchoPlan. En option, une feuille
 * de vues 3D avec les mesures portées sur les murs.
 * PDF 1.4 non compressé, A4, polices Helvetica (WinAnsi).
 */
import { BLEU_FENETRE, ENCRE_ELEC } from '../ui/encreElec';
import { dansLeBati, pocheDesMurs, SUREPAISSEUR_FACADE } from '../geometry/poche';
import { cotesExterieurs } from '../geometry/cibleMur';
import { CarteDEncre, boiteDuMot } from './encre';
import type { FloorData, ObjectData } from 'react-native-room-scan';
import {
  castToWall,
  clampFootprint,
  hauteurDeLaPiece,
  roomOf,
  roomParts,
  segLength,
  toFootprint,
  empriseDuCoffre,
  massifsTechniques,
  arcDuBattant,
  estTraversante,
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
  type EchelleChoisie,
  echelleNormalisee,
  graduationsRegle,
} from './echelle';
import { type Boite } from '../ui/ecarter';
import { mixHex } from '../geometry/appearance';
import {
  achats as achatsDe,
  baiesDeLaPiece,
  coutDesAchats,
  euros,
  mursNetsDe,
  nombre,
  perimetre as perimetreDe,
  type HypothesesTravaux,
  type PieceTravaux,
  type PrixTravaux,
} from '../geometry/travaux';
import { surfacesHabitables } from '../geometry/habitable';
import type { PlafondDeLaPiece } from '../geometry/fichePiece';
import { wallLabel, type DeviceName } from '../geometry/naming';
import {
  FIXTURES,
  FIXTURE_TAG,
  libelleDuSymbole,
  motDansLeRond,
  USAGES,
  pointDuSymbole,
  porteeVersLeMur,
  assemblySymbol,
  faceX,
  faceXofT,
  facePoint,
  interiorSide,
  pieceDuCote,
  masonryRuns,
  postsOf,
  retourALaCote,
  symboleCompact,
  symbolePose,
  filetJusquAuSymbole,
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
  USE_LABEL,
  wallFurniture,
  type Differential,
  type MaterialList,
  circuitsDuDifferentiel,
} from '../geometry/nfc15100';
import {
  circuitColor,
  markColor,
  type MultiWireSchema,
  type SchemaRow,
} from '../geometry/schema';
import { conduitPour, type BuyRow, type PullRow } from '../geometry/conduits';
import { plaqueDeCote } from '../geometry/cotes';
import { pointDAccroche, zigzag } from '../geometry/ruban';
import {
  CEILINGS,
  ceilingChain,
  CEILING_SYMBOL,
  C_LED,
  lightingLoad,
  linkAnchor,
  linkCurve,
  type CeilingFixture,
} from '../geometry/ceiling';
import { planFrameAngle } from '../geometry/floorplan';
import { assignOpenings } from '../geometry/scene3d';
import {
  demiFacesDe,
  epaisseurDe,
  facesDesMurs,
  estDessine,
  etendueDeLaPiece,
  faceEntiere,
  longueurCotee,
  placeDuDetecteur,
  pointOnSeg,
  retraitDuCoin,
  wallRuns,
} from '../geometry/floorplan';
import {
  ajusterBlocs,
  masquesDeScene,
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
import { frCategory, furnKind, furnitureStrokes, meridienneDe } from '../geometry/furniture';
import { ecarterLesGaines } from '../geometry/routing';
import { matieresDesSols } from '../ui/maquette';
import { accentsDesPieces, peinturesDesPieces, solsDesPieces } from '../ui/habillage';
import { cotesExterieures, ECART_DE_COTE } from '../geometry/cotes3d';
import type { Devis } from '../geometry/devis';
import { enHeures, totauxDuDevis, TVA_DES_PRIX_PUBLICS, type Pose } from '../geometry/mainDOeuvre';
import { nomDeTeinte } from '../ui/peintures';

const PAGE_W = 595;
const PAGE_H = 842;

// Couleurs du plan
const INK = '#141922';
const GREY = '#5A6472';
const GREY_LIGHT = '#98A1AE';
/** Le bleu des cotes posées à la main, celui de l'app. */
const BLEU_REGLE = '#2F6BFF';
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
/**
 * LA LARGEUR D'UN SIGNE, POUR TOUT CE QUI SE TAILLE SUR SON TEXTE.
 *
 * Elle était écrite ici, à 0,52 em, et recopiée à 0,50 ailleurs — d'où une
 * légende dont les libellés tenaient au calcul et sortaient tronqués au
 * dessin. Deux estimations de la même chose finissent toujours par diverger ;
 * celle-ci a divergé de deux centièmes, ce qui suffit à couper « élévation »
 * en « élévati ».
 */
export const EM_TEXTE = 0.52;

/** Le titre d'une feuille, et son niveau quand le logement en a plusieurs. */
function avecNiveau(titre: string, ctx: { niveau?: string }): string {
  return ctx.niveau ? `${titre} — ${ctx.niveau}` : titre;
}

function fitText(s: string, size: number, maxW: number): string {
  const perChar = size * EM_TEXTE;
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
   * Une page de garde en tête du dossier : le logement, à qui il est, ses
   * chiffres, une vue d'ensemble et le contenu du dossier (voir `gardePage`).
   */
  garde?: boolean;
  /**
   * TOUS LES NIVEAUX DU LOGEMENT, dans l'ordre où le dossier les montre —
   * correctif de l'audit : le dossier ne sortait que l'étage affiché.
   *
   * Chaque niveau garde ses feuilles (plan, métré, perspectives, murs de
   * face), titrées de son nom. Les feuilles électriques (existant, gaines,
   * schémas, plafond) ne sortent qu'avec le niveau `courant` ; les achats
   * et la page de garde valent pour tout le logement. À moins de deux
   * niveaux, le dossier est celui du `scan`, comme avant.
   */
  niveaux?: {
    nom: string;
    scan: Omit<ScanForPdf, 'name'>;
    courant?: boolean;
    /** Le plafond de CE niveau (revue « Mehdi » : l'étage sortait sans le sien). */
    ceiling?: CeilingFixture[];
  }[];
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
   * « CE QU'IL FAUT ACHETER », sur sa feuille — relevé du patron, point 3 de
   * la réflexion « grand public » : le calcul vivait à l'écran et n'allait
   * nulle part. Les pièces retenues, les hypothèses du calcul et, quand on
   * l'a demandé, les prix d'unité. Absent : pas de feuille.
   */
  /**
   * LES REPÈRES SUR LES VUES 3D — relevé du patron : « donne la possibilité
   * d'enlever les repères sur plan 3D lors de la fiche d'export PDF ». Faux :
   * les perspectives montrent le logement seul, sans ses appareils.
   */
  reperes3D?: boolean;
  achats?: {
    pieces: PieceTravaux[];
    hypotheses: HypothesesTravaux;
    prix?: PrixTravaux | null;
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

  /** Ligne brisée en tireté : le cheminement d'une gaine. `alpha` l'estompe
   *  (dixièmes, comme `poly`) : un lien de commande se lit sans dominer. */
  dashedPath(pts: Pt[], w: number, hex: string, dash: [number, number], alpha = 1) {
    if (pts.length < 2) return;
    const [r, g, b] = hexRgb(hex);
    const ga = Math.round(Math.min(1, Math.max(0.1, alpha)) * 10);
    this.ops.push(
      `q ${ga < 10 ? `/GA${ga} gs ` : ''}[${dash[0]} ${dash[1]}] 0 d ${n2(r)} ${n2(g)} ${n2(b)} RG ${n2(w)} w 1 J 1 j ` +
        pts.map((p, i) => `${n2(p.x)} ${n2(p.y)} ${i === 0 ? 'm' : 'l'}`).join(' ') +
        ' S Q',
    );
  }

  /**
   * UN REMPLISSAGE À TROUS — les contours en pair-impair : le poché des murs,
   * où chaque pièce est un trou dans la maçonnerie.
   */
  contoursPleins(contours: Pt[][], fillHex: string) {
    const valides = contours.filter((c) => c.length >= 3);
    if (valides.length === 0) return;
    const [r, g, b] = hexRgb(fillHex);
    this.ops.push(
      `[] 0 d ${n2(r)} ${n2(g)} ${n2(b)} rg ` +
        valides
          .map((c) => c.map((p, i) => `${n2(p.x)} ${n2(p.y)} ${i === 0 ? 'm' : 'l'}`).join(' ') + ' h')
          .join(' ') +
        ' f*',
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

/** L'entreprise de l'artisan, telle que le cartouche l'imprime. */
export interface EntreprisePdf {
  nom: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  siret?: string;
}
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
/** Largeur de la vignette qui précède un libellé, et son écart. */
const CADRE_PUCE = 21;

/**
 * Dessine un cadre de légende : titre(s), lignes colorées, marges égales.
 *
 * ELLE NE PARLE QUE DE CE QU'ON A SOUS LES YEUX — c'est la règle héritée de
 * `drawElecLegend`, qui dessinait autrefois la légende de l'appareillage à
 * elle seule et qui a disparu le jour où toutes les légendes ont pris le même
 * chemin. Une légende qui liste tout un catalogue n'apprend rien ; celle-ci se
 * lit en trois secondes parce qu'elle ne montre que les symboles présents.
 *
 * Le cadre se dimensionne SUR SON CONTENU. On lui donne des sections, il
 * rend sa hauteur — personne n'a plus à compter les lignes à la main.
 */
/** Une ligne de légende : sa vignette à gauche, son libellé à droite. */
interface LegendLine {
  texte: string;
  /** Un trait de couleur — pour un circuit, un conducteur, un lien. */
  couleur?: string;
  /** Le trait est un tireté estompé : celui des liens de commande. */
  tirete?: boolean;
  /** Ou un symbole dessiné — pour un appareil. */
  symbole?: { paths: SymbolStroke[]; color: string };
  /** Son nombre, comme sur le plan : « ×2 » pour une double prise. */
  fois?: number;
  /** Le mot écrit dans son rond (« VP », « 20A ») : voir `motDansLeRond`. */
  mot?: { texte: string; x: number; y: number; taille: number };
}

interface LegendSection {
  titre?: string;
  /** La pastille de couleur devant le titre. */
  teinte?: string;
  lignes: LegendLine[];
}

/**
 * UN LIEN DE COMMANDE, ESTOMPÉ — relevé du patron : « rends ces lignes moins
 * opaques ». Un fil fin, à moitié transparent : on suit l'interrupteur
 * jusqu'à sa lampe sans qu'il passe devant le reste.
 */
const LIEN_LARGEUR = 0.55;
const LIEN_ALPHA = 0.5;
/** Le jour laissé entre un lien et le symbole qu'il frôle, en points. */
const MARGE_LIEN = 2.5;

/**
 * UN TRAIT QUI S'INTERROMPT AUTOUR DES SYMBOLES — relevé du patron : « les
 * éléments électriques ne doivent pas être en collision avec les
 * cheminements tracés de leur interaction avec l'interrupteur ; laisse une
 * marge ». Le lien partait du centre de l'interrupteur, finissait sur la
 * lampe et traversait au passage les prises qui se trouvaient là.
 *
 * Il est découpé : chaque disque (un symbole et sa marge) le coupe, et il
 * reprend de l'autre côté. Rend les morceaux qui restent, chacun d'au moins
 * deux points.
 */
export function horsDesDisques(
  pts: Pt[],
  disques: { x: number; y: number; r: number }[],
  pas = 1.2,
): Pt[][] {
  const dehors = (q: Pt) => disques.every((c) => Math.hypot(q.x - c.x, q.y - c.y) >= c.r);
  const morceaux: Pt[][] = [];
  let courant: Pt[] = [];
  const pousser = (q: Pt) => {
    if (dehors(q)) {
      courant.push(q);
      return;
    }
    if (courant.length >= 2) morceaux.push(courant);
    courant = [];
  };
  pts.forEach((b, i) => {
    if (i === 0) {
      pousser(b);
      return;
    }
    const a = pts[i - 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / pas));
    for (let k = 1; k <= n; k++) {
      pousser({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
  });
  if (courant.length >= 2) morceaux.push(courant);
  // Les points intermédiaires d'une même droite ne disent rien : on garde
  // les coudes, le flux reste léger.
  return morceaux.map((m) =>
    m.filter((q, i) => {
      if (i === 0 || i === m.length - 1) return true;
      const a = m[i - 1];
      const b = m[i + 1];
      return Math.abs((q.x - a.x) * (b.y - a.y) - (q.y - a.y) * (b.x - a.x)) > 0.02;
    }),
  );
}

/** Un rectangle aux coins arrondis, en points de page. */
function rectArrondi(x: number, y: number, w: number, h: number, r: number): Pt[] {
  const k = Math.min(r, w / 2, h / 2);
  const pts: Pt[] = [];
  const coin = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 4; i++) {
      const a = a0 + (i / 4) * (Math.PI / 2);
      pts.push({ x: cx + k * Math.cos(a), y: cy + k * Math.sin(a) });
    }
  };
  coin(x + w - k, y + k, -Math.PI / 2);
  coin(x + w - k, y + h - k, 0);
  coin(x + k, y + h - k, Math.PI / 2);
  coin(x + k, y + k, Math.PI);
  return pts;
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
  /*
    UNE CARTE, PAS UN FORMULAIRE — relevé du patron : « la légende n'est pas
    adaptée ; revois pour quelque chose de plus ludique ». Les coins
    s'arrondissent, chaque titre porte sa pastille de couleur, et chaque
    symbole se pose sur une vignette teintée, son « ×2 » au coin — comme sur
    le plan, qu'elle explique.
  */
  d.poly(rectArrondi(x, y, larg, haut, 7), '#FFFFFF', '#E1E6EE', 0.6);
  const largCol = (larg - CADRE_MARGE * (colonnes.length + 1)) / colonnes.length;
  colonnes.forEach((sections, ci) => {
    const tx = x + CADRE_MARGE + ci * (largCol + CADRE_MARGE);
    let base = y + haut - CADRE_MARGE - CADRE_LIGNE + 3.5;
    for (const sec of sections) {
      if (sec.titre) {
        d.circle(tx + 2.4, base + 2.2, 2.2, sec.teinte ?? ENCRE_ELEC);
        d.text(sec.titre, tx + 8, base, 6.3, GREY, { align: 'left', bold: true });
        base -= CADRE_LIGNE;
      }
      for (const ligne of sec.lignes) {
        if (ligne.symbole) {
          // La vignette tient le symbole ; son « ×2 » se pose à côté, sur le
          // blanc, là où il se lit.
          d.poly(
            rectArrondi(tx, base - 2.6, 13, 10.4, 3),
            mixHex(ligne.symbole.color, '#FFFFFF', 0.9),
            null,
          );
          // Le rond qui porte un mot se lit sur du blanc, comme sur le plan.
          if (ligne.mot) {
            const c0 = pointDuSymbole({ x: ligne.mot.x, y: ligne.mot.y }, tx + 6.5, base + 2.5, 0.4);
            d.circle(c0.x, c0.y, 6.5 * 0.4, '#FFFFFF');
          }
          drawSymbol(
            d,
            ligne.symbole.paths,
            tx + 6.5,
            base + 2.5,
            0.4,
            ligne.symbole.color,
            0.9,
          );
          // Un rond seul se confond : il porte son mot, comme sur le plan.
          if (ligne.mot) {
            const t = ligne.mot.taille * 0.4;
            const c = pointDuSymbole({ x: ligne.mot.x, y: ligne.mot.y }, tx + 6.5, base + 2.5, 0.4);
            d.text(ligne.mot.texte, c.x, c.y - t * 0.36, t, ligne.symbole.color, { bold: true, align: 'center' });
          }
          if (ligne.fois) {
            d.text(`×${ligne.fois}`, tx + 14, base + 0.5, 4.6, ligne.symbole.color, {
              align: 'left',
              bold: true,
            });
          }
        } else if (ligne.couleur) {
          const trait = [
            { x: tx + 1, y: base + 2.5 },
            { x: tx + CADRE_PUCE - 5, y: base + 2.5 },
          ];
          if (ligne.tirete) {
            d.dashedPath(trait, LIEN_LARGEUR * 1.4, ligne.couleur, [3, 2.2], LIEN_ALPHA);
          } else {
            d.path(trait, 2, ligne.couleur);
          }
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
/**
 * LE BANDEAU DU TITRE EST RESERVE, pas partage.
 *
 * Le titre s'ecrivait par-dessus le dessin : sur un logement haut, le plan
 * montait jusqu'en tete de feuille et le barrait de ses murs. Le dessin
 * s'arrete donc sous le bandeau, et la fenetre de decoupe avec lui : c'est
 * la seule facon d'en etre sur, puisque le zoom vient de l'utilisateur.
 */
const BANDEAU = 44;
/**
 * LA FENETRE DE DECOUPE DU PLAN — annoncee, pas devinee.
 *
 * C'est le rectangle auquel `planPage` rogne son dessin : tout ce qui est
 * ecrit dedans appartient au plan, tout ce qui est ecrit dehors appartient
 * a la feuille (tete, cartouche). Elle etait ecrite en clair a l'endroit du
 * `clip`, et un banc qui voulait mesurer le plan devait la RECOPIER — deux
 * calculs de la meme chose divergent, c'est la lecon du bandeau du meuble :
 * celui qui dessine annonce son encombrement, personne ne le devine plus.
 */
/**
 * LE DISQUE D'UN APPAREIL DE PLAFOND, en points de page.
 *
 * Ni plus petit que lisible — un spot de 9 cm ferait deux points au 1:100 —
 * ni plus gros que le symbole. Le calcul était écrit trois fois dans la
 * feuille du plan ; c'est un chiffre que le dessin ANNONCE, et dont les
 * bancs se servent pour savoir jusqu'où un sigle a le droit d'aller.
 */
export const RAYON_PLAFOND_MIN = 7;
export const RAYON_PLAFOND_MAX = 16;
/**
 * JUSQU'OÙ LE SIGLE D'UN PLAFONNIER S'ÉCARTE DE SON DISQUE.
 *
 * Il tient à son symbole : c'est lui qu'il nomme. Il fait le tour du disque
 * — dessous d'abord, puis dessus, puis de part et d'autre — sans jamais
 * dépasser cet écart, sans quoi il désignerait l'appareil voisin.
 */
export const ECART_SIGLE_PLAFOND = 15;

export const FENETRE_PLAN = {
  x: FRAME.x + 2,
  y: FRAME.y + TITLE_H + 2,
  w: FRAME.w - 4,
  h: FRAME.h - TITLE_H - 4 - BANDEAU,
};

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
    /** Un particulier : son dossier est à un PROPRIÉTAIRE, pas à un client. */
    particulier?: boolean;
    /** L'entreprise de l'artisan : elle prend la place de la marque. */
    entreprise?: EntreprisePdf | null;
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
  /*
    L'ENTREPRISE DE L'ARTISAN, À LA PLACE DE LA MARQUE — correctif de
    l'audit : le dossier n'avait ni son nom ni ses coordonnées, et c'est
    lui qui le remet à son client. Son nom, puis trois lignes au plus :
    téléphone, e-mail, adresse ou SIRET.
  */
  const ent = info.entreprise?.nom ? info.entreprise : null;
  if (ent) {
    const large = cols[0] - FRAME.x - 24;
    d.text(fitText(ent.nom, 11, large), FRAME.x + 12, ty + 46, 11, INK, { bold: true, align: 'left' });
    const lignes = [
      ent.telephone,
      ent.email,
      ent.adresse,
      ent.siret ? `SIRET ${ent.siret}` : '',
    ].filter((x): x is string => !!x && !!x.trim());
    lignes.slice(0, 3).forEach((l, i) => {
      d.text(fitText(l, 7, large), FRAME.x + 12, ty + 32 - i * 10, 7, GREY, { align: 'left' });
    });
  } else {
    drawLogo(d, FRAME.x + 12, ty + 8, 50);
    d.text('EchoPlan', FRAME.x + 70, ty + 38, 14, INK, { bold: true, align: 'left' });
    d.text('Scan 3D & plans', FRAME.x + 70, ty + 23, 7.5, GREY, { align: 'left' });
  }

  // Bloc projet
  d.text('PROJET', cols[0] + 12, ty + 50, 6.5, GREY_LIGHT, { align: 'left' });
  // Le titre se resserre avant de se couper : « Plan du 12/10/2026 — Rez-d… »
  // perdait justement le niveau (revue « Léa »).
  const corpsProjet = [10.5, 9.5, 8.5].find((t) => fitText(info.project, t, width(0)) === info.project) ?? 8.5;
  d.text(fitText(info.project, corpsProjet, width(0)), cols[0] + 12, ty + 37, corpsProjet, INK, {
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
  /*
    LE PARTICULIER N'A PAS DE CLIENT — relevé du patron, point 1 de la
    réflexion « grand public » : le dossier parlait métier (« Client »,
    « Chantier ») à quelqu'un qui relève son propre logement.
  */
  d.text(aQui ? (info.particulier ? 'PROPRIÉTAIRE' : 'CLIENT') : 'FICHIER', cols[0] + 12, ty + 24, 6.5, GREY_LIGHT, {
    align: 'left',
  });
  /*
    SANS COUPER — relevé des revues du dossier : « 12 rue des Lila… » sur
    toutes les feuilles. Quand la ligne ne tient pas, le client et
    l'adresse prennent chacun la leur.
  */
  const surDeux =
    !!aQui && fitText(aQui, 8, width(0)) !== aQui && !!info.client && !!info.address;
  if (surDeux) {
    d.text(fitText(info.client!, 7, width(0)), cols[0] + 12, ty + 14, 7, GREY, { align: 'left' });
    d.text(fitText(info.address!, 7, width(0)), cols[0] + 12, ty + 5.5, 7, GREY, { align: 'left' });
  } else {
    d.text(fitText(aQui || info.filename, 8, width(0)), cols[0] + 12, ty + 12, 8, GREY, {
      align: 'left',
    });
  }

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
      // « 1,5 m », à la française (revue « Claire » : « 1.5 m »).
      r.total < 1 ? `${Math.round(r.total * 100)} cm` : `${String(r.total).replace('.', ',')} m`,
      bx + wl + 3,
      by,
      5,
      GREY,
      { align: 'left' },
    );
  }

  // Bloc feuille
  d.text('DOCUMENT', cols[2] + 12, ty + 50, 6.5, GREY_LIGHT, { align: 'left' });
  // Deux lignes quand le titre ne tient pas : « Élévation — côté Séjou… »
  // ne disait plus de quel mur il s'agissait.
  const titreDoc = wrapText(info.sheetTitle, 7.5, width(2));
  if (fitText(info.sheetTitle, 8.5, width(2)) === info.sheetTitle || titreDoc.length < 2) {
    d.text(fitText(info.sheetTitle, 8.5, width(2)), cols[2] + 12, ty + 38, 8.5, INK, {
      align: 'left',
    });
  } else {
    d.text(titreDoc[0], cols[2] + 12, ty + 42, 7.5, INK, { align: 'left' });
    d.text(fitText(titreDoc.slice(1).join(' '), 7.5, width(2)), cols[2] + 12, ty + 33.5, 7.5, INK, {
      align: 'left',
    });
  }
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

/**
 * RANGE UNE COLONNE D'ÉTIQUETTES EN MARGE — chacune au plus près de la
 * hauteur de sa pièce, jamais à moins de `pas` de sa voisine, toutes entre
 * `bas` et `haut`, et dans l'ordre de leurs pièces à l'écran : les traits
 * qui les relient ne se croisent pas. Rend les hauteurs dans l'ordre reçu.
 */
export function rangerEnColonne(voulues: number[], bas: number, haut: number, pas: number): number[] {
  const n = voulues.length;
  if (n === 0) return [];
  // Trop d'étiquettes pour la hauteur : elles se serrent plutôt que de sortir.
  const ecart = n > 1 ? Math.min(pas, (haut - bas) / (n - 1)) : pas;
  const ordre = voulues.map((_, i) => i).sort((a, b) => voulues[b] - voulues[a]);
  const ys = ordre.map((i) => Math.min(Math.max(voulues[i], bas), haut));
  // De haut en bas : chacune sous sa voisine du dessus.
  for (let k = 1; k < n; k++) ys[k] = Math.min(ys[k], ys[k - 1] - ecart);
  // Puis de bas en haut : ce qui est sorti par le bas remonte la colonne.
  if (ys[n - 1] < bas) {
    ys[n - 1] = bas;
    for (let k = n - 2; k >= 0; k--) ys[k] = Math.max(ys[k], ys[k + 1] + ecart);
  }
  const out = new Array<number>(n);
  ordre.forEach((i, k) => {
    out[i] = ys[k];
  });
  return out;
}

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
    // Le dossier montre les mêmes sols que l'app : parquet et carrelage,
    // d'après le nom des pièces.
    matieres: matieresDesSols(opts.rooms ?? []),
    /*
      LE DÉCOR CHOISI — correctif de l'audit : on peignait le séjour dans
      « Décorer », et les perspectives du dossier le montraient blanc. Les
      pièces portent leur peinture, leur sol et leurs murs d'accent ; la
      scène les lit comme celle de l'app.
    */
    peintures: peinturesDesPieces(opts.rooms ?? []),
    sols: solsDesPieces(opts.rooms ?? []),
    accents: accentsDesPieces(opts.rooms ?? []),
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
  /*
    LES NOMS DES PIÈCES SORTENT DU DESSIN — relevé du patron : « les notes
    avec les noms des pièces font cheap ; les sortir du plan pour ne pas
    gêner la vue, et faire un trait vers la pièce concernée ». Un cartouche
    blanc posé sur le modèle cachait justement les murs et les meubles
    qu'on voulait montrer. Les étiquettes se rangent en marge — à gauche les
    pièces de gauche, à droite celles de droite —, et la marge se réserve
    AVANT le cadrage : le modèle se loge entre les deux colonnes.
  */
  const etiquettes = (opts.showSurfaces ? scene.rooms : [])
    .filter((room) => !!room.surface)
    .map((room) => {
      const x = room.labelAt.x - ctr.x;
      const z = room.labelAt.z - ctr.z;
      return {
        monde: { x: room.labelAt.x, y: 0, z: room.labelAt.z },
        nom: opts.roomNames?.[room.roomId] ?? '',
        aire: `${room.surface!.exact ? '' : '≈ '}${fr1(room.surface!.area)} m²`,
        gauche: x * ct - z * st < 0,
      };
    });
  const largeurDe = (e: { nom: string; aire: string }) =>
    Math.max(e.nom.length * 9 * 0.56, e.aire.length * 7.5 * 0.52);
  const marge = (cote: boolean) => {
    const siennes = etiquettes.filter((e) => e.gauche === cote);
    if (siennes.length === 0) return 0;
    return Math.min(Math.max(...siennes.map(largeurDe)) + 26, box.w * 0.24);
  };
  const margeG = marge(true);
  const margeD = marge(false);
  const cadre = { x: box.x + margeG, y: box.y, w: box.w - margeG - margeD, h: box.h };
  // Les cotes courent hors du volume : le cadrage leur garde leur place.
  const scale = ((Math.min(cadre.w, cadre.h) * 0.46) / (r3 + (showDims ? ECART_DE_COTE + 0.35 : 0))) * zoom;
  const cx = cadre.x + cadre.w / 2 + view.fx * (box.w / 2);
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
  /*
    ET LA MEME REGLE STRICTE QUE DANS L'APP : un pan qui nous fait face
    masque tout ce qui est de l'autre cote de son plan. Le dossier imprime
    se regarde de plus pres qu'un ecran, et un meuble qui traverse un mur y
    reste sur le papier.
  */
  const masquesScene = masquesDeScene(faces);
  const masqueDe = (panId?: number) => {
    if (panId === undefined) return undefined;
    const m = masquesScene.get(panId);
    if (!m) return undefined;
    const vers = m.n.x * st * sp + m.n.y * cp + m.n.z * ct * sp;
    return vers > 0 ? m.cache : undefined;
  };
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
        cache: masqueDe(f.panId),
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
    | { kind: 'dot'; depth: number; x: number; y: number; color: string };
  const items: Item[] = polys.map((p) => ({ kind: 'poly' as const, ...p }));

  // Les noms et les surfaces des pièces se posent en marge : voir plus bas.

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
        d.poly(
          item.pts,
          item.fill,
          item.stroke,
          item.dashed ? 1.3 : 0.7,
          item.dashed,
          item.alpha ?? 1,
        );
      }
    } else {
      d.circle(item.x, item.y, 0.55, item.color);
    }
  }

  /*
    LES COTES, À LA FAÇON D'UN ARCHITECTE — relevé du patron : « plus
    professionnelles, sans gros bloc blanc arrière ». Un pavé blanc
    « 3,00 m » se posait au faîte de chaque mur, cloisons comprises, et
    cachait ce qu'il cotait. Seule l'enveloppe se cote, HORS du volume (voir
    `geometry/cotes3d`) : la ligne de cote parallèle à la façade, deux
    rappels fins, une petite oblique à chaque bout, et le chiffre posé sur
    la ligne, côté extérieur, sans fond.
  */
  if (showDims) {
    const COTE = '#3C4654';
    const centre = project(ctr);
    // La hauteur se cote du côté qui porte le moins de noms de pièces.
    const aGauche = etiquettes.filter((e) => e.gauche).length;
    const cotes = cotesExterieures(
      walls,
      roomParts(walls, opts.rooms),
      { x: st, z: ct },
      undefined,
      aGauche <= etiquettes.length - aGauche ? 'gauche' : 'droite',
    );
    for (const c of cotes) {
      const pa = project(c.a);
      const pb = project(c.b);
      const lx = pb.x - pa.x;
      const ly = pb.y - pa.y;
      const l = Math.hypot(lx, ly);
      // Trop courte à l'écran, la cote ne porterait pas son chiffre.
      if (l < 16) continue;
      for (const [r0, r1] of c.rappels) {
        const q0 = project(r0);
        const q1 = project(r1);
        d.line(q0.x, q0.y, q1.x, q1.y, 0.3, COTE);
      }
      d.line(pa.x, pa.y, pb.x, pb.y, 0.45, COTE);
      // L'oblique d'architecte, à 45° de la ligne, à chaque bout.
      const ux = lx / l;
      const uy = ly / l;
      const ox = (ux - uy) * Math.SQRT1_2 * 3;
      const oy = (ux + uy) * Math.SQRT1_2 * 3;
      for (const q of [pa, pb]) d.line(q.x - ox, q.y - oy, q.x + ox, q.y + oy, 0.6, COTE);
      // Le chiffre suit la ligne, lisible de gauche à droite, côté extérieur.
      let angle = (Math.atan2(ly, lx) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle <= -90) angle += 180;
      const rad = (angle * Math.PI) / 180;
      const haut = { x: -Math.sin(rad), y: Math.cos(rad) };
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      const versDehors = (mx - centre.x) * haut.x + (my - centre.y) * haut.y >= 0;
      const taille = 7.5;
      const decale = versDehors ? 2.2 : -(taille + 1.2);
      d.text(c.texte, mx + haut.x * decale, my + haut.y * decale, taille, '#2A3340', { angle });
    }
  }

  /*
    LES ÉTIQUETTES EN MARGE, ET LEUR TRAIT. Le nom en gras, la surface en
    dessous ; un trait fin mène à la pièce, qu'un point marque. Chaque
    colonne suit l'ordre des pièces à l'écran : les traits ne se croisent
    pas.
  */
  for (const gauche of [true, false]) {
    const colonne = etiquettes
      .filter((e) => e.gauche === gauche)
      .map((e) => ({ ...e, ancre: project(e.monde) }));
    if (colonne.length === 0) continue;
    const ys = rangerEnColonne(
      colonne.map((e) => e.ancre.y),
      box.y + 16,
      box.y + box.h - 14,
      26,
    );
    const bord = gauche ? cadre.x - 10 : cadre.x + cadre.w + 10;
    colonne.forEach((e, i) => {
      const y = ys[i];
      const attache = gauche ? bord + 4 : bord - 4;
      d.line(attache, y + 3, gauche ? attache + 6 : attache - 6, y + 3, 0.5, GREY);
      d.line(gauche ? attache + 6 : attache - 6, y + 3, e.ancre.x, e.ancre.y, 0.5, GREY);
      d.circle(e.ancre.x, e.ancre.y, 2.4, '#FFFFFF');
      d.circle(e.ancre.x, e.ancre.y, 1.5, INK);
      const align = gauche ? 'right' : 'left';
      if (e.nom) d.text(e.nom, bord, y, 9, INK, { bold: true, align });
      d.text(e.aire, bord, e.nom ? y - 10 : y, e.nom ? 7.5 : 9, e.nom ? GREY : INK, { align, bold: !e.nom });
    });
  }
  d.restore();

  // Le liseré de la case : il dit où s'arrête la vue, et rend lisible un
  // modèle qui touche le bord.
  d.rect(box.x, box.y, box.w, box.h, null, '#E3E7EE', 0.8);
}

// -------------------------------------------------------------- pages

const fr1 = (v: number) => v.toFixed(1).replace('.', ',');
/**
 * DEUX DÉCIMALES AU MÉTRÉ — revue « Sébastien » : 22,9 au PDF, 22,95 à
 * l'écran de la fiche et au tableur. Le plan garde une décimale (c'est un
 * dessin) ; le tableau des surfaces, qui se recopie, en porte deux.
 */
const fr2 = (v: number) => v.toFixed(2).replace('.', ',');
const frLen = (v: number) => v.toFixed(2).replace('.', ',');

/** Ce qui est commun à toutes les feuilles d'un même export. */
interface SheetContext {
  name: string;
  /**
   * LES MURS QUI ONT LEUR FEUILLE D'ÉLÉVATION dans ce dossier — revues
   * « Thomas » et « Inès » : des numéros de 1 à 16 imprimés dans les murs
   * d'un dossier sans élévations, qui ne renvoyaient à rien, et un mur 11
   * sans feuille. Seuls ceux-là se numérotent ; absent, tous.
   */
  mursNumerotes?: string[];
  /** Sur un logement à plusieurs niveaux, celui de cette feuille (revue « Thomas »). */
  niveau?: string;
  filename: string;
  /** Client et chantier, pour le cartouche. */
  client?: string;
  address?: string;
  /** Un particulier : le cartouche dit « Propriétaire ». */
  particulier?: boolean;
  /** L'entreprise de l'artisan, pour le cartouche. */
  entreprise?: EntreprisePdf | null;
  /** Les perspectives portent-elles les repères d'appareillage ? */
  reperes3D?: boolean;
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
   * Le circuit de chaque appareil (C1, C2…), pour la COULEUR de sa gaine
   * seulement — le plan coté n'écrit plus de repère (relevé du patron).
   */
  circuitsDesAppareils?: Map<string, string>;
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
  /** Les cotes posées à la règle libre, déjà filtrées à l'étage imprimé. */
  mesures?: { a: { x: number; z: number }; b: { x: number; z: number } }[];
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
    /**
     * Tait les cotes de pose — appareillage et plafond.
     *
     * Sur la feuille des gaines, elles croisent les traces qu'on est venu
     * suivre : releve du patron, « il faut faire un systeme intelligent ou
     * rien ne se croise ». Elles se lisent sur le plan d'ensemble, qui
     * existe pour ca.
     */
    hideCotesPose?: boolean;
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
      avecNiveau(extra?.title ?? 'Plan d’ensemble coté', ctx),
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
      particulier: ctx.particulier,
    entreprise: ctx.entreprise,
      address: ctx.address,
      sheetTitle: avecNiveau(extra?.title ?? 'Plan d’ensemble coté', ctx),
      sheet,
      scaleLabel: null,
    });
    return d.stream();
  }
  // Une entrée par pièce : contour, centre, teinte de sol. Tout ce qui suit
  // (meubles, ouvertures, cotes, cartouches) se règle sur la pièce concernée.
  const parts = roomParts(walls, ctx.rooms);
  /**
   * QUI S'ÉCARTE DE QUI — l'ordre est celui des libertés.
   *
   * Relevé à l'œil sur le dossier imprimé : le sigle « DCL » d'un point
   * lumineux disparaissait sous le cartouche « Séjour · 12,0 m² ». Les deux
   * ont raison d'être là — un point lumineux se pose au milieu de la pièce,
   * et le cartouche aussi — mais le cartouche se peint APRÈS, avec son fond
   * blanc : il gagnait sans le savoir.
   *
   * Trois écritures se disputent le milieu d'une pièce, et elles n'ont pas
   * la même marge de manœuvre :
   *
   *   — LE SIGLE d'un appareil de plafond n'en a AUCUNE : il tient sous son
   *     symbole, sinon il ne nomme plus rien ;
   *   — LE CARTOUCHE en a un peu : il peut monter ou descendre de quelques
   *     points sans cesser de désigner sa pièce (c'est déjà ce qu'il fait à
   *     l'écran face aux meubles) ;
   *   — LA COTE en a beaucoup : elle glisse le long de son propre trait.
   *
   * Chacun s'écarte donc de ce qui est plus contraint que lui, et de rien
   * d'autre : le cartouche évite les sigles, la cote évite les deux. Une
   * réserve unique ferait chercher au cartouche une place introuvable au
   * milieu des cotes, et il resterait là où il gêne.
   */
  const siglesPlafond: Boite[] = [];
  /**
   * LES COTES DU PLAFOND — celles du cheminement, et les écarts de chaîne.
   *
   * Le cartouche de pièce s'en écarte comme il s'écarte des sigles : elles
   * sont posées avant lui, et une mesure ne se déplace pas pour un nom.
   */
  const cotesPlafond: Boite[] = [];
  const cartouchesPiece: Boite[] = [];
  const partOf = new Map(parts.map((p) => [p.roomId, p]));
  // Le « dedans » d'une pièce : le point au large, pas le barycentre des
  // extrémités de murs — celui-ci sort de la pièce dès qu'elle est en L.
  const centerOf = (roomId: string) =>
    partOf.get(roomId)?.labelAt ?? { x: 0, z: 0 };

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
  /*
    UNE LIGNE PAR SIGLE — revue « Mehdi » : le plan écrivait LV, LL, SL, PL
    dans les ronds, la légende disait « Prise 20 A » et « 20A ». Une
    alimentation à sigle se légende « Alim. lave-vaisselle (LV) », avec son
    mot, comme le plan d'architecte.
  */
  const siglesLegende = extra?.hideLegend
    ? []
    : [
        ...new Map(
          (ctx.fixtures ?? [])
            .filter((f) => !!f.usage)
            .map((f) => [`${f.kind}|${f.usage}`, { kind: f.kind, usage: f.usage! }] as const),
        ).values(),
      ];
  const plafondLegende = extra?.hideLegend
    ? []
    : [...new Set((ctx.ceiling ?? []).map((c) => c.kind))];
  /*
    UN LIEN DE COMMANDE N'ENTRE À LA LÉGENDE QUE S'IL EST TRACÉ — relevé des
    revues du dossier : elle l'annonçait dès qu'un point lumineux existait,
    et le plan n'en montrait aucun. Une légende qui promet un trait absent
    fait chercher ce qui n'est pas là.
  */
  const existeIci = (id: string) => (ctx.fixtures ?? []).some((x) => x.id === id);
  const liensTraces =
    (ctx.ceiling ?? []).some((cl) => (cl.commands ?? []).some(existeIci)) ||
    (ctx.fixtures ?? []).some((g) => (g.commands ?? []).some((cid) => cid !== g.id && existeIci(cid)));
  /**
   * CE QUE LA LÉGENDE VA DIRE — construit ICI, dessiné plus bas.
   *
   * Elle se dimensionnait sur trois largeurs écrites en clair (132, 154, 300)
   * et se remplissait mille lignes plus loin. Deux calculs de la même chose,
   * et le second ne savait pas ce que le premier avait réservé : le résultat
   * se lisait sur la feuille, où « Prise 16 A » sortait tronqué en
   * « Prise 16 » et « Tableau électrique » en « Tableau ». Une légende dont
   * les libellés ne tiennent pas n'explique rien — c'est le seul endroit du
   * dossier dont c'est la seule fonction.
   *
   * ON CONSTRUIT DONC LES COLONNES UNE FOIS, et la largeur se DÉDUIT du plus
   * long libellé : celui qui dessine annonce son encombrement, l'écran ne le
   * devine plus. C'est la même leçon que le bandeau du meuble et que la
   * fenêtre de découpe.
   */
  /*
    PLUS DE SECTION « PLAN » DANS LA LÉGENDE — relevé du patron : « sur le plan
    PDF, enlève les icônes présentant les portes, fenêtres et élévation, c'est
    logique ». Un battant de porte, un double trait de fenêtre, un numéro dans
    l'épaisseur d'un mur se lisent d'eux-mêmes ; la légende garde ce qui a
    besoin d'elle : l'appareillage et le plafond.
  */
  const colonnesLegende: LegendSection[][] = [];
  if (kindsLegende.length > 0) {
    /*
      LA LÉGENDE DESSINE CE QUE LE PLAN DESSINE — relevé du patron : « la
      légende n'est pas adaptée : un simple logo RJ, sans faire les prises à
      côté, se comprend comme RJ + PC ». Elle posait chaque poste d'un
      ensemble, trois symboles pour « RJ45 + prise double », quand le plan
      n'en pose qu'un (`symboleCompact`). Elle reprend donc le symbole du
      plan et son « ×2 » ; et ce qui se dessine pareil ne s'écrit qu'une
      fois — une RJ45, seule ou avec ses prises, c'est le même logo.
    */
    const groupes: {
      cle: string;
      kinds: FixtureKind[];
      symbole: SymbolStroke[];
      fois: number | null;
      mot: ReturnType<typeof motDansLeRond>;
    }[] = [];
    // Sans sigle, la ligne du type ; un type posé QUE sous sigles n'a pas la sienne.
    const sansSigle = new Set((ctx.fixtures ?? []).filter((f) => !f.usage).map((f) => f.kind));
    for (const k of kindsLegende.filter((x) => sansSigle.has(x))) {
      const { symbole, fois } = symboleCompact(postsOf(k), k);
      // Le mot du rond compte : un vidéophone n'est pas une prise 20 A.
      const mot = motDansLeRond(k);
      const cle = `${JSON.stringify(symbole)}|${fois ?? 1}|${mot?.texte ?? ''}`;
      const deja = groupes.find((g) => g.cle === cle);
      if (deja) deja.kinds.push(k);
      else groupes.push({ cle, kinds: [k], symbole, fois, mot });
    }
    const libelle = (kinds: FixtureKind[]) => {
      if (kinds.length === 1) return FIXTURES[kinds[0]].label;
      if (kinds.every((k) => postsOf(k).includes('rj45'))) return 'RJ45, seule ou avec prises';
      if (kinds.every((k) => postsOf(k).includes('tv'))) return 'Prise TV, seule ou avec prises';
      return kinds.map((k) => FIXTURES[k].label).join(' · ');
    };
    colonnesLegende.push([
      {
        titre: 'APPAREILLAGE',
        teinte: ENCRE_ELEC,
        lignes: [
          ...groupes.map((g) => ({
            texte: libelle(g.kinds),
            symbole: { paths: g.symbole, color: FIXTURES[g.kinds[0]].teintePropre ?? ENCRE_ELEC },
            ...(g.fois ? { fois: g.fois } : {}),
            ...(g.mot ? { mot: g.mot } : {}),
          })),
          ...siglesLegende.map(({ kind, usage }) => {
            const { symbole } = symboleCompact(postsOf(kind), kind);
            const appareil = USAGES.find((u) => u.sigle === usage)?.label ?? usage;
            const mot = motDansLeRond(kind, usage);
            return {
              texte: `Alim. ${appareil.charAt(0).toLowerCase()}${appareil.slice(1)} (${usage})`,
              symbole: { paths: symbole, color: FIXTURES[kind].teintePropre ?? ENCRE_ELEC },
              ...(mot ? { mot } : {}),
            };
          }),
        ],
      },
    ]);
  }
  {
    const seconde: LegendSection[] = [];
    if (plafondLegende.length > 0) {
      seconde.push({
        titre: 'PLAFOND',
        // L'encre de ses symboles : la pastille orange annonçait une
        // couleur que rien ne portait sur le plan.
        teinte: ENCRE_ELEC,
        lignes: plafondLegende.map((k) => ({
          texte: CEILINGS[k].label,
          // Le ruban LED garde son bleu, comme sur le plan.
          symbole: { paths: CEILING_SYMBOL[k], color: k === 'led' ? C_LED : ENCRE_ELEC },
        })),
      });
    }
    if (liensTraces && !extra?.hideLegend) {
      seconde.push({ lignes: [{ couleur: ENCRE_ELEC, tirete: true, texte: 'Lien de commande' }] });
    }
    if (!extra?.hideLegend && ctx.fixtures && ctx.openings.some((o) => o.detecteur)) {
      seconde.push({
        lignes: [{ symbole: { paths: [{ d: 'M-7 -4 H7 V4 H-7 Z' }], color: C_LED }, texte: 'Détecteur d’ouverture (DO)' }],
      });
    }
    if (seconde.length > 0) colonnesLegende.push(seconde);
  }
  /*
    LA LARGEUR SUIT LE PLUS LONG LIBELLÉ de chaque colonne — sa vignette, son
    écart, et la marge du cadre. Bornée : une légende plus large que le tiers
    de la feuille mangerait le dessin qu'elle explique.
  */
  const largeurColonne = (sections: LegendSection[]) =>
    Math.min(
      190,
      Math.max(
        96,
        ...sections.flatMap((sec) => [
          latin1(sec.titre ?? '').length * 6 * EM_TEXTE + CADRE_PUCE,
          ...sec.lignes.map(
            // La MÊME largeur de signe que `fitText`, qui décidera de couper
            // ou non : deux estimations divergentes, c'est un libellé qui
            // tient au calcul et se coupe au dessin.
            (l) => latin1(l.texte).length * 7 * EM_TEXTE + CADRE_PUCE + 2,
          ),
        ]),
      ),
    );
  /*
    ET TOUTES LES COLONNES ONT LA MÊME LARGEUR, parce que c'est ainsi que
    `drawLegendBox` les répartit : il divise la place également. Calculer une
    largeur par colonne et en dessiner une autre, c'était refaire l'erreur
    qu'on venait de corriger — la boîte réservée doit être celle qu'on
    dessine, ici aussi.
  */
  const legendeW =
    colonnesLegende.length === 0
      ? 0
      : Math.max(...colonnesLegende.map(largeurColonne)) *
          colonnesLegende.length +
        CADRE_MARGE * (colonnesLegende.length + 1);
  /* Autant de rangs que la colonne la plus fournie — titres compris. */
  const rangsDeColonne = (sections: LegendSection[]) =>
    sections.reduce((t, sec) => t + (sec.titre ? 1 : 0) + sec.lignes.length, 0);
  const legendeH =
    colonnesLegende.length === 0
      ? 0
      : Math.max(...colonnesLegende.map(rangsDeColonne)) * CADRE_LIGNE +
        CADRE_MARGE * 2;
  const avecLegende = colonnesLegende.length > 0;
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
  /*
    UN MUR ÉPAIS PREND SA PLACE DANS LE CADRE — revue « Claire » : l'échelle
    se choisissait sur les axes, et la marge de 50 points (faite pour les
    chaînes de cotes) devait aussi loger le poché. Avec des murs anciens de
    45 cm, à 1:30, les deux cotes de 3,00 m tombaient hors de la feuille. Ce
    qu'un mur dépasse d'un mur ordinaire s'ajoute à l'emprise.
  */
  if (isFinite(minX)) {
    // Toute l'épaisseur d'un mur relevé d'un côté part dehors (`facesDesMurs`).
    const faces = facesDesMurs(walls);
    const enPlus =
      Math.max(0, ...walls.map((w) => { const f = faces.get(w.id); return f ? Math.max(f.plus, f.moins) : epaisseurDe(w) / 2; })) - WALL_T / 2;
    if (enPlus > 1e-6) {
      minX -= enPlus;
      maxX += enPlus;
      minZ -= enPlus;
      maxZ += enPlus;
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
    d.clip(FENETRE_PLAN.x, FENETRE_PLAN.y, FENETRE_PLAN.w, FENETRE_PLAN.h);
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

    /*
      LE SOL DU PLAN IMPRIMÉ EST BLANC — relevé du patron : « fais la
      surface blanche et non avec des petits points ».

      Le semis vient de l'écran, où il donne l'échelle sous le doigt et
      distingue le sol des murs pochés. Sur le papier, il ne sert plus à
      rien : le plan porte ses cotes, et le lecteur y écrit. Mille cinq
      cents points gris derrière des chiffres bleus, c'est du bruit sous ce
      qu'on est venu lire — et une cartouche d'encre.

      L'aplat reste, en blanc franc : c'est lui qui pose la surface de la
      pièce sous les annotations, et qui dit où le logement s'arrête.
    */
    if (showSurfaces) {
      for (const part of parts) {
        if (!part.surface) continue;
        d.poly(part.surface.pts.map(px), '#FFFFFF', null);
      }
    }

    /*
      UNE SEULE RÉSERVE POUR TOUTE LA FEUILLE.

      Relevé du patron : « fais en sorte que chaque ligne et chaque mesure
      n'empiète pas une autre ». Le plan écrit une dizaine de familles de
      mots — nom de meuble, cote de mur, largeur de menuiserie, cote
      d'appareil, sigle, repère de circuit, cartouche de pièce, note,
      numéro de mur — et chacune tenait sa propre liste, quand elle en
      tenait une. Deux familles qui ne se voient pas se marchent forcément
      dessus un jour : c'est le canapé sous la note, et la largeur de porte
      sous la cote d'une prise.

      Elles partagent donc UNE liste, dans l'ordre de ce qu'elles peuvent
      céder : ce qui ne peut pas bouger s'y inscrit d'abord, ce qui peut
      glisser s'écarte ensuite. `libre()` interroge, `posees.push()`
      réserve — et l'ordre du dessin fait le reste.
    */
    const posees: { x: number; y: number; w: number; h: number }[] = [];
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

    /*
      LA CARTE D'ENCRE, AVANT LA PREMIÈRE ÉTIQUETTE — voir `export/encre`.

      Relevé du patron : « trop d'éléments se chevauchent sur le plan coté ;
      surface au sol rentre en collision avec la cote de mur… on doit innover
      pour fournir un plan bien lisible ». La réserve `posees` savait qu'un
      mot ne doit pas en couvrir un autre ; elle ignorait les TRAITS. Toute
      la géométrie du plan — poché, recoins, meubles, battants, dormants,
      gaines — est donc calculée ICI et encrée sur la carte, avant qu'une
      seule étiquette ne cherche sa place : chacune prend ensuite, parmi ses
      places possibles, la plus blanche. Le dessin, plus bas, relit ces
      mêmes tracés : ce qui est encré est ce qui est dessiné.
    */
    const encre = new CarteDEncre(
      FENETRE_PLAN.x,
      FENETRE_PLAN.y,
      FENETRE_PLAN.w,
      FENETRE_PLAN.h,
    );
    /** Réserve une place : plus aucun mot ni aucun trait ne s'y pose. */
    const reserver = (b: { x: number; y: number; w: number; h: number }) => {
      posees.push(b);
      encre.boite(b);
    };
    const poche = pocheDesMurs(walls, openings, ctx.rooms);
    encre.aplat(poche.contours.map((c) => c.map(px)));
    const baieDuPoche = new Map(poche.baies.map((b) => [b.id, b]));
    const massifs = massifsTechniques(walls, openings, ctx.rooms);
    encre.aplat(massifs.map((c) => c.map(px)));

    // Les meubles : leur contour et leurs traits d'architecte, recalés
    // devant les murs de LEUR pièce.
    const meublesDuPlan = objects.map((ob) => {
      // Deux centimètres de jour sur le papier (0,4 mm au 1/50) : le trait
      // du meuble ne se fond pas dans le poché du mur qu'il touche. L'écran,
      // lui, le dessine au ras (voir `clampFootprint`).
      const o = clampFootprint(
        toFootprint(ob),
        partOf.get(roomOf(ob))?.walls ?? walls,
        centerOf(roomOf(ob)),
        undefined,
        0.02,
        facesDesMurs(walls),
      );
      const cosY = Math.cos(o.yaw);
      const sinY = Math.sin(o.yaw);
      const loc = (lx: number, lz: number) =>
        px({ x: o.cx + lx * cosY - lz * sinY, z: o.cz + lx * sinY + lz * cosY });
      const hw = o.width / 2;
      const hd = o.depth / 2;
      const contour = [
        [-hw, -hd],
        [hw, -hd],
        [hw, hd],
        [-hw, hd],
      ].map(([lx, lz]) => loc(lx, lz));
      const traits = furnitureStrokes(furnKind(o.category), o.width, o.depth, meridienneDe(ob)).map(
        (line) => line.map((q) => loc(q.x, q.y)),
      );
      return { o, loc, contour, traits };
    });
    for (const m of meublesDuPlan) {
      encre.contour(m.contour, 0.9);
      for (const t of m.traits) encre.trait(t, 0.8);
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
    /** Les traits des menuiseries — battant, arc, dormants — calculés une fois. */
    const traitsMenuiserie: { pts: Pt[]; w: number; c: string }[] = [];
    for (const o of openings) {
      const room = roomOf(o);
      const centroid = centerOf(room);
      const dx = o.b.x - o.a.x;
      const dz = o.b.z - o.a.z;
      const len = Math.hypot(dx, dz) || 1;
      // La baie est un VIDE dans le poché : plus d'aplat pour effacer le noir.
      const baie = baieDuPoche.get(o.id);

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

      if (o.type === 'door' && !o.garage) {
        // Battant + arc d'ouverture, sur la charnière CHOISIE : deux
        // portes en vis-à-vis se rangent dos à dos plutôt que de croiser
        // leurs quarts de cercle.
        const gond = pivotsPorte.get(o.id) === 'b' ? o.b : o.a;
        const opp = gond === o.a ? o.b : o.a;
        // Deux vantaux : chacun de son tableau jusqu'au milieu.
        const feuilles: [{ x: number; z: number }, { x: number; z: number }][] = o.vantaux === 2 ? [[o.a, mid], [o.b, mid]] : [[gond, opp]];
        for (const [g, q] of feuilles) {
          const r = Math.hypot(q.x - g.x, q.z - g.z);
          traitsMenuiserie.push({
            pts: [px(g), px({ x: g.x + inx * r, z: g.z + inz * r })],
            w: 1.4,
            c: colorOpenings ? AMBER : GREY,
          });
          /*
            L'ARC DU BATTANT — le calcul commun.

            Il vivait ici recopié, et il portait le même défaut latent que
            l'export CAO : sur certaines orientations, l'écart d'angle passait
            la coupure à ±π et le tracé prenait le chemin long — un tour
            complet qui traverse le mur. Un seul calcul, une seule correction.
          */
          traitsMenuiserie.push({
            pts: arcDuBattant(g, q, { x: inx, z: inz }, r, 10).map(px),
            w: 0.8,
            c: GREY,
          });
        }
      } else if (o.type === 'window' && baie) {
        // Le dormant aux deux faces du tableau, le vitrage au cœur du mur.
        const ligne = (decalage: number, w: number, hex: string) => {
          const p1 = px({ x: baie.a.x + baie.n.x * decalage, z: baie.a.z + baie.n.z * decalage });
          const p2 = px({ x: baie.b.x + baie.n.x * decalage, z: baie.b.z + baie.n.z * decalage });
          traitsMenuiserie.push({ pts: [p1, p2], w, c: hex });
        };
        // Le bleu doux des fenêtres (voir `ui/encreElec`), dormant et vitrage.
        ligne(baie.plus, 0.7, BLEU_FENETRE);
        ligne(-baie.moins, 0.7, BLEU_FENETRE);
        ligne(baie.coeur + 0.015, 0.8, BLEU_FENETRE);
        ligne(baie.coeur - 0.015, 0.8, BLEU_FENETRE);
      } else {
        // Ouverture sans menuiserie — ou porte de garage, qui ne bat pas :
        // double trait dans la trouée.
        // Au cœur du mur : décalé vers le dehors pour un mur relevé d'un côté.
        const nx = baie ? baie.n.x : -dz / len;
        const nz = baie ? baie.n.z : dx / len;
        const k = baie?.coeur ?? 0;
        const ca = baie?.a ?? o.a;
        const cb = baie?.b ?? o.b;
        const color = !colorOpenings ? GREY : o.type === 'window' ? SKY : o.garage ? AMBER : GREY;
        for (const decal of [k + WALL_T / 4, k - WALL_T / 4]) {
          traitsMenuiserie.push({
            pts: [px({ x: ca.x + nx * decal, z: ca.z + nz * decal }), px({ x: cb.x + nx * decal, z: cb.z + nz * decal })],
            w: 1,
            c: color,
          });
        }
      }
    }
    for (const t of traitsMenuiserie) encre.trait(t.pts, Math.max(0.8, t.w));
    // Les gaines, en faisceau : elles passent sous les mots comme le reste.
    const gainesDuPlan =
      ctx.routes && ctx.routes.length > 0 ? ecarterLesGaines(ctx.routes) : [];
    for (const r of gainesDuPlan) {
      if (r.path.length >= 2) encre.trait(r.path.map(px), 0.8);
    }

    /**
     * LES MOTS DE L'APPAREILLAGE S'INSCRIVENT AVANT LES COTES.
     *
     * Mesuré sur trente cadrages du plan de référence : **47 chevauchements
     * sur 2 494 étiquettes** (banc `cotespdfsanschoc`). Le sigle d'un
     * appareil — « 20A », « 32A », « TV » — et son repère de circuit
     * s'écrivaient au moment du symbole, c'est-à-dire APRÈS les cotes, et
     * SANS INTERROGER la réserve : ils poussaient leur boîte dedans une fois
     * écrits, ce qui protégeait les suivants et personne d'autre. D'où
     * « 0,90 » de menuiserie barré par « 32A », et « 1,20 » par un « 9 ».
     *
     * C'EST L'ORDRE DES LIBERTÉS, et il était à l'envers. Un sigle tient à
     * son symbole : il le nomme, il ne peut pas partir ailleurs. Une cote
     * glisse le long de son propre trait sans rien perdre. C'est donc au
     * sigle de s'inscrire d'abord et à la cote de s'écarter — la même règle
     * que les numéros de mur juste au-dessus, et que le plan à l'écran.
     *
     * ILS SE DESSINENT PLUS BAS, à la place retenue ici. La boîte réservée
     * EST la boîte écrite : elles se calculaient séparément — le fond
     * réservait cinq points et demi de haut là où le texte en occupe quatre,
     * décalé de deux — et deux calculs de la même chose finissent par
     * diverger.
     */
    const murQuads = wallQuads(walls);
    const murParIdent = new Map(walls.map((w) => [w.id, w]));
    const poses = (ctx.fixtures ?? [])
      .map((f) => {
        const w = murParIdent.get(f.wallId);
        if (!w) return null;
        const face = wallFace(w, murQuads.get(w.id), f.side);
        return { f, face, along: faceX(face, f.along) };
      })
      .filter((v): v is NonNullable<typeof v> => !!v);
    /**
     * UN ENSEMBLE SE DESSINE UNE FOIS, avec tous ses postes.
     *
     * Le papier dessinait un symbole PAR APPAREIL : une double prise sortait
     * en deux symboles distants de 71 mm — deux pixels à l'échelle d'un
     * logement — qui se recouvraient. Sur le mur, c'est pourtant UNE plaque,
     * à deux mécanismes.
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
        // Le symbole se pose au MILIEU de la plaque : c'est ce qu'on voit
        // sur le mur, et ce que l'écran dessine déjà.
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
    const ECHELLE_SYMBOLE = 0.5;
    /*
      OÙ SORT LE SYMBOLE DU MUR — contre lui, comme sur le plan
      d'architecte : deux centimètres d'air plus ce que le symbole descend
      vers son mur ; le rang échelonne les suivants le long de leur filet.
      Posé sur la face EXTÉRIEURE d'une façade, il franchit d'abord sa
      surépaisseur (`pocheDesMurs`) : sinon il tombait dans le dessin des
      baies.
    */
    const dehorsDesMurs = cotesExterieurs(walls, parts);
    const murDeLAppareil = new Map(walls.map((w) => [w.id, w]));
    const bandeDehors = (g: Fixture) => {
      const w = murDeLAppareil.get(g.wallId);
      return w && w.epaisseur === undefined && dehorsDesMurs.get(g.wallId) === g.side ? SUREPAISSEUR_FACADE : 0;
    };
    const porteeDe = new Map(
      unites.map((v) => [
        v.f.id,
        { portee: porteeVersLeMur(symboleCompact(v.postes, v.f.kind).symbole), bande: bandeDehors(v.f) },
      ]),
    );
    const sortieDuMur = (id: string) => {
      const p0 = porteeDe.get(id);
      return 0.02 + (p0?.bande ?? 0) + ((p0?.portee ?? 10) * ECHELLE_SYMBOLE) / scale + (ranks.get(id) ?? 0) * 0.24;
    };
    /**
     * L'EMPAN DU SYMBOLE COMPOSÉ — ce qui l'entoure se pose dessus.
     *
     * Un rond fait pour un poste laissait les symboles d'un ensemble de
     * trois déborder des deux côtés. Le rayon suit donc l'empan RÉEL : même
     * pas d'entraxe que `postsSymbol`, demi-symbole aux extrémités, le tout
     * à l'échelle du dessin.
     */
    const rayonDuSymbole = (n: number) =>
      6.5 +
      ((Math.max(1, n) - 1) *
        ((ENTRAXE / PLAQUE) * SYMBOL_SPAN) *
        ECHELLE_SYMBOLE) /
        2;
    /** La taille des mots qui accompagnent un symbole. */
    const TAILLE_SIGLE = 5.5;
    /** Le mot de chaque symbole (« 2 », « RJ45 »…), à la place retenue. */
    const motsDesSymboles = new Map<string, { texte: string; base: { x: number; y: number }; taille: number }>();
    /** Un mot retenu ici, dessiné plus bas, à la place qu'il a trouvée. */
    const motsAppareil: {
      texte: string;
      x: number;
      y: number;
      couleur: string;
      bold: boolean;
    }[] = [];
    /*
      LES SYMBOLES S'ENCRENT AVANT LE PREMIER SIGLE — le disque de chaque
      plaque, le filet qui la relie au mur, les liens de commande : un sigle
      qui se pose ne doit tomber ni sur son voisin, ni sur un trait.
    */
    for (const { f, face, along, postes, membres } of unites) {
      const x = Math.max(0, Math.min(face.len, along));
      const q = px(facePoint(face, x, sortieDuMur(f.id)));
      if (!dansLeCadre(q)) continue;
      /*
        LE MOT DE L'ARCHITECTE SE POSE ICI, AVANT SON DISQUE — « 2 »,
        « RJ45 », « LV » (voir `libelleDuSymbole`). Sa place d'abord (dans le
        rond, au bout de la tige), puis sur les côtés, puis plus loin : la
        première qui ne tombe ni sur un trait ni sur un mot. Il est encré et
        retenu aussitôt — les cotes et les cartouches l'évitent ensuite.
      */
      const lib = libelleDuSymbole(postes, f.kind, f.usage);
      if (lib) {
        const a0 = px(facePoint(face, x, 0.02));
        const Lw = Math.hypot(a0.x - q.x, a0.y - q.y) || 1;
        const versLeMur = { x: (a0.x - q.x) / Lw, y: (a0.y - q.y) / Lw };
        const t = lib.taille * ECHELLE_SYMBOLE * 1.15;
        const dedans = lib.ou.x === 0 && lib.ou.y > 0;
        const essais = [lib.ou, ...(dedans ? [{ x: 0, y: -9 }] : []), { x: 13, y: 0 }, { x: -13, y: 0 }, { x: 0, y: -16 }];
        let choisi: ReturnType<typeof boiteDuMot> | null = null;
        for (const ou of essais) {
          const anc = pointDuSymbole(ou, 0, 0, ECHELLE_SYMBOLE, versLeMur);
          const L = Math.hypot(anc.x, anc.y) || 1;
          const auCentre = ou === lib.ou && dedans;
          const larg = lib.texte.length * t * 0.5;
          const haut = t * 0.72;
          const demi = auCentre ? 0 : (Math.abs(anc.x / L) * larg + Math.abs(anc.y / L) * haut) / 2;
          const mot = boiteDuMot(lib.texte, q.x + (anc.x / L) * (L + demi), q.y + (anc.y / L) * (L + demi), t);
          if (!choisi) choisi = mot;
          if (dansLeCadre(mot.base) && encre.sous(mot.boite) === 0 && libre(mot.boite)) {
            choisi = mot;
            break;
          }
        }
        if (choisi) {
          encre.boite(choisi.boite);
          posees.push(choisi.boite);
          motsDesSymboles.set(f.id, { texte: lib.texte, base: choisi.base, taille: t });
        }
      }
      encre.disque(q, rayonDuSymbole(postes.length));
      encre.segment(px(facePoint(face, x, 0.02)), q, 0.8);
      for (const cid of membres.flatMap((m) => m.f.commands ?? [])) {
        const cible = unites.find((u) => u.membres.some((m) => m.f.id === cid));
        if (!cible) continue;
        const de = facePoint(face, x, sortieDuMur(f.id));
        const vers = facePoint(
          cible.face,
          Math.max(0, Math.min(cible.face.len, cible.along)),
          sortieDuMur(cible.f.id),
        );
        encre.trait(linkCurve({ x: de.x, z: de.z }, { x: vers.x, z: vers.z }).map(px), 0.8);
      }
    }
    for (const cl of ctx.ceiling ?? []) {
      for (const fid of cl.commands ?? []) {
        const f = (ctx.fixtures ?? []).find((v) => v.id === fid);
        const w = f ? murParIdent.get(f.wallId) : undefined;
        if (!f || !w) continue;
        const face = wallFace(w, murQuads.get(w.id), f.side);
        // Depuis le symbole de l'interrupteur, là où le lien se dessine.
        const depart = facePoint(face, faceX(face, f.along), sortieDuMur(f.id));
        const arrivee = cl.trace
          ? pointDAccroche(cl, { x: depart.x, z: depart.z })
          : linkAnchor({ x: depart.x, z: depart.z }, cl.at, CEILINGS[cl.kind].d * 0.7);
        encre.trait(linkCurve({ x: depart.x, z: depart.z }, arrivee).map(px), 0.8);
      }
    }
    /*
      LES NUMÉROS DE MUR S'INSCRIVENT AVANT LES COTES — et APRÈS l'encre
      des symboles : revues du dossier, « les numéros 14, 15 et 16 sont
      recouverts par des symboles de prise ». Ils cherchaient leur place sur
      une carte où les appareils n'étaient pas encore encrés.

      Ils se DESSINENT en dernier (ce sont des annotations posées sur le
      plan fini), mais leur place ne se discute pas : un numéro tient sur
      son mur, au milieu de son épaisseur — voir `placeDuNumero`. Il réserve
      sa place tout de suite, et les cotes s'en écartent au lieu de se faire
      recouvrir dix mille points plus loin. La place retenue est celle que
      le dessin relira.
    */
    const numerosPoses = new Map<
      string,
      { n: number; x: number; y: number; taille: number; couleur: string }
    >();
    {
      const numeros = wallNumbers(ctx);
      const centre = centreDesMurs(walls);
      for (const w of walls) {
        const n = numeros.get(w.id);
        if (!n) continue;
        const q = placeDuNumero(w, openings, n, scale, px, centre, poche.contours, encre, libre);
        numerosPoses.set(w.id, { n, ...q });
        posees.push(q.boite);
        // Hors du poché, le numéro est un mot posé sur le blanc : il réserve
        // aussi sa place sur la carte.
        if (q.couleur !== '#FFFFFF') encre.boite(q.boite);
      }
    }

    /**
     * LE PLAFOND ANNONCE SES PASTILLES ET SES SIGLES, LUI AUSSI AVANT LES
     * COTES.
     *
     * Le sigle d'un plafonnier — « SP », « DCL », « DAAF » — n'a aucune
     * liberté : il tient sous SON symbole, sinon il ne nomme plus rien.
     * C'était écrit dans le code, et pourtant il passait EN DERNIER : il ne
     * s'écartait que de ses semblables et des disques, jamais du reste de la
     * feuille. Sur la mesure : « DAAF » sur un repère de circuit, « SP » sur
     * le cartouche « 9,0 m² ».
     *
     * Il s'inscrit donc ici, avec les mots de l'appareillage, dans le même
     * ordre des libertés — et ce sont les cotes qui s'écartent.
     */
    const plafondPose = ctx.ceiling ?? [];
    /**
     * LE DISQUE DU SYMBOLE se retient avant tout le reste.
     *
     * Un symbole de plafond ne pose plus de fond blanc, mais sa place reste
     * réservée : une cote écrite dessous se lisait à moitié — sur la
     * capture, « 243 » se lisait « 24 », le dernier chiffre mangé par le
     * spot qu'il servait justement à poser.
     */
    const pastillesPlafond: Boite[] = [];
    for (const cl of plafondPose) {
      // Un ruban LED retient son tracé, pas un disque.
      if (cl.trace && cl.trace.length >= 2) {
        encre.trait((cl.ferme ? [...cl.trace, cl.trace[0]] : cl.trace).map(px), 2.2);
        continue;
      }
      const q = px(cl.at);
      if (!dansLeCadre(q)) continue;
      const r =
        Math.max(
          RAYON_PLAFOND_MIN,
          Math.min(RAYON_PLAFOND_MAX, (CEILINGS[cl.kind].d / 2) * scale),
        ) + 2;
      pastillesPlafond.push({ x: q.x - r, y: q.y - r, w: r * 2, h: r * 2 });
      encre.disque(q, r - 2);
    }
    posees.push(...pastillesPlafond);

    /*
      LES TRAITS DU PLAFOND SE DÉCIDENT ICI, AVANT LE PREMIER MOT — relevé du
      patron : « fais pareil pour le plan électrique et le plan du plafond ».

      Les cotes de pose partaient de chaque appareil vers le mur de gauche et
      celui du haut, quoi qu'il y ait sur le chemin, et elles se traçaient en
      dernier : leur tireté barrait les « SP », les « DCL », les repères de
      circuit posés avant elles. Elles se décident donc ici, et s'encrent :
      ce qui s'écrit ensuite les évite.

        — chaque cote choisit SON MUR : à gauche ou à droite, en haut ou en
          bas — le chemin le plus blanc, le plus court à égalité. L'une ou
          l'autre pose l'appareil : on tend le mètre depuis le mur qu'on veut ;
        — une LIGNE de spots alignés ne se cote qu'une fois en travers : dix
          spots à 1,20 m du même mur, c'est une mesure, pas dix ;
        — la CHAÎNE d'une ligne (du mur au premier, entre chacun, du dernier
          au mur) s'encre elle aussi.
    */
    const cosP = Math.cos(trame);
    const sinP = Math.sin(trame);
    const rayonPlafond = (cl: CeilingFixture) =>
      Math.max(RAYON_PLAFOND_MIN, Math.min(RAYON_PLAFOND_MAX, (CEILINGS[cl.kind].d / 2) * scale));
    /*
      UNE LIGNE DE SPOTS SE COTE UNE FOIS, PAS DEUX.

      Relevé du patron, capture à l'appui : « les 3 spots au centre de la
      pièce sont recouverts de chiffres sur leur droite, on ne comprend pas
      si c'est la distance entre les spots ou autre ». La chaîne gagne dans
      l'axe de la ligne : c'est elle qu'on suit sur le chantier, cordeau
      tendu. Un spot en ligne ne porte donc plus de cote de pose DANS l'axe
      de sa ligne.
    */
    const axeDeLigne = new Map<string, { x: number; z: number }>();
    for (const row of new Set(plafondPose.map((cl) => cl.row).filter((r): r is string => !!r))) {
      const lot = plafondPose.filter((cl) => cl.row === row);
      if (lot.length < 2) continue;
      let a = lot[0];
      let b = lot[0];
      let max = -1;
      for (const u of lot) {
        for (const v of lot) {
          const dd = Math.hypot(u.at.x - v.at.x, u.at.z - v.at.z);
          if (dd > max) {
            max = dd;
            a = u;
            b = v;
          }
        }
      }
      if (max < 1e-6) continue;
      axeDeLigne.set(row, { x: (b.at.x - a.at.x) / max, z: (b.at.z - a.at.z) / max });
    }
    /** Les chaînes des lignes, segment par segment, telles qu'elles se traceront. */
    const chainesPlafond: { a: Pt; b: Pt; val: number }[] = [];
    for (const row of new Set(plafondPose.map((cl) => cl.row).filter(Boolean))) {
      const lot = plafondPose.filter((cl) => cl.row === row);
      const chaine = ceilingChain(lot, walls, trame);
      if (!chaine) continue;
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
        chainesPlafond.push({ a, b, val });
        encre.segment(a, b, 0.8);
      });
    }
    /** Les cotes de pose, chacune vers le mur au chemin le plus blanc. */
    const cotesDePlafond: { a: Pt; b: Pt; dist: number }[] = [];
    {
      const dejaEnTravers = new Map<string, number[]>();
      // Un ruban LED ne se cote pas depuis son premier point : son tracé le dit.
      for (const cl of extra?.hideCotesPose ? [] : plafondPose.filter((c) => !c.trace)) {
        const q0 = px(cl.at);
        if (!dansLeCadre(q0)) continue;
        const r = rayonPlafond(cl);
        for (const axe of [
          { x: -cosP, z: -sinP },
          { x: sinP, z: -cosP },
        ]) {
          // Dans l'axe de sa propre ligne, la chaîne dit déjà tout.
          const sien = cl.row ? axeDeLigne.get(cl.row) : undefined;
          if (sien && Math.abs(sien.x * axe.x + sien.z * axe.z) > 0.9) continue;
          let mieux: { a: Pt; b: Pt; dist: number; cout: number } | null = null;
          for (const sens of [1, -1]) {
            const dir = { x: axe.x * sens, z: axe.z * sens };
            const dist = castToWall(cl.at, dir, walls);
            if (dist === null || dist < 0.02) continue;
            const b = px({ x: cl.at.x + dir.x * dist, z: cl.at.z + dir.z * dist });
            if (!dansLeCadre(b)) continue;
            const L = Math.hypot(b.x - q0.x, b.y - q0.y) || 1;
            const depart = {
              x: q0.x + ((b.x - q0.x) / L) * (r + 1.5),
              y: q0.y + ((b.y - q0.y) / L) * (r + 1.5),
            };
            const cout = encre.leLong(depart, b) + L * 0.04;
            if (!mieux || cout < mieux.cout) mieux = { a: q0, b, dist, cout };
          }
          if (!mieux) continue;
          // Une ligne alignée se cote une fois en travers.
          if (sien) {
            const cle = `${cl.row}|${axe.x.toFixed(3)}`;
            const vus = dejaEnTravers.get(cle) ?? [];
            if (vus.some((v) => Math.abs(v - mieux!.dist) < 0.01)) continue;
            dejaEnTravers.set(cle, [...vus, mieux.dist]);
          }
          cotesDePlafond.push({ a: mieux.a, b: mieux.b, dist: mieux.dist });
          encre.segment(mieux.a, mieux.b, 0.8);
        }
      }
    }

    /*
      PLUS DE SIGLE SOUS LES APPAREILS DE PLAFOND — relevé du patron : « les
      "DCL" etc. ne sont pas utiles ». Le symbole dit déjà ce qu'est
      l'appareil, et la légende le nomme : le mot ne faisait qu'ajouter de
      l'écriture là où l'on vient lire les symboles. La table reste, vide :
      ce qui la consultait n'a plus rien à éviter.
    */
    const siglesPose = new Map<string, Boite>();

    /*
      PLUS DE MOTS À CÔTÉ DES SYMBOLES, NI SIGLES NI REPÈRES DE CIRCUIT — relevé
      du patron : « sur le plan, enlève les infos inutiles aux pros, comme les
      "C2, C4", qui ne sont pas utiles sur ce plan de cotes ». Le plan coté
      dit OÙ ; le circuit de chaque appareil se lit sur le schéma unifilaire
      et sur l'élévation de son mur, là où l'on tire les gaines.
    */

    /**
     * PUIS LE CARTOUCHE DE LA PIÈCE — avant les cotes, et il CÈDE LIGNE PAR
     * LIGNE.
     *
     * C'est la règle du dossier imprimé, et c'est celle que l'écran a
     * adoptée : « le cartouche évite les sigles, la cote évite les deux ».
     * Un nom de pièce se lit n'importe où DANS sa pièce ; une cote est
     * attachée à ce qu'elle mesure. Le papier faisait l'inverse — le
     * cartouche passait en dernier et ne cherchait qu'à monter ou descendre
     * de trente-quatre points. Quand il ne trouvait rien, il s'écrivait
     * quand même : sur la mesure, « SP » disparaissait sous « 9,0 m² ».
     *
     * DEUX LIBERTÉS, ET DANS CET ORDRE. Il se décale d'abord — en hauteur,
     * puis de côté, sans quitter sa pièce. Et s'il ne trouve toujours rien,
     * IL ABANDONNE SA SURFACE : le nom seul tient dans dix-huit points de
     * haut là où l'ensemble en demande trente. Le nom est ce qu'on cherche
     * en premier sur un plan, la surface se relit au métré.
     */
    const cartouchesPose = new Map<
      string,
      { x: number; y: number; w: number; h: number; cx: number; cy: number; avecAire: boolean }
    >();
    if (showSurfaces) {
      /*
        PLUS DISCRET — relevé du patron : « les noms de pièces sont trop
        imposants et mal placés, gênant la visibilité des éléments
        électriques ». Deux crans de moins, et il se tient à trois points de
        tout ce qui est encré (voir `candidat`).
      */
      const gros = parts.length === 1 ? 11 : 8.5;
      const petit = parts.length === 1 ? 8.5 : 7;
      /*
        LES PLACES, EN ANNEAUX AUTOUR DU MILIEU — c'est là qu'on va chercher
        le nom d'une pièce, et l'on s'en éloigne le moins possible.

        Une grille de neuf points en croix ne suffisait pas : dans une
        chambre chargée de spots et de sigles, aucune des neuf n'était libre
        et le cartouche retombait sur sa place d'origine, par-dessus un
        « SP ». On balaie donc tout le voisinage, du plus proche au plus
        loin — c'est ce que fait l'écran depuis `cotessanschoc`.
      */
      const PAS_CARTOUCHE = 9;
      const ecarts: [number, number][] = [];
      for (let i = -10; i <= 10; i++) {
        for (let j = -10; j <= 10; j++) {
          ecarts.push([i * PAS_CARTOUCHE, j * PAS_CARTOUCHE]);
        }
      }
      ecarts.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
      /**
       * IL NE SORT PAS DE SA PIÈCE.
       *
       * Un cartouche posé dans le couloir d'à côté ne nomme plus rien — et
       * il est pire qu'un cartouche gênant : on croit lire le nom de la
       * pièce où il se trouve. Le contour de la pièce, projeté sur la page,
       * borne donc la recherche.
       */
      const dansLaPiece = (contour: Pt[], q: Pt) => {
        let dedans = false;
        for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
          const a = contour[i];
          const b = contour[j];
          if (
            a.y > q.y !== b.y > q.y &&
            q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x
          ) {
            dedans = !dedans;
          }
        }
        return dedans;
      };
      for (const part of parts) {
        if (!part.surface) continue;
        const cp = px(part.labelAt);
        const label = roomNames[part.roomId] ?? '';
        const area = `${part.surface.exact ? '' : '≈ '}${fr1(part.surface.area)} m²`;
        /**
         * L'emprise du cartouche, avec ou sans sa ligne de surface — À LA
         * LARGEUR DE CE QUI S'ÉCRIT. Sans nom, la pièce dit « 21,0 m² » en
         * gras et « surface au sol » dessous : la réserve ne mesurait que la
         * surface, plus étroite que la ligne d'en dessous, et une cote venait
         * barrer « surface au sol » à l'endroit même que la réserve disait
         * libre. On mesure maintenant chaque ligne dessinée.
         */
        const emprise = (avecAire: boolean, cx: number, cy: number) => {
          const lignes: [string, number][] = label
            ? avecAire
              ? [
                  [label, gros * 1.05],
                  [area, petit],
                ]
              : [[label, gros * 1.05]]
            : avecAire
              ? [
                  [area, (parts.length === 1 ? 12 : 9) * 1.05],
                  ['surface au sol', 6.5],
                ]
              : [[area, (parts.length === 1 ? 12 : 9) * 1.05]];
          const larg =
            Math.max(...lignes.map(([t, z]) => latin1(t).length * z)) * 0.52 + 8;
          const haut = avecAire ? (label ? 23 : 25) : 14;
          return {
            x: cx - larg / 2,
            y: cy - (avecAire ? (label ? 11.5 : 12.5) : 7),
            w: larg,
            h: haut,
            cx,
            cy,
            avecAire,
          };
        };
        /*
          CE QUI SE CÈDE : la surface quand il y a un nom ; et sans nom, la
          ligne « surface au sol » — la surface reste, c'est l'information.
          Dans une entrée d'un mètre quatre-vingts, le cartouche complet ne
          trouvait de place que sur l'arc de la porte, et son fond blanc
          masquait ensuite la cote de la cloison.
        */
        const variantes = [true, false];
        const contour = (part.surface?.pts ?? []).map(px);
        /*
          ET SI RIEN N'EST LIBRE, IL EN DIT LE MOINS POSSIBLE.

          Le repli était le cartouche COMPLET à sa place d'origine : la
          pièce la plus chargée du plan — celle qui n'a justement pas de
          place — écopait de la plus grosse boîte. « 9,0 m² » s'écrivait
          alors par-dessus le sigle d'un spot. Le repli, c'est la dernière
          variante, pas la première : le nom seul.
        */
        let choisi = emprise(variantes[variantes.length - 1], cp.x, cp.y);
        let gene = true;
        /*
          SUR LE BLANC DE LA PIÈCE, pas sur un meuble ni sur un mur — voir la
          carte d'encre. Le cartouche pose un fond blanc : posé sur un canapé,
          il en effaçait la moitié, et posé contre un mur il rongeait le poché.
          On prend la place la plus proche du milieu qui ne couvre AUCUN trait
          — avec la surface d'abord, puis le nom seul ; et si toute la pièce
          est encombrée, la moins encrée, surface comprise.
        */
        /*
          ET IL LAISSE LA BANDE DES COTES. Le long de chaque mur, à l'intérieur,
          court la place où se cote une cloison ; un cartouche posé contre le
          mur la prenait toute, et la cote partait se loger dans la pièce
          voisine, en travers de ses meubles. Il s'en tient donc à quatorze
          points des murs quand il le peut — et s'en approche quand il le faut.
        */
        const entier = (b: Boite, marge = 0) =>
          contour.length < 3 ||
          [
            { x: b.x - marge, y: b.y - marge },
            { x: b.x + b.w + marge, y: b.y - marge },
            { x: b.x + b.w + marge, y: b.y + b.h + marge },
            { x: b.x - marge, y: b.y + b.h + marge },
          ].every((q) => dansLaPiece(contour, q));
        const candidat = (avecAire: boolean, propre: boolean, marge = 0) => {
          let mieux: ReturnType<typeof emprise> | null = null;
          let cout = Infinity;
          for (const [dx, dy] of ecarts) {
            const q = { x: cp.x + dx, y: cp.y + dy };
            if (contour.length >= 3 && !dansLaPiece(contour, q)) continue;
            const b = emprise(avecAire, q.x, q.y);
            if (!libre(b) || !entier(b, marge)) continue;
            // Trois points d'air autour : un nom collé à une prise la cache
            // autant qu'un nom posé dessus.
            const tache = encre.sous({ x: b.x - 3, y: b.y - 3, w: b.w + 6, h: b.h + 6 });
            if (propre) {
              if (tache === 0) return b;
              continue;
            }
            const c = tache + Math.hypot(dx, dy) * 0.05;
            if (c < cout) {
              cout = c;
              mieux = b;
            }
          }
          return mieux;
        };
        // La surface est une information : elle passe avant la bande des
        // cotes, qui sait se replier ailleurs.
        const BANDE = 14;
        const trouve =
          candidat(variantes[0], true, BANDE) ??
          candidat(variantes[0], true, BANDE / 2) ??
          candidat(variantes[0], true) ??
          candidat(variantes[1], true, BANDE) ??
          candidat(variantes[1], true) ??
          candidat(variantes[0], false) ??
          candidat(variantes[1], false);
        if (trouve) {
          choisi = trouve;
          gene = false;
        }
        /*
          UNE PIÈCE SATURÉE GARDE SON NOM, ET C'EST LE SIGLE QUI S'EFFACE.

          Le cas est réel et il est extrême : une chambre où seize appareils
          de plafond, leurs sigles et l'appareillage des quatre murs ne
          laissent pas dix-huit points de libre. Il faut trancher, et le
          partage se fait sur CE QUI SE RETROUVE AILLEURS.

          Le sigle « SP » se retrouve : son symbole reste dessiné, et la
          légende de la feuille dit ce qu'est ce symbole. Le nom de la pièce,
          lui, n'est écrit qu'une fois sur tout le dossier — le perdre, c'est
          lire un plan de logement sans savoir quelle pièce on regarde. Le
          cartouche pose donc son fond, et les sigles qu'il recouvrirait ne
          s'écrivent pas : mieux vaut un sigle absent que deux mots empilés,
          où l'on croit avoir lu les deux.
        */
        if (gene) {
          for (const [id, b] of [...siglesPose]) {
            const dessous =
              choisi.x < b.x + b.w &&
              choisi.x + choisi.w > b.x &&
              choisi.y < b.y + b.h &&
              choisi.y + choisi.h > b.y;
            if (!dessous) continue;
            siglesPose.delete(id);
            const i = posees.indexOf(b);
            if (i >= 0) posees.splice(i, 1);
          }
        }
        // Réservé aux MOTS, pas encré : son fond blanc masquera les traits qui
        // passent derrière lui — voir « un cartouche n'est pas un mot nu ».
        posees.push(choisi);
        cartouchesPiece.push(choisi);
        cartouchesPose.set(part.roomId, choisi);
      }
    }

    // Meubles : contour + symbole d'architecte, tels qu'encrés plus haut.
    // SANS LEUR NOM — relevé du patron : « enlève le nom des meubles ». La
    // silhouette dit ce qu'est un lit ou une table ; le mot ajoutait de
    // l'écriture là où le plan coté doit d'abord laisser lire ses cotes.
    for (const m of meublesDuPlan) {
      d.poly(m.contour, '#FFFFFF', '#9FACBF', 0.8);
      for (const t of m.traits) d.path(t, 0.7, '#9FACBF');
    }

    /*
      LA MAÇONNERIE, D'UN SEUL TENANT — comme à l'écran (voir
      `pocheDesMurs`) : les murs se fondent à leurs jonctions, les façades
      prennent leur épaisseur vers le dehors, les baies sont des vides.
    */
    d.contoursPleins(poche.contours.map((c) => c.map(px)), INK);

    /*
      LES RECOINS TECHNIQUES, POCHÉS COMME LA MAÇONNERIE — la même encre
      qu'à l'écran. Un vide blanc au milieu d'un plan imprimé se lit comme
      une pièce qu'on aurait oublié de nommer ; c'est du plein.
    */
    for (const contour of massifs) {
      d.poly(contour.map(px), INK, null);
    }

    // Ouvertures : les traits calculés plus haut, tels qu'encrés.
    for (const t of traitsMenuiserie) d.path(t.pts, t.w, t.c);

    /*
      LES COTES SE RANGENT COMME CHEZ L'ARCHITECTE.

      Relevé du patron : « trop d'éléments se chevauchent sur le plan coté ;
      essaie une technique de placement plus épurée, en gardant chaque cote
      et notes ». La cause tenait en une ligne : chaque mur se cotait « vers
      l'extérieur de SA pièce ». Pour une façade, c'est dehors ; pour une
      cloison, c'est EN PLEINE PIÈCE VOISINE — un trait de trois mètres en
      travers de la chambre, qui barrait son cartouche et ses meubles, et dont
      la valeur, faute de place, finissait souvent par s'effacer.

      Trois familles, trois places :

        — LES FAÇADES se cotent dehors, en deux chaînes parallèles : la plus
          proche détaille les pleins et les baies (c'est là que se lit la
          largeur d'une fenêtre), la plus éloignée donne la longueur de
          chaque mur. Rien n'entre dans le logement ;
        — LES CLOISONS portent une cote COURTE, collée à leur face, du côté
          et à l'endroit où elle ne coupe ni meuble, ni arc, ni mot — la
          carte d'encre arbitre, et la valeur glisse le long du trait ;
        — LES PORTES INTÉRIEURES disent leur largeur du côté où le battant
          ne tourne pas : son arc est de l'encre, l'autre côté est le
          passage, toujours libre.

      Et aucune valeur ne s'efface : si rien n'est parfaitement blanc, c'est
      la place la moins encombrée qui gagne.
    */
    if (showDims) {
      const partsAvecSurface = parts.filter((pt) => (pt.surface?.pts ?? []).length >= 3);
      const surfacesPieces = partsAvecSurface.map((pt) => pt.surface!.pts);
      const dansUnePiece = (q: { x: number; z: number }) =>
        surfacesPieces.some((poly) => dansLePoche(q, [poly]));
      const centrePlan = centreDesMurs(walls);
      const TEXTE_COTE = '#2B313B';
      const TRAIT_COTE = '#6B7380';
      const unitaire = (v: Pt): Pt => {
        const l = Math.hypot(v.x, v.y) || 1;
        return { x: v.x / l, y: v.y / l };
      };
      /** L'angle de lecture d'un trait : jamais la tête en bas. */
      const angleDe = (a: Pt, b: Pt) => {
        let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        if (ang > 90) ang -= 180;
        // Une cote verticale se lit depuis la droite de la feuille, toujours
        // (−90° la retournait : à gauche du bas vers le haut, à droite du
        // haut vers le bas — revues du dossier).
        if (ang <= -89.5) ang += 180;
        return ang;
      };
      /** La normale d'un mur, sur la page, du côté `cote` (+1 ou −1). */
      const normalePage = (w: WallSeg, cote: number): Pt => {
        const dx = w.b.x - w.a.x;
        const dz = w.b.z - w.a.z;
        const L = Math.hypot(dx, dz) || 1;
        const m = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
        const p0 = px(m);
        const p1 = px({ x: m.x + (-dz / L) * cote, z: m.z + (dx / L) * cote });
        return unitaire({ x: p1.x - p0.x, y: p1.y - p0.y });
      };
      const plus = (a: Pt, v: Pt, k: number): Pt => ({ x: a.x + v.x * k, y: a.y + v.y * k });
      const trace = (a: Pt, b: Pt, w: number, c: string) => {
        d.line(a.x, a.y, b.x, b.y, w, c);
        encre.segment(a, b, Math.max(0.8, w));
      };
      /**
       * CE TRAIT TRAVERSE-T-IL UN MOT DÉJÀ POSÉ ? — bouts compris. La carte
       * d'encre compte les traits sous un mot ; ici, c'est l'inverse : un trait
       * qu'on s'apprête à tirer ne doit barrer aucune étiquette réservée,
       * même par le tiret de son extrémité, qui dépasse de part et d'autre.
       */
      /*
        UN CARTOUCHE N'EST PAS UN MOT NU : il pose son fond blanc par-dessus
        tout le reste. Un trait de cote qui passe derrière lui s'interrompt
        proprement — c'est ainsi qu'un dessinateur coupe sa ligne pour écrire
        le nom d'une pièce. Le traverser coûte peu ; barrer un mot nu, tout.
      */
      const fondsBlancs = new Set(cartouchesPiece);
      const barreUnMot = (a: Pt, b: Pt, deborde = 3) => {
        const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ux = (b.x - a.x) / L;
        const uy = (b.y - a.y) / L;
        const n = Math.ceil((L + deborde * 2) / 0.75);
        let k = 0;
        for (let i = 0; i <= n; i++) {
          const s = -deborde + (i * (L + deborde * 2)) / n;
          const x = a.x + ux * s;
          const y = a.y + uy * s;
          for (const o of posees) {
            if (x > o.x + 0.3 && x < o.x + o.w - 0.3 && y > o.y + 0.3 && y < o.y + o.h - 0.3) {
              k += fondsBlancs.has(o) ? 0.01 : 1;
              break;
            }
          }
        }
        return k;
      };
      /** Le tiret à 45° d'une extrémité de cote. */
      const tiret = (P: Pt, u: Pt, n: Pt, t: number, w: number, c: string) =>
        trace(
          { x: P.x - (u.x + n.x) * t, y: P.y - (u.y + n.y) * t },
          { x: P.x + (u.x + n.x) * t, y: P.y + (u.y + n.y) * t },
          w,
          c,
        );
      /**
       * ÉCRIRE UNE VALEUR : parmi ses places, la plus blanche. Elles sont
       * nombreuses — de part et d'autre du trait, le long du trait, au-delà
       * de ses bouts —, et sur un logement réel l'une d'elles est toujours
       * libre (le banc `planepure` le tient : aucune cote ne cède). Si
       * VRAIMENT chacune tombe sur un autre mot — vingt retours de douze
       * centimètres côte à côte —, la valeur cède : un chiffre imprimé sur
       * un autre ne se lit pas, et fait douter des deux.
       */
      const ecrire = (
        txt: string,
        places: Pt[],
        taille: number,
        angle: number,
        couleur: string,
        surcout: (k: number) => number = () => 0,
      ) => {
        let mieux: { base: Pt; boite: Boite } | null = null;
        let cout = Infinity;
        places.forEach((c, k) => {
          const q = boiteDuMot(txt, c.x, c.y, taille, angle);
          if (!dansLaFenetre(q.boite)) return;
          const chocs = posees.filter(
            (o) =>
              q.boite.x < o.x + o.w + 1.5 &&
              o.x < q.boite.x + q.boite.w + 1.5 &&
              q.boite.y < o.y + o.h + 1.5 &&
              o.y < q.boite.y + q.boite.h + 1.5,
          ).length;
          const v = chocs * 10000 + encre.sous(q.boite) * 20 + surcout(k);
          if (v < cout) {
            cout = v;
            mieux = q;
          }
        });
        const pose = mieux as { base: Pt; boite: Boite } | null;
        if (!pose || cout >= 10000) return;
        reserver(pose.boite);
        d.text(txt, pose.base.x, pose.base.y, taille, couleur, { angle });
      };

      // Quelle baie appartient à quel mur : celui dont l'axe la porte.
      const baiesDuMur = new Map<string, WallSeg[]>();
      for (const o of openings) {
        let mieux: WallSeg | null = null;
        let ecart = Infinity;
        for (const w of walls) {
          const da = pointOnSeg(o.a, w.a, w.b);
          const db = pointOnSeg(o.b, w.a, w.b);
          const tol = Math.max(epaisseurDe(w), 0.1);
          if (da.dist > tol || db.dist > tol) continue;
          if (da.t < -0.02 || da.t > 1.02 || db.t < -0.02 || db.t > 1.02) continue;
          if (da.dist + db.dist < ecart) {
            ecart = da.dist + db.dist;
            mieux = w;
          }
        }
        if (!mieux) continue;
        baiesDuMur.set(mieux.id, [...(baiesDuMur.get(mieux.id) ?? []), o]);
      }

      /** De quel côté est le dehors : +1, −1, ou 0 pour une cloison. */
      const coteDehors = (w: WallSeg): number => {
        const dx = w.b.x - w.a.x;
        const dz = w.b.z - w.a.z;
        const L = Math.hypot(dx, dz) || 1;
        const n = { x: -dz / L, z: dx / L };
        const h = epaisseurDe(w) / 2 + 0.3;
        /*
          LE DEHORS, PAS SEULEMENT « PAS UNE PIÈCE » — revue « Claire » :
          derrière les retours d'un coffre de cheminée ou les murs d'un
          placard, il n'y a pas de pièce, mais ce n'est pas la rue. Ces murs
          prenaient une chaîne de façade, tirée dans le poché. Ils se cotent
          maintenant comme des cloisons, du côté de la pièce.
        */
        const dehors = (sgn: number) =>
          [0.25, 0.5, 0.75].every((t) => {
            const m = { x: w.a.x + dx * t, z: w.a.z + dz * t };
            const q = { x: m.x + n.x * sgn * h, z: m.z + n.z * sgn * h };
            return !dansUnePiece(q) && !dansLeBati(walls, q);
          });
        const p = dehors(1);
        const m = dehors(-1);
        if (p && !m) return 1;
        if (m && !p) return -1;
        if (p && m) {
          const mid = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
          return n.x * (mid.x - centrePlan.x) + n.z * (mid.z - centrePlan.z) >= 0 ? 1 : -1;
        }
        return 0;
      };

      // Les grandes cotes d'abord : à égalité de place, elles gagnent.
      const parLongueur = [...walls].sort((u, v) => segLength(v) - segLength(u));

      // ------------------------------------------------ les façades, dehors
      const RANG_BAIES = 11;
      const RANG_MURS = 27;
      for (const w of parLongueur) {
        const sgn = coteDehors(w);
        if (sgn === 0) continue;
        const a = px(w.a);
        const b = px(w.b);
        const u = unitaire({ x: b.x - a.x, y: b.y - a.y });
        const n = normalePage(w, sgn);
        // Du trait au bord du poché : le nu extérieur (toute l'épaisseur pour
        // un mur relevé d'un côté), puis la surépaisseur de façade.
        const facesW = demiFacesDe(walls, w);
        const E = ((sgn > 0 ? facesW.plus : facesW.moins) + SUREPAISSEUR_FACADE) * scale;
        const angle = angleDe(a, b);
        // Au nu pour un mur dessiné : la cote de l'écran (revue « Léa »),
        // avec ses pièces — un pan coupé n'a pas un demi-mur à chaque bout
        // (revue « Claire » : 2,48 au lieu de 2,68).
        const L = longueurCotee(walls, w, parts);
        /*
          LA CHAÎNE VA D'UN NU À L'AUTRE — revue « Claire » : ses attaches
          partaient des axes (5,06 m mesurés au kutch sous « 4,80 »), et ses
          pleins se comptaient au prorata de l'axe — 0,86 / 1,00 au lieu de
          0,68 / 1,05, une chaîne de 4,93 sous un total de 4,80. Les bornes
          sont les nus ; chaque plein se mesure en mètres réels.
        */
        // Pour tout mur, plus seulement un mur dessiné — revue « Sandrine » :
        // sur un plan scanné, le dernier plein se mesurait jusqu'à l'axe du
        // refend (« 1,00 / 1,40 / 2,65 » sous un total de 5,00). Le retrait
        // d'un coin vaut zéro contre la face d'un mur relevé (`retraitDuCoin`).
        const Lax = segLength(w) || 1;
        const t0nu = Math.min(0.5, retraitDuCoin(walls, w, w.a) / Lax);
        const t1nu = Math.max(0.5, 1 - retraitDuCoin(walls, w, w.b) / Lax);
        const surMur = (tt: number) => ({ x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt });
        const aNu = surMur(t0nu);
        const bNu = surMur(t1nu);

        // La chaîne des murs : la longueur de chacun.
        const A2 = plus(aNu, n, E + RANG_MURS);
        const B2 = plus(bNu, n, E + RANG_MURS);
        trace(plus(aNu, n, E + 2), plus(aNu, n, E + RANG_MURS + 3), 0.6, GREY);
        trace(plus(bNu, n, E + 2), plus(bNu, n, E + RANG_MURS + 3), 0.6, GREY);
        trace(A2, B2, 0.8, INK);
        tiret(A2, u, n, 3.2, 1, INK);
        tiret(B2, u, n, 3.2, 1, INK);
        const mil2 = { x: (A2.x + B2.x) / 2, y: (A2.y + B2.y) / 2 };
        ecrire(
          `${frLen(L)} m`,
          [6.5, 15, 24].flatMap((k) =>
            [0, -0.22, 0.22].map((g) => plus(plus(mil2, n, k), u, g * Math.hypot(b.x - a.x, b.y - a.y))),
          ),
          8.5,
          angle,
          INK,
          (k) => k * 3,
        );

        // La chaîne des baies : pleins et vides, au plus près de la façade.
        const baies = (baiesDuMur.get(w.id) ?? [])
          .map((o) => {
            const ta = pointOnSeg(o.a, w.a, w.b).t;
            const tb = pointOnSeg(o.b, w.a, w.b).t;
            return { o, t0: Math.max(t0nu, Math.min(ta, tb)), t1: Math.min(t1nu, Math.max(ta, tb)) };
          })
          .sort((x, y) => x.t0 - y.t0);
        if (baies.length === 0) continue;
        // Les positions restent celles du mur entier (0 à 1, d'axe à axe).
        const A1 = plus(a, n, E + RANG_BAIES);
        const B1 = plus(b, n, E + RANG_BAIES);
        trace(plus(aNu, n, E + RANG_BAIES), plus(bNu, n, E + RANG_BAIES), 0.6, TRAIT_COTE);
        const morceaux: { t0: number; t1: number; o?: WallSeg }[] = [];
        let t = t0nu;
        for (const bb of baies) {
          if (bb.t0 > t + 1e-4) morceaux.push({ t0: t, t1: bb.t0 });
          morceaux.push({ t0: bb.t0, t1: bb.t1, o: bb.o });
          t = Math.max(t, bb.t1);
        }
        if (t < t1nu - 1e-4) morceaux.push({ t0: t, t1: t1nu });
        const surLigne = (tt: number) => ({
          x: A1.x + (B1.x - A1.x) * tt,
          y: A1.y + (B1.y - A1.y) * tt,
        });
        const bornes = new Set<number>();
        for (const m of morceaux) {
          bornes.add(m.t0);
          bornes.add(m.t1);
        }
        for (const tt of bornes) {
          const P = surLigne(tt);
          tiret(P, u, n, 2.4, 0.8, TRAIT_COTE);
          // Les bords des baies se rappellent jusqu'à la façade.
          if (tt > t0nu + 1e-4 && tt < t1nu - 1e-4) {
            const F = { x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt };
            trace(plus(F, n, E + 2), plus(F, n, E + RANG_BAIES + 2.5), 0.5, GREY);
          }
        }
        const longPage = Math.hypot(b.x - a.x, b.y - a.y);
        for (const m of morceaux) {
          const valeur = m.o ? segLength(m.o) : (m.t1 - m.t0) * Lax;
          if (!m.o && valeur < 0.05) continue;
          const txt = frLen(valeur);
          const centre = surLigne((m.t0 + m.t1) / 2);
          const place = (m.t1 - m.t0) * longPage;
          const largeurTxt = txt.length * 7 * 0.5;
          const places = [
            plus(centre, n, 5.2),
            plus(centre, n, -4.6),
            plus(plus(centre, n, 5.2), u, place / 2 + largeurTxt / 2 + 2),
            plus(plus(centre, n, 5.2), u, -(place / 2 + largeurTxt / 2 + 2)),
          ];
          // Un plein trop court pour sa valeur se déduit des autres : il se
          // tait plutôt que de se loger chez le voisin. Une baie, jamais.
          if (!m.o && place < largeurTxt + 3) continue;
          ecrire(txt, places, 7, angle, TEXTE_COTE, (k) => k * 6);
        }
      }

      /*
        L'ORDRE DES LIBERTÉS, ICI AUSSI : la largeur d'une porte ne peut pas
        s'éloigner de sa porte, la cote d'une cloison peut glisser le long de
        tout son mur. La porte se pose donc d'abord.
      */
      // -------------------------------- les menuiseries hors des façades
      const enFacade = new Set(
        walls.filter((w) => coteDehors(w) !== 0).flatMap((w) => (baiesDuMur.get(w.id) ?? []).map((o) => o.id)),
      );
      for (const o of openings) {
        if (enFacade.has(o.id)) continue;
        const a = px(o.a);
        const b = px(o.b);
        const longPage = Math.hypot(b.x - a.x, b.y - a.y);
        if (longPage < 4) continue;
        const u = unitaire({ x: b.x - a.x, y: b.y - a.y });
        const angle = angleDe(a, b);
        const porteur = walls.find((w) => (baiesDuMur.get(w.id) ?? []).includes(o));
        // Du trait au nu, de chaque côté : celui d'un mur relevé d'un côté
        // est sa face (voir `facesDesMurs`).
        const facesP = porteur ? demiFacesDe(walls, porteur) : { plus: WALL_T / 2, moins: WALL_T / 2 };
        const txt = frLen(segLength(o));
        let mieux: { A: Pt; B: Pt; n: Pt; texte: Pt; cout: number; dansLaBaie?: boolean } | null =
          null;
        /*
          DANS LA BAIE MÊME, quand le mur est assez épais pour porter le
          chiffre : entre ses deux tableaux, le vide est toujours blanc, et
          ses bords disent déjà ce qui est mesuré — c'est ainsi qu'on cote à
          la main une porte serrée entre deux pièces chargées. Pas de trait.
        */
        {
          const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const q = boiteDuMot(txt, c.x, c.y, 7, angle);
          if (dansLaFenetre(q.boite) && libre(q.boite) && encre.sous(q.boite) === 0) {
            mieux = { A: c, B: c, n: { x: 0, y: 0 }, texte: c, cout: 6, dansLaBaie: true };
          }
        }
        for (const sgn of [1, -1]) {
          const n = normalePage(porteur ?? o, sgn);
          const F = (sgn > 0 ? facesP.plus : facesP.moins) * scale;
          for (const off of [5, 10, 15, 21]) {
            const A = plus(a, n, F + off);
            const B = plus(b, n, F + off);
            const encreTrait = encre.leLong(plus(A, u, 1.5), plus(B, u, -1.5));
            const barre = barreUnMot(A, B);
            /*
              Au milieu de la baie, puis de part et d'autre — et, en dernier
              recours, AU-DELÀ de ses bords, contre le tiret : c'est ainsi
              qu'on cote à la main une baie trop étroite pour son chiffre.
            */
            for (const t of [0.5, 0.3, 0.7, -0.35, 1.35, -0.6, 1.6]) {
              const c = plus({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t }, n, 4.4);
              const q = boiteDuMot(txt, c.x, c.y, 7, angle);
              if (!dansLaFenetre(q.boite)) continue;
              const chocs = libre(q.boite) ? 0 : 1;
              const cout =
                chocs * 10000 +
                encre.sous(q.boite) * 20 +
                encreTrait * 3 +
                barre * 400 +
                off * 0.4 +
                Math.abs(t - 0.5) * 10;
              if (!mieux || cout < mieux.cout) mieux = { A, B, n, texte: c, cout };
            }
          }
        }
        if (!mieux) continue;
        const { A, B, n } = mieux;
        if (!mieux.dansLaBaie) {
          trace(A, B, 0.6, TRAIT_COTE);
          tiret(A, u, n, 2.4, 0.8, TRAIT_COTE);
          tiret(B, u, n, 2.4, 0.8, TRAIT_COTE);
        }
        ecrire(txt, [mieux.texte], 7, angle, TEXTE_COTE);
      }

      // ------------------------------------------- les cloisons, collées
      /*
        LES COTES À L'ÉTROIT D'ABORD — revue « Claire » : la profondeur d'un
        placard, plus courte que son chiffre, n'a que quelques places autour
        de ses bouts ; posée après les grandes, elle les trouvait prises et
        allait se loger dans la pièce voisine. Une grande cote glisse le long
        de tout son mur : elle cède la place.
      */
      const etroite = (w: WallSeg) =>
        `${frLen(longueurCotee(walls, w, parts))} m`.length * 7.5 * 0.5 > Math.hypot(px(w.b).x - px(w.a).x, px(w.b).y - px(w.a).y) - 4;
      const cloisons = parLongueur.filter((w) => coteDehors(w) === 0);
      const parPlace = [...cloisons.filter(etroite).reverse(), ...cloisons.filter((w) => !etroite(w))];
      // Les pièces sur la feuille : une cote reste dans la pièce de son mur.
      const piecesPage = surfacesPieces.map((poly) =>
        poly.map((p) => {
          const q = px(p);
          return { x: q.x, z: q.y };
        }),
      );
      const pieceDuPoint = (P: Pt) => piecesPage.findIndex((poly) => dansLePoche({ x: P.x, z: P.y }, [poly]));
      for (const w of parPlace) {
        const a = px(w.a);
        const b = px(w.b);
        const longPage = Math.hypot(b.x - a.x, b.y - a.y);
        if (longPage < 4) continue;
        const u = unitaire({ x: b.x - a.x, y: b.y - a.y });
        const angle = angleDe(a, b);
        const facesC = demiFacesDe(walls, w);
        const txt = `${frLen(longueurCotee(walls, w, parts))} m`;
        /*
          LES LIGNES D'ATTACHE D'UNE COTE ÉCARTÉE — revue « Claire » : la
          profondeur d'un placard, cotée à un centimètre de papier de son mur,
          flottait seule dans la pièce voisine, sans rien qui dise ce qu'elle
          mesure. Un bout de trait qu'aucun mur de travers ne rejoint reçoit
          sa ligne d'attache, du mur au trait. Elle peut croiser un trait,
          comme à la main ; barrer un mot lui coûte, et sa longueur aussi.
        */
        const tolerance = 0.06 * scale;
        /** Jusqu'où, du côté n, un mur de travers prolonge le bout P du mur. */
        const porteeAuBout = (P: Pt, n: Pt) => {
          let m = 0;
          for (const o of walls) {
            if (o.id === w.id || (o.type !== undefined && o.type !== 'wall')) continue;
            const oa = px(o.a);
            const ob = px(o.b);
            const lo = Math.hypot(ob.x - oa.x, ob.y - oa.y);
            if (lo < 1e-6) continue;
            const uo = { x: (ob.x - oa.x) / lo, y: (ob.y - oa.y) / lo };
            if (Math.abs(u.x * uo.y - u.y * uo.x) < 0.5) continue;
            const t = (P.x - oa.x) * uo.x + (P.y - oa.y) * uo.y;
            if (t < -tolerance || t > lo + tolerance) continue;
            if (Math.abs((P.x - oa.x) * uo.y - (P.y - oa.y) * uo.x) > tolerance) continue;
            m = Math.max(m, (oa.x - P.x) * n.x + (oa.y - P.y) * n.y, (ob.x - P.x) * n.x + (ob.y - P.y) * n.y);
          }
          return m;
        };
        /*
          UNE COTE PLUS COURTE QUE SON CHIFFRE l'écrit au-delà d'un bout de
          son trait, dans son prolongement : c'est ainsi qu'on cote à la main
          la profondeur d'un placard, plutôt que de l'envoyer flotter dans la
          pièce voisine (revue « Claire »).
        */
        const longueurMot = txt.length * 7.5 * 0.5;
        const courte = longueurMot > longPage - 4;
        const audela = courte ? [-(longueurMot / 2 + 3) / longPage, 1 + (longueurMot / 2 + 3) / longPage] : [];
        // Et elle reste près de son mur : loin, rien ne dit plus ce qu'elle mesure.
        const ecarts = [6, 11, 16, 22, 28, 34].filter((o) => !courte || o <= Math.max(11, longPage));
        let mieux: {
          A: Pt;
          B: Pt;
          n: Pt;
          texte: Pt;
          cout: number;
          taille: number;
          attaches: (readonly [Pt, Pt])[];
          mot: string;
        } | null = null;
        for (const sgn of [1, -1]) {
          const n = normalePage(w, sgn);
          const F = (sgn > 0 ? facesC.plus : facesC.moins) * scale;
          const portees = [porteeAuBout(a, n), porteeAuBout(b, n)];
          const pieceDuBord = pieceDuPoint(plus({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, n, F + 1.5));
          /*
            LA COTE DE LA FACE QU'ON A SOUS LES YEUX — revue « Sandrine » : un
            refend coupé à la jonction de deux pièces se cotait au plus long
            de ses deux côtés, toutes pièces confondues (3,54 m côté chambre
            pour une chambre de 3,50). Écrite d'un côté, elle cote la pièce
            de ce côté.
          */
          const pieceIci = pieceDuBord >= 0 ? partsAvecSurface[pieceDuBord] : undefined;
          const longueurIci = pieceIci ? longueurCotee(walls, w, [pieceIci]) : null;
          const txtIci = longueurIci !== null ? `${frLen(longueurIci)} m` : txt;
          // De ce côté, le mur n'est qu'un tronçon d'une face plus longue : on
          // n'y écrit pas un morceau, on cote de l'autre côté.
          const entiere = pieceIci ? faceEntiere(w, pieceIci) : null;
          const troncon = longueurIci !== null && entiere !== null && entiere > longueurIci + 0.02 ? 5000 : 0;
          for (const off of ecarts) {
            const A = plus(a, n, F + off);
            const B = plus(b, n, F + off);
            // Les bouts du trait passent dans les murs qu'il rejoint : on ne
            // compte que la portée libre.
            const rogne = Math.min(longPage / 3, F + 4);
            const encreTrait = encre.leLong(plus(A, u, rogne), plus(B, u, -rogne));
            const barre = barreUnMot(A, B);
            const attaches = (
              [
                [a, A, portees[0]],
                [b, B, portees[1]],
              ] as const
            )
              .filter(([, , portee]) => portee < F + off - 1)
              .map(([P, Q]) => [plus(P, n, F + 1), plus(Q, n, 1.5)] as const);
            const coutAttaches = attaches.reduce(
              (s, [P, Q]) =>
                s + encre.leLong(plus(P, n, 0.5), plus(Q, n, -2.5)) * 0.3 + barreUnMot(P, Q, 0) * 150 + off * 0.4,
              0,
            );
            for (const [t, cote, taille] of [0.5, 0.38, 0.62, 0.26, 0.74, 0.16, 0.84, 0.08, 0.92, -0.14, 1.14, ...audela].flatMap((tt) =>
              // Le mot se pose au-delà du trait — ou, quand le trait est assez
              // loin du mur, entre les deux ; et un cran plus petit s'il le faut.
              [7.5, 6.5].flatMap((z) => (off >= 14 ? [[tt, 1, z], [tt, -1, z]] : [[tt, 1, z]])),
            )) {
              const c = plus({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t }, n, (taille * 0.64) * cote);
              const q = boiteDuMot(txtIci, c.x, c.y, taille, angle);
              if (!dansLaFenetre(q.boite)) continue;
              const chocs = libre(q.boite) ? 0 : 1;
              const cout =
                chocs * 10000 +
                encre.sous(q.boite) * 20 +
                encreTrait * 2.5 +
                barre * 400 +
                coutAttaches +
                (pieceDuBord >= 0 && pieceDuPoint(c) !== pieceDuBord ? 3000 : 0) +
                troncon +
                off * 0.5 +
                Math.abs(t - 0.5) * 14 +
                (taille < 7.5 ? 25 : 0);
              if (!mieux || cout < mieux.cout) mieux = { A, B, n, texte: c, cout, taille, attaches, mot: txtIci };
            }
          }
        }
        if (!mieux) continue;
        const { A, B, n } = mieux;
        for (const [P, Q] of mieux.attaches) trace(P, Q, 0.4, TRAIT_COTE);
        trace(A, B, 0.6, TRAIT_COTE);
        tiret(A, u, n, 2.6, 0.8, TRAIT_COTE);
        tiret(B, u, n, 2.6, 0.8, TRAIT_COTE);
        ecrire(mieux.mot, [mieux.texte], mieux.taille, angle, TEXTE_COTE);
      }

    }

    // ------------------------------------------------- plan des gaines
    // Le cheminement passe SOUS les symboles : c'est un tracé de chantier,
    // pas une annotation. En tireté fin, il se lit sans manger le plan, et
    // il se superpose au métré du tableau de tirage — même source, mêmes
    // longueurs.
    if (ctx.routes && ctx.routes.length > 0) {
      /*
        LES GAINES S'ÉCARTENT EN FAISCEAU — voir `ecarterLesGaines`.

        Elles partent toutes du même tableau et longent le même contour :
        tracées telles quelles, trois départs font un seul tireté. L'écart se
        referme sur l'appareil, pour que chaque gaine finisse exactement sur
        le symbole qu'elle alimente.
      */
      for (const r of gainesDuPlan) {
        if (r.path.length < 2) continue;
        // Un tireté fin : lisible sans manger le plan, et distinct du trait
        // plein des murs comme du pointillé des passages.
        //
        // À LA COULEUR DE SON CIRCUIT — revues du dossier : les six départs
        // avaient le même bleu, quand le tableau de tirage juste au-dessus
        // les distingue chacun par sa teinte.
        const repere = ctx.circuitsDesAppareils?.get(r.id);
        d.dashedPath(r.path.map(px), 0.7, repere ? markColor(repere) : '#2F6BFF', [4, 3]);
      }
    }

    /*
      LES LIENS S'ÉCARTENT DES SYMBOLES — voir `horsDesDisques`. Chaque
      symbole, mural ou de plafond, retient son disque et sa marge ; un lien
      qui le traverse s'interrompt, et reprend de l'autre côté.
    */
    const disquesElec: { x: number; y: number; r: number }[] = [];
    for (const { f, face, along, postes } of unites) {
      const q = px(facePoint(face, Math.max(0, Math.min(face.len, along)), sortieDuMur(f.id)));
      disquesElec.push({ x: q.x, y: q.y, r: rayonDuSymbole(postes.length) + MARGE_LIEN });
      // Son « ×2 » aussi, posé à droite du symbole : un lien ne le barre pas.
      if (symboleCompact(postes, f.kind).fois) {
        disquesElec.push({ x: q.x + 7.7, y: q.y + 5.3, r: 4.5 + MARGE_LIEN });
      }
    }
    for (const cl of ctx.ceiling ?? []) {
      const q = px(cl.at);
      disquesElec.push({ x: q.x, y: q.y, r: rayonPlafond(cl) + MARGE_LIEN });
    }
    // Le mot d'un symbole aussi : un lien ne barre pas « RJ45 ».
    for (const mot of motsDesSymboles.values()) {
      const l = mot.texte.length * mot.taille * 0.5;
      const h = mot.taille * 0.72;
      disquesElec.push({ x: mot.base.x, y: mot.base.y + h / 2, r: Math.hypot(l, h) / 2 + MARGE_LIEN });
    }
    const tracerLien = (pts: Pt[]) => {
      for (const morceau of horsDesDisques(pts, disquesElec)) {
        d.dashedPath(morceau, LIEN_LARGEUR, ENCRE_ELEC, [3, 2.2], LIEN_ALPHA);
      }
    };

    // ------------------------------------------- appareillage électrique
    // Même convention qu'à l'écran : le symbole se pose DANS la pièce,
    // devant la face qui le porte, relié au mur par un filet. Les appareils
    // qui tombent au même point s'échelonnent le long de ce filet.
    if (ctx.fixtures && ctx.fixtures.length > 0) {
      /*
        LES LIENS MURAUX D'ABORD — même règle que le plafond : ils passent
        SOUS les symboles, jamais dessus. Et le filet s'ancre LÀ OÙ EST le
        symbole (0,2 + rang × 0,24 du mur) : ancré à 0,16 fixe, il
        s'arrêtait vingt-huit centimètres avant un appareil échelonné.
      */
      const sortie = (g: Fixture) => sortieDuMur(g.id);
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
          tracerLien(linkCurve({ x: de.x, z: de.z }, { x: vers.x, z: vers.z }).map(px));
        }
      }
      for (const { f, face, along, postes } of unites) {
        // Une cote d'appareil devenue folle — un mur recoupé depuis la pose,
        // par exemple — enverrait son symbole à l'autre bout de la feuille.
        // On la borne à la face, et on jette ce qui sortirait du cadre.
        const x = Math.max(0, Math.min(face.len, along));
        const anchor = px(facePoint(face, x, 0.02));
        const q = px(facePoint(face, x, sortieDuMur(f.id)));
        if (!dansLeCadre(q)) continue;
        /*
          LE SYMBOLE REGARDE SON MUR, ET SON FILET S'ARRÊTE AVANT LUI —
          relevé du patron : « les icônes doivent être tournées de façon à
          comprendre sur quel mur elles se posent », et « le trait rouge ne
          doit pas traverser l'icône mais s'arrêter 1 px avant ». Tous
          étaient posés droits, tige vers le bas de la feuille : à l'envers
          sur le mur du haut, en travers sur ceux de côté. Le jeu : la
          demi-épaisseur de la tige (0,45) et du filet (0,3), à bouts ronds,
          plus un pixel d'air (0,75 point).
        */
        const { symbole, fois } = symboleCompact(postes, f.kind);
        const { versLeMur, bout } = filetJusquAuSymbole(anchor, q, symbole, ECHELLE_SYMBOLE, 0.45 + 0.3 + 0.75);
        if (bout) d.path([anchor, bout], 0.6, ENCRE_ELEC);
        /*
          PLUS DE PASTILLE BLANCHE SOUS LE SYMBOLE — relevé du patron :
          « enlève le bloc blanc derrière les icônes des éléments
          électriques ».

          Elle protégeait le symbole des hachures du mur, et elle perçait le
          mur : une rangée de disques blancs mangeait la maçonnerie qu'on
          est venu lire. Le symbole se pose au nu du mur, du côté de la
          pièce, où le fond est clair de toute façon.
        */
        /*
          UN SYMBOLE, ET SON NOMBRE — relevé du patron : « si 3 prises en
          bloc de 3, mettre l'icône prise avec un "x3" en petit à côté ».
        */
        // L'interrupteur général garde son violet, comme dans la légende.
        const teintePropre = FIXTURES[f.kind].teintePropre;
        if (teintePropre) drawSymbol(d, symbole, q.x, q.y, ECHELLE_SYMBOLE, teintePropre, 0.9, versLeMur);
        else drawSymbol(d, symbole, q.x, q.y, ECHELLE_SYMBOLE, ENCRE_ELEC, 0.9, versLeMur);
        /*
          LE MOT DE L'ARCHITECTE — « 2 », « RJ45 », « LV »… — écrit droit, à
          la place retenue avant les cotes (voir plus haut).
        */
        const libelle = libelleDuSymbole(postes, f.kind, f.usage);
        const mot = motsDesSymboles.get(f.id);
        if (mot) d.text(mot.texte, mot.base.x, mot.base.y, mot.taille, ENCRE_ELEC, { bold: true });
        if (fois && !libelle?.compte) {
          d.text(`×${fois}`, q.x + SYMBOL_SPAN * ECHELLE_SYMBOLE * 0.45, q.y + SYMBOL_SPAN * ECHELLE_SYMBOLE * 0.3, 5.5, ENCRE_ELEC, {
            align: 'left',
            bold: true,
          });
        }
      }
      /*
        ET LES MOTS PAR-DESSUS, aux places retenues avant les cotes.

        Ils se dessinent après TOUS les symboles, jamais entre deux : un
        sigle passait sous le filet de l'appareil suivant, et le dernier
        dessiné gagnait — l'ordre de tracé bat l'opacité.
      */
      for (const m of motsAppareil) {
        d.text(m.texte, m.x, m.y, TAILLE_SIGLE, m.couleur, {
          align: 'left',
          bold: m.bold,
        });
      }
    }

    /*
      LES DÉTECTEURS D'OUVERTURE : « DO » en bleu, dans la baie, côté pièce —
      ce que le plan d'architecte écrit en toutes lettres.
    */
    if (ctx.fixtures) {
      for (const o of openings.filter((x) => x.detecteur)) {
        const g = px(placeDuDetecteur(o, partOf.get(roomOf(o))?.labelAt));
        if (!dansLeCadre(g)) continue;
        const t = 4.2;
        d.rect(g.x - t * 1.2, g.y - t * 0.65, t * 2.4, t * 1.3, '#FFFFFF', C_LED, 0.5);
        d.text('DO', g.x, g.y - t * 0.36, t, C_LED, { bold: true, align: 'center' });
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
      /*
        LA PLACE DES CARTOUCHES, RETENUE AVANT LES COTES DU PLAFOND.

        Le cartouche se peint en dernier, avec son fond blanc : ce qui passe
        dessous disparaît. On calcule donc son emprise ici — la MÊME formule
        que le dessin, plus bas — pour que les cotes du plafond l'évitent.
        Voir `siglesPlafond` pour l'autre moitié de la règle.
      */
      // Les cartouches sont posés bien plus haut, AVANT les cotes : ils
      // sont déjà dans la réserve, il n'y a rien à y ajouter ici.

      if (plafond.length > 0) {
        // Les liens d'abord : ils passent SOUS les symboles, jamais dessus.
        for (const cl of plafond) {
          for (const fid of cl.commands ?? []) {
            const f = (ctx.fixtures ?? []).find((x) => x.id === fid);
            const w = f ? murParId.get(f.wallId) : undefined;
            if (!f || !w) continue;
            const face = wallFace(w, quadsMur.get(w.id), f.side);
            // Depuis le symbole de l'interrupteur — le disque le dégage.
            const depart = facePoint(face, faceX(face, f.along), sortieDuMur(f.id));
            const arrivee = cl.trace
              ? pointDAccroche(cl, { x: depart.x, z: depart.z })
              : linkAnchor({ x: depart.x, z: depart.z }, cl.at, CEILINGS[cl.kind].d * 0.7);
            tracerLien(linkCurve({ x: depart.x, z: depart.z }, arrivee).map(px));
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
        /*
          LE PLAFOND ÉCRIT DANS LA RÉSERVE DE LA FEUILLE, pas dans la
          sienne. Pastilles et sigles y sont retenus depuis le début ; les
          traits de ses cotes, décidés plus haut, sont déjà encrés.
        */
        const etiquettes = posees;
        const pastilles = pastillesPlafond;
        const sigles = siglesPose;
        // Et le cartouche, lui, n'aura que les sigles à éviter.
        siglesPlafond.push(...sigles.values());
        const seTouchent = (a: Boite, b: Boite) =>
          a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        const auLarge = (b: Boite) =>
          !etiquettes.some((o) => seTouchent(b, o)) &&
          !pastilles.some((o) => seTouchent(b, o));
        /**
         * CE QUI EST DEJA COTE NE SE RECOTE PAS : la chaîne d'une ligne
         * commence par « du mur au premier », exactement ce que la cote de
         * pose vient de mesurer — même mur, même spot. On retient le SEGMENT.
         */
        const cotesPosees = new Set<string>();
        const cleCote = (a: Pt, b: Pt) => {
          const u = `${Math.round(a.x)},${Math.round(a.y)}`;
          const v = `${Math.round(b.x)},${Math.round(b.y)}`;
          return u < v ? `${u}|${v}` : `${v}|${u}`;
        };
        /**
         * L'emprise de la plaque d'une cote, centrée sur son point — taillée
         * sur le texte ; la même pour réserver et pour dessiner.
         */
        const TAILLE_COTE = 6.5;
        const boiteCote = (p: Pt, texte: string): Boite => {
          const q = plaqueDeCote(texte, TAILLE_COTE);
          return { x: p.x - q.w / 2, y: p.y - q.h / 2, w: q.w, h: q.h };
        };
        /*
          TOUS LES TRAITS D'ABORD, TOUTES LES VALEURS ENSUITE. Chaque cote
          traçait son tireté puis posait sa plaque, et le tireté de la cote
          SUIVANTE passait par-dessus la plaque d'avant : « 113 » barré par la
          cote du spot voisin. Les plaques se posent quand plus aucun trait ne
          viendra.
        */
        // Les mots des symboles (« RJ45 », « 2 ») : la cote s'interrompt
        // devant eux plutôt que de les barrer.
        const disquesDesMots = [
          ...[...motsDesSymboles.values()].map((mot) => {
            const l = mot.texte.length * mot.taille * 0.5;
            const h = mot.taille * 0.72;
            return { x: mot.base.x, y: mot.base.y + h / 2, r: Math.hypot(l, h) / 2 + 0.8 };
          }),
          // Et le « DO » d'un détecteur d'ouverture.
          ...(ctx.fixtures ? openings.filter((o) => o.detecteur) : []).map((o) => {
            const g = px(placeDuDetecteur(o, partOf.get(roomOf(o))?.labelAt));
            return { x: g.x, y: g.y, r: 6.5 };
          }),
        ];
        for (const c of cotesDePlafond) {
          cotesPosees.add(cleCote(c.a, c.b));
          for (const morceau of horsDesDisques([c.a, c.b], disquesDesMots)) {
            d.dashedPath(morceau, 0.6, SKY, [2, 3]);
          }
          const l = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y) || 1;
          const nx = (c.b.y - c.a.y) / l;
          const ny = -(c.b.x - c.a.x) / l;
          d.line(c.b.x - nx * 3, c.b.y - ny * 3, c.b.x + nx * 3, c.b.y + ny * 3, 0.8, SKY);
        }
        const chainesTracees = chainesPlafond.filter((c) => !cotesPosees.has(cleCote(c.a, c.b)));
        for (const c of chainesTracees) {
          for (const morceau of horsDesDisques([c.a, c.b], disquesDesMots)) {
            d.dashedPath(morceau, 0.6, GREY, [2, 2]);
          }
        }
        /*
          L'ÉTIQUETTE GLISSE LE LONG DE SA COTE, sans jamais la quitter — de
          part et d'autre du milieu, puis de part et d'autre du trait ; et si
          RIEN n'est libre, la valeur cède : la ligne de cote et son repère
          restent. Entre deux places libres, la plus blanche.
        */
        const poserValeur = (a: Pt, b: Pt, texte: string, couleur: string, plafond: boolean) => {
          const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const sur = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
          const decale = (q: Pt, k: number) => ({
            x: q.x + ((b.y - a.y) / l) * k,
            y: q.y - ((b.x - a.x) / l) * k,
          });
          let p: Pt | null = null;
          let tache = Infinity;
          for (const k of [0, 9, -9, 18, -18]) {
            for (const t of [0.5, 0.34, 0.66, 0.22, 0.78, 0.14, 0.86]) {
              const q = decale(sur(t), k);
              const bx = boiteCote(q, texte);
              if (!auLarge(bx)) continue;
              // Sur son propre trait, la plaque le couvre : on ne compte que
              // ce qui dépasse de lui.
              const v = encre.sous(bx) - (k === 0 ? bx.w * 4 : 0) + Math.abs(k) * 0.5;
              if (v < tache) {
                tache = v;
                p = q;
              }
            }
          }
          if (!p) return;
          const boite = boiteCote(p, texte);
          etiquettes.push(boite);
          if (plafond) cotesPlafond.push(boite);
          encre.boite(boite);
          d.rect(boite.x, boite.y, boite.w, boite.h, '#FFFFFF', null, 0);
          d.text(texte, p.x, p.y - 2.5, TAILLE_COTE, couleur, { bold: true });
        };
        for (const c of cotesDePlafond) {
          poserValeur(c.a, c.b, `${Math.round(c.dist * 100)}`, SKY, true);
        }
        for (const c of chainesTracees) {
          poserValeur(c.a, c.b, `${Math.round(c.val * 100)}`, INK, true);
        }

        // Puis les appareils, à leur diamètre réel, jamais plus petits
        // que lisibles : un spot de 9 cm ferait deux points au 1:100.
        /**
         * LE SIGLE S'ECARTE DE CELUI DU VOISIN.
         *
         * Releve sur une capture du dossier : dans la circulation, le DAAF
         * est pose a quelques centimetres du point lumineux — la norme le
         * veut la, justement. Les deux sigles s'ecrivaient alors au meme
         * point, l'un sur l'autre, et le plan portait un mot qui n'existe
         * pas : « DCAF ». Deux informations perdues d'un coup.
         *
         * Meme remede que pour les notes : la punaise ne bouge pas, le mot
         * si. On cherche court (20 points) — un sigle pose loin de son
         * appareil ment davantage qu'un sigle serre.
         */
        for (const cl of plafond) {
          const spec = CEILINGS[cl.kind];
          const q = px(cl.at);
          if (!dansLeCadre(q)) continue;
          const r = Math.max(
        RAYON_PLAFOND_MIN,
        Math.min(RAYON_PLAFOND_MAX, (spec.d / 2) * scale),
      );
          /*
            PLUS DE PASTILLE BLANCHE SOUS LE SYMBOLE DE PLAFOND — relevé du
            patron : « enlève les blocs blancs derrière les icônes élec dans
            le plan ». C'était le dernier : celle des appareils muraux avait
            déjà sauté, pour la même raison. Le disque protégeait le symbole
            et perçait tout ce qui passait dessous — le sol, un meuble, un
            trait de cheminement. Sa place est RETENUE (voir `pastilles`) :
            aucune étiquette ne vient s'y écrire, et le symbole se lit sans
            avoir besoin de creuser un trou.
          */
          // Le ruban LED suit son tracé, en zigzag bleu (plan d'architecte).
          if (cl.trace && cl.trace.length >= 2) {
            d.path(zigzag(cl.trace.map(px), 3, 1, cl.ferme), 0.7, C_LED);
            continue;
          }
          drawSymbol(d, CEILING_SYMBOL[cl.kind], q.x, q.y, r / 9, ENCRE_ELEC, 1.1);
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
      if (colonnesLegende.length > 0) {
        /*
          ON RELIT LES COLONNES, ON NE LES REFAIT PAS. Elles ont été bâties là
          où la place a été réservée : c'est la seule façon que la boîte
          dessinée soit celle qu'on a retenue.
        */
        const choisi = { x: FRAME.x + 16, y: FRAME.y + TITLE_H + 16 + legendeH };
        drawLegendBox(d, choisi.x, choisi.y - legendeH, legendeW, colonnesLegende);
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
        const gros = big ? 11 : 8.5;
        /*
          LA PLACE A ÉTÉ RETENUE AVANT LES COTES — voir « puis le cartouche
          de la pièce ». On la relit, on ne la recalcule pas : deux calculs
          de la même chose finissent par diverger, et l'arbitre protégerait
          alors une place que le dessin n'occupe pas.
        */
        const pose = cartouchesPose.get(part.roomId);
        if (!pose) continue;
        emprises.push(pose);
        // Un fond VOILÉ, pas un pavé blanc : ce qui passerait dessous — un
        // symbole, un lien — se devine encore.
        d.poly(
          rectArrondi(pose.x, pose.y, pose.w, pose.h, 3),
          '#FFFFFF',
          null,
          0,
          false,
          0.8,
        );
        // Nom au-dessus, surface en dessous (l'axe y du PDF monte).
        if (label && pose.avecAire) {
          d.text(label, pose.cx, pose.cy + 2.2, gros, INK, { bold: true });
          d.text(area, pose.cx, pose.cy - 7.2, big ? 8.5 : 7, GREY);
        } else if (label) {
          // La surface a cédé la place : il ne reste que le nom, centré.
          d.text(label, pose.cx, pose.cy - 0.36 * gros, gros, INK, { bold: true });
        } else if (pose.avecAire) {
          d.text(area, pose.cx, pose.cy + 3, big ? 12 : 9, INK, { bold: true });
          d.text('surface au sol', pose.cx, pose.cy - 8, 6.5, GREY);
        } else {
          // « surface au sol » a cédé la place : la surface seule, centrée.
          d.text(area, pose.cx, pose.cy - 0.36 * (big ? 12 : 9), big ? 12 : 9, INK, {
            bold: true,
          });
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
          LA PUNAISE NE BOUGE PAS, LE MOT SI — ET IL PEUT ALLER LOIN.

          Le point visé porte le sens : « gaine à reprendre » ne veut rien
          dire trois mètres plus loin. Mais un FILET relie la punaise à son
          étiquette, et tant qu'il est là le mot peut se poser où il veut :
          on sait toujours ce qu'il désigne.

          Il ne cherchait qu'en MONTANT ET EN DESCENDANT, et s'écrivait quand
          même s'il ne trouvait rien. Sur la mesure, « colonne montante ici »
          barrait un « 3,00 m » et un « SP » à la fois — trois informations
          perdues pour une. Il tourne donc autour de sa punaise, du plus près
          au plus loin, comme le cartouche autour du milieu de sa pièce.
        */
        const voulu = { x: q.x + 5, y: q.y - 5.5, w: larg, h: 11 };
        const tours: [number, number][] = [];
        for (let i = -16; i <= 16; i++) {
          for (let j = -16; j <= 16; j++) tours.push([i * 11, j * 8]);
        }
        tours.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
        // La place la plus proche qui ne couvre aucun trait ; sinon la plus
        // proche libre de mots — la note se lit toujours.
        const essais = tours.map((t) => ({ ...voulu, x: voulu.x + t[0], y: voulu.y + t[1] }));
        const pose =
          essais.find((b) => libre(b) && dansLaFenetre(b) && encre.sous(b) === 0) ??
          essais.find((b) => libre(b) && dansLaFenetre(b)) ??
          voulu;
        d.path([q, { x: q.x + 5, y: q.y - 3.5 }, { x: q.x + 5, y: q.y + 3.5 }, q], 0.8, INK);
        // Le filet qui relie la punaise à son étiquette quand elle s'est
        // écartée : sans lui, on ne sait plus quel mot désigne quel point.
        if (Math.hypot(pose.x - voulu.x, pose.y - voulu.y) > 0.5) {
          d.line(q.x + 5, q.y, pose.x, pose.y + 5.5, 0.5, GREY);
        }
        d.rect(pose.x, pose.y, larg, 11, '#FFFFFFEE', INK, 0.5);
        d.text(mot, pose.x + 5, pose.y + 3.3, 6.5, INK, { align: 'left' });
        // Une note posée réserve sa place à son tour : deux notes voisines
        // se couvriraient l'une l'autre.
        emprises.push(pose);
        reserver(pose);
      }
    }

    /*
      LES COTES POSÉES À LA RÈGLE — relevé du patron, point 7 de la réflexion
      « grand public ». Une cote d'architecte, en bleu pour qu'on la
      distingue de celles que le plan calcule : un trait, deux talons, la
      longueur dans une pastille.
    */
    for (const m of ctx.mesures ?? []) {
      const a = px(m.a);
      const b = px(m.b);
      if (!dansLeCadre(a) && !dansLeCadre(b)) continue;
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const t = { x: (-(b.y - a.y) / L) * 3, y: ((b.x - a.x) / L) * 3 };
      d.line(a.x, a.y, b.x, b.y, 0.7, BLEU_REGLE);
      for (const q of [a, b]) d.line(q.x - t.x, q.y - t.y, q.x + t.x, q.y + t.y, 0.7, BLEU_REGLE);
      const mot = `${(Math.hypot(m.b.x - m.a.x, m.b.z - m.a.z)).toFixed(2).replace('.', ',')} m`;
      const larg = latin1(mot).length * 7 * 0.55 + 8;
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      d.rect(c.x - larg / 2, c.y - 5.5, larg, 11, '#FFFFFF', BLEU_REGLE, 0.5);
      d.text(mot, c.x, c.y - 2.4, 7, BLEU_REGLE, { bold: true });
    }

    /*
      LE NUMÉRO DE CHAQUE MUR, DANS SON ÉPAISSEUR.

      C'est le repère qui renvoie aux feuilles d'élévation — sans lui, une
      feuille « Séjour, nord » ne désigne rien de sûr sur un plan qui compte
      quatre pans au nord. Il s'écrit petit et maigre, à même le mur : voir
      `placeDuNumero`.

      Il se dessine APRÈS le mobilier et les cotes, AVANT la surcouche de
      schéma : c'est une annotation du plan, pas du schéma.
    */
    for (const q of numerosPoses.values()) {
      d.text(String(q.n), q.x, q.y - 0.36 * q.taille, q.taille, q.couleur);
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
  const titre = avecNiveau(extra?.title ?? 'Plan d\u2019ensemble cot\u00e9', ctx);
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
      ? ` \u00b7 Surface ${estDessine(walls) ? 'au nu' : 'relev\u00e9e'} : ${exact ? '' : '\u2248 '}${totalM2
          .toFixed(1)
          .replace('.', ',')} m\u00b2`
      : '';
  const sous =
    (extra?.sub ??
      (ctx.ceiling && ctx.ceiling.length > 0
        ? 'Murs, ouvertures et surfaces, avec l\u2019appareillage et le plafond \u2014 ' +
          'cotes en m\u00e8tres, cotes d\u2019appareil en centim\u00e8tres.'
        : estDessine(walls)
          ? 'Murs, ouvertures et surfaces aux cotes int\u00e9rieures \u2014 cotes en m\u00e8tres.'
          : 'Murs, ouvertures et surfaces relev\u00e9s au scan \u2014 cotes en m\u00e8tres.')) +
    (extra?.sub ? '' : mentionSurface) +
    // Le numéro d'un mur se dit : il renvoie à sa feuille d'élévation.
    (!extra?.sub && wallNumbers(ctx).size > 0 ? ' \u00b7 N\u00b0 de mur : sa feuille d\u2019\u00e9l\u00e9vation.' : '');
  d.text(titre, FRAME.x + 24, TETE, 13, INK, {
    bold: true,
    align: 'left',
  });
  /*
    LE SOUS-TITRE S'ARRÊTE AVANT LA ROSE DES VENTS.

    Relevé à l'œil sur le dossier imprimé : « … cotes d'appareil en
    centimètres. · Surface relevée : 21,5 m² » passait DERRIÈRE la rose, et
    l'on perdait les deux — le chiffre qu'on cherche en premier sur un plan
    de logement, et la seule chose qui dit de quel mur on parle.

    La surface passe donc à la ligne quand la place manque. Elle ne se perd
    pas, et la rose garde son coin : c'est là qu'un plan d'architecte la
    met, et c'est là qu'on va la chercher.
  */
  const largeurTexte = (t: string, taille: number) =>
    latin1(t).length * taille * 0.5;
  /* La place disponible s'arrête avant la rose, quand il y en a une. */
  const dispoTete =
    (ctx.north !== null && ctx.north !== undefined
      ? FRAME.x + FRAME.w - 72
      : FRAME.x + FRAME.w - 24) -
    (FRAME.x + 24);
  /** Coupe au mot, à la largeur donnée : deux lignes au plus. */
  const enLignes = (t: string, large: number, max = 2) => {
    const mots = t.split(' ');
    const out: string[] = [];
    let ligne = '';
    for (const mot of mots) {
      const essai = ligne ? `${ligne} ${mot}` : mot;
      if (largeurTexte(essai, 8) <= large || !ligne) {
        ligne = essai;
        continue;
      }
      out.push(ligne);
      ligne = mot;
      if (out.length === max) break;
    }
    if (out.length < max && ligne) out.push(ligne);
    return out;
  };
  enLignes(sous, dispoTete).forEach((ligne, i) => {
    d.text(ligne, FRAME.x + 24, TETE - 14 - i * 10, 8, GREY, { align: 'left' });
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
      // À l'encre du dessin : le rouge est celui de l'appareillage.
      INK,
      null,
    );
    /*
      LE NORD, ET LUI SEUL — relevé des revues du dossier : E, S et O
      flottaient autour de la flèche sans rien apprendre de plus. Une
      flèche et son N, c'est la convention d'un plan.
    */
    const pn = dir(0);
    d.text('N', cx + pn.x * 22, cy + pn.y * 22 - 2.5, 7.5, INK, { bold: true });
  }

  drawSheetChrome(d, {
    project: name,
    filename,
    client: ctx.client,
    particulier: ctx.particulier,
    entreprise: ctx.entreprise,
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
/**
 * LES LIGNES D'UNE FEUILLE DE MÉTRÉ — correctif de l'audit : le métré
 * tenait sur une seule page, et dans un grand logement les lignes de trop
 * et le total disparaissaient sans prévenir. Vingt-quatre pièces par feuille :
 * la dernière garde la place du total, de la surface habitable et de la
 * mention Carrez au-dessus du cartouche.
 */
const LIGNES_DU_METRE = 24;

/** Combien de feuilles le métré de ce logement demande. */
function feuillesDuMetre(walls: WallSeg[], rooms: RoomShape[] | undefined): number {
  return Math.max(1, Math.ceil(roomParts(walls, rooms).length / LIGNES_DU_METRE));
}

function metrePage(
  ctx: SheetContext,
  sheet: string,
  /** La feuille du métré (à partir de 1), et combien il en a. */
  tranche: { page: number; pages: number } = { page: 1, pages: 1 },
): string {
  const d = new Draw();
  const parts = roomParts(ctx.walls, ctx.rooms);
  const premiere = (tranche.page - 1) * LIGNES_DU_METRE;
  const derniere = tranche.page >= tranche.pages;
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

  const titre = avecNiveau(tranche.page > 1 ? 'Métré par pièce, suite' : 'Métré par pièce', ctx);
  d.text(titre, x0, y + 24, 13, INK, { bold: true, align: 'left' });
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
  // Le total compte TOUTES les pièces ; la feuille n'en dessine que sa tranche.
  parts.forEach((part, rang) => {
    const dessinee = rang >= premiere && rang < premiere + LIGNES_DU_METRE;
    if (dessinee) y -= 20;
    // Jamais l'identifiant interne sur un document client : une pièce
    // sans nom prend son rang, comme partout ailleurs dans l'app.
    const name =
      ctx.roomNames[part.roomId] || `Pièce ${parts.indexOf(part) + 1}`;
    const ext = part.surface
      ? etendueDeLaPiece(part.surface)
      : { width: 0, depth: 0 };
    /*
      UNE SEULE SURFACE DE MURS — relevé du patron, point 5 de la réflexion
      « grand public » : le PDF sommait les AXES des murs quand l'écran et
      le tableur prenaient le tour intérieur. Même calcul partout
      (`mursNetsDe`), et le périmètre du contour, comme au tableur.
    */
    const h = hauteurDeLaPiece(part);
    // Au nu des murs quand la pièce l'a — revues « Fatou » et « Claire » : la
    // feuille annonçait le « tour intérieur » et mesurait l'axe (30,2 m pour 28,4).
    const tourInterieur = part.surface ? part.surface.nu ?? part.surface.pts : null;
    const perim = tourInterieur
      ? perimetreDe(tourInterieur)
      : part.walls.reduce((s, x) => s + segLength(x), 0);
    const nets = tourInterieur
      ? mursNetsDe(tourInterieur, h, baiesDeLaPiece(part, ctx.openings), part.walls)
      : wallAreaM2(part.walls, ctx.openings);
    totalArea2 += part.surface?.area ?? 0;
    totalWalls += nets;
    totalPoints += eclairage.get(part.roomId)?.points ?? 0;
    if (!dessinee) return;
    const lum = eclairage.get(part.roomId);
    const cells = [
      fitText(name, 10, cols[1] - cols[0] - 6),
      /*
        LA LONGUEUR × LA LARGEUR D'UNE PIÈCE QUI EN A — revue « Thomas » :
        un studio en L s'annonçait « 6,00 × 5,00 » pour 25 m², l'enveloppe
        du L. Une pièce qui ne remplit pas son rectangle n'a pas deux cotes.
      */
      part.surface && Math.abs(ext.width * ext.depth - part.surface.area) <= 0.03 * Math.max(part.surface.area, 0.01)
        ? `${frLen(ext.width)} × ${frLen(ext.depth)}`
        : 'forme libre',
      part.surface ? `${part.surface.exact ? '' : '≈ '}${fr2(part.surface.area)}` : '—',
      fr2(perim),
      frLen(h),
      fr2(nets),
      ...(avecEclairage
        ? [
            lum && lum.points > 0
              ? // « 1 pts », relevé à l'œil sur la page du métré : un point
                // lumineux, un « s ». C'est une faute sur un document remis
                // au client, à côté de son nom et de son adresse de
                // chantier — et il la lit avant de lire les chiffres.
                // « pts » se lit d'ailleurs « points PostScript » par tout
                // le monde sauf un dessinateur : le mot entier tient dans
                // la colonne, et ne se lit que d'une façon.
                //
                // PLUS DE WATTS — relevé des revues du dossier : « 60 W »
                // par point ne veut rien dire avec des LED, et le total
                // débordait de son filet. Le nombre de points suffit.
                `${lum.points} point${lum.points > 1 ? 's' : ''}`
              : '—',
          ]
        : []),
    ];
    for (let i = 0; i < cells.length; i++) {
      d.text(cells[i], cols[i], y, i === 0 ? 10 : 9.5, i === 0 ? INK : '#2A3340', {
        align: 'left',
        bold: i === 0,
      });
    }
    d.line(x0, y - 7, x0 + w, y - 7, 0.4, GREY_LIGHT);
  });

  if (!derniere) {
    // Le total attend la dernière feuille : on le dit, plutôt que de le taire.
    y -= 22;
    d.text('Suite et total sur la feuille suivante.', x0, y, 8.5, GREY, { align: 'left' });
    drawSheetChrome(d, {
      project: ctx.name,
      filename: ctx.filename,
      client: ctx.client,
      particulier: ctx.particulier,
    entreprise: ctx.entreprise,
      address: ctx.address,
      sheetTitle: avecNiveau('Métré par pièce', ctx),
      sheet,
      scaleLabel: null,
    });
    return d.stream();
  }

  y -= 26;
  d.line(x0, y + 12, x0 + w, y + 12, 0.8, INK);
  d.text('Total', cols[0], y, 10, INK, { align: 'left', bold: true });
  d.text(fr2(totalArea2), cols[2], y, 10, INK, { align: 'left', bold: true });
  d.text(fr2(totalWalls), cols[5], y, 10, INK, { align: 'left', bold: true });
  if (avecEclairage && totalPoints > 0) {
    d.text(
      `${totalPoints} point${totalPoints > 1 ? 's' : ''}`,
      cols[6],
      y,
      10,
      INK,
      { align: 'left', bold: true },
    );
  }

  /*
    LA SURFACE HABITABLE DU LOGEMENT — relevé du patron, point 2 de la
    réflexion « grand public » : le chiffre d'une annonce, sous le total.
  */
  const hab = surfacesHabitables(
    (ctx.rooms ?? []).map((r) => ({
      id: r.id,
      name: ctx.roomNames[r.id],
      releve: (r as { releve?: { plafond?: PlafondDeLaPiece | null } | null }).releve,
    })),
    parts,
    ctx.objects,
  );
  if (hab.pieces.length > 0) {
    y -= 22;
    d.text(`Surface habitable estimée : ${fr2(hab.total)} m²`, x0, y, 10, INK, { align: 'left', bold: true });
    const exclues = hab.pieces.filter((p) => p.raison).length;
    y -= 13;
    d.text(
      hab.aVerifier > 0
        ? `À vérifier : ${hab.aVerifier} pièce${hab.aVerifier > 1 ? 's ont' : ' a'} une part sous 1,80 m mal vue au relevé. Estimation tirée du relevé, pas un mesurage certifié.`
        : exclues > 0
          ? 'Hors garage, cave, balcon et annexes, et hors hauteur sous 1,80 m. Estimation tirée du relevé, pas un mesurage certifié.'
          : 'Estimation tirée du relevé, pas un mesurage certifié.',
      x0,
      y,
      8,
      GREY,
      { align: 'left' },
    );
  }

  /*
    LA MENTION CARREZ, CADRÉE — correctif de l'audit : le mot n'apparaissait
    nulle part, quand c'est le chiffre qu'un vendeur cherche d'abord, et
    celui qui lui coûte cher s'il se trompe de plus de 5 %. Ce métré n'en
    tient pas lieu : on le dit dans un cadre, pour qu'on ne le manque pas.
  */
  if (parts.length > 0) {
    // Une ligne : le renvoi suffit — le pavé de quatre lignes expliquait
    // la loi au lieu de dire ce que vaut ce métré (revues du dossier).
    const lignes = wrapText(
      'Surfaces indicatives : ce métré ne tient pas lieu de mesurage Loi Carrez.',
      8,
      w - 2 * CADRE_MARGE,
    );
    const haut = lignes.length * 11 + 2 * CADRE_MARGE - 3;
    y -= 14;
    d.rect(x0, y - haut, w, haut, '#FFF8EC', AMBER, 0.8);
    lignes.forEach((l, i) => {
      d.text(l, x0 + CADRE_MARGE, y - CADRE_MARGE - 7 - i * 11, 8, INK, { align: 'left' });
    });
    y -= haut;
  }

  y -= 16;
  d.text(
    'Surface murale nette : tour intérieur × hauteur, portes et fenêtres déduites.',
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
    particulier: ctx.particulier,
    entreprise: ctx.entreprise,
    address: ctx.address,
    sheetTitle: avecNiveau('Métré par pièce', ctx),
    sheet,
    scaleLabel: null,
  });
  return d.stream();
}

/**
 * « CE QU'IL FAUT ACHETER » — la feuille du particulier.
 *
 * Relevé du patron, point 3 de la réflexion « grand public » : le calcul de
 * la peinture, du sol et des plinthes ne quittait pas l'écran. Il se remet
 * ici comme une liste de courses : ce qu'on met dans le chariot, la mesure
 * qui le justifie, le prix quand on l'a demandé — puis le détail pièce par
 * pièce et les hypothèses, pour que le vendeur puisse refaire le compte.
 */
/**
 * LE TITRE DE LA FEUILLE D'ACHATS — revue « Thomas » : « Ce qu'il faut
 * acheter » parle au particulier ; remis par un professionnel à son client,
 * c'est un « Estimatif des fournitures ».
 */
function titreDesAchats(ctx: { particulier?: boolean }): string {
  return ctx.particulier ? 'Ce qu’il faut acheter' : 'Estimatif des fournitures';
}

function achatsPage(
  ctx: SheetContext,
  sheet: string,
  donnees: NonNullable<PdfOptions['achats']>,
): string {
  const d = new Draw();
  const x0 = FRAME.x + 24;
  const w = FRAME.w - 48;
  const { pieces, hypotheses: h, prix } = donnees;
  const a = achatsDe(pieces, h);
  const cout = prix ? coutDesAchats(a, prix) : null;
  let y = TETE - 22;
  d.text(titreDesAchats(ctx), x0, y + 24, 13, INK, { bold: true, align: 'left' });

  const cols = (cout ? [0, 0.34, 0.52, 0.82] : [0, 0.4, 0.6]).map((f) => x0 + f * w);
  const heads = ['Achat', 'Quantité', 'Mesure', ...(cout ? ['Prix estimé'] : [])];
  for (let i = 0; i < heads.length; i++) d.text(heads[i], cols[i], y, 8.5, GREY, { align: 'left' });
  y -= 6;
  d.line(x0, y, x0 + w, y, 0.8, INK);
  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  const rangs: [string, string, string, number][] = [
    ['Peinture des murs', pluriel(a.murs.pots, 'pot'), `${nombre(a.murs.litres)} L pour ${nombre(a.murs.surface)} m²`, cout?.murs ?? 0],
    ['Peinture des plafonds', pluriel(a.plafonds.pots, 'pot'), `${nombre(a.plafonds.litres)} L pour ${nombre(a.plafonds.surface)} m²`, cout?.plafonds ?? 0],
    ['Revêtement de sol', pluriel(a.sol.paquets, 'paquet'), `${nombre(a.sol.avecChute)} m², chute comprise`, cout?.sol ?? 0],
    ['Plinthes', pluriel(a.plinthes.barres, 'barre'), `${nombre(a.plinthes.metres)} m, seuils déduits`, cout?.plinthes ?? 0],
  ];
  for (const [nom, qte, mesure, euro] of rangs) {
    y -= 22;
    const cells = [nom, qte, mesure, ...(cout ? [`≈ ${euros(euro)}`] : [])];
    for (let i = 0; i < cells.length; i++) {
      d.text(fitText(cells[i], 10, (cols[i + 1] ?? x0 + w) - cols[i] - 6), cols[i], y, i === 0 ? 10 : 9.5, i === 0 ? INK : '#2A3340', {
        align: 'left',
        bold: i === 0 || i === 1,
      });
    }
    /*
      LA PEINTURE DES MURS, TEINTE PAR TEINTE — correctif de l'audit : les
      couleurs choisies dans « Décorer » s'achètent chacune à part.
    */
    if (nom === 'Peinture des murs') {
      for (const t of a.murs.parTeinte ?? []) {
        y -= 15;
        d.text(fitText(`· ${nomDeTeinte(t.cle)}`, 9, cols[1] - cols[0] - 6), cols[0] + 10, y, 9, '#2A3340', { align: 'left' });
        d.text(pluriel(t.pots, 'pot'), cols[1], y, 9, '#2A3340', { align: 'left' });
        d.text(fitText(`${nombre(t.litres)} L pour ${nombre(t.surface)} m²`, 9, (cols[3] ?? x0 + w) - cols[2] - 6), cols[2], y, 9, '#2A3340', {
          align: 'left',
        });
      }
    }
    d.line(x0, y - 8, x0 + w, y - 8, 0.4, GREY_LIGHT);
  }
  if (cout) {
    y -= 26;
    d.line(x0, y + 12, x0 + w, y + 12, 0.8, INK);
    // Revue « Thomas » : un montant remis au client dit ce qu'il comprend.
    d.text('Total estimé TTC', cols[0], y, 10.5, INK, { align: 'left', bold: true });
    d.text(`≈ ${euros(cout.total)}`, cols[3], y, 10.5, INK, { align: 'left', bold: true });
  }
  y -= 22;
  d.text(
    fitText(
      `${pluriel(h.couches, 'couche')} à ${nombre(h.rendement)} m²/L, pots de ${nombre(h.pot)} L · ` +
        `${Math.round(h.chute * 100)} % de chute, paquets de ${nombre(h.paquet)} m² · plinthes de ${nombre(h.barre)} m.` +
        (cout ? ' Prix indicatifs.' : ''),
      8,
      w,
    ),
    x0,
    y,
    8,
    GREY,
    { align: 'left' },
  );
  if (cout) {
    y -= 12;
    d.text(
      fitText('Prix TTC, TVA 20 % comprise, fournitures seules, hors pose \u2014 estimation non contractuelle.', 8, w),
      x0,
      y,
      8,
      GREY,
      { align: 'left' },
    );
  }

  // Le détail, pièce par pièce.
  y -= 34;
  d.text('Pièce par pièce', x0, y, 11, INK, { bold: true, align: 'left' });
  y -= 18;
  const pc = [0, 0.3, 0.45, 0.62, 0.77, 0.9].map((f) => x0 + f * w);
  // « Baies » comptait aussi les portes (revue « Thomas »).
  const ph = ['Pièce', 'Sol (m²)', 'Murs nets (m²)', 'Plafond (m²)', 'Plinthes (m)', 'Ouvertures'];
  for (let i = 0; i < ph.length; i++) d.text(ph[i], pc[i], y, 8.5, GREY, { align: 'left' });
  y -= 6;
  d.line(x0, y, x0 + w, y, 0.8, INK);
  for (const p of pieces) {
    if (y < FRAME.y + 90) break;
    y -= 19;
    const cells = [p.nom, nombre(p.sol), nombre(p.murs), nombre(p.plafond), nombre(p.plinthes), String(p.portes + p.fenetres)];
    for (let i = 0; i < cells.length; i++) {
      d.text(i === 0 ? fitText(cells[i], 10, pc[1] - pc[0] - 6) : cells[i], pc[i], y, i === 0 ? 10 : 9.5, i === 0 ? INK : '#2A3340', {
        align: 'left',
        bold: i === 0,
      });
    }
    d.line(x0, y - 7, x0 + w, y - 7, 0.4, GREY_LIGHT);
  }

  drawSheetChrome(d, {
    project: ctx.name,
    filename: ctx.filename,
    client: ctx.client,
    particulier: ctx.particulier,
    entreprise: ctx.entreprise,
    address: ctx.address,
    sheetTitle: titreDesAchats(ctx),
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
    particulier: ctx.particulier,
    entreprise: ctx.entreprise,
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

/**
 * LA FEUILLE DES GAINES — le cheminement, et rien d'autre.
 *
 * Relevé du patron, plan exporté à l'appui : « sur un plan 2D rendu en export
 * pour une simple pièce aux normes, on y voit plein de traits
 * incompréhensibles ; il faut faire un système intelligent où rien ne se
 * croise et tout doit être compréhensible. Gaines sur plan à part "Plan de
 * gaines" avec les diamètres recommandés pour chaque tirage selon nombre de
 * fils aux normes ».
 *
 * Le plan d'ensemble portait TOUT : maçonnerie, appareillage, cotes de pose,
 * liens de commande ET cheminement des gaines. Sur une pièce de douze mètres
 * carrés, cela fait déjà six familles de traits qui se croisent ; personne
 * ne suit un départ à l'œil là-dedans, et le document perd sa raison d'être.
 *
 * Le cheminement part donc sur sa propre feuille, avec le tableau qui va
 * avec : un tirage par ligne, son diamètre de conduit, et le nombre de fils
 * qui l'a décidé. C'est ce qu'on emporte chez le grossiste.
 */
function gainesPage(
  ctx: SheetContext,
  sheet: string,
  rows: SchemaRow[],
): string {
  /*
    LE TABLEAU SOUS LE PLAN, pas à côté.

    Celui qui tire regarde le tracé, puis descend lire ce qu'il commande.
    Posé en marge, le tableau oblige à traverser la feuille des yeux à
    chaque ligne.
  */
  const tirage: PlanOverlay = (d, _px, _scale, box) => {
    if (rows.length === 0) return;
    /*
      LE TABLEAU SE POSE SOUS LE TITRE, pas sous le plan.

      Premier jet : en dessous du dessin. Il se faisait couper par le
      cartouche des qu'il passait deux lignes — vu a l'oeil sur la feuille
      rendue en image. La place libre d'une feuille de plan est EN HAUT :
      le dessin est centre dans sa boite, et le blanc qui reste au-dessus ne
      sert a rien.
    */
    /*
      LE TABLEAU NE SE TRONQUE PLUS EN SILENCE — revue « Karim » : sur un
      T3 de dix circuits, C1 à C6 seulement, le reste coupé sans un mot. Il
      se pose sur deux colonnes quand une ne suffit pas, et ce qui ne tient
      toujours pas renvoie au schéma, en toutes lettres.
    */
    const HAUT = 110;
    const PAS = 13;
    const parColonne = Math.max(1, Math.floor((HAUT - 30) / PAS));
    const nCol = rows.length > parColonne ? 2 : 1;
    const capacite = parColonne * nCol;
    const affiches = rows.length > capacite ? rows.slice(0, capacite - 1) : rows;
    const reste = rows.length - affiches.length;
    const yTitre = box.y + box.h - 6;
    d.text('Tirage par circuit', box.x, yTitre, 9, INK, { bold: true, align: 'left' });
    const largeur = box.w / nCol;
    for (let c = 0; c < nCol; c++) {
      const x0 = box.x + c * largeur;
      const w = largeur - (nCol > 1 ? 10 : 0);
      let y = yTitre - 14;
      const cols = [x0, x0 + 26, x0 + w * 0.46, x0 + w * 0.64, x0 + w * 0.82];
      d.text('Rep.', cols[0], y, 7, GREY_LIGHT, { align: 'left' });
      d.text('Circuit', cols[1], y, 7, GREY_LIGHT, { align: 'left' });
      d.text('Section', cols[2], y, 7, GREY_LIGHT, { align: 'left' });
      d.text('Fils', cols[3], y, 7, GREY_LIGHT, { align: 'left' });
      d.text('Conduit', cols[4], y, 7, GREY_LIGHT, { align: 'left' });
      y -= 4;
      d.line(x0, y, x0 + w, y, 0.6, '#D8DEE7');
      y -= 12;
      const tranche = affiches.slice(c * parColonne, (c + 1) * parColonne);
      tranche.forEach((r, k) => {
        const i = c * parColonne + k;
        const teinte = circuitColor(i);
        markerAt(d, { x: x0 + 7, y: y + 2 }, r.mark, teinte);
        d.text(fitText(r.label, 8, cols[2] - cols[1] - 8), cols[1], y, 8, INK, {
          align: 'left',
        });
        d.text(
          r.section === null
            ? 'courants faibles'
            : `${fr1(r.section)} mm²`,
          cols[2],
          y,
          8,
          GREY,
          { align: 'left' },
        );
        d.text(`${r.wires}`, cols[3], y, 8, GREY, { align: 'left' });
        // Le diamètre se CALCULE ici, sur le compte de fils de cette ligne :
        // c'est la règle du tiers, et elle se vérifie du regard.
        d.text(
          `ICTA ${conduitPour(r.section, r.wires)}`,
          cols[4],
          y,
          8,
          INK,
          { bold: true, align: 'left' },
        );
        y -= PAS;
      });
      if (c === nCol - 1 && reste > 0) {
        d.text(
          `+ ${reste} circuit${reste > 1 ? 's' : ''} : voir le schéma unifilaire.`,
          x0,
          y,
          8,
          GREY,
          { align: 'left' },
        );
      }
    }
  };

  const page = planPage(ctx, sheet, undefined, false, {
    overlay: tirage,
    title: 'Plan des gaines',
    sub:
      'Cheminement du tableau à chaque appareil. Diamètres calculés au ' +
      'tiers de remplissage — le compte de fils est celui du schéma.',
    // La légende d'appareillage se tait : la feuille parle de tirage, et
    // deux boîtes cherchant le coin le plus libre finissent l'une sur
    // l'autre.
    hideLegend: true,
    // Et les cotes de pose aussi : elles croisent les tracés qu'on est venu
    // suivre. Elles se lisent sur le plan d'ensemble.
    hideCotesPose: true,
  });
  return page;
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
  y -= 26;

  // Les départs, rangés sous leur différentiel.
  const parDiff = new Map<string, SchemaRow[]>();
  const libres: SchemaRow[] = [];
  for (const r of rows) {
    if (!r.under) libres.push(r);
    else parDiff.set(r.under, [...(parDiff.get(r.under) ?? []), r]);
  }
  const blocs: { titre: string; sous: string; rows: SchemaRow[]; aLaBarre: boolean }[] = [];
  diffs.forEach((diff, i2) => {
    const list = parDiff.get(`ID${i2 + 1}`) ?? [];
    if (list.length === 0) return;
    blocs.push({
      titre: `ID${i2 + 1}`,
      sous: `${diff.rating} A · 30 mA · type ${diff.type}`,
      rows: list,
      aLaBarre: true,
    });
  });
  /*
    LE COFFRET DE COMMUNICATION SE NOMME, ET NE PEND PLUS SOUS LES
    DIFFÉRENTIELS — relevé des revues du dossier : titré « GTL » (la gaine,
    pas le coffret) et accroché à la barre, il se lisait alimenté derrière
    le dernier différentiel. Il est à part : courants faibles, sans
    protection au tableau.
  */
  if (libres.length > 0) {
    blocs.push({
      titre: 'Coffret',
      sous: 'de communication — courants faibles, hors protection',
      rows: libres,
      aLaBarre: false,
    });
  }
  /*
    LES POINTS DESSERVIS EN ENTIER, SUR DEUX LIGNES AU BESOIN — relevé des
    revues du dossier : « Prise plint… », « Bureau, mur no… » : on ne
    pouvait pas vérifier ce que dessert chaque départ, et la feuille avait
    la place.
  */
  const dessertDe = (r: SchemaRow): string[] => {
    const dessert = detail?.get(r.mark) || r.points;
    if (!dessert) return [];
    const lignes = wrapText(dessert, 6.5, CABLE - NOM);
    if (lignes.length <= 3) return lignes;
    return [lignes[0], lignes[1], fitText(lignes.slice(2).join(' '), 6.5, CABLE - NOM)];
  };
  const pasDe = (r: SchemaRow) => PAS + (Math.max(1, dessertDe(r).length) - 1) * 8;

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
    /*
      UN DÉPART 230 V, C'EST TROIS CONDUCTEURS — relevé des revues du
      dossier : l'éclairage en annonçait six (navettes et retours comptés),
      quand le multifilaire en dessinait trois. Ce qui sort du disjoncteur,
      c'est phase, neutre, terre ; les navettes vivent entre les boîtiers.
      Les courants faibles n'ont pas de conducteurs à compter ici.
    */
    if (r.breaker !== null) {
      const oblique = (DISJ + 16 + finTrait) / 2;
      d.line(oblique - 4, cy - 5, oblique + 4, cy + 5, 0.9, INK);
      d.text('3', oblique + 7, cy + 4, 7, GREY);
    }
    // Le repère, à sa teinte de circuit : la même que sur le plan.
    markerAt(d, { x: NOM - 14, y: cy }, r.mark, teinte);
    // Le libellé dispose de toute la place jusqu'à la colonne de droite.
    const largeurNom = CABLE - NOM - 96;
    d.text(fitText(r.label, 8, largeurNom), NOM, cy - 3, 8, INK, {
      align: 'left',
    });
    // Toute la largeur : la colonne de droite est vide à cette hauteur.
    dessertDe(r).forEach((l, k) => {
      d.text(l, NOM, cy - 12 - k * 8, 6.5, GREY_LIGHT, { align: 'left' });
    });
    const droite =
      r.section === null
        ? `ICTA Ø${r.conduit}`
        : `${String(r.section).replace('.', ',')} mm² · ICTA Ø${r.conduit}`;
    d.text(droite, CABLE, cy - 3, 7.5, INK, { align: 'right' });
  };

  const BAS = FRAME.y + TITLE_H + 30;
  let restants = 0;
  let indexGlobal = 0;
  /*
    LES DIFFÉRENTIELS EN PARALLÈLE, SUR UNE NOURRICE — relevé des revues du
    dossier : la barre s'interrompait sous ID1 et repartait vers ID2, et on
    lisait deux 30 mA en cascade. Chacun est alimenté par l'AGCP : une
    nourrice descend à gauche, et chaque différentiel s'y pique.
  */
  const NOURRICE = BUS - 40;
  const hautNourrice = y - 6;
  let basNourrice: number | null = null;
  d.line(BUS, y, BUS, hautNourrice, 1.2, INK);
  d.line(BUS, hautNourrice, NOURRICE, hautNourrice, 1.2, INK);

  for (const bloc of blocs) {
    // Un bloc s'annonce, et ses départs suivent. On ne commence pas un
    // différentiel qu'on ne pourrait pas honorer d'au moins une ligne.
    if (y - 34 - PAS < BAS) {
      restants += bloc.rows.length;
      continue;
    }
    y -= 16;
    if (bloc.aLaBarre) {
      d.line(NOURRICE, y - 10, BUS - 30, y - 10, 1.2, INK);
      basNourrice = y - 10;
    }
    d.rect(BUS - 30, y - 20, 60, 20, '#F3F6FB', INK, 1);
    d.text(bloc.titre, BUS, y - 8, 8, INK, { bold: true });
    d.text(bloc.sous, BUS + 42, y - 12, 7.5, GREY, { align: 'left' });
    y -= 20;

    const debut = y;
    for (const r of bloc.rows) {
      const pas = pasDe(r);
      if (y - pas < BAS) {
        restants += 1;
        indexGlobal += 1;
        continue;
      }
      y -= pas;
      // Ancré en HAUT de sa place : la seconde ligne des points desservis
      // descend dans le surplus, le départ reste où on l'attend.
      ligneDepart(r, y + pas - PAS / 2 - 2, circuitColor(indexGlobal));
      indexGlobal += 1;
    }
    // La barre qui porte les dérivations de ce différentiel.
    d.line(BUS, debut, BUS, y + 4, 1.2, INK);
    y -= 8;
  }
  if (basNourrice !== null) d.line(NOURRICE, hautNourrice, NOURRICE, basNourrice, 1.2, INK);

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
        'départ.',
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
    particulier: ctx.particulier,
    entreprise: ctx.entreprise,
    address: ctx.address,
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
  /** La face regardée ; par défaut, celle de la pièce qui a relevé le mur. */
  cote?: 1 | -1,
): string {
  const d = new Draw();
  const r = dessinerUneFace(d, ctx, wall, cliches, cote, CADRE_FEUILLE);
  drawSheetChrome(d, {
    project: ctx.name,
    filename: ctx.filename,
    client: ctx.client,
    particulier: ctx.particulier,
    entreprise: ctx.entreprise,
    address: ctx.address,
    // Le numéro du mur d'abord : c'est par lui qu'on retrouve la feuille
    // depuis le plan (cinq feuilles s'appelaient « côté Séjour »).
    sheetTitle: r.titre,
    sheet,
    // Plus d'arrondi : le cartouche dit l'échelle à laquelle on a tracé.
    scaleLabel: r.echelle.label,
    metersToPoints: r.echelle.ptParMetre,
  });
  return d.stream();
}

/** Le cadre d'une feuille d'élévation entière : du titre aux photos. */
const CADRE_FEUILLE = { haut: TETE, bas: FRAME.y + TITLE_H + 34 };

/**
 * LA ZONE DU DESSIN, dans un cadre — la même règle pour une face seule ou
 * pour deux faces sur une feuille : sous le titre et la cote de longueur,
 * au-dessus des photos et de la chaîne du bas.
 */
function zoneDeLaFace(cadre: { haut: number; bas: number }, avecPhotos: boolean) {
  const hautPhoto = avecPhotos ? cadre.bas + 190 : cadre.bas;
  const MARGE_ELEV = 40;
  return {
    x: FRAME.x + MARGE_ELEV,
    y: hautPhoto + 46,
    w: FRAME.w - MARGE_ELEV * 2,
    h: cadre.haut - 62 - (hautPhoto + 46),
  };
}

/**
 * DEUX FACES SUR UNE FEUILLE — relevé des revues du dossier : une feuille
 * par mur, à moitié vide, et des échelles qui changent d'une feuille à
 * l'autre (1:20, 1:25, 1:40 dans la même pièce). Un pro développe les murs
 * d'une pièce côte à côte, à une échelle. Ici, deux faces de la MÊME pièce
 * — ou les deux faces d'une même cloison, pour voir d'un coup d'œil qu'on
 * ne perce pas dos à dos — se partagent la feuille, à l'échelle commune.
 */
function elevationsDeDeuxFaces(
  ctx: SheetContext,
  sheet: string,
  a: FaceAElever,
  b: FaceAElever,
  echelle: EchelleChoisie,
): string {
  const d = new Draw();
  const { haut, bas } = CADRE_FEUILLE;
  const milieu = (haut + bas) / 2;
  const ra = dessinerUneFace(d, ctx, a.wall, [], a.cote, { haut, bas: milieu + 4 }, echelle);
  // Un filet sépare les deux faces : deux dessins, pas un.
  d.line(FRAME.x + 30, milieu - 2, FRAME.x + FRAME.w - 30, milieu - 2, 0.5, '#D6DBE3');
  const rb = dessinerUneFace(d, ctx, b.wall, [], b.cote, { haut: milieu - 20, bas }, echelle);
  drawSheetChrome(d, {
    project: ctx.name,
    filename: ctx.filename,
    client: ctx.client,
    particulier: ctx.particulier,
    entreprise: ctx.entreprise,
    address: ctx.address,
    sheetTitle:
      a.wall.id === b.wall.id
        ? `${ra.titre.split(' — ')[0]} — ses deux faces`
        : `${ra.titre.split(' — ')[0].replace(/^Mur /, 'Murs ')} et ${rb.titre.split(' — ')[0].replace(/^Mur /, '')}`,
    sheet,
    scaleLabel: echelle.label,
    metersToPoints: echelle.ptParMetre,
  });
  return d.stream();
}

/** La face dessinée dans son cadre : le titre qu'elle donne, l'échelle tenue. */
function dessinerUneFace(
  d: Draw,
  ctx: SheetContext,
  wall: WallSeg,
  cliches: { im: PdfImage; along?: number }[],
  cote: 1 | -1 | undefined,
  cadre: { haut: number; bas: number },
  echelleImposee?: EchelleChoisie,
): { titre: string; echelle: EchelleChoisie } {
  const walls = ctx.walls;
  const rooms = ctx.rooms ?? [];
  const side = cote ?? interiorSide(wall, walls, rooms);
  const face = wallFace(wall, wallQuads(walls).get(wall.id), side);
  const H = wall.height;
  const mine = (ctx.fixtures ?? []).filter((f) => f.wallId === wall.id);
  /* Ce qui est posé sur l'AUTRE face : on ne perce pas dos à dos. */
  const dos = mine.filter((f) => f.side !== side);
  /*
    LA PIÈCE DU CÔTÉ OBSERVÉ — relevé du patron : « sur les élévations,
    note aussi le nom de la pièce du côté du mur observé ; on peut se
    tromper si le mur joint deux pièces ». La pièce du mur (`roomOf`) est
    celle qui l'a relevé, pas forcément celle d'où on le regarde. On lit
    donc la pièce DEVANT la face dessinée, et celle qui est au dos.
  */
  const devant = pieceDuCote(wall, side, walls, rooms) ?? roomOf(wall);
  const derriere = pieceDuCote(wall, side === 1 ? -1 : 1, walls, rooms);
  const piece = ctx.roomNames[devant ?? ''] ?? '';
  const auDos = derriere && derriere !== devant ? ctx.roomNames[derriere] ?? '' : '';
  /**
   * DE QUEL MUR S'AGIT-IL ? Celui du nord, celui de l'est.
   *
   * « Élévation — Chambre » sur quatre feuilles d'affilée ne dit pas
   * laquelle on tient. L'orientation, elle, se vérifie sur place.
   */
  const centre = roomParts(ctx.walls, ctx.rooms).find(
    (p) => p.roomId === devant,
  )?.labelAt;
  // La face regardée tranche : c'est la pièce de CE côté que le mur ferme.
  const cardinal = centre ? wallLabel(wall, centre, ctx.north ?? null, side) : null;
  // Le numéro du mur, tel qu'il est écrit sur le plan : c'est par lui qu'on
  // retrouve le pan dont parle cette feuille.
  const numero = wallNumbers(ctx).get(wall.id);
  // Nom de pièce et cardinal, sans bégayer : une pièce sans nom donnait
  // « mur, mur nord-est » — le cardinal commence déjà par « mur », le
  // bouche-trou ne sert que s'il n'y a ni l'un ni l'autre.
  const quoi = [piece ? `côté ${piece}` : '', cardinal].filter(Boolean).join(', ') || 'mur';

  // ------------------------------------------------------------- cadre
  const hautTitre = cadre.haut;
  d.text(
    `Élévation — ${numero ? `Mur ${numero} · ` : ''}${quoi}`,
    FRAME.x + 30,
    hautTitre,
    13,
    INK,
    { bold: true, align: 'left' },
  );
  const poses0 = mine.length - dos.length;
  const sansElec = (ctx.fixtures ?? []).length === 0;
  /*
    LE SOUS-TITRE SE REPLIE — relevé des revues du dossier : « …de l'autre
    face. » sortait du cadre de la feuille. Deux lignes au plus, dans la
    largeur du cadre.
  */
  const sousTitre =
    (auDos ? `Au dos : ${auDos}. ` : '') +
      `Mur de ${face.len.toFixed(2).replace('.', ',')} m sous ` +
      `${H.toFixed(2).replace('.', ',')} m · ` +
      // Un dossier sans électricité ne parle pas d'appareils — revue
      // « Thomas » : « 0 appareil » sur chaque feuille d'un architecte.
      (sansElec ? '' : `${poses0} appareil${poses0 > 1 ? 's' : ''} · `) +
      'cotes en cm depuis le nu du mur et depuis le sol.' +
      // La légende n'existe que s'il y a quelque chose à expliquer : on
      // ne commente pas ce qui n'est pas dessiné.
      (dos.length > 0
        ? ` En clair : ${dos.length} appareil${
            dos.length > 1 ? 's' : ''
          } de l’autre face.`
        : '');
  const lignesSous = wrapText(sousTitre, 8, FRAME.w - 60);
  lignesSous.slice(0, 2).forEach((l, k) => {
    d.text(
      k === 1 && lignesSous.length > 2 ? fitText(lignesSous.slice(1).join(' '), 8, FRAME.w - 60) : l,
      FRAME.x + 30,
      hautTitre - 14 - k * 10,
      8,
      GREY,
      { align: 'left' },
    );
  });

  // Les photos prennent le bas de la feuille ; sans elles, le dessin descend.
  const BAS = cadre.bas;
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
  const zone = zoneDeLaFace(cadre, cliches.length > 0);
  /*
    L'ÉCHELLE VRAIE, ICI AUSSI.

    Le dessin était mis à la feuille et l'échelle DÉDUITE de la place
    occupée, puis arrondie au cartouche : « 1:25 » sans tilde pour un tracé
    à 1:25,4. C'est la feuille qu'on tient devant le mur, la perceuse dans
    l'autre main, et sur laquelle on reporte une cote au kutch — un pour
    cent et demi sur deux mètres cinquante, ce sont quatre centimètres.
  */
  const echelle = echelleImposee ?? echelleElevation(zone.w, zone.h, face.len, H);
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
  /*
    LES NOMS DES MEUBLES SE POSENT APRÈS LES BAIES — revue « Thomas » :
    « 140 × 120 » s'imprimait sur « Rangement 90 », « Canapé 80 » sortait du
    mur (« pé 80 »), et ce chiffre collé au nom ne disait pas qu'il était une
    hauteur. Le libellé dit « h 80 cm », se taille à la largeur du meuble,
    reste dans le mur, et cherche une place que les baies n'occupent pas.
  */
  const etiquettesMeubles: { m: ReturnType<typeof wallFurniture>[number]; haut: number; bas: number; larg: number }[] = [];
  const occupees: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const occuper = (cx: number, y: number, texte: string, taille: number) => {
    const w = texte.length * taille * EM_TEXTE;
    occupees.push({ x0: cx - w / 2 - 2, x1: cx + w / 2 + 2, y0: y - 2, y1: y + taille + 1 });
  };
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
      /*
        EN GRIS, JAMAIS EN BLEU — relevé des revues du dossier : le meuble
        contre le mur avait le bleu et l'épaisseur des baies, et la fenêtre
        ne se distinguait plus du frigo. Le mobilier se dessine en trait
        fin ; contre le mur, un cran plus foncé.
      */
      '#F4F5F7',
      contre ? GREY : GREY_LIGHT,
      contre ? 0.8 : 0.6,
    );
    if (larg > 30) etiquettesMeubles.push({ m, haut, bas, larg });
  }

  /*
    PLUS DE LIGNES DE RÉFÉRENCE — relevé des revues du dossier : « applique
    210, tableau 135, commande 110, plinthe 25 » se traçaient sur chaque mur,
    même sans tableau ni applique, coupaient les baies et débordaient du
    mur. Une élévation de pro ne porte que les hauteurs de SES appareils,
    cotées depuis le sol fini : c'est ce que dit la colonne de gauche.
  */

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
    const coffre = empriseDuCoffre(t.seg, gx, solY);
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
        // Une baie vitrée qui part du sol est une PORTE-FENÊTRE (revues du
        // dossier : « Fenêtre » pour une baie de 240 × 205 sans allège).
        t.seg.type === 'window'
          ? t.y0 < 0.05
            ? 'Porte-fenêtre'
            : 'Fenêtre'
          : estTraversante(t.seg)
          ? 'Passage'
          : 'Porte',
        px(gx + larg / 2),
        // Au-dessus du COFFRE quand il y en a un : posé sur le linteau, le
        // nom de la baie tombait en plein dans le bandeau ambre.
        py(t.y1 + (t.seg.coffre ?? 0)) + 5,
        7,
        SKY,
        { bold: true },
      );
      occuper(px(gx + larg / 2), py(t.y1 + (t.seg.coffre ?? 0)) + 5, 'Porte-fenêtre', 7);
      // La baie elle-même : un nom de meuble ne s'écrit pas dans la vitre.
      occupees.push({ x0: px(gx), x1: px(gx + larg), y0: py(t.y0), y1: py(t.y1) });
      d.text(
        `${Math.round(larg * 100)} × ${Math.round((t.y1 - t.y0) * 100)}`,
        px(gx + larg / 2),
        // Dans la baie quand elle part du sol : dessous, le chiffre tombait
        // dans les hachures du sol (revues du dossier).
        t.y0 < 0.15 ? py(t.y0) + 8 : py(t.y0) - 11,
        6.5,
        SKY,
      );
      occuper(px(gx + larg / 2), t.y0 < 0.15 ? py(t.y0) + 8 : py(t.y0) - 11, '000 × 000', 6.5);
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
        occupees.push({ x0: xa2 - 9, x1: xa2 + 9, y0: ym - 9, y1: ym + 9 });
        occupees.push({ x0: xa2 - 2, x1: xa2 + 2, y0: py(0), y1: py(t.y0) });
        d.text(`${Math.round(t.y0 * 100)}`, xa2, ym - 2.5, 7, SKY, {
          bold: true,
        });
      }
    }
  }

  for (const { m, haut, bas, larg } of etiquettesMeubles) {
    const taille = 7;
    const largeur = (t: string) => t.length * taille * EM_TEXTE;
    const nom = frCategory(m.category);
    const cm = `h ${Math.round(m.top * 100)} cm`;
    const place = Math.max(0, larg - 6);
    // Une ligne si tout tient ; sinon le nom (abrégé au besoin) sur la
    // hauteur ; sinon la hauteur seule. La première qui trouve une place
    // libre — hors des baies, de leurs cotes et des autres noms — l'emporte.
    const options: string[][] = [[`${nom} · ${cm}`], [nom, cm], [fitText(nom, taille, place), cm], [cm]].filter(
      (o) => o.every((l) => largeur(l) <= place) && (o.length === 1 || (haut - bas) * scale >= 26) && o[0].length >= 3,
    );
    let pose: { cx: number; y: number; lignes: string[]; w: number; h: number } | null = null;
    for (const lignes of options) {
      const w = Math.max(...lignes.map(largeur));
      const h = lignes.length * (taille + 2);
      const dansLeMur = (x: number) => Math.min(px(face.len) - w / 2 - 2, Math.max(px(0) + w / 2 + 2, x));
      const cxs = [px((m.from + m.to) / 2), px(m.from) + w / 2 + 3, px(m.to) - w / 2 - 3]
        .filter((x) => x - w / 2 >= px(m.from) - 0.5 && x + w / 2 <= px(m.to) + 0.5)
        .map(dansLeMur);
      const ys = [py(haut) - 11, py(bas) + 4 + h - (taille + 2), py(haut) - 22];
      for (const y of ys) {
        if (y - h + taille + 2 < py(bas) + 1) continue;
        const cx = cxs.find(
          (x) => !occupees.some((o) => x - w / 2 < o.x1 && x + w / 2 > o.x0 && y - h + taille + 2 < o.y1 && y + taille > o.y0),
        );
        if (cx !== undefined) {
          pose = { cx, y, lignes, w, h };
          break;
        }
      }
      if (pose) break;
    }
    if (!pose) continue;
    const { lignes, w, h } = pose;
    lignes.forEach((l, i) => d.text(l, pose!.cx, pose!.y - i * (taille + 2), taille, GREY));
    occupees.push({ x0: pose.cx - w / 2 - 2, x1: pose.cx + w / 2 + 2, y0: pose.y - h + taille, y1: pose.y + taille + 1 });
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
      // Plus de tireté vertical au milieu du trumeau : il se lisait comme
      // l'axe d'un appareil (revues du dossier).
      d.circle(px(m), yr, 8.5, '#FFFFFF');
      // Arrondi AU CUMUL : chaque morceau arrondi pour lui-même, la chaîne
      // ne faisait plus la longueur du mur (97 + 83 + 164 = 344 pour 343).
      d.text(`${Math.round(r.x1 * 100) - Math.round(r.x0 * 100)}`, px(m), yr - 2.5, 7, GREY, {
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
    // Arrondi au cumul : la chaîne fait la longueur du mur, au centimètre.
    d.text(`${Math.round(bornes[i + 1] * 100) - Math.round(bornes[i] * 100)}`, px(m), yv - 2.5, 7, GREY, { bold: true });
  }

  // Un dossier sans électricité n'a pas à le dire, sur chaque feuille, au
  // milieu des baies et des meubles (revue « Thomas »).
  if (poses.length === 0 && !sansElec) {
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

  return { titre: numero ? `Mur ${numero} — ${quoi}` : `Élévation — ${quoi}`, echelle };
}

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
  const retenus = ctx.mursNumerotes ? new Set(ctx.mursNumerotes) : null;
  return new Map(
    wallsInOrder(ctx)
      .filter((w) => !retenus || retenus.has(w.id))
      .map((w, i) => [w.id, i + 1]),
  );
}

/**
 * Où poser la pastille : au milieu du plus long RETOUR de maçonnerie.
 *
 * Au milieu du mur tout court, elle tombe en plein sur la porte dès que la
 * baie est centrée — c'est-à-dire souvent. Le plus long tronçon plein est
 * toujours du mur, et c'est là qu'il y a la place.
 */
/**
 * LE NUMÉRO D'UN MUR, ÉCRIT DANS SA MAÇONNERIE.
 *
 * Relevé du patron : « les numéros de mur sur le plan PDF sont trop
 * imposants ; il faut placer un petit numéro sur le mur, sans contour rond.
 * Il doit être léger mais visible. » C'était une pastille blanche cerclée
 * d'encre, de quatorze points de large : sur un T3, une dizaine de ronds
 * blancs posés sur le poché, plus visibles que les cotes.
 *
 * Il s'écrit maintenant EN RÉSERVE dans le poché — blanc, maigre, à la
 * taille que l'épaisseur du mur permet, jamais plus de six points. Rien
 * autour : le noir du mur suffit à le détacher.
 *
 * Et quand le mur, à l'échelle de la feuille, est trop mince pour le loger
 * (un grand logement sur un A4), le chiffre ne déborde pas en blanc sur du
 * blanc : il se pose juste à côté du mur, côté logement, en gris.
 */
const NUMERO_MAX = 6;
const NUMERO_MIN = 4.4;
const NUMERO_A_COTE = 5.5;
const GRIS_NUMERO = '#6B7380';

/** Le milieu du logement : c'est de ce côté qu'un numéro sorti du mur se pose. */
function centreDesMurs(walls: WallSeg[]): { x: number; z: number } {
  if (walls.length === 0) return { x: 0, z: 0 };
  let x = 0;
  let z = 0;
  for (const w of walls) {
    x += (w.a.x + w.b.x) / 2;
    z += (w.a.z + w.b.z) / 2;
  }
  return { x: x / walls.length, z: z / walls.length };
}

/** Dans le poché ? Pair-impair, comme le remplissage. */
function dansLePoche(p: { x: number; z: number }, contours: { x: number; z: number }[][]): boolean {
  let n = 0;
  for (const c of contours) {
    let dedans = false;
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
      const a = c[i];
      const b = c[j];
      if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
        dedans = !dedans;
      }
    }
    if (dedans) n++;
  }
  return n % 2 === 1;
}

/**
 * LE MILIEU DE LA MAÇONNERIE, en travers du mur — relevé du patron : « il
 * faut centrer les numéros sur la largeur du mur pour bien les lire ».
 *
 * L'axe d'un mur n'est pas le milieu de son poché : une façade s'épaissit
 * vers le dehors (`SUREPAISSEUR_FACADE`), et le chiffre posé sur l'axe
 * frôlait la face intérieure. On sort donc du poché des deux côtés, à partir
 * de l'axe, et l'on se pose au milieu des deux sorties — quelle que soit
 * l'épaisseur, façade ou refend.
 */
function milieuDuPoche(
  p: { x: number; z: number },
  n: { x: number; z: number },
  contours: { x: number; z: number }[][],
  defaut: number,
): { centre: { x: number; z: number }; epaisseur: number } {
  if (!dansLePoche(p, contours)) {
    /*
      LE TRAIT D'UN MUR SCANNÉ EST SUR LE BORD DU POCHÉ — c'est sa face, et
      la maçonnerie part d'un seul côté (voir `facesDesMurs`). On entre
      donc dans le mur du côté où il est, d'un pas de quatre millimètres.
    */
    let dedans: { x: number; z: number } | null = null;
    for (let k = 0.004; !dedans && k <= defaut; k += 0.004) {
      for (const s of [1, -1]) {
        const q = { x: p.x + n.x * s * k, z: p.z + n.z * s * k };
        if (dansLePoche(q, contours)) {
          dedans = q;
          break;
        }
      }
    }
    if (!dedans) return { centre: p, epaisseur: defaut };
    p = dedans;
  }
  const dedans = (s: number, k: number) => dansLePoche({ x: p.x + n.x * s * k, z: p.z + n.z * s * k }, contours);
  const sortie = (s: number) => {
    let k = 0;
    while (k < 0.6 && dedans(s, k)) k += 0.004;
    if (k === 0 || k >= 0.6) return k;
    // Le bord se cherche ensuite à la dichotomie : le pas de quatre
    // millimètres décentrait le numéro d'un demi-point.
    let lo = k - 0.004;
    let hi = k;
    for (let i = 0; i < 12; i++) {
      const mi = (lo + hi) / 2;
      if (dedans(s, mi)) lo = mi;
      else hi = mi;
    }
    return (lo + hi) / 2;
  };
  const plus = sortie(1);
  const moins = sortie(-1);
  const decale = (plus - moins) / 2;
  return {
    centre: { x: p.x + n.x * decale, z: p.z + n.z * decale },
    epaisseur: plus + moins,
  };
}

export function placeDuNumero(
  w: WallSeg,
  openings: WallSeg[],
  n: number,
  scale: number,
  px: (p: { x: number; z: number }) => Pt,
  centre: { x: number; z: number },
  contours: { x: number; z: number }[][] = [],
  encre?: CarteDEncre,
  libre?: (b: Boite) => boolean,
): { x: number; y: number; taille: number; couleur: string; boite: Boite } {
  const tag = wallTagAt(w, openings);
  const chiffres = String(n).length;
  // Helvetica : un chiffre fait 0,556 em de large, 0,72 em de haut.
  const large = (t: number) => 0.556 * chiffres * t;
  const haut = (t: number) => 0.72 * t;
  const pa = px(w.a);
  const pb = px(w.b);
  const debout = Math.abs(pb.y - pa.y) > Math.abs(pb.x - pa.x);
  // Ce que le chiffre occupe EN TRAVERS du mur : sa largeur sur un mur
  // debout, sa hauteur sur un mur couché.
  const travers = (t: number) => (debout ? large(t) : haut(t));
  const dx = w.b.x - w.a.x;
  const dz = w.b.z - w.a.z;
  const len = Math.hypot(dx, dz) || 1;
  const normale = { x: -dz / len, z: dx / len };
  const milieu = milieuDuPoche(tag, normale, contours, epaisseurDe(w));
  const epaisseur = milieu.epaisseur * scale;
  const tient = (epaisseur - 1.6) / travers(1);
  const boite = (x: number, y: number, t: number): Boite => ({
    x: x - large(t) / 2 - 0.8,
    y: y - haut(t) / 2 - 0.8,
    w: large(t) + 1.6,
    h: haut(t) + 1.6,
  });
  if (tient >= NUMERO_MIN) {
    const taille = Math.min(NUMERO_MAX, tient);
    const p = px(milieu.centre);
    return { x: p.x, y: p.y, taille, couleur: '#FFFFFF', boite: boite(p.x, p.y, taille) };
  }
  /*
    TROP MINCE : À CÔTÉ DU MUR, LÀ OÙ LE PAPIER EST BLANC. Côté logement
    d'abord, au milieu du pan d'abord ; puis de part et d'autre, le long du
    mur, et de l'autre côté — la place la plus blanche de la carte gagne.
  */
  let vers = 1;
  if ((centre.x - tag.x) * normale.x + (centre.z - tag.z) * normale.z < 0) vers = -1;
  const taille = NUMERO_A_COTE;
  const ecart = milieu.epaisseur / 2 + (1.5 + travers(taille) / 2) / scale;
  const candidats: { p: Pt; cout: number }[] = [];
  const plein = wallRuns(w, openings).filter((r) => r.kind === 'mur');
  const tMilieu = (tag.x - w.a.x) * (dx / len) + (tag.z - w.a.z) * (dz / len);
  for (const cote of [vers, -vers]) {
    for (const glisse of [0, -0.25, 0.25, -0.5, 0.5, -0.8, 0.8]) {
      const t = tMilieu + glisse;
      if (t < 0.1 || t > len - 0.1) continue;
      if (plein.length > 0 && !plein.some((r) => t >= r.t0 * len && t <= r.t1 * len)) continue;
      const surAxe = { x: w.a.x + (dx / len) * t, z: w.a.z + (dz / len) * t };
      const p = px({ x: surAxe.x + normale.x * cote * ecart, z: surAxe.z + normale.z * cote * ecart });
      const b = boite(p.x, p.y, taille);
      if (libre && !libre(b)) continue;
      const tache = encre ? encre.sous(b) : 0;
      candidats.push({ p, cout: tache * 10 + Math.abs(glisse) * 4 + (cote === vers ? 0 : 3) });
    }
  }
  candidats.sort((a, b) => a.cout - b.cout);
  const p =
    candidats[0]?.p ??
    px({ x: tag.x + normale.x * vers * ecart, z: tag.z + normale.z * vers * ecart });
  return { x: p.x, y: p.y, taille, couleur: GRIS_NUMERO, boite: boite(p.x, p.y, taille) };
}

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
/**
 * UNE FEUILLE PAR FACE ÉQUIPÉE, pas par mur — relevé des quatre revues du
 * dossier : « 7 appareils sur 23 ne sont cotés nulle part ». Le mur avait
 * une feuille, vue de la pièce qui l'a relevé ; ce qui était posé de l'autre
 * côté d'une cloison n'y paraissait qu'en clair, sans cote, parfois caché
 * sous le disque de la prise de devant. Chaque face qui porte un appareil a
 * maintenant sa feuille, vue de sa pièce, cotée depuis son propre nu. Les
 * deux faces d'une cloison se suivent : on vérifie d'un coup d'œil qu'on ne
 * perce pas dos à dos.
 */
interface FaceAElever {
  wall: WallSeg;
  /** La face regardée : le côté du mur où l'on se tient. */
  cote: 1 | -1;
}

function elevationWalls(
  ctx: SheetContext,
  toutes = false,
  photographies: Set<string> = new Set(),
): FaceAElever[] {
  const out: FaceAElever[] = [];
  for (const w of wallsInOrder(ctx)) {
    const interieur = interiorSide(w, ctx.walls, ctx.rooms ?? []);
    const appareils = (ctx.fixtures ?? []).filter((f) => f.wallId === w.id);
    const devant = appareils.some((f) => f.side === interieur);
    const derriere = appareils.some((f) => f.side !== interieur);
    /*
      « TOUS LES MURS », PAS LES ÉCLATS — revue « Claire » : 33 élévations,
      dont des joues de cheminée de 0,28 m et deux murs fantômes derrière
      un pan coupé. Un mur nu de moins de 60 cm, ou qui ne borde aucune
      pièce, n'a pas sa feuille ; équipé ou photographié, si.
    */
    const borde = (ctx.rooms ?? []).some((r) => (r.wallIds ?? []).includes(w.id)) || !(ctx.rooms ?? []).some((r) => r.wallIds);
    const digne = segLength(w) >= 0.6 && borde;
    if ((toutes && digne) || devant || photographies.has(w.id)) out.push({ wall: w, cote: interieur });
    if (derriere) out.push({ wall: w, cote: interieur === 1 ? -1 : 1 });
  }
  return out;
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

/** Deux vues sous le même angle, au degré près : la même image. */
function memeAngle(a: View3DParams, b: View3DParams): boolean {
  return Math.abs(a.theta - b.theta) < 1 && Math.abs(a.tilt - b.tilt) < 1;
}

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
    // Les repères d'appareillage se retirent des perspectives à la demande.
    fixtures: ctx.reperes3D === false ? [] : ctx.fixtures,
    showDims,
  };
  const titre = combien > 1 ? `Perspective ${rang}` : 'Perspective';
  d.text(titre, FRAME.x + 24, FRAME.y + FRAME.h - 20, 13, INK, {
    bold: true,
    align: 'left',
  });
  // Plus de « angle −32°, inclinaison 58° » : des degrés ne disent rien à
  // qui regarde la maquette (revues du dossier).
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
    particulier: ctx.particulier,
    entreprise: ctx.entreprise,
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
  /** Le niveau, quand le logement en a plusieurs : il s'écrit dans les titres. */
  niveau?: string;
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
  /** Les cotes posées à la règle libre, déjà filtrées à l'étage imprimé. */
  mesures?: { a: { x: number; z: number }; b: { x: number; z: number } }[];
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
  /** Un particulier : le cartouche dit « Propriétaire », pas « Client ». */
  particulier?: boolean;
  /**
   * L'entreprise de l'artisan (voir `store/entreprise`) : elle prend la
   * place de la marque EchoPlan dans le cartouche de chaque feuille.
   */
  entreprise?: EntreprisePdf | null;
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
 * par diverger. Leur traduction en points est celle de la 3D
 * (`symbolPolylines`), et leur pose — tournée vers le mur — celle de
 * `symbolePose`.
 *
 * `versLeMur` : où est le mur, vu du symbole, sur la feuille (y vers le
 * haut). Par défaut le symbole est droit : c'est ce que veulent la légende
 * et les élévations, qui regardent le mur de face.
 */
function drawSymbol(
  d: Draw,
  paths: SymbolStroke[],
  cx: number,
  cy: number,
  k: number,
  color: string,
  width = 1.1,
  versLeMur: Pt = { x: 0, y: -1 },
) {
  for (const { pts, fill } of symbolePose(paths, cx, cy, k, versLeMur)) {
    if (fill) d.poly(pts, color, color, width);
    else d.path(pts, width, color);
  }
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
  const rows: BoardRow[] = [];
  let numero = 0;
  for (const diff of list.differentials) {
    // Par identifiant : deux circuits du même libellé restent deux (revue « Nicolas »).
    const proteges = circuitsDuDifferentiel(diff, list.circuits);
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
    /*
      L'USAGE DÉDUIT NE SE RAPPELLE QUE S'IL APPREND QUELQUE CHOSE.

      Pour une pièce non renommée, il EST le nom, et la feuille bégayait
      « Cuisine … Cuisine · 20,0 m² ». La règle ne couvrait qu'un cas :
      celui où l'usage RÉPÈTE le nom.

      « Autre pièce » est le fourre-tout — le mot que l'application emploie
      quand elle n'a PAS su. L'imprimer, c'est écrire son propre échec à
      côté du nom du client, sur le document qu'il lit avant les chiffres.
      Il se tait aussi, et la surface reste : c'est elle qu'on vient lire.
    */
    const surface = `${room.area.toFixed(1).replace('.', ',')} m²`;
    const usageParlant =
      !!room.use && room.use !== room.room && room.use !== USE_LABEL.autre;
    d.text(
      usageParlant ? `${room.use} · ${surface}` : surface,
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

/**
 * LE DEVIS, PRÊT À REMETTRE — correctif de l'audit « dans la peau d'un
 * utilisateur » : le devis ne s'exportait pas (ni PDF ni partage, pas de bloc
 * entreprise ou client, pas de numéro). « Pour un pro, c'est une impasse. »
 *
 * Un document de lettre, pas une feuille de plan : l'entreprise en tête, le
 * numéro et la date, le client et le chantier, les fournitures rayon par
 * rayon, la pose estimée avec sa TVA, le total, les exclusions, et la case
 * « bon pour accord ». Les lignes écartées du ticket n'y sont pas : le client
 * n'a pas à lire ce qu'on ne lui vend pas. Un long devis passe sur autant de
 * pages qu'il faut ; le total n'arrive qu'une fois, à la fin.
 */
export interface DevisPourPdf {
  numero: string;
  date: Date;
  /** Le nom du plan : le chantier. */
  chantier: string;
  client?: string;
  adresse?: string;
  entreprise?: EntreprisePdf | null;
  /** La gamme d'appareillage, en toutes lettres. */
  gamme?: string;
  devis: Devis;
  /** La pose estimée, quand on la compte. */
  pose?: Pose | null;
}

/** « 1 234,50 € » — l'espace des milliers, la virgule, les centimes. */
const enEuros = (v: number) => {
  const [e, c] = (Math.round(v * 100) / 100).toFixed(2).split('.');
  return `${e.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${c} €`;
};

export function devisFilename(numero: string, chantier: string): string {
  const nom = chantier.replace(/[\\/:*?"<>|]/g, ' ').trim();
  return `Devis ${numero}${nom ? ` — ${nom}` : ''}.pdf`;
}

export function buildDevisPdf(e: DevisPourPdf): Uint8Array {
  const X0 = 40;
  const X1 = PAGE_W - 40;
  const COL_QTE = 382;
  const COL_PU = 468;
  const BAS = 78;
  const two = (v: number) => String(v).padStart(2, '0');
  const date = `${two(e.date.getDate())}/${two(e.date.getMonth() + 1)}/${e.date.getFullYear()}`;
  const feuilles: Draw[] = [];
  let d = new Draw();
  let y = 0;

  const enTeteDuTableau = () => {
    d.rect(X0, y - 6, X1 - X0, 18, '#EEF1F6', null, 0);
    d.text('Désignation', X0 + 8, y, 8, GREY, { bold: true, align: 'left' });
    d.text('Qté', COL_QTE, y, 8, GREY, { bold: true, align: 'right' });
    d.text('PU TTC', COL_PU, y, 8, GREY, { bold: true, align: 'right' });
    d.text('Total TTC', X1 - 6, y, 8, GREY, { bold: true, align: 'right' });
    y -= 22;
  };
  const nouvellePage = () => {
    d = new Draw();
    feuilles.push(d);
    y = PAGE_H - 50;
  };
  /** Une page de plus quand ce qui vient ne tient pas — le tableau reprend son en-tête. */
  const place = (h: number, tableau = true) => {
    if (y - h >= BAS) return;
    nouvellePage();
    d.text(`Devis n° ${e.numero} — suite`, X0, y, 10, GREY, { bold: true, align: 'left' });
    y -= 26;
    if (tableau) enTeteDuTableau();
  };

  // ------------------------------------------------------------ l'en-tête
  nouvellePage();
  const ent = e.entreprise?.nom ? e.entreprise : null;
  if (ent) {
    d.text(fitText(ent.nom, 15, 270), X0, y, 15, INK, { bold: true, align: 'left' });
    let yy = y - 16;
    for (const l of [ent.adresse, [ent.telephone, ent.email].filter(Boolean).join(' · '), ent.siret ? `SIRET ${ent.siret}` : '']) {
      if (!l) continue;
      d.text(fitText(l, 8.5, 270), X0, yy, 8.5, GREY, { align: 'left' });
      yy -= 11;
    }
  } else {
    drawLogo(d, X0, y - 26, 34);
    d.text('EchoPlan', X0 + 42, y - 10, 13, INK, { bold: true, align: 'left' });
  }
  d.text('DEVIS', X1, y - 4, 24, INK, { bold: true, align: 'right' });
  d.text(`N° ${e.numero}`, X1, y - 24, 10.5, INK, { align: 'right' });
  d.text(`Date : ${date}`, X1, y - 38, 9.5, INK, { align: 'right' });
  d.text('Valable un mois', X1, y - 51, 8, GREY, { align: 'right' });

  // Le client et le chantier, dans leur cadre.
  y -= 84;
  const cx = 320;
  d.rect(cx, y - 62, X1 - cx, 70, null, GREY_LIGHT, 0.6);
  d.text('CLIENT', cx + 10, y - 4, 7, GREY, { align: 'left' });
  d.text(fitText(e.client || '—', 11, X1 - cx - 20), cx + 10, y - 19, 11, INK, { bold: true, align: 'left' });
  if (e.adresse) d.text(fitText(e.adresse, 9, X1 - cx - 20), cx + 10, y - 33, 9, INK, { align: 'left' });
  d.text(fitText(`Chantier : ${e.chantier}`, 8.5, X1 - cx - 20), cx + 10, y - 50, 8.5, GREY, { align: 'left' });
  const objet = `Objet : installation électrique${e.gamme ? `, appareillage ${e.gamme}` : ''}.`;
  for (const [i, l] of wrapText(objet, 9.5, cx - X0 - 20).entries()) {
    d.text(l, X0, y - 19 - i * 13, 9.5, INK, { align: 'left' });
  }
  y -= 96;

  // ------------------------------------------------------- les fournitures
  enTeteDuTableau();
  const lignes = e.devis.lignes.filter((l) => !l.ecarte);
  const familles: string[] = [];
  for (const l of lignes) if (!familles.includes(l.famille)) familles.push(l.famille);
  for (const f of familles) {
    place(36);
    d.text(f.toUpperCase(), X0 + 8, y, 7.5, GREY, { bold: true, align: 'left' });
    y -= 16;
    for (const l of lignes.filter((x) => x.famille === f)) {
      place(16);
      d.text(fitText(l.libelle, 9.5, COL_QTE - X0 - 60), X0 + 8, y, 9.5, INK, { align: 'left' });
      d.text(`${String(l.quantite).replace('.', ',')} ${l.unite}`, COL_QTE, y, 9, INK, { align: 'right' });
      /*
        CE QUI NE SE FACTURE PAS NE S'ÉCRIT PAS « 0,00 € » : un luminaire
        n'est pas compté (cela dépend des envies), le support du tableau est
        compris dans le coffret. Un zéro sur un devis se lit comme un oubli.
      */
      if (l.pu === 0 && l.total === 0) {
        d.text('—', COL_PU, y, 9, GREY, { align: 'right' });
        d.text(/non compt/i.test(l.note ?? '') ? 'non compté' : 'compris', X1 - 6, y, 9, GREY, { align: 'right' });
      } else {
        d.text(l.pu === null ? 'à chiffrer' : enEuros(l.pu), COL_PU, y, 9, l.pu === null ? GREY : INK, { align: 'right' });
        d.text(l.pu === null ? '—' : enEuros(l.total), X1 - 6, y, 9, INK, { align: 'right' });
      }
      d.line(X0, y - 5, X1, y - 5, 0.3, '#E3E7ED');
      y -= 16;
    }
    y -= 4;
  }
  place(24);
  d.line(X0, y + 8, X1, y + 8, 0.8, INK);
  d.text('Total fournitures (prix publics TTC)', X0 + 8, y - 6, 10, INK, { bold: true, align: 'left' });
  d.text(enEuros(e.devis.total), X1 - 6, y - 6, 10, INK, { bold: true, align: 'right' });
  y -= 32;

  // ------------------------------------------------- la pose, estimée
  const pose = e.pose && e.pose.heures > 0 ? e.pose : null;
  if (pose) {
    place(60);
    d.text('MAIN-D’ŒUVRE (ESTIMÉE)', X0 + 8, y, 7.5, GREY, { bold: true, align: 'left' });
    y -= 16;
    for (const l of pose.lignes) {
      place(16);
      d.text(fitText(`Pose — ${l.famille} (${l.quantite} point${l.quantite > 1 ? 's' : ''})`, 9.5, COL_QTE - X0 - 60), X0 + 8, y, 9.5, INK, {
        align: 'left',
      });
      d.text(enHeures(l.heures), COL_QTE, y, 9, INK, { align: 'right' });
      d.text(`${enEuros(pose.taux)} HT/h`, COL_PU, y, 8.5, INK, { align: 'right' });
      d.text(`${enEuros(Math.round(l.heures * pose.taux * 100) / 100)} HT`, X1 - 6, y, 9, INK, { align: 'right' });
      d.line(X0, y - 5, X1, y - 5, 0.3, '#E3E7ED');
      y -= 16;
    }
    place(24);
    d.line(X0, y + 8, X1, y + 8, 0.8, INK);
    d.text('Total main-d’œuvre HT', X0 + 8, y - 6, 9.5, INK, { bold: true, align: 'left' });
    d.text(enEuros(pose.ht), X1 - 6, y - 6, 9.5, INK, { bold: true, align: 'right' });
    y -= 29;
  }

  // ------------------------------------------------------------ le total
  /*
    HT, TVA, TTC — voir `totauxDuDevis` : les fournitures ramenées hors
    taxes, puis un seul taux pour tout le chantier.
  */
  const t = totauxDuDevis(e.devis.total, pose);
  const mentions = [
    'Prix des fournitures relevés TTC en enseigne (TVA 20 %), ramenés hors taxes, à confirmer à la commande.',
    ...(pose && t.tauxTva < TVA_DES_PRIX_PUBLICS
      ? ['TVA au taux réduit des travaux de rénovation d’un logement de plus de deux ans, fournitures posées comprises (attestation du client requise).']
      : []),
    ...(pose ? ['Main-d’œuvre estimée au temps de pose de chaque point, à confirmer après visite.'] : []),
    ...e.devis.exclusions.filter((x) => !(pose && /^Main-d/.test(x))),
  ];
  const lignesMentions = mentions.map((m) => wrapText(m, 7.5, X1 - X0));
  /*
    LE TOTAL, LES MENTIONS ET LE BON POUR ACCORD TIENNENT ENSEMBLE — revue
    « Karim » : le cadre de signature partait seul en page 3. On réserve
    leur place d'un coup ; s'ils ne tiennent pas, ils passent ensemble.
  */
  const hauteurFin =
    (pose ? 4 : 3) * 14 + 48 + lignesMentions.reduce((h, ls) => h + ls.length * 10 + 2, 0) + 10 + 84;
  place(Math.min(hauteurFin, 560), false);
  const bx = 300;
  const lignesTotal: [string, number][] = [
    ['Fournitures HT', t.fournituresHt],
    ...(pose ? ([['Main-d’œuvre HT', t.poseHt]] as [string, number][]) : []),
    ['Total HT', t.ht],
    [`TVA ${String(Math.round(t.tauxTva * 1000) / 10).replace('.', ',')} %`, t.tva],
  ];
  const hauteurTotal = lignesTotal.length * 14 + 30;
  d.rect(bx, y - hauteurTotal + 10, X1 - bx, hauteurTotal, '#F4F6FA', null, 0);
  let yt = y - 4;
  for (const [mot, v] of lignesTotal) {
    const gras = mot === 'Total HT';
    d.text(mot, bx + 10, yt, 9, gras ? INK : GREY, { align: 'left', bold: gras });
    d.text(enEuros(v), X1 - 10, yt, 9, INK, { align: 'right', bold: gras });
    yt -= 14;
  }
  yt -= 6;
  d.text('TOTAL TTC', bx + 10, yt, 12, INK, { bold: true, align: 'left' });
  d.text(enEuros(t.ttc), X1 - 10, yt, 13, INK, { bold: true, align: 'right' });
  y -= hauteurTotal + 18;

  // ------------------------------------------------------- les mentions
  for (const ls of lignesMentions) {
    place(ls.length * 10 + 2, false);
    for (const l of ls) {
      d.text(l, X0, y, 7.5, GREY, { align: 'left' });
      y -= 10;
    }
  }

  // ------------------------------------------------ le bon pour accord
  y -= 10;
  place(84, false);
  d.rect(cx, y - 72, X1 - cx, 76, null, GREY_LIGHT, 0.6);
  d.text('Bon pour accord — date et signature du client', cx + 10, y - 10, 8, GREY, { align: 'left' });

  // ------------------------------------------------------- les pieds de page
  const signe = ent ? `${ent.nom}${ent.siret ? ` · SIRET ${ent.siret}` : ''}` : 'EchoPlan';
  feuilles.forEach((f, i) => {
    f.text(fitText(`${signe} · Devis n° ${e.numero} — page ${i + 1} / ${feuilles.length}`, 7.5, X1 - X0), PAGE_W / 2, 30, 7.5, GREY_LIGHT);
  });
  return buildDocument(feuilles.map((f) => f.stream()));
}

export function materialFilename(name: string): string {
  return pdfFilename(`${name} - materiel`);
}

export function pdfFilename(name: string): string {
  /*
    « É » DEVIENT « E », IL NE DISPARAÎT PAS — revue « Inès » : « 1er étage »
    donnait « 1er-tage », « Rez-de-chaussée » « Rez-de-chausse ». Et le
    « + » de « R+1 » reste.
  */
  const clean = latin1(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // « 12/10/2026 » devient « 12-10-2026 », comme dans le DXF (revue « Léa »).
    .replace(/[\\/:]+/g, ' ')
    .replace(/[^\w\-+ ]/g, '')
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

/**
 * LA PAGE DE GARDE — correctif de l'audit « dans la peau d'un utilisateur » :
 * le dossier s'ouvrait directement sur le plan coté. Un dossier qu'on remet
 * à un acheteur, à un artisan ou à un client commence par dire de quoi il
 * s'agit : le logement et à qui il est, ses chiffres, une vue d'ensemble, et
 * ce que contient chaque feuille.
 */
const GENRE_EN_CLAIR: Record<FeuilleDuDossier['genre'], string> = {
  garde: 'Page de garde',
  plan: 'Plan coté',
  metre: 'Métré',
  achats: 'Ce qu’il faut acheter',
  existant: 'Tableau existant',
  gaines: 'Plan des gaines',
  perspective: 'Perspectives',
  elevation: 'Murs de face',
  unifilaire: 'Schéma unifilaire',
  multifilaire: 'Schéma multifilaire',
};

function gardePage(
  ctx: SheetContext,
  sheet: string,
  suite: FeuilleDuDossier[],
  /** Les niveaux du logement, quand il en a plusieurs : ses chiffres en font la somme. */
  niveaux?: { nom: string; ctx: SheetContext }[],
): string {
  const d = new Draw();
  const x0 = FRAME.x + 30;
  const w = FRAME.w - 60;
  let y = TETE - 10;

  // Qui remet le dossier : l'entreprise de l'artisan, ou la marque.
  const ent = ctx.entreprise?.nom ? ctx.entreprise : null;
  if (ent) {
    d.text(fitText(ent.nom, 13, w), x0, y, 13, INK, { bold: true, align: 'left' });
    const coord = [ent.telephone, ent.email, ent.adresse].filter((x): x is string => !!x && !!x.trim()).join(' · ');
    if (coord) d.text(fitText(coord, 8.5, w), x0, y - 14, 8.5, GREY, { align: 'left' });
    if (ent.siret) d.text(fitText(`SIRET ${ent.siret}`, 8, w), x0, y - 26, 8, GREY_LIGHT, { align: 'left' });
  } else {
    drawLogo(d, x0, y - 30, 36);
    d.text('EchoPlan', x0 + 44, y - 12, 13, INK, { bold: true, align: 'left' });
    d.text('Scan 3D & plans', x0 + 44, y - 24, 7.5, GREY, { align: 'left' });
  }

  // Le logement.
  y -= 96;
  d.text(fitText(ctx.name, 26, w), x0, y, 26, INK, { bold: true, align: 'left' });
  y -= 22;
  d.text(ctx.particulier ? 'Dossier du logement' : 'Dossier de chantier', x0, y, 12, GREY, { align: 'left' });
  if (niveaux && niveaux.length > 1) {
    y -= 15;
    d.text(fitText(`${niveaux.length} niveaux : ${niveaux.map((x) => x.nom).join(', ')}`, 10, w), x0, y, 10, GREY, {
      align: 'left',
    });
  }
  y -= 26;
  const now = new Date();
  const two = (v: number) => String(v).padStart(2, '0');
  const lignes: [string, string | undefined][] = [
    [ctx.particulier ? 'Propriétaire' : 'Client', ctx.client],
    [ctx.particulier ? 'Adresse' : 'Chantier', ctx.address],
    ['Établi le', `${two(now.getDate())}/${two(now.getMonth() + 1)}/${now.getFullYear()}`],
  ];
  for (const [mot, valeur] of lignes) {
    if (!valeur) continue;
    d.text(mot.toUpperCase(), x0, y, 7, GREY_LIGHT, { align: 'left' });
    d.text(fitText(valeur, 10.5, w - 90), x0 + 90, y, 10.5, INK, { align: 'left' });
    y -= 16;
  }

  // Ses chiffres : trois cases, sur tous les niveaux du logement.
  let nPieces = 0;
  let sol = 0;
  let habitable = 0;
  let avecHabitable = false;
  let aVerifier = 0;
  let toutFerme = true;
  for (const c of niveaux ? niveaux.map((x) => x.ctx) : [ctx]) {
    const parts = roomParts(c.walls, c.rooms);
    nPieces += parts.length;
    toutFerme = toutFerme && parts.every((p) => !!p.surface?.exact);
    sol += parts.reduce((t, p) => t + (p.surface?.area ?? 0), 0);
    const hab = surfacesHabitables(
      (c.rooms ?? []).map((r) => ({
        id: r.id,
        name: c.roomNames[r.id],
        releve: (r as { releve?: { plafond?: PlafondDeLaPiece | null } | null }).releve,
      })),
      parts,
      c.objects,
    );
    habitable += hab.total;
    avecHabitable = avecHabitable || hab.pieces.length > 0;
    aVerifier += hab.aVerifier;
  }
  const cases: [string, string][] = [
    ['Pièces', String(nPieces)],
    // Une pièce restée ouverte : la surface est approchée, et elle le dit
    // (revue « Malik » : « 129,4 m² » sous une mezzanine ouverte).
    ['Surface au sol', `${toutFerme ? '' : '≈ '}${fr1(sol)} m²`],
    // Seulement quand elle dit AUTRE CHOSE que la surface au sol : deux
    // cases au même chiffre se lisaient comme une erreur (revues du dossier).
    // « À vérifier » dans l'intitulé : dans le chiffre, il débordait de sa
    // case (revues « Léon » et « Malik »).
    ...(avecHabitable && (Math.abs(habitable - sol) >= 0.05 || aVerifier > 0)
      ? ([
          [aVerifier > 0 ? 'Habitable estimée · à vérifier' : 'Habitable estimée', `≈ ${fr1(habitable)} m²`],
        ] as [string, string][])
      : []),
  ];
  y -= 14;
  const large = (w - 2 * 12) / 3;
  cases.forEach(([mot, valeur], i) => {
    const cx = x0 + i * (large + 12);
    d.rect(cx, y - 46, large, 46, '#F4F6FA', null, 0);
    d.text(mot.toUpperCase(), cx + 12, y - 16, 7, GREY, { align: 'left' });
    d.text(valeur, cx + 12, y - 36, 16, INK, { bold: true, align: 'left' });
  });
  y -= 46;

  // Une vue d'ensemble, quand il y a de quoi la dessiner.
  const basVue = FRAME.y + TITLE_H + 190;
  if (ctx.walls.length > 0 && y - 20 - basVue > 120) {
    draw3DView(
      d,
      ctx.walls,
      ctx.openings,
      ctx.objects,
      { x: x0, y: basVue, w, h: y - 20 - basVue },
      // La case est large et basse : sans zoom, le logement n'en prenait
      // que le milieu. La case rogne de toute façon ce qui dépasserait.
      { ...DEFAULT_PDF_VIEWS[0], zoom: 1.6 },
      {
        showDims: false,
        showSurfaces: ctx.showSurfaces,
        floors: ctx.floors,
        roomNames: ctx.roomNames,
        rooms: ctx.rooms,
        fixtures: [],
      },
    );
  }

  /*
    LE CONTENU DU DOSSIER — une ligne par sorte de feuille, avec ses
    numéros : un dossier de trente murs de face ne déroule pas trente
    lignes, il dit « Murs de face, 6 à 35 ».
  */
  let yl = basVue - 22;
  d.text('Contenu du dossier', x0, yl, 11, INK, { bold: true, align: 'left' });
  yl -= 6;
  d.line(x0, yl, x0 + w, yl, 0.6, INK);
  const groupes: { genre: FeuilleDuDossier['genre']; titre: string; de: number; a: number }[] = [];
  suite.forEach((f, i) => {
    const numero = i + 2;
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.genre === f.genre) dernier.a = numero;
    else groupes.push({ genre: f.genre, titre: f.titre, de: numero, a: numero });
  });
  for (const g of groupes) {
    if (yl < FRAME.y + TITLE_H + 24) break;
    yl -= 15;
    const titre = g.a > g.de ? GENRE_EN_CLAIR[g.genre] : g.titre;
    d.text(fitText(titre, 10, w - 80), x0, yl, 10, INK, { align: 'left' });
    d.text(g.a > g.de ? `${g.de} à ${g.a}` : String(g.de), x0 + w, yl, 10, GREY, { align: 'right' });
  }

  drawSheetChrome(d, {
    project: ctx.name,
    filename: ctx.filename,
    client: ctx.client,
    particulier: ctx.particulier,
    entreprise: ctx.entreprise,
    address: ctx.address,
    sheetTitle: 'Page de garde',
    sheet,
    scaleLabel: null,
  });
  return d.stream();
}

/**
 * Le nom de chaque pièce sur un document : le sien, ou « Pièce n », rangée
 * parmi les seules pièces qui n'en ont pas.
 */
export function nomsDesPieces(
  rooms: { id: string; name?: string }[] | undefined,
  noms: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = { ...(noms ?? {}) };
  let rang = 0;
  for (const r of rooms ?? []) {
    const nom = (out[r.id] ?? r.name ?? '').trim();
    out[r.id] = nom || `Pièce ${++rang}`;
  }
  return out;
}

/** Une feuille du dossier, telle que le sommaire la nomme. */
export interface FeuilleDuDossier {
  genre:
    | 'garde'
    | 'plan'
    | 'metre'
    | 'achats'
    | 'existant'
    | 'gaines'
    | 'perspective'
    | 'elevation'
    | 'unifilaire'
    | 'multifilaire';
  titre: string;
}

/** Une feuille prévue, et la façon de la fabriquer une fois numérotée. */
interface FeuillePlanifiee extends FeuilleDuDossier {
  fabriquer: (numero: string) => ReturnType<typeof planPage>;
}

function planifierUnNiveau(
  scan: ScanForPdf,
  include3D: boolean,
  opts: PdfOptions,
  /** Le préfixe des images : deux niveaux n'ont pas le droit au même nom. */
  prefixe = '',
): { feuilles: FeuillePlanifiee[]; images: PdfImage[]; ctx: SheetContext } {
  /*
    UNE PIÈCE SANS NOM S'APPELLE PAREIL SUR TOUTES LES FEUILLES — revue
    « Thomas » : le plan n'en disait rien, le métré la nommait « Pièce 3 »,
    et une enfilade commençait à « Pièce 2 ». Elle reçoit ici son nom, une
    fois, rangée parmi les seules pièces sans nom.
  */
  scan = { ...scan, roomNames: nomsDesPieces(scan.rooms, scan.roomNames) };
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
    const im = pdfImage(`${prefixe}Im${i}`, p.base64);
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
  /*
    LA FEUILLE DES GAINES existe des qu'un cheminement a ete calcule : c'est
    l'appelant qui decide de le fournir, et le fournir veut dire qu'on veut
    la feuille.
  */
  const withGaines = (scan.routes?.length ?? 0) > 0;
  const ctx: SheetContext = {
    name: scan.name,
    niveau: scan.niveau,
    mursNumerotes: [...new Set(murs.map((m) => m.wall.id))],
    filename,
    client: scan.client,
    address: scan.address,
    particulier: scan.particulier,
    entreprise: scan.entreprise ?? null,
    reperes3D: opts.reperes3D ?? true,
    walls: scan.walls,
    openings: scan.openings,
    objects: scan.objects,
    floors: scan.floors ?? {},
    roomNames: scan.roomNames ?? {},
    rooms: scan.rooms,
    fixtures: scan.fixtures ?? [],
    routes: scan.routes,
    circuitsDesAppareils: schemas?.marks,
    ceiling: opts.ceiling ?? [],
    notes: scan.notes,
    mesures: scan.mesures,
    north: scan.north ?? null,
    colorOpenings: opts.colorOpenings ?? false,
    showSurfaces: opts.surfaces ?? true,
    showTextures: opts.textures ?? false,
  };
  /*
    LE PLAN D'ENSEMBLE NE PORTE PLUS LES GAINES.

    Relevé du patron : « on y voit plein de traits incompréhensibles ». Le
    cheminement part sur sa feuille — voir `gainesPage` — et le plan
    d'ensemble redevient ce qu'il est : la maçonnerie, l'appareillage et
    leurs cotes.
  */
  const feuilles: FeuillePlanifiee[] = [
    {
      genre: 'plan',
      titre: 'Plan coté',
      fabriquer: (n) => planPage({ ...ctx, routes: undefined }, n, opts.plan, opts.measures2D ?? true),
    },
  ];
  if (withMetre) {
    const pages = feuillesDuMetre(scan.walls, scan.rooms);
    for (let page = 1; page <= pages; page++) {
      feuilles.push({
        genre: 'metre',
        titre: page > 1 ? 'Métré (suite)' : 'Métré',
        fabriquer: (n) => metrePage(ctx, n, { page, pages }),
      });
    }
  }
  // Les achats suivent le métré : ce qu'on a mesuré, puis ce qu'on achète.
  const achats = opts.achats && opts.achats.pieces.length > 0 ? opts.achats : null;
  if (achats) {
    feuilles.push({ genre: 'achats', titre: titreDesAchats(ctx), fabriquer: (n) => achatsPage(ctx, n, achats) });
  }
  /*
    L'EXISTANT VIENT JUSTE APRÈS LE MÉTRÉ.

    C'est l'ordre de la visite : voici le logement, voici ce qu'il y a
    dedans aujourd'hui, voici ce qu'on propose. Le client lit le dossier
    dans cet ordre-là, et c'est dans cet ordre qu'on lui en parle.
  */
  if (existant) {
    feuilles.push({
      genre: 'existant',
      // Déduit du plan, il ne se présente pas comme un relevé (revue « Marc »).
      titre: existant.projete ? 'Tableau projeté (non relevé)' : 'Tableau existant',
      fabriquer: (n) => existantPage(ctx, n, existant),
    });
  }
  /*
    LE CHEMINEMENT, JUSTE APRES LE METRE.

    C'est l'ordre du chantier : voici le logement, voici ce qu'il faut, voici
    par ou ca passe. Et le tableau de tirage se lit sous le trace, sur la
    meme feuille — celui qui commande la couronne a tout sous les yeux.
  */
  if (withGaines) {
    feuilles.push({ genre: 'gaines', titre: 'Plan des gaines', fabriquer: (n) => gainesPage(ctx, n, schemas?.rows ?? []) });
  }
  if (include3D) {
    /*
      LA PERSPECTIVE QUI REDIT LA GARDE S'EN VA — relevé des revues du
      dossier : la même vue, sous le même angle, ouvrait le dossier et
      occupait la feuille 4, avec 70 % de blanc. Un autre angle, réglé à
      l'export, garde sa feuille.

      ET LES AUTRES SE RENUMÉROTENT — revue « Thomas » : trois vues
      imprimaient « Perspective 2 » et « Perspective 3 », sans 1.
    */
    const gardees = vues.filter((v) => !(opts.garde && memeAngle(v, DEFAULT_PDF_VIEWS[0])));
    gardees.forEach((v, i) => {
      feuilles.push({
        genre: 'perspective',
        titre: gardees.length > 1 ? `Perspective ${i + 1}` : 'Perspective',
        fabriquer: (n) => threeDPage(ctx, n, v, opts.measures3D ?? true, i + 1, gardees.length),
      });
    });
  }
  // Les élévations viennent après les plans et avant les schémas : on lit
  // le logement, puis chaque mur, puis le tableau.
  // Les photos d'un mur vont à sa PREMIÈRE feuille : celle de la face de
  // la pièce qui l'a relevé, d'où on l'a photographié.
  const dejaPhotographie = new Set<string>();
  const avecCliches = murs.map(({ wall: w }) => {
    const cliches = dejaPhotographie.has(w.id) ? [] : photos.get(w.id) ?? [];
    dejaPhotographie.add(w.id);
    return cliches;
  });
  /*
    DEUX FACES PAR FEUILLE quand elles vont ensemble (même pièce, ou les
    deux faces d'une cloison), qu'aucune ne porte de photo, et que l'échelle
    commune reste lisible : au 1:50 au moins. Voir `elevationsDeDeuxFaces`.
  */
  const pieceDe = (f: FaceAElever) => pieceDuCote(f.wall, f.cote, ctx.walls, ctx.rooms ?? []);
  const zoneMoitie = zoneDeLaFace({ haut: CADRE_FEUILLE.haut, bas: (CADRE_FEUILLE.haut + CADRE_FEUILLE.bas) / 2 + 4 }, false);
  const echelleCommune = (a: FaceAElever, b: FaceAElever): EchelleChoisie | null => {
    const e = [a, b].map((f) => {
      const len = wallFace(f.wall, wallQuads(ctx.walls).get(f.wall.id), f.cote).len;
      return echelleElevation(zoneMoitie.w, zoneMoitie.h, len, f.wall.height);
    });
    const pire = e[0].ratio >= e[1].ratio ? e[0] : e[1];
    return pire.ratio <= 50 ? pire : null;
  };
  let numeroDeFace = 0;
  for (let i = 0; i < murs.length; i++) {
    const a = murs[i];
    const b = murs[i + 1];
    numeroDeFace += 1;
    const ensemble =
      b &&
      avecCliches[i].length === 0 &&
      avecCliches[i + 1].length === 0 &&
      (a.wall.id === b.wall.id || (pieceDe(a) !== null && pieceDe(a) === pieceDe(b)));
    const commune = ensemble ? echelleCommune(a, b) : null;
    if (b && commune) {
      feuilles.push({
        genre: 'elevation',
        titre: `Murs ${numeroDeFace} et ${numeroDeFace + 1}`,
        fabriquer: (n) => elevationsDeDeuxFaces(ctx, n, a, b, commune),
      });
      numeroDeFace += 1;
      i += 1;
      continue;
    }
    const cliches = avecCliches[i];
    feuilles.push({
      genre: 'elevation',
      titre: `Mur ${numeroDeFace}`,
      fabriquer: (n) => elevationPage(ctx, n, a.wall, cliches, a.cote),
    });
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
    const sch = schemas;
    feuilles.push({
      genre: 'unifilaire',
      titre: 'Schéma unifilaire',
      fabriquer: (n) => unifilairePage(ctx, n, sch.rows, sch.differentials, detailDesDeparts(scan, sch.marks, sch.rows)),
    });
    /*
      PLUS DE FEUILLE MULTIFILAIRE — relevé unanime des revues du dossier :
      des traits de couleur parallèles, sans appareil ni borne, qui
      annonçaient des navettes là où chaque pièce est en simple allumage.
      Ce n'est pas un multifilaire, et la feuille n'apprenait rien que
      l'unifilaire ne dise.
    */
  }
  return { feuilles, images, ctx };
}

function planifierLeDossier(
  scan: ScanForPdf,
  include3D: boolean,
  opts: PdfOptions = {},
): { feuilles: FeuillePlanifiee[]; images: PdfImage[] } {
  const niveaux = opts.niveaux && opts.niveaux.length > 1 ? opts.niveaux : null;
  let feuilles: FeuillePlanifiee[];
  let images: PdfImage[];
  /** Le logement, pour la page de garde ; et ses niveaux, pour ses chiffres. */
  let ctx: SheetContext;
  let ctxNiveaux: { nom: string; ctx: SheetContext }[] | undefined;
  if (!niveaux) {
    ({ feuilles, images, ctx } = planifierUnNiveau(scan, include3D, opts));
  } else {
    feuilles = [];
    images = [];
    ctxNiveaux = [];
    niveaux.forEach((nv, k) => {
      // Ce qui est au logement (son nom, à qui il est) ; ce qui est au niveau.
      const sien: ScanForPdf = {
        ...nv.scan,
        name: `${scan.name} — ${nv.nom}`,
        niveau: nv.nom,
        client: scan.client,
        address: scan.address,
        particulier: scan.particulier,
        entreprise: scan.entreprise,
        north: scan.north,
      };
      const r = planifierUnNiveau(
        sien,
        include3D,
        {
          ...opts,
          niveaux: undefined,
          achats: null,
          existant: nv.courant ? opts.existant : undefined,
          schemas: nv.courant ? opts.schemas : null,
          ceiling: nv.courant ? opts.ceiling : nv.ceiling,
        },
        `N${k}`,
      );
      for (const f of r.feuilles) feuilles.push({ ...f, titre: `${f.titre} — ${nv.nom}` });
      images.push(...r.images);
      ctxNiveaux!.push({ nom: nv.nom, ctx: r.ctx });
    });
    // Le logement : le niveau courant pour la vue d'ensemble, le nom du tout.
    const courant = ctxNiveaux[Math.max(0, niveaux.findIndex((x) => x.courant))].ctx;
    ctx = { ...courant, name: scan.name, filename: pdfFilename(scan.name) };
    // Les achats, une fois, pour tout le logement.
    const achats = opts.achats && opts.achats.pieces.length > 0 ? opts.achats : null;
    if (achats) {
      const pourTout = ctx;
      feuilles.push({ genre: 'achats', titre: titreDesAchats(pourTout), fabriquer: (n) => achatsPage(pourTout, n, achats) });
    }
  }
  // La page de garde ouvre le dossier, et annonce les feuilles qui suivent.
  if (opts.garde) {
    const suite = feuilles.map(({ genre, titre }) => ({ genre, titre }));
    const duLogement = ctx;
    const parNiveau = ctxNiveaux;
    feuilles.unshift({
      genre: 'garde',
      titre: 'Page de garde',
      fabriquer: (n) => gardePage(duLogement, n, suite, parNiveau),
    });
  }
  return { feuilles, images };
}

/**
 * LE SOMMAIRE DU DOSSIER — ses feuilles, dans l'ordre, sans en fabriquer
 * une seule.
 *
 * L'écran d'export le montre : combien de feuilles, lesquelles, et ce que
 * chaque réglage ajoute. Il vient du MÊME plan que le document
 * (`planifierLeDossier`) : un sommaire écrit à part finirait par annoncer
 * une feuille que le PDF n'imprime plus.
 */
export function sommaireDuDossier(
  scan: ScanForPdf,
  include3D: boolean,
  opts: PdfOptions = {},
): FeuilleDuDossier[] {
  return planifierLeDossier(scan, include3D, opts).feuilles.map(({ genre, titre }) => ({ genre, titre }));
}

export function buildScanPdf(
  scan: ScanForPdf,
  include3D: boolean,
  opts: PdfOptions = {},
): Uint8Array {
  const { feuilles, images } = planifierLeDossier(scan, include3D, opts);
  const total = feuilles.length;
  const pages = feuilles.map((f, i) => f.fabriquer(`${i + 1} / ${total}`));
  return buildDocument(pages, images);
}

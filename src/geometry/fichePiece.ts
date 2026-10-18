/**
 * CE QUE LE SCAN DIT D'UNE PIÈCE — et que l'application ne disait pas.
 *
 * Relevé du patron : « cherche des améliorations à apporter au scan, qu'il
 * peut apporter ensuite à notre app en termes d'informations sur les pièces
 * scannées ; améliore au maximum le natif ».
 *
 * Le scan voyait bien plus qu'il n'en livrait. Ce module tire, pièce par
 * pièce, ce qu'un électricien, un artisan ou un acheteur demande en entrant :
 *
 *   — LA HAUTEUR SOUS PLAFOND MESURÉE, pas supposée : le LiDAR relève le
 *     plafond carreau par carreau (`VolumeReleve`). Un plafond rampant, une
 *     sous-pente se voient ; la SURFACE HABITABLE (loi Carrez : ce qui est
 *     sous 1,80 m ne compte pas) et le VOLUME s'en déduisent ;
 *   — LA SURFACE AU SOL que RoomPlan a mesurée, quand le contour des murs ne
 *     se refermait pas ;
 *   — LES OUVERTURES : portes, fenêtres, surface vitrée, et l'EXPOSITION de
 *     chaque fenêtre grâce au nord relevé ;
 *   — LES ÉQUIPEMENTS que le scan a reconnus, et LES CIRCUITS SPÉCIALISÉS
 *     qu'ils appellent : un four, un lave-vaisselle, un lave-linge veulent
 *     leur prise 20 A, une plaque sa sortie 32 A — posables d'un appui,
 *     derrière l'appareil.
 */
import type { ObjectData, VolumeReleve } from 'react-native-room-scan';
import { pointInPolygon } from './appearance';
import { FIXTURES, type Fixture } from './electrical';
import { frCategory } from './furniture';
import { bearingName } from './naming';
import { baiesDeLaPiece, mursNetsDe } from './travaux';
import {
  hauteurLue,
  murDeLOuverture,
  pointOnSeg,
  segLength,
  type Pt,
  type WallSeg,
} from './floorplan';

/** Sous 1,80 m, on ne tient pas debout : la loi Carrez ne compte pas cette surface. */
export const HAUTEUR_HABITABLE = 1.8;
/** Trente centimètres d'écart entre le plus bas et le plus haut : le plafond n'est pas plat. */
export const ECART_RAMPANT = 0.3;
/** En dessous d'un tiers du plafond vu, on ne dit rien de sa forme. */
export const COUVERTURE_MIN = 0.3;

/** Le plafond d'une pièce, tel que le LiDAR l'a relevé. */
export interface PlafondDeLaPiece {
  /** Hauteur la plus basse et la plus haute (m) — sans les extrêmes isolés. */
  hMin: number;
  hMax: number;
  /** Hauteur moyenne (m) : c'est elle qui fait le volume. */
  hMoy: number;
  /** Part du plafond effectivement vue (0 à 1). */
  couverture: number;
  /** Rampant ou sous-pente : plus de trente centimètres d'écart, sur un plafond assez vu. */
  rampant: boolean;
  /** Surface au sol où l'on tient debout (m²), si le plafond a été assez vu. */
  surfaceHabitable: number | null;
  /** Pourquoi une partie de la pièce ne compte pas — null si tout compte. */
  raisonHabitable?: string | null;
  /**
   * LE SOL DE LA PIÈCE AU MOMENT DU RELEVÉ (m²) — pour que l'habitable suive
   * une retouche (revue « Sébastien »). Absent des relevés d'avant.
   */
  solAuReleve?: number;
  /**
   * La part du plafond DÉDUITE de la pente du rampant, faute d'avoir été vue
   * (0 à 1). Absente quand rien n'a été déduit.
   */
  estime?: number;
}

const arrondi = (v: number, pas = 0.01) => Math.round(v / pas) * pas;

/**
 * LE PLAFOND D'UNE PIÈCE — les carreaux du relevé qui tombent dans son contour.
 *
 * Les hauteurs extrêmes sont celles des cinquième et quatre-vingt-quinzième
 * centiles : un luminaire, une poutre ou un reflet ne font pas un plafond.
 * `null` quand on n'en a pas vu assez (quatre carreaux, soit un quart de
 * mètre carré) pour en dire quoi que ce soit.
 */
export function plafondDeLaPiece(
  volume: VolumeReleve | null | undefined,
  contour: Pt[],
  surface: number,
  /**
   * Les murs de la pièce, avec leur hauteur relevée par RoomPlan : ceux qui
   * sont nettement plus bas que le plafond sont des jambettes, d'où part le
   * rampant. Dans le repère du volume.
   */
  murs: readonly { a: Pt; b: Pt; height: number }[] = [],
  /**
   * LES CAISSONS SOUS PLAFOND, dans le même repère : leurs carreaux ne sont
   * pas le plafond de la pièce — sans quoi une retombée de 40 cm la faisait
   * passer « sous rampant » (voir `geometry/caisson`).
   */
  caissons: readonly Pt[][] = [],
): PlafondDeLaPiece | null {
  if (!volume || contour.length < 3 || !(surface > 0) || !(volume.pas > 0)) return null;
  const { pas, minX, minZ, cols, rows, plafond } = volume;
  const xs = contour.map((p) => p.x);
  const zs = contour.map((p) => p.z);
  const c0 = Math.max(0, Math.floor((Math.min(...xs) - minX) / pas));
  const c1 = Math.min(cols - 1, Math.ceil((Math.max(...xs) - minX) / pas));
  const r0 = Math.max(0, Math.floor((Math.min(...zs) - minZ) / pas));
  const r1 = Math.min(rows - 1, Math.ceil((Math.max(...zs) - minZ) / pas));
  const vus: number[] = [];
  const nonVus: Pt[] = [];
  const carreauxVus: { p: Pt; h: number }[] = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const centre = { x: minX + (c + 0.5) * pas, z: minZ + (r + 0.5) * pas };
      if (!pointInPolygon(centre, contour)) continue;
      if (caissons.some((e) => pointInPolygon(centre, e))) continue;
      const h = plafond[r * cols + c] ?? 0;
      if (h <= 0) {
        nonVus.push(centre);
        continue;
      }
      vus.push(h / 100);
      carreauxVus.push({ p: centre, h: h / 100 });
    }
  }
  if (vus.length < 4) return null;
  const triesVus = [...vus].sort((a, b) => a - b);
  const hMax = triesVus[Math.min(triesVus.length - 1, Math.round(0.95 * (triesVus.length - 1)))];

  /*
    LE BAS DU RAMPANT, DÉDUIT DE SA PENTE — revue « Léon » : sous les toits,
    les bas de pente sont justement ce que le LiDAR voit le moins. La part
    « debout », comptée sur les seuls carreaux vus, sortait l'habitable
    d'une chambre de bonne à 8,33 m² au lieu de 6,22 (+34 %). Le mur de
    jambette, que RoomPlan relève à sa vraie hauteur, dit où le rampant
    commence ; les carreaux vus en pente disent de combien il monte par
    mètre. Chaque carreau non vu prend la hauteur de sa jambette la plus
    proche plus la pente fois sa distance — sans dépasser le haut du
    plafond. Deux versants ont chacun leur jambette, et leur pente.
  */
  const jambettes = murs.filter(
    (m) => m.height >= 0.5 && m.height <= hMax - ECART_RAMPANT && segLength(m as WallSeg) >= 0.5,
  );
  const estimes: number[] = [];
  let jambetteBasse: number | null = null;
  if (jambettes.length > 0 && nonVus.length > 0) {
    const plusProche = (p: Pt) => {
      let j = 0;
      let d = Infinity;
      jambettes.forEach((m, k) => {
        const dk = pointOnSeg(p, m.a, m.b).dist;
        if (dk < d) {
          d = dk;
          j = k;
        }
      });
      return { j, d };
    };
    const sommes = jambettes.map(() => ({ num: 0, den: 0, n: 0 }));
    for (const k of carreauxVus) {
      if (k.h >= hMax - 0.05) continue;
      const { j, d } = plusProche(k.p);
      if (d < 0.1 || k.h < jambettes[j].height - 0.05) continue;
      sommes[j].num += (k.h - jambettes[j].height) * d;
      sommes[j].den += d * d;
      sommes[j].n++;
    }
    const pentes = sommes.map((s) => (s.n >= 3 && s.den > 0 ? s.num / s.den : null));
    for (const p of nonVus) {
      const { j, d } = plusProche(p);
      const pente = pentes[j];
      if (pente === null || !(pente > 0)) continue;
      estimes.push(Math.min(hMax, jambettes[j].height + pente * d));
      jambetteBasse = Math.min(jambetteBasse ?? Infinity, jambettes[j].height);
    }
  }

  const toutes = [...vus, ...estimes];
  const tries = [...toutes].sort((a, b) => a - b);
  const centile = (q: number) => tries[Math.min(tries.length - 1, Math.max(0, Math.round(q * (tries.length - 1))))];
  // Le plafond le plus bas ne passe pas au-dessus de la jambette qui le porte.
  const hMin = jambetteBasse !== null ? Math.min(centile(0.05), jambetteBasse) : centile(0.05);
  const hMoy = toutes.reduce((s, h) => s + h, 0) / toutes.length;
  const couverture = Math.min(1, (vus.length * pas * pas) / surface);
  const assezVu = couverture >= COUVERTURE_MIN;
  const debout = toutes.filter((h) => h >= HAUTEUR_HABITABLE).length / toutes.length;
  return {
    hMin: arrondi(hMin),
    hMax: arrondi(hMax),
    hMoy: arrondi(hMoy),
    couverture: arrondi(couverture),
    rampant: assezVu && hMax - hMin >= ECART_RAMPANT,
    surfaceHabitable: assezVu ? arrondi(surface * debout) : null,
    solAuReleve: arrondi(surface),
    ...(estimes.length > 0 ? { estime: arrondi(Math.min(1, (estimes.length * pas * pas) / surface)) } : {}),
  };
}

/** L'aire d'un polygone (m²). */
function aireDe(pts: Pt[]): number {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    s += pts[j].x * pts[i].z - pts[i].x * pts[j].z;
  }
  return Math.abs(s) / 2;
}

/**
 * LE SOL QUE ROOMPLAN A MESURÉ DANS CETTE PIÈCE (iOS 17) — RECADRÉ SUR ELLE.
 *
 * Le polygone `floors` de RoomPlan n'est PAS borné par les murs : par une
 * porte ouverte il file dans le couloir, et un seul sol couvre parfois deux
 * pièces. On en prenait l'aire brute (25 m² annoncés pour une chambre de
 * 7,50), et le barycentre d'un sol en L, hors du L, le faisait oublier. On
 * garde désormais la part du sol QUI TOMBE DANS LA PIÈCE : son contour s'il
 * est fermé, sinon l'enveloppe convexe de ses murs.
 */
export function solReleveDe(
  sols: readonly { coins: number[] }[] | null | undefined,
  contour: Pt[],
  murs: readonly { a: Pt; b: Pt }[] = [],
): number | null {
  if (!sols) return null;
  const cadre = contour.length >= 3 ? contour : enveloppeConvexe(murs.flatMap((m) => [m.a, m.b]));
  if (cadre.length < 3) return null;
  const tris = oreilles(cadre);
  let meilleure = 0;
  for (const s of sols) {
    const pts: Pt[] = [];
    for (let i = 0; i + 1 < s.coins.length; i += 2) pts.push({ x: s.coins[i], z: s.coins[i + 1] });
    if (pts.length < 3) continue;
    const dedans = tris.reduce((t, tri) => t + aireDe(couperParConvexe(pts, tri)), 0);
    if (dedans > meilleure) meilleure = dedans;
  }
  return meilleure >= 0.05 ? arrondi(meilleure) : null;
}

/** Enveloppe convexe (chaîne monotone d'Andrew). */
export function enveloppeConvexe(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  if (p.length < 3) return p;
  const croix = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const bas: Pt[] = [];
  for (const q of p) {
    while (bas.length >= 2 && croix(bas[bas.length - 2], bas[bas.length - 1], q) <= 1e-12) bas.pop();
    bas.push(q);
  }
  const haut: Pt[] = [];
  for (const q of [...p].reverse()) {
    while (haut.length >= 2 && croix(haut[haut.length - 2], haut[haut.length - 1], q) <= 1e-12) haut.pop();
    haut.push(q);
  }
  return [...bas.slice(0, -1), ...haut.slice(0, -1)];
}

/** Un polygone quelconque, coupé par un polygone CONVEXE (Sutherland–Hodgman). */
function couperParConvexe(sujet: Pt[], convexe: Pt[]): Pt[] {
  let sens = 0;
  for (let i = 0; i < convexe.length; i++) {
    const a = convexe[i];
    const b = convexe[(i + 1) % convexe.length];
    sens += a.x * b.z - b.x * a.z;
  }
  const k = sens >= 0 ? 1 : -1;
  let out = sujet;
  for (let i = 0; i < convexe.length && out.length > 0; i++) {
    const A = convexe[i];
    const B = convexe[(i + 1) % convexe.length];
    const cote = (p: Pt) => k * ((B.x - A.x) * (p.z - A.z) - (B.z - A.z) * (p.x - A.x));
    const entree = out;
    out = [];
    for (let j = 0; j < entree.length; j++) {
      const P = entree[j];
      const Q = entree[(j + 1) % entree.length];
      const cp = cote(P);
      const cq = cote(Q);
      if (cp >= 0) out.push(P);
      if ((cp >= 0) !== (cq >= 0)) {
        const t = cp / (cp - cq);
        out.push({ x: P.x + (Q.x - P.x) * t, z: P.z + (Q.z - P.z) * t });
      }
    }
  }
  return out;
}

/** Découpe un contour simple en triangles, par les oreilles. */
function oreilles(poly: Pt[]): Pt[][] {
  const pts = aireSigneeDe(poly) >= 0 ? [...poly] : [...poly].reverse();
  const croix = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const dansTri = (p: Pt, a: Pt, b: Pt, c: Pt) => croix(a, b, p) >= -1e-12 && croix(b, c, p) >= -1e-12 && croix(c, a, p) >= -1e-12;
  const reste = pts.map((_, i) => i);
  const tris: Pt[][] = [];
  let garde = 0;
  while (reste.length > 3 && garde++ < 10000) {
    let coupe = false;
    for (let i = 0; i < reste.length; i++) {
      const a = pts[reste[(i - 1 + reste.length) % reste.length]];
      const b = pts[reste[i]];
      const c = pts[reste[(i + 1) % reste.length]];
      if (croix(a, b, c) <= 1e-12) continue;
      if (reste.some((k) => pts[k] !== a && pts[k] !== b && pts[k] !== c && dansTri(pts[k], a, b, c))) continue;
      tris.push([a, b, c]);
      reste.splice(i, 1);
      coupe = true;
      break;
    }
    if (!coupe) break;
  }
  if (reste.length === 3) tris.push(reste.map((k) => pts[k]));
  return tris;
}

function aireSigneeDe(pts: Pt[]): number {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += pts[j].x * pts[i].z - pts[i].x * pts[j].z;
  return s / 2;
}

/* ====================================================================== */
/*  LES APPAREILS QUI APPELLENT LEUR CIRCUIT                              */
/* ====================================================================== */

/**
 * CE QUE CHAQUE APPAREIL DEMANDE — la NF C 15-100 veut un circuit spécialisé
 * pour le four, le lave-vaisselle, le lave-linge et le sèche-linge (prise
 * 20 A), et une sortie 32 A pour la cuisson. RoomPlan les reconnaît : on les
 * propose là où ils sont, derrière eux, sans qu'on ait à y penser.
 */
const DEMANDES: { motif: RegExp; kind: 'prise20' | 'sortieCable'; quoi: string; hauteur: number }[] = [
  { motif: /stove/i, kind: 'sortieCable', quoi: 'Sortie 32 A (cuisson)', hauteur: 0.25 },
  { motif: /oven/i, kind: 'prise20', quoi: 'Prise 20 A spécialisée', hauteur: 0.3 },
  { motif: /dishwasher/i, kind: 'prise20', quoi: 'Prise 20 A spécialisée', hauteur: 0.3 },
  { motif: /washer|dryer/i, kind: 'prise20', quoi: 'Prise 20 A spécialisée', hauteur: 0.3 },
];

export interface CircuitConseille {
  /** L'appareil reconnu par le scan. */
  objetId: string;
  appareil: string;
  kind: 'prise20' | 'sortieCable';
  quoi: string;
  /** Où le poser : le mur derrière l'appareil, au droit de son centre. */
  pose: { wallId: string; along: number; height: number } | null;
  /** Déjà posé : un appareil de ce genre est à moins d'un mètre et demi. */
  deja: boolean;
}

/** Le point du plan où se trouve un appareil posé. */
function pointDe(f: Fixture, walls: readonly WallSeg[]): Pt | null {
  const w = walls.find((x) => x.id === f.wallId);
  if (!w) return null;
  const l = segLength(w) || 1;
  return { x: w.a.x + ((w.b.x - w.a.x) * f.along) / l, z: w.a.z + ((w.b.z - w.a.z) * f.along) / l };
}

export function circuitsDesAppareils(
  objets: readonly ObjectData[],
  murs: readonly WallSeg[],
  fixtures: readonly Fixture[],
  tousLesMurs: readonly WallSeg[],
): CircuitConseille[] {
  const out: CircuitConseille[] = [];
  for (const o of objets) {
    const d = DEMANDES.find((x) => x.motif.test(o.category ?? ''));
    if (!d) continue;
    const centre = { x: o.transform[12], z: o.transform[14] };
    // Le mur derrière l'appareil : le plus proche de son centre, au droit.
    let best: { w: WallSeg; dist: number; along: number } | null = null;
    for (const w of murs) {
      if (w.type !== 'wall') continue;
      const l = segLength(w);
      if (l < 0.3) continue;
      const q = pointOnSeg(centre, w.a, w.b);
      const t = ((centre.x - w.a.x) * (w.b.x - w.a.x) + (centre.z - w.a.z) * (w.b.z - w.a.z)) / (l * l);
      if (t < 0 || t > 1) continue;
      if (!best || q.dist < best.dist) best = { w, dist: q.dist, along: t * l };
    }
    const pose =
      best && best.dist <= Math.max(o.depth ?? 0.6, 0.6) + 0.4
        ? {
            wallId: best.w.id,
            along: Math.max(0.1, Math.min(segLength(best.w) - 0.1, best.along)),
            height: d.hauteur,
          }
        : null;
    const deja = fixtures.some((f) => {
      if (f.kind !== d.kind) return false;
      const p = pointDe(f, tousLesMurs);
      return !!p && Math.hypot(p.x - centre.x, p.z - centre.z) < 1.5;
    });
    out.push({
      objetId: o.id,
      appareil: frCategory(o.category ?? ''),
      kind: d.kind,
      quoi: d.quoi,
      pose,
      deja,
    });
  }
  return out;
}

/* ====================================================================== */
/*  LA FICHE                                                              */
/* ====================================================================== */

export interface FicheDeLaPiece {
  surface: number;
  /** La surface vient d'un contour refermé ; sinon, elle est approchée. */
  surfaceExacte: boolean;
  /** La surface au sol mesurée par RoomPlan, quand il l'a mesurée. */
  surfaceReleve: number | null;
  /** Surface où l'on tient debout (loi Carrez), quand le plafond est rampant. */
  surfaceHabitable: number | null;
  /** Pourquoi une partie de la pièce ne compte pas — null si tout compte. */
  raisonHabitable?: string | null;
  hauteur: number;
  hauteurMin: number | null;
  hauteurMax: number | null;
  /** La hauteur vient du LiDAR, pas de la hauteur des murs. */
  hauteurMesuree: boolean;
  rampant: boolean;
  volume: number;
  perimetre: number;
  /**
   * La longueur de chaque mur, dans l'ordre du tour — revue « Bernard » : la
   * fiche donnait le périmètre, pas les dimensions qu'il venait chercher.
   * Deux côtés alignés (un T de cloison) font un seul mur.
   */
  cotesDesMurs: number[];
  /** Les murs, ouvertures déduites (m²) : ce qu'on peint. */
  mursNets: number;
  portes: number;
  fenetres: number;
  surfaceVitree: number;
  /** Fenêtres par exposition : « sud » → 2. `null` sans nord relevé. */
  expositions: { aire: string; n: number }[] | null;
  equipements: { nom: string; n: number }[];
  circuits: CircuitConseille[];
}

/** Les côtés d'un contour, les côtés alignés réunis, au centimètre. */
export function cotesDuTour(contour: Pt[]): number[] {
  const n = contour.length;
  if (n < 3) return [];
  const cotes: { l: number; u: Pt }[] = [];
  for (let i = 0; i < n; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % n];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    if (l < 1e-6) continue;
    const u = { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
    const der = cotes[cotes.length - 1];
    if (der && der.u.x * u.x + der.u.z * u.z > Math.cos(Math.PI / 180)) der.l += l;
    else cotes.push({ l, u });
  }
  if (cotes.length > 1) {
    const [pre, der] = [cotes[0], cotes[cotes.length - 1]];
    if (pre.u.x * der.u.x + pre.u.z * der.u.z > Math.cos(Math.PI / 180)) {
      pre.l += der.l;
      cotes.pop();
    }
  }
  return cotes.map((c) => arrondi(c.l));
}

export function ficheDeLaPiece(p: {
  contour: Pt[];
  surface: number;
  surfaceExacte: boolean;
  /** Le centre de la pièce : d'où l'on regarde vers chaque fenêtre. */
  centre: Pt;
  murs: WallSeg[];
  tousLesMurs: WallSeg[];
  ouvertures: WallSeg[];
  objets: ObjectData[];
  fixtures: Fixture[];
  north: number | null;
  releve?: { plafond?: PlafondDeLaPiece | null; surfaceSol?: number | null } | null;
}): FicheDeLaPiece {
  const plafond = p.releve?.plafond ?? null;
  const hMurs = p.murs.length > 0 ? Math.max(...p.murs.map((w) => w.height)) : 2.5;
  const hauteur = plafond?.hMoy ?? hMurs;
  const idsMurs = new Set(p.murs.map((w) => w.id));
  const siennes = p.ouvertures.filter((o) => {
    const m = murDeLOuverture(o, p.tousLesMurs);
    return !!m && idsMurs.has(m.id);
  });
  const portes = siennes.filter((o) => o.type === 'door' && !o.placard);
  const fenetres = siennes.filter((o) => o.type === 'window');
  const aireOuv = (o: WallSeg) => segLength(o) * o.height;
  const surfaceVitree = fenetres.reduce((s, o) => s + aireOuv(o), 0);
  /*
    LES MURS À PEINDRE, LE MÊME CHIFFRE QU'AILLEURS — relevé du patron, point
    5 de la réflexion « grand public » : le tour intérieur sur la hauteur,
    baies déduites (`mursNetsDe`). Sans contour fermé, la somme des murs.
  */
  const mursBruts = p.murs.reduce((s, w) => s + segLength(w) * w.height, 0);
  const mursNets =
    p.contour.length >= 3
      ? mursNetsDe(p.contour, hauteurLue(plafond) ?? hMurs, baiesDeLaPiece({ walls: p.murs }, p.ouvertures), p.murs)
      : Math.max(0, mursBruts - siennes.reduce((s, o) => s + aireOuv(o), 0));
  const perimetre =
    p.contour.length >= 3
      ? p.contour.reduce((s, q, i) => {
          const r = p.contour[(i + 1) % p.contour.length];
          return s + Math.hypot(r.x - q.x, r.z - q.z);
        }, 0)
      : p.murs.reduce((s, w) => s + segLength(w), 0);

  /*
    L'EXPOSITION D'UNE FENÊTRE : vers où elle regarde. La normale de son mur,
    tournée vers le dehors — à l'opposé du centre de la pièce —, et nommée
    d'après le nord relevé au scan.
  */
  let expositions: FicheDeLaPiece['expositions'] = null;
  if (p.north !== null && isFinite(p.north) && fenetres.length > 0) {
    const compte = new Map<string, number>();
    for (const f of fenetres) {
      const l = segLength(f) || 1;
      let n = { x: -(f.b.z - f.a.z) / l, z: (f.b.x - f.a.x) / l };
      const milieu = { x: (f.a.x + f.b.x) / 2, z: (f.a.z + f.b.z) / 2 };
      if (n.x * (milieu.x - p.centre.x) + n.z * (milieu.z - p.centre.z) < 0) n = { x: -n.x, z: -n.z };
      const aire = bearingName(n, p.north);
      compte.set(aire, (compte.get(aire) ?? 0) + 1);
    }
    expositions = [...compte.entries()].map(([aire, n]) => ({ aire, n }));
  }

  const parNom = new Map<string, number>();
  for (const o of p.objets) {
    const nom = frCategory(o.category ?? '');
    parNom.set(nom, (parNom.get(nom) ?? 0) + 1);
  }

  return {
    surface: arrondi(p.surface),
    surfaceExacte: p.surfaceExacte,
    surfaceReleve: p.releve?.surfaceSol ?? null,
    surfaceHabitable: plafond?.rampant ? plafond.surfaceHabitable : null,
    hauteur: arrondi(hauteur),
    hauteurMin: plafond ? plafond.hMin : null,
    hauteurMax: plafond ? plafond.hMax : null,
    hauteurMesuree: !!plafond,
    rampant: !!plafond?.rampant,
    volume: arrondi(p.surface * hauteur, 0.1),
    perimetre: arrondi(perimetre),
    cotesDesMurs: cotesDuTour(p.contour),
    mursNets: arrondi(mursNets, 0.1),
    portes: portes.length,
    fenetres: fenetres.length,
    surfaceVitree: arrondi(surfaceVitree),
    expositions,
    equipements: [...parNom.entries()].map(([nom, n]) => ({ nom, n })),
    circuits: circuitsDesAppareils(p.objets, p.murs, p.fixtures, p.tousLesMurs),
  };
}

/** Les cotes d'un appareil posé par la fiche : ce qu'en dit le catalogue. */
export const libelleDuCircuit = (kind: 'prise20' | 'sortieCable') => FIXTURES[kind].label;

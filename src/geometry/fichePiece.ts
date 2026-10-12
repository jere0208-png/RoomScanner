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
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const h = plafond[r * cols + c] ?? 0;
      if (h <= 0) continue;
      const centre = { x: minX + (c + 0.5) * pas, z: minZ + (r + 0.5) * pas };
      if (pointInPolygon(centre, contour)) vus.push(h / 100);
    }
  }
  if (vus.length < 4) return null;
  const tries = [...vus].sort((a, b) => a - b);
  const centile = (q: number) => tries[Math.min(tries.length - 1, Math.max(0, Math.round(q * (tries.length - 1))))];
  const hMin = centile(0.05);
  const hMax = centile(0.95);
  const hMoy = vus.reduce((s, h) => s + h, 0) / vus.length;
  const couverture = Math.min(1, (vus.length * pas * pas) / surface);
  const assezVu = couverture >= COUVERTURE_MIN;
  const debout = vus.filter((h) => h >= HAUTEUR_HABITABLE).length / vus.length;
  return {
    hMin: arrondi(hMin),
    hMax: arrondi(hMax),
    hMoy: arrondi(hMoy),
    couverture: arrondi(couverture),
    rampant: assezVu && hMax - hMin >= ECART_RAMPANT,
    surfaceHabitable: assezVu ? arrondi(surface * debout) : null,
    solAuReleve: arrondi(surface),
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
 * LE SOL QUE ROOMPLAN A MESURÉ DANS CETTE PIÈCE (iOS 17) — celui dont le
 * centre tombe dans son contour. Sa surface est exacte même quand la boucle
 * des murs ne s'est pas refermée.
 */
export function solReleveDe(
  sols: readonly { coins: number[] }[] | null | undefined,
  contour: Pt[],
): number | null {
  if (!sols || contour.length < 3) return null;
  let meilleure: number | null = null;
  for (const s of sols) {
    const pts: Pt[] = [];
    for (let i = 0; i + 1 < s.coins.length; i += 2) pts.push({ x: s.coins[i], z: s.coins[i + 1] });
    if (pts.length < 3) continue;
    const c = {
      x: pts.reduce((t, p) => t + p.x, 0) / pts.length,
      z: pts.reduce((t, p) => t + p.z, 0) / pts.length,
    };
    if (!pointInPolygon(c, contour)) continue;
    const a = aireDe(pts);
    if (meilleure === null || a > meilleure) meilleure = a;
  }
  return meilleure === null ? null : arrondi(meilleure);
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
  const portes = siennes.filter((o) => o.type === 'door');
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
      ? mursNetsDe(p.contour, hauteur, baiesDeLaPiece({ walls: p.murs }, p.ouvertures))
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

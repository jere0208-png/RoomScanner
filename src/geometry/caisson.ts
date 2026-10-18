/**
 * LE CAISSON SOUS PLAFOND — une retombée qui court le long d'un mur.
 *
 * Diagnostic du patron, scan d'une salle de sport : « le coffre en haut du
 * mur ne se détecte pas au scan ». RoomPlan ne relève que des murs, des
 * baies et des meubles : le caisson qui longe le haut d'un mur n'existe pas
 * pour lui — il arrête le mur dessous, et le volume disparaît.
 *
 * DANS LE PLAN, C'EST UN MEUBLE SUSPENDU de catégorie `caisson` : il en a
 * tout — l'enregistrement, l'annulation, les poignées, l'élévation qui hache
 * ce qui est accroché, le PDF — et il reste collé au plafond (voir
 * `objetCaisson`, et les gestes qui le retaillent dans le magasin).
 *
 * AU SCAN, LE LIDAR L'A VU : la carte des hauteurs de plafond
 * (`VolumeReleve`, carreaux de 25 cm) descend le long du mur sur la
 * profondeur du caisson, puis remonte d'un coup au plafond. C'est ce
 * profil-là — plat, puis une marche — qu'on cherche ; un rampant, lui,
 * monte peu à peu (voir `caissonsDuVolume`).
 */
import type { ObjectData, VolumeReleve } from 'react-native-room-scan';
import { epaisseurDe, segLength, type Pt, type WallSeg } from './floorplan';
import { pointInPolygon } from './appearance';

export const CATEGORIE_CAISSON = 'caisson';
/**
 * Son modèle : PAS `caisson`, qui est déjà au catalogue le caisson à tiroirs
 * du bureau — le nom du meuble se lit d'abord au catalogue (`nomDuMeuble`).
 */
export const MODELE_CAISSON = 'caisson-plafond';

/** Un caisson posé à la main : 40 cm de profondeur, 30 cm de retombée. */
export const CAISSON_PROFONDEUR = 0.4;
export const CAISSON_RETOMBEE = 0.3;

export const estUnCaisson = (o: { category?: string }): boolean => o.category === CATEGORIE_CAISSON;

/** Un caisson trouvé au scan, le long d'un mur. */
export interface CaissonDetecte {
  wallId: string;
  /** De `t0` à `t1`, en mètres depuis le bout `a` du mur. */
  t0: number;
  t1: number;
  /** Du nu du mur à la face du caisson (m). */
  profondeur: number;
  /** Du plafond au dessous du caisson (m). */
  retombee: number;
  /** La hauteur du plafond au-dessus du sol (m). */
  plafond: number;
  /** Le côté de la pièce, le long de `perp(u)` : +1 ou −1. */
  sens: 1 | -1;
}

/** Du trait du mur à sa face côté pièce : son axe pour un mur dessiné ou vu des deux faces. */
const faceDuMur = (w: WallSeg): number => (w.auNu || w.deuxFaces ? epaisseurDe(w) / 2 : 0);

/** Le côté de la pièce, pour ce mur et ce contour. */
export function coteDeLaPiece(w: WallSeg, contour: Pt[]): 1 | -1 | null {
  const L = segLength(w);
  if (L < 1e-6) return null;
  const n = { x: -(w.b.z - w.a.z) / L, z: (w.b.x - w.a.x) / L };
  const m = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
  const plus = pointInPolygon({ x: m.x + n.x * 0.3, z: m.z + n.z * 0.3 }, contour);
  const moins = pointInPolygon({ x: m.x - n.x * 0.3, z: m.z - n.z * 0.3 }, contour);
  if (plus === moins) return null;
  return plus ? 1 : -1;
}

const mediane = (v: number[]) => {
  const t = [...v].sort((a, b) => a - b);
  return t.length === 0 ? NaN : t[Math.floor(t.length / 2)];
};
const auCinq = (v: number) => Math.round(v * 20) / 20;

/** Le plafond descend d'au moins douze centimètres : en deçà, c'est du relevé. */
const MARCHE_MIN = 0.12;
/** Revenu à six centimètres du plafond : on y est. */
const AU_PLAFOND = 0.06;
/** Un caisson court sur trois carreaux au moins (75 cm). */
const STATIONS_MIN = 3;
const PAS_STATION = 0.25;

/**
 * LES CAISSONS D'UNE PIÈCE, LUS DANS LA CARTE DU PLAFOND.
 *
 * Mur par mur, tous les 25 cm, on lit les carreaux en partant du mur vers
 * la pièce. Une station « porte un caisson » quand :
 *   — le carreau contre le mur est au moins 12 cm sous le plafond de la
 *     pièce (la médiane de ses carreaux) ;
 *   — on revient au plafond en moins d'un mètre et demi ;
 *   — les carreaux bas sont à plat (à 6 cm près) : un rampant, lui, monte
 *     de carreau en carreau, et la fiche de la pièce s'en occupe.
 * La profondeur se lit au carreau de la marche, à la part de lui qui est
 * basse ; la retombée sur les carreaux pleinement sous le caisson — à
 * défaut, sur le mur que RoomPlan a arrêté dessous.
 *
 * Trois stations de suite au moins (75 cm) font un caisson ; il court
 * jusqu'au bout du mur s'il s'arrête à moins de 35 cm de lui.
 *
 * `versLeBrut` ramène un point du plan dans le repère du scan, où la carte
 * a été relevée.
 */
export function caissonsDuVolume(
  volume: VolumeReleve | null | undefined,
  contour: Pt[],
  murs: WallSeg[],
  versLeBrut: (p: Pt) => Pt = (p) => p,
): CaissonDetecte[] {
  if (!volume || contour.length < 3 || !(volume.pas > 0)) return [];
  const { pas, minX, minZ, cols, rows, plafond } = volume;
  const lire = (p: Pt): number | null => {
    const q = versLeBrut(p);
    const c = Math.floor((q.x - minX) / pas);
    const r = Math.floor((q.z - minZ) / pas);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return null;
    const h = plafond[r * cols + c] ?? 0;
    return h > 0 ? h / 100 : null;
  };
  // Le plafond de la pièce : la médiane de ses carreaux vus.
  const xs = contour.map((p) => p.x);
  const zs = contour.map((p) => p.z);
  const vus: number[] = [];
  for (let x = Math.min(...xs) + pas / 2; x < Math.max(...xs); x += pas) {
    for (let z = Math.min(...zs) + pas / 2; z < Math.max(...zs); z += pas) {
      if (!pointInPolygon({ x, z }, contour)) continue;
      const h = lire({ x, z });
      if (h !== null) vus.push(h);
    }
  }
  if (vus.length < 8) return [];
  const H = mediane(vus);

  const out: CaissonDetecte[] = [];
  for (const w of murs) {
    if (w.type !== 'wall') continue;
    const L = segLength(w);
    if (L < 0.8) continue;
    const sens = coteDeLaPiece(w, contour);
    if (sens === null) continue;
    const u = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
    const n = { x: -u.z * sens, z: u.x * sens };
    const f0 = faceDuMur(w);
    // Le mur que RoomPlan a arrêté sous le caisson dit sa retombée.
    const sousLeCaisson = w.height < H - AU_PLAFOND - 0.02 ? w.height : null;

    const stations: { t: number; s: Station | null }[] = [];
    for (let t = PAS_STATION / 2 + 0.05; t <= L - PAS_STATION / 2 - 0.05 + 1e-9; t += PAS_STATION) {
      const base = { x: w.a.x + u.x * t, z: w.a.z + u.z * t };
      const profil: (number | null)[] = [];
      for (let k = 0; k < 6; k++) {
        const d = f0 + pas / 2 + pas * k;
        const p = { x: base.x + n.x * d, z: base.z + n.z * d };
        if (!pointInPolygon(p, contour)) break;
        profil.push(lire(p));
      }
      stations.push({ t, s: lireLaStation(profil, H, sousLeCaisson, pas) });
    }

    // Les suites de stations qui portent un caisson (un trou d'une station tolérée).
    let i = 0;
    while (i < stations.length) {
      if (!stations[i].s) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < stations.length && (stations[j + 1].s || (j + 2 < stations.length && stations[j + 2].s))) j++;
      const prises = stations.slice(i, j + 1).flatMap((x) => (x.s ? [x.s] : []));
      if (prises.length >= STATIONS_MIN) {
        let t0 = stations[i].t - PAS_STATION / 2;
        let t1 = stations[j].t + PAS_STATION / 2;
        if (t0 < 0.35) t0 = 0;
        if (t1 > L - 0.35) t1 = L;
        out.push({
          wallId: w.id,
          t0,
          t1,
          profondeur: Math.min(1.5, Math.max(0.15, auCinq(mediane(prises.map((p) => p.profondeur))))),
          retombee: Math.min(1.2, Math.max(0.1, auCinq(mediane(prises.map((p) => p.retombee))))),
          plafond: Math.round(H * 100) / 100,
          sens,
        });
      }
      i = j + 1;
    }
  }
  return out;
}

/** Ce qu'une station lit du caisson. */
export interface Station {
  profondeur: number;
  retombee: number;
}

/**
 * UNE STATION : le profil des carreaux depuis le mur (`null` : pas vu).
 * `null` si elle ne porte pas de caisson.
 */
export function lireLaStation(
  profil: (number | null)[],
  H: number,
  sousLeCaisson: number | null,
  pas: number,
): Station | null {
  const h0 = profil[0];
  if (h0 === null || h0 === undefined || h0 > H - MARCHE_MIN) return null;
  // Le premier carreau revenu au plafond.
  let j = -1;
  for (let k = 1; k < profil.length; k++) {
    const h = profil[k];
    if (h === null) return null;
    if (h >= H - AU_PLAFOND) {
      j = k;
      break;
    }
  }
  if (j < 1) return null;
  // Les carreaux pleinement sous le caisson : tous sauf celui de la marche.
  const pleins = profil.slice(0, j - 1) as number[];
  if (pleins.some((h) => Math.abs(h - h0) > AU_PLAFOND)) return null;
  const hc =
    pleins.length > 0
      ? mediane(pleins)
      : sousLeCaisson !== null && sousLeCaisson <= h0 + 0.05
        ? sousLeCaisson
        : h0;
  if (H - hc < MARCHE_MIN) return null;
  // La marche : la part du carreau qui est sous le caisson.
  const hm = profil[j - 1] as number;
  const part = Math.min(1, Math.max(0, (H - hm) / (H - hc)));
  return { profondeur: pas * (j - 1) + pas * part, retombee: H - hc };
}

/**
 * LE CAISSON, MEUBLE DU PLAN — contre la face du mur, de `t0` à `t1`, collé
 * au plafond (`sol + plafond`), sa largeur le long du mur, sa profondeur
 * vers la pièce.
 */
export function objetCaisson(
  w: WallSeg,
  c: Pick<CaissonDetecte, 't0' | 't1' | 'profondeur' | 'retombee' | 'plafond' | 'sens'>,
  sol: number,
  id: string,
  roomId?: string,
  /** Du trait du mur à sa face côté pièce, quand on la connaît (`demiFacesDe`). */
  face?: number,
): ObjectData {
  const L = segLength(w) || 1;
  const u = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
  const n = { x: -u.z * c.sens, z: u.x * c.sens };
  const tm = (c.t0 + c.t1) / 2;
  const d = (face ?? faceDuMur(w)) + c.profondeur / 2;
  const cx = w.a.x + u.x * tm + n.x * d;
  const cz = w.a.z + u.z * tm + n.z * d;
  // La largeur court le long du mur (axe x local), la profondeur vers la pièce.
  const yaw = Math.atan2(u.z, u.x);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    id,
    category: CATEGORIE_CAISSON,
    modele: MODELE_CAISSON,
    width: Math.max(0.1, c.t1 - c.t0),
    depth: c.profondeur,
    height: c.retombee,
    ...(roomId ? { roomId } : {}),
    transform: [cos, 0, sin, 0, 0, 1, 0, 0, -sin, 0, cos, 0, cx, sol + c.plafond - c.retombee / 2, cz, 1],
  } as ObjectData;
}

/** L'emprise au sol d'un caisson (ses quatre coins), pour l'écarter du plafond de la pièce. */
export function empriseDuCaisson(o: Pick<ObjectData, 'transform' | 'width' | 'depth'>): Pt[] {
  const t = o.transform;
  const yaw = Math.atan2(t[2], t[0]);
  const ux = { x: Math.cos(yaw), z: Math.sin(yaw) };
  const uz = { x: -Math.sin(yaw), z: Math.cos(yaw) };
  const c = { x: t[12], z: t[14] };
  const w = o.width / 2;
  const d = o.depth / 2;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([i, k]) => ({ x: c.x + ux.x * w * i + uz.x * d * k, z: c.z + ux.z * w * i + uz.z * d * k }));
}

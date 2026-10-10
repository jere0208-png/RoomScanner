/**
 * LES PHOTOS DE MUR PRISES PENDANT LE SCAN — chacune rattachée à son mur et à
 * sa face, cadrée au centimètre.
 *
 * Le natif photographie chaque mur de face et le REDRESSE au rapport exact du
 * mur RoomPlan (voir `RoomScanPhotoMur.swift`) : la photo couvre ce mur-là,
 * de bord à bord et du sol au plafond. Le plan, lui, a pu recoudre les murs —
 * deux pans alignés réunis, un mur coupé là où une cloison vient buter. On
 * retrouve donc, pour chaque photo, le ou les murs du plan qui portent son
 * mur RoomPlan, et l'on calcule son calage (`ui/calage`) en fractions de
 * CHAQUE mur : la photo tombe exactement sur la part du mur qu'elle montre.
 *
 * Et la face : le natif dit de quel côté du mur RoomPlan on se tenait ; on en
 * déduit la face du mur du plan qui regarde ce côté-là — celle dont
 * l'élévation montrera la photo.
 */
import type { SurfaceData } from 'react-native-room-scan';
import { faceX, wallFace } from './electrical';
import { segLength, toSegment, type WallSeg } from './floorplan';
import type { Calage } from '../ui/calage';

/** Ce que le natif livre : une photo par mur RoomPlan. */
export interface PhotoDeMurBrute {
  wallId: string;
  path: string;
  /** +1 : prise du côté de l'axe z du mur RoomPlan ; −1 : de l'autre. */
  cote: number;
  at: number;
}

/** Une photo de mur rattachée au plan (le format de `ScanPhoto`). */
export interface PhotoAuto {
  id: string;
  wallId: string;
  along: number;
  path: string;
  at: number;
  calage: Calage;
  side: 1 | -1;
  /** Prise et redressée par le scan : pas de punaise sur le plan, elle est partout. */
  auto: true;
}

/** Jusqu'où un mur RoomPlan peut s'écarter de l'axe d'un mur du plan (m). */
const TOLERANCE = 0.15;

/**
 * Rattache les photos du scan aux murs du plan.
 *
 * `decalage` et `suffixe` : un étage ajouté décale ses murs et renomme leurs
 * identifiants (`-n1`) ; les surfaces livrées, elles, sont brutes.
 */
export function photosDesMurs(
  brutes: readonly PhotoDeMurBrute[],
  surfaces: readonly SurfaceData[],
  walls: readonly WallSeg[],
  o: { decalage?: { dx: number; dz: number } } = {},
): PhotoAuto[] {
  const out: PhotoAuto[] = [];
  const dx = o.decalage?.dx ?? 0;
  const dz = o.decalage?.dz ?? 0;
  for (const b of brutes) {
    const s = surfaces.find((x) => x.id === b.wallId && x.type === 'wall');
    if (!s?.transform || !b.path) continue;
    const seg = toSegment(s);
    const a = { x: seg.a.x + dx, z: seg.a.z + dz };
    const e = { x: seg.b.x + dx, z: seg.b.z + dz };
    // La normale du mur RoomPlan (son axe z), tournée vers celui qui photographiait.
    const m = s.transform;
    const nl = Math.hypot(m[8], m[10]) || 1;
    const vers = { x: (m[8] / nl) * (b.cote >= 0 ? 1 : -1), z: (m[10] / nl) * (b.cote >= 0 ? 1 : -1) };
    for (const w of walls) {
      if (w.type !== 'wall') continue;
      const L = segLength(w);
      if (L < 0.2) continue;
      const u = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
      // Les deux bouts du mur RoomPlan sur l'axe de ce mur : sinon, ce n'est pas lui.
      const ecart = (p: { x: number; z: number }) => Math.abs((p.x - w.a.x) * -u.z + (p.z - w.a.z) * u.x);
      if (ecart(a) > TOLERANCE || ecart(e) > TOLERANCE) continue;
      const t = (p: { x: number; z: number }) => (p.x - w.a.x) * u.x + (p.z - w.a.z) * u.z;
      const ta = t(a);
      const te = t(e);
      // Le recouvrement : au moins quelques centimètres en commun.
      if (Math.min(Math.max(ta, te), L) - Math.max(Math.min(ta, te), 0) < 0.1) continue;
      // La face qui regarde le photographe.
      const side: 1 | -1 = -u.z * vers.x + u.x * vers.z >= 0 ? 1 : -1;
      const face = wallFace(w, undefined, side);
      const xa = faceX(face, ta) / face.len;
      const xe = faceX(face, te) / face.len;
      const x0 = Math.min(xa, xe);
      const x1 = Math.max(xa, xe);
      const part = x1 - x0;
      out.push({
        id: `auto-${w.id}-${side}`,
        wallId: w.id,
        along: Math.max(0, Math.min(L, (ta + te) / 2)),
        path: b.path,
        at: b.at,
        // La photo couvre la part [x0, x1] de la face, du sol au plafond :
        // voir `cadreDeLaPhoto` — couvrir, puis réduire à sa part.
        calage: { dx: (x0 + x1) / 2 - 0.5, dy: 0, k: Math.min(1, part) },
        side,
        auto: true,
      });
    }
  }
  // Une photo par face de mur : la plus récente.
  const parFace = new Map<string, PhotoAuto>();
  for (const p of out) {
    const deja = parFace.get(p.id);
    if (!deja || p.at > deja.at) parFace.set(p.id, p);
  }
  return [...parFace.values()];
}

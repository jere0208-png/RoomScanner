/**
 * LA RÈGLE LIBRE — mesurer entre deux points du plan.
 *
 * Relevé du patron, point 7 de la réflexion « grand public » : « une règle
 * libre pour mesurer entre deux points du plan ». Le plan cotait ses murs,
 * ses baies et les écarts d'un meuble ; il ne savait pas répondre à la
 * question qu'on se pose devant un canapé en vitrine : « entre ce mur et la
 * fenêtre, j'ai combien ? ».
 *
 * Le doigt ne vise pas au centimètre : chaque bout de la règle S'ACCROCHE à
 * ce qu'on voulait viser — un coin de mur (au nu), le nu d'un mur, un coin
 * ou un bord de meuble —, à quelques pixels près. Ce qu'on garde devient une
 * cote du plan, enregistrée avec lui et imprimée au dossier.
 */
import type { ObjectData } from 'react-native-room-scan';
import { wallQuadsOf, type Pt, type WallSeg } from './floorplan';

/** Une cote posée à la main. */
export interface Mesure {
  id: string;
  a: Pt;
  b: Pt;
  /** L'étage qui la porte. Absent = le rez, comme partout ailleurs. */
  niveau?: number;
}

/** Ce sur quoi un bout de règle s'est accroché. */
export type Prise = 'coin' | 'mur' | 'meuble' | null;

export interface Accroche {
  pt: Pt;
  sur: Prise;
}

/** Le point d'un segment le plus proche de p. */
function surLeSegment(p: Pt, a: Pt, b: Pt): Pt {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2)) : 0;
  return { x: a.x + t * vx, z: a.z + t * vz };
}
const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.z - q.z);

/** Les quatre coins d'un meuble au sol. */
export function coinsDuMeuble(o: ObjectData): Pt[] {
  const t = o.transform;
  const c = { x: t[12], z: t[14] };
  const yaw = Math.atan2(t[2], t[0]);
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const hw = o.width / 2;
  const hd = o.depth / 2;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([x, z]) => ({ x: c.x + x * cs - z * sn, z: c.z + x * sn + z * cs }));
}

/**
 * Accroche un point visé au plus proche de ce qu'on voulait viser.
 *
 * Dans l'ordre : un COIN (de mur, au nu, ou de meuble) — c'est presque
 * toujours là qu'on pose le mètre ; sinon le NU d'un mur ; sinon le bord
 * d'un meuble. Au-delà de `tolerance` (en mètres, la largeur d'un doigt à
 * l'échelle du plan), le point reste où on l'a posé.
 */
export function accrocher(p: Pt, walls: WallSeg[], objects: ObjectData[], tolerance: number): Accroche {
  const quads = wallQuadsOf(walls.filter((w) => w.type === 'wall'));
  const faces: [Pt, Pt][] = [];
  const coins: { pt: Pt; sur: Prise }[] = [];
  for (const q of quads.values()) {
    faces.push([q.a1, q.b1], [q.a2, q.b2]);
    for (const c of [q.a1, q.b1, q.a2, q.b2]) coins.push({ pt: c, sur: 'coin' });
  }
  const bords: [Pt, Pt][] = [];
  for (const o of objects) {
    const cs = coinsDuMeuble(o);
    cs.forEach((c, i) => {
      coins.push({ pt: c, sur: 'meuble' });
      bords.push([c, cs[(i + 1) % cs.length]]);
    });
  }
  let best: Accroche | null = null;
  let d0 = tolerance;
  for (const c of coins) {
    const d = dist(p, c.pt);
    if (d <= d0) {
      d0 = d;
      best = { pt: c.pt, sur: c.sur };
    }
  }
  if (best) return best;
  d0 = tolerance;
  for (const [a, b] of faces) {
    const q = surLeSegment(p, a, b);
    const d = dist(p, q);
    if (d <= d0) {
      d0 = d;
      best = { pt: q, sur: 'mur' };
    }
  }
  if (best) return best;
  d0 = tolerance;
  for (const [a, b] of bords) {
    const q = surLeSegment(p, a, b);
    const d = dist(p, q);
    if (d <= d0) {
      d0 = d;
      best = { pt: q, sur: 'meuble' };
    }
  }
  return best ?? { pt: p, sur: null };
}

/** La longueur d'une mesure (m). */
export const longueur = (m: { a: Pt; b: Pt }) => dist(m.a, m.b);

/** « 2,34 m » — au centimètre, comme les cotes du plan. */
export function texteDeMesure(m: { a: Pt; b: Pt }): string {
  return `${longueur(m).toFixed(2).replace('.', ',')} m`;
}

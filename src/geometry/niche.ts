/**
 * LE MEUBLE PREND SA PLACE DANS SA NICHE.
 *
 * Relevé du patron, capture à l'appui : « mon frigo ne veut pas se caler
 * dans le coin dans lequel il se trouve, entre trois murs, sur le plan 2D.
 * Pourtant il a été scanné tel quel. On doit adapter la taille des meubles à
 * leur espace pour une reconstitution parfaite. »
 *
 * RoomPlan rend une boîte un peu plus petite que le meuble : 46 × 42 cm pour
 * un frigo logé dans un renfoncement de 62 cm. On lit, côté par côté, l'écart
 * entre le meuble et le nu du mur qui lui fait face (un mur à peu près
 * parallèle, qui couvre au moins la moitié du côté) :
 *
 *   — ENTRE DEUX MURS QUI SE FONT FACE, à moins de vingt centimètres de
 *     chacun, le meuble remplit l'intervalle — ou y est ramené, s'il
 *     mordait dans le mur ;
 *   — s'il est ainsi logé, et qu'un mur est aussi dans son DOS, il s'y
 *     adosse.
 *
 * Un meuble contre un seul mur, ou dans un angle, ne bouge pas : rien ne dit
 * qu'un canapé touche le mur, et il est rare qu'il le touche. Ni un tapis,
 * ni ce qui est suspendu. Et un meuble qui viendrait chevaucher son voisin
 * garde ses cotes.
 */
import type { ObjectData } from 'react-native-room-scan';
import { epaisseurDe, segLength, solDesMurs, type Pt, type WallSeg } from './floorplan';

/** Jusqu'où un meuble est réputé « contre » un mur (m). */
const ECART_MAX = 0.2;
/** Ce qu'il peut mordre dans le mur, et qu'on lui retire (m). */
const MORSURE_MAX = 0.08;
/** Murs à 10° près parallèles au côté. */
const PARALLELE = Math.cos((10 * Math.PI) / 180);

interface Repere {
  c: Pt;
  ex: Pt;
  ez: Pt;
  w: number;
  d: number;
}

function repereDe(o: ObjectData): Repere {
  const t = o.transform;
  const lx = Math.hypot(t[0], t[2]) || 1;
  const lz = Math.hypot(t[8], t[10]) || 1;
  return {
    c: { x: t[12], z: t[14] },
    ex: { x: t[0] / lx, z: t[2] / lx },
    ez: { x: t[8] / lz, z: t[10] / lz },
    w: o.width,
    d: o.depth,
  };
}

/**
 * L'écart entre un côté du meuble et le nu du mur qui lui fait face, ou
 * null. `n` : la normale sortante du côté ; `t` : sa direction ; `m` : son
 * milieu ; `demi` : sa demi-longueur.
 */
function ecartAuMur(m: Pt, n: Pt, t: Pt, demi: number, walls: WallSeg[]): number | null {
  let mieux: number | null = null;
  for (const w of walls) {
    if (w.type !== 'wall') continue;
    const L = segLength(w);
    if (L < 0.05) continue;
    const u = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
    if (Math.abs(u.x * t.x + u.z * t.z) < PARALLELE) continue;
    // La distance de la ligne du mur au côté, le long de la normale.
    const loin = (w.a.x - m.x) * n.x + (w.a.z - m.z) * n.z;
    const ecart = loin - epaisseurDe(w) / 2;
    if (ecart < -MORSURE_MAX || ecart > ECART_MAX) continue;
    // Le mur couvre-t-il au moins la moitié du côté ?
    const p0 = { x: m.x - t.x * demi, z: m.z - t.z * demi };
    const p1 = { x: m.x + t.x * demi, z: m.z + t.z * demi };
    const s0 = (p0.x - w.a.x) * u.x + (p0.z - w.a.z) * u.z;
    const s1 = (p1.x - w.a.x) * u.x + (p1.z - w.a.z) * u.z;
    const commun = Math.min(Math.max(s0, s1), L) - Math.max(Math.min(s0, s1), 0);
    if (commun < demi) continue;
    if (mieux === null || Math.abs(ecart) < Math.abs(mieux)) mieux = ecart;
  }
  return mieux;
}

/** Le meuble calé dans sa niche, ou null s'il n'y est pas (ou y est déjà). */
export function calerDansLaNiche<O extends ObjectData>(o: O, walls: WallSeg[]): O | null {
  if ((o.height ?? 0) < 0.1 || /tapis|rug/i.test(o.category ?? '')) return null;
  const dessous = o.transform[13] - o.height / 2 - solDesMurs(walls);
  if (dessous > 0.3) return null;
  const r = repereDe(o);
  const cote = (axe: Pt, autre: Pt, demiAxe: number, demiAutre: number, signe: 1 | -1) =>
    ecartAuMur(
      { x: r.c.x + axe.x * demiAxe * signe, z: r.c.z + axe.z * demiAxe * signe },
      { x: axe.x * signe, z: axe.z * signe },
      autre,
      demiAutre,
      walls,
    );
  // Les deux côtés de la largeur (±x local), puis le dos (+z local).
  const gauche = cote(r.ex, r.ez, r.w / 2, r.d / 2, -1);
  const droite = cote(r.ex, r.ez, r.w / 2, r.d / 2, 1);
  const enLargeur = gauche !== null && droite !== null;
  const dos = enLargeur ? cote(r.ez, r.ex, r.d / 2, r.w / 2, 1) : null;
  // Entre deux murs qui se font face sur la profondeur, aussi.
  const avant = cote(r.ez, r.ex, r.d / 2, r.w / 2, -1);
  const arriere = dos ?? cote(r.ez, r.ex, r.d / 2, r.w / 2, 1);
  const enProfondeur = avant !== null && arriere !== null;
  if (!enLargeur && !enProfondeur) return null;

  // Les côtés bougent de leur écart ; le centre suit.
  let dxG = 0;
  let dxD = 0;
  let dzAv = 0;
  let dzAr = 0;
  if (enLargeur) {
    dxG = gauche!;
    dxD = droite!;
  }
  if (enProfondeur) {
    dzAv = avant!;
    dzAr = arriere!;
  } else if (dos !== null) {
    dzAr = dos;
  }
  if (Math.abs(dxG) + Math.abs(dxD) + Math.abs(dzAv) + Math.abs(dzAr) < 0.005) return null;
  const w = r.w + dxG + dxD;
  const d = r.d + dzAv + dzAr;
  // Un meuble qui doublerait n'est pas un meuble mal mesuré.
  if (w < 0.1 || d < 0.1 || w > r.w * 1.6 + 0.05 || d > r.d * 1.6 + 0.05) return null;
  const glisseX = (dxD - dxG) / 2;
  const glisseZ = (dzAr - dzAv) / 2;
  const t = [...o.transform];
  t[12] = r.c.x + r.ex.x * glisseX + r.ez.x * glisseZ;
  t[14] = r.c.z + r.ex.z * glisseX + r.ez.z * glisseZ;
  return { ...o, width: w, depth: d, transform: t };
}

/** L'emprise au sol d'un meuble, en polygone. */
function emprise(o: ObjectData): Pt[] {
  const r = repereDe(o);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sz]) => ({
    x: r.c.x + r.ex.x * (r.w / 2) * sx + r.ez.x * (r.d / 2) * sz,
    z: r.c.z + r.ex.z * (r.w / 2) * sx + r.ez.z * (r.d / 2) * sz,
  }));
}

/** Deux emprises convexes se chevauchent-elles de plus d'un centimètre ? */
function chevauchent(p: Pt[], q: Pt[]): boolean {
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      if (l < 1e-9) continue;
      const ax = { x: -(b.z - a.z) / l, z: (b.x - a.x) / l };
      const proj = (pts: Pt[]) => pts.map((v) => v.x * ax.x + v.z * ax.z);
      const pp = proj(p);
      const qq = proj(q);
      if (Math.max(...pp) <= Math.min(...qq) + 0.01 || Math.max(...qq) <= Math.min(...pp) + 0.01) return false;
    }
  }
  return true;
}

/**
 * Tout le relevé : chaque meuble logé entre des murs prend sa place — sauf
 * s'il venait alors chevaucher un voisin qu'il ne chevauchait pas.
 */
export function calerLesMeubles<O extends ObjectData>(objets: O[], walls: WallSeg[]): O[] {
  let change = false;
  const out = objets.map((o) => {
    const cale = calerDansLaNiche(o, walls);
    if (!cale) return o;
    const avant = emprise(o);
    const apres = emprise(cale);
    const gene = objets.some((v) => v !== o && chevauchent(apres, emprise(v)) && !chevauchent(avant, emprise(v)));
    if (gene) return o;
    change = true;
    return cale;
  });
  return change ? out : objets;
}

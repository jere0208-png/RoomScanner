/**
 * TRACER DES MURS, COIN APRÈS COIN — relevé du patron : « le plus difficile
 * dans l'app est d'ajouter un mur exactement là où on le souhaite ; il est
 * difficile de structurer une pièce à partir de rien, en ajoutant des murs ».
 *
 * Le geste : on pose des coins l'un après l'autre, chaque mur part du dernier
 * coin, et l'on referme la pièce en retouchant le premier. Ce module est le
 * cerveau du doigt, sans écran : il dit où tombe le coin visé (`viser`), à
 * quoi il s'accroche, quelle longueur et quel angle il donne au mur, et où
 * tombe un mur dont on a TAPÉ la longueur (`pointALaLongueur`).
 *
 * L'AIMANT, PAR ORDRE DE PRIORITÉ :
 *   1. le PREMIER coin du tracé, pour refermer la pièce ;
 *   2. un COIN existant du plan (bout de mur) : le mur neuf s'y soude ;
 *   3. un MUR existant : le coin tombe sur son axe (jonction en T) ;
 *   4. l'ANGLE : droit ou à 45°, par rapport au mur précédent et aux axes du
 *      logement, à 7° près ;
 *   5. l'ALIGNEMENT : sur ce rayon, le point qui tombe d'aplomb d'un coin du
 *      tracé (le premier, surtout : la pièce se referme d'équerre) ou d'un
 *      coin du plan ;
 * et la longueur, toujours, au centimètre. Sans aimant, seul le centimètre
 * reste : le doigt pose où il pose.
 */
import { pointOnSeg, type Pt, type WallSeg } from './floorplan';

export type Accroche = 'premier' | 'coin' | 'mur' | 'aligne' | 'equerre' | 'biais' | null;

export interface Visee {
  /** Le coin visé, dans le repère du plan (m). */
  p: Pt;
  /** Ce à quoi il s'accroche : voir l'en-tête. */
  accroche: Accroche;
  /** Le mur qu'il donnerait depuis le dernier coin (m), s'il y a un dernier coin. */
  longueur: number | null;
  /** L'angle entre ce mur et le précédent (degrés, 90 = à l'équerre). */
  angle: number | null;
  /** Le mur existant touché (accroche « mur » ou « coin »). */
  murId?: string;
}

/** La portée de l'aimant, à l'écran (points) : un pouce, pas un pixel. */
export const PORTEE_AIMANT_PX = 22;
/** Le réticule se lève d'autant au-dessus du doigt qui glisse (points). */
export const LEVEE_DU_RETICULE = 64;
/** L'angle se colle à l'équerre ou à 45° à moins de ce nombre de degrés. */
const TOLERANCE_ANGLE = 7;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);
const auCentimetre = (v: number) => Math.round(v * 100) / 100;

/** L'angle entre le mur précédent (prev → a) et le neuf (a → b), en degrés (0–180). */
export function angleEntre(prev: Pt | null, a: Pt, b: Pt): number | null {
  if (!prev) return null;
  const u = { x: a.x - prev.x, z: a.z - prev.z };
  const v = { x: b.x - a.x, z: b.z - a.z };
  const lu = Math.hypot(u.x, u.z);
  const lv = Math.hypot(v.x, v.z);
  if (lu < 1e-6 || lv < 1e-6) return null;
  // L'angle intérieur du coin : 90 pour un coin d'équerre, 180 dans l'alignement.
  const c = -(u.x * v.x + u.z * v.z) / (lu * lv);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

/**
 * OÙ TOMBE LE COIN VISÉ.
 *
 * `brut` : le point sous le réticule ; `coins` : le tracé en cours ;
 * `walls` : les murs du niveau ; `rayon` : la portée de l'aimant en mètres
 * (`PORTEE_AIMANT_PX` / échelle) ; `cadre` : l'orientation du logement
 * (`planFrameAngle`), pour que « droit » veuille dire droit par rapport à
 * lui et pas à l'écran.
 */
export function viser(
  brut: Pt,
  coins: Pt[],
  walls: WallSeg[],
  rayon: number,
  aimant = true,
  cadre = 0,
): Visee {
  const dernier = coins.length > 0 ? coins[coins.length - 1] : null;
  const avant = coins.length > 1 ? coins[coins.length - 2] : null;
  const mesure = (p: Pt, accroche: Accroche, murId?: string): Visee => ({
    p,
    accroche,
    longueur: dernier ? auCentimetre(dist(dernier, p)) : null,
    angle: dernier ? angleEntre(avant, dernier, p) : null,
    ...(murId ? { murId } : {}),
  });
  const murs = walls.filter((w) => w.type === 'wall');

  if (aimant) {
    // 1. Refermer la pièce.
    if (coins.length >= 3 && dist(brut, coins[0]) < rayon) return mesure(coins[0], 'premier');
    // 2. Un coin existant.
    let coin: { p: Pt; d: number; id: string } | null = null;
    for (const w of murs) {
      for (const q of [w.a, w.b]) {
        const d = dist(brut, q);
        if (d < rayon && (!coin || d < coin.d)) coin = { p: { x: q.x, z: q.z }, d, id: w.id };
      }
    }
    if (coin) return mesure(coin.p, 'coin', coin.id);
    // 3. Un mur existant : le coin tombe sur son axe.
    let mur: { p: Pt; d: number; id: string } | null = null;
    for (const w of murs) {
      const { dist: d, t } = pointOnSeg(brut, w.a, w.b);
      if (t <= 0 || t >= 1 || d >= rayon * 0.8) continue;
      if (!mur || d < mur.d) {
        mur = { p: { x: w.a.x + (w.b.x - w.a.x) * t, z: w.a.z + (w.b.z - w.a.z) * t }, d, id: w.id };
      }
    }
    if (mur) return mesure(mur.p, 'mur', mur.id);
  }

  if (!dernier) return mesure({ x: auCentimetre(brut.x), z: auCentimetre(brut.z) }, null);

  const vx = brut.x - dernier.x;
  const vz = brut.z - dernier.z;
  const brute = Math.hypot(vx, vz);
  if (brute < 1e-6) return mesure(dernier, null);
  const longueur = auCentimetre(brute);
  let angle = Math.atan2(vz, vx);
  let accroche: Accroche = null;
  if (aimant) {
    /*
      DROIT PAR RAPPORT À QUOI ? Au mur précédent d'abord — c'est lui que
      l'œil compare —, puis aux axes du logement. Le plus proche des deux
      l'emporte, à 7° près.
    */
    const pas = Math.PI / 4;
    const bases = [cadre];
    if (avant) bases.unshift(Math.atan2(dernier.z - avant.z, dernier.x - avant.x));
    let mieux: { a: number; ecart: number; droit: boolean } | null = null;
    for (const base of bases) {
      const k = Math.round((angle - base) / pas);
      const a = base + k * pas;
      const ecart = Math.abs(Math.atan2(Math.sin(angle - a), Math.cos(angle - a)));
      if (!mieux || ecart < mieux.ecart - 1e-9) mieux = { a, ecart, droit: k % 2 === 0 };
    }
    if (mieux && (mieux.ecart * 180) / Math.PI < TOLERANCE_ANGLE) {
      angle = mieux.a;
      accroche = mieux.droit ? 'equerre' : 'biais';
    }
  }
  let p = { x: dernier.x + Math.cos(angle) * longueur, z: dernier.z + Math.sin(angle) * longueur };
  if (aimant && accroche) {
    /*
      D'APLOMB D'UN COIN — essai au doigt : le dernier coin d'un rectangle
      tombait à neuf centimètres de l'aplomb du premier, et le mur qui
      referme penchait. Sur le rayon déjà calé, on cherche le point qui
      tombe dans l'axe (du logement) d'un coin du tracé ou du plan, à portée
      de l'aimant : le premier coin d'abord.
    */
    const ux = Math.cos(angle);
    const uz = Math.sin(angle);
    const ax = { x: Math.cos(cadre), z: Math.sin(cadre) };
    const az = { x: -Math.sin(cadre), z: Math.cos(cadre) };
    const reperes = [...coins.slice(0, -1), ...murs.flatMap((w) => [w.a, w.b])];
    let mieux: { q: Pt; d: number } | null = null;
    for (const r of reperes) {
      for (const n of [ax, az]) {
        // Le point du rayon dont la coordonnée sur `n` est celle du repère.
        const den = ux * n.x + uz * n.z;
        if (Math.abs(den) < 0.2) continue;
        const t = ((r.x - dernier.x) * n.x + (r.z - dernier.z) * n.z) / den;
        if (t <= 0.05) continue;
        const q = { x: dernier.x + ux * t, z: dernier.z + uz * t };
        const d = dist(q, p);
        if (d < rayon && (!mieux || d < mieux.d)) mieux = { q, d };
      }
    }
    if (mieux) {
      p = mieux.q;
      accroche = 'aligne';
    }
  }
  return mesure(p, accroche);
}

/**
 * LE COIN D'UN MUR DONT ON A TAPÉ LA LONGUEUR — « 3,20 » : le mur fait
 * 3,20 m depuis le dernier coin, dans la direction visée (`vers`). Sans
 * direction visée : à l'équerre du mur précédent (en tournant du même côté
 * que lui, pour suivre le tour de la pièce), ou vers la droite du logement
 * au premier mur.
 */
export function pointALaLongueur(
  coins: Pt[],
  longueur: number,
  vers: Pt | null,
  cadre = 0,
): Pt | null {
  const dernier = coins[coins.length - 1];
  if (!dernier || !(longueur > 0)) return null;
  let ux: number;
  let uz: number;
  if (vers && dist(vers, dernier) > 0.01) {
    const d = dist(vers, dernier);
    ux = (vers.x - dernier.x) / d;
    uz = (vers.z - dernier.z) / d;
  } else if (coins.length >= 2) {
    const avant = coins[coins.length - 2];
    const d = dist(dernier, avant) || 1;
    const px = (dernier.x - avant.x) / d;
    const pz = (dernier.z - avant.z) / d;
    // Le même sens de rotation que le coin d'avant ; à défaut, le sens des
    // aiguilles d'une montre à l'écran (z vers le bas).
    let tour = 1;
    if (coins.length >= 3) {
      const a0 = coins[coins.length - 3];
      const vec = (avant.x - a0.x) * pz - (avant.z - a0.z) * px;
      tour = vec >= 0 ? 1 : -1;
    }
    ux = -pz * tour;
    uz = px * tour;
  } else {
    ux = Math.cos(cadre);
    uz = Math.sin(cadre);
  }
  const L = auCentimetre(longueur);
  return { x: dernier.x + ux * L, z: dernier.z + uz * L };
}

/** L'aire d'un contour (m²), signe compris : positive dans le sens direct. */
export function aireSignee(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    s += p.x * q.z - q.x * p.z;
  }
  return s / 2;
}

/** Deux côtés non voisins du contour se croisent-ils ? */
export function contourCroise(pts: Pt[]): boolean {
  const n = pts.length;
  const coupe = (a: Pt, b: Pt, c: Pt, d: Pt) => {
    const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
    return o(a, b, c) * o(a, b, d) < -1e-12 && o(c, d, a) * o(c, d, b) < -1e-12;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (coupe(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

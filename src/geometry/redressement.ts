/**
 * CE QUI EST POSÉ CONTRE UN MUR LE SUIT QUAND ON LE REDRESSE — peaufinage
 * PLAN 2D.
 *
 * « Redresser » remet d'équerre un mur relevé à 1,5° de travers : ses
 * portes, son appareillage, ses photos et le plafond de la pièce le
 * suivaient déjà ; ses MEUBLES, non. Le canapé adossé au mur nord gardait
 * son biais : à un bout il entrait de 2,6 cm dans le mur redressé, à
 * l'autre il laissait un jour — et les notes, les cotes à la règle prises
 * contre lui restaient là où le mur n'était plus.
 *
 * Chaque chose posée près d'un mur (à moins de `PRES` de son trait) et à
 * peu près parallèle à lui garde sa place RELATIVE à ce mur : même
 * abscisse le long du mur (en proportion), même distance au trait, même
 * angle au mur. Ce qui n'est près d'aucun mur ne bouge pas : le
 * redressement corrige quelques degrés, il ne déplace pas la pièce.
 */
import type { ObjectData } from 'react-native-room-scan';
import type { Pt, WallSeg } from './floorplan';

/** Jusqu'où une chose est « contre » un mur (m). */
const PRES = 0.8;
/** Un meuble à 12° près parallèle au mur le suit en angle. */
const PARALLELE = Math.cos((12 * Math.PI) / 180);

interface Repere {
  a: Pt;
  u: Pt;
  n: Pt;
  L: number;
}

const repereDu = (w: WallSeg): Repere | null => {
  const L = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
  if (L < 0.05) return null;
  const u = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
  return { a: w.a, u, n: { x: -u.z, z: u.x }, L };
};

/** Les murs qui ont bougé, avant et après, par identifiant. */
function paires(avant: WallSeg[], apres: WallSeg[]): { av: Repere; ap: Repere }[] {
  const parId = new Map(apres.map((w) => [w.id, w]));
  const out: { av: Repere; ap: Repere }[] = [];
  for (const w of avant) {
    if (w.type !== 'wall') continue;
    const v = parId.get(w.id);
    if (!v) continue;
    const bouge =
      Math.hypot(v.a.x - w.a.x, v.a.z - w.a.z) > 1e-4 || Math.hypot(v.b.x - w.b.x, v.b.z - w.b.z) > 1e-4;
    if (!bouge) continue;
    const av = repereDu(w);
    const ap = repereDu(v);
    if (av && ap) out.push({ av, ap });
  }
  return out;
}

/** Le mur (avant) le plus proche du point, s'il en est assez près, et la place du point dans son repère. */
function lePlusProche(p: Pt, murs: { av: Repere; ap: Repere }[]) {
  let mieux: { av: Repere; ap: Repere; s: number; d: number } | null = null;
  for (const m of murs) {
    const dx = p.x - m.av.a.x;
    const dz = p.z - m.av.a.z;
    const s = dx * m.av.u.x + dz * m.av.u.z;
    const d = dx * m.av.n.x + dz * m.av.n.z;
    if (s < -0.1 || s > m.av.L + 0.1 || Math.abs(d) > PRES) continue;
    if (!mieux || Math.abs(d) < Math.abs(mieux.d)) mieux = { ...m, s, d };
  }
  return mieux;
}

/** Le point re-posé dans le repère du mur redressé. */
function replacer(m: { av: Repere; ap: Repere; s: number; d: number }): Pt {
  const s = (m.s / m.av.L) * m.ap.L;
  return {
    x: m.ap.a.x + m.ap.u.x * s + m.ap.n.x * m.d,
    z: m.ap.a.z + m.ap.u.z * s + m.ap.n.z * m.d,
  };
}

/** Un point (note, bout de cote) posé près d'un mur redressé le suit. */
export function pointQuiSuit(p: Pt, avant: WallSeg[], apres: WallSeg[]): Pt {
  const m = lePlusProche(p, paires(avant, apres));
  return m ? replacer(m) : p;
}

/**
 * Les meubles posés contre un mur redressé le suivent : place et angle
 * relatifs au mur gardés. Rend la même liste (même référence) si rien ne
 * bouge.
 */
export function meublesQuiSuivent<O extends ObjectData>(objets: O[], avant: WallSeg[], apres: WallSeg[]): O[] {
  const murs = paires(avant, apres);
  if (murs.length === 0) return objets;
  let change = false;
  const out = objets.map((o) => {
    const t = o.transform;
    if (!t || t.length < 16) return o;
    const c = { x: t[12], z: t[14] };
    const m = lePlusProche(c, murs);
    if (!m) return o;
    // Seul un meuble à peu près parallèle (ou perpendiculaire) au mur prend son angle.
    const ex = { x: t[0], z: t[2] };
    const lx = Math.hypot(ex.x, ex.z) || 1;
    const cosA = Math.abs((ex.x * m.av.u.x + ex.z * m.av.u.z) / lx);
    const sinA = Math.abs((ex.x * m.av.n.x + ex.z * m.av.n.z) / lx);
    const aligne = cosA >= PARALLELE || sinA >= PARALLELE;
    const p = replacer(m);
    const tour = aligne ? Math.atan2(m.ap.u.z, m.ap.u.x) - Math.atan2(m.av.u.z, m.av.u.x) : 0;
    if (Math.hypot(p.x - c.x, p.z - c.z) < 1e-5 && Math.abs(tour) < 1e-6) return o;
    change = true;
    const nt = [...t];
    if (tour !== 0) {
      const cs = Math.cos(tour);
      const sn = Math.sin(tour);
      for (const k of [0, 4, 8]) {
        const x = t[k];
        const z = t[k + 2];
        nt[k] = x * cs - z * sn;
        nt[k + 2] = x * sn + z * cs;
      }
    }
    nt[12] = p.x;
    nt[14] = p.z;
    return { ...o, transform: nt };
  });
  return change ? out : objets;
}

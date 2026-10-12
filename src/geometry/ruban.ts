/**
 * LE RUBAN LED — la ligne de lumière des plans d'architecte.
 *
 * Relevé du patron, plan d'architecte à l'appui (DCE « Romeo ») : « rajoute
 * la possibilité de placer de la LED comme sur ces plans ». Le ruban s'y
 * dessine en zigzag bleu : en corniche le long des murs, au bord d'un
 * caisson de faux plafond, sous les meubles hauts d'une cuisine, dans la
 * boîte à rideaux d'une baie.
 *
 * Ce n'est pas un point : c'est un TRACÉ, ouvert (sous un meuble, le long
 * d'un mur) ou fermé (le tour d'une pièce, d'un caisson). Il vit au plafond
 * avec les autres luminaires (`CeilingFixture.trace`) : il se commande d'un
 * interrupteur, entre dans un circuit d'éclairage et se compte au mètre.
 */
import type { Pt } from './floorplan';

/** Aire signée d'un contour : son signe dit de quel côté est l'intérieur. */
function aireSignee(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.z - b.x * a.z;
  }
  return s / 2;
}

/** Le contour sans ses points doublés ni ses points alignés. */
function nettoye(pts: Pt[]): Pt[] {
  const sansDoublon = pts.filter((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return Math.hypot(q.x - p.x, q.z - p.z) > 1e-6;
  });
  return sansDoublon.filter((p, i) => {
    const a = sansDoublon[(i - 1 + sansDoublon.length) % sansDoublon.length];
    const b = sansDoublon[(i + 1) % sansDoublon.length];
    const cross = (p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x);
    return Math.abs(cross) > 1e-9;
  });
}

/**
 * LE TOUR DE LA PIÈCE, EN RETRAIT — la corniche (quelques centimètres) ou
 * le bord d'un caisson (soixante). Chaque côté du contour recule vers
 * l'intérieur de `retrait`, et les coins se reprennent à l'intersection des
 * côtés voisins : un L reste un L. `null` quand le retrait mange la pièce.
 */
export function rubanPeripherique(contour: Pt[], retrait: number): Pt[] | null {
  const pts = nettoye(contour);
  if (pts.length < 3) return null;
  const aire = aireSignee(pts);
  if (Math.abs(aire) < 1e-9) return null;
  const sens = aire > 0 ? 1 : -1;
  const n = pts.length;
  // Chaque côté, reculé : un point et une direction.
  const cotes = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const u = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
    const dedans = { x: -u.z * sens, z: u.x * sens };
    return { p: { x: a.x + dedans.x * retrait, z: a.z + dedans.z * retrait }, u };
  });
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const c1 = cotes[(i - 1 + n) % n];
    const c2 = cotes[i];
    const den = c1.u.x * c2.u.z - c1.u.z * c2.u.x;
    if (Math.abs(den) < 1e-9) {
      out.push(c2.p);
      continue;
    }
    const t = ((c2.p.x - c1.p.x) * c2.u.z - (c2.p.z - c1.p.z) * c2.u.x) / den;
    out.push({ x: c1.p.x + c1.u.x * t, z: c1.p.z + c1.u.z * t });
  }
  // Le retrait a retourné le contour (pièce trop petite) : rien à poser.
  if (Math.sign(aireSignee(out)) !== Math.sign(aire) || Math.abs(aireSignee(out)) < 0.01) return null;
  /*
    RETOURNÉ DANS LES DEUX SENS, IL GARDE SON AIRE — revue « Bernard » : une
    corniche à 2,50 m dans une cuisine de 3,40 × 2,80 se retournait en
    largeur ET en profondeur ; l'aire gardait son signe, et un ruban fermé
    de 7,60 m se posait au milieu de la pièce (23,60 m hors d'elle à
    4,50 m). Chaque côté reculé doit garder le sens du sien.
  */
  for (let i = 0; i < n; i++) {
    const a = out[i];
    const b = out[(i + 1) % n];
    if ((b.x - a.x) * cotes[i].u.x + (b.z - a.z) * cotes[i].u.z <= 1e-6) return null;
  }
  return out;
}

/**
 * LE LONG DU MUR LE PLUS PROCHE — sous les meubles hauts, dans une boîte à
 * rideaux, au-dessus d'une tête de lit. Le côté du contour le plus proche
 * du doigt, prolongé par ses voisins alignés (un mur coupé par une cloison
 * reste un mur), reculé de `retrait` vers la pièce.
 */
export function rubanLeLongDuMur(contour: Pt[], at: Pt, retrait: number): Pt[] | null {
  const pts = nettoye(contour);
  const n = pts.length;
  if (n < 3) return null;
  const sens = aireSignee(pts) > 0 ? 1 : -1;
  let meilleur = -1;
  let dMin = Infinity;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.z - a.z) * dz) / L2));
    const d = Math.hypot(a.x + dx * t - at.x, a.z + dz * t - at.z);
    if (d < dMin) {
      dMin = d;
      meilleur = i;
    }
  }
  const a = pts[meilleur];
  const b = pts[(meilleur + 1) % n];
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  const u = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
  const dedans = { x: -u.z * sens, z: u.x * sens };
  return [
    { x: a.x + dedans.x * retrait, z: a.z + dedans.z * retrait },
    { x: b.x + dedans.x * retrait, z: b.z + dedans.z * retrait },
  ];
}

/** Un meuble vu d'en haut : son centre, ses cotes, son orientation. */
export interface MeubleVuDeHaut {
  cx: number;
  cz: number;
  width: number;
  depth: number;
  yaw: number;
}

/**
 * SOUS LES MEUBLES HAUTS — revues « Bernard » et « Mehdi ». « Le long du
 * mur touché » prenait le mur le plus proche du doigt (celui de la fenêtre,
 * pour un appui au milieu de la cuisine) et courait tout le mur : 3,40 m
 * pour 2,00 m de meubles, 6,00 m pour 3,00 m, sans moyen de raccourcir.
 *
 * Ici le ruban court SOUS les meubles hauts : sur le mur qui les porte (le
 * plus proche du doigt, s'ils sont sur plusieurs murs), de leur premier
 * bord à leur dernier, sous leur face avant. Une rangée coupée par une
 * fenêtre donne la partie la plus proche du doigt. `null` sans meuble haut
 * contre un mur.
 */
export function rubanSousLesMeubles(
  contour: Pt[],
  meubles: readonly MeubleVuDeHaut[],
  at: Pt,
): Pt[] | null {
  const pts = nettoye(contour);
  const n = pts.length;
  if (n < 3 || meubles.length === 0) return null;
  const sens = aireSignee(pts) > 0 ? 1 : -1;
  // Pour chaque côté, les meubles qui s'y adossent : leur étendue le long du mur.
  type Rangee = { i: number; de: number; a: number; profondeur: number };
  const rangees: Rangee[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 0.2) continue;
    const u = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
    const dedans = { x: -u.z * sens, z: u.x * sens };
    for (const m of meubles) {
      const c = Math.cos(m.yaw);
      const s = Math.sin(m.yaw);
      const coins = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([sx, sz]) => {
        const lx = (sx * m.width) / 2;
        const lz = (sz * m.depth) / 2;
        return { x: m.cx + lx * c - lz * s, z: m.cz + lx * s + lz * c };
      });
      const le = coins.map((q) => (q.x - a.x) * u.x + (q.z - a.z) * u.z);
      const loin = coins.map((q) => (q.x - a.x) * dedans.x + (q.z - a.z) * dedans.z);
      const pres = Math.min(...loin);
      // Adossé : son dos à moins de 15 cm du nu, et devant le mur, pas à côté.
      if (pres > 0.15 || Math.max(...loin) <= 0) continue;
      const de = Math.max(0, Math.min(...le));
      const fin = Math.min(L, Math.max(...le));
      if (fin - de < 0.1) continue;
      rangees.push({ i, de, a: fin, profondeur: Math.max(...loin) });
    }
  }
  if (rangees.length === 0) return null;
  // Les meubles d'un même mur se suivent : une rangée tant que l'écart reste sous 30 cm.
  const parMur = new Map<number, Rangee[]>();
  for (const r of rangees) parMur.set(r.i, [...(parMur.get(r.i) ?? []), r]);
  const suites: Rangee[] = [];
  for (const [i, rs] of parMur) {
    rs.sort((x, y) => x.de - y.de);
    let cour: Rangee | null = null;
    for (const r of rs) {
      if (cour && r.de <= cour.a + 0.3) {
        cour.a = Math.max(cour.a, r.a);
        cour.profondeur = Math.max(cour.profondeur, r.profondeur);
      } else {
        cour = { i, de: r.de, a: r.a, profondeur: r.profondeur };
        suites.push(cour);
      }
    }
  }
  // La rangée la plus proche du doigt.
  const point = (r: Rangee, t: number, d: number) => {
    const a = pts[r.i];
    const b = pts[(r.i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const u = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
    const dedans = { x: -u.z * sens, z: u.x * sens };
    return { x: a.x + u.x * t + dedans.x * d, z: a.z + u.z * t + dedans.z * d };
  };
  const distance = (r: Rangee) => {
    const p = point(r, (r.de + r.a) / 2, r.profondeur / 2);
    return Math.hypot(p.x - at.x, p.z - at.z);
  };
  const choisie = suites.reduce((m, r) => (distance(r) < distance(m) ? r : m));
  // Sous la face avant, en retrait de 5 cm : là où se pose le profilé.
  const d = Math.max(0.05, choisie.profondeur - 0.05);
  return [point(choisie, choisie.de, d), point(choisie, choisie.a, d)];
}

/** La longueur d'un ruban, en mètres — fermé, il revient à son départ. */
export function longueurDuRuban(trace: Pt[], ferme = false): number {
  let L = 0;
  const n = trace.length;
  for (let i = 0; i + 1 < n; i++) {
    L += Math.hypot(trace[i + 1].x - trace[i].x, trace[i + 1].z - trace[i].z);
  }
  if (ferme && n > 2) L += Math.hypot(trace[0].x - trace[n - 1].x, trace[0].z - trace[n - 1].z);
  return L;
}

/**
 * OÙ S'ACCROCHE LE LIEN DE COMMANDE — le point du ruban le plus proche de
 * l'interrupteur. Un luminaire ponctuel s'accroche à son centre.
 */
export function pointDAccroche(
  cl: { at: Pt; trace?: Pt[]; ferme?: boolean },
  depuis: Pt,
): Pt {
  const tr = cl.trace;
  if (!tr || tr.length < 2) return cl.at;
  const chemin = cl.ferme && tr.length > 2 ? [...tr, tr[0]] : tr;
  let mieux = cl.at;
  let dMin = Infinity;
  for (let i = 0; i + 1 < chemin.length; i++) {
    const a = chemin[i];
    const b = chemin[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L2 = dx * dx + dz * dz || 1e-12;
    const t = Math.max(0, Math.min(1, ((depuis.x - a.x) * dx + (depuis.z - a.z) * dz) / L2));
    const p = { x: a.x + dx * t, z: a.z + dz * t };
    const d = Math.hypot(p.x - depuis.x, p.z - depuis.z);
    if (d < dMin) {
      dMin = d;
      mieux = p;
    }
  }
  return mieux;
}

/**
 * LE ZIGZAG DU DESSIN — la ligne brisée du plan d'architecte, en unités de
 * l'écran ou de la feuille. Une dent tous les `pas`, de `amplitude` de part
 * et d'autre du tracé ; les bouts restent sur le tracé.
 */
export function zigzag(
  pts: { x: number; y: number }[],
  pas: number,
  amplitude: number,
  ferme = false,
): { x: number; y: number }[] {
  const chemin = ferme && pts.length > 2 ? [...pts, pts[0]] : pts;
  const segs: { a: { x: number; y: number }; b: { x: number; y: number }; L: number; s0: number }[] = [];
  let T = 0;
  for (let i = 0; i + 1 < chemin.length; i++) {
    const a = chemin[i];
    const b = chemin[i + 1];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-9) continue;
    segs.push({ a, b, L, s0: T });
    T += L;
  }
  if (segs.length === 0 || !(pas > 0)) return chemin.slice();
  const n = Math.max(2, Math.round(T / (pas / 2)));
  const out: { x: number; y: number }[] = [];
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const s = (T * k) / n;
    while (j < segs.length - 1 && s > segs[j].s0 + segs[j].L) j++;
    const g = segs[j];
    const t = Math.max(0, Math.min(1, (s - g.s0) / g.L));
    const ux = (g.b.x - g.a.x) / g.L;
    const uy = (g.b.y - g.a.y) / g.L;
    const signe = k === 0 || k === n ? 0 : k % 2 === 1 ? 1 : -1;
    out.push({
      x: g.a.x + (g.b.x - g.a.x) * t - uy * amplitude * signe,
      y: g.a.y + (g.b.y - g.a.y) * t + ux * amplitude * signe,
    });
  }
  return out;
}

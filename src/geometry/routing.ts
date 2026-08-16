/**
 * Cheminement des gaines, et métré de câble.
 *
 * Le plan sait où sont les appareils et où est le tableau ; il peut donc
 * dire par où passe la gaine et combien de mètres il faut acheter. C'est la
 * seule donnée du devis qu'on ne pouvait pas déduire du relevé, et celle
 * qu'un électricien estime encore au pas dans le couloir.
 *
 * Le modèle est volontairement SIMPLE, et il le dit : la gaine longe le
 * contour de la pièce à hauteur de plinthe, tourne aux angles, puis remonte
 * ou descend jusqu'à l'appareil. On ne prétend pas dessiner un vrai
 * cheminement — cloisons creuses, faux plafonds, réservations — mais donner
 * le chemin le plus court PAR LE BÂTI, celui dont on ne s'écarte qu'en
 * connaissance de cause.
 */
import type { Pt } from './floorplan';

/** Hauteur de la boucle de distribution : la plinthe. */
export const HAUTEUR_GAINE = 0.15;
/** Mou laissé à chaque about (tableau, boîte) : 30 cm de chaque côté. */
export const MOU = 0.6;

export interface RoutePoint extends Pt {
  /** Altitude du point (m) : la remontée vers l'appareil se voit en 3D. */
  y: number;
}

export interface CableRun {
  fixtureId: string;
  /** Tracé au sol, du tableau à l'aplomb de l'appareil. */
  path: Pt[];
  /** Longueur développée : parcours au sol + descente + remontée + mou. */
  length: number;
  /**
   * Longueur de GAINE : le parcours physique, sans le mou d'about. On tire
   * du fil en plus, pas du conduit.
   */
  conduit: number;
}

/** Distance entre deux points du plan. */
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.z - a.z);

/**
 * Projette un point sur un contour fermé : sommet le plus proche du bord,
 * et abscisse curviligne de ce point le long du contour.
 */
export function projectOnRing(
  ring: Pt[],
  p: Pt,
): { at: Pt; s: number; total: number } {
  let best = { at: ring[0], s: 0, d: Infinity };
  let cumul = 0;
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const l = dist(a, b);
    total += l;
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const l2 = ex * ex + ez * ez || 1e-9;
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * ex + (p.z - a.z) * ez) / l2));
    const at = { x: a.x + ex * t, z: a.z + ez * t };
    const d = dist(at, p);
    if (d < best.d) best = { at, s: cumul + t * Math.sqrt(l2), d };
    cumul += Math.sqrt(l2);
  }
  return { at: best.at, s: best.s, total };
}

/**
 * Le chemin le plus court entre deux points du contour, EN LONGEANT le
 * contour : on compare les deux sens et on garde le plus court, comme la
 * gaine qui contourne la pièce du bon côté.
 */
export function ringPath(ring: Pt[], from: Pt, to: Pt): { path: Pt[]; length: number } {
  if (ring.length < 3) {
    return { path: [from, to], length: dist(from, to) };
  }
  const A = projectOnRing(ring, from);
  const B = projectOnRing(ring, to);
  const total = A.total;
  const avant = (B.s - A.s + total) % total;
  const arriere = total - avant;
  const sens = avant <= arriere ? 1 : -1;
  const parcours = Math.min(avant, arriere);

  // On égrène les sommets rencontrés entre les deux abscisses.
  const sommets: { s: number; p: Pt }[] = [];
  let cumul = 0;
  for (let i = 0; i < ring.length; i++) {
    sommets.push({ s: cumul, p: ring[i] });
    cumul += dist(ring[i], ring[(i + 1) % ring.length]);
  }
  const dedans = (s: number) => {
    const rel = sens > 0 ? (s - A.s + total) % total : (A.s - s + total) % total;
    return rel > 1e-6 && rel < parcours - 1e-6;
  };
  const etapes = sommets
    .filter((v) => dedans(v.s))
    .sort((a, b) => {
      const ra = sens > 0 ? (a.s - A.s + total) % total : (A.s - a.s + total) % total;
      const rb = sens > 0 ? (b.s - A.s + total) % total : (A.s - b.s + total) % total;
      return ra - rb;
    })
    .map((v) => v.p);

  const path = [A.at, ...etapes, B.at];
  let length = 0;
  for (let i = 1; i < path.length; i++) length += dist(path[i - 1], path[i]);
  return { path, length };
}

/**
 * Le cheminement d'un circuit : du tableau à chaque appareil.
 *
 * Chaque départ est compté SÉPARÉMENT — c'est ce qu'on tire dans la gaine —
 * et la descente comme la remontée s'ajoutent au parcours au sol. Le mou
 * d'about est forfaitaire : 30 cm à chaque bout, ce qu'on laisse toujours
 * pour raccorder proprement.
 */
export function cableRuns(
  ring: Pt[],
  panel: Pt,
  panelHeight: number,
  devices: { id: string; at: Pt; height: number }[],
): CableRun[] {
  // Le tableau n'est pas forcément dans la pièce desservie : la gaine
  // traverse alors le dégagement. On compte ce trajet en ligne droite, et
  // on le DIT — c'est une approximation, pas un cheminement relevé.
  const entree = projectOnRing(ring, panel);
  const traverse = dist(panel, entree.at);
  return devices.map((d) => {
    const { path, length } = ringPath(ring, panel, d.at);
    const descente = Math.abs(panelHeight - HAUTEUR_GAINE);
    const remontee = Math.abs(d.height - HAUTEUR_GAINE);
    const parcours = traverse + length + descente + remontee;
    return {
      fixtureId: d.id,
      path: traverse > 1e-6 ? [panel, ...path] : path,
      length: parcours + MOU,
      conduit: parcours,
    };
  });
}

/** Total d'un circuit, arrondi au mètre supérieur — on n'achète pas au cm. */
export function circuitLength(runs: CableRun[]): number {
  return Math.ceil(runs.reduce((t, r) => t + r.length, 0));
}

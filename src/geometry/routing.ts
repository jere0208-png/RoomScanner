/**
 * Cheminement des gaines, et métré de câble.
 *
 * Le plan sait où sont les appareils et où est le tableau ; il peut donc
 * dire par où passe la gaine et combien de mètres il faut acheter. C'est la
 * seule donnée du devis qu'on ne pouvait pas déduire du relevé, et celle
 * qu'un électricien estime encore au pas dans le couloir.
 *
 * LE CHEMIN LE PLUS COURT, DANS LA PIÈCE.
 *
 * La gaine faisait le tour du propriétaire : elle longeait le contour d'un
 * bout à l'autre, entrait dans chaque renfoncement, ressortait, et le métré
 * gonflait d'autant. Sur un séjour en L, atteindre une prise à six mètres
 * coûtait onze mètres de conduit — personne ne tire comme ça.
 *
 * On calcule désormais la GÉODÉSIQUE : le plus court trajet qui reste dans
 * la pièce. Dans une pièce carrée c'est la droite, dans la dalle ou sous la
 * chape ; dès qu'un retour de cloison s'interpose, le trajet vient
 * l'épouser — il contourne au plus juste, en frôlant l'angle, exactement
 * comme on déroule une gaine au sol.
 *
 * Ce que le modèle ne prétend toujours PAS connaître : ce qu'il y a dans les
 * cloisons, les réservations, les faux plafonds. Il donne un trajet
 * constructible et sa longueur ; on ne s'en écarte qu'en connaissance de
 * cause.
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

/** Le segment ]a, b[ reste-t-il dans le contour ? */
function segmentDedans(ring: Pt[], a: Pt, b: Pt): boolean {
  // On échantillonne l'INTÉRIEUR du segment. Tester les intersections
  // d'arêtes ne suffit pas : un segment qui longe exactement un mur ne
  // croise rien et sort pourtant de la pièce dès le mur suivant.
  const N = 12;
  for (let i = 1; i < N; i++) {
    const t = i / N;
    const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    if (!dansLeContour(p, ring)) return false;
  }
  return true;
}

/** Point dans le contour, arête comprise à un cheveu près. */
function dansLeContour(p: Pt, ring: Pt[]): boolean {
  let dedans = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z || 1e-12) + a.x
    ) {
      dedans = !dedans;
    }
  }
  if (dedans) return true;
  // Tolérance d'un centimètre : les départs et arrivées sont AU NU du mur,
  // et un arrondi les jetterait dehors.
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const l2 = ex * ex + ez * ez || 1e-9;
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * ex + (p.z - a.z) * ez) / l2));
    if (Math.hypot(p.x - (a.x + ex * t), p.z - (a.z + ez * t)) < 0.01) return true;
  }
  return false;
}

/**
 * LE PLUS COURT TRAJET QUI RESTE DANS LA PIÈCE.
 *
 * Graphe de visibilité : les deux bouts, plus chaque angle RENTRANT de la
 * pièce — ce sont les seuls points où un trajet le plus court peut plier.
 * On relie tout ce qui se voit, puis Dijkstra. Une pièce compte vingt
 * sommets au plus : le calcul est instantané, et il est exact.
 *
 * Les angles sont légèrement RENTRÉS (six centimètres) : une gaine ne se
 * plie pas sur l'arête d'une cloison, elle la contourne avec son rayon.
 */
export function shortestPath(
  ring: Pt[],
  from: Pt,
  to: Pt,
): { path: Pt[]; length: number } {
  if (ring.length < 3) return { path: [from, to], length: dist(from, to) };
  if (segmentDedans(ring, from, to)) {
    return { path: [from, to], length: dist(from, to) };
  }
  const RENTRE = 0.06;
  /** Aire signée : elle dit le sens du contour, donc où est l'intérieur. */
  let aire = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    aire += a.x * b.z - b.x * a.z;
  }
  const sens = aire >= 0 ? 1 : -1;
  const coins: Pt[] = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const a = ring[(i - 1 + ring.length) % ring.length];
    const b = ring[(i + 1) % ring.length];
    const u = { x: p.x - a.x, z: p.z - a.z };
    const v = { x: b.x - p.x, z: b.z - p.z };
    const croix = (u.x * v.z - u.z * v.x) * sens;
    // Angle RENTRANT : c'est lui qui masque, et donc lui qui fait plier.
    if (croix >= -1e-9) continue;
    const lu = Math.hypot(u.x, u.z) || 1;
    const lv = Math.hypot(v.x, v.z) || 1;
    const bx = -u.x / lu + v.x / lv;
    const bz = -u.z / lu + v.z / lv;
    const lb = Math.hypot(bx, bz) || 1;
    const c = { x: p.x + (bx / lb) * RENTRE, z: p.z + (bz / lb) * RENTRE };
    coins.push(dansLeContour(c, ring) ? c : p);
  }
  const noeuds = [from, ...coins, to];
  const n = noeuds.length;
  const arc: number[][] = Array.from({ length: n }, () => new Array(n).fill(Infinity));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!segmentDedans(ring, noeuds[i], noeuds[j])) continue;
      const d = dist(noeuds[i], noeuds[j]);
      arc[i][j] = d;
      arc[j][i] = d;
    }
  }
  // Dijkstra, sur vingt nœuds : la version simple suffit largement.
  const cout = new Array(n).fill(Infinity);
  const avant = new Array(n).fill(-1);
  const vu = new Array(n).fill(false);
  cout[0] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) {
      if (!vu[i] && (u === -1 || cout[i] < cout[u])) u = i;
    }
    if (u === -1 || cout[u] === Infinity) break;
    vu[u] = true;
    if (u === n - 1) break;
    for (let v = 0; v < n; v++) {
      if (vu[v] || arc[u][v] === Infinity) continue;
      if (cout[u] + arc[u][v] < cout[v]) {
        cout[v] = cout[u] + arc[u][v];
        avant[v] = u;
      }
    }
  }
  if (cout[n - 1] === Infinity) {
    // Aucun trajet trouvé (contour incohérent) : on longe, comme avant.
    return ringPath(ring, from, to);
  }
  const path: Pt[] = [];
  for (let i = n - 1; i !== -1; i = avant[i]) path.unshift(noeuds[i]);
  return { path, length: cout[n - 1] };
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
    const { path, length } = shortestPath(ring, entree.at, d.at);
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

/**
 * DEUX GAINES NE SE DESSINENT JAMAIS L'UNE SUR L'AUTRE.
 *
 * Relevé du patron, capture à l'appui : « plusieurs lignes se chevauchent, ça
 * doit être impossible (courber une ligne si le cas) ».
 *
 * Tous les départs partent du MÊME tableau et longent le MÊME contour : leurs
 * premiers mètres sont rigoureusement confondus. Tracés tels quels, trois
 * départs font un seul tireté — on ne voit plus ni combien il y en a, ni où
 * ils se séparent. Sur un plan de chantier, c'est justement ce qu'on cherche
 * à lire.
 *
 * On les écarte donc latéralement, comme un chemin de câbles : chaque départ
 * prend son rang, et se décale d'autant de fois le pas. L'ÉCART SE REFERME
 * SUR L'APPAREIL — plein au départ, nul à l'arrivée : la gaine doit finir
 * exactement sur le symbole qu'elle alimente, sinon on aurait échangé un
 * chevauchement contre un mensonge.
 *
 * Le rang se prend sur le PREMIER SEGMENT : deux départs qui ne partent pas
 * du même endroit ne se gênent pas, et gardent tous deux l'axe.
 */
export function ecarterLesGaines<T extends { path: Pt[] }>(
  routes: T[],
  /** L'écart entre deux gaines voisines, dans l'unité du tracé (mètres). */
  pas = 0.06,
): T[] {
  const rangs = new Map<string, number>();
  return routes.map((r) => {
    const n = r.path.length;
    if (n < 2) return r;
    const a = r.path[0];
    const b = r.path[1];
    const cle = `${a.x.toFixed(2)},${a.z.toFixed(2)}|${b.x.toFixed(2)},${b.z.toFixed(2)}`;
    const rang = rangs.get(cle) ?? 0;
    rangs.set(cle, rang + 1);
    if (rang === 0) return r;
    return {
      ...r,
      path: r.path.map((p, i) => {
        // La normale locale : celle du segment qui suit, ou du précédent au
        // dernier point.
        const q = i + 1 < n ? r.path[i + 1] : r.path[i];
        const o = i + 1 < n ? p : r.path[i - 1];
        const dx = q.x - o.x;
        const dz = q.z - o.z;
        const l = Math.hypot(dx, dz) || 1;
        // Plein au départ, nul à l'arrivée : la gaine retrouve son appareil.
        const k = rang * pas * (1 - i / (n - 1));
        return { x: p.x + (-dz / l) * k, z: p.z + (dx / l) * k };
      }),
    };
  });
}

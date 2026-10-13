/**
 * CE QU'ON VOIT PAR LA PORTE N'EST PAS RELEVÉ — il faut traverser.
 *
 * Relevé du patron : « fais en sorte que l'app comprenne que si on est dans
 * une pièce, ça ne scanne pas la pièce au fond derrière la porte. Il faut
 * traverser l'ouvrant pour que le scan de l'autre pièce où l'on se trouve
 * démarre ».
 *
 * RoomPlan relève tout ce que la caméra voit : par une porte ouverte, le mur
 * du fond de la chambre, la moitié d'une armoire, une fenêtre — des morceaux
 * de pièce qui ne se referment pas, et qui encombrent le plan d'une pièce
 * qu'on n'a jamais visitée.
 *
 * Le natif note le CHEMIN DE LA CAMÉRA au sol (`trajet`, tous les quinze
 * centimètres). Un mur, une ouverture, un meuble n'est gardé que si un point
 * de ce chemin le voit EN LIGNE DROITE SANS TRAVERSER DE MUR. Or ce qu'on a
 * aperçu par une porte ne se voit qu'à travers le plan de son mur : la
 * ligne de mire coupe la cloison à l'endroit de la porte. Tant qu'on est
 * resté de ce côté-ci, la pièce du fond n'existe pas ; dès qu'on franchit
 * l'ouvrant, le chemin passe de l'autre côté — et tout ce qu'on y voit est
 * relevé, depuis là.
 *
 * Une pièce en L, un recoin : on les a vus depuis un point du chemin, ou on
 * y est entré — ils restent. Les murs sont allongés de quelques centimètres
 * aux deux bouts : un regard ne se glisse pas par l'interstice d'un coin.
 *
 * PRUDENCE : sans chemin (ancien binaire), avec un chemin trop court, ou si
 * le chemin n'est visiblement pas dans le repère des murs, rien n'est écarté ;
 * et jamais au point de laisser moins de trois murs.
 */
import type {
  ObjectData,
  ScanResult,
  SurfaceData,
} from 'react-native-room-scan';
import { toSegment, type Pt } from './floorplan';

/** Deux points du chemin gardés sont au moins à cette distance (m). */
const PAS = 0.15;
/** Au-delà, on échantillonne : la visibilité n'a pas besoin de mille regards. */
const MAX_POINTS = 400;
/** Un mur, comme obstacle, est allongé d'autant à chaque bout (m). */
const ALLONGE = 0.08;
/** La ligne de mire s'arrête un peu avant sa cible (m). */
const AVANT = 0.04;

/** Le chemin de la caméra, à plat, sans doublons rapprochés. */
export function trajetDe(r: { trajet?: number[] }): Pt[] {
  const t = r.trajet ?? [];
  const out: Pt[] = [];
  for (let i = 0; i + 1 < t.length; i += 2) {
    const p = { x: t[i], z: t[i + 1] };
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const d = out[out.length - 1];
    if (d && Math.hypot(d.x - p.x, d.z - p.z) < PAS) continue;
    out.push(p);
  }
  if (out.length <= MAX_POINTS) return out;
  const pas = out.length / MAX_POINTS;
  return Array.from({ length: MAX_POINTS }, (_, k) => out[Math.floor(k * pas)]);
}

interface Trait {
  id: string;
  a: Pt;
  b: Pt;
}

const orient = (p: Pt, q: Pt, r: Pt) =>
  (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);

/** Les segments [p, q] et [a, b] se coupent-ils franchement ? */
function coupe(p: Pt, q: Pt, t: Trait): boolean {
  const d1 = orient(t.a, t.b, p);
  const d2 = orient(t.a, t.b, q);
  if (!((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))) return false;
  const d3 = orient(p, q, t.a);
  const d4 = orient(p, q, t.b);
  return (d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0);
}

/** Un point est-il vu d'un point du chemin, sans traverser de mur (hormis `sauf`) ? */
function vu(
  cible: Pt,
  chemin: readonly Pt[],
  murs: readonly Trait[],
  sauf: ReadonlySet<string>,
): boolean {
  for (const p of chemin) {
    const dx = cible.x - p.x;
    const dz = cible.z - p.z;
    const L = Math.hypot(dx, dz);
    if (L < 0.05) return true;
    const k = Math.max(0, (L - AVANT) / L);
    const fin = { x: p.x + dx * k, z: p.z + dz * k };
    if (!murs.some(m => !sauf.has(m.id) && coupe(p, fin, m))) return true;
  }
  return false;
}

/** Le mur comme obstacle : allongé aux deux bouts, pour fermer les coins. */
function obstacle(id: string, a: Pt, b: Pt): Trait {
  const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const ux = (b.x - a.x) / L;
  const uz = (b.z - a.z) / L;
  return {
    id,
    a: { x: a.x - ux * ALLONGE, z: a.z - uz * ALLONGE },
    b: { x: b.x + ux * ALLONGE, z: b.z + uz * ALLONGE },
  };
}

/**
 * Les murs qui portent ce segment, ou le doublent : parallèles, à quelques
 * centimètres de sa ligne, et en face de lui. On ne voit pas une porte « à
 * travers » le mur qui la porte.
 */
function porteurs(
  a: Pt,
  b: Pt,
  murs: readonly Trait[],
  ecart: number,
): Set<string> {
  const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const ux = (b.x - a.x) / L;
  const uz = (b.z - a.z) / L;
  const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const out = new Set<string>();
  for (const w of murs) {
    const wl = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z) || 1;
    const vx = (w.b.x - w.a.x) / wl;
    const vz = (w.b.z - w.a.z) / wl;
    if (Math.abs(ux * vx + uz * vz) < 0.97) continue;
    // Distance du milieu à la ligne du mur, et sa place le long du mur.
    const rx = m.x - w.a.x;
    const rz = m.z - w.a.z;
    const le = rx * vx + rz * vz;
    const travers = Math.abs(rx * -vz + rz * vx);
    if (travers <= ecart && le >= -0.1 && le <= wl + 0.1) out.add(w.id);
  }
  return out;
}

export interface Ecartes {
  murs: number;
  ouvertures: number;
  meubles: number;
}

/**
 * Le relevé sans ce qu'on n'a vu QUE par une porte. Rend le relevé (le même
 * objet s'il n'y a rien à écarter) et ce qui a été écarté.
 */
export function sansCeQuOnAVuParLaPorte(r: ScanResult): {
  releve: ScanResult;
  ecartes: Ecartes;
} {
  const rien = { releve: r, ecartes: { murs: 0, ouvertures: 0, meubles: 0 } };
  const chemin = trajetDe(r);
  if (chemin.length < 3) return rien;
  const surfaces: SurfaceData[] = r.rooms?.length
    ? r.rooms.flatMap(x => x.surfaces ?? [])
    : r.surfaces ?? [];
  const objets: ObjectData[] = r.rooms?.length
    ? r.rooms.flatMap(x => x.objects ?? [])
    : r.objects ?? [];
  const lisibles = surfaces.filter(
    s => s.transform?.length === 16 || s.ax !== undefined,
  );
  const segs = lisibles.map(s => ({ s, g: toSegment(s) }));
  const murs = segs.filter(x => x.s.type === 'wall');
  if (murs.length < 3) return rien;

  // Le chemin est-il dans le repère des murs ? Sinon, on ne touche à rien.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const { g } of murs) {
    for (const p of [g.a, g.b]) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
  }
  const dedans = chemin.filter(
    p => p.x > minX - 1 && p.x < maxX + 1 && p.z > minZ - 1 && p.z < maxZ + 1,
  ).length;
  if (dedans < chemin.length * 0.7) return rien;

  const obstacles = murs.map(({ s, g }) => obstacle(s.id, g.a, g.b));
  const garde = new Set<string>();
  // Les murs : vus en l'un de trois points, eux-mêmes et leurs doublons exceptés.
  for (const { s, g } of murs) {
    const sauf = porteurs(g.a, g.b, obstacles, 0.12);
    sauf.add(s.id);
    const vus = [0.15, 0.5, 0.85].some(t =>
      vu(
        { x: g.a.x + (g.b.x - g.a.x) * t, z: g.a.z + (g.b.z - g.a.z) * t },
        chemin,
        obstacles,
        sauf,
      ),
    );
    if (vus) garde.add(s.id);
  }
  if (garde.size < 3) return rien;
  // Les ouvertures : vues en leur milieu, leur mur porteur excepté.
  for (const { s, g } of segs) {
    if (s.type === 'wall') continue;
    const m = { x: (g.a.x + g.b.x) / 2, z: (g.a.z + g.b.z) / 2 };
    if (vu(m, chemin, obstacles, porteurs(g.a, g.b, obstacles, 0.25)))
      garde.add(s.id);
  }
  // Une surface sans géométrie lisible n'est jugée sur rien : elle reste.
  for (const s of surfaces) if (!lisibles.includes(s)) garde.add(s.id);

  // Les meubles : vus en leur centre, ou au milieu d'un de leurs bords.
  const meublesVus = new Set<ObjectData>();
  for (const o of objets) {
    const t = o.transform;
    const c = { x: t[12], z: t[14] };
    const l = Math.hypot(t[0], t[2]) || 1;
    const ux = t[0] / l;
    const uz = t[2] / l;
    const w = Math.max(0, (o.width ?? 0) / 2 - 0.1);
    const d = Math.max(0, (o.depth ?? 0) / 2 - 0.1);
    const points = [
      c,
      { x: c.x + ux * w, z: c.z + uz * w },
      { x: c.x - ux * w, z: c.z - uz * w },
      { x: c.x - uz * d, z: c.z + ux * d },
      { x: c.x + uz * d, z: c.z - ux * d },
    ];
    if (points.some(p => vu(p, chemin, obstacles, new Set())))
      meublesVus.add(o);
  }

  const ecartes: Ecartes = {
    murs: murs.filter(({ s }) => !garde.has(s.id)).length,
    ouvertures: surfaces.filter(s => s.type !== 'wall' && !garde.has(s.id))
      .length,
    meubles: objets.length - meublesVus.size,
  };
  if (ecartes.murs + ecartes.ouvertures + ecartes.meubles === 0) return rien;
  /*
    LA PORTE QUI DONNE SUR CE QU'ON A ÉCARTÉ — revue « Amandine » : la salle
    d'eau vue par sa porte disparaît du plan (c'est voulu), mais rien ne le
    rappelait ensuite. Une porte gardée, derrière laquelle — du côté où la
    caméra n'est pas passée — des murs ont été écartés, mène à une pièce non
    relevée : on la nomme, le diagnostic la garde.
  */
  const ecartesMurs = murs.filter(({ s }) => !garde.has(s.id)).map(({ g }) => g);
  const portesVersNonReleve: string[] = [];
  for (const { s, g } of segs) {
    if ((s.type !== 'door' && s.type !== 'opening') || !garde.has(s.id)) continue;
    const L = Math.hypot(g.b.x - g.a.x, g.b.z - g.a.z);
    if (L < 0.4) continue;
    const m = { x: (g.a.x + g.b.x) / 2, z: (g.a.z + g.b.z) / 2 };
    const n = { x: -(g.b.z - g.a.z) / L, z: (g.b.x - g.a.x) / L };
    const pres = (sens: number) => {
      const p = { x: m.x + n.x * sens * 0.5, z: m.z + n.z * sens * 0.5 };
      return Math.min(...chemin.map(c => Math.hypot(c.x - p.x, c.z - p.z)));
    };
    const loin = pres(1) > pres(-1) ? 1 : -1;
    const derriere = ecartesMurs.some(w => {
      const q = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
      const devant = ((q.x - m.x) * n.x + (q.z - m.z) * n.z) * loin;
      return devant > 0.2 && Math.hypot(q.x - m.x, q.z - m.z) < 4;
    });
    if (derriere) portesVersNonReleve.push(s.id);
  }
  const surf = (l?: SurfaceData[]) => l?.filter(s => garde.has(s.id));
  const obj = (l?: ObjectData[]) => l?.filter(o => meublesVus.has(o));
  return {
    releve: {
      ...r,
      ...(portesVersNonReleve.length > 0 ? { portesVersNonReleve } : {}),
      surfaces: surf(r.surfaces),
      objects: obj(r.objects),
      rooms: r.rooms?.map(x => ({
        ...x,
        surfaces: surf(x.surfaces),
        objects: obj(x.objects),
      })),
    },
    ecartes,
  };
}

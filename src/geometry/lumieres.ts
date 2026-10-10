/**
 * LA LUMIÈRE DANS LA VISITE — on appuie sur l'interrupteur, la pièce s'éclaire.
 *
 * Relevé du patron : « donne la possibilité d'allumer les lumières depuis un
 * interrupteur, et fais une lumière plus réaliste pour chaque luminaire, en
 * fonction de leur forme et de leur usage (par exemple une lumière diffuse en
 * haut et en bas de l'applique murale proposée) ».
 *
 * La maquette savait déjà allumer : un appui sur un interrupteur posait un
 * halo dessiné par-dessus. Dans la visite, à hauteur d'œil, un halo dessiné
 * ne trompe personne. Ce sont donc de VRAIES SOURCES de lumière que la carte
 * graphique pose (voir `RoomScanVisite`), chacune à la façon de son
 * luminaire :
 *
 *   — l'APPLIQUE MURALE éclaire en haut et en bas : deux faisceaux larges qui
 *     lavent le mur au-dessus et au-dessous d'elle, comme le coin lumineux du
 *     catalogue ;
 *   — le SPOT encastré tombe en cône net vers le sol ;
 *   — l'ampoule de la DCL rayonne tout autour, sous sa douille ;
 *   — le PLAFONNIER verse une nappe large et douce ;
 *   — le VENTILATEUR éclaire sous son moteur.
 *
 * Et le diffuseur du luminaire s'allume avec lui : éteint, il est d'un blanc
 * opalin ; allumé, il rayonne.
 *
 * QUI ALLUME QUOI : les liens du plan (`commands`), ceux que la maquette et le
 * dossier lisent déjà. Un interrupteur qu'on n'a lié à rien allume la pièce où
 * il est — c'est ce que fait l'interrupteur d'une pièce dans la vraie vie, et
 * un appui qui ne ferait rien se lirait comme une panne.
 *
 * LA CARTE GRAPHIQUE NE PREND PAS TOUTES LES LAMPES À LA FOIS : au-delà de
 * huit lumières, elle ignore les autres. Les sources vont donc aux lampes
 * allumées les plus PROCHES du visiteur — cinq en tout, une applique en
 * comptant deux —, et le choix se refait quand il change de pièce. Les autres
 * gardent leur diffuseur allumé : de loin, c'est ce qu'on en voit.
 */
import type { PoseDAppareil } from './appareils3d';
import type { CeilingFixture } from './ceiling';
import {
  COMMANDES_MURALES,
  facePoint,
  faceX,
  wallFace,
  type Fixture,
} from './electrical';
import { wallQuadsOf, type Pt, type WallSeg } from './floorplan';
import type { Obstacle } from './exploration';

/** La façon d'éclairer : le code que le natif lit. */
export const GENRE = {
  appliqueMurale: 1,
  spot: 2,
  ampoule: 3,
  plafonnier: 4,
  ventilateur: 5,
} as const;
export type GenreDeLampe = (typeof GENRE)[keyof typeof GENRE];

/** Une lampe de la scène — son diffuseur et sa source. */
export interface Lampe {
  /** L'identifiant de sa POSE dans la scène (voir `appareils3d`). */
  id: string;
  /** Son rang : c'est lui qui désigne son diffuseur dans le maillage. */
  index: number;
  genre: GenreDeLampe;
  /** La pose : au nu du mur ou du plafond (m, repère de la scène). */
  x: number;
  y: number;
  z: number;
  /** La normale du mur (applique), vers la pièce. */
  nx: number;
  nz: number;
  /** Ce que coûte sa lumière : une applique fait deux faisceaux. */
  sources: number;
}

/** Les lumières que la carte graphique tient à la fois, en plus du jour. */
export const SOURCES_MAX = 5;

/** Les lampes de la scène, dans l'ordre de ses poses. */
export function lampesDeLaScene(appareils: readonly PoseDAppareil[]): Lampe[] {
  const out: Lampe[] = [];
  for (const p of appareils) {
    let genre: GenreDeLampe | null = null;
    if (p.genre === 'applique') genre = GENRE.appliqueMurale;
    else if (p.genre === 'plafond') {
      genre =
        p.plafond === 'spot'
          ? GENRE.spot
          : p.plafond === 'dcl'
          ? GENRE.ampoule
          : p.plafond === 'applique'
          ? GENRE.plafonnier
          : p.plafond === 'ventilateur'
          ? GENRE.ventilateur
          : null;
    }
    if (genre === null) continue;
    out.push({
      id: p.id,
      index: out.length,
      genre,
      x: p.x,
      y: p.y,
      z: p.z,
      nx: p.nx,
      nz: p.nz,
      sources: genre === GENRE.appliqueMurale ? 2 : 1,
    });
  }
  return out;
}

/** Le rang de chaque lampe, par l'identifiant de sa pose (`groupesDesAppareils`). */
export function rangsDesLampes(lampes: readonly Lampe[]): Map<string, number> {
  return new Map(lampes.map((l) => [l.id, l.index]));
}

/** L'identifiant de pose d'un point de plafond, comme la scène le nomme. */
export const idDePlafond = (cl: CeilingFixture) => `cl-${cl.id}`;

/**
 * CE QU'UN INTERRUPTEUR ALLUME — en identifiants de pose.
 *
 * Les liens d'abord : les points du plafond qui le nomment, les appliques qui
 * le nomment. Sans lien, la pièce où il est : ses points de plafond et ses
 * appliques.
 */
export function lampesDeLInterrupteur(
  inter: Fixture,
  fixtures: readonly Fixture[],
  ceiling: readonly CeilingFixture[],
  pieceDe: (f: Fixture) => string | undefined,
): string[] {
  const lies = [
    ...ceiling
      .filter((cl) => (cl.commands ?? []).includes(inter.id) || (inter.commands ?? []).includes(cl.id))
      .map(idDePlafond),
    ...fixtures
      .filter((f) => f.kind === 'applique' && (f.commands ?? []).includes(inter.id))
      .map((f) => f.id),
  ];
  if (lies.length > 0) return lies;
  const piece = pieceDe(inter);
  if (!piece) return [];
  return [
    ...ceiling.filter((cl) => cl.roomId === piece).map(idDePlafond),
    ...fixtures.filter((f) => f.kind === 'applique' && pieceDe(f) === piece).map((f) => f.id),
  ];
}

/** Un interrupteur tel qu'on le voit dans la visite : sa place au mur. */
export interface InterDeVisite {
  id: string;
  wallId: string;
  x: number;
  y: number;
  z: number;
}

/** Les commandes murales, chacune à sa place — deux centimètres devant le nu. */
export function interrupteursDeLaVisite(fixtures: readonly Fixture[], walls: WallSeg[]): InterDeVisite[] {
  const quads = wallQuadsOf(walls);
  const murs = new Map(walls.map((w) => [w.id, w]));
  const out: InterDeVisite[] = [];
  for (const f of fixtures) {
    if (!COMMANDES_MURALES.includes(f.kind)) continue;
    const w = murs.get(f.wallId);
    if (!w) continue;
    const face = wallFace(w, quads.get(w.id), f.side);
    const p = facePoint(face, faceX(face, f.along), 0.02);
    out.push({ id: f.id, wallId: w.id, x: p.x, y: f.height, z: p.z });
  }
  return out;
}

/** La caméra de la visite : l'œil, son lacet, son tangage, son ouverture verticale. */
export interface OeilDeVisite {
  x: number;
  y: number;
  z: number;
  lacet: number;
  tangage: number;
  /** Ouverture VERTICALE, en degrés. */
  fov: number;
}

/**
 * Un point du monde, à l'écran — la projection de la vue native : lacet 0
 * regarde les z croissants, π/2 les x croissants, le tangage lève les yeux.
 * `null` derrière l'œil.
 */
export function projeterDansLaVisite(
  oeil: OeilDeVisite,
  p: { x: number; y: number; z: number },
  ecran: { w: number; h: number },
): { x: number; y: number; profondeur: number } | null {
  const cp = Math.cos(oeil.tangage);
  const f = { x: Math.sin(oeil.lacet) * cp, y: Math.sin(oeil.tangage), z: Math.cos(oeil.lacet) * cp };
  // droite = avant × haut, haut de l'œil = droite × avant (voir la caméra native).
  let r = { x: -f.z, y: 0, z: f.x };
  const lr = Math.hypot(r.x, r.z) || 1;
  r = { x: r.x / lr, y: 0, z: r.z / lr };
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  const d = { x: p.x - oeil.x, y: p.y - oeil.y, z: p.z - oeil.z };
  const profondeur = d.x * f.x + d.y * f.y + d.z * f.z;
  if (profondeur < 0.1) return null;
  const xc = d.x * r.x + d.y * r.y + d.z * r.z;
  const yc = d.x * u.x + d.y * u.y + d.z * u.z;
  const focale = ecran.h / 2 / Math.tan(((oeil.fov / 2) * Math.PI) / 180);
  return {
    x: ecran.w / 2 + (xc / profondeur) * focale,
    y: ecran.h / 2 - (yc / profondeur) * focale,
    profondeur,
  };
}

/** Les segments [p, q] et [a, b] se croisent-ils (au sens strict) ? */
function croise(p: Pt, q: Pt, a: Pt, b: Pt): boolean {
  const o = (u: Pt, v: Pt, w: Pt) => (v.x - u.x) * (w.z - u.z) - (v.z - u.z) * (w.x - u.x);
  const d1 = o(a, b, p);
  const d2 = o(a, b, q);
  const d3 = o(p, q, a);
  const d4 = o(p, q, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Un mur s'interpose-t-il entre l'œil et ce point ? (les baies laissent voir) */
export function murEntre(oeil: Pt, cible: Pt, obstacles: readonly Obstacle[]): boolean {
  for (const o of obstacles) {
    if (o.kind !== 'mur') continue;
    if (croise(oeil, cible, o.a, o.b)) return true;
  }
  return false;
}

/** À portée de doigt autour d'un interrupteur, en points : la moitié d'un pouce, plus le dessin. */
export const RAYON_INTER = 40;
/** Au-delà, on ne vise plus un interrupteur : on regarde la pièce. */
export const PORTEE_INTER = 7;

/**
 * L'INTERRUPTEUR SOUS LE DOIGT — le plus proche du doigt, à portée, visible.
 *
 * Un mécanisme fait sept centimètres : à trois mètres, quelques points à
 * l'écran. La cible est donc plus large que le dessin, comme sur le plan ; et
 * un interrupteur derrière une cloison ne répond pas — on ne rallume pas la
 * chambre depuis le séjour au travers du mur.
 */
export function interrupteurSousLeDoigt(
  doigt: { x: number; y: number },
  oeil: OeilDeVisite,
  ecran: { w: number; h: number },
  inters: readonly InterDeVisite[],
  obstacles: readonly Obstacle[],
): string | null {
  let meilleur: string | null = null;
  let plusPres = Infinity;
  for (const it of inters) {
    const q = projeterDansLaVisite(oeil, it, ecran);
    if (!q || q.profondeur > PORTEE_INTER) continue;
    const d = Math.hypot(q.x - doigt.x, q.y - doigt.y);
    if (d > RAYON_INTER || d >= plusPres) continue;
    if (murEntre({ x: oeil.x, z: oeil.z }, { x: it.x, z: it.z }, obstacles)) continue;
    plusPres = d;
    meilleur = it.id;
  }
  return meilleur;
}

/**
 * CE QUE LE NATIF REÇOIT — neuf nombres par lampe, toutes les lampes :
 * `[rang, genre, allumée, source, x, y, z, nx, nz]`.
 *
 * `source` dit si elle a droit à une vraie lumière : les lampes allumées les
 * plus proches du visiteur, jusqu'à `SOURCES_MAX` (une applique compte deux).
 */
export function lampesPourLeNatif(
  lampes: readonly Lampe[],
  allumees: ReadonlySet<string>,
  oeil: Pt,
): number[] {
  const servies = new Set<string>();
  let budget = SOURCES_MAX;
  const proches = lampes
    .filter((l) => allumees.has(l.id))
    .sort((a, b) => Math.hypot(a.x - oeil.x, a.z - oeil.z) - Math.hypot(b.x - oeil.x, b.z - oeil.z));
  for (const l of proches) {
    if (l.sources > budget) continue;
    budget -= l.sources;
    servies.add(l.id);
  }
  const out: number[] = [];
  for (const l of lampes) {
    out.push(
      l.index,
      l.genre,
      allumees.has(l.id) ? 1 : 0,
      servies.has(l.id) ? 1 : 0,
      l.x,
      l.y,
      l.z,
      l.nx,
      l.nz,
    );
  }
  return out;
}

/**
 * UN INTERRUPTEUR BASCULE TOUT SON GROUPE ENSEMBLE — la règle de la maquette :
 * si une seule de ses lampes est allumée, l'appui allume les autres ; un
 * va-et-vient réel ne prend pas d'état bâtard.
 */
export function basculer(allumees: ReadonlySet<string>, lampes: readonly string[]): Set<string> {
  const apres = new Set(allumees);
  const toutAllume = lampes.length > 0 && lampes.every((id) => apres.has(id));
  for (const id of lampes) {
    if (toutAllume) apres.delete(id);
    else apres.add(id);
  }
  return apres;
}

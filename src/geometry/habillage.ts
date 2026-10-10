/**
 * L'HABILLAGE — les vraies images du relevé, posées sur les murs et le sol de
 * la 3D.
 *
 * Relevé du patron : « améliore considérablement la récupération des
 * textures et couleurs des sols et murs scannés ; on veut une reproduction à
 * l'identique, sur le modèle 3D, de ce que l'on scanne ».
 *
 * Le natif fabrique pendant le scan une ORTHOPHOTO de chaque face de mur — la
 * face vue de face, à deux centimètres le pixel — et une du sol vue d'en haut
 * (voir `RoomScanOrtho.swift`). Ce module :
 *
 *   — RATTACHE chaque orthophoto aux murs du plan (`habillerLesMurs`) : par
 *     sa place, comme les photos de mur — RoomPlan renumérote et réunit des
 *     murs à l'assemblage, le plan en coupe et en recolle ;
 *   — HABILLE chaque face (`habillerLaFace`) : le pan d'un mur reçoit les
 *     morceaux de son image, coupés à la tranche que chaque orthophoto
 *     couvre, avec les coordonnées d'image de chaque sommet ; le sol reçoit
 *     la sienne, à plat.
 *
 * Les coordonnées d'image : u de la gauche à la droite de celui qui regarde
 * la face, v du haut (0) vers le bas (1) — l'origine en haut à gauche, celle
 * de SceneKit.
 */
import type { Face3D, P3 } from './scene3d';
import { segLength, type Pt, type WallSeg } from './floorplan';

/** Une orthophoto de mur, telle que le natif la livre. */
export interface OrthoDeMurBrute {
  wallId: string;
  /** +1 : vue du côté de l'axe z du mur RoomPlan ; −1 : de l'autre. */
  cote: number;
  path: string;
  cx: number;
  cz: number;
  /** L'axe x du mur RoomPlan, à plat. */
  dx: number;
  dz: number;
  longueur: number;
  hauteur: number;
  yBas: number;
  couverture?: number;
}

/** L'orthophoto du sol : son image et le rectangle du monde qu'elle couvre. */
export interface OrthoDuSol {
  path: string;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  y?: number;
  couverture?: number;
}

/** Une orthophoto rattachée à une face d'un mur du plan. */
export interface OrthoDeFace {
  /** Le côté du mur du plan qu'elle habille (+1 / −1, comme `wallFace`). */
  side: 1 | -1;
  path: string;
  /** Son milieu, et la direction de la gauche vers la droite de l'image. */
  cx: number;
  cz: number;
  ux: number;
  uz: number;
  longueur: number;
}

/** Jusqu'où un mur RoomPlan peut s'écarter de l'axe d'un mur du plan (m). */
const TOLERANCE = 0.15;

/**
 * RATTACHE LES ORTHOPHOTOS AUX MURS DU PLAN — une par face, par sa place :
 * ses deux bouts sur l'axe du mur (à quinze centimètres près), au moins dix
 * centimètres en commun, et la face qui regarde celui qui la voyait.
 */
export function habillerLesMurs<W extends WallSeg>(
  walls: W[],
  brutes: readonly OrthoDeMurBrute[] | null | undefined,
): W[] {
  if (!brutes || brutes.length === 0) return walls;
  const parMur = new Map<string, OrthoDeFace[]>();
  for (const b of brutes) {
    if (!b.path || !(b.longueur > 0.2)) continue;
    const l = Math.hypot(b.dx, b.dz) || 1;
    const axe = { x: b.dx / l, z: b.dz / l };
    const a = { x: b.cx - (axe.x * b.longueur) / 2, z: b.cz - (axe.z * b.longueur) / 2 };
    const e = { x: b.cx + (axe.x * b.longueur) / 2, z: b.cz + (axe.z * b.longueur) / 2 };
    // Le côté d'où l'on voyait : l'axe z du mur RoomPlan, tourné selon `cote`.
    const s = b.cote >= 0 ? 1 : -1;
    const vers = { x: -axe.z * s, z: axe.x * s };
    for (const w of walls) {
      if (w.type !== 'wall') continue;
      const L = segLength(w);
      if (L < 0.2) continue;
      const u = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
      const ecart = (p: Pt) => Math.abs((p.x - w.a.x) * -u.z + (p.z - w.a.z) * u.x);
      if (ecart(a) > TOLERANCE || ecart(e) > TOLERANCE) continue;
      const t = (p: Pt) => (p.x - w.a.x) * u.x + (p.z - w.a.z) * u.z;
      if (Math.min(Math.max(t(a), t(e)), L) - Math.max(Math.min(t(a), t(e)), 0) < 0.1) continue;
      const side: 1 | -1 = -u.z * vers.x + u.x * vers.z >= 0 ? 1 : -1;
      const liste = parMur.get(w.id) ?? [];
      liste.push({
        side,
        path: b.path,
        cx: b.cx,
        cz: b.cz,
        // Vue du côté +z, la droite de l'image suit l'axe ; de l'autre, son contraire.
        ux: axe.x * s,
        uz: axe.z * s,
        longueur: b.longueur,
      });
      parMur.set(w.id, liste);
    }
  }
  if (parMur.size === 0) return walls;
  // Un passage de plus AJOUTE ses images à celles du passage d'avant.
  return walls.map((w) => (parMur.has(w.id) ? { ...w, orthos: [...(w.orthos ?? []), ...parMur.get(w.id)!] } : w));
}

/** u d'un point du monde dans une orthophoto de mur (0 à gauche, 1 à droite). */
export function uDe(o: OrthoDeFace, p: { x: number; z: number }): number {
  return ((p.x - o.cx) * o.ux + (p.z - o.cz) * o.uz + o.longueur / 2) / o.longueur;
}

/** Coupe un polygone plan au demi-espace f(P) ≥ 0 (Sutherland–Hodgman). */
function couper(pts: P3[], f: (p: P3) => number): P3[] {
  const out: P3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const fp = f(p);
    const fq = f(q);
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) {
      const k = fp / (fp - fq);
      out.push({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, z: p.z + (q.z - p.z) * k });
    }
  }
  return out;
}

/** Un morceau de face habillé : son contour, et l'image et le (u, v) de chaque sommet. */
export interface PieceHabillee {
  cle: string;
  pts: P3[];
  uv: [number, number][];
}

/**
 * HABILLE LE PAN D'UN MUR — la face doit être une grande face (sa normale
 * horizontale, alignée sur celle du mur), pas un chant, un dessus ou une
 * menuiserie. Plusieurs orthophotos sur la même face se partagent le mur en
 * tranches DISJOINTES, coupées au milieu de leurs recouvrements : deux images
 * au même endroit se disputeraient l'affichage au pixel.
 *
 * `y` est la hauteur au-dessus du pied du mur : v = 1 − y / hauteur.
 */
export function habillerLaFace(face: Face3D, w: WallSeg): PieceHabillee[] | null {
  const orthos = w.orthos;
  if (!orthos || orthos.length === 0 || face.pts.length < 3 || !face.normal) return null;
  const L = segLength(w);
  if (L < 0.2 || !(w.height > 0)) return null;
  const u = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
  const n = face.normal;
  if (Math.abs(n.y) > 0.2) return null;
  const alignement = n.x * -u.z + n.z * u.x;
  if (Math.abs(alignement) < 0.9) return null;
  const side: 1 | -1 = alignement > 0 ? 1 : -1;
  const siennes = orthos.filter((o) => o.side === side);
  if (siennes.length === 0) return null;
  // La tranche de chacune, le long du mur (m depuis `a`).
  const t = (p: { x: number; z: number }) => (p.x - w.a.x) * u.x + (p.z - w.a.z) * u.z;
  const tranches = siennes
    .map((o) => {
      const ta = t({ x: o.cx - (o.ux * o.longueur) / 2, z: o.cz - (o.uz * o.longueur) / 2 });
      const tb = t({ x: o.cx + (o.ux * o.longueur) / 2, z: o.cz + (o.uz * o.longueur) / 2 });
      return { o, t0: Math.min(ta, tb), t1: Math.max(ta, tb) };
    })
    .sort((a, b) => a.t0 - b.t0);
  const bornes = tranches.map((x, i) => ({
    o: x.o,
    debut: i === 0 ? -Infinity : (tranches[i - 1].t1 + x.t0) / 2,
    fin: i === tranches.length - 1 ? Infinity : (x.t1 + tranches[i + 1].t0) / 2,
  }));
  const pieces: PieceHabillee[] = [];
  for (const b of bornes) {
    let pts = face.pts;
    if (isFinite(b.debut)) pts = couper(pts, (p) => t(p) - b.debut);
    if (pts.length >= 3 && isFinite(b.fin)) pts = couper(pts, (p) => b.fin - t(p));
    if (pts.length < 3) continue;
    pieces.push({
      cle: b.o.path,
      pts,
      uv: pts.map((p) => [Math.max(0, Math.min(1, uDe(b.o, p))), Math.max(0, Math.min(1, 1 - p.y / w.height))]),
    });
  }
  return pieces.length > 0 ? pieces : null;
}

/** HABILLE UN SOL — son contour à plat, l'orthophoto du sol par ses bornes. */
export function habillerLeSol(pts: P3[], sol: OrthoDuSol | null | undefined): PieceHabillee[] | null {
  if (!sol || pts.length < 3) return null;
  const lx = sol.maxX - sol.minX;
  const lz = sol.maxZ - sol.minZ;
  if (!(lx > 0) || !(lz > 0)) return null;
  return [
    {
      cle: sol.path,
      pts,
      uv: pts.map((p) => [(p.x - sol.minX) / lx, (p.z - sol.minZ) / lz]),
    },
  ];
}

/**
 * LES TRIANGLES HABILLÉS, POUR LE NATIF — seize nombres par triangle : le rang
 * de l'image dans `textures`, puis trois sommets (x, y, z, u, v). Les
 * triangles suivent l'orientation demandée (`voulue`), comme ceux du
 * maillage teinté : leur dos n'est jamais dessiné.
 */
export class Habilleur {
  readonly textures: string[] = [];
  readonly texturees: number[] = [];
  private rang = new Map<string, number>();

  ajouter(
    pieces: PieceHabillee[],
    trianguler: (pts: P3[]) => [number, number, number][],
    orienter: (pts: P3[], tris: [number, number, number][]) => [number, number, number][],
  ) {
    for (const p of pieces) {
      let k = this.rang.get(p.cle);
      if (k === undefined) {
        k = this.textures.length;
        this.textures.push(p.cle);
        this.rang.set(p.cle, k);
      }
      const tris = orienter(p.pts, trianguler(p.pts));
      for (const tri of tris) {
        this.texturees.push(k);
        for (const i of tri) {
          const s = p.pts[i];
          this.texturees.push(s.x, s.y, s.z, p.uv[i][0], p.uv[i][1]);
        }
      }
    }
  }
}

/**
 * L'HABILLAGE — des images posées sur des faces de la 3D.
 *
 * Il portait les ORTHOPHOTOS du relevé : chaque face de mur vue de face, le
 * sol vu d'en haut, collés sur la maquette. Relevé du patron, plus tard :
 * « enlève la récupération exacte des couleurs (et donc décors des pièces)
 * car c'est jamais qualitatif ; récupère simplement la couleur majoritaire
 * d'un mur ». Le natif ne les fabrique plus, la scène ne les pose plus
 * (voir `couleurMajoritaire`).
 *
 * Restent les TYPES — un ancien plan garde ses orthophotos dans ses données —
 * et le canal vers le natif (`Habilleur`), que la maquette et la visite
 * gardent ouvert pour toute image qu'on voudrait poser un jour sur une face.
 */
import type { P3 } from './scene3d';

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

/** Un morceau de face habillé : son contour, et l'image et le (u, v) de chaque sommet. */
export interface PieceHabillee {
  cle: string;
  pts: P3[];
  uv: [number, number][];
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

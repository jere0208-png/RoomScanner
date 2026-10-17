/**
 * LES LUMINAIRES DE LA SCÈNE — et le rang de chacun dans le maillage des meubles.
 *
 * Relevé du patron : « le système de lumière est mal fait et nuit au
 * développement de l'app. Supprime la possibilité d'éclairer la pièce en
 * appuyant sur le bouton lors de la visite ». La visite n'allume plus rien :
 * plus d'interrupteur sous le doigt, plus de « Tout allumer », plus de lumière
 * envoyée au natif. La pièce garde son éclairage de base, fixe.
 *
 * Il reste ce que le maillage des meubles lit : la liste des lampes de la
 * scène, chacune avec son RANG. Le diffuseur d'une lampe forme son propre
 * groupe, marqué de ce rang (voir `groupesDesAppareils`) : c'est ce qui le
 * distingue, côté natif, de la lueur des diffuseurs de la maquette — dans la
 * visite, il reste toujours éteint, d'un blanc opalin.
 *
 * La maquette 3D et le plan 2D gardent leurs propres lampes (crépuscule,
 * halos dessinés) : elles ne passent pas par ici.
 */
import type { PoseDAppareil } from './appareils3d';

/** Le genre de luminaire. */
export const GENRE = {
  appliqueMurale: 1,
  spot: 2,
  ampoule: 3,
  plafonnier: 4,
  ventilateur: 5,
} as const;
export type GenreDeLampe = (typeof GENRE)[keyof typeof GENRE];

/** Une lampe de la scène — son diffuseur, toujours éteint dans la visite. */
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
}

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
          : p.plafond === 'led' && (p.trace?.length ?? 0) >= 2
          ? GENRE.plafonnier
          : null;
    }
    if (genre === null) continue;
    // Le ruban se place au milieu de son tracé, pas à son départ.
    const tr = p.plafond === 'led' ? p.trace ?? [] : [];
    const milieu = tr.length
      ? { x: tr.reduce((t, q) => t + q.x, 0) / tr.length, z: tr.reduce((t, q) => t + q.z, 0) / tr.length }
      : { x: 0, z: 0 };
    out.push({
      id: p.id,
      index: out.length,
      genre,
      x: p.x + milieu.x,
      y: p.y,
      z: p.z + milieu.z,
      nx: p.nx,
      nz: p.nz,
    });
  }
  return out;
}

/** Le rang de chaque lampe, par l'identifiant de sa pose (`groupesDesAppareils`). */
export function rangsDesLampes(lampes: readonly Lampe[]): Map<string, number> {
  return new Map(lampes.map((l) => [l.id, l.index]));
}

/**
 * L'appartement de référence du garde-fou visuel.
 *
 * Volontairement complet et petit : deux pièces séparées par un refend, une
 * porte fermée, une porte ouverte, une baie libre, une fenêtre, et trois
 * meubles dont une télé plaquée au mur. Chacun de ces éléments a déjà cassé
 * une fois — ils doivent tous figurer sur la planche.
 */
import type { ObjectData } from 'react-native-room-scan';
import type { Fixture } from '../geometry/electrical';
import {
  detectRooms,
  mergeColinear,
  splitAtJunctions,
  weldCorners,
  type WallSeg,
} from '../geometry/floorplan';

const wall = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  height = 2.5,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height,
  yCenter: height / 2,
});

const hole = (
  id: string,
  type: 'door' | 'window' | 'opening',
  ax: number,
  az: number,
  bx: number,
  bz: number,
  height: number,
  yCenter: number,
  open?: boolean,
): WallSeg => ({ id, type, a: { x: ax, z: az }, b: { x: bx, z: bz }, height, yCenter, open });

const object = (
  id: string,
  category: string,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  y: number,
): ObjectData => ({
  id,
  category,
  width: w,
  height: h,
  depth: d,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
});

/** Enveloppe d'un seul tenant + refend : la topologie que RoomPlan livre. */
const RAW: WallSeg[] = [
  wall('n', 0, 0, 7, 0),
  wall('e', 7, 0, 7, 3),
  wall('s', 7, 3, 0, 3),
  wall('w', 0, 3, 0, 0),
  wall('refend', 4, 0.05, 4, 2.95),
];

export const SNAPSHOT_WALLS = mergeColinear(splitAtJunctions(weldCorners(RAW)));

export const SNAPSHOT_ROOMS = detectRooms(SNAPSHOT_WALLS).map((r, i) => ({
  id: `room-${i + 1}`,
  wallIds: r.wallIds,
}));

export const SNAPSHOT_OPENINGS: WallSeg[] = [
  // Porte fermée sur le mur ouest : un bloc plein, en retrait.
  hole('porte', 'door', 0, 1, 0, 1.9, 2.05, 1.025),
  // Porte ouverte dans le refend : un vide bleu pointillé.
  hole('passage', 'door', 4, 1, 4, 1.9, 2.05, 1.025, true),
  // Baie libre au nord : idem.
  hole('baie', 'opening', 5, 0, 6.2, 0, 2.1, 1.05, true),
  // Fenêtre à l'est, avec allège.
  hole('fenetre', 'window', 7, 1, 7, 2.2, 1.1, 1.45),
];

/**
 * Appareillage électrique : une prise et un interrupteur, sur les deux faces
 * du refend. C'est le cas qui casse — deux petits volumes dos à dos, à 14 cm
 * l'un de l'autre, dont un seul doit se voir depuis chaque pièce.
 */
export const SNAPSHOT_FIXTURES: Fixture[] = [
  {
    id: 'prise-sejour',
    kind: 'prise',
    wallId: SNAPSHOT_WALLS.find((w) => w.id.startsWith('refend'))?.id ?? 'refend',
    along: 2.2,
    height: 0.25,
    side: 1,
  },
  {
    id: 'inter-cuisine',
    kind: 'inter',
    wallId: SNAPSHOT_WALLS.find((w) => w.id.startsWith('refend'))?.id ?? 'refend',
    along: 2.2,
    height: 1.1,
    side: -1,
  },
  /**
   * UN DE CHAQUE FAMILLE DE SYMBOLE.
   *
   * Le jeu ne portait qu'une prise et un interrupteur : tout le reste du
   * catalogue — prise double, spécialisées 20 et 32 A, communication —
   * n'était couvert par aucune planche. On a pu redessiner leurs symboles
   * sans qu'une seule référence bouge, ce qui revient à ne pas les avoir
   * vérifiés du tout. Ils figurent donc ici, sur le mur nord.
   */
  ...(
    [
      ['pc2', 'prise2', 1.0],
      ['pc20', 'prise20', 1.6],
      ['pc32', 'prise32', 2.2],
      ['rj', 'rj45', 2.8],
      ['tv-prise', 'tv', 3.4],
    ] as const
  ).map(([id, kind, along]) => ({
    id,
    kind,
    wallId: SNAPSHOT_WALLS.find((w) => w.id === 'n')?.id ?? 'n',
    along,
    height: 0.25,
    side: 1 as const,
  })),
];

export const SNAPSHOT_OBJECTS: ObjectData[] = [
  object('canape', 'sofa', 2, 2.2, 1.8, 0.9, 0.8, 0.4),
  // Télé plaquée au mur nord, centre DERRIÈRE le nu : elle doit ressortir.
  object('tv', 'television', 2, -0.02, 1.2, 0.08, 0.7, 1.3),
  object('frigo', 'refrigerator', 6.4, 0.5, 0.7, 0.7, 1.8, 0.9),
];

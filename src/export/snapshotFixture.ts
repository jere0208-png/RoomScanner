/**
 * L'appartement de référence du garde-fou visuel.
 *
 * Volontairement complet et petit : deux pièces séparées par un refend, une
 * porte fermée, une porte ouverte, une baie libre, une fenêtre, et trois
 * meubles dont une télé plaquée au mur. Chacun de ces éléments a déjà cassé
 * une fois — ils doivent tous figurer sur la planche.
 */
import type { ObjectData } from 'react-native-room-scan';
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

export const SNAPSHOT_OBJECTS: ObjectData[] = [
  object('canape', 'sofa', 2, 2.2, 1.8, 0.9, 0.8, 0.4),
  // Télé plaquée au mur nord, centre DERRIÈRE le nu : elle doit ressortir.
  object('tv', 'television', 2, -0.02, 1.2, 0.08, 0.7, 1.3),
  object('frigo', 'refrigerator', 6.4, 0.5, 0.7, 0.7, 1.8, 0.9),
];

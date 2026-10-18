/**
 * LES MEUBLES RESTENT OÙ LE SCAN LES A VUS — diagnostic du patron, sa
 * cuisine : « frigo encastré dans un recoin en placo ; voir le plan après,
 * rien n'est comme sur le scan, les meubles hauts de cuisine pas contre les
 * murs ». RoomPlan les posait juste ; c'est le recadrage contre les murs
 * (`clampFootprint`) qui les déplaçait :
 *   — le côté d'un mur se lisait au centre de la pièce : vu de lui, le recoin
 *     du frigo est « derrière » la cloison du recoin, et le frigo en sortait ;
 *   — un meuble qui touche juste le bout d'un retour de mur était repoussé
 *     par ce retour, de 35 à 60 cm ;
 *   — l'épaisseur DEVINÉE de la cloison, vue d'un seul côté, prenait 14 cm
 *     dans le recoin.
 * La géométrie est celle du relevé, redressée et arrondie au centimètre.
 */
import type { ObjectData } from 'react-native-room-scan';
import { clampFootprint, facesDesMurs, roomParts, toFootprint, type WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number, o: Partial<WallSeg> = {}): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.48,
  yCenter: 1.24,
  ...o,
});
// Le contour de la pièce, murs relevés d'un côté (leur trait est leur face).
const MURS: WallSeg[] = [
  mur('sud', 2.75, 1.03, -1.23, 1.03),
  mur('fenetre', -1.23, 1.03, -1.23, -2.25),
  mur('nord', -1.23, -2.25, 1.71, -2.25),
  mur('biais', 1.71, -2.25, 2.76, -1.44),
  // Le recoin du frigo : 70 cm de large, 66 de profondeur.
  mur('recoin-fond', 2.76, -1.44, 3.46, -1.44),
  mur('recoin-droit', 3.46, -1.44, 3.46, -0.79),
  // La cloison placo du recoin, un retour vu depuis la cuisine seulement.
  mur('recoin-cloison', 2.76, -1.44, 2.76, -0.78, { vu: { x: -1, z: 0 } }),
  mur('fond-retour', 3.46, -0.79, 4.39, -0.79),
  mur('fond', 4.39, -0.79, 4.39, 0.44),
  mur('fond-coin', 4.39, 0.44, 4.05, 0.44),
  mur('fond-coin-2', 4.05, 0.44, 4.05, 1.03),
  mur('sud-cuisine', 4.05, 1.03, 2.75, 1.03),
  // Un retour de cloison qui part du mur sud.
  mur('retour-sud', 2.75, 0.42, 2.75, 1.03),
];
const ROOMS = [{ id: 'room-1', wallIds: MURS.map((w) => w.id) }];

/** Un meuble de RoomPlan : son centre, sa largeur le long de x (yaw 0) ou de z (yaw 90°). */
const meuble = (id: string, category: string, cx: number, cz: number, w: number, d: number, yaw: number, base = 0, h = 0.9): ObjectData =>
  ({
    id,
    category,
    width: w,
    depth: d,
    height: h,
    roomId: 'room-1',
    transform: [Math.cos(yaw), 0, Math.sin(yaw), 0, 0, 1, 0, 0, -Math.sin(yaw), 0, Math.cos(yaw), 0, cx, base + h / 2, cz, 1],
  }) as ObjectData;

const QUART = Math.PI / 2;
const MEUBLES = [
  meuble('frigo', 'refrigerator', 3.11, -1.11, 0.66, 0.67, 0, 0, 1.98),
  meuble('haut-fond', 'storage', 4.19, -0.175, 1.23, 0.4, QUART, 1.69, 0.46),
  meuble('lave-linge', 'washerDryer', 4.07, -0.49, 0.61, 0.65, QUART, 0, 0.92),
  meuble('bas-fond', 'storage', 4.07, 0.11, 0.66, 0.64, QUART, 0, 0.94),
  meuble('haut-sud', 'storage', 3.4, 0.84, 1.29, 0.38, 0, 1.36, 0.83),
];

describe('les meubles de la cuisine restent où le scan les a vus', () => {
  const part = roomParts(MURS, ROOMS)[0];
  const faces = facesDesMurs(MURS);
  for (const o of MEUBLES) {
    it(`${o.id} : à moins de 2 cm de sa place`, () => {
      const avant = toFootprint(o);
      const apres = clampFootprint(avant, part.walls, part.labelAt, undefined, undefined, faces, part.surface!.pts);
      expect(Math.hypot(apres.cx - avant.cx, apres.cz - avant.cz)).toBeLessThan(0.02);
      // Et sans être raboté.
      expect(apres.width).toBeCloseTo(avant.width, 2);
      expect(apres.depth).toBeCloseTo(avant.depth, 2);
    });
  }

  it('un meuble enfoncé dans un mur en ressort toujours, du côté de la pièce', () => {
    // Un meuble bas relevé 20 cm dans le mur sud : il revient contre lui.
    const o = meuble('enfonce', 'storage', 0.5, 1.03 - 0.3 + 0.2, 1.0, 0.6, 0);
    const f = clampFootprint(toFootprint(o), part.walls, part.labelAt, undefined, undefined, faces, part.surface!.pts);
    expect(f.cz + f.depth / 2).toBeCloseTo(1.03, 2);
    // Une télé à cheval sur le mur de la fenêtre, son centre au-delà du trait : ramenée dedans.
    const tv = meuble('tv', 'television', -1.25, -0.5, 1.2, 0.08, QUART, 1.0, 0.7);
    const g = clampFootprint(toFootprint(tv), part.walls, part.labelAt, undefined, undefined, faces, part.surface!.pts);
    expect(g.cx - g.depth / 2).toBeGreaterThanOrEqual(-1.23 - 1e-6);
  });
});

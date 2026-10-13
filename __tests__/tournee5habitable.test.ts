/**
 * TOURNÉE N°5 — L'HABITABLE ET LE PLAFOND, AU PLUS JUSTE.
 *
 * - « Léon » (chambre de bonne de 9 m² sous les toits) : le bas du rampant
 *   mal vu sortait l'habitable à 8,33 m² au lieu de 6,22 ; la fiche donnait
 *   un plafond plus haut que la jambette ; le diagnostic proposait de
 *   « corriger » la jambette ; le PDF et la fiche ne donnaient pas les mêmes
 *   murs à peindre.
 * - « Malik » : une mezzanine sous un plafond partout à 2,40 m restait
 *   « à vérifier » ; la chambre de 2,40 m comptait 2,60 au métré ; les murs à
 *   peindre de l'open space comptaient la cloison de 2,60 sur 5 m.
 * - « Gérard », « Bérénice » : le cellier intérieur sortait de l'habitable.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { VolumeReleve } from 'react-native-room-scan';
import { plafondDeLaPiece, type PlafondDeLaPiece } from '../src/geometry/fichePiece';
import { surfacesHabitables } from '../src/geometry/habitable';
import { hauteurDeLaPiece, hauteurLue, roomParts, type WallSeg } from '../src/geometry/floorplan';
import { mursNetsDe } from '../src/geometry/travaux';
import { checkPlan } from '../src/geometry/diagnostics';

const mur = (id: string, ax: number, az: number, bx: number, bz: number, height = 2.55): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height,
  yCenter: height / 2,
});
// La chambre de bonne : 3,60 × 2,50, la jambette de 1,10 m le long de la façade (z = 0).
const CHAMBRE = [mur('f', 0, 0, 3.6, 0, 1.1), mur('e', 3.6, 0, 3.6, 2.5), mur('c', 3.6, 2.5, 0, 2.5), mur('o', 0, 2.5, 0, 0)];
const CONTOUR = [
  { x: 0, z: 0 },
  { x: 3.6, z: 0 },
  { x: 3.6, z: 2.5 },
  { x: 0, z: 2.5 },
];
/** Le plafond : de 1,10 m au pied de la façade à 2,55 m à 1,60 m de lui ; le bas de pente non vu. */
function volume(nonVu: number): VolumeReleve {
  const pas = 0.1;
  const cols = 36;
  const rows = 25;
  const plafond: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const z = (r + 0.5) * pas;
      const h = Math.min(2.55, 1.1 + ((2.55 - 1.1) / 1.6) * z);
      plafond.push(z < nonVu ? 0 : Math.round(h * 100));
    }
  }
  return { sol: 0, pas, minX: 0, minZ: 0, cols, rows, plafond };
}
const VRAIE = 3.6 * (2.5 - 0.7 / ((2.55 - 1.1) / 1.6));

describe('le bas du rampant, déduit de sa pente', () => {
  it('l’habitable revient à la vérité (6,22 m²) quand le bas de pente n’a pas été vu', () => {
    const sans = plafondDeLaPiece(volume(0.6), CONTOUR, 9)!;
    const avec = plafondDeLaPiece(volume(0.6), CONTOUR, 9, CHAMBRE)!;
    // Sans la jambette : la part debout comptée sur les seuls carreaux vus.
    expect(sans.surfaceHabitable! / VRAIE).toBeGreaterThan(1.15);
    expect(Math.abs(avec.surfaceHabitable! - VRAIE) / VRAIE).toBeLessThan(0.03);
    expect(avec.estime).toBeGreaterThan(0.2);
  });

  it('le plafond le plus bas ne passe pas au-dessus de la jambette', () => {
    const p = plafondDeLaPiece(volume(0.6), CONTOUR, 9, CHAMBRE)!;
    expect(p.hMin).toBeLessThanOrEqual(1.1);
    expect(p.rampant).toBe(true);
  });

  it('un plafond plat ne déduit rien, même avec un muret bas', () => {
    const plat: VolumeReleve = { ...volume(0), plafond: volume(0).plafond.map((h, i) => (i < 100 ? 0 : 240)) };
    const p = plafondDeLaPiece(plat, CONTOUR, 9, [...CHAMBRE.slice(1), mur('gc', 0, 0, 3.6, 0, 1.05)])!;
    expect(p.estime).toBeUndefined();
    expect(p.hMin).toBe(2.4);
  });
});

const parts = roomParts(CHAMBRE, [{ id: 'r', wallIds: CHAMBRE.map((w) => w.id) }]);
const plafond = (p: Partial<PlafondDeLaPiece>): PlafondDeLaPiece => ({
  hMin: 2.4,
  hMax: 2.42,
  hMoy: 2.41,
  couverture: 0.5,
  rampant: true,
  surfaceHabitable: 8,
  solAuReleve: 9,
  ...p,
});

describe('l’habitable', () => {
  it('sous un plafond partout au-dessus de 1,80 m, tout compte, sans « à vérifier »', () => {
    const h = surfacesHabitables([{ id: 'r', name: 'Mezzanine', releve: { plafond: plafond({}) } }], parts);
    expect(h.aVerifier).toBe(0);
    expect(h.pieces[0].habitable).toBe(h.pieces[0].sol);
  });

  it('le cellier intérieur compte ; le garage, non', () => {
    expect(surfacesHabitables([{ id: 'r', name: 'Cellier' }], parts).pieces[0].habitable).toBeGreaterThan(0);
    expect(surfacesHabitables([{ id: 'r', name: 'Garage' }], parts).pieces[0].habitable).toBe(0);
  });
});

describe('les hauteurs et les murs à peindre', () => {
  it('chaque mur se peint à sa hauteur : la jambette de 1,10 m ne compte pas 2,55', () => {
    expect(mursNetsDe(CONTOUR, 2.55, [], CHAMBRE)).toBeCloseTo(3.6 * 1.1 + (2.5 + 3.6 + 2.5) * 2.55, 6);
  });

  it('un plafond plat bien vu donne sa hauteur à la pièce ; un rampant, non', () => {
    expect(hauteurLue(plafond({ rampant: false, couverture: 0.95 }))).toBe(2.41);
    expect(hauteurLue(plafond({ rampant: true, couverture: 0.95 }))).toBeUndefined();
    const lue = roomParts(CHAMBRE, [
      { id: 'r', wallIds: CHAMBRE.map((w) => w.id), releve: { plafond: plafond({ rampant: false, couverture: 0.95 }) } } as never,
    ]);
    expect(hauteurDeLaPiece(lue[0])).toBe(2.41);
  });

  it('le diagnostic ne propose pas de corriger la jambette d’un rampant reconnu', () => {
    const rooms = [{ id: 'r', wallIds: CHAMBRE.map((w) => w.id), releve: { plafond: plafond({ hMin: 1.1, hMax: 2.55 }) } }];
    expect(checkPlan(CHAMBRE, rooms as never).some((i) => i.kind === 'hauteur')).toBe(false);
  });
});

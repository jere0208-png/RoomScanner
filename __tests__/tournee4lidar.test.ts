/**
 * TOURNÉE N°4 — LE PLAFOND MAL VU, LES REPÈRES DE LA MAISON.
 *
 * - « Sébastien » : sous un rampant vu à 40 %, l'habitable sortait 14,9 %
 *   trop haute ; vu à 25 %, tout le sol comptait (+38,6 %) alors que la
 *   fiche connaissait une hauteur de 1,13 m.
 * - « Mehdi » : à l'étage, « C1 » désignait les prises sur le plan et la
 *   plaque au tableau.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { surfacesHabitables } from '../src/geometry/habitable';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import type { PlafondDeLaPiece } from '../src/geometry/fichePiece';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.6, yCenter: 1.3,
});
const parts = roomParts(
  [mur('n', 0, 0, 5, 0), mur('e', 5, 0, 5, 6), mur('s', 5, 6, 0, 6), mur('o', 0, 6, 0, 0)],
  [{ id: 'r', wallIds: ['n', 'e', 's', 'o'] }],
);
const plafond = (p: Partial<PlafondDeLaPiece>): PlafondDeLaPiece => ({
  hMin: 1.0,
  hMax: 2.6,
  hMoy: 1.9,
  couverture: 0.9,
  rampant: true,
  surfaceHabitable: 22.5,
  solAuReleve: 30,
  ...p,
});
const hab = (p: PlafondDeLaPiece) =>
  surfacesHabitables([{ id: 'r', name: 'Chambre', releve: { plafond: p } }], parts);

describe('un plafond mal vu', () => {
  it('bien vu (90 %), le chiffre tient', () => {
    expect(hab(plafond({})).aVerifier).toBe(0);
  });

  it('vu à 40 %, le rampant est dit à vérifier', () => {
    const h = hab(plafond({ couverture: 0.4 }));
    expect(h.aVerifier).toBe(1);
    expect(h.pieces[0].raison).toMatch(/plafond vu à 40 %, à vérifier/);
  });

  it('vu à 25 % avec une hauteur de 1,13 m : à vérifier, pas « tout le sol » sans un mot', () => {
    const h = hab(plafond({ couverture: 0.25, rampant: false, surfaceHabitable: null, hMin: 1.13 }));
    expect(h.aVerifier).toBe(1);
    expect(h.pieces[0].raison).toMatch(/plafond trop peu vu/);
  });
});

describe('les repères d’une maison à étages', () => {
  it('le plan lit les circuits de toute la maison', () => {
    const ecran = readFileSync(join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'), 'utf8');
    const bloc = ecran.slice(ecran.indexOf('const circuitsDuPlan = useMemo'), ecran.indexOf('const marks = useMemo'));
    expect(bloc).toContain('circuitsDuLogement(tout.walls, tout.rooms, tout.fixtures, tout.ceiling)');
  });
});

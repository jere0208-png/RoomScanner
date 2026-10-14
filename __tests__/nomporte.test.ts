/**
 * LA PORTE NOMMÉE PAR LES DEUX PIÈCES QU'ELLE SÉPARE — revue « Nadia » :
 * toutes s'appelaient « la porte du salon ».
 */
import { nomDeLaPorte } from '../src/geometry/passage';
import type { WallSeg } from '../src/geometry/floorplan';

const carre = (x0: number, x1: number) => [
  { x: x0, z: 0 },
  { x: x1, z: 0 },
  { x: x1, z: 3 },
  { x: x0, z: 3 },
];
const parts = [
  { roomId: 's', surface: { pts: carre(0, 4) } },
  { roomId: 'c', surface: { pts: carre(4, 7) } },
];
const rooms = [
  { id: 's', name: 'Séjour' },
  { id: 'c', name: 'Chambre' },
];
const porte = (x: number, z0: number, z1: number): WallSeg =>
  ({ id: 'p', type: 'door', a: { x, z: z0 }, b: { x, z: z1 }, height: 2.04, yCenter: 1.02 }) as WallSeg;

describe('le nom d’une porte', () => {
  it('entre deux pièces : les deux', () => {
    expect(nomDeLaPorte(porte(4, 1, 1.8), rooms, parts)).toBe('la porte entre la chambre et le séjour');
  });
  it('sur la façade : la pièce qu’elle dessert', () => {
    expect(nomDeLaPorte(porte(0, 1, 1.8), rooms, parts)).toBe('la porte du séjour');
  });
  it('sans contours : la pièce qui la porte, comme avant', () => {
    expect(nomDeLaPorte({ ...porte(4, 1, 1.8), roomId: 'c' }, rooms)).toBe('la porte de la chambre');
  });
});

import { pointMarks } from '../src/geometry/schema';

describe('le repère des points du plafond (revue « Nadia »)', () => {
  it('un circuit d’éclairage repère aussi ses points lumineux', () => {
    const m = pointMarks([
      { id: 'c1', fixtureIds: ['p'], ceilingIds: [] },
      { id: 'c2', fixtureIds: ['i'], ceilingIds: ['l1', 'l2'] },
    ] as never);
    expect([m.get('p'), m.get('i'), m.get('l1'), m.get('l2')]).toEqual(['C1', 'C2', 'C2', 'C2']);
  });
});

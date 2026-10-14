/**
 * LA VIGNETTE D'UN PLAN À DEUX NIVEAUX — revue « Hugo » : elle superposait
 * le rez-de-chaussée et l'étage (« ChambreChambre 2 »).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Line, Text as SvgText } from 'react-native-svg';
import { PlanThumb } from '../src/screens/LibraryScreen';
import { light as lightPalette } from '../src/theme';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number, niveau?: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25,
  ...(niveau !== undefined ? { niveau } : {}),
});
const carre = (p: string, niveau?: number) => [
  mur(`${p}n`, 0, 0, 4, 0, niveau),
  mur(`${p}e`, 4, 0, 4, 3, niveau),
  mur(`${p}s`, 4, 3, 0, 3, niveau),
  mur(`${p}o`, 0, 3, 0, 0, niveau),
];

it('montre le rez-de-chaussée seul, et dit « 2 niveaux »', () => {
  const scan = {
    id: 's', name: 'Coloc', createdAt: 0, updatedAt: 0, modelPath: null,
    walls: [...carre('r'), ...carre('e', 1)],
    openings: [], objects: [], fixtures: [],
    rooms: [
      { id: 'r1', name: 'Chambre', wallIds: ['rn', 're', 'rs', 'ro'] },
      { id: 'e1', name: 'Chambre 2', wallIds: ['en', 'ee', 'es', 'eo'], niveau: 1 },
    ],
  };
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<PlanThumb scan={scan as never} c={lightPalette} />);
  });
  const textes = t.root.findAllByType(SvgText).map((n) => [n.props.children].flat().join(''));
  expect(textes).toContain('2 niveaux');
  expect(textes).toContain('Chambre');
  expect(textes).not.toContain('Chambre 2');
  expect(t.root.findAllByType(Line)).toHaveLength(4);
  act(() => t.unmount());
});

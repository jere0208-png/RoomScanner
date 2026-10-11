/**
 * LA VISITE COMMENCE OÙ L'ON VEUT.
 *
 * Correctif de l'audit « dans la peau d'un utilisateur » : dans la visite, on
 * ne choisissait pas la pièce de départ — on entrait toujours au cœur de la
 * plus grande. Une rangée de pièces, en haut de l'écran, y emmène d'un
 * appui : on commence par la chambre qu'on veut meubler, et l'on passe à la
 * cuisine sans traverser tout le logement au pouce.
 */
jest.mock('react-native-room-scan', () => ({
  RoomScan: { isSupported: jest.fn(async () => true), viewModel: jest.fn(async () => false) },
  scanEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  laserEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  RoomScanView: 'RoomScanView',
  RoomScanCanvas: 'RoomScanCanvas',
  RoomScanVisite: 'RoomScanVisite',
  poserCameraDeVisite: jest.fn(() => true),
  poserOrbiteDeMaquette: jest.fn(() => true),
  poserLeveeDeMaquette: jest.fn(() => true),
  poserLampesDeVisite: jest.fn(() => true),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Exploration } from '../src/components/Exploration';
import { pointDeDepart } from '../src/geometry/exploration';
import { detectRooms, type WallSeg } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});
// Un séjour de 6 × 4 (le plus grand), une chambre de 3 × 4 à côté.
const MURS = [
  mur('n1', 0, 0, 6, 0),
  mur('n2', 6, 0, 9, 0),
  mur('e', 9, 0, 9, 4),
  mur('s2', 9, 4, 6, 4),
  mur('s1', 6, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
  mur('c', 6, 0, 6, 4),
];
const formes = detectRooms(MURS);
const ROOMS = formes.map((r, i) => {
  const xs = r.outline.map((p) => p.x);
  const grand = Math.max(...xs) - Math.min(...xs) > 4;
  return { id: `p${i}`, name: grand ? 'Séjour' : 'Chambre', wallIds: r.wallIds, floor: null };
});
const chambre = ROOMS.find((r) => r.name === 'Chambre')!;

describe('le point de départ', () => {
  it('au cœur de la plus grande pièce, sans choix', () => {
    const d = pointDeDepart(MURS, ROOMS as never, [])!;
    expect(d.at.x).toBeLessThan(6);
  });

  it('dans la pièce demandée, quand on la choisit', () => {
    const d = pointDeDepart(MURS, ROOMS as never, [], undefined, chambre.id)!;
    expect(d.at.x).toBeGreaterThan(6);
    expect(d.at.x).toBeLessThan(9);
  });
});

describe('dans la visite', () => {
  it('une rangée de pièces y emmène d’un appui', () => {
    act(() => {
      useScanStore.setState({
        walls: MURS,
        openings: [],
        objects: [],
        rooms: ROOMS as never,
        fixtures: [],
        ceiling: [],
        niveauCourant: 0,
      } as never);
    });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<Exploration visible onClose={() => {}} />);
    });
    act(() => {
      jest.advanceTimersByTime(50);
    });
    const camera = () => t.root.findAll((n) => n.type === ('RoomScanVisite' as never))[0].props.camera as number[];
    // On entre dans le séjour, le plus grand.
    expect(camera()[0]).toBeLessThan(6);
    const aller = t.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Aller dans : Chambre' && typeof n.props?.onPress === 'function',
    )[0];
    expect(aller).toBeDefined();
    act(() => aller.props.onPress());
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(camera()[0]).toBeGreaterThan(6);
    expect(camera()[0]).toBeLessThan(9);
    act(() => t.unmount());
  });
});

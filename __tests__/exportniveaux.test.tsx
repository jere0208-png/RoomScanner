/**
 * L'ÉCRAN D'EXPORT SORT TOUS LES NIVEAUX D'UN COUP.
 *
 * Correctif de l'audit : une maison à étage partait en deux PDF. Dès que le
 * plan a plusieurs niveaux, « Tous les niveaux » est coché : le dossier les
 * porte tous, le courant en tête des feuilles électriques. Décoché, on
 * retrouve le dossier de l'étage affiché, nommé d'après lui.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Switch, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ExportScreen } from '../src/screens/ExportScreen';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';
import { detectRooms, type WallSeg } from '../src/geometry/floorplan';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let n = 0;
const mur = (niveau: number, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id: `m${n++}`,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  ...(niveau ? { niveau } : {}),
});
const rdc = [mur(0, 0, 0, 6, 0), mur(0, 6, 0, 6, 5), mur(0, 6, 5, 0, 5), mur(0, 0, 5, 0, 0)];
const etage = [mur(1, 0, 0, 4, 0), mur(1, 4, 0, 4, 3), mur(1, 4, 3, 0, 3), mur(1, 0, 3, 0, 0)];
const rooms = [
  { id: 'sejour', name: 'Séjour', wallIds: detectRooms(rdc)[0].wallIds },
  { id: 'chambre', name: 'Chambre', wallIds: detectRooms(etage)[0].wallIds, niveau: 1 },
];

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  useUsage.setState({ modeElec: true });
});

/** Monte l'export, laisse le dossier se bâtir, et rend le dernier appel. */
function dossier(avant?: (t: TestRenderer.ReactTestRenderer) => void) {
  const pdf = require('../src/export/pdf');
  // L'écran bâtit son dossier par `chantierDuDossier` (feuille par feuille, sans
  // figer) : mêmes trois premiers arguments que `buildScanPdf`.
  const espion = jest.spyOn(pdf, 'chantierDuDossier');
  espion.mockClear();
  act(() => {
    useScanStore.setState({
      screen: 'export',
      scanName: 'Maison Martin',
      walls: [...rdc, ...etage],
      openings: [],
      objects: [],
      rooms,
      fixtures: [],
      ceiling: [],
      photos: [],
      niveauCourant: 0,
    } as never);
    arbre = TestRenderer.create(<ExportScreen />);
  });
  act(() => {
    for (const v of arbre!.root.findAllByType(View)) {
      if (typeof v.props.onLayout === 'function') {
        v.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
      }
    }
  });
  if (avant) avant(arbre!);
  act(() => {
    jest.advanceTimersByTime(1200);
  });
  const appels = espion.mock.calls;
  espion.mockRestore();
  const [scan, , opts] = appels[appels.length - 1] as [
    { name: string },
    boolean,
    { niveaux?: { nom: string; courant?: boolean; scan: { walls: unknown[] } }[]; achats?: { pieces: { nom: string }[] } | null },
  ];
  return { scan, opts };
}

describe('tous les niveaux', () => {
  it('sont dans le dossier dès qu’il y en a plusieurs', () => {
    const { scan, opts } = dossier();
    expect(scan.name).toBe('Maison Martin');
    expect(opts.niveaux?.map((x) => x.nom)).toEqual(['Rez-de-chaussée', '1er étage']);
    expect(opts.niveaux?.find((x) => x.courant)?.nom).toBe('Rez-de-chaussée');
    expect(opts.niveaux?.map((x) => x.scan.walls.length)).toEqual([4, 4]);
  });

  it('et les achats du particulier comptent tout le logement, chaque pièce avec son niveau', () => {
    useUsage.setState({ modeElec: false });
    const { opts } = dossier();
    expect(opts.achats?.pieces.map((p) => p.nom)).toEqual(['Rez-de-chaussée · Séjour', '1er étage · Chambre']);
  });

  it('décoché, on retrouve le dossier de l’étage affiché', () => {
    const { scan, opts } = dossier((t) => {
      const sw = t.root.findAll((x) => x.type === Switch && x.props.accessibilityLabel === 'Tous les niveaux')[0];
      expect(sw.props.value).toBe(true);
      act(() => sw.props.onValueChange(false));
    });
    expect(opts.niveaux).toBeUndefined();
    expect(scan.name).toBe('Maison Martin — Rez-de-chaussée');
  });
});

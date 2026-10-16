/**
 * « À SAVOIR AVANT LE PRIX », UNE FOIS — revue « Gérard », électricien.
 *
 * L'électricien qui rouvre son devis dix fois dans la journée relisait dix
 * fois la même page avant son prix. Lue une fois (mémorisé sur l'appareil),
 * on arrive sur le prix ; la page reste au fil des étapes.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { DevisScreen } from '../src/screens/DevisScreen';
import type { WallSeg } from '../src/geometry/floorplan';
import { GAMMES } from '../src/geometry/prix';
import { usePremieresFois } from '../src/store/premieresFois';
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
  roomId: 'r1',
});

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function ouvrir() {
  act(() => {
    useScanStore.setState({
      walls: [mur('n', 0, 0, 5, 0), mur('e', 5, 0, 5, 4), mur('s', 5, 4, 0, 4), mur('o', 0, 4, 0, 0)],
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
      fixtures: [{ id: 'p1', kind: 'prise', wallId: 'n', along: 1, height: 0.25, side: 1 }],
      ceiling: [],
      screen: 'devis',
      gammeDevis: GAMMES[0].id,
      devisEcartes: [],
      devisQuantites: {},
      devisAjouts: [],
      devisPrix: {},
      etapeDevis: 0,
    } as never);
    arbre = TestRenderer.create(<DevisScreen />);
  });
  return arbre!;
}

it('la première fois, la page « À savoir » ; passée, elle est retenue', () => {
  usePremieresFois.setState({ charge: true, vues: [] });
  const t = ouvrir();
  expect(useScanStore.getState().etapeDevis).toBe(0);
  const voir = t.root
    .findAll((n) => typeof n.props?.onPress === 'function' && String(n.props?.accessibilityLabel ?? '').startsWith('Voir le prix'))
    .pop()!;
  act(() => voir.props.onPress());
  expect(usePremieresFois.getState().vues).toContain('devisASavoir');
});

it('les fois suivantes, le devis s’ouvre sur le prix', () => {
  usePremieresFois.setState({ charge: true, vues: ['devisASavoir'] });
  ouvrir();
  expect(useScanStore.getState().etapeDevis).toBe(1);
});

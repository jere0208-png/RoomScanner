/**
 * LE DEVIS SE TROUVE AUSSI DANS L'EXPORT — revue « Gérard », électricien.
 *
 * Le devis ne s'ouvrait que par la pastille du prix, sur le plan. Celui qui
 * vient envoyer ses documents le cherche dans l'export : en mode
 * électricité, une entrée « Devis » y ouvre la page du devis et son export
 * (pas un second PDF).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ExportScreen } from '../src/screens/ExportScreen';
import { useAccountStore } from '../src/store/accountStore';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

beforeAll(() => jest.useFakeTimers());
afterAll(() => {
  jest.useRealTimers();
  useUsage.setState({ charge: true, modeElec: true, choisi: true });
});

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function monter(modeElec: boolean) {
  useUsage.setState({ charge: true, modeElec, choisi: true });
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      screen: 'export',
      scanName: 'Chantier test',
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: `Pièce ${i + 1}`, floor: null })),
      fixtures: SNAPSHOT_FIXTURES,
      ceiling: [],
      photos: [],
    });
    t = TestRenderer.create(<ExportScreen />);
  });
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
      }
    }
  });
  act(() => jest.advanceTimersByTime(400));
  arbre = t;
  return t;
}

const entreeDevis = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => n.props.accessibilityLabel === 'Devis' && typeof n.props.onPress === 'function').pop();

it('en mode électricité, « Devis » ouvre la page du devis', () => {
  useAccountStore.setState({ pro: true } as never);
  const t = monter(true);
  const b = entreeDevis(t);
  expect(b).toBeDefined();
  act(() => b!.props.onPress());
  expect(useScanStore.getState().screen).toBe('devis');
});

it('hors mode électricité, pas d’entrée « Devis »', () => {
  const t = monter(false);
  expect(entreeDevis(t)).toBeUndefined();
});

/**
 * « À REGARDER AVANT D'ENVOYER » SUR L'ÉCRAN D'EXPORT — peaufinage EXPORTS.
 * Ce que le dossier imprimerait mal se dit au-dessus du bouton, avec le geste
 * qui le corrige : revenir au plan, ou renseigner le client (sans exporter).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ExportScreen } from '../src/screens/ExportScreen';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';
import { SNAPSHOT_OBJECTS, SNAPSHOT_OPENINGS, SNAPSHOT_ROOMS, SNAPSHOT_WALLS } from '../src/export/snapshotFixture';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function monter(nomme: boolean, client = '', address = '') {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useUsage.setState({ modeElec: true } as never);
    useScanStore.setState({
      screen: 'export',
      scanName: 'Chantier test',
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({ ...r, name: nomme ? `Séjour ${String.fromCharCode(65 + i)}` : `Pièce ${i + 1}`, floor: null })),
      fixtures: [],
      ceiling: [],
      photos: [],
      client,
      address,
    });
    t = TestRenderer.create(<ExportScreen />);
  });
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
    }
  });
  act(() => {
    jest.advanceTimersByTime(400);
  });
  arbre = t;
  return t;
}

const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Text).map((n) => [].concat(n.props.children).join('')).join(' | ');

it('dit les pièces sans nom et le client vide, et mène au plan', () => {
  const t = monter(false);
  expect(t.root.findAll((n) => n.props.testID === 'avant-envoi').length).toBeGreaterThan(0);
  const vus = textes(t);
  expect(vus).toMatch(/À regarder avant d’envoyer/);
  expect(vus).toMatch(/n’ont pas de nom/);
  expect(vus).toMatch(/Le client n’est pas renseigné/);
  const auPlan = t.root.findAll(
    (n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Corriger sur le plan') && typeof n.props.onPress === 'function',
  )[0];
  act(() => auPlan.props.onPress());
  expect(useScanStore.getState().screen).toBe('result');
});

it('se tait quand il n’y a rien à redire', () => {
  const t = monter(true, 'Mme Martin', '12 rue Pasteur');
  expect(t.root.findAll((n) => n.props.testID === 'avant-envoi')).toHaveLength(0);
});

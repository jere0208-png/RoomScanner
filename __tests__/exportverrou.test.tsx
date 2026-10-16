/**
 * UN SEUL DOSSIER À LA FOIS — revue I5.
 *
 * Deux appuis rapprochés sur « Exporter le PDF » fabriquaient deux
 * documents et ouvraient deux feuilles de partage, sans aucun retour à
 * l'écran entre les deux. Le verrou tient tant que le partage n'est pas
 * revenu ; le bouton dit « Préparation… », éteint ; il se libère ensuite,
 * même quand le partage échoue.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { RoomScan } from 'react-native-room-scan';
import { ExportScreen } from '../src/screens/ExportScreen';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { useAlerte } from '../src/ui/alerte';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

const partager = RoomScan.sharePDF as unknown as jest.Mock;
const apercu = RoomScan.apercuPdf as unknown as jest.Mock;

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  act(() => useAccountStore.setState({ compte: null, pro: false }));
  act(() => useAlerte.setState({ courante: null, file: [] } as never));
});

const monter = () => {
  apercu.mockReset();
  apercu.mockImplementation(async () => ['IMG0']);
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useAccountStore.setState({ compte: { id: 'u1', methode: 'apple' }, pro: true } as never);
    useScanStore.getState().setClientInfo('Mme Durand', '12 rue des Lilas');
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
      north: 0,
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
  arbre = t;
  return t;
};
const avancer = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};
const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAll(
    (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
    { deep: false },
  )[0];
const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '')))
    .join(' | ');

it('deux appuis : un seul dossier, un seul partage, et « Préparation… » entre-temps', async () => {
  const t = monter();
  await avancer(800);
  let rendre: () => void = () => undefined;
  partager.mockReset();
  partager.mockImplementation(
    () =>
      new Promise<void>((r) => {
        rendre = r;
      }),
  );
  const b = bouton(t, 'Exporter le PDF');
  act(() => {
    b.props.onPress();
    b.props.onPress();
  });
  await avancer(50);
  act(() => {
    b.props.onPress();
  });
  await avancer(50);
  expect(partager).toHaveBeenCalledTimes(1);
  expect(textes(t)).toMatch(/Préparation…/);
  const occupe = bouton(t, 'Préparation du PDF');
  expect(occupe.props.disabled).toBe(true);
  expect(t.root.findAll((n) => n.props.testID === 'export-preparation').length).toBeGreaterThan(0);
  await act(async () => {
    rendre();
    await Promise.resolve();
    await Promise.resolve();
  });
  // Libéré : un nouvel appui repart.
  act(() => {
    bouton(t, 'Exporter le PDF').props.onPress();
  });
  await avancer(50);
  expect(partager).toHaveBeenCalledTimes(2);
  await act(async () => {
    rendre();
    await Promise.resolve();
  });
});

it('un partage qui échoue libère quand même le bouton', async () => {
  const t = monter();
  await avancer(800);
  partager.mockReset();
  partager.mockImplementation(() => Promise.reject(new Error('annulé')));
  act(() => {
    bouton(t, 'Exporter le PDF').props.onPress();
  });
  await avancer(50);
  expect(partager).toHaveBeenCalledTimes(1);
  expect(bouton(t, 'Exporter le PDF')).toBeDefined();
  expect(bouton(t, 'Exporter le PDF').props.disabled).toBe(false);
  act(() => useAlerte.setState({ courante: null, file: [] } as never));
});

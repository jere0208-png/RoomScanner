/**
 * LA PROPOSITION DU MODE ÉLECTRICITÉ, POUR UN PARTICULIER — revue « Gérard »
 * (puis retirée du menu : voir plus bas).
 *
 * Dans le menu du plan, « Placer prises et interrupteurs » promettait
 * « normes NF C 15-100 et devis » à un particulier, et un appui changeait
 * toute l'application d'un coup. Hors mode électricité : un libellé sans
 * sigle de norme, et une confirmation avant d'activer.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ResultScreen } from '../src/screens/ResultScreen';
import { useAlerte } from '../src/ui/alerte';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';
import {
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

const texte = (n: TestRenderer.ReactTestInstance) =>
  [n.props.children].flat().filter((x: unknown) => typeof x === 'string').join('');

function ouvrirLeMenu() {
  useUsage.setState({ charge: true, modeElec: false, choisi: true });
  useAlerte.setState({ courante: null, file: [] });
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      screen: 'result',
      scanName: 'Appartement',
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: `Pièce ${i + 1}`, floor: null })),
      fixtures: [],
      ceiling: [],
      photos: [],
    });
    t = TestRenderer.create(<ResultScreen />);
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
  const plus = t.root.findAllByType(TouchableOpacity).find((n) => n.props.accessibilityLabel === 'Plus')!;
  act(() => plus.props.onPress());
  act(() => jest.advanceTimersByTime(400));
  return t;
}

/*
  MIS À JOUR — revue des « découvreurs » (six testeurs sur huit) :
  l'électricité s'imposait aux non-électriciens, jusque dans le menu du plan.
  La proposition a quitté le menu : le mode s'active au profil, rubrique
  « Mon usage » (voir `modeelectricite.test.tsx`). Ce qui reste vrai : le
  menu d'un particulier ne lui parle pas de norme.
*/
it('le menu d’un particulier ne propose plus le mode, et ne parle pas de norme', () => {
  const t = ouvrirLeMenu();
  const mots = t.root.findAllByType(Text).map(texte);
  expect(mots).toContain('Liste d’achats');
  expect(mots).not.toContain('Placer prises et interrupteurs');
  expect(mots.join(' ')).not.toMatch(/NF C|15-100|norme/i);
  // Rien n'a basculé en ouvrant le menu.
  expect(useUsage.getState().modeElec).toBe(false);
});

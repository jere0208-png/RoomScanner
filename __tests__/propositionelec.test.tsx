/**
 * LA PROPOSITION DU MODE ÉLECTRICITÉ, POUR UN PARTICULIER — revue « Gérard ».
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

it('le libellé ne parle pas de norme à un particulier', () => {
  const t = ouvrirLeMenu();
  const titre = t.root.findAllByType(Text).find((n) => texte(n) === 'Placer prises et interrupteurs');
  expect(titre).toBeDefined();
  const ligne = titre!.parent!.parent!;
  const mots = ligne.findAllByType(Text).map(texte).join(' ');
  // L'aide de la ligne est bien lue, et elle dit ce que ça fait.
  expect(mots).toContain('éclairage');
  expect(mots).not.toMatch(/NF C|15-100|norme/i);
});

it('un appui demande confirmation ; « Activer » allume le mode', () => {
  const t = ouvrirLeMenu();
  const titre = t.root.findAllByType(Text).find((n) => texte(n) === 'Placer prises et interrupteurs')!;
  let ligne: TestRenderer.ReactTestInstance | null = titre;
  while (ligne && typeof ligne.props.onPress !== 'function') ligne = ligne.parent;
  act(() => ligne!.props.onPress());
  act(() => jest.advanceTimersByTime(1000));
  // Rien n'a basculé tout seul.
  expect(useUsage.getState().modeElec).toBe(false);
  const question = useAlerte.getState().courante;
  expect(question?.titre).toBe('Passer en mode Électricité ?');
  act(() => question!.actions!.find((a) => a.label === 'Activer')!.onPress!());
  expect(useUsage.getState().modeElec).toBe(true);
});

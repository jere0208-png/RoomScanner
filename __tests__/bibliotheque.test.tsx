/**
 * LA BIBLIOTHÈQUE — l'écran qui garde les relevés, et qui n'avait aucun test.
 *
 * Mille lignes, et pas une épreuve : c'est pourtant lui qui liste, ouvre,
 * range et SUPPRIME les scans. Un défaut de suppression y coûte le relevé
 * d'une visite entière, et personne ne s'en aperçoit avant le lendemain.
 *
 * On vérifie donc les quatre gestes qui engagent un dossier : il apparaît, il
 * s'ouvre, il ne se supprime pas d'un doigt qui glisse, et il se supprime pour
 * de bon quand on confirme.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { LibraryScreen } from '../src/screens/LibraryScreen';
import { useScanStore, type SavedScan } from '../src/store/scanStore';
import { SNAPSHOT_WALLS } from '../src/export/snapshotFixture';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

/** Deux dossiers dans la bibliothèque, comme après deux visites. */
const scan = (id: string, name: string, quand: number): SavedScan => ({
  id,
  name,
  createdAt: quand,
  updatedAt: quand,
  modelPath: '',
  rooms: [{ id: 'r1', name: 'Salon', floor: null }],
  walls: SNAPSHOT_WALLS,
  openings: [],
  objects: [],
  fixtures: [],
  photos: [],
  ceiling: [],
});

const textes = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map((n) => String(n.props.children));

const boutonQuiDit = (tree: TestRenderer.ReactTestRenderer, mot: string) =>
  tree.root
    .findAllByType(TouchableOpacity)
    .find((n) =>
      n
        .findAllByType(Text)
        .some((t) => String(t.props.children).includes(mot)),
    );

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      screen: 'library',
      saves: [scan('a', 'Chantier Dupont', 2_000), scan('b', 'Chantier Martin', 1_000)],
      currentSaveId: null,
    });
    tree = TestRenderer.create(<LibraryScreen />);
  });
  arbre = tree;
  return tree;
};

describe('la bibliothèque des relevés', () => {
  it('montre les dossiers enregistrés, le plus récent d’abord', () => {
    const tree = monter();
    const vus = textes(tree);
    expect(vus).toContain('Chantier Dupont');
    expect(vus).toContain('Chantier Martin');
    expect(vus.indexOf('Chantier Dupont')).toBeLessThan(
      vus.indexOf('Chantier Martin'),
    );
  });

  it('ouvre un relevé et bascule sur son plan', () => {
    const tree = monter();
    const ligne = boutonQuiDit(tree, 'Chantier Martin');
    expect(ligne).toBeDefined();
    act(() => ligne!.props.onPress());
    const st = useScanStore.getState();
    expect(st.currentSaveId).toBe('b');
    expect(st.screen).toBe('result');
    // Et le plan chargé est bien le sien.
    expect(st.walls.length).toBe(SNAPSHOT_WALLS.length);
  });

  it('ne supprime jamais au premier appui', () => {
    const tree = monter();
    // La croix arme la suppression ; elle ne l'exécute pas.
    const croix = tree.root
      .findAllByType(TouchableOpacity)
      .filter((n) => n.props.hitSlop?.left === 6);
    expect(croix.length).toBeGreaterThan(0);
    act(() => croix[0].props.onPress());
    expect(useScanStore.getState().saves).toHaveLength(2);
    // Le bouton dit maintenant ce qu'il va faire.
    expect(textes(tree)).toContain('Supprimer');
  });

  it('supprime au second appui, et seulement celui-là', () => {
    const tree = monter();
    const croix = tree.root
      .findAllByType(TouchableOpacity)
      .filter((n) => n.props.hitSlop?.left === 6);
    act(() => croix[0].props.onPress());
    const arme = boutonQuiDit(tree, 'Supprimer');
    expect(arme).toBeDefined();
    act(() => arme!.props.onPress());
    const restants = useScanStore.getState().saves;
    expect(restants).toHaveLength(1);
    // C'est le bon qui est parti : l'autre relevé est intact.
    expect(restants[0].name).toBe('Chantier Martin');
  });
});

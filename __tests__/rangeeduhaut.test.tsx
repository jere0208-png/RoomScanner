/**
 * LA RANGÉE DU HAUT TIENT DANS SA CARTE — et le prix du devis s'y lit.
 *
 * Relevé du patron, capture à l'appui : « le prix du devis sort encore de
 * son bloc ». La rangée se resserrait sur une ESTIMATION de ses largeurs ;
 * sur son téléphone, déjà serrée (« Visite »), elle dépassait encore la
 * carte de onze points, et « Devis 1,4 k€ » passait sous le bord. Elle se
 * mesure maintenant, et se resserre d'un cran tant qu'elle déborde.
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
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function monter() {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useUsage.setState({ modeElec: true });
    useScanStore.setState({
      screen: 'result',
      scanName: 'Chantier',
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: `Pièce ${i + 1}`, floor: null })),
      fixtures: SNAPSHOT_FIXTURES,
      ceiling: [],
      photos: [],
      notes: [],
    });
    t = TestRenderer.create(<ResultScreen />);
  });
  arbre = t;
  return t;
}

/** La rangée du haut : la vue qui porte la pastille « Explorer ». */
const rangee = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(View)
    .filter((n) => typeof n.props.onLayout === 'function')
    .find((n) =>
      n.findAllByType(TouchableOpacity).some((b) => b.props.accessibilityLabel === 'Explorer'),
    )!;
const explorer = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(TouchableOpacity).find((b) => b.props.accessibilityLabel === 'Explorer')!;
const motsDe = (n: TestRenderer.ReactTestInstance) =>
  n.findAllByType(Text).map((x) => [].concat(x.props.children).join(''));

describe('la rangée du haut', () => {
  it('garde ses mots quand elle tient', () => {
    const t = monter();
    act(() => rangee(t).props.onLayout({ nativeEvent: { layout: { width: 300, height: 34 } } }));
    expect(motsDe(explorer(t))).toContain('Explorer');
  });

  it('se resserre d’un cran à chaque débordement mesuré, le prix restant entier', () => {
    const t = monter();
    const deborde = () =>
      act(() => rangee(t).props.onLayout({ nativeEvent: { layout: { width: 5000, height: 34 } } }));
    deborde();
    deborde();
    // Deuxième cran : « Explorer » se dit « Visite ».
    expect(motsDe(explorer(t))).toContain('Visite');
    deborde();
    deborde();
    // Dernier cran : l'icône seule.
    expect(motsDe(explorer(t))).toEqual([]);
    // Et pas plus loin : la rangée ne boucle pas.
    deborde();
    expect(motsDe(explorer(t))).toEqual([]);
    // Le prix, lui, reste écrit en entier.
    const prix = t.root
      .findAllByType(TouchableOpacity)
      .find((b) => String(b.props.accessibilityLabel ?? '').startsWith('Devis'));
    expect(prix).toBeDefined();
    expect(motsDe(prix!).join('')).toMatch(/^Devis \d/);
  });
});

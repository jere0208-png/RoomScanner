/**
 * OÙ SE LANCE LA PRÉSENTATION — et où elle ne se lance PAS.
 *
 * Ce bouton a fait trois voyages : au pied de l'écran d'export à côté du
 * bouton PDF, puis sur l'écran du scan, puis enfin sous l'aperçu du plan,
 * dans l'écran d'export — sa place, demandée deux fois. Un réglage
 * d'ergonomie qu'on redemande est un réglage qu'un test doit tenir, sinon
 * il repart au premier remaniement.
 *
 * On vérifie donc les deux moitiés de la consigne : présent sous l'image
 * dans l'export, absent de l'écran du scan.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ExportScreen } from '../src/screens/ExportScreen';
import { ResultScreen } from '../src/screens/ResultScreen';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
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

function monter(quoi: 'export' | 'scan') {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      screen: quoi === 'export' ? 'export' : 'result',
      scanName: 'Chantier test',
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({
        id: r.id,
        name: `Pièce ${i + 1}`,
        floor: null,
      })),
      fixtures: SNAPSHOT_FIXTURES,
      ceiling: [],
      photos: [],
    });
    tree =
      quoi === 'export'
        ? TestRenderer.create(<ExportScreen />)
        : TestRenderer.create(<ResultScreen />);
  });
  act(() => {
    for (const n of tree.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({
          nativeEvent: { layout: { width: 390, height: 520 } },
        });
      }
    }
  });
  arbre = tree;
  return tree;
}

const textes = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .join(' | ');

describe('la présentation animée', () => {
  it('se lance depuis l’écran d’export, sous l’aperçu', () => {
    const tree = monter('export');
    const bouton = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Présentation animée');
    expect(bouton).toBeDefined();
    expect(textes(tree)).toContain('Présentation animée');
  });

  /**
   * ET ELLE PORTE SON IMAGE, comme chaque feuille du dossier.
   *
   * Un pictogramme dit « ça se lance » ; il ne dit pas ce qui se lance.
   * La vignette montre le logement en volume — ce que la présentation
   * anime — et se reconnaît avant qu'on ait lu le titre.
   */
  it('porte une vignette du logement, et non un simple pictogramme', () => {
    const tree = monter('export');
    const bouton = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Présentation animée');
    expect(bouton!.findAllByType(Iso3DView).length).toBe(1);
    // La vignette ne se manipule pas : le doigt lance la présentation.
    const cadre = bouton!
      .findAllByType(View)
      .find((n) => n.props.pointerEvents === 'none');
    expect(cadre).toBeDefined();
    expect(cadre!.findAllByType(Iso3DView).length).toBe(1);
  });

  it('ne s’affiche plus sur l’écran du scan', () => {
    const tree = monter('scan');
    expect(textes(tree)).not.toContain('Présentation');
    expect(
      tree.root
        .findAllByType(TouchableOpacity)
        .some((n) => n.props.accessibilityLabel === 'Présentation'),
    ).toBe(false);
    // Le pied de page garde ce qui relève du scan.
    expect(textes(tree)).toContain('Nouveau scan');
  });

  /**
   * ET LA VISITE INTÉRIEURE N'EXISTE PLUS.
   *
   * Elle promettait de se tenir dans le modèle ; à l'usage, elle butait
   * trop souvent pour servir sur un chantier. Un mode qu'on n'ose pas
   * montrer à un client vaut moins que pas de mode du tout.
   */
  it('et l’écran du scan ne propose plus de visite intérieure', () => {
    const tree = monter('scan');
    const vu = textes(tree);
    expect(vu).not.toContain('Visite');
    expect(vu).not.toContain('Modèle AR');
  });
});

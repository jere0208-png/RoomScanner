/**
 * APPUYER À CÔTÉ, C'EST LÂCHER — quoi qu'on tienne.
 *
 * Le fond du plan ne se montait que pour un meuble : un appareil de plafond
 * en réglage, lui, ne se lâchait qu'en le retouchant lui-même, et le bandeau
 * de cotes restait accroché en bas de l'écran. Deux gestes contraires pour
 * la même intention, sur le même plan.
 *
 * On vérifie ici la règle, pas le pixel : le fond existe dès que quelque
 * chose est sélectionné, et il relâche TOUT.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { Rect } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';

import type { CeilingFixture } from '../src/geometry/ceiling';
import type { WallSeg } from '../src/geometry/floorplan';

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

const W: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];
const PLAFOND: CeilingFixture[] = [
  { id: 'pl1', kind: 'dcl', roomId: 'r1', at: { x: 2.5, z: 2 } },
];

interface Appels {
  mur: (string | null)[];
  meuble: (string | null)[];
  plafond: (string | null)[];
  piece: (string | null)[];
}

function rendu(opts: { editable: boolean; plafondSel: string | null }) {
  const appels: Appels = { mur: [], meuble: [], plafond: [], piece: [] };
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: W,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
      fixtures: [],
      ceiling: PLAFOND,
      photos: [],
    });
    tree = TestRenderer.create(
      <FloorplanEditor
        showMeasures
        editable={opts.editable}
        selectedWallId={null}
        onSelectWall={(id) => appels.mur.push(id)}
        onSelectObject={(id) => appels.meuble.push(id)}
        onSelectRoom={(id) => appels.piece.push(id)}
        ceiling={PLAFOND}
        showCeiling
        selectedCeilingId={opts.plafondSel}
        onSelectCeiling={(id) => appels.plafond.push(id)}
      />,
    );
  });
  act(() => {
    const zone = tree.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({
      nativeEvent: { layout: { width: 600, height: 480 } },
    });
  });
  return { tree, appels };
}

/** Le fond : le rectangle transparent posé sous tout le dessin. */
const fond = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Rect)
    .find(
      (n) =>
        n.props.fill === 'transparent' &&
        n.props.x === 0 &&
        n.props.y === 0 &&
        typeof n.props.onPress === 'function',
    );

describe('l’appui dans le vide', () => {
  it('relâche l’appareil de plafond en réglage', () => {
    const { tree, appels } = rendu({ editable: false, plafondSel: 'pl1' });
    const zone = fond(tree);
    expect(zone).toBeDefined();
    act(() => zone!.props.onPress());
    expect(appels.plafond).toEqual([null]);
  });

  it('et relâche tout le reste du même geste', () => {
    const { tree, appels } = rendu({ editable: true, plafondSel: null });
    act(() => fond(tree)!.props.onPress());
    expect(appels.mur).toEqual([null]);
    expect(appels.meuble).toEqual([null]);
    expect(appels.piece).toEqual([null]);
    expect(appels.plafond).toEqual([null]);
  });

  it('mais hors édition, sans rien de pris, le fond n’intercepte rien', () => {
    // Un plan qu'on lit doit se laisser lire : pas de surface tactile
    // par-dessus qui avalerait un appui destiné à un appareil.
    const { tree } = rendu({ editable: false, plafondSel: null });
    expect(fond(tree)).toBeUndefined();
  });
});

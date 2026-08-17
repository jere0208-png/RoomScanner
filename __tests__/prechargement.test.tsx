/**
 * LE MODÈLE SE BÂTIT UNE FOIS, PAS À CHAQUE PIÈCE.
 *
 * La présentation change de pièce à chaque étape, et chaque changement
 * refaisait le modèle : murs extrudés, mobilier, appareillage. Une centaine
 * de millisecondes de calcul, pile au moment où la caméra part — un à-coup
 * par étape, toujours au même endroit, celui qu'on remarque. Le rideau de
 * préparation ne réglait que le premier.
 *
 * Les modèles sont désormais bâtis d'avance, derrière ce rideau, et rangés
 * par pièce. Cette épreuve compte les appels réels au constructeur de
 * scène : c'est la seule façon honnête de vérifier qu'un calcul n'a PAS
 * lieu.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import * as scene3d from '../src/geometry/scene3d';
import { Iso3DView, DEFAULT_VIEW3D } from '../src/components/Iso3DView';
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
  jest.restoreAllMocks();
});

/** Deux pièces du relevé de référence : de quoi changer de focus. */
const PIECES = SNAPSHOT_ROOMS.slice(0, 2).map((r) => r.id);

function monter(focus: string | null, prebuild?: (string | null)[]) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
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
      showFurniture: true,
    });
    tree = TestRenderer.create(
      <Iso3DView
        value={DEFAULT_VIEW3D}
        onChange={() => {}}
        showMeasures={false}
        light
        focusRoomId={focus}
        prebuildRooms={prebuild}
      />,
    );
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

describe('le préchargement du modèle', () => {
  it('bâtit d’avance les pièces annoncées', () => {
    const espion = jest.spyOn(scene3d, 'buildScene');
    monter(PIECES[0], [PIECES[0], PIECES[1]]);
    // Les deux pièces sont bâties, et la première n'est pas bâtie deux fois.
    const appels = espion.mock.calls.length;
    expect(`${appels} construction(s)`).toBe('2 construction(s)');
  });

  it('et ne rebâtit rien en changeant de pièce', () => {
    const espion = jest.spyOn(scene3d, 'buildScene');
    const tree = monter(PIECES[0], [PIECES[0], PIECES[1]]);
    const apresPreparation = espion.mock.calls.length;
    // La présentation passe à la pièce suivante : le modèle est déjà là.
    act(() => {
      tree.update(
        <Iso3DView
          value={DEFAULT_VIEW3D}
          onChange={() => {}}
          showMeasures={false}
          light
          focusRoomId={PIECES[1]}
          prebuildRooms={[PIECES[0], PIECES[1]]}
        />,
      );
    });
    expect(
      `${espion.mock.calls.length - apresPreparation} construction(s) de plus`,
    ).toBe('0 construction(s) de plus');
  });

  it('mais rebâtit quand le plan change, sinon il mentirait', () => {
    const espion = jest.spyOn(scene3d, 'buildScene');
    monter(PIECES[0], [PIECES[0]]);
    const avant = espion.mock.calls.length;
    act(() => {
      // Un mur déplacé : tout ce qui était rangé est périmé.
      useScanStore.setState({
        walls: SNAPSHOT_WALLS.map((w, i) =>
          i === 0 ? { ...w, b: { x: w.b.x + 0.5, z: w.b.z } } : w,
        ),
      });
    });
    expect(espion.mock.calls.length).toBeGreaterThan(avant);
  });
});

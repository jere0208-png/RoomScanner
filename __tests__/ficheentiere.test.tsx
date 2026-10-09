/**
 * LA PAGE DU MUR TIENT DANS L'ÉCRAN, BARRE D'ACCUEIL COMPRISE.
 *
 * Relevé du patron, capture à l'appui : « ce menu dépasse de l'écran
 * verticalement ». Sur la capture, la fiche d'un interrupteur dans une salle
 * de bains — un mur de trente-trois centimètres de large pour deux mètres
 * cinquante de haut — descendait sous le bord bas du téléphone, et le bouton
 * « Enregistrer » était coupé en deux par la barre d'accueil.
 *
 * La fiche estimait alors sa propre hauteur, la mesurait, et rabotait son
 * dessin de ce qui dépassait : trois nombres à tenir d'accord, et l'un des
 * trois finissait toujours par se tromper.
 *
 * LA PAGE ENTIÈRE SUPPRIME LA QUESTION. L'établi est devenu une page : son
 * en-tête porte « Enregistrer » sous l'encoche, son dock s'arrête au-dessus
 * de la barre d'accueil, et le mur prend ce qui reste (`flex: 1`) — il n'a
 * plus de hauteur à calculer, donc plus de hauteur à se tromper. Ce banc
 * tient ces trois promesses sur le pire mur qui soit.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    viewModel: jest.fn(async () => false),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  laserEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  RoomScanView: 'RoomScanView',
}));

import React from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { WallElevation } from '../src/components/WallElevation';
import { useScanStore } from '../src/store/scanStore';
import type { Fixture } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** La salle de bains de la capture — et son mur de trente-trois centimètres. */
const MURS: WallSeg[] = [
  mur('n', 0, 0, 0.33, 0),
  mur('e', 0.33, 0, 0.33, 2),
  mur('s', 0.33, 2, 0, 2),
  mur('o', 0, 2, 0, 0),
];

const INTER: Fixture = {
  id: 'i1',
  kind: 'inter',
  wallId: 'n',
  along: 0.1,
  height: 1.1,
  side: 1,
};

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (selectedId: string | null = 'i1') => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Salle de bains', floor: null }] as never,
      fixtures: [INTER],
      ceiling: [],
      photos: [],
    });
    t = TestRenderer.create(
      <WallElevation wallId="n" selectedId={selectedId} onSelect={() => {}} onClose={() => {}} />,
    );
  });
  arbre = t;
  return t;
};

const style = (n: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, unknown>;

/**
 * Les marges du téléphone, telles que le banc les rend (voir `jest.setup.js`).
 * Lues au module simulé, pas par un crochet hors composant.
 */
const marges: { top: number; bottom: number } = jest
  .requireMock<{ useSafeAreaInsets: () => { top: number; bottom: number } }>('react-native-safe-area-context')
  .useSafeAreaInsets();

describe('la page du mur tient dans l’écran', () => {
  it('le banc a bien une encoche et une barre d’accueil', () => {
    // Sans elles, les épreuves suivantes passeraient sans rien prouver.
    expect(marges.top).toBeGreaterThan(0);
    expect(marges.bottom).toBeGreaterThan(0);
  });

  it('elle prend tout l’écran, et descend sous l’encoche', () => {
    const t = monter();
    const page = t.root.findAllByType(View)[0];
    expect(style(page).flex).toBe(1);
    expect(style(page).paddingTop as number).toBeGreaterThanOrEqual(marges.top);
  });

  it('« Enregistrer » est EN HAUT : aucune forme de mur ne peut plus le pousser dehors', () => {
    const t = monter();
    const garder = t.root.find(
      (n) => n.props.accessibilityLabel === 'Enregistrer et fermer' && typeof n.props.onPress === 'function',
    );
    const toutes = t.root.findAllByType(View);
    const iGarder = toutes.findIndex((v) => v === garder || v.findAll((x) => x === garder).length > 0);
    const iMur = toutes.findIndex((v) => typeof v.props.onLayout === 'function');
    // L'en-tête vient avant le mur dans l'arbre : il est au-dessus de lui.
    expect(iGarder).toBeGreaterThanOrEqual(0);
    expect(iMur).toBeGreaterThan(iGarder);
  });

  it('le mur prend ce qui reste : aucune hauteur écrite à la main', () => {
    const t = monter();
    const cadre = t.root.findAllByType(View).find((v) => typeof v.props.onLayout === 'function')!;
    expect(style(cadre).flex).toBe(1);
    expect(style(cadre).height).toBeUndefined();
  });

  it('le dock s’arrête au-dessus de la barre d’accueil, appareil tenu ou non', () => {
    for (const sel of ['i1', null]) {
      const t = monter(sel);
      const dock = t.root
        .findAllByType(View)
        .filter((v) => (style(v).paddingBottom as number) >= marges.bottom)
        .pop();
      expect(dock).toBeDefined();
      act(() => t.unmount());
      arbre = null;
    }
  });
});

/**
 * LE MENU D'UN MUR RESTE ATTEIGNABLE.
 *
 * Relevé du patron, juste après la refonte des bandeaux : « les boutons lors
 * d'un clic sur un mur pour le modifier, qui s'affichent à côté du mur, sont
 * incliquables ».
 *
 * La cause n'est pas dans le menu, elle est dans ce qui est passé DEVANT.
 * Le bandeau du bas a doublé de hauteur en passant à deux parties — le texte
 * au-dessus, les boutons en dessous —, et il se peint APRÈS le plan : un
 * menu posé bas sur l'écran se retrouve dessous, visible et sourd. Le doigt
 * touche la carte blanche, pas le bouton.
 *
 * Le menu ne connaît pas le bandeau et n'a pas à le connaître : c'est
 * l'écran qui sait ce qu'il pose en bas. Il transmet donc au plan la hauteur
 * RÉSERVÉE, et la barre d'actions du mur s'arrête au-dessus — comme elle
 * s'arrête déjà au bord de l'écran.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor, WALL_MENU } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
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

/** Une pièce large : son mur sud tombe tout en bas de l'écran. */
const MURS: WallSeg[] = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 4),
  mur('s', 6, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];

const HAUTEUR = 520;
/** Ce que l'écran pose en bas : la rangée d'outils et le bandeau du mur. */
const RESERVE = 200;

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function plan(reserveBas: number) {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
      fixtures: [],
      ceiling: [],
      photos: [],
      showFurniture: true,
    });
    t = TestRenderer.create(
      <FloorplanEditor
        editable
        showMeasures={false}
        selectedWallId="s"
        onSelectWall={() => {}}
        onWallAction={() => {}}
        reserveBas={reserveBas}
      />,
    );
  });
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({
          nativeEvent: { layout: { width: 390, height: HAUTEUR } },
        });
      }
    }
  });
  arbre = t;
  return t;
}

/** La barre d'actions du mur : le bloc qui porte « Élec », « Percer »… */
const barre = (t: TestRenderer.ReactTestRenderer) => {
  const n = t.root
    .findAllByType(View)
    .map((x) => ({
      x,
      st: StyleSheet.flatten(x.props.style) as Record<string, unknown>,
    }))
    .find(
      (x) =>
        x.st?.position === 'absolute' &&
        x.st?.flexDirection === 'row' &&
        typeof x.st?.left === 'number' &&
        typeof x.st?.top === 'number' &&
        x.x.findAll((y) => typeof y.props?.accessibilityLabel === 'string')
          .length >= 3,
    );
  return n ? { left: n.st.left as number, top: n.st.top as number } : null;
};

describe('la barre d’actions d’un mur du bas', () => {
  it('se pose au-dessus de ce que l’écran réserve en bas', () => {
    const p = barre(plan(RESERVE))!;
    expect(p).not.toBeNull();
    // Son bord bas doit rester au-dessus de la zone réservée.
    expect(p.top + WALL_MENU.h).toBeLessThanOrEqual(HAUTEUR - RESERVE);
  });

  it('et reprend toute la hauteur quand rien n’est posé en bas', () => {
    // Sans réserve, la règle d'origine tient : elle s'arrête au bord.
    const p = barre(plan(0))!;
    expect(p.top + WALL_MENU.h).toBeLessThanOrEqual(HAUTEUR);
  });
});

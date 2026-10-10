/**
 * LE MUR NE SE POUSSE PLUS AU DOIGT — et le doigt retrouve ce qu'il vise.
 *
 * Relevé du patron : « la sélection d'éléments sur le plan 2D est
 * capricieuse, et le mur se déforme parfois sans faire exprès en essayant de
 * cliquer sur un élément d'une pièce proche du mur. Enlève le glissement de
 * mur au doigt, et cherche des améliorations pour peaufiner tout ça. »
 *
 * DEUX VUES INVISIBLES, POSÉES PAR-DESSUS LE DESSIN, en étaient la cause :
 *
 *   - la BANDE DE PRISE du mur choisi, trente-quatre points de large : elle
 *     avalait l'appui destiné à la prise ou à l'interrupteur collé contre le
 *     mur, et dix points de tremblement poussaient la cloison ;
 *   - une POIGNÉE DE COIN de quarante-quatre points sur CHAQUE angle du plan,
 *     en permanence en mode édition : viser une prise près d'un angle,
 *     c'était tirer l'angle.
 *
 * La bande a disparu ; le décalage se dit au chiffre (« Décaler »), exact,
 * sans aimant. Les coins ne viennent plus qu'avec le mur choisi, se voient,
 * et un simple appui dessus relâche le mur.
 */
const mockCap = { valeur: null as string | null };

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
  get RoomScanCanvas() {
    return mockCap.valeur;
  },
}));

import React from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import { normaleSortante, type WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number, roomId = 'r1'): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId,
});

const MURS: WallSeg[] = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 3),
  mur('biais', 6, 3, 0, 6),
  mur('o', 0, 6, 0, 0),
];

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (choisi: string | null, onSelectWall: (id: string | null) => void = () => {}) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      walls: MURS.map((w) => ({ ...w, a: { ...w.a }, b: { ...w.b } })),
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never,
      fixtures: [],
      photos: [],
    });
    t = TestRenderer.create(
      <FloorplanEditor
        showMeasures={false}
        editable
        selectedWallId={choisi}
        onSelectWall={onSelectWall}
      />,
    );
  });
  act(() => {
    const zone = t.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: 400, height: 600 } } });
  });
  arbre = t;
  return t;
};

const coins = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(View)
    .filter(
      (n) =>
        n.props.accessibilityLabel === 'Tirer le coin du mur' &&
        typeof n.props.onResponderGrant === 'function',
    );

/** Un événement tactile complet : `PanResponder` relit l'historique. */
const doigt = (x: number, y: number, x0 = x, y0 = y) => ({
  nativeEvent: { touches: [{ pageX: x, pageY: y }], locationX: x, locationY: y },
  touchHistory: {
    numberActiveTouches: 1,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: 100,
    touchBank: [
      {
        touchActive: true,
        startPageX: x0,
        startPageY: y0,
        startTimeStamp: 0,
        currentPageX: x,
        currentPageY: y,
        currentTimeStamp: 100,
        previousPageX: x0,
        previousPageY: y0,
        previousTimeStamp: 0,
      },
    ],
  },
});

const instantane = () =>
  JSON.stringify(useScanStore.getState().walls.map((w) => [w.id, w.a, w.b]));

describe('le mur ne se pousse plus au doigt', () => {
  it('aucune bande de prise ne recouvre le mur choisi', () => {
    const t = monter('biais');
    const bandes = t.root.findAllByType(View).filter((n) => {
      const st = (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, unknown>;
      return (
        typeof n.props.onMoveShouldSetResponder === 'function' &&
        st.position === 'absolute' &&
        st.backgroundColor === 'transparent' &&
        typeof st.width === 'number' &&
        (st.width as number) > 60
      );
    });
    expect(bandes).toHaveLength(0);
  });
});

describe('les coins : ceux du mur choisi, et eux seuls', () => {
  it('aucune poignée de coin tant qu’aucun mur n’est choisi', () => {
    // Le doigt appartient au dessin : une prise près d'un angle se touche.
    expect(coins(monter(null))).toHaveLength(0);
  });

  it('le mur choisi montre ses deux coins — un point qu’on voit', () => {
    const t = monter('n');
    const c = coins(t);
    expect(c).toHaveLength(2);
    // Un marqueur dessiné : ce qu'on peut tirer se montre.
    for (const n of c) expect(n.findAllByType(View).length).toBeGreaterThan(1);
  });

  it('un appui sur un coin relâche le mur, sans le bouger', () => {
    const lacher = jest.fn();
    const t = monter('n', lacher);
    const avant = instantane();
    const c = coins(t)[0];
    act(() => {
      c.props.onResponderGrant(doigt(100, 100));
      c.props.onResponderMove(doigt(104, 103, 100, 100));
      c.props.onResponderRelease(doigt(104, 103, 100, 100));
    });
    expect(lacher).toHaveBeenCalledWith(null);
    expect(instantane()).toBe(avant);
  });

  it('mais tirer franchement un coin le déplace encore — c’est voulu', () => {
    const lacher = jest.fn();
    const t = monter('n', lacher);
    const avant = instantane();
    const c = coins(t)[0];
    act(() => {
      c.props.onResponderGrant(doigt(100, 100));
      c.props.onResponderMove(doigt(100, 160, 100, 100));
      c.props.onResponderRelease(doigt(100, 160, 100, 100));
    });
    expect(instantane()).not.toBe(avant);
    // Un geste n'est pas un appui : le mur reste choisi.
    expect(lacher).not.toHaveBeenCalled();
  });
});

describe('« Décaler » : le mur se pousse au chiffre', () => {
  it('le côté dehors ne dépend pas du sens du tracé', () => {
    const n = normaleSortante(MURS[0], MURS);
    expect(n.z).toBeCloseTo(-1, 6);
    const inverse = mur('n', 6, 0, 0, 0);
    expect(normaleSortante(inverse, [inverse, ...MURS.slice(1)]).z).toBeCloseTo(-1, 6);
    // Le mur ouest : dehors, c'est −x.
    expect(normaleSortante(MURS[3], MURS).x).toBeCloseTo(-1, 6);
  });

  it('sans aimant, le mur arrive exactement où on l’a dit', () => {
    const CLOISON = mur('cloison', 0.5, 0.3, 5.5, 0.3, 'r2');
    const poser = () =>
      act(() => {
        useScanStore.getState().reset();
        useScanStore.setState({
          walls: [...MURS, CLOISON].map((w) => ({ ...w, a: { ...w.a }, b: { ...w.b } })),
          openings: [],
        });
      });
    // Au doigt, l'aimant rattrapait la cloison voisine, à huit centimètres.
    poser();
    useScanStore.getState().moveWall('n', 0, 0.22);
    expect(useScanStore.getState().walls.find((w) => w.id === 'n')!.a.z).toBeCloseTo(0.3, 6);
    // Au chiffre, 22 cm sont 22 cm.
    poser();
    useScanStore.getState().moveWall('n', 0, 0.22, false);
    const n = useScanStore.getState().walls.find((w) => w.id === 'n')!;
    expect(n.a.z).toBeCloseTo(0.22, 6);
    expect(n.b.z).toBeCloseTo(0.22, 6);
    // Et ses voisins le tiennent toujours.
    expect(useScanStore.getState().walls.find((w) => w.id === 'e')!.a.z).toBeCloseTo(0.22, 6);
  });
});

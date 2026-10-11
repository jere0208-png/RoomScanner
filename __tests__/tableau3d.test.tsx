/**
 * TOUCHER LE TABLEAU SUR LA MAQUETTE OUVRE SON RENDU RÉALISTE.
 *
 * Relevé du patron : « sur le plan 3D, le clic sur le modèle tableau doit
 * ouvrir son visuel réaliste ». Le tableau n'offrait aucune cible : il
 * n'allume rien et n'est sur aucun départ, et un appareil qui ne répond à
 * rien n'en offre pas. Il en offre une désormais — quand l'écran sait quoi
 * en faire.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('react-native-room-scan', () => ({
  RoomScan: { isSupported: jest.fn(async () => true), viewModel: jest.fn(async () => false) },
  scanEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  laserEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  RoomScanView: 'RoomScanView',
  RoomScanCanvas: undefined,
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Iso3DView } from '../src/components/Iso3DView';
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
const MURS = [mur('n', 0, 0, 5, 0), mur('e', 5, 0, 5, 4), mur('s', 5, 4, 0, 4), mur('o', 0, 4, 0, 0)];
const TABLEAU: Fixture = { id: 't1', kind: 'tableau', wallId: 'e', along: 2, height: 1.35, side: 1 };

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (props: Record<string, unknown>) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never,
      fixtures: [TABLEAU],
      ceiling: [],
      photos: [],
    });
    t = TestRenderer.create(<Iso3DView value={{ theta: -32, tilt: 56, zoom: 1, ox: 0, oy: 0 }} {...props} />);
  });
  act(() => {
    t.root.findAllByType(View).find((n) => typeof n.props.onLayout === 'function')!.props.onLayout({
      nativeEvent: { layout: { width: 600, height: 480 } },
    });
  });
  arbre = t;
  return t;
};

/** Un appui simple, tel que le `PanResponder` le voit (voir `circuitdelaprise`). */
const taper = (t: TestRenderer.ReactTestRenderer, x: number, y: number) => {
  const v = t.root.findAll((n) => typeof n.props?.onStartShouldSetResponder === 'function')[0];
  const horloge = 1000;
  const doigt = {
    touchActive: true,
    startPageX: x,
    startPageY: y,
    startTimeStamp: horloge,
    currentPageX: x,
    currentPageY: y,
    currentTimeStamp: horloge,
    previousPageX: x,
    previousPageY: y,
    previousTimeStamp: horloge,
  };
  const ev = (actif: boolean) => ({
    nativeEvent: {
      touches: actif ? [{ identifier: 0, pageX: x, pageY: y }] : [],
      changedTouches: [{ identifier: 0, pageX: x, pageY: y }],
      identifier: 0,
      pageX: x,
      pageY: y,
      locationX: x,
      locationY: y,
      timestamp: horloge,
    },
    touchHistory: {
      touchBank: [{ ...doigt, touchActive: actif }],
      numberActiveTouches: actif ? 1 : 0,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: horloge,
    },
  });
  act(() => {
    v.props.onStartShouldSetResponder?.(ev(true));
    v.props.onResponderGrant?.(ev(true));
  });
  act(() => {
    v.props.onResponderRelease?.(ev(false));
  });
};

const cible = (t: TestRenderer.ReactTestRenderer) => t.root.findAll((n) => n.props?.testID === 'cible-t1')[0];

describe('le tableau sur la maquette', () => {
  it('offre une cible, et l’appui ouvre son rendu', () => {
    const ouvrir = jest.fn();
    const t = monter({ onTapTableau: ouvrir });
    const c = cible(t);
    expect(c).toBeDefined();
    taper(t, c.props.cx, c.props.cy);
    expect(ouvrir).toHaveBeenCalledTimes(1);
  });

  it('sans écran pour l’ouvrir, il n’offre toujours rien', () => {
    expect(cible(monter({}))).toBeUndefined();
  });
});

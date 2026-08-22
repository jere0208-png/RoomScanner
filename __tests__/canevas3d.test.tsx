/**
 * LE CANEVAS PREND LA GÉOMÉTRIE, LE SVG GARDE LE RESTE.
 *
 * Relevé du patron : « le meublé est lourd, à peine quelques meubles et une
 * latence est largement visible ; pourtant sur MagicScan, un grand nombre de
 * meubles et aucun problème ». La comparaison désigne la vraie limite : ces
 * applications dessinent dans un canevas, là où nous posions UNE VUE PAR
 * FACE — cinq cent cinquante, réconciliées et repeintes à chaque image.
 *
 * Le modèle est désormais dessiné par une seule vue native, qui reçoit tout
 * à plat. Ce banc tient les deux moitiés du contrat :
 *
 *   — quand le canevas est là, plus une seule balise de géométrie ;
 *   — quand il n'est pas là (Android, ou un iPhone dont le module natif n'a
 *     pas été rebâti), le rendu SVG reprend la main tel quel. Une
 *     application qui perdrait sa 3D parce qu'une vue manque serait pire
 *     que lente.
 */
const canevasPresent = { valeur: true };

/*
  LE MODULE NATIF EN DOUBLET, avec sa vue de canevas en interrupteur.

  On ne prend PAS le vrai module : il ouvre un `NativeEventEmitter` au
  chargement, et sans binaire iOS en face l'invariant de React Native fait
  échouer la suite entière (la leçon de `jest.setup.js`).
*/
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    viewModel: jest.fn(async () => false),
  },
  scanEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  laserEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  RoomScanView: 'RoomScanView',
  get RoomScanCanvas() {
    return canevasPresent.valeur ? 'RoomScanCanvas' : undefined;
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
import {
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
    useScanStore.setState({
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({
        id: r.id,
        name: `Pièce ${i + 1}`,
        floor: null,
      })),
      fixtures: [],
      ceiling: [],
      showFurniture: true,
    });
    t = TestRenderer.create(
      <Iso3DView value={{ theta: 35, tilt: 58, zoom: 1, ox: 0, oy: 0 }} />,
    );
  });
  act(() => {
    const z = t.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    z.props.onLayout({ nativeEvent: { layout: { width: 390, height: 620 } } });
  });
  arbre = t;
  return t;
}

/** Les balises qui dessinent de la géométrie (un tracé porte un « d »). */
const traces = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => typeof n.props?.d === 'string' && n.props.d.length > 2);

describe('quand le canevas natif est là', () => {
  it('reçoit tout le modèle, et le SVG n’en dessine plus rien', () => {
    canevasPresent.valeur = true;
    const t = monter();
    const canevas = t.root.findAll(
      (n) => Array.isArray(n.props?.formes) && Array.isArray(n.props?.styles),
    );
    expect(canevas).toHaveLength(1);
    const { formes, styles } = canevas[0].props;
    // Tout le modèle est là : des centaines de nombres, une poignée de
    // peaux — c'est exactement le partage qu'on cherchait.
    expect(formes.length).toBeGreaterThan(500);
    expect(styles.length).toBeGreaterThan(0);
    expect(styles.length).toBeLessThan(formes.length / 20);
    // Et plus une seule balise de géométrie : c'était le but.
    expect(traces(t)).toHaveLength(0);
  });
});

describe('quand il n’est pas là', () => {
  it('le rendu SVG reprend la main, entier', () => {
    canevasPresent.valeur = false;
    const t = monter();
    expect(
      t.root.findAll((n) => Array.isArray(n.props?.formes)),
    ).toHaveLength(0);
    // Le modèle se dessine toujours : une application qui perdrait sa 3D
    // parce qu'une vue native manque serait pire que lente.
    expect(traces(t).length).toBeGreaterThan(20);
    canevasPresent.valeur = true;
  });
});

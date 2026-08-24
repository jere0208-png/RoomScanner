/**
 * LES COTES DES APPAREILS SUIVENT LE BOUTON « COTES », EN 3D.
 *
 * Relevé du patron : « sur le plan 3D, afficher les cotes des éléments élec
 * en même temps que les murs à l'activation du bouton de cotes ».
 *
 * Deux verrous les retenaient, et il fallait les deux pour voir un nombre :
 *
 *   — le ZOOM. Les cotes d'appareil ne paraissaient qu'au-delà de quatre-
 *     vingt-dix pixels par mètre. Le seuil se défendait — une dizaine de
 *     cotes sur une vue d'ensemble font une bouillie — mais il rendait le
 *     bouton menteur : on l'allume, les murs se cotent, les prises non, et
 *     rien ne dit qu'il faut s'approcher ;
 *   — le calque « REPÈRES ». Il porte la DÉSIGNATION de chaque appareil, et
 *     il part éteint. Les cotes vivaient dedans : le bouton « Cotes » ne
 *     pouvait donc rien montrer tant qu'on n'avait pas allumé un autre
 *     calque, dont le nom ne parle pas de cotes.
 *
 * Les cotes appartiennent au bouton « Cotes », des murs comme des prises.
 * « Repères » garde ce qui est à lui : le nom de l'appareil.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
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

const MURS = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];

/** Une prise à 25 cm du sol, à 1,20 m du bout du mur nord. */
const PRISE = {
  id: 'f1',
  kind: 'prise' as const,
  wallId: 'n',
  along: 1.2,
  height: 0.25,
  side: 1 as const,
};

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (props: Record<string, unknown>) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
      fixtures: [PRISE],
      ceiling: [],
      photos: [],
    });
    t = TestRenderer.create(
      <Iso3DView value={{ theta: -32, tilt: 56, zoom: 1, ox: 0, oy: 0 }} {...props} />,
    );
  });
  act(() => {
    const zone = t.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: 600, height: 480 } } });
  });
  arbre = t;
  return t;
};

/** Les nombres réellement peints dans la scène. */
const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(SvgText)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    );

describe('les cotes d’appareil en 3D', () => {
  it('paraissent avec le bouton « Cotes », sans attendre le zoom', () => {
    // Cette vue tient un logement de 5 × 4 dans 600 × 480 : bien en deçà
    // des quatre-vingt-dix pixels par mètre qu'il fallait autrefois.
    const vus = mots(monter({ showMeasures: true, showElecTags: false }));
    expect(vus).toContain('25');
  });

  it('et s’éteignent avec lui', () => {
    const vus = mots(monter({ showMeasures: false, showElecTags: true }));
    expect(vus).not.toContain('25');
  });
});

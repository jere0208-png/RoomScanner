/**
 * UNE SURFACE NE DISPARAÎT JAMAIS, MÊME DANS UN RÉDUIT — revue des six
 * testeurs (captures clair-11 et clair-23).
 *
 * Le cartouche d'une pièce cédait sa surface quand la place manquait. Il ne
 * la cède plus : le nom s'abrège, et si la pièce est trop petite pour un
 * cartouche de deux lignes — un WC de mètre sur un mètre trente, dessiné
 * à trente-cinq pixels le mètre —, il sort de sa pièce et un trait de rappel
 * l'y relie.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { G, Line, Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import {
  detectRooms,
  mergeColinear,
  nomAbrege,
  roomParts,
  splitAtJunctions,
  weldCorners,
  type WallSeg,
} from '../src/geometry/floorplan';
import { pointInPolygon } from '../src/geometry/appearance';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});
const MURS = mergeColinear(
  splitAtJunctions(
    weldCorners([
      mur('n', 0, 0, 8, 0),
      mur('e', 8, 0, 8, 6),
      mur('s', 8, 6, 0, 6),
      mur('o', 0, 6, 0, 0),
      mur('wc-o', 7, 0, 7, 1.3),
      mur('wc-s', 7, 1.3, 8, 1.3),
    ]),
  ),
);
const detectees = detectRooms(MURS);
const parts = roomParts(MURS, detectees.map((r, i) => ({ id: `p${i}`, wallIds: r.wallIds })));
const ROOMS = parts.map((p, i) => ({
  id: p.roomId,
  wallIds: detectees[i].wallIds,
  name: pointInPolygon({ x: 7.5, z: 0.4 }, p.surface!.pts) ? 'WC' : 'Séjour',
}));

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function plan(w: number, h: number) {
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      walls: MURS,
      openings: [],
      rooms: ROOMS as never,
      objects: [],
      fixtures: [],
      ceiling: [],
      photos: [],
      showSurfaces: true,
    });
  });
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <FloorplanEditor editable={false} showMeasures selectedWallId={null} onSelectWall={() => {}} />,
    );
  });
  act(() => {
    const zone = t.root.findAllByType(View).find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: w, height: h } } });
  });
  arbre = t;
  return t;
}

const texteDe = (n: TestRenderer.ReactTestInstance) =>
  Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '');

describe('le cartouche d’un réduit', () => {
  it('garde sa surface, hors de la pièce, avec un trait de rappel', () => {
    const t = plan(320, 520);
    const ecrits = t.root.findAllByType(SvgText).map(texteDe);
    const wc = parts.find((p) => pointInPolygon({ x: 7.5, z: 0.4 }, p.surface!.pts))!;
    expect(ecrits).toContain(`${wc.surface!.area.toFixed(1).replace('.', ',')} m²`);
    expect(ecrits).toContain('WC');
    const rappel = t.root.findAllByType(G).find((g) => g.props.testID === `rappel-${wc.roomId}`);
    expect(rappel).toBeDefined();
    expect(rappel!.findAllByType(Line)).toHaveLength(1);
  });

  it('mais une pièce qui a la place garde son cartouche chez elle, sans rappel', () => {
    const t = plan(320, 520);
    const sejour = parts.find((p) => !pointInPolygon({ x: 7.5, z: 0.4 }, p.surface!.pts))!;
    expect(t.root.findAllByType(G).find((g) => g.props.testID === `rappel-${sejour.roomId}`)).toBeUndefined();
  });
});

describe('le nom abrégé, commun à l’écran et au dossier', () => {
  it('abrège aussi la suite du nom, plutôt que de couper au huitième signe', () => {
    expect(nomAbrege('Séjour-cuisine')).toBe('Séj.-cuis.');
    expect(nomAbrege('Chambre parentale')).toBe('Ch. pare.');
    expect(nomAbrege('Salle de bains')).toBe('SdB');
    expect(nomAbrege('WC')).toBe('WC');
  });
});

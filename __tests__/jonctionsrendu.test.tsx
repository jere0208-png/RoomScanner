/**
 * LES JONCTIONS DANS LES RENDUS — le plan d'un seul tenant, la maquette 3D.
 *
 * Relevé du patron : « il y a aussi des triangles visibles dans les murs lors
 * de jonctions ». La géométrie a son banc (`jonctions.test.ts`) ; celui-ci
 * tient que chaque rendu PEINT le cœur des jonctions : un polygone calculé
 * que personne ne dessine ne bouche aucun triangle.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { Path, Polygon } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import { appartementExemple } from '../src/data/exemple';
import { jonctionsDeMurs, type WallSeg } from '../src/geometry/floorplan';
import { buildScene } from '../src/geometry/scene3d';
import { MAQUETTE } from '../src/ui/maquette';
import { light } from '../src/theme';

const ex = appartementExemple();
const JONCTIONS = jonctionsDeMurs(ex.walls as WallSeg[]);

it('l’exemple a bien des nœuds de trois murs', () => {
  expect(JONCTIONS.length).toBeGreaterThan(2);
});

it('le plan dessine LA maçonnerie, d’un seul tenant — plus un mur par mur', () => {
  act(() => {
    useScanStore.getState().reset();
    useScanStore.getState().ouvrirExemple();
  });
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<FloorplanEditor editable={false} showMeasures selectedWallId={null} onSelectWall={() => {}} />);
  });
  act(() => {
    const zone = t.root.findAllByType(View).find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: 390, height: 600 } } });
  });
  // Un seul chemin pour toute la maçonnerie, rempli en pair-impair : les
  // pièces sont des trous, les jonctions n'existent plus en tant que telles.
  const poches = t.root.findAllByType(Path).filter((n) => n.props.testID === 'poche-des-murs');
  expect(poches).toHaveLength(1);
  expect(poches[0].props.fillRule).toBe('evenodd');
  expect(String(poches[0].props.d).split('M').length - 1).toBeGreaterThan(0);
  // Les corps de murs ne peignent plus rien : ils gardent le toucher.
  const corps = t.root.findAllByType(Polygon).filter((n) => n.props.fill === 'transparent');
  expect(corps.length).toBeGreaterThanOrEqual(useScanStore.getState().walls.length - 1);
  // Et plus aucun cœur de jonction peint par-dessus.
  expect(t.root.findAllByType(Polygon).filter((n) => n.props.testID === 'jonction-de-murs')).toHaveLength(0);
  act(() => t.unmount());
});

it('le mur choisi, lui, se peint en bleu par-dessus la maçonnerie', () => {
  act(() => {
    useScanStore.getState().reset();
    useScanStore.getState().ouvrirExemple();
  });
  const id = useScanStore.getState().walls[0].id;
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<FloorplanEditor editable showMeasures selectedWallId={id} onSelectWall={() => {}} />);
  });
  act(() => {
    const zone = t.root.findAllByType(View).find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: 390, height: 600 } } });
  });
  const bleus = t.root.findAllByType(Polygon).filter((n) => n.props.fill === light.blue);
  expect(bleus.length).toBeGreaterThan(0);
  act(() => t.unmount());
});

it('la maquette 3D pose le dessus de chaque jonction, à la hauteur des murs', () => {
  const scene = buildScene(ex.walls, ex.openings, ex.objects as never, { palette: MAQUETTE, rooms: ex.rooms as never, showSurfaces: true });
  for (const j of JONCTIONS) {
    const dessus = scene.faces.find(
      (f) =>
        f.normal?.y === 1 &&
        f.pts.length === j.length &&
        f.pts.every((p, i) => Math.abs(p.x - j[i].x) < 1e-9 && Math.abs(p.z - j[i].z) < 1e-9),
    );
    expect(dessus).toBeDefined();
    expect(dessus!.pts[0].y).toBeCloseTo(2.5, 6);
    expect(dessus!.fill).toBe(MAQUETTE.wallTop);
  }
});

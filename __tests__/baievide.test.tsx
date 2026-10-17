/**
 * LE VIDE D'UNE BAIE APPARTIENT À LA BAIE — relevé du patron : « lors du clic
 * sur un ouvrant de porte sur le plan 2D (partie sans mur entre deux murs), ça
 * sélectionne le mur et pas la porte ; ça devrait sélectionner la porte si
 * clic dans la partie vide ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { G, Line } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import { TEINTES_PORTES, teinteDePorteSuivante } from '../src/ui/teintesPortes';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function monter(onSelectWall: jest.Mock, onSelectOpening: jest.Mock) {
  act(() => {
    useScanStore.getState().reset();
    useScanStore.getState().ouvrirExemple();
  });
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <FloorplanEditor editable showMeasures={false} selectedWallId={null} onSelectWall={onSelectWall} onSelectOpening={onSelectOpening} />,
    );
  });
  act(() => {
    const zone = t.root.findAllByType(View).find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: 390, height: 620 } } });
  });
  arbre = t;
  return t;
}

function toucherPuisMur(t: TestRenderer.ReactTestRenderer, p: { x: number; y: number }) {
  const zone = t.root.findAllByType(View).find((n) => typeof n.props.onTouchStart === 'function')!;
  act(() => zone.props.onTouchStart({ nativeEvent: { pageX: p.x, pageY: p.y, locationX: p.x, locationY: p.y } }));
  // Le mur le plus proche du point (sa tolérance) : c'est lui qui reçoit l'appui.
  const murs = t.root.findAll((n) => n.props.couche === 'halo' && typeof n.props.onPress === 'function' && !!n.props.wall);
  expect(murs.length).toBeGreaterThan(0);
  return murs;
}

describe('un appui dans le vide d’une porte', () => {
  it('choisit la porte, pas le mur', () => {
    const onSelectWall = jest.fn();
    const onSelectOpening = jest.fn();
    const t = monter(onSelectWall, onSelectOpening);
    const porte = useScanStore.getState().openings.find((o) => o.type === 'door')!;
    const g = t.root.findAllByType(G).find((n) => n.props.testID === `baie-${porte.id}`)!;
    const l = g.findAllByType(Line)[0];
    const milieu = { x: (l.props.x1 + l.props.x2) / 2, y: (l.props.y1 + l.props.y2) / 2 };
    const murs = toucherPuisMur(t, milieu);
    act(() => murs[0].props.onPress());
    expect(onSelectOpening).toHaveBeenCalledWith(porte.id);
    expect(onSelectWall).not.toHaveBeenCalled();
  });

  it('loin de toute baie, le mur reste choisi', () => {
    const onSelectWall = jest.fn();
    const onSelectOpening = jest.fn();
    const t = monter(onSelectWall, onSelectOpening);
    const murs = toucherPuisMur(t, { x: -500, y: -500 });
    act(() => murs[0].props.onPress());
    expect(onSelectWall).toHaveBeenCalled();
    expect(onSelectOpening).not.toHaveBeenCalled();
  });
});

describe('la teinte des portes (relevé du patron : « une couleur modifiable »)', () => {
  it('chaque appui passe à la teinte suivante, et revient au blanc', () => {
    let hex: string | null = null;
    const vues: string[] = [];
    for (let i = 0; i < TEINTES_PORTES.length; i++) {
      const t: { cle: string; hex: string } = teinteDePorteSuivante(hex);
      vues.push(t.cle);
      hex = t.hex;
    }
    expect(vues).toEqual(['chene', 'noyer', 'gris', 'anthracite', 'noir', 'blanc']);
  });

  it('le store la garde sur la porte, et la maquette la pose sur le vantail', () => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.getState().ouvrirExemple();
    });
    const porte = useScanStore.getState().openings.find((o) => o.type === 'door')!;
    act(() => useScanStore.getState().setTeintePorte(porte.id, '#71503A'));
    expect(useScanStore.getState().openings.find((o) => o.id === porte.id)!.teintePorte).toBe('#71503A');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildScene } = require('../src/geometry/scene3d');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { MAQUETTE } = require('../src/ui/maquette');
    const st = useScanStore.getState();
    const { meubles } = buildScene(st.walls, st.openings, st.objects, { palette: MAQUETTE, showSurfaces: true, plafonds: true, rooms: st.rooms });
    const pose = meubles.find((m: { id: string }) => m.id === `porte-${porte.id}`);
    expect(pose?.color).toBe('#71503A');
    act(() => useScanStore.getState().setTeintePorte(porte.id, null));
    expect(useScanStore.getState().openings.find((o) => o.id === porte.id)!.teintePorte).toBeUndefined();
  });
});

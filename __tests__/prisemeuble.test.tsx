/**
 * ATTRAPER UN MEUBLE NE DOIT PAS DEMANDER DE VISER.
 *
 * Releve du patron : « le clic sur un meuble est capricieux, il faut parfois
 * cliquer plusieurs fois et viser des endroits precis du meuble ».
 *
 * La cible tactile etait le DESSIN lui-meme : l'aplat du meuble et les
 * traits de son symbole. Un aplat de quarante-cinq centimetres au
 * cinquantieme fait neuf millimetres a l'ecran — moins que la pulpe d'un
 * doigt — et une chaise dezoomee tombe sous la barre des quarante-quatre
 * points qu'Apple donne pour cible minimale.
 *
 * On pose donc par-dessus une cible INVISIBLE et plus large, comme en
 * portent deja les menuiseries (leur trait transparent de vingt-six
 * points). Elle ne change rien au dessin ; elle change tout au doigt.
 *
 * ET ELLE NE MANGE PAS SES VOISINES : la marge est fixe et modeste, elle
 * n'avale pas un meuble pose a cote.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz },
  height: 2.5, yCenter: 1.25, roomId: 'r1',
});
const MURS = [mur('n', 0, 0, 5, 0), mur('e', 5, 0, 5, 4), mur('s', 5, 4, 0, 4), mur('w', 0, 4, 0, 0)];

/** Une chaise : le plus petit meuble du catalogue, et le plus dur a viser. */
const CHAISE = {
  id: 'chaise',
  roomId: 'r1',
  category: 'chair',
  width: 0.45,
  depth: 0.45,
  height: 0.9,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2.5, 0.45, 2, 1],
};

const monter = () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: [CHAISE] as never,
      rooms: [{ id: 'r1', name: 'Sejour', floor: null }] as never,
      showFurniture: true,
    });
    t = TestRenderer.create(
      <FloorplanEditor
        showMeasures={false}
        editable
        selectedWallId={null}
        onSelectWall={() => {}}
        onSelectObject={() => {}}
      />,
    );
  });
  act(() => {
    t.root.findAllByType(View)[0].props.onLayout?.({
      nativeEvent: { layout: { width: 400, height: 700 } },
    });
  });
  return t;
};

describe('la prise d’un meuble', () => {
  it('porte une cible plus large que son dessin', () => {
    const t = monter();
    // La cible porte son nom : c'est par lui qu'on la trouve, ici comme
    // au doigt d'un lecteur d'ecran.
    const cible = t.root.findAll((n) =>
      String(n.props?.accessibilityLabel ?? '').startsWith('Meuble'),
    )[0];
    expect(cible).toBeDefined();
    // Elle depasse l'emprise du meuble d'au moins six points de chaque
    // cote : de quoi rattraper un doigt qui vise a cote.
    const emprise = 0.45 * 
      // l'echelle du plan a ce cadrage, lue sur l'aplat du meuble lui-meme
      1;
    void emprise;
    const aplat = t.root.findAll(
      (n) =>
        typeof n.props?.width === 'number' &&
        n.props?.fill &&
        n.props.fill !== 'transparent' &&
        (n.props.width as number) < 200,
    )[0];
    expect(aplat).toBeDefined();
    expect(cible.props.width).toBeGreaterThanOrEqual(
      (aplat.props.width as number) + 12,
    );
    act(() => t.unmount());
  });

  it('et un appui dessus choisit le meuble', () => {
    const vus: (string | null)[] = [];
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        walls: MURS,
        openings: [],
        objects: [CHAISE] as never,
        rooms: [{ id: 'r1', name: 'Sejour', floor: null }] as never,
        showFurniture: true,
      });
      t = TestRenderer.create(
        <FloorplanEditor
          showMeasures={false}
          editable
          selectedWallId={null}
          onSelectWall={() => {}}
          onSelectObject={(id) => vus.push(id)}
        />,
      );
    });
    act(() => {
      t.root.findAllByType(View)[0].props.onLayout?.({
        nativeEvent: { layout: { width: 400, height: 700 } },
      });
    });
    const cible = t.root.findAll((n) =>
      String(n.props?.accessibilityLabel ?? '').startsWith('Meuble'),
    )[0];
    expect(cible).toBeDefined();
    act(() => cible.props.onPress());
    expect(vus).toEqual(['chaise']);
    act(() => t.unmount());
  });
});

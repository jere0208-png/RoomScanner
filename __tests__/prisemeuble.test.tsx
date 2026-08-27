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
  it('porte DEUX cibles : le dessin exact, et un débord autour', () => {
    /*
      DEUX VERSIONS, ET LA SECONDE EST NEE D'UN AUTRE DEFAUT.

      Il n'y avait qu'une cible, le dessin PLUS huit points de debord — sans
      quoi une chaise dezoomee tombe sous les quarante-quatre points qu'Apple
      donne pour minimum. Elle marchait, et elle mordait sur le voisin :
      releve du patron, « quand un meuble est sur un autre, impossible de
      selectionner celui qu'on souhaite… pourtant on clique sur celui qu'on
      souhaite visuellement ». Le debord d'une table recouvrait le dessin
      d'une chaise glissee dessous.

      Meme remede que pour le halo d'un mur : le debord reste avec le dessin,
      la cible STRICTE — le dessin, exactement — passe par-dessus tous les
      meubles. Ce banc garde les deux : la tolerance existe toujours, et elle
      n'est plus celle qui tranche.
    */
    const t = monter();
    const stricte = t.root.findAll((n) =>
      String(n.props?.accessibilityLabel ?? '').startsWith('Meuble '),
    )[0];
    const large = t.root.findAll((n) =>
      String(n.props?.accessibilityLabel ?? '').startsWith('Autour du meuble '),
    )[0];
    expect(stricte).toBeDefined();
    expect(large).toBeDefined();
    // L'aplat dessiné du meuble : le premier rectangle plein et petit.
    const aplat = t.root.findAll(
      (n) =>
        typeof n.props?.width === 'number' &&
        n.props?.fill &&
        n.props.fill !== 'transparent' &&
        (n.props.width as number) < 200,
    )[0];
    expect(aplat).toBeDefined();
    // La stricte épouse le dessin ; le débord fait six points de plus de
    // chaque côté, de quoi rattraper un doigt qui vise à côté.
    expect(stricte.props.width).toBeCloseTo(aplat.props.width as number, 6);
    expect(large.props.width).toBeGreaterThanOrEqual(
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

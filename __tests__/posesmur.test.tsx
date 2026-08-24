/**
 * LES FANTÔMES BLEUS D'UN MUR NEUF, SUR LE PLAN.
 *
 * Relevé du patron : « "Ajouter un mur" doit afficher les multiples
 * possibilités d'attachement à un autre mur dans des angles de 90° et 180°
 * pour droit, à chaque fin de mur ; ces choix de pose du mur doivent être en
 * bleu à faible opacité ».
 *
 * Le calcul des poses vit dans la géométrie et a son propre banc
 * (`murmanuel`) ; ici on vérifie ce que le plan en FAIT — trois choses qui
 * ne se voient pas ailleurs :
 *
 *   — chaque pose se dessine comme un MUR, pas comme un trait : elle a
 *     l'épaisseur d'une maçonnerie, sinon on la lit comme une cote ou une
 *     gaine ;
 *   — elle est en bleu, EN RETRAIT : c'est une proposition, pas un plan ;
 *   — elle se touche. Et pas au pixel près : une maçonnerie de quatorze
 *     centimètres fait cinq pixels au zoom d'ensemble, et personne ne vise
 *     cinq pixels. La cible est donc un second trait, transparent et large.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { Line } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import { posesDeMur, type WallSeg } from '../src/geometry/floorplan';
import { light } from '../src/theme';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** Un « L » : deux bouts libres, donc six poses offertes. */
const EN_L = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3)];

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const poses = posesDeMur(EN_L, 1);

const monter = (choisi: string[]) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: EN_L,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never,
      fixtures: [],
      ceiling: [],
      photos: [],
      notes: [],
      niveauCourant: 0,
    });
    t = TestRenderer.create(
      <FloorplanEditor
        showMeasures
        editable
        selectedWallId={null}
        onSelectWall={() => {}}
        poses={poses}
        onPose={(id) => choisi.push(id)}
      />,
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

/** Les fantômes peints : bleus, et en retrait. */
const fantomes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Line)
    .filter((n) => n.props.stroke === light.blue && n.props.strokeOpacity < 1);

describe('les poses offertes à un mur neuf', () => {
  it('en dessine une par choix, en bleu et en retrait', () => {
    const f = fantomes(monter([]));
    expect(f).toHaveLength(poses.length);
    for (const n of f) {
      expect(n.props.strokeOpacity).toBeLessThanOrEqual(0.35);
      // L'épaisseur d'un mur, pas celle d'un filet.
      expect(Number(n.props.strokeWidth)).toBeGreaterThanOrEqual(5);
    }
  });

  it('et chacune se touche, sur une cible à la taille du doigt', () => {
    const choisi: string[] = [];
    const t = monter(choisi);
    const cibles = t.root
      .findAllByType(Line)
      .filter(
        (n) => n.props.stroke === 'transparent' && typeof n.props.onPress === 'function',
      );
    expect(cibles).toHaveLength(poses.length);
    for (const n of cibles) expect(Number(n.props.strokeWidth)).toBeGreaterThanOrEqual(22);
    act(() => cibles[0].props.onPress());
    expect(choisi).toEqual([poses[0].id]);
  });

  it('et rien du tout quand on n’a rien demandé', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({ walls: EN_L, openings: [], objects: [], rooms: [], fixtures: [], ceiling: [], photos: [], notes: [] });
      t = TestRenderer.create(
        <FloorplanEditor showMeasures editable selectedWallId={null} onSelectWall={() => {}} />,
      );
    });
    act(() => {
      const zone = t.root
        .findAllByType(View)
        .find((n) => typeof n.props.onLayout === 'function')!;
      zone.props.onLayout({ nativeEvent: { layout: { width: 600, height: 480 } } });
    });
    arbre = t;
    expect(fantomes(t)).toHaveLength(0);
  });
});

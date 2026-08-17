/**
 * CE QUE LE PLAN DEMANDE À CHAQUE IMAGE.
 *
 * Le relevé du chantier : « quand on met meubles + cotes, ça ne glisse plus
 * sous le doigt ». C'est une question de NOMBRE : chaque trait, chaque
 * disque, chaque mot est une balise que le moteur graphique repeint à
 * chaque image du geste. Un logement meublé et coté en compte plusieurs
 * centaines, et le téléphone ne suit plus.
 *
 * On ne peut pas mesurer des images par seconde depuis un banc d'essai. On
 * peut mesurer ce qui les coûte : le nombre de nœuds dessinés. Cette
 * épreuve compte, au repos et PENDANT le déplacement, et exige que le
 * déplacement soit nettement plus léger — c'est là, et seulement là, que la
 * fluidité se joue.
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
import {
  SNAPSHOT_FIXTURES,
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

/** Tous les nœuds réellement dessinés, du natif au composant. */
function noeuds(tree: TestRenderer.ReactTestRenderer): number {
  let n = 0;
  const marche = (x: unknown) => {
    if (!x || typeof x !== 'object') return;
    const node = x as { rendered?: unknown; children?: unknown };
    n += 1;
    const enfants = node.rendered ?? node.children;
    if (Array.isArray(enfants)) for (const e of enfants) marche(e);
    else if (enfants) marche(enfants);
  };
  marche(tree.toTree());
  return n;
}

function planEquipe() {
  let tree!: TestRenderer.ReactTestRenderer;
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
      fixtures: SNAPSHOT_FIXTURES,
      ceiling: [],
      photos: [],
      showFurniture: true,
      showSurfaces: true,
      showOpeningColors: true,
    });
    tree = TestRenderer.create(
      <FloorplanEditor
        showMeasures
        editable={false}
        selectedWallId={null}
        onSelectWall={() => {}}
      />,
    );
  });
  act(() => {
    // Large et zoomé : c'est le cas où tout se dessine — symboles compris.
    tree.root.findAllByType(View)[0].props.onLayout?.({
      nativeEvent: { layout: { width: 900, height: 620 } },
    });
  });
  arbre = tree;
  return tree;
}

/**
 * Un doigt posé sur le plan, tel que `PanResponder` l'attend.
 *
 * Il ne se contente pas de l'événement : il lit l'HISTORIQUE tactile de
 * React Native pour calculer son centre. Sans lui, le geste ne démarre
 * pas — et le banc mesurerait deux fois la même chose.
 */
const doigt = (x: number, y: number) => ({
  nativeEvent: { touches: [{ pageX: x, pageY: y }], locationX: x, locationY: y },
  touchHistory: {
    numberActiveTouches: 1,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: 100,
    touchBank: [
      {
        touchActive: true,
        startPageX: x,
        startPageY: y,
        startTimeStamp: 0,
        currentPageX: x,
        currentPageY: y,
        currentTimeStamp: 100,
        previousPageX: x,
        previousPageY: y,
        previousTimeStamp: 0,
      },
    ],
  },
});

/** La zone du plan qui porte le geste de déplacement. */
const zoneDuPlan = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(View)
    .find((n) => typeof n.props.onMoveShouldSetResponder === 'function')!;

function glisser(tree: TestRenderer.ReactTestRenderer) {
  const zone = zoneDuPlan(tree);
  expect(zone).toBeDefined();
  act(() => {
    zone.props.onMoveShouldSetResponder?.(doigt(400, 300));
    zone.props.onResponderGrant?.(doigt(400, 300));
  });
}

describe('la fluidité du plan', () => {
  it('allège nettement le dessin pendant qu’on déplace le plan', () => {
    const tree = planEquipe();
    const repos = noeuds(tree);
    glisser(tree);
    const geste = noeuds(tree);
    // Un tiers de moins, au bas mot : c'est ce qui sépare un plan qui
    // glisse d'un plan qui saute.
    expect(
      `${geste} nœuds pendant le geste, ${repos} au repos : ${
        geste < repos * 0.7 ? 'allégé' : 'aussi lourd'
      }`,
    ).toBe(
      `${geste} nœuds pendant le geste, ${repos} au repos : allégé`,
    );
  });

  it('et retrouve tout son détail dès que le doigt se lève', () => {
    const tree = planEquipe();
    const repos = noeuds(tree);
    glisser(tree);
    act(() => {
      zoneDuPlan(tree).props.onResponderRelease?.(doigt(430, 320));
    });
    expect(noeuds(tree)).toBe(repos);
  });
});

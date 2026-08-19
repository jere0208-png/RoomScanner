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

/**
 * LE PLAN NE RÉVEILLE PLUS TOUT L'ÉCRAN À CHAQUE IMAGE.
 *
 * Relevé du chantier : « au mouvement, le modèle 3D bug moins que le 2D ».
 * C'était vrai, et la cause n'était pas le dessin — mesuré, le plan 2D en
 * mouvement dessine QUATRE FOIS MOINS de nœuds que la vue 3D.
 *
 * Elle était dans la remontée d'état : le plan annonce sa position à
 * l'écran qui le porte, pour que la 3D reprenne exactement le même cadrage
 * quand on bascule. Cette annonce partait à chaque image du geste — donc
 * `ResultScreen` tout entier se rendait soixante fois par seconde, avec ses
 * bandeaux, sa rangée d'outils et ses sept feuilles. Le plan, lui, n'y était
 * pour rien.
 *
 * Or le parent n'a besoin de cette position qu'AU MOMENT DE BASCULER, c'est
 * à dire une fois le doigt levé. Elle ne part donc plus qu'à la fin du
 * geste.
 */
describe('ce que le plan annonce pendant le geste', () => {
  it('ne prévient l’écran qu’une fois le doigt levé', () => {
    const vues: { zoom: number }[] = [];
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
      });
      tree = TestRenderer.create(
        <FloorplanEditor
          showMeasures
          editable={false}
          selectedWallId={null}
          onSelectWall={() => {}}
          onView={(v) => vues.push(v)}
        />,
      );
    });
    arbre = tree;
    act(() => {
      for (const n of tree.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({
            nativeEvent: { layout: { width: 390, height: 620 } },
          });
        }
      }
    });

    const zone = zoneDuPlan(tree);
    act(() => {
      zone.props.onMoveShouldSetResponder?.(doigt(200, 300));
      zone.props.onResponderGrant?.(doigt(200, 300));
    });
    vues.length = 0;

    // Dix images de glissement : c'est un geste court, et il en produirait
    // dix rendus de tout l'écran.
    for (let i = 1; i <= 10; i++) {
      act(() => {
        zone.props.onResponderMove?.({
          ...doigt(200 + i * 6, 300),
          nativeEvent: { touches: [{ pageX: 200 + i * 6, pageY: 300 }] },
        });
      });
    }
    expect(vues).toHaveLength(0);

    // Le doigt se lève : l'écran apprend alors où en est le plan, une fois.
    act(() => zone.props.onResponderRelease?.(doigt(260, 300)));
    expect(vues.length).toBeGreaterThanOrEqual(1);
  });
});

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

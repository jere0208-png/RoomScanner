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
import { StyleSheet, View } from 'react-native';
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

/**
 * Un doigt qui a PARCOURU du chemin depuis sa prise.
 *
 * `doigt()` pose le même point comme départ et comme position courante : le
 * `PanResponder` en déduit un déplacement nul, et le plan ne bouge pas d'un
 * pixel. Pour mesurer un glissement, il faut que les deux diffèrent.
 */
const doigtDepuis = (x0: number, y0: number, x: number, y: number) => {
  const e = doigt(x, y) as unknown as {
    touchHistory: { touchBank: Record<string, number>[] };
  };
  e.touchHistory.touchBank[0].startPageX = x0;
  e.touchHistory.touchBank[0].startPageY = y0;
  e.touchHistory.touchBank[0].previousPageX = x0;
  e.touchHistory.touchBank[0].previousPageY = y0;
  return e as never;
};

function glisser(tree: TestRenderer.ReactTestRenderer) {
  const zone = zoneDuPlan(tree);
  expect(zone).toBeDefined();
  act(() => {
    zone.props.onMoveShouldSetResponder?.(doigt(400, 300));
    zone.props.onResponderGrant?.(doigt(400, 300));
    // Le doigt AVANCE : sans mouvement, on ne mesure que la prise, et la
    // couche n'a encore rien à porter.
    zone.props.onResponderMove?.(doigtDepuis(400, 300, 460, 330));
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

/*
  L'ALLÈGEMENT PENDANT LE GESTE A ÉTÉ RETIRÉ — et c'est un progrès, pas un
  renoncement.

  Le plan se dépouillait de ses cotes et de ses étiquettes dès qu'un doigt
  se posait : c'était la seule parade tant que CHAQUE IMAGE du geste
  recalculait le cadrage et redessinait tout. Moins de nœuds à recalculer,
  moins de retard.

  Depuis que le geste est une transformation native (voir plus bas), le plan
  ne se redessine plus DU TOUT pendant qu'on le déplace : il n'y a plus rien
  à alléger, et le faire coûterait deux rendus complets — un à la prise, un
  au lâcher — pour économiser un travail qui n'existe plus. Le dessin reste
  donc entier sous le doigt, ce qui est aussi plus juste : les cotes suivent
  le plan au lieu de clignoter.
*/
describe('le dessin reste entier sous le doigt', () => {
  it('ne retire plus ses cotes quand on prend le plan', () => {
    const tree = planEquipe();
    const repos = noeuds(tree);
    glisser(tree);
    expect(`${noeuds(tree)} nœuds pendant le geste, ${repos} au repos`).toBe(
      `${repos} nœuds pendant le geste, ${repos} au repos`,
    );
  });

  it('et n’a donc rien à retrouver quand le doigt se lève', () => {
    const tree = planEquipe();
    const repos = noeuds(tree);
    glisser(tree);
    act(() => {
      zoneDuPlan(tree).props.onResponderRelease?.(doigt(430, 320));
    });
    expect(noeuds(tree)).toBe(repos);
  });
});

/**
 * LE PLAN NE SE REDESSINE PLUS PENDANT QU'ON LE DÉPLACE.
 *
 * Relevé du patron : « plus les plans sont chargés en cotes et en meubles,
 * plus au déplacement il est lent ». La mesure lui donne raison, et dit où :
 * le calcul n'est plus en cause — trier et projeter la 3D d'un logement
 * meublé coûte trois dixièmes de milliseconde par image. Ce qui coûte, c'est
 * le NOMBRE DE NŒUDS : chaque trait, chaque cote, chaque symbole est une vue
 * que le moteur repeint. Trois cent quarante vues, soixante fois par
 * seconde, pendant que le doigt glisse.
 *
 * Or déplacer et agrandir un dessin déjà peint, c'est exactement ce qu'une
 * TRANSFORMATION NATIVE sait faire — la leçon du ruban, de l'onde du bouton
 * et du badge, appliquée cette fois au plan entier. Le dessin est calculé
 * UNE fois, à la prise ; le geste ne fait que translater, tourner et
 * agrandir la couche déjà rastérisée ; le vrai cadrage n'est posé qu'au
 * lâcher, en un seul rendu.
 *
 * Ce banc tient la propriété qui produit la fluidité : PENDANT le geste, les
 * coordonnées du dessin ne bougent pas d'un pixel, et c'est la transformation
 * de la couche qui porte le mouvement.
 */
describe('le plan glisse sans se redessiner', () => {
  /** La couche transformée : celle qui porte le geste, au-dessus du dessin. */
  const couche = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAll((n) => {
        const st = StyleSheet.flatten(n.props?.style) as
          | { transform?: unknown[] }
          | undefined;
        return (
          Array.isArray(st?.transform) &&
          // Elle porte le dessin : au moins un trait vit dessous.
          n.findAll((x) => typeof x.props?.x1 === 'number').length > 0
        );
      })
      .pop();

  /** Les coordonnées de tous les traits du dessin, en une empreinte. */
  const empreinte = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAll((n) => typeof n.props?.x1 === 'number')
      .map((n) => `${n.props.x1},${n.props.y1}`)
      .join('|');

  it('bouge la couche, pas les coordonnées', () => {
    const tree = planEquipe();
    const avant = empreinte(tree);
    expect(avant.length).toBeGreaterThan(0);

    glisser(tree);

    // LE DESSIN N'A PAS BOUGÉ : aucune coordonnée recalculée, donc aucun
    // rendu du plan — c'est là, et seulement là, que se gagne la fluidité
    // d'un plan chargé.
    expect(empreinte(tree)).toBe(avant);

    // ET POURTANT LE PLAN A SUIVI LE DOIGT : la couche porte le mouvement.
    const c = couche(tree);
    expect(c).toBeDefined();
    const st = StyleSheet.flatten(c!.props.style) as {
      transform: Record<string, unknown>[];
    };
    expect(st.transform.some((x) => 'translateX' in x)).toBe(true);
  });

  it('pose le cadrage pour de bon quand le doigt se lève', () => {
    const tree = planEquipe();
    const avant = empreinte(tree);
    glisser(tree);
    act(() => {
      zoneDuPlan(tree).props.onResponderRelease?.(doigt(430, 320));
    });
    // Au lâcher, UN rendu : le dessin est recalculé à sa nouvelle place, et
    // la couche revient à zéro — sinon le déplacement se compterait deux
    // fois au geste suivant.
    expect(empreinte(tree)).not.toBe(avant);
  });
});


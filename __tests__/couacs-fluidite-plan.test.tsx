/**
 * LOT « FLUIDITÉ ET PLAN » — les couacs relevés par les testeurs.
 *
 *   — GLISSER UNE PIÈCE NE LA DÉPLAÇAIT PAS (bloquant) : le geste gardait le
 *     `onMoveRoom` du premier rendu, sa zone, soeur du dessin, n'était
 *     jamais consultée — le SVG plein cadre prenait l'appui —, et le doigt
 *     se situait par `locationX`, relatif à la vue touchée et non au cadre.
 *   — LES FEUILLES FERMÉES ÉCOUTAIENT LE CLAVIER, et se redessinaient à
 *     chacun de ses mouvements.
 *   — L'ARRIVÉE DE L'ACCUEIL SE REJOUAIT à chaque retour.
 *
 * L'indexation Spotlight par abonnement a son banc à part
 * (`couacs-fluidite-plan-app.test.tsx`) : elle monte `App` avec des écrans
 * en façade, ce qui jurerait avec l'accueil monté ici pour de vrai.
 */
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    cameraStatus: jest.fn(async () => 'granted'),
    start: jest.fn(async () => true),
    stop: jest.fn(async () => null),
    pause: jest.fn(),
    resume: jest.fn(),
    startHeading: jest.fn(async () => true),
    stopHeading: jest.fn(async () => true),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Animated, Keyboard, Text, View } from 'react-native';
import Svg from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { SheetShell } from '../src/components/Sheet';
import { HomeScreen } from '../src/screens/HomeScreen';
import { useScanStore } from '../src/store/scanStore';
import {
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
  jest.restoreAllMocks();
});

type Poignee = Record<string, ((e: unknown) => unknown) | undefined>;

/**
 * La main d'essai : elle écrit l'ARCHIVE des doigts, comme le système —
 * `PanResponder` recalcule son état depuis `touchHistory` (voir
 * `doigt.test.tsx`).
 */
function main(
  /** Où la page place le cadre du plan. */
  page = { x: 0, y: 0 },
  /** Où la vue TOUCHÉE se place dans le cadre (`locationX` lui est relatif). */
  vue = { x: 0, y: 0 },
) {
  let horloge = 1000;
  let doigt: Record<string, number | boolean> | null = null;
  const evenement = () => {
    const vivant = doigt && doigt.touchActive ? [doigt] : [];
    const x = (doigt?.currentPageX as number) ?? 0;
    const y = (doigt?.currentPageY as number) ?? 0;
    return {
      nativeEvent: {
        touches: vivant.map(() => ({
          identifier: 0,
          pageX: x + page.x,
          pageY: y + page.y,
          locationX: x - vue.x,
          locationY: y - vue.y,
        })),
        locationX: x - vue.x,
        locationY: y - vue.y,
        pageX: x + page.x,
        pageY: y + page.y,
      },
      touchHistory: {
        touchBank: doigt ? [doigt] : [],
        numberActiveTouches: vivant.length,
        indexOfSingleActiveTouch: vivant.length ? 0 : -1,
        mostRecentTimeStamp: horloge,
      },
    };
  };
  return {
    poser(x: number, y: number) {
      horloge += 16;
      doigt = {
        touchActive: true,
        startPageX: x,
        startPageY: y,
        startTimeStamp: horloge,
        currentPageX: x,
        currentPageY: y,
        currentTimeStamp: horloge,
        previousPageX: x,
        previousPageY: y,
        previousTimeStamp: horloge,
      };
      return evenement();
    },
    bouger(x: number, y: number) {
      horloge += 16;
      if (!doigt) throw new Error('aucun doigt posé');
      doigt = {
        ...doigt,
        previousPageX: doigt.currentPageX,
        previousPageY: doigt.currentPageY,
        previousTimeStamp: doigt.currentTimeStamp,
        currentPageX: x,
        currentPageY: y,
        currentTimeStamp: horloge,
      };
      return evenement();
    },
    lever() {
      horloge += 16;
      if (doigt) doigt = { ...doigt, touchActive: false, currentTimeStamp: horloge };
      return evenement();
    },
  };
}

/**
 * Une vue réclame-t-elle un glissement de trente points vers la droite,
 * parti de (x, y) ? La question se pose comme le système la pose : capture
 * d'abord (elle tient l'état du geste à jour), bouillonnement ensuite.
 */
function reclame(h: Poignee, x: number, y: number) {
  const m = main();
  h.onStartShouldSetResponderCapture?.(m.poser(x, y));
  const e = m.bouger(x + 30, y);
  if (h.onMoveShouldSetResponderCapture?.(e) === true) return true;
  return h.onMoveShouldSetResponder?.(e) === true;
}

describe('glisser une pièce dans le plan 2D', () => {
  const monter = (selection: string | null, onMoveRoom: Poignee[string]) => (
    <FloorplanEditor
      editable
      showMeasures
      selectedWallId={null}
      selectedRoomId={selection}
      onSelectWall={() => {}}
      onMoveRoom={onMoveRoom as never}
    />
  );

  /** Où la fenêtre place le cadre du plan (sa mesure à la pose du doigt). */
  let origine = { x: 0, y: 0 };
  beforeEach(() => {
    origine = { x: 0, y: 0 };
  });

  /** Le plan de l'écran : AUCUNE pièce choisie au premier rendu. */
  function planDeLEcran(premier: jest.Mock) {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        walls: SNAPSHOT_WALLS,
        openings: SNAPSHOT_OPENINGS,
        objects: [],
        rooms: SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: `Pièce ${i + 1}` })),
        fixtures: [],
        ceiling: [],
        photos: [],
      });
      tree = TestRenderer.create(monter(null, premier));
    });
    act(() => {
      tree.root.findAllByType(View)[0].props.onLayout?.({
        nativeEvent: { layout: { width: 390, height: 700 } },
      });
    });
    arbre = tree;
    return tree;
  }

  /**
   * Les vues que le toucher du DESSIN consulte : celles qui portent un
   * geste et CONTIENNENT le SVG. Une vue soeur du dessin n'en est pas — le
   * toucher ne remonte qu'aux ancêtres de ce qu'on touche.
   */
  const ancetresDuDessin = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          typeof n.props.onMoveShouldSetResponder === 'function',
      )
      .filter((n) => n.findAllByType(Svg).length > 0)
      .map((n) => n.props as Poignee);

  it('déplace la pièce choisie APRÈS le premier rendu, par un ancêtre du dessin', () => {
    const premier = jest.fn();
    const tree = planDeLEcran(premier);
    // On choisit une pièce : l'écran passe un `onMoveRoom` neuf, qui sait
    // laquelle déplacer.
    const aJour = jest.fn();
    act(() => tree.update(monter(SNAPSHOT_ROOMS[0].id, aJour)));
    act(() => {
      tree.root.findAllByType(View)[0].props.onLayout?.({
        nativeEvent: { layout: { width: 390, height: 700 } },
      });
    });

    /*
      Un point dans la pièce choisie : le plan s'y écarte exprès, et une
      vue qu'il CONTIENT, ancêtre du dessin, le réclame. Avant la
      correction, il n'y en avait pas — la zone de la pièce, soeur du
      dessin, n'était pas consultée. (`findAll` parcourt l'arbre de haut en
      bas : un ancêtre vient avant ce qu'il contient.)
    */
    const vues = ancetresDuDessin(tree);
    let trouve: { h: Poignee; x: number; y: number } | null = null;
    for (let y = 20; y < 700 && !trouve; y += 20) {
      for (let x = 20; x < 390 && !trouve; x += 20) {
        const oui = vues.map((v) => reclame(v, x, y));
        const refus = oui.indexOf(false);
        const j = refus < 0 ? -1 : oui.indexOf(true, refus + 1);
        if (j > 0) trouve = { h: vues[j], x, y };
      }
    }
    expect(trouve).not.toBeNull();

    // Le glissement, tel que le système le joue au preneur.
    const { h, x, y } = trouve!;
    const m = main();
    h.onStartShouldSetResponderCapture?.(m.poser(x, y));
    const e1 = m.bouger(x + 30, y);
    h.onMoveShouldSetResponderCapture?.(e1);
    expect(h.onMoveShouldSetResponder?.(e1)).toBe(true);
    act(() => {
      h.onResponderGrant?.(e1);
      h.onResponderMove?.(m.bouger(x + 60, y));
      h.onResponderMove?.(m.bouger(x + 90, y + 10));
      h.onResponderRelease?.(m.lever());
    });

    // Le `onMoveRoom` À JOUR, jamais celui du premier rendu.
    expect(premier).not.toHaveBeenCalled();
    const pas = aJour.mock.calls.filter((c) => c[2] === false);
    expect(pas.length).toBeGreaterThan(0);
    expect(pas.some((c) => Math.hypot(c[0], c[1]) > 0)).toBe(true);
    // Le lâcher pose l'aimant.
    expect(aJour.mock.calls[aJour.mock.calls.length - 1]).toEqual([0, 0, true]);
  });

  it('situe le doigt par la page : la vue touchée n’est pas le cadre du plan', () => {
    /*
      Sur l'iPhone, la vue touchée est le SVG, dont la toile déborde du
      cadre de sa marge fixe : son `locationX` est décalé d'autant. Et le
      cadre n'est pas en haut de la fenêtre (la barre du plan au-dessus).
    */
    const aJour = jest.fn();
    const tree = planDeLEcran(jest.fn());
    act(() => tree.update(monter(SNAPSHOT_ROOMS[0].id, aJour)));
    const vues = ancetresDuDessin(tree);
    // Un point de la pièce, trouvé cadre et page confondus.
    let point: { j: number; x: number; y: number } | null = null;
    for (let y = 20; y < 700 && !point; y += 20) {
      for (let x = 20; x < 390 && !point; x += 20) {
        const oui = vues.map((v) => reclame(v, x, y));
        const refus = oui.indexOf(false);
        const j = refus < 0 ? -1 : oui.indexOf(true, refus + 1);
        if (j > 0) point = { j, x, y };
      }
    }
    expect(point).not.toBeNull();
    const { j, x, y } = point!;

    // Le même point, cadre à 120 points du haut, vue touchée à -280.
    origine = { x: 0, y: 120 };
    const cadre = tree.root.findAll(
      (n) => typeof n.type === 'string' && typeof n.props.onTouchStart === 'function',
    )[0];
    // La vue du doublet de React Native : c'est elle que tient la référence
    // (la vue hôte, dessous, n'est que son rendu).
    const mesurable = [cadre.parent, cadre].find(
      (n) => n?.instance && typeof n.instance.measureInWindow === 'function',
    );
    expect(mesurable).toBeDefined();
    mesurable!.instance.measureInWindow = (rendre: (x: number, y: number) => void) =>
      rendre(origine.x, origine.y);
    const m = main({ x: 0, y: 120 }, { x: -280, y: -280 });
    const e0 = m.poser(x, y);
    act(() => cadre.props.onTouchStart(e0));
    const h = ancetresDuDessin(tree)[j];
    h.onStartShouldSetResponderCapture?.(e0);
    const e1 = m.bouger(x + 30, y);
    h.onMoveShouldSetResponderCapture?.(e1);
    expect(h.onMoveShouldSetResponder?.(e1)).toBe(true);
    act(() => {
      h.onResponderGrant?.(e1);
      h.onResponderMove?.(m.bouger(x + 60, y));
      h.onResponderRelease?.(m.lever());
    });
    expect(aJour.mock.calls.some((c) => c[2] === false)).toBe(true);
  });

  it('sans pièce choisie, le dessin ne porte aucun glissement de pièce', () => {
    const premier = jest.fn();
    const tree = planDeLEcran(premier);
    // Aucune vue du dessin ne refuse le plan pour une pièce : les seules
    // qui réclament sont celles du plan — et `onMoveRoom` ne bouge pas.
    for (const h of ancetresDuDessin(tree)) {
      for (const [x, y] of [
        [100, 200],
        [200, 350],
        [300, 500],
      ]) {
        const m = main();
        h.onStartShouldSetResponderCapture?.(m.poser(x, y));
        const e = m.bouger(x + 30, y);
        h.onMoveShouldSetResponderCapture?.(e);
        if (h.onMoveShouldSetResponder?.(e) === true) {
          act(() => {
            h.onResponderGrant?.(e);
            h.onResponderMove?.(m.bouger(x + 60, y));
            h.onResponderRelease?.(m.lever());
          });
        }
      }
    }
    expect(premier).not.toHaveBeenCalled();
  });
});

describe('une feuille fermée et le clavier', () => {
  type Ecouteur = (e: { endCoordinates: { screenY: number; height: number } }) => void;
  function capter() {
    const ecouteurs = new Map<string, Ecouteur>();
    jest.spyOn(Keyboard, 'addListener').mockImplementation((nom: string, fn: unknown) => {
      ecouteurs.set(nom, fn as Ecouteur);
      return { remove: () => ecouteurs.delete(nom) } as never;
    });
    return ecouteurs;
  }
  const feuille = (visible: boolean) => (
    <SheetShell visible={visible} onClose={() => {}}>
      <Text>Contenu</Text>
    </SheetShell>
  );
  const margeBasse = (tree: TestRenderer.ReactTestRenderer) => {
    for (const n of tree.root.findAllByType(View)) {
      const st = n.props.style;
      for (const p of Array.isArray(st) ? st : [st]) {
        if (p && typeof p === 'object' && typeof p.paddingBottom === 'number') {
          return p.paddingBottom as number;
        }
      }
    }
    return -1;
  };

  it("n'écoute pas le clavier tant qu'elle est fermée, et l'écoute ouverte", () => {
    const ecouteurs = capter();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(feuille(false));
    });
    arbre = tree;
    expect(ecouteurs.size).toBe(0);
    act(() => tree.update(feuille(true)));
    expect(ecouteurs.size).toBe(2);
    // Refermée — la descente jouée —, elle se désabonne.
    act(() => tree.update(feuille(false)));
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(ecouteurs.size).toBe(0);
  });

  it('ouverte sur un clavier DÉJÀ levé, elle se pose au-dessus tout de suite', () => {
    capter();
    jest
      .spyOn(Keyboard, 'metrics')
      .mockReturnValue({ screenX: 0, screenY: 400, width: 390, height: 336 });
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(feuille(true));
    });
    arbre = tree;
    expect(margeBasse(tree)).toBeGreaterThan(100);
  });
});

describe("l'arrivée de l'accueil", () => {
  it('se joue au premier affichage, pas à chaque retour', () => {
    useScanStore.setState({
      screen: 'home',
      supported: true,
      saves: [],
      brouillon: null,
      error: null,
    });
    const timing = jest.spyOn(Animated, 'timing');
    const arrivees = () =>
      timing.mock.calls.filter(
        ([, cfg]) => (cfg as { duration?: number }).duration === 900,
      ).length;

    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<HomeScreen />);
    });
    expect(arrivees()).toBe(1);
    act(() => t.unmount());

    // Retour à l'accueil : rien ne se rejoue, et rien n'est laissé à zéro.
    act(() => {
      t = TestRenderer.create(<HomeScreen />);
    });
    arbre = t;
    expect(arrivees()).toBe(1);
    const transparents = t.root
      .findAll((n) => typeof n.type === 'string')
      .map((n) => n.props.style)
      .flat(Infinity as 1)
      .filter(
        (s: unknown) =>
          !!s &&
          typeof s === 'object' &&
          (s as { opacity?: unknown }).opacity === 0,
      );
    expect(transparents).toEqual([]);
  });
});

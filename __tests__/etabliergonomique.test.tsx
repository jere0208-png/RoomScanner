/**
 * L'ÉTABLI SE TRAVAILLE AU POUCE — la refonte smartphone.
 *
 * Relevé du patron : « le menu du mur où l'on peut ajouter des éléments
 * élec semble pas optimisé pour smartphone, il faut viser avec le doigt
 * sans bien voir ce que l'on fait et ça paraît petit, inadapté, pas
 * ergonomique. Propose une refonte moderne (…) en gardant une simplicité
 * de placement. »
 *
 * TROIS CAUSES MESURÉES, TROIS RÉPONSES :
 *
 *   1. LES APPAREILS FAISAIENT VINGT POINTS. Une plaque de 8,2 cm à
 *      l'échelle d'un mur de cinq mètres fait six points ; le plancher
 *      visuel la remontait à vingt — la moitié d'une cible de pouce. Il
 *      monte à trente : on voit ce qu'on va saisir.
 *
 *   2. LE DOIGT COUVRAIT L'APPAREIL ET SES COTES. Les trois cotes du
 *      sélectionné se dessinent autour de lui — exactement sous la main
 *      qui le déplace. Pendant le glissement, un RÉTICULE traverse
 *      désormais toute la face (deux fils fins : on voit où ça se pose,
 *      même le doigt dessus) et une LOUPE flotte au-dessus du doigt avec
 *      les cotes vivantes en gros : gauche, droite, hauteur.
 *
 *   3. LE CATALOGUE ÉTAIT EN PILULES SERRÉES — tuile de 36 points, texte
 *      accolé. Il passe en GRANDES TUILES : symbole normalisé en 40
 *      points, nom dessous, cibles de la taille d'un pouce.
 *
 * ET RIEN DE NOUVEAU À APPRENDRE : choisir, poser, glisser. Les aimants,
 * les cotes éditables du bandeau et la fusion sous plaque ne bougent pas.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    viewModel: jest.fn(async () => false),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  laserEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  RoomScanView: 'RoomScanView',
  RoomScanCanvas: undefined,
}));

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Line, Rect } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { WallElevation } from '../src/components/WallElevation';
import { ElecSheet } from '../src/screens/result/ElecSheet';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const W: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];

let precedent: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => precedent?.unmount());
  precedent = null;
});

const monterEtabli = () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: W,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Chambre', floor: null }],
      fixtures: [
        { id: 'a', kind: 'prise', wallId: 'n', along: 1, height: 0.25, side: 1 },
      ],
      photos: [],
      showFurniture: true,
    });
    tree = TestRenderer.create(
      <WallElevation
        wallId="n"
        selectedId="a"
        onSelect={() => {}}
        onAddRequest={() => {}}
        onClose={() => {}}
      />,
    );
  });
  act(() => {
    const zone = tree.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: 390, height: 380 } } });
  });
  precedent = tree;
  return tree;
};

/** Le rectangle de l'appareil : le seul Rect arrondi plein de couleur. */
const rectAppareil = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Rect)
    .find((n) => n.props.rx === 4 && n.props.fill !== 'none');

/**
 * UN GLISSEMENT, tel que le `PanResponder` le voit — le piège documenté :
 * il recalcule tout depuis `touchHistory`.
 */
const glisser = (
  tree: TestRenderer.ReactTestRenderer,
  de: { x: number; y: number },
  vers: { x: number; y: number },
  lacher = true,
) => {
  /*
    LE BON RÉPONDEUR : les `Pressable` de la fenêtre portent aussi
    `onStartShouldSetResponder` — mais seuls les gestes d'un `PanResponder`
    posent la variante *capture*. C'est elle qu'on cherche.
  */
  const v = tree.root.findAll(
    (n) => typeof n.props?.onStartShouldSetResponderCapture === 'function',
  )[0];
  const h0 = 1000;
  const ev = (p: { x: number; y: number }, actif: boolean, tps: number) => ({
    persist: () => {},
    nativeEvent: {
      touches: actif ? [{ identifier: 0, pageX: p.x, pageY: p.y }] : [],
      changedTouches: [{ identifier: 0, pageX: p.x, pageY: p.y }],
      identifier: 0,
      pageX: p.x,
      pageY: p.y,
      locationX: p.x,
      locationY: p.y,
      timestamp: tps,
    },
    touchHistory: {
      touchBank: [
        {
          touchActive: actif,
          startPageX: de.x,
          startPageY: de.y,
          startTimeStamp: h0,
          currentPageX: p.x,
          currentPageY: p.y,
          currentTimeStamp: tps,
          previousPageX: de.x,
          previousPageY: de.y,
          previousTimeStamp: h0,
        },
      ],
      numberActiveTouches: actif ? 1 : 0,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: tps,
    },
  });
  act(() => {
    v.props.onStartShouldSetResponder?.(ev(de, true, h0));
    v.props.onResponderGrant?.(ev(de, true, h0));
  });
  act(() => {
    v.props.onResponderMove?.(ev(vers, true, h0 + 120));
  });
  if (lacher) {
    act(() => {
      v.props.onResponderRelease?.(ev(vers, false, h0 + 130));
    });
  }
};

describe('les appareils se voient', () => {
  it('jamais sous trente points, même sur un long mur', () => {
    const t = monterEtabli();
    const r = rectAppareil(t)!;
    expect(r).toBeTruthy();
    expect(Number(r.props.width)).toBeGreaterThanOrEqual(30);
    expect(Number(r.props.height)).toBeGreaterThanOrEqual(30);
  });
});

describe('le glissement se voit — réticule et loupe', () => {
  const centreAppareil = (t: TestRenderer.ReactTestRenderer) => {
    const r = rectAppareil(t)!;
    return {
      x: Number(r.props.x) + Number(r.props.width) / 2,
      y: Number(r.props.y) + Number(r.props.height) / 2,
    };
  };

  it('deux fils traversent la face pendant le geste : on voit où ça se pose', () => {
    const t = monterEtabli();
    const de = centreAppareil(t);
    glisser(t, de, { x: de.x + 40, y: de.y - 30 }, false);
    // `findAll` rend composite ET natif : on ne compte que le composant.
    const fils = (id: string) =>
      t.root.findAllByType(Line).filter((n) => n.props.testID === id);
    expect(fils('reticule-x')).toHaveLength(1);
    expect(fils('reticule-y')).toHaveLength(1);
  });

  it('et une loupe au-dessus du doigt écrit les cotes vivantes', () => {
    const t = monterEtabli();
    const de = centreAppareil(t);
    glisser(t, de, { x: de.x + 40, y: de.y - 30 }, false);
    const loupe = t.root.findAll((n) => n.props?.testID === 'loupe')[0];
    expect(loupe).toBeTruthy();
    const mots = loupe
      .findAllByType(Text)
      .map((n) =>
        Array.isArray(n.props.children)
          ? n.props.children.join('')
          : String(n.props.children),
      )
      .join(' ');
    // Gauche, droite, hauteur : trois nombres, en centimètres.
    expect(mots).toMatch(/\d+/);
    expect(mots).toMatch(/[Hh]aut|↑|·/);
  });

  it('le doigt levé, le mur redevient calme', () => {
    // Le contre-sens inverse : un réticule qui reste est un mur rayé.
    const t = monterEtabli();
    const de = centreAppareil(t);
    glisser(t, de, { x: de.x + 40, y: de.y - 30 }, true);
    expect(
      t.root.findAllByType(Line).filter((n) => n.props.testID === 'reticule-x'),
    ).toHaveLength(0);
    expect(t.root.findAll((n) => n.props?.testID === 'loupe')).toHaveLength(0);
  });

  it('et l’appareil a bien suivi le geste : la simplicité de pose ne bouge pas', () => {
    const t = monterEtabli();
    const de = centreAppareil(t);
    const avant = useScanStore.getState().fixtures[0];
    glisser(t, de, { x: de.x + 40, y: de.y - 30 }, true);
    const apres = useScanStore.getState().fixtures[0];
    expect(apres.along).not.toBe(avant.along);
    expect(apres.height).toBeGreaterThan(avant.height);
  });
});

describe('le catalogue en grandes tuiles', () => {
  const monterCatalogue = () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ElecSheet
          visible
          vue="catalogue"
          wallId={null}
          focusX={undefined}
          selectedId={null}
          onSelect={() => {}}
          onAddRequest={() => {}}
          onChoose={() => {}}
          onClose={() => {}}
        />,
      );
    });
    precedent = tree;
    return tree;
  };

  it('les tuiles sont des cibles de pouce : symbole en 40, nom dessous', () => {
    const t = monterCatalogue();
    const tuiles = t.root.findAll(
      (n) =>
        typeof n.props?.onPress === 'function' &&
        !!n.props?.accessibilityLabel &&
        n.props.accessibilityLabel !== 'Fermer',
    );
    expect(tuiles.length).toBeGreaterThan(8);
    for (const tuile of tuiles.slice(0, 6)) {
      const style = StyleSheet.flatten(tuile.props.style);
      // En colonne — le nom SOUS le symbole, pas accolé.
      expect(style.flexDirection).not.toBe('row');
      expect(Number(style.minHeight ?? 0)).toBeGreaterThanOrEqual(84);
      const svg = tuile.findAll((n) => Number(n.props?.width) >= 40);
      expect(svg.length).toBeGreaterThan(0);
    }
  });
});

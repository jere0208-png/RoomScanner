/**
 * LA 3D LISIBLE DÈS L'OUVERTURE — revue I5, trois testeurs : « Passer en
 * 3D » montrait du blanc (capture clair-14, 2,7 s après l'appui) ou une
 * élévation de face (sombre-14, clair-43), et le logement ne se lisait en
 * trois quarts qu'après un premier glissement.
 *
 * Ce banc tient ce qui se mesure depuis cette machine :
 *   — l'orbite donnée à la vue native au montage est FINIE (elle valait NaN :
 *     saisie avant que la vue n'ait sa taille), et la régie la repose juste
 *     après le montage ;
 *   — une silhouette d'attente tient la place jusqu'à la première image
 *     native, et ne reste jamais plus d'une seconde et demie ;
 *   — la levée suit l'écran, s'arrête au premier doigt, et ne se joue pas
 *     quand « Réduire les animations » est actif ;
 *   — un tap n'est pas un geste : les cotes ne s'éteignent qu'au premier
 *     vrai mouvement ;
 *   — en pause (feuille « Décorer » ouverte), la scène ne se rebâtit pas, et
 *     se rebâtit une fois à la reprise.
 */
const natifPresent = { valeur: true };
const mockRegie = {
  orbites: [] as { cle: string; orbite: number[] }[],
  levees: [] as number[],
};
jest.mock('react-native-room-scan', () => ({
  poserOrbiteDeMaquette: (cle: string, orbite: number[]) => {
    mockRegie.orbites.push({ cle, orbite });
    return true;
  },
  poserLeveeDeMaquette: (_cle: string, k: number) => {
    mockRegie.levees.push(k);
    return true;
  },
  RoomScan: {
    isSupported: jest.fn(async () => true),
    viewModel: jest.fn(async () => false),
  },
  scanEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  laserEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  RoomScanView: 'RoomScanView',
  RoomScanCanvas: undefined,
  get RoomScanVisite() {
    return natifPresent.valeur ? 'RoomScanVisite' : undefined;
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('../src/geometry/scene3d', () => {
  const vrai = jest.requireActual('../src/geometry/scene3d');
  return { ...vrai, buildScene: jest.fn(vrai.buildScene) };
});

import React from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { Iso3DView } from '../src/components/Iso3DView';
import { buildScene } from '../src/geometry/scene3d';
import { useScanStore } from '../src/store/scanStore';
import { appartementExemple } from '../src/data/exemple';

const ex = appartementExemple();
const VUE = { theta: -32, tilt: 58, zoom: 1, ox: 0, oy: 0 };

let arbre: TestRenderer.ReactTestRenderer | null = null;
beforeEach(() => {
  jest.useFakeTimers();
  mockRegie.orbites.length = 0;
  mockRegie.levees.length = 0;
  natifPresent.valeur = true;
});
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  jest.useRealTimers();
});

const monter = (props: Partial<React.ComponentProps<typeof Iso3DView>> = {}) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: ex.walls,
      openings: ex.openings,
      objects: ex.objects as never,
      rooms: ex.rooms as never,
      fixtures: [],
      ceiling: [],
      showFurniture: true,
    });
    t = TestRenderer.create(<Iso3DView value={VUE} {...props} />);
  });
  act(() => {
    const z = t.root.findAllByType(View).find((n) => typeof n.props.onLayout === 'function')!;
    z.props.onLayout({ nativeEvent: { layout: { width: 390, height: 620 } } });
  });
  arbre = t;
  return t;
};
const natif = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => n.props?.testID === 'maquette-native' && Array.isArray(n.props?.orbite))[0];
const attente = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => n.props?.testID === 'maquette-attente' && typeof n.type !== 'string');

/** Un doigt crédible pour `PanResponder`, qui recalcule tout depuis `touchHistory`. */
const doigt = (x0: number, y0: number, x: number, y: number, actif: boolean) => ({
  nativeEvent: {
    touches: actif ? [{ identifier: 0, pageX: x, pageY: y }] : [],
    changedTouches: [{ identifier: 0, pageX: x, pageY: y }],
    identifier: 0,
    pageX: x,
    pageY: y,
    locationX: x,
    locationY: y,
    timestamp: 1000,
  },
  touchHistory: {
    touchBank: [
      {
        touchActive: actif,
        startPageX: x0,
        startPageY: y0,
        startTimeStamp: 1000,
        currentPageX: x,
        currentPageY: y,
        currentTimeStamp: 1000,
        previousPageX: x0,
        previousPageY: y0,
        previousTimeStamp: 1000,
      },
    ],
    numberActiveTouches: actif ? 1 : 0,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: 1000,
  },
});
const gestes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => typeof n.props?.onStartShouldSetResponder === 'function')[0];

describe('l’orbite d’entrée', () => {
  it('est finie au montage de la vue native — plus de NaN saisi avant la taille', () => {
    const t = monter();
    const v = natif(t);
    expect(v).toBeDefined();
    expect(v.props.orbite).toHaveLength(10);
    expect(v.props.orbite.every(Number.isFinite)).toBe(true);
  });

  it('la régie ne reçoit jamais d’orbite non finie, et la repose après le montage', () => {
    const t = monter();
    expect(mockRegie.orbites.every((o) => o.orbite.every(Number.isFinite))).toBe(true);
    const avant = mockRegie.orbites.length;
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(mockRegie.orbites.length).toBeGreaterThan(avant);
    const derniere = mockRegie.orbites[mockRegie.orbites.length - 1];
    expect(derniere.cle).toBe(natif(t).props.cle);
    expect(derniere.orbite).toEqual(natif(t).props.orbite);
  });
});

describe('l’attente de la première image', () => {
  it('une silhouette du plan tient la place, puis s’efface à la première image', () => {
    const t = monter();
    const a = attente(t);
    expect(a).toHaveLength(1);
    // La silhouette porte les sols, projetés par la caméra de la maquette.
    const chemins = a[0].findAll((n) => typeof n.props?.d === 'string' && n.props.d.length > 10);
    expect(chemins.length).toBeGreaterThan(0);
    act(() => {
      natif(t).props.onPremiereImage();
    });
    expect(attente(t)).toHaveLength(0);
  });

  it('un binaire qui n’annonce rien la retire au bout d’une seconde et demie', () => {
    const t = monter();
    act(() => {
      jest.advanceTimersByTime(1400);
    });
    expect(attente(t)).toHaveLength(1);
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(attente(t)).toHaveLength(0);
  });
});

describe('la levée', () => {
  it('monte au battement de l’écran, puis s’arrête d’aplomb', () => {
    monter({ leveeAuMontage: true });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(mockRegie.levees.some((k) => k > 0 && k < 1)).toBe(true);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockRegie.levees[mockRegie.levees.length - 1]).toBe(1);
  });

  it('un doigt posé pendant la levée la termine sur-le-champ', () => {
    const t = monter({ leveeAuMontage: true });
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(mockRegie.levees[mockRegie.levees.length - 1]).toBeLessThan(1);
    act(() => {
      gestes(t).props.onStartShouldSetResponder?.(doigt(100, 100, 100, 100, true));
      gestes(t).props.onResponderGrant?.(doigt(100, 100, 100, 100, true));
    });
    expect(mockRegie.levees[mockRegie.levees.length - 1]).toBe(1);
  });

  it('« Réduire les animations » actif : le logement est d’aplomb d’entrée', async () => {
    const lire = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockImplementation(() => Promise.resolve(true));
    monter({ leveeAuMontage: true });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(mockRegie.levees[mockRegie.levees.length - 1]).toBe(1);
    lire.mockRestore();
  });
});

describe('un tap n’est pas un geste', () => {
  it('les cotes restent au contact, et ne s’éteignent qu’au premier vrai mouvement', () => {
    natifPresent.valeur = false;
    const t = monter({ showMeasures: true });
    const textes = () => t.root.findAllByType(SvgText).length;
    const auRepos = textes();
    expect(auRepos).toBeGreaterThan(0);
    act(() => {
      gestes(t).props.onStartShouldSetResponder?.(doigt(100, 100, 100, 100, true));
      gestes(t).props.onResponderGrant?.(doigt(100, 100, 100, 100, true));
    });
    expect(textes()).toBe(auRepos);
    act(() => {
      gestes(t).props.onResponderMove?.(doigt(100, 100, 160, 110, true));
    });
    expect(textes()).toBeLessThan(auRepos);
    act(() => {
      gestes(t).props.onResponderRelease?.(doigt(100, 100, 160, 110, false));
    });
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(textes()).toBe(auRepos);
  });
});

describe('en pause, la scène ne se rebâtit pas', () => {
  const repeindre = (cle: string) =>
    act(() => {
      useScanStore.setState({
        rooms: useScanStore.getState().rooms.map((r) => ({ ...r, peinture: cle })) as never,
      });
    });

  it('trois teintes essayées derrière la feuille : aucune construction ; une seule à la reprise', () => {
    const t = monter({ enPause: true });
    const compte = buildScene as unknown as jest.Mock;
    compte.mockClear();
    repeindre('sauge');
    repeindre('terracotta');
    repeindre('bleu-nuit');
    expect(compte).not.toHaveBeenCalled();
    act(() => {
      t.update(<Iso3DView value={VUE} enPause={false} />);
    });
    expect(compte).toHaveBeenCalledTimes(1);
  });

  it('hors pause, chaque teinte rebâtit la scène (le comportement ordinaire)', () => {
    monter();
    const compte = buildScene as unknown as jest.Mock;
    compte.mockClear();
    repeindre('sauge');
    expect(compte).toHaveBeenCalled();
  });
});

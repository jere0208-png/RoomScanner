/**
 * L'EXPLORATION, QUAND LE NATIF EST LÀ — la scène part une fois, la caméra à
 * chaque pas, et le JavaScript ne peint plus rien.
 *
 * Le banc d'à côté (`explorationecran`) tourne SANS natif : il voit la vue
 * en JavaScript, celle qui tient lieu sur le banc d'essai. Ici on monte un
 * doublet de la vue SceneKit et l'on vérifie ce que le téléphone, lui,
 * recevra : des triangles prêts AVANT qu'on entre, la caméra à hauteur
 * d'œil, qui avance avec la manette — et aucune vue JavaScript derrière,
 * sans quoi on paierait les deux.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => false),
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => ({ surfaces: [], objects: [], modelPath: '' })),
    pause: jest.fn(() => undefined),
    resume: jest.fn(() => undefined),
    cameraStatus: jest.fn(async () => 'granted'),
    takePhoto: jest.fn(async () => null),
    readPhoto: jest.fn(async () => null),
    deletePhotos: jest.fn(async () => 0),
    startHeading: jest.fn(async () => false),
    stopHeading: jest.fn(async () => false),
    heading: jest.fn(async () => null),
    sharePDF: jest.fn(async () => true),
    shareText: jest.fn(async () => true),
    shareFile: jest.fn(async () => true),
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
  // Le doublet de la vue SceneKit : un élément hôte, qui garde ses props.
  RoomScanVisite: 'RoomScanVisite',
}));

import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ResultScreen } from '../src/screens/ResultScreen';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
import { HAUTEUR_OEIL } from '../src/geometry/exploration';
import { PAR_TRIANGLE } from '../src/geometry/visite3d';
import { PERIODE_NATIF, cadenceDeMarche } from '../src/components/Exploration';
import {
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

function monter() {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      screen: 'result',
      scanName: 'Appartement',
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({
        id: r.id,
        name: `Pièce ${i + 1}`,
        floor: null,
        wallIds: r.wallIds,
      })),
      fixtures: [],
      ceiling: [],
      photos: [],
    });
    t = TestRenderer.create(<ResultScreen />);
  });
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
      }
    }
  });
  act(() => jest.advanceTimersByTime(400));
  arbre = t;
  return t;
}

const presser = (t: TestRenderer.ReactTestRenderer, label: string) => {
  const b = t.root
    .findAllByType(TouchableOpacity)
    .find((n) => n.props.accessibilityLabel === label);
  expect(b).toBeDefined();
  act(() => b!.props.onPress());
  act(() => jest.advanceTimersByTime(50));
};

/** La vue SceneKit, telle que le natif la recevrait. */
const natif = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => (n.type as unknown) === 'RoomScanVisite')[0];

const touche = (id: number, x: number, y: number) => ({
  identifier: id,
  pageX: x,
  pageY: y,
  locationX: x,
  locationY: y,
});
const evenement = (touches: ReturnType<typeof touche>[]) => ({
  nativeEvent: { touches, changedTouches: touches, pageX: 0, pageY: 0, timestamp: Date.now() },
});
/** La vue des deux pouces — voir `explorationecran.test.tsx`. */
const pouces = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(View)
    .find(
      (n) =>
        n.props.accessibilityLabel === 'Marcher et regarder' &&
        typeof n.props.onResponderGrant === 'function',
    )!;
/** Le pouce gauche pousse vers le haut pendant `ms`, puis se lève. */
const marcher = (t: TestRenderer.ReactTestRenderer, ms: number) => {
  const z = pouces(t);
  act(() => {
    z.props.onStartShouldSetResponder(evenement([touche(0, 120, 900)]));
    z.props.onResponderGrant(evenement([touche(0, 120, 900)]));
    z.props.onResponderMove(evenement([touche(0, 120, 850)]));
  });
  act(() => jest.advanceTimersByTime(ms));
  act(() => z.props.onResponderRelease(evenement([])));
  act(() => jest.advanceTimersByTime(100));
};

describe('la scène part vers SceneKit', () => {
  it('des triangles et des sols, prêts à l’ouverture', () => {
    const t = monter();
    presser(t, 'Explorer');
    const v = natif(t);
    expect(v).toBeDefined();
    expect(v.props.maillage.length).toBeGreaterThan(0);
    expect(v.props.maillage.length % PAR_TRIANGLE).toBe(0);
    expect(v.props.sols.length).toBeGreaterThan(0);
    expect(typeof v.props.fond).toBe('string');
    expect(v.props.fond).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('la caméra est à hauteur d’œil, six nombres', () => {
    const t = monter();
    presser(t, 'Explorer');
    const cam = natif(t).props.camera as number[];
    expect(cam).toHaveLength(6);
    expect(cam[1]).toBeCloseTo(HAUTEUR_OEIL, 6);
    expect(cam.every((x) => Number.isFinite(x))).toBe(true);
    // L'ouverture, en degrés : ni une meurtrière, ni un fisheye.
    expect(cam[5]).toBeGreaterThan(40);
    expect(cam[5]).toBeLessThan(140);
  });

  it('et rien n’est peint en JavaScript derrière', () => {
    const t = monter();
    presser(t, 'Explorer');
    expect(t.root.findAllByType(Iso3DView).some((n) => !!n.props.pov)).toBe(false);
  });

  it('la manette fait avancer la caméra native, dans le sens du regard', () => {
    const t = monter();
    presser(t, 'Explorer');
    const avant = natif(t).props.camera as number[];
    marcher(t, 600);
    const apres = natif(t).props.camera as number[];
    const dx = apres[0] - avant[0];
    const dz = apres[2] - avant[2];
    expect(Math.hypot(dx, dz)).toBeGreaterThan(0.1);
    const f = { x: Math.sin(avant[3]), z: Math.cos(avant[3]) };
    expect((dx * f.x + dz * f.z) / Math.hypot(dx, dz)).toBeGreaterThan(0.8);
    // La scène, elle, n'a pas bougé d'un nombre : c'est la même référence.
    expect(natif(t).props.maillage).toBe(natif(t).props.maillage);
  });

  it('la scène ne se recalcule pas à chaque pas', () => {
    const t = monter();
    presser(t, 'Explorer');
    const maille = natif(t).props.maillage;
    marcher(t, 300);
    expect(natif(t).props.maillage).toBe(maille);
  });
});

/*
  MARCHER ET TOURNER EN MÊME TEMPS — relevé du patron : « le déplacement se
  coupe lorsqu'on change en même temps la vue dans la visite ».

  Le banc rejoue ce qu'iOS envoie vraiment : pendant que seul le pouce du
  regard bouge, la liste de TOUS les doigts (`touches`) redonne le pouce de
  la marche à sa position d'arrivée. Relire cette liste ramenait la manette
  au centre, et la marche s'arrêtait. Seuls les doigts de l'événement
  (`changedTouches`) comptent désormais.
*/
describe('marcher et tourner en même temps', () => {
  const ev = (changes: ReturnType<typeof touche>[], toutes: ReturnType<typeof touche>[]) => ({
    nativeEvent: { touches: toutes, changedTouches: changes, pageX: 0, pageY: 0, timestamp: Date.now() },
  });

  it('tourner la vue ne coupe pas la marche', () => {
    const t = monter();
    presser(t, 'Explorer');
    const z = pouces(t);
    const depart = natif(t).props.camera as number[];
    // Le pouce gauche se pose et pousse vers le haut : on avance.
    act(() => {
      z.props.onStartShouldSetResponder(ev([touche(0, 120, 900)], [touche(0, 120, 900)]));
      z.props.onResponderGrant(ev([touche(0, 120, 900)], [touche(0, 120, 900)]));
      z.props.onResponderMove(ev([touche(0, 120, 850)], [touche(0, 120, 850)]));
    });
    act(() => jest.advanceTimersByTime(300));
    const enMarche = natif(t).props.camera as number[];
    // Le pouce droit se pose, puis tourne — et iOS redonne le gauche à sa
    // position d'arrivée dans la liste complète.
    const gaucheFige = touche(0, 120, 900);
    act(() => {
      z.props.onResponderStart(ev([touche(1, 300, 500)], [gaucheFige, touche(1, 300, 500)]));
    });
    for (let i = 1; i <= 10; i++) {
      act(() => {
        z.props.onResponderMove(ev([touche(1, 300 + i * 6, 500)], [gaucheFige, touche(1, 300 + i * 6, 500)]));
        jest.advanceTimersByTime(30);
      });
    }
    const apres = natif(t).props.camera as number[];
    // On a tourné…
    expect(apres[3]).not.toBeCloseTo(enMarche[3], 3);
    // …et l'on a CONTINUÉ d'avancer pendant ce temps.
    const pendant = Math.hypot(apres[0] - enMarche[0], apres[2] - enMarche[2]);
    expect(pendant).toBeGreaterThan(0.05);
    expect(Math.hypot(enMarche[0] - depart[0], enMarche[2] - depart[2])).toBeGreaterThan(0.05);
    act(() => z.props.onResponderRelease(ev([touche(0, 120, 850), touche(1, 360, 500)], [])));
    act(() => jest.advanceTimersByTime(100));
  });

  it('lever le pouce du regard laisse marcher ; lever celui de la marche arrête', () => {
    const t = monter();
    presser(t, 'Explorer');
    const z = pouces(t);
    act(() => {
      z.props.onResponderGrant(ev([touche(0, 120, 900)], [touche(0, 120, 900)]));
      z.props.onResponderMove(ev([touche(0, 120, 850)], [touche(0, 120, 850)]));
      z.props.onResponderStart(ev([touche(1, 300, 500)], [touche(0, 120, 850), touche(1, 300, 500)]));
    });
    act(() => jest.advanceTimersByTime(200));
    // Le regard se lève : la marche continue.
    act(() => z.props.onResponderEnd(ev([touche(1, 300, 500)], [touche(0, 120, 850)])));
    const a = natif(t).props.camera as number[];
    act(() => jest.advanceTimersByTime(300));
    const b = natif(t).props.camera as number[];
    expect(Math.hypot(b[0] - a[0], b[2] - a[2])).toBeGreaterThan(0.05);
    // La marche se lève : on s'arrête.
    act(() => z.props.onResponderEnd(ev([touche(0, 120, 850)], [])));
    act(() => jest.advanceTimersByTime(100));
    const c = natif(t).props.camera as number[];
    act(() => jest.advanceTimersByTime(300));
    const d = natif(t).props.camera as number[];
    expect(Math.hypot(d[0] - c[0], d[2] - c[2])).toBeLessThan(1e-6);
  });
});

describe('la cadence en natif', () => {
  it('une image par rafraîchissement quand le téléphone suit', () => {
    expect(PERIODE_NATIF).toBe(16);
    expect(cadenceDeMarche(3, PERIODE_NATIF)).toBe(16);
    expect(cadenceDeMarche(40, PERIODE_NATIF)).toBe(60);
  });
});

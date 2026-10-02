/**
 * L'EXPLORATION, À L'ÉCRAN — la pastille, les deux pouces, le point.
 *
 * La marche elle-même s'éprouve à la règle (`exploration.test.ts`). Ici, on
 * vérifie que l'écran la branche comme il faut : qu'on y entre depuis le plan,
 * que la 3D est à hauteur d'œil, que la manette fait avancer DANS LE SENS DU
 * REGARD, que le regard tourne, qu'on en sort.
 *
 * ET QUE LA 3D SAIT TENIR UN INTÉRIEUR : un sol sous les pieds, un plafond
 * au-dessus de la tête. La seule vue à la première personne qui existait —
 * une présentation qui défilait à hauteur de mur — se passait des deux ; pour
 * marcher, sans eux, on avance au-dessus du vide, sous le ciel.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ResultScreen } from '../src/screens/ResultScreen';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
import { HAUTEUR_OEIL } from '../src/geometry/exploration';
import { buildScene, dosTourne } from '../src/geometry/scene3d';
import { MAQUETTE } from '../src/ui/maquette';
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
      })),
      fixtures: SNAPSHOT_FIXTURES,
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

/** La caméra de la 3D d'exploration — celle qui a une pose à hauteur d'œil. */
const camera = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Iso3DView).find((n) => !!n.props.pov)?.props.pov;

/*
  UN DOIGT CRÉDIBLE POUR LE `PanResponder` — le piège que la maison connaît
  par cœur : il IGNORE l'état de geste qu'on lui passe et le recalcule depuis
  `e.touchHistory`. On lui donne donc un historique où le doigt est parti
  d'un point, et se trouve maintenant à un autre.
*/
let horloge = 1000;
const doigt = (x0: number, y0: number, x: number, y: number, actif = true) => {
  horloge += 16;
  return {
    nativeEvent: {
      touches: actif ? [{ identifier: 0, pageX: x, pageY: y, locationX: x0, locationY: y0 }] : [],
      changedTouches: [{ identifier: 0, pageX: x, pageY: y }],
      identifier: 0,
      pageX: x,
      pageY: y,
      locationX: x0,
      locationY: y0,
      timestamp: horloge,
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
          currentTimeStamp: horloge,
          previousPageX: x0,
          previousPageY: y0,
          previousTimeStamp: horloge - 16,
        },
      ],
      numberActiveTouches: actif ? 1 : 0,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: horloge,
    },
  };
};

const zone = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root
    .findAllByType(View)
    .find(
      (n) =>
        n.props.accessibilityLabel === label &&
        typeof n.props.onResponderGrant === 'function',
    )!;

/** Glisse un doigt dans une zone, de (0,0) à (dx,dy), et le garde posé. */
const glisser = (z: TestRenderer.ReactTestInstance, dx: number, dy: number) => {
  act(() => {
    z.props.onStartShouldSetResponder(doigt(60, 60, 60, 60));
    z.props.onResponderGrant(doigt(60, 60, 60, 60));
    z.props.onResponderMove(doigt(60, 60, 60 + dx, 60 + dy));
  });
};
const lever = (z: TestRenderer.ReactTestInstance, dx: number, dy: number) => {
  act(() => z.props.onResponderRelease(doigt(60, 60, 60 + dx, 60 + dy, false)));
};

describe('on y entre depuis le plan', () => {
  it('la pastille « Explorer » est sur le plan, en 2D comme en 3D', () => {
    const t = monter();
    expect(t.root.findAllByType(TouchableOpacity).some((n) => n.props.accessibilityLabel === 'Explorer')).toBe(true);
    presser(t, 'Passer en 3D');
    expect(t.root.findAllByType(TouchableOpacity).some((n) => n.props.accessibilityLabel === 'Explorer')).toBe(true);
  });

  it('et elle ouvre la pièce à hauteur d’œil', () => {
    const t = monter();
    expect(camera(t)).toBeUndefined();
    presser(t, 'Explorer');
    const cam = camera(t);
    expect(cam).toBeDefined();
    expect(cam.at.y).toBeCloseTo(HAUTEUR_OEIL, 6);
    expect(Number.isFinite(cam.at.x) && Number.isFinite(cam.at.z)).toBe(true);
  });

  it('avec la consigne des deux pouces, tant qu’on n’a pas bougé', () => {
    const t = monter();
    presser(t, 'Explorer');
    const lus = t.root.findAllByType(Text).map((n) => String(n.props.children));
    expect(lus.some((m) => /pouce gauche/i.test(m))).toBe(true);
  });
});

describe('les deux pouces', () => {
  it('la manette fait avancer DANS LE SENS DU REGARD', () => {
    /*
      Pousser vers le haut de l'écran, c'est avancer vers ce qu'on regarde —
      pas vers le haut du plan. C'est toute la différence entre un jeu et
      une carte qu'on fait glisser.
    */
    const t = monter();
    presser(t, 'Explorer');
    const avant = camera(t);
    const manette = zone(t, 'Marcher');
    glisser(manette, 0, -50); // pouce poussé vers le haut : avancer
    act(() => jest.advanceTimersByTime(600));
    lever(manette, 0, -50);
    act(() => jest.advanceTimersByTime(100));
    const apres = camera(t);
    const dx = apres.at.x - avant.at.x;
    const dz = apres.at.z - avant.at.z;
    expect(Math.hypot(dx, dz)).toBeGreaterThan(0.1);
    // Dans le sens du regard : l'avant de la caméra est (sin lacet, cos lacet).
    const f = { x: Math.sin(avant.yaw), z: Math.cos(avant.yaw) };
    expect((dx * f.x + dz * f.z) / Math.hypot(dx, dz)).toBeGreaterThan(0.8);
  });

  it('pouce levé, plus rien ne bouge', () => {
    const t = monter();
    presser(t, 'Explorer');
    const manette = zone(t, 'Marcher');
    glisser(manette, 0, -50);
    act(() => jest.advanceTimersByTime(300));
    lever(manette, 0, -50);
    act(() => jest.advanceTimersByTime(100));
    const pose = camera(t).at;
    act(() => jest.advanceTimersByTime(800));
    expect(camera(t).at).toEqual(pose);
  });

  it('le pouce droit tourne la tête', () => {
    const t = monter();
    presser(t, 'Explorer');
    const avant = camera(t).yaw;
    const regard = zone(t, 'Regarder autour');
    glisser(regard, 120, 0);
    lever(regard, 120, 0);
    act(() => jest.advanceTimersByTime(50));
    // Glisser vers la droite tourne vers la droite : le lacet croît.
    expect(camera(t).yaw).toBeGreaterThan(avant + 0.3);
  });

  it('et le regard ne se renverse jamais : ni le plafond, ni les pieds', () => {
    const t = monter();
    presser(t, 'Explorer');
    const regard = zone(t, 'Regarder autour');
    glisser(regard, 0, -4000);
    lever(regard, 0, -4000);
    act(() => jest.advanceTimersByTime(50));
    expect(Math.abs(camera(t).pitch)).toBeLessThanOrEqual(0.6 + 1e-9);
  });
});

describe('on en sort', () => {
  it('« Terminer » referme, et le plan est là où on l’a laissé', () => {
    const t = monter();
    const murs = useScanStore.getState().walls;
    presser(t, 'Explorer');
    const fin = t.root
      .findAll((n) => n.props?.accessibilityLabel === 'Terminer l’exploration' && typeof n.props?.onPress === 'function')[0];
    act(() => fin.props.onPress());
    act(() => jest.advanceTimersByTime(50));
    expect(camera(t)).toBeUndefined();
    // On a regardé ; on n'a rien changé.
    expect(useScanStore.getState().walls).toBe(murs);
  });
});

describe('la 3D sait tenir un intérieur', () => {
  const MURS = SNAPSHOT_WALLS;
  const PIECES = SNAPSHOT_ROOMS.map((r) => ({ id: r.id, wallIds: r.wallIds }));

  it('un plafond par pièce, à sa hauteur, tourné vers le sol', () => {
    const { faces } = buildScene(MURS, [], [], {
      palette: MAQUETTE,
      showSurfaces: true,
      rooms: PIECES,
      plafonds: true,
    });
    const plafonds = faces.filter((f) => f.isCeiling);
    expect(plafonds.length).toBeGreaterThan(0);
    for (const f of plafonds) {
      expect(f.normal?.y).toBe(-1);
      expect(f.pts.every((p) => p.y > 2)).toBe(true);
    }
  });

  it('vu de dedans, il se voit ; vu d’en haut, jamais', () => {
    /*
      C'est ce qui permet de les bâtir sans inquiéter la maquette : leur
      normale regarde le sol, si bien que la règle des faces de dos les
      retire dès que l'œil passe au-dessus.
    */
    const { faces } = buildScene(MURS, [], [], {
      palette: MAQUETTE,
      showSurfaces: true,
      rooms: PIECES,
      plafonds: true,
    });
    const plafond = faces.find((f) => f.isCeiling)!;
    const c = plafond.pts.reduce(
      (s, p) => ({ x: s.x + p.x / plafond.pts.length, z: s.z + p.z / plafond.pts.length }),
      { x: 0, z: 0 },
    );
    expect(dosTourne(plafond, { x: c.x, y: HAUTEUR_OEIL, z: c.z })).toBe(false);
    expect(dosTourne(plafond, { x: c.x, y: 12, z: c.z })).toBe(true);
  });

  it('et la maquette d’en haut n’en bâtit pas', () => {
    const { faces } = buildScene(MURS, [], [], {
      palette: MAQUETTE,
      showSurfaces: true,
      rooms: PIECES,
    });
    expect(faces.some((f) => f.isCeiling)).toBe(false);
  });
});

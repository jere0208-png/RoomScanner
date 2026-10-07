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
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ResultScreen } from '../src/screens/ResultScreen';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
import { HAUTEUR_OEIL } from '../src/geometry/exploration';
import { buildScene, dosTourne, povBase } from '../src/geometry/scene3d';
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
  DEUX POUCES SUR UNE SEULE VUE.

  La manette et le regard étaient deux responders, et React Native n'en
  accorde qu'un à la fois : « on ne peut pas se déplacer et tourner en même
  temps ». Une seule vue reçoit désormais tous les doigts et les départage
  par leur identifiant et leur moitié d'écran (à gauche on marche, à droite
  on regarde). On lui parle donc comme le système : des listes de touches.
  L'écran du banc fait 750 points de large : la moitié est à 375.
*/
const touche = (id: number, x: number, y: number) => ({
  identifier: id,
  pageX: x,
  pageY: y,
  locationX: x,
  locationY: y,
});
const evenement = (touches: ReturnType<typeof touche>[]) => ({
  nativeEvent: {
    touches,
    changedTouches: touches,
    pageX: touches[0]?.pageX ?? 0,
    pageY: touches[0]?.pageY ?? 0,
    timestamp: Date.now(),
  },
});
const pouces = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(View)
    .find(
      (n) =>
        n.props.accessibilityLabel === 'Marcher et regarder' &&
        typeof n.props.onResponderGrant === 'function',
    )!;
const poser = (z: TestRenderer.ReactTestInstance, touches: ReturnType<typeof touche>[]) =>
  act(() => {
    z.props.onStartShouldSetResponder(evenement(touches));
    z.props.onResponderGrant(evenement(touches));
  });
const ajouter = (z: TestRenderer.ReactTestInstance, touches: ReturnType<typeof touche>[]) =>
  act(() => z.props.onResponderStart(evenement(touches)));
const bouger = (z: TestRenderer.ReactTestInstance, touches: ReturnType<typeof touche>[]) =>
  act(() => z.props.onResponderMove(evenement(touches)));
const lever = (z: TestRenderer.ReactTestInstance, restantes: ReturnType<typeof touche>[] = []) =>
  act(() => {
    if (restantes.length) z.props.onResponderEnd(evenement(restantes));
    else z.props.onResponderRelease(evenement([]));
  });
const GAUCHE = { x: 120, y: 900 };
const DROITE = { x: 560, y: 640 };

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
    const z = pouces(t);
    poser(z, [touche(0, GAUCHE.x, GAUCHE.y)]);
    bouger(z, [touche(0, GAUCHE.x, GAUCHE.y - 50)]); // pouce poussé vers le haut : avancer
    act(() => jest.advanceTimersByTime(600));
    lever(z);
    act(() => jest.advanceTimersByTime(100));
    const apres = camera(t);
    const dx = apres.at.x - avant.at.x;
    const dz = apres.at.z - avant.at.z;
    expect(Math.hypot(dx, dz)).toBeGreaterThan(0.1);
    // Dans le sens du regard : l'avant de la caméra est (sin lacet, cos lacet).
    const f = { x: Math.sin(avant.yaw), z: Math.cos(avant.yaw) };
    expect((dx * f.x + dz * f.z) / Math.hypot(dx, dz)).toBeGreaterThan(0.8);
  });

  it('la manette naît sous le pouce, en verre, et s’efface quand il se lève', () => {
    const t = monter();
    presser(t, 'Explorer');
    const baton = () => t.root.findAll((n) => n.props?.accessibilityLabel === 'Manette');
    expect(baton()).toHaveLength(0);
    const z = pouces(t);
    poser(z, [touche(0, GAUCHE.x, GAUCHE.y)]);
    expect(baton().length).toBeGreaterThan(0);
    // Elle est LÀ où le pouce s'est posé, pas dans un coin.
    const style = StyleSheet.flatten(baton()[0].props.style) as { left: number; top: number };
    expect(style.left).toBeCloseTo(GAUCHE.x - 58, 0);
    expect(style.top).toBeCloseTo(GAUCHE.y - 58, 0);
    lever(z);
    expect(baton()).toHaveLength(0);
  });

  it('pouce levé, plus rien ne bouge', () => {
    const t = monter();
    presser(t, 'Explorer');
    const z = pouces(t);
    poser(z, [touche(0, GAUCHE.x, GAUCHE.y)]);
    bouger(z, [touche(0, GAUCHE.x, GAUCHE.y - 50)]);
    act(() => jest.advanceTimersByTime(300));
    lever(z);
    act(() => jest.advanceTimersByTime(100));
    const pose = camera(t).at;
    act(() => jest.advanceTimersByTime(800));
    expect(camera(t).at).toEqual(pose);
  });

  it('le pouce droit tourne la tête', () => {
    const t = monter();
    presser(t, 'Explorer');
    const avant = camera(t).yaw;
    const z = pouces(t);
    poser(z, [touche(0, DROITE.x, DROITE.y)]);
    bouger(z, [touche(0, DROITE.x + 120, DROITE.y)]);
    lever(z);
    act(() => jest.advanceTimersByTime(50));
    // Glisser vers la droite tourne vers la droite. Le lacet compte depuis
    // +z vers +x ; or la droite de qui regarde +z est −x (le plan est une
    // vue de dessus, z vers le bas de la feuille) : le lacet DÉCROÎT.
    expect(camera(t).yaw).toBeLessThan(avant - 0.3);
    const b = povBase(camera(t));
    // Et ce qu'on voit à droite est bien à droite : droite = avant × haut.
    expect(b.droite.x).toBeCloseTo(b.avant.y * b.haut.z - b.avant.z * b.haut.y, 9);
    expect(b.droite.z).toBeCloseTo(b.avant.x * b.haut.y - b.avant.y * b.haut.x, 9);
  });

  it('et le regard ne se renverse jamais : ni le plafond, ni les pieds', () => {
    const t = monter();
    presser(t, 'Explorer');
    const z = pouces(t);
    poser(z, [touche(0, DROITE.x, DROITE.y)]);
    bouger(z, [touche(0, DROITE.x, DROITE.y - 4000)]);
    lever(z);
    act(() => jest.advanceTimersByTime(50));
    expect(Math.abs(camera(t).pitch)).toBeLessThanOrEqual(0.6 + 1e-9);
  });

  it('ET LES DEUX À LA FOIS : on marche en tournant la tête', () => {
    /*
      Relevé du patron : « on ne peut pas se déplacer et tourner en même
      temps ». Deux doigts, un seul geste : le gauche pousse, le droit
      glisse, dans le même événement — et la caméra avance ET tourne.
    */
    const t = monter();
    presser(t, 'Explorer');
    const avant = camera(t);
    const z = pouces(t);
    poser(z, [touche(0, GAUCHE.x, GAUCHE.y)]);
    ajouter(z, [touche(0, GAUCHE.x, GAUCHE.y), touche(1, DROITE.x, DROITE.y)]);
    for (let k = 1; k <= 6; k++) {
      bouger(z, [
        touche(0, GAUCHE.x, GAUCHE.y - 50),
        touche(1, DROITE.x + 20 * k, DROITE.y),
      ]);
      act(() => jest.advanceTimersByTime(100));
    }
    lever(z, [touche(0, GAUCHE.x, GAUCHE.y - 50)]); // le droit se lève, le gauche pousse encore
    act(() => jest.advanceTimersByTime(200));
    lever(z);
    act(() => jest.advanceTimersByTime(100));
    const apres = camera(t);
    expect(Math.hypot(apres.at.x - avant.at.x, apres.at.z - avant.at.z)).toBeGreaterThan(0.1);
    expect(apres.yaw).toBeLessThan(avant.yaw - 0.3);
  });

  it('un doigt posé du mauvais côté prend le rôle qui reste', () => {
    // Deux pouces à gauche : le second regarde quand même — on ne laisse
    // pas un doigt sans emploi.
    const t = monter();
    presser(t, 'Explorer');
    const avant = camera(t).yaw;
    const z = pouces(t);
    poser(z, [touche(0, GAUCHE.x, GAUCHE.y)]);
    ajouter(z, [touche(0, GAUCHE.x, GAUCHE.y), touche(1, GAUCHE.x + 60, GAUCHE.y - 200)]);
    bouger(z, [touche(0, GAUCHE.x, GAUCHE.y), touche(1, GAUCHE.x + 180, GAUCHE.y - 200)]);
    lever(z);
    expect(camera(t).yaw).toBeLessThan(avant - 0.3);
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

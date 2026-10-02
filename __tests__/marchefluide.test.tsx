/**
 * LA MARCHE NE DOIT PAS RECLASSER TOUT LE LOGEMENT À CHAQUE PAS.
 *
 * Relevé du patron : l'application « semble trop fébrile ». Mesuré au banc,
 * une image de l'exploration coûtait 25 ms de calcul sous Node — un moteur
 * qui compile à la volée. Sur le téléphone, Hermes n'a pas de compilation à
 * la volée : il faut compter plusieurs fois plus, et la marche descendait
 * sous les dix images par seconde. C'est très exactement une app fébrile.
 *
 * La moitié de ce coût est le CLASSEMENT des pans à l'écran (`ajusterBlocs`).
 * La vue orbitale avait déjà appris à s'en passer sous le doigt : un ordre
 * juste à un angle le reste quelques degrés plus loin, et l'ordre exact
 * revient dès que la vue se pose. La vue à la première personne n'en
 * profitait pas — elle n'a pas de doigt sur elle, l'exploration la pilote —
 * et reclassait tout, à chaque pas.
 *
 * Désormais l'exploration le lui dit (`enMarche`) : pendant qu'on marche ou
 * qu'on tourne la tête, l'ordre se réutilise tant qu'on n'a bougé que de
 * quelques centimètres et de quelques degrés ; pouce levé, l'image arrêtée
 * reprend son ordre EXACT. Une image fixe, on la regarde.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import * as scene3d from '../src/geometry/scene3d';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
import { cadenceDeMarche } from '../src/components/Exploration';
import {
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  jest.restoreAllMocks();
});

const camera = (k: number, pas = 0.005, tour = 0.0025) => ({
  at: { x: 1 + k * pas, y: 1.6, z: 1 + k * pas },
  yaw: 0.6 + k * tour,
  pitch: -0.12,
  fov: 1.2,
});

/** Monte la 3D à hauteur d'œil, puis la fait avancer de `n` petits pas. */
const marcher = (n: number, enMarche: boolean, pas?: number, tour?: number) => {
  act(() =>
    useScanStore.setState({
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r) => ({ id: r.id, name: 'P', floor: null })),
      fixtures: [],
      ceiling: [],
    }),
  );
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<Iso3DView pov={camera(0)} enMarche={enMarche} showMeasures={false} showNorth={false} />);
  });
  arbre = t;
  act(() => {
    for (const v of t.root.findAllByType(View)) {
      if (typeof v.props.onLayout === 'function') {
        v.props.onLayout({ nativeEvent: { layout: { width: 390, height: 844 } } });
      }
    }
  });
  const espion = jest.spyOn(scene3d, 'ajusterBlocs');
  for (let k = 1; k <= n; k++) {
    act(() =>
      t.update(
        <Iso3DView pov={camera(k, pas, tour)} enMarche={enMarche} showMeasures={false} showNorth={false} />,
      ),
    );
  }
  return { t, espion };
};

describe('en marchant, l’ordre de peinture se réutilise', () => {
  it('vingt petits pas ne reclassent pas vingt fois', () => {
    const { espion } = marcher(20, true);
    expect(espion.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('mais un grand déplacement reclasse : on ne peint pas une pièce avec l’ordre d’une autre', () => {
    // Quarante centimètres à chaque pas : chaque image est trop loin de la
    // précédente pour en hériter.
    const { espion } = marcher(6, true, 0.4, 0);
    expect(espion.mock.calls.length).toBe(6);
  });

  it('et un grand tour de tête aussi', () => {
    const { espion } = marcher(6, true, 0, 0.3);
    expect(espion.mock.calls.length).toBe(6);
  });
});

describe('à l’arrêt, l’ordre exact', () => {
  it('sans marche, chaque image est classée pour elle-même', () => {
    const { espion } = marcher(8, false);
    expect(espion.mock.calls.length).toBe(8);
  });

  it('et le pouce qui se lève reclasse l’image où l’on s’arrête', () => {
    const { t, espion } = marcher(10, true);
    const avant = espion.mock.calls.length;
    act(() =>
      t.update(<Iso3DView pov={camera(10)} enMarche={false} showMeasures={false} showNorth={false} />),
    );
    expect(espion.mock.calls.length).toBe(avant + 1);
  });
});

describe('la cadence suit ce que coûte une image', () => {
  /*
    Demander une image toutes les 33 ms quand chacune en coûte 80, c'est
    occuper le fil JavaScript sans relâche : les pouces n'y trouvent plus de
    place, la manette répond en retard, et c'est ÇA qui se sent fébrile. On
    laisse donc un tiers du temps libre, sans jamais descendre sous trente
    images par seconde quand le téléphone les tient, ni monter au-delà de
    huit par seconde au pire.
  */
  it('trente images par seconde quand le téléphone suit', () => {
    expect(cadenceDeMarche(5)).toBe(33);
    expect(cadenceDeMarche(0)).toBe(33);
  });
  it('un tiers de répit quand il peine', () => {
    expect(cadenceDeMarche(60)).toBe(90);
  });
  it('jamais moins de huit images par seconde', () => {
    expect(cadenceDeMarche(400)).toBe(125);
    expect(cadenceDeMarche(NaN)).toBe(33);
  });
});

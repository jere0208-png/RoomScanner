/**
 * HORS DU MODE ÉLECTRICITÉ, NI DEVIS NI NORME ÉLECTRIQUE — nulle part.
 *
 * Relevé du patron : « le bouton devis ne doit pas être visible en mode non
 * électricien sur les plans ; idem pour les normes qui concernent
 * l'électricité, elles ne doivent pas être comptées ».
 *
 * L'écran du plan les taisait déjà (voir `modeelectricite`). Ce banc tient
 * les deux autres endroits qui comptent : la liste des constats que le
 * contrôle du plan reçoit, et la page d'un mur — qui comptait encore ses
 * socles et ses « points à revoir » quel que soit le mode.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('react-native-room-scan', () => ({
  RoomScan: { takePhoto: jest.fn(async () => null), pause: jest.fn() },
  scanEvents: { addListener: jest.fn(), removeAllListeners: jest.fn() },
}));

import React from 'react';
import { Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useUsage } from '../src/store/usage';
import { useScanStore } from '../src/store/scanStore';
import { ResultScreen } from '../src/screens/ResultScreen';
import { WallElevation } from '../src/components/WallElevation';
import { DiagnosticSheet, type Constat } from '../src/components/DiagnosticSheet';
import type { WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';
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

const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .join(' | ');

function plan(modeElec: boolean) {
  useUsage.setState({ charge: true, modeElec, choisi: true });
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      screen: 'result',
      scanName: 'Appartement',
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: `Pièce ${i + 1}`, floor: null })),
      // Un plan équipé, et en défaut : il y a de quoi compter.
      fixtures: SNAPSHOT_FIXTURES.slice(0, 1),
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

const constatsDuControle = (t: TestRenderer.ReactTestRenderer): Constat[] =>
  t.root.findByType(DiagnosticSheet).props.issues;

describe('le contrôle du plan', () => {
  it('sans le mode, il ne reçoit aucun constat électrique', () => {
    const t = plan(false);
    const constats = constatsDuControle(t);
    expect(constats.some((c) => c.key.startsWith('e'))).toBe(false);
  });

  it('avec le mode, il les reçoit — le plan d’essai en porte', () => {
    const t = plan(true);
    expect(constatsDuControle(t).some((c) => c.key.startsWith('e'))).toBe(true);
  });

  it('et sans le mode, aucune pastille de devis ni de contrôle', () => {
    const t = plan(false);
    const etiquettes = t.root
      .findAll((n) => typeof n.props.accessibilityLabel === 'string')
      .map((n) => n.props.accessibilityLabel as string);
    expect(etiquettes.some((l) => /devis|contr[ôo]le|NF C|norme/i.test(l))).toBe(false);
  });
});

describe('la page d’un mur', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
    roomId: 'r1',
  });
  const W = [mur('n', 0, 0, 6, 0), mur('e', 6, 0, 6, 4), mur('s', 6, 4, 0, 4), mur('w', 0, 4, 0, 0)];
  // Une chambre avec un seul socle : la norme en exige trois.
  const UNE_PRISE: Fixture[] = [
    { id: 'f1', kind: 'prise', wallId: 'n', along: 1, height: 0.3, side: 1 } as Fixture,
  ];

  function page(modeElec: boolean) {
    useUsage.setState({ charge: true, modeElec, choisi: true });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        walls: W,
        openings: [],
        objects: [],
        rooms: [{ id: 'r1', name: 'Chambre', floor: null }],
        fixtures: UNE_PRISE,
        photos: [],
      });
      t = TestRenderer.create(
        <WallElevation wallId="n" selectedId={null} onSelect={() => {}} onClose={() => {}} />,
      );
    });
    act(() => {
      const zone = t.root.findAllByType(View).find((n) => typeof n.props.onLayout === 'function')!;
      zone.props.onLayout({ nativeEvent: { layout: { width: 700, height: 420 } } });
    });
    arbre = t;
    return t;
  }

  it('avec le mode, elle compte les socles de la pièce', () => {
    expect(mots(page(true))).toMatch(/socle/);
  });

  it('sans le mode, elle ne compte rien', () => {
    const vu = mots(page(false));
    expect(vu).not.toMatch(/socle/);
    expect(vu).not.toMatch(/à revoir/);
  });
});

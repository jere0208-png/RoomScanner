/**
 * LA PIECE QU'ON POSE NE TOMBE PAS SUR CELLES QUI SONT LA.
 *
 * Essai au doigt, sur le relevé de reference : « Ajouter une piece » → WC.
 * Elle se pose AU MILIEU de l'emprise du plan — la ou l'oeil est deja, ce
 * qui est juste — mais le milieu d'un logement, c'est le sejour. Le
 * rectangle neuf tombe donc en plein dans une piece existante, ses quatre
 * traits pointilles se melent aux murs, et le premier geste demande est de
 * la sortir de la.
 *
 * On garde le principe — elle se pose SOUS LES YEUX, jamais hors du cadre,
 * sinon on retombe sur « le bouton ne fait rien » — et on cherche la place
 * libre la plus proche du milieu. Si le logement est plein, elle revient au
 * milieu : mieux vaut une piece a deplacer qu'une piece invisible.
 *
 * ET LE BANDEAU DIT LE GESTE. Releve du patron sur le meme bouton : « ne
 * montre pas qu'il faut creer la piece ». Tant qu'elle est neuve, sa barre
 * annonce ce qui l'attend — pousser, tirer les cotes — au lieu de la laisser
 * deviner.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { RoomBar } from '../src/components/RoomBar';
import { light } from '../src/theme';
import { getStyles } from '../src/screens/result/styles';
import { useScanStore } from '../src/store/scanStore';
import { roomExtent, roomParts } from '../src/geometry/floorplan';
import { ResultScreen } from '../src/screens/ResultScreen';
import {
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

const st = () => useScanStore.getState();

/** L'emprise au sol d'une piece, en metres. */
const emprise = (roomId: string) => {
  const murs = st().walls.filter((w) => w.roomId === roomId);
  const xs = murs.flatMap((w) => [w.a.x, w.b.x]);
  const zs = murs.flatMap((w) => [w.a.z, w.b.z]);
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    z0: Math.min(...zs),
    z1: Math.max(...zs),
  };
};

const seChevauchent = (
  a: { x0: number; x1: number; z0: number; z1: number },
  b: { x0: number; x1: number; z0: number; z1: number },
) => a.x0 < b.x1 - 0.01 && a.x1 > b.x0 + 0.01 && a.z0 < b.z1 - 0.01 && a.z1 > b.z0 + 0.01;

beforeEach(() => {
  mockMagasin.clear();
  st().reset();
  st().commencerAuClavier();
});

describe('ou se pose une piece neuve', () => {
  it('ne tombe pas dans une piece existante', () => {
    // Un logement de deux pieces cote a cote : son milieu est en plein
    // dedans, sur la cloison mitoyenne.
    const a = st().addRoomRect({ x: 0, z: 0 }, { x: 4, z: 3 }, 'Sejour')!;
    const b = st().addRoomRect({ x: 4, z: 0 }, { x: 8, z: 3 }, 'Cuisine')!;
    const id = st().addRoomLibre(1.4, 1, 'WC')!;
    const neuve = emprise(id);
    expect(seChevauchent(neuve, emprise(a))).toBe(false);
    expect(seChevauchent(neuve, emprise(b))).toBe(false);
  });

  it('mais reste SOUS LES YEUX, dans l’emprise du plan', () => {
    const a = st().addRoomRect({ x: 0, z: 0 }, { x: 4, z: 3 }, 'Sejour')!;
    const b = st().addRoomRect({ x: 4, z: 0 }, { x: 8, z: 3 }, 'Cuisine')!;
    const plan = {
      x0: Math.min(emprise(a).x0, emprise(b).x0),
      x1: Math.max(emprise(a).x1, emprise(b).x1),
      z0: Math.min(emprise(a).z0, emprise(b).z0),
      z1: Math.max(emprise(a).z1, emprise(b).z1),
    };
    const n = emprise(st().addRoomLibre(1.4, 1, 'WC')!);
    // Le cadrage du plan est fige sur ce qui existait : une piece posee
    // au-dela ne se verrait pas. Une marge d'une piece est tolerable, pas
    // davantage.
    expect(n.x0).toBeGreaterThan(plan.x0 - 2);
    expect(n.x1).toBeLessThan(plan.x1 + 2);
    expect(n.z0).toBeGreaterThan(plan.z0 - 2);
    expect(n.z1).toBeLessThan(plan.z1 + 2);
  });

  it('garde les cotes demandees, ou qu’elle se pose', () => {
    st().addRoomRect({ x: 0, z: 0 }, { x: 4, z: 3 }, 'Sejour');
    const id = st().addRoomLibre(1.4, 1, 'WC')!;
    const p = roomParts(st().walls, st().rooms).find((x) => x.roomId === id)!;
    const e = roomExtent(p.surface!.pts);
    expect(Math.max(e.width, e.depth)).toBeCloseTo(1.4, 2);
    expect(Math.min(e.width, e.depth)).toBeCloseTo(1, 2);
  });

  it('et se pose quand meme si le logement est plein', () => {
    // Une piece qui couvre tout : plus une place libre. On la pose au
    // milieu plutot que de ne rien poser du tout.
    st().addRoomRect({ x: 0, z: 0 }, { x: 12, z: 10 }, 'Plateau');
    const id = st().addRoomLibre(3, 3, 'Chambre');
    expect(id).toBeTruthy();
  });
});

describe('le bandeau d’une piece neuve', () => {
  const styles = getStyles(light);
  const monter = (neuve: boolean) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <RoomBar
          room={{ id: 'r1', name: 'WC', neuve }}
          surface={{ area: 1.4, exact: true }}
          extent={{ width: 1.4, depth: 1 }}
          hauteur={2.5}
          styles={styles as never}
          onName={() => {}}
          onHeight={() => {}}
          onDupliquer={() => {}}
        onScinder={() => {}}
        onPeindre={() => {}}
        />,
      );
    });
    return t;
  };
  const mots = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAllByType(Text)
      .map((n) =>
        (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
          .filter((x: unknown) => typeof x === 'string')
          .join(''),
      )
      .join(' | ');

  it('annonce le geste tant qu’elle n’est pas arretee', () => {
    const vu = mots(monter(true));
    expect(vu).toMatch(/Poussez/);
    expect(vu).toMatch(/côtés/);
  });

  it('et se tait sur une pièce arrêtée', () => {
    expect(mots(monter(false))).not.toMatch(/Poussez/);
  });
});

/**
 * UNE SEULE PIECE EN POINTILLES A LA FOIS.
 *
 * Deux « Ajouter une piece » de suite laissaient la premiere ouverte : son
 * trait restait pointille pour toujours alors qu'on ne la reglait plus, et
 * ses quatre poignees restaient armees. Le pointille dit « en cours » ; il ne
 * peut pas mentir sur deux pieces a la fois.
 */
describe('deux poses de suite, depuis l’ecran', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  let arbre: TestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => arbre?.unmount());
    arbre = null;
  });

  const poser = (t: TestRenderer.ReactTestRenderer) => {
    // Le menu « Plus », puis l'action, puis un gabarit du catalogue.
    const plus = t.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Plus')!;
    act(() => plus.props.onPress());
    act(() => jest.advanceTimersByTime(600));
    const item = t.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .filter((n) =>
        n.findAllByType(Text).some((x) => x.props.children === 'Ajouter une pièce'),
      )
      .pop()!;
    act(() => item.props.onPress());
    act(() => jest.advanceTimersByTime(600));
    const wc = t.root
      .findAll((n) => n.props?.accessibilityLabel === 'WC' && typeof n.props?.onPress === 'function')[0];
    act(() => wc.props.onPress());
    act(() => jest.advanceTimersByTime(600));
  };

  it('n’en laisse qu’une seule ouverte', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        screen: 'result',
        scanName: 'Chantier',
        walls: SNAPSHOT_WALLS,
        openings: SNAPSHOT_OPENINGS,
        objects: SNAPSHOT_OBJECTS,
        rooms: SNAPSHOT_ROOMS.map((r, i) => ({
          id: r.id,
          name: `Piece ${i + 1}`,
          floor: null,
        })),
        fixtures: [],
        ceiling: [],
        photos: [],
        showFurniture: true,
      });
      t = TestRenderer.create(<ResultScreen />);
    });
    act(() => {
      for (const n of t.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 560 } } });
        }
      }
    });
    arbre = t;
    poser(t);
    expect(st().rooms.filter((r) => r.neuve)).toHaveLength(1);
    poser(t);
    // Deux pieces posees, une seule en pointilles : la derniere.
    expect(st().rooms.filter((r) => r.neuve)).toHaveLength(1);
  });
});

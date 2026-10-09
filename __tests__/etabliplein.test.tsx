/**
 * L'ÉTABLI EN PAGE ENTIÈRE — le dock qui pose, la fiche qui règle.
 *
 * Relevé du patron : « revois complètement la page de placement d'appareils
 * électriques sur un mur ; fais une page entière et complètement refaite,
 * plus ludique, plus moderne, en cohérence avec nos avancées ».
 *
 * L'ancien chemin : un bouton « Ajouter », un catalogue dans une seconde
 * fenêtre, et l'appareil tombait à vingt centimètres du coin bas gauche —
 * à traîner ensuite jusqu'où on le voulait. Le nouveau : les appareils sont
 * DANS la page, en images, famille par famille, et un appui pose l'appareil
 * là où l'on regarde, à sa hauteur type, sur une place libre — choisi, prêt
 * à glisser ou à coter.
 *
 * Ce banc tient :
 *   — la pose d'un appui : au milieu du mur (ou du retour visé), à la
 *     hauteur du type, sans jamais tomber sur un appareil déjà posé ;
 *   — le dock qui devient la fiche de l'appareil tenu, et ses hauteurs
 *     d'un appui ;
 *   — les gestes qui n'apparaissent que là où ils peuvent agir ;
 *   — la pastille de la pièce, qui déplie sa règle et son correctif ;
 *   — la fenêtre qui porte l'établi : bord à bord, sans voile qui
 *     fermerait au moindre appui à côté.
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
    takePhoto: jest.fn(async () => null),
  },
  scanEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  laserEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  RoomScanView: 'RoomScanView',
}));

import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { WallElevation } from '../src/components/WallElevation';
import { ElecSheet } from '../src/screens/result/ElecSheet';
import { useScanStore } from '../src/store/scanStore';
import {
  FIXTURES,
  FIXTURE_FAMILIES,
  faceX,
  fromFaceX,
  interiorSide,
  overlaps,
  wallFace,
  type Fixture,
} from '../src/geometry/electrical';
import { wallQuadsOf, type WallSeg } from '../src/geometry/floorplan';

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

/** Une chambre de 4,86 × 3,60. */
const W: WallSeg[] = [
  mur('n', 0, 0, 4.86, 0),
  mur('e', 4.86, 0, 4.86, 3.6),
  mur('s', 4.86, 3.6, 0, 3.6),
  mur('o', 0, 3.6, 0, 0),
];

/** La face intérieure du mur nord, telle que l'établi la voit. */
const faceNord = () => {
  const st = useScanStore.getState();
  const w = st.walls.find((x) => x.id === 'n')!;
  return wallFace(w, wallQuadsOf(st.walls).get('n'), interiorSide(w, st.walls, st.rooms));
};

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

/** L'établi, avec sa sélection tenue comme le fait l'écran des résultats. */
const ref: { choisi: string | null; liens: string[] } = { choisi: null, liens: [] };
function Etabli({ depart, focusX }: { depart: string | null; focusX?: number }) {
  const [choisi, setChoisi] = useState<string | null>(depart);
  ref.choisi = choisi;
  return (
    <WallElevation
      wallId="n"
      focusX={focusX}
      selectedId={choisi}
      onSelect={setChoisi}
      onLinkRequest={(id) => ref.liens.push(id)}
      onClose={() => {}}
    />
  );
}

const monter = (
  opts: { fixtures?: Fixture[]; depart?: string | null; nom?: string; focusX?: number; openings?: WallSeg[] } = {},
) => {
  ref.choisi = null;
  ref.liens = [];
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      walls: W,
      openings: opts.openings ?? [],
      objects: [],
      rooms: [{ id: 'r1', name: opts.nom ?? 'Chambre', floor: null }] as never,
      fixtures: opts.fixtures ?? [],
      ceiling: [],
      photos: [],
      showFurniture: true,
    });
    t = TestRenderer.create(<Etabli depart={opts.depart ?? null} focusX={opts.focusX} />);
  });
  act(() => {
    const zone = t.root.findAllByType(View).find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: 390, height: 420 } } });
  });
  arbre = t;
  return t;
};

const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAllByType(TouchableOpacity).find((n) => n.props.accessibilityLabel === label);
const appuyer = (t: TestRenderer.ReactTestRenderer, label: string) => {
  const b = bouton(t, label);
  if (!b) throw new Error(`pas de bouton « ${label} »`);
  act(() => {
    b.props.onPress();
  });
};
const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : n.props.children))
    .filter((x) => typeof x === 'string')
    .join(' | ');

const prise = (id: string, along: number, height = 0.25): Fixture => ({
  id,
  kind: 'prise',
  wallId: 'n',
  along,
  height,
  side: 1,
});

describe('un appui pose l’appareil là où l’on regarde', () => {
  it('au milieu du mur, à la hauteur de son type, et il arrive choisi', () => {
    const t = monter();
    appuyer(t, `Poser ${FIXTURES.prise.label}`);
    const poses = useScanStore.getState().fixtures;
    expect(poses).toHaveLength(1);
    const f = poses[0];
    expect(f.kind).toBe('prise');
    expect(f.height).toBeCloseTo(FIXTURES.prise.std, 6);
    const face = faceNord();
    expect(faceX(face, f.along)).toBeCloseTo(face.len / 2, 2);
    // Choisi : le dock est devenu sa fiche.
    expect(ref.choisi).toBe(f.id);
    expect(textes(t)).toContain('Gauche');
    expect(textes(t)).not.toContain('Poser un appareil');
  });

  it('jamais sur un appareil déjà posé : il prend la première place libre à côté', () => {
    const t = monter();
    // Une prise occupe déjà le milieu du mur, à hauteur de plinthe.
    const face = faceNord();
    act(() => {
      useScanStore.setState({ fixtures: [prise('a', fromFaceX(face, face.len / 2))] });
    });
    appuyer(t, `Poser ${FIXTURES.prise.label}`);
    const [a, b] = useScanStore.getState().fixtures;
    expect(b).toBeDefined();
    expect(
      overlaps(
        { x: faceX(face, a.along), y: a.height, kind: a.kind },
        { x: faceX(face, b.along), y: b.height, kind: b.kind },
      ),
    ).toBe(false);
    // Pas une plaque commune improvisée : deux appareils distincts, et
    // proches — un quart de mètre, pas l'autre bout du mur.
    expect(b.group).toBeUndefined();
    expect(Math.abs(faceX(face, b.along) - face.len / 2)).toBeLessThanOrEqual(0.26);
  });

  it('sur le retour visé, quand on vient d’un tableau de porte', () => {
    const PORTE: WallSeg = {
      id: 'p1',
      type: 'door',
      a: { x: 2, z: 0 },
      b: { x: 2.9, z: 0 },
      height: 2.04,
      yCenter: 1.02,
      roomId: 'r1',
    };
    // Le retour de droite, entre la porte et le mur est.
    const t = monter({ openings: [PORTE], focusX: 4 });
    appuyer(t, `Poser ${FIXTURES.prise.label}`);
    const f = useScanStore.getState().fixtures[0];
    const x = faceX(faceNord(), f.along);
    // Ni dans la baie, ni sur le retour de gauche : sur celui qu'on visait.
    expect(x).toBeGreaterThan(2.9);
  });
});

describe('le dock, famille par famille', () => {
  it('montre les prises d’abord, puis chaque famille d’un appui', () => {
    const t = monter();
    for (const k of FIXTURE_FAMILIES[0].kinds) expect(bouton(t, `Poser ${FIXTURES[k].label}`)).toBeDefined();
    const autre = FIXTURE_FAMILIES[1];
    appuyer(t, `Famille ${autre.name}`);
    for (const k of autre.kinds) expect(bouton(t, `Poser ${FIXTURES[k].label}`)).toBeDefined();
    // Et la famille quittée ne s'empile pas dessous.
    expect(bouton(t, `Poser ${FIXTURES[FIXTURE_FAMILIES[0].kinds[0]].label}`)).toBeUndefined();
  });

  it('chaque carte dit la hauteur où l’appareil arrivera', () => {
    const t = monter();
    expect(textes(t)).toContain(`${Math.round(FIXTURES.prise.std * 100)} cm`);
  });

  it('toutes ses commandes font 44 points sous le doigt', () => {
    const t = monter();
    const cible = (n: TestRenderer.ReactTestInstance) => {
      const st = (StyleSheet.flatten(n.props.style) ?? {}) as { height?: number; minHeight?: number };
      const base = st.minHeight ?? st.height ?? 0;
      const s = n.props.hitSlop ?? {};
      return base === 0 ? 44 : base + (s.top ?? 0) + (s.bottom ?? 0);
    };
    for (const b of t.root.findAllByType(TouchableOpacity)) expect(cible(b)).toBeGreaterThanOrEqual(44);
  });
});

describe('la fiche de l’appareil tenu', () => {
  it('pose les hauteurs d’un appui, celle du type en tête', () => {
    const t = monter({ fixtures: [prise('a', 1)], depart: 'a' });
    expect(bouton(t, '25 cm')).toBeDefined();
    appuyer(t, '110 cm');
    expect(useScanStore.getState().fixtures[0].height).toBeCloseTo(1.1, 6);
    expect(textes(t)).toContain('Type · 25');
  });

  it('dit franchement une hauteur hors règle', () => {
    const t = monter({ fixtures: [prise('a', 1, 0.02)], depart: 'a' });
    expect(textes(t)).toMatch(/Trop bas · la règle dit/);
  });

  it('se replie d’un geste, et le dock revient', () => {
    const t = monter({ fixtures: [prise('a', 1)], depart: 'a' });
    appuyer(t, 'Reposer l’appareil');
    expect(ref.choisi).toBeNull();
    expect(textes(t)).toContain('Poser un appareil');
  });

  it('ne montre « Lier » qu’à ce qui se commande ou commande', () => {
    // Une prise réseau ne se commande pas, et ne commande rien.
    const t1 = monter({
      fixtures: [{ id: 'r', kind: 'rj45', wallId: 'n', along: 1, height: 0.25, side: 1 }],
      depart: 'r',
    });
    expect(bouton(t1, 'Lier')).toBeUndefined();
    act(() => t1.unmount());
    const t2 = monter({
      fixtures: [{ id: 'i', kind: 'inter', wallId: 'n', along: 1, height: 1.1, side: 1 }],
      depart: 'i',
    });
    appuyer(t2, 'Lier');
    expect(ref.liens).toEqual(['i']);
  });

  it('pendant la saisie d’une cote, elle se resserre : le mur reste visible au-dessus du clavier', () => {
    const t = monter({ fixtures: [prise('a', 1)], depart: 'a' });
    const champ = t.root.findAllByType(TextInput)[0];
    act(() => champ.props.onFocus());
    expect(bouton(t, 'Retirer')).toBeUndefined();
    expect(bouton(t, '110 cm')).toBeUndefined();
    // Les trois cotes, elles, restent.
    expect(t.root.findAllByType(TextInput)).toHaveLength(3);
    act(() => champ.props.onBlur());
    expect(bouton(t, 'Retirer')).toBeDefined();
  });

  it('« Retirer » retire, et rend la main au dock', () => {
    const t = monter({ fixtures: [prise('a', 1)], depart: 'a' });
    appuyer(t, 'Retirer');
    expect(useScanStore.getState().fixtures).toHaveLength(0);
    expect(ref.choisi).toBeNull();
  });
});

describe('la pastille de la pièce', () => {
  it('compte les socles, et déplie la règle avec son correctif', () => {
    const t = monter();
    expect(textes(t)).toMatch(/Chambre · 0\/3 socles/);
    appuyer(t, 'Voir la règle');
    expect(bouton(t, 'Masquer la règle')).toBeDefined();
    const fix = t.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.findAllByType(Text).some((x) => /Poser|Ajouter/.test(String(x.props.children))) && !n.props.accessibilityLabel);
    expect(fix).toBeDefined();
    act(() => fix!.props.onPress());
    expect(useScanStore.getState().fixtures.length).toBeGreaterThan(0);
  });
});

describe('la fenêtre qui porte la page', () => {
  const ouvrir = (vue: 'mur' | 'catalogue') => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({
        walls: W,
        openings: [],
        objects: [],
        rooms: [{ id: 'r1', name: 'Chambre', floor: null }] as never,
        fixtures: [],
        photos: [],
      });
      t = TestRenderer.create(
        <ElecSheet
          visible
          vue={vue}
          wallId="n"
          focusX={undefined}
          selectedId={null}
          onSelect={() => {}}
          onChoose={() => {}}
          onClose={() => {}}
        />,
      );
    });
    arbre = t;
    return t;
  };

  /** Le voile : la surface qui ferme quand on touche à côté de la carte. */
  const voiles = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAll(
      (n) => n.props.style === StyleSheet.absoluteFill && typeof n.props.onPress === 'function',
    );

  it('la page du mur va bord à bord, sans voile qui la fermerait par mégarde', () => {
    const t = ouvrir('mur');
    expect(voiles(t)).toHaveLength(0);
    const fond = t.root.findAllByType(View)[0];
    const st = (StyleSheet.flatten(fond.props.style) ?? {}) as { padding?: number; paddingTop?: number };
    expect(st.padding ?? 0).toBe(0);
    expect(st.paddingTop ?? 0).toBe(0);
  });

  it('le catalogue, lui, reste une fenêtre qu’on ferme en touchant à côté', () => {
    const t = ouvrir('catalogue');
    expect(voiles(t).length).toBeGreaterThan(0);
  });
});

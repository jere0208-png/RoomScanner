/**
 * LES COTES D'UNE LIGNE DE SPOTS.
 *
 * Poser six spots, ce n'est pas poser six points : c'est tracer une ligne au
 * cordeau et percer à intervalles réguliers. Ce qu'on lit sur le plan pour
 * les implanter, ce sont les ÉCARTS — du mur au premier, entre chacun, du
 * dernier au mur. Un plan qui ne les donne pas se recalcule à la main, spot
 * par spot, avec une chance sur deux de se tromper d'un centimètre.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import { ceilingChain } from '../src/geometry/ceiling';
import { buildScanPdf } from '../src/export/pdf';
import type { CeilingFixture } from '../src/geometry/ceiling';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** Une pièce de 6 × 4, d'équerre avec le repère. */
const PIECE = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 4),
  mur('s', 6, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];

const spot = (id: string, x: number, z: number): CeilingFixture => ({
  id,
  kind: 'spot',
  roomId: 'r1',
  at: { x, z },
  row: 'ln1',
});

describe('la chaîne de cotes du plafond', () => {
  it('donne les écarts, du mur au premier jusqu’au dernier au mur', () => {
    // Quatre spots sur la longueur, à 0,75 / 2,25 / 3,75 / 5,25.
    const ligne = [
      spot('a', 0.75, 2),
      spot('b', 2.25, 2),
      spot('c', 3.75, 2),
      spot('d', 5.25, 2),
    ];
    const chaine = ceilingChain(ligne, PIECE, 0)!;
    expect(chaine).not.toBeNull();
    expect(chaine.points).toHaveLength(4);
    // Cinq cotes pour quatre spots : les deux bouts et les trois écarts.
    expect(chaine.cotes).toHaveLength(5);
    // Le nu du mur est à 7 cm de son axe : la cote de bout le dit.
    expect(chaine.cotes[0]!).toBeCloseTo(0.68, 2);
    expect(chaine.cotes[1]!).toBeCloseTo(1.5, 6);
    expect(chaine.cotes[2]!).toBeCloseTo(1.5, 6);
    expect(chaine.cotes[3]!).toBeCloseTo(1.5, 6);
    expect(chaine.cotes[4]!).toBeCloseTo(0.68, 2);
  });

  it('ordonne les spots, quel que soit l’ordre où on les a posés', () => {
    const melange = [
      spot('c', 3.75, 2),
      spot('a', 0.75, 2),
      spot('d', 5.25, 2),
      spot('b', 2.25, 2),
    ];
    const chaine = ceilingChain(melange, PIECE, 0)!;
    expect(chaine.points.map((p) => p.x)).toEqual([0.75, 2.25, 3.75, 5.25]);
  });

  /**
   * ET ELLE SUIT LA TRAME, pas les axes du scan.
   *
   * Un logement relevé de biais se cote quand même d'équerre : la ligne de
   * spots est tendue sur la longueur de la pièce, et c'est cette
   * longueur-là qu'on mesure.
   */
  it('se tend sur la trame du logement, même relevé de biais', () => {
    const a = (33 * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const t = (p: { x: number; z: number }) => ({
      x: p.x * cos - p.z * sin,
      z: p.x * sin + p.z * cos,
    });
    const murs = PIECE.map((w) => ({ ...w, a: t(w.a), b: t(w.b) }));
    const ligne = [
      spot('a', 0.75, 2),
      spot('b', 2.25, 2),
      spot('c', 3.75, 2),
    ].map((s) => ({ ...s, at: t(s.at) }));
    const chaine = ceilingChain(ligne, murs, a)!;
    expect(chaine.cotes[1]!).toBeCloseTo(1.5, 6);
    expect(chaine.cotes[2]!).toBeCloseTo(1.5, 6);
    expect(chaine.cotes[0]!).toBeCloseTo(0.68, 2);
  });

  it('ne dit rien d’une ligne d’un seul appareil', () => {
    expect(ceilingChain([spot('a', 3, 2)], PIECE, 0)).toBeNull();
  });

  /** Un contour ouvert : pas de mur au bout, donc pas de cote inventée. */
  it('se tait sur un bout qui ne rencontre aucun mur', () => {
    const ouvert = [mur('n', 0, 0, 6, 0)];
    const chaine = ceilingChain(
      [spot('a', 2, 2), spot('b', 4, 2)],
      ouvert,
      0,
    )!;
    expect(chaine.cotes[0]).toBeNull();
    expect(chaine.cotes[2]).toBeNull();
    expect(chaine.cotes[1]!).toBeCloseTo(2, 6);
  });
});

/**
 * ET LE PLAN LES DESSINE, sous le bouton « Cotes ».
 *
 * Le calcul ne sert à rien s'il ne se voit pas : cette épreuve monte le
 * plan avec une ligne de trois spots et compte les nombres écrits. Cotes
 * éteintes, la chaîne n'y est pas ; allumées, elle y est.
 */
describe('la chaîne sur le plan', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  let arbre: TestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => arbre?.unmount());
    arbre = null;
  });

  const LIGNE: CeilingFixture[] = [
    spot('a', 1.5, 2),
    spot('b', 3, 2),
    spot('c', 4.5, 2),
  ];

  function plan(cotes: boolean) {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        walls: PIECE,
        openings: [],
        objects: [],
        rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
        fixtures: [],
        ceiling: LIGNE,
        photos: [],
        showFurniture: true,
        showSurfaces: false,
      });
      tree = TestRenderer.create(
        <FloorplanEditor
          showMeasures={cotes}
          editable={false}
          selectedWallId={null}
          onSelectWall={() => {}}
          ceiling={LIGNE}
          showCeiling
        />,
      );
    });
    act(() => {
      tree.root.findAllByType(View)[0].props.onLayout?.({
        nativeEvent: { layout: { width: 900, height: 620 } },
      });
    });
    arbre = tree;
    return tree;
  }

  /** Les nombres écrits sur le plan. */
  const nombres = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root
      .findAllByType(SvgText)
      .map((n) => String(n.props.children))
      .filter((t) => /^\d+$/.test(t));

  it('écrit les écarts quand les cotes sont allumées', () => {
    const vu = nombres(plan(true));
    // Cent cinquante centimètres entre deux spots : écrit deux fois.
    expect(vu.filter((t) => t === '150').length).toBeGreaterThanOrEqual(2);
  });

  it('et n’écrit rien quand elles sont éteintes', () => {
    expect(nombres(plan(false)).filter((t) => t === '150')).toHaveLength(0);
  });
});

/**
 * ET LE DOSSIER IMPRIMÉ PORTE LA MÊME CHAÎNE.
 *
 * C'est lui qu'on emporte : s'il donne deux cotes par spot mais pas les
 * écarts, l'électricien refait la soustraction sous le plafond.
 */
describe('la chaîne dans le dossier', () => {
  const latin1 = (b: Uint8Array) => {
    let t = '';
    for (let i = 0; i < b.length; i++) t += String.fromCharCode(b[i]);
    return t;
  };

  it('écrit les écarts entre spots sur le plan du PDF', () => {
    const src = latin1(
      buildScanPdf(
        {
          name: 'Chantier',
          walls: PIECE,
          openings: [],
          objects: [],
          rooms: [{ id: 'r1' }],
          roomNames: { r1: 'Séjour' },
        },
        false,
        {
          ceiling: [spot('a', 1.5, 2), spot('b', 3, 2), spot('c', 4.5, 2)],
        },
      ),
    );
    // Cent cinquante centimètres entre deux spots : la chaîne le dit.
    expect(src.includes('(150)')).toBe(true);
  });
});

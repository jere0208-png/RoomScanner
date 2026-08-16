/**
 * LA COURONNE CARDINALE — savoir de quel mur on parle, sur place.
 *
 * « Le mur de gauche » ne veut plus rien dire dès qu'on a tourné le plan
 * d'un quart de tour, et « w-3 » n'a jamais rien voulu dire. Le nord, lui,
 * se vérifie avec n'importe quel téléphone : les quatre lettres se posent
 * donc AU BORD du cadre, du côté où se trouve réellement leur point
 * cardinal, et le mur qui touche le N est le mur nord — c'est le nom que
 * portent aussi l'établi et le dossier imprimé.
 *
 * Le repère bleu, lui, dit où l'on regarde EN CE MOMENT, et tourne quand on
 * se tourne. On vérifie les deux : la place des lettres, et le fait que le
 * repère suive le cap sans emporter le reste.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

/** Un cap qu'on pilote depuis le test : `mock` en préfixe, sinon Jest refuse. */
const mockCap = { valeur: null as number | null };
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    startHeading: jest.fn(async () => true),
    stopHeading: jest.fn(async () => true),
    heading: jest.fn(async () => mockCap.valeur),
    takePhoto: jest.fn(async () => null),
  },
  scanEvents: { addListener: jest.fn(), removeAllListeners: jest.fn() },
}));

import React from 'react';
import { View } from 'react-native';
import { Circle, Line, Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
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

const TAILLE = { width: 400, height: 600 };

let precedent: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => precedent?.unmount());
  precedent = null;
  mockCap.valeur = null;
});

function rendu(north: number | null) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: W,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
      fixtures: [],
      photos: [],
      north,
    });
    tree = TestRenderer.create(
      <FloorplanEditor
        showMeasures={false}
        editable={false}
        selectedWallId={null}
        onSelectWall={() => {}}
      />,
    );
  });
  act(() => {
    const zone = tree.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: TAILLE } });
  });
  precedent = tree;
  return tree;
}

/**
 * Où chaque lettre s'est posée — au CENTRE de sa pastille.
 *
 * Le `y` d'un texte SVG est sa ligne de base, quatre points sous le milieu
 * du rond : comparer des lignes de base à un centre d'écran ferait échouer
 * un test sur un décalage typographique, pas sur une erreur de position.
 */
const lettres = (tree: TestRenderer.ReactTestRenderer) => {
  const out = new Map<string, { x: number; y: number }>();
  for (const t of tree.root.findAllByType(SvgText)) {
    const v = t.props.children;
    if (typeof v === 'string' && ['N', 'E', 'S', 'O'].includes(v)) {
      out.set(v, { x: t.props.x, y: t.props.y - 4 });
    }
  }
  return out;
};

describe('les quatre lettres autour du plan', () => {
  it('se posent au bord, chacune de son côté', () => {
    // Cap 0 : le scan a commencé face au nord, donc le nord est en haut.
    const p = lettres(rendu(0));
    expect(p.size).toBe(4);
    const { N, S, E, O } = Object.fromEntries(p) as Record<
      string,
      { x: number; y: number }
    >;
    // Haut / bas : N au-dessus de S, et tous deux dans l'axe.
    expect(N.y).toBeLessThan(S.y);
    expect(Math.abs(N.x - TAILLE.width / 2)).toBeLessThan(2);
    // Gauche / droite : O à gauche de E.
    expect(O.x).toBeLessThan(E.x);
    expect(Math.abs(E.y - TAILLE.height / 2)).toBeLessThan(2);
    // Et personne ne sort du cadre.
    for (const q of p.values()) {
      expect(q.x).toBeGreaterThanOrEqual(0);
      expect(q.x).toBeLessThanOrEqual(TAILLE.width);
      expect(q.y).toBeGreaterThanOrEqual(0);
      expect(q.y).toBeLessThanOrEqual(TAILLE.height);
    }
  });

  it('tournent avec le cap du scan', () => {
    // Le relevé a commencé face à l'est : ce qui était en haut passe à
    // gauche, comme sur une carte qu'on fait pivoter d'un quart de tour.
    const p = lettres(rendu(90));
    const { N, E } = Object.fromEntries(p) as Record<
      string,
      { x: number; y: number }
    >;
    expect(N.x).toBeLessThan(TAILLE.width / 2 - 20);
    expect(E.y).toBeLessThan(TAILLE.height / 2 - 20);
  });

  /**
   * SANS BOUSSOLE, PAS DE COURONNE.
   *
   * Les scans anciens n'ont pas de cap. Quatre lettres posées au hasard
   * seraient pires que rien : on les croirait, et on percerait le mauvais
   * mur.
   */
  it('et disparaissent quand le scan n’a pas de cap', () => {
    expect(lettres(rendu(null)).size).toBe(0);
  });
});

describe('le repère « où je regarde »', () => {
  /** Le trait bleu du cap : le seul segment à bout rond de cette longueur. */
  const repere = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root
      .findAllByType(Line)
      .filter((n) => n.props.strokeLinecap === 'round' && n.props.strokeWidth === 2.4);

  it('n’apparaît que si le magnétomètre répond', () => {
    expect(repere(rendu(0))).toHaveLength(0);
  });

  it('et se pose du côté où l’on regarde', async () => {
    mockCap.valeur = 90; // plein est
    const tree = rendu(0);
    // Le cap arrive par une promesse : avancer l'horloge ne suffit pas, il
    // faut aussi laisser les microtâches se vider.
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    const traits = repere(tree);
    expect(traits).toHaveLength(1);
    // Plein est, plan orienté nord en haut : le repère est à droite.
    expect(traits[0].props.x2).toBeGreaterThan(TAILLE.width / 2);
    expect(Math.abs(traits[0].props.y2 - TAILLE.height / 2)).toBeLessThan(3);
    // Et sa pastille est au bout du trait, pas ailleurs.
    const pastille = tree.root
      .findAllByType(Circle)
      .find((n) => n.props.r === 3.4)!;
    expect(pastille.props.cx).toBeCloseTo(traits[0].props.x2, 3);
  });
});

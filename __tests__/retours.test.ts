/**
 * On pose sur les RETOURS de mur, pas dans les baies.
 *
 * Un mur percé d'une porte n'est pas une surface continue : c'est un retour,
 * un trou, un retour. Le mur vu de face montrait bien la baie, mais le doigt
 * la traversait sans résistance — on posait une prise au milieu d'une
 * porte-fenêtre, et elle partait au métré comme si elle tenait sur du vide.
 *
 * Or les retours ne sont pas des zones à éviter : ce sont les emplacements
 * qu'on vise. L'interrupteur d'entrée se pose sur les trente centimètres de
 * mur entre l'angle et l'huisserie, jamais ailleurs.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import {
  FIXTURES,
  faceX,
  masonryRuns,
  snapToMasonry,
  wallFace,
  type Fixture,
} from '../src/geometry/electrical';
import {
  segLength,
  wallQuads,
  wallRuns,
  type WallSeg,
} from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());
beforeEach(() => jest.advanceTimersByTime(2000));

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** Un séjour de 6 × 4, avec une porte de 90 cm au milieu du mur nord. */
const W: WallSeg[] = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 4),
  mur('s', 6, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];
const PORTE: WallSeg = {
  id: 'p1',
  type: 'door',
  a: { x: 2.5, z: 0 },
  b: { x: 3.4, z: 0 },
  height: 2.04,
  yCenter: 1.02,
  roomId: 'r1',
};
const R = [{ id: 'r1', name: 'Séjour', wallIds: W.map((w) => w.id) }];

const face = () => wallFace(W[0], wallQuads(W).get('n'), 1);

describe('les retours d’un mur percé', () => {
  it('se lisent en mètres sur la face, pas en fractions de l’axe', () => {
    const runs = masonryRuns(wallRuns(W[0], [PORTE]), segLength(W[0]), face());
    expect(runs).toHaveLength(2);
    /**
     * La porte occupe 2,50 → 3,40 SUR L'AXE. La face, elle, commence 7 cm
     * plus loin — la moitié de l'épaisseur du mur, mangée par le tableau de
     * l'angle. Les bords des retours se lisent donc à 2,43 et 3,33.
     *
     * C'est toute la raison d'être de cette conversion : appliquer les
     * fractions de l'axe à la longueur de la face décalerait chaque retour
     * de ces 7 cm, soit presque la largeur d'une plaque.
     */
    expect(runs[0].x1).toBeCloseTo(2.43, 6);
    expect(runs[1].x0).toBeCloseTo(3.33, 6);
    // Et rien ne dépasse de la face.
    expect(runs[0].x0).toBeGreaterThanOrEqual(0);
    expect(runs[1].x1).toBeLessThanOrEqual(face().len + 1e-9);
  });

  it('un mur plein n’a qu’un seul « retour » : lui-même', () => {
    const runs = masonryRuns(wallRuns(W[0], []), segLength(W[0]), face());
    expect(runs).toHaveLength(1);
    expect(runs[0].x1 - runs[0].x0).toBeCloseTo(face().len, 6);
  });
});

describe('le recalage sur la maçonnerie', () => {
  const runs = [
    { x0: 0, x1: 2.4 },
    { x0: 3.3, x1: 5.86 },
  ];

  it('ne bouge pas ce qui est déjà sur du mur', () => {
    expect(snapToMasonry(runs, 1.2, 0.041, 5.86)).toBeCloseTo(1.2, 6);
  });

  it('ramène au retour LE PLUS PROCHE ce qui tombe dans la baie', () => {
    // 2,6 est plus près du retour de gauche : on s'y range, plaque comprise.
    expect(snapToMasonry(runs, 2.6, 0.041, 5.86)).toBeCloseTo(2.4 - 0.041, 6);
    // 3,2 penche vers celui de droite.
    expect(snapToMasonry(runs, 3.2, 0.041, 5.86)).toBeCloseTo(3.3 + 0.041, 6);
  });

  it('écarte un retour trop étroit pour la plaque', () => {
    const etroits = [
      { x0: 0, x1: 0.05 },
      { x0: 1, x1: 2 },
    ];
    // 5 cm ne portent pas une plaque de 8,2 cm : on va sur l'autre.
    expect(snapToMasonry(etroits, 0.02, 0.041, 2)).toBeCloseTo(1.041, 6);
  });

  it('à défaut de tout retour utile, borne sur la face sans rien inventer', () => {
    const minus = [{ x0: 0, x1: 0.05 }];
    expect(snapToMasonry(minus, 9, 0.041, 3)).toBeCloseTo(3 - 0.041, 6);
  });
});

describe('dans le store, bout en bout', () => {
  const poser = () => {
    useScanStore.setState({
      walls: W,
      openings: [PORTE],
      rooms: R,
      objects: [],
      fixtures: [],
      photos: [],
    });
    return useScanStore.getState().addFixture('prise', 'n')!;
  };

  it('une prise glissée sur la porte se range sur le retour', () => {
    const id = poser();
    // 2,95 : le milieu de l'huisserie.
    useScanStore.getState().moveFixture(id, 2.95, 1.1);
    const st = useScanStore.getState();
    const f = st.fixtures.find((x) => x.id === id)!;
    const fa = wallFace(st.walls[0], wallQuads(st.walls).get('n'), f.side);
    const x = faceX(fa, f.along);
    const demi = FIXTURES.prise.w / 2;
    const runs = masonryRuns(wallRuns(st.walls[0], st.openings), segLength(st.walls[0]), fa);
    // Entièrement contenue dans l'un des deux retours.
    expect(
      runs.some((r) => x - demi >= r.x0 - 1e-6 && x + demi <= r.x1 + 1e-6),
    ).toBe(true);
  });

  it('et une prise posée sur du mur plein n’est pas déplacée pour autant', () => {
    const id = poser();
    useScanStore.getState().moveFixture(id, 1, 1.1);
    const f = useScanStore.getState().fixtures.find((x) => x.id === id)!;
    const fa = wallFace(W[0], wallQuads(W).get('n'), f.side);
    expect(faceX(fa, f.along)).toBeCloseTo(faceX(fa, 1), 3);
  });

  it('un ensemble se recale ENTIER, sans casser son entraxe', () => {
    poser();
    useScanStore.setState({
      fixtures: [
        { id: 'a', kind: 'prise', wallId: 'n', along: 1, height: 1.1, side: 1, group: 'g' },
        { id: 'b', kind: 'prise', wallId: 'n', along: 1.071, height: 1.1, side: 1, group: 'g' },
      ] as Fixture[],
    });
    useScanStore.getState().moveFixture('a', 2.95, 1.1);
    const st = useScanStore.getState();
    const fa = wallFace(W[0], wallQuads(W).get('n'), 1);
    const xs = st.fixtures.map((f) => faceX(fa, f.along)).sort((p, q) => p - q);
    expect(xs[1] - xs[0]).toBeCloseTo(0.071, 3);
    const runs = masonryRuns(wallRuns(W[0], [PORTE]), segLength(W[0]), fa);
    const demi = FIXTURES.prise.w / 2;
    expect(
      runs.some(
        (r) => xs[0] - demi >= r.x0 - 1e-6 && xs[1] + demi <= r.x1 + 1e-6,
      ),
    ).toBe(true);
  });
});

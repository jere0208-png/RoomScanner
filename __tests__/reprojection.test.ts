/**
 * Ce qui est accroché à un mur doit SURVIVRE au recousage du plan.
 *
 * « Redresser le plan », ajouter une cloison, déplacer un coin : toutes ces
 * retouches passent par `splitAtJunctions` + `mergeColinear`, et là, les
 * identifiants de murs changent. Un mur coupé en deux ne garde le sien que
 * sur le PREMIER morceau ; un mur fusionné, que celui du plus long.
 *
 * Les ouvertures étaient reprojetées depuis longtemps. L'appareillage, non :
 * une prise de la seconde moitié d'un mur se retrouvait avec une cote plus
 * longue que son mur — dessinée dans le vide — et une prise de mur fusionné
 * disparaissait de l'écran, des comptages, des circuits et du métré. Sans
 * alerte, et sans rien à annuler puisque rien ne semblait s'être passé.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import {
  FIXTURES,
  faceX,
  interiorSide,
  reprojectAnchors,
  reprojectFixtures,
  wallFace,
  type Fixture,
} from '../src/geometry/electrical';
import {
  mergeColinear,
  segLength,
  splitAtJunctions,
  wallQuads,
  weldCorners,
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
  roomId: 'room-1',
});

/** Un séjour de 6 × 4, coupé en deux par un refend au milieu du mur nord. */
const AVEC_REFEND: WallSeg[] = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 4),
  mur('s', 6, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
  mur('refend', 3, 0, 3, 4),
];

const prise = (wallId: string, along: number, side: 1 | -1 = 1): Fixture => ({
  id: `f-${wallId}-${along}`,
  kind: 'prise',
  wallId,
  along,
  height: 0.25,
  side,
});

describe('un mur coupé en deux', () => {
  const neufs = mergeColinear(splitAtJunctions(weldCorners(AVEC_REFEND)));

  it('le découpage change bien les identifiants — c’est le piège', () => {
    expect(neufs.map((w) => w.id)).toContain('n#1');
    const n = neufs.find((w) => w.id === 'n')!;
    expect(segLength(n)).toBeCloseTo(3, 6);
  });

  it('la prise de la SECONDE moitié change de mur, pas de place', () => {
    const [remis] = reprojectFixtures(AVEC_REFEND, neufs, [prise('n', 4.5)]);
    expect(remis.wallId).toBe('n#1');
    // 4,50 m depuis le coin, c'est 1,50 m sur le second tronçon.
    expect(remis.along).toBeCloseTo(1.5, 6);
    const cible = neufs.find((w) => w.id === remis.wallId)!;
    expect(remis.along).toBeLessThanOrEqual(segLength(cible));
  });

  it('la prise de la première moitié ne bouge pas d’un millimètre', () => {
    const [remis] = reprojectFixtures(AVEC_REFEND, neufs, [prise('n', 1.2)]);
    expect(remis.wallId).toBe('n');
    expect(remis.along).toBeCloseTo(1.2, 6);
  });

  it('elle reste du même côté de la cloison', () => {
    for (const side of [1, -1] as const) {
      const avant = prise('n', 4.5, side);
      const [apres] = reprojectFixtures(AVEC_REFEND, neufs, [avant]);
      const fAvant = wallFace(
        AVEC_REFEND[0],
        wallQuads(AVEC_REFEND).get('n'),
        avant.side,
      );
      const cible = neufs.find((w) => w.id === apres.wallId)!;
      const fApres = wallFace(cible, wallQuads(neufs).get(cible.id), apres.side);
      // Même normale sortante : la prise regarde toujours la même pièce.
      expect(fApres.nx).toBeCloseTo(fAvant.nx, 6);
      expect(fApres.nz).toBeCloseTo(fAvant.nz, 6);
    }
  });

  it('les photos suivent le même chemin', () => {
    const [ph] = reprojectAnchors(AVEC_REFEND, neufs, [
      { id: 'p1', wallId: 'n', along: 5, path: '/tmp/a.jpg' },
    ]);
    expect(ph.wallId).toBe('n#1');
    expect(ph.along).toBeCloseTo(2, 6);
    expect(ph.path).toBe('/tmp/a.jpg');
  });
});

describe('deux murs fusionnés en un', () => {
  // Deux tronçons alignés bout à bout : `mergeColinear` n'en garde qu'un,
  // et c'est l'identifiant du PLUS LONG qui survit.
  const morceaux: WallSeg[] = [
    mur('court', 0, 0, 2, 0),
    mur('long', 2, 0, 6, 0),
    mur('e', 6, 0, 6, 4),
    mur('s', 6, 4, 0, 4),
    mur('w', 0, 4, 0, 0),
  ];
  const neufs = mergeColinear(splitAtJunctions(weldCorners(morceaux)));

  it('l’identifiant du petit tronçon disparaît vraiment', () => {
    expect(neufs.map((w) => w.id)).not.toContain('court');
  });

  it('sa prise n’est pas perdue : elle passe sur le mur reconstitué', () => {
    const [remis] = reprojectFixtures(morceaux, neufs, [prise('court', 1)]);
    expect(neufs.some((w) => w.id === remis.wallId)).toBe(true);
    const cible = neufs.find((w) => w.id === remis.wallId)!;
    // Toujours à 1 m du coin d'origine, sur le mur qui l'a absorbée.
    const face = wallFace(cible, wallQuads(neufs).get(cible.id), remis.side);
    expect(faceX(face, remis.along)).toBeGreaterThan(0);
    expect(faceX(face, remis.along)).toBeLessThan(face.len);
  });
});

describe('dans le store, bout en bout', () => {
  const poser = () => {
    useScanStore.setState({
      walls: AVEC_REFEND,
      rooms: [{ id: 'room-1', name: 'Séjour', wallIds: AVEC_REFEND.map((w) => w.id) }],
      objects: [],
      openings: [],
      fixtures: [],
      photos: [],
    });
    const id = useScanStore.getState().addFixture('prise', 'n')!;
    useScanStore.getState().moveFixture(id, 4.5, 0.25);
    return id;
  };

  it('redresser le plan ne laisse aucune prise hors de son mur', () => {
    const id = poser();
    useScanStore.getState().redetectRooms();
    const st = useScanStore.getState();
    const f = st.fixtures.find((x) => x.id === id)!;
    const w = st.walls.find((x) => x.id === f.wallId);
    expect(w).toBeTruthy();
    const face = wallFace(w!, wallQuads(st.walls).get(w!.id), f.side);
    const x = faceX(face, f.along);
    expect(x).toBeGreaterThanOrEqual(-1e-6);
    expect(x).toBeLessThanOrEqual(face.len + 1e-6);
  });

  it('et aucune prise orpheline, quel que soit l’endroit du mur', () => {
    useScanStore.setState({
      walls: AVEC_REFEND,
      rooms: [{ id: 'room-1', name: 'Séjour', wallIds: AVEC_REFEND.map((w) => w.id) }],
      objects: [],
      openings: [],
      photos: [],
      fixtures: [0.5, 2.5, 3.5, 5.5].map((x) => prise('n', x)),
    });
    useScanStore.getState().redetectRooms();
    const st = useScanStore.getState();
    expect(st.fixtures).toHaveLength(4);
    const ids = new Set(st.walls.map((w) => w.id));
    for (const f of st.fixtures) {
      expect(ids.has(f.wallId)).toBe(true);
      const w = st.walls.find((x) => x.id === f.wallId)!;
      const face = wallFace(w, wallQuads(st.walls).get(w.id), f.side);
      expect(faceX(face, f.along)).toBeLessThanOrEqual(face.len + 1e-6);
    }
    // Et elles regardent toutes l'intérieur du séjour, comme avant.
    for (const f of st.fixtures) {
      const w = st.walls.find((x) => x.id === f.wallId)!;
      expect(f.side).toBe(interiorSide(w, st.walls, st.rooms));
    }
  });
});

describe('un appareil large ne déborde jamais du mur d’arrivée', () => {
  it('le tableau recalé en bout de mur garde sa plaque sur la maçonnerie', () => {
    // Un tableau de 55 cm posé près du refend : après recousage, il ne doit
    // pas se retrouver à cheval sur le coin, la moitié dans le vide.
    const neufs = mergeColinear(splitAtJunctions(weldCorners(AVEC_REFEND)));
    const tableau: Fixture = {
      id: 't',
      kind: 'tableau',
      wallId: 'n',
      along: 2.95,
      height: 1.35,
      side: 1,
    };
    const [remis] = reprojectFixtures(AVEC_REFEND, neufs, [tableau]);
    const w = neufs.find((x) => x.id === remis.wallId)!;
    const face = wallFace(w, wallQuads(neufs).get(w.id), remis.side);
    const x = faceX(face, remis.along);
    const demi = FIXTURES.tableau.w / 2;
    expect(x - demi).toBeGreaterThanOrEqual(-1e-6);
    expect(x + demi).toBeLessThanOrEqual(face.len + 1e-6);
  });

  it('sur un mur plus court que lui, il se centre', () => {
    const court: WallSeg[] = [mur('c', 0, 0, 0.4, 0)];
    const [remis] = reprojectFixtures(
      [mur('c', 0, 0, 2, 0)],
      court,
      [{ id: 't', kind: 'tableau', wallId: 'c', along: 1.8, height: 1.35, side: 1 }],
    );
    expect(remis.along).toBeCloseTo(0.2, 6);
  });
});

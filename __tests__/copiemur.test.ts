/**
 * Relever l'appareillage d'un mur, le reporter sur un autre.
 *
 * Dans un couloir, une chambre symétrique, une enfilade de bureaux, c'est
 * trois fois le même équipement à la même cote du coin — et trois occasions
 * de se tromper d'un centimètre. Le relevé garde les cotes DEPUIS LE DÉBUT
 * DE LA FACE, celles qu'on lit à l'écran, et ne pose que ce qui tient.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import {
  ENTRAXE,
  FIXTURES,
  faceX,
  fromFaceX,
  interiorSide,
  wallFace,
} from '../src/geometry/electrical';
import { wallQuads, type WallSeg } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());
// L'historique regroupe les retouches rapprochées d'un même geste (800 ms).
// Avec une horloge figée, deux tests d'affilée n'en formeraient qu'une.
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

/** Pièce 5 × 3 : nord et sud font 5 m, est et ouest 3 m. */
const PIECE: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 3),
  mur('s', 5, 3, 0, 3),
  mur('w', 0, 3, 0, 0),
];

const neuf = () =>
  useScanStore.setState({
    walls: PIECE,
    rooms: [{ id: 'r1', name: 'Chambre', wallIds: PIECE.map((w) => w.id) }],
    objects: [],
    openings: [],
    fixtures: [],
    wallClip: null,
    pendingJoin: null,
  });

const faceDe = (id: string) => {
  const w = PIECE.find((x) => x.id === id)!;
  return wallFace(w, wallQuads(PIECE).get(id), interiorSide(w, PIECE));
};

/** Cotes lues sur la face d'un mur, dans l'ordre. */
const cotes = (id: string) => {
  const face = faceDe(id);
  return useScanStore
    .getState()
    .fixtures.filter((f) => f.wallId === id)
    .map((f) => ({
      kind: f.kind,
      x: +faceX(face, f.along).toFixed(6),
      h: +f.height.toFixed(6),
      group: f.group,
    }))
    .sort((a, b) => a.x - b.x);
};

/** Pose un appareil sur un mur, à la cote voulue. */
const poser = (
  wallId: string,
  kind: Parameters<typeof FIXTURES.prise.color extends never ? never : any>[0] extends never
    ? never
    : 'prise' | 'rj45' | 'inter' | 'tableau',
  x: number,
  h: number,
  group?: string,
) => {
  const face = faceDe(wallId);
  const st = useScanStore.getState();
  const w = PIECE.find((p) => p.id === wallId)!;
  useScanStore.setState({
    fixtures: [
      ...st.fixtures,
      {
        id: `f-${wallId}-${x}-${h}`,
        kind,
        wallId,
        along: fromFaceX(face, x),
        height: h,
        side: interiorSide(w, PIECE),
        group,
      },
    ],
  });
};

describe('relever un mur', () => {
  it('prend ses appareils, leurs cotes et leurs ensembles', () => {
    neuf();
    poser('n', 'prise', 0.8, 0.25, 'g1');
    poser('n', 'rj45', 0.8 + ENTRAXE, 0.25, 'g1');
    poser('n', 'inter', 2.4, 1.1);
    const n = useScanStore.getState().copyWallFixtures('n');
    expect(n).toBe(3);
    const clip = useScanStore.getState().wallClip!;
    expect(clip.from).toBe('n');
    expect(clip.items.map((i) => i.kind)).toEqual(['prise', 'rj45', 'inter']);
    expect(clip.items[0].x).toBeCloseTo(0.8, 6);
    expect(clip.items[1].x).toBeCloseTo(0.8 + ENTRAXE, 6);
    expect(clip.items[0].group).toBe(clip.items[1].group);
  });

  it('un mur nu ne remplit pas le presse-papier', () => {
    neuf();
    expect(useScanStore.getState().copyWallFixtures('n')).toBe(0);
    expect(useScanStore.getState().wallClip).toBeNull();
  });
});

describe('reporter sur un autre mur', () => {
  it('repose tout, aux mêmes cotes', () => {
    neuf();
    poser('n', 'prise', 0.8, 0.25);
    poser('n', 'inter', 2.4, 1.1);
    useScanStore.getState().copyWallFixtures('n');
    expect(useScanStore.getState().pasteWallFixtures('s')).toBe(2);

    const source = cotes('n');
    const cible = cotes('s');
    expect(cible).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      expect(cible[i].kind).toBe(source[i].kind);
      expect(cible[i].x).toBeCloseTo(source[i].x, 6);
      expect(cible[i].h).toBeCloseTo(source[i].h, 6);
    }
    // Le mur d'origine n'a pas bougé.
    expect(useScanStore.getState().fixtures).toHaveLength(4);
  });

  it('les ensembles restent des ensembles, mais chacun le sien', () => {
    neuf();
    poser('n', 'prise', 1.2, 0.25, 'g1');
    poser('n', 'prise', 1.2 + ENTRAXE, 0.25, 'g1');
    useScanStore.getState().copyWallFixtures('n');
    useScanStore.getState().pasteWallFixtures('s');

    const source = cotes('n');
    const cible = cotes('s');
    // Deux appareils réunis d'un côté comme de l'autre…
    expect(source[0].group).toBe(source[1].group);
    expect(cible[0].group).toBe(cible[1].group);
    // … mais pas la MÊME plaque : deux murs, deux boîtes.
    expect(cible[0].group).not.toBe(source[0].group);
    expect(cible[1].x - cible[0].x).toBeCloseTo(ENTRAXE, 6);
  });

  it('ce qui ne tient pas sur le mur d’arrivée n’est pas posé de force', () => {
    neuf();
    // Un appareil à 4,50 m du coin : impossible sur un mur de 3 m.
    poser('n', 'prise', 1, 0.25);
    poser('n', 'prise', 4.5, 0.25);
    useScanStore.getState().copyWallFixtures('n');
    expect(useScanStore.getState().pasteWallFixtures('e')).toBe(1);
    expect(cotes('e')).toHaveLength(1);
    expect(cotes('e')[0].x).toBeCloseTo(1, 6);
  });

  it('un tableau trop large pour le mur d’arrivée est écarté', () => {
    neuf();
    // À 2,90 m du coin sur un mur de 5 m, le tableau (55 cm) passe ; sur le
    // mur est, qui fait 3 m, il déborderait de 17 cm.
    poser('n', 'tableau', 2.9, 1.3);
    useScanStore.getState().copyWallFixtures('n');
    expect(2.9 + FIXTURES.tableau.w / 2).toBeGreaterThan(3);
    expect(useScanStore.getState().pasteWallFixtures('e')).toBe(0);
    expect(cotes('e')).toHaveLength(0);
  });

  it('coller sur le mur d’origine ne duplique rien par accident', () => {
    neuf();
    poser('n', 'prise', 1, 0.25);
    useScanStore.getState().copyWallFixtures('n');
    // Le bouton ne le propose pas ; si on force, c'est un doublon assumé,
    // et l'annulation doit le reprendre d'un coup.
    useScanStore.getState().pasteWallFixtures('n');
    expect(useScanStore.getState().fixtures).toHaveLength(2);
    useScanStore.getState().undo();
    expect(useScanStore.getState().fixtures).toHaveLength(1);
  });

  it('sans relevé, coller ne fait rien', () => {
    neuf();
    expect(useScanStore.getState().pasteWallFixtures('s')).toBe(0);
    expect(useScanStore.getState().fixtures).toHaveLength(0);
  });

  it('le report s’annule d’un seul retour en arrière', () => {
    neuf();
    poser('n', 'prise', 1, 0.25);
    poser('n', 'prise', 2, 0.25);
    poser('n', 'prise', 3, 0.25);
    useScanStore.getState().copyWallFixtures('n');
    useScanStore.getState().pasteWallFixtures('s');
    expect(useScanStore.getState().fixtures).toHaveLength(6);
    useScanStore.getState().undo();
    expect(useScanStore.getState().fixtures).toHaveLength(3);
  });
});

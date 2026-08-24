/**
 * UNE PORTE APPARTIENT À SON MUR — elle le suit partout.
 *
 * Relevé du patron : « les ouvrants ne suivent pas la modification lors de
 * mouvements du mur et rotations ».
 *
 * Deux gestes le faisaient déjà : POUSSER une cloison (`moveWall`) et lui
 * POSER un angle (`setWallAngle`) emportaient les percements avec eux. Le
 * troisième — TIRER UN COIN (`moveWallPoint`) — ne les touchait pas. Or c'est
 * le geste le plus courant des trois : c'est celui qui rallonge un mur, le
 * raccourcit et le fait pivoter en même temps. La porte restait où elle
 * était, c'est-à-dire dans le vide.
 *
 * LA RÈGLE : une ouverture garde sa cote DEPUIS LE BOUT QUI NE BOUGE PAS.
 * C'est la vérité du chantier — on tire un mur, la porte ne se déplace pas
 * dans la pièce ; c'est le mur qui s'allonge derrière elle. Et c'est la même
 * convention que la saisie (`moveOpening` prend la cote du tableau depuis le
 * début du mur).
 *
 * Ce qui déborderait est ramené DEDANS : un mur raccourci sous la porte
 * qu'il porte laisserait une menuiserie à cheval sur son bout, c'est-à-dire
 * un trou dans le contour.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { useScanStore } from '../src/store/scanStore';
import { pointOnSeg, segLength, type WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** Une pièce de 4 × 3, et une porte de 90 cm sur le mur nord, à 1 m du coin. */
const poser = () => {
  useScanStore.setState({
    walls: [
      mur('n', 0, 0, 4, 0),
      mur('e', 4, 0, 4, 3),
      mur('s', 4, 3, 0, 3),
      mur('o', 0, 3, 0, 0),
    ],
    openings: [
      {
        id: 'p1',
        type: 'door',
        a: { x: 1, z: 0 },
        b: { x: 1.9, z: 0 },
        height: 2.04,
        yCenter: 1.02,
      } as never,
    ],
    objects: [],
    rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never,
    fixtures: [],
    ceiling: [],
    photos: [],
    notes: [],
  });
};

const st = () => useScanStore.getState();
const porte = () => st().openings.find((o) => o.id === 'p1')!;
const murN = () => st().walls.find((w) => w.id === 'n')!;

/** La cote de la porte depuis le bout `a` du mur, et son écart à l'axe. */
const cote = () => {
  const w = murN();
  const l = segLength(w) || 1;
  const u = { x: (w.b.x - w.a.x) / l, z: (w.b.z - w.a.z) / l };
  const p = porte();
  const t = (q: { x: number; z: number }) =>
    (q.x - w.a.x) * u.x + (q.z - w.a.z) * u.z;
  return { t0: t(p.a), t1: t(p.b) };
};

describe('une ouverture suit son mur', () => {
  it('quand on tire le coin : elle garde sa cote depuis le bout fixe', () => {
    poser();
    const avant = cote();
    // On tire le bout `b` : le mur s'allonge ET pivote.
    st().moveWallPoint('n', 'b', { x: 5.2, z: 1.4 });
    const apres = cote();
    expect(apres.t0).toBeCloseTo(avant.t0, 6);
    expect(apres.t1).toBeCloseTo(avant.t1, 6);
    // Et elle est bien SUR le mur, pas à côté.
    const p = porte();
    const mid = { x: (p.a.x + p.b.x) / 2, z: (p.a.z + p.b.z) / 2 };
    expect(pointOnSeg(mid, murN().a, murN().b).dist).toBeLessThan(0.02);
    // Sa largeur ne change pas : une porte de 90 ne devient pas une baie.
    expect(Math.hypot(p.b.x - p.a.x, p.b.z - p.a.z)).toBeCloseTo(0.9, 6);
  });

  it('et quand on tire l’autre bout, elle garde sa cote depuis celui-ci', () => {
    poser();
    // Depuis le bout `b`, la porte est à 4 − 1,9 = 2,10 m.
    const depuisB = segLength(murN()) - cote().t1;
    st().moveWallPoint('n', 'a', { x: -1.5, z: 0 });
    const w = murN();
    const l = segLength(w);
    const u = { x: (w.b.x - w.a.x) / l, z: (w.b.z - w.a.z) / l };
    const p = porte();
    const t1 = (p.b.x - w.a.x) * u.x + (p.b.z - w.a.z) * u.z;
    expect(l - t1).toBeCloseTo(depuisB, 6);
  });

  it('et ne déborde jamais du mur qu’on raccourcit', () => {
    poser();
    // Le mur tombe à 1,50 m : la porte, qui allait de 1 à 1,90, ne tient
    // plus. Elle se range dedans plutôt que de pendre dans le vide.
    st().moveWallPoint('n', 'b', { x: 1.5, z: 0 });
    const w = murN();
    const l = segLength(w);
    const u = { x: (w.b.x - w.a.x) / l, z: (w.b.z - w.a.z) / l };
    const p = porte();
    const t = (q: { x: number; z: number }) =>
      (q.x - w.a.x) * u.x + (q.z - w.a.z) * u.z;
    expect(Math.min(t(p.a), t(p.b))).toBeGreaterThanOrEqual(-0.001);
    expect(Math.max(t(p.a), t(p.b))).toBeLessThanOrEqual(l + 0.001);
  });

  /*
    LES DEUX AUTRES GESTES LE FAISAIENT DÉJÀ — on les tient, pour qu'ils
    continuent : trois gestes mènent au même endroit, et c'est le troisième
    oublié qui a fait le défaut.
  */
  it('quand on pousse la cloison', () => {
    poser();
    const avant = cote();
    st().moveWall('n', 0, 0.6);
    expect(cote().t0).toBeCloseTo(avant.t0, 6);
    expect(porte().a.z).toBeCloseTo(0.6, 6);
  });

  it('et quand on lui pose un angle', () => {
    poser();
    const avant = cote();
    st().setWallAngle('n', 20);
    expect(cote().t0).toBeCloseTo(avant.t0, 6);
    const p = porte();
    expect(pointOnSeg(
      { x: (p.a.x + p.b.x) / 2, z: (p.a.z + p.b.z) / 2 },
      murN().a,
      murN().b,
    ).dist).toBeLessThan(0.02);
  });
});

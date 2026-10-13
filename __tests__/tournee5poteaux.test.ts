/**
 * TOURNÉE N°5 — LES POTEAUX.
 *
 * - « Malik » (loft) : les quatre poteaux de 30 × 30 de l'open space
 *   restaient dans sa surface (85,52 m² pour 85,16). Le scan les rend en
 *   murs isolés : dessinés en noir au poché, comptés au sol.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { SurfaceData } from 'react-native-room-scan';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';

const st = () => useScanStore.getState();
let n = 0;
function surface(s: [number, number, number, number], h = 2.5): SurfaceData {
  const [ax, az, bx, bz] = s;
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L;
  const uz = (bz - az) / L;
  return {
    id: `wall-pt-${++n}`,
    type: 'wall',
    length: L,
    height: h,
    confidence: 'high',
    category: 'wall',
    transform: [ux, 0, uz, 0, 0, 1, 0, 0, -uz, 0, ux, 0, (ax + bx) / 2, -1.3 + h / 2, (az + bz) / 2, 1],
  } as unknown as SurfaceData;
}
const carre = (x: number, z: number, c: number) => [
  surface([x, z, x + c, z]),
  surface([x + c, z, x + c, z + c]),
  surface([x + c, z + c, x, z + c]),
  surface([x, z + c, x, z]),
];

describe('un poteau dans une pièce', () => {
  it('sort de sa surface', () => {
    useScanStore.setState({ walls: [], openings: [], objects: [], rooms: [], fixtures: [], ceiling: [], saves: [], niveauCourant: 0 } as never);
    st().finalize({
      modelPath: '',
      surfaces: [
        surface([0, 0, 6, 0]),
        surface([6, 0, 6, 5]),
        surface([6, 5, 0, 5]),
        surface([0, 5, 0, 0]),
        ...carre(2, 2, 0.3),
        ...carre(4, 2, 0.3),
      ],
      objects: [],
    } as never);
    const s = st();
    const parts = roomParts(s.walls, s.rooms).filter((p) => (p.surface?.area ?? 0) > 1);
    expect(parts).toHaveLength(1);
    expect(parts[0].surface!.area).toBeCloseTo(30 - 2 * 0.09, 1);
  });

  it('une cloison libre au milieu d’une pièce prend aussi sa place au sol ; un mur de l’étage, non', () => {
    const seg = (id: string, ax: number, az: number, bx: number, bz: number, extra: Partial<WallSeg> = {}): WallSeg => ({
      id,
      type: 'wall',
      a: { x: ax, z: az },
      b: { x: bx, z: bz },
      height: 2.5,
      yCenter: 1.25,
      ...extra,
    });
    const murs = [seg('n', 0, 0, 6, 0), seg('e', 6, 0, 6, 5), seg('s', 6, 5, 0, 5), seg('o', 0, 5, 0, 0)];
    const piece = [{ id: 'r', wallIds: murs.map((w) => w.id) }];
    const nue = roomParts(murs, piece)[0].surface!.area;
    const cloison = seg('c', 2, 2.5, 4, 2.5, { epaisseur: 0.1 } as Partial<WallSeg>);
    expect(roomParts([...murs, cloison], piece)[0].surface!.area).toBeCloseTo(nue - 0.2, 6);
    const etage = seg('e1', 2, 2.5, 4, 2.5, { niveau: 1 });
    expect(roomParts([...murs, etage], piece)[0].surface!.area).toBeCloseTo(nue, 6);
  });
});

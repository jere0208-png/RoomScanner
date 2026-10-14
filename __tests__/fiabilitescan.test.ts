/**
 * PEUT-ON SIGNER UN MÉTRÉ AVEC LE SCAN ? — revue « Sandrine », métreuse.
 *
 * Chaque cas part d'un relevé RoomPlan simulé (le générateur des témoins de
 * `appartementstemoins`), passe par la vraie fin de scan (`finalize`), et
 * affirme la valeur RÉELLE au centimètre.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
import { act } from 'react-test-renderer';
import type { ObjectData, SurfaceData } from 'react-native-room-scan';
import { roomParts, segLength, hauteurDeLaPiece } from '../src/geometry/floorplan';
import { surfacesHabitables } from '../src/geometry/habitable';
import { useScanStore } from '../src/store/scanStore';
import { buildScanPdf } from '../src/export/pdf';

const SOL = -1.3;
type Seg = [number, number, number, number];
let n = 0;
function surf(type: string, [ax, az, bx, bz]: Seg, h: number, bas = 0): SurfaceData {
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L;
  const uz = (bz - az) / L;
  return {
    id: `${type}-${++n}`,
    type,
    length: L,
    height: h,
    confidence: 'high',
    category: type === 'door' ? 'door(isOpen: false)' : type,
    transform: [ux, 0, uz, 0, 0, 1, 0, 0, -uz, 0, ux, 0, (ax + bx) / 2, SOL + bas + h / 2, (az + bz) / 2, 1],
  } as unknown as SurfaceData;
}
function obj(cat: string, x: number, z: number, w: number, d: number, h: number, yaw = 0): ObjectData {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { id: `o${++n}`, category: cat, width: w, depth: d, height: h, transform: [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, x, SOL + h / 2, z, 1] } as ObjectData;
}
const rect = (x0: number, z0: number, x1: number, z1: number, h = 2.5) => [
  surf('wall', [x0, z0, x1, z0], h),
  surf('wall', [x1, z0, x1, z1], h),
  surf('wall', [x1, z1, x0, z1], h),
  surf('wall', [x0, z1, x0, z0], h),
];
const st = () => useScanStore.getState();
const scan = (surfaces: SurfaceData[], objects: ObjectData[] = []) =>
  act(() => {
    useScanStore.setState({ walls: [], openings: [], objects: [], rooms: [], fixtures: [], ceiling: [], saves: [], niveauCourant: 0 } as never);
    st().finalize({ modelPath: '', surfaces, objects, trajet: [] } as never);
  });
const pieces = () => roomParts(st().walls, st().rooms as never);
const portes = () => st().openings.filter((o) => o.type === 'door');

describe('D1 — une pièce vide ouverte sur le jardin reste habitable', () => {
  it('le séjour vide et sa baie de 2,40 : ni garage, ni 0 m²', () => {
    scan([...rect(0, 0, 5, 4), surf('window', [1, 0, 3.4, 0], 2.15, 0), surf('door', [0, 3, 0, 3.9], 2.04)]);
    expect((st().rooms[0] as { name?: string }).name).not.toBe('Garage');
    expect(surfacesHabitables(st().rooms as never, pieces()).total).toBeCloseTo(20, 2);
  });
});

describe('D2 — deux portes voisines restent deux portes, à leur place', () => {
  it('WC et salle de bains, séparés par une cloison en T', () => {
    scan([
      ...rect(0, 0, 5, 1),
      surf('wall', [1.765, 1, 1.765, 2.5], 2.5),
      surf('door', [1.0, 1, 1.73, 1], 2.04),
      surf('door', [1.8, 1, 2.53, 1], 2.04),
    ]);
    const p = portes()
      .map((o) => [Math.min(o.a.x, o.b.x), Math.max(o.a.x, o.b.x)])
      .sort((a, b) => a[0] - b[0]);
    expect(p).toHaveLength(2);
    expect(p[0][0]).toBeCloseTo(1.0, 2);
    expect(p[1][1]).toBeCloseTo(2.53, 2);
  });
});

describe('D3 — la hauteur sous plafond', () => {
  it('un faux plafond garde ses 2,30', () => {
    scan([...rect(0, 0, 4, 3, 2.5), ...rect(4.1, 0, 7.1, 3, 2.3), surf('door', [4.05, 1, 4.05, 1.83], 2.04)]);
    expect(hauteurDeLaPiece(pieces().find((p) => p.centroid.x > 4.5)!)).toBeCloseTo(2.3, 2);
  });

  it('un relevé bruité de ±3 cm donne 2,50 à un centimètre près', () => {
    scan([surf('wall', [0, 0, 4, 0], 2.47), surf('wall', [4, 0, 4, 3], 2.53), surf('wall', [4, 3, 0, 3], 2.5), surf('wall', [0, 3, 0, 0], 2.49)]);
    expect(Math.abs(hauteurDeLaPiece(pieces()[0]) - 2.5)).toBeLessThanOrEqual(0.01);
  });
});

describe('D8 — un meuble relevé ne change pas de taille normalisée', () => {
  it('un lit de 1,40 dans une alcôve de 1,75 reste un lit de 1,40', () => {
    scan(
      [...rect(0, 0, 6, 5), surf('wall', [3.5, 5, 3.5, 2.8], 2.5), surf('wall', [5.25, 5, 5.25, 2.8], 2.5)],
      [obj('bed', 4.375, 3.95, 1.4, 2.0, 0.5, Math.PI)],
    );
    expect(st().objects[0].width).toBeCloseTo(1.4, 2);
  });
});

describe('D4 — les cotes intérieures au droit des refends', () => {
  it('le T3 : ni 3,54, ni 1,46, ni 0,94, ni 2,06 ; des chaînes qui font leur total', () => {
    scan([
      ...rect(0, 0, 5, 5),
      ...rect(5.1, 0, 8.1, 3.5),
      ...rect(5.1, 3.57, 6.0, 5),
      ...rect(6.07, 3.57, 8.1, 5),
      surf('door', [5.05, 1, 5.05, 1.83], 2.04),
      surf('door', [5.05, 4, 5.05, 4.73], 2.04),
      surf('door', [6.5, 3.535, 7.23, 3.535], 2.04),
      surf('window', [1, 0, 2.4, 0], 1.35, 0.9),
      surf('window', [6, 0, 7.2, 0], 1.35, 0.9),
    ]);
    const s = st();
    const rooms = s.rooms as { id: string; name?: string; wallIds?: string[] }[];
    const txt = Buffer.from(
      buildScanPdf(
        { name: 'p', walls: s.walls, openings: s.openings, objects: [], rooms, roomNames: Object.fromEntries(rooms.map((r) => [r.id, r.name ?? ''])) } as never,
        false,
        { metre: true },
      ),
    ).toString('latin1');
    for (const faux of ['(3,54 m)', '(1,46 m)', '(0,94 m)', '(2,06 m)', '(0,95)', '(2,65)']) expect([faux, txt.includes(faux)]).toEqual([faux, false]);
  });
});

describe('D5 — une cloison fine garde ses deux faces', () => {
  it('7 cm relevés à 4,5 cm : 12 m² et 9 m², pas un trait à l’axe', () => {
    const e = 0.045;
    scan([...rect(0, 0, 4, 3), ...rect(4 + e, 0, 7 + e, 3), surf('door', [4 + e / 2, 1, 4 + e / 2, 1.83], 2.04)]);
    const a = pieces()
      .map((p) => p.surface!.area)
      .sort((x, y) => y - x);
    expect(a[0]).toBeCloseTo(12, 2);
    expect(a[1]).toBeCloseTo(9, 2);
  });

  it('une même face relevée deux fois, à 3 cm, reste un seul mur', () => {
    scan([...rect(0, 0, 4, 3), surf('wall', [0, 0.03, 4, 0.03], 2.5)]);
    expect(st().walls.filter((w) => w.type === 'wall')).toHaveLength(4);
  });
});

describe('D7 — une baie relevée près d’un refend d’un seul trait reste à sa place', () => {
  it('une porte de façade relevée près du refend reste où elle est', () => {
    scan([...rect(0, 0, 8, 4), surf('wall', [5, 0, 5, 4], 2.5), surf('door', [5.02, 0, 5.85, 0], 2.04), surf('door', [5, 1, 5, 1.83], 2.04)]);
    const p = portes().find((o) => Math.abs(o.a.z) < 0.01)!;
    expect(Math.min(p.a.x, p.b.x)).toBeCloseTo(5.02, 2);
  });

});

describe('D6 — un vrai mur biais garde son angle', () => {
  for (const [deg, nord] of [[2.5, 4.131], [4, 4.21]] as const) {
    it(`biais de ${deg}° : les murs droits restent justes, le biais aussi`, () => {
      const dx = 3 * Math.tan((deg * Math.PI) / 180);
      scan([surf('wall', [0, 0, 4, 0], 2.5), surf('wall', [4, 0, 4 + dx, 3], 2.5), surf('wall', [4 + dx, 3, 0, 3], 2.5), surf('wall', [0, 3, 0, 0], 2.5)]);
      const L = st().walls.map(segLength).sort((a, b) => a - b);
      expect(L[2]).toBeCloseTo(4.0, 2);
      expect(L[3]).toBeCloseTo(nord, 2);
    });
  }
});

describe('une fenêtre garde sa hauteur (revue « Marc »)', () => {
  it('la fenêtre de 60 × 60 à 1,40 ne prend pas le haut des portes', () => {
    scan([...rect(0, 0, 2.4, 1.9, 2.48), surf('window', [0.8, 0, 1.4, 0], 0.6, 1.4), surf('door', [2.4, 0.5, 2.4, 1.23], 2.04)]);
    const f = st().openings.find((o) => o.type === 'window')!;
    expect(f.height).toBeCloseTo(0.6, 2);
  });
});

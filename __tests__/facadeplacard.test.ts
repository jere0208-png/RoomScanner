/**
 * LA FAÇADE DE PLACARD N'EST PAS UNE PORTE — relevé du patron, capture à
 * l'appui : le dressing à portes coulissantes toute hauteur comptait pour une
 * porte, sortait en porte-fenêtre, en porte double, en garage, ou sur le fond
 * de sa niche.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
import { act } from 'react-test-renderer';
import type { ObjectData, SurfaceData } from 'react-native-room-scan';
import { roomParts, segLength, type WallSeg } from '../src/geometry/floorplan';
import { bilanDuReleve } from '../src/geometry/bilan';
import { useScanStore } from '../src/store/scanStore';

const SOL = -1.3;
let n = 0;
function surf(type: string, [ax, az, bx, bz]: number[], h: number, bas = 0, open = false): SurfaceData {
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L;
  const uz = (bz - az) / L;
  return {
    id: `${type}-${++n}`,
    type,
    length: L,
    height: h,
    confidence: 'high',
    category: type === 'door' ? `door(isOpen: ${open})` : type,
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
const portes = () => st().openings.filter((o) => o.type === 'door' && !o.placard);
const placards = () => st().openings.filter((o) => o.placard);
const fenetres = () => st().openings.filter((o) => o.type === 'window');
const plusLarge = () => st().openings.reduce((m, o) => (segLength(o) > segLength(m) ? o : m));
const aires = () =>
  roomParts(st().walls, st().rooms as never)
    .map((p) => p.surface?.area ?? 0)
    .sort((a, b) => b - a);
const noms = () => (st().rooms as { name?: string }[]).map((r) => r.name);

// Chambre 4 × 3,5, plafond 2,50 : fenêtre au sud, porte de chambre à l'est, un lit.
const chambre = () => [...rect(0, 0, 4, 3.5), surf('window', [1.4, 0, 2.6, 0], 1.35, 0.9), surf('door', [4, 0.3, 4, 1.13], 2.04)];
const lit = () => obj('bed', 2.6, 1.6, 1.4, 2.0, 0.5, Math.PI / 2);
const niche = () => [
  surf('wall', [0, 0, 4, 0], 2.5),
  surf('wall', [4, 0, 4, 3.5], 2.5),
  surf('wall', [4, 3.5, 2.3, 3.5], 2.5),
  surf('wall', [2.3, 3.5, 2.3, 4.1], 2.5),
  surf('wall', [2.3, 4.1, 0.3, 4.1], 2.5),
  surf('wall', [0.3, 4.1, 0.3, 3.5], 2.5),
  surf('wall', [0.3, 3.5, 0, 3.5], 2.5),
  surf('wall', [0, 3.5, 0, 0], 2.5),
  surf('window', [1.4, 0, 2.6, 0], 1.35, 0.9),
  surf('door', [4, 0.3, 4, 1.13], 2.04),
];

describe('la façade de placard toute hauteur', () => {
  it.each([2.0, 1.8, 1.4])('un placard de %s × 2,45 : une porte, un placard, aucune porte-fenêtre', (L) => {
    scan([...chambre(), surf('door', [0.3 + L, 3.5, 0.3, 3.5], 2.45)], [lit()]);
    expect(portes()).toHaveLength(1);
    expect(placards()).toHaveLength(1);
    expect(segLength(placards()[0])).toBeCloseTo(L, 2);
    expect(placards()[0].vantaux).toBeUndefined();
    expect(fenetres()).toHaveLength(1);
    expect(aires()[0]).toBeCloseTo(14, 2);
  });

  it('trois vantaux de 0,80 vus comme trois portes : une façade de 2,40 à sa place', () => {
    scan(
      [...chambre(), surf('door', [2.7, 3.5, 1.9, 3.5], 2.45), surf('door', [1.9, 3.5, 1.1, 3.5], 2.45), surf('door', [1.1, 3.5, 0.3, 3.5], 2.45)],
      [lit()],
    );
    expect(portes()).toHaveLength(1);
    expect(placards()).toHaveLength(1);
    const p = placards()[0];
    expect([Math.min(p.a.x, p.b.x), Math.max(p.a.x, p.b.x)].map((v) => Math.round(v * 100) / 100)).toEqual([0.3, 2.7]);
  });

  it('collée au plafond (2,50 sous 2,50) : placard', () => {
    scan([...chambre(), surf('door', [2.3, 3.5, 0.3, 3.5], 2.5)], [lit()]);
    expect(placards()).toHaveLength(1);
  });

  it('le bilan de fin de scan ne la compte pas comme porte', () => {
    scan([...chambre(), surf('door', [2.3, 3.5, 0.3, 3.5], 2.45)], [lit()]);
    const s = st();
    expect(bilanDuReleve({ rooms: s.rooms, walls: s.walls, openings: s.openings, objects: s.objects } as never)?.portes).toBe(1);
  });
});

describe('le placard en niche', () => {
  it('la façade reste sur sa ligne, pas sur le fond ; la niche se nomme Placard', () => {
    scan([...niche(), surf('door', [2.3, 3.5, 0.3, 3.5], 2.45)], [lit()]);
    expect(placards()).toHaveLength(1);
    expect(placards()[0].a.z).toBeCloseTo(3.5, 2);
    expect(aires()[0]).toBeCloseTo(14, 2);
    expect(aires()[1]).toBeCloseTo(1.2, 2);
    expect(noms()).toContain('Placard');
  });

  it('vantaux vus ouverts : même résultat', () => {
    scan([...niche(), surf('door', [2.3, 3.5, 0.3, 3.5], 2.45, 0, true)], [lit()]);
    expect(placards()).toHaveLength(1);
    expect(placards()[0].open).toBeUndefined();
    expect(noms()).toContain('Placard');
  });
});

describe('le meuble storage qui double la façade', () => {
  it.each([3.8, 3.2])('storage à z=%s : un placard, plus de meuble en double', (z) => {
    scan([...chambre(), surf('door', [2.3, 3.5, 0.3, 3.5], 2.45)], [lit(), obj('storage', 1.3, z, 2.0, 0.6, 2.45)]);
    expect(placards()).toHaveLength(1);
    expect(st().objects.map((o) => o.category)).toEqual(['bed']);
  });
});

describe("l'entrée et son placard ne font pas un garage", () => {
  it('12 m², un petit meuble, un placard de 2,40 × 2,45', () => {
    scan(
      [...rect(0, 0, 4, 3), surf('door', [4, 0.3, 4, 1.23], 2.15), surf('door', [3.0, 3, 0.6, 3], 2.45)],
      [obj('storage', 0.4, 1.5, 0.8, 0.3, 1.2, Math.PI / 2)],
    );
    expect(st().openings.some((o) => o.garage)).toBe(false);
    expect(noms()).not.toContain('Garage');
  });
});

describe('ce qui reste une porte, une baie, un garage', () => {
  it('baie coulissante 2,40 × 2,15 en façade : fenêtre', () => {
    scan([...rect(0, 0, 5, 4), surf('door', [1, 0, 3.4, 0], 2.15), surf('door', [0, 3, 0, 3.83], 2.04)], [obj('sofa', 2.5, 2, 2, 0.9, 0.8)]);
    expect(plusLarge().type).toBe('window');
    expect(plusLarge().placard).toBeUndefined();
  });
  it('baie 2,40 × 2,35 sous plafond 2,50 : fenêtre', () => {
    scan([...rect(0, 0, 5, 4), surf('door', [1, 0, 3.4, 0], 2.35), surf('door', [0, 3, 0, 3.83], 2.04)], [obj('sofa', 2.5, 2, 2, 0.9, 0.8)]);
    expect(plusLarge().type).toBe('window');
  });
  it('porte double 1,40 × 2,04 : deux vantaux', () => {
    scan([...rect(0, 0, 4, 4), ...rect(4.1, 0, 8, 4), surf('door', [4.05, 1, 4.05, 2.4], 2.04)]);
    expect(plusLarge().vantaux).toBe(2);
    expect(plusLarge().placard).toBeUndefined();
  });
  it('double porte vitrée toute hauteur 1,60 × 2,45 entre deux pièces : porte double', () => {
    scan([...rect(0, 0, 5, 4), ...rect(5.1, 0, 8, 4), surf('door', [5.05, 1, 5.05, 2.6], 2.45)]);
    expect(plusLarge().placard).toBeUndefined();
    expect(plusLarge().vantaux).toBe(2);
  });
  it('porte de garage 2,40 × 2,00 : garage', () => {
    scan(
      [...rect(0, 0, 6, 5), surf('door', [1.5, 0, 3.9, 0], 2.0), surf('door', [6, 3, 6, 3.83], 2.04)],
      [obj('storage', 0.4, 2.5, 1.2, 0.5, 1.8, Math.PI / 2)],
    );
    expect(plusLarge().garage).toBe(true);
  });
  it('porte à imposte 0,83 × 2,45, seule : reste une porte', () => {
    scan([...rect(0, 0, 4, 4), ...rect(4.1, 0, 8, 4), surf('door', [4.05, 1, 4.05, 1.83], 2.45)]);
    expect(portes()).toHaveLength(1);
  });
  it('porte haussmannienne 1,40 × 2,60 sous 3,30 : porte double', () => {
    scan([...rect(0, 0, 5, 4, 3.3), surf('door', [5, 0.8, 5, 1.49], 2.6), surf('door', [5, 1.51, 5, 2.2], 2.6)]);
    const p = portes() as WallSeg[];
    expect(p).toHaveLength(1);
    expect(p[0].vantaux).toBe(2);
  });
});

describe('corrigée à la main', () => {
  it('« C’est une porte » lui retire son drapeau de placard', () => {
    scan([...chambre(), surf('door', [2.3, 3.5, 0.3, 3.5], 2.45)], [lit()]);
    const id = placards()[0].id;
    act(() => st().setOpeningType(id, 'door'));
    expect(st().openings.find((o) => o.id === id)?.placard).toBeUndefined();
  });
});

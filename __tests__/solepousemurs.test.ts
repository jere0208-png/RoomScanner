/**
 * LE SOL ÉPOUSE LES MURS — relevé du patron : « les sols sont mal tracés ».
 *
 * Chaque cas part d'un relevé RoomPlan simulé, passe par la vraie fin de scan
 * (`finalize`) et vérifie que le sol (plan ET maquette) tient dans les murs,
 * au centimètre, et que la surface « mesurée par le scan » est celle de la
 * pièce, pas celle du sol RoomPlan qui file dans le couloir.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
import { act } from 'react-test-renderer';
import type { SurfaceData } from 'react-native-room-scan';
import { joindreLesCoins, roomParts, roomSurface, type WallSeg } from '../src/geometry/floorplan';
import { solReleveDe } from '../src/geometry/fichePiece';
import { buildScene } from '../src/geometry/scene3d';
import { MAQUETTE } from '../src/ui/maquette';
import { useScanStore } from '../src/store/scanStore';

type Pt = { x: number; z: number };
let n = 0;
function surf([ax, az, bx, bz]: number[], type = 'wall', h = 2.5): SurfaceData {
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L;
  const uz = (bz - az) / L;
  return {
    id: `${type}-${++n}`, type, length: L, height: h, confidence: 'high',
    category: type === 'door' ? 'door(isOpen: false)' : type,
    transform: [ux, 0, uz, 0, 0, 1, 0, 0, -uz, 0, ux, 0, (ax + bx) / 2, -1.3 + h / 2, (az + bz) / 2, 1],
  } as unknown as SurfaceData;
}
const seg = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg =>
  ({ id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 0 }) as WallSeg;
const st = () => useScanStore.getState();
const scan = (surfaces: SurfaceData[], sols?: { coins: number[]; y: number }[]) =>
  act(() => {
    useScanStore.setState({ walls: [], openings: [], objects: [], rooms: [], fixtures: [], ceiling: [], saves: [], niveauCourant: 0 } as never);
    st().finalize({ modelPath: '', surfaces, objects: [], trajet: [], sols } as never);
  });
const pieces = () => roomParts(st().walls, st().rooms as never);
const grande = () => pieces().filter((p) => p.surface).sort((a, b) => b.surface!.area - a.surface!.area)[0];
/** Le plus grand écart d'un sommet du sol hors de la boîte [x0,x1]×[z0,z1]. */
const debord = (pts: Pt[], x0: number, x1: number, z0: number, z1: number) =>
  Math.max(0, ...pts.map((p) => Math.max(x0 - p.x, p.x - x1, z0 - p.z, p.z - z1)));
const solsDeLaMaquette = () =>
  buildScene(st().walls, st().openings, [], { palette: MAQUETTE, rooms: st().rooms as never, showSurfaces: true } as never)
    .faces.filter((f) => f.isFloor && f.fill && f.pts.length >= 3);

describe('S1 — les coins que RoomPlan n’a pas fermés se rejoignent', () => {
  it.each([0.2, 0.3])('quatre murs arrêtés à %s m de chaque coin : 12 m², fermé', (d) => {
    scan([surf([d, 0, 4 - d, 0]), surf([4, d, 4, 3 - d]), surf([4 - d, 3, d, 3]), surf([0, 3 - d, 0, d])]);
    expect(grande().surface!.exact).toBe(true);
    expect(grande().surface!.area).toBeCloseTo(12, 2);
  });

  it.each([0.25, 0.35])('quatre murs qui se croisent de %s m à chaque coin : 12 m², pas « aucun sol »', (d) => {
    scan([surf([-d, 0, 4 + d, 0]), surf([4, -d, 4, 3 + d]), surf([4 + d, 3, -d, 3]), surf([0, 3 + d, 0, -d])]);
    expect(grande().surface!.area).toBeCloseTo(12, 2);
    expect(debord(grande().surface!.pts, 0, 4, 0, 3)).toBeLessThan(0.005);
  });

  it('deux montants de porte face à face ne se rejoignent pas (parallèles)', () => {
    const w = joindreLesCoins([seg('a', 3, 0, 3, 0.4), seg('b', 3, 4, 3, 3.6)]);
    expect(w[0].b).toEqual({ x: 3, z: 0.4 });
    expect(w[1].b).toEqual({ x: 3, z: 3.6 });
  });

  it('un coin ne se rejoint pas à travers un autre mur', () => {
    const w = joindreLesCoins([seg('a', 0, 0, 3.7, 0), seg('b', 4, 0.3, 4, 3), seg('c', 3.85, -1, 3.85, 1)]);
    expect(w[0].b.x).toBeCloseTo(3.7, 6);
  });
});

describe('S2 — la pièce ouverte se ferme par sa corde, sans la cloison du couloir', () => {
  it('3 murs + la cloison du couloir qui part d’un coin : 12 m², rien sous z < 0', () => {
    scan([surf([0, 0, 3, 0]), surf([3, 0, 4.2, 0]), surf([0, 4, 3, 4]), surf([3, 4, 4.2, 4]), surf([0, 0, 0, 4]), surf([3, 0, 3, -2])]);
    const s = grande().surface!;
    expect(s.exact).toBe(false);
    expect(s.area).toBeCloseTo(12, 2);
    expect(debord(s.pts, 0, 3, 0, 4)).toBeLessThan(0.005);
    // La maquette pose le même sol.
    for (const f of solsDeLaMaquette()) expect(Math.min(...f.pts.map((p) => p.z))).toBeGreaterThan(-0.005);
  });

  it('un retour tourné vers l’intérieur ne coupe pas la pièce', () => {
    const s = roomSurface([seg('a', 0, 0, 3.5, 0), seg('b', 3.5, 3, 0, 3), seg('c', 0, 3, 0, 1.5), seg('d', 0, 1.5, 0, 0), seg('e', 0, 1.5, 0.6, 1.5)])!;
    expect(s.area).toBeCloseTo(10.5, 3);
  });

  it('une cloison qui prolonge le côté ouvert ne coupe rien', () => {
    const s = roomSurface([seg('a', 0, 0, 3.5, 0), seg('b', 3.5, 3, 0, 3), seg('c', 0, 3, 0, 0), seg('d', 3.5, 3, 3.5, 5)])!;
    expect(s.area).toBeCloseTo(10.5, 3);
  });
});

describe('S3 — la surface « mesurée par le scan » est recadrée sur la pièce', () => {
  const ch: Pt[] = [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 2.5 }, { x: 0, z: 2.5 }];

  it('un sol RoomPlan de 5 × 5 dans une chambre de 3 × 2,5 : 7,50, pas 25', () => {
    expect(solReleveDe([{ coins: [-0.5, -0.5, 4.5, -0.5, 4.5, 4.5, -0.5, 4.5] }], ch)).toBeCloseTo(7.5, 2);
  });

  it('un sol en L dont le barycentre tombe hors du L est retrouvé', () => {
    const L: Pt[] = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 0.8 }, { x: 0.8, z: 0.8 }, { x: 0.8, z: 4 }, { x: 0, z: 4 }];
    expect(solReleveDe([{ coins: L.flatMap((p) => [p.x, p.z]) }], L)).toBeCloseTo(5.76, 2);
  });

  it('un seul sol pour deux pièces : chacune sa part', () => {
    scan(
      [surf([0, 0, 4, 0]), surf([4, 0, 4, 3]), surf([4, 3, 0, 3]), surf([0, 3, 0, 0]),
        surf([4.1, 0, 6.1, 0]), surf([6.1, 0, 6.1, 3]), surf([6.1, 3, 4.1, 3]), surf([4.1, 3, 4.1, 0]),
        surf([4.05, 1, 4.05, 1.8], 'door', 2.04)],
      [{ coins: [0, 0, 6.1, 0, 6.1, 3, 0, 3], y: -1.3 }],
    );
    const s = (st().rooms as { releve?: { surfaceSol?: number } }[]).map((r) => r.releve?.surfaceSol ?? 0).sort((a, b) => b - a);
    expect(s[0]).toBeLessThan(12.3);
    expect(s[1]).toBeGreaterThan(5.9);
  });

  it('pièce ouverte (pas de contour) : recadré sur l’enveloppe de ses murs', () => {
    const murs = [{ a: { x: 0, z: 0 }, b: { x: 3, z: 0 } }, { a: { x: 0, z: 4 }, b: { x: 3, z: 4 } }, { a: { x: 0, z: 0 }, b: { x: 0, z: 4 } }];
    expect(solReleveDe([{ coins: [0, 0, 5, 0, 5, 4, 0, 4] }], [], murs)).toBeCloseTo(12, 2);
  });
});

describe('S4 — les petites pièces, bruitées : le sol reste dans ses murs', () => {
  it('WC 0,90 × 1,60 relevé à ±3 cm : 1,44 m² à 2 % près, sol dans les murs à 3 cm près', () => {
    scan([surf([0.02, 0, 0.88, 0.01]), surf([0.9, -0.02, 0.92, 1.62]), surf([0.93, 1.6, -0.01, 1.58]), surf([0, 1.63, 0.01, -0.03]), surf([0.1, 1.6, 0.8, 1.6], 'door', 2.04)]);
    expect(Math.abs(grande().surface!.area - 1.44) / 1.44).toBeLessThan(0.02);
    expect(debord(grande().surface!.pts, 0, 0.9, 0, 1.6)).toBeLessThan(0.03);
  });

  it('pièce en L bruitée : 16,25 m² à 0,5 % près, la maquette et le plan ont le même sol', () => {
    scan([
      surf([-0.02, 0.01, 5.03, -0.02]), surf([4.98, -0.03, 5.02, 2.53]), surf([5.03, 2.48, 2.47, 2.52]),
      surf([2.52, 2.47, 2.48, 4.03]), surf([2.53, 3.98, -0.03, 4.02]), surf([0.02, 4.03, -0.02, -0.03]),
      surf([0, 1, 0, 1.83], 'door', 2.04),
    ]);
    const s = grande().surface!;
    expect(Math.abs(s.area - 16.25) / 16.25).toBeLessThan(0.005);
    const f = solsDeLaMaquette();
    expect(f).toHaveLength(1);
    expect(f[0].pts.map((p) => [p.x, p.z])).toEqual(s.pts.map((p) => [p.x, p.z]));
  });
});

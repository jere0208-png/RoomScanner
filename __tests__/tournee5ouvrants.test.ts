/**
 * TOURNÉE N°5 — LES OUVRANTS : LA PORTE À DEUX VANTAUX, LA FENÊTRE PLUS
 * PETITE.
 *
 * - « Hélène » (haussmannien) : la porte double du salon d'angle, 1,40 m,
 *   sortait en deux portes de 0,69 bout à bout — deux battants de 0,69,
 *   deux cotes, deux passages. Et la fenêtre de l'office, sur cour, se
 *   voyait proposer de remonter au niveau des fenêtres des chambres.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { SurfaceData } from 'react-native-room-scan';
import { buildDxf } from '../src/export/dxf';
import { linteauxRabotes, segLength, type WallSeg } from '../src/geometry/floorplan';
import { portesDoubles } from '../src/geometry/logique';
import { battantsDesPortes } from '../src/geometry/passage';
import { useScanStore } from '../src/store/scanStore';

const st = () => useScanStore.getState();
const porte = (id: string, az: number, bz: number, h = 2.6, x = 5, bas = 0): WallSeg => ({
  id,
  type: 'door',
  a: { x, z: az },
  b: { x, z: bz },
  height: h,
  yCenter: bas + h / 2,
});

describe('deux vantaux bout à bout', () => {
  it('font une porte double de 1,40', () => {
    const out = portesDoubles([porte('a', 0.8, 1.49), porte('b', 1.51, 2.2)]);
    expect(out).toHaveLength(1);
    expect(segLength(out[0])).toBeCloseTo(1.4, 6);
    expect(out[0].vantaux).toBe(2);
    expect(out[0].type).toBe('door');
  });

  it('dans les deux sens de relevé, et même quand ils se recouvrent d’un rien', () => {
    expect(portesDoubles([porte('b', 2.2, 1.51), porte('a', 1.49, 0.8)])).toHaveLength(1);
    expect(portesDoubles([porte('a', 0.8, 1.52), porte('b', 1.49, 2.2)])).toHaveLength(1);
  });

  it('deux portes voisines, séparées par un trumeau, restent deux', () => {
    expect(portesDoubles([porte('a', 0.8, 1.6), porte('b', 1.8, 2.6)])).toHaveLength(2);
  });

  it('ni deux portes de hauteurs différentes, ni une porte d’un autre mur, ni une grande porte', () => {
    expect(portesDoubles([porte('a', 0.8, 1.49), porte('b', 1.51, 2.2, 2.04)])).toHaveLength(2);
    expect(portesDoubles([porte('a', 0.8, 1.49), porte('b', 1.51, 2.2, 2.6, 5.2)])).toHaveLength(2);
    expect(portesDoubles([porte('a', 0.2, 1.49), porte('b', 1.51, 2.2)])).toHaveLength(2);
  });

  it('une porte de 1,20 m et plus, vue d’un seul tenant, a deux vantaux', () => {
    const [d] = portesDoubles([porte('d', 0.81, 2.19)]);
    expect(d.vantaux).toBe(2);
    expect(segLength(d)).toBeCloseTo(1.38, 6);
    // Une porte de 0,93, non.
    expect(portesDoubles([porte('s', 0.8, 1.73)])[0].vantaux).toBeUndefined();
  });

  it('une fenêtre contre une porte n’en fait pas une porte double', () => {
    const fenetre = { ...porte('b', 1.51, 2.2), type: 'window' as const };
    expect(portesDoubles([porte('a', 0.8, 1.49), fenetre])).toHaveLength(2);
  });
});

describe('au scan', () => {
  let n = 0;
  function surface(type: string, s: [number, number, number, number], h = 2.5): SurfaceData {
    const [ax, az, bx, bz] = s;
    const L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L;
    const uz = (bz - az) / L;
    return {
      id: `${type}-vx-${++n}`,
      type,
      length: L,
      height: h,
      confidence: 'high',
      category: type === 'door' ? 'door(isOpen: false)' : type,
      transform: [ux, 0, uz, 0, 0, 1, 0, 0, -uz, 0, ux, 0, (ax + bx) / 2, -1.3 + h / 2, (az + bz) / 2, 1],
    } as unknown as SurfaceData;
  }

  it('la porte double sort une fois, à deux vantaux de 0,70, au plan comme au DXF', () => {
    useScanStore.setState({ walls: [], openings: [], objects: [], rooms: [], fixtures: [], ceiling: [], saves: [], niveauCourant: 0 } as never);
    st().finalize({
      modelPath: '',
      surfaces: [
        surface('wall', [0, 0, 5, 0], 3.3),
        surface('wall', [5, 0, 5, 4], 3.3),
        surface('wall', [5, 4, 0, 4], 3.3),
        surface('wall', [0, 4, 0, 0], 3.3),
        surface('door', [5, 0.8, 5, 1.49], 2.6),
        surface('door', [5, 1.51, 5, 2.2], 2.6),
      ],
      objects: [],
    } as never);
    const s = st();
    const portes = s.openings.filter((o) => o.type === 'door');
    expect(portes).toHaveLength(1);
    expect(segLength(portes[0])).toBeCloseTo(1.4, 2);
    expect(portes[0].vantaux).toBe(2);
    const battants = battantsDesPortes(s.openings, s.walls, s.rooms);
    expect(battants.map((b) => Math.round(b.r * 100) / 100)).toEqual([0.7, 0.7]);
    const dxf = buildDxf({ walls: s.walls, openings: portes, rooms: s.rooms, fixtures: [] });
    const l = dxf.split('\n').map((x) => x.trim());
    const entites = l.flatMap((x, i) => (x === 'ECHOPLAN-PORTES' && l[i - 1] === '8' && !['VERTEX', 'SEQEND'].includes(l[i - 2]) ? [l[i - 2]] : []));
    // Le dormant, puis pour chaque vantail son trait et son arc.
    expect(entites).toEqual(['LINE', 'LINE', 'POLYLINE', 'LINE', 'POLYLINE']);
  });
});

describe('le linteau', () => {
  const fenetre = (id: string, x: number, h: number, bas: number): WallSeg => ({
    id,
    type: 'window',
    a: { x, z: 10 },
    b: { x: x + 1.2, z: 10 },
    height: h,
    yCenter: bas + h / 2,
  });

  it('une fenêtre plus petite, à l’allège plus haute, n’est pas rabotée', () => {
    // L'office (allège 0,95, haut 2,55) entre deux chambres (allège 0,60, haut 2,80).
    const baies = [fenetre('office', 1, 1.6, 0.95), fenetre('ch1', 6, 2.2, 0.6), fenetre('ch2', 10.8, 2.2, 0.6)];
    expect(linteauxRabotes(baies)).toEqual([]);
  });

  it('une fenêtre rabotée par son volet garde l’allège de ses voisines : elle, on la signale', () => {
    const baies = [fenetre('rabotee', 1, 1.95, 0.6), fenetre('ch1', 6, 2.2, 0.6), fenetre('ch2', 10.8, 2.2, 0.6)];
    expect(linteauxRabotes(baies).map((x) => x.id)).toEqual(['rabotee']);
  });
});

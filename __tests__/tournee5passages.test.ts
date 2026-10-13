/**
 * TOURNÉE N°5 — UNE CHOSE, UNE FOIS, PASSAGE APRÈS PASSAGE.
 *
 * - « Thomas » (un T4 en cinq passages) : la pièce du voisin, retirée,
 *   revenait au passage suivant ; chaque porte d'une cloison sortait deux
 *   fois, une par pièce ; le séjour repris gardait deux canapés, l'ancien
 *   poussé dans le refend.
 * - « Bérénice » : la table de 2,40 m coupée en deux par RoomPlan, la baie
 *   séjour/véranda en double, avec un battant de 2,40 m.
 * - « Gérard » : la baie de 2,40 m entre séjour et loggia restait une porte.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { ObjectData, SurfaceData } from 'react-native-room-scan';
import { sansBaiesEnDouble, sansMeublesEnDouble } from '../src/geometry/logique';
import { baiesVitrees, roomParts, segLength, type WallSeg } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';

const st = () => useScanStore.getState();
const baie = (id: string, type: WallSeg['type'], ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type,
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.04,
  yCenter: 1.02,
});
const meuble = (id: string, category: string, x: number, z: number, w: number, d: number): ObjectData =>
  ({
    id,
    category,
    width: w,
    depth: d,
    height: 0.8,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.4, z, 1],
  }) as ObjectData;

describe('une baie vue des deux côtés de son mur', () => {
  it('ne sort qu’une fois, au milieu des deux faces', () => {
    const out = sansBaiesEnDouble([baie('p1', 'door', 1, 0, 1.83, 0), baie('p2', 'door', 1.02, 0.09, 1.84, 0.09), baie('f', 'window', 3, 0, 4.2, 0)]);
    expect(out.map((o) => o.id)).toEqual(['p1', 'f']);
    const p = out[0];
    expect((p.a.z + p.b.z) / 2).toBeCloseTo(0.045, 6);
    expect(segLength(p)).toBeCloseTo(0.825, 6);
  });

  it('deux portes voisines, côte à côte, restent deux', () => {
    const out = sansBaiesEnDouble([baie('p1', 'door', 1, 0, 1.83, 0), baie('p2', 'door', 2.2, 0, 3.03, 0)]);
    expect(out).toHaveLength(2);
  });
});

describe('un meuble vu deux fois', () => {
  it('le canapé repris à un passage de plus ne fait qu’un canapé', () => {
    const out = sansMeublesEnDouble([meuble('c1', 'sofa', 2, 5.25, 2.2, 0.9), meuble('c2', 'sofa', 2.05, 5.2, 2.15, 0.92)]);
    expect(out).toHaveLength(1);
  });

  it('la table de 2,40 m coupée en deux ressort en une seule', () => {
    const out = sansMeublesEnDouble([meuble('t1', 'table', 1, 2, 1.2, 0.9), meuble('t2', 'table', 2.21, 2, 1.2, 0.9)]);
    expect(out).toHaveLength(1);
    expect(out[0].width).toBeCloseTo(2.41, 6);
    expect(out[0].transform[12]).toBeCloseTo(1.605, 6);
  });

  it('deux chaises côte à côte restent deux chaises', () => {
    const out = sansMeublesEnDouble([meuble('a', 'chair', 1, 1, 0.45, 0.5), meuble('b', 'chair', 1.6, 1, 0.45, 0.5)]);
    expect(out).toHaveLength(2);
  });
});

describe('une baie de deux mètres', () => {
  it('est une baie, même entre deux pièces', () => {
    const murs = [
      baie('n', 'wall', 0, 0, 8, 0),
      baie('e', 'wall', 8, 0, 8, 4),
      baie('s', 'wall', 8, 4, 0, 4),
      baie('o', 'wall', 0, 4, 0, 0),
      baie('c', 'wall', 5, 0, 5, 4),
    ];
    const contours = roomParts(murs, [
      { id: 'sej', wallIds: ['n', 'c', 's', 'o'] },
      { id: 'log', wallIds: ['n', 'e', 's', 'c'] },
    ])
      .map((p) => p.surface?.pts ?? [])
      .filter((c) => c.length >= 3);
    const [b] = baiesVitrees([baie('b', 'door', 5, 0.8, 5, 3.2)], murs, contours);
    expect(b.type).toBe('window');
    const [p] = baiesVitrees([baie('p', 'door', 5, 0.8, 5, 2.2)], murs, contours);
    expect(p.type).toBe('door');
  });
});

describe('la pièce retirée', () => {
  let n = 0;
  const surface = (s: [number, number, number, number]): SurfaceData => {
    const [ax, az, bx, bz] = s;
    const L = Math.hypot(bx - ax, bz - az);
    return {
      id: `w-pr-${++n}`,
      type: 'wall',
      length: L,
      height: 2.5,
      confidence: 'high',
      category: 'wall',
      transform: [(bx - ax) / L, 0, (bz - az) / L, 0, 0, 1, 0, 0, -(bz - az) / L, 0, (bx - ax) / L, 0, (ax + bx) / 2, -0.05, (az + bz) / 2, 1],
    } as unknown as SurfaceData;
  };
  const piece = (x: number): SurfaceData[] => [
    surface([x, 0, x + 4, 0]),
    surface([x + 4, 0, x + 4, 3]),
    surface([x + 4, 3, x, 3]),
    surface([x, 3, x, 0]),
  ];

  it('ne revient pas au passage suivant ; la nôtre reste', () => {
    useScanStore.setState({ walls: [], openings: [], objects: [], rooms: [], fixtures: [], ceiling: [], saves: [], niveauCourant: 0 } as never);
    st().finalize({ modelPath: '', surfaces: piece(0), objects: [] } as never);
    // Le passage fait par erreur chez le voisin, de l'autre côté du palier.
    st().finalizeMerge({ modelPath: '', passages: 2, surfaces: [...piece(0), ...piece(10)], objects: [] } as never);
    expect(st().rooms).toHaveLength(2);
    const voisin = roomParts(st().walls, st().rooms).find((p) => (p.surface?.pts ?? []).some((q) => q.x > 9))!;
    st().removeRoom(voisin.roomId);
    expect(st().rooms).toHaveLength(1);
    // L'iPhone relivre tous les passages faits.
    st().finalizeMerge({ modelPath: '', passages: 3, surfaces: [...piece(0), ...piece(10)], objects: [] } as never);
    expect(st().rooms).toHaveLength(1);
    expect(st().walls.every((w) => Math.max(w.a.x, w.b.x) < 5)).toBe(true);
  });
});

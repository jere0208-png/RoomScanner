/**
 * TOURNÉE N°5 — LE GARAGE ET LE CELLIER.
 *
 * - « Bérénice » (villa du patio) : le garage, porte sectionnelle de 2,40 m
 *   sur la rue, ressortait « Pièce 2 », compté habitable (29,8 m² de trop) ;
 *   sa porte, prise pour une baie, se dessinait en vitrage. Le cellier
 *   (congélateur, lave-linge, sèche-linge) s'appelait « Cuisine 2 ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { ObjectData, SurfaceData } from 'react-native-room-scan';
import { buildDxf } from '../src/export/dxf';
import { deduceRoomKind } from '../src/geometry/furniture';
import { baiesVitrees, roomParts, segLength, type WallSeg } from '../src/geometry/floorplan';
import { surfacesHabitables } from '../src/geometry/habitable';
import { battantsDesPortes } from '../src/geometry/passage';
import { useScanStore } from '../src/store/scanStore';

const st = () => useScanStore.getState();
let n = 0;
function surface(type: string, s: [number, number, number, number], h = 2.5, bas = 0): SurfaceData {
  const [ax, az, bx, bz] = s;
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L;
  const uz = (bz - az) / L;
  return {
    id: `${type}-gar-${++n}`,
    type,
    length: L,
    height: h,
    confidence: 'high',
    category: type === 'door' ? 'door(isOpen: false)' : type,
    transform: [ux, 0, uz, 0, 0, 1, 0, 0, -uz, 0, ux, 0, (ax + bx) / 2, -1.3 + bas + h / 2, (az + bz) / 2, 1],
  } as unknown as SurfaceData;
}
function meuble(category: string, x: number, z: number, w: number, d: number, h: number): ObjectData {
  return {
    id: `obj-gar-${++n}`,
    category,
    width: w,
    depth: d,
    height: h,
    confidence: 'high',
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, -1.3 + h / 2, z, 1],
  } as unknown as ObjectData;
}
const piece = (x0: number, z0: number, x1: number, z1: number, h = 2.5) => [
  surface('wall', [x0, z0, x1, z0], h),
  surface('wall', [x1, z0, x1, z1], h),
  surface('wall', [x1, z1, x0, z1], h),
  surface('wall', [x0, z1, x0, z0], h),
];
const vide = () =>
  useScanStore.setState({ walls: [], openings: [], objects: [], rooms: [], fixtures: [], ceiling: [], saves: [], niveauCourant: 0 } as never);
const pieceEn = (x: number, z: number) => {
  const parts = roomParts(st().walls, st().rooms);
  const p = parts.find((q) => {
    const c = q.surface?.pts ?? [];
    let dedans = false;
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
      if (c[i].z > z !== c[j].z > z && x < ((c[j].x - c[i].x) * (z - c[i].z)) / (c[j].z - c[i].z) + c[i].x) dedans = !dedans;
    }
    return dedans;
  });
  return st().rooms.find((r) => r.id === p?.roomId);
};

describe('le cellier', () => {
  it('congélateur, lave-linge et sèche-linge font un cellier, pas une cuisine', () => {
    expect(deduceRoomKind(['refrigerator', 'washerDryer', 'washerDryer', 'storage'])).toBe('cellier');
    expect(deduceRoomKind(['washer', 'dryer'])).toBe('cellier');
  });

  it('une vraie cuisine, une vraie salle de bains, restent ce qu’elles sont', () => {
    expect(deduceRoomKind(['refrigerator', 'stove', 'sink', 'washer'])).toBe('kitchen');
    // Le réfrigérateur et le lave-linge d'une petite cuisine : à égalité, la cuisine l'emporte.
    expect(deduceRoomKind(['refrigerator', 'washer'])).toBe('kitchen');
    expect(deduceRoomKind(['bathtub', 'sink', 'washer'])).toBe('bathroom');
  });
});

describe('le garage', () => {
  // Un séjour (6 × 5) et, derrière un refend de 20 cm, un garage (5 × 5).
  const releve = (garage: { porte?: number; fenetreBasse?: boolean; meubles?: string[] } = {}) => ({
    modelPath: '',
    surfaces: [
      ...piece(0, 0, 6, 5),
      ...piece(6.2, 0, 11.2, 5, 2.45),
      // La baie coulissante du séjour, que RoomPlan range parmi les portes.
      surface('door', [1, 0, 3.4, 0], 2.15),
      surface('window', [0, 1.5, 0, 2.7], 1.25, 0.95),
      // La porte de garage sur la rue, et sa petite fenêtre haute.
      surface('door', [7.5, 0, 7.5 + (garage.porte ?? 2.4), 0], 2.0),
      garage.fenetreBasse ? surface('window', [11.2, 2, 11.2, 3.2], 1.25, 0.95) : surface('window', [11.2, 2.2, 11.2, 3], 0.6, 1.4),
      // La porte de service, vue des deux faces du refend.
      surface('door', [6, 4, 6, 4.83], 2.04),
      surface('door', [6.2, 4, 6.2, 4.83], 2.04),
    ],
    objects: [
      meuble('sofa', 3, 3.5, 2.2, 0.9, 0.85),
      ...(garage.meubles ?? ['storage', 'table']).map((c, i) => meuble(c, 8 + i * 1.5, 4.2, 1.2, 0.6, 0.9)),
    ],
  });

  it('se nomme « Garage », ne compte pas dans l’habitable, et sa porte reste une porte', () => {
    vide();
    st().finalize(releve() as never);
    const g = pieceEn(8.7, 2.5)!;
    expect(g.name).toBe('Garage');
    const hab = surfacesHabitables(st().rooms, roomParts(st().walls, st().rooms), st().objects);
    expect(hab.pieces.find((p) => p.roomId === g.id)?.habitable).toBe(0);
    const porte = st().openings.find((o) => segLength(o) > 2.3 && Math.min(o.a.x, o.b.x) > 7)!;
    expect(porte.type).toBe('door');
    expect(porte.garage).toBe(true);
    // La baie du séjour, elle, reste une baie.
    const baie = st().openings.find((o) => segLength(o) > 2.3 && Math.max(o.a.x, o.b.x) < 4)!;
    expect(baie.type).toBe('window');
    expect(pieceEn(3, 2.5)?.name).not.toBe('Garage');
  });

  it('se dessine sans battant : ni quart de cercle sur le plan, ni dans le DXF', () => {
    vide();
    st().finalize(releve() as never);
    const s = st();
    const porte = s.openings.find((o) => o.garage)!;
    expect(battantsDesPortes(s.openings, s.walls, s.rooms).some((b) => b.id === porte.id)).toBe(false);
    const dxf = buildDxf({ walls: s.walls, openings: s.openings.filter((o) => o.id === porte.id), rooms: s.rooms, fixtures: [] });
    // Le dormant seul sur le calque des portes : ni vantail, ni arc.
    const l = dxf.split('\n').map((x) => x.trim());
    const entites = l.flatMap((x, i) => (x === 'ECHOPLAN-PORTES' && l[i - 1] === '8' ? [l[i - 2]] : []));
    expect(entites).toEqual(['LINE']);
  });

  it('une baie de séjour n’en fait pas un garage : fenêtre à hauteur d’homme, ou meubles de vie', () => {
    vide();
    st().finalize(releve({ fenetreBasse: true }) as never);
    expect(pieceEn(8.7, 2.5)?.name).not.toBe('Garage');
    vide();
    st().finalize(releve({ meubles: ['bed'] }) as never);
    expect(pieceEn(8.7, 2.5)?.name).not.toBe('Garage');
    // Une porte de 1,80 m n'est pas une porte de garage.
    vide();
    st().finalize(releve({ porte: 1.8 }) as never);
    expect(pieceEn(8.7, 2.5)?.name).not.toBe('Garage');
  });

  it('un congélateur dans le garage ne le change pas en cuisine', () => {
    vide();
    st().finalize(releve({ meubles: ['storage', 'refrigerator'] }) as never);
    expect(pieceEn(8.7, 2.5)?.name).toBe('Garage');
  });

  it('une porte de garage ne redevient pas une baie à la réouverture', () => {
    const porte = { id: 'g', type: 'door', a: { x: 0, z: 0 }, b: { x: 2.4, z: 0 }, height: 2, yCenter: 1, garage: true } as WallSeg;
    expect(baiesVitrees([porte], [])[0].type).toBe('door');
  });

  it('corrigée à la main en fenêtre, elle n’est plus une porte de garage', () => {
    vide();
    st().finalize(releve() as never);
    const porte = st().openings.find((o) => o.garage)!;
    st().setOpeningType(porte.id, 'window');
    expect(st().openings.find((o) => o.id === porte.id)?.garage).toBeUndefined();
  });
});

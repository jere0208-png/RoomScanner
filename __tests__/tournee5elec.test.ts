/**
 * TOURNÉE N°5 — L'ÉLECTRICITÉ SUR UN VRAI SCAN.
 *
 * - « Gérard », « Thomas » : sur un relevé réel (sol à −1,30 m), « Normes
 *   auto » croyait tout meuble trop bas pour gêner, et posait les socles
 *   derrière le lit, le four, le lave-linge — l'un en volume 2 d'une
 *   baignoire. La cuisine recevait dix socles au lieu de six, et ni la
 *   cuisson ni les trois circuits spécialisés ne trouvaient de place.
 * - « Gérard » : la loggia suivait les règles du séjour.
 * - « Malik », « Amandine » : l'open space et le studio ressortaient
 *   « Cuisine », la salle d'eau « WC ».
 * - « Thomas » : le couloir restait « Pièce 2 ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { SurfaceData } from 'react-native-room-scan';
import { corrigerConstat, placesLibres, poserAuxNormes } from '../src/geometry/auto';
import { checkElectrical, requirementFor, roomUse, wallToRooms, type RoomInput } from '../src/geometry/nfc15100';
import { deduceRoomKind, deduireLaPiece } from '../src/geometry/furniture';
import { socketsOf } from '../src/geometry/electrical';
import { volumeAt, volumeVerdict, wetZones } from '../src/geometry/volumes';
import type { WallSeg } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';

const SOL = -1.3;
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: SOL + 1.25,
});
const piece4x3 = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];
/** Un meuble comme RoomPlan le livre : son centre à sol + h/2. */
const meuble = (category: string, x: number, z: number, w: number, d: number, h: number, roomId = 'r') => ({
  category,
  roomId,
  width: w,
  depth: d,
  height: h,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, SOL + h / 2, z, 1],
});
let k = 0;
const id = (p: string) => `${p}-${++k}`;

describe('les meubles sur un sol de scan', () => {
  it('un canapé cache la prise derrière lui ; un plan de travail ne cache pas une prise à 1,10 m', () => {
    const canape = meuble('sofa', 2, 0.45, 2.2, 0.9, 0.85);
    const bas = placesLibres(piece4x3, [], [canape], [], { x: 2, z: 1.5 }).find((m) => m.wall.id === 'n')!;
    expect(bas.libres.some(([a, b]) => a <= 2 && b >= 2)).toBe(false);
    const plan = meuble('storage', 2, 0.3, 2.2, 0.6, 0.9);
    const haut = placesLibres(piece4x3, [], [plan], [], { x: 2, z: 1.5 }, 1.1).find((m) => m.wall.id === 'n')!;
    expect(haut.libres.some(([a, b]) => a <= 2 && b >= 2)).toBe(true);
    // Au-dessus des feux, jamais.
    const feux = meuble('stove', 2, 0.3, 0.6, 0.6, 0.9);
    const sur = placesLibres(piece4x3, [], [feux], [], { x: 2, z: 1.5 }, 1.1).find((m) => m.wall.id === 'n')!;
    expect(sur.libres.some(([a, b]) => a <= 2 && b >= 2)).toBe(false);
  });
});

const inputs = (name: string, area = 12) => ({
  rooms: [{ id: 'r', name, kind: null, area, wallIds: piece4x3.map((w) => w.id), interieur: { x: 2, z: 1.5 } }],
  walls: piece4x3,
  openings: [],
  fixtures: [],
  ceiling: [],
  placement: new Map<string, string | null>(),
  id,
});

describe('« Normes auto »', () => {
  it('ne pose aucun socle dans les volumes 1 et 2 d’une baignoire', () => {
    const bain = meuble('bathtub', 0.85, 1.5, 1.7, 0.75, 0.6);
    // La baignoire le long du mur ouest, pivotée : sa longueur suit z.
    bain.transform = [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0.4, SOL + 0.3, 1.5, 1];
    const pose = poserAuxNormes({ ...inputs('Salle de bains', 12), objects: [bain] });
    const zones = wetZones([bain], SOL);
    const socles = pose.fixtures.filter((x) => socketsOf(x.kind) > 0);
    expect(socles.length).toBeGreaterThan(0);
    for (const f of socles) {
      const w = piece4x3.find((m) => m.id === f.wallId)!;
      const L = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
      const p = { x: w.a.x + ((w.b.x - w.a.x) / L) * f.along, z: w.a.z + ((w.b.z - w.a.z) / L) * f.along };
      expect(volumeAt(p, f.height, zones)).toBeNull();
    }
  });

  it('pose les quatre socles de la cuisine au-dessus du plan, puis les autres en bas : six, pas dix', () => {
    const pose = poserAuxNormes({ ...inputs('Cuisine', 10), objects: [] });
    const socles = pose.fixtures.filter((f) => f.kind === 'prise');
    expect(socles).toHaveLength(6);
    expect(socles.filter((f) => f.height >= 0.9)).toHaveLength(4);
  });
});

describe('la cuisson et les circuits spécialisés', () => {
  const cuisine: RoomInput = { id: 'r', name: 'Cuisine', kind: null, area: 10, wallIds: piece4x3.map((w) => w.id) };

  it('une cuisine sans circuit de cuisson 32 A est signalée', () => {
    const c = checkElectrical([cuisine], [], wallToRooms([cuisine])).find((x) => x.message.includes('cuisson 32 A'));
    expect(c?.severity).toBe('alerte');
    expect(c?.fix && 'kind' in c.fix ? c.fix.kind : null).toBe('prise32');
  });

  it('la 32 A se pose derrière la plaque relevée, la 20 A derrière le lave-vaisselle', () => {
    const ctx = {
      rooms: [{ ...cuisine, interieur: { x: 2, z: 1.5 } }],
      walls: piece4x3,
      openings: [],
      objects: [meuble('stove', 1, 0.3, 0.6, 0.6, 0.9), meuble('dishwasher', 3, 0.3, 0.6, 0.6, 0.85)],
      fixtures: [],
      id,
    };
    const p32 = corrigerConstat({ type: 'poser', kind: 'prise32', label: '' }, 'r', ctx)!.fixtures[0];
    expect(p32.wallId).toBe('n');
    expect(p32.along).toBeCloseTo(1, 6);
    const p20 = corrigerConstat({ type: 'poser', kind: 'prise20', label: '' }, 'r', ctx)!.fixtures[0];
    expect(p20.wallId).toBe('n');
    expect(p20.along).toBeCloseTo(3, 6);
  });
});

describe('le type de chaque pièce', () => {
  it('une loggia, un balcon, une terrasse : dehors, aucun socle exigé', () => {
    expect(roomUse('Loggia')).toBe('exterieur');
    expect(roomUse('Balcon')).toBe('exterieur');
    expect(requirementFor('exterieur', 6).socles).toBe(0);
  });

  it('une cuisine avec un canapé ou un lit est un séjour-cuisine', () => {
    expect(deduceRoomKind(['refrigerator', 'stove', 'sofa'])).toBe('sejourCuisine');
    expect(deduceRoomKind(['refrigerator', 'stove', 'bed'])).toBe('sejourCuisine');
    expect(roomUse('Séjour-cuisine')).toBe('sejour');
  });

  it('une salle d’eau avec son WC reste une salle d’eau ; une cuvette seule fait des WC', () => {
    expect(deduireLaPiece(['bathroom'], ['toilet', 'sink'])).toBe('bathroom');
    expect(deduireLaPiece(['bathroom'], ['toilet'])).toBe('wc');
  });

  it('une pièce longue et étroite, sans meuble, s’appelle « Couloir »', () => {
    let n = 0;
    const surface = (s: [number, number, number, number]): SurfaceData => {
      const [ax, az, bx, bz] = s;
      const L = Math.hypot(bx - ax, bz - az);
      return {
        id: `wall-c-${++n}`,
        type: 'wall',
        length: L,
        height: 2.5,
        confidence: 'high',
        category: 'wall',
        transform: [(bx - ax) / L, 0, (bz - az) / L, 0, 0, 1, 0, 0, -(bz - az) / L, 0, (bx - ax) / L, 0, (ax + bx) / 2, SOL + 1.25, (az + bz) / 2, 1],
      } as unknown as SurfaceData;
    };
    useScanStore.setState({ walls: [], openings: [], objects: [], rooms: [], fixtures: [], ceiling: [], saves: [], niveauCourant: 0 } as never);
    useScanStore.getState().finalize({
      modelPath: '',
      surfaces: [surface([0, 0, 6, 0]), surface([6, 0, 6, 1.1]), surface([6, 1.1, 0, 1.1]), surface([0, 1.1, 0, 0])],
      objects: [],
    } as never);
    expect(useScanStore.getState().rooms.map((r) => r.name)).toEqual(['Couloir']);
  });
});

describe('la passe qui complète respecte les volumes (revue « Nadia »)', () => {
  it('la prise manquante d’une salle de bains ne tombe jamais dans un volume interdit', () => {
    const sdb: RoomInput = { id: 'r', name: 'Salle de bains', kind: 'bathroom', area: 3.2, wallIds: ['n2', 'e2', 's2', 'o2'] };
    const petite = [mur('n2', 0, 0, 2, 0), mur('e2', 2, 0, 2, 1.6), mur('s2', 2, 1.6, 0, 1.6), mur('o2', 0, 1.6, 0, 0)];
    const objets = [meuble('bathtub', 1, 0.35, 1.7, 0.7, 0.55)];
    const ctx = { rooms: [{ ...sdb, interieur: { x: 1, z: 1.1 } }], walls: petite, openings: [], objects: objets, fixtures: [], id };
    const zones = wetZones(objets as never, 0);
    for (let k = 0; k < 6; k++) {
      const r = corrigerConstat({ type: 'poser', kind: 'prise', label: '' }, 'r', ctx);
      if (!r) break;
      const f = r.fixtures[0];
      const w = petite.find((x) => x.id === f.wallId)!;
      const L = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
      const u = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
      const p = { x: w.a.x + u.x * f.along - u.z * f.side * 0.05, z: w.a.z + u.z * f.along + u.x * f.side * 0.05 };
      const v = volumeAt(p, f.height, zones);
      expect(v === null || volumeVerdict('prise', v).allowed).toBe(true);
      ctx.fixtures.push(f as never);
    }
  });
});

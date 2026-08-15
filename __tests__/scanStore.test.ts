/**
 * Le store multi-pièces : mise à plat d'un résultat de scan, rattachement de
 * chaque élément à sa pièce, et reprise des scans enregistrés avant que le
 * multi-pièces existe.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { ObjectData, ScanResult, SurfaceData } from 'react-native-room-scan';
import { roomOf } from '../src/geometry/floorplan';
import { floorsOf, useScanStore, type SavedScan } from '../src/store/scanStore';

/** Surface iOS : matrice colonne-major, mur le long de X. */
const surface = (
  id: string,
  cx: number,
  cz: number,
  length: number,
  alongZ = false,
): SurfaceData => ({
  id,
  type: 'wall',
  length,
  height: 2.5,
  transform: alongZ
    ? [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, cx, 1.25, cz, 1]
    : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 1.25, cz, 1],
});

/** Les quatre murs d'une pièce rectangulaire, coin haut-gauche en (x, z). */
const boxSurfaces = (p: string, x: number, z: number, w: number, h: number) => [
  surface(`${p}n`, x + w / 2, z, w),
  surface(`${p}s`, x + w / 2, z + h, w),
  surface(`${p}w`, x, z + h / 2, h, true),
  surface(`${p}e`, x + w, z + h / 2, h, true),
];

const objectAt = (id: string, x: number, z: number): ObjectData => ({
  id,
  category: 'sofa',
  width: 1.8,
  height: 0.8,
  depth: 0.9,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.4, z, 1],
});

// Le store diffère l'écriture disque de 600 ms : sans horloge factice, le
// minuteur survit à la fin des tests et Jest tue son worker de force.
beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const reset = () =>
  useScanStore.setState({
    rooms: [],
    walls: [],
    openings: [],
    objects: [],
    saves: [],
    currentSaveId: null,
    modelPath: null,
    dirty: false,
  });

describe('finalize', () => {
  beforeEach(reset);

  it('accepte un résultat mono-pièce à plat (Android, iOS 16)', () => {
    const result: ScanResult = {
      modelPath: '/tmp/scan.obj',
      surfaces: boxSurfaces('a', 0, 0, 4, 3),
      objects: [objectAt('o1', 2, 1.5)],
    };
    useScanStore.getState().finalize(result);
    const st = useScanStore.getState();
    expect(st.rooms).toHaveLength(1);
    expect(st.rooms[0].id).toBe('room-1');
    expect(st.walls).toHaveLength(4);
    expect(st.walls.every((w) => roomOf(w) === 'room-1')).toBe(true);
    expect(st.objects[0].roomId).toBe('room-1');
    // Un scan terminé se sauvegarde tout seul.
    expect(st.saves).toHaveLength(1);
    expect(st.saves[0].rooms).toHaveLength(1);
  });

  it('estampille chaque mur, ouverture et meuble de sa pièce', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      rooms: [
        {
          id: 'room-1',
          label: 'livingRoom',
          surfaces: [
            ...boxSurfaces('a', 0, 0, 4, 3),
            { ...surface('d1', 2, 0, 0.9), type: 'door' },
          ],
          objects: [objectAt('o1', 2, 1.5)],
          floor: { color: '#8A6E4B' },
        },
        {
          id: 'room-2',
          label: 'bedroom',
          surfaces: boxSurfaces('b', 4.2, 0, 3, 3),
          objects: [objectAt('o2', 5.5, 1.5)],
          floor: { color: '#4B6E8A' },
        },
      ],
    });
    const st = useScanStore.getState();
    expect(st.rooms.map((r) => r.id)).toEqual(['room-1', 'room-2']);
    expect(st.walls.filter((w) => roomOf(w) === 'room-1')).toHaveLength(4);
    expect(st.walls.filter((w) => roomOf(w) === 'room-2')).toHaveLength(4);
    expect(st.openings).toHaveLength(1);
    expect(roomOf(st.openings[0])).toBe('room-1');
    expect(st.objects.map((o) => o.roomId)).toEqual(['room-1', 'room-2']);
    // Chaque pièce garde SON relevé de sol.
    expect(floorsOf(st.rooms)['room-2']?.color).toBe('#4B6E8A');
  });

  it('traduit les étiquettes RoomPlan, et numérote les doublons', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      rooms: [
        { id: 'room-1', label: 'livingRoom', surfaces: boxSurfaces('a', 0, 0, 4, 3), objects: [] },
        { id: 'room-2', label: 'bedroom', surfaces: boxSurfaces('b', 5, 0, 3, 3), objects: [] },
        { id: 'room-3', label: 'bedroom', surfaces: boxSurfaces('c', 9, 0, 3, 3), objects: [] },
        { id: 'room-4', label: 'unidentified', surfaces: boxSurfaces('d', 13, 0, 2, 2), objects: [] },
      ],
    });
    expect(useScanStore.getState().rooms.map((r) => r.name)).toEqual([
      'Salon',
      'Chambre',
      'Chambre 2',
      '',
    ]);
  });

  it('écarte une pièce dont RoomPlan n’a tiré aucun mur', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      rooms: [
        { id: 'room-1', surfaces: boxSurfaces('a', 0, 0, 4, 3), objects: [] },
        { id: 'room-2', surfaces: [], objects: [] },
      ],
    });
    expect(useScanStore.getState().rooms.map((r) => r.id)).toEqual(['room-1']);
  });

  it('montre l’état vide sans rien enregistrer quand rien n’est détecté', () => {
    useScanStore.getState().finalize({ modelPath: '/tmp/vide.usdz', rooms: [] });
    const st = useScanStore.getState();
    expect(st.walls).toHaveLength(0);
    expect(st.saves).toHaveLength(0);
    expect(st.screen).toBe('result');
  });
});

describe('removeRoom', () => {
  beforeEach(reset);

  it('emporte la géométrie de la pièce retirée, et elle seule', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      rooms: [
        { id: 'room-1', surfaces: boxSurfaces('a', 0, 0, 4, 3), objects: [objectAt('o1', 2, 1.5)] },
        { id: 'room-2', surfaces: boxSurfaces('b', 5, 0, 3, 3), objects: [objectAt('o2', 6.5, 1.5)] },
      ],
    });
    useScanStore.getState().removeRoom('room-2');
    const st = useScanStore.getState();
    expect(st.rooms.map((r) => r.id)).toEqual(['room-1']);
    expect(st.walls).toHaveLength(4);
    expect(st.objects.map((o) => o.id)).toEqual(['o1']);
    expect(st.dirty).toBe(true);
  });

  it('refuse de retirer la dernière pièce', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      rooms: [{ id: 'room-1', surfaces: boxSurfaces('a', 0, 0, 4, 3), objects: [] }],
    });
    useScanStore.getState().removeRoom('room-1');
    expect(useScanStore.getState().rooms).toHaveLength(1);
  });
});

describe('scans enregistrés avant le multi-pièces', () => {
  beforeEach(reset);

  it('se rouvrent avec une pièce implicite, nom et sol conservés', () => {
    const legacy = {
      id: 'old-1',
      name: 'Scan du 01/08 à 10h00',
      createdAt: 1,
      updatedAt: 1,
      modelPath: null,
      roomName: 'Salon',
      floor: { color: '#8A6E4B' },
      walls: [
        { id: 'w1', type: 'wall', a: { x: 0, z: 0 }, b: { x: 4, z: 0 }, height: 2.5, yCenter: 1.25 },
      ],
      openings: [],
      objects: [],
    } as unknown as SavedScan;
    useScanStore.setState({ saves: [legacy] });

    useScanStore.getState().openSave('old-1');
    const st = useScanStore.getState();
    expect(st.rooms).toHaveLength(1);
    expect(st.rooms[0].name).toBe('Salon');
    expect(st.rooms[0].floor?.color).toBe('#8A6E4B');
    // Les murs sans `roomId` retombent sur la pièce par défaut : le contour
    // et le sol se retrouvent bien.
    expect(st.rooms[0].id).toBe(roomOf(st.walls[0]));
  });
});

describe('setRoomName', () => {
  beforeEach(reset);

  it('ne renomme que la pièce visée et marque le plan modifié', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      rooms: [
        { id: 'room-1', surfaces: boxSurfaces('a', 0, 0, 4, 3), objects: [] },
        { id: 'room-2', surfaces: boxSurfaces('b', 5, 0, 3, 3), objects: [] },
      ],
    });
    useScanStore.getState().setRoomName('room-2', '  Cuisine  ');
    const st = useScanStore.getState();
    expect(st.rooms.map((r) => r.name)).toEqual(['', 'Cuisine']);
    expect(st.dirty).toBe(true);
  });
});

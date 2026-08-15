/**
 * Le store : mise à plat d'un résultat de scan, DÉTECTION AUTOMATIQUE des
 * pièces dans le graphe des murs, nommage d'après le mobilier, et reprise des
 * scans enregistrés avant tout ça.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { ObjectData, SurfaceData } from 'react-native-room-scan';
import { roomParts } from '../src/geometry/floorplan';
import { useScanStore, type SavedScan } from '../src/store/scanStore';

// Le store diffère l'écriture disque de 600 ms : sans horloge factice, le
// minuteur survit à la fin des tests et Jest tue son worker de force.
beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

/** Surface iOS : matrice colonne-major, mur le long de X (ou de Z). */
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

/** Mur droit entre deux points, exprimé comme RoomPlan le livre. */
const wallBetween = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): SurfaceData => {
  const len = Math.hypot(bx - ax, bz - az);
  return surface(id, (ax + bx) / 2, (az + bz) / 2, len, Math.abs(bz - az) > 1e-9);
};

/** Les quatre murs d'une pièce rectangulaire, coin haut-gauche en (x, z). */
const boxSurfaces = (p: string, x: number, z: number, w: number, h: number) => [
  surface(`${p}n`, x + w / 2, z, w),
  surface(`${p}s`, x + w / 2, z + h, w),
  surface(`${p}w`, x, z + h / 2, h, true),
  surface(`${p}e`, x + w, z + h / 2, h, true),
];

const objectAt = (
  id: string,
  category: string,
  x: number,
  z: number,
): ObjectData => ({
  id,
  category,
  width: 0.8,
  height: 0.8,
  depth: 0.8,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.4, z, 1],
});

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

/** Un 7 × 3 coupé en deux par un refend à x = 4 : 12 m² puis 9 m². */
const twoRoomFlat = [
  wallBetween('n1', 0, 0, 4, 0),
  wallBetween('n2', 4, 0, 7, 0),
  wallBetween('e', 7, 0, 7, 3),
  wallBetween('s2', 7, 3, 4, 3),
  wallBetween('s1', 4, 3, 0, 3),
  wallBetween('w', 0, 3, 0, 0),
  wallBetween('refend', 4, 0, 4, 3),
];

describe('détection automatique des pièces', () => {
  beforeEach(reset);

  it('trouve une pièce dans un scan tout simple', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: boxSurfaces('a', 0, 0, 4, 3),
      objects: [],
    });
    const st = useScanStore.getState();
    expect(st.rooms).toHaveLength(1);
    expect(st.walls).toHaveLength(4);
    // Aucun meuble : rien à déduire, la pièce prend son rang.
    expect(st.rooms[0].name).toBe('Pièce 1');
    expect(st.rooms[0].wallIds).toHaveLength(4);
  });

  it('trouve DEUX pièces séparées par un refend, sans rien demander', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: twoRoomFlat,
      objects: [],
    });
    const st = useScanStore.getState();
    expect(st.rooms).toHaveLength(2);
    const parts = roomParts(st.walls, st.rooms);
    expect(parts.map((p) => Math.round(p.surface!.area))).toEqual([12, 9]);
    // Le refend borde les deux pièces : il est dans les deux listes.
    expect(st.rooms.every((r) => r.wallIds?.includes('refend'))).toBe(true);
  });

  it('nomme chaque pièce d’après les meubles qui s’y trouvent', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: twoRoomFlat,
      objects: [
        objectAt('o1', 'sofa', 2, 1.5),
        objectAt('o2', 'television', 1, 0.3),
        objectAt('o3', 'refrigerator', 5.5, 1.5),
        objectAt('o4', 'stove', 6, 0.5),
      ],
    });
    expect(useScanStore.getState().rooms.map((r) => r.name)).toEqual([
      'Salon',
      'Cuisine',
    ]);
  });

  it('rattache chaque meuble à la pièce qui le contient', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: twoRoomFlat,
      objects: [objectAt('o1', 'sofa', 2, 1.5), objectAt('o2', 'stove', 6, 1.5)],
    });
    const st = useScanStore.getState();
    expect(st.objects.map((o) => o.roomId)).toEqual(['room-1', 'room-2']);
  });

  it('numérote les pièces que le mobilier ne permet pas de deviner', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: twoRoomFlat,
      // Un rangement ne dit rien de la pièce ; un lit, si.
      objects: [objectAt('o1', 'storage', 2, 1.5), objectAt('o2', 'bed', 6, 1.5)],
    });
    expect(useScanStore.getState().rooms.map((r) => r.name)).toEqual([
      'Pièce 1',
      'Chambre',
    ]);
  });

  it('numérote les homonymes : deux chambres, pas deux fois le même nom', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: twoRoomFlat,
      objects: [objectAt('o1', 'bed', 2, 1.5), objectAt('o2', 'bed', 6, 1.5)],
    });
    expect(useScanStore.getState().rooms.map((r) => r.name)).toEqual([
      'Chambre',
      'Chambre 2',
    ]);
  });

  it('retombe sur une pièce unique quand rien ne se referme', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: boxSurfaces('a', 0, 0, 4, 3).slice(0, 3),
      objects: [objectAt('o1', 'bathtub', 2, 1.5)],
    });
    const st = useScanStore.getState();
    expect(st.rooms).toHaveLength(1);
    expect(st.rooms[0].wallIds).toHaveLength(3);
    // Le mobilier parle même sans contour fermé.
    expect(st.rooms[0].name).toBe('Salle de bains');
  });

  it('accepte un résultat mono-pièce à plat et l’enregistre', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.obj',
      surfaces: boxSurfaces('a', 0, 0, 4, 3),
      objects: [objectAt('o1', 'toilet', 2, 1.5)],
    });
    const st = useScanStore.getState();
    expect(st.rooms[0].name).toBe('WC');
    // Un scan terminé se sauvegarde tout seul.
    expect(st.saves).toHaveLength(1);
    expect(st.saves[0].rooms[0].wallIds).toHaveLength(4);
  });

  it('montre l’état vide sans rien enregistrer quand rien n’est détecté', () => {
    useScanStore.getState().finalize({ modelPath: '/tmp/vide.usdz', surfaces: [] });
    const st = useScanStore.getState();
    expect(st.walls).toHaveLength(0);
    expect(st.saves).toHaveLength(0);
    expect(st.screen).toBe('result');
  });
});

describe('removeRoom', () => {
  beforeEach(reset);

  it('garde le refend tant que la pièce voisine s’appuie dessus', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: twoRoomFlat,
      objects: [objectAt('o1', 'sofa', 2, 1.5), objectAt('o2', 'stove', 6, 1.5)],
    });
    useScanStore.getState().removeRoom('room-2');
    const st = useScanStore.getState();
    expect(st.rooms.map((r) => r.id)).toEqual(['room-1']);
    // Le refend reste : il borde encore le salon.
    expect(st.walls.some((w) => w.id === 'refend')).toBe(true);
    // Les murs qui n'appartenaient qu'à la cuisine sont partis.
    expect(st.walls.some((w) => w.id === 'n2')).toBe(false);
    expect(st.objects.map((o) => o.id)).toEqual(['o1']);
    expect(st.dirty).toBe(true);
  });

  it('refuse de retirer la dernière pièce', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: boxSurfaces('a', 0, 0, 4, 3),
      objects: [],
    });
    useScanStore.getState().removeRoom('room-1');
    expect(useScanStore.getState().rooms).toHaveLength(1);
  });
});

describe('scans enregistrés avant la détection automatique', () => {
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
    // Pas de wallIds : le découpage retombe sur le regroupement par roomId.
    expect(st.rooms[0].wallIds).toBeUndefined();
    expect(roomParts(st.walls, st.rooms)).toHaveLength(1);
  });
});

describe('setRoomName', () => {
  beforeEach(reset);

  it('ne renomme que la pièce visée et marque le plan modifié', () => {
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: twoRoomFlat,
      objects: [],
    });
    useScanStore.getState().setRoomName('room-2', '  Cuisine  ');
    const st = useScanStore.getState();
    expect(st.rooms.map((r) => r.name)).toEqual(['Pièce 1', 'Cuisine']);
    expect(st.dirty).toBe(true);
  });
});

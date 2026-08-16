/**
 * Photos de repérage.
 *
 * Un relevé se fait vite ; sa relecture, trois jours plus tard, achoppe
 * toujours sur la même question — « c'était quoi, ce mur ? ». La photo est
 * punaisée SUR un mur, à une cote : elle suit donc le plan, se sauvegarde
 * avec lui, et disparaît avec le mur qu'elle décrivait.
 *
 * Le fichier, lui, vit dans les Documents de l'app : il ne survit pas à une
 * réinstallation, exactement comme le `.usdz` du scan. L'app doit donc
 * supporter un chemin mort sans broncher — c'est le cas testé en dernier.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { type WallSeg } from '../src/geometry/floorplan';
import { useScanStore, type SavedScan } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());
beforeEach(() => jest.advanceTimersByTime(2000));

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const PIECE: WallSeg[] = [
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 3),
  mur('s', 4, 3, 0, 3),
  mur('w', 0, 3, 0, 0),
];

const neuf = () =>
  useScanStore.setState({
    walls: PIECE,
    rooms: [{ id: 'r1', name: 'Séjour', wallIds: PIECE.map((w) => w.id) }],
    objects: [],
    openings: [],
    fixtures: [],
    photos: [],
    saves: [],
    currentSaveId: null,
    scanName: 'Essai',
  });

describe('punaiser une photo', () => {
  it('la range sur son mur, à sa cote, horodatée', () => {
    neuf();
    const id = useScanStore.getState().addPhoto('n', 2, '/tmp/p1.jpg');
    const [ph] = useScanStore.getState().photos;
    expect(ph.id).toBe(id);
    expect(ph.wallId).toBe('n');
    expect(ph.along).toBe(2);
    expect(ph.path).toBe('/tmp/p1.jpg');
    expect(ph.at).toBeGreaterThan(0);
    expect(useScanStore.getState().dirty).toBe(true);
  });

  it('plusieurs photos cohabitent, sur le même mur ou non', () => {
    neuf();
    useScanStore.getState().addPhoto('n', 1, '/tmp/a.jpg');
    useScanStore.getState().addPhoto('n', 3, '/tmp/b.jpg');
    useScanStore.getState().addPhoto('e', 1.5, '/tmp/c.jpg');
    expect(useScanStore.getState().photos).toHaveLength(3);
    expect(
      new Set(useScanStore.getState().photos.map((p) => p.id)).size,
    ).toBe(3);
  });

  it('se retire, et l’annulation la rend', () => {
    neuf();
    const id = useScanStore.getState().addPhoto('n', 2, '/tmp/p1.jpg');
    jest.advanceTimersByTime(2000);
    useScanStore.getState().removePhoto(id);
    expect(useScanStore.getState().photos).toHaveLength(0);
    useScanStore.getState().undo();
    expect(useScanStore.getState().photos).toHaveLength(1);
    expect(useScanStore.getState().photos[0].id).toBe(id);
  });
});

describe('la photo suit le scan', () => {
  it('part avec la sauvegarde, et revient à l’ouverture', () => {
    neuf();
    useScanStore.getState().addPhoto('n', 2, '/tmp/p1.jpg');
    useScanStore.getState().saveAsCopy('Scan photo');
    const save = useScanStore.getState().saves[0];
    expect(save.photos).toHaveLength(1);
    expect(save.photos?.[0].path).toBe('/tmp/p1.jpg');

    // On repart de zéro, puis on rouvre.
    useScanStore.getState().reset();
    expect(useScanStore.getState().photos).toHaveLength(0);
    useScanStore.getState().openSave(save.id);
    expect(useScanStore.getState().photos).toHaveLength(1);
    expect(useScanStore.getState().photos[0].wallId).toBe('n');
  });

  it('un scan d’avant les photos s’ouvre sans en inventer', () => {
    neuf();
    const ancien: SavedScan = {
      id: 'vieux',
      name: 'Scan de l’an dernier',
      createdAt: 1,
      updatedAt: 1,
      modelPath: null,
      rooms: [{ id: 'r1', name: 'Séjour', wallIds: ['n'] }],
      walls: PIECE,
      openings: [],
      objects: [],
    };
    useScanStore.setState({ saves: [ancien] });
    useScanStore.getState().openSave('vieux');
    expect(useScanStore.getState().photos).toEqual([]);
  });

  it('un mur supprimé laisse sa photo orpheline, et l’annulation rend tout', () => {
    neuf();
    useScanStore.getState().addPhoto('n', 2, '/tmp/p1.jpg');
    jest.advanceTimersByTime(2000);
    useScanStore.getState().removeWall('n');
    // La photo reste dans le scan — on ne détruit pas un fichier parce
    // qu'un mur a bougé — mais le plan ne la montre plus : sa punaise n'a
    // plus de mur où se planter.
    const photos = useScanStore.getState().photos;
    expect(photos).toHaveLength(1);
    const murs = useScanStore.getState().walls;
    expect(murs.some((w) => w.id === 'n')).toBe(false);
    expect(murs.some((w) => w.id === photos[0].wallId)).toBe(false);
    useScanStore.getState().undo();
    expect(useScanStore.getState().walls.some((w) => w.id === 'n')).toBe(true);
    expect(useScanStore.getState().photos).toHaveLength(1);
  });
});

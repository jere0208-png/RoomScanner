/**
 * LES CHIFFRES DU PLAN SE RELISENT — enquête des chiffres :
 *   — la longueur tapée d'un mur se relit telle quelle, même au bout d'un
 *     pan coupé, et la pièce reste fermée (le mur poussé retrouve ses
 *     voisins) ;
 *   — valider « Cotes » sans rien changer ne bouge rien, pour toute pièce
 *     dont le plan connaît le nu ;
 *   — une cloison posée à la cote dans une pièce scannée se compte au nu.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { demiFacesDe, estDessine, etendueDeLaPiece, longueurCotee, roomParts, type WallSeg } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();
const cote = (id: string) => {
  const w = st().walls.find((x) => x.id === id)!;
  return longueurCotee(st().walls, w, roomParts(st().walls, st().rooms));
};
const mur = (id: string, ax: number, az: number, bx: number, bz: number, o: Partial<WallSeg> = {}): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'room-1',
  ...o,
});

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  useScanStore.setState({ saves: [], currentSaveId: null });
});

const poser = (walls: WallSeg[], rooms: { id: string; wallIds: string[] }[]) =>
  useScanStore.setState({
    walls,
    rooms: rooms.map((r) => ({ name: r.id, floor: null, ...r })) as never,
  });

/** Ce que fait `promptRoomCotes` : la valeur proposée, et le drapeau passé à resizeRoom. */
const feuilleCotes = (roomId: string) => {
  const part = roomParts(st().walls, st().rooms).find((p) => p.roomId === roomId)!;
  const auNu = !!part && (estDessine(part.walls) || !!part.surface?.nu);
  const contour = part.surface ? part.surface.nu ?? part.surface.pts : [];
  const etendue = (k: 'x' | 'z') => Math.max(...contour.map((q) => q[k])) - Math.min(...contour.map((q) => q[k]));
  // La feuille affiche la valeur à deux décimales : c'est elle qu'on valide.
  const lu = (v: number) => Number(v.toFixed(2));
  return { enX: lu(etendue('x')), enZ: lu(etendue('z')), auNu };
};

describe('la cote tapée se relit', () => {
  const cas: [string, () => void, string, number][] = [
    [
      'rectangle dessiné',
      () =>
        poser(
          [
            mur('n', 0, 0, 4, 0, { auNu: true }),
            mur('e', 4, 0, 4, 3, { auNu: true }),
            mur('s', 4, 3, 0, 3, { auNu: true }),
            mur('w', 0, 3, 0, 0, { auNu: true }),
          ],
          [{ id: 'room-1', wallIds: ['n', 'e', 's', 'w'] }],
        ),
      'n',
      4.5,
    ],
    [
      'rectangle scanné, refend deux faces au bout',
      () =>
        poser(
          [
            mur('n', 0, 0, 4, 0),
            mur('e', 4, 0, 4, 3, { deuxFaces: true, epaisseur: 0.2 }),
            mur('s', 4, 3, 0, 3),
            mur('w', 0, 3, 0, 0),
          ],
          [{ id: 'room-1', wallIds: ['n', 'e', 's', 'w'] }],
        ),
      'n',
      4.5,
    ],
    [
      'L dessiné, le retour intérieur',
      () =>
        poser(
          [
            mur('a', 0, 0, 6, 0, { auNu: true }),
            mur('b', 6, 0, 6, 3, { auNu: true }),
            mur('c', 6, 3, 3, 3, { auNu: true }),
            mur('d', 3, 3, 3, 5, { auNu: true }),
            mur('e', 3, 5, 0, 5, { auNu: true }),
            mur('f', 0, 5, 0, 0, { auNu: true }),
          ],
          [{ id: 'room-1', wallIds: ['a', 'b', 'c', 'd', 'e', 'f'] }],
        ),
      'c',
      3.5,
    ],
    [
      'pan coupé dessiné',
      () =>
        poser(
          [
            mur('a', 0, 0, 4, 0, { auNu: true }),
            mur('b', 4, 0, 4, 2, { auNu: true }),
            mur('c', 4, 2, 3, 3, { auNu: true }),
            mur('d', 3, 3, 0, 3, { auNu: true }),
            mur('e', 0, 3, 0, 0, { auNu: true }),
          ],
          [{ id: 'room-1', wallIds: ['a', 'b', 'c', 'd', 'e'] }],
        ),
      'd',
      3.5,
    ],
  ];
  for (const [nom, init, id, v] of cas) {
    it(`${nom} : ${v} tapé → ${v} lu, et la même valeur retapée ne bouge rien`, () => {
      init();
      const avant = cote(id);
      st().setWallLength(id, Number(avant.toFixed(2)), { auNu: !!st().walls.find((w) => w.id === id)!.auNu });
      const meme = cote(id);
      st().setWallLength(id, v, { auNu: !!st().walls.find((w) => w.id === id)!.auNu });
      const apres = cote(id);
      expect(meme).toBeCloseTo(Number(avant.toFixed(2)), 4);
      expect(apres).toBeCloseTo(v, 4);
    });
  }
});

it('pan coupé : taper la longueur du mur qui y aboutit garde la pièce fermée', () => {
  poser(
    [
      mur('a', 0, 0, 4, 0, { auNu: true }),
      mur('b', 4, 0, 4, 2, { auNu: true }),
      mur('c', 4, 2, 3, 3, { auNu: true }),
      mur('d', 3, 3, 0, 3, { auNu: true }),
      mur('e', 0, 3, 0, 0, { auNu: true }),
    ],
    [{ id: 'room-1', wallIds: ['a', 'b', 'c', 'd', 'e'] }],
  );
  expect(roomParts(st().walls, st().rooms)[0].surface!.exact).toBe(true);
  st().setWallLength('d', 2.5, { auNu: true });
  const b = st().walls.find((w) => w.id === 'b')!;
  const c = st().walls.find((w) => w.id === 'c')!;
  // Le bout de b et le bout de c devraient rester soudés.
  expect(Math.hypot(b.b.x - c.a.x, b.b.z - c.a.z)).toBeLessThan(1e-6);
  expect(roomParts(st().walls, st().rooms)[0].surface!.exact).toBe(true);
});

it('décaler un pan coupé : ses bouts restent soudés à ses voisins', () => {
  poser(
    [
      mur('a', 0, 0, 4, 0, { auNu: true }),
      mur('b', 4, 0, 4, 2, { auNu: true }),
      mur('c', 4, 2, 3, 3, { auNu: true }),
      mur('d', 3, 3, 0, 3, { auNu: true }),
      mur('e', 0, 3, 0, 0, { auNu: true }),
    ],
    [{ id: 'room-1', wallIds: ['a', 'b', 'c', 'd', 'e'] }],
  );
  // « Décaler » le pan coupé de 10 cm vers l'extérieur, perpendiculairement à lui.
  const s = 0.1 / Math.SQRT2;
  st().moveWall('c', s, s, false);
  const W = st().walls;
  const g = (id: string) => W.find((w) => w.id === id)!;
  expect(Math.hypot(g('b').b.x - g('c').a.x, g('b').b.z - g('c').a.z)).toBeLessThan(1e-6);
  expect(Math.hypot(g('d').a.x - g('c').b.x, g('d').a.z - g('c').b.z)).toBeLessThan(1e-6);
});

it('épaissir le pan coupé d’une pièce dessinée garde la pièce fermée, à la même surface', () => {
  poser(
    [
      mur('a', 0, 0, 4, 0, { auNu: true }),
      mur('b', 4, 0, 4, 2, { auNu: true }),
      mur('c', 4, 2, 3, 3, { auNu: true }),
      mur('d', 3, 3, 0, 3, { auNu: true }),
      mur('e', 0, 3, 0, 0, { auNu: true }),
    ],
    [{ id: 'room-1', wallIds: ['a', 'b', 'c', 'd', 'e'] }],
  );
  const avant = roomParts(st().walls, st().rooms)[0].surface!;
  st().setEpaisseurMur('c', 0.2);
  const apres = roomParts(st().walls, st().rooms)[0].surface!;
  expect(apres.exact).toBe(true);
  // La face de la pièce ne bouge pas (revues « Sophie » et « Karim ») : même surface.
  expect(apres.area).toBeCloseTo(avant.area, 3);
});

it('pièce accolée à un mur relevé : valider « Cotes » sans rien changer ne bouge rien', () => {
  // Un séjour SCANNÉ de 4 × 3 (traits = faces), à l'origine.
  useScanStore.setState({
    walls: [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('w', 0, 3, 0, 0)],
    rooms: [{ id: 'room-1', name: 'Séjour', floor: null, wallIds: ['n', 'e', 's', 'w'] } as never],
  });
  const id = st().addRoomBox(2, 1.75, 'Cellier', 'e', { auNu: true })!;
  const avant = feuilleCotes(id);
  // Le cellier a bien un contour au nu (pièce accolée)…
  st().resizeRoom(id, avant.enX, avant.enZ, { auNu: avant.auNu });
  const apres = feuilleCotes(id);
  expect({ x: apres.enX, z: apres.enZ }).toEqual({ x: avant.enX, z: avant.enZ });
});

it('pièce scannée bordée d’un refend relevé des deux faces : valider « Cotes » sans rien changer ne bouge rien', () => {
  useScanStore.setState({
    walls: [
      mur('n', 0, 0, 4, 0),
      mur('e', 4, 0, 4, 3, { deuxFaces: true, epaisseur: 0.2 }),
      mur('s', 4, 3, 0, 3),
      mur('w', 0, 3, 0, 0),
    ],
    rooms: [{ id: 'room-1', name: 'Chambre', floor: null, wallIds: ['n', 'e', 's', 'w'] } as never],
  });
  const avant = feuilleCotes('room-1');
  expect(avant.enX).toBeCloseTo(3.9, 6); // la feuille propose 3,90 (au nu du refend)
  st().resizeRoom('room-1', avant.enX, avant.enZ, { auNu: avant.auNu });
  const apres = feuilleCotes('room-1');
  expect({ x: apres.enX, z: apres.enZ }).toEqual({ x: avant.enX, z: avant.enZ });
});

it('cloison posée à la cote (« Couper ») dans une pièce SCANNÉE : la cote tapée et les surfaces au nu', () => {
  useScanStore.setState({
    walls: [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('w', 0, 3, 0, 0)],
    rooms: [{ id: 'room-1', name: 'Chambre', floor: null, wallIds: ['n', 'e', 's', 'w'] } as never],
  });
  // « 1,50 du nu du mur au nu de la cloison, cloison de 10 cm ».
  expect(st().couperPiece('room-1', { sens: 'longueur', depuis: 1.5, epaisseur: 0.1 })).toBe(true);
  const parts = roomParts(st().walls, st().rooms).filter((p) => p.surface);
  const tri = [...parts].sort((a, b) => a.surface!.area - b.surface!.area);
  const petite = tri[0];
  const grande = tri[tri.length - 1];
  const cotes = petite.walls.map((w) => +longueurCotee(st().walls, w, parts).toFixed(3));
  // Le trait de la cloison est son axe : 5 cm de chaque côté.
  const cl = st().walls.find((w) => w.id.startsWith('cl-'))!;
  expect(demiFacesDe(st().walls, cl)).toEqual({ plus: 0.05, moins: 0.05 });
  expect(etendueDeLaPiece(petite.surface!).depth).toBeCloseTo(1.5, 2);
  expect(petite.surface!.area).toBeCloseTo(4.5, 2);
  expect(grande.surface!.area).toBeCloseTo(7.2, 2);
  expect(Math.min(...cotes)).toBeCloseTo(1.5, 2);
});

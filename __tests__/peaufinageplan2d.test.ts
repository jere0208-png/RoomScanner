/**
 * PEAUFINAGE DU PLAN 2D — ce qui est posé dans une pièce suit ce qu'on fait
 * de ses murs, et ce qu'on réunit prend le bon nom.
 *
 *   — retirer une pièce emporte ses notes et ses cotes à la règle ;
 *   — « Redresser » remet d'équerre le canapé adossé au mur redressé ;
 *   — reculer un mur emporte les meubles adossés (pas quand c'est son
 *     épaisseur qui change) ;
 *   — réunir deux pièces : cuisine + séjour = « Séjour-cuisine », la pièce de
 *     vie l'emporte sur le placard.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { ObjectData } from 'react-native-room-scan';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();
const mur = (id: string, ax: number, az: number, bx: number, bz: number, roomId = 'r1'): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId,
});
const meuble = (id: string, cx: number, cz: number, w: number, d: number, yaw = 0, roomId = 'r1'): ObjectData =>
  ({
    id,
    category: 'sofa',
    width: w,
    depth: d,
    height: 0.8,
    roomId,
    transform: [Math.cos(yaw), 0, Math.sin(yaw), 0, 0, 1, 0, 0, -Math.sin(yaw), 0, Math.cos(yaw), 0, cx, 0.4, cz, 1],
  }) as ObjectData;
const vide = { openings: [], fixtures: [], ceiling: [], notes: [], mesures: [], photos: [], niveauCourant: 0 };
const poser = (walls: WallSeg[], rooms: { id: string; name: string; wallIds: string[]; kind?: string }[], objects: ObjectData[] = []) =>
  useScanStore.setState({ ...vide, walls, rooms: rooms as never, objects, dirty: false });
const yawDe = (o: ObjectData) => Math.atan2(o.transform[2], o.transform[0]);

describe('retirer une pièce', () => {
  it('emporte ses notes et ses cotes à la règle, pas celles des voisines', () => {
    st().ouvrirExemple();
    const ch = st().rooms.find((r) => r.name === 'Chambre')!;
    st().addNote('Tableau à remplacer', { x: 6.5, z: 1.5 });
    st().addMesure({ x: 5.2, z: 1 }, { x: 7.8, z: 1 });
    // Une note dans le séjour, elle, reste.
    st().addNote('Prise à déplacer', { x: 2, z: 2 });
    st().removeRoom(ch.id);
    expect(st().notes.map((n) => n.text)).toEqual(['Prise à déplacer']);
    expect(st().mesures).toHaveLength(0);
    // « Annuler » rend tout.
    st().undo();
    expect(st().notes).toHaveLength(2);
    expect(st().mesures).toHaveLength(1);
  });
});

describe('« Redresser »', () => {
  it('remet d’équerre le canapé adossé au mur redressé', () => {
    const a = (1.5 * Math.PI) / 180;
    const P = [{ x: 0, z: 0 }, { x: 5, z: 5 * Math.tan(a) }, { x: 5, z: 4 }, { x: 0, z: 4 }];
    const walls = P.map((p, i) => mur('w' + i, p.x, p.z, P[(i + 1) % 4].x, P[(i + 1) % 4].z));
    // Le canapé, dos contre le mur nord de travers, à son angle.
    const c = { x: 2.5 - 0.45 * Math.sin(a), z: 2.5 * Math.tan(a) + 0.45 * Math.cos(a) };
    poser(walls, [{ id: 'r1', name: 'Séjour', wallIds: walls.map((w) => w.id) }], [meuble('canape', c.x, c.z, 2, 0.9, a)]);
    st().addNote('Contre le mur', { x: 4, z: 4 * Math.tan(a) + 0.1 });
    st().straightenPlan();
    const nord = st().walls.find((w) => w.id === 'w0')!;
    expect(nord.a.z).toBeCloseTo(nord.b.z, 6);
    const o = st().objects[0];
    expect(yawDe(o)).toBeCloseTo(0, 4);
    // Son dos est toujours contre le mur : ni dedans, ni décollé.
    expect(o.transform[14] - 0.45).toBeCloseTo(nord.a.z, 3);
    // La note prise contre le mur reste à 10 cm de lui.
    expect(st().notes[0].at.z - nord.a.z).toBeCloseTo(0.1, 2);
    // Un seul « Annuler » rend le mur ET le canapé.
    st().undo();
    expect(yawDe(st().objects[0])).toBeCloseTo(a, 6);
  });
});

describe('reculer un mur', () => {
  const salon = () => {
    const walls = [mur('n', 0, 0, 5, 0), mur('e', 5, 0, 5, 4), mur('s', 5, 4, 0, 4), mur('o', 0, 4, 0, 0)];
    poser(walls, [{ id: 'r1', name: 'Séjour', wallIds: walls.map((w) => w.id) }], [
      // Adossé au mur nord : pièce fermée, le trait d'un mur relevé d'un côté est sa face.
      meuble('canape', 2.5, 0.45, 2, 0.9),
      // Au milieu de la pièce : il ne suit rien.
      meuble('table', 2.5, 2, 1.2, 0.8),
    ]);
  };
  it('emporte les meubles adossés, et eux seuls', () => {
    salon();
    const avant = st().objects.find((o) => o.id === 'canape')!.transform[14];
    st().moveWall('n', 0, -0.3, false);
    expect(st().objects.find((o) => o.id === 'canape')!.transform[14]).toBeCloseTo(avant - 0.3, 6);
    expect(st().objects.find((o) => o.id === 'table')!.transform[14]).toBeCloseTo(2, 6);
  });
  it('mais pas quand c’est son épaisseur qui change', () => {
    salon();
    const avant = st().objects.find((o) => o.id === 'canape')!.transform[14];
    st().moveWall('n', 0, -0.05, false, 'epaisseur:n');
    expect(st().objects.find((o) => o.id === 'canape')!.transform[14]).toBeCloseTo(avant, 6);
  });
});

describe('réunir deux pièces', () => {
  const deux = (nomA: string, nomB: string, largeurB = 1) => {
    const walls = [
      mur('n', 0, 0, 3, 0),
      mur('m', 3, 0, 3, 3),
      mur('s', 3, 3, 0, 3),
      mur('o', 0, 3, 0, 0),
      mur('n2', 3, 0, 3 + largeurB, 0, 'r2'),
      mur('e2', 3 + largeurB, 0, 3 + largeurB, 3, 'r2'),
      mur('s2', 3 + largeurB, 3, 3, 3, 'r2'),
    ];
    poser(walls, [
      { id: 'r1', name: nomA, wallIds: ['n', 'm', 's', 'o'] },
      { id: 'r2', name: nomB, wallIds: ['n2', 'e2', 's2', 'm'] },
    ]);
  };
  it('le placard réuni à la chambre fait une chambre, d’où qu’on parte', () => {
    deux('Chambre', 'Placard');
    st().mergeRooms('r2', 'r1');
    expect(st().rooms.map((r) => r.name)).toEqual(['Chambre']);
  });
  it('la cuisine réunie au séjour fait un séjour-cuisine', () => {
    deux('Séjour', 'Cuisine', 2.5);
    st().mergeRooms('r1', 'r2');
    expect(st().rooms).toHaveLength(1);
    expect(st().rooms[0].name).toBe('Séjour-cuisine');
    expect(st().rooms[0].kind).toBe('sejourCuisine');
  });
  it('à usage égal, la plus grande donne son nom', () => {
    deux('Chambre', 'Chambre 2', 4);
    st().mergeRooms('r1', 'r2');
    expect(st().rooms[0].name).toBe('Chambre 2');
  });
});

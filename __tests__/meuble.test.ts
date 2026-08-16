/**
 * Déplacer un meuble : ce que le doigt demande, ce que les murs autorisent.
 *
 * Trois pannes successives ont été signalées sur ce geste — le meuble qui ne
 * bouge pas, qui revient à sa place, qu'on n'arrive pas à plaquer contre un
 * mur. Deux avaient la même cause (le responder refabriqué en plein geste,
 * vérifié dans `poignees.test.tsx`), la troisième est ici : la collision.
 * On rejoue donc un glissement COMPLET, image par image, comme le fait la
 * poignée — position = point de départ + delta cumulé — et on regarde où le
 * meuble s'arrête.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import {
  fitsInRoom,
  pushOutOfWalls,
  WALL_T,
  type WallSeg,
} from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';
import type { CatalogItem } from '../src/geometry/catalogue';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** Chambre de 3,50 × 2,44 m, coins à l'axe des murs. */
const L = 3.5;
const P = 2.44;
const CHAMBRE: WallSeg[] = [
  mur('n', 0, 0, L, 0),
  mur('e', L, 0, L, P),
  mur('s', L, P, 0, P),
  mur('w', 0, P, 0, 0),
];

const LIT: CatalogItem = {
  key: 'lit140',
  label: 'Lit 140',
  w: 1.4,
  d: 1.9,
  h: 0.5,
  category: 'bed',
};

const poser = (item: CatalogItem, x: number, z: number) => {
  useScanStore.setState({
    walls: CHAMBRE,
    rooms: [{ id: 'r1', name: 'Chambre', wallIds: CHAMBRE.map((w) => w.id) }],
    objects: [],
    openings: [],
    fixtures: [],
  });
  return useScanStore.getState().addObject(item, x, z);
};

const centre = (id: string) => {
  const o = useScanStore.getState().objects.find((x) => x.id === id)!;
  return { x: o.transform[12], z: o.transform[14] };
};

/**
 * Rejoue un glissement : N images, delta cumulé depuis le point d'appui,
 * exactement comme `ObjectDragHandle`.
 */
const glisser = (id: string, dx: number, dz: number, images = 24) => {
  const depart = centre(id);
  for (let i = 1; i <= images; i++) {
    useScanStore
      .getState()
      .setObjectCenter(id, depart.x + (dx * i) / images, depart.z + (dz * i) / images);
  }
  return centre(id);
};

describe('un meuble se glisse et vient buter contre les murs', () => {
  it('se plaque contre le mur nord, à touche-touche', () => {
    const id = poser(LIT, L / 2, P / 2);
    // On pousse loin au-delà du mur : le doigt dépasse toujours.
    const fin = glisser(id, 0, -3);
    // Le lit fait 1,90 de profondeur : son centre s'arrête à 0,95 du nu,
    // donc à 0,95 + la demi-épaisseur du mur de son axe.
    expect(fin.z).toBeCloseTo(1.9 / 2 + WALL_T / 2, 3);
    expect(fin.x).toBeCloseTo(L / 2, 3);
  });

  it('se plaque dans un angle sans jamais entrer dans la maçonnerie', () => {
    const id = poser(LIT, L / 2, P / 2);
    const fin = glisser(id, -3, -3);
    expect(fin.z).toBeCloseTo(1.9 / 2 + WALL_T / 2, 3);
    expect(fin.x).toBeCloseTo(1.4 / 2 + WALL_T / 2, 3);
  });

  it('suit le doigt image par image, sans jamais revenir en arrière', () => {
    const id = poser(LIT, L / 2, P / 2);
    const depart = centre(id);
    const vus: number[] = [];
    for (let i = 1; i <= 20; i++) {
      useScanStore.getState().setObjectCenter(id, depart.x + i * 0.05, depart.z);
      vus.push(centre(id).x);
    }
    // Strictement croissant jusqu'à la butée, et JAMAIS retombé au départ.
    for (let i = 1; i < vus.length; i++) {
      expect(vus[i]).toBeGreaterThanOrEqual(vus[i - 1] - 1e-9);
    }
    expect(vus[vus.length - 1]).toBeGreaterThan(depart.x + 0.3);
  });

  it('garde son angle : le mur ne le redresse plus', () => {
    const id = poser(LIT, L / 2, P / 2);
    useScanStore.getState().setObjectYaw(id, 0.4);
    glisser(id, 0, -3);
    const o = useScanStore.getState().objects.find((x) => x.id === id)!;
    expect(Math.atan2(o.transform[2], o.transform[0])).toBeCloseTo(0.4, 6);
  });

  it('posé de biais, il bute sur son emprise réelle, pas sur ses côtes', () => {
    const id = poser(LIT, L / 2, P / 2);
    // 10° : de biais, mais l'emprise tient encore entre les deux murs —
    // à 30° elle mesure 2,35 m pour 2,30 m de libre, les deux murs se
    // disputent le lit et la butée n'a plus de sens.
    const yaw = Math.PI / 18;
    useScanStore.getState().setObjectYaw(id, yaw);
    const fin = glisser(id, 0, -3);
    const demi =
      Math.abs(Math.sin(yaw)) * (1.4 / 2) + Math.abs(Math.cos(yaw)) * (1.9 / 2);
    expect(demi).toBeGreaterThan(1.9 / 2); // de biais, il prend plus de place
    expect(fin.z).toBeCloseTo(demi + WALL_T / 2, 3);
  });

  it('ne bouge pas s’il n’y a rien à pousser', () => {
    const id = poser(LIT, L / 2, P / 2);
    const avant = centre(id);
    useScanStore.getState().setObjectCenter(id, avant.x, avant.z);
    expect(centre(id)).toEqual(avant);
  });
});

describe('ce qui ne rentre pas ne se pose pas', () => {
  const contour = [
    { x: 0, z: 0 },
    { x: L, z: 0 },
    { x: L, z: P },
    { x: 0, z: P },
  ];

  it('un lit de 140 tient dans la chambre', () => {
    expect(fitsInRoom({ width: 1.4, depth: 1.9 }, contour)).toBe(true);
  });

  it('un carré de 2,50 n’y tient pas : 2,37 de libre en travers', () => {
    expect(fitsInRoom({ width: 2.5, depth: 2.5 }, contour)).toBe(false);
    // Et la limite se tient au centimètre près, des deux côtés.
    expect(fitsInRoom({ width: 2.3, depth: 2.3 }, contour)).toBe(true);
  });

  it('un meuble long mais étroit y tient en travers', () => {
    // 3,30 de long : ça ne passe que dans le sens de la longueur, donc oui.
    expect(fitsInRoom({ width: 3.3, depth: 0.6 }, contour)).toBe(true);
    expect(fitsInRoom({ width: 3.3, depth: 2.4 }, contour)).toBe(false);
  });
});

describe('la poussée hors des murs, prise isolément', () => {
  const dedans = { x: L / 2, z: P / 2 };

  it('ne déplace pas ce qui est déjà au large', () => {
    const p = pushOutOfWalls(dedans, { width: 0.6, depth: 0.6, yaw: 0 }, CHAMBRE, dedans);
    expect(p.x).toBeCloseTo(dedans.x, 6);
    expect(p.z).toBeCloseTo(dedans.z, 6);
  });

  it('ressort un meuble enfoncé dans un mur', () => {
    const p = pushOutOfWalls(
      { x: L / 2, z: -0.5 },
      { width: 1, depth: 1, yaw: 0 },
      CHAMBRE,
      dedans,
    );
    expect(p.z).toBeCloseTo(0.5 + WALL_T / 2, 3);
  });
});

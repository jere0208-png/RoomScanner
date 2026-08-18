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
  faceIntoRoom,
  fitsInRoom,
  pushOutOfWalls,
  WALL_T,
  type ObjectFootprint,
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

/**
 * L'AVANT D'UN MEUBLE NE REGARDE PAS LE MUR.
 *
 * Une commode contre une cloison ouvre ses tiroirs vers la pièce, un lit
 * pose sa tête contre le mur, un canapé y adosse son dossier. Le relevé, lui,
 * ne le sait pas : ARKit rend une boîte et un angle, et cet angle vaut aussi
 * bien θ que θ + 180° — rien dans un nuage de points ne distingue l'avant de
 * l'arrière d'un caisson. Une fois sur deux, le meuble sortait dos à la pièce.
 */
describe('l’orientation d’un meuble contre un mur', () => {
  /** Un mur nord (z = 0), la pièce s'étendant vers les z positifs. */
  const MUR: WallSeg = {
    id: 'n',
    type: 'wall',
    a: { x: 0, z: 0 },
    b: { x: 5, z: 0 },
    height: 2.5,
    yCenter: 1.25,
    roomId: 'r1',
  };
  const commode = (yaw: number): ObjectFootprint => ({
    id: 'o1',
    category: 'storage',
    cx: 2,
    cz: 0.32,
    width: 1,
    depth: 0.5,
    height: 0.9,
    yCenter: 0.45,
    yaw,
  });
  /** L'avant du meuble dans le monde : son côté −z local. */
  const avant = (f: ObjectFootprint) => ({
    x: Math.sin(f.yaw),
    z: -Math.cos(f.yaw),
  });

  it('se retourne quand il ouvre ses tiroirs dans le mur', () => {
    // yaw = 0 : l'avant regarde −z, c'est-à-dire le mur. Demi-tour.
    const corrige = faceIntoRoom(commode(0), [MUR]);
    expect(avant(corrige).z).toBeGreaterThan(0.9);
  });

  it('ne touche à rien quand il regarde déjà la pièce', () => {
    const bon = commode(Math.PI);
    expect(faceIntoRoom(bon, [MUR]).yaw).toBe(bon.yaw);
  });

  it('ne corrige QUE par demi-tour : les cotes ne bougent pas', () => {
    const f = commode(0);
    const corrige = faceIntoRoom(f, [MUR]);
    // Un quart de tour échangerait largeur et profondeur — le meuble ne
    // coïnciderait plus avec ce qui a été mesuré.
    expect(corrige.width).toBe(f.width);
    expect(corrige.depth).toBe(f.depth);
    expect(Math.abs(Math.sin(corrige.yaw - f.yaw))).toBeLessThan(1e-9);
  });

  it('et laisse tranquille un meuble au milieu de la pièce', () => {
    // À deux mètres du mur, une chaise regarde où elle veut : lui imposer
    // un sens serait inventer une information qu'on n'a pas.
    const libre = { ...commode(0), cz: 2 };
    expect(faceIntoRoom(libre, [MUR]).yaw).toBe(0);
  });
});

/**
 * LES FLÈCHES DU BANDEAU — le centimètre demandé à la main.
 *
 * Relevé du chantier : « les flèches en bas ne déplacent pas les meubles ».
 * Elles marchaient pourtant — au large. Contre un mur, non : le plaquage
 * automatique referme tout jour de moins de cinq centimètres, et il reprenait
 * chaque pas d'un centimètre à peine posé. Le meuble revenait se coller, et
 * l'on croyait le bouton mort.
 *
 * C'est justement contre un mur qu'on se sert des flèches : décoller un
 * meuble de deux centimètres pour dégager une plinthe, avancer une table de
 * trois. Une demande explicite au centimètre passe donc AVANT le confort du
 * plaquage — mais la maçonnerie garde le dernier mot : on ne pousse pas un
 * meuble DANS un mur.
 */
describe('les flèches déplacent le meuble au centimètre', () => {
  /** Le geste du bandeau : un pas d'un centimètre, sans aimant. */
  const pas = (id: string, dx: number, dz: number) => {
    const t = useScanStore.getState().objects.find((o) => o.id === id)!.transform;
    useScanStore.getState().setObjectCenter(id, t[12] + dx, t[14] + dz, false);
    return centre(id);
  };

  it('décolle un meuble plaqué contre un mur, pas à pas', () => {
    const id = poser(LIT, L / 2, P / 2);
    // On le colle au mur nord, puis on le rappelle vers le centre.
    const colle = glisser(id, 0, -3);
    expect(colle.z).toBeCloseTo(1.9 / 2 + WALL_T / 2, 3);
    let vu = colle;
    for (let i = 1; i <= 5; i++) {
      vu = pas(id, 0, 0.01);
      // Chaque pas se voit : sans quoi le bouton paraît mort.
      expect(vu.z).toBeCloseTo(colle.z + i * 0.01, 4);
    }
    expect(vu.z).toBeCloseTo(colle.z + 0.05, 4);
  });

  it('ne pousse pas le meuble DANS la maçonnerie', () => {
    const id = poser(LIT, L / 2, P / 2);
    const colle = glisser(id, 0, -3);
    // Vingt pas vers le mur : il est déjà contre, il n'ira pas plus loin.
    let vu = colle;
    for (let i = 0; i < 20; i++) vu = pas(id, 0, -0.01);
    expect(vu.z).toBeGreaterThanOrEqual(1.9 / 2 + WALL_T / 2 - 1e-6);
  });

  it('marche aussi au large, dans les quatre directions', () => {
    const id = poser(LIT, L / 2, P / 2);
    const d = centre(id);
    expect(pas(id, 0.01, 0).x).toBeCloseTo(d.x + 0.01, 4);
    expect(pas(id, -0.01, 0).x).toBeCloseTo(d.x, 4);
    expect(pas(id, 0, 0.01).z).toBeCloseTo(d.z + 0.01, 4);
    expect(pas(id, 0, -0.01).z).toBeCloseTo(d.z, 4);
  });
});

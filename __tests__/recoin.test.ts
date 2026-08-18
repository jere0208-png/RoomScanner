/**
 * UN MEUBLE S'AJUSTE AU RECOIN OÙ ON LE POSE.
 *
 * Relevé du chantier, vidéo à l'appui : une table poussée dans une niche
 * entre trois murs « se téléporte à côté ». C'est mécanique — deux murs qui
 * se font face repoussent chacun dans son sens, et le meuble sort par le
 * côté ouvert. Sur un plan de chantier, cela n'a pas de sens : dans une
 * niche de 1,10 m on pose un meuble de 1,10 m, et on le note.
 *
 * Le meuble se rabote donc à la place disponible, garde sa cote d'origine
 * en mémoire, et la reprend dès qu'il ressort. Tout est réversible.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { ObjectData } from 'react-native-room-scan';
import {
  WALL_T,
  fitInNook,
  hugWall,
  roomParts,
  type WallSeg,
} from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/**
 * Le salon de la vidéo : une grande pièce, et une NICHE de 1,10 m de large
 * sur 1 m de creux, ouverte sur la pièce.
 */
const COINS: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, -1],
  [2.1, -1],
  [2.1, 0],
  [5, 0],
  [5, 4],
  [0, 4],
];
const MURS = COINS.map((c, i) => {
  const d = COINS[(i + 1) % COINS.length];
  return mur(`m${i}`, c[0], c[1], d[0], d[1]);
});

/** Une table de 1,48 m — celle du relevé, trop large pour la niche. */
const TABLE: ObjectData = {
  id: 't1',
  category: 'table',
  width: 1.48,
  depth: 0.87,
  height: 0.79,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 2, 0.4, 1],
};

const poser = () => {
  useScanStore.setState({
    walls: MURS,
    openings: [],
    objects: [{ ...TABLE, transform: [...TABLE.transform] }],
    rooms: [{ id: 'r1', name: 'Salon', floor: null }],
    fixtures: [],
    ceiling: [],
  });
};

/** Le meuble, tel que le store le tient. */
const table = () => useScanStore.getState().objects[0];

describe('la place disponible, mesurée sur le plan', () => {
  it('rabote la largeur à celle de la niche, et recentre le meuble', () => {
    const ajuste = fitInNook(
      { x: 1.55, z: -0.5 },
      { width: 1.48, depth: 0.87, yaw: 0 },
      MURS,
      COINS.map(([x, z]) => ({ x, z })),
    );
    // La niche fait 1,10 m d'AXE à AXE : entre les deux nus, il reste
    // 1,10 moins l'épaisseur d'un mur (14 cm), moins le centimètre de jeu
    // de chaque côté — soit 94 cm. C'est la cote qu'on relèverait sur
    // place, mètre contre la plinthe.
    expect(ajuste.width).toBeGreaterThan(0.9);
    expect(ajuste.width).toBeLessThan(1);
    // La profondeur, elle, ne bute sur rien : la niche est ouverte.
    expect(ajuste.depth).toBeCloseTo(0.87, 2);
    // Et le meuble se centre dans la niche.
    expect(ajuste.centre.x).toBeCloseTo(1.55, 1);
  });

  it('ne rabote pas au-delà du raisonnable', () => {
    // Une armoire de 2 m dans un placard à balais de 45 cm : ce n'est pas
    // un ajustement, c'est une mutilation. On laisse les murs la repousser.
    const ajuste = fitInNook(
      { x: 1.55, z: -0.5 },
      { width: 3, depth: 0.87, yaw: 0 },
      MURS,
      COINS.map(([x, z]) => ({ x, z })),
    );
    expect(ajuste.width).toBe(3);
  });

  it('laisse intact un meuble qui tient déjà', () => {
    const ajuste = fitInNook(
      { x: 3, z: 2 },
      { width: 1.48, depth: 0.87, yaw: 0 },
      MURS,
      COINS.map(([x, z]) => ({ x, z })),
    );
    expect(ajuste.width).toBeCloseTo(1.48, 3);
    expect(ajuste.depth).toBeCloseTo(0.87, 3);
    expect(ajuste.centre.x).toBeCloseTo(3, 3);
  });
});

describe('poser un meuble dans une niche', () => {
  beforeEach(poser);

  it('l’y laisse, ajusté, au lieu de l’éjecter', () => {
    useScanStore.getState().setObjectCenter('t1', 1.55, -0.5);
    const o = table();
    // Il a maigri...
    expect(o.width).toBeLessThan(1);
    // ...mais il est RESTÉ dans la niche : c'est tout l'objet du chantier.
    expect(o.transform[14]).toBeLessThan(-0.1);
    expect(Math.abs(o.transform[12] - 1.55)).toBeLessThan(0.3);
    // Et ses quatre coins sont dans la pièce.
    const part = roomParts(MURS, [{ id: 'r1' }])[0];
    expect(part.surface).toBeTruthy();
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const px = o.transform[12] + (sx * o.width) / 2;
      const pz = o.transform[14] + (sz * o.depth) / 2;
      expect(`${px.toFixed(2)} ${dedans(part.surface!.pts, px, pz)}`).toBe(
        `${px.toFixed(2)} true`,
      );
    }
  });

  it('lui rend sa taille dès qu’il ressort', () => {
    useScanStore.getState().setObjectCenter('t1', 1.55, -0.5);
    expect(table().width).toBeLessThan(1);
    useScanStore.getState().setObjectCenter('t1', 3, 2);
    expect(table().width).toBeCloseTo(1.48, 2);
    expect(table().depth).toBeCloseTo(0.87, 2);
  });

  it('n’use pas le meuble à force d’aller-retours', () => {
    for (let i = 0; i < 6; i++) {
      useScanStore.getState().setObjectCenter('t1', 1.55, -0.5);
      useScanStore.getState().setObjectCenter('t1', 3, 2);
    }
    expect(table().width).toBeCloseTo(1.48, 2);
  });

  it('prend une cote saisie à la main comme nouvelle référence', () => {
    useScanStore.getState().setObjectCenter('t1', 1.55, -0.5);
    useScanStore.getState().resizeObject('t1', 0.9, 0.5);
    useScanStore.getState().setObjectCenter('t1', 3, 2);
    // Ressorti au large, il garde LA cote de l'électricien — pas celle du
    // scanner, pas celle de la niche.
    expect(table().width).toBeCloseTo(0.9, 2);
  });
});

/** Point dans le contour de la pièce. */
function dedans(ring: { x: number; z: number }[], px: number, pz: number) {
  let dans = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.z > pz !== b.z > pz &&
      px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x
    ) {
      dans = !dans;
    }
  }
  return dans;
}

/**
 * ET IL SE PLAQUE CONTRE LE MUR QU'IL FRÔLE.
 *
 * Un jour de trois centimètres derrière une commode n'existe pas sur un
 * chantier : il vient du doigt, qui ne vise pas au millimètre. On le referme
 * — mais on ne touche ni à un meuble posé franchement au large, ni à un
 * meuble volontairement de biais.
 */
describe('le plaquage contre le mur', () => {
  const SUD = MURS.find((w) => w.a.z === 4 || w.b.z === 4)!;

  it('referme un jour de trois centimètres', () => {
    // Une commode de 1,20 × 0,50, posée à 3 cm du mur sud (z = 4).
    const demi = 0.25 + WALL_T / 2;
    const p = hugWall(
      { x: 3, z: 4 - demi - 0.03 },
      { width: 1.2, depth: 0.5, yaw: 0 },
      MURS,
      { x: 2.5, z: 2 },
    );
    expect(4 - p.z - demi).toBeLessThan(0.005);
    // Elle n'a pas bougé le long du mur.
    expect(p.x).toBeCloseTo(3, 3);
    expect(SUD).toBeTruthy();
  });

  it('ne touche pas à un meuble posé au large', () => {
    const p = hugWall(
      { x: 3, z: 2 },
      { width: 1.2, depth: 0.5, yaw: 0 },
      MURS,
      { x: 2.5, z: 2 },
    );
    expect(p.z).toBeCloseTo(2, 3);
  });

  it('respecte un meuble mis de biais', () => {
    const demi = 0.25 + WALL_T / 2;
    const p = hugWall(
      { x: 3, z: 4 - demi - 0.03 },
      { width: 1.2, depth: 0.5, yaw: Math.PI / 6 },
      MURS,
      { x: 2.5, z: 2 },
    );
    expect(p.z).toBeCloseTo(4 - demi - 0.03, 3);
  });
});

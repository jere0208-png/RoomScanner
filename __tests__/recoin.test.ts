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
  alignToFit,
  pushOutOfObjects,
  separerMeubles,
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

/**
 * LE MEUBLE DE BIAIS QUI NE PASSE PAS.
 *
 * Relevé du chantier, vidéo à l'appui : « le meuble, plus petit que
 * l'emplacement, ne rentre pas ». Rien n'était cassé : le meuble était en
 * LOSANGE. De biais, un carré de 62 cm en encombre 88 — sa diagonale — et
 * il lui faut 1,02 m entre les axes de murs là où aligné il se contente de
 * 0,76. L'alcôve n'en offrait pas tant, et les murs le renvoyaient.
 *
 * On lui rend donc le quart de tour qui le fait entrer. Mais seulement s'il
 * ne tient pas : un meuble mis de biais au large est un choix.
 */
describe('le meuble de biais dans une alcôve', () => {
  /** Une alcôve de 90 cm d'axe à axe, creusée par un retour de mur. */
  const ALCOVE = [
    mur('fond', 0, 0, 0.9, 0),
    mur('gauche', 0, 0, 0, 1.6),
    mur('retour', 0.9, 0, 0.9, 1),
    mur('sud', 0, 1.6, 4, 1.6),
    mur('est', 4, 1.6, 4, -2),
    mur('nord', 4, -2, 0.9, -2),
    mur('haut', 0.9, -2, 0.9, 0),
  ];
  const DEDANS = { x: 2, z: 0.8 };
  const CIBLE = { x: 0.45, z: 0.5 };

  it('le redresse pour le faire entrer', () => {
    const yaw = alignToFit(
      CIBLE,
      { width: 0.62, depth: 0.62, yaw: Math.PI / 4 },
      ALCOVE,
      DEDANS,
      undefined,
      // D'où vient le meuble : sans cette information, l'ancre de la pièce
      // décide seule des sens de poussée, et le retour de mur rend l'alcôve
      // inatteignable — c'était tout le défaut.
      { x: 2.4, z: 0.6 },
    );
    // Aligné sur les murs de l'alcôve, au quart de tour près.
    const reste = Math.abs(((yaw % (Math.PI / 2)) + Math.PI) % (Math.PI / 2));
    expect(Math.min(reste, Math.PI / 2 - reste)).toBeLessThan(0.02);
  });

  it('ne redresse pas un meuble qui tient déjà', () => {
    const yaw = alignToFit(
      { x: 2.4, z: 0.6 },
      { width: 0.62, depth: 0.62, yaw: Math.PI / 4 },
      ALCOVE,
      DEDANS,
    );
    expect(yaw).toBeCloseTo(Math.PI / 4, 6);
  });

  it('le pose dans l’alcôve, au lieu de le renvoyer', () => {
    useScanStore.setState({
      walls: ALCOVE,
      openings: [],
      objects: [
        {
          id: 'b1',
          category: 'storage',
          width: 0.62,
          depth: 0.62,
          height: 0.9,
          // Posé en losange, au milieu de la pièce.
          transform: [
            Math.cos(Math.PI / 4), 0, Math.sin(Math.PI / 4), 0,
            0, 1, 0, 0,
            -Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4), 0,
            2.4, 0.45, 0.6, 1,
          ],
        },
      ],
      rooms: [{ id: 'r1', name: 'Alcôve', floor: null }],
      fixtures: [],
      ceiling: [],
    });
    useScanStore.getState().setObjectCenter('b1', CIBLE.x, CIBLE.z);
    const o = useScanStore.getState().objects[0];
    // Il est DANS l'alcôve — c'est tout l'objet de la manœuvre.
    expect(Math.hypot(o.transform[12] - CIBLE.x, o.transform[14] - CIBLE.z))
      .toBeLessThan(0.2);
    // Et il s'est redressé.
    const yaw = Math.atan2(o.transform[2], o.transform[0]);
    const reste = Math.abs(((yaw % (Math.PI / 2)) + Math.PI) % (Math.PI / 2));
    expect(Math.min(reste, Math.PI / 2 - reste)).toBeLessThan(0.02);
  });
});

/**
 * DEUX MEUBLES NE SE SUPERPOSENT PAS.
 *
 * Relevé du chantier : « empêche la superposition de meubles avec une logique
 * de magnétisme à l'approche d'un autre ». Sur un plan, deux emprises qui se
 * chevauchent ne veulent rien dire — et vu de dessus, ça ne se voit même pas.
 */
describe('deux meubles qui se rencontrent', () => {
  const COMMODE = {
    cx: 2.5,
    cz: 2,
    width: 1.2,
    depth: 0.5,
    yaw: 0,
  };

  it('se superposent quand l’un SURMONTE l’autre', () => {
    // Une télé posée sur un meuble bas : les emprises au sol se chevauchent,
    // et c'est parfaitement légitime — elles ne partagent pas le même volume.
    const p = pushOutOfObjects(
      { x: 2.6, z: 2.1 },
      { width: 1, depth: 0.8, yaw: 0, y0: 0.9, y1: 1.5 },
      [{ ...COMMODE, y0: 0, y1: 0.85 }],
    );
    expect(p.x).toBeCloseTo(2.6, 6);
    expect(p.z).toBeCloseTo(2.1, 6);
  });

  it('se repoussent quand ils occupent le MÊME volume', () => {
    // Relevé du chantier, vidéo à l'appui : « il doit être impossible qu'une
    // table rentre en collision avec un canapé ». Ici les deux touchent le
    // sol : ils se gênent vraiment.
    const p = pushOutOfObjects(
      { x: 2.6, z: 2.1 },
      { width: 1, depth: 0.8, yaw: 0, y0: 0, y1: 0.75 },
      [{ ...COMMODE, y0: 0, y1: 0.85 }],
    );
    const ecart = Math.abs(p.z - 2);
    // Ils ne se traversent plus : la distance des centres dépasse la somme
    // des demi-profondeurs.
    expect(ecart).toBeGreaterThan(0.4 + 0.25 - 0.001);
    // Et ils sont ressortis par le côté le plus court : la profondeur.
    expect(p.x).toBeCloseTo(2.6, 3);
  });

  it('referme un jour de trois centimètres', () => {
    // Bord à bord à trois centimètres près, dans l'axe de la profondeur.
    const cz = 2 + 0.25 + 0.4 + 0.03;
    const p = pushOutOfObjects(
      { x: 2.5, z: cz },
      { width: 1, depth: 0.8, yaw: 0 },
      [COMMODE],
    );
    expect(cz - p.z).toBeCloseTo(0.03, 2);
  });

  it('ne touche pas à un meuble posé au large', () => {
    const p = pushOutOfObjects(
      { x: 2.5, z: 3.6 },
      { width: 1, depth: 0.8, yaw: 0 },
      [COMMODE],
    );
    expect(p.z).toBeCloseTo(3.6, 6);
  });
});

/**
 * DANS UN COIN, LE MEUBLE SE MET D'ÉQUERRE ET SE RABOTE.
 *
 * Relevé du chantier, capture à l'appui : « j'ai essayé de rentrer le meuble
 * dans un coin, il se met en biais et ne s'adapte pas à la forme de ce coin ».
 * Les deux gestes vont ensemble : d'équerre avec les murs, puis raboté à ce
 * que la niche permet. Séparés, ils ne servent à rien — c'est ce qui se
 * passait, puisqu'on n'essayait les quarts de tour qu'à la cote d'origine.
 */
describe('le meuble poussé dans un coin', () => {
  /** Un coin étroit : 1,05 m d'axe à axe, ouvert vers le séjour. */
  const COIN = [
    mur('fond', 0, 0, 1.05, 0),
    mur('gauche', 0, 0, 0, 1.5),
    mur('retour', 1.05, 0, 1.05, 1.1),
    mur('sud', 0, 1.5, 4, 1.5),
    mur('est', 4, 1.5, 4, -2),
    mur('nord', 4, -2, 1.05, -2),
    mur('haut', 1.05, -2, 1.05, 0),
  ];
  const DEDANS = { x: 2.4, z: 0.7 };
  const CIBLE = { x: 0.5, z: 0.5 };

  it('l’y met d’équerre, même quand aucun angle ne passe à sa taille', () => {
    // Un meuble de 1,10 × 0,50, de biais : c'est le cas de la capture.
    const yaw = alignToFit(
      CIBLE,
      { width: 1.1, depth: 0.5, yaw: 0.6 },
      COIN,
      DEDANS,
      undefined,
      { x: 2.4, z: 0.7 },
    );
    const reste = Math.abs(((yaw % (Math.PI / 2)) + Math.PI) % (Math.PI / 2));
    expect(Math.min(reste, Math.PI / 2 - reste)).toBeLessThan(0.02);
  });

  it('et le rabote à la largeur du coin', () => {
    useScanStore.setState({
      walls: COIN,
      openings: [],
      objects: [
        {
          id: 'c1',
          category: 'storage',
          width: 1.1,
          depth: 0.5,
          height: 0.9,
          transform: [
            Math.cos(0.6), 0, Math.sin(0.6), 0,
            0, 1, 0, 0,
            -Math.sin(0.6), 0, Math.cos(0.6), 0,
            2.4, 0.45, 0.7, 1,
          ],
        },
      ],
      rooms: [{ id: 'r1', name: 'Coin', floor: null }],
      fixtures: [],
      ceiling: [],
    });
    useScanStore.getState().setObjectCenter('c1', CIBLE.x, CIBLE.z);
    const o = useScanStore.getState().objects[0];
    // Il est DANS le coin, d'équerre, et sa plus grande cote tient dans la
    // largeur disponible — 1,05 m d'axe à axe moins l'épaisseur d'un mur.
    expect(o.transform[14]).toBeLessThan(1);
    const yaw = Math.atan2(o.transform[2], o.transform[0]);
    const reste = Math.abs(((yaw % (Math.PI / 2)) + Math.PI) % (Math.PI / 2));
    expect(Math.min(reste, Math.PI / 2 - reste)).toBeLessThan(0.02);
    expect(Math.max(o.width, o.depth)).toBeLessThan(1.05);
  });
});

/**
 * LE RELEVÉ SE DÉSENCHÊTRE À L'OUVERTURE.
 *
 * Le scanner rend des boîtes, et il lui arrive de les faire se traverser : une
 * table DANS un canapé. Le chantier a tranché après que je l'aie déconseillé —
 * c'est son relevé, et une table qui traverse un canapé coûte plus cher en
 * crédibilité qu'un meuble déplacé de trois centimètres.
 *
 * Trois garde-fous, et ce banc les vérifie un par un.
 */
describe('le désenchêtrement du relevé', () => {
  const canape = { cx: 2, cz: 2, width: 2.1, depth: 0.9, yaw: 0, y0: 0, y1: 0.85 };

  it('écarte une table qui traverse un canapé', () => {
    const basse = { cx: 2.2, cz: 2.3, width: 1.2, depth: 0.7, yaw: 0, y0: 0, y1: 0.45 };
    const bouges = separerMeubles([canape, basse]);
    expect(bouges).toHaveLength(1);
    // C'est la TABLE qui cède : elle est la plus petite.
    expect(bouges[0].index).toBe(1);
    // Et elle ne bouge que de la pénétration : 0,45 + 0,35 − 0,30 = 0,50.
    const pas = Math.hypot(bouges[0].dx, bouges[0].dz);
    expect(pas).toBeGreaterThan(0.4);
    expect(pas).toBeLessThan(0.6);
  });

  it('ne touche pas à une télé posée SUR un meuble', () => {
    const meuble = { cx: 2, cz: 2, width: 1.6, depth: 0.45, yaw: 0, y0: 0, y1: 0.5 };
    const tele = { cx: 2, cz: 2, width: 1.1, depth: 0.08, yaw: 0, y0: 0.55, y1: 1.2 };
    expect(separerMeubles([meuble, tele])).toHaveLength(0);
  });

  it('ne touche pas à un chevauchement d’un centimètre', () => {
    // L'imprécision ordinaire d'un relevé à la caméra : on n'y touche pas.
    const voisin = {
      cx: 2 + 1.05 + 0.35 - 0.01,
      cz: 2,
      width: 0.7,
      depth: 0.7,
      yaw: 0,
      y0: 0,
      y1: 0.8,
    };
    expect(separerMeubles([canape, voisin])).toHaveLength(0);
  });
});

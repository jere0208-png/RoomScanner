/**
 * AUCUN GESTE NE PEUT ÉCRIRE UN NOMBRE QUI N'EN EST PAS UN.
 *
 * Relevé du patron : « trouve des défauts. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENT CE BANC. Un plantage sur les meubles a fait découvrir que
 * `resizeObject` acceptait un NaN : sa garde s'écrivait `width <= 0`, et
 * `NaN <= 0` vaut FAUX. Le NaN traversait, s'écrivait dans le meuble, et
 * finissait en coordonnées `NaN,NaN` dans un tracé SVG — ce qui fait tomber la
 * couche native, c'est-à-dire l'application.
 *
 * LA BONNE QUESTION APRÈS UNE CORRECTION EST TOUJOURS LA MÊME : est-ce que la
 * même faute dort ailleurs ? Le magasin porte une trentaine de gestes qui
 * prennent des nombres — des hauteurs, des longueurs, des angles, des
 * positions — et chacun a sa garde, écrite à la main, à des années
 * d'intervalle. Il suffit d'UNE écrite « à l'envers » pour rouvrir le trou.
 *
 * ON NE LES RELIT DONC PAS UN PAR UN : on les ÉPROUVE tous, avec le même
 * poison, et l'on regarde ce qui ressort du modèle. C'est le seul garde-fou
 * qui vaille pour une famille de défauts — le prochain geste écrit dans six
 * mois tombera ici tout seul.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  UNE GARDE QUI CHERCHE CE QU'ELLE REFUSE LAISSE TOUJOURS PASSER NaN, │
 * │  parce que toute comparaison avec NaN est fausse. Une garde qui      │
 * │  EXIGE ce qu'elle accepte ne peut pas se tromper.                    │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * `Math.max(0.1, Math.min(6, x))` en est une variante sournoise : elle a
 * l'air de borner, et `Math.min(6, NaN)` vaut NaN.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    viewModel: jest.fn(async () => false),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  laserEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  RoomScanView: 'RoomScanView',
  RoomScanCanvas: undefined,
}));

import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';
import type { ObjectData } from 'react-native-room-scan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const MURS: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];

const FENETRE: WallSeg = {
  ...mur('f1', 1, 0, 2.4, 0),
  type: 'window',
  height: 1.4,
  yCenter: 1.65,
};

const MEUBLE: ObjectData = {
  id: 'm1',
  category: 'sofa',
  width: 2,
  depth: 0.9,
  height: 0.8,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2.5, 0.4, 2, 1],
};

const PRISE: Fixture = {
  id: 'p1',
  kind: 'prise',
  wallId: 'n',
  along: 1,
  height: 0.25,
  side: 1,
};

const poser = () => {
  useScanStore.getState().reset();
  useScanStore.setState({
    walls: MURS.map((w) => ({ ...w })),
    openings: [{ ...FENETRE }],
    objects: [{ ...MEUBLE, transform: [...MEUBLE.transform] }],
    /*
      LA PIÈCE PORTE SES MURS. Sans `wallIds`, `setRoomHeight` ne trouve
      aucun mur à régler et ne fait rien — le contrôle en sens inverse
      tombait, et il avait raison de tomber : il disait que le banc mentait,
      pas que le magasin était cassé.
    */
    rooms: [
      { id: 'r1', name: 'Séjour', floor: null, wallIds: MURS.map((w) => w.id) },
    ] as never,
    fixtures: [{ ...PRISE }],
    ceiling: [],
    photos: [],
    notes: [],
  });
};

const st = () => useScanStore.getState();

/**
 * TOUS LES NOMBRES DU MODÈLE, à plat.
 *
 * On descend dans tout ce qui se dessine : murs, ouvertures, meubles,
 * appareils, points du plafond. Un NaN qui s'écrit quelque part finit
 * forcément dans un de ces nombres-là, puisque c'est ce que le dessin lit.
 */
const nombresDuModele = (): { chemin: string; valeur: number }[] => {
  const out: { chemin: string; valeur: number }[] = [];
  const descendre = (chemin: string, v: unknown) => {
    if (typeof v === 'number') {
      out.push({ chemin, valeur: v });
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((x, i) => descendre(`${chemin}[${i}]`, x));
      return;
    }
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) descendre(`${chemin}.${k}`, x);
    }
  };
  const e = st();
  descendre('murs', e.walls);
  descendre('ouvertures', e.openings);
  descendre('meubles', e.objects);
  descendre('appareils', e.fixtures);
  descendre('plafond', e.ceiling);
  return out;
};

/** Ce qui n'est pas un nombre, dit avec son chemin — sinon on cherche. */
const lesFous = () =>
  nombresDuModele()
    .filter(({ valeur }) => !Number.isFinite(valeur))
    .map(({ chemin, valeur }) => `${chemin} = ${valeur}`);

/**
 * LE POISON. Trois façons pour un nombre de ne pas en être un, et elles
 * arrivent toutes les trois pour de vrai : un `undefined + x` donne NaN, une
 * division par une longueur nulle donne l'infini.
 */
const POISON = [NaN, Infinity, -Infinity];

/**
 * TOUS LES GESTES DU MAGASIN QUI PRENNENT UN NOMBRE.
 *
 * Chacun est joué une fois par poison et par position d'argument. La liste se
 * lit comme un inventaire : le jour où l'on ajoute un geste, on l'ajoute ici,
 * et il est éprouvé sans qu'on ait à y penser.
 */
const GESTES: { nom: string; jouer: (x: number) => void }[] = [
  { nom: 'resizeObject(largeur)', jouer: (x) => st().resizeObject('m1', x, 0.6) },
  { nom: 'resizeObject(profondeur)', jouer: (x) => st().resizeObject('m1', 1.4, x) },
  { nom: 'setObjectCenter(x)', jouer: (x) => st().setObjectCenter('m1', x, 2) },
  { nom: 'setObjectCenter(z)', jouer: (x) => st().setObjectCenter('m1', 2, x) },
  { nom: 'setObjectHeight(hauteur)', jouer: (x) => st().setObjectHeight('m1', x) },
  { nom: 'setObjectHeight(assise)', jouer: (x) => st().setObjectHeight('m1', 0.8, x) },
  { nom: 'setObjectYaw', jouer: (x) => st().setObjectYaw('m1', x) },
  { nom: 'rangerMeuble(x)', jouer: (x) => st().rangerMeuble('m1', x, 2) },
  { nom: 'rangerMeuble(z)', jouer: (x) => st().rangerMeuble('m1', 2, x) },
  { nom: 'setWallHeight', jouer: (x) => st().setWallHeight('n', x) },
  { nom: 'setWallLength', jouer: (x) => st().setWallLength('n', x) },
  { nom: 'setWallAngle', jouer: (x) => st().setWallAngle('n', x) },
  { nom: 'moveWall(dx)', jouer: (x) => st().moveWall('n', x, 0) },
  { nom: 'moveWall(dz)', jouer: (x) => st().moveWall('n', 0, x) },
  { nom: 'moveWallPoint', jouer: (x) => st().moveWallPoint('n', 'a', { x, z: 0 }) },
  { nom: 'setRoomHeight', jouer: (x) => st().setRoomHeight('r1', x) },
  { nom: 'setAllRoomHeights', jouer: (x) => st().setAllRoomHeights(x) },
  { nom: 'resizeRoom(largeur)', jouer: (x) => st().resizeRoom('r1', x, 4) },
  { nom: 'resizeRoom(profondeur)', jouer: (x) => st().resizeRoom('r1', 5, x) },
  { nom: 'moveRoom(dx)', jouer: (x) => st().moveRoom('r1', x, 0) },
  { nom: 'moveRoom(dz)', jouer: (x) => st().moveRoom('r1', 0, x) },
  { nom: 'resizeOpening(largeur)', jouer: (x) => st().resizeOpening('f1', x) },
  { nom: 'resizeOpening(hauteur)', jouer: (x) => st().resizeOpening('f1', 1.4, x) },
  { nom: 'moveOpening', jouer: (x) => st().moveOpening('f1', x) },
  { nom: 'setAllege', jouer: (x) => st().setAllege('f1', x) },
  { nom: 'moveFixture(le long)', jouer: (x) => st().moveFixture('p1', x, 0.25) },
  { nom: 'moveFixture(hauteur)', jouer: (x) => st().moveFixture('p1', 1, x) },
  { nom: 'splitFixture', jouer: (x) => st().splitFixture('p1', x) },
];

describe('le poison ne franchit aucune porte', () => {
  for (const { nom, jouer } of GESTES) {
    it(`${nom} refuse ce qui n’est pas un nombre`, () => {
      for (const p of POISON) {
        poser();
        jouer(p);
        expect(`${nom} ${p} : ${lesFous().join(', ')}`).toBe(`${nom} ${p} : `);
      }
    });
  }
});

describe('mais les gestes marchent, eux', () => {
  /*
    LE CONTRÔLE EN SENS INVERSE, ET IL PORTE TOUT LE BANC. Un magasin qui
    refuserait TOUT passerait les vingt-huit épreuves du dessus sans qu'aucune
    ne prouve quoi que ce soit. On rejoue donc chaque geste avec une valeur
    juste, et l'on exige que le modèle CHANGE.

    Trois gestes en sont exemptés, et pour une raison qui se dit : ils peuvent
    légitimement ne rien faire sur ce plan-là — scinder un appareil au ras de
    son bord, ranger un meuble déjà rangé, régler une hauteur déjà bonne.
  */
  const VALEURS: Record<string, number> = {
    'resizeObject(largeur)': 1.4,
    'resizeObject(profondeur)': 0.6,
    'setObjectCenter(x)': 3,
    'setObjectCenter(z)': 3,
    'setObjectHeight(hauteur)': 1.1,
    'setObjectHeight(assise)': 0.3,
    'setObjectYaw': 0.5,
    'rangerMeuble(x)': 3.2,
    'rangerMeuble(z)': 3.2,
    'setWallHeight': 2.2,
    'setWallLength': 4,
    'setWallAngle': 12,
    'moveWall(dx)': 0.3,
    'moveWall(dz)': 0.3,
    'moveWallPoint': 0.4,
    'setRoomHeight': 2.2,
    'setAllRoomHeights': 2.2,
    'resizeRoom(largeur)': 4,
    'resizeRoom(profondeur)': 3,
    'moveRoom(dx)': 0.5,
    'moveRoom(dz)': 0.5,
    'resizeOpening(largeur)': 1,
    'resizeOpening(hauteur)': 1.1,
    'moveOpening': 2,
    'setAllege': 1.2,
    'moveFixture(le long)': 2,
    'moveFixture(hauteur)': 1.1,
    'splitFixture': 2.5,
  };

  const empreinte = () =>
    nombresDuModele()
      .map(({ chemin, valeur }) => `${chemin}=${valeur}`)
      .join('|');

  for (const { nom, jouer } of GESTES) {
    it(`${nom} fait bien quelque chose`, () => {
      poser();
      const avant = empreinte();
      jouer(VALEURS[nom]);
      expect(`${nom} : ${empreinte() !== avant}`).toBe(`${nom} : true`);
    });
  }
});

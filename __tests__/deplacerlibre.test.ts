/**
 * LE MAGASIN POSE OU LE DOIGT DEMANDE.
 *
 * Suite du releve du patron sur le deplacement des meubles. Le magasin
 * contraignait la position A CHAQUE IMAGE : il rabattait le meuble hors des
 * murs, le retournait pour entrer dans une niche, le rabotait pour tenir
 * dans un recoin. Trois aides, chacune defendable seule, et ensemble un
 * meuble qui glisse tout seul sous le doigt.
 *
 * En mode LIBRE, le magasin n'arbitre plus : il pose ou on lui dit, et se
 * contente de DIRE si la position tient (voir `poserLibre`). C'est l'ecran
 * qui montre le refus — en rouge — et qui decide de ne pas lacher la.
 *
 * L'ancien mode reste : les fleches du bandeau deplacent au centimetre, et
 * la, les aides sont les bienvenues — on ne vise pas au doigt.
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
import type { WallSeg } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz },
  height: 2.5, yCenter: 1.25, roomId: 'r1',
});
const MURS = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];
const COMMODE = {
  id: 'c1',
  roomId: 'r1',
  category: 'storage',
  width: 1.2,
  depth: 0.45,
  height: 0.8,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2.5, 0.4, 2, 1],
};

const ou = () => {
  const o = st().objects[0];
  return { x: o.transform[12], z: o.transform[14] };
};

beforeEach(() => {
  mockMagasin.clear();
  useScanStore.setState({
    walls: MURS,
    openings: [],
    objects: [{ ...COMMODE }] as never,
    rooms: [{ id: 'r1', name: 'Sejour', floor: null }] as never,
  });
});

describe('deplacer un meuble a la main', () => {
  it('le pose exactement ou on le demande', () => {
    st().setObjectCenter('c1', 3.2, 2.6, true);
    expect(ou().x).toBeCloseTo(3.2, 3);
    expect(ou().z).toBeCloseTo(2.6, 3);
  });

  it('le laisse traverser les murs pendant le geste', () => {
    // Hors de la piece : le doigt y est alle, le meuble suit.
    st().setObjectCenter('c1', 2.5, -1, true);
    expect(ou().z).toBeCloseTo(-1, 3);
  });

  /*
    DEUX VERSIONS DE CETTE EPREUVE, SUR LE MEME POINT D'ESSAI.

    Elle s'appelait « l'attire contre un mur quand il en est tout pres » : a
    cinquante centimetres du nu, le meuble devait SAUTER contre le mur. C'etait
    l'aimant de vingt-cinq centimetres du mode libre.

    Releve du patron : « enleve l'attraction mais mets une collision
    intelligente ». Le meme point d'essai prouve donc l'inverse — le meuble
    reste ou le doigt le met. Ce que l'aimant faisait de legitime (ne pas
    laisser un meuble dans la maconnerie) est passe au LACHER, ou c'est une
    collision et non une aspiration : voir `collisionmeuble.test.ts`.
  */
  it('ne l’attire plus, meme tout pres d’un mur', () => {
    st().setObjectCenter('c1', 2.5, 0.5, true);
    expect(ou().z).toBeCloseTo(0.5, 3);
  });

  it('et ne rabote plus le meuble pour le faire entrer', () => {
    // L'ancien mode retaillait un meuble trop large pour un recoin. En
    // libre, ses cotes sont celles du catalogue, toujours.
    st().setObjectCenter('c1', 0.3, 0.3, true);
    expect(st().objects[0].width).toBeCloseTo(1.2, 3);
    expect(st().objects[0].depth).toBeCloseTo(0.45, 3);
  });

  it('mais les fleches gardent les aides : on ne vise pas au doigt', () => {
    // Mode d'origine : le meuble est repousse hors de la maconnerie.
    st().setObjectCenter('c1', 2.5, 0.05);
    expect(ou().z).toBeGreaterThan(0.1);
  });
});

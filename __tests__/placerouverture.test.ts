/**
 * UNE PORTE SE REPLACE SUR SON MUR.
 *
 * Le bandeau d'une ouverture proposait sa largeur, sa hauteur, son coffre de
 * volet et sa fermeture — mais rien pour la BOUGER. Or `resizeOpening`
 * travaille autour du MILIEU de l'ouverture : elargir une porte l'ouvre
 * symetriquement, elle ne se decale jamais. Une porte posee a trente
 * centimetres du bon endroit ne pouvait donc que se supprimer et se
 * reposer — en reperdant sa hauteur, son type et son coffre.
 *
 * Or « la porte a quatre-vingt-dix du mur » est exactement la cote qu'un
 * poseur mesure sur place, et la seule que le plan ne savait pas recevoir.
 *
 * ON DONNE LA COTE DU BORD, PAS DU MILIEU. Personne ne mesure jusqu'a l'axe
 * d'une porte : on mesure jusqu'a son tableau, avec un metre pose contre le
 * mur de refend. Le magasin range ensuite l'ouverture ou il faut.
 *
 * ET ELLE RESTE DANS SON MUR : poussee au-dela, elle s'arrete au bord.
 * Une ouverture qui depasse n'est pas une ouverture, c'est un trou dans le
 * vide — la 3D la decoupe hors maconnerie, et le metre compte une
 * menuiserie que personne ne pourra poser.
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

/** Un mur de cinq metres, d'ouest en est. */
const MUR: WallSeg = {
  id: 'm1',
  type: 'wall',
  a: { x: 0, z: 0 },
  b: { x: 5, z: 0 },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
};

/** Une porte de 90 cm, posee au milieu du mur. */
const PORTE: WallSeg = {
  id: 'o1',
  type: 'door',
  a: { x: 2.05, z: 0 },
  b: { x: 2.95, z: 0 },
  height: 2.04,
  yCenter: 1.02,
  roomId: 'r1',
};

const bord = () => Math.min(st().openings[0].a.x, st().openings[0].b.x);
const large = () => {
  const o = st().openings[0];
  return Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z);
};

beforeEach(() => {
  mockMagasin.clear();
  useScanStore.setState({
    walls: [MUR],
    openings: [{ ...PORTE }],
    rooms: [{ id: 'r1', name: 'Sejour', floor: null }] as never,
  });
});

describe('placer une ouverture sur son mur', () => {
  it('pose son BORD a la cote demandee', () => {
    st().moveOpening('o1', 0.9);
    expect(bord()).toBeCloseTo(0.9, 3);
    // Et elle garde sa largeur : on la deplace, on ne la retaille pas.
    expect(large()).toBeCloseTo(0.9, 3);
  });

  it('ne sort pas du mur, meme si on le lui demande', () => {
    st().moveOpening('o1', 99);
    // Cinq metres de mur, quatre-vingt-dix de porte : le bord s'arrete a
    // 4,10 m, la porte finit pile au coin.
    expect(bord()).toBeCloseTo(4.1, 2);
    st().moveOpening('o1', -3);
    expect(bord()).toBeCloseTo(0, 3);
  });

  it('garde sa hauteur, son type et son coffre', () => {
    useScanStore.setState({
      openings: [{ ...PORTE, coffre: true } as never],
    });
    st().moveOpening('o1', 1.2);
    const o = st().openings[0];
    expect(o.type).toBe('door');
    expect(o.height).toBeCloseTo(2.04, 3);
    expect(o.yCenter).toBeCloseTo(1.02, 3);
    expect((o as { coffre?: boolean }).coffre).toBe(true);
  });

  it('s’annule d’un seul geste', () => {
    st().moveOpening('o1', 0.9);
    st().undo();
    expect(bord()).toBeCloseTo(2.05, 3);
  });

  it('ne touche a rien quand l’ouverture n’a pas de mur', () => {
    // Une ouverture orpheline — renvoi mort d'une sauvegarde bancale — n'a
    // pas de cote de reference : on ne la deplace pas au hasard.
    useScanStore.setState({ walls: [] });
    st().moveOpening('o1', 0.9);
    expect(bord()).toBeCloseTo(2.05, 3);
  });
});

/**
 * UNE OUVERTURE A UNE NATURE, ET ELLE SE DIT.
 *
 * Trouve en refaisant le parcours complet d'un plan dessine sans scanner :
 * on pose une ouverture sur un mur, et c'est une BAIE. Toujours. Le bandeau
 * donne sa largeur, sa hauteur, sa position, son coffre — jamais ce qu'elle
 * EST. Un plan trace a la main ne comportait donc ni porte ni fenetre, rien
 * que des trous.
 *
 * Ce n'est pas une etiquette : la nature commande le dessin et les cotes.
 * Une porte porte un battant et un quart de cercle — c'est lui qui dit de
 * quel cote se pose l'interrupteur. Une fenetre a une allege, et c'est elle
 * qui decide d'une prise dessous ou d'un convecteur. Faute de nature,
 * l'application offrait ces deux reglages a une ouverture qui n'y avait pas
 * droit, et personne ne pouvait le lui donner.
 *
 * UNE PORTE PART DU SOL. Le dire, c'est ramener son allege a zero : une
 * porte a soixante centimetres du plancher n'existe pas, et laisser
 * l'ancienne cote produirait une menuiserie qu'aucun banc ne rattraperait.
 *
 * UNE FENETRE A UNE ALLEGE. Posee au sol, elle prend la cote la plus
 * courante — quatre-vingt-quinze — plutot que de rester une baie qui
 * s'appelle fenetre. On la corrige ensuite d'un appui ; ce qu'on ne peut
 * pas corriger, c'est ce qu'on n'a pas vu.
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

const MUR: WallSeg = {
  id: 'm1',
  type: 'wall',
  a: { x: 0, z: 0 },
  b: { x: 5, z: 0 },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
};
const BAIE: WallSeg = {
  id: 'o1',
  type: 'opening',
  a: { x: 2, z: 0 },
  b: { x: 3, z: 0 },
  height: 2.05,
  yCenter: 1.025,
  roomId: 'r1',
};

const allege = () => {
  const o = st().openings[0];
  return o.yCenter - o.height / 2;
};

beforeEach(() => {
  mockMagasin.clear();
  useScanStore.setState({ walls: [MUR], openings: [{ ...BAIE }] });
});

describe('la nature d’une ouverture', () => {
  it('se declare : porte, fenetre ou baie', () => {
    st().setOpeningType('o1', 'door');
    expect(st().openings[0].type).toBe('door');
    st().setOpeningType('o1', 'window');
    expect(st().openings[0].type).toBe('window');
    st().setOpeningType('o1', 'opening');
    expect(st().openings[0].type).toBe('opening');
  });

  it('une porte part du sol', () => {
    useScanStore.setState({
      openings: [{ ...BAIE, height: 1.4, yCenter: 1.6 }],
    });
    st().setOpeningType('o1', 'door');
    expect(allege()).toBeCloseTo(0, 3);
    // Elle garde sa taille : on dit ce qu'elle est, on ne la retaille pas.
    expect(st().openings[0].height).toBeCloseTo(1.4, 3);
  });

  it('une fenetre posee au sol prend une allege', () => {
    // Une baie d'un metre dix : il reste de la place pour la remonter.
    // (La baie de 2,05 m du modele, elle, bute au plafond — c'est le cas
    // que garde l'epreuve du bornage, plus bas.)
    useScanStore.setState({ openings: [{ ...BAIE, height: 1.1, yCenter: 0.55 }] });
    st().setOpeningType('o1', 'window');
    expect(allege()).toBeCloseTo(0.95, 2);
  });

  it('mais une fenetre qui en avait deja une la garde', () => {
    useScanStore.setState({
      openings: [{ ...BAIE, height: 1.1, yCenter: 1.65 }],
    });
    st().setOpeningType('o1', 'window');
    // 1,10 m de haut, centre a 1,65 : allege a 1,10 — c'est un releve, on
    // ne le remplace pas par une valeur de catalogue.
    expect(allege()).toBeCloseTo(1.1, 2);
  });

  it('ne fait pas sortir la fenetre du mur', () => {
    // Mur de 2,50 m, baie de 2,05 m : l'allege standard la ferait passer
    // par le plafond. On la remonte de ce qu'on peut, et pas plus.
    st().setOpeningType('o1', 'window');
    expect(allege() + st().openings[0].height).toBeLessThanOrEqual(2.5 + 1e-6);
  });

  it('s’annule d’un seul geste', () => {
    st().setOpeningType('o1', 'door');
    st().undo();
    expect(st().openings[0].type).toBe('opening');
  });
});

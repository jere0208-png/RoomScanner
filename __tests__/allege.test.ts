/**
 * L'ALLEGE D'UNE FENETRE SE REGLE.
 *
 * Le plan la COTE deja — sur l'elevation du mur et sur le jambage gauche du
 * dossier imprime — parce que c'est elle qui decide d'une prise sous
 * fenetre ou d'un convecteur. Elle etait la seule cote de menuiserie qu'on
 * pouvait lire sans pouvoir la corriger : `resizeOpening` la tient
 * expressement fixe (« l'allege ne bouge pas, c'est le linteau qui suit »),
 * ce qui est le bon reflexe quand on retaille une baie, et une impasse
 * quand le scan l'a posee dix centimetres trop haut.
 *
 * ON DEPLACE LA MENUISERIE, ON NE LA RETAILLE PAS : une fenetre remontee de
 * dix centimetres reste une fenetre de la meme taille. Regler l'allege en
 * rognant la hauteur donnerait deux gestes qui se defont l'un l'autre.
 *
 * ET ELLE RESTE DANS SON MUR. Poussee au-dela, la menuiserie sortirait par
 * le plafond : la 3D la decouperait hors maconnerie et le metre compterait
 * une pose impossible. On s'arrete au linteau, et le chiffre relu apres
 * coup dit la verite.
 *
 * RIEN POUR UNE PORTE : son allege est le sol, par definition. Un reglage
 * qui ne peut valoir que zero est un reglage qu'on croit rate.
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

/** Une fenetre de 1,10 m de haut, allege a 1,05 m. */
const FENETRE: WallSeg = {
  id: 'o1',
  type: 'window',
  a: { x: 2, z: 0 },
  b: { x: 3.2, z: 0 },
  height: 1.1,
  yCenter: 1.6,
  roomId: 'r1',
};

/** L'allege telle que le dessin et le dossier la lisent. */
const allege = () => {
  const o = st().openings[0];
  return o.yCenter - o.height / 2;
};
const hauteur = () => st().openings[0].height;

beforeEach(() => {
  mockMagasin.clear();
  useScanStore.setState({ walls: [MUR], openings: [{ ...FENETRE }] });
});

describe('l’allege d’une fenetre', () => {
  it('se pose a la cote demandee', () => {
    st().setAllege('o1', 0.95);
    expect(allege()).toBeCloseTo(0.95, 3);
    // La menuiserie garde sa taille : on la deplace, on ne la rogne pas.
    expect(hauteur()).toBeCloseTo(1.1, 3);
  });

  it('ne sort pas par le plafond', () => {
    st().setAllege('o1', 9);
    // Mur de 2,50 m, fenetre de 1,10 m : l'allege s'arrete a 1,40 m et le
    // linteau tombe pile sous le plafond.
    expect(allege()).toBeCloseTo(1.4, 2);
    expect(hauteur()).toBeCloseTo(1.1, 3);
  });

  it('ne passe pas sous le sol', () => {
    st().setAllege('o1', -1);
    expect(allege()).toBeCloseTo(0, 3);
  });

  it('ne s’applique pas a une porte', () => {
    useScanStore.setState({
      openings: [{ ...FENETRE, type: 'door', height: 2.04, yCenter: 1.02 }],
    });
    st().setAllege('o1', 0.9);
    expect(allege()).toBeCloseTo(0, 3);
  });

  it('s’annule d’un seul geste', () => {
    st().setAllege('o1', 0.95);
    st().undo();
    expect(allege()).toBeCloseTo(1.05, 3);
  });
});

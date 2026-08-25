/**
 * POSER UNE OUVERTURE, C'EST DIRE LAQUELLE.
 *
 * Releve de chantier : « j'ai essaye de creer une ouverture sur un mur, ca
 * devrait proposer directement si on veut une porte, une fenetre, etc. »
 *
 * Le parcours n'en offrait qu'un seul : le menu du mur posait une BAIE, de
 * soixante pour cent de la longueur du mur et de quatre-vingt-cinq pour cent
 * de sa hauteur — des proportions qui ne sont celles d'aucune menuiserie. Il
 * fallait ensuite ouvrir le bandeau, aller dans « Reglages de la
 * menuiserie », declarer que c'etait une porte, puis corriger sa largeur et
 * sa hauteur a la main. Quatre gestes pour une porte, et un plan couvert de
 * trous en attendant.
 *
 * DESORMAIS LA NATURE SE CHOISIT A LA POSE, et elle apporte ses cotes :
 * celles du batiment courant, pas une fraction du mur.
 *
 *   — porte : 83 x 204, au sol. Le passage de circulation le plus repandu ;
 *   — fenetre : 120 x 115, allege a 95 ;
 *   — baie libre : 90 x 210, au sol, et on la TRAVERSE.
 *
 * ET L'ALLEGE SE COMPTE DEPUIS LE SOL DU MUR, jamais depuis le zero du
 * repere. Le zero d'ARKit est la ou le telephone a demarre le releve : sur
 * un scan dont le plancher tombe a -0,40, declarer une porte la faisait
 * MONTER de quarante centimetres — elle flottait, coupee du sol. C'est le
 * defaut qui a motive ce banc : « en choisissant la porte, elle se monte a
 * l'envers ».
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
import { estTraversante, type WallSeg } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();

/** Un mur de cinq metres, plancher a zero. */
const MUR: WallSeg = {
  id: 'm1',
  type: 'wall',
  a: { x: 0, z: 0 },
  b: { x: 5, z: 0 },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
};

const pose = () => st().openings[0];
const largeur = () => {
  const o = pose();
  return Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z);
};
const allege = () => {
  const o = pose();
  return o.yCenter - o.height / 2;
};

beforeEach(() => {
  mockMagasin.clear();
  useScanStore.setState({ walls: [MUR], openings: [] });
});

describe('la nature se choisit a la pose', () => {
  it('une porte arrive aux cotes d’une porte, posee au sol', () => {
    st().addOpening('m1', 'door');
    expect(pose().type).toBe('door');
    expect(largeur()).toBeCloseTo(0.83, 2);
    expect(pose().height).toBeCloseTo(2.04, 2);
    expect(allege()).toBeCloseTo(0, 3);
  });

  it('une fenetre arrive avec son allege', () => {
    st().addOpening('m1', 'window');
    expect(pose().type).toBe('window');
    expect(largeur()).toBeCloseTo(1.2, 2);
    expect(pose().height).toBeCloseTo(1.15, 2);
    expect(allege()).toBeCloseTo(0.95, 2);
  });

  it('une baie libre arrive au sol, et elle se traverse', () => {
    st().addOpening('m1', 'opening');
    expect(pose().type).toBe('opening');
    expect(allege()).toBeCloseTo(0, 3);
    expect(estTraversante(pose())).toBe(true);
  });

  /*
    LE CONTROLE EN SENS INVERSE : sans lui, un `estTraversante` qui
    repondrait « oui » a tout passerait pour juste.
  */
  it('une porte, elle, ferme le passage', () => {
    st().addOpening('m1', 'door');
    expect(estTraversante(pose())).toBe(false);
  });

  it('mais une porte que le scan a vue ouverte se traverse', () => {
    st().addOpening('m1', 'door');
    useScanStore.setState({
      openings: [{ ...pose(), open: true }],
    });
    expect(estTraversante(pose())).toBe(true);
  });

  it('sans nature dite, c’est une baie — le geste d’avant', () => {
    st().addOpening('m1');
    expect(pose().type).toBe('opening');
  });

  it('se pose au milieu du mur', () => {
    st().addOpening('m1', 'door');
    const o = pose();
    expect((o.a.x + o.b.x) / 2).toBeCloseTo(2.5, 2);
  });

  it('s’annule d’un seul geste', () => {
    st().addOpening('m1', 'door');
    st().undo();
    expect(st().openings).toHaveLength(0);
  });
});

describe('les cotes du batiment ne debordent pas du mur', () => {
  it('un mur d’un metre ne recoit pas une porte de 83 plus ses tableaux', () => {
    useScanStore.setState({
      walls: [{ ...MUR, b: { x: 1, z: 0 } }],
      openings: [],
    });
    st().addOpening('m1', 'door');
    expect(largeur()).toBeLessThanOrEqual(1);
    expect(largeur()).toBeGreaterThan(0.3);
  });

  it('un mur bas rabote la hauteur plutot que de percer le plafond', () => {
    useScanStore.setState({
      walls: [{ ...MUR, height: 1.9, yCenter: 0.95 }],
      openings: [],
    });
    st().addOpening('m1', 'door');
    expect(allege() + pose().height).toBeLessThanOrEqual(1.9 + 1e-6);
  });

  it('sur un mur bas, la fenetre garde son allege et perd de la hauteur', () => {
    useScanStore.setState({
      walls: [{ ...MUR, height: 1.6, yCenter: 0.8 }],
      openings: [],
    });
    st().addOpening('m1', 'window');
    expect(allege()).toBeCloseTo(0.95, 2);
    expect(allege() + pose().height).toBeLessThanOrEqual(1.6 + 1e-6);
  });
});

/*
  LE SOL DU MUR, PAS LE ZERO DU REPERE.

  ARKit place son origine la ou le releve a commence — a hauteur de main, le
  plus souvent. Un scan livre donc couramment des murs dont le plancher est a
  -0,40 ou a +1,20 (un etage). Ramener l'allege d'une porte a zero dans ce
  repere-la, c'est la decrocher du sol.
*/
describe('quand le plancher n’est pas a zero', () => {
  const HAUT: WallSeg = { ...MUR, yCenter: 1.25 + 1.5 };

  beforeEach(() => {
    useScanStore.setState({ walls: [HAUT], openings: [] });
  });

  it('la porte posee se cale sur le plancher du mur', () => {
    st().addOpening('m1', 'door');
    expect(allege()).toBeCloseTo(1.5, 3);
  });

  it('la porte declaree apres coup s’y cale aussi', () => {
    st().addOpening('m1', 'window');
    st().setOpeningType(pose().id, 'door');
    expect(allege()).toBeCloseTo(1.5, 3);
  });

  it('et la fenetre declaree apres coup prend son allege depuis ce plancher', () => {
    st().addOpening('m1', 'opening');
    // Rabaissee a 1,10 : il reste de la place pour la remonter de 95. Une
    // baie de 2,10 sous 2,50 buterait au plafond, et c'est le bornage qui
    // repondrait — pas le calcul qu'on epreuve ici.
    st().resizeOpening(pose().id, undefined, 1.1);
    st().setOpeningType(pose().id, 'window');
    expect(allege()).toBeCloseTo(1.5 + 0.95, 2);
  });
});

/*
  DECLARER LA NATURE SUFFIT A OUVRIR LE PASSAGE.

  `open` etait un drapeau pose une seule fois, a la lecture du scan
  (`isOpenPassage`). Une baie declaree a la main ne l'avait donc jamais : le
  plan la dessinait en trouee, la 3D la bouchait d'un panneau. Deux dessins
  du meme trou, et rien pour les reconcilier.
*/
describe('la nature dit, a elle seule, ce qui se traverse', () => {
  beforeEach(() => {
    useScanStore.setState({ walls: [MUR], openings: [] });
  });

  it('devenir baie ouvre le passage', () => {
    st().addOpening('m1', 'door');
    st().setOpeningType(pose().id, 'opening');
    expect(estTraversante(pose())).toBe(true);
  });

  it('devenir porte le referme', () => {
    st().addOpening('m1', 'opening');
    st().setOpeningType(pose().id, 'door');
    expect(estTraversante(pose())).toBe(false);
  });
});

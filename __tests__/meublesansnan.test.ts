/**
 * AUCUN MEUBLE NE PREND UNE COTE QUI N'EN EST PAS UNE.
 *
 * Relevé du patron : « l'app a quitté plusieurs fois après des clics sur des
 * meubles. Fais en sorte qu'on ait un diagnostic d'erreurs. »
 *
 * LE DIAGNOSTIC EST FAIT (voir `GardeFou`), ET IL DIRA. En l'attendant, une
 * relecture du chemin des meubles a trouvé un trou qui explique très bien ce
 * genre d'arrêt — sans que ce soit une preuve, et il faut le dire ainsi.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │  `if (width <= 0 || depth <= 0) return;`                              │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * La garde paraît complète, et elle laisse passer LE pire des nombres :
 * `NaN <= 0` vaut FAUX. Un NaN traverse donc les deux conditions et s'écrit
 * dans le meuble.
 *
 * ET UN NaN NE RESTE PAS OÙ IL EST NÉ. La largeur nourrit le dessin 2D, le
 * volume 3D, le métré, le PDF ; il devient des coordonnées `NaN,NaN` dans un
 * tracé SVG, et un tracé illisible fait tomber la couche native — c'est-à-dire
 * l'application, sans un mot, exactement comme décrit.
 *
 * D'où peut-il venir ? Du glissement : la poignée calcule le centre avec
 * `t0[12] + dx` ; si la matrice d'un meuble n'a pas la longueur attendue —
 * un scan bancal, un vieux plan relu —, `t0[12]` vaut `undefined`, et
 * `undefined + dx` vaut NaN. Personne ne s'en aperçoit avant le dessin.
 *
 * LA GARDE VIT AU MAGASIN, comme celle des liens : une cote impossible ne doit
 * entrer par AUCUN chemin. La corriger dans la poignée laisserait le prochain
 * appelant refaire le même trou.
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
import type { ObjectData } from 'react-native-room-scan';

const meuble = (id: string): ObjectData => ({
  id,
  category: 'sofa',
  width: 2,
  depth: 0.9,
  height: 0.8,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1.5, 0.4, 2, 1],
});

const poser = () => {
  useScanStore.getState().reset();
  useScanStore.setState({
    walls: [],
    openings: [],
    objects: [meuble('m1')],
    rooms: [] as never,
    fixtures: [],
    photos: [],
  });
};

const lu = () => useScanStore.getState().objects[0];
const st = () => useScanStore.getState();

beforeEach(poser);

/** Toutes les façons dont un nombre peut ne pas en être un. */
const IMPOSSIBLES = [NaN, Infinity, -Infinity];

describe('la taille d’un meuble', () => {
  it('un nombre juste passe', () => {
    st().resizeObject('m1', 1.4, 0.6);
    expect(lu().width).toBeCloseTo(1.4);
    expect(lu().depth).toBeCloseTo(0.6);
  });

  it('mais NaN ne passe pas — et c’est lui qui passait', () => {
    /*
      `NaN <= 0` vaut FAUX : la garde d'origine le laissait entrer par les
      deux portes à la fois. C'est le défaut le plus discret de sa famille —
      la condition a l'air complète.
    */
    for (const x of IMPOSSIBLES) {
      st().resizeObject('m1', x, 0.6);
      expect(`largeur ${x} : ${lu().width}`).toBe(`largeur ${x} : 2`);
      st().resizeObject('m1', 1.4, x);
      expect(`profondeur ${x} : ${lu().depth}`).toBe(`profondeur ${x} : 0.9`);
    }
  });

  it('et une cote nulle ou négative reste refusée', () => {
    // Le contrôle de l'acquis : la garde d'origine faisait déjà ça très bien,
    // et la resserrer ne doit pas l'avoir cassé.
    for (const x of [0, -1]) {
      st().resizeObject('m1', x, 0.6);
      st().resizeObject('m1', 1.4, x);
    }
    expect(lu().width).toBe(2);
    expect(lu().depth).toBe(0.9);
  });
});

describe('la place d’un meuble', () => {
  const centre = () => [lu().transform[12], lu().transform[14]];

  it('un déplacement juste passe', () => {
    st().setObjectCenter('m1', 2.5, 3);
    expect(centre()).toEqual([2.5, 3]);
  });

  it('mais un centre impossible ne s’écrit pas', () => {
    /*
      IL N'Y AVAIT AUCUNE GARDE ICI, et c'est le chemin du GLISSEMENT — celui
      qu'on emprunte en traînant un meuble du doigt, c'est-à-dire exactement
      le geste décrit dans le relevé.
    */
    for (const x of IMPOSSIBLES) {
      st().setObjectCenter('m1', x, 3);
      expect(`x ${x} : ${centre()[0]}`).toBe(`x ${x} : 1.5`);
      st().setObjectCenter('m1', 2.5, x);
      expect(`z ${x} : ${centre()[1]}`).toBe(`z ${x} : 2`);
    }
  });

  it('et un meuble refusé n’a même pas bougé l’historique', () => {
    /*
      LE DÉTAIL QUI SE PAIE PLUS TARD. Un geste refusé qui empile quand même
      un point d'annulation oblige à appuyer deux fois sur « Annuler » pour
      défaire une seule chose — et l'on croit que l'annulation est cassée.
    */
    st().setObjectCenter('m1', 2.5, 3);
    const avant = st().canUndo;
    st().setObjectCenter('m1', NaN, NaN);
    st().undo();
    expect(centre()).toEqual([1.5, 2]);
    expect(avant).toBe(true);
  });
});

describe('la hauteur d’un meuble', () => {
  it('refusait déjà l’impossible, et refuse toujours', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE DE TOUTE CETTE PASSE. Ici la garde est
      écrite à l'endroit — `!(height > 0.05 && height <= 4)` — et une
      comparaison FAUSSE sur NaN suffit à le rejeter. C'est la même règle
      écrite dans l'autre sens, et elle, elle tenait.

      Ce n'est donc pas « les gardes sont mauvaises » : c'est qu'une garde
      qui cherche ce qu'elle REFUSE laisse toujours passer NaN, alors qu'une
      garde qui exige ce qu'elle ACCEPTE ne peut pas se tromper.
    */
    for (const x of [...IMPOSSIBLES, 0, -1, 9]) {
      st().setObjectHeight('m1', x);
      expect(`hauteur ${x} : ${lu().height}`).toBe(`hauteur ${x} : 0.8`);
    }
    st().setObjectHeight('m1', 1.2);
    expect(lu().height).toBeCloseTo(1.2);
  });
});

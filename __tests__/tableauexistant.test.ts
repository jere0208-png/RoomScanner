/**
 * LE TABLEAU EXISTANT DANS LE DOSSIER.
 *
 * Un releve de renovation porte deux installations : celle qu'on trouve, et
 * celle qu'on va poser. La premiere ne se dessine pas sur le plan — c'est
 * une liste de departs, avec ce qu'ils protegent — mais elle voyage avec le
 * scan, se sauvegarde avec lui et s'imprime dans le dossier.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { type WallSeg } from '../src/geometry/floorplan';
import { useAccountStore } from '../src/store/accountStore';
import { useScanStore } from '../src/store/scanStore';

/** Un carre de quatre murs : sans plan, une sauvegarde ne part pas. */
const PIECE: WallSeg[] = [
  ['n', 0, 0, 4, 0],
  ['e', 4, 0, 4, 3],
  ['s', 4, 3, 0, 3],
  ['w', 0, 3, 0, 0],
].map(([id, ax, az, bx, bz]) => ({
  id: String(id),
  type: 'wall' as const,
  a: { x: Number(ax), z: Number(az) },
  b: { x: Number(bx), z: Number(bz) },
  height: 2.5,
  yCenter: 1.25,
}));

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());
/*
  LE PALIER GRATUIT N'EST PAS LE SUJET DE CE BANC.

  Depuis qu'une COPIE compte pour un plan (voir `unseulplan`), `saveAsCopy`
  refuse quand le palier est épuisé — et le magasin du compte survit d'une
  épreuve à l'autre. La deuxième sauvegarde d'un banc tombait donc dans le
  vide, sans qu'aucune épreuve ne parle d'abonnement.

  On travaille donc ici sur un compte qui a le droit d'enregistrer, et l'on
  dit pourquoi : le verrou est éprouvé là où il est le sujet.
*/
const compteQuiPeutEnregistrer = () =>
  useAccountStore.setState({ pro: true, plansUtilises: 0, bonusEssais: 0 });

beforeEach(() => {
  compteQuiPeutEnregistrer();
  jest.advanceTimersByTime(2000);
  useScanStore.setState({
    walls: PIECE,
    rooms: [{ id: 'r1', name: 'Sejour', wallIds: PIECE.map((w) => w.id) }],
    openings: [],
    objects: [],
    fixtures: [],
    ceiling: [],
    photos: [],
    saves: [],
    currentSaveId: null,
    existant: null,
    scanName: 'Renovation Dupont',
  });
});

describe('relever le tableau existant', () => {
  it('n existe pas tant qu on n a rien releve', () => {
    // Un chantier neuf ne doit pas porter un tableau vide : la feuille
    // « existant » ne s'imprime que si l'on a ouvert un tableau.
    expect(useScanStore.getState().existant).toBeNull();
  });

  it('se cree au premier depart ajoute', () => {
    const id = useScanStore.getState().ajouterDepart({
      organe: 'differentiel',
      calibre: 40,
      sensibilite: 30,
      typeDiff: 'A',
    });
    const ex = useScanStore.getState().existant!;
    expect(ex.departs).toHaveLength(1);
    expect(ex.departs[0].id).toBe(id);
    expect(useScanStore.getState().dirty).toBe(true);
  });

  it('se modifie et se retire', () => {
    const id = useScanStore.getState().ajouterDepart({
      organe: 'disjoncteur',
      calibre: 16,
      usage: 'Eclairage',
    });
    useScanStore.getState().modifierDepart(id, { calibre: 20 });
    expect(useScanStore.getState().existant!.departs[0].calibre).toBe(20);
    useScanStore.getState().retirerDepart(id);
    expect(useScanStore.getState().existant!.departs).toHaveLength(0);
  });

  it('retient la taille du tableau, pour juger la reserve', () => {
    useScanStore.getState().decrireTableau({ rangees: 2, parRangee: 13 });
    expect(useScanStore.getState().existant!.rangees).toBe(2);
    expect(useScanStore.getState().existant!.parRangee).toBe(13);
  });

  it('voyage avec la sauvegarde, et revient a l ouverture', () => {
    useScanStore.getState().ajouterDepart({
      organe: 'fusible',
      calibre: 10,
      usage: 'Eclairage',
    });
    useScanStore.getState().saveAsCopy('Renovation');
    const save = useScanStore.getState().saves[0];
    expect(save.existant?.departs).toHaveLength(1);
    useScanStore.getState().reset();
    expect(useScanStore.getState().existant).toBeNull();
    useScanStore.getState().openSave(save.id);
    expect(useScanStore.getState().existant?.departs[0].organe).toBe('fusible');
  });

  it('un scan d avant la renovation s ouvre sans tableau invente', () => {
    useScanStore.getState().ajouterDepart({ organe: 'disjoncteur', calibre: 16 });
    useScanStore.getState().saveAsCopy('Avec tableau');
    const save = useScanStore.getState().saves[0];
    const ancien = { ...save, id: 'vieux', existant: undefined };
    useScanStore.setState({ saves: [ancien] });
    useScanStore.getState().openSave('vieux');
    expect(useScanStore.getState().existant).toBeNull();
  });
});

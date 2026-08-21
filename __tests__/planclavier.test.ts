/**
 * LE PLAN SANS SCANNER — la porte qui manquait.
 *
 * Trois besoins, une seule reponse.
 *
 * LES APPAREILS SANS LiDAR d abord. Un iPhone non Pro, un iPad d entree de
 * gamme, un Android : l accueil annoncait « appareil non compatible » et
 * l application s arretait la. Or les neuf dixiemes de sa valeur — les
 * normes, les circuits, le metre, le tableau existant, le dossier PDF — ne
 * demandent aucun capteur. On fermait la porte a la moitie du marche pour
 * une fonction que cette moitie n allait pas utiliser.
 *
 * LES PETITES INTERVENTIONS ensuite : pour ajouter deux prises dans une
 * cuisine, on ne releve pas l appartement. On trace la piece, on pose, on
 * chiffre — trois minutes, devant le client.
 *
 * LES ARCHITECTES enfin, qui esquissent au metre avant d avoir mis un pied
 * sur le chantier.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { useScanStore } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

describe('commencer un plan au clavier', () => {
  it('ouvre un plan vierge, sur l ecran du plan', () => {
    useScanStore.setState({ screen: 'home' });
    useScanStore.getState().commencerAuClavier();
    const st = useScanStore.getState();
    expect(st.screen).toBe('result');
    expect(st.walls).toEqual([]);
    expect(st.rooms).toEqual([]);
    // Un nom des le depart : sans lui, la barre du haut est vide et le
    // dossier s appellerait « Scan vide » a l enregistrement.
    expect(st.scanName).toMatch(/Plan du/);
  });

  it('n herite de rien du dossier precedent', () => {
    // Le piege : ouvrir un plan neuf en gardant les murs, le nom ou
    // l identifiant du scan ouvert juste avant — et ecraser ce dossier au
    // premier enregistrement.
    useScanStore.setState({
      currentSaveId: 'ancien',
      scanName: 'Chantier Dupont',
      fixtures: [
        { id: 'f1', kind: 'prise', wallId: 'w1', along: 1, height: 0.3, side: 1 },
      ],
      dirty: true,
    });
    useScanStore.getState().commencerAuClavier();
    const st = useScanStore.getState();
    expect(st.currentSaveId).toBeNull();
    expect(st.fixtures).toEqual([]);
    expect(st.scanName).not.toBe('Chantier Dupont');
    expect(st.dirty).toBe(false);
  });

  it('la piece tracee a la main vaut celle d un scan', () => {
    // Le magasin savait deja batir de proche en proche : c est le meme
    // chemin que l ajout d une piece sur un plan scanne, donc le meme
    // metre, les memes normes, le meme dossier.
    useScanStore.getState().commencerAuClavier();
    const id = useScanStore.getState().addRoomBox(4, 3, 'Cuisine');
    const st = useScanStore.getState();
    expect(st.rooms.find((r) => r.id === id)?.name).toBe('Cuisine');
    expect(st.walls).toHaveLength(4);
    // Et il devient enregistrable : c est ce que refusait un plan sans mur.
    st.saveAsCopy('Intervention Dupont');
    expect(useScanStore.getState().saves[0].name).toBe('Intervention Dupont');
  });
});

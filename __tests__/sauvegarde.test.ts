/**
 * UNE SAUVEGARDE PERDUE SE DIT.
 *
 * C'est le seul défaut de cette application qui pouvait coûter une visite
 * entière : le stockage d'un téléphone se remplit, un relevé chargé en photos
 * peut ne pas s'écrire, et l'échec était avalé par trois `catch` vides.
 * L'électricien repartait du chantier en croyant son dossier enregistré.
 */
const echecs: string[] = [];
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async (cle: string) => {
    if (echecs.includes('tout') || echecs.includes(cle)) {
      throw new Error('espace insuffisant');
    }
  }),
  removeItem: jest.fn(async () => undefined),
}));

import { useAccountStore } from '../src/store/accountStore';
import { useScanStore } from '../src/store/scanStore';
import { SNAPSHOT_WALLS } from '../src/export/snapshotFixture';

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

describe('l’écriture sur le disque', () => {
  beforeEach(() => {
    compteQuiPeutEnregistrer();
    echecs.length = 0;
    useScanStore.setState({
      walls: SNAPSHOT_WALLS,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Salon', floor: null }],
      fixtures: [],
      ceiling: [],
      photos: [],
      saves: [],
      panne: null,
      scanName: 'Chantier',
    });
  });

  it('reste muette quand tout se passe bien', async () => {
    useScanStore.getState().saveAsCopy('Chantier');
    await Promise.resolve();
    jest.advanceTimersByTime(1200);
    await Promise.resolve();
    expect(useScanStore.getState().panne).toBeNull();
  });

  it('prévient quand le disque refuse, en nommant le scan', async () => {
    echecs.push('tout');
    useScanStore.getState().saveAsCopy('Chantier');
    await Promise.resolve();
    jest.advanceTimersByTime(1200);
    // Les promesses rejetées se règlent au tour suivant de la boucle.
    for (let i = 0; i < 6; i++) await Promise.resolve();
    const p = useScanStore.getState().panne;
    expect(p).not.toBeNull();
    expect(p!.message).toContain('Chantier');
  });

  it('ne prévient qu’une fois : on sauve, on ne harcèle pas', async () => {
    echecs.push('tout');
    useScanStore.getState().saveAsCopy('Chantier');
    await Promise.resolve();
    jest.advanceTimersByTime(1200);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    const premier = useScanStore.getState().panne;
    useScanStore.getState().saveAsCopy('Chantier');
    jest.advanceTimersByTime(1200);
    await Promise.resolve();
    await Promise.resolve();
    // Le même incident, pas une seconde alerte.
    expect(useScanStore.getState().panne).toBe(premier);
    // Et l'électricien peut la refermer.
    useScanStore.getState().oublierPanne();
    expect(useScanStore.getState().panne).toBeNull();
  });
});

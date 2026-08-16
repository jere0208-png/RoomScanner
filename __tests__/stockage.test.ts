/**
 * La bibliothèque ne se réécrit plus en entier à chaque sauvegarde.
 *
 * Tout tenait dans une clé unique : renommer un scan sérialisait et écrivait
 * TOUS les autres avec lui. Sur un téléphone d'électricien — trente relevés,
 * photos comprises — ça fait plusieurs mégaoctets écrits pour un mot changé,
 * six cents millisecondes après chaque geste. Et une écriture interrompue
 * emportait la bibliothèque, pas un scan.
 *
 * Ce que le test garantit : une clé par scan, un index qui donne l'ordre, on
 * n'écrit que ce qui a changé, on efface ce qui disparaît — et les scans de
 * l'ancien format sont repris sans perte.
 */
const mockStore = new Map<string, string>();
const mockSetItem = jest.fn(async (k: string, v: string) => {
  mockStore.set(k, v);
});
const mockRemoveItem = jest.fn(async (k: string) => {
  mockStore.delete(k);
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: (k: string, v: string) => mockSetItem(k, v),
  removeItem: (k: string) => mockRemoveItem(k),
}));

import {
  resetPersistCache,
  useScanStore,
  type SavedScan,
} from '../src/store/scanStore';

const INDEX = 'roomscanner.index.v2';
const LEGACY = 'roomscanner.saves.v1';
const cle = (id: string) => `roomscanner.scan.v2.${id}`;

const scan = (id: string, name: string): SavedScan => ({
  id,
  name,
  createdAt: 1,
  updatedAt: 1,
  modelPath: null,
  walls: [],
  openings: [],
  objects: [],
  rooms: [{ id: 'room-1', name: '', floor: null }],
});

/** Fait courir les 600 ms d'attente avant écriture. */
const vider = () => jest.advanceTimersByTime(1000);

beforeEach(() => {
  jest.useFakeTimers();
  mockStore.clear();
  mockSetItem.mockClear();
  mockRemoveItem.mockClear();
  resetPersistCache();
  useScanStore.setState({ saves: [], folders: [], currentSaveId: null });
});
afterEach(() => jest.useRealTimers());

describe('une clé par scan', () => {
  it('écrit chaque scan à part, et un index pour l’ordre', () => {
    useScanStore.setState({ saves: [scan('a', 'Séjour'), scan('b', 'Cuisine')] });
    useScanStore.getState().moveToFolder('a', 'chantier');
    vider();

    expect(mockStore.has(cle('a'))).toBe(true);
    expect(mockStore.has(cle('b'))).toBe(true);
    expect(JSON.parse(mockStore.get(INDEX)!)).toEqual(['a', 'b']);
    // Et surtout : plus rien dans l'ancienne clé fourre-tout.
    expect(mockStore.has(LEGACY)).toBe(false);
  });

  it('ne réécrit QUE le scan modifié', () => {
    useScanStore.setState({ saves: [scan('a', 'Séjour'), scan('b', 'Cuisine')] });
    useScanStore.getState().moveToFolder('a', 'chantier');
    vider();
    mockSetItem.mockClear();

    useScanStore.getState().moveToFolder('b', 'chantier');
    vider();

    const ecrits = mockSetItem.mock.calls.map((c) => c[0]);
    expect(ecrits).toContain(cle('b'));
    expect(ecrits).not.toContain(cle('a'));
  });

  it('efface la clé d’un scan supprimé', () => {
    useScanStore.setState({ saves: [scan('a', 'Séjour'), scan('b', 'Cuisine')] });
    useScanStore.getState().moveToFolder('a', 'chantier');
    vider();

    useScanStore.getState().deleteSave('a');
    vider();

    expect(mockStore.has(cle('a'))).toBe(false);
    expect(mockStore.has(cle('b'))).toBe(true);
    expect(JSON.parse(mockStore.get(INDEX)!)).toEqual(['b']);
  });
});

describe('les scans de l’ancien format', () => {
  it('sont repris, éclatés, et l’ancienne clé est retirée', async () => {
    mockStore.set(LEGACY, JSON.stringify([scan('vieux', 'Chantier Dupont')]));
    await useScanStore.getState().loadSaves();

    const saves = useScanStore.getState().saves;
    expect(saves).toHaveLength(1);
    expect(saves[0].name).toBe('Chantier Dupont');
    expect(mockStore.has(cle('vieux'))).toBe(true);
    expect(JSON.parse(mockStore.get(INDEX)!)).toEqual(['vieux']);
    expect(mockStore.has(LEGACY)).toBe(false);
  });

  it('la reprise n’efface l’ancienne clé qu’une fois tout réécrit', async () => {
    mockStore.set(LEGACY, JSON.stringify([scan('v1', 'A'), scan('v2', 'B')]));
    const ordre: string[] = [];
    mockSetItem.mockImplementation(async (k: string, v: string) => {
      ordre.push(`w:${k}`);
      mockStore.set(k, v);
    });
    mockRemoveItem.mockImplementation(async (k: string) => {
      ordre.push(`r:${k}`);
      mockStore.delete(k);
    });
    await useScanStore.getState().loadSaves();

    expect(ordre.indexOf(`r:${LEGACY}`)).toBeGreaterThan(ordre.indexOf(`w:${cle('v2')}`));
    expect(ordre.indexOf(`r:${LEGACY}`)).toBeGreaterThan(ordre.indexOf(`w:${INDEX}`));
  });

  it('un scan illisible ne fait pas perdre les autres', async () => {
    mockStore.set(INDEX, JSON.stringify(['bon', 'casse']));
    mockStore.set(cle('bon'), JSON.stringify(scan('bon', 'Lisible')));
    mockStore.set(cle('casse'), '{ ceci n’est pas du JSON');
    await useScanStore.getState().loadSaves();

    const saves = useScanStore.getState().saves;
    expect(saves).toHaveLength(1);
    expect(saves[0].name).toBe('Lisible');
  });
});

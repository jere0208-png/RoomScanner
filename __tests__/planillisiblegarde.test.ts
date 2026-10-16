/**
 * UN PLAN ILLISIBLE NE COÛTE PAS LES AUTRES — NI AU CHARGEMENT, NI APRÈS.
 *
 * Le défaut : un seul plan qui faisait lever la migration (`migrateSave`)
 * faisait tomber TOUT le chargement. La bibliothèque restait vide, alors que
 * le cache des écritures connaissait déjà chaque plan — et le premier
 * enregistrement effaçait du disque les clés de tous les autres.
 *
 * Ce que le banc tient : un plan qui ne se migre pas parmi trois → deux
 * chargés ; après un enregistrement, AUCUNE clé de plan n'est supprimée, et
 * l'index continue de lister le plan gardé.
 */
const mockMagasin = new Map<string, string>();
const mockRemove = jest.fn(async (k: string) => {
  mockMagasin.delete(k);
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: (k: string) => mockRemove(k),
  getAllKeys: jest.fn(async () => [...mockMagasin.keys()]),
}));

import { resetPersistCache, useScanStore, type SavedScan } from '../src/store/scanStore';

const INDEX = 'roomscanner.index.v2';
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

const ranger = (...scans: unknown[]) => {
  for (const s of scans) {
    const id = (s as { id: string }).id;
    mockMagasin.set(cle(id), JSON.stringify(s));
  }
  mockMagasin.set(INDEX, JSON.stringify(scans.map((s) => (s as { id: string }).id)));
};

const attendre = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  mockMagasin.clear();
  mockRemove.mockClear();
  resetPersistCache();
  useScanStore.setState({ saves: [], folders: [], brouillon: null, savesCharges: false });
});

it('un plan que la migration ne sait pas lire : les deux autres se chargent, aucune clé ne part', async () => {
  // Un mur « null » fait lever la migration (les éclats, les niveaux…).
  const pourri = { ...scan('b', 'Maison B'), walls: [null] };
  ranger(scan('a', 'Maison A'), pourri, scan('c', 'Maison C'));
  await useScanStore.getState().loadSaves();
  expect(useScanStore.getState().saves.map((s) => s.name)).toEqual(['Maison A', 'Maison C']);

  jest.useFakeTimers();
  try {
    useScanStore.getState().renameSave('a', 'Maison A bis');
    jest.advanceTimersByTime(1000);
  } finally {
    jest.useRealTimers();
  }
  await attendre();

  expect(mockRemove).not.toHaveBeenCalled();
  for (const id of ['a', 'b', 'c']) expect(mockMagasin.has(cle(id))).toBe(true);
  // Le plan gardé reste listé : une version qui saura le lire le rendra.
  expect(JSON.parse(mockMagasin.get(INDEX)!)).toEqual(['a', 'c', 'b']);
  expect(JSON.parse(mockMagasin.get(cle('a'))!).name).toBe('Maison A bis');
});

it('un contenu qui n’est pas un plan (mauvais identifiant, listes cassées) est gardé, pas chargé', async () => {
  ranger(scan('a', 'Maison A'), { ...scan('b', 'B'), openings: 'rien' }, scan('c', 'Maison C'));
  mockMagasin.set(cle('d'), JSON.stringify(scan('autre', 'Intrus')));
  mockMagasin.set(INDEX, JSON.stringify(['a', 'b', 'c', 'd']));
  await useScanStore.getState().loadSaves();
  expect(useScanStore.getState().saves.map((s) => s.id)).toEqual(['a', 'c']);
});

it('tant que la bibliothèque n’est pas chargée, rien ne s’efface et l’index ne rétrécit pas', async () => {
  ranger(scan('a', 'Maison A'), scan('b', 'Maison B'));
  // Un chargement qui échoue de bout en bout : le stockage refuse l'index.
  const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage');
  AsyncStorage.getItem.mockImplementationOnce(async () => {
    throw new Error('stockage indisponible');
  });
  await useScanStore.getState().loadSaves();
  expect(useScanStore.getState().saves).toEqual([]);

  jest.useFakeTimers();
  try {
    useScanStore.setState({ saves: [scan('n', 'Nouveau')] });
    useScanStore.getState().renameSave('n', 'Nouveau relevé');
    jest.advanceTimersByTime(1000);
  } finally {
    jest.useRealTimers();
  }
  await attendre();

  expect(mockRemove).not.toHaveBeenCalled();
  expect(mockMagasin.has(cle('a'))).toBe(true);
  expect(mockMagasin.has(cle('b'))).toBe(true);
  expect(JSON.parse(mockMagasin.get(INDEX)!)).toEqual(['n', 'a', 'b']);
});

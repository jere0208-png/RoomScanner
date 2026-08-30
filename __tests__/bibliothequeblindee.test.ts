/**
 * UNE CLÉ POURRIE NE COÛTE PAS LA BIBLIOTHÈQUE.
 *
 * Le chargement lisait tout dans UN SEUL try/catch : les dossiers de
 * rangement, puis l'index des scans, puis les scans, puis le brouillon. Une
 * seule clé corrompue — une écriture coupée par une extinction, un octet
 * abîmé — et tout ce qui venait APRÈS elle n'était jamais lu.
 *
 * LE PIRE CAS ÉTAIT RÉEL : les dossiers de rangement se lisent AVANT les
 * scans. Trois octets abîmés dans cette petite clé-là, et la bibliothèque
 * entière paraissait vide. L'utilisateur, croyant tout perdu, enregistrait
 * un nouveau relevé… et `persistSoon` réécrivait l'index avec CE seul scan :
 * les trente relevés, toujours sur le disque, n'étaient plus listés nulle
 * part. Une clé d'un kilooctet effaçait trente chantiers.
 *
 * Chaque clé se lit donc dans SA garde, et l'index sait se REBÂTIR : les
 * scans portent chacun leur clé (`roomscanner.scan.v2.<id>`) — un index
 * illisible se reconstruit en les énumérant, au lieu de les abandonner.
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
  getAllKeys: jest.fn(async () => [...mockMagasin.keys()]),
}));

import {
  resetPersistCache,
  useScanStore,
  type SavedScan,
} from '../src/store/scanStore';

const INDEX = 'roomscanner.index.v2';
const FOLDERS = 'roomscanner.folders.v1';
const DRAFT = 'roomscanner.brouillon.v1';
const cle = (id: string) => `roomscanner.scan.v2.${id}`;

const scan = (id: string, name: string, updatedAt = 1): SavedScan => ({
  id,
  name,
  createdAt: 1,
  updatedAt,
  modelPath: null,
  walls: [],
  openings: [],
  objects: [],
  rooms: [{ id: 'room-1', name: '', floor: null }],
});

const ranger = (...scans: SavedScan[]) => {
  for (const s of scans) mockMagasin.set(cle(s.id), JSON.stringify(s));
  mockMagasin.set(INDEX, JSON.stringify(scans.map((s) => s.id)));
};

beforeEach(() => {
  mockMagasin.clear();
  resetPersistCache();
  useScanStore.setState({
    saves: [],
    folders: [],
    brouillon: null,
    savesCharges: false,
  });
});

it('des dossiers de rangement corrompus ne cachent pas les scans', async () => {
  ranger(scan('a', 'Maison A'), scan('b', 'Maison B'));
  mockMagasin.set(FOLDERS, '{coupé net par une extinct');
  await useScanStore.getState().loadSaves();
  const st = useScanStore.getState();
  expect(st.saves.map((s) => s.name)).toEqual(['Maison A', 'Maison B']);
  expect(st.folders).toEqual([]);
  expect(st.savesCharges).toBe(true);
});

it('un index corrompu se rebâtit depuis les scans eux-mêmes', async () => {
  ranger(scan('a', 'Maison A', 10), scan('b', 'Maison B', 30));
  mockMagasin.set(INDEX, '["a",');
  await useScanStore.getState().loadSaves();
  const noms = useScanStore.getState().saves.map((s) => s.name);
  // L'ordre exact de l'index est perdu ; les scans, non. Les plus récents
  // remontent en tête, comme partout dans la bibliothèque.
  expect(noms).toEqual(['Maison B', 'Maison A']);
  // Et l'index est réécrit : le prochain démarrage lit le chemin normal.
  expect(JSON.parse(mockMagasin.get(INDEX)!)).toEqual(['b', 'a']);
});

it('un brouillon corrompu ne fait pas trébucher le démarrage — et s’efface', async () => {
  ranger(scan('a', 'Maison A'));
  mockMagasin.set(DRAFT, '\u0000garbage');
  await useScanStore.getState().loadSaves();
  expect(useScanStore.getState().saves).toHaveLength(1);
  // Sans l'effacement, il referait trébucher CHAQUE démarrage.
  expect(mockMagasin.has(DRAFT)).toBe(false);
});

it('et un scan pourri parmi les sains ne coûte que lui', async () => {
  ranger(scan('a', 'Maison A'), scan('b', 'Maison B'));
  mockMagasin.set(cle('a'), '{"id":"a","na');
  await useScanStore.getState().loadSaves();
  expect(useScanStore.getState().saves.map((s) => s.name)).toEqual(['Maison B']);
});

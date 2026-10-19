/**
 * AUCUN PLAN, AUCUNE RETOUCHE NE SE PERD — défauts trouvés par l'agent
 * « données » (chasse aux défauts du 19/10), devenus des garde-fous :
 * photo effacée alors qu'« Annuler » la rend, photo d'une retouche partie
 * avec une copie, nom perdu sous une retouche, brouillon effacé avant
 * l'écriture du plan, « Abandonner » qui oubliait notes et cotes, migration
 * de l'ancien format coupée, historique d'un autre plan après une reprise.
 */
const mockDisque = new Map<string, string>();
const mockJournal: string[] = [];
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => (mockDisque.has(k) ? mockDisque.get(k)! : null)),
  setItem: jest.fn(async (k: string, v: string) => {
    mockJournal.push(`set ${k}`);
    mockDisque.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockJournal.push(`remove ${k}`);
    mockDisque.delete(k);
  }),
}));

import { NativeModules } from 'react-native';
import { type WallSeg } from '../src/geometry/floorplan';
import { useAccountStore } from '../src/store/accountStore';
import { useScanStore, resetPersistCache } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25, roomId: 'r1',
});
const PIECE: WallSeg[] = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('w', 0, 3, 0, 0)];
const neuf = () =>
  useScanStore.setState({
    walls: PIECE,
    rooms: [{ id: 'r1', name: 'Séjour', wallIds: PIECE.map((w) => w.id) }],
    objects: [], openings: [], fixtures: [], photos: [], saves: [], currentSaveId: null, scanName: 'Essai',
  });
const espion = () => {
  const efface: string[] = [];
  (NativeModules as Record<string, unknown>).RoomScanPhoto = {
    deletePhotos: (p: string[]) => { efface.push(...p); return Promise.resolve(p.length); },
  };
  return efface;
};

beforeEach(() => {
  jest.advanceTimersByTime(3000);
  resetPersistCache();
  mockDisque.clear();
  mockJournal.length = 0;
  useAccountStore.setState({ pro: false, plansUtilises: 0, bonusEssais: 0 });
});
afterEach(() => {
  delete (NativeModules as Record<string, unknown>).RoomScanPhoto;
});

describe('une photo retirée attend qu’on ne puisse plus l’annuler', () => {
  it('supprimer le mur puis Annuler : la punaise revient avec son fichier', () => {
    const efface = espion();
    neuf();
    useScanStore.getState().addPhoto('n', 2, '/Documents/photos/p1.jpg');
    jest.advanceTimersByTime(2000);
    useScanStore.getState().removeWall('n');
    useScanStore.getState().undo();
    const ph = useScanStore.getState().photos;
    expect(ph.map((p) => p.path)).toContain('/Documents/photos/p1.jpg');
    expect(efface).not.toContain('/Documents/photos/p1.jpg');
    // Supprimé pour de bon, puis l'historique vidé (un nouveau plan) : le fichier part.
    useScanStore.getState().removeWall('n');
    useScanStore.getState().reset();
    expect(efface).toContain('/Documents/photos/p1.jpg');
  });
});

describe('supprimer un plan garde les photos des retouches', () => {
  it('la photo d’une retouche survit à la copie supprimée', () => {
    const efface = espion();
    neuf();
    useScanStore.getState().commitCurrent();
    const a = useScanStore.getState().currentSaveId!;
    jest.advanceTimersByTime(3000);
    useScanStore.getState().addPhoto('n', 1, '/Documents/photos/chantier.jpg');
    expect(useScanStore.getState().mettreDeCote()).toBe('retouche');
    useScanStore.getState().openSave(a);
    useScanStore.getState().saveAsCopy('Version B');
    const b = useScanStore.getState().currentSaveId!;
    expect(b).not.toBe(a);
    useScanStore.getState().deleteSave(b);
    expect(efface).not.toContain('/Documents/photos/chantier.jpg');
  });
});

describe('renommer un plan qui a une retouche', () => {
  it('le nouveau nom survit à l’enregistrement de la retouche', () => {
    neuf();
    useScanStore.getState().commitCurrent();
    const id = useScanStore.getState().currentSaveId!;
    jest.advanceTimersByTime(3000);
    useScanStore.getState().addPhoto('e', 1, '/x.jpg');
    expect(useScanStore.getState().mettreDeCote()).toBe('retouche');
    useScanStore.getState().renameSave(id, 'Chantier Dupont');
    expect(useScanStore.getState().saves.find((s) => s.id === id)!.name).toBe('Chantier Dupont');
    useScanStore.getState().enregistrerRetouche(id);
    const nom = useScanStore.getState().saves.find((s) => s.id === id)!.name;
    expect(nom).toBe('Chantier Dupont');
  });
});

describe('fin de scan : le brouillon part après l’écriture du plan', () => {
  it('ordre des écritures', async () => {
    mockDisque.set('roomscanner.brouillon.v1', JSON.stringify({ walls: PIECE }));
    const surface = (id: string, cx: number, cz: number, length: number, alongZ = false) => ({
      id, type: 'wall', length, height: 2.4,
      transform: alongZ
        ? [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, cx, 1.2, cz, 1]
        : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 1.2, cz, 1],
    });
    useScanStore.getState().finalize({
      modelPath: '',
      surfaces: [surface('n', 2, 0, 4), surface('s', 2, 3, 4), surface('o', 0, 1.5, 3, true), surface('e', 4, 1.5, 3, true)],
      objects: [],
    } as never);
    // Avant l'écriture du plan, le brouillon est toujours là.
    expect(mockJournal).not.toContain('remove roomscanner.brouillon.v1');
    jest.advanceTimersByTime(700);
    for (let k = 0; k < 20; k++) await Promise.resolve();
    const iBrouillon = mockJournal.indexOf('remove roomscanner.brouillon.v1');
    const iPlan = mockJournal.findIndex((l) => l.startsWith('set roomscanner.scan.v2.'));
    expect(iPlan).toBeGreaterThan(-1);
    expect(iBrouillon).toBeGreaterThan(iPlan);
  });
});

describe('« Abandonner les modifications »', () => {
  it('« Abandonner les modifications » rend les notes et les cotes, et l’enregistrement suivant les garde', () => {
    resetPersistCache();
    useScanStore.setState({
      walls: PIECE, rooms: [{ id: 'r1', name: 'Séjour', wallIds: PIECE.map((w) => w.id) }],
      objects: [], openings: [], fixtures: [], photos: [], notes: [], mesures: [],
      saves: [], currentSaveId: null, scanName: 'Client Martin',
    });
    useScanStore.getState().addNote('Tableau à remplacer', { x: 1, z: 1 });
    useScanStore.getState().addMesure({ x: 0, z: 0 }, { x: 2, z: 0 });
    useScanStore.getState().commitCurrent();
    const id = useScanStore.getState().currentSaveId!;
    jest.advanceTimersByTime(3000);
    // On rouvre, on efface la note et la cote par erreur…
    useScanStore.getState().openSave(id);
    const note = useScanStore.getState().notes[0].id;
    const cote = useScanStore.getState().mesures[0].id;
    useScanStore.getState().removeNote(note);
    useScanStore.getState().removeMesure(cote);
    // … et l'on choisit « Abandonner les modifications ».
    useScanStore.getState().revertCurrent();
    const st = useScanStore.getState();
    // Un autre geste, puis Enregistrer.
    useScanStore.getState().setNorth(90);
    useScanStore.getState().commitCurrent();
    const plan = useScanStore.getState().saves.find((s) => s.id === id)!;
    expect(st.notes).toHaveLength(1);
    expect(plan.notes).toHaveLength(1);
  });
});

describe('la migration de l’ancien format', () => {
  const ancien = (id: string, name: string) => ({
    id, name, createdAt: 1, updatedAt: 1, modelPath: null, rooms: [], walls: PIECE, openings: [], objects: [],
  });
  it('coupée par un disque plein : aucun plan ne disparaît, et l’ancienne clé est relue', async () => {
    const setItem = jest.requireMock('@react-native-async-storage/async-storage').setItem as jest.Mock;
    mockDisque.set('roomscanner.saves.v1', JSON.stringify([ancien('p1', 'Un'), ancien('p2', 'Deux')]));
    setItem.mockImplementationOnce(async (k: string, v: string) => { mockDisque.set(k, v); });
    setItem.mockImplementationOnce(async () => { throw new Error('disque plein'); });
    await useScanStore.getState().loadSaves();
    expect(useScanStore.getState().saves.map((s) => s.name).sort()).toEqual(['Deux', 'Un']);
    // L'ancienne clé reste tant que tout n'est pas écrit.
    expect(mockDisque.has('roomscanner.saves.v1')).toBe(true);
    // Lancement suivant, l'index existe : l'ancienne clé est relue quand même.
    resetPersistCache();
    useScanStore.setState({ saves: [] });
    await useScanStore.getState().loadSaves();
    expect(useScanStore.getState().saves.map((s) => s.name).sort()).toEqual(['Deux', 'Un']);
    expect(mockDisque.has('roomscanner.saves.v1')).toBe(false);
  });
});

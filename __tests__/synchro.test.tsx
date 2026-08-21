/**
 * LES DÉCLENCHEURS DE LA SYNCHRO — quand le plan monte, quand il redescend.
 *
 * Le coffre existait déjà (`coffreplans.test.ts` tient le dialogue avec le
 * serveur) et les deux gestes du store aussi — mais PERSONNE ne les
 * appelait. Un filet qu'on ne lance jamais ne rattrape rien : le patron
 * réinstallait l'application et retrouvait une bibliothèque vide, alors que
 * ses relevés étaient montés... jamais.
 *
 * Ce banc tient les deux moments qui font vivre la synchro :
 *
 *   — LA MONTÉE, à l'enregistrement. Le geste est déjà celui de
 *     l'électricien qui touche « Enregistrer » ; on y accroche le dépôt,
 *     en silence et sans jamais le faire attendre.
 *   — LA DESCENTE, une fois, au premier lancement d'une app qui n'a pas
 *     encore repris ses plans. C'est le lendemain d'une réinstallation.
 *
 * Et surtout ce que la synchro n'a PAS le droit de faire : bloquer un
 * enregistrement, monter deux fois le même plan, écraser une bibliothèque
 * locale qu'on n'a pas fini de lire.
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

/*
  LE COFFRE EN DOUBLET.

  Ce banc ne teste pas le dialogue HTTP — il est tenu ailleurs. Ce qu'on
  veut voir ici, c'est QUI appelle, QUAND, et avec quoi.
*/
jest.mock('../src/net/coffrePlans', () => ({
  deposerPlan: jest.fn(async () => true),
  catalogueDesPlans: jest.fn(async () => []),
  reprendrePlan: jest.fn(async () => null),
}));

/*
  Les écrans en façade : App ne se rend ici que pour vérifier son CÂBLAGE.
  Monter l'accueil et le plan entier pour observer un effet coûterait dix
  secondes par banc et casserait au premier bouton déplacé.
*/
jest.mock('../src/screens/HomeScreen', () => ({ HomeScreen: () => null }));
jest.mock('../src/screens/ScanScreen', () => ({ ScanScreen: () => null }));
jest.mock('../src/screens/ResultScreen', () => ({ ResultScreen: () => null }));
jest.mock('../src/screens/LibraryScreen', () => ({ LibraryScreen: () => null }));
jest.mock('../src/screens/ExportScreen', () => ({ ExportScreen: () => null }));
jest.mock('../src/screens/CameraScreen', () => ({ CameraScreen: () => null }));
jest.mock('../src/screens/SignInScreen', () => ({ SignInScreen: () => null }));
jest.mock('../src/screens/PaywallScreen', () => ({ PaywallScreen: () => null }));
jest.mock('../src/components/EssaiEpuise', () => ({ EssaiEpuise: () => null }));
jest.mock('../src/components/SurprisePro', () => ({ SurprisePro: () => null }));
jest.mock('../src/components/AvisRecompense', () => ({
  AvisRecompense: () => null,
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import App from '../App';
import { useScanStore, type SavedScan } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import {
  catalogueDesPlans,
  deposerPlan,
  reprendrePlan,
} from '../src/net/coffrePlans';
import type { WallSeg } from '../src/geometry/floorplan';

const depose = deposerPlan as jest.Mock;
const catalogue = catalogueDesPlans as jest.Mock;
const reprend = reprendrePlan as jest.Mock;

const mur = (id: string): WallSeg => ({
  id,
  type: 'wall',
  a: { x: 0, z: 0 },
  b: { x: 4, z: 0 },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const plan = (id: string, nom: string): SavedScan => ({
  id,
  name: nom,
  createdAt: 1700,
  updatedAt: 1700,
  modelPath: null,
  rooms: [],
  walls: [mur('m1')],
  openings: [],
  objects: [],
  fixtures: [],
  photos: [],
  ceiling: [],
});

/** Le compte connecté, jeton en poche : l'état d'un patron au travail. */
const poserCompte = () =>
  useAccountStore.setState({
    charge: true,
    compte: { id: 'compte-1', methode: 'email' },
    jeton: 'jeton-1',
  });

/** Ni compte ni jeton — hors ligne, ou pas encore inscrit. */
const sansCompte = () =>
  useAccountStore.setState({ charge: true, compte: null, jeton: null });

/** Laisse tourner les délais du store, puis les promesses qu'ils lancent. */
const laisserPasser = async (ms = 5000) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  mockMagasin.clear();
  depose.mockClear();
  depose.mockResolvedValue(true);
  catalogue.mockClear();
  catalogue.mockResolvedValue([]);
  reprend.mockClear();
  reprend.mockResolvedValue(null);
  sansCompte();
  useScanStore.setState({
    saves: [],
    currentSaveId: null,
    walls: [],
    dirty: false,
    savesCharges: false,
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('le plan enregistré monte au compte', () => {
  it("« Enregistrer » dépose le relevé, sans le faire attendre", async () => {
    poserCompte();
    useScanStore.setState({
      saves: [plan('p1', 'Chantier Dupont')],
      currentSaveId: 'p1',
      scanName: 'Chantier Dupont',
      walls: [mur('m1')],
      dirty: true,
    });

    useScanStore.getState().commitCurrent();
    // Le geste rend la main TOUT DE SUITE : l'électricien ne regarde pas
    // une roue tourner parce que le réseau du sous-sol est mauvais.
    expect(useScanStore.getState().dirty).toBe(false);

    await laisserPasser();
    expect(depose).toHaveBeenCalledTimes(1);
    const [qui, envoi] = depose.mock.calls[0];
    expect(qui).toEqual({ identifiant: 'compte-1', jeton: 'jeton-1' });
    expect(envoi.scan).toBe('p1');
    expect(envoi.nom).toBe('Chantier Dupont');
    // Le contenu est le relevé lui-même, en texte.
    expect(JSON.parse(envoi.contenu).walls).toHaveLength(1);
  });

  it('une copie enregistrée monte elle aussi', async () => {
    poserCompte();
    useScanStore.setState({
      saves: [plan('p1', 'Chantier Dupont')],
      currentSaveId: 'p1',
      scanName: 'Chantier Dupont',
      walls: [mur('m1')],
    });

    useScanStore.getState().saveAsCopy('Dupont étage');
    await laisserPasser();

    expect(depose).toHaveBeenCalledTimes(1);
    expect(depose.mock.calls[0][1].nom).toBe('Dupont étage');
  });

  it("sans compte, rien ne part — l'app marche pareil", async () => {
    sansCompte();
    useScanStore.setState({
      saves: [plan('p1', 'X')],
      currentSaveId: 'p1',
      scanName: 'X',
      walls: [mur('m1')],
      dirty: true,
    });

    useScanStore.getState().commitCurrent();
    await laisserPasser();

    expect(depose).not.toHaveBeenCalled();
    expect(useScanStore.getState().saves).toHaveLength(1);
  });

  it('trois retouches coup sur coup ne font qu’une montée', async () => {
    poserCompte();
    useScanStore.setState({
      saves: [plan('p1', 'X')],
      currentSaveId: 'p1',
      scanName: 'X',
      walls: [mur('m1')],
      dirty: true,
    });

    const st = useScanStore.getState();
    st.commitCurrent();
    st.commitCurrent();
    st.commitCurrent();
    await laisserPasser();

    // Un relevé qui monte trois fois de suite, c'est trois fois le forfait
    // de données du patron pour le même texte.
    expect(depose).toHaveBeenCalledTimes(1);
  });

  it('un serveur muet ne casse pas l’enregistrement', async () => {
    poserCompte();
    depose.mockRejectedValue(new Error('réseau'));
    useScanStore.setState({
      saves: [plan('p1', 'X')],
      currentSaveId: 'p1',
      scanName: 'X',
      walls: [mur('m1')],
      dirty: true,
    });

    useScanStore.getState().commitCurrent();
    await laisserPasser();

    // Le plan est enregistré ici, c'est tout ce qui compte : le coffre est
    // un filet, jamais une condition pour travailler.
    expect(useScanStore.getState().saves).toHaveLength(1);
    expect(useScanStore.getState().dirty).toBe(false);
  });
});

describe('la reprise après une réinstallation', () => {
  const auCompte = (id: string, nom: string) => {
    catalogue.mockResolvedValue([{ scan: id, nom, maj: 1700, taille: 900 }]);
    reprend.mockResolvedValue({
      nom,
      maj: 1700,
      contenu: JSON.stringify(plan(id, nom)),
    });
  };

  it('redescend les plans du compte, une fois', async () => {
    poserCompte();
    auCompte('p9', 'Chantier Martin');
    useScanStore.setState({ saves: [], savesCharges: true });

    const repris = await useScanStore.getState().repriseAuBesoin();
    expect(repris).toBe(1);
    expect(useScanStore.getState().saves.map((s) => s.id)).toContain('p9');

    // Le deuxième lancement ne redemande rien : le catalogue coûte une
    // requête, et l'électricien a pu SUPPRIMER un plan repris — le lui
    // reposer chaque matin serait le contraire d'un service.
    catalogue.mockClear();
    const encore = await useScanStore.getState().repriseAuBesoin();
    expect(encore).toBe(0);
    expect(catalogue).not.toHaveBeenCalled();
  });

  it('sans compte, elle ne se croit pas faite', async () => {
    sansCompte();
    useScanStore.setState({ saves: [], savesCharges: true });

    expect(await useScanStore.getState().repriseAuBesoin()).toBe(0);

    // Il se connecte ensuite : c'est MAINTENANT qu'il faut reprendre.
    poserCompte();
    auCompte('p9', 'Chantier Martin');
    expect(await useScanStore.getState().repriseAuBesoin()).toBe(1);
  });

  it("attend d'avoir lu la bibliothèque du téléphone", async () => {
    poserCompte();
    auCompte('p9', 'Chantier Martin');
    // Le stockage local n'est pas encore relu : reprendre maintenant
    // comparerait le compte à une bibliothèque VIDE et redescendrait des
    // plans déjà là, en double.
    useScanStore.setState({ saves: [], savesCharges: false });

    expect(await useScanStore.getState().repriseAuBesoin()).toBe(0);
    expect(catalogue).not.toHaveBeenCalled();

    useScanStore.setState({ savesCharges: true });
    expect(await useScanStore.getState().repriseAuBesoin()).toBe(1);
  });

  it('ne touche pas à un plan que le téléphone a déjà', async () => {
    poserCompte();
    auCompte('p1', 'Chantier Dupont');
    const local = { ...plan('p1', 'Nom retouché sur place'), updatedAt: 9999 };
    useScanStore.setState({ saves: [local], savesCharges: true });

    expect(await useScanStore.getState().repriseAuBesoin()).toBe(0);
    // En cas de doute c'est le téléphone qui a raison : c'est lui qui était
    // sur le chantier ce matin.
    expect(useScanStore.getState().saves[0].name).toBe(
      'Nom retouché sur place',
    );
  });
});

describe('le câblage au démarrage', () => {
  it("l'app reprend les plans dès que le compte est là", async () => {
    mockMagasin.set(
      'roomscanner.compte.v1',
      JSON.stringify({ compte: { id: 'compte-1', methode: 'email' }, jeton: 'jeton-1' }),
    );
    catalogue.mockResolvedValue([
      { scan: 'p9', nom: 'Chantier Martin', maj: 1700, taille: 900 },
    ]);
    reprend.mockResolvedValue({
      nom: 'Chantier Martin',
      maj: 1700,
      contenu: JSON.stringify(plan('p9', 'Chantier Martin')),
    });

    let arbre: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      arbre = TestRenderer.create(React.createElement(App));
    });
    await laisserPasser();

    expect(catalogue).toHaveBeenCalled();
    expect(useScanStore.getState().saves.map((s) => s.id)).toContain('p9');
    act(() => {
      arbre?.unmount();
    });
  });
});

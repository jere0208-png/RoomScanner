/**
 * LOT « FLUIDITÉ ET PLAN » — l'enregistrement automatique ne redessine plus
 * toute l'application.
 *
 * Relevé des testeurs : `App` lisait `saves` pour tenir l'index Spotlight à
 * jour. Chaque enregistrement automatique redessinait donc l'application
 * entière, l'écran ouvert compris — pour un effet qui ne dessine rien.
 * L'indexation suit maintenant la bibliothèque par un abonnement.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('../src/net/coffrePlans', () => ({
  deposerPlan: jest.fn(async () => true),
  catalogueDesPlans: jest.fn(async () => []),
  reprendrePlan: jest.fn(async () => null),
}));
jest.mock('../src/ui/spotlight', () => ({
  ...jest.requireActual('../src/ui/spotlight'),
  indexerLesPlans: jest.fn(),
}));

/* L'accueil en façade, qui COMPTE ses rendus : c'est lui qu'on observe. */
let mockRendusAccueil = 0;
jest.mock('../src/screens/HomeScreen', () => ({
  HomeScreen: () => {
    mockRendusAccueil += 1;
    return null;
  },
}));
jest.mock('../src/screens/ScanScreen', () => ({ ScanScreen: () => null }));
jest.mock('../src/screens/ResultScreen', () => ({ ResultScreen: () => null }));
jest.mock('../src/screens/LibraryScreen', () => ({ LibraryScreen: () => null }));
jest.mock('../src/screens/ExportScreen', () => ({ ExportScreen: () => null }));
jest.mock('../src/screens/CameraScreen', () => ({ CameraScreen: () => null }));
jest.mock('../src/screens/SignInScreen', () => ({ SignInScreen: () => null }));
jest.mock('../src/screens/PaywallScreen', () => ({ PaywallScreen: () => null }));
jest.mock('../src/components/SurprisePro', () => ({ SurprisePro: () => null }));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import App from '../App';
import { useScanStore, type SavedScan } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { indexerLesPlans } from '../src/ui/spotlight';

const indexer = indexerLesPlans as jest.Mock;

const plan = (id: string, nom: string): SavedScan =>
  ({
    id,
    name: nom,
    createdAt: 1700,
    updatedAt: 1700,
    modelPath: null,
    rooms: [],
    walls: [],
    openings: [],
    objects: [],
  }) as unknown as SavedScan;

beforeEach(() => {
  jest.useFakeTimers();
  indexer.mockClear();
  useAccountStore.setState({ charge: true, compte: null, jeton: null, pro: false });
});
afterEach(() => jest.useRealTimers());

describe("l'index Spotlight et l'enregistrement automatique", () => {
  it("indexe la bibliothèque sans redessiner l'écran ouvert", async () => {
    let arbre: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      arbre = TestRenderer.create(React.createElement(App));
    });
    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    // En invité, sur l'accueil : l'app s'ouvre sans compte.
    act(() => {
      useAccountStore.setState({ charge: true, invite: true });
      useScanStore.setState({ screen: 'home', savesCharges: true });
    });
    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    indexer.mockClear();
    const avant = mockRendusAccueil;
    expect(avant).toBeGreaterThan(0);

    // Une rafale d'enregistrements automatiques.
    const p1 = [plan('p1', 'Chantier Dupont')];
    const p2 = [plan('p1', 'Chantier Dupont'), plan('p2', 'Chantier Martin')];
    act(() => useScanStore.setState({ saves: p1 }));
    act(() => useScanStore.setState({ saves: p2 }));

    // L'écran ouvert n'a pas été redessiné.
    expect(mockRendusAccueil).toBe(avant);

    // Et la rafale n'indexe qu'une fois, un instant après, la dernière.
    expect(indexer).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1600);
    });
    expect(indexer).toHaveBeenCalledTimes(1);
    expect(indexer).toHaveBeenCalledWith(p2);

    act(() => {
      arbre?.unmount();
    });
  });

  it('indexe la bibliothèque lue au lancement, une fois, et pas avant', async () => {
    useScanStore.setState({ savesCharges: false, saves: [] });
    let arbre: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      arbre = TestRenderer.create(React.createElement(App));
    });
    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    // La lecture du disque (vide, en doublet) a abouti : un seul index.
    expect(useScanStore.getState().savesCharges).toBe(true);
    expect(indexer).toHaveBeenCalledTimes(1);
    expect(indexer).toHaveBeenLastCalledWith(useScanStore.getState().saves);

    // Bibliothèque « pas encore lue » : rien ne part.
    indexer.mockClear();
    act(() => useScanStore.setState({ savesCharges: false }));
    act(() => useScanStore.setState({ saves: [plan('p3', 'Chantier Roux')] }));
    act(() => {
      jest.advanceTimersByTime(1600);
    });
    expect(indexer).not.toHaveBeenCalled();
    act(() => {
      arbre?.unmount();
    });
  });
});

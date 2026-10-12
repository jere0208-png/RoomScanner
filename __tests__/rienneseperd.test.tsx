/**
 * RIEN NE S'EFFACE SANS MOI.
 *
 * Revue « Agathe » (électricienne, chantiers sans réseau, téléphone qui
 * meurt) : ce qu'elle avait fait disparaissait en silence, par six chemins.
 *
 *   — « Enregistrer » écrivait tout SAUF le tableau existant ;
 *   — la reprise d'un relevé interrompu rendait un client, une adresse et un
 *     nord vides, que le premier enregistrement effaçait du dossier ;
 *   — les modifications d'un plan enregistré s'effaçaient seules au bout de
 *     douze heures — une journée de pose perdue entre vendredi et lundi ;
 *   — un scan neuf lancé de l'accueil héritait des notes, des cotes, du
 *     tableau, du devis et de l'étage du chantier d'avant ;
 *   — « Dessiner », « Voir un exemple », « Lire un plan papier » jetaient le
 *     relevé interrompu sans rien demander ;
 *   — le brouillon s'effaçait AVANT que le plan soit sur le disque, et un
 *     disque plein laissait croire que tout était enregistré.
 */
const mockMagasin = new Map<string, string>();
let mockRefus: ((k: string) => boolean) | null = null;
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    if (mockRefus?.(k)) throw new Error('disque plein');
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import TestRenderer, { act } from 'react-test-renderer';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { useAlerte } from '../src/ui/alerte';
import { etatDAttente } from '../src/ui/miseDeCote';
import { lancerUnScan } from '../src/native/useRoomScan';
import { HomeScreen } from '../src/screens/HomeScreen';

const st = () => useScanStore.getState();
const BROUILLON = 'roomscanner.brouillon.v1';
const H = 3600 * 1000;

/** Laisse passer la minuterie d'écriture (600 ms) et les promesses du disque. */
async function laisserEcrire() {
  await act(async () => {
    jest.advanceTimersByTime(700);
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockMagasin.clear();
  mockRefus = null;
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  useScanStore.setState({ saves: [], currentSaveId: null, panne: null });
  useAlerte.setState({ courante: null, file: [] });
});
afterEach(() => jest.useRealTimers());

describe('« Enregistrer » écrit tout', () => {
  it('le tableau existant compris', () => {
    st().commencerAuClavier();
    st().addRoomBox(4, 3, 'Séjour');
    st().commitCurrent();
    const tableau = { departs: [{ id: 'd1', libelle: 'Prises cuisine', calibre: 20 }], rangees: 2 } as never;
    useScanStore.setState({ existant: tableau, dirty: true });
    st().commitCurrent();
    expect(st().saves[0].existant).toEqual(tableau);
  });
});

describe('la reprise d’un relevé interrompu', () => {
  it('rend le client, l’adresse et le nord', async () => {
    st().commencerAuClavier();
    st().addRoomBox(4, 3, 'Séjour');
    useScanStore.setState({ client: 'M. Dupont', address: '3 rue Pasteur', north: 42 });
    st().ecrireBrouillon();
    await laisserEcrire();
    const brouillon = JSON.parse(mockMagasin.get(BROUILLON)!);
    // Le téléphone s'éteint ; au redémarrage, l'état est vide.
    st().reset();
    useScanStore.setState({ brouillon, client: '', address: '', north: null });
    st().reprendreBrouillon();
    expect(st().client).toBe('M. Dupont');
    expect(st().address).toBe('3 rue Pasteur');
    expect(st().north).toBe(42);
  });

  it('un brouillon d’avant reprend le cartouche à son dossier', () => {
    const dossier = {
      id: 'P1', name: 'Maison Dupont', createdAt: 1, updatedAt: 1, modelPath: null,
      rooms: [], walls: [], openings: [], objects: [],
      client: 'M. Dupont', address: '3 rue Pasteur', north: 15,
    };
    useScanStore.setState({
      saves: [dossier as never],
      brouillon: {
        at: Date.now(), name: 'Maison Dupont', saveId: 'P1',
        walls: [{ id: 'w', type: 'wall', a: { x: 0, z: 0 }, b: { x: 3, z: 0 }, height: 2.5, yCenter: 1.25 }],
        openings: [], objects: [], rooms: [], fixtures: [], ceiling: [], photos: [], modelPath: null,
      } as never,
    });
    st().reprendreBrouillon();
    expect(st().client).toBe('M. Dupont');
    expect(st().address).toBe('3 rue Pasteur');
    expect(st().north).toBe(15);
  });
});

describe('les modifications d’un plan enregistré', () => {
  it('ne s’effacent jamais d’elles-mêmes', () => {
    const plan = {
      id: 'P1', name: 'Maison Dupont', createdAt: 1, updatedAt: 1, modelPath: null,
      rooms: [], walls: [], openings: [], objects: [],
    };
    const t = Date.now();
    useScanStore.setState({
      screen: 'home',
      saves: [{ ...plan, retouche: { at: t - 3 * 24 * H, jusqua: t - 2 * 24 * H, plan } } as never],
    });
    st().purgerLesEchus(t);
    expect(st().saves[0].retouche).toBeTruthy();
  });

  it('et la liste ne leur annonce plus d’échéance', () => {
    const plan = {
      id: 'P1', name: 'Maison Dupont', createdAt: 1, updatedAt: 1, modelPath: null,
      rooms: [], walls: [], openings: [], objects: [],
    };
    const t = Date.now();
    const e = etatDAttente({ ...plan, retouche: { at: t, jusqua: t + 5 * 60000, plan } } as never, t)!;
    expect(e.sorte).toBe('retouche');
    expect(e.texte).not.toMatch(/perdues|dans \d/i);
  });
});

describe('un scan neuf, lancé de l’accueil', () => {
  it('repart d’un chantier vierge', async () => {
    st().commencerAuClavier();
    st().addRoomBox(4, 3, 'Séjour');
    useScanStore.setState({
      notes: [{ id: 'n', at: { x: 1, z: 1 }, texte: 'arrivée gaz' }] as never,
      mesures: [{ id: 'm', a: { x: 0, z: 0 }, b: { x: 1, z: 0 } }] as never,
      existant: { departs: [] } as never,
      niveauCourant: 1,
      client: 'M. Dupont',
    });
    useScanStore.setState({ screen: 'home', supported: true });
    await act(async () => {
      await lancerUnScan();
    });
    expect(st().notes).toEqual([]);
    expect(st().mesures).toEqual([]);
    expect(st().existant).toBeNull();
    expect(st().niveauCourant).toBe(0);
    expect(st().client ?? '').toBe('');
    expect(st().walls).toEqual([]);
    expect(st().screen).toBe('scan');
  });

  it('le départ de la caméra fait de même', () => {
    const crochet = readFileSync(join(__dirname, '..', 'src', 'native', 'useRoomScan.ts'), 'utf8');
    const debut = crochet.slice(crochet.indexOf('const begin = async'), crochet.indexOf('return {', crochet.indexOf('const begin = async')));
    expect(debut).toMatch(/repartirANeuf\(\)/);
  });
});

describe('le relevé interrompu, à l’accueil', () => {
  const brouillon = {
    at: Date.now() - 5 * 60000,
    name: 'Visite',
    walls: [{ id: 'w', type: 'wall', a: { x: 0, z: 0 }, b: { x: 3, z: 0 }, height: 2.5, yCenter: 1.25 }],
    openings: [], objects: [], rooms: [], fixtures: [], ceiling: [], photos: [], modelPath: null,
  };
  const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
    t.root.findAll((n) => typeof n.props?.onPress === 'function' && n.props?.accessibilityLabel === label)[0];

  for (const [tuile, apres] of [
    ['Dessiner un plan sans scanner', 'result'],
    ['Voir un exemple', 'result'],
    ['Lire un plan papier', 'lecture'],
  ] as const) {
    it(`« ${tuile} » demande avant de le remplacer`, () => {
      useScanStore.setState({ screen: 'home', supported: true, brouillon: brouillon as never });
      let t!: TestRenderer.ReactTestRenderer;
      act(() => {
        t = TestRenderer.create(<HomeScreen />);
      });
      act(() => bouton(t, tuile).props.onPress());
      // Rien n'a bougé : une question est posée.
      expect(st().screen).toBe('home');
      expect(st().brouillon).toBeTruthy();
      const q = useAlerte.getState().courante!;
      expect(q.titre).toMatch(/relevé interrompu/i);
      expect(q.actions!.map((a) => a.label)).toContain('Reprendre');
      // On confirme : le geste a lieu.
      const go = q.actions!.find((a) => a.danger)!;
      act(() => go.onPress!());
      expect(st().screen).toBe(apres);
      act(() => t.unmount());
    });
  }
});

describe('le brouillon ne se replie qu’une fois le plan sur le disque', () => {
  it('écriture réussie : le brouillon s’en va', async () => {
    st().commencerAuClavier();
    st().addRoomBox(4, 3, 'Séjour');
    st().ecrireBrouillon();
    await laisserEcrire();
    expect(mockMagasin.has(BROUILLON)).toBe(true);
    st().commitCurrent();
    // Tant que le plan n'est pas écrit, le filet reste.
    expect(mockMagasin.has(BROUILLON)).toBe(true);
    await laisserEcrire();
    expect(mockMagasin.has(BROUILLON)).toBe(false);
  });

  it('disque plein : le brouillon reste, et le plan redevient « à enregistrer »', async () => {
    st().commencerAuClavier();
    st().addRoomBox(4, 3, 'Séjour');
    st().ecrireBrouillon();
    await laisserEcrire();
    mockRefus = (k) => k !== BROUILLON;
    st().commitCurrent();
    expect(st().dirty).toBe(false);
    await laisserEcrire();
    expect(mockMagasin.has(BROUILLON)).toBe(true);
    // « Enregistrer » revient : la consigne du message se suit.
    expect(st().dirty).toBe(true);
    expect(st().panne).toBeTruthy();
  });
});

describe('quand l’app passe en arrière-plan', () => {
  it('le brouillon s’écrit, et un scan en cours se met en pause', () => {
    const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
    expect(app).toMatch(/brouillonAuDepart\(\)/);
    const scan = readFileSync(join(__dirname, '..', 'src', 'screens', 'ScanScreen.tsx'), 'utf8');
    expect(scan).toMatch(/AppState\.addEventListener/);
    expect(scan).toMatch(/pauseRef\.current\(\)/);
  });
});

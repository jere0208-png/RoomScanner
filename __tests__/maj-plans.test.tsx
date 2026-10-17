/**
 * LOT « MAJ-PLANS » — points 6 et 9 de la synthèse des testeurs.
 *
 * (6) « Plans qui disparaissent sans prévenir, et suppression sur le serveur
 *     hors réseau » (relevé « bug-données ») : un élément abîmé n'emporte
 *     plus le plan, un plan illisible se dit et part au support, une
 *     suppression faite sans réseau attend dans une file écrite sur le
 *     disque — et la reprise du compte ne la ressuscite pas.
 *
 * (9) « Grosse bibliothèque et démarrage lents » (relevé « bug-fluidité ») :
 *     liste virtualisée, lignes et vignettes mémoïsées, recherche différée,
 *     tic de minute limité aux comptes à rebours, version du format écrite
 *     dans chaque plan migré, plus d'empreinte au chargement.
 *
 * LES MESURES (dernier bloc), 200 plans synthétiques de la taille de
 * l'exemple (2,8 Mo), jest sur 4 cœurs partagés — à comparer entre elles,
 * pas comme des temps d'iPhone. Avant ce lot, relevées par le même banc sur
 * le code d'avant (trois passages) :
 *   — lancement (chaque fois) : 1 300 à 1 870 ms ;
 *   — montage de « Mes plans » : 2 900 à 5 500 ms ;
 *   — frappes « C », « Ch », « Cha » : 1 700-1 950 / 630-900 / 220-480 ms ;
 *   — tic de minute : 1 230 à 1 360 ms.
 */
const mockDisque = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockDisque.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockDisque.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockDisque.delete(k);
  }),
  multiGet: jest.fn(async (cles: string[]) => cles.map((k) => [k, mockDisque.get(k) ?? null] as const)),
  getAllKeys: jest.fn(async () => [...mockDisque.keys()]),
}));

const mockRetirer = jest.fn();
const mockCatalogue = jest.fn();
const mockReprendre = jest.fn();
jest.mock('../src/net/coffrePlans', () => ({
  catalogueDesPlans: (...a: unknown[]) => mockCatalogue(...a),
  reprendrePlan: (...a: unknown[]) => mockReprendre(...a),
  deposerPlan: jest.fn(async () => true),
  retirerPlan: (...a: unknown[]) => mockRetirer(...a),
}));

const mockEnvoyer = jest.fn();
jest.mock('../src/native/support', () => ({
  ...jest.requireActual('../src/native/support'),
  envoyerUnDiagnostic: (...a: unknown[]) => mockEnvoyer(...a),
  infosDeLApp: async () => ({ version: '9.9', appareil: 'iPhone', systeme: 'iOS 26' }),
}));

// L'horloge des comptes à rebours, comptée : un appel par ligne dessinée.
const mockEtat = jest.fn();
jest.mock('../src/ui/miseDeCote', () => {
  const vrai = jest.requireActual('../src/ui/miseDeCote');
  return {
    ...vrai,
    etatDAttente: (...a: unknown[]) => {
      mockEtat(...a);
      return vrai.etatDAttente(...a);
    },
  };
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { FlatList, Text, TextInput, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { appartementExemple } from '../src/data/exemple';
import {
  SCHEMA_PLAN,
  brutDuPlanIllisible,
  resetPersistCache,
  useScanStore,
  type SavedScan,
} from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { LibraryScreen, PlanThumb, vueRetenue } from '../src/screens/LibraryScreen';
import { ActionSheet } from '../src/components/Sheet';
import { useUsage } from '../src/store/usage';
import { useAlerte } from '../src/ui/alerte';
import type { WallSeg } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();
const INDEX = 'roomscanner.index.v2';
const FILE = 'roomscanner.suppressions.v1';
const cle = (id: string) => `roomscanner.scan.v2.${id}`;
const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

const mur = (id: string, x0: number, z0: number, x1: number, z1: number): WallSeg =>
  ({ id, type: 'wall', a: { x: x0, z: z0 }, b: { x: x1, z: z1 }, height: 2.5, yCenter: 1.25 }) as WallSeg;

/** Une pièce de 4 × 3 m, fermée. */
const carre = () => [mur('m1', 0, 0, 4, 0), mur('m2', 4, 0, 4, 3), mur('m3', 4, 3, 0, 3), mur('m4', 0, 3, 0, 0)];

const scan = (id: string, name: string, extra: Partial<SavedScan> = {}): SavedScan => ({
  id,
  name,
  createdAt: 1_000,
  updatedAt: 1_000,
  modelPath: null,
  walls: carre(),
  openings: [],
  objects: [],
  rooms: [{ id: 'room-1', name: '', floor: null }],
  ...extra,
});

const ranger = (...scans: unknown[]) => {
  for (const s of scans) mockDisque.set(cle((s as { id: string }).id), JSON.stringify(s));
  mockDisque.set(INDEX, JSON.stringify(scans.map((s) => (s as { id: string }).id)));
};

/** Laisse passer les promesses en chaîne (file, écritures). */
const attendre = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const poserCompte = () =>
  useAccountStore.setState({ charge: true, compte: { id: 'compte-1', methode: 'email' } as never, jeton: 'jeton-1', pro: true });

const Vignette = (PlanThumb as unknown as { type: React.FC }).type;

beforeEach(() => {
  mockDisque.clear();
  mockRetirer.mockReset();
  mockCatalogue.mockReset();
  mockReprendre.mockReset();
  mockEnvoyer.mockReset();
  mockEtat.mockClear();
  resetPersistCache();
  useAlerte.setState({ courante: null, file: [] });
  Object.assign(vueRetenue, { quete: '', tri: 'date', inside: null });
  useAccountStore.setState({ charge: true, compte: null, jeton: null, pro: false });
  st().reset();
  useScanStore.setState({
    saves: [],
    folders: [],
    brouillon: null,
    savesCharges: false,
    plansIllisibles: [],
    currentSaveId: null,
    placeRendue: null,
  });
});

// ------------------------------------------------------------------ point 6
describe('un élément abîmé n’emporte plus le plan', () => {
  it('murs, ouvertures, meubles et pièces illisibles sont écartés, le reste s’ouvre', async () => {
    const sansA = { id: 'casse', type: 'wall', b: { x: 1, z: 1 }, height: 2.5, yCenter: 1.25 };
    const baieNaN = { id: 'o2', type: 'door', a: { x: NaN, z: 0 }, b: { x: 1, z: 0 }, height: 2, yCenter: 1 };
    const baie = { id: 'o1', type: 'window', a: { x: 1, z: 0 }, b: { x: 2, z: 0 }, height: 1, yCenter: 1.5 };
    const meuble = { id: 'lit', category: 'bed', width: 1.4, height: 0.5, depth: 2, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.25, 1.5, 1] };
    const meubleCasse = { id: 'x', category: 'table', width: 1, height: 1, depth: 1, transform: [1, 2] };
    ranger(
      scan('a', 'Maison A', {
        walls: [...carre(), sansA, null] as never,
        openings: [baie, baieNaN] as never,
        objects: [meuble, meubleCasse, null] as never,
        rooms: [{ id: 'room-1', name: 'Séjour', floor: null }, 'rien'] as never,
      }),
    );
    await st().loadSaves();
    const [plan] = st().saves;
    expect(plan.name).toBe('Maison A');
    expect(plan.walls.map((w) => w.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(plan.openings.map((o) => o.id)).toEqual(['o1']);
    expect(plan.objects.map((o) => o.id)).toEqual(['lit']);
    expect(plan.rooms.map((r) => r.id)).toEqual(['room-1']);
    expect(st().plansIllisibles).toEqual([]);
    // Et il s'ouvre.
    st().openSave('a');
    expect(st().walls).toHaveLength(4);
  });

  it('les retouches en attente sont nettoyées de la même façon', async () => {
    ranger(
      scan('a', 'Maison A', {
        retouche: { jusqua: 0, plan: { ...scan('a', 'Maison A'), walls: [...carre(), { id: 'z' }] } } as never,
      }),
    );
    await st().loadSaves();
    expect(st().saves[0].retouche!.plan.walls.map((w) => w.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });
});

describe('un plan illisible se dit, et part au support', () => {
  const tronque = () => {
    ranger(scan('a', 'Maison A'), scan('b', 'Maison Durand'));
    mockDisque.set(cle('b'), mockDisque.get(cle('b'))!.slice(0, 60));
  };

  it('le magasin le compte, sans toucher au disque', async () => {
    tronque();
    const brut = mockDisque.get(cle('b'));
    await st().loadSaves();
    expect(st().saves.map((s) => s.id)).toEqual(['a']);
    expect(st().plansIllisibles).toEqual(['b']);
    expect(mockDisque.get(cle('b'))).toBe(brut);
    const envoi = await brutDuPlanIllisible('b');
    expect(envoi?.contenu).toBe(brut);
    expect(envoi?.fichier).toBe('plan-illisible-b.json');
  });

  it('« Mes plans » affiche la ligne, et l’envoi joint le plan tel qu’il est écrit', async () => {
    tronque();
    await st().loadSaves();
    mockEnvoyer.mockResolvedValue('sent');
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      useScanStore.setState({ screen: 'library' });
      tree = TestRenderer.create(<LibraryScreen />);
    });
    const ligne = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => /1 plan n’a pas pu être lu/.test(String(n.props.accessibilityLabel)));
    expect(ligne).toBeDefined();
    const texte = ligne!.findAllByType(Text).map((t) => [t.props.children].flat().join('')).join('');
    expect(texte).toContain('1 plan n’a pas pu être lu');
    expect(texte).toContain('l’envoyer au support');
    act(() => ligne!.props.onPress());
    const menu = tree.root.findByType(ActionSheet).props.data;
    expect(menu.title).toBe('Un plan n’a pas pu être lu');
    const envoyer = menu.actions.find((a: { label: string }) => a.label === 'Envoyer au support');
    // Le nom que le plan porte encore… s'il se lit : ici le JSON est coupé.
    expect(envoyer.hint).toBe('Plan sans nom lisible');
    await act(async () => {
      envoyer.onPress();
      await attendre();
    });
    expect(mockEnvoyer).toHaveBeenCalledTimes(1);
    const [sujet, corps, fichier, contenu] = mockEnvoyer.mock.calls[0];
    expect(sujet).toBe('Plan illisible — b');
    expect(corps).toContain('9.9');
    expect(fichier).toBe('plan-illisible-b.json');
    expect(contenu).toBe(mockDisque.get(cle('b')));
    act(() => tree.unmount());
  });

  it('seul plan, illisible : l’écran ne dit plus « Aucun plan enregistré »', async () => {
    ranger(scan('b', 'Maison B'));
    mockDisque.set(cle('b'), '{"id":"b","name":"Maison B","walls":"abîmé"}');
    await st().loadSaves();
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<LibraryScreen />);
      await attendre();
    });
    const textes = tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
    expect(textes).toContain('Aucun plan à afficher');
    expect(textes).not.toContain('Aucun plan enregistré');
    // Le nom se lit encore : le menu le donne.
    act(() =>
      tree.root
        .findAllByType(TouchableOpacity)
        .find((n) => /pas pu être lu/.test(String(n.props.accessibilityLabel)))!
        .props.onPress(),
    );
    expect(tree.root.findByType(ActionSheet).props.data.actions[0].hint).toBe('Maison B');
    act(() => tree.unmount());
  });

  it('« Effacer du téléphone » l’ôte du disque et de l’index', async () => {
    jest.useFakeTimers();
    try {
      tronque();
      await st().loadSaves();
      await st().oublierPlanIllisible('b');
      jest.advanceTimersByTime(700);
      await attendre();
      expect(st().plansIllisibles).toEqual([]);
      expect(mockDisque.has(cle('b'))).toBe(false);
      expect(JSON.parse(mockDisque.get(INDEX)!)).toEqual(['a']);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('une suppression faite sans réseau n’est pas oubliée', () => {
  const fileSurDisque = () => JSON.parse(mockDisque.get(FILE) ?? '[]') as { scan: string }[];

  it('elle attend dans une file écrite sur le disque, puis se rejoue', async () => {
    poserCompte();
    useScanStore.setState({ saves: [scan('a', 'Maison A'), scan('b', 'Maison B')] });
    mockRetirer.mockResolvedValue(false); // pas de réseau
    st().deleteSave('a');
    await attendre();
    expect(mockRetirer).toHaveBeenCalledWith({ identifiant: 'compte-1', jeton: 'jeton-1' }, 'a');
    expect(fileSurDisque().map((x) => x.scan)).toEqual(['a']);

    // L'app est relancée : la file se relit du disque.
    resetPersistCache();
    mockRetirer.mockReset();
    mockRetirer.mockResolvedValue(true); // le réseau est revenu
    expect(await st().rejouerLesSuppressions()).toBe(1);
    expect(mockRetirer).toHaveBeenCalledWith({ identifiant: 'compte-1', jeton: 'jeton-1' }, 'a');
    await attendre();
    expect(fileSurDisque()).toEqual([]);
  });

  it('avec le réseau, elle sort de la file aussitôt confirmée', async () => {
    poserCompte();
    useScanStore.setState({ saves: [scan('a', 'Maison A')] });
    mockRetirer.mockResolvedValue(true);
    st().deleteSave('a');
    await attendre();
    expect(fileSurDisque()).toEqual([]);
  });

  it('la reprise du compte ne redescend pas un plan dont la suppression attend', async () => {
    poserCompte();
    useScanStore.setState({ saves: [scan('a', 'Maison A')], savesCharges: true });
    mockRetirer.mockResolvedValue(false);
    st().deleteSave('a');
    await attendre();
    // Réinstallation : le téléphone est vide, le serveur garde encore « a ».
    useScanStore.setState({ saves: [] });
    mockCatalogue.mockResolvedValue([
      { scan: 'a', nom: 'Maison A', maj: 1, taille: 10 },
      { scan: 'c', nom: 'Maison C', maj: 1, taille: 10 },
    ]);
    mockReprendre.mockImplementation(async (_q: unknown, id: string) => ({
      nom: id,
      maj: 1,
      contenu: JSON.stringify(scan(id, `Maison ${id.toUpperCase()}`)),
    }));
    expect(await st().reprendreDuCompte({ identifiant: 'compte-1', jeton: 'jeton-1' })).toBe(1);
    expect(st().saves.map((s) => s.id)).toEqual(['c']);
    expect(mockReprendre).not.toHaveBeenCalledWith(expect.anything(), 'a');
  });

  it('le serveur entendu, la file part d’abord : la reprise la rejoue', async () => {
    poserCompte();
    useScanStore.setState({ saves: [scan('a', 'Maison A')] });
    mockRetirer.mockResolvedValue(false);
    st().deleteSave('a');
    await attendre();
    mockRetirer.mockResolvedValue(true);
    mockCatalogue.mockResolvedValue([]);
    await st().reprendreDuCompte({ identifiant: 'compte-1', jeton: 'jeton-1' });
    await attendre();
    expect(fileSurDisque()).toEqual([]);
  });

  it('l’application rejoue la file au lancement et au retour au premier plan', () => {
    const app = lire('App.tsx');
    expect(app.match(/rejouerLesSuppressions\(\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

// ------------------------------------------------------------------ point 9
describe('le démarrage ne refait pas les migrations', () => {
  /** Un « mur » de 0 cm : `sansEclats` l'ôte — s'il passe par la migration. */
  const eclat = () => mur('eclat', 4, 0, 4, 0);

  it('un plan migré s’écrit estampillé, puis n’est plus migré', async () => {
    jest.useFakeTimers();
    try {
      ranger(scan('a', 'Maison A', { walls: [...carre(), eclat()] }));
      await st().loadSaves();
      expect(st().saves[0].walls.map((w) => w.id)).not.toContain('eclat');
      expect(st().saves[0].schema).toBe(SCHEMA_PLAN);
      // Réécrit une fois, un instant après le chargement.
      jest.advanceTimersByTime(700);
      await attendre();
      const ecrit = JSON.parse(mockDisque.get(cle('a'))!);
      expect(ecrit.schema).toBe(SCHEMA_PLAN);
      expect(ecrit.walls.map((w: WallSeg) => w.id)).not.toContain('eclat');
    } finally {
      jest.useRealTimers();
    }
  });

  it('un plan déjà à jour saute les migrations géométriques', async () => {
    // Estampillé : l'éclat (qu'aucune version actuelle ne fabrique) reste.
    ranger(scan('a', 'Maison A', { schema: SCHEMA_PLAN, walls: [...carre(), eclat()] }));
    await st().loadSaves();
    expect(st().saves[0].walls.map((w) => w.id)).toContain('eclat');
  });

  it('une bibliothèque à jour ne se réécrit pas au lancement', async () => {
    jest.useFakeTimers();
    try {
      ranger(scan('a', 'Maison A', { schema: SCHEMA_PLAN }), scan('b', 'Maison B', { schema: SCHEMA_PLAN }));
      const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage');
      await st().loadSaves();
      AsyncStorage.setItem.mockClear();
      jest.advanceTimersByTime(2000);
      await attendre();
      const cles = AsyncStorage.setItem.mock.calls.map((c: string[]) => c[0]);
      expect(cles.filter((k: string) => k.startsWith('roomscanner.scan'))).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('tout plan écrit porte la version, et le chargement ne hache plus le JSON', () => {
    const source = lire('src/store/scanStore.ts');
    expect(source).toContain("ecrits.set(id, { ref: lu, quand: lu.updatedAt, empreinte: '' });");
    expect(source).toContain('JSON.stringify(s.schema === SCHEMA_PLAN ? s : { ...s, schema: SCHEMA_PLAN })');
  });
});

describe('la bibliothèque à deux cents plans', () => {
  it('liste virtualisée, lignes et vignettes mémoïsées', () => {
    const memo = Symbol.for('react.memo');
    expect((PlanThumb as unknown as { $$typeof: symbol }).$$typeof).toBe(memo);
    const source = lire('src/screens/LibraryScreen.tsx');
    expect(source).toContain('const ScanRow = React.memo(function ScanRow(');
    expect(source).toContain('<FlatList');
    expect(source).not.toMatch(/<ScrollView/);
    expect(source).toContain('useDeferredValue(quete)');
  });
});

// ---------------------------------------------------------------- mesures
describe('mesures : 200 plans synthétiques', () => {
  const N = 200;
  const ex = appartementExemple();
  const planN = (i: number, extra: Record<string, unknown> = {}) =>
    JSON.parse(
      JSON.stringify({
        id: `p${i}`,
        name: `${i % 3 === 0 ? 'Chantier' : 'Maison'} ${i}`,
        client: `Client ${i}`,
        createdAt: 1_000 + i,
        updatedAt: 1_000 + i,
        modelPath: null,
        ...ex,
        ...extra,
      }),
    );
  const avancer = async (ms: number) => {
    jest.advanceTimersByTime(ms);
    await attendre();
  };

  it('lancements, montage, frappes et tic de minute', async () => {
    jest.useFakeTimers({ doNotFake: ['performance'] });
    try {
      useUsage.setState({ modeElec: true } as never);
      // Le plus récent attend d'être enregistré : seul il a un compte à rebours.
      const maintenant = Date.now();
      for (let i = 0; i < N; i++) {
        const extra = i === N - 1 ? { supprimeLe: maintenant + 6 * 3600_000, updatedAt: maintenant } : {};
        mockDisque.set(cle(`p${i}`), JSON.stringify(planN(i, extra)));
      }
      mockDisque.set(INDEX, JSON.stringify(Array.from({ length: N }, (_, i) => `p${i}`)));
      let taille = 0;
      for (const [k, v] of mockDisque) if (k.startsWith('roomscanner.scan')) taille += v.length;

      const lancer = async () => {
        resetPersistCache();
        useScanStore.setState({ saves: [], savesCharges: false });
        const t0 = performance.now();
        await st().loadSaves();
        return performance.now() - t0;
      };
      const premier = await lancer(); // migrations, puis réécriture estampillée
      await avancer(800);
      expect(JSON.parse(mockDisque.get(cle('p7'))!).schema).toBe(SCHEMA_PLAN);
      const second = await lancer();
      const troisieme = await lancer();
      expect(st().saves).toHaveLength(N);

      let tree!: TestRenderer.ReactTestRenderer;
      let t0 = performance.now();
      act(() => {
        useScanStore.setState({ screen: 'library' });
        tree = TestRenderer.create(<LibraryScreen />);
      });
      const montage = performance.now() - t0;
      expect(tree.root.findAllByType(FlatList)).toHaveLength(1);
      const vignettes = tree.root.findAllByType(Vignette).length;
      // Une dizaine de lignes montées, pas deux cents.
      expect(vignettes).toBeGreaterThan(0);
      expect(vignettes).toBeLessThanOrEqual(20);

      const champ = tree.root.findByType(TextInput);
      const frappes: number[] = [];
      for (const q of ['C', 'Ch', 'Cha']) {
        t0 = performance.now();
        await act(async () => {
          champ.props.onChangeText(q);
          await attendre();
        });
        frappes.push(performance.now() - t0);
      }
      await act(async () => {
        champ.props.onChangeText('');
        await attendre();
      });

      // Le tic de minute : seule la ligne au compte à rebours se redessine.
      mockEtat.mockClear();
      t0 = performance.now();
      act(() => {
        jest.advanceTimersByTime(60_000);
      });
      const tic = performance.now() - t0;
      const lignesRedessinees = new Set(mockEtat.mock.calls.map((c) => (c[0] as SavedScan).id));
      expect([...lignesRedessinees]).toEqual([`p${N - 1}`]);
      act(() => tree.unmount());

      const mesures = {
        plans: N,
        mo: +(taille / 1e6).toFixed(2),
        premierLancement: Math.round(premier),
        lancementsSuivants: [Math.round(second), Math.round(troisieme)],
        montage: Math.round(montage),
        vignettesMontees: vignettes,
        frappes: frappes.map(Math.round),
        tic: Math.round(tic),
      };
      // eslint-disable-next-line no-console
      console.log(`MESURES maj-plans ${JSON.stringify(mesures)}`);
      // Des bornes relatives, sûres sur une machine chargée : le lancement à
      // jour coûte une fraction du premier, et le tic ne touche qu'une ligne.
      expect(Math.max(second, troisieme)).toBeLessThan(premier / 3);
    } finally {
      jest.useRealTimers();
    }
  }, 120000);
});

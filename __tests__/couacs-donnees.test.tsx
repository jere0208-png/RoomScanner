/**
 * LES COUACS DU LOT « DONNÉES » — relevés « bug-données » et « bug-fluidité ».
 *
 * Treize petits défauts autour de la bibliothèque, de l'historique et des
 * reprises : chacun a son épreuve ici, sur le vrai magasin (et le vrai écran
 * de la bibliothèque pour les deux qui se jouent au doigt).
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

const mockCatalogue = jest.fn();
const mockReprendre = jest.fn();
jest.mock('../src/net/coffrePlans', () => ({
  catalogueDesPlans: (...a: unknown[]) => mockCatalogue(...a),
  reprendrePlan: (...a: unknown[]) => mockReprendre(...a),
  deposerPlan: jest.fn(async () => undefined),
  retirerPlan: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import {
  NOM_PLAN_MAX,
  nomDeVersion,
  resetPersistCache,
  useScanStore,
  type BrouillonScan,
  type SavedScan,
} from '../src/store/scanStore';
import { LibraryScreen, vueRetenue } from '../src/screens/LibraryScreen';
import { fichesSpotlight } from '../src/ui/spotlight';
import { useAlerte } from '../src/ui/alerte';
import { SNAPSHOT_WALLS } from '../src/export/snapshotFixture';
import type { WallSeg } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();
const INDEX = 'roomscanner.index.v2';
const DRAFT = 'roomscanner.brouillon.v1';
const cle = (id: string) => `roomscanner.scan.v2.${id}`;

const mur = (id: string, x0: number, z0: number, x1: number, z1: number, niveau?: number): WallSeg =>
  ({
    id,
    type: 'wall',
    a: { x: x0, z: z0 },
    b: { x: x1, z: z1 },
    height: 2.5,
    yCenter: 1.25,
    ...(niveau !== undefined ? { niveau } : {}),
  }) as WallSeg;

const scan = (id: string, name: string, extra: Partial<SavedScan> = {}): SavedScan => ({
  id,
  name,
  createdAt: 1_000,
  updatedAt: 1_000,
  modelPath: null,
  walls: [],
  openings: [],
  objects: [],
  rooms: [{ id: 'room-1', name: '', floor: null }],
  ...extra,
});

const ranger = (...scans: unknown[]) => {
  for (const s of scans) mockMagasin.set(cle((s as { id: string }).id), JSON.stringify(s));
  mockMagasin.set(INDEX, JSON.stringify(scans.map((s) => (s as { id: string }).id)));
};

beforeEach(() => {
  mockMagasin.clear();
  mockCatalogue.mockReset();
  mockReprendre.mockReset();
  resetPersistCache();
  useAlerte.setState({ courante: null, file: [] });
  Object.assign(vueRetenue, { quete: '', tri: 'date', inside: null });
  st().reset();
  useScanStore.setState({ saves: [], folders: [], brouillon: null, savesCharges: false, currentSaveId: null });
});

describe('annuler / rétablir et la marque « enregistré »', () => {
  it('l’état enregistré jeté avec l’avenir ne se « retrouve » plus', () => {
    useScanStore.setState({ walls: [mur('m1', 0, 0, 4, 0)], scanName: 'Essai', photos: [] });
    const photo = () => st().addPhoto('m1', 1, 'p.jpg');
    photo();
    photo();
    photo();
    st().commitCurrent(); // enregistré à trois photos
    expect(st().dirty).toBe(false);
    st().undo();
    st().undo(); // l'état enregistré part dans l'avenir…
    photo(); // … qu'un geste neuf jette
    photo();
    photo();
    st().undo(); // l'historique retombe à trois gestes
    expect(st().photos).toHaveLength(3);
    expect(st().dirty).toBe(true);
  });

  it('revenir exactement à l’état enregistré reste « rien à enregistrer »', () => {
    useScanStore.setState({ walls: [mur('m1', 0, 0, 4, 0)], scanName: 'Essai', photos: [] });
    st().addPhoto('m1', 1, 'a.jpg');
    st().commitCurrent();
    st().addPhoto('m1', 2, 'b.jpg');
    st().undo();
    expect(st().dirty).toBe(false);
  });
});

describe('ouvrir un plan depuis la bibliothèque', () => {
  const brouillon: BrouillonScan = {
    at: 5_000,
    name: 'Relevé de la veille',
    walls: [mur('m1', 0, 0, 4, 0)],
    openings: [],
    objects: [],
    rooms: [],
    fixtures: [],
    ceiling: [],
    photos: [],
    modelPath: null,
  };
  const monter = () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        screen: 'library',
        saves: [scan('a', 'Chantier Dupont', { walls: SNAPSHOT_WALLS })],
        brouillon,
      });
      tree = TestRenderer.create(<LibraryScreen />);
    });
    return tree;
  };
  const ligne = (tree: TestRenderer.ReactTestRenderer, mot: string) =>
    tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.findAllByType(Text).some((t) => String(t.props.children).includes(mot)));

  it('demande avant d’écraser le relevé interrompu', () => {
    jest.useFakeTimers();
    const tree = monter();
    try {
      act(() => ligne(tree, 'Chantier Dupont')!.props.onPress());
      const question = useAlerte.getState().courante;
      expect(question?.titre).toBe('Un relevé interrompu vous attend');
      // Rien n'est ouvert tant qu'on n'a pas choisi.
      expect(st().currentSaveId).toBeNull();
      expect(st().brouillon).not.toBeNull();
      act(() => question!.actions!.find((x) => x.label === 'Ouvrir')!.onPress!());
      expect(st().currentSaveId).toBe('a');
      expect(st().brouillon).toBeNull();
    } finally {
      act(() => tree.unmount());
      jest.useRealTimers();
    }
  });

  it('dossier, recherche et tri se retrouvent au retour', () => {
    jest.useFakeTimers();
    let tree = monter();
    try {
      const trier = () =>
        tree.root
          .findAllByType(TouchableOpacity)
          .find((n) => String(n.props.accessibilityLabel ?? '').startsWith('Trier par'))!;
      expect(trier().props.accessibilityLabel).toBe('Trier par nom');
      act(() => trier().props.onPress());
      act(() => tree.unmount());
      tree = monter();
      expect(trier().props.accessibilityLabel).toBe('Trier par date');
      expect(vueRetenue.tri).toBe('nom');
    } finally {
      act(() => tree.unmount());
      jest.useRealTimers();
    }
  });
});

describe('un plan abîmé ne bloque pas la bibliothèque', () => {
  it('des photos qui ne sont pas une liste : le plan se charge, et les suppressions passent', async () => {
    ranger(scan('a', 'Maison A', { photos: 'abîmé' as never }), scan('b', 'Maison B'));
    await st().loadSaves();
    expect(st().saves.map((s) => s.id)).toEqual(['a', 'b']);
    expect(st().saves[0].photos).toBeUndefined();
    expect(() => st().deleteSave('b')).not.toThrow();
    expect(st().saves.map((s) => s.id)).toEqual(['a']);
  });

  it('même un plan abîmé posé à la main ne fait pas lever `deleteSave`', () => {
    useScanStore.setState({
      saves: [scan('a', 'A', { photos: { x: 1 } as never }), scan('b', 'B', { photos: [null] as never })],
    });
    expect(() => st().deleteSave('b')).not.toThrow();
    expect(st().saves.map((s) => s.id)).toEqual(['a']);
  });

  it('un ménage qui lève ne coûte plus le relevé interrompu', async () => {
    ranger(scan('a', 'Maison A'));
    mockMagasin.set(DRAFT, JSON.stringify({ at: 1, name: 'Brouillon', walls: [mur('m1', 0, 0, 3, 0)] }));
    const vrai = st().purgerLesEchus;
    useScanStore.setState({
      purgerLesEchus: () => {
        throw new Error('ménage');
      },
    });
    try {
      await st().loadSaves();
    } finally {
      useScanStore.setState({ purgerLesEchus: vrai });
    }
    expect(st().brouillon?.name).toBe('Brouillon');
  });
});

describe('deux plans au même identifiant', () => {
  it('la reprise du compte ne pose qu’un plan par id', async () => {
    useScanStore.setState({ saves: [scan('a', 'Ici')], savesCharges: true });
    mockCatalogue.mockResolvedValue([{ scan: 'x' }, { scan: 'x' }, { scan: 'y' }]);
    mockReprendre.mockImplementation(async (_qui: unknown, id: string) => ({
      // La fiche « y » porte en fait le plan « a », déjà ici.
      contenu: JSON.stringify(scan(id === 'y' ? 'a' : id, `Serveur ${id}`)),
    }));
    const repris = await st().reprendreDuCompte({ id: 'u', jeton: 't' } as never);
    expect(repris).toBe(1);
    const ids = st().saves.map((s) => s.id);
    expect(ids.sort()).toEqual(['a', 'x']);
    expect(st().saves.find((s) => s.id === 'a')!.name).toBe('Ici');
  });

  it('un index qui cite deux fois un plan ne le charge qu’une fois', async () => {
    mockMagasin.set(cle('a'), JSON.stringify(scan('a', 'Maison A')));
    mockMagasin.set(INDEX, JSON.stringify(['a', 'a']));
    await st().loadSaves();
    expect(st().saves.map((s) => s.id)).toEqual(['a']);
  });
});

describe('reprendre un brouillon', () => {
  it('un brouillon incomplet se reprend, ce qui manque repart vide', () => {
    useScanStore.setState({
      brouillon: { at: 1, name: 'Vieux', walls: [mur('m1', 0, 0, 3, 0)] } as unknown as BrouillonScan,
    });
    expect(() => st().reprendreBrouillon()).not.toThrow();
    const s = st();
    expect(s.screen).toBe('result');
    expect(s.objects).toEqual([]);
    expect(s.rooms).toEqual([]);
    expect(s.openings).toEqual([]);
    expect(s.fixtures).toEqual([]);
    expect(s.ceiling).toEqual([]);
    expect(s.photos).toEqual([]);
    expect(s.modelPath).toBeNull();
  });

  it('un brouillon dont le dossier est à la corbeille redevient un plan à enregistrer', () => {
    useScanStore.setState({
      saves: [scan('p', 'Maison', { corbeille: 5_000 })],
      brouillon: {
        at: 1,
        name: 'Maison',
        saveId: 'p',
        walls: [mur('m1', 0, 0, 3, 0)],
        openings: [],
        objects: [],
        rooms: [],
        fixtures: [],
        ceiling: [],
        photos: [],
        modelPath: null,
      },
    });
    st().reprendreBrouillon();
    expect(st().currentSaveId).toBeNull();
  });

  it('enregistrer un plan à la corbeille l’en sort', () => {
    useScanStore.setState({
      saves: [scan('p', 'Maison', { corbeille: 5_000 })],
      currentSaveId: 'p',
      walls: [mur('m1', 0, 0, 3, 0)],
      scanName: 'Maison',
    });
    st().commitCurrent();
    expect(st().saves[0].corbeille).toBeUndefined();
  });
});

describe('retirer un étage', () => {
  it('les meubles sans pièce restent (ils sont au rez-de-chaussée)', () => {
    const t = (x: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.4, 1, 1];
    const meuble = (id: string, roomId?: string) =>
      ({ id, category: 'table', transform: t(1), width: 1, depth: 1, height: 0.8, ...(roomId ? { roomId } : {}) }) as never;
    useScanStore.setState({
      walls: [mur('m0', 0, 0, 4, 0), mur('m1', 0, 0, 4, 0, 1)],
      rooms: [
        { id: 'room-1', name: 'Bas', floor: null },
        { id: 'room-1-1', name: 'Haut', floor: null, niveau: 1 },
      ] as never,
      objects: [meuble('sansPiece'), meuble('enBas', 'room-1'), meuble('enHaut', 'room-1-1')],
      fixtures: [],
      photos: [],
      ceiling: [],
      notes: [],
      mesures: [],
    });
    st().retirerNiveau(1);
    expect(st().objects.map((o) => o.id)).toEqual(['sansPiece', 'enBas']);
    // Et c'est avec le rez-de-chaussée qu'ils partent, là où on les voit.
    st().undo();
    st().retirerNiveau(0);
    expect(st().objects.map((o) => o.id)).toEqual(['enHaut']);
  });
});

describe('noms des plans', () => {
  it('un plan sans nom en reçoit un : dupliquer et trier ne lèvent plus', async () => {
    const sansNom = scan('a', 'x');
    delete (sansNom as Partial<SavedScan>).name;
    ranger(sansNom);
    await st().loadSaves();
    expect(typeof st().saves[0].name).toBe('string');
    expect(st().saves[0].name.length).toBeGreaterThan(0);
    expect(() => st().duplicateSave('a')).not.toThrow();
  });

  it('dupliquer rend l’id de la copie, rangée juste après l’original', () => {
    useScanStore.setState({ saves: [scan('z', 'Premier'), scan('a', 'Maison')] });
    const id = st().duplicateSave('a');
    expect(id).not.toBeNull();
    const copie = st().saves.find((s) => s.id === id)!;
    expect(copie.name).toBe('Maison (copie)');
    // `saves[0]` n'est PAS la copie : c'est ce que le message lisait.
    expect(st().saves[0].id).toBe('z');
  });

  it('renommer sur un nom déjà pris donne « — version 2 », pas un doublon', () => {
    useScanStore.setState({ saves: [scan('a', 'Version A'), scan('b', 'Plan B')] });
    st().renameSave('b', 'version a');
    expect(st().saves.find((s) => s.id === 'b')!.name).toBe('version a — version 2');
    // Le plan ne se gêne pas lui-même.
    st().renameSave('a', 'Version A');
    expect(st().saves.find((s) => s.id === 'a')!.name).toBe('Version A');
  });

  it('dupliquer un nom de 60 signes reste à 60 signes', () => {
    const long = 'L'.repeat(NOM_PLAN_MAX);
    useScanStore.setState({ saves: [scan('a', long)] });
    const id1 = st().duplicateSave('a');
    const id2 = st().duplicateSave('a');
    const noms = [id1, id2].map((id) => st().saves.find((s) => s.id === id)!.name);
    for (const n of noms) expect(Array.from(n).length).toBeLessThanOrEqual(NOM_PLAN_MAX);
    expect(new Set(noms).size).toBe(2);
    expect(noms[1]).toMatch(/ — version 2$/);
  });

  it('nomDeVersion coupe la base avant le numéro', () => {
    const base = 'B'.repeat(NOM_PLAN_MAX);
    const n = nomDeVersion(base, [base]);
    expect(Array.from(n).length).toBe(NOM_PLAN_MAX);
    expect(n.endsWith(' — version 2')).toBe(true);
  });
});

describe('la corbeille', () => {
  it('restaurer ne change pas la date de modification', () => {
    useScanStore.setState({ saves: [scan('a', 'Maison', { updatedAt: 1_234, corbeille: 9_999 })] });
    st().restaurerDeLaCorbeille('a');
    expect(st().saves[0].corbeille).toBeUndefined();
    expect(st().saves[0].updatedAt).toBe(1_234);
  });

  it('Spotlight ne retient pas un plan à la corbeille', () => {
    const fiches = fichesSpotlight([
      { id: 'a', name: 'Gardé', updatedAt: 1 },
      { id: 'b', name: 'Jeté', updatedAt: 1, corbeille: 2 },
    ]);
    expect(fiches.map((f) => f.id)).toEqual(['a']);
  });
});

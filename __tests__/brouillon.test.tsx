/**
 * LE RELEVÉ QUI SURVIT À UNE APP TUÉE.
 *
 * Un scan tenait entièrement en mémoire tant qu'on n'avait pas touché
 * « Enregistrer ». Une app tuée par le système — un appel, une photo, un
 * téléphone à court de mémoire — et la visite était à refaire. C'est le seul
 * défaut de cette application qui coûte un déplacement.
 *
 * Le relevé s'écrit donc tout seul, toutes les trente secondes. Ce banc tient
 * les quatre choses qui font qu'un filet sert à quelque chose : il s'écrit,
 * il ne s'écrit pas pour rien, il se relit au démarrage, et il s'efface quand
 * il n'a plus lieu d'être.
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

/**
 * Le module natif : l'accueil s'y abonne au montage. Sans abonnement rendu,
 * le démontage cherche à retirer un écouteur qui n'existe pas.
 */
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    startHeading: jest.fn(async () => true),
    stopHeading: jest.fn(async () => true),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
}));

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { HomeScreen } from '../src/screens/HomeScreen';
import { useScanStore, type BrouillonScan } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

const CLE = 'roomscanner.brouillon.v1';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const MURS = [
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 3),
  mur('s', 4, 3, 0, 3),
  mur('w', 0, 3, 0, 0),
];

/** Le brouillon écrit sur le disque, tel qu'on le relira. */
const surLeDisque = (): BrouillonScan | null => {
  const brut = mockMagasin.get(CLE);
  return brut ? (JSON.parse(brut) as BrouillonScan) : null;
};

const releve = (walls: WallSeg[] = MURS) => {
  useScanStore.setState({
    walls,
    openings: [],
    objects: [],
    rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
    fixtures: [],
    ceiling: [],
    photos: [],
    scanName: 'Chantier test',
    currentSaveId: null,
    dirty: true,
    modelPath: null,
  });
};

beforeEach(() => {
  mockMagasin.clear();
  jest.useFakeTimers();
  useScanStore.setState({ brouillon: null, scanning: false });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('le brouillon s’écrit tout seul', () => {
  it('n’écrit rien avant trente secondes, puis écrit', async () => {
    releve();
    useScanStore.getState().setScanning(true);
    // Vingt-neuf secondes : rien. On n'use pas le stockage pour rien.
    jest.advanceTimersByTime(29000);
    expect(surLeDisque()).toBeNull();
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
    const b = surLeDisque();
    expect(b).not.toBeNull();
    expect(b!.walls).toHaveLength(4);
    expect(b!.name).toBe('Chantier test');
    expect(b!.at).toBeGreaterThan(0);
  });

  it('ne réécrit pas un relevé qui n’a pas bougé', async () => {
    const storage = jest.requireMock('@react-native-async-storage/async-storage');
    releve();
    useScanStore.getState().setScanning(true);
    jest.advanceTimersByTime(31000);
    await Promise.resolve();
    const ecritures = () =>
      storage.setItem.mock.calls.filter((c: string[]) => c[0] === CLE).length;
    const avant = ecritures();
    expect(avant).toBe(1);
    // Deux minutes sans toucher au plan : toujours une seule écriture.
    jest.advanceTimersByTime(120000);
    await Promise.resolve();
    expect(ecritures()).toBe(avant);
    // Un mur de plus, et il repart.
    releve([...MURS, mur('refend', 2, 0, 2, 3)]);
    jest.advanceTimersByTime(31000);
    await Promise.resolve();
    expect(ecritures()).toBe(avant + 1);
    expect(surLeDisque()!.walls).toHaveLength(5);
  });

  /**
   * UN RELEVÉ VIDE N'EST PAS UN RELEVÉ.
   *
   * Proposer au démarrage suivant de « reprendre » un scan sans un seul mur
   * ferait douter de tout le reste.
   */
  it('n’écrit rien tant qu’aucun mur n’est relevé', async () => {
    releve([]);
    useScanStore.getState().setScanning(true);
    jest.advanceTimersByTime(61000);
    await Promise.resolve();
    expect(surLeDisque()).toBeNull();
  });

  /**
   * ET IL S'EFFACE QUAND LE RELEVÉ EST À L'ABRI.
   *
   * Un scan enregistré vit dans la bibliothèque : le brouillon ferait
   * doublon, et proposerait de « reprendre » ce qui est déjà rangé.
   */
  it('s’efface quand le relevé est enregistré', async () => {
    releve();
    useScanStore.getState().setScanning(true);
    jest.advanceTimersByTime(31000);
    await Promise.resolve();
    expect(surLeDisque()).not.toBeNull();
    useScanStore.setState({ currentSaveId: 'save-1', dirty: false });
    jest.advanceTimersByTime(31000);
    await Promise.resolve();
    expect(surLeDisque()).toBeNull();
  });
});

describe('le brouillon retrouvé au démarrage', () => {
  it('se relit, et attend une réponse sans rien rouvrir', async () => {
    const b: BrouillonScan = {
      at: Date.now() - 60000,
      name: 'Visite du 12',
      walls: MURS,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
      fixtures: [],
      ceiling: [],
      photos: [],
      modelPath: null,
    };
    mockMagasin.set(CLE, JSON.stringify(b));
    useScanStore.setState({ screen: 'home', walls: [], brouillon: null });
    await useScanStore.getState().loadSaves();
    // Il est là, et l'écran n'a pas bougé : c'est une proposition.
    expect(useScanStore.getState().brouillon?.name).toBe('Visite du 12');
    expect(useScanStore.getState().screen).toBe('home');
    expect(useScanStore.getState().walls).toHaveLength(0);
  });

  it('se reprend, et devient le relevé courant, non enregistré', async () => {
    const b: BrouillonScan = {
      at: Date.now(),
      name: 'Visite du 12',
      walls: MURS,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
      fixtures: [],
      ceiling: [],
      photos: [],
      modelPath: null,
    };
    useScanStore.setState({ brouillon: b, walls: [], currentSaveId: 'x' });
    useScanStore.getState().reprendreBrouillon();
    const st = useScanStore.getState();
    expect(st.screen).toBe('result');
    expect(st.walls).toHaveLength(4);
    expect(st.scanName).toBe('Visite du 12');
    // Il n'a JAMAIS été enregistré : le bouton de sauvegarde doit s'offrir.
    expect(st.currentSaveId).toBeNull();
    expect(st.dirty).toBe(true);
    // Et la question ne se repose plus.
    expect(st.brouillon).toBeNull();
  });

  it('se jette, et ne revient pas', async () => {
    mockMagasin.set(CLE, JSON.stringify({ at: 1, name: 'x', walls: MURS }));
    useScanStore.setState({ brouillon: { at: 1, name: 'x', walls: MURS } as BrouillonScan });
    useScanStore.getState().oublierBrouillon();
    await Promise.resolve();
    expect(useScanStore.getState().brouillon).toBeNull();
    expect(mockMagasin.get(CLE)).toBeUndefined();
  });

  /**
   * UN BROUILLON VIDE NE SE PROPOSE PAS.
   *
   * Il peut rester d'une version précédente, ou d'une écriture interrompue.
   */
  it('ignore un brouillon sans mur, et le nettoie', async () => {
    mockMagasin.set(CLE, JSON.stringify({ at: Date.now(), name: 'vide', walls: [] }));
    useScanStore.setState({ brouillon: null });
    await useScanStore.getState().loadSaves();
    expect(useScanStore.getState().brouillon).toBeNull();
  });
});

/**
 * ET L'ACCUEIL LE PROPOSE — sans rien rouvrir de lui-même.
 *
 * Un relevé repris d'office serait pire que perdu : l'utilisateur a pu
 * quitter volontairement un essai raté, et se le voir réimposer au démarrage
 * ferait douter de ce que l'app garde.
 */
describe('l’accueil et le relevé interrompu', () => {
  const monter = () => {
    const arbre = TestRenderer.create(React.createElement(HomeScreen));
    return arbre;
  };
  const textes = (arbre: TestRenderer.ReactTestRenderer) =>
    arbre.root
      .findAllByType(Text)
      .map((n) =>
        (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
          .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
          .join(''),
      )
      .join(' | ');
  const bouton = (arbre: TestRenderer.ReactTestRenderer, label: string) =>
    arbre.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === label);

  it('n’affiche rien quand il n’y a rien à reprendre', () => {
    useScanStore.setState({ brouillon: null, supported: true, saves: [] });
    let arbre!: TestRenderer.ReactTestRenderer;
    act(() => {
      arbre = monter();
    });
    expect(textes(arbre)).not.toContain('Relevé interrompu');
    act(() => arbre.unmount());
  });

  it('annonce le relevé, ce qu’il contient et quand il date', () => {
    useScanStore.setState({
      supported: true,
      saves: [],
      brouillon: {
        at: Date.now() - 12 * 60000,
        name: 'Visite du 12',
        walls: MURS,
        openings: [],
        objects: [],
        rooms: [],
        fixtures: [],
        ceiling: [],
        photos: [],
        modelPath: null,
      },
    });
    let arbre!: TestRenderer.ReactTestRenderer;
    act(() => {
      arbre = monter();
    });
    const vu = textes(arbre);
    expect(vu).toContain('Relevé interrompu');
    // Ce qu'il contient : c'est à ça qu'on reconnaît SON relevé.
    expect(vu).toContain('4 murs');
    expect(vu).toContain('Visite du 12');
    // Et quand : un quart d'heure ou trois semaines, ce n'est pas le même
    // geste.
    expect(vu).toContain('il y a 12 min');
    expect(bouton(arbre, 'Reprendre le relevé')).toBeDefined();
    expect(bouton(arbre, 'Jeter le relevé interrompu')).toBeDefined();
    act(() => arbre.unmount());
  });

  it('reprend au doigt, et rouvre le plan', () => {
    useScanStore.setState({
      screen: 'home',
      supported: true,
      saves: [],
      walls: [],
      brouillon: {
        at: Date.now(),
        name: 'Visite du 12',
        walls: MURS,
        openings: [],
        objects: [],
        rooms: [],
        fixtures: [],
        ceiling: [],
        photos: [],
        modelPath: null,
      },
    });
    let arbre!: TestRenderer.ReactTestRenderer;
    act(() => {
      arbre = monter();
    });
    act(() => bouton(arbre, 'Reprendre le relevé')!.props.onPress());
    expect(useScanStore.getState().screen).toBe('result');
    expect(useScanStore.getState().walls).toHaveLength(4);
    act(() => arbre.unmount());
  });
});

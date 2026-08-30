/**
 * LE FILET COUVRE AUSSI L'ÉDITION — pas seulement le scan.
 *
 * Le brouillon des trente secondes existait pour « le seul défaut qui coûte
 * un déplacement » : une app tuée pendant un relevé. Mais sa minuterie ne
 * s'armait QUE dans `setScanning` — c'est-à-dire au scan LiDAR. Les trois
 * autres façons d'ouvrir un plan travaillaient sans filet :
 *
 *   — « Dessiner un plan » (et le tracé de l'accueil) : `commencerAuClavier`
 *     appelle `reset`, qui ARRÊTE la minuterie… et ne la relançait pas. Une
 *     heure à poser des murs et des prises au clavier, l'app jetée par iOS
 *     pendant un appel, et tout était perdu — exactement le scénario que le
 *     brouillon avait été construit pour empêcher ;
 *   — un dossier ouvert depuis la bibliothèque : vingt prises ajoutées sur
 *     place, mêmes trente secondes jamais écrites ;
 *   — et le brouillon REPRIS lui-même : le filet qui venait de vous sauver
 *     ne se réarmait pas.
 *
 * ET LE BROUILLON DIT DE QUEL DOSSIER IL VIENT. Sans `saveId`, la reprise
 * d'un dossier de bibliothèque renaissait en plan SANS entrée : on
 * enregistrait, et la bibliothèque portait deux « Maison Dupont » — l'ancien
 * sans les prises, le nouveau sans l'historique. Les retouches reviennent
 * maintenant dans LEUR dossier.
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

import {
  useScanStore,
  type BrouillonScan,
  type SavedScan,
} from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
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

const DOSSIER: SavedScan = {
  id: 'dupont-1',
  name: 'Maison Dupont',
  createdAt: 1,
  updatedAt: 1,
  modelPath: null,
  walls: [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('w', 0, 3, 0, 0)],
  openings: [],
  objects: [],
  rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
};

const surLeDisque = (): BrouillonScan | null => {
  const brut = mockMagasin.get(CLE);
  return brut ? (JSON.parse(brut) as BrouillonScan) : null;
};

/** Une retouche réelle : une pièce de plus, comme sur un chantier. */
const retoucher = () =>
  useScanStore.getState().addRoomRect({ x: 10, z: 10 }, { x: 13, z: 12 });

beforeEach(() => {
  jest.useFakeTimers();
  mockMagasin.clear();
  useScanStore.getState().reset();
  useScanStore.setState({ saves: [DOSSIER], brouillon: null });
  // Le palier gratuit n'est pas le sujet de ce banc.
  useAccountStore.setState({ pro: true });
  // `reset` vient d'effacer la clé : on repart d'un disque vraiment vide.
  mockMagasin.clear();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('la minuterie s’arme à chaque porte de l’éditeur', () => {
  it('un dossier ouvert depuis la bibliothèque est sous filet', () => {
    useScanStore.getState().openSave('dupont-1');
    retoucher();
    jest.advanceTimersByTime(31000);
    const b = surLeDisque();
    expect(b).not.toBeNull();
    // Deux pièces : celle du dossier, et la retouche.
    expect(b!.rooms).toHaveLength(2);
  });

  it('et le brouillon sait de quel dossier il vient', () => {
    useScanStore.getState().openSave('dupont-1');
    retoucher();
    jest.advanceTimersByTime(31000);
    expect(surLeDisque()!.saveId).toBe('dupont-1');
  });

  it('un plan dessiné au clavier est sous filet', () => {
    useScanStore.getState().commencerAuClavier();
    retoucher();
    jest.advanceTimersByTime(31000);
    expect(surLeDisque()).not.toBeNull();
  });

  it('mais un dossier ouvert SANS retouche n’écrit rien', () => {
    // Le contrôle en sens inverse : un brouillon d'un plan identique à sa
    // sauvegarde proposerait au prochain démarrage de « reprendre » du vide.
    useScanStore.getState().openSave('dupont-1');
    jest.advanceTimersByTime(61000);
    expect(surLeDisque()).toBeNull();
  });
});

describe('la reprise', () => {
  const BROUILLON: BrouillonScan = {
    at: 5,
    name: 'Maison Dupont',
    saveId: 'dupont-1',
    walls: DOSSIER.walls,
    openings: [],
    objects: [],
    rooms: [
      { id: 'r1', name: 'Séjour', floor: null },
      { id: 'r2', name: 'Cuisine', floor: null },
    ],
    fixtures: [],
    ceiling: [],
    photos: [],
    modelPath: null,
  };

  it('rouvre LE dossier, pas un clone', () => {
    useScanStore.setState({ brouillon: BROUILLON });
    useScanStore.getState().reprendreBrouillon();
    expect(useScanStore.getState().currentSaveId).toBe('dupont-1');
    // Enregistrer retombe donc dans l'entrée existante : une seule
    // « Maison Dupont » en bibliothèque.
    useScanStore.getState().commitCurrent();
    expect(useScanStore.getState().saves).toHaveLength(1);
    expect(useScanStore.getState().saves[0].rooms).toHaveLength(2);
  });

  it('mais un dossier disparu ne se fait pas usurper', () => {
    useScanStore.setState({
      brouillon: { ...BROUILLON, saveId: 'efface-depuis' },
    });
    useScanStore.getState().reprendreBrouillon();
    expect(useScanStore.getState().currentSaveId).toBeNull();
  });

  it('et le filet se réarme derrière elle', () => {
    useScanStore.setState({ brouillon: BROUILLON });
    useScanStore.getState().reprendreBrouillon();
    retoucher();
    jest.advanceTimersByTime(31000);
    expect(surLeDisque()).not.toBeNull();
  });
});

describe('l’enregistrement replie le filet', () => {
  it('sur-le-champ, pas au prochain tour de minuterie', () => {
    /*
      LA FENÊTRE DE TRENTE SECONDES ÉTAIT UN PIÈGE : on enregistre, on ferme
      l'app — et le brouillon d'AVANT l'enregistrement traîne sur le disque.
      Au prochain démarrage, l'accueil propose de « reprendre » un relevé
      déjà rangé, et la reprise fabrique le clone qu'on vient d'éviter.
    */
    useScanStore.getState().openSave('dupont-1');
    retoucher();
    jest.advanceTimersByTime(31000);
    expect(surLeDisque()).not.toBeNull();
    useScanStore.getState().commitCurrent();
    expect(surLeDisque()).toBeNull();
  });
});

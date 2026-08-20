/**
 * Photos de repérage.
 *
 * Un relevé se fait vite ; sa relecture, trois jours plus tard, achoppe
 * toujours sur la même question — « c'était quoi, ce mur ? ». La photo est
 * punaisée SUR un mur, à une cote : elle suit donc le plan, se sauvegarde
 * avec lui, et disparaît avec le mur qu'elle décrivait.
 *
 * Le fichier, lui, vit dans les Documents de l'app : il ne survit pas à une
 * réinstallation, exactement comme le `.usdz` du scan. L'app doit donc
 * supporter un chemin mort sans broncher — c'est le cas testé en dernier.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { NativeModules } from 'react-native';
import { type WallSeg } from '../src/geometry/floorplan';
import { useScanStore, type SavedScan } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());
beforeEach(() => jest.advanceTimersByTime(2000));

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const PIECE: WallSeg[] = [
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 3),
  mur('s', 4, 3, 0, 3),
  mur('w', 0, 3, 0, 0),
];

const neuf = () =>
  useScanStore.setState({
    walls: PIECE,
    rooms: [{ id: 'r1', name: 'Séjour', wallIds: PIECE.map((w) => w.id) }],
    objects: [],
    openings: [],
    fixtures: [],
    photos: [],
    saves: [],
    currentSaveId: null,
    scanName: 'Essai',
  });

describe('punaiser une photo', () => {
  it('la range sur son mur, à sa cote, horodatée', () => {
    neuf();
    const id = useScanStore.getState().addPhoto('n', 2, '/tmp/p1.jpg');
    const [ph] = useScanStore.getState().photos;
    expect(ph.id).toBe(id);
    expect(ph.wallId).toBe('n');
    expect(ph.along).toBe(2);
    expect(ph.path).toBe('/tmp/p1.jpg');
    expect(ph.at).toBeGreaterThan(0);
    expect(useScanStore.getState().dirty).toBe(true);
  });

  it('plusieurs photos cohabitent, sur le même mur ou non', () => {
    neuf();
    useScanStore.getState().addPhoto('n', 1, '/tmp/a.jpg');
    useScanStore.getState().addPhoto('n', 3, '/tmp/b.jpg');
    useScanStore.getState().addPhoto('e', 1.5, '/tmp/c.jpg');
    expect(useScanStore.getState().photos).toHaveLength(3);
    expect(
      new Set(useScanStore.getState().photos.map((p) => p.id)).size,
    ).toBe(3);
  });

  it('se retire, et l’annulation la rend', () => {
    neuf();
    const id = useScanStore.getState().addPhoto('n', 2, '/tmp/p1.jpg');
    jest.advanceTimersByTime(2000);
    useScanStore.getState().removePhoto(id);
    expect(useScanStore.getState().photos).toHaveLength(0);
    useScanStore.getState().undo();
    expect(useScanStore.getState().photos).toHaveLength(1);
    expect(useScanStore.getState().photos[0].id).toBe(id);
  });
});

describe('la photo suit le scan', () => {
  it('part avec la sauvegarde, et revient à l’ouverture', () => {
    neuf();
    useScanStore.getState().addPhoto('n', 2, '/tmp/p1.jpg');
    useScanStore.getState().saveAsCopy('Scan photo');
    const save = useScanStore.getState().saves[0];
    expect(save.photos).toHaveLength(1);
    expect(save.photos?.[0].path).toBe('/tmp/p1.jpg');

    // On repart de zéro, puis on rouvre.
    useScanStore.getState().reset();
    expect(useScanStore.getState().photos).toHaveLength(0);
    useScanStore.getState().openSave(save.id);
    expect(useScanStore.getState().photos).toHaveLength(1);
    expect(useScanStore.getState().photos[0].wallId).toBe('n');
  });

  it('un scan d’avant les photos s’ouvre sans en inventer', () => {
    neuf();
    const ancien: SavedScan = {
      id: 'vieux',
      name: 'Scan de l’an dernier',
      createdAt: 1,
      updatedAt: 1,
      modelPath: null,
      rooms: [{ id: 'r1', name: 'Séjour', wallIds: ['n'] }],
      walls: PIECE,
      openings: [],
      objects: [],
    };
    useScanStore.setState({ saves: [ancien] });
    useScanStore.getState().openSave('vieux');
    expect(useScanStore.getState().photos).toEqual([]);
  });

  it('un mur supprimé emporte sa photo, et l’annulation rend tout', () => {
    // Le tour de l'application a retourné la règle : la photo orpheline
    // restait dans le scan SANS punaise ni feuille — introuvable à
    // l'écran, gardée dans la sauvegarde, son fichier jamais éligible au
    // ménage. Elle part maintenant avec son mur, et l'annulation rend le
    // mur ET la photo, fichier compris (rien n'est effacé tant que
    // l'histoire peut revenir... le fichier ne part que s'il ne sert à
    // aucune sauvegarde).
    neuf();
    useScanStore.getState().addPhoto('n', 2, '/tmp/p1.jpg');
    // Une sauvegarde référence la photo : son FICHIER doit survivre à la
    // suppression du mur — seule l'entrée du plan courant s'en va.
    useScanStore.getState().saveAsCopy('Avec photo');
    jest.advanceTimersByTime(2000);
    useScanStore.getState().removeWall('n');
    expect(useScanStore.getState().photos).toHaveLength(0);
    expect(useScanStore.getState().walls.some((w) => w.id === 'n')).toBe(false);
    useScanStore.getState().undo();
    expect(useScanStore.getState().walls.some((w) => w.id === 'n')).toBe(true);
    expect(useScanStore.getState().photos).toHaveLength(1);
  });
});

describe('le ménage des fichiers', () => {
  it('supprimer un scan efface SES photos, et pas celles des autres', () => {
    const efface: string[][] = [];
    (NativeModules as Record<string, unknown>).RoomScanPhoto = {
      deletePhotos: (paths: string[]) => {
        efface.push(paths);
        return Promise.resolve(paths.length);
      },
    };
    neuf();
    useScanStore.getState().addPhoto('n', 1, '/photos/a.jpg');
    useScanStore.getState().saveAsCopy('Premier');
    const premier = useScanStore.getState().saves[0];

    neuf();
    useScanStore.getState().addPhoto('n', 1, '/photos/b.jpg');
    useScanStore.setState({ saves: [premier, ...useScanStore.getState().saves] });
    useScanStore.getState().saveAsCopy('Second');

    useScanStore.getState().deleteSave(premier.id);
    expect(efface).toHaveLength(1);
    expect(efface[0]).toEqual(['/photos/a.jpg']);
    delete (NativeModules as Record<string, unknown>).RoomScanPhoto;
  });

  it('une image partagée par deux scans n’est pas effacée', () => {
    const efface: string[][] = [];
    (NativeModules as Record<string, unknown>).RoomScanPhoto = {
      deletePhotos: (paths: string[]) => {
        efface.push(paths);
        return Promise.resolve(paths.length);
      },
    };
    neuf();
    useScanStore.getState().addPhoto('n', 1, '/photos/commune.jpg');
    useScanStore.getState().saveAsCopy('A');
    const a = useScanStore.getState().saves[0];
    useScanStore.getState().saveAsCopy('B');
    useScanStore.getState().deleteSave(a.id);
    // Le second scan la référence encore : on ne touche à rien.
    expect(efface).toHaveLength(0);
    delete (NativeModules as Record<string, unknown>).RoomScanPhoto;
  });

  // Le presse-papier de mur a vécu avec son bouton : le lien l'a remplacé
  // (voir liermur.test), et un lien vit DANS le scan — rien à vider en
  // changeant de plan.
});

/**
 * LES MODÈLES 3D NE S'ACCUMULENT PLUS.
 *
 * Chaque relevé écrit un `.usdz` dans les Documents de l'app — quelques
 * mégaoctets — et personne ne l'effaçait jamais : supprimer un scan
 * emportait ses photos, JAMAIS son modèle. Vingt chantiers plus tard, le
 * téléphone est plein.
 *
 * Ce n'est pas une hypothèse : l'installation d'une mise à jour a fini par
 * échouer faute de place sur l'appareil du patron. Une app qui remplit un
 * téléphone sans jamais rendre un octet est une app qu'on finit par
 * désinstaller.
 */
describe('le ménage des modèles 3D', () => {
  it('efface ceux qu’aucun scan ne réclame plus', async () => {
    const gardes: string[][] = [];
    (NativeModules as Record<string, unknown>).RoomScanPhoto = {
      cleanModels: (paths: string[]) => {
        gardes.push(paths);
        return Promise.resolve(4096);
      },
      deletePhotos: () => Promise.resolve(0),
    };
    neuf();
    useScanStore.setState({ modelPath: '/docs/scan-A.usdz' });
    useScanStore.getState().saveAsCopy('Premier');
    const premier = useScanStore.getState().saves[0];

    neuf();
    useScanStore.setState({
      modelPath: '/docs/scan-B.usdz',
      saves: [premier],
    });
    useScanStore.getState().saveAsCopy('Second');

    useScanStore.getState().deleteSave(premier.id);
    await Promise.resolve();
    // Le ménage reçoit les modèles ENCORE référencés : c'est lui qui
    // efface le reste, plutôt qu'une liste de fichiers à supprimer —
    // ainsi les orphelins des versions précédentes partent aussi.
    expect(gardes).toHaveLength(1);
    expect(gardes[0]).toContain('/docs/scan-B.usdz');
    expect(gardes[0]).not.toContain('/docs/scan-A.usdz');
    delete (NativeModules as Record<string, unknown>).RoomScanPhoto;
  });

  it('balaie les orphelins des versions d’avant, à l’ouverture', async () => {
    // Le ménage à la suppression ne rend rien à qui ne supprime aucun scan :
    // les modèles déjà entassés par les versions précédentes resteraient là
    // pour toujours, et c'est précisément eux qui ont rempli le téléphone.
    // L'ouverture de la bibliothèque balaie donc les Documents en gardant ce
    // que les sauvegardes réclament — la place revient d'elle-même.
    const gardes: string[][] = [];
    (NativeModules as Record<string, unknown>).RoomScanPhoto = {
      cleanModels: (paths: string[]) => {
        gardes.push(paths);
        return Promise.resolve(12_000_000);
      },
    };
    neuf();
    await useScanStore.getState().loadSaves();
    expect(gardes).toHaveLength(1);
    // Et l'app le DIT : un ménage silencieux laisse le patron devant le même
    // téléphone plein, sans savoir si quelque chose a servi.
    await Promise.resolve();
    expect(useScanStore.getState().placeRendue).toBe(12_000_000);
    delete (NativeModules as Record<string, unknown>).RoomScanPhoto;
  });
});

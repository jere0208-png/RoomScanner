/**
 * GAINS RAPIDES — FIABILITÉ.
 *
 * Cinq défauts qu'on ne voyait qu'au mauvais moment, sur le téléphone du
 * chantier :
 *
 *   1. le garde-fou ne gardait rien en production : l'erreur fatale partait
 *      telle quelle à React Native, qui fermait l'app avant « Reprendre » ;
 *   2. les photos gardées par chemin absolu se perdaient au changement de
 *      conteneur (mise à jour, restauration, nouvel iPhone), et l'export
 *      les omettait en silence ;
 *   3. un « Enregistrer » suivi d'un verrouillage attendait encore 600 ms ;
 *   4. les pannes montrées n'allaient jamais au journal, et l'export
 *      accusait toujours le manque de place ;
 *   5. un plan d'un format plus récent était réécrit au nôtre.
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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { RoomScan } from 'react-native-room-scan';
import { GardeFou } from '../src/components/GardeFou';
import { ExportScreen } from '../src/screens/ExportScreen';
import {
  SCHEMA_PLAN,
  ecrirePlansMaintenant,
  resetPersistCache,
  useScanStore,
  type SavedScan,
} from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { useAlerte } from '../src/ui/alerte';
import { usePannes } from '../src/ui/journalPannes';
import { panne, signaler } from '../src/ui/panne';
import { cheminVivant, phrasePhotosIntrouvables, retenirDocuments } from '../src/ui/photos';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const cle = (id: string) => `roomscanner.scan.v2.${id}`;
const attendre = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

// ------------------------------------------------------------------ 1
describe('le garde-fou garde aussi en production', () => {
  interface Utils {
    getGlobalHandler: () => (e: unknown, fatal?: boolean) => void;
    setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void;
  }
  const g = global as unknown as { ErrorUtils?: Utils; __DEV__: boolean };
  let avant: Utils | undefined;
  let dev: boolean;
  let plateforme: jest.Mock;
  let arbre: TestRenderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    avant = g.ErrorUtils;
    dev = g.__DEV__;
    plateforme = jest.fn();
    let courant: (e: unknown, fatal?: boolean) => void = plateforme;
    g.ErrorUtils = {
      getGlobalHandler: () => courant,
      setGlobalHandler: (h) => {
        courant = h;
      },
    };
  });
  afterEach(() => {
    act(() => arbre?.unmount());
    arbre = null;
    g.ErrorUtils = avant;
    g.__DEV__ = dev;
  });

  const monter = (abri: () => void) => {
    act(() => {
      arbre = TestRenderer.create(
        <GardeFou ecran={() => 'result'} mettreALAbri={abri}>
          <View />
        </GardeFou>,
      );
    });
    return arbre!;
  };

  it('hors développement, React Native ne reçoit plus l’erreur comme fatale', () => {
    g.__DEV__ = false;
    const abri = jest.fn();
    const t = monter(abri);
    const boum = new Error('le meuble touché n’existe plus');
    act(() => g.ErrorUtils!.getGlobalHandler()(boum, true));
    // Toujours transmise (console, rapports), mais NON fatale : pas de RCTFatal.
    expect(plateforme).toHaveBeenCalledWith(boum, false);
    // Le travail part sur le disque, puis l'écran « Reprendre » s'affiche.
    expect(abri).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(t.toJSON())).toContain('Reprendre');
    expect(usePannes.getState().incidents[0]).toMatchObject({ fatale: true });
  });

  it('en développement, rien ne change : l’écran rouge reste', () => {
    g.__DEV__ = true;
    monter(jest.fn());
    const boum = new Error('boum');
    act(() => g.ErrorUtils!.getGlobalHandler()(boum, true));
    expect(plateforme).toHaveBeenCalledWith(boum, true);
  });

  it('une mise à l’abri qui casse n’empêche pas l’écran', () => {
    g.__DEV__ = false;
    const t = monter(() => {
      throw new Error('disque absent');
    });
    act(() => g.ErrorUtils!.getGlobalHandler()(new Error('x'), true));
    expect(JSON.stringify(t.toJSON())).toContain('Reprendre');
  });

  it('une erreur non fatale ne met rien à l’abri et ne montre rien', () => {
    g.__DEV__ = false;
    const abri = jest.fn();
    const t = monter(abri);
    act(() => g.ErrorUtils!.getGlobalHandler()(new Error('petit souci'), false));
    expect(abri).not.toHaveBeenCalled();
    expect(JSON.stringify(t.toJSON())).not.toContain('Reprendre');
  });

  it('l’application met le brouillon et l’écriture en attente à l’abri', () => {
    const app = lire('App.tsx');
    expect(app).toMatch(/mettreALAbri=\{\(\) => \{[\s\S]*?brouillonAuDepart\(\);[\s\S]*?ecrirePlansMaintenant\(\);/);
  });
});

// ------------------------------------------------------------------ 2
describe('les photos survivent au changement de conteneur', () => {
  const ANCIEN = '/var/mobile/Containers/Data/Application/AAAA-1111/Documents';
  const NEUF = '/var/mobile/Containers/Data/Application/BBBB-2222/Documents';
  afterEach(() => retenirDocuments(null));

  it('le chemin d’un ancien conteneur est rebranché sur les Documents d’aujourd’hui', () => {
    retenirDocuments(NEUF);
    expect(cheminVivant(`${ANCIEN}/photos/p-17.jpg`)).toBe(`${NEUF}/photos/p-17.jpg`);
    expect(cheminVivant(`file://${ANCIEN}/mur-X.jpg`)).toBe(`${NEUF}/mur-X.jpg`);
    // Déjà au bon endroit : inchangé.
    expect(cheminVivant(`${NEUF}/photos/p-17.jpg`)).toBe(`${NEUF}/photos/p-17.jpg`);
  });

  it('sans Documents connus, ou hors des Documents, le chemin reste tel quel', () => {
    expect(cheminVivant(`${ANCIEN}/photos/p-17.jpg`)).toBe(`${ANCIEN}/photos/p-17.jpg`);
    retenirDocuments(NEUF);
    expect(cheminVivant('/tmp/capture.png')).toBe('/tmp/capture.png');
  });

  it('les deux écrans de photo et l’export passent par le chemin rebranché', () => {
    expect(lire('src/screens/result/PhotoSheet.tsx')).toContain('file://${cheminVivant(ph.path)}');
    expect(lire('src/components/WallElevation.tsx')).toContain('file://${cheminVivant(photoDuCalque!.path)}');
    expect(lire('src/screens/ExportScreen.tsx')).toContain('RoomScan.readPhoto(cheminVivant(ph.path), 900)');
  });

  it('le natif retrouve la photo par son nom, sans jamais sortir du dossier des photos', () => {
    const swift = lire('modules/react-native-room-scan/ios/RoomScanPhoto.swift');
    expect(swift).toContain('static func resolvePhoto(_ path: String) -> URL?');
    expect(swift).toContain('guard let url = RoomScanPhoto.resolvePhoto(path),');
    expect(swift).toContain('guard let url = RoomScanPhoto.resolvePhoto(p) else { continue }');
    expect(swift).toContain('nom != ".."');
    expect(lire('modules/react-native-room-scan/ios/RoomScan.m')).toContain('RCT_EXTERN_METHOD(documentsDir:');
    expect(lire('modules/react-native-room-scan/ios/RoomScanExport.swift')).toContain(
      'return RoomScanPhoto.resolvePhoto(clean)',
    );
  });

  it('la phrase nomme les murs comme la fiche de la photo', () => {
    const une = phrasePhotosIntrouvables([3.2]);
    expect(une.titre).toBe('Une photo introuvable');
    expect(une.message).toContain('(mur de 3,20 m)');
    expect(une.message).toMatch(/exportez sans elle\.$/);
    const deux = phrasePhotosIntrouvables([3.2, 4.05, 3.2, null]);
    expect(deux.titre).toBe('4 photos introuvables');
    expect(deux.message).toContain('(mur de 3,20 m, mur de 4,05 m et mur supprimé)');
    expect(deux.message).toMatch(/sans elles\.$/);
  });

  describe('l’export prévient avant de partir sans elles', () => {
    const partager = RoomScan.sharePDF as unknown as jest.Mock;
    const relire = RoomScan.readPhoto as unknown as jest.Mock;
    const apercu = RoomScan.apercuPdf as unknown as jest.Mock;
    let arbre: TestRenderer.ReactTestRenderer | null = null;

    beforeAll(() => jest.useFakeTimers());
    afterAll(() => jest.useRealTimers());
    afterEach(() => {
      act(() => arbre?.unmount());
      arbre = null;
      relire.mockReset();
      relire.mockImplementation(async () => null);
      act(() => useAccountStore.setState({ compte: null, pro: false }));
      act(() => useAlerte.setState({ courante: null, file: [] } as never));
    });

    const monter = (photos: unknown[]) => {
      apercu.mockReset();
      apercu.mockImplementation(async () => ['IMG0']);
      act(() => {
        useAccountStore.setState({ compte: { id: 'u1', methode: 'apple' }, pro: true } as never);
        useScanStore.getState().setClientInfo('Mme Durand', '12 rue des Lilas');
        useScanStore.setState({
          screen: 'export',
          scanName: 'Chantier test',
          walls: SNAPSHOT_WALLS,
          openings: SNAPSHOT_OPENINGS,
          objects: SNAPSHOT_OBJECTS,
          rooms: SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: `Pièce ${i + 1}`, floor: null })),
          fixtures: SNAPSHOT_FIXTURES,
          ceiling: [],
          photos: photos as never,
          north: 0,
        });
        arbre = TestRenderer.create(<ExportScreen />);
      });
      act(() => {
        for (const n of arbre!.root.findAllByType(View)) {
          if (typeof n.props.onLayout === 'function') {
            n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
          }
        }
      });
      return arbre!;
    };
    const avancer = async (ms: number) => {
      await act(async () => {
        jest.advanceTimersByTime(ms);
        await attendre();
      });
    };
    const exporter = async (t: TestRenderer.ReactTestRenderer) => {
      const b = t.root.findAll(
        (n) => n.props.accessibilityLabel === 'Exporter le PDF' && typeof n.props.onPress === 'function',
        { deep: false },
      )[0];
      await act(async () => {
        b.props.onPress();
        jest.advanceTimersByTime(50);
        await attendre();
      });
      await avancer(50);
    };
    const mur = SNAPSHOT_WALLS[0];
    const photo = {
      id: 'ph1',
      wallId: mur.id,
      along: 0.5,
      path: '/var/mobile/Containers/Data/Application/AAAA/Documents/photos/p-1.jpg',
      at: 1,
    };

    it('une photo qui ne se relit plus : on le dit, rien ne part', async () => {
      const t = monter([photo]);
      await avancer(800);
      partager.mockClear();
      await exporter(t);
      expect(relire).toHaveBeenCalled();
      const a = useAlerte.getState().courante;
      expect(a?.titre).toBe('Une photo introuvable');
      expect(a?.message).toMatch(/mur de \d+,\d\d m/);
      expect(partager).not.toHaveBeenCalled();
      // « Exporter quand même » : le dossier part, sans elle.
      await act(async () => {
        a!.actions!.find((x) => x.label === 'Exporter quand même')!.onPress!();
        jest.advanceTimersByTime(50);
        await attendre();
      });
      await avancer(50);
      expect(partager).toHaveBeenCalledTimes(1);
    });

    it('une photo qui se relit : aucune question', async () => {
      relire.mockImplementation(async () => 'QUJD');
      const t = monter([photo]);
      await avancer(800);
      partager.mockClear();
      await exporter(t);
      expect(useAlerte.getState().courante).toBeNull();
      expect(partager).toHaveBeenCalledTimes(1);
    });

    it('les photos prises seules par le scan ne déclenchent pas la question', async () => {
      const t = monter([{ ...photo, auto: true }]);
      await avancer(800);
      partager.mockClear();
      await exporter(t);
      expect(useAlerte.getState().courante).toBeNull();
      expect(partager).toHaveBeenCalledTimes(1);
    });
  });
});

// ------------------------------------------------------------------ 3 et 5
const scan = (id: string, name: string, extra: Partial<SavedScan> = {}): SavedScan => ({
  id,
  name,
  createdAt: 1_000,
  updatedAt: 1_000,
  modelPath: null,
  walls: SNAPSHOT_WALLS,
  openings: [],
  objects: [],
  rooms: [{ id: 'room-1', name: '', floor: null }],
  ...extra,
});

describe('l’écriture en attente part quand on range le téléphone', () => {
  beforeEach(() => {
    mockDisque.clear();
    resetPersistCache();
    useAccountStore.setState({ pro: true, plansUtilises: 0, bonusEssais: 0 } as never);
    useScanStore.setState({
      walls: SNAPSHOT_WALLS,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Salon', floor: null }],
      fixtures: [],
      ceiling: [],
      photos: [],
      saves: [],
      panne: null,
      scanName: 'Chantier',
    });
  });

  it('enregistrer, puis passer en arrière-plan : écrit sans attendre 600 ms', async () => {
    jest.useFakeTimers();
    try {
      const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage');
      useScanStore.getState().saveAsCopy('Chantier');
      const id = useScanStore.getState().saves[0].id;
      AsyncStorage.setItem.mockClear();
      // Rien encore : l'écriture attend ses 600 ms.
      expect(mockDisque.has(cle(id))).toBe(false);
      ecrirePlansMaintenant();
      await attendre();
      expect(mockDisque.has(cle(id))).toBe(true);
      // Et la minuterie ne réécrit pas une seconde fois.
      const n = AsyncStorage.setItem.mock.calls.length;
      jest.advanceTimersByTime(1000);
      await attendre();
      expect(AsyncStorage.setItem.mock.calls.length).toBe(n);
    } finally {
      jest.useRealTimers();
    }
  });

  it('rien en attente : rien ne s’écrit', async () => {
    const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage');
    AsyncStorage.setItem.mockClear();
    ecrirePlansMaintenant();
    await attendre();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('l’application l’appelle en passant en arrière-plan', () => {
    expect(lire('App.tsx')).toMatch(/brouillonAuDepart\(\);\s*\/\/[^\n]*\n\s*ecrirePlansMaintenant\(\);/);
  });
});

describe('la version du format ne recule jamais', () => {
  beforeEach(() => {
    mockDisque.clear();
    resetPersistCache();
  });

  it('un plan en format plus récent, rechargé puis réenregistré, le garde', async () => {
    jest.useFakeTimers();
    try {
      const futur = SCHEMA_PLAN + 1;
      mockDisque.set(cle('a'), JSON.stringify(scan('a', 'Maison A', { schema: futur })));
      mockDisque.set('roomscanner.index.v2', JSON.stringify(['a']));
      useScanStore.setState({ saves: [], savesCharges: false });
      await useScanStore.getState().loadSaves();
      expect(useScanStore.getState().saves[0].schema).toBe(futur);
      // Renommé : il se réécrit.
      useScanStore.getState().renameSave('a', 'Maison A bis');
      jest.advanceTimersByTime(700);
      await attendre();
      const ecrit = JSON.parse(mockDisque.get(cle('a'))!);
      expect(ecrit.name).toBe('Maison A bis');
      expect(ecrit.schema).toBe(futur);
    } finally {
      jest.useRealTimers();
    }
  });

  it('un plan sans version, ou à une version absurde, s’écrit à la nôtre', async () => {
    jest.useFakeTimers();
    try {
      mockDisque.set(cle('b'), JSON.stringify(scan('b', 'Maison B')));
      mockDisque.set('roomscanner.index.v2', JSON.stringify(['b']));
      useScanStore.setState({ saves: [], savesCharges: false });
      await useScanStore.getState().loadSaves();
      useScanStore.setState({
        saves: useScanStore.getState().saves.map((s) => ({ ...s, schema: Number.NaN, updatedAt: 2_000 })),
      });
      useScanStore.getState().renameSave('b', 'Maison B bis');
      jest.advanceTimersByTime(700);
      await attendre();
      expect(JSON.parse(mockDisque.get(cle('b'))!).schema).toBe(SCHEMA_PLAN);
    } finally {
      jest.useRealTimers();
    }
  });
});

// ------------------------------------------------------------------ 4
describe('les pannes montrées vont au journal, avec la vraie cause', () => {
  beforeEach(() => usePannes.setState({ incidents: [] } as never));

  it('l’export n’accuse plus le stockage sans raison', () => {
    const m = panne('export', new Error('Cannot read property x of undefined')).message;
    expect(m).not.toMatch(/place/);
    expect(m).toMatch(/Réessayez/);
    expect(panne('export').message).not.toMatch(/place/);
  });

  it('mais le dit quand le système parle de stockage plein', () => {
    for (const cause of [
      new Error('ENOSPC: no space left on device'),
      { code: 'WRITE_FAILED', message: 'NSFileWriteOutOfSpaceError' },
      new Error('espace insuffisant'),
    ]) {
      expect(panne('export', cause).message).toMatch(/place sur le téléphone/);
    }
  });

  it('`signaler` écrit au journal, non fatale, avec l’écran et le sujet', () => {
    const p = signaler('export', new Error('pdf: NaN dans la cote'), 'export');
    expect(p).toEqual(panne('export', new Error('pdf: NaN dans la cote')));
    const inc = usePannes.getState().incidents[0];
    expect(inc).toMatchObject({ message: 'pdf: NaN dans la cote', ecran: 'export · export', fatale: false });
  });

  it('une annulation n’est pas une panne', () => {
    signaler('achat', { code: 'E_USER_CANCELLED', message: 'User cancelled' }, 'paywall');
    expect(usePannes.getState().incidents).toEqual([]);
  });

  it('les écrans attrapent par `signaler`, et ne calculent plus deux fois', () => {
    const ecrans = [
      'src/screens/ExportScreen.tsx',
      'src/screens/ResultScreen.tsx',
      'src/screens/DevisScreen.tsx',
      'src/screens/PaywallScreen.tsx',
      'src/screens/ProfilScreen.tsx',
      'src/screens/SignInScreen.tsx',
      'src/components/JournalSheet.tsx',
      'src/ui/partageRendu.ts',
    ];
    for (const f of ecrans) {
      const src = lire(f);
      expect(`${f} : ${/signaler\(/.test(src)}`).toBe(`${f} : true`);
      expect(`${f} : ${/expliquer\('\w+', \w+\)\.titre, expliquer/.test(src)}`).toBe(`${f} : false`);
    }
  });
});

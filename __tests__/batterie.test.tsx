/**
 * LA BATTERIE PENDANT UN SCAN — ce qu'on fait en trop, et ce qu'on mesure.
 *
 * Relevé du patron : « la recherche scan de l'app consomme beaucoup de
 * batterie sur l'iPhone ». RoomPlan lui-même — caméra à 60 images, LiDAR,
 * reconstruction — est le gros de la dépense et ne se discute pas. Mais en
 * relisant ce que NOUS ajoutons par-dessus, quatre postes tournaient pour
 * rien :
 *
 *   1. les SURFACES ENTIÈRES (identifiant, dimensions, confiance, matrice de
 *      seize nombres chacune) traversaient le pont vers le JavaScript deux
 *      fois par seconde — pour en tirer un compte de murs douteux. Le compte
 *      se fait désormais en natif, et il ne part que s'il a changé ;
 *   2. l'ÉCHANTILLONNEUR DE COULEURS lisait l'image caméra cinq fois par
 *      seconde même téléphone immobile — cinq fois la même image, pour la
 *      même médiane. Il ne lit plus que si l'œil a bougé ;
 *   3. la BOUSSOLE moyennait le cap jusqu'à la fin du scan : après deux
 *      minutes, la moyenne ne bouge plus d'un dixième de degré. Elle
 *      s'arrête d'elle-même ;
 *   4. l'HORLOGE DES REPÈRES battait trente fois par seconde dès que la vue
 *      existait, repères ou pas. Elle ne bat que s'il y a quelque chose à
 *      placer.
 *
 * ET ON MESURE, sinon on ne saura jamais : à la fin de chaque scan, le natif
 * rend sa durée, la batterie consommée (à 1 % près, c'est ce qu'iOS donne)
 * et l'état thermique. Le Diagnostic l'affiche. C'est le seul chiffre qui
 * permettra de dire si l'étape suivante (le maillage LiDAR) coûte ou non.
 *
 * Le natif ne s'exécute pas ici : ses règles se lisent dans sa source, et
 * ce que le JavaScript en fait s'éprouve pour de bon.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { RoomScan } from 'react-native-room-scan';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ScanScreen } from '../src/screens/ScanScreen';
import { JournalSheet } from '../src/components/JournalSheet';
import { useScanStore } from '../src/store/scanStore';
import { usePannes } from '../src/ui/journalPannes';
import { phraseEnergie } from '../src/ui/energie';
import { useAstuce } from '../src/ui/astuce';

const racine = join(__dirname, '..');
const lire = (p: string) => readFileSync(join(racine, p), 'utf8');
const natif = (f: string) => lire(`modules/react-native-room-scan/ios/${f}`);

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  jest.restoreAllMocks();
  act(() => usePannes.setState({ dernierScan: null }));
});

describe('1 — le compte des murs douteux vient du natif', () => {
  const surface = (id: string, confidence: string) => ({
    id,
    type: 'wall',
    length: 3,
    height: 2.5,
    confidence,
    category: 'wall',
    transform: [],
  });

  it('le JavaScript prend le nombre tel quel, sans surfaces', () => {
    useScanStore.getState().applyLiveUpdate({
      wallCount: 5,
      objectCount: 1,
      doorCount: 2,
      windowCount: 2,
      mursDouteux: 3,
    });
    const s = useScanStore.getState();
    expect(s.mursDouteux).toBe(3);
    expect(s.wallCount).toBe(5);
    expect(s.doorCount).toBe(2);
  });

  it('et sait encore compter lui-même si un natif ancien envoie les surfaces', () => {
    useScanStore.getState().applyLiveUpdate({
      wallCount: 3,
      objectCount: 0,
      doorCount: 0,
      windowCount: 0,
      surfaces: [surface('a', 'high'), surface('b', 'low'), surface('c', 'medium')],
    } as never);
    expect(useScanStore.getState().mursDouteux).toBe(2);
  });

  it('le natif ne met plus les surfaces dans l’aperçu, et ne parle que si ça change', () => {
    const m = natif('RoomScanManager.swift');
    const bloc = m.slice(m.indexOf('didUpdate room: CapturedRoom'), m.indexOf('didProvide instruction'));
    expect(bloc).toContain('"mursDouteux"');
    expect(bloc).not.toContain('"surfaces"');
    expect(bloc).toContain('dernierApercu');
  });
});

describe('2 — l’échantillonneur ne lit l’image que si l’œil a bougé', () => {
  it('garde la dernière pose et compare avant de verrouiller l’image', () => {
    const s = natif('RoomScanTexture.swift');
    const tick = s.slice(s.indexOf('private func tick()'), s.indexOf('private func sampleSurface'));
    expect(tick).toContain('dernierePose');
    // La comparaison vient AVANT la lecture de l'image : c'est elle qui coûte.
    expect(tick.indexOf('dernierePose')).toBeLessThan(tick.indexOf('FrameImage(frame: frame)'));
    expect(s).toMatch(/SEUIL_DEPLACEMENT|seuilDeplacement/);
  });
});

describe('3 — la boussole s’arrête d’elle-même', () => {
  it('un plafond de relevés, puis plus de capteur', () => {
    const s = natif('RoomScanCompass.swift');
    expect(s).toContain('maxSamples');
    const sample = s.slice(s.indexOf('private func sample()'), s.indexOf('var northOffset'));
    expect(sample).toContain('stopDeviceMotionUpdates');
  });
});

describe('4 — la visée ne bat que s’il y a quelque chose à viser', () => {
  /*
    LES REPÈRES SONT DEVENUS DES MODÈLES 3D (voir `ScenePoseAR`) — relevé
    du patron : « intègre directement les éléments en 3D ». La règle de
    sobriété, elle, reste : l'horloge de la visée ne bat que lorsqu'un
    produit est choisi et que la vue est à l'écran, et la scène ne se rend
    en continu que si elle a quelque chose à montrer.
  */
  it('l’horloge part avec un produit choisi, s’arrête avec la vue', () => {
    const s = natif('RoomScanPoseAR.swift');
    const relancer = s.slice(s.indexOf('private func relancerHorloge()'), s.indexOf('func viserMaintenant()'));
    expect(relancer).toContain('kindChoisi != nil');
    expect(relancer).toMatch(/horloge\?\.invalidate\(\)/);
    const quitter = s.slice(s.indexOf('override func willMove(toWindow'), s.indexOf('// MARK: - Les modèles'));
    expect(quitter).toMatch(/horloge\?\.invalidate\(\)/);
  });

  it('rien à montrer, rien à rendre', () => {
    const s = natif('RoomScanPoseAR.swift');
    const rendre = s.slice(s.indexOf('private func rendreSiBesoin()'), s.indexOf('private func relancerHorloge()'));
    expect(rendre).toContain('rendersContinuously = !poses.isEmpty || fantome != nil');
  });
});

describe('et l’on mesure', () => {
  it('le natif relève la batterie au départ et rend durée, consommation, chaleur', () => {
    const m = natif('RoomScanManager.swift');
    expect(m).toContain('isBatteryMonitoringEnabled = true');
    expect(m).toContain('batterieAuDepart');
    expect(m).toContain('"energie"');
    expect(m).toContain('thermalState');
  });

  it('la phrase du diagnostic : durée, pour cent, chaleur', () => {
    expect(phraseEnergie({ secondes: 312, batterie: 4, thermique: 'tiède' })).toBe(
      '5 min 12 s · −4 % de batterie · iPhone tiède',
    );
    expect(phraseEnergie({ secondes: 48, batterie: 0, thermique: 'frais' })).toBe(
      '48 s · moins de 1 % de batterie · iPhone frais',
    );
    // iOS ne donne pas toujours le niveau : on le dit, on n'invente pas.
    expect(phraseEnergie({ secondes: 125 })).toBe('2 min 05 s · batterie non lue');
  });

  it('la fin d’un scan note sa dépense, et le Diagnostic l’affiche', async () => {
    (RoomScan.stop as jest.Mock).mockResolvedValue({
      surfaces: [],
      objects: [],
      modelPath: '',
      energie: { secondes: 200, batterie: 3, thermique: 'frais' },
      maillage: { ancres: 12, faces: 4000, sommets: 2100, classe: true },
    });
    act(() => useAstuce.setState({ courante: null, file: [] }));
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({ screen: 'scan', scanning: true, paused: false, processing: false });
    });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ScanScreen />);
    });
    arbre = t;
    const fin = t.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.findAllByType(Text).some((x) => x.props.children === 'Terminer'))!;
    await act(async () => {
      await fin.props.onPress();
    });
    const d = usePannes.getState().dernierScan;
    expect(d).not.toBeNull();
    expect(d!.secondes).toBe(200);
    expect(d!.batterie).toBe(3);
    // Et le bandeau le dit tout de suite, à l'écran où l'on est — relevé
    // du patron : « je ne vois pas le diagnostic sur l'app ».
    const a = useAstuce.getState();
    const bandeaux = [a.courante, ...a.file].filter(Boolean).map((x) => x!.texte);
    expect(bandeaux.some((x) => x.includes('3 min 20 s') && x.includes('−3 %') && x.includes('12 ancres'))).toBe(true);
    act(() => arbre?.unmount());
    arbre = null;

    let j!: TestRenderer.ReactTestRenderer;
    act(() => {
      j = TestRenderer.create(<JournalSheet visible fermer={() => {}} />);
    });
    arbre = j;
    const textes = j.root.findAllByType(Text).map((n) => String(n.props.children));
    expect(textes.some((x) => x.includes('3 min 20 s') && x.includes('−3 %'))).toBe(true);
  });

  it('sans scan noté, le Diagnostic n’en parle pas', () => {
    let j!: TestRenderer.ReactTestRenderer;
    act(() => {
      j = TestRenderer.create(<JournalSheet visible fermer={() => {}} />);
    });
    arbre = j;
    const textes = j.root.findAllByType(Text).map((n) => String(n.props.children));
    expect(textes.some((x) => /batterie/i.test(x))).toBe(false);
  });
});

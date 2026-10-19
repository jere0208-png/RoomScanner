/**
 * LE SCAN EN CONDITIONS RÉELLES — défauts et manques trouvés par l'agent
 * testeur SCAN, en jouant la maison entière d'un électricien : plusieurs
 * pièces, un étage, un passage oublié qu'on rajoute, une pièce sombre, la
 * batterie qui baisse.
 *
 *   1. Le passage suivant héritait des compteurs du précédent : « Scanner une
 *      pièce » s'ouvrait sur « 5 murs », le bandeau « Repassez le mur » et le
 *      trou du contour d'une autre pièce.
 *   2. Un étage terminé sans un mur laissait l'écran de scan figé, sans un
 *      mot ; un passage vide s'annonçait « Relevé complété ».
 *   3. Un refus au viseur ramenait pour de bon l'annonce de la pose d'avant
 *      à la place de la phrase de visée.
 *   4. RoomPlan qui refuse de démarrer : on touchait « Scanner », et rien.
 *   5. Manque : la chaleur et la batterie n'étaient dites qu'après le scan.
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

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { RoomScan, scanEvents, type SurfaceData } from 'react-native-room-scan';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { useBilanStore } from '../src/store/bilanStore';
import { useUsage } from '../src/store/usage';
import { useAlerte } from '../src/ui/alerte';
import { alerteEnergie } from '../src/ui/energie';
import { useRoomScan, demarrerComplement, demarrerEtage } from '../src/native/useRoomScan';
import { niveauDe } from '../src/geometry/floorplan';
import { ScanScreen } from '../src/screens/ScanScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { useAstuce } from '../src/ui/astuce';

const st = () => useScanStore.getState();
const surface = (id: string, cx: number, cz: number, length: number, alongZ = false): SurfaceData => ({
  id,
  type: 'wall',
  length,
  height: 2.5,
  transform: alongZ
    ? [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, cx, 1.25, cz, 1]
    : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 1.25, cz, 1],
});
const boite = (p: string, x: number, z: number, w: number, h: number) => [
  surface(`${p}n`, x + w / 2, z, w),
  surface(`${p}s`, x + w / 2, z + h, w),
  surface(`${p}w`, x, z + h / 2, h, true),
  surface(`${p}e`, x + w, z + h / 2, h, true),
];
const rendra = (surfaces: SurfaceData[]) =>
  (RoomScan.stop as jest.Mock).mockResolvedValueOnce({ surfaces, objects: [], modelPath: '' });

let cmd: ReturnType<typeof useRoomScan>;
function Porteur() {
  cmd = useRoomScan();
  return null;
}
const alerteCourante = () => useAlerte.getState().courante;

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  useAlerte.setState({ courante: null, file: [] });
  useBilanStore.getState().fermer();
  act(() => {
    st().reset();
  });
  useScanStore.setState({ saves: [], currentSaveId: null, supported: true });
  act(() => {
    TestRenderer.create(<Porteur />);
  });
});

/** Un séjour relevé, avec un direct qui a vu des murs douteux et un trou. */
async function premierReleve() {
  rendra(boite('a', 0, 0, 4, 3));
  await act(async () => {
    await cmd.begin();
  });
  act(() => {
    st().applyLiveUpdate({
      wallCount: 5,
      objectCount: 1,
      doorCount: 1,
      windowCount: 1,
      mursDouteux: 2,
      murDouteux: { code: 1 },
      trouContour: 1.2,
    } as never);
    st().setInstruction('Ralentissez');
  });
  await act(async () => {
    await cmd.stop();
  });
}

describe('le passage suivant repart de zéro', () => {
  it('« Scanner une pièce » et « Scanner un étage » n’héritent ni des compteurs ni du mur douteux', async () => {
    await premierReleve();
    await act(async () => {
      await demarrerComplement();
    });
    const propre = () => {
      const s = st();
      expect([s.wallCount, s.doorCount, s.windowCount, s.objectCount]).toEqual([0, 0, 0, 0]);
      expect(s.mursDouteux).toBe(0);
      expect(s.murDouteux).toBeNull();
      expect(s.trouContour).toBe(0);
      expect(s.instruction).toBe('');
    };
    propre();
    act(() => {
      st().applyLiveUpdate({ wallCount: 3, objectCount: 0, doorCount: 0, windowCount: 0, mursDouteux: 1, trouContour: 0.8 } as never);
      cmd.cancel();
    });
    await act(async () => {
      await demarrerEtage(1);
    });
    propre();
  });
});

describe('un passage qui n’a rien vu le dit', () => {
  it('un étage sans mur : retour au plan, intact, et un message — pas un écran de scan figé', async () => {
    await premierReleve();
    const murs = st().walls;
    rendra([]);
    await act(async () => {
      await demarrerEtage(1);
    });
    expect(st().screen).toBe('scan');
    await act(async () => {
      await cmd.stop();
    });
    expect(st().screen).toBe('result');
    expect(st().scanning).toBe(false);
    expect(st().processing).toBe(false);
    expect(st().etageEnCours).toBeNull();
    expect(st().walls).toBe(murs);
    expect(new Set(st().rooms.map((r) => niveauDe(r)))).toEqual(new Set([0]));
    expect(alerteCourante()?.titre).toMatch(/rien de relevé/);
  });

  it('un passage vide : ni « Relevé complété » ni bilan, mais « Aucune pièce ajoutée »', async () => {
    await premierReleve();
    act(() => useBilanStore.getState().fermer());
    rendra([]);
    await act(async () => {
      await demarrerComplement();
    });
    await act(async () => {
      await cmd.stop();
    });
    expect(st().screen).toBe('result');
    expect(st().complementEnCours).toBe(false);
    expect(useBilanStore.getState().bilan).toBeNull();
    expect(alerteCourante()?.titre).toBe('Aucune pièce ajoutée');
  });

  it('un passage qui ajoute une pièce garde son bilan', async () => {
    await premierReleve();
    act(() => useBilanStore.getState().fermer());
    rendra(boite('b', 6, 0, 3, 3));
    await act(async () => {
      await demarrerComplement();
    });
    await act(async () => {
      await cmd.stop();
    });
    expect(st().rooms.length).toBe(2);
    expect(useBilanStore.getState().bilan?.titre).toBe('Pièce ajoutée');
    expect(alerteCourante()).toBeNull();
  });
});

describe('RoomPlan qui refuse de démarrer', () => {
  it('« Scanner » le dit au lieu de ne rien faire', async () => {
    (RoomScan.start as jest.Mock).mockRejectedValueOnce(new Error('La caméra est utilisée par une autre application.'));
    act(() => st().setScreen('home'));
    await act(async () => {
      await cmd.begin();
    });
    expect(st().screen).toBe('home');
    expect(st().scanning).toBe(false);
    expect(alerteCourante()).not.toBeNull();
  });
});

describe('l’écran de scan', () => {
  const ecouteurs: Record<string, (e: unknown) => void> = {};
  beforeEach(() => {
    (scanEvents.addListener as jest.Mock).mockImplementation((nom: string, cb: (e: unknown) => void) => {
      ecouteurs[nom] = cb;
      return { remove: jest.fn() };
    });
    useScanStore.setState({ screen: 'scan', scanning: true, paused: false, processing: false, error: null });
  });
  afterEach(() => {
    (scanEvents.addListener as jest.Mock).mockImplementation(() => ({ remove: jest.fn() }));
    useUsage.setState({ modeElec: false });
    jest.useRealTimers();
  });
  const textes = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAllByType(Text).map((n) => [].concat(n.props.children).join(''));
  const parLabel = (t: TestRenderer.ReactTestRenderer, label: string) =>
    t.root.find((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');

  it('un refus au viseur ne ramène pas l’annonce de la pose d’avant', async () => {
    jest.useFakeTimers();
    useUsage.setState({ modeElec: true });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ScanScreen />);
    });
    act(() => parLabel(t, 'Afficher la pose').props.onPress());
    expect(textes(t)).toContain('Visez un mur relevé');
    (RoomScan.poserAuViseur as jest.Mock).mockResolvedValueOnce({ height: 0.3, plafond: false });
    const poser = () => t.root.find((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Poser ') && typeof n.props.onPress === 'function');
    await act(async () => {
      await poser().props.onPress();
    });
    expect(textes(t)).toContain('Prise plinthe placée à 25 cm');
    (RoomScan.poserAuViseur as jest.Mock).mockResolvedValueOnce(null);
    await act(async () => {
      await poser().props.onPress();
    });
    act(() => {
      jest.advanceTimersByTime(3300);
    });
    // Le refus parti, c'est la phrase de visée qui revient — pas l'annonce d'avant.
    expect(textes(t)).toContain('Visez un mur relevé');
    expect(textes(t).some((x) => x.includes('placée'))).toBe(false);
    act(() => t.unmount());
  });

  it('la chaleur et la batterie basse se disent pendant le scan, et s’effacent', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ScanScreen />);
    });
    expect(t.root.findAllByProps({ testID: 'alerte-energie' })).toHaveLength(0);
    act(() => ecouteurs.onEnergie({ thermique: 'chaud' }));
    expect(textes(t).join(' ')).toMatch(/L’iPhone chauffe/);
    act(() => ecouteurs.onEnergie({ batterie: 6 }));
    expect(textes(t).join(' ')).toMatch(/Batterie à 6 %/);
    act(() => ecouteurs.onEnergie({}));
    expect(t.root.findAllByProps({ testID: 'alerte-energie' })).toHaveLength(0);
    act(() => t.unmount());
  });
});

describe('les phrases de l’énergie', () => {
  it('le plus urgent passe devant, et rien quand tout va bien', () => {
    expect(alerteEnergie(null)).toBeNull();
    expect(alerteEnergie({})).toBeNull();
    expect(alerteEnergie({ thermique: 'brûlant', batterie: 5 })).toMatch(/brûlant/);
    expect(alerteEnergie({ thermique: 'chaud', batterie: 5 })).toMatch(/Batterie à 5 %/);
    expect(alerteEnergie({ thermique: 'chaud', batterie: 12 })).toMatch(/chauffe/);
    expect(alerteEnergie({ batterie: 12 })).toMatch(/pensez à terminer/);
  });

  it('le natif les envoie : événement déclaré, relu pendant le direct, au plus toutes les dix secondes', () => {
    const ios = (f: string) => readFileSync(join(__dirname, '..', 'modules/react-native-room-scan/ios', f), 'utf8');
    expect(ios('RoomScanEvents.swift')).toContain('"onEnergie"');
    const gestion = ios('RoomScanManager.swift');
    expect(gestion).toMatch(/surveillerLaLumiere\(lu\?\.lumiere\)\s*\n\s*surveillerLEnergie\(\)/);
    expect(gestion).toMatch(/timeIntervalSince\(derniereVerifEnergie\) > 10/);
    expect(gestion).toContain('emit(name: "onEnergie"');
  });
});

describe('Siri « Nouveau relevé » sur un iPhone sans LiDAR', () => {
  it('répond au lieu de se perdre sans un mot', () => {
    useAstuce.setState({ courante: null, file: [] });
    useScanStore.setState({ screen: 'home', supported: false, raccourciEnAttente: true });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<HomeScreen />);
    });
    expect(st().raccourciEnAttente).toBe(false);
    const a = useAstuce.getState();
    expect([a.courante, ...a.file].map((x) => x?.texte).join(' ')).toMatch(/LiDAR/);
    act(() => t.unmount());
  });
});

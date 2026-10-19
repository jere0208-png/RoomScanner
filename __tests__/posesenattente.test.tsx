/**
 * LES POSES DU VISEUR NE SE PERDENT PLUS — manque proposé par l'agent
 * testeur SCAN, et deux défauts trouvés en le comblant :
 *
 *   1. Un passage qui ne relevait aucun mur perdait les prises visées
 *      pendant ce passage. Elles attendent maintenant le passage suivant de
 *      la même session de l'iPhone (dont le repère est le leur), et s'y
 *      posent ; un relevé neuf ou un étage repris poursuit la session pour
 *      elles. On peut les jeter.
 *   2. Le natif relivre TOUTES les poses de sa session à chaque
 *      « Terminer » : un passage ajouté reposait celles du passage d'avant,
 *      en double.
 *   3. La torche restait « allumée » à l'écran pendant la pause ; elle
 *      s'éteint en pause et se rallume à la reprise.
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
import TestRenderer, { act } from 'react-test-renderer';
import { RoomScan, type SurfaceData } from 'react-native-room-scan';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { useBilanStore } from '../src/store/bilanStore';
import { useAlerte } from '../src/ui/alerte';
import { useAstuce } from '../src/ui/astuce';
import { useRoomScan, demarrerComplement, demarrerEtage } from '../src/native/useRoomScan';
import { niveauDe } from '../src/geometry/floorplan';
import { ScanScreen } from '../src/screens/ScanScreen';

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
/** Une prise visée à 30 cm du sol, au point (x, z) du monde. */
const prise = (x: number, z: number) => ({ kind: 'prise', x, y: 0.3, z });
const rendra = (surfaces: SurfaceData[], elec: ReturnType<typeof prise>[] = [], passages?: number) =>
  (RoomScan.stop as jest.Mock).mockResolvedValueOnce({ surfaces, objects: [], modelPath: '', elec, ...(passages ? { passages } : {}) });
const prises = () => st().fixtures.filter((f) => f.kind === 'prise');
const textesAstuces = () => {
  const a = useAstuce.getState();
  return [a.courante, ...a.file].map((x) => x?.texte ?? '').join(' | ');
};

let cmd: ReturnType<typeof useRoomScan>;
function Porteur() {
  cmd = useRoomScan();
  return null;
}

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  useAlerte.setState({ courante: null, file: [] });
  useAstuce.setState({ courante: null, file: [] });
  useBilanStore.getState().fermer();
  act(() => {
    st().reset();
  });
  useScanStore.setState({ saves: [], currentSaveId: null, supported: true, posesEnAttente: [] });
  (RoomScan.start as jest.Mock).mockClear();
  (RoomScan.startAdditional as jest.Mock).mockClear();
  act(() => {
    TestRenderer.create(<Porteur />);
  });
});

async function passage(lancer: () => Promise<void>) {
  await act(async () => {
    await lancer();
  });
  await act(async () => {
    await cmd.stop();
  });
}

describe('le natif relivre toutes ses poses : un passage ajouté ne les double plus', () => {
  it('la prise du premier passage reste seule, la neuve s’ajoute', async () => {
    rendra(boite('a', 0, 0, 4, 3), [prise(1, 0.05)]);
    await passage(() => cmd.begin());
    expect(prises()).toHaveLength(1);
    // « Scanner une pièce » : l'iPhone poursuit sa session, et relivre la prise d'avant.
    rendra([...boite('a', 0, 0, 4, 3), ...boite('b', 4, 0, 4, 3)], [prise(1, 0.05), prise(6, 0.05)], 2);
    await passage(() => demarrerComplement());
    expect(RoomScan.startAdditional).toHaveBeenCalledTimes(1);
    expect(prises()).toHaveLength(2);
  });
});

describe('un passage sans mur garde ses poses', () => {
  it('« Scanner une pièce » vide : la prise attend, puis se pose au passage suivant', async () => {
    rendra(boite('a', 0, 0, 4, 3));
    await passage(() => cmd.begin());
    rendra([], [prise(6, 0.05)], 2);
    await passage(() => demarrerComplement());
    expect(st().posesEnAttente).toHaveLength(1);
    expect(prises()).toHaveLength(0);
    // L'alerte le dit, et propose de les jeter.
    const a = useAlerte.getState().courante!;
    expect(a.message).toMatch(/Une pose gardée/);
    expect(a.actions?.map((x) => x.label)).toContain('Jeter les poses');
    // Le passage suivant relève la pièce : la prise s'y pose, une seule fois.
    rendra([...boite('a', 0, 0, 4, 3), ...boite('b', 4, 0, 4, 3)], [prise(6, 0.05)], 3);
    await passage(() => demarrerComplement());
    expect(st().posesEnAttente).toHaveLength(0);
    expect(prises()).toHaveLength(1);
    expect(textesAstuces()).toMatch(/posée sur les murs de ce passage/);
  });

  it('une pose qui ne trouve toujours pas de mur continue d’attendre ; « Jeter » la retire', async () => {
    rendra(boite('a', 0, 0, 4, 3));
    await passage(() => cmd.begin());
    rendra([], [prise(20, 20)], 2);
    await passage(() => demarrerComplement());
    rendra([...boite('a', 0, 0, 4, 3), ...boite('b', 4, 0, 4, 3)], [prise(20, 20)], 3);
    await passage(() => demarrerComplement());
    expect(st().posesEnAttente).toHaveLength(1);
    act(() => st().jeterPosesEnAttente());
    expect(st().posesEnAttente).toHaveLength(0);
  });

  it('une autre session de l’iPhone n’a pas le même repère : la pose ne s’y pose pas', async () => {
    rendra(boite('a', 0, 0, 4, 3));
    await passage(() => cmd.begin());
    rendra([], [prise(6, 0.05)], 2);
    await passage(() => demarrerComplement());
    // L'iPhone repart à neuf (redémarrage, autre relevé) : nouveau repère.
    act(() => st().ouvrirSessionNative(false));
    act(() =>
      st().finalizeMerge({ modelPath: '', passages: 2, surfaces: [...boite('a', 0, 0, 4, 3), ...boite('b', 4, 0, 4, 3)], objects: [], elec: [] } as never),
    );
    expect(prises()).toHaveLength(0);
    expect(st().posesEnAttente).toHaveLength(1);
  });

  it('un scan neuf sans mur : « Refaire un scan » poursuit la session, et la prise s’y pose', async () => {
    rendra([], [prise(1, 0.05)]);
    await passage(() => cmd.begin());
    expect(st().walls).toHaveLength(0);
    expect(st().posesEnAttente).toHaveLength(1);
    expect(textesAstuces()).toMatch(/Une pose gardée/);
    (RoomScan.start as jest.Mock).mockClear();
    rendra(boite('a', 0, 0, 4, 3), [prise(1, 0.05)]);
    await passage(() => cmd.begin());
    expect(RoomScan.startAdditional).toHaveBeenCalled();
    expect(RoomScan.start).not.toHaveBeenCalled();
    expect(prises()).toHaveLength(1);
    expect(st().posesEnAttente).toHaveLength(0);
  });

  it('un étage sans mur : l’étage repris poursuit la session, la prise se pose à l’étage', async () => {
    rendra(boite('a', 0, 0, 4, 3));
    await passage(() => cmd.begin());
    rendra([], [prise(1, 0.05)]);
    await passage(() => demarrerEtage(1));
    expect(st().posesEnAttente.map((p) => p.niveau)).toEqual([1]);
    (RoomScan.startAdditional as jest.Mock).mockClear();
    rendra(boite('e', 0, 0, 4, 3), [prise(1, 0.05)]);
    await passage(() => demarrerEtage(1));
    expect(RoomScan.startAdditional).toHaveBeenCalledTimes(1);
    const p = prises();
    expect(p).toHaveLength(1);
    const mur = st().walls.find((w) => w.id === p[0].wallId)!;
    expect(niveauDe(mur)).toBe(1);
    expect(st().posesEnAttente).toHaveLength(0);
  });

  it('elles vivent dans le brouillon, et un autre plan ouvert les oublie', async () => {
    rendra(boite('a', 0, 0, 4, 3));
    await passage(() => cmd.begin());
    rendra([], [prise(6, 0.05)], 2);
    await passage(() => demarrerComplement());
    act(() => {
      useScanStore.setState({ dirty: true });
      st().ecrireBrouillon();
    });
    const brouillon = JSON.parse(mockMagasin.get('roomscanner.brouillon.v1')!);
    expect(brouillon.posesEnAttente).toHaveLength(1);
    const id = st().saves[0].id;
    act(() => st().openSave(id));
    expect(st().posesEnAttente).toHaveLength(0);
  });
});

describe('la torche suit la pause', () => {
  it('s’éteint en pause, et se rallume à la reprise si elle était allumée', () => {
    act(() => {
      useScanStore.setState({ scanning: true, paused: false, processing: false, screen: 'scan' });
    });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ScanScreen />);
    });
    const bouton = (label: string) => t.root.find((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    act(() => bouton('Allumer la torche').props.onPress());
    (RoomScan.setTorch as jest.Mock).mockClear();
    act(() => useScanStore.setState({ paused: true }));
    expect(RoomScan.setTorch).toHaveBeenLastCalledWith(false);
    expect(() => bouton('Allumer la torche')).not.toThrow();
    act(() => useScanStore.setState({ paused: false }));
    expect(RoomScan.setTorch).toHaveBeenLastCalledWith(true);
    expect(() => bouton('Éteindre la torche')).not.toThrow();
    act(() => t.unmount());
  });
});

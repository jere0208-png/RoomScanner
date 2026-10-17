/**
 * LE PARCOURS DE QUELQU'UN QUI DÉCOUVRE — revue « Léa » : gratuite, premier
 * plan, impatiente. Chaque cas monte le vrai écran et suit le vrai geste.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { RoomScan } from 'react-native-room-scan';
import TestRenderer, { act } from 'react-test-renderer';
import { ScanScreen } from '../src/screens/ScanScreen';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import { useAstuce } from '../src/ui/astuce';
import { useUsage } from '../src/store/usage';
import { usePremieresFois } from '../src/store/premieresFois';
import { useBilanStore } from '../src/store/bilanStore';

const SOL = -1.3;
let n = 0;
const mur = ([ax, az, bx, bz]: number[]) => {
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L;
  const uz = (bz - az) / L;
  return {
    id: `w${++n}`,
    type: 'wall',
    length: L,
    height: 2.5,
    confidence: 'high',
    category: 'wall',
    transform: [ux, 0, uz, 0, 0, 1, 0, 0, -uz, 0, ux, 0, (ax + bx) / 2, SOL + 1.25, (az + bz) / 2, 1],
  };
};

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  act(() => useUsage.setState({ modeElec: true }));
});

async function terminerUnScan() {
  (RoomScan.stop as jest.Mock).mockResolvedValue({
    surfaces: [mur([0, 0, 4, 0]), mur([4, 0, 4, 3]), mur([4, 3, 0, 3]), mur([0, 3, 0, 0])],
    objects: [],
    modelPath: '',
    energie: { secondes: 134, batterie: 4, thermique: 'frais' },
    maillage: { ancres: 12, faces: 4000, sommets: 2100, classe: true },
  });
  act(() => useAstuce.setState({ courante: null, file: [] }));
  act(() => useBilanStore.getState().fermer());
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({ saves: [], screen: 'scan', scanning: true, paused: false, processing: false } as never);
  });
  act(() => {
    arbre = TestRenderer.create(<ScanScreen />);
  });
  const fin = arbre!.root
    .findAllByType(TouchableOpacity)
    .find((x) => x.findAllByType(Text).some((t) => t.props.children === 'Terminer'))!;
  await act(async () => {
    await fin.props.onPress();
  });
  /*
    CE QUE LA FIN DU SCAN DIT, LÀ OÙ ON LE LIT : dans la carte du bilan
    quand elle s'ouvre (la note énergie, la fête du premier plan), en
    bandeaux sinon — voir gain-scan.
  */
  const a = useAstuce.getState();
  const b = useBilanStore.getState().bilan;
  return [
    ...[a.courante, ...a.file].filter(Boolean).map((x) => x!.texte),
    ...(b?.noteEnergie ? [b.noteEnergie] : []),
    ...(b?.premier ? ['Votre premier logement est dans la poche.'] : []),
  ];
}

describe('après le premier scan', () => {
  it('le particulier ne lit pas « maillage LiDAR », mais garde la durée et la batterie', async () => {
    act(() => useUsage.setState({ modeElec: false }));
    const bandeaux = await terminerUnScan();
    expect(bandeaux.some((x) => x.includes('ancre'))).toBe(false);
    expect(bandeaux.some((x) => x.includes('2 min 14 s'))).toBe(true);
  });

  it('le premier plan est fêté, une seule fois', async () => {
    act(() => usePremieresFois.setState({ charge: true, vues: [] } as never));
    expect(await terminerUnScan()).toContain('Votre premier logement est dans la poche.');
    expect(await terminerUnScan()).not.toContain('Votre premier logement est dans la poche.');
  });
});

describe('sur le plan', () => {
  it('une chambre remplie par son lit garde sa surface', () => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.getState().commencerAuClavier();
      useScanStore.getState().addRoomRect({ x: 0, z: 0 }, { x: 2.6, z: 2.2 }, 'Chambre');
      useScanStore.setState({
        showSurfaces: true,
        showFurniture: true,
        objects: [
          {
            id: 'lit',
            category: 'bed',
            width: 2.4,
            depth: 2.0,
            height: 0.5,
            transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1.3, 0.25, 1.1, 1],
          },
        ],
      } as never);
    });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<FloorplanEditor showMeasures={false} editable={false} selectedWallId={null} onSelectWall={() => {}} />);
    });
    arbre = t;
    act(() => {
      t.root
        .findAllByType(View)
        .find((x) => typeof x.props.onLayout === 'function')!
        .props.onLayout({ nativeEvent: { layout: { width: 390, height: 600 } } });
    });
    const textes = t.root.findAll((x) => typeof x.props?.children === 'string').map((x) => x.props.children as string);
    expect(textes.some((x) => /m²$/.test(x))).toBe(true);
  });
});

describe('au tout premier lancement', () => {
  it('la boîte ne contient que la bienvenue, pas les notes de version', async () => {
    const { useNotifications, messagesVisibles } = require('../src/store/notifications');
    await act(async () => {
      await useNotifications.getState().charger();
    });
    expect(messagesVisibles(useNotifications.getState()).map((m: { id: string }) => m.id)).toEqual(['bienvenue']);
  });
});

/**
 * L'ÉCRAN DU PLAN : UNE IMAGE À LA FOIS, DES FEUILLES QUI S'ENCHAÎNENT
 * PROPREMENT, ET UNE MAQUETTE QUI SE TAIT DERRIÈRE « DÉCORER » — revue I5.
 *
 *   — deux appuis sur « Image » : une seule capture, un seul partage, et
 *     l'écran dit « Préparation de l'image… » pendant qu'il se vide ;
 *   — la capture attend le rendu réel (l'état de capture posé à l'écran,
 *     puis deux images), et non plus un délai fixe ;
 *   — la feuille qui doit s'ouvrir après « Décorer » ne survit pas à
 *     l'écran : sa minuterie est levée au démontage ;
 *   — « Décorer » ouvert, la maquette du plan est en pause.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { captureRef } from 'react-native-view-shot';
import { RoomScan } from 'react-native-room-scan';
import { ResultScreen } from '../src/screens/ResultScreen';
import { DecorSheet } from '../src/components/DecorSheet';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

const capturer = captureRef as unknown as jest.Mock;
const partager = RoomScan.shareFile as unknown as jest.Mock;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function monter() {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      screen: 'result',
      scanName: 'Chantier',
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: `Pièce ${i + 1}`, floor: null })),
      fixtures: SNAPSHOT_FIXTURES,
      ceiling: [],
      photos: [],
      notes: [],
      showFurniture: true,
    });
    t = TestRenderer.create(<ResultScreen />);
  });
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
      }
    }
  });
  arbre = t;
  return t;
}

/** La feuille d'export : ses rappels sont ceux de l'écran. */
const feuilleExport = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => typeof n.props?.onImage === 'function' && typeof n.props?.onDismiss === 'function')[0];

describe('partager l’image du plan', () => {
  it('deux appuis : une capture, un partage, et l’écran le dit', async () => {
    const t = monter();
    capturer.mockClear();
    partager.mockClear();
    const f = feuilleExport(t);
    act(() => {
      f.props.onImage();
      f.props.onDismiss();
    });
    // L'écran ne se vide plus sans un mot.
    expect(t.root.findAll((n) => n.props?.testID === 'capture-en-cours').length).toBeGreaterThan(0);
    act(() => {
      f.props.onImage();
      f.props.onDismiss();
    });
    await act(async () => {
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(capturer).toHaveBeenCalledTimes(1);
    expect(partager).toHaveBeenCalledTimes(1);
    expect(t.root.findAll((n) => n.props?.testID === 'capture-en-cours')).toHaveLength(0);
  });

  it('la capture attend le rendu, pas une minuterie de 60 ou 160 ms', async () => {
    const t = monter();
    capturer.mockClear();
    const f = feuilleExport(t);
    const minuteries = jest.spyOn(global, 'setTimeout');
    act(() => {
      f.props.onImage();
      f.props.onDismiss();
    });
    const delais = minuteries.mock.calls.map((c) => c[1]);
    minuteries.mockRestore();
    expect(delais).not.toContain(60);
    expect(delais).not.toContain(160);
    await act(async () => {
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(capturer).toHaveBeenCalledTimes(1);
  });
});

describe('les feuilles qui s’enchaînent', () => {
  it('« Ce qu’il faut acheter » après « Décorer » : la minuterie part avec l’écran', () => {
    const t = monter();
    const poser = jest.spyOn(global, 'setTimeout');
    const lever = jest.spyOn(global, 'clearTimeout');
    act(() => {
      t.root.findByType(DecorSheet).props.onAchats();
    });
    const appel = poser.mock.calls.findIndex((c) => c[1] === 400);
    expect(appel).toBeGreaterThanOrEqual(0);
    const minuterie = poser.mock.results[appel].value;
    act(() => t.unmount());
    arbre = null;
    expect(lever.mock.calls.some((c) => c[0] === minuterie)).toBe(true);
    poser.mockRestore();
    lever.mockRestore();
  });
});

/** La maquette de l'écran du plan — l'aperçu de « Décorer » a la sienne. */
const principale = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Iso3DView).filter((n) => 'enPause' in n.props)[0];

describe('« Décorer » ouvert par-dessus la maquette', () => {
  it('la maquette du plan est en pause, et reprend à la fermeture', () => {
    const t = monter();
    const bouton = t.root
      .findAll((n) => n.props?.accessibilityLabel === 'Passer en 3D' && typeof n.props?.onPress === 'function')
      .pop();
    act(() => bouton!.props.onPress());
    act(() => jest.runOnlyPendingTimers());
    expect(principale(t).props.enPause).toBe(false);
    const barre = t.root.findAll((n) => typeof n.props?.onDecorer === 'function')[0];
    act(() => barre.props.onDecorer());
    expect(principale(t).props.enPause).toBe(true);
    act(() => t.root.findByType(DecorSheet).props.onClose());
    expect(principale(t).props.enPause).toBe(false);
  });
});

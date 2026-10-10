/**
 * IL MANQUE UN MUR — on le dit en terminant, pendant qu'on peut y retourner.
 *
 * Proposé comme amélioration du scan (le patron : « améliore le scan en
 * premier temps, et ce qu'il détecte ; sans surcharger l'app »). Une pièce
 * dont un pan n'a pas été vu ressortait OUVERTE, et le plan la refermait
 * ensuite à la main. Le natif repère deux bouts de mur libres qui se font
 * face (`trouDuContour`) et donne la taille du trou ; « Terminer » le dit, et
 * propose de continuer — rien de plus à l'écran tant que tout est fermé.
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
import { ScanScreen } from '../src/screens/ScanScreen';
import { useScanStore } from '../src/store/scanStore';
import { useAlerte } from '../src/ui/alerte';

const posee = () => useAlerte.getState().courante;

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (trou: number, murs = 5) => {
  useAlerte.setState({ courante: null, file: [] });
  (RoomScan.stop as jest.Mock).mockClear();
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({ screen: 'scan', scanning: true, paused: false, processing: false, wallCount: murs, trouContour: trou });
  });
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<ScanScreen />);
  });
  arbre = t;
  return t;
};

const terminer = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(TouchableOpacity)
    .find((n) => n.findAllByType(Text).some((x) => x.props.children === 'Terminer'))!;

describe('il manque un mur', () => {
  it('« Terminer » le dit, avec sa taille, et laisse continuer', () => {
    const t = monter(1.8);
    act(() => terminer(t).props.onPress());
    expect(posee()?.titre).toBe('Il manque un mur');
    expect(posee()?.message).toMatch(/1,8 m/);
    // Rien n'est arrêté tant qu'on n'a pas répondu.
    expect(RoomScan.stop).not.toHaveBeenCalled();
    const continuer = posee()!.actions!.find((a) => a.label === 'Continuer le scan')!;
    act(() => continuer.onPress?.());
    expect(RoomScan.stop).not.toHaveBeenCalled();
  });

  it('« Terminer quand même » termine', async () => {
    const t = monter(0.6);
    act(() => terminer(t).props.onPress());
    expect(posee()?.message).toMatch(/60 cm/);
    const quandMeme = posee()!.actions!.find((a) => a.label === 'Terminer quand même')!;
    await act(async () => {
      quandMeme.onPress?.();
    });
    expect(RoomScan.stop).toHaveBeenCalled();
  });

  it('contour fermé — ou trop tôt pour juger : on termine sans rien demander', async () => {
    for (const [trou, murs] of [
      [0, 6],
      [2, 2],
    ] as const) {
      const t = monter(trou, murs);
      await act(async () => {
        terminer(t).props.onPress();
      });
      expect(posee()).toBeNull();
      expect(RoomScan.stop).toHaveBeenCalled();
      act(() => t.unmount());
      arbre = null;
    }
  });
});

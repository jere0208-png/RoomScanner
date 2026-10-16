/**
 * « TERMINER » N'ARRÊTE QU'UNE FOIS — revue I5.
 *
 * Deux appuis dans la même image appelaient deux fois `RoomScan.stop` : le
 * second tombait sur une session déjà en train de s'assembler. La garde est
 * au magasin (le drapeau `processing`, posé de façon synchrone au premier
 * appel), et le bouton s'efface et se désactive pendant l'assemblage.
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

const arreter = RoomScan.stop as jest.Mock;

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  arreter.mockReset();
});

const monter = () => {
  useAlerte.setState({ courante: null, file: [] });
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      screen: 'scan',
      scanning: true,
      paused: false,
      processing: false,
      wallCount: 6,
      trouContour: 0,
    });
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

it('deux appuis dans la même image : un seul arrêt du natif', async () => {
  arreter.mockReset();
  arreter.mockImplementation(() => new Promise(() => undefined));
  const t = monter();
  const b = terminer(t);
  await act(async () => {
    b.props.onPress();
    b.props.onPress();
  });
  expect(arreter).toHaveBeenCalledTimes(1);
  // Le bouton, lui, ne répond plus pendant l'assemblage.
  expect(terminer(t).props.disabled).toBe(true);
  await act(async () => {
    terminer(t).props.onPress();
  });
  expect(arreter).toHaveBeenCalledTimes(1);
});

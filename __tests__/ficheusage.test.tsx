/**
 * LA FICHE DU CHOIX D'USAGE — demande du patron : « une belle fiche moderne
 * au début pour le choix si on veut l'élec ou pas, avec des grosses icônes
 * animées légèrement, effet 3D léger ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { PremierLancement } from '../src/components/PremierLancement';
import { IconeAmenager, IconeElec } from '../src/components/IconesUsage';
import { useUsage } from '../src/store/usage';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const monter = () => {
  useUsage.setState({ charge: true, modeElec: false, choisi: false });
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<PremierLancement onFini={() => {}} />);
  });
  return t;
};

describe('la fiche du choix d’usage', () => {
  it('deux grandes cartes, chacune avec son icône dessinée', () => {
    const t = monter();
    expect(t.root.findAllByType(IconeAmenager)).toHaveLength(1);
    expect(t.root.findAllByType(IconeElec)).toHaveLength(1);
    const cartes = t.root.findAll(
      (n) => typeof n.props?.onPress === 'function' && /^(Mesurer et aménager|Prévoir l’électricité)$/.test(String(n.props?.accessibilityLabel ?? '')),
    );
    // Chaque carte dit aussi ce qu'on y fera, pour VoiceOver.
    expect(cartes.every((c) => typeof c.props.accessibilityHint === 'string' && c.props.accessibilityHint.length > 10)).toBe(true);
    act(() => t.unmount());
  });

  it('les icônes bougent en relief, sur le pilote natif', () => {
    const boucle = jest.spyOn(Animated, 'loop');
    const timing = jest.spyOn(Animated, 'timing');
    const t = monter();
    expect(boucle).toHaveBeenCalled();
    expect(timing.mock.calls.some(([, cfg]) => (cfg as { useNativeDriver?: boolean }).useNativeDriver === true)).toBe(true);
    // Une perspective et deux rotations : l'effet 3D.
    const relief = t.root.findAll((n) => Array.isArray(n.props?.style) && JSON.stringify(n.props.style).includes('perspective'));
    expect(relief.length).toBeGreaterThanOrEqual(2);
    act(() => t.unmount());
    boucle.mockRestore();
    timing.mockRestore();
  });

  it('« Réduire les animations » : les icônes restent immobiles', async () => {
    const lecture = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    let t!: TestRenderer.ReactTestRenderer;
    useUsage.setState({ charge: true, modeElec: false, choisi: false });
    await act(async () => {
      t = TestRenderer.create(<PremierLancement onFini={() => {}} />);
    });
    const boucle = jest.spyOn(Animated, 'loop');
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(boucle).not.toHaveBeenCalled();
    act(() => t.unmount());
    lecture.mockRestore();
    boucle.mockRestore();
  });
});

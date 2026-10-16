/**
 * « RÉDUIRE LES ANIMATIONS » FIGE LES FOURMIS — revue I5.
 *
 * Le contour du bouton d'édition défile sur le fil JavaScript (le décalage
 * d'un pointillé SVG ne passe pas au pilote natif). On le garde — c'est une
 * demande du patron, voir `halofourmis` —, mais qui a demandé à iOS moins
 * de mouvement ne doit plus le voir tourner : le pointillé reste, immobile.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { AccessibilityInfo } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Rect } from 'react-native-svg';
import { ToolPill } from '../src/components/ToolPill';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('le pointillé reste, et ne défile plus', async () => {
  const lire = jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockImplementation(() => Promise.resolve(true));
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <ToolPill icon="edit" label="Édition" active halo onPress={() => {}} />,
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  const anneau = () => t.root.findAllByType(Rect).find((n) => !!n.props.strokeDasharray);
  expect(anneau()).toBeDefined();
  const avant = Number(anneau()!.props.strokeDashoffset);
  act(() => jest.advanceTimersByTime(300));
  expect(Number(anneau()!.props.strokeDashoffset)).toBe(avant);
  act(() => t.unmount());
  lire.mockRestore();
});

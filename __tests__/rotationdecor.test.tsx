/**
 * LA PIÈCE DE « DÉCORER » TOURNE AU TEMPS, ET SE TAIT SI L'ON DEMANDE MOINS
 * DE MOUVEMENT.
 *
 * Revue de lisibilité : un `setInterval` de 50 ms avançait d'un pas fixe —
 * le fil occupé, les pas se perdaient et la pièce saccadait —, et rien
 * n'écoutait le réglage « Réduire les animations » d'iOS. Elle tourne
 * maintenant à l'image, d'un angle proportionnel au temps écoulé, et ne
 * bouge plus du tout quand le réglage est allumé.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccessibilityInfo } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DEGRES_PAR_SECONDE, DecorSheet } from '../src/components/DecorSheet';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';

beforeEach(() => {
  jest.useFakeTimers();
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({ rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never, objects: [] });
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function monter() {
  let t!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    t = TestRenderer.create(<DecorSheet visible onClose={jest.fn()} pieceInitiale="r1" />);
  });
  return t;
}
const theta = (t: TestRenderer.ReactTestRenderer) => t.root.findAllByType(Iso3DView)[0].props.value.theta as number;

describe('la rotation de l’aperçu', () => {
  it('ne passe plus par une minuterie à pas fixe', () => {
    const src = readFileSync(join(__dirname, '..', 'src/components/DecorSheet.tsx'), 'utf8');
    expect(src).not.toMatch(/setInterval\(/);
    expect(src).toMatch(/requestAnimationFrame\(/);
  });

  it('avance d’un angle proportionnel au temps écoulé', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const t = await monter();
    const depart = theta(t);
    act(() => jest.advanceTimersByTime(1000));
    const apres1 = theta(t);
    act(() => jest.advanceTimersByTime(2000));
    const apres3 = theta(t);
    const un = apres1 - depart;
    const trois = apres3 - depart;
    // Une seconde ≈ 24°, trois secondes ≈ 72° : le temps, pas le nombre d'appels.
    expect(un).toBeGreaterThan(DEGRES_PAR_SECONDE * 0.8);
    expect(un).toBeLessThan(DEGRES_PAR_SECONDE * 1.1);
    expect(trois / un).toBeGreaterThan(2.6);
    expect(trois / un).toBeLessThan(3.4);
    act(() => t.unmount());
  });

  it('« Réduire les animations » : la pièce ne tourne plus', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const t = await monter();
    const depart = theta(t);
    act(() => jest.advanceTimersByTime(5000));
    expect(theta(t)).toBe(depart);
    act(() => t.unmount());
  });
});

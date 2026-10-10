/**
 * LA BULLE DU MENU ET SON ÉCHO DE GOUTTE D'EAU.
 *
 * Relevé du patron : « à la sélection d'un élément du plan 2D, le menu doit
 * s'ouvrir telle une bulle Apple, en verre, proposant les choix ; on augmente
 * la modernité. Donne quand même une touche unique, comme une animation qui
 * fait un écho de goutte d'eau rapide autour du menu à l'ouverture. »
 *
 * Ce banc tient ce qui se vérifie sans iPhone : la bulle naît, deux anneaux
 * partent de son bord puis quittent l'arbre (rien ne reste à peindre), ils
 * repartent à chaque nouvel élément choisi, et le mouvement réduit les tait.
 * Sans le verre natif (Android, banc d'essai), la carte garde son fond plein.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { CarteDuMenu, ECHO_PX } from '../src/components/StripBar';
import { FondDeVerre, SUR_VERRE, VERRE } from '../src/components/Verre';

const CARTE = { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 12 };

let arbre: TestRenderer.ReactTestRenderer | null = null;
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const bulle = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => n.props.testID === 'bulle-du-menu' && typeof n.type === 'string')[0];
const echos = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => n.props.testID === 'echo-de-la-bulle' && typeof n.type === 'string');

/** La bulle se mesure, et la question du mouvement réduit trouve sa réponse. */
const ouvrir = async (t: TestRenderer.ReactTestRenderer) => {
  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    bulle(t).props.onLayout({ nativeEvent: { layout: { width: 300, height: 120 } } });
  });
};

const monter = async (cle = 'a') => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <CarteDuMenu key={cle} style={CARTE}>
        <Text>3 spots</Text>
      </CarteDuMenu>,
    );
  });
  arbre = t;
  await ouvrir(t);
  return t;
};

describe('la bulle du menu', () => {
  it('porte ce qu’on lui confie', async () => {
    const t = await monter();
    expect(bulle(t)).toBeTruthy();
    expect(t.root.findByType(Text).props.children).toBe('3 spots');
  });

  it('l’écho : deux anneaux qui partent du bord, puis plus rien', async () => {
    const t = await monter();
    const anneaux = echos(t);
    expect(anneaux).toHaveLength(2);
    // Ils épousent la bulle : même rayon, posés sur son bord.
    for (const a of anneaux) {
      const st = StyleSheet.flatten(a.props.style) as { borderRadius: number; position: string };
      expect(st.borderRadius).toBe(CARTE.borderRadius);
      expect(st.position).toBe('absolute');
    }
    // Une demi-seconde, et la bulle reste seule.
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(echos(t)).toHaveLength(0);
  });

  it('l’écho s’éloigne d’une goutte, pas d’une vague', () => {
    expect(ECHO_PX).toBeGreaterThanOrEqual(10);
    expect(ECHO_PX).toBeLessThanOrEqual(24);
  });

  it('chaque élément choisi a sa bulle : l’écho repart à chaque sélection', async () => {
    const t = await monter('mur-1');
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(echos(t)).toHaveLength(0);
    act(() => {
      t.update(
        <CarteDuMenu key="mur-2" style={CARTE}>
          <Text>3 spots</Text>
        </CarteDuMenu>,
      );
    });
    await ouvrir(t);
    expect(echos(t)).toHaveLength(2);
  });

  it('mouvement réduit : elle est là, sans ressort ni écho', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const t = await monter();
    expect(echos(t)).toHaveLength(0);
  });

  it('sans verre natif, la carte garde son fond plein', async () => {
    expect(VERRE).toBe(false);
    expect(SUR_VERRE).toBeNull();
    const t = await monter();
    const st = StyleSheet.flatten(bulle(t).props.style) as { backgroundColor: string };
    expect(st.backgroundColor).toBe('#FFFFFF');
    let vide!: TestRenderer.ReactTestRenderer;
    act(() => {
      vide = TestRenderer.create(<FondDeVerre rayon={20} />);
    });
    expect(vide.toJSON()).toBeNull();
    act(() => vide.unmount());
  });
});

/**
 * TENIR LA FLÈCHE, C'EST CONTINUER — de plus en plus vite.
 *
 * Un pas par appui : décaler un meuble de vingt centimètres demandait vingt
 * appuis, et personne ne le fait — on reprend le doigt, et on perd la
 * précision que ces flèches existent justement pour donner.
 *
 * Ce banc compte les pas dans le temps. Trois choses à tenir : un tapotement
 * ne fait qu'UN pas (sans quoi le geste courant partirait en course), le
 * maintien démarre lentement (c'est encore du réglage fin), et la pleine
 * vitesse ne dépasse pas dix pas par seconde — au-delà, le meuble file et
 * l'on ne voit plus où il va.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ObjectBar } from '../src/components/ObjectBar';
import { light } from '../src/theme';
import { getStyles } from '../src/screens/result/styles';
import type { ObjectData } from 'react-native-room-scan';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const MEUBLE: ObjectData = {
  id: 'o1',
  category: 'storage',
  width: 1,
  depth: 0.6,
  height: 1,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.5, 2, 1],
};

function monter() {
  const pas: [number, number][] = [];
  let arbre!: TestRenderer.ReactTestRenderer;
  act(() => {
    arbre = TestRenderer.create(
      <ObjectBar
        object={MEUBLE}
        styles={getStyles(light) as unknown as Record<string, object>}
        palette={light}
        onPrompt={() => {}}
        onResize={() => {}}
        onRotate={() => {}}
        onCancel={() => {}}
        onDone={() => {}}
        onNudge={(dx, dz) => pas.push([dx, dz])}
      />,
    );
  });
  const fleche = (label: string) =>
    arbre.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === label)!;
  return { arbre, pas, fleche };
}

describe('les flèches du bandeau', () => {
  it('fait UN pas sur un simple appui', () => {
    const { arbre, pas, fleche } = monter();
    const haut = fleche('Déplacer vers le haut');
    act(() => haut.props.onPressIn());
    act(() => haut.props.onPressOut());
    // Un tapotement bref : un centimètre, pas deux.
    act(() => jest.advanceTimersByTime(3000));
    expect(pas).toHaveLength(1);
    expect(pas[0]).toEqual([0, -1]);
    act(() => arbre.unmount());
  });

  it('part dès l’appui, sans attendre le relâchement', () => {
    const { arbre, pas, fleche } = monter();
    act(() => fleche('Déplacer vers la droite').props.onPressIn());
    expect(pas).toHaveLength(1);
    expect(pas[0]).toEqual([1, 0]);
    act(() => fleche('Déplacer vers la droite').props.onPressOut());
    act(() => arbre.unmount());
  });

  it('continue tant qu’on tient, et s’arrête quand on lâche', () => {
    const { arbre, pas, fleche } = monter();
    const bas = fleche('Déplacer vers le bas');
    act(() => bas.props.onPressIn());
    act(() => jest.advanceTimersByTime(2000));
    const pendant = pas.length;
    expect(pendant).toBeGreaterThan(5);
    act(() => bas.props.onPressOut());
    act(() => jest.advanceTimersByTime(3000));
    // Plus rien après le relâchement.
    expect(pas).toHaveLength(pendant);
    // Et toujours dans le même sens.
    expect(pas.every((p) => p[0] === 0 && p[1] === 1)).toBe(true);
    act(() => arbre.unmount());
  });

  /**
   * LA MONTÉE EN RÉGIME, comptée seconde par seconde.
   *
   * La première demi-seconde reste lente : c'est encore le geste de
   * précision. Après trois secondes, on traverse la pièce.
   */
  it('accélère, sans jamais dépasser dix pas par seconde', () => {
    const { arbre, pas, fleche } = monter();
    const haut = fleche('Déplacer vers le haut');
    act(() => haut.props.onPressIn());
    const parSeconde: number[] = [];
    let avant = pas.length;
    for (let i = 0; i < 4; i++) {
      act(() => jest.advanceTimersByTime(1000));
      parSeconde.push(pas.length - avant);
      avant = pas.length;
    }
    // La première seconde reste mesurée : on doit pouvoir viser 2 ou 3 cm.
    expect(parSeconde[0]).toBeLessThanOrEqual(5);
    // Puis ça monte.
    expect(parSeconde[3]).toBeGreaterThan(parSeconde[0]);
    // Et le plafond tient : jamais plus de dix pas dans une seconde.
    for (const n of parSeconde) expect(n).toBeLessThanOrEqual(10);
    act(() => haut.props.onPressOut());
    act(() => arbre.unmount());
  });

  /**
   * ET L'HORLOGE MEURT AVEC LA FICHE.
   *
   * Un doigt qui quitte l'écran pendant que le bandeau se ferme laisserait
   * la répétition tourner sur un meuble qui n'existe plus.
   */
  it('s’arrête si le bandeau disparaît sous le doigt', () => {
    const { arbre, pas, fleche } = monter();
    act(() => fleche('Déplacer vers la gauche').props.onPressIn());
    act(() => jest.advanceTimersByTime(1000));
    const avant = pas.length;
    act(() => arbre.unmount());
    act(() => jest.advanceTimersByTime(3000));
    expect(pas).toHaveLength(avant);
  });
});

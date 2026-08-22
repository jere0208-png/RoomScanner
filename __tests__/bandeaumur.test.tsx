/**
 * LE BANDEAU DU MUR — et la seule règle qui compte : TOUT RENTRE.
 *
 * Relevé du patron, capture à l'appui : « peu de place pour les
 * informations du mur, les boutons prennent toute la place, et un bouton
 * sort du bloc ». « Détacher » se lisait à moitié hors de la pilule
 * blanche, posé sur le plan.
 *
 * C'est exactement le défaut que le bandeau du MEUBLE a déjà connu, et le
 * remède est le même : ce n'est pas un problème de largeur, c'est un
 * problème de COMPRESSIBILITÉ. Une rangée faite de blocs qui ne cèdent
 * jamais dépasse au premier mot de trop — et une vue qui déborde n'est pas
 * rognée, elle SORT.
 *
 * Deux règles, donc, et ce banc les tient :
 *
 *   — les boutons cèdent (ils portent `flexShrink`), la COTE jamais : c'est
 *     elle qu'on vient lire, et elle tient en quatre caractères ;
 *   — leur mot se tronque plutôt que de pousser la rangée dehors.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { StripBar } from '../src/components/StripBar';
import { getStyles } from '../src/screens/result/styles';
import { light } from '../src/theme';

const styles = getStyles(light) as unknown as Record<string, object>;

const monter = (n: number) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <StripBar
        strong="1,19 m"
        note="mur"
        styles={styles}
        actions={Array.from({ length: n }, (_, i) => ({
          label: ['Mesures', 'Laser', 'Détacher'][i] ?? `Action ${i}`,
          onPress: () => {},
        }))}
      />,
    );
  });
  return t;
};

const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAll(
    (n) => n.props?.accessibilityLabel === label && !!n.props?.onPress,
  )[0];

describe('le bandeau du mur tient dans son bloc', () => {
  it('les boutons cèdent la place', () => {
    const t = monter(3);
    for (const l of ['Mesures', 'Laser', 'Détacher']) {
      const st = StyleSheet.flatten(bouton(t, l).props.style) as {
        flexShrink?: number;
        minWidth?: number;
      };
      // Sans `flexShrink`, la rangée pousse et le dernier bouton sort.
      expect(`${l} cède : ${(st.flexShrink ?? 0) > 0}`).toBe(`${l} cède : true`);
      // `minWidth: 0` : sans lui, le mot à l'intérieur impose sa largeur et
      // le bouton refuse de rétrécir malgré `flexShrink`.
      expect(st.minWidth).toBe(0);
    }
    act(() => t.unmount());
  });

  it('mais la cote, jamais : c’est elle qu’on vient lire', () => {
    const t = monter(3);
    const cote = t.root
      .findAllByType(Text)
      .find((n) => n.props.children === '1,19 m')!;
    const st = StyleSheet.flatten(cote.props.style) as { flexShrink?: number };
    expect(st.flexShrink).toBe(0);
    act(() => t.unmount());
  });

  it('et leur mot se tronque au lieu de pousser la rangée dehors', () => {
    const t = monter(3);
    const mots = t.root
      .findAllByType(Text)
      .filter((n) => typeof n.props.children === 'string' &&
        ['Mesures', 'Laser', 'Détacher'].includes(n.props.children));
    expect(mots.length).toBeGreaterThanOrEqual(3);
    for (const m of mots) expect(m.props.numberOfLines).toBe(1);
    act(() => t.unmount());
  });
});


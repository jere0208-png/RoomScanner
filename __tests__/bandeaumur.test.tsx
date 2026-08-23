/**
 * LE BANDEAU DU MUR — et la seule règle qui compte : TOUT RENTRE.
 *
 * Relevé du patron, capture à l'appui : « peu de place pour les
 * informations du mur, les boutons prennent toute la place, et un bouton
 * sort du bloc ». « Détacher » se lisait à moitié hors de la pilule
 * blanche, posé sur le plan.
 *
 * PREMIÈRE RÉPONSE — celle que ce banc tenait : rendre les boutons
 * COMPRESSIBLES. `flexShrink` sur chacun, `minWidth: 0` pour que le mot
 * n'impose plus sa largeur, et le mot tronqué à une ligne. Tout rentrait,
 * en effet : plus rien ne sortait du bloc.
 *
 * SAUF QUE « RENTRER » N'EST PAS « SE LIRE ». Relevé suivant, capture à
 * l'appui, sur le bandeau d'une ligne de spots : « 3 spots · Pièce 1 · … »
 * et quatre pastilles rognées. « Toujours les boutons sont coupés et le
 * texte aussi. Fais en 2 parties, avec le texte au-dessus et les boutons en
 * dessous. » La compressibilité n'avait pas réglé le problème, elle l'avait
 * RÉPARTI : chacun cédait un peu, donc tout était coupé un peu.
 *
 * La forme est maintenant en deux parties (voir `bandeauxbas`) : en haut ce
 * qu'on lit, en bas ce qu'on touche. Les boutons ne cèdent plus — ils
 * passent à la ligne. Ce banc garde donc la question d'origine (« est-ce
 * que tout rentre ? ») en la posant à la nouvelle forme.
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
  it('les boutons passent à la ligne au lieu de rétrécir', () => {
    const t = monter(3);
    for (const l of ['Mesures', 'Laser', 'Détacher']) {
      const st = StyleSheet.flatten(bouton(t, l).props.style) as {
        flexShrink?: number;
        minHeight?: number;
      };
      // Ils ne cèdent plus : c'est la rangée qui se replie (`flexWrap`).
      expect(`${l} cède : ${(st.flexShrink ?? 0) > 0}`).toBe(`${l} cède : false`);
      // Et chacun garde la taille d'un doigt, quoi qu'il arrive.
      expect(st.minHeight).toBeGreaterThanOrEqual(44);
    }
    act(() => t.unmount());
  });

  it('et la cote a sa propre ligne, au-dessus d’eux', () => {
    const t = monter(3);
    const cote = t.root
      .findAllByType(Text)
      .find((n) => n.props.children === '1,19 m')!;
    // Elle n'a plus à résister à personne : elle ne partage plus sa ligne.
    expect(cote.props.numberOfLines).toBe(1);
    const rangee = t.root
      .findAll((n) => {
        const st = StyleSheet.flatten(n.props?.style) as
          | { flexWrap?: string }
          | undefined;
        return st?.flexWrap === 'wrap';
      })
      .pop();
    expect(rangee).toBeDefined();
    // La cote n'est pas DANS la rangée des boutons : c'est tout le sujet.
    expect(
      rangee!.findAllByType(Text).some((n) => n.props.children === '1,19 m'),
    ).toBe(false);
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


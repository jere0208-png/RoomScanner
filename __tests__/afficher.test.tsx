/**
 * LA RANGÉE DE CALQUES : ce qu'elle annonce, et ce qu'elle laisse entrer.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Animated, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { RangeeOutils } from '../src/components/RangeeOutils';
import { getStyles } from '../src/screens/result/styles';
import { light } from '../src/theme';

const STYLES = getStyles(light) as unknown as Record<string, object>;

/**
 * HORS ÉDITION, LA RANGÉE DIT CE QU'ELLE FAIT : « Afficher ».
 *
 * Relevé du patron, croquis Paint à l'appui : « lorsqu'on n'est pas en
 * édition, l'utilisateur doit comprendre que les boutons sont des
 * "Afficher" — texte Afficher + lignes vers les boutons ».
 *
 * Rien ne le disait. « Meubles », « Appareils », « Surfaces », « Nord » :
 * quatre mots qui NOMMENT une chose sans dire ce qu'on en fait — on peut
 * aussi bien croire qu'on va en ajouter un. Or ce sont des interrupteurs de
 * calque, et le seul geste possible est de les allumer ou de les éteindre.
 *
 * Le peigne le dit d'un dessin : un mot, une barre, et une descente par
 * bouton — la manière dont on annote un plan, justement, et que
 * l'électricien lit tous les jours sur ses schémas.
 *
 * EN ÉDITION, RIEN DE TOUT ÇA : les boutons y font des choses différentes
 * (poser un appareil, redresser, ouvrir le catalogue), et un titre commun
 * mentirait sur trois d'entre eux.
 */
describe('le peigne « Afficher »', () => {
  const monter = (edition: boolean) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <RangeeOutils
          styles={STYLES}
          anim={new Animated.Value(1)}
          largeur={390}
          reserve={62}
          bas={10}
          dessus={0}
          edition={edition}
          elements={['a', 'b', 'c', 'd'].map((k) => (
            <View key={k} />
          ))}
        />,
      );
    });
    return t;
  };

  it('coiffe les calques d’un mot et d’une descente par bouton', () => {
    const t = monter(false);
    const mots = t.root
      .findAllByType(Text)
      .map((n) => String(n.props.children));
    expect(mots).toContain('Afficher');
    // Une descente par bouton, plus la barre qui les réunit : sans les
    // traits, le mot flotterait au-dessus de rien.
    const traits = t.root.findAll(
      (n) => typeof n.props?.x1 === 'number' || typeof n.props?.y1 === 'number',
    );
    expect(traits.length).toBeGreaterThanOrEqual(5);
    act(() => t.unmount());
  });

  it('et disparaît en édition, où chaque bouton fait autre chose', () => {
    const t = monter(true);
    const mots = t.root
      .findAllByType(Text)
      .map((n) => String(n.props.children));
    expect(mots).not.toContain('Afficher');
    act(() => t.unmount());
  });
});

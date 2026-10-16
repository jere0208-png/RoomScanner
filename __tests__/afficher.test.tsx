/**
 * LA RANGÉE DE CALQUES : plus de peigne.
 *
 * Elle a porté un « peigne » — un mot (« Afficher », « Ajouter »), une
 * barre et une descente par bouton (croquis Paint du patron). Ces tests
 * vérifiaient le mot, les traits et leur fondu.
 *
 * MIS À JOUR — revue des « découvreurs » (six testeurs sur huit) : les traits
 * en arbre se lisaient comme une décoration, et le mot mentait : « + Meuble »,
 * « Décorer » et « Autres » sont des ACTIONS, rangées sous « Afficher ».
 * Chaque pastille porte déjà son mot. Le peigne est retiré ; ce banc vérifie
 * désormais qu'il ne revient pas, et que la rangée garde tous ses boutons.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Animated, Text, View } from 'react-native';
import { Line } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { RangeeOutils } from '../src/components/RangeeOutils';
import { getStyles } from '../src/screens/result/styles';
import { light } from '../src/theme';

const STYLES = getStyles(light) as unknown as Record<string, object>;

describe('la rangée sans peigne', () => {
  const monter = (n: number, largeur = 390, dessus = 0) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <RangeeOutils
          styles={STYLES}
          anim={new Animated.Value(1)}
          largeur={largeur}
          reserve={62}
          bas={10}
          dessus={dessus}
          elements={Array.from({ length: n }, (_, i) => (
            <View key={`o${i}`} testID={`o${i}`} />
          ))}
        />,
      );
    });
    return t;
  };

  it('ne dessine ni mot ni trait au-dessus des pastilles', () => {
    const t = monter(4);
    const mots = t.root.findAllByType(Text).map((n) => String(n.props.children));
    expect(mots).not.toContain('Afficher');
    expect(mots).not.toContain('Ajouter');
    expect(t.root.findAllByType(Line)).toHaveLength(0);
    act(() => t.unmount());
  });

  it('garde tous ses boutons, sur la ligne puis dans la pile de droite', () => {
    // Sept outils sur un téléphone : quatre sur la ligne, trois en pile.
    const t = monter(7, 390, 66);
    for (let i = 0; i < 7; i++) {
      expect(t.root.findAll((n) => n.props.testID === `o${i}`, { deep: false })).toHaveLength(1);
    }
    act(() => t.unmount());
  });

  it('n’exporte plus l’encombrement du peigne', () => {
    // L'écran posait son bandeau au-dessus du peigne (`PEIGNE_TOTAL`) ; il
    // se pose maintenant au-dessus des pastilles seules.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../src/components/RangeeOutils');
    expect(mod.PEIGNE_TOTAL).toBeUndefined();
    expect(mod.PEIGNE_OPACITE).toBeUndefined();
  });
});

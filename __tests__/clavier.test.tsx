/**
 * LE CLAVIER NE MANGE PLUS LA SAISIE.
 *
 * Le défaut, relevé sur « CLIENT » dans l'écran d'export : on touche le
 * champ, le voile s'allume, le clavier monte — et il n'y a RIEN à l'écran.
 * On tape une lettre à l'aveugle, et la feuille apparaît enfin, ses boutons
 * coupés par le clavier.
 *
 * La cause n'était pas dans cet écran : `KeyboardAvoidingView` mesure par
 * rapport à la fenêtre principale, pas à la fenêtre modale dans laquelle
 * nos feuilles vivent. La feuille restait donc posée au fond, derrière le
 * clavier. On mesure désormais le clavier nous-mêmes — et comme toutes les
 * saisies de l'app passent par cette coquille, la correction vaut pour
 * TOUTES : longueur d'un mur, largeur d'une porte, cotes d'un meuble, nom
 * du client, adresse du chantier.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Keyboard, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { PromptSheet } from '../src/components/Sheet';

type Ecouteur = (e: {
  endCoordinates: { screenY: number; height: number };
}) => void;

/** Les écouteurs posés par la feuille, par nom d'événement. */
function capter() {
  const ecouteurs = new Map<string, Ecouteur>();
  jest
    .spyOn(Keyboard, 'addListener')
    .mockImplementation((nom: string, fn: unknown) => {
      ecouteurs.set(nom, fn as Ecouteur);
      return { remove: () => ecouteurs.delete(nom) } as never;
    });
  return ecouteurs;
}

afterEach(() => jest.restoreAllMocks());

/** La marge basse appliquée à la feuille — c'est elle qui la fait monter. */
function margeBasse(tree: TestRenderer.ReactTestRenderer): number {
  for (const n of tree.root.findAllByType(View)) {
    const st = n.props.style;
    const plats = Array.isArray(st) ? st : [st];
    for (const p of plats) {
      if (p && typeof p === 'object' && typeof p.paddingBottom === 'number') {
        return p.paddingBottom;
      }
    }
  }
  return -1;
}

describe('la feuille de saisie et le clavier', () => {
  it('se pose au-dessus du clavier dès qu’il s’annonce', () => {
    const ecouteurs = capter();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <PromptSheet
          data={{ title: 'Nom du client', value: 'Dupont', onSubmit: () => {} }}
          onClose={() => {}}
        />,
      );
    });
    // Au repos, aucune marge : la feuille touche le bas de l'écran.
    expect(margeBasse(tree)).toBe(0);

    // iOS annonce le clavier AVANT qu'il monte : c'est ce signal qu'on suit.
    const bouge =
      ecouteurs.get('keyboardWillChangeFrame') ?? ecouteurs.get('keyboardDidShow');
    expect(bouge).toBeDefined();
    act(() => bouge!({ endCoordinates: { screenY: 400, height: 336 } }));
    expect(margeBasse(tree)).toBeGreaterThan(100);

    const part =
      ecouteurs.get('keyboardWillHide') ?? ecouteurs.get('keyboardDidHide');
    act(() => part!({ endCoordinates: { screenY: 9999, height: 0 } }));
    expect(margeBasse(tree)).toBe(0);
    act(() => tree.unmount());
  });

  it('n’oublie pas ses écouteurs en partant', () => {
    const ecouteurs = capter();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <PromptSheet data={{ title: 'Largeur', value: '', onSubmit: () => {} }} onClose={() => {}} />,
      );
    });
    expect(ecouteurs.size).toBe(2);
    act(() => tree.unmount());
    expect(ecouteurs.size).toBe(0);
  });
});

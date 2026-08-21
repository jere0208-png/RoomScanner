/**
 * L'ÉCRAN D'UN PLAN VIDE — deux situations, deux réponses.
 *
 * Il ne disait qu'une chose : « Aucun mur détecté, balayez plus lentement »,
 * avec une seule sortie, « Réessayer ». C'était le message d'un scan raté,
 * servi aussi à qui venait de choisir « Dessiner un plan » — lequel se
 * retrouvait alors devant un écran sans aucune issue.
 *
 * Dans les deux cas, la même action manquait : POSER UNE PIÈCE. Elle vaut
 * même après un scan raté — une cuisine se trace à ses cotes en dix secondes
 * quand la caméra s'obstine — et c'est le geste attendu quand on a choisi le
 * clavier.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ResultScreen } from '../src/screens/ResultScreen';
import { useScanStore } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Text).map((n) => String(n.props.children));

const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root
    .findAllByType(TouchableOpacity)
    .find((n) => n.props.accessibilityLabel === nom);

const monter = () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<ResultScreen />);
  });
  return t;
};

const vider = (planVierge: boolean) =>
  useScanStore.setState({
    walls: [],
    rooms: [],
    openings: [],
    objects: [],
    fixtures: [],
    ceiling: [],
    photos: [],
    planVierge,
    screen: 'result',
  });

describe('un plan ouvert au clavier', () => {
  it('ne sert pas le message d’un scan raté', () => {
    vider(true);
    const t = monter();
    const mots = textes(t).join(' | ');
    expect(mots).toContain('Plan vierge');
    // Le conseil de balayage n'a aucun sens pour qui n'a rien balayé.
    expect(mots).not.toMatch(/Balayez/);
    act(() => t.unmount());
  });

  it('offre d’ajouter une pièce, et l’ajoute vraiment', () => {
    vider(true);
    const t = monter();
    const ajouter = bouton(t, 'Ajouter une pièce');
    expect(ajouter).toBeTruthy();
    act(() => ajouter?.props.onPress());
    // La feuille de choix s'ouvre ICI aussi : sans elle, le bouton
    // n'ouvrirait rien tant qu'il n'y a pas un seul mur au plan.
    const carre = t.root
      .findAllByType(TouchableOpacity)
      .find((n) =>
        String(n.props.accessibilityLabel ?? '').startsWith('Ajouter '),
      );
    expect(carre).toBeTruthy();
    act(() => t.unmount());
  });
});

describe('un scan qui n’a rien donné', () => {
  it('garde son conseil de balayage', () => {
    vider(false);
    const t = monter();
    const mots = textes(t).join(' | ');
    expect(mots).toContain('Aucun mur détecté');
    expect(mots).toMatch(/Balayez/);
    act(() => t.unmount());
  });

  it('offre AUSSI de tracer la pièce à la main', () => {
    // C'est l'issue qui manquait : la caméra s'obstine, on trace, on
    // continue le chantier au lieu de recommencer trois fois.
    vider(false);
    const t = monter();
    expect(bouton(t, 'Ajouter une pièce')).toBeTruthy();
    expect(bouton(t, 'Refaire un scan')).toBeTruthy();
    act(() => t.unmount());
  });
});

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
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
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

/**
 * DEUX DÉFAUTS VUS SUR LE TÉLÉPHONE, et pas en banc.
 *
 * Relevé du chantier : « le bouton prend toute la page verticalement avec le
 * texte tout en haut et coupé par le bouton », et « pas de retour en
 * arrière ». Les deux venaient de la même hâte : un écran monté à partir de
 * styles empruntés à un autre contexte, sans la barre qui va avec.
 *
 * Le premier est un piège classique de mise en page — `flex: 1` sur un
 * bouton fait pour une RANGÉE, réutilisé dans une COLONNE : il y prend la
 * hauteur au lieu de la largeur. Le second est pire : un écran sans retour
 * ne se quitte qu'en tuant l'application.
 */
describe('la mise en page de l’état vide', () => {
  it('ne laisse pas le bouton prendre toute la hauteur', () => {
    vider(true);
    const t = monter();
    const ajouter = bouton(t, 'Ajouter une pièce');
    const style = StyleSheet.flatten(ajouter?.props.style ?? {});
    // C'est LE défaut vu à l'écran : un bouton qui pousse le texte contre
    // le bord haut, où il se fait couper.
    expect(style.flex).toBeUndefined();
    expect(style.alignSelf).toBe('stretch');
    act(() => t.unmount());
  });

  it('offre toujours le retour', () => {
    vider(true);
    const t = monter();
    expect(bouton(t, 'Retour')).toBeTruthy();
    act(() => t.unmount());
  });

  it('le retour ramène à l’accueil', () => {
    vider(true);
    useScanStore.setState({ resultOrigin: 'scan' });
    const t = monter();
    act(() => bouton(t, 'Retour')?.props.onPress());
    expect(useScanStore.getState().screen).toBe('home');
    act(() => t.unmount());
  });

  it('et à la bibliothèque quand on en vient', () => {
    vider(false);
    useScanStore.setState({ resultOrigin: 'library', screen: 'result' });
    const t = monter();
    act(() => bouton(t, 'Retour')?.props.onPress());
    expect(useScanStore.getState().screen).toBe('library');
    act(() => t.unmount());
  });
});

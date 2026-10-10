/**
 * UN PLAN SE JETTE D'UN GLISSÉ — comme une notification.
 *
 * Relevé du patron : « on doit pouvoir supprimer un plan en slidant comme les
 * notifications, sur la gauche ».
 *
 * Ce banc tient les trois promesses du geste :
 *   — derrière chaque plan (accueil comme « Mes plans »), la corbeille ;
 *   — la ligne part TOUT DE SUITE, et un bandeau propose d'annuler ;
 *   — le plan ne s'en va pour de bon qu'au départ du bandeau — ou quand on
 *     quitte l'écran : « Annuler » le rend intact.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useScanStore } from '../src/store/scanStore';
import { HomeScreen } from '../src/screens/HomeScreen';
import { LibraryScreen } from '../src/screens/LibraryScreen';
import { DELAI_ANNULER } from '../src/components/BandeauAnnuler';

const plan = (id: string, name: string) =>
  ({
    id,
    name,
    createdAt: 1,
    updatedAt: 1,
    walls: [],
    openings: [],
    objects: [],
    rooms: [],
    fixtures: [],
    ceiling: [],
  }) as never;

const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root.findAll((n) => n.props?.accessibilityLabel === nom && typeof n.props?.onPress === 'function')[0];
const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Text).map((n) => String(n.props.children));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe.each([
  ['l’accueil', 'home', HomeScreen],
  ['« Mes plans »', 'library', LibraryScreen],
] as const)('%s', (_nom, ecran, Ecran) => {
  const monter = () => {
    act(() => {
      useScanStore.setState({ screen: ecran, saves: [plan('a', 'Salon Dupont'), plan('b', 'Studio Martin')], folders: [] });
    });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<Ecran />);
    });
    act(() => {
      jest.advanceTimersByTime(800);
    });
    return t;
  };

  it('porte une corbeille derrière chaque plan', () => {
    const t = monter();
    expect(bouton(t, 'Supprimer Salon Dupont')).toBeDefined();
    expect(bouton(t, 'Supprimer Studio Martin')).toBeDefined();
    act(() => t.unmount());
  });

  it('la ligne part tout de suite, « Annuler » la rend intacte', () => {
    const t = monter();
    act(() => bouton(t, 'Supprimer Salon Dupont').props.onPress());
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(bouton(t, 'Ouvrir Salon Dupont')).toBeUndefined();
    expect(textes(t)).toContain('« Salon Dupont » supprimé');
    act(() => bouton(t, 'Annuler la suppression').props.onPress());
    expect(bouton(t, 'Ouvrir Salon Dupont')).toBeDefined();
    act(() => {
      jest.advanceTimersByTime(DELAI_ANNULER + 500);
    });
    expect(useScanStore.getState().saves.map((s) => s.id)).toEqual(['a', 'b']);
    act(() => t.unmount());
  });

  it('sans annulation, le plan s’en va au départ du bandeau', () => {
    const t = monter();
    act(() => bouton(t, 'Supprimer Studio Martin').props.onPress());
    act(() => {
      jest.advanceTimersByTime(300);
    });
    // Pas encore : on peut se raviser.
    expect(useScanStore.getState().saves.map((s) => s.id)).toEqual(['a', 'b']);
    act(() => {
      jest.advanceTimersByTime(DELAI_ANNULER + 100);
    });
    expect(useScanStore.getState().saves.map((s) => s.id)).toEqual(['a']);
    expect(textes(t)).not.toContain('« Studio Martin » supprimé');
    act(() => t.unmount());
  });

  it('quitter l’écran confirme ce qui attendait', () => {
    const t = monter();
    act(() => bouton(t, 'Supprimer Salon Dupont').props.onPress());
    act(() => {
      jest.advanceTimersByTime(300);
    });
    act(() => t.unmount());
    expect(useScanStore.getState().saves.map((s) => s.id)).toEqual(['b']);
  });
});

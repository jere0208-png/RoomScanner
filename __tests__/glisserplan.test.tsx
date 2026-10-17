/**
 * UN PLAN SE JETTE D'UN GLISSÉ — comme une notification.
 *
 * Relevé du patron : « on doit pouvoir supprimer un plan en slidant comme les
 * notifications, sur la gauche ».
 *
 * Ce banc tient les trois promesses du geste :
 *   — derrière chaque plan (accueil comme « Mes plans »), la corbeille ;
 *   — la ligne part TOUT DE SUITE, et un bandeau propose d'annuler ;
 *   — le plan ne s'en va qu'au départ du bandeau — ou quand on quitte
 *     l'écran : « Annuler » le rend intact.
 *
 * Revues « Fatou » et « Hugo » : il ne s'en va plus pour de bon, il part à
 * la CORBEILLE, où il attend 30 jours (copie en ligne comprise) et se
 * restaure d'un geste.
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
/**
 * La ligne d'un plan. À l'accueil, la carte s'appelle « Ouvrir … » ; dans
 * « Mes plans », la ligne dit ce qu'on voit (nom, client, date…) et l'appui
 * passe en indice, « Ouvre le plan ».
 */
const ligneDe = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root.findAll(
    (n) =>
      typeof n.props?.onPress === 'function' &&
      (n.props?.accessibilityLabel === `Ouvrir ${nom}` ||
        (n.props?.accessibilityHint === 'Ouvre le plan' &&
          String(n.props?.accessibilityLabel ?? '').startsWith(`${nom},`))),
  )[0];
const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Text).map((n) => String(n.props.children));
/** Les plans hors corbeille. */
const vivants = () =>
  useScanStore
    .getState()
    .saves.filter((s) => !s.corbeille)
    .map((s) => s.id);

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
    expect(ligneDe(t, 'Salon Dupont')).toBeUndefined();
    expect(textes(t)).toContain('« Salon Dupont » mis à la corbeille');
    act(() => bouton(t, 'Annuler la suppression').props.onPress());
    expect(ligneDe(t, 'Salon Dupont')).toBeDefined();
    act(() => {
      jest.advanceTimersByTime(DELAI_ANNULER + 500);
    });
    expect(vivants()).toEqual(['a', 'b']);
    act(() => t.unmount());
  });

  it('sans annulation, le plan part à la corbeille au départ du bandeau', () => {
    const t = monter();
    act(() => bouton(t, 'Supprimer Studio Martin').props.onPress());
    act(() => {
      jest.advanceTimersByTime(300);
    });
    // Pas encore : on peut se raviser.
    expect(vivants()).toEqual(['a', 'b']);
    act(() => {
      jest.advanceTimersByTime(DELAI_ANNULER + 100);
    });
    expect(vivants()).toEqual(['a']);
    // Il est à la corbeille, pas effacé.
    expect(useScanStore.getState().saves.find((s) => s.id === 'b')?.corbeille).toBeGreaterThan(0);
    expect(textes(t)).not.toContain('« Studio Martin » mis à la corbeille');
    act(() => t.unmount());
  });

  it('quitter l’écran confirme ce qui attendait', () => {
    const t = monter();
    act(() => bouton(t, 'Supprimer Salon Dupont').props.onPress());
    act(() => {
      jest.advanceTimersByTime(300);
    });
    act(() => t.unmount());
    expect(vivants()).toEqual(['b']);
  });

  it('en supprimer un second ne fait rien perdre du premier', () => {
    const t = monter();
    act(() => bouton(t, 'Supprimer Salon Dupont').props.onPress());
    act(() => bouton(t, 'Supprimer Studio Martin').props.onPress());
    act(() => {
      jest.advanceTimersByTime(DELAI_ANNULER + 100);
    });
    act(() => t.unmount());
    // Les deux attendent à la corbeille, et se restaurent.
    expect(useScanStore.getState().saves.map((s) => s.id)).toEqual(['a', 'b']);
    act(() => useScanStore.getState().restaurerDeLaCorbeille('a'));
    expect(vivants()).toEqual(['a']);
  });
});

describe('la corbeille', () => {
  it('se vide seule au bout de 30 jours', () => {
    useScanStore.setState({ screen: 'home', saves: [plan('a', 'A'), plan('b', 'B')], folders: [] });
    useScanStore.getState().mettreALaCorbeille('a');
    const quand = useScanStore.getState().saves.find((s) => s.id === 'a')!.corbeille!;
    expect(useScanStore.getState().purgerLesEchus(quand + 29 * 24 * 3600 * 1000)).toBe(0);
    expect(useScanStore.getState().purgerLesEchus(quand + 31 * 24 * 3600 * 1000)).toBe(1);
    expect(useScanStore.getState().saves.map((s) => s.id)).toEqual(['b']);
  });

  it('se restaure depuis « Mes plans »', () => {
    act(() => {
      useScanStore.setState({ screen: 'library', saves: [plan('a', 'Salon Dupont'), plan('b', 'Studio Martin')], folders: [] });
      useScanStore.getState().mettreALaCorbeille('b');
    });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<LibraryScreen />);
    });
    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(ligneDe(t, 'Studio Martin')).toBeUndefined();
    act(() => bouton(t, 'Corbeille').props.onPress());
    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(textes(t).join(' | ')).toContain('Restaurer · supprimé le');
    const choix = t.root
      .findAll(
        (n) =>
          typeof n.props?.onPress === 'function' &&
          n.findAllByType(Text).some((x) => String(x.props.children) === 'Studio Martin'),
      )
      .pop()!;
    act(() => choix.props.onPress());
    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(ligneDe(t, 'Studio Martin')).toBeDefined();
    act(() => t.unmount());
  });
});

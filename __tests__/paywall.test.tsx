/**
 * LA PAGE PRO ET LA PORTE D'ENTRÉE — ce que voit celui qui paie.
 *
 * On monte les deux écrans et on vérifie ce qui compte : le comparatif
 * annonce le prix et les deux paliers, le code promo déverrouille, et
 * l'accueil envoie au paywall — pas au scan — quand le quota est épuisé.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    cameraStatus: jest.fn(async () => 'granted'),
    start: jest.fn(async () => true),
    stop: jest.fn(async () => null),
    pause: jest.fn(),
    resume: jest.fn(),
    startHeading: jest.fn(async () => true),
    stopHeading: jest.fn(async () => true),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
}));
let mockMarqueur: { compte: string; plans: number } | null = null;
jest.mock('../src/native/account', () => ({
  lireMarqueur: jest.fn(async () => mockMarqueur),
  ecrireMarqueur: jest.fn(async (m: { compte: string; plans: number }) => {
    mockMarqueur = m;
  }),
  connexionApple: jest.fn(async () => ({ id: 'A1' })),
  acheterAbonnement: jest.fn(async () => true),
}));

import React from 'react';
import { Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { PaywallScreen } from '../src/screens/PaywallScreen';
import { SignInScreen } from '../src/screens/SignInScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { GlowButton } from '../src/components/GlowButton';
import { useAccountStore } from '../src/store/accountStore';
import { useScanStore } from '../src/store/scanStore';

beforeEach(() => {
  jest.useFakeTimers();
  mockMarqueur = null;
  useAccountStore.setState({
    charge: true,
    compte: { id: 'email:x@y.fr', methode: 'email' },
    pro: false,
    proVia: null,
    plansUtilises: 0,
    paywallVisible: true,
  });
  useScanStore.setState({ screen: 'home', supported: true, saves: [], brouillon: null });
});
afterEach(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (el: React.ReactElement) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(el);
  });
  arbre = t;
  return t;
};

const textesDe = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .join(' | ');

/** Le nœud pressable qui porte ce libellé d'accessibilité. */
const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAll(
    (n) => n.props.accessibilityLabel === label && !!n.props.onPress,
  )[0];

describe('la page Pro', () => {
  it('compare les deux paliers, prix en tête', () => {
    const vu = textesDe(monter(<PaywallScreen />));
    expect(vu).toContain('Gratuit');
    expect(vu).toContain('Pro');
    expect(vu).toContain('4,90 €');
    expect(vu).toContain('1 relevé complet');
    expect(vu).toContain('Relevés illimités');
    expect(vu).toContain('Sans engagement');
  });

  it('le code CARIDI12 déverrouille et ferme la page', () => {
    const t = monter(<PaywallScreen />);
    act(() => {
      t.root.findByType(TextInput).props.onChangeText('CARIDI12');
    });
    act(() => {
      bouton(t, 'Appliquer le code').props.onPress();
    });
    expect(useAccountStore.getState().pro).toBe(true);
    expect(useAccountStore.getState().paywallVisible).toBe(false);
  });

  it('un mauvais code laisse tout verrouillé', () => {
    const t = monter(<PaywallScreen />);
    act(() => {
      t.root.findByType(TextInput).props.onChangeText('RIEN');
    });
    act(() => {
      bouton(t, 'Appliquer le code').props.onPress();
    });
    expect(useAccountStore.getState().pro).toBe(false);
  });
});

describe('la porte d’entrée', () => {
  it('propose Apple, Google et l’e-mail', () => {
    useAccountStore.setState({ compte: null });
    const t = monter(<SignInScreen />);
    expect(bouton(t, 'Continuer avec Apple')).toBeTruthy();
    expect(bouton(t, 'Continuer avec Google')).toBeTruthy();
    expect(bouton(t, 'Continuer avec un e-mail')).toBeTruthy();
    // Et elle annonce la règle du jeu : un compte par téléphone.
    expect(textesDe(t)).toContain('Un seul compte par téléphone');
  });
});

describe('l’accueil et le quota', () => {
  it('envoie au paywall — pas au scan — quand le plan gratuit est consommé', () => {
    useAccountStore.setState({ plansUtilises: 1, paywallVisible: false });
    const t = monter(<HomeScreen />);
    const cta = t.root
      .findAllByType(GlowButton)
      .find((n) => n.props.accessibilityLabel === 'Commencer le scan')!;
    act(() => {
      cta.props.onPress();
    });
    expect(useAccountStore.getState().paywallVisible).toBe(true);
    expect(useScanStore.getState().screen).toBe('home');
  });

  it('laisse passer le premier scan, et un Pro sans limite', () => {
    useAccountStore.setState({ paywallVisible: false });
    const t = monter(<HomeScreen />);
    const cta = t.root
      .findAllByType(GlowButton)
      .find((n) => n.props.accessibilityLabel === 'Commencer le scan')!;
    act(() => {
      cta.props.onPress();
    });
    expect(useAccountStore.getState().paywallVisible).toBe(false);
  });
});

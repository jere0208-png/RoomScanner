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
import { StyleSheet, Text, TextInput, type ViewStyle } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { LinearGradient, Mask, Stop, Text as SvgText } from 'react-native-svg';
import { PaywallScreen } from '../src/screens/PaywallScreen';
import { BadgePro } from '../src/components/BadgePro';
import { EssaiEpuise } from '../src/components/EssaiEpuise';
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
    essaiEpuiseVisible: false,
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

/*
 * LE BADGE PRO — blanc, cerné et lettré d'un or qui respire.
 *
 * L'ancien badge était un bloc noir à texte jaune : un aplat, posé sur la
 * seule carte qu'on vend. Le nouveau est BLANC, et une même bande d'ors
 * glisse derrière lui : elle se voit dans le contour et dans les lettres —
 * un couvercle blanc troué au masque en forme de « PRO » —, si bien que les
 * deux respirent ensemble, par construction. Le dégradé est LONG (plusieurs
 * badges de large) : à tout instant il est presque uni, et c'est le
 * mouvement qu'on sent, pas les couleurs qu'on compte.
 */
describe('le badge Pro', () => {
  const leBadge = () => monter(<PaywallScreen />).root.findByType(BadgePro);

  it('est blanc — plus aucun bloc noir sur la page', () => {
    const t = monter(<PaywallScreen />);
    expect(t.root.findAllByType(BadgePro)).toHaveLength(1);
    const noirs = t.root.findAll((n) => {
      const st = StyleSheet.flatten(n.props.style) as ViewStyle | undefined;
      return st?.backgroundColor === '#0B0D12';
    });
    expect(noirs).toHaveLength(0);
    // Le couvercle du badge est blanc : c'est lui, le bloc arrière.
    const badge = t.root.findByType(BadgePro);
    expect(
      badge.findAll((n) => n.props.fill === '#FFFFFF').length,
    ).toBeGreaterThan(0);
  });

  it('une VUE glisse, au pilote natif — la leçon du ruban', () => {
    // Le pilote natif ignore les attributs d'un dessin : seule une
    // transformation animée sur une vue garantit le mouvement.
    const animees = leBadge().findAll((n) => {
      const st = StyleSheet.flatten(n.props.style) as ViewStyle | undefined;
      if (!st || !Array.isArray(st.transform)) return false;
      const tx = (st.transform as Record<string, unknown>[]).find(
        (x) => 'translateX' in x,
      );
      return !!tx && typeof tx.translateX === 'object';
    });
    expect(animees.length).toBeGreaterThan(0);
  });

  it('le dégradé est long, monotone, et boucle sans couture', () => {
    const badge = leBadge();
    const stops = badge
      .findAllByType(Stop)
      .map((n) => String(n.props.stopColor));
    expect(stops.length).toBeGreaterThanOrEqual(3);
    // La couture : la bande se répète — dernier arrêt = premier, sinon la
    // boucle saute d'une couleur à chaque tour.
    expect(stops[0]).toBe(stops[stops.length - 1]);
    // Monotone : une seule famille chaude (R > V > B sur chaque arrêt) —
    // pas une teinte étrangère qui ferait arc-en-ciel.
    for (const teinte of stops) {
      const [r, v, b] = [1, 3, 5].map((i) =>
        parseInt(teinte.slice(i, i + 2), 16),
      );
      expect({ teinte, chaud: r > v && v > b }).toEqual({
        teinte,
        chaud: true,
      });
    }
    // Long : la bande qui glisse fait plusieurs badges de large — c'est ce
    // qui rend le dégradé presque uni à tout instant.
    const bandes = badge.findAll((n) => {
      const st = StyleSheet.flatten(n.props.style) as ViewStyle | undefined;
      return typeof st?.width === 'number' && st.width >= 138;
    });
    expect(bandes.length).toBeGreaterThan(0);
  });

  it('les lettres et le contour boivent au même dégradé', () => {
    const badge = leBadge();
    // UNE seule définition de dégradé : contour et lettres ne peuvent pas
    // diverger, c'est la construction qui le garantit.
    expect(badge.findAllByType(LinearGradient)).toHaveLength(1);
    const masques = badge.findAllByType(Mask);
    expect(masques).toHaveLength(1);
    const lettres = masques[0].findAllByType(SvgText);
    expect(lettres).toHaveLength(1);
    expect(lettres[0].props.children).toBe('PRO');
    // Le noir du masque, c'est la trouée : les lettres laissent voir la
    // bande qui glisse dessous.
    expect(lettres[0].props.fill).toBe('#000000');
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

describe('ce que l’essai adversarial a exigé', () => {
  it('la page Pro offre « Restaurer l’achat »', () => {
    const t = monter(<PaywallScreen />);
    expect(bouton(t, 'Restaurer l’achat')).toBeTruthy();
  });

  it('l’accueil porte le compte : on peut en sortir, et payer sans y être forcé', () => {
    useAccountStore.setState({ paywallVisible: false });
    const t = monter(<HomeScreen />);
    expect(bouton(t, 'Mon compte')).toBeTruthy();
  });
});

describe('le popup « essai déjà utilisé »', () => {
  it('annonce l’essai consommé et ouvre la page Pro', () => {
    useAccountStore.setState({ essaiEpuiseVisible: true, paywallVisible: false });
    const t = monter(<EssaiEpuise />);
    expect(textesDe(t)).toContain('essai gratuit');
    act(() => {
      bouton(t, 'Passer en Pro').props.onPress();
    });
    const s = useAccountStore.getState();
    expect(s.essaiEpuiseVisible).toBe(false);
    expect(s.paywallVisible).toBe(true);
  });

  it('« Plus tard » referme sans rien vendre', () => {
    useAccountStore.setState({ essaiEpuiseVisible: true, paywallVisible: false });
    const t = monter(<EssaiEpuise />);
    act(() => {
      bouton(t, 'Plus tard').props.onPress();
    });
    expect(useAccountStore.getState().essaiEpuiseVisible).toBe(false);
    expect(useAccountStore.getState().paywallVisible).toBe(false);
  });
});

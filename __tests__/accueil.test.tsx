/**
 * L'ACCUEIL — ce qu'on montre avant d'avoir scanné quoi que ce soit.
 *
 * Il expliquait l'application en trois lignes : « Scannez, ajustez,
 * explorez ». Trois pictogrammes et neuf mots pour dire ce qu'une seule
 * image montre mieux — le résultat. On ne vend pas un scanner de pièces avec
 * une notice, on le vend avec le plan qui en sort.
 *
 * Ce banc tient trois choses : le mode d'emploi est bien parti, la maquette
 * TOURNE VRAIMENT (une image figée aurait le même arbre, et l'on ne verrait
 * rien), et elle sort du même moteur que la vue 3D de l'app — pas d'un
 * dessin qui promettrait ce que l'application ne fait pas.
 */
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    // Le bouton demande l'autorisation de la caméra avant de lancer le scan.
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
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text } from 'react-native';
import { Polygon } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { HomeScreen } from '../src/screens/HomeScreen';
import { PhoneShowcase } from '../src/components/PhoneShowcase';
import { GlowButton } from '../src/components/GlowButton';
import { useScanStore } from '../src/store/scanStore';

beforeEach(() => {
  jest.useFakeTimers();
  useScanStore.setState({
    screen: 'home',
    supported: true,
    saves: [],
    brouillon: null,
  });
});
afterEach(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function monter() {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<HomeScreen />);
  });
  arbre = t;
  return t;
}

const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .join(' | ');

const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root
    .findAllByType(GlowButton)
    .find((n) => (n.props.accessibilityLabel ?? n.props.label) === label);

describe('l’accueil', () => {
  it('ne récite plus le mode d’emploi', () => {
    const vu = textes(monter());
    for (const mot of ['Scannez', 'Ajustez', 'Explorez']) {
      expect(vu).not.toContain(mot);
    }
    // La promesse, elle, reste : c'est une phrase, pas une notice.
    expect(vu).toContain('en plan coté');
  });

  it('montre un logement en volume, pas un dessin', () => {
    const t = monter();
    expect(t.root.findAllByType(PhoneShowcase)).toHaveLength(1);
    // Une centaine de faces au moins : c'est une scène 3D construite, pas
    // une illustration en trois traits.
    expect(t.root.findAllByType(Polygon).length).toBeGreaterThan(60);
  });

  /**
   * ET ELLE TOURNE.
   *
   * Une maquette figée aurait exactement le même arbre au premier rendu :
   * seule la comparaison dans le temps prouve le mouvement.
   */
  it('fait tourner la maquette toute seule', () => {
    const t = monter();
    const points = () =>
      t.root
        .findAllByType(Polygon)
        .slice(0, 12)
        .map((n) => n.props.points)
        .join(';');
    const avant = points();
    act(() => jest.advanceTimersByTime(1200));
    const apres = points();
    expect(apres).not.toBe(avant);
    // Et elle continue : une animation qui s'arrête au premier tour se
    // remarque au bout de trente secondes, sur un écran qu'on regarde.
    act(() => jest.advanceTimersByTime(4000));
    expect(points()).not.toBe(apres);
  });

  it('porte ses deux boutons, et le second seulement s’il y a des scans', () => {
    let t = monter();
    expect(bouton(t, 'Commencer le scan')).toBeDefined();
    expect(bouton(t, 'Mes scans')).toBeUndefined();
    act(() => t.unmount());
    arbre = null;
    useScanStore.setState({
      saves: [
        {
          id: 's1',
          name: 'Chantier',
          date: 1,
          walls: [],
          openings: [],
          objects: [],
          rooms: [],
        } as never,
      ],
    });
    t = monter();
    expect(bouton(t, 'Mes scans')).toBeDefined();
  });

  it('lance le scan au doigt', async () => {
    const t = monter();
    // Le départ demande l'autorisation de la caméra puis ouvre la session :
    // deux promesses avant que l'écran ne change.
    await act(async () => {
      bouton(t, 'Commencer le scan')!.props.onPress();
    });
    expect(useScanStore.getState().screen).toBe('scan');
  });

  /**
   * LE BOUTON RESTE MORT TANT QUE L'APPAREIL N'EST PAS DIT COMPATIBLE.
   *
   * Un contour qui tourne sur un bouton qui ne fera rien est une promesse en
   * l'air : l'animation s'arrête avec lui.
   */
  it('éteint le bouton sur un appareil incompatible', () => {
    useScanStore.setState({ supported: false });
    const t = monter();
    expect(bouton(t, 'Commencer le scan')!.props.disabled).toBe(true);
    expect(textes(t)).toContain('pas compatible');
  });
});

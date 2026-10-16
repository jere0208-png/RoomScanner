/**
 * LES TUILES DE L'ACCUEIL NE COUPENT PLUS LEURS MOTS.
 *
 * Revue de lisibilité : à hauteur fixe (152 et 126 points) et sous-titre sur
 * une ligne, l'accueil affichait « Avec vos mesures, san… » et « Photo ou
 * PDF de l'arch… ». Les tuiles ont maintenant une hauteur MINIMALE, deux
 * lignes de sous-titre, des textes plus courts ; et au-delà d'un
 * grossissement du texte de 1,35, le moulinet se déplie en une colonne.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
let mockGrossissement = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: mockGrossissement }),
}));

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { BASSE, GRAND_TEXTE, HAUTE, HomeScreen } from '../src/screens/HomeScreen';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { useNotifications } from '../src/store/notifications';

beforeEach(() => {
  jest.useFakeTimers();
  mockGrossissement = 1;
  useScanStore.setState({ screen: 'home', supported: true, saves: [], brouillon: null, error: null });
  useAccountStore.setState({ compte: null, pro: false });
  useNotifications.setState({ charge: true, recus: [], lus: [], supprimes: [] });
});
let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  jest.useRealTimers();
});

const monter = () => {
  act(() => {
    arbre = TestRenderer.create(<HomeScreen />);
  });
  return arbre!;
};
const LIBELLES = ['Commencer le scan', 'Dessiner un plan sans scanner', 'Voir un exemple', 'Lire un plan papier'];
const tuile = (t: TestRenderer.ReactTestRenderer, l: string) =>
  t.root.findAll((n) => n.props.accessibilityLabel === l && typeof n.props.onPress === 'function')[0];
const tuileDans = (v: TestRenderer.ReactTestInstance, l: string) =>
  v.findAll((n) => n.props.accessibilityLabel === l && typeof n.props.onPress === 'function')[0];
/** Le cadre coloré de la tuile : la vue qui porte son rayon. */
const cadre = (t: TestRenderer.ReactTestRenderer, l: string) =>
  tuile(t, l)
    .findAllByType(View)
    .map((v) => StyleSheet.flatten(v.props.style) ?? {})
    .find((st) => (st as { borderRadius?: number }).borderRadius === 26) as Record<string, unknown>;

describe('les tuiles du moulinet', () => {
  it('ont une hauteur minimale, plus une hauteur fixe', () => {
    const t = monter();
    for (const l of LIBELLES) {
      const st = cadre(t, l);
      expect({ l, height: st.height }).toEqual({ l, height: undefined });
      expect([HAUTE, BASSE]).toContain(st.minHeight);
    }
  });

  it('donnent deux lignes à leur sous-titre, et des sous-titres courts', () => {
    const t = monter();
    for (const l of LIBELLES) {
      const textes = tuile(t, l).findAllByType(Text);
      const sous = textes[textes.length - 1];
      expect({ l, lignes: sous.props.numberOfLines }).toEqual({ l, lignes: 2 });
      // Une colonne de tuile tient ~22 caractères par ligne en 12,5 pt.
      expect(String(sous.props.children).length).toBeLessThanOrEqual(34);
    }
    const tous = t.root.findAllByType(Text).map((n) => String(n.props.children));
    expect(tous).not.toContain('Avec vos mesures, sans scanner');
    expect(tous).not.toContain('Photo ou PDF de l’architecte');
  });

  it('se déplient en une colonne au-delà d’un grossissement de 1,35', () => {
    const t1 = monter();
    const sens = (t: TestRenderer.ReactTestRenderer) =>
      t.root
        .findAllByType(View)
        // Le moulinet : la vue qui tient à la fois l'exemple et le plan papier.
        .filter((v) => !!tuileDans(v, 'Voir un exemple') && !!tuileDans(v, 'Lire un plan papier'))
        .map((v) => StyleSheet.flatten(v.props.style) ?? {})
        .filter((st) => (st as { gap?: number }).gap === 12 && 'flexDirection' in st)
        .map((st) => (st as { flexDirection?: string }).flexDirection);
    expect(sens(t1)).toContain('row');
    act(() => t1.unmount());
    arbre = null;

    mockGrossissement = GRAND_TEXTE + 0.2;
    const t2 = monter();
    expect(sens(t2)).toContain('column');
    expect(sens(t2)).not.toContain('row');
    // Toutes les tuiles restent là.
    for (const l of LIBELLES) expect(tuile(t2, l)).toBeDefined();
  });
});

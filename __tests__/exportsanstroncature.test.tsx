/**
 * LA FEUILLE D'EXPORT NE COUPE PLUS SES PHRASES.
 *
 * Revue de lancement : des cartes de 92 points FIXES, `overflow: hidden`,
 * un detail borne a deux lignes — « En calques, pour AutoCAD. À envoyer à
 * l'architecte » finissait en « à envoyer… », et pire en grand texte. Pas
 * de croix non plus : on ne sortait qu'en visant le voile. Et le badge
 * « PRO » se voyait sans se dire : VoiceOver lisait « Plan PDF », rien de
 * ce qu'il coute.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ExportSheet, HAUTEUR_CARTE } from '../src/screens/result/ExportSheet';
import { ExportFond } from '../src/components/ExportFond';
import { useAccountStore } from '../src/store/accountStore';
import { useAlerte } from '../src/ui/alerte';

beforeEach(() => useAlerte.setState({ courante: null, file: [], hotes: [] }));

const monter = (onClose: () => void = () => {}) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <ExportSheet
        visible
        onClose={onClose}
        onDismiss={() => {}}
        onPdf={() => {}}
        onObj={() => {}}
        onMaterial={() => {}}
        onCsv={() => {}}
        onDxf={() => {}}
        onImage={() => {}}
      />,
    );
  });
  return t;
};
const cartes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(TouchableOpacity).filter((n) => typeof n.props.onLayout === 'function');

describe('les cartes grandissent avec leur texte', () => {
  it('une hauteur minimale, jamais fixe ni coupee', () => {
    act(() => useAccountStore.setState({ pro: false }));
    const t = monter();
    // Six formats, et le devis en tête en mode électricité (revue « clair-44 »).
    expect(cartes(t)).toHaveLength(7);
    for (const c of cartes(t)) {
      const st = StyleSheet.flatten(c.props.style) as { height?: number; minHeight?: number };
      expect(st.height).toBeUndefined();
      expect(st.minHeight).toBe(HAUTEUR_CARTE);
      // Aucun texte de la carte n'est borne en lignes.
      for (const x of c.findAllByType(Text)) expect(x.props.numberOfLines).toBeUndefined();
    }
    act(() => t.unmount());
  });

  it('l’image de fond suit la carte quand elle grandit', () => {
    const t = monter();
    const dxf = cartes(t).find((c) => String(c.props.accessibilityLabel).startsWith('Plan DXF'))!;
    act(() => dxf.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 131 } } }));
    const fond = t.root.findAllByType(ExportFond).find((f) => f.props.kind === 'dxf')!;
    expect(fond.props.hauteur).toBe(131);
    act(() => t.unmount());
  });
});

describe('la croix', () => {
  it('ferme, et se touche sur 44 points', () => {
    const fermetures: number[] = [];
    const t = monter(() => fermetures.push(1));
    const croix = t.root.findAll(
      (n) =>
        n.props?.accessibilityLabel === 'Fermer' &&
        n.props.accessibilityRole === 'button' &&
        typeof n.props.onPress === 'function' &&
        n.props.testID !== 'voile-feuille',
    )[0];
    expect(croix).toBeTruthy();
    // La croix de la coquille commune (`SheetShell`) : son dessin, et la
    // marge de toucher qui l'entoure.
    const st = StyleSheet.flatten(croix.props.style) as { width?: number; height?: number };
    const marge = typeof croix.props.hitSlop === 'number' ? croix.props.hitSlop : 0;
    expect((st.width ?? 0) + 2 * marge).toBeGreaterThanOrEqual(44);
    expect((st.height ?? 0) + 2 * marge).toBeGreaterThanOrEqual(44);
    act(() => croix.props.onPress());
    expect(fermetures).toHaveLength(1);
    act(() => t.unmount());
  });
});

describe('ce qu’elle coute, dit au lecteur d’ecran', () => {
  it('sans Pro : « reserve a l’abonnement Pro », et l’image « gratuit »', () => {
    act(() => useAccountStore.setState({ pro: false }));
    const t = monter();
    const labels = cartes(t).map((c) => String(c.props.accessibilityLabel));
    expect(labels).toContain('Plan PDF, réservé à l’abonnement Pro');
    expect(labels).toContain('Image du plan, gratuit');
    act(() => t.unmount());
  });

  it('chez l’abonne, le nom seul', () => {
    act(() => useAccountStore.setState({ pro: true }));
    const t = monter();
    const labels = cartes(t).map((c) => String(c.props.accessibilityLabel));
    expect(labels).toContain('Plan PDF');
    expect(labels).toContain('Image du plan');
    act(() => t.unmount());
    act(() => useAccountStore.setState({ pro: false }));
  });
});

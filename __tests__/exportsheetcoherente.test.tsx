/**
 * LA FEUILLE D'EXPORT, COHÉRENTE — revue des « découvreurs ».
 *
 *   — « clair-20 » : trois cartes du même niveau, trois traitements (fond
 *     violet, fond bleu, contour blanc). Un seul fond pour toutes, « Autres
 *     formats » compris ; c'est le dessin qui distingue une sortie.
 *   — « clair-20 » : « GRATUIT » en badge, puis « Gratuite, avec le logo »
 *     dans la même carte. Le badge le dit, le texte ne le répète pas.
 *   — « sombre-20 » : en sombre, la fenêtre se confondait avec le plan.
 *   — « clair-44 » : en mode électricité, le devis n'était pas dans la
 *     feuille d'export. Il y est, EN TÊTE, jamais sous « Autres formats ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ExportSheet } from '../src/screens/result/ExportSheet';
import { ExportFond, FOND_SOMBRE, TEINTE_DU_FOND } from '../src/components/ExportFond';
import { getStyles } from '../src/screens/result/styles';
import { dark, light } from '../src/theme';
import { useAccountStore } from '../src/store/accountStore';
import { useScanStore } from '../src/store/scanStore';

const KINDS = ['pdf', 'obj', 'materiel', 'csv', 'dxf', 'image', 'devis'] as const;

let fermetures = 0;
const monter = (modeElec: boolean, onDevis?: () => void) => {
  fermetures = 0;
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <ExportSheet
        visible
        modeElec={modeElec}
        onClose={() => {
          fermetures++;
        }}
        onDismiss={() => {}}
        onPdf={() => {}}
        onObj={() => {}}
        onMaterial={() => {}}
        onCsv={() => {}}
        onDxf={() => {}}
        onImage={() => {}}
        onDevis={onDevis}
      />,
    );
  });
  return t;
};
const tuiles = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(TouchableOpacity).filter((n) => typeof n.props.onPress === 'function');
const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Text).map((n) => String(n.props.children));

afterEach(() => act(() => useAccountStore.setState({ pro: false })));

describe('un seul traitement pour toutes les cartes', () => {
  it('le même fond pour chaque format, en clair comme en sombre', () => {
    for (const c of [light, dark]) {
      const fonds = new Set(KINDS.map((k) => TEINTE_DU_FOND(k, c)));
      expect(fonds.size).toBe(1);
      for (const k of KINDS) expect(FOND_SOMBRE(k, c)).toBe(false);
    }
  });

  it('« Autres formats » est une carte comme les autres : même fond, aucun contour', () => {
    const t = monter(false);
    const autres = tuiles(t).find((n) => n.props.accessibilityLabel === 'Autres formats')!;
    const carte = tuiles(t).find((n) => String(n.props.accessibilityLabel).startsWith('Plan PDF'))!;
    const sa = StyleSheet.flatten(autres.props.style) as { backgroundColor?: string; borderWidth?: number; borderRadius?: number };
    const sc = StyleSheet.flatten(carte.props.style) as { backgroundColor?: string; borderRadius?: number };
    expect(sa.backgroundColor).toBe(sc.backgroundColor);
    expect(sa.borderRadius).toBe(sc.borderRadius);
    expect(sa.borderWidth ?? 0).toBe(0);
    // Et chaque image de fond peint ce même fond.
    for (const f of t.root.findAllByType(ExportFond)) {
      expect(TEINTE_DU_FOND(f.props.kind, f.props.c)).toBe(sc.backgroundColor);
    }
    act(() => t.unmount());
  });
});

describe('« gratuit », dit une fois', () => {
  it('le badge le dit, le texte ne le répète pas', () => {
    const t = monter(false);
    expect(t.root.findAll((n) => n.props.testID === 'badge-gratuit-image').length).toBeGreaterThan(0);
    const detail = textes(t).find((x) => x.startsWith('La vue affichée'))!;
    expect(detail).not.toMatch(/gratuit/i);
    // Ce qui distingue l'image gratuite reste dit : le logo.
    expect(detail).toMatch(/logo EchoPlan/);
    act(() => t.unmount());
  });
});

describe('en sombre, la fenêtre se détache du plan', () => {
  it('un voile plus profond, une surface plus claire que le plan, un liseré', () => {
    const s = getStyles(dark);
    const feuille = StyleSheet.flatten([s.modalCard, s.exportFeuille]) as {
      backgroundColor: string;
      borderWidth?: number;
    };
    expect(feuille.backgroundColor).not.toBe(dark.surface);
    expect(feuille.backgroundColor).not.toBe(dark.bg);
    expect(feuille.borderWidth ?? 0).toBeGreaterThan(0);
    const voile = StyleSheet.flatten([s.modalBackdrop, s.exportVoile]) as { backgroundColor: string };
    expect(voile.backgroundColor).not.toBe(StyleSheet.flatten(s.modalBackdrop).backgroundColor);
    // Les cartes, à leur tour, se détachent de la fenêtre.
    expect(TEINTE_DU_FOND('pdf', dark)).not.toBe(feuille.backgroundColor);
  });

  it('en clair, rien ne change : le blanc se lit déjà sur le voile', () => {
    const s = getStyles(light);
    expect(StyleSheet.flatten([s.modalCard, s.exportFeuille]).backgroundColor).toBe(light.surface);
  });

  it('la feuille porte bien ces styles', () => {
    const t = monter(true);
    const feuille = t.root.findAll((n) => n.props.testID === 'feuille-export')[0];
    const st = Array.isArray(feuille.props.style) ? feuille.props.style : [feuille.props.style];
    expect(st).toContain(getStyles(light).exportFeuille);
    act(() => t.unmount());
  });
});

describe('le devis, en tête de l’export en mode électricité', () => {
  it('première carte, à vue, et pas sous « Autres formats »', () => {
    const t = monter(true);
    const liste = tuiles(t);
    expect(String(liste[0].props.accessibilityLabel)).toMatch(/^Devis/);
    expect(liste.find((n) => n.props.accessibilityLabel === 'Autres formats')).toBeUndefined();
    expect(textes(t)).toContain('Devis');
    act(() => t.unmount());
  });

  it('hors mode électricité, pas de devis', () => {
    const t = monter(false);
    expect(textes(t)).not.toContain('Devis');
    const autres = tuiles(t).find((n) => n.props.accessibilityLabel === 'Autres formats')!;
    act(() => autres.props.onPress());
    expect(textes(t)).not.toContain('Devis');
    act(() => t.unmount());
  });

  it('abonné : la feuille se ferme, puis la page du devis s’ouvre', () => {
    act(() => useAccountStore.setState({ pro: true }));
    act(() => useScanStore.setState({ screen: 'result' }));
    const t = monter(true);
    const devis = tuiles(t).find((n) => String(n.props.accessibilityLabel).startsWith('Devis'))!;
    act(() => devis.props.onPress());
    expect(fermetures).toBe(1);
    // iOS ne présente pas deux fenêtres : rien ne part avant la fermeture.
    expect(useScanStore.getState().screen).toBe('result');
    act(() => t.root.findByType(Modal).props.onDismiss());
    expect(useScanStore.getState().screen).toBe('devis');
    act(() => t.unmount());
  });

  it('sans abonnement : l’offre, comme la pastille du prix', () => {
    const surprise = jest.fn();
    const avant = useAccountStore.getState().ouvrirSurprise;
    act(() => useAccountStore.setState({ pro: false, ouvrirSurprise: surprise }));
    act(() => useScanStore.setState({ screen: 'result' }));
    const t = monter(true);
    const devis = tuiles(t).find((n) => String(n.props.accessibilityLabel).startsWith('Devis'))!;
    expect(devis.props.accessibilityLabel).toMatch(/Pro/);
    act(() => devis.props.onPress());
    act(() => t.root.findByType(Modal).props.onDismiss());
    expect(surprise).toHaveBeenCalledTimes(1);
    expect(useScanStore.getState().screen).toBe('result');
    act(() => t.unmount());
    act(() => useAccountStore.setState({ ouvrirSurprise: avant }));
  });
});

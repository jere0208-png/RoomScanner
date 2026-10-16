/**
 * LES TEXTES DISCRETS TIENNENT 4,5:1 — PARTOUT, PAS SEULEMENT SUR LE BLANC.
 *
 * Revue de lisibilité : `inkFaint` faisait 4,5:1 sur le blanc pur et
 * tombait à 4,0 sur une surface creusée, 3,7 sur une tuile pastel ; en
 * sombre, 4,1 sur un bouton rehaussé. Et le mot « Afficher » / « Ajouter »
 * du peigne, sous une opacité de 0,55, descendait à 2,1:1.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { SURFACE_BOUTON_SOMBRE, dark, light } from '../src/theme';
import { TEINTES_TUILES } from '../src/screens/HomeScreen';
import { RangeeOutils } from '../src/components/RangeeOutils';
import { getStyles } from '../src/screens/result/styles';

const lum = (hex: string) => {
  const v = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe('inkFaint', () => {
  // Les tuiles pastel de l'accueil portent du inkSoft, pas du inkFaint.
  it('en clair, 4,5:1 sur le blanc, le fond et la surface creusée', () => {
    for (const fond of [light.surface, light.bg, light.surfaceSunken]) {
      expect({ fond, ok: ratio(light.inkFaint, fond) >= 4.5 }).toEqual({ fond, ok: true });
    }
  });

  it('en sombre, 4,5:1 sur le fond, les surfaces, le bouton rehaussé et les tuiles', () => {
    for (const fond of [dark.bg, dark.surface, dark.surfaceSunken, SURFACE_BOUTON_SOMBRE, ...Object.values(TEINTES_TUILES.sombre)]) {
      expect({ fond, ok: ratio(dark.inkFaint, fond) >= 4.5 }).toEqual({ fond, ok: true });
    }
  });

  it('les sous-titres des tuiles pastel (inkSoft) tiennent aussi 4,5:1', () => {
    for (const fond of Object.values(TEINTES_TUILES.clair)) {
      expect({ fond, ok: ratio(light.inkSoft, fond) >= 4.5 }).toEqual({ fond, ok: true });
    }
  });

  it('reste plus discret que inkSoft en sombre (la hiérarchie tient)', () => {
    expect(lum(dark.inkFaint)).toBeLessThan(lum(dark.inkSoft));
  });
});

describe('le mot du peigne « Afficher »', () => {
  it('se lit : inkSoft, 12 pt au moins, et aucune opacité sous 1 au-dessus de lui', () => {
    const styles = getStyles(light) as unknown as Record<string, object>;
    const mot = StyleSheet.flatten(styles.peigneMot) as { color?: string; fontSize?: number };
    expect(mot.color).toBe(light.inkSoft);
    expect(mot.fontSize).toBeGreaterThanOrEqual(12);

    const anim = new Animated.Value(1);
    const pastille = (k: string) => <View key={k} />;
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <RangeeOutils
          elements={['a', 'b', 'c'].map(pastille)}
          largeur={390}
          reserve={0}
          bas={10}
          dessus={0}
          anim={anim}
          styles={styles}
        />,
      );
    });
    const texte = t.root.findAllByType(Text).find((n) => n.props.children === 'Afficher')!;
    expect(texte).toBeDefined();
    // De lui jusqu'à la racine : rien ne le voile.
    let n: TestRenderer.ReactTestInstance | null = texte;
    while (n) {
      const st = StyleSheet.flatten(n.props.style) as { opacity?: unknown } | undefined;
      const o = st?.opacity;
      const valeur = typeof o === 'number' ? o : o && typeof (o as { __getValue?: () => number }).__getValue === 'function' ? (o as { __getValue: () => number }).__getValue() : 1;
      expect(valeur).toBe(1);
      n = n.parent;
    }
    act(() => t.unmount());
  });
});

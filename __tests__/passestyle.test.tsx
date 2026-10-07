/**
 * LA PASSE DE STYLE — le plan, le devis, la bibliothèque.
 *
 * Relevé du patron : « Continue avec le plan, le devis et la bibliothèque »
 * — la même exigence que l'accueil : « un style plus "Apple like", pur (...)
 * rien ne doit faire vieillot ». Trois règles, posées à la source et tenues
 * ici, parce qu'une règle de style qui n'a pas de banc revient à la
 * première retouche :
 *
 *   1. PLUS DE HALO COLORÉ. Chaque bouton bleu portait une ombre bleue
 *      (`glow`) : l'effet qui date le plus une interface. L'ombre d'action
 *      est neutre, courte, posée (`ombreAction`).
 *   2. LE VERRE SUR CE QUI FLOTTE. Boutons ronds des barres, pastilles du
 *      plan (outils, vues, prix, contrôle) : des disques blancs à ombre
 *      portée devenus verre, comme les barres d'iOS.
 *   3. DES GRAISSES D'APPLE. 800 et 900 partout, c'était crier : 700 pour
 *      les grands titres, 600 pour le reste.
 *
 * Et un motif d'Android en moins : le bouton flottant de la bibliothèque.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as theme from '../src/theme';
import { FondVerre } from '../src/components/FondVerre';
import { ToolPill } from '../src/components/ToolPill';
import { DevisPastille } from '../src/components/DevisPastille';
import { ControlePastille } from '../src/components/ControlePastille';
import { LibraryScreen } from '../src/screens/LibraryScreen';
import { useScanStore } from '../src/store/scanStore';

const racine = join(__dirname, '..');
const lire = (p: string) => readFileSync(join(racine, p), 'utf8');
const sources = (dossier: string): string[] =>
  readdirSync(join(racine, dossier)).flatMap((n) => {
    const p = `${dossier}/${n}`;
    return statSync(join(racine, p)).isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

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

describe('1 — plus de halo coloré', () => {
  it('l’ombre d’action est neutre, et `glow` n’existe plus', () => {
    expect((theme as Record<string, unknown>).glow).toBeUndefined();
    expect(theme.ombreAction.shadowColor).toBe('#0B0D12');
    expect(theme.ombreAction.shadowOpacity).toBeLessThanOrEqual(0.15);
  });

  it('et plus aucune source ne l’appelle', () => {
    for (const p of [...sources('src'), 'App.tsx']) {
      expect([p, /\bglow\(/.test(lire(p))]).toEqual([p, false]);
    }
  });
});

describe('2 — le verre sur ce qui flotte', () => {
  it('la pastille d’outil : du verre dessous, plus de fond blanc ; le bleu plein la recouvre quand elle est allumée', () => {
    const t = monter(<ToolPill icon="ruler" label="Cotes" active={false} onPress={() => {}} />);
    expect(t.root.findAllByType(FondVerre)).toHaveLength(1);
    const pille = t.root.findAllByType(TouchableOpacity)[0];
    const st = StyleSheet.flatten(pille.props.style) as { backgroundColor?: string; shadowOpacity?: number };
    expect(st.backgroundColor).toBe('transparent');
    expect(st.shadowOpacity).toBeUndefined();
  });

  it('les pastilles de prix et de contrôle aussi, leur contour de sens gardé', () => {
    const prix = monter(<DevisPastille total={1248} onPress={() => {}} />);
    expect(prix.root.findAllByType(FondVerre)).toHaveLength(1);
    act(() => arbre?.unmount());
    const ctrl = monter(<ControlePastille alertes={0} commence onPress={() => {}} />);
    expect(ctrl.root.findAllByType(FondVerre)).toHaveLength(1);
    const b = ctrl.root.findAllByType(TouchableOpacity)[0];
    const st = StyleSheet.flatten(b.props.style) as { borderColor?: string; backgroundColor?: string };
    expect(st.borderColor).toBe(theme.light.green);
    expect(st.backgroundColor).toBe('transparent');
  });

  it('les boutons ronds des barres : plan, devis, bibliothèque, profil', () => {
    const compte = (p: string) => (lire(p).match(/<FondVerre rayon=/g) ?? []).length;
    // Plan : deux retours, deux icônes, la rangée des vues (2D/3D, étage, Explorer).
    expect(compte('src/screens/ResultScreen.tsx')).toBe(7);
    expect(compte('src/screens/DevisScreen.tsx')).toBe(1);
    // Bibliothèque : le retour, et « Nouveau dossier ».
    expect(compte('src/screens/LibraryScreen.tsx')).toBe(2);
    expect(compte('src/screens/ProfilScreen.tsx')).toBe(3);
    // Et leurs styles n'ont plus de fond blanc ni d'ombre.
    const styles = lire('src/screens/result/styles.ts');
    for (const nom of ['headerIcon', 'backButton', 'vuePastille']) {
      const a = styles.indexOf(`  ${nom}: {`);
      const corps = styles.slice(a, styles.indexOf('\n  },', a));
      expect([nom, corps.includes("backgroundColor: 'transparent'"), corps.includes('shadowCard')]).toEqual([nom, true, false]);
    }
  });
});

describe('3 — des graisses d’Apple', () => {
  it('ni 800 ni 900 sur le plan, le devis, la bibliothèque et leurs feuilles', () => {
    for (const p of [
      'src/screens/result/styles.ts',
      'src/screens/DevisScreen.tsx',
      'src/screens/LibraryScreen.tsx',
      'src/screens/ProfilScreen.tsx',
      'src/components/Sheet.tsx',
      'src/components/DevisPastille.tsx',
      'src/components/PendingPill.tsx',
    ]) {
      expect([p, /fontWeight: '(800|900)'/.test(lire(p))]).toEqual([p, false]);
    }
  });

  it('les grands titres gardent le gras : 700 au-delà de 20 points', () => {
    const styles = lire('src/screens/result/styles.ts');
    const a = styles.indexOf('  title: {');
    expect(styles.slice(a, styles.indexOf('\n  },', a))).toContain("fontWeight: '700'");
  });
});

describe('la bibliothèque n’a plus de bouton flottant', () => {
  beforeEach(() => {
    act(() =>
      useScanStore.setState({ screen: 'library', saves: [], folders: [], currentSaveId: null }),
    );
  });

  it('« Nouveau dossier » est dans la barre, à droite, pas posé sur la liste', () => {
    const t = monter(<LibraryScreen />);
    const nouveau = t.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Nouveau dossier' && typeof n.props?.onPress === 'function',
    )[0];
    expect(nouveau).toBeDefined();
    const st = StyleSheet.flatten(nouveau.props.style) as { position?: string; marginLeft?: string };
    expect(st.position).toBeUndefined();
    expect(st.marginLeft).toBe('auto');
    // Il partage sa rangée avec le retour.
    const rangee = nouveau.parent!;
    expect(rangee.findAll((n) => n.props?.accessibilityLabel === 'Retour').length).toBeGreaterThan(0);
    expect(nouveau.findAllByType(FondVerre)).toHaveLength(1);
    expect(lire('src/screens/LibraryScreen.tsx')).not.toMatch(/\bfab\b/);
  });
});

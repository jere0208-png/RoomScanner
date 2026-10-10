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
 *   2. DU BLANC NET SUR LES PAGES CLAIRES. Boutons ronds des barres,
 *      pastilles du plan (outils, vues, prix, contrôle) : un temps passés
 *      en verre, ils revenaient GRIS et cernés d'un filet crénelé — relevé
 *      du patron : « je t'ai demandé une modernisation pas un déclin ». Le
 *      verre n'a rien à flouter sur une page unie. Ils sont blancs pleins,
 *      avec une ombre neutre à peine posée (`ombreBouton`). Le verre est
 *      revenu depuis, à la demande du patron (voir `Verre.tsx`) : un voile
 *      blanc dense, aucun filet de React Native, l'ombre de l'élément — et
 *      sans le natif, comme ici, tout reste blanc plein.
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

describe('2 — du blanc net sur les pages claires', () => {
  const plein = (style: unknown) => {
    const st = StyleSheet.flatten(style as never) as {
      backgroundColor?: string;
      shadowColor?: string;
      shadowOpacity?: number;
    };
    return { fond: st.backgroundColor, ombre: st.shadowColor, force: st.shadowOpacity };
  };

  it('la pastille d’outil : blanche, ombre neutre et légère, aucun verre', () => {
    const t = monter(<ToolPill icon="ruler" label="Cotes" active={false} onPress={() => {}} />);
    const st = plein(t.root.findAllByType(TouchableOpacity)[0].props.style);
    expect(st.fond).toBe(theme.light.surface);
    expect(st.ombre).toBe('#0B0D12');
    expect(st.force).toBeLessThanOrEqual(0.1);
  });

  it('les pastilles de prix et de contrôle aussi, leur contour de sens gardé', () => {
    const prix = monter(<DevisPastille total={1248} onPress={() => {}} />);
    expect(plein(prix.root.findAllByType(TouchableOpacity)[0].props.style).fond).toBe(theme.light.surface);
    act(() => arbre?.unmount());
    const ctrl = monter(<ControlePastille alertes={0} commence onPress={() => {}} />);
    const b = ctrl.root.findAllByType(TouchableOpacity)[0];
    const st = StyleSheet.flatten(b.props.style) as { borderColor?: string; backgroundColor?: string };
    expect(st.borderColor).toBe(theme.light.green);
    expect(st.backgroundColor).toBe(theme.light.surface);
  });

  it('les boutons ronds des barres : blancs pleins, plus un seul fond de verre dans l’app', () => {
    for (const p of [...sources('src'), 'App.tsx']) {
      expect([p, /FondVerre/.test(lire(p))]).toEqual([p, false]);
    }
    const styles = lire('src/screens/result/styles.ts');
    for (const nom of ['headerIcon', 'backButton', 'vuePastille']) {
      const a = styles.indexOf(`  ${nom}: {`);
      const corps = styles.slice(a, styles.indexOf('\n  },', a));
      expect([nom, corps.includes('backgroundColor: c.surface'), corps.includes('...ombreBouton')]).toEqual([nom, true, true]);
    }
    // L'ombre d'un bouton est neutre et légère : pas de halo, pas de flou gris.
    expect(theme.ombreBouton.shadowColor).toBe('#0B0D12');
    expect(theme.ombreBouton.shadowOpacity).toBeLessThanOrEqual(0.1);
  });

  it('le verre revient, sans ce qui l’avait fait retirer', () => {
    /*
      Relevé du patron, après la visite : « le bouton quitter est mal fait,
      le bouton plus petit que le texte, et les boutons toujours grisés ».
      Le verre était parti de l'app. Il revient À SA DEMANDE — « le menu doit
      s'ouvrir telle une bulle Apple, en verre », « mets ce léger effet glass
      là où tu le juges nécessaire, pour la cohérence » —, et ce banc tient
      les causes de son départ :

      — UN SEUL VERRE. Un seul composant parle au natif (`Verre.tsx`) : pas
        d'imitation par écran, qui reviendrait grise à la première retouche.
      — LE VRAI. Sur iOS 26, le Liquid Glass d'Apple (`UIGlassEffect`) — qui
        adapte sa luminance à ce qu'il couvre ; avant, sa réplique native.
      — AUCUN FILET NI AUCUN APLAT DESSINÉ PAR REACT NATIVE sur le verre : le
        liseré est celui de la couche native, vectoriel, et rien ne recouvre
        le verre (relevé suivant : « la forme des cards a été modifiée »).
    */
    for (const p of [...sources('src'), 'App.tsx']) {
      if (p === 'src/components/Verre.tsx') continue;
      expect([p, /RoomScanVerre/.test(lire(p))]).toEqual([p, false]);
    }
    const verre = lire('src/components/Verre.tsx');
    expect(verre).not.toMatch(/borderWidth|hairlineWidth|<View|<Svg/);
    const natif = lire('modules/react-native-room-scan/ios/RoomScanVerre.swift');
    expect(natif).toContain('UIGlassEffect(style: .regular)');
    // Le verre n'est posé que VISIBLE : iOS abandonne en silence un verre posé
    // sous un parent transparent (nos fondus d'entrée partent de zéro).
    expect(natif).toMatch(/if visible \{ poserLeVerre\(\) \} else \{ guetter\(\) \}/);
    // Et la compilation se fait avec le SDK d'iOS 26.
    expect(lire('.github/workflows/build-ios-unsigned.yml')).toMatch(/xcode-select -s \/Applications\/Xcode_26/);
  });

  it('« Terminer » porte lui-même sa pilule : ce qu’on voit est ce qu’on touche', () => {
    const visite = lire('src/components/Exploration.tsx');
    const a = visite.indexOf('    terminer: {');
    const corps = visite.slice(a, visite.indexOf('\n    },', a));
    expect(corps).toContain('backgroundColor: c.surface');
    expect(corps).toMatch(/height: 4\d/);
    expect(corps).toContain('paddingHorizontal');
    // Le verre, s'il est là, se pose DANS le bouton et le remplit : c'est
    // toujours le bouton qui fait sa taille.
    expect(visite).toMatch(
      /style=\{\(\{ pressed \}\) => \[styles\.terminer, SUR_VERRE, pressed && styles\.enfonce\]\}/,
    );
    expect(lire('src/components/Verre.tsx')).toMatch(/style=\{\[StyleSheet\.absoluteFill, \{ borderRadius: rayon \}\]\}/);
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
    // Blanc plein, comme le retour : un bouton, pas un trou gris dans la barre.
    expect(StyleSheet.flatten(nouveau.props.style).backgroundColor).toBe(theme.light.surface);
    expect(lire('src/screens/LibraryScreen.tsx')).not.toMatch(/\bfab\b/);
  });
});

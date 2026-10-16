/**
 * LE PROFIL ÉPURÉ — revue des découvreurs (clair-31/32).
 *
 *   — le thème, la teinte et l'icône prenaient un écran et demi : ils se
 *     replient derrière une rangée « Apparence » qui dit ce qui est choisi ;
 *   — « Diagnostic », à l'icône de gyrophare, est un outil de développeur :
 *     l'administrateur seul le voit ;
 *   — « Passer en Pro · Gratuit · scans illimités » mêlait l'offre et
 *     l'état : le titre dit « Gratuit », la ligne ce que le Pro ajoute ;
 *   — deux boutons noirs pleins chez l'invité (« Créer un compte » et
 *     « Voir l'offre ») : une seule action principale.
 * Rien n'est retiré : chaque réglage reste à un appui.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { PHRASE_GRATUIT, ProfilScreen, resumeApparence } from '../src/screens/ProfilScreen';
import { useAccountStore } from '../src/store/accountStore';
import { useScanStore } from '../src/store/scanStore';
import { light } from '../src/theme';

const compte = { id: 'c1', prenom: 'Sam', email: 'sam@exemple.fr', methode: 'email' as const };

let arbre: TestRenderer.ReactTestRenderer | null = null;
beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ charge: true, compte, pro: false, admin: false, invite: false, paywallVisible: false });
  useScanStore.setState({ screen: 'profil', themePref: 'light', accentPref: 'bleu', saves: [] } as never);
});
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = () => {
  act(() => {
    arbre = TestRenderer.create(<ProfilScreen />);
  });
  return arbre!;
};
const tous = (t: TestRenderer.ReactTestRenderer) => t.root.findAll(() => true);
const parLabel = (t: TestRenderer.ReactTestRenderer, label: string) =>
  tous(t).find((n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function');
const texte = (t: TestRenderer.ReactTestRenderer) =>
  tous(t)
    .flatMap((n) => (typeof n.props?.children === 'string' ? [n.props.children] : []))
    .join(' | ');

describe('l’apparence se replie', () => {
  it('repliée par défaut : la rangée dit le choix, les ronds attendent', () => {
    const t = monter();
    const rangee = parLabel(t, 'Apparence');
    expect(rangee).toBeDefined();
    expect(rangee!.props.accessibilityState?.expanded).toBe(false);
    expect(parLabel(t, 'Thème clair')).toBeUndefined();
    expect(parLabel(t, 'Teinte Indigo')).toBeUndefined();
    expect(parLabel(t, 'Icône Indigo')).toBeUndefined();
    expect(texte(t)).toContain(resumeApparence('light', 'bleu'));
  });

  it('un appui l’ouvre : thème, teinte et icône y sont tous', () => {
    const t = monter();
    act(() => parLabel(t, 'Apparence')!.props.onPress());
    expect(parLabel(t, 'Apparence')!.props.accessibilityState?.expanded).toBe(true);
    for (const l of ['Thème système', 'Thème clair', 'Thème sombre', 'Teinte Indigo', 'Icône Indigo']) {
      expect([l, !!parLabel(t, l)]).toEqual([l, true]);
    }
    act(() => parLabel(t, 'Teinte Indigo')!.props.onPress());
    expect(useScanStore.getState().accentPref).toBe('indigo');
  });

  it('le résumé nomme le thème et la teinte', () => {
    expect(resumeApparence('system', 'bleu')).toBe('Système · Bleu');
    expect(resumeApparence('dark', 'prune')).toBe('Sombre · Prune');
    expect(resumeApparence('light', 'inconnue')).toBe('Clair');
  });
});

describe('le diagnostic, pour l’administrateur seul', () => {
  it('absent pour un compte ordinaire', () => {
    const t = monter();
    expect(parLabel(t, 'Diagnostic')).toBeUndefined();
    expect(texte(t)).not.toContain('Diagnostic');
  });

  it('présent pour l’administrateur, et il ouvre le journal', () => {
    useAccountStore.setState({ admin: true });
    const t = monter();
    const rangee = parLabel(t, 'Diagnostic');
    expect(rangee).toBeDefined();
    act(() => rangee!.props.onPress());
  });
});

describe('la carte d’abonnement dit l’état, puis l’offre', () => {
  it('« Gratuit », et ce que le Pro ajoute — plus de « scans illimités » mêlé à l’offre', () => {
    const t = monter();
    const vu = texte(t);
    expect(vu).toContain('Gratuit');
    expect(vu).toContain(PHRASE_GRATUIT);
    expect(vu).not.toContain('scans illimités');
    expect(vu).not.toContain('Gratuit ·');
  });

  it('chez l’invité, une seule action pleine : la connexion', () => {
    useAccountStore.setState({ compte: null, invite: true });
    const t = monter();
    const plein = (label: string) => {
      const n = parLabel(t, label)!;
      const st = StyleSheet.flatten(typeof n.props.style === 'function' ? n.props.style({ pressed: false }) : n.props.style) as {
        backgroundColor?: string;
      };
      return st?.backgroundColor === light.ink;
    };
    expect(plein('Créer un compte ou se connecter')).toBe(true);
    expect(plein('Voir l’offre Pro')).toBe(false);
  });

  it('avec un compte, l’offre redevient l’action pleine de la carte', () => {
    const t = monter();
    const n = parLabel(t, 'Voir l’offre Pro')!;
    const st = StyleSheet.flatten(n.props.style({ pressed: false })) as { backgroundColor?: string };
    expect(st.backgroundColor).toBe(light.ink);
    act(() => n.props.onPress());
    expect(useAccountStore.getState().paywallVisible).toBe(true);
  });
});

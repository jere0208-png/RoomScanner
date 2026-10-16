/**
 * UN SEUL NOM POUR SES PLANS, PAS DE JARGON À LA CONNEXION, UN MENU EN
 * SECTIONS.
 *
 * Revue de lisibilité : « Vos plans » sur l'accueil, « Mes scans » dans la
 * bibliothèque qu'il ouvre ; « DXF » dans la phrase d'accueil grand public ;
 * et le menu du plan, douze entrées à plat où « Scanner un étage » et
 * « Dessiner un étage » portaient la même icône (capture sombre-13).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ActionSheet, enSections } from '../src/components/Sheet';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('« Mes plans » partout', () => {
  it('l’accueil, la bibliothèque et le profil disent « Mes plans »', () => {
    const accueil = lire('src/screens/HomeScreen.tsx');
    expect(accueil).not.toMatch(/>Vos plans<|'Vos plans'/);
    expect(accueil).not.toContain('accessibilityLabel="Mes scans"');
    expect(accueil).toContain("'Mes plans'");
    expect(lire('src/screens/LibraryScreen.tsx')).toContain(": 'Mes plans'}");
    expect(lire('src/screens/LibraryScreen.tsx')).not.toContain("'Mes scans'");
    expect(lire('src/screens/ProfilScreen.tsx')).not.toContain('label="Mes scans"');
  });
});

describe('la connexion grand public', () => {
  it('ne parle plus de DXF', () => {
    const src = lire('src/screens/SignInScreen.tsx');
    const mentions = src.slice(src.indexOf('<Text style={s.mentions}>'), src.indexOf('</Text>', src.indexOf('<Text style={s.mentions}>')));
    expect(mentions).toContain('Scanner est gratuit et sans limite');
    expect(mentions).not.toContain('DXF');
  });
});

describe('le menu du plan', () => {
  const RESULT = lire('src/screens/ResultScreen.tsx');
  const bloc = RESULT.slice(RESULT.indexOf('const menuDuScan'), RESULT.indexOf('  return (', RESULT.indexOf('const menuDuScan')));
  /** Les entrées, dans l'ordre : libellé, icône, section. */
  const entrees = [...bloc.matchAll(/section: '([^']+)',\s*(?:\/\/[^\n]*\n\s*)*label: '([^']+)',\s*(?:\/\/[^\n]*\n\s*)*(?:icon: '([^']+)')?/g)].map(
    (m) => ({ section: m[1], label: m[2], icon: m[3] }),
  );

  it('toutes ses entrées sont rangées dans une section titrée — aucune retirée', () => {
    // « Jeter » est le bouton de l'alerte de « Revenir… », pas une entrée.
    const labels = [...bloc.matchAll(/^\s*label: '([^']+)'/gm)].map((m) => m[1]).filter((l) => l !== 'Jeter');
    expect(labels.length).toBeGreaterThanOrEqual(15);
    expect(entrees.map((e) => e.label).sort()).toEqual([...labels].sort());
    expect([...new Set(entrees.map((e) => e.section))]).toEqual(['Votre projet', 'Ajouter', 'Modifier', 'Version']);
    for (const l of ['Scanner un étage', 'Dessiner un étage', 'Scanner un sous-sol', 'Dessiner un sous-sol', 'Nouveau scan', 'Décorer']) {
      expect(labels).toContain(l);
    }
  });

  it('chaque entrée a son icône, distincte des autres', () => {
    const icones = entrees.filter((e) => e.icon).map((e) => e.icon);
    expect(new Set(icones).size).toBe(icones.length);
    const de = (l: string) => entrees.find((e) => e.label === l)!.icon;
    expect(de('Scanner un étage')).not.toBe(de('Dessiner un étage'));
    expect(de('Scanner un sous-sol')).not.toBe(de('Dessiner un sous-sol'));
  });

  it('la feuille titre ses sections et sépare leurs blocs', () => {
    const actions = [
      { section: 'Ajouter', label: 'Scanner un étage', icon: 'etage' as const, onPress: () => {} },
      { section: 'Ajouter', label: 'Dessiner un étage', icon: 'crayon' as const, onPress: () => {} },
      { section: 'Version', label: 'Nouveau scan', icon: 'nouveau' as const, onPress: () => {} },
    ];
    expect(enSections(actions).map((g) => [g.titre, g.actions.length])).toEqual([
      ['Ajouter', 2],
      ['Version', 1],
    ]);
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ActionSheet data={{ title: 'Plan', actions }} onClose={() => {}} />);
    });
    const titres = t.root
      .findAllByType(Text)
      .filter((n) => n.props.accessibilityRole === 'header')
      .map((n) => n.props.children);
    expect(titres).toEqual(['Ajouter', 'Version']);
    act(() => t.unmount());
  });
});

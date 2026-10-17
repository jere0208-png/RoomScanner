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
    // La règle du jeu, sans le capteur (revue des découvreurs : il se dit
    // une fois, sur la tuile de l'accueil).
    expect(mentions).toContain('gratuit et sans limite');
    expect(mentions).not.toContain('LiDAR');
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

  /*
    MIS À JOUR — revue des « découvreurs » : le menu est regroupé. « Ajouter
    une pièce » et « Ajouter un niveau » ouvrent une seconde feuille (scanner
    ou dessiner) ; celle des niveaux a ses sections (« Au-dessus », « En
    dessous »), celle de la pièce n'a que deux lignes. L'électricien voit son
    métier EN PREMIER (« Électricité ») ; « Décorer » a quitté le menu pour la
    barre du bas ; la proposition du mode, pour le profil.
  */
  it('toutes ses entrées sont rangées dans une section titrée — aucune retirée', () => {
    // « Jeter », « Activer », « Annuler » sont des boutons d'alerte, pas des
    // entrées ; les deux lignes de la feuille « Ajouter une pièce » n'ont pas
    // de section (deux choix, un seul bloc).
    const HORS = ['Jeter', 'Activer', 'Annuler', 'Scanner une autre pièce', 'Dessiner une pièce à la main'];
    const labels = [...bloc.matchAll(/^\s*label: '([^']+)'/gm)].map((m) => m[1]).filter((l) => !HORS.includes(l));
    expect(labels.length).toBeGreaterThanOrEqual(14);
    expect(entrees.map((e) => e.label).sort()).toEqual([...labels].sort());
    expect([...new Set(entrees.map((e) => e.section))]).toEqual([
      // Relevé « senior » : l'export, nommé, ouvre le menu.
      'Le dossier',
      'Électricité',
      'Votre projet',
      'Ajouter',
      'Au-dessus',
      'En dessous',
      'Modifier',
      'Version',
    ]);
    for (const l of ['Ajouter une pièce', 'Ajouter un niveau', 'Scanner un étage', 'Dessiner un étage', 'Scanner un sous-sol', 'Dessiner un sous-sol', 'Nouveau scan']) {
      expect(labels).toContain(l);
    }
    expect(labels).not.toContain('Décorer');
    expect(labels).not.toContain('Placer prises et interrupteurs');
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

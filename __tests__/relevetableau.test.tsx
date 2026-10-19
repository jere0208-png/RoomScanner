/**
 * LE RELEVÉ DU TABLEAU EXISTANT DIT CE QUI EST LÀ — revue « Marc »
 * (électricien, remise aux normes), décisions du patron.
 *
 *   — « Relever le tableau existant » s'ouvrait rempli du tableau que l'app
 *     projetait, souvent au vert « conforme » : on pouvait remettre au client
 *     un tableau fictif. Le menu ouvre un coffret vide ; seul le tableau
 *     dessiné sur le plan se pré-remplit, et la feuille le dit ;
 *   — le neuvième circuit sous un différentiel était refusé : un relevé note
 *     le défaut, il ne l'interdit pas ;
 *   — sans section de fil, « 25 A sur du 2,5 mm² » passait. Le contrôle
 *     porte sur les disjoncteurs seuls (1,5 → 16 A, 2,5 → 20 A, 4 → 25 A,
 *     6 → 32 A) : un porte-fusible n'est plus aux normes, il est à remplacer
 *     de toute façon. Le four et le chauffe-eau se protègent à 20 A.
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
import {
  calibreMaxDe,
  calibreMaxSection,
  diagnosticExistant,
  implanter,
  rattacher,
  type DepartExistant,
} from '../src/geometry/existant';
import { ExistantSheet } from '../src/screens/result/ExistantSheet';
import { useScanStore } from '../src/store/scanStore';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const dj = (id: string, calibre: number, extra: Partial<DepartExistant> = {}): DepartExistant => ({
  id, organe: 'disjoncteur', calibre, usage: 'Prises', rangee: 0, ...extra,
});
const diff = (id: string): DepartExistant => ({
  id, organe: 'differentiel', calibre: 40, sensibilite: 30, typeDiff: 'A', rangee: 0,
});
const tableau = (departs: DepartExistant[]) => rattacher(departs, implanter({ departs, rangees: 2, parRangee: 13 }));
const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Text).map((n) => [].concat(n.props.children).join('')).join(' ');

beforeEach(() => {
  act(() => {
    useScanStore.getState().reset();
  });
});
// La feuille qui descend finit son animation avant que Jest ne démonte
// l'environnement : sans quoi son minuteur tombe dans le vide et le
// processus de test meurt après coup (« _bezier is not a function »).
afterAll(() => new Promise((r) => setTimeout(r, 600)));

describe('le menu ouvre un coffret vide', () => {
  it('seul le tableau dessiné sur le plan se pré-remplit', () => {
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).toMatch(/useCallback\(\(depuisLeProjet = false\) =>/);
    expect(ecran).toMatch(/if \(depuisLeProjet && r\.projete && r\.tableau\)/);
    // Le menu « Relever le tableau existant » n'en demande pas.
    const i = ecran.indexOf("label: 'Relever le tableau existant'");
    expect(ecran.slice(i, i + 600)).toMatch(/onPress: \(\) => ouvrirLeTableau\(\),/);
  });

  it('un tableau déduit du plan le dit, et se confirme ou se vide', () => {
    act(() => {
      useScanStore.getState().constituerLeTableau({ departs: [diff('d1'), dj('c1', 16)], rangees: 2, parRangee: 13 });
    });
    expect(useScanStore.getState().existant!.projete).toBe(true);
    const confirmer = jest.fn();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <ExistantSheet
          visible
          existant={useScanStore.getState().existant}
          onClose={() => {}}
          onAjouter={() => ''}
          onModifier={() => {}}
          onRetirer={() => {}}
          onDecrire={() => {}}
          onVider={() => {}}
          onConfirmerReleve={confirmer}
        />,
      );
    });
    expect(textes(t)).toMatch(/Tableau projeté, pas relevé/);
    const b = t.root.findAll((n) => n.props.accessibilityLabel === 'C’est bien le tableau en place' && typeof n.props.onPress === 'function')[0];
    act(() => b.props.onPress());
    expect(confirmer).toHaveBeenCalled();
    act(() => t.unmount());
    act(() => useScanStore.getState().confirmerLeReleve());
    expect(useScanStore.getState().existant!.projete).toBeUndefined();
  });

  it('la feuille PDF d’un tableau projeté ne se présente pas comme un relevé', () => {
    // Une seule formule, partagée par la garde, le sommaire et la feuille (TITRE_TABLEAU_PROJETE).
    expect(lire('src/export/pdf.ts')).toContain("export const TITRE_TABLEAU_PROJETE = 'Tableau projeté (non relevé)'");
    expect(lire('src/export/pdf.ts')).toMatch(/existant\.projete \? TITRE_TABLEAU_PROJETE : 'Tableau existant'/);
  });
});

describe('le neuvième circuit se note', () => {
  it('il se clipse, et la feuille dit l’écart', () => {
    let t!: TestRenderer.ReactTestRenderer;
    const sheet = () => (
      <ExistantSheet
        visible
        existant={useScanStore.getState().existant}
        onClose={() => {}}
        onAjouter={(d) => useScanStore.getState().ajouterDepart(d)}
        onModifier={() => {}}
        onRetirer={() => {}}
        onDecrire={() => {}}
      />
    );
    act(() => {
      t = TestRenderer.create(sheet());
    });
    const appuie = (label: string) => {
      const b = t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false })[0];
      expect([label, !!b]).toEqual([label, true]);
      act(() => b.props.onPress());
      act(() => t.update(sheet()));
    };
    appuie('Clipser : Différentiel 30 mA type AC');
    for (let i = 0; i < 9; i++) appuie('Disjoncteur 16 ampères');
    const departs = useScanStore.getState().existant!.departs;
    expect(departs.filter((d) => d.organe === 'disjoncteur')).toHaveLength(9);
    expect(textes(t)).toMatch(/protège maintenant 9 circuits/);
    expect(diagnosticExistant(tableau(departs)).some((c) => c.id.startsWith('charge-'))).toBe(true);
    act(() => t.unmount());
  });

  it('les calibres 25 A et 40 A se clipsent', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <ExistantSheet visible existant={null} onClose={() => {}} onAjouter={() => ''} onModifier={() => {}} onRetirer={() => {}} onDecrire={() => {}} />,
      );
    });
    const labels = t.root.findAll((n) => typeof n.props.onPress === 'function').map((n) => n.props.accessibilityLabel);
    expect(labels).toContain('Disjoncteur 25 ampères');
    expect(labels).toContain('Disjoncteur 40 ampères');
    act(() => t.unmount());
  });
});

describe('le calibre contre la section du fil', () => {
  it('le tableau du patron : 1,5 → 16 A, 2,5 → 20 A, 4 → 25 A, 6 → 32 A', () => {
    expect(calibreMaxSection(1.5)).toBe(16);
    expect(calibreMaxSection(2.5)).toBe(20);
    expect(calibreMaxSection(4)).toBe(25);
    expect(calibreMaxSection(6)).toBe(32);
    expect(calibreMaxSection(undefined)).toBeNull();
  });

  it('25 A sur du 2,5 mm² est un danger ; 20 A ne dit rien ; un 10 A sur du 1,5 non plus', () => {
    const c = diagnosticExistant(
      tableau([diff('d1'), dj('a', 25, { section: 2.5 }), dj('b', 20, { section: 2.5 }), dj('e', 10, { section: 1.5, usage: 'Éclairage' })]),
    );
    const sections = c.filter((x) => x.id.startsWith('section-'));
    expect(sections.map((x) => x.id)).toEqual(['section-a']);
    expect(sections[0].gravite).toBe('danger');
    expect(sections[0].titre).toBe('Disjoncteur 25 A sur du 2,5 mm²');
  });

  it('le four et le chauffe-eau se protègent à 20 A, la plaque à 32 A', () => {
    expect(calibreMaxDe('Four')).toBe(20);
    expect(calibreMaxDe('Chauffe-eau')).toBe(20);
    expect(calibreMaxDe('Plaque de cuisson')).toBe(32);
  });
});

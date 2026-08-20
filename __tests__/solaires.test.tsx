/**
 * LES ICÔNES SOLAR BOLD — un seul jeu, vendu en dur, pour tous les menus.
 *
 * Relevé du patron : refonte de toutes les icônes des menus des écrans de
 * scan par le jeu « Solar Bold » (collection SVGRepo, © Solar Icons,
 * CC BY 4.0). Le jeu est GÉNÉRÉ par `tools/gen-solaires.mjs` et vendu en
 * dur dans `src/ui/solaires.ts` : rien ne se télécharge à l'exécution, et
 * une icône manquante casse la génération, pas le téléphone.
 *
 * Ce banc tient les deux invariants : chaque clé des menus a son tracé
 * Solar (un vrai tracé plein, pas un reste de l'ancien jeu au trait), et
 * les pastilles le dessinent en SILHOUETTE — le Bold de Solar est un jeu
 * de pleins, un rendu au trait le rendrait méconnaissable.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Path } from 'react-native-svg';
import { SOLAIRES, type IconeSolaire } from '../src/ui/solaires';
import { ToolPill, type ToolIcon } from '../src/components/ToolPill';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const CLES_OUTILS: ToolIcon[] = [
  'plafond', 'save', 'edit', 'ruler', 'surface', 'elec', 'furniture',
  'colors', 'room', 'image', 'model', 'rooms', 'undo', 'square', 'check',
  'gaines', 'murs', 'appareil', 'reperes', 'plus',
];
const CLES_FEUILLES: IconeSolaire[] = [
  'vues3d', 'metre', 'cotes2d', 'cotes3d', 'meubles', 'ouvertures',
  'couleurs', 'elevations', 'schema',
];
const CLES_MUR: IconeSolaire[] = ['supprimer', 'crayon'];

describe('le jeu Solar Bold', () => {
  it('porte un vrai tracé plein pour chaque clé des menus', () => {
    for (const cle of [...CLES_OUTILS, ...CLES_FEUILLES, ...CLES_MUR]) {
      const d = SOLAIRES[cle as IconeSolaire];
      expect({ cle, tracee: typeof d === 'string' && d.startsWith('M') })
        .toEqual({ cle, tracee: true });
      // Un tracé Solar Bold est DENSE : des dizaines de commandes. Les
      // vieux tracés au trait faisaient quelques dizaines de caractères.
      expect({ cle, dense: (d as string).length > 60 }).toEqual({
        cle,
        dense: true,
      });
    }
  });

  it('les pastilles d’outils dessinent la silhouette Solar, remplie', () => {
    for (const icone of CLES_OUTILS) {
      let t!: TestRenderer.ReactTestRenderer;
      act(() => {
        t = TestRenderer.create(
          <ToolPill icon={icone} label="x" active={false} onPress={() => {}} />,
        );
      });
      arbre = t;
      const traces = t.root.findAllByType(Path);
      expect({ icone, n: traces.length }).toEqual({ icone, n: 1 });
      expect(traces[0].props.d).toBe(SOLAIRES[icone]);
      // La silhouette : un plein, pas un trait.
      expect(traces[0].props.fill).not.toBe('none');
      expect(traces[0].props.fill).toBeTruthy();
      act(() => t.unmount());
      arbre = null;
    }
  });
});

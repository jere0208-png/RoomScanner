/**
 * LES FEUILLES SE LISENT A VOICEOVER.
 *
 * Releve de la revue VoiceOver : le voile etait un Pressable, et la carte
 * vivait DEDANS. Sur iOS, un element accessible cache au lecteur d'ecran
 * tout ce qu'il contient : on n'entendait qu'un grand bouton sans nom, et
 * rien de la feuille — choix, champs, alertes — n'etait activable.
 *
 * Le banc tient la forme voulue : le voile est un FRERE de la carte, nomme
 * « Fermer » ; la carte se declare modale ; et aucun ancetre de la carte
 * n'est un element touchable. Le geste au doigt, lui, ne change pas :
 * toucher le voile ferme.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { SheetShell } from '../src/components/Sheet';
import { MenuCompte } from '../src/components/MenuCompte';
import { ExportSheet } from '../src/screens/result/ExportSheet';
import { FichePieceSheet } from '../src/screens/result/FichePieceSheet';
import { useAlerte } from '../src/ui/alerte';

beforeEach(() => useAlerte.setState({ courante: null, file: [], hotes: [] }));

const verifier = (
  el: (onClose: () => void) => React.ReactElement,
  voile: string,
) => {
  const fermetures: number[] = [];
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(el(() => fermetures.push(1)));
  });
  const cartes = t.root.findAll(
    (n) => n.props?.accessibilityViewIsModal === true && typeof n.type === 'string',
  );
  expect(cartes.length).toBeGreaterThan(0);
  for (const carte of cartes) {
    let p = carte.parent;
    while (p) {
      // Aucun ancetre touchable : il cacherait la carte au lecteur d'ecran.
      expect(typeof p.props?.onPress).not.toBe('function');
      expect(p.props?.accessible).not.toBe(true);
      p = p.parent;
    }
  }
  const v = t.root.findAll((n) => n.props?.testID === voile && typeof n.props.onPress === 'function')[0];
  expect(v).toBeTruthy();
  expect(v.props.accessibilityRole).toBe('button');
  expect(String(v.props.accessibilityLabel)).toMatch(/^Fermer/);
  act(() => v.props.onPress());
  expect(fermetures.length).toBe(1);
  act(() => t.unmount());
};

describe('le voile a cote de la carte, pas autour', () => {
  it('la coquille commune des feuilles', () => {
    verifier(
      (f) => (
        <SheetShell visible onClose={f}>
          <Text>Contenu</Text>
        </SheetShell>
      ),
      'voile-feuille',
    );
  });

  it('la feuille d’export', () => {
    verifier(
      (f) => (
        <ExportSheet
          visible
          onClose={f}
          onDismiss={() => {}}
          onPdf={() => {}}
          onObj={() => {}}
          onMaterial={() => {}}
          onCsv={() => {}}
          onDxf={() => {}}
          onImage={() => {}}
        />
      ),
      // La coquille commune des feuilles (`SheetShell`), son voile compris.
      'voile-feuille',
    );
  });

  it('la fiche de la piece', () => {
    verifier(
      (f) => <FichePieceSheet visible nom="Salon" fiche={null} onClose={f} onPoser={() => {}} />,
      'voile-fiche',
    );
  });

  it('le menu du compte', () => {
    verifier((f) => <MenuCompte visible fermer={f} />, 'voile-compte');
  });
});

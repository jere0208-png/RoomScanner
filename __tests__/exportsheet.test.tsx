/**
 * LA FEUILLE DES SORTIES.
 *
 * Elle est la porte de tout ce que l application produit : un format qui n y
 * figure pas n existe pas pour l utilisateur, quelle que soit la qualite du
 * code qui le genere. Ce banc verifie que chaque sortie est LA et qu elle
 * appelle bien la sienne — l erreur classique etant de brancher deux entrees
 * sur la meme action.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ExportSheet } from '../src/screens/result/ExportSheet';

const appels: string[] = [];
const monter = () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <ExportSheet
        visible
        onClose={() => {}}
        onDismiss={() => {}}
        onPdf={() => appels.push('pdf')}
        onObj={() => appels.push('obj')}
        onMaterial={() => appels.push('materiel')}
        onCsv={() => appels.push('csv')}
        onDxf={() => appels.push('dxf')}
        onImage={() => appels.push('image')}
        onPresentation={() => appels.push('presentation')}
      />,
    );
  });
  return t;
};

beforeEach(() => {
  appels.length = 0;
});

describe('les sorties offertes', () => {
  it('propose le DXF a cote du PDF', () => {
    const t = monter();
    const mots = t.root.findAllByType(Text).map((n) => String(n.props.children));
    expect(mots.join(' | ')).toContain('Plan DXF');
    // Et il se presente pour ce qu il est : un dessin qu on rouvre ailleurs.
    expect(mots.join(' | ')).toMatch(/AutoCAD|ArchiCAD/);
    act(() => t.unmount());
  });

  it('chaque tuile appelle la sienne, et pas celle d a cote', () => {
    const t = monter();
    const tuiles = t.root
      .findAllByType(TouchableOpacity)
      .filter((n) => typeof n.props.onPress === 'function');
    // Six sorties : PDF, 3D, materiel, CSV, DXF, image, presentation.
    expect(tuiles.length).toBeGreaterThanOrEqual(7);
    for (const tuile of tuiles) act(() => tuile.props.onPress());
    // Chacune une fois, aucune deux fois : un doublon signalerait deux
    // entrees branchees sur la meme action.
    for (const nom of ['pdf', 'obj', 'materiel', 'csv', 'dxf', 'image']) {
      expect(appels.filter((a) => a === nom)).toHaveLength(1);
    }
    act(() => t.unmount());
  });
});

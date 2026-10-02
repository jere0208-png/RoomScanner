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
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
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

  /*
    DEUX PAR LIGNE — releve du patron : « refais ce pop-up pour le reduire
    en faisant des blocs de 2 par ligne ».

    Sept sorties en pleine largeur, chacune avec sa vignette et deux lignes
    de texte : la feuille faisait plus haut que l ecran, et les dernieres
    sorties — l image, la presentation — se trouvaient en defilant. Une
    sortie qu on ne voit pas n existe pas.
  */
  const tuiles = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAllByType(TouchableOpacity)
      .filter((n) => typeof n.props.onPress === 'function');

  const plat = (st: unknown) =>
    (StyleSheet.flatten(st as never) ?? {}) as {
      width?: number | string;
      flexWrap?: string;
    };

  it('range les sorties deux par ligne', () => {
    const t = monter();
    const liste = tuiles(t);
    // La grille passe a la ligne toute seule : c est elle qui met deux
    // tuiles par rang, pas un decoupage ecrit a la main.
    let n: TestRenderer.ReactTestInstance | null = liste[0].parent;
    let grille: TestRenderer.ReactTestInstance | null = null;
    while (n) {
      if (plat(n.props?.style).flexWrap === 'wrap') {
        grille = n;
        break;
      }
      n = n.parent;
    }
    expect(grille).not.toBeNull();
    // Une demi-largeur chacune : deux tiennent cote a cote.
    const largeurs = liste.map((x) => plat(x.props.style).width);
    for (const l of largeurs.slice(0, 6)) {
      expect(typeof l === 'string' && parseFloat(l) <= 50).toBe(true);
    }
    act(() => t.unmount());
  });

  /*
    PLUS DE TUILE A PART. La septieme sortie etait la presentation animee, en
    pleine largeur parce qu elle ne produisait pas de fichier. Elle a ete
    retiree avec la refonte grand public : il reste six fichiers, trois
    rangees pleines, et aucun trou.
  */
  it('ne range plus que des fichiers, six en trois rangees', () => {
    const t = monter();
    const liste = tuiles(t);
    expect(liste).toHaveLength(6);
    for (const x of liste) {
      const l = plat(x.props.style).width;
      expect(typeof l === 'string' && parseFloat(l) <= 50).toBe(true);
    }
    act(() => t.unmount());
  });

  it('chaque tuile appelle la sienne, et pas celle d a cote', () => {
    const t = monter();
    const liste = tuiles(t);
    // Six sorties : PDF, 3D, materiel, CSV, DXF, image.
    expect(liste.length).toBe(6);
    for (const tuile of liste) act(() => tuile.props.onPress());
    // Chacune une fois, aucune deux fois : un doublon signalerait deux
    // entrees branchees sur la meme action.
    for (const nom of ['pdf', 'obj', 'materiel', 'csv', 'dxf', 'image']) {
      expect(appels.filter((a) => a === nom)).toHaveLength(1);
    }
    act(() => t.unmount());
  });
});

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
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ExportSheet, HAUTEUR_CARTE } from '../src/screens/result/ExportSheet';
import { ExportFond, PLAN_EXEMPLE, TEINTE_DU_FOND, cadrerLePlan } from '../src/components/ExportFond';
import { dark, light } from '../src/theme';

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
    UNE SORTIE PAR LIGNE, ET CHACUNE MONTRE CE QU ELLE DONNE — releve du
    patron : « revois le menu exporter pour afficher des options dans un
    listing vertical 1 par 1, avec des images de fond pour une comprehension
    visuelle ».

    La grille de deux tenait dans l ecran, mais chaque tuile ne portait
    qu une icone : on lisait le format, on ne voyait pas le resultat. Chaque
    carte prend maintenant la largeur, et son fond le montre — dessine avec
    le plan qu on vient de relever. La liste defile si l ecran est court.
  */
  const tuiles = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAllByType(TouchableOpacity)
      .filter((n) => typeof n.props.onPress === 'function');

  it('range les sorties en liste, une par ligne, dans une vue qui defile', () => {
    const t = monter();
    const liste = tuiles(t);
    expect(liste).toHaveLength(6);
    for (const x of liste) {
      const st = StyleSheet.flatten(x.props.style) as { width?: unknown; height?: number };
      // Pleine largeur : aucune demi-largeur ne traine.
      expect(st.width).toBeUndefined();
      expect(st.height).toBe(HAUTEUR_CARTE);
    }
    // Toutes dans la meme liste qui defile, sans grille qui passe a la ligne.
    const defile = t.root.findAllByType(ScrollView);
    expect(defile).toHaveLength(1);
    for (const x of liste) {
      let n: TestRenderer.ReactTestInstance | null = x.parent;
      let dans = false;
      while (n) {
        if (n === defile[0]) dans = true;
        expect((StyleSheet.flatten(n.props?.style) as { flexWrap?: string } | undefined)?.flexWrap).not.toBe('wrap');
        n = n.parent;
      }
      expect(dans).toBe(true);
    }
    act(() => t.unmount());
  });

  it('chaque carte porte son image de fond, a sa taille, et le plan releve', () => {
    const murs = [
      { a: { x: 0, z: 0 }, b: { x: 4, z: 0 } },
      { a: { x: 4, z: 0 }, b: { x: 4, z: 3 } },
    ];
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <ExportSheet
          visible
          murs={murs}
          onClose={() => {}}
          onDismiss={() => {}}
          onPdf={() => {}}
          onObj={() => {}}
          onMaterial={() => {}}
          onCsv={() => {}}
          onDxf={() => {}}
          onImage={() => {}}
        />,
      );
    });
    const fonds = t.root.findAllByType(ExportFond);
    expect(fonds.map((f) => f.props.kind)).toEqual(['pdf', 'obj', 'materiel', 'csv', 'dxf', 'image']);
    for (const f of fonds) {
      expect(f.props.hauteur).toBe(HAUTEUR_CARTE);
      expect(f.props.largeur).toBeGreaterThan(150);
      expect(f.props.murs).toBe(murs);
    }
    // Le titre se lit en clair sur l ecran noir du DXF, a l encre ailleurs.
    const titreDxf = t.root.findAllByType(Text).find((n) => n.props.children === 'Plan DXF')!;
    expect(StyleSheet.flatten(titreDxf.props.style).color).toBe('#FFFFFF');
    const titrePdf = t.root.findAllByType(Text).find((n) => n.props.children === 'Plan PDF')!;
    expect(StyleSheet.flatten(titrePdf.props.style).color).toBe(light.ink);
    act(() => t.unmount());
  });

  it('chaque carte se dit au lecteur d ecran : son nom, et ce qu elle donne', () => {
    const t = monter();
    const pdf = tuiles(t).find((x) => x.props.accessibilityLabel === 'Plan PDF')!;
    expect(pdf.props.accessibilityRole).toBe('button');
    expect(pdf.props.accessibilityHint).toMatch(/Cot/);
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

describe('les images de fond', () => {
  it('cadrent le plan dans leur zone, sans deborder', () => {
    const boite = { x: 100, y: 10, w: 120, h: 60 };
    const segs = cadrerLePlan(
      [
        { a: { x: 2, z: 5 }, b: { x: 12, z: 5 } },
        { a: { x: 12, z: 5 }, b: { x: 12, z: 9 } },
      ],
      boite,
    );
    for (const s of segs) {
      for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) {
        expect(x).toBeGreaterThanOrEqual(boite.x - 1e-9);
        expect(x).toBeLessThanOrEqual(boite.x + boite.w + 1e-9);
        expect(y).toBeGreaterThanOrEqual(boite.y - 1e-9);
        expect(y).toBeLessThanOrEqual(boite.y + boite.h + 1e-9);
      }
    }
  });

  it('sans murs, un logement d exemple : le dessin ne reste jamais blanc', () => {
    expect(cadrerLePlan([], { x: 0, y: 0, w: 100, h: 50 })).toHaveLength(PLAN_EXEMPLE.length);
  });

  it('en sombre, des teintes profondes : le titre clair du theme reste lisible', () => {
    const { luminance } = require('../src/geometry/appearance') as typeof import('../src/geometry/appearance');
    for (const k of ['obj', 'materiel', 'csv', 'image'] as const) {
      expect([k, luminance(TEINTE_DU_FOND(k, light)) > 0.8]).toEqual([k, true]);
      expect([k, luminance(TEINTE_DU_FOND(k, dark)) < 0.2]).toEqual([k, true]);
    }
  });
});

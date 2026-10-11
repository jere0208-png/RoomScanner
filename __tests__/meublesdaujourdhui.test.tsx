/**
 * LES MEUBLES D'AUJOURD'HUI, ET LEUR VIGNETTE EN VRAIE 3D.
 *
 * Relevé du patron : « ajoute de nouveaux meubles, miroirs éclairés, etc.,
 * tout ce qu'on peut trouver aujourd'hui dans un appartement. Change
 * l'affichage des icônes des meubles lors du choix par ce que l'on voit
 * réellement dans le plan 3D ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Image } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { CATALOGUE, CATALOG_ITEMS, catalogItem } from '../src/geometry/catalogue';
import { fabriquer, graineDe } from '../src/geometry/modeles3d';
import { frCategory } from '../src/geometry/furniture';
import { encoderPng, rendreLeMeuble, vignetteDuMeuble, vignetteEnCache } from '../src/geometry/vignette3d';
import { FurnitureThumb } from '../src/screens/result/FurnitureSheet';

const modele = (key: string) => {
  const it = catalogItem(key)!;
  return fabriquer(it.category, { W: it.w, D: it.d, H: it.h }, { modele: it.key, attributs: [], hasard: graineDe(it.key) });
};
const matieres = (key: string) => new Set(modele(key).groupes.map((g) => g.mat));

describe('le catalogue d’aujourd’hui', () => {
  const NOUVEAUX = [
    'coiffeuse', 'lampeChevet', 'frigoUs', 'caveVin', 'colonneFour', 'tabouret', 'canapeAngle', 'pouf',
    'lampadaire', 'console', 'miroirLed', 'secheServiettes', 'doucheItalienne', 'ecran', 'lampeBureau',
    'radiateur', 'clim', 'cumulus',
  ];

  it('porte les meubles qu’on trouve dans un logement aujourd’hui', () => {
    for (const k of NOUVEAUX) expect([k, !!catalogItem(k)]).toEqual([k, true]);
    expect(CATALOGUE.map((f) => f.name)).toContain('Confort');
    expect(new Set(CATALOG_ITEMS.map((i) => i.key)).size).toBe(CATALOG_ITEMS.length);
  });

  it('chacun a son modèle 3D, à ses cotes', () => {
    for (const it of CATALOG_ITEMS) {
      const m = fabriquer(it.category, { W: it.w, D: it.d, H: it.h }, { modele: it.key, attributs: [], hasard: graineDe(it.key) });
      expect([it.key, m.triangles > 0]).toEqual([it.key, true]);
    }
  });

  it('ce qui éclaire est de la lumière : le ruban du miroir, l’ampoule des lampes', () => {
    expect(matieres('miroirLed').has('lumiere')).toBe(true);
    expect(matieres('miroirLed').has('miroir')).toBe(true);
    for (const k of ['lampadaire', 'lampeChevet', 'lampeBureau']) expect([k, matieres(k).has('lumiere')]).toEqual([k, true]);
    // Le miroir d'entrée, lui, n'éclaire pas.
    expect(matieres('miroir').has('lumiere')).toBe(false);
  });

  it('chaque modèle a sa silhouette, pas une boîte par défaut', () => {
    // L'américain est d'inox, portes comprises ; le frigo de 60, laqué, n'en a que ses poignées.
    const inox = (k: string) => modele(k).groupes.filter((g) => g.mat === 'inox').reduce((t, g) => t + g.i.length, 0);
    expect(inox('frigoUs')).toBeGreaterThan(inox('frigo') * 2);
    expect(matieres('caveVin').has('verre')).toBe(true);
    expect(matieres('cumulus').has('chrome')).toBe(true);
    expect(matieres('pouf').has('tissu')).toBe(true);
    // Le canapé d'angle prend la forme en L, sans qu'on la lui dise.
    expect(modele('canapeAngle').triangles).toBeGreaterThan(modele('canape3').triangles);
  });

  it('les nouvelles catégories se nomment en français', () => {
    expect(frCategory('lampe')).toBe('Lampe');
    expect(frCategory('chauffeEau')).toBe('Chauffe-eau');
    expect(frCategory('climatiseur')).toBe('Climatiseur');
  });
});

describe('la vignette en vraie 3D', () => {
  it('chaque meuble se rend, sur fond transparent, le meuble au milieu', () => {
    for (const it of CATALOG_ITEMS) {
      const img = rendreLeMeuble({ key: it.key, category: it.category, w: it.w, d: it.d, h: it.h }, 74, 52);
      let pleins = 0;
      for (let i = 3; i < img.pixels.length; i += 4) if (img.pixels[i] > 0) pleins++;
      // Ni vide, ni plein cadre : le meuble, ses marges autour.
      expect([it.key, pleins > 60]).toEqual([it.key, true]);
      expect([it.key, pleins < 74 * 52]).toEqual([it.key, true]);
      expect(img.pixels[3]).toBe(0);
    }
  });

  it('un PNG lisible, une fois calculé il est gardé', () => {
    const img = rendreLeMeuble({ key: 'pouf', category: 'pouf', w: 0.5, d: 0.5, h: 0.42 }, 20, 16);
    const png = encoderPng(img);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(String.fromCharCode(...png.subarray(12, 16))).toBe('IHDR');
    expect(new DataView(png.buffer).getUint32(16)).toBe(20);
    const m = { key: 'lampadaire', category: 'lampe', w: 0.4, d: 0.4, h: 1.65 };
    expect(vignetteEnCache(m, 30, 24)).toBeNull();
    const uri = vignetteDuMeuble(m, 30, 24);
    expect(uri.startsWith('data:image/png;base64,iVBORw0KGgo')).toBe(true);
    expect(vignetteEnCache(m, 30, 24)).toBe(uri);
  });

  it('la tuile du catalogue montre le symbole, puis la vignette dès qu’elle est prête', () => {
    jest.useFakeTimers();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<FurnitureThumb item={catalogItem('canape2')!} />);
    });
    expect(t.root.findAllByType(Image)).toHaveLength(0);
    act(() => {
      jest.runAllTimers();
    });
    const img = t.root.findAllByType(Image)[0];
    expect(img.props.testID).toBe('vignette-canape2');
    expect(String(img.props.source.uri).startsWith('data:image/png;base64,')).toBe(true);
    act(() => t.unmount());
    jest.useRealTimers();
  });
});

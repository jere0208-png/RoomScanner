/**
 * UN CATALOGUE POUR CHACUN — décoration, jardin, et quelques meubles de plus.
 *
 * Relevé du patron : « complète le catalogue par des variétés de
 * décorations, meubles, pour plaire à chacun. Peaufine l'aspect ameublement
 * de l'app. »
 *
 * Chaque nouvel article passe aussi par les bancs communs du catalogue
 * (`meublesreels`, `meublesdaujourdhui`) : son modèle tient dans sa caisse et
 * la remplit, aucune face n'est retournée, sa vignette se lit.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { CATALOGUE, CATALOG_ITEMS, catalogItem } from '../src/geometry/catalogue';
import { frCategory } from '../src/geometry/furniture';
import { fabriquer, graineDe, type ModeleLocal } from '../src/geometry/modeles3d';
import { FurnitureSheet } from '../src/screens/result/FurnitureSheet';

const NOUVEAUX = [
  'tableauMural',
  'cadresPhotos',
  'miroirRond',
  'horloge',
  'grandVase',
  'planteHaute',
  'planteSuspendue',
  'rideaux',
  'piano',
  'aquarium',
  'poeleBois',
  'litSuperpose',
  'portant',
  'bancLit',
  'tableHaute',
  'tableJardin',
  'chaiseJardin',
  'transat',
  'jardiniere',
  'parasol',
  'barbecue',
];

const modele = (key: string): ModeleLocal => {
  const it = catalogItem(key)!;
  return fabriquer(it.category, { W: it.w, D: it.d, H: it.h }, { modele: it.key, attributs: [], hasard: graineDe(it.key) });
};
const matieres = (m: ModeleLocal) => new Set(m.groupes.map((g) => g.mat));

describe('les nouveaux articles', () => {
  it('sont tous au catalogue, sans doublon de clé', () => {
    for (const k of NOUVEAUX) expect([k, !!catalogItem(k)]).toEqual([k, true]);
    const cles = CATALOG_ITEMS.map((i) => i.key);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('deux familles de plus : la décoration, et le balcon et le jardin', () => {
    const noms = CATALOGUE.map((f) => f.name);
    expect(noms).toContain('Décoration');
    expect(noms).toContain('Balcon et jardin');
  });

  it('chacun a SA silhouette, pas la caisse de repli', () => {
    expect(matieres(modele('tableauMural')).has('papier')).toBe(true);
    expect(matieres(modele('miroirRond')).has('miroir')).toBe(true);
    expect(matieres(modele('aquarium')).has('verre')).toBe(true);
    expect(matieres(modele('poeleBois')).has('lumiere')).toBe(true);
    expect(matieres(modele('planteSuspendue')).has('feuillage')).toBe(true);
    expect(matieres(modele('jardiniere')).has('feuillage')).toBe(true);
    expect(matieres(modele('portant')).has('tissu')).toBe(true);
    // Le piano a ses touches blanches et ses noires.
    const piano = modele('piano');
    expect(piano.groupes.some((g) => g.mat === 'ceramique')).toBe(true);
    expect(piano.triangles).toBeGreaterThan(300);
    // Les lits superposés ont deux couchages : deux fois plus de linge qu'un lit.
    expect(modele('litSuperpose').groupes.filter((g) => g.mat === 'linge').reduce((n, g) => n + g.i.length, 0)).toBeGreaterThan(
      fabriquer('bed', { W: 0.98, D: 2, H: 0.9 }, { modele: 'lit90', attributs: [], hasard: graineDe('lit') })
        .groupes.filter((g) => g.mat === 'linge')
        .reduce((n, g) => n + g.i.length, 0),
    );
  });

  it('ce qui s’accroche au mur est posé à sa hauteur', () => {
    for (const k of ['tableauMural', 'cadresPhotos', 'miroirRond', 'horloge', 'planteSuspendue']) {
      expect([k, (catalogItem(k)!.base ?? 0) > 0.8]).toEqual([k, true]);
    }
  });

  it('se nomment en français', () => {
    for (const cat of ['cadre', 'horloge', 'vase', 'rideau', 'piano', 'aquarium', 'poele', 'portant', 'transat', 'parasol', 'barbecue', 'plante', 'tapis', 'miroir', 'portemanteau']) {
      const nom = frCategory(cat);
      expect([cat, nom !== cat && /^[A-ZÉ]/.test(nom)]).toEqual([cat, true]);
    }
  });
});

describe('les meubles hauts et les tableaux — « ajoute des meubles hauts, comme ceux de cuisine, des tableaux »', () => {
  const MURAUX = [
    'meubleHaut40',
    'meubleHaut120',
    'meubleHautVitre',
    'etagereCuisine',
    'armoireToilette',
    'meubleTvSuspendu',
    'etagereFlottante',
    'tableauPortrait',
    'grandeToile',
    'affiche',
    'triptyque',
  ];

  it('tous au catalogue, accrochés à leur hauteur', () => {
    for (const k of MURAUX) {
      const it = catalogItem(k);
      expect([k, !!it, (it?.base ?? 0) >= 0.25]).toEqual([k, true, true]);
    }
  });

  it('chacun sa silhouette', () => {
    expect(matieres(modele('meubleHautVitre')).has('verre')).toBe(true);
    expect(matieres(modele('armoireToilette')).has('miroir')).toBe(true);
    // Le triptyque : trois toiles, donc trois fonds de papier de plus qu'un tableau.
    const papier = (m: ModeleLocal) => m.groupes.filter((g) => g.mat === 'papier').reduce((n, g) => n + g.i.length, 0);
    expect(papier(modele('triptyque'))).toBeGreaterThan(papier(modele('tableauMural')));
    // L'étagère de cuisine porte des bocaux, pas des livres.
    expect(matieres(modele('etagereCuisine')).has('papier')).toBe(false);
    // Un meuble haut se repeint.
    const it = catalogItem('meubleHaut40')!;
    const rouge = fabriquer(it.category, { W: it.w, D: it.d, H: it.h }, { modele: it.key, teinte: '#AA3322', attributs: [], hasard: graineDe('r') });
    expect(rouge.groupes.some((g) => g.couleur === '#AA3322')).toBe(true);
  });
});

describe('la feuille « Ajouter un meuble » se range par familles', () => {
  const monter = () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<FurnitureSheet visible quete="" onQuete={() => {}} onClose={() => {}} onPick={() => {}} />);
    });
    return t;
  };
  const textes = (t: TestRenderer.ReactTestRenderer) => t.root.findAllByType(Text).map((n) => [n.props.children].flat().join(''));
  const famille = (t: TestRenderer.ReactTestRenderer, nom: string) =>
    t.root.findAll((n) => n.props.accessibilityLabel === `Famille ${nom}` && typeof n.props.onPress === 'function', { deep: false })[0];

  it('une puce par famille, et « Tout »', () => {
    const t = monter();
    for (const f of CATALOGUE) expect(famille(t, f.name)).toBeDefined();
    expect(famille(t, 'Tout')).toBeDefined();
    act(() => t.unmount());
  });

  it('une famille touchée ne montre qu’elle ; « Tout » ramène le reste', () => {
    const t = monter();
    act(() => famille(t, 'Décoration').props.onPress());
    let vus = textes(t);
    expect(vus).toContain('Horloge murale');
    expect(vus).not.toContain('Lit double 140');
    expect(famille(t, 'Décoration').props.accessibilityState).toEqual({ selected: true });
    act(() => famille(t, 'Tout').props.onPress());
    vus = textes(t);
    expect(vus).toContain('Lit double 140');
    act(() => t.unmount());
  });
});

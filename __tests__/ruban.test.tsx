/**
 * LE RUBAN DE LUMIÈRE — ce qui le rend fidèle à la référence, et tenable
 * sur un téléphone.
 *
 * L'original est un shader GLSL : PLUSIEURS ondes néon — bleue, verte,
 * rouge, et le trait blanc — qui se croisent et se séparent, chacune
 * vivant sa vie. Le premier portage n'en avait retenu qu'une : une courbe
 * et sa frange collée, qui glissaient d'un seul bloc — relevé du patron :
 * « chaque ligne bouge et sont lumineuses ». Chaque ligne a donc SA
 * courbe (sa phase, son amplitude), SA vitesse, et SA lueur.
 *
 * Ce banc tient les décisions sans lesquelles l'écran d'accueil se
 * mettrait à ramer, ou le ruban à mentir sur la référence.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Animated } from 'react-native';
import { Path } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { LIGNES, LightRibbon, RIBBON_H } from '../src/components/LightRibbon';
import { dark, light } from '../src/theme';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const rendre = (sombre = true, width = 390) => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <LightRibbon width={width} palette={sombre ? dark : light} sombre={sombre} />,
    );
  });
  arbre = tree;
  return tree;
};

const traces = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Path);

describe('le ruban de l’accueil', () => {
  /*
    UNE COURBE PAR LIGNE — c'est ce qui fait la référence.

    Une seule sinusoïde décalée en Y donne des lignes parallèles qui ne se
    croisent jamais ; sur l'original, elles se croisent et se séparent,
    parce que chacune a SA phase et SON amplitude. Chaque courbe reste
    dessinée UNE fois, puis empilée en passes : rien n'est recalculé à
    l'image.
  */
  it('dessine une courbe PAR ligne, chacune la sienne', () => {
    expect(LIGNES.length).toBeGreaterThanOrEqual(4);
    const ds = new Set(traces(rendre()).map((n) => String(n.props.d)));
    expect(ds.size).toBe(LIGNES.length);
    // Et les paramètres qui les distinguent sont bien distincts.
    expect(new Set(LIGNES.map((l) => l.phase)).size).toBe(LIGNES.length);
  });

  /*
    CHAQUE LIGNE EST LUMINEUSE : sa lueur, puis son cœur.

    Un trait seul est un fil ; le néon vient des passes larges et pâles
    posées dessous — la plus large est la plus pâle, comme une lumière qui
    s'éteint en s'éloignant de sa source.
  */
  it('pose une lueur sous chaque ligne', () => {
    const parCourbe = new Map<string, { w: number; o: number }[]>();
    for (const p of traces(rendre())) {
      const cle = String(p.props.d);
      parCourbe.set(cle, [
        ...(parCourbe.get(cle) ?? []),
        { w: Number(p.props.strokeWidth), o: Number(p.props.opacity) },
      ]);
    }
    for (const [, passes] of parCourbe) {
      expect(passes.length).toBeGreaterThanOrEqual(3);
      const larges = [...passes].sort((a, b) => b.w - a.w);
      // La passe la plus large fait plusieurs fois le cœur…
      expect(larges[0].w).toBeGreaterThanOrEqual(
        larges[larges.length - 1].w * 3,
      );
      // …et c'est la plus pâle.
      expect(larges[0].o).toBeLessThan(larges[larges.length - 1].o);
    }
  });

  /*
    CHAQUE LIGNE GLISSE SUR SA VUE, À SA VITESSE.

    Le pilote natif ne sait animer qu'une vue — la leçon du premier jet,
    qui posait la course sur un attribut SVG que personne n'écoutait. Et
    les vitesses sont TOUTES différentes : à vitesse égale, les lignes se
    suivraient en formation, et la référence serait perdue.
  */
  it('translate une VUE par ligne, à des vitesses toutes différentes', () => {
    const animees = rendre()
      .root.findAllByType(Animated.View)
      .map((n) =>
        Array.isArray(n.props.style)
          ? Object.assign({}, ...n.props.style.filter(Boolean))
          : n.props.style,
      )
      .filter(
        (st) =>
          Array.isArray(st?.transform) &&
          st.transform[0]?.translateX !== undefined &&
          typeof st.transform[0].translateX !== 'number',
      );
    expect(animees.length).toBe(LIGNES.length);
    expect(new Set(LIGNES.map((l) => l.duree)).size).toBe(LIGNES.length);
  });

  /*
    LE CŒUR CHANGE AVEC LE THÈME ; les néons gardent leurs couleurs.

    Un trait blanc sur fond blanc n'existe pas : en clair, le cœur prend le
    bleu de la marque. Le rouge, le vert et le bleu, eux, sont la lumière
    décomposée — ils se lisent sur les deux fonds.
  */
  it('adapte son cœur au fond', () => {
    const nuit = rendre(true);
    expect(traces(nuit).map((n) => String(n.props.stroke))).toContain(
      '#FFFFFF',
    );
    act(() => nuit.unmount());
    const jour = rendre(false);
    const ceuxDeJour = traces(jour).map((n) => String(n.props.stroke));
    expect(ceuxDeJour).not.toContain('#FFFFFF');
    expect(ceuxDeJour).toContain(light.blue);
  });

  it('reste dans sa bande, quelle que soit la largeur', () => {
    for (const w of [320, 390, 440]) {
      const tree = rendre(true, w);
      const courbes = new Set(traces(tree).map((n) => String(n.props.d)));
      for (const d of courbes) {
        // Les nombres du chemin vont par PAIRES (x, y), commande après
        // commande : on les extrait sans passer par un découpage, dont le
        // premier morceau vide décalerait toute la parité.
        const nombres = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
        const y = nombres.filter((_, i) => i % 2 === 1);
        for (const v of y) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(RIBBON_H);
        }
      }
      act(() => tree.unmount());
    }
  });
});

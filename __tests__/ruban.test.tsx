/**
 * LE RUBAN DE LUMIÈRE — ce qui le rend tenable sur un téléphone.
 *
 * L'original est un shader GLSL : un trait blanc qui ondule sur fond noir,
 * bordé d'une frange chromatique. Il n'y a pas de WebGL ici, et il n'en faut
 * pas — ce que l'œil retient de cette image, c'est une courbe, sa lueur et sa
 * frange, trois choses qui se dessinent au trait.
 *
 * Ce banc tient les trois décisions sans lesquelles l'écran d'accueil se
 * mettrait à ramer, ou le ruban à se voir boucler.
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
import { LightRibbon, RIBBON_H } from '../src/components/LightRibbon';
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
    LA COURBE EST DESSINÉE UNE FOIS, ET C'EST LE GROUPE QUI GLISSE.

    La recalculer à chaque image — soixante fois par seconde, sur un chemin
    de plusieurs centaines de points — coûterait à l'écran d'accueil ce que
    l'animation du plan a justement gagné en étant cuite au build. Tous les
    tracés partagent donc LE MÊME `d` : la lueur, la frange et le cœur sont
    la même courbe, empilée.
  */
  it('ne dessine qu’une seule courbe, empilée', () => {
    const tree = rendre();
    const ds = new Set(traces(tree).map((n) => String(n.props.d)));
    expect(ds.size).toBe(1);
    // Cinq passes : deux de lueur, deux de frange, un cœur.
    expect(traces(tree).length).toBe(5);
  });

  /*
    LA FRANGE S'ÉCARTE, comme dans le shader d'origine.

    Elle avait été serrée à un point et demi ; le relevé du chantier a
    tranché dans l'autre sens — « écarte les couleurs, reprends le code de
    base » : sur l'original, la dispersion s'étale sur plusieurs pixels et
    c'est elle qui fait le prisme. Trois points et demi de part et d'autre :
    les couleurs se voient, sans se détacher en trois fils.
  */
  it('écarte sa frange comme le shader d’origine', () => {
    const tree = rendre();
    const ecarts = traces(tree)
      .map((n) => n.props.translateY)
      .filter((v) => typeof v === 'number') as number[];
    expect(ecarts.length).toBe(2);
    for (const e of ecarts) {
      expect(Math.abs(e)).toBeGreaterThanOrEqual(3);
      expect(Math.abs(e)).toBeLessThanOrEqual(5);
    }
    // Et de part et d'autre : une frange d'un seul côté serait un défaut
    // d'impression, pas une dispersion.
    expect(Math.sign(ecarts[0])).toBe(-Math.sign(ecarts[1]));
  });

  /*
    LE CŒUR CHANGE AVEC LE THÈME.

    Un trait blanc sur fond blanc n'existe pas : en clair, le cœur prend le
    bleu de la marque.
  */
  it('adapte son cœur au fond', () => {
    const nuit = rendre(true);
    const ceuxDeNuit = traces(nuit).map((n) => String(n.props.stroke));
    expect(ceuxDeNuit).toContain('#FFFFFF');
    act(() => nuit.unmount());
    const jour = rendre(false);
    const ceuxDeJour = traces(jour).map((n) => String(n.props.stroke));
    expect(ceuxDeJour).not.toContain('#FFFFFF');
    expect(ceuxDeJour).toContain(light.blue);
  });

  /*
    C'EST LA VUE QUI GLISSE, PAS L'ATTRIBUT DU DESSIN.

    Premier jet : la course était posée sur le `x` d'un groupe SVG. Le ruban
    n'a pas bougé d'un pixel — et c'est logique, le pilote natif ne connaît
    que les propriétés d'une VUE ; il ignore les attributs d'un dessin
    vectoriel. L'animation partait, personne ne l'écoutait, et l'accueil
    montrait un trait courbé immobile.

    Ce banc tient la seule chose qui garantit le mouvement : une
    transformation, sur une vue, avec une valeur animée dedans.
  */
  it('translate une VUE, seule chose que le natif sait animer', () => {
    const tree = rendre();
    const anime = tree.root
      .findAllByType(Animated.View)
      .map((n) =>
        Array.isArray(n.props.style)
          ? Object.assign({}, ...n.props.style.filter(Boolean))
          : n.props.style,
      )
      .find((st) => Array.isArray(st?.transform));
    expect(anime).toBeDefined();
    const t = anime.transform[0];
    expect(t.translateX).toBeDefined();
    // Une valeur animée, pas un nombre figé.
    expect(typeof t.translateX).not.toBe('number');
  });

  it('reste dans sa bande, quelle que soit la largeur', () => {
    for (const w of [320, 390, 440]) {
      const tree = rendre(true, w);
      // Les nombres du chemin vont par PAIRES (x, y), commande après
      // commande : on les extrait sans passer par un découpage, dont le
      // premier morceau vide décalerait toute la parité.
      const nombres = (String(traces(tree)[0].props.d).match(/-?\d+(?:\.\d+)?/g) ?? [])
        .map(Number);
      const y = nombres.filter((_, i) => i % 2 === 1);
      for (const v of y) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(RIBBON_H);
      }
      act(() => tree.unmount());
    }
  });
});

/**
 * LA RANGÉE S'ANIME COMME LA COLONNE.
 *
 * Sous le bouton d'édition, les pastilles sortent l'une après l'autre et s'y
 * engouffrent en repartant. À sa gauche, sur la même ligne, « Enregistrer »,
 * « Annuler » et « Contrôle » apparaissaient d'un coup, sans prévenir : on
 * cherchait ce qui venait de changer, et il arrivait qu'on appuie sur un
 * bouton qui n'était déjà plus là.
 *
 * Deux choses comptent, et se vérifient : la pastille ENTRE en glissant (et
 * ne se contente pas d'apparaître), et elle RESTE MONTÉE le temps de sortir
 * — sans quoi il n'y aurait rien à animer au départ.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Animated, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { SidePill } from '../src/components/SidePill';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

/** La valeur courante d'une valeur animée, sans passer par le natif. */
const valeur = (v: Animated.Value): number => {
  let out = 0;
  const id = v.addListener((e) => {
    out = e.value;
  });
  // @ts-expect-error — lecture directe : c'est la seule façon d'observer.
  out = v.__getValue();
  v.removeListener(id);
  return out;
};

const monte = (visible: boolean) => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <SidePill visible={visible} index={1}>
        <Text>Annuler</Text>
      </SidePill>,
    );
  });
  return tree;
};

const textes = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .join(' ');

describe('le créneau de la rangée', () => {
  it('ne monte rien tant que la pastille n’a pas lieu d’être', () => {
    expect(textes(monte(false))).toBe('');
  });

  it('entre en glissant depuis le bouton d’édition', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <SidePill visible={false} index={1}>
          <Text>Annuler</Text>
        </SidePill>,
      );
    });
    act(() => {
      tree.update(
        <SidePill visible index={1}>
          <Text>Annuler</Text>
        </SidePill>,
      );
    });
    // Présente dès la première image, mais décalée vers la droite : elle
    // sort de derrière le bouton, elle n'apparaît pas sur place.
    expect(textes(tree)).toBe('Annuler');
    const vue = tree.root.findByType(Animated.View);
    const t = vue.props.style.transform[0].translateX;
    expect(valeur(t)).toBeGreaterThan(60);

    /**
     * On ne vérifie pas la fin de la course, et il faut le dire : le
     * mouvement est confié au pilote NATIF, dont ce banc d'essai n'a
     * qu'un doublet — la valeur côté JavaScript ne bouge donc pas d'ici.
     * Ce qui se vérifie, et qui suffit à attraper la régression, c'est
     * qu'elle PARTE décalée : une pastille qui apparaît sur place aurait
     * un décalage nul dès la première image.
     */
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(textes(tree)).toBe('Annuler');
  });

  /**
   * ET ELLE RESTE LE TEMPS DE PARTIR.
   *
   * C'est tout le piège d'une animation de sortie en React : l'élément
   * qu'on retire du rendu n'est plus là pour être animé. Il faut retarder
   * son démontage jusqu'à la fin du mouvement.
   */
  it('et reste montée le temps de repartir', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <SidePill visible index={1}>
          <Text>Annuler</Text>
        </SidePill>,
      );
    });
    act(() => {
      tree.update(
        <SidePill visible={false} index={1}>
          <Text>Annuler</Text>
        </SidePill>,
      );
    });
    // Juste après la disparition demandée : encore là, en train de partir.
    expect(textes(tree)).toBe('Annuler');
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(textes(tree)).toBe('');
  });
});

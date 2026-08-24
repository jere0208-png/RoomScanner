/**
 * L'ALERTE DE SORTIE — centrée, et elle ne décide de rien.
 *
 * Relevé du patron : « si on quitte un plan sans enregistrer, le pop-up doit
 * être centré et doit afficher une belle page avec l'icône en gros […] les
 * boutons en dessous, blanc, contour et texte bleu, pour enregistrer et rouge
 * pour le quitter quand même. »
 *
 * Ce qui se compte ici, c'est ce qu'un banc peut tenir : la POSITION (au
 * milieu, pas en bas), l'ORDRE et la PEAU des deux issues, et le fait que la
 * fenêtre rende exactement ce que la garde lui donne — sans rien ajouter ni
 * intervertir. Le dessin du gyrophare, lui, se regarde à l'œil ; ce qui se
 * vérifie de lui, c'est qu'il TOURNE : une valeur figée passerait tous les
 * autres bancs sans que rien ne bouge à l'écran.
 *
 * Et l'appui à côté ne décide de rien : c'est l'issue de secours de qui a
 * touché par erreur. Une fenêtre qui, refermée, jetterait le travail serait
 * pire que pas de fenêtre du tout.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { AlerteSortie } from '../src/components/AlerteSortie';
import { light } from '../src/theme';
import type { ActionData } from '../src/components/Sheet';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const fait: string[] = [];
const DONNEE: ActionData = {
  title: 'Modifications non enregistrées',
  subtitle: 'Ce que vous venez de faire sur ce plan sera perdu si vous partez.',
  actions: [
    { label: 'Enregistrer', onPress: () => fait.push('enregistre') },
    {
      label: 'Quitter sans enregistrer',
      danger: true,
      onPress: () => fait.push('part'),
    },
  ],
};

const monter = () => {
  let t!: TestRenderer.ReactTestRenderer;
  fait.length = 0;
  act(() => {
    t = TestRenderer.create(
      <AlerteSortie data={DONNEE} onClose={() => fait.push('ferme')} />,
    );
  });
  act(() => jest.advanceTimersByTime(120));
  arbre = t;
  return t;
};

/*
  ON CHERCHE PAR PRÉDICAT, PAS PAR TYPE.

  `Pressable` est enveloppé (mémo, renvoi de référence) : `findAllByType` ne
  le reconnaît pas dans l'arbre d'essai. Tout le reste des bancs de l'app
  cherche donc ce qui PORTE un geste et un nom — c'est d'ailleurs ce qui
  compte, pas la classe du composant.
*/
const pressables = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll(
    (n) => typeof n.props?.onPress === 'function' && !!n.props?.style,
  );

const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  pressables(t).find((n) => n.props.accessibilityLabel === label);

const plat = (st: unknown) =>
  (StyleSheet.flatten(st as never) ?? {}) as Record<string, unknown>;

describe('l’alerte de sortie', () => {
  it('se pose au MILIEU, pas en bas', () => {
    const t = monter();
    const voile = pressables(t)
      .map((n) => plat(n.props.style))
      .find((st) => st.flex === 1);
    expect(voile).toBeDefined();
    expect(voile!.justifyContent).toBe('center');
    expect(voile!.alignItems).toBe('center');
  });

  it('dit ce qui se joue, en gros', () => {
    const t = monter();
    const mots = t.root
      .findAllByType(Text)
      .map((n) => String(n.props.children));
    expect(mots).toContain('Modifications non enregistrées');
    const titre = t.root
      .findAllByType(Text)
      .find((n) => n.props.children === 'Modifications non enregistrées')!;
    expect(Number(plat(titre.props.style).fontSize)).toBeGreaterThanOrEqual(22);
  });

  it('garde en blanc cerné de bleu, jette en rouge', () => {
    const t = monter();
    const garder = plat(bouton(t, 'Enregistrer')!.props.style);
    expect(garder.backgroundColor).toBe(light.surface);
    expect(garder.borderColor).toBe(light.blue);
    const jeter = plat(bouton(t, 'Quitter sans enregistrer')!.props.style);
    expect(jeter.backgroundColor).toBe(light.danger);
    // Et les deux ont la taille d'un doigt, largement.
    for (const st of [garder, jeter]) {
      expect(Number(st.minHeight)).toBeGreaterThanOrEqual(44);
    }
  });

  it('rend à la garde ce qu’elle lui a donné, dans l’ordre', () => {
    const t = monter();
    act(() => bouton(t, 'Enregistrer')!.props.onPress());
    expect(fait).toEqual(['ferme', 'enregistre']);
    fait.length = 0;
    act(() => bouton(t, 'Quitter sans enregistrer')!.props.onPress());
    expect(fait).toEqual(['ferme', 'part']);
  });

  it('et l’appui à côté ne décide de rien', () => {
    const t = monter();
    const voile = pressables(t).find((n) => plat(n.props.style).flex === 1)!;
    act(() => voile.props.onPress());
    // Il referme, et rien d'autre : on reste sur le plan.
    expect(fait).toEqual(['ferme']);
  });

  /*
    LE GYROPHARE TOURNE, IL NE FAIT PAS SEMBLANT.

    Deux couches animées : le halo qui bat (échelle et opacité) et les
    faisceaux qui tournent. On ne peut pas compter leur MOUVEMENT ici — ces
    animations partent sur le fil natif, et l'arbre d'essai n'en a pas : la
    valeur rendue ne bougerait pas d'une image à l'autre même sur un vrai
    téléphone. Ce qui se compte, c'est leur NATURE : une valeur animée, pas
    un nombre écrit en dur. Un nombre voudrait dire que rien ne bougera
    jamais, et tous les autres bancs passeraient quand même.
  */
  it('anime son halo et son balayage, au lieu de les figer', () => {
    const t = monter();
    const couches = t.root
      .findAll((n) => {
        const st = plat(n.props?.style);
        return st.position === 'absolute' && Array.isArray(st.transform);
      })
      .map((n) => plat(n.props.style));
    expect(couches.length).toBeGreaterThanOrEqual(2);
    /*
      ON LIT LE STYLE BRUT, PAS LE STYLE APLATI.

      `StyleSheet.flatten` résout une valeur animée en son nombre du moment :
      aplati, un halo qui bat ressemble à un halo figé. Le tableau d'origine,
      lui, porte encore l'objet animé — c'est là qu'on voit la différence
      entre « ça bougera » et « ça ne bougera jamais ».
    */
    const animes = t.root
      .findAll((n) => {
        const st = plat(n.props?.style);
        return st.position === 'absolute' && Array.isArray(st.transform);
      })
      .map((n) => (Array.isArray(n.props.style) ? n.props.style : [n.props.style]))
      .map((tab) => tab.find((x: unknown) => !!x && 'opacity' in (x as object)))
      /*
        Chaque vue animée paraît DEUX FOIS dans l'arbre — le composant, puis
        la vue d'accueil sur laquelle il a déjà résolu ses valeurs. On ne
        garde que celles qui portent encore l'objet animé : ce sont les
        vraies, et il en faut au moins deux (le halo, le balayage).
      */
      .filter((st) => !!st && typeof st.opacity === 'object');
    expect(animes.length).toBeGreaterThanOrEqual(2);
    for (const st of animes) {
      const tr = st.transform as Record<string, unknown>[];
      for (const v of tr.flatMap((x) => Object.values(x))) {
        expect(typeof v).toBe('object');
      }
    }
  });
});

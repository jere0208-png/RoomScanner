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
import { Path } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { AlerteSortie } from '../src/components/AlerteSortie';
import { SOLAIRES } from '../src/ui/solaires';
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
    LE BLOC ET LA POUBELLE — deux dessins, et le second est celui-ci.

      PREMIER — UN GYROPHARE : une sirène en dégradé, un halo qui bat, deux
      faisceaux qui tournent. C'était le relevé du patron, et c'était BEAUCOUP :
      cent soixante-seize points de scène, trois couches animées et deux
      horloges pour dire « attention ».

      SECOND — relevé du patron, référence à l'appui (une fenêtre de
      suppression de compte, en clair et en sombre) : « je voulais un
      avertissement de ce type, dans le design du bloc, de la poubelle etc. »
      Un badge d'anneaux concentriques, l'icône de ce qu'on va perdre au
      milieu.

    CE BANC A SUIVI. Il comptait deux couches animées PORTANT UN TRANSFORM —
    le halo qui enfle, les faisceaux qui tournent. Plus rien ne tourne : les
    anneaux ne font que respirer, en opacité. La règle qu'il tenait, elle, n'a
    pas bougé : ce qui doit bouger porte une valeur ANIMÉE et non un nombre
    écrit en dur. On ne peut pas compter le mouvement ici — ces animations
    partent sur le fil natif, et l'arbre d'essai n'en a pas.
  */

  /** Les anneaux du badge : des carrés parfaitement ronds, superposés. */
  const anneaux = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAll((n) => {
      const st = plat(n.props?.style);
      return (
        st.position === 'absolute' &&
        typeof st.width === 'number' &&
        st.width === (st.borderRadius as number) * 2
      );
    });

  it('porte la POUBELLE de ce qu’on va perdre', () => {
    const t = monter();
    expect(t.root.findAllByType(Path).map((n) => String(n.props.d))).toContain(
      SOLAIRES.supprimer,
    );
  });

  it('et un badge d’anneaux concentriques, de plus en plus serrés', () => {
    /*
      LES ANNEAUX FONT UNE CIBLE : l'œil tombe au centre avant d'avoir lu une
      ligne. Trois anneaux de même taille feraient un disque — c'est
      l'emboîtement qui donne la lueur, et c'est lui qu'on mesure.
    */
    const tailles = anneaux(monter())
      .map((n) => plat(n.props.style).width as number)
      .filter((w, i, tous) => tous.indexOf(w) === i)
      .sort((a, b) => b - a);
    expect(tailles.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < tailles.length; i++) {
      expect(tailles[i]).toBeLessThan(tailles[i - 1]);
    }
  });

  it('ceux du dehors respirent, celui du centre non', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE de l'animation, et il a un sens de métier :
      le disque du centre porte l'icône. Le faire varier ferait CLIGNOTER la
      poubelle — et une icône qui clignote se lit comme une erreur, pas comme
      un avertissement.

      On lit le style BRUT, pas le style aplati : `StyleSheet.flatten` résout
      une valeur animée en son nombre du moment, et un anneau qui respire y
      ressemblerait à un anneau figé.
    */
    const opacites = anneaux(monter())
      .map((n) => (Array.isArray(n.props.style) ? n.props.style : [n.props.style]))
      .map((tab) => tab.find((x: unknown) => !!x && 'opacity' in (x as object)))
      .filter(Boolean)
      .map((x) => (x as { opacity: unknown }).opacity);
    expect(opacites.filter((o) => typeof o === 'object').length).toBeGreaterThanOrEqual(
      2,
    );
    expect(opacites.filter((o) => typeof o === 'number').length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('et plus rien ne tourne', () => {
    // Le gyrophare est parti : une rotation qui traînerait serait un reste de
    // l'ancien dessin, et se verrait à l'écran.
    const rotations = monter()
      .root.findAll((n) => Array.isArray(plat(n.props?.style).transform))
      .flatMap(
        (n) => (plat(n.props.style).transform ?? []) as Record<string, unknown>[],
      )
      .filter((x) => 'rotate' in x);
    expect(rotations).toHaveLength(0);
  });
});

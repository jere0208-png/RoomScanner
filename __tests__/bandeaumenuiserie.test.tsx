/**
 * LE BANDEAU D'UNE MENUISERIE PROPOSE SES GESTES, IL NE LES CACHE PAS.
 *
 * Releve du patron : « au clic sur une porte, le "…" de la menuiserie est
 * mal place, peu comprehensible sans lire le texte, etc. Peut-etre proposer
 * directement les choix sous forme de boutons. »
 *
 * Le bandeau montrait trois cotes — largeur, hauteur, allege — puis une
 * pastille de trois points. Derriere elle : la nature de l'ouverture, sa
 * position sur le mur, le bord de pivot, le sens d'ouverture, le coffre de
 * volet, et la suppression. Six gestes, dont deux qu'on fait a chaque porte,
 * range derriere un symbole qui ne dit rien — et une pastille muette au bout
 * d'une rangee de mots se lit comme un bouton de trop, pas comme une porte
 * vers autre chose.
 *
 * TOUT SORT DU MENU. Chaque geste a sa pastille, avec sa silhouette et son
 * mot dessous : c'est la forme que le bandeau d'une ligne de spots avait
 * deja, et que la continuite des icones vient d'etendre a toute
 * l'application. Le « … » disparait.
 *
 * ET CHAQUE MENUISERIE N'A QUE LES SIENS. Une porte part du sol : pas
 * d'allege. Ni une fenetre ni une baie libre ne dessinent de vantail : ni
 * charniere, ni sens d'ouverture. Un bouton qui ne peut rien faire se lit
 * comme un geste rate — c'est deja la regle de la maison, elle vaut ici.
 *
 * MAIS RIEN NE DISPARAIT AU PASSAGE. Une baie libre garde son allege : un
 * passe-plat, une baie de comptoir se cotent depuis le plancher, et une
 * refonte de bandeau n'est pas l'occasion de retirer un reglage qui
 * marchait.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ResultScreen } from '../src/screens/ResultScreen';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const MENUISERIE = (type: 'door' | 'window' | 'opening'): WallSeg => ({
  id: 'o1',
  type,
  roomId: 'r1',
  a: { x: 1.6, z: 0 },
  b: { x: 2.43, z: 0 },
  height: type === 'window' ? 1.15 : 2.04,
  yCenter: type === 'window' ? 1.525 : 1.02,
});

const poser = (o: WallSeg) =>
  useScanStore.setState({
    walls: [
      mur('n', 0, 0, 5, 0),
      mur('e', 5, 0, 5, 4),
      mur('s', 5, 4, 0, 4),
      mur('o', 0, 4, 0, 0),
    ],
    openings: [o],
    objects: [],
    fixtures: [],
    ceiling: [],
    photos: [],
    rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
    screen: 'result',
  });

const toucher = (t: TestRenderer.ReactTestRenderer, nom: string) => {
  const b = t.root
    .findAll(
      (n) =>
        n.props?.accessibilityLabel === nom &&
        typeof n.props?.onPress === 'function',
    )
    .pop();
  expect(b).toBeTruthy();
  act(() => b!.props.onPress());
};

/** L'ecran, une menuiserie choisie, en mode edition. */
const choisir = (type: 'door' | 'window' | 'opening') => {
  poser(MENUISERIE(type));
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<ResultScreen />);
  });
  arbre = t;
  toucher(t, 'Édition');
  const plan = t.root.findByType(FloorplanEditor);
  act(() => plan.props.onSelectOpening?.('o1'));
  return t;
};

/** Les etiquettes parlees de tout ce qui se touche a l'ecran. */
const boutons = (t: TestRenderer.ReactTestRenderer) => [
  ...new Set(
    t.root
      .findAll(
        (n) =>
          typeof n.props?.accessibilityLabel === 'string' &&
          typeof n.props?.onPress === 'function',
      )
      .map((n) => n.props.accessibilityLabel as string),
  ),
];

/** Les mots ecrits a l'ecran, en un seul texte. */
const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => String(n.props.children))
    .join(' | ');

describe('les gestes d’une porte', () => {
  it('sont tous a l’ecran, aucun derriere trois points', () => {
    const vus = boutons(choisir('door'));
    for (const geste of [
      'Largeur',
      'Hauteur',
      'Position sur le mur',
      'Nature',
      'Charnière',
      'Sens d’ouverture',
      'Retirer',
    ]) {
      expect([geste, vus.includes(geste)]).toEqual([geste, true]);
    }
    expect(vus).not.toContain('Réglages de la menuiserie');
  });

  it('portent chacun son mot, lisible sans le toucher', () => {
    // Une silhouette seule ne se comprend qu'en l'essayant : le mot vit
    // sous la pastille, comme sous une ligne de spots.
    const ecrits = mots(choisir('door'));
    expect(ecrits).toMatch(/Charnière/);
    expect(ecrits).toMatch(/Position/);
  });

  it('n’offrent pas d’allege : une porte part du sol', () => {
    expect(boutons(choisir('door'))).not.toContain('Bas de fenêtre (allège)');
  });
});

describe('les gestes d’une fenetre', () => {
  it('remplacent le battant par l’allege et le coffre', () => {
    const vus = boutons(choisir('window'));
    expect(vus).toContain('Bas de fenêtre (allège)');
    expect(vus.some((b) => /[Cc]offre/.test(b))).toBe(true);
    // Une fenetre ne dessine pas de vantail : un reglage invisible est un
    // reglage qu'on croit rate.
    expect(vus).not.toContain('Charnière');
    expect(vus).not.toContain('Sens d’ouverture');
  });
});

describe('les gestes d’une baie libre', () => {
  it('gardent tout, sauf le battant qu’elle n’a pas', () => {
    const vus = boutons(choisir('opening'));
    expect(vus).toContain('Largeur');
    expect(vus).toContain('Position sur le mur');
    expect(vus).toContain('Nature');
    /*
      ELLE GARDE SON ALLEGE. Une baie libre n'est pas forcement au sol : un
      passe-plat, une baie de comptoir, une trémie de cuisine ouverte se
      cotent depuis le plancher. Le reglage existait pour tout ce qui n'est
      pas une porte, et rien ne justifiait de le lui retirer au passage —
      une refonte de bandeau ne doit rien faire disparaitre en chemin.
    */
    expect(vus).toContain('Bas de fenêtre (allège)');
    // Mais pas de vantail : ni bord de pivot, ni sens d'ouverture.
    expect(vus).not.toContain('Charnière');
    expect(vus).not.toContain('Sens d’ouverture');
  });
});

describe('la nature se change avec les memes vignettes qu’a la pose', () => {
  it('« Nature » ouvre la feuille imagee', () => {
    const t = choisir('door');
    toucher(t, 'Nature');
    act(() => {
      jest.advanceTimersByTime(400);
    });
    // Les trois vignettes de la feuille de pose, avec leurs cotes.
    const vus = boutons(t);
    expect(vus.some((b) => b.startsWith('Porte'))).toBe(true);
    expect(vus.some((b) => b.startsWith('Fenêtre'))).toBe(true);
    expect(vus.some((b) => b.startsWith('Baie libre'))).toBe(true);
  });

  it('et la change vraiment', () => {
    const t = choisir('door');
    toucher(t, 'Nature');
    act(() => {
      jest.advanceTimersByTime(400);
    });
    const fenetre = boutons(t).find((b) => b.startsWith('Fenêtre'))!;
    toucher(t, fenetre);
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(useScanStore.getState().openings[0].type).toBe('window');
  });
});

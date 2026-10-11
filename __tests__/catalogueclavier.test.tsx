/**
 * LE CLAVIER NE CACHE PLUS LES MEUBLES QU'ON CHERCHE.
 *
 * Relevé du patron, capture à l'appui : « la zone de texte gêne l'affichage
 * du listing meubles ». Le catalogue était une fenêtre CENTRÉE sur l'écran
 * entier : on tapait « frig », le clavier montait, et il recouvrait toute la
 * moitié basse — c'est-à-dire la liste, seule chose qu'on voulait voir. Il
 * n'en restait que le haut de trois vignettes.
 *
 * Clavier ouvert, la fenêtre se cale en haut de l'écran et s'arrête au
 * clavier ; la liste prend toute la place qui reste et défile dedans. La
 * consigne « touchez pour poser… » et le lien du meuble sur mesure
 * s'effacent le temps de la frappe : c'est de la place pour les résultats.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Dimensions, Keyboard, ScrollView, StyleSheet, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { FurnitureSheet } from '../src/screens/result/FurnitureSheet';

type Ecouteur = (e: { endCoordinates: { screenY: number; height: number } }) => void;

function capter() {
  const ecouteurs = new Map<string, Ecouteur>();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((nom: string, fn: unknown) => {
    ecouteurs.set(nom, fn as Ecouteur);
    return { remove: () => ecouteurs.delete(nom) } as never;
  });
  return ecouteurs;
}

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  jest.restoreAllMocks();
});

const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Text).map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '')));
type StylePlat = { justifyContent?: string; paddingBottom?: number; maxHeight?: number; flexShrink?: number };
const plat = (s: unknown): StylePlat => (StyleSheet.flatten(s as never) as StylePlat | undefined) ?? {};

function catalogue() {
  const ecouteurs = capter();
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<FurnitureSheet visible quete="frig" onQuete={() => {}} onClose={() => {}} onPick={() => {}} />);
  });
  arbre = t;
  const monter = (couvert: number) => {
    const bouge = ecouteurs.get('keyboardWillChangeFrame') ?? ecouteurs.get('keyboardDidShow');
    const ecran = Dimensions.get('window').height;
    act(() => bouge!({ endCoordinates: { screenY: ecran - couvert, height: couvert } }));
  };
  const descendre = () => {
    const part = ecouteurs.get('keyboardWillHide') ?? ecouteurs.get('keyboardDidHide');
    act(() => part!({ endCoordinates: { screenY: 9999, height: 0 } }));
  };
  return { t, monter, descendre };
}

/** La liste des meubles : le défilement vertical de la fenêtre. */
const liste = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(ScrollView).find((s) => !s.props.horizontal)!;

describe('le catalogue et le clavier', () => {
  it('clavier fermé : la fenêtre comme avant, consigne et lien compris', () => {
    const { t } = catalogue();
    const vu = textes(t).join(' | ');
    expect(vu).toMatch(/Touchez pour poser au centre/);
    expect(vu).toMatch(/Meuble sur mesure/);
  });

  it('clavier ouvert : la fenêtre se cale en haut et s’arrête au clavier', () => {
    const { t, monter } = catalogue();
    monter(340);
    const ecran = Dimensions.get('window').height;
    // Le fond pousse la fenêtre au-dessus du clavier, depuis le haut de l'écran.
    const fond = t.root.findAll((n) => {
      const s = plat(n.props?.style);
      return s.justifyContent === 'flex-start' && typeof s.paddingBottom === 'number' && s.paddingBottom >= 340;
    });
    expect(fond.length).toBeGreaterThan(0);
    // La fenêtre ne dépasse pas la place qui reste au-dessus du clavier.
    const fenetre = t.root.findAll((n) => {
      const h = plat(n.props?.style).maxHeight;
      return typeof h === 'number' && h < ecran - 340;
    });
    expect(fenetre.length).toBeGreaterThan(0);
    // La liste prend la place qui reste, et défile dedans.
    expect(plat(liste(t).props.style).flexShrink).toBe(1);
  });

  it('le temps de la frappe, la consigne et le lien s’effacent ; les résultats restent', () => {
    const { t, monter, descendre } = catalogue();
    monter(340);
    const vu = textes(t).join(' | ');
    expect(vu).not.toMatch(/Touchez pour poser au centre/);
    expect(vu).not.toMatch(/Meuble sur mesure/);
    expect(vu).toMatch(/Réfrigérateur|Frigo/i);
    descendre();
    expect(textes(t).join(' | ')).toMatch(/Touchez pour poser au centre/);
  });
});

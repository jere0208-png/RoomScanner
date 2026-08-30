/**
 * LES PROPOSITIONS ARRIVENT VRAIMENT JUSQU'A L'ECRAN.
 *
 * `pastillescote` epreuve la feuille de saisie, `cotescourantes` epreuve les
 * listes. Restait le fil entre les deux : rien ne garantissait que l'ecran
 * passe bien ses propositions a la feuille — un `choix` oublie sur l'un des
 * cinq reglages, et l'electricien retrouve son clavier sans que rien ne
 * casse nulle part.
 *
 * Ce banc part donc de l'ECRAN, touche le bouton du bandeau, et regarde ce
 * qui s'ouvre.
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

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const PORTE: WallSeg = {
  id: 'o1',
  type: 'door',
  roomId: 'r1',
  a: { x: 1.6, z: 0 },
  b: { x: 2.43, z: 0 },
  height: 2.04,
  yCenter: 1.02,
};

const poser = (opening: WallSeg) =>
  useScanStore.setState({
    walls: [
      mur('n', 0, 0, 5, 0),
      mur('e', 5, 0, 5, 4),
      mur('s', 5, 4, 0, 4),
      mur('o', 0, 4, 0, 0),
    ],
    openings: [opening],
    objects: [],
    fixtures: [],
    ceiling: [],
    photos: [],
    rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
    screen: 'result',
  });

const monter = () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<ResultScreen />);
  });
  return t;
};

/** Touche un bouton du bandeau par son etiquette. */
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

/**
 * Choisit la menuiserie comme un doigt le ferait sur le plan.
 *
 * EN MODE EDITION, parce que c'est la que le bandeau d'une menuiserie
 * existe : hors edition, le plan se lit, il ne se retouche pas.
 */
const choisir = (t: TestRenderer.ReactTestRenderer, id: string) => {
  toucher(t, 'Édition');
  const plan = t.root.findByType(FloorplanEditor);
  act(() => plan.props.onSelectOpening?.(id));
};

/** Les cotes proposees par la feuille ouverte, dans l'ordre. */
const proposees = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAll(
      (n) =>
        typeof n.props?.accessibilityLabel === 'string' &&
        n.props.accessibilityRole === 'button' &&
        /^Cote /.test(n.props.accessibilityLabel),
    )
    .map((n) => n.props.accessibilityLabel as string)
    .filter((l, i, tous) => tous.indexOf(l) === i);

describe('les cotes courantes, depuis l’ecran', () => {
  it('proposent les quatre passages quand on retaille une PORTE', () => {
    poser(PORTE);
    const t = monter();
    choisir(t, 'o1');
    toucher(t, 'Largeur');
    expect(proposees(t)).toEqual(['Cote 63', 'Cote 73', 'Cote 83', 'Cote 93']);
    act(() => t.unmount());
  });

  /*
    LE CONTROLE EN SENS INVERSE : une seule liste pour toutes les
    menuiseries passerait ce banc si l'on ne verifiait qu'une nature. Une
    fenetre se compte par vantail, pas en passages.
  */
  it('mais pas les memes pour une FENETRE', () => {
    poser({ ...PORTE, type: 'window', height: 1.15, yCenter: 1.525 });
    const t = monter();
    choisir(t, 'o1');
    toucher(t, 'Largeur');
    const vues = proposees(t);
    expect(vues).not.toContain('Cote 63');
    expect(vues).toContain('Cote 120');
    act(() => t.unmount());
  });

  it('proposent les alleges courantes sous une fenetre', () => {
    poser({ ...PORTE, type: 'window', height: 1.15, yCenter: 1.525 });
    const t = monter();
    choisir(t, 'o1');
    toucher(t, 'Bas de fenêtre (allège)');
    expect(proposees(t)).toEqual(['Cote 0', 'Cote 45', 'Cote 95', 'Cote 110']);
    act(() => t.unmount());
  });

  it('proposent les hauteurs sous plafond, et de les poser partout', () => {
    poser(PORTE);
    // Deux pieces a des hauteurs differentes : la question a un sens.
    useScanStore.setState({
      walls: useScanStore
        .getState()
        .walls.map((w, i) =>
          i === 0 ? { ...w, height: 2.2, yCenter: 1.1 } : w,
        ),
    });
    const t = monter();
    toucher(t, 'Édition');
    const plan = t.root.findByType(FloorplanEditor);
    act(() => plan.props.onSelectRoom?.('r1'));
    toucher(t, 'Hauteur sous plafond');
    expect(proposees(t)).toEqual([
      'Cote 2,30',
      'Cote 2,50',
      'Cote 2,60',
      'Cote 2,70',
    ]);
    // Un appui pose la cote, et l'application demande alors si le reste du
    // logement suit — la seule question qui evite huit fois le meme geste.
    const p = t.root
      .findAll(
        (n) =>
          n.props?.accessibilityLabel === 'Cote 2,50' &&
          typeof n.props?.onPress === 'function',
      )
      .pop()!;
    act(() => p.props.onPress());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    const mots = t.root
      .findAllByType(Text)
      .map((n) => String(n.props.children))
      .join(' | ');
    expect(mots).toContain('Tout le logement à 2,50 m');
    act(() => t.unmount());
  });

  it('et une porte n’a pas d’allege a proposer', () => {
    // Une porte part du sol par definition : le reglage n'existe pas pour
    // elle, et proposer des cotes serait offrir un geste sans effet.
    poser(PORTE);
    const t = monter();
    choisir(t, 'o1');
    const boutons = t.root
      .findAll((n) => typeof n.props?.accessibilityLabel === 'string')
      .map((n) => n.props.accessibilityLabel as string);
    expect(boutons).not.toContain('Bas de fenêtre (allège)');
    act(() => t.unmount());
  });
});

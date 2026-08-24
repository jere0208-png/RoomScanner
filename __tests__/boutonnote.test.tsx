/**
 * LE BOUTON « NOTE » DIT CE QU'IL ATTEND.
 *
 * Relevé du patron : « le bouton Note ne fait rien, n'affiche rien ? »
 *
 * Il faisait quelque chose : il ARMAIT la pose. Le geste complet est en deux
 * temps — on touche « Note », puis on touche le point du plan à annoter,
 * parce qu'une note tient à un POINT (« gaine à reprendre » ne veut rien
 * dire trois mètres plus loin).
 *
 * Mais rien ne le disait. Tous les autres gestes en deux temps — poser une
 * prise, un point lumineux, une ligne de spots, relier une commande —
 * affichent le bandeau d'attente : le symbole qui bat, son nom, et « touchez
 * un mur ». La note, elle, armait en silence : le bouton s'allumait dans une
 * rangée d'outils qu'on ne regarde plus, et il ne se passait rien.
 *
 * Un geste qu'on arme sans le dire est un geste qui ne marche pas.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ResultScreen } from '../src/screens/ResultScreen';
import { useScanStore } from '../src/store/scanStore';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function monter() {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      screen: 'result',
      scanName: 'Chantier',
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({
        id: r.id,
        name: `Pièce ${i + 1}`,
        floor: null,
      })),
      fixtures: SNAPSHOT_FIXTURES,
      ceiling: [],
      photos: [],
      notes: [],
      showFurniture: true,
    });
    t = TestRenderer.create(<ResultScreen />);
  });
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
      }
    }
  });
  arbre = t;
  return t;
}

const presser = (t: TestRenderer.ReactTestRenderer, label: string) => {
  const b = t.root
    .findAllByType(TouchableOpacity)
    .find((n) => n.props.accessibilityLabel === label);
  expect(b).toBeDefined();
  act(() => b!.props.onPress());
  act(() => jest.advanceTimersByTime(400));
};

const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string')
        .join(''),
    )
    .join(' | ');

describe('le bouton Note', () => {
  it('annonce qu’il attend un point du plan', () => {
    const t = monter();
    presser(t, 'Édition');
    presser(t, 'Note');
    const vu = mots(t);
    expect(vu).toMatch(/Note/);
    // Le mot qui manquait : ce qu'il faut faire maintenant.
    expect(vu).toMatch(/Touchez/);
  });

  it('et se décommande comme les autres poses', () => {
    const t = monter();
    presser(t, 'Édition');
    presser(t, 'Note');
    expect(mots(t)).toMatch(/Touchez/);
    presser(t, 'Annuler la pose');
    expect(mots(t)).not.toMatch(/Touchez le point/);
  });
});

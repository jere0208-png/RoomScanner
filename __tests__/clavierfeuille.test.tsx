/**
 * LE CLAVIER NE FAIT PLUS PASSER LA FEUILLE SOUS L'HEURE.
 *
 * Relevé du patron, capture à l'appui : « le clavier remonte tout le bloc ».
 * Sur « Nouveau mur », la feuille se posait sur le clavier sans borne de
 * hauteur : plus haute que la place restante, elle débordait par le haut, son
 * titre coupé sous la barre d'état.
 *
 * Ce banc tient :
 *   — la coquille commune borne la feuille à ce qui reste entre la zone sûre
 *     du haut et le clavier, et fait défiler ce qui ne tient pas ;
 *   — les feuilles qui défilent déjà d'elles-mêmes gardent leur défilement ;
 *   — « Nouveau mur » se resserre le temps de la saisie : schéma plus petit,
 *     phrase d'aide effacée.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Dimensions, Keyboard, ScrollView, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { MurNeufSheet } from '../src/components/MurNeufSheet';
import { DiagnosticSheet } from '../src/components/DiagnosticSheet';
import { posesDeMur, type WallSeg } from '../src/geometry/floorplan';

type Ecouteur = (e: { endCoordinates: { screenY: number; height: number } }) => void;

/** Tous les écouteurs posés, par événement : la feuille ET son contenu écoutent. */
function capter() {
  const ecouteurs = new Map<string, Set<Ecouteur>>();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((nom: string, fn: unknown) => {
    const lot = ecouteurs.get(nom) ?? new Set<Ecouteur>();
    lot.add(fn as Ecouteur);
    ecouteurs.set(nom, lot);
    return { remove: () => lot.delete(fn as Ecouteur) } as never;
  });
  return {
    monter: (hauteur: number) =>
      act(() => {
        const ecran = Dimensions.get('window').height;
        const e = { endCoordinates: { screenY: ecran - hauteur, height: hauteur } };
        for (const fn of ecouteurs.get('keyboardWillChangeFrame') ?? ecouteurs.get('keyboardDidShow') ?? []) {
          fn(e);
        }
      }),
  };
}

afterEach(() => jest.restoreAllMocks());

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg =>
  ({ id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25 }) as WallSeg;

/** Le style aplati de la feuille elle-même : celle qui porte la borne. */
const feuille = (t: TestRenderer.ReactTestRenderer) => {
  for (const n of t.root.findAll((x) => typeof x.type === 'string' || x.type === View)) {
    const plats = ([] as unknown[]).concat(n.props.style ?? []).flat(5) as Record<string, unknown>[];
    const st = Object.assign({}, ...plats.filter((p) => p && typeof p === 'object'));
    if (typeof st.maxHeight === 'number' && st.borderTopLeftRadius === 26) return st;
  }
  return null;
};

const MARGE_HAUTE = 59; // la zone sûre du banc : un iPhone à encoche

describe('la coquille commune', () => {
  it('borne la feuille au-dessus du clavier, sous la zone sûre du haut', () => {
    const clavier = capter();
    const hote = mur('h', 0, 0, 4, 0);
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <MurNeufSheet pose={posesDeMur([hote])[0]} walls={[hote]} onClose={() => {}} onPoser={() => {}} />,
      );
    });
    const ecran = Dimensions.get('window').height;
    expect(feuille(t)!.maxHeight).toBeLessThanOrEqual(ecran - MARGE_HAUTE);
    clavier.monter(336);
    const borne = feuille(t)!.maxHeight as number;
    // Le haut de la feuille ne monte jamais au-dessus de la zone sûre.
    expect(borne).toBeLessThanOrEqual(ecran - 336 - MARGE_HAUTE);
    expect(borne).toBeGreaterThan(200);
    // Et ce qui ne tient pas défile, dans la feuille.
    expect(t.root.findAllByType(ScrollView).length).toBeGreaterThan(0);
  });

  it('une feuille qui défile d’elle-même garde son seul défilement', () => {
    capter();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<DiagnosticSheet visible issues={[]} rooms={[]} onClose={() => {}} onGoToIssue={() => {}} />);
    });
    // Aucune enveloppe défilante autour de la sienne.
    const defilements = t.root.findAllByType(ScrollView);
    for (const d of defilements) {
      expect(d.findAllByType(ScrollView).filter((x) => x !== d)).toHaveLength(0);
    }
  });
});

describe('« Nouveau mur » le temps de la saisie', () => {
  it('le schéma se resserre et la phrase d’aide s’efface', () => {
    const clavier = capter();
    const hote = mur('h', 0, 0, 4, 0);
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <MurNeufSheet pose={posesDeMur([hote])[0]} walls={[hote]} onClose={() => {}} onPoser={() => {}} />,
      );
    });
    const schema = () => t.root.findAll((n) => n.props?.testID === 'schema-mur-neuf')[0];
    const aide = () =>
      t.root.findAllByType(Text).some((n) => /Mesurez au mètre/.test(String(n.props.children)));
    const large = schema().props.width as number;
    expect(aide()).toBe(true);
    clavier.monter(336);
    expect(schema().props.width).toBeLessThan(large * 0.7);
    expect(aide()).toBe(false);
  });
});

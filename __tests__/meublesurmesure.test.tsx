/**
 * LE MEUBLE SUR MESURE.
 *
 * Correctif de l'audit « dans la peau d'un utilisateur » : le catalogue
 * compte plus de cent meubles à leurs vraies cotes, mais pas le sien — la
 * bibliothèque faite par un menuisier, l'ancien buffet de famille, le
 * meuble qu'on hésite à acheter et dont on a noté les cotes en magasin.
 * « Meuble sur mesure » se pose à ses cotes, au centimètre, avec son nom.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { FurnitureSheet } from '../src/screens/result/FurnitureSheet';
import { nomDuMeuble } from '../src/components/DecorSheet';
import { SUR_MESURE, type CatalogItem } from '../src/geometry/catalogue';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function feuille(onPick: (i: CatalogItem) => void) {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<FurnitureSheet visible quete="" onQuete={() => {}} onClose={() => {}} onPick={onPick} />);
  });
  arbre = t;
  return t;
}
const appui = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root.findAll((n) => n.props?.accessibilityLabel === nom && typeof n.props?.onPress === 'function')[0];
const champ = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === nom)!;

describe('dans le catalogue', () => {
  it('se pose à ses cotes, avec son nom', () => {
    const poses: CatalogItem[] = [];
    const t = feuille((i) => poses.push(i));
    act(() => appui(t, 'Meuble sur mesure').props.onPress());
    act(() => champ(t, 'Nom du meuble').props.onChangeText('Bibliothèque du salon'));
    act(() => champ(t, 'Largeur (cm)').props.onChangeText('120'));
    act(() => champ(t, 'Profondeur (cm)').props.onChangeText('35'));
    act(() => champ(t, 'Hauteur (cm)').props.onChangeText('210'));
    act(() => appui(t, 'Poser le meuble sur mesure').props.onPress());
    expect(poses).toHaveLength(1);
    expect(poses[0]).toMatchObject({ key: SUR_MESURE, label: 'Bibliothèque du salon', w: 1.2, d: 0.35, h: 2.1 });
  });

  it('refuse des cotes qui ne sont pas celles d’un meuble', () => {
    const poses: CatalogItem[] = [];
    const t = feuille((i) => poses.push(i));
    act(() => appui(t, 'Meuble sur mesure').props.onPress());
    act(() => champ(t, 'Largeur (cm)').props.onChangeText('0'));
    act(() => champ(t, 'Profondeur (cm)').props.onChangeText('35'));
    act(() => champ(t, 'Hauteur (cm)').props.onChangeText('abc'));
    const bouton = t.root.findAll((n) => n.props?.accessibilityLabel === 'Poser le meuble sur mesure')[0];
    expect(bouton.props.disabled).toBe(true);
    expect(poses).toHaveLength(0);
  });

  it('sans nom, il s’appelle « Meuble sur mesure »', () => {
    const poses: CatalogItem[] = [];
    const t = feuille((i) => poses.push(i));
    act(() => appui(t, 'Meuble sur mesure').props.onPress());
    act(() => champ(t, 'Largeur (cm)').props.onChangeText('80'));
    act(() => champ(t, 'Profondeur (cm)').props.onChangeText('40'));
    act(() => champ(t, 'Hauteur (cm)').props.onChangeText('90'));
    act(() => appui(t, 'Poser le meuble sur mesure').props.onPress());
    expect(poses[0].label).toBe('Meuble sur mesure');
  });
});

describe('sur le plan', () => {
  it('le meuble garde son nom', () => {
    const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
      id,
      type: 'wall',
      a: { x: ax, z: az },
      b: { x: bx, z: bz },
      height: 2.5,
      yCenter: 1.25,
    });
    useScanStore.setState({
      walls: [mur('n', 0, 0, 5, 0), mur('e', 5, 0, 5, 4), mur('s', 5, 4, 0, 4), mur('o', 0, 4, 0, 0)],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never,
      objects: [],
    } as never);
    const id = useScanStore
      .getState()
      .addObject({ key: SUR_MESURE, label: 'Buffet de famille', category: 'storage', w: 1.6, d: 0.45, h: 0.9 }, 2.5, 2);
    const o = useScanStore.getState().objects.find((x) => x.id === id)!;
    expect(o.width).toBeCloseTo(1.6, 6);
    expect(nomDuMeuble(o)).toBe('Buffet de famille');
  });
});

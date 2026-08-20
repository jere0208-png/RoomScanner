/**
 * LE CHOIX DE FIN DE SCAN — relevé du patron : « à la fin du scan il doit
 * demander si on veut intégrer les éléments électriques détectés, et les
 * meubles. On coche nos choix et on valide. Pop-up dans l'esprit de l'app,
 * moderne. »
 *
 * Une honnêteté d'abord, qui gouverne les mots du popup : RoomPlan ne
 * DÉTECTE PAS l'appareillage mural — une prise fait trois centimètres, son
 * modèle voit des meubles. Ce que l'app sait faire de vrai : les meubles
 * sont DÉTECTÉS, et l'électricité est PROPOSÉE aux normes (l'implantation
 * NF C 15-100 posée hors meubles). Le popup dit « proposée », jamais
 * « détectée » : un plan qui ment est pire qu'un plan incomplet.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useScanStore } from '../src/store/scanStore';
import type { ObjectData, SurfaceData } from 'react-native-room-scan';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());
beforeEach(() => jest.advanceTimersByTime(2000));

/* Un mur tel que RoomPlan le livre — le même gabarit que scanStore.test. */
const surface = (
  id: string,
  cx: number,
  cz: number,
  length: number,
  alongZ = false,
): SurfaceData => ({
  id,
  type: 'wall',
  length,
  height: 2.5,
  transform: alongZ
    ? [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, cx, 1.25, cz, 1]
    : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 1.25, cz, 1],
});

const boite = (p: string, x: number, z: number, w: number, h: number) => [
  surface(`${p}n`, x + w / 2, z, w),
  surface(`${p}s`, x + w / 2, z + h, w),
  surface(`${p}w`, x, z + h / 2, h, true),
  surface(`${p}e`, x + w, z + h / 2, h, true),
];

const meuble = (id: string, x: number, z: number): ObjectData => ({
  id,
  category: 'storage',
  width: 0.8,
  height: 0.8,
  depth: 0.8,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.4, z, 1],
});

describe('le magasin, en fin de scan', () => {
  it('propose son arrivage : le compte des meubles détectés', () => {
    useScanStore.setState({ saves: [], objects: [], arrivage: null });
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: boite('a', 0, 0, 4, 3),
      objects: [meuble('o1', 1, 1), meuble('o2', 2.5, 1.5)],
    });
    expect(useScanStore.getState().arrivage).toEqual({ meubles: 2 });
    useScanStore.getState().oublierArrivage();
    expect(useScanStore.getState().arrivage).toBeNull();
  });

  it('ne propose rien sur un scan vide', () => {
    useScanStore.setState({ saves: [], arrivage: null });
    useScanStore.getState().finalize({
      modelPath: '/tmp/vide.usdz',
      surfaces: [],
      objects: [],
    });
    expect(useScanStore.getState().arrivage).toBeNull();
  });

  it('sait retirer les meubles quand on les décoche', () => {
    useScanStore.setState({ saves: [], arrivage: null });
    useScanStore.getState().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces: boite('a', 0, 0, 4, 3),
      objects: [meuble('o1', 1, 1)],
    });
    expect(useScanStore.getState().objects).toHaveLength(1);
    useScanStore.getState().retirerMeubles();
    expect(useScanStore.getState().objects).toHaveLength(0);
  });
});

describe('le popup du choix', () => {
  const monter = (
    meubles: number,
    onValider = jest.fn(),
    onClose = jest.fn(),
  ) => {
    const { ChoixScan } = require('../src/components/ChoixScan');
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ChoixScan
          visible
          meubles={meubles}
          onValider={onValider}
          onClose={onClose}
        />,
      );
    });
    return tree;
  };

  const textes = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root
      .findAllByType(Text)
      .flatMap((n) =>
        (Array.isArray(n.props.children)
          ? n.props.children
          : [n.props.children]
        ).filter((x: unknown) => typeof x === 'string' || typeof x === 'number'),
      )
      .join(' | ');

  it('dit DÉTECTÉ pour les meubles, PROPOSÉ pour l’électricité', () => {
    const vu = textes(monter(3));
    expect(vu).toContain('3');
    expect(vu.toLowerCase()).toContain('détect');
    expect(vu.toLowerCase()).toContain('propos');
    expect(vu).toContain('NF C 15-100');
  });

  it('coche tout d’office, se décoche d’un appui, et valide LES CHOIX', () => {
    const onValider = jest.fn();
    const tree = monter(2, onValider);
    const ligneElec = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) =>
        String(n.props.accessibilityLabel ?? '').includes('Électricité'),
      )!;
    expect(ligneElec).toBeDefined();
    act(() => ligneElec.props.onPress());
    const valider = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Intégrer')!;
    act(() => valider.props.onPress());
    expect(onValider).toHaveBeenCalledWith({ meubles: true, elec: false });
  });

  it('sans meuble détecté, la ligne des meubles ne paraît pas', () => {
    const tree = monter(0);
    const ligne = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) =>
        String(n.props.accessibilityLabel ?? '').includes('Meubles'),
      );
    expect(ligne).toBeUndefined();
  });
});

/**
 * « DÉCORER » SUR UN LOGEMENT À PLUSIEURS NIVEAUX.
 *
 * Correctif de l'audit « dans la peau d'un utilisateur » : la feuille
 * « Décorer » listait les pièces de tous les niveaux sans dire lesquelles
 * étaient à l'étage — deux « Chambre » ne se distinguaient pas — et l'aperçu
 * qui tourne restait celui du niveau affiché : une pièce de l'étage n'y
 * apparaissait pas. Chaque pièce dit maintenant son niveau, et l'aperçu
 * montre la pièce choisie, à son niveau.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { DecorSheet } from '../src/components/DecorSheet';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const mur = (id: string, niveau: number, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  ...(niveau ? { niveau } : {}),
});

describe('« Décorer » sur deux niveaux', () => {
  it('chaque pièce dit son niveau, et l’aperçu montre celle qu’on choisit, à son niveau', () => {
    act(() => {
      useScanStore.setState({
        walls: [
          mur('a', 0, 0, 0, 4, 0),
          mur('b', 0, 4, 0, 4, 3),
          mur('c', 0, 4, 3, 0, 3),
          mur('d', 0, 0, 3, 0, 0),
          mur('e', 1, 0, 0, 4, 0),
          mur('f', 1, 4, 0, 4, 3),
          mur('g', 1, 4, 3, 0, 3),
          mur('h', 1, 0, 3, 0, 0),
        ],
        rooms: [
          { id: 'bas', name: 'Chambre', floor: null, wallIds: ['a', 'b', 'c', 'd'] },
          { id: 'haut', name: 'Chambre', floor: null, wallIds: ['e', 'f', 'g', 'h'], niveau: 1 },
        ] as never,
        objects: [],
        openings: [],
        fixtures: [],
        ceiling: [],
        niveauCourant: 0,
      } as never);
    });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<DecorSheet visible onClose={() => {}} />);
    });
    const puces = t.root
      .findAll((n) => typeof n.props?.onPress === 'function' && /^Chambre/.test(String(n.props?.accessibilityLabel ?? '')))
      .map((n) => String(n.props.accessibilityLabel));
    // Le composant et sa vue native portent la même étiquette : on les compte une fois.
    expect([...new Set(puces)]).toEqual(['Chambre · Rez-de-chaussée', 'Chambre · 1er étage']);
    const etage = t.root.findAll((n) => n.props?.accessibilityLabel === 'Chambre · 1er étage' && typeof n.props?.onPress === 'function')[0];
    act(() => etage.props.onPress());
    const apercu = t.root.findAllByType(Iso3DView)[0];
    expect(apercu.props.focusRoomId).toBe('haut');
    expect(apercu.props.niveau).toBe(1);
    act(() => t.unmount());
  });
});

/**
 * DÉCORER — les murs, le sol et les meubles d'une pièce, depuis la maquette.
 *
 * Relevé du patron : « je ne vois pas la possibilité de changer la couleur
 * des meubles ou du sol ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DecorSheet } from '../src/components/DecorSheet';
import { useScanStore } from '../src/store/scanStore';
import { hexDeTeinte } from '../src/ui/habillage';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const objet = (id: string, roomId: string, modele: string, category: string) => ({
  id,
  category,
  modele,
  width: 1,
  depth: 1,
  height: 1,
  roomId,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0.5, 1, 1],
});

beforeEach(() => {
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      screen: 'result',
      rooms: [
        { id: 'r1', name: 'Séjour', floor: null },
        { id: 'r2', name: 'Chambre', floor: null },
      ] as never,
      objects: [
        objet('o1', 'r1', 'canape2', 'sofa'),
        objet('o2', 'r1', 'chaise', 'chair'),
        objet('o3', 'r1', 'chaise', 'chair'),
        objet('o4', 'r2', 'lit140', 'bed'),
      ] as never,
    });
  });
});

const monter = (piece: string | null = 'r1') => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<DecorSheet visible onClose={jest.fn()} pieceInitiale={piece} />);
  });
  return t;
};
const appuyer = (t: TestRenderer.ReactTestRenderer, label: string) => {
  const b = t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false })[0];
  expect([label, !!b]).toEqual([label, true]);
  act(() => b.props.onPress());
};
const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Text).map((n) => [].concat(n.props.children ?? []).join(''));

describe('la feuille « Décorer »', () => {
  it('peint les murs, pose le sol, teinte un meuble — aussitôt', () => {
    const t = monter();
    appuyer(t, 'Murs : Vert sauge');
    appuyer(t, 'Sol : Noyer');
    appuyer(t, 'Canapé 2 places : Bleu nuit');
    const r1 = useScanStore.getState().rooms.find((r) => r.id === 'r1')!;
    expect(r1.peinture).toBe('sauge');
    expect(r1.sol).toBe('noyer');
    expect(useScanStore.getState().objects.find((o) => o.id === 'o1')!.teinte).toBe(hexDeTeinte('bleuNuit'));
    // « D'origine » rend la couleur du meuble.
    appuyer(t, 'Canapé 2 places : D’origine');
    expect(useScanStore.getState().objects.find((o) => o.id === 'o1')!.teinte).toBeUndefined();
    act(() => t.unmount());
  });

  it('deux meubles du même nom se distinguent, et l’on passe d’une pièce à l’autre', () => {
    const t = monter();
    expect(textes(t)).toEqual(expect.arrayContaining(['Chaise 1', 'Chaise 2']));
    appuyer(t, 'Chambre');
    expect(textes(t)).toContain('Lit double 140');
    expect(textes(t)).not.toContain('Chaise 1');
    act(() => t.unmount());
  });
});

describe('le geste se trouve', () => {
  it('« Décorer » sur la barre de la maquette, et dans le menu du plan', () => {
    const barre = lire('src/screens/result/ResultToolbar.tsx');
    expect(barre).toContain('<ToolPill key="decorer" icon="rouleau" label="Décorer" active={false} onPress={onDecorer} />');
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).toContain('onDecorer={() => setDecorant(true)}');
    expect(ecran).toContain("label: 'Décorer',");
    expect(ecran).toContain('<DecorSheet');
  });
});

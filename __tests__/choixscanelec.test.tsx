/**
 * LA FIN DU SCAN, EN MODE ÉLECTRICITÉ — revue « Gérard », électricien.
 *
 * La ligne « Électricité proposée aux normes » ne paraît qu'en mode
 * Électricité, et elle arrivait décochée : l'électricien qui a allumé le
 * mode la cochait à chaque relevé. Elle suit maintenant le mode.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ChoixScan } from '../src/components/ChoixScan';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (elec: boolean, onValider = jest.fn()) => {
  act(() => {
    arbre = TestRenderer.create(
      <ChoixScan visible meubles={2} elec={elec} onValider={onValider} onClose={jest.fn()} />,
    );
  });
  return arbre!;
};
const cases = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => n.props.accessibilityRole === 'checkbox' && !!n.props.onPress);
const valider = (t: TestRenderer.ReactTestRenderer) =>
  act(() =>
    t.root
      .findAll((n) => n.props.accessibilityLabel === 'C’est bon' && typeof n.props.onPress === 'function')
      .pop()!
      .props.onPress(),
  );

it('mode Électricité : la norme est cochée d’office', () => {
  const onValider = jest.fn();
  const t = monter(true, onValider);
  const elec = cases(t).find((n) => /normes/i.test(String(n.props.accessibilityLabel)))!;
  expect(elec.props.accessibilityState.checked).toBe(true);
  valider(t);
  expect(onValider).toHaveBeenLastCalledWith({ meubles: true, elec: true });
});

it('grand public : pas de ligne, rien d’électrique ne se pose', () => {
  const onValider = jest.fn();
  const t = monter(false, onValider);
  expect(cases(t).some((n) => /normes/i.test(String(n.props.accessibilityLabel)))).toBe(false);
  valider(t);
  expect(onValider).toHaveBeenLastCalledWith({ meubles: true, elec: false });
});

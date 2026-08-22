/**
 * LA PASTILLE DE CONTRÔLE — ce qu'elle dit, et quand elle le dit.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ControlePastille } from '../src/components/ControlePastille';
import { light } from '../src/theme';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const monter = (el: React.ReactElement) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(el);
  });
  return t;
};
const par = (t: TestRenderer.ReactTestRenderer, l: string) =>
  t.root.findAll((n) => n.props?.accessibilityLabel === l)[0];

/**
 * LE CONTRÔLE NE CRIE PAS AVANT QU'ON AIT COMMENCÉ.
 *
 * Trouvé en parcourant l'application comme un utilisateur qui la découvre :
 * on pose un séjour de vingt mètres carrés — le premier geste de l'app — et
 * la pastille passe aussitôt au ROUGE, onde qui bat, « 3 points à
 * corriger ». Les constats sont justes (cinq socles exigés, aucun posé) mais
 * ils reprochent à quelqu'un de n'avoir pas encore fait ce qu'il vient
 * d'ouvrir l'application pour faire.
 *
 * Une pièce sans le moindre appareil n'est pas une installation NON CONFORME,
 * c'est une installation QUI N'EXISTE PAS ENCORE. Le verdict attend donc le
 * premier appareil posé : jusque-là, la pastille reste neutre et se contente
 * d'inviter — « Contrôle des normes ». Elle ne ment pas, elle ne devance pas.
 *
 * Dès le premier socle, en revanche, le contrôle reprend tous ses droits :
 * c'est là que l'électricien travaille, et c'est là qu'un manque est un
 * vrai manque.
 */
describe('la pastille de contrôle', () => {
  it('reste neutre tant qu’aucun appareil n’est posé', () => {
    const t = monter(<ControlePastille alertes={3} commence={false} onPress={() => {}} />);
    expect(par(t, 'Contrôle des normes')).toBeDefined();
    // Ni rouge, ni onde : rien ne bat pour un reproche prématuré.
    expect(t.root.findAll((n) => {
      const st = StyleSheet.flatten(n.props?.style) as
        | { borderColor?: string }
        | undefined;
      return st?.borderColor === light.danger;
    })).toHaveLength(0);
    act(() => t.unmount());
  });

  it('mais dit le verdict dès le premier appareil', () => {
    const t = monter(<ControlePastille alertes={3} commence onPress={() => {}} />);
    expect(par(t, 'Contrôle — 3 points à corriger')).toBeDefined();
    act(() => t.unmount());
  });

  it('et reste verte quand tout est conforme', () => {
    const t = monter(<ControlePastille alertes={0} commence onPress={() => {}} />);
    expect(par(t, 'Contrôle — conforme')).toBeDefined();
    act(() => t.unmount());
  });
});

/**
 * LE CONTRÔLE DIT SUR QUOI IL PORTE.
 *
 * Trouvé en relevant une maison à deux niveaux : le contrôle des normes ne
 * regarde que le NIVEAU AFFICHÉ — et c'est le bon choix, un constat qu'on
 * ne peut pas voir est un constat qu'on ne peut pas corriger. Mais rien ne
 * le disait. L'électricien au rez-de-chaussée lisait « Rien de bloquant »,
 * refermait, et livrait un dossier dont l'étage comptait cinq manques.
 *
 * Un verdict partiel qui se présente comme un verdict complet est pire que
 * pas de verdict du tout : il donne une confiance qu'il ne peut pas tenir.
 * La feuille annonce donc son périmètre, dès qu'il y a plus d'un niveau au
 * dossier — et se tait quand il n'y en a qu'un, où la précision serait du
 * bruit.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DiagnosticSheet } from '../src/components/DiagnosticSheet';

const monter = (props: { niveau: number; plusieursNiveaux: boolean }) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <DiagnosticSheet
        visible
        onClose={() => {}}
        issues={[]}
        rooms={[]}
        onGoToIssue={() => {}}
        niveau={props.niveau}
        plusieursNiveaux={props.plusieursNiveaux}
      />,
    );
  });
  return t;
};

const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => (typeof n.props.children === 'string' ? n.props.children : ''))
    .join(' | ');

describe('la portée du contrôle', () => {
  it('annonce le niveau examiné quand le dossier en compte plusieurs', () => {
    const t = monter({ niveau: 0, plusieursNiveaux: true });
    expect(mots(t)).toContain('Rez-de-chaussée');
    act(() => t.unmount());
  });

  it('et le nomme correctement à l’étage', () => {
    const t = monter({ niveau: 1, plusieursNiveaux: true });
    expect(mots(t)).toContain('1er étage');
    act(() => t.unmount());
  });

  it('mais se tait sur un dossier à un seul niveau', () => {
    const t = monter({ niveau: 0, plusieursNiveaux: false });
    // Préciser « rez-de-chaussée » quand il n'y a que lui, c'est du bruit.
    expect(mots(t)).not.toContain('Rez-de-chaussée');
    act(() => t.unmount());
  });
});

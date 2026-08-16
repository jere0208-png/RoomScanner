/**
 * Le bandeau de conformité, rangé par pièce.
 *
 * À plat, une installation complète produit trente lignes qu'on relit du
 * début à chaque passage. Or on corrige un plan pièce par pièce : le bandeau
 * doit suivre ce geste. Ce qui compte, et que le test fixe :
 *
 * - une pièce = un volet, dans l'ordre où les constats arrivent ;
 * - un volet qui porte une ALERTE est ouvert d'office — on ne doit pas avoir
 *   à chercher ce qui bloque ;
 * - un volet qui ne porte que des remarques est replié, mais on peut
 *   l'ouvrir ;
 * - les constats sans pièce parlent du plan lui-même, et se rangent à part.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DiagnosticSheet, type Constat } from '../src/components/DiagnosticSheet';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const ROOMS = [
  { id: 'r1', name: 'Cuisine' },
  { id: 'r2', name: 'Chambre' },
];

const ISSUES: Constat[] = [
  {
    key: 'a',
    message: 'Prise à moins de 60 cm de l’évier',
    hint: 'NF C 15-100',
    severity: 'alerte',
    roomId: 'r1',
  },
  {
    key: 'b',
    message: 'Six socles sur le circuit',
    hint: 'Huit au maximum',
    severity: 'info',
    roomId: 'r1',
  },
  {
    key: 'c',
    message: 'Deux prises seulement',
    hint: 'Trois attendues en chambre',
    severity: 'info',
    roomId: 'r2',
  },
  {
    key: 'd',
    message: 'Une pièce n’est pas refermée',
    hint: 'Refaites le tour',
    severity: 'info',
  },
];

const rendu = (issues = ISSUES) => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <DiagnosticSheet
        visible
        onClose={() => {}}
        issues={issues}
        rooms={ROOMS}
        onGoToIssue={() => {}}
      />,
    );
  });
  return tree;
};

/** Tout ce qui est écrit à l'écran, nombres compris (les pastilles). */
const textes = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .filter((x) => typeof x === 'string' || typeof x === 'number')
    .map(String);

describe('le rangement par pièce', () => {
  it('donne un volet par pièce, plus un pour le plan', () => {
    const vus = textes(rendu());
    expect(vus).toContain('Cuisine');
    expect(vus).toContain('Chambre');
    // Le constat sans pièce vise le plan : il a son propre volet.
    expect(vus).toContain('Plan');
  });

  it('ouvre d’office la pièce qui porte une alerte', () => {
    const vus = textes(rendu());
    expect(vus).toContain('Prise à moins de 60 cm de l’évier');
    // Et son voisin de volet vient avec, puisque le volet est ouvert.
    expect(vus).toContain('Six socles sur le circuit');
  });

  it('replie celles qui n’ont que des remarques', () => {
    const vus = textes(rendu());
    expect(vus).not.toContain('Deux prises seulement');
    expect(vus).not.toContain('Une pièce n’est pas refermée');
  });

  it('mais on peut les ouvrir d’un appui', () => {
    const tree = rendu();
    const volet = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) =>
        n
          .findAllByType(Text)
          .some((t) => t.props.children === 'Chambre'),
      )!;
    act(() => volet.props.onPress());
    expect(textes(tree)).toContain('Deux prises seulement');
  });

  it('compte les constats de chaque volet', () => {
    const vus = textes(rendu());
    // Cuisine : deux constats. Chambre et Plan : un chacun.
    expect(vus).toContain('2');
    expect(vus).toContain('1');
  });

  it('annonce le nombre d’alertes, pas le nombre de lignes', () => {
    expect(textes(rendu())).toContain('1 point à corriger');
  });

  it('et se tait quand tout va bien', () => {
    const vus = textes(rendu([]));
    expect(vus).toContain('Rien de bloquant');
    expect(vus).toContain('Le plan ne présente aucune anomalie détectable.');
  });
});

/**
 * UNE FEUILLE DE CHOIX NE TOMBE PAS POUR UN PICTOGRAMME.
 *
 * Relevé du chantier, capture du garde-fou à l'appui : « L'application
 * s'est arrêtée net — Cannot read property 'map' of undefined, at
 * ActionSheet ». La fiche circuits d'un appareil portait un choix
 * `icon: 'metre'` — une clé qui n'a JAMAIS existé dans la planche
 * d'icônes. `ICONS[icone]` rendait `undefined`, son `.map` jetait, et
 * toute la feuille — puis tout l'écran — tombait pour un dessin de
 * vingt points.
 *
 * TROIS VERROUS, du plus profond au plus sûr :
 *   — la clé fautive est corrigée (« Voir le mur » porte la règle) ;
 *   — la feuille ENCAISSE une clé inconnue : le choix se rend sans
 *     pictogramme, jamais sans écran — c'est ce banc ;
 *   — le TYPE s'est resserré : `icon` n'accepte plus que les clés de la
 *     planche — la prochaine invention ne compilera pas.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ActionSheet, type ActionData } from '../src/components/Sheet';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

it('un pictogramme inconnu ne fait pas tomber la feuille', () => {
  const data = {
    title: 'Circuit',
    actions: [
      // La clé qui a fait tomber l'app sur le chantier — glissée ici de
      // force : le type la refuse désormais, le rendu doit l'encaisser
      // quand même (une donnée d'hier peut la porter).
      { label: 'Voir le mur', icon: 'metre', onPress: () => {} },
      { label: 'Fermer', onPress: () => {} },
    ],
  } as unknown as ActionData;
  let t!: TestRenderer.ReactTestRenderer;
  expect(() => {
    act(() => {
      t = TestRenderer.create(<ActionSheet data={data} onClose={() => {}} />);
    });
  }).not.toThrow();
  arbre = t;
  const mots = t.root
    .findAllByType(Text)
    .map((n) => String(n.props.children))
    .join(' | ');
  expect(mots).toContain('Voir le mur');
});

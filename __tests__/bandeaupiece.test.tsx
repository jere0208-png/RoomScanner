/**
 * LE BANDEAU D'UNE PIECE PROPOSE SES GESTES, LUI AUSSI.
 *
 * Le « … » d'une menuiserie est parti au relevé precedent — « mal place, peu
 * comprehensible sans lire le texte ». Celui d'une PIECE etait son jumeau
 * exact, et il est reste : quatre gestes derriere trois points — dupliquer,
 * fusionner, scinder, retirer.
 *
 * Le bandeau d'une piece etait aussi le SEUL de l'application a ne porter
 * aucune silhouette : quatre boutons de mots au milieu de bandeaux
 * dessines. Le banc de continuite l'avait note noir sur blanc, faute de
 * pouvoir le corriger ce jour-la.
 *
 * LES DEUX SE CORRIGENT ENSEMBLE, et de la meme facon : chaque geste prend
 * sa pastille, sa silhouette du jeu commun et son mot dessous.
 *
 * LA HAUTEUR DESCEND DANS LA LIGNE DE LECTURE. Elle vivait DANS un bouton —
 * « H 2,50 m » —, ce qui melangeait ce qu'on lit et ce qu'on touche : un
 * bouton qui affiche une valeur se lit comme une etiquette. Elle rejoint
 * donc la surface et les dimensions, en haut, et son bouton ne dit plus que
 * le geste.
 *
 * CE QUI NE PEUT PAS ABOUTIR NE S'AFFICHE PAS. Une piece sans voisine ne se
 * fusionne avec rien ; la derniere piece d'un plan ne se retire pas ; un
 * contour qui n'est pas un rectangle n'a pas de « largeur x profondeur ».
 * C'etait deja vrai dans le menu, ca reste vrai en pastilles.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text } from 'react-native';
import { Path } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { light } from '../src/theme';
import { getStyles } from '../src/screens/result/styles';
import { RoomBar } from '../src/components/RoomBar';
import { SOLAIRES } from '../src/ui/solaires';

const styles = getStyles(light) as unknown as Record<string, object>;

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (props: Partial<React.ComponentProps<typeof RoomBar>> = {}) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <RoomBar
        room={{ id: 'r1', name: 'Séjour' }}
        surface={{ area: 12.4, exact: true }}
        extent={{ width: 4.2, depth: 3.1 }}
        hauteur={2.5}
        styles={styles}
        onName={() => {}}
        onCotes={() => {}}
        onHeight={() => {}}
        onDupliquer={() => {}}
        onFusionner={() => {}}
        onScinder={() => {}}
        onRetirer={() => {}}
        {...props}
      />,
    );
  });
  arbre = t;
  return t;
};

const boutons = (t: TestRenderer.ReactTestRenderer) =>
  [
    ...new Set(
      t.root
        .findAll(
          (n) =>
            typeof n.props?.accessibilityLabel === 'string' &&
            typeof n.props?.onPress === 'function',
        )
        .map((n) => n.props.accessibilityLabel as string),
    ),
  ];

const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => String(n.props.children))
    .join(' | ');

describe('les gestes d’une piece', () => {
  it('sont tous a l’ecran, aucun derriere trois points', () => {
    const vus = boutons(monter());
    for (const geste of [
      'Nommer la pièce',
      'Cotes de la pièce',
      'Hauteur sous plafond',
      'Dupliquer la pièce',
      'Fusionner avec une autre pièce',
      'Scinder la pièce',
      'Retirer la pièce',
    ]) {
      expect([geste, vus.includes(geste)]).toEqual([geste, true]);
    }
    expect(vus).not.toContain('Autres gestes sur la pièce');
  });

  it('portent chacun sa silhouette, prise au jeu commun', () => {
    const t = monter();
    const jeu = new Set<string>(Object.values(SOLAIRES));
    const traces = t.root.findAllByType(Path).map((n) => String(n.props.d));
    expect(traces.length).toBeGreaterThan(4);
    expect(traces.filter((d) => !jeu.has(d))).toEqual([]);
  });

  it('et chacun son mot, lisible sans le toucher', () => {
    const ecrits = mots(monter());
    expect(ecrits).toMatch(/Dupliquer/);
    expect(ecrits).toMatch(/Scinder/);
  });
});

describe('la hauteur', () => {
  it('se lit avec les autres mesures, pas dans un bouton', () => {
    const t = monter();
    // En haut, avec la surface et les dimensions.
    expect(mots(t)).toMatch(/2,50/);
    // Et plus DANS le bouton : celui-ci ne dit que le geste.
    const bouton = t.root
      .findAll((n) => n.props?.accessibilityLabel === 'Hauteur sous plafond')
      .pop()!;
    expect(
      bouton
        .findAllByType(Text)
        .map((n) => String(n.props.children))
        .join(' '),
    ).not.toMatch(/2,50/);
  });
});

/*
  LES CONTROLES EN SENS INVERSE : un bandeau qui afficherait TOUJOURS les
  sept gestes passerait la premiere epreuve, et offrirait une fusion sans
  voisine ou le retrait de la derniere piece.
*/
describe('ce qui ne peut pas aboutir ne s’affiche pas', () => {
  it('pas de fusion quand la piece n’a pas de voisine', () => {
    expect(boutons(monter({ onFusionner: undefined }))).not.toContain(
      'Fusionner avec une autre pièce',
    );
  });

  it('pas de retrait quand c’est la derniere piece du plan', () => {
    expect(boutons(monter({ onRetirer: undefined }))).not.toContain(
      'Retirer la pièce',
    );
  });

  it('pas de cotes sur un contour qui n’est pas un rectangle', () => {
    expect(boutons(monter({ onCotes: undefined }))).not.toContain(
      'Cotes de la pièce',
    );
  });
});

/**
 * La feuille du bas doit se fermer AUSSI BIEN qu'elle s'ouvre.
 *
 * Elle montait en 220 ms et disparaissait en une image : le `Modal` était
 * monté sur `visible`, donc démonté avant que l'animation de descente ait eu
 * le temps de jouer. Et le contenu, écrit `{data && …}`, s'évanouissait avant
 * la feuille — elle finissait sa course vide.
 *
 * On vérifie les deux invariants qui produisent ce défaut, pas les pixels :
 * la feuille reste montée le temps de descendre, et son contenu reste lisible
 * pendant ce temps-là.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Modal, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ActionSheet, SheetShell } from '../src/components/Sheet';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const modalOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Modal)[0];

const textes = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .filter((x) => typeof x === 'string')
    .join(' | ');

describe('la descente de la feuille', () => {
  it('reste montée pendant l’animation de fermeture', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <SheetShell visible onClose={() => {}}>
          <Text>contenu</Text>
        </SheetShell>,
      );
    });
    expect(modalOf(tree).props.visible).toBe(true);

    act(() => {
      tree.update(
        <SheetShell visible={false} onClose={() => {}}>
          <Text>contenu</Text>
        </SheetShell>,
      );
    });
    // Juste après la fermeture, la feuille est encore là : c'est tout
    // l'objet du correctif.
    expect(modalOf(tree).props.visible).toBe(true);

    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(modalOf(tree).props.visible).toBe(false);
  });

  it('le voile s’éteint avec elle, il ne saute pas', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <SheetShell visible onClose={() => {}}>
          <Text>contenu</Text>
        </SheetShell>,
      );
    });
    // Le voile est une vue animée à part : sa teinte ne doit plus être posée
    // en dur sur le fond, sinon elle apparaît d'un coup.
    const styles = JSON.stringify(tree.toJSON());
    expect(styles).toContain('rgba(11,13,18,0.42)');
    expect(styles).toContain('opacity');
  });
});

describe('le contenu de la feuille', () => {
  const data = {
    title: 'Renommer la pièce',
    subtitle: 'Elle apparaîtra dans le métré.',
    actions: [{ label: 'Renommer', onPress: () => {} }],
  };

  it('survit à la disparition de sa donnée', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<ActionSheet data={data} onClose={() => {}} />);
    });
    expect(textes(tree)).toContain('Renommer la pièce');

    act(() => {
      tree.update(<ActionSheet data={null} onClose={() => {}} />);
    });
    // La feuille descend encore : on doit toujours lire son titre.
    expect(modalOf(tree).props.visible).toBe(true);
    expect(textes(tree)).toContain('Renommer la pièce');

    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(modalOf(tree).props.visible).toBe(false);
  });
});

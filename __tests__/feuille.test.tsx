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

/**
 * UNE FEUILLE N'EN OUVRE UNE AUTRE QU'APRÈS ÊTRE PARTIE.
 *
 * iOS ne présente qu'une fenêtre modale à la fois. En ouvrir une seconde
 * pendant que la première se retire ne fait rien du tout : la seconde
 * n'apparaît jamais. Le symptôme est déroutant — on touche « Largeur » dans
 * un menu, le clavier monte (le champ a bien pris le focus) et il n'y a
 * aucun champ à l'écran. L'action attendait derrière un délai de 180 ms
 * réglé à l'œil sur l'animation de descente ; elle attend maintenant le
 * démontage réel.
 */
describe('l’enchaînement de deux feuilles', () => {
  it('ne lance l’action qu’une fois la fenêtre retirée', () => {
    const fait: string[] = [];
    let visible = true;
    const rendre = (tree?: TestRenderer.ReactTestRenderer) => {
      const el = (
        <ActionSheet
          data={
            visible
              ? {
                  title: 'Menuiserie',
                  actions: [
                    { label: 'Largeur', onPress: () => fait.push('largeur') },
                  ],
                }
              : null
          }
          onClose={() => {
            visible = false;
          }}
        />
      );
      if (tree) {
        act(() => tree.update(el));
        return tree;
      }
      let t!: TestRenderer.ReactTestRenderer;
      act(() => {
        t = TestRenderer.create(el);
      });
      return t;
    };
    const tree = rendre();
    /**
     * On remonte depuis le MOT jusqu'au premier parent qui répond au doigt.
     *
     * Chercher le `Pressable` par son type ne donne rien ici : le banc
     * d'essai de React Native le remplace par un autre composant, et le
     * symbole importé ne correspond plus à ce qui est rendu.
     */
    const mot = tree.root
      .findAllByType(Text)
      .find((t) => t.props.children === 'Largeur')!;
    let ligne: TestRenderer.ReactTestInstance | null = mot;
    while (ligne && typeof ligne.props?.onPress !== 'function') {
      ligne = ligne.parent;
    }
    act(() => ligne!.props.onPress());
    // Rien n'est parti : la feuille est encore là, en train de descendre.
    expect(fait).toEqual([]);
    expect(modalOf(tree).props.visible).toBe(true);

    // Le parent retire la donnée, la descente se joue, la fenêtre part.
    rendre(tree);
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(modalOf(tree).props.visible).toBe(false);
    expect(fait).toEqual(['largeur']);
  });
});

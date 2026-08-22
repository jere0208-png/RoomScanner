/**
 * LE MOT AU SERVICE CLIENT — et le clavier qui mangeait son bouton.
 *
 * Relevé du patron, capture à l'appui : « lors d'un message au support, le
 * bouton Envoyer n'est plus visible à cause du clavier ». Le formulaire
 * était une carte CENTRÉE : le clavier monte, occupe la moitié basse de
 * l'écran, et le bouton se retrouve dessous. On tape son message et l'on ne
 * peut plus l'envoyer sans refermer le clavier — qu'aucun bouton ne propose
 * de refermer.
 *
 * La réponse est écrite depuis longtemps dans cette application, et elle
 * vaut pour toutes ses fenêtres : « ce sont des feuilles du bas, et ce n'est
 * pas une mode — c'est le seul endroit de l'écran que le clavier ne peut pas
 * recouvrir, puisque la feuille MONTE AVEC LUI ». Une boîte centrée avec un
 * champ de saisie finit toujours par se faire manger la moitié.
 *
 * Le formulaire prend donc la coquille commune (`SheetShell`), celle qui
 * porte déjà la montée, la descente, le voile qui referme et le décalage du
 * clavier. Ce banc tient l'essentiel : il EST une feuille, et son bouton
 * d'envoi vit avec le reste.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { SupportSheet } from '../src/components/SupportSheet';
import { SheetShell } from '../src/components/Sheet';
import { CloseCross } from '../src/components/CloseCross';

const monter = () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<SupportSheet visible fermer={() => {}} />);
  });
  return t;
};

const parLabel = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAll((n) => n.props?.accessibilityLabel === label)[0];

describe('le formulaire du service client', () => {
  it('est une feuille du bas, qui monte avec le clavier', () => {
    const t = monter();
    // La coquille commune porte le décalage du clavier : sans elle, le
    // formulaire flotte au centre et le bouton passe dessous.
    expect(t.root.findAllByType(SheetShell)).toHaveLength(1);
    act(() => t.unmount());
  });

  it('garde ses trois gestes : sujet, message, pièce jointe, envoi', () => {
    const t = monter();
    for (const l of ['Sujet', 'Message', 'Joindre une photo', 'Envoyer le message']) {
      expect(`${l} présent : ${!!parLabel(t, l)}`).toBe(`${l} présent : true`);
    }
    act(() => t.unmount());
  });

  it('n’envoie rien tant qu’il n’y a rien à envoyer', () => {
    const t = monter();
    expect(
      parLabel(t, 'Envoyer le message').props.accessibilityState?.disabled,
    ).toBe(true);
    act(() => t.unmount());
  });
});

/**
 * UNE SEULE CROIX POUR FERMER.
 *
 * Releve du patron : « la croix pour quitter la fenetre de contact du
 * service client ». Il y en avait DEUX, l'une sur l'autre, en haut a
 * droite : celle que la coquille pose pour TOUTES les feuilles, et une
 * seconde propre a cet ecran, ecrite avant que la coquille n'en ait une.
 *
 * Deux croix superposees, c'est un bouton qui parait double-clique, une
 * cible tactile qui se partage en deux, et un lecteur d'ecran qui annonce
 * « Fermer, Fermer ». Rien ne casse — et tout le monde voit que quelque
 * chose ne va pas.
 *
 * C'est la coquille qui garde la sienne : elle vaut pour toutes les
 * feuilles, elle est posee en absolu (elle ne pousse aucune mise en page),
 * et une feuille qui refabrique la sienne est une occasion de diverger.
 */
describe('la croix de la feuille de support', () => {
  it('n’apparaît qu’une fois', () => {
    const tree = monter();
    // On compte les CROIX, pas les noeuds qui les portent : un Pressable
    // etiquete se rend en plusieurs noeuds imbriques, et l'on compterait
    // trois fois la meme.
    expect(tree.root.findAllByType(CloseCross)).toHaveLength(1);
    act(() => tree.unmount());
  });

  it('et ferme bien la feuille', () => {
    const fermetures: number[] = [];
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <SupportSheet visible fermer={() => fermetures.push(1)} />,
      );
    });
    const croix = parLabel(tree, 'Fermer');
    expect(croix).toBeDefined();
    act(() => croix.props.onPress());
    expect(fermetures).toHaveLength(1);
    act(() => tree.unmount());
  });
});

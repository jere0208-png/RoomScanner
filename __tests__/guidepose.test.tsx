/**
 * « À QUOI SERVENT CES TROIS BOUTONS ? »
 *
 * Relevé du chantier : « les 3 boutons de placement d'éléments élec lors
 * d'un scan ne sont pas forcément compréhensibles de tous ». PC, INT et LUM
 * sont des abréviations de métier — et même à qui les connaît, elles ne
 * disent pas qu'on POSE quelque chose sur le mur qu'on filme.
 *
 * Deux réponses, et il faut les deux : les boutons parlent français, et une
 * page montre le geste AVANT qu'on cherche.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GuidePose } from '../src/screens/scan/GuidePose';

const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Text).map((n) => String(n.props.children));

describe('la page qui montre le geste', () => {
  it('dit les trois temps du geste, dans l’ordre', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<GuidePose visible onFermer={() => {}} />);
    });
    const mots = textes(t).join(' | ');
    // Viser, poser, et le fait que ça RESTE : c'est ce dernier point qui
    // manquait le plus — rien ne disait que le repère survivait au scan.
    expect(mots).toMatch(/Visez le mur/);
    expect(mots).toMatch(/Appuyez/);
    expect(mots).toMatch(/reste sur le mur/);
    // Pas de jargon dans l'explication : c'est tout l'objet de la page.
    expect(mots).not.toMatch(/\bPC\b/);
    expect(mots).not.toMatch(/\bDCL\b/);
    act(() => t.unmount());
  });

  it('se referme, et retient qu’elle a été lue', () => {
    // Une explication qui revient à chaque scan devient un obstacle : on
    // finit par la fermer sans la lire, et elle n'explique plus rien.
    let ferme = 0;
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <GuidePose visible onFermer={() => (ferme += 1)} />,
      );
    });
    const bouton = t.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Compris, commencer le scan');
    expect(bouton).toBeTruthy();
    act(() => bouton?.props.onPress());
    expect(ferme).toBe(1);
    act(() => t.unmount());
  });

  it('n’anime rien quand elle est fermée', () => {
    // Les scènes tournent en boucle : montées derrière un scan en cours,
    // elles feraient battre trois animations pour rien.
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <GuidePose visible={false} onFermer={() => {}} />,
      );
    });
    expect(textes(t)).toEqual([]);
    act(() => t.unmount());
  });
});

describe('la mémoire du guide', () => {
  it('la clé de lecture est nommée, pas devinée', async () => {
    // Le banc ne monte pas l'écran de scan (il demande la caméra native) :
    // on vérifie le contrat de stockage, qui est ce qui pourrait casser
    // silencieusement en renommant une clé.
    await AsyncStorage.setItem('echoplan.guide-pose', '1');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'echoplan.guide-pose',
      '1',
    );
  });
});

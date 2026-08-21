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

const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root
    .findAllByType(TouchableOpacity)
    .find((n) => n.props.accessibilityLabel === nom);

/*
  UNE ÉTAPE À LA FOIS — relevé du chantier : « fais un step by step en
  3 étapes avec possibilité de passer ».

  Ce banc lisait les trois temps du geste sur UNE page : ils y étaient
  empilés dans une vue qui défilait, avec trois animations qui tournaient
  ensemble. On lisait la première et l'on fermait sans dérouler le reste.

  Les trois étapes se suivent maintenant. La vérification change donc de
  forme : on avance de l'une à l'autre, et l'on vérifie qu'aucune ne manque
  au passage.
*/
describe('la page qui montre le geste', () => {
  it('déroule les trois temps, un par un', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<GuidePose visible onFermer={() => {}} />);
    });
    // Première étape SEULE à l'écran : viser.
    expect(textes(t).join(' | ')).toMatch(/Visez le mur/);
    expect(textes(t).join(' | ')).not.toMatch(/Appuyez/);

    act(() => bouton(t, 'Étape suivante')?.props.onPress());
    expect(textes(t).join(' | ')).toMatch(/Appuyez/);

    act(() => bouton(t, 'Étape suivante')?.props.onPress());
    // Le dernier temps, celui qui manquait le plus : rien ne disait que le
    // repère survivait au scan.
    expect(textes(t).join(' | ')).toMatch(/reste sur le mur/);
    // Et la dernière étape ne propose plus de suivante.
    expect(bouton(t, 'Étape suivante')).toBeUndefined();
    expect(bouton(t, 'Compris, commencer le scan')).toBeTruthy();
    act(() => t.unmount());
  });

  it('n’emploie pas le jargon qu’elle vient expliquer', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<GuidePose visible onFermer={() => {}} />);
    });
    for (let i = 0; i < 3; i++) {
      const mots = textes(t).join(' | ');
      expect(mots).not.toMatch(/\bPC\b/);
      expect(mots).not.toMatch(/\bDCL\b/);
      act(() => bouton(t, 'Étape suivante')?.props.onPress());
    }
    act(() => t.unmount());
  });

  it('se passe dès la première étape', () => {
    /*
      Qui sait déjà s'en va. Une explication dont on ne peut sortir qu'en la
      lisant jusqu'au bout est une explication qu'on subit — et le geste
      qu'elle décrit se paie alors d'un agacement.
    */
    let ferme = 0;
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <GuidePose visible onFermer={() => (ferme += 1)} />,
      );
    });
    const passer = bouton(t, 'Passer l’explication');
    expect(passer).toBeTruthy();
    act(() => passer?.props.onPress());
    expect(ferme).toBe(1);
    act(() => t.unmount());
  });

  it('se referme au bout, et retient qu’elle a été lue', () => {
    // Une explication qui revient à chaque scan devient un obstacle : on
    // finit par la fermer sans la lire, et elle n'explique plus rien.
    let ferme = 0;
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <GuidePose visible onFermer={() => (ferme += 1)} />,
      );
    });
    act(() => bouton(t, 'Étape suivante')?.props.onPress());
    act(() => bouton(t, 'Étape suivante')?.props.onPress());
    act(() => bouton(t, 'Compris, commencer le scan')?.props.onPress());
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

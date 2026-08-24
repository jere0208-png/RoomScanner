/**
 * ON NE QUITTE PAS UN PLAN MODIFIÉ SANS LE SAVOIR.
 *
 * Trouvé en simulant un utilisateur : on ouvre un plan enregistré, on ajoute
 * une chambre, on touche la flèche de retour — et tout est perdu, sans un
 * mot. L'en-tête affichait bien « Modifications non enregistrées », mais
 * personne ne relit l'en-tête au moment de sortir : on regarde le bouton
 * qu'on touche.
 *
 * Le brouillon des trente secondes ne rattrape pas ce cas-là : il ne se
 * relit qu'au REDÉMARRAGE de l'application, et l'on vient seulement de
 * revenir à la bibliothèque.
 *
 * La sortie demande donc confirmation, et propose d'abord ce que
 * l'utilisateur veut neuf fois sur dix : enregistrer. « Quitter sans
 * enregistrer » reste offert — on peut vouloir jeter un essai —, mais il
 * faut le dire.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Alert, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ResultScreen } from '../src/screens/ResultScreen';
import { useScanStore } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const st = () => useScanStore.getState();

/** Un plan enregistré, puis modifié : le cas qui coûte cher. */
const planModifie = () => {
  act(() => {
    st().commencerAuClavier();
    st().addRoomBox(5, 4, 'Séjour');
    st().commitCurrent();
    st().addRoomBox(3, 3, 'Chambre');
  });
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<ResultScreen />);
  });
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 700 } } });
      }
    }
    jest.advanceTimersByTime(600);
  });
  arbre = t;
  return t;
};

const retour = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll(
    (n) => n.props?.accessibilityLabel === 'Retour' && !!n.props?.onPress,
  )[0];

describe('quitter un plan modifié', () => {
  it('demande confirmation, et ne quitte pas tout seul', () => {
    /*
      LA QUESTION SE POSE DANS NOTRE FEUILLE, plus dans l'alerte du système.

      Relevé du patron, capture à l'appui : « la popup des modifications non
      enregistrées est trop basique, donne-lui notre identité ». Ce qui
      change est le SUPPORT, pas la règle — mêmes issues, même ordre, même
      silence quand il n'y a rien à perdre. Le banc lit donc les mots de la
      feuille au lieu des boutons de l'alerte.
    */
    const alerte = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const t = planModifie();
    expect(st().dirty).toBe(true);
    act(() => retour(t).props.onPress());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(alerte).not.toHaveBeenCalled();
    // L'écran n'a pas bougé : c'est la réponse qui décidera.
    expect(st().screen).toBe('result');
    const bouton = (mot: string) =>
      t.root
        .findAll(
          (n) =>
            typeof n.props?.onPress === 'function' &&
            n.findAllByType(Text).some((x) => String(x.props.children) === mot),
        )
        .pop();
    // Le premier choix ENREGISTRE : c'est ce qu'on veut neuf fois sur dix.
    expect(bouton('Enregistrer')).toBeDefined();
    act(() => bouton('Enregistrer')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(st().dirty).toBe(false);
    expect(st().saves[0].rooms).toHaveLength(2);
    alerte.mockRestore();
  });

  it('mais laisse partir sans rien dire quand tout est enregistré', () => {
    const alerte = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const t = planModifie();
    act(() => st().commitCurrent());
    act(() => retour(t).props.onPress());
    // Rien à perdre, donc rien à demander : une confirmation inutile est
    // une confirmation qu'on apprend à balayer sans lire.
    expect(alerte).not.toHaveBeenCalled();
    expect(st().screen).not.toBe('result');
    alerte.mockRestore();
  });
});

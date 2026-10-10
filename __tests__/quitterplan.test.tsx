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
import { Alert, View } from 'react-native';
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
  it('ne demande plus rien, et garde les modifications à côté du plan', () => {
    /*
      PLUS DE FENÊTRE EN PARTANT — relevé du patron : « on ne doit plus voir
      le message pop-up qui embête ». Les modifications d'un plan enregistré
      sont gardées à côté de lui (voir `ui/miseDeCote`) : le plan enregistré
      ne bouge pas, une pastille propose d'enregistrer, et rouvrir le plan
      les reprend.
    */
    const alerte = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const t = planModifie();
    expect(st().dirty).toBe(true);
    act(() => retour(t).props.onPress());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(alerte).not.toHaveBeenCalled();
    // On est parti, sans qu'on nous retienne.
    expect(st().screen).not.toBe('result');
    // Le plan enregistré n'a qu'une pièce ; la seconde attend à côté.
    expect(st().saves[0].rooms).toHaveLength(1);
    expect(st().saves[0].retouche?.plan.rooms).toHaveLength(2);
    // Et rouvrir le plan la reprend.
    act(() => st().openSave(st().saves[0].id));
    expect(st().rooms).toHaveLength(2);
    expect(st().dirty).toBe(true);
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

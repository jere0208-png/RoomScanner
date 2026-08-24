/**
 * OUVRIR UN AUTRE PLAN NE JETTE PAS CELUI QU'ON TIENT.
 *
 * Trouvé en enchaînant les écrans comme on le fait sur un chantier : on
 * rouvre un relevé, on ajoute un WC, on retourne à la bibliothèque prendre
 * un autre dossier — et le WC n'a jamais existé.
 *
 * C'est le même défaut que la flèche de retour, corrigé il y a peu, par un
 * autre chemin : le travail non enregistré se perdait en silence. Une
 * garde à un seul endroit ne suffit pas quand deux gestes mènent dehors.
 *
 * La bibliothèque pose donc la même question que la sortie du plan, avec
 * les mêmes issues et dans le même ordre : enregistrer d'abord, jeter
 * ensuite, rester enfin. Et elle ne demande rien quand il n'y a rien à
 * perdre — ni quand on rouvre le plan qu'on tient déjà.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('react-native-room-scan', () => ({
  RoomScan: { isSupported: jest.fn(async () => true), viewModel: jest.fn(async () => false) },
  scanEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  laserEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  RoomScanView: 'RoomScanView',
}));

import React from 'react';
import { Alert, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { LibraryScreen } from '../src/screens/LibraryScreen';
import { useScanStore } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const st = () => useScanStore.getState();
let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

/** Deux plans enregistrés, et le premier rouvert puis modifié. */
const deuxPlans = () => {
  act(() => {
    useScanStore.setState({ saves: [], currentSaveId: null, dirty: false });
    st().commencerAuClavier();
    st().addRoomBox(5, 4, 'Séjour');
    st().commitCurrent();
    // Deux noms DISTINCTS : par défaut ils portent la même date, et l'on
    // ne saurait pas lequel des deux on vise.
    st().renameCurrent('Chantier Dupont');
    st().commencerAuClavier();
    st().addRoomBox(3, 3, 'Chambre');
    st().commitCurrent();
    st().renameCurrent('Chantier Martin');
  });
  const [second, premier] = st().saves;
  act(() => {
    st().openSave(premier.id);
    st().addRoomBox(2, 2, 'WC');
    st().setScreen('library');
  });
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<LibraryScreen />);
  });
  arbre = t;
  return { t, premier, second };
};

const ligne = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root.findAll(
    (n) =>
      typeof n.props?.onPress === 'function' &&
      n.props?.accessibilityLabel === `Ouvrir ${nom}`,
  )[0];

describe('ouvrir un plan depuis la bibliothèque', () => {
  it('demande quoi faire du travail en cours', () => {
    /*
      LA QUESTION SE POSE DANS NOTRE FEUILLE, plus dans l'alerte du système.

      Relevé du patron, capture à l'appui : « la popup des modifications non
      enregistrées est trop basique, donne-lui notre identité ». Ce qui
      change est le SUPPORT, pas la règle — mêmes issues, même ordre, même
      silence quand il n'y a rien à perdre. Le banc lit donc les mots de la
      feuille au lieu des boutons de l'alerte.
    */
    const alerte = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { t, second } = deuxPlans();
    expect(st().dirty).toBe(true);
    const cible = ligne(t, second.name);
    expect(cible).toBeDefined();
    act(() => cible.props.onPress());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(alerte).not.toHaveBeenCalled();
    // Rien n'a bougé tant qu'on n'a pas répondu.
    expect(st().rooms.some((r) => r.name === 'WC')).toBe(true);
    const bouton = (mot: string) =>
      t.root
        .findAll(
          (n) =>
            typeof n.props?.onPress === 'function' &&
            n.findAllByType(Text).some((x) => String(x.props.children) === mot),
        )
        .pop();
    // « Enregistrer » garde le travail AVANT d'ouvrir l'autre.
    expect(bouton('Enregistrer')).toBeDefined();
    act(() => bouton('Enregistrer')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    const garde = st().saves.find((s) => s.rooms.some((r) => r.name === 'WC'));
    expect(garde).toBeDefined();
    alerte.mockRestore();
  });

  it('mais ouvre sans rien demander quand tout est enregistré', () => {
    const alerte = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { t, second } = deuxPlans();
    act(() => st().commitCurrent());
    act(() => ligne(t, second.name).props.onPress());
    expect(alerte).not.toHaveBeenCalled();
    expect(st().currentSaveId).toBe(second.id);
    alerte.mockRestore();
  });
});

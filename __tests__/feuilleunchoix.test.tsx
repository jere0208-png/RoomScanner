/**
 * UN SEUL CHOIX PAR OUVERTURE.
 *
 * Releve de la revue : pendant les 160 ms ou la feuille descend, un second
 * appui sur une autre ligne REMPLACAIT l'action choisie. On touchait
 * « Renommer », le doigt glissait sur « Supprimer », et c'est la
 * suppression qui partait. Le premier choix est le bon.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React, { useState } from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ActionSheet, type ActionData } from '../src/components/Sheet';
import { AlerteHote } from '../src/components/AlerteHote';
import { alerte, useAlerte } from '../src/ui/alerte';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());
beforeEach(() => useAlerte.setState({ courante: null, file: [], hotes: [] }));

const ligne = (t: TestRenderer.ReactTestRenderer, mot: string) =>
  t.root
    .findAll(
      (n) =>
        typeof n.props?.onPress === 'function' &&
        n.findAllByType(Text).some((x) => String(x.props.children) === mot),
    )
    .pop()!;

describe('la feuille de choix', () => {
  it('ignore un second appui pendant sa descente', () => {
    const fait: string[] = [];
    const donnees: ActionData = {
      title: 'Mur',
      actions: [
        { label: 'Renommer', onPress: () => fait.push('renommer') },
        { label: 'Supprimer', danger: true, onPress: () => fait.push('supprimer') },
      ],
    };
    let ouvrir!: () => void;
    function Banc() {
      const [data, setData] = useState<ActionData | null>(donnees);
      ouvrir = () => setData(donnees);
      return <ActionSheet data={data} onClose={() => setData(null)} />;
    }
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<Banc />);
    });
    const renommer = ligne(t, 'Renommer');
    const supprimer = ligne(t, 'Supprimer');
    act(() => renommer.props.onPress());
    act(() => supprimer.props.onPress());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(fait).toEqual(['renommer']);
    // Rouverte, elle accepte de nouveau un choix.
    act(() => ouvrir());
    act(() => ligne(t, 'Supprimer').props.onPress());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(fait).toEqual(['renommer', 'supprimer']);
    act(() => t.unmount());
  });

  /*
    LA FILE D'ALERTES EN PROFITE : la feuille de l'alerte se referme AVANT
    que la suivante n'arrive. Elle changeait de texte sans se fermer, et le
    geste de la premiere restait en suspens — puis le verrou ci-dessus
    l'aurait bloquee pour de bon.
  */
  it('deux alertes en file : chacune joue son geste, a son tour', () => {
    const fait: string[] = [];
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<AlerteHote />);
    });
    act(() => {
      alerte('Premier', undefined, [{ label: 'Un', onPress: () => fait.push('un') }]);
      alerte('Second', undefined, [{ label: 'Deux', onPress: () => fait.push('deux') }]);
    });
    act(() => ligne(t, 'Un').props.onPress());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(fait).toEqual(['un']);
    expect(useAlerte.getState().courante?.titre).toBe('Second');
    act(() => ligne(t, 'Deux').props.onPress());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(fait).toEqual(['un', 'deux']);
    expect(useAlerte.getState().courante).toBeNull();
    act(() => t.unmount());
  });
});

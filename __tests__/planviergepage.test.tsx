/**
 * LE PLAN VIERGE EN PAGE ENTIÈRE — relevé du patron : « un petit pop-up alors
 * que la page entière est dispo ; une belle page moderne avec les choix, sans
 * avoir besoin de scroller ; la maison de verre en icône ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
import React from 'react';
import { Image, ScrollView } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { PlanViergePage } from '../src/screens/result/PlanViergePage';
import { RoomChoice } from '../src/components/RoomChoice';
import { MODELES_DE_PIECE } from '../src/screens/result/AddRoomSheet';

describe('la page du plan vierge', () => {
  it('montre le titre et tous les gabarits, sans illustration ni défilement', () => {
    const choisi = jest.fn();
    const surMesure = jest.fn();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<PlanViergePage onChoose={choisi} onSurMesure={surMesure} />);
    });
    // L'illustration dépassait sous la barre d'état : retirée (relevé du patron).
    expect(t.root.findAllByType(Image)).toHaveLength(0);
    // Trois gabarits par rangée : tout tient sur un écran.
    expect(t.root.findByType(RoomChoice).props.compact).toBe(true);
    expect(t.root.findAllByType(ScrollView)).toHaveLength(0);
    for (const m of MODELES_DE_PIECE) {
      expect(t.root.findAll((n) => n.props.accessibilityLabel === m.nom && typeof n.props.onPress === 'function').length).toBeGreaterThan(0);
    }
    const chambre = t.root.findAll((n) => n.props.accessibilityLabel === 'Chambre' && typeof n.props.onPress === 'function')[0];
    act(() => chambre.props.onPress());
    expect(choisi).toHaveBeenCalledWith(expect.objectContaining({ nom: 'Chambre', largeur: 3.4 }));
    const libre = t.root.findAll((n) => n.props.accessibilityLabel === 'Sur mesure' && typeof n.props.onPress === 'function')[0];
    act(() => libre.props.onPress());
    expect(surMesure).toHaveBeenCalledTimes(1);
    act(() => t.unmount());
  });

});

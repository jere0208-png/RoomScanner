/**
 * LA FEUILLE DU TÉLÉMÈTRE.
 *
 * Deux choses s'y jouent, et rien d'autre : la radio ne vit QUE tant que la
 * feuille est ouverte, et une cote ne s'écrase JAMAIS sur un doute.
 *
 * Le télémètre ne sait pas quel mur on vise. Braqué sur la cloison d'en
 * face, il envoie une mesure parfaitement valable — qui remplacerait un
 * relevé juste par une cote prise ailleurs. C'est le seul geste de cet
 * écran qui coûte cher, et le seul qu'on protège.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { RoomScan, laserEvents } from 'react-native-room-scan';
import { LaserSheet } from '../src/screens/result/LaserSheet';

const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Text).map((n) => String(n.props.children));

const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root
    .findAllByType(TouchableOpacity)
    .find((n) => n.props.accessibilityLabel === nom);

/** Rejoue une mesure comme le natif l'enverrait. */
const mesurer = (metres: number) => {
  const appels = (laserEvents.addListener as jest.Mock).mock.calls;
  const ecoute = appels.find((a) => a[0] === 'onLaserMesure');
  act(() => ecoute?.[1]({ metres }));
};

beforeEach(() => {
  (laserEvents.addListener as jest.Mock).mockClear();
  (RoomScan.laserChercher as jest.Mock).mockClear();
  (RoomScan.laserArreter as jest.Mock).mockClear();
});

const monter = (cible: { nom: string; actuelle: number | null }, sur: (m: number) => void) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <LaserSheet
        visible
        cible={cible}
        onClose={() => {}}
        onAppliquer={sur}
      />,
    );
  });
  return t;
};

describe('la radio ne vit que le temps de la feuille', () => {
  it('cherche à l’ouverture, et coupe à la fermeture', () => {
    const t = monter({ nom: 'ce mur', actuelle: 3.42 }, () => {});
    expect(RoomScan.laserChercher).toHaveBeenCalled();
    expect(RoomScan.laserArreter).not.toHaveBeenCalled();
    act(() => t.unmount());
    // Sans cela, le Bluetooth resterait allumé pour un écran qui n'existe
    // plus — et l'électricien verrait sa batterie fondre sans comprendre.
    expect(RoomScan.laserArreter).toHaveBeenCalled();
  });
});

describe('la mesure qui arrive', () => {
  it('s’affiche au centimètre, pas au millimètre', () => {
    // Le laser donne le millimètre ; un plan de bâtiment se cote au
    // centimètre. Écrire 3,472 m promet une précision que la maçonnerie
    // n'a pas.
    const t = monter({ nom: 'ce mur', actuelle: 3.42 }, () => {});
    mesurer(3.4721);
    expect(textes(t).join(' | ')).toContain('3,47 m');
    act(() => t.unmount());
  });

  it('ignore une trame vide sans effacer ce qui est affiché', () => {
    const t = monter({ nom: 'ce mur', actuelle: 3.42 }, () => {});
    mesurer(3.44);
    mesurer(0);
    expect(textes(t).join(' | ')).toContain('3,44 m');
    act(() => t.unmount());
  });
});

describe('on n’écrase pas une cote sur un doute', () => {
  it('applique tout de suite quand la mesure confirme le scan', () => {
    let applique: number | null = null;
    const t = monter({ nom: 'ce mur', actuelle: 3.42 }, (m) => (applique = m));
    mesurer(3.44);
    act(() => bouton(t, 'Appliquer la mesure')?.props.onPress());
    expect(applique).toBe(3.44);
    act(() => t.unmount());
  });

  it('demande confirmation quand l’écart dit un autre mur', () => {
    let applique: number | null = null;
    const t = monter({ nom: 'ce mur', actuelle: 3.42 }, (m) => (applique = m));
    mesurer(2.1);
    // Premier appui : on avertit, on n'écrit rien.
    act(() => bouton(t, 'Appliquer la mesure')?.props.onPress());
    expect(applique).toBeNull();
    expect(textes(t).join(' | ')).toMatch(/Vérifiez ce que vous visez/);
    // Second appui : c'est un choix, on l'applique.
    act(() => bouton(t, 'Appliquer la mesure')?.props.onPress());
    expect(applique).toBe(2.1);
    act(() => t.unmount());
  });

  it('ne demande rien quand il n’y avait pas de cote de référence', () => {
    let applique: number | null = null;
    const t = monter({ nom: 'la hauteur', actuelle: null }, (m) => (applique = m));
    mesurer(2.48);
    act(() => bouton(t, 'Appliquer la mesure')?.props.onPress());
    expect(applique).toBe(2.48);
    act(() => t.unmount());
  });
});

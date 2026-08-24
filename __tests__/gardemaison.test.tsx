/**
 * NOS FENÊTRES, JUSQU'AUX CONFIRMATIONS.
 *
 * Relevé du patron, deux fois, capture à l'appui : « les modifications non
 * enregistrées, popup lorsqu'on quitte un plan sans enregistrement, est trop
 * basique. Donne-lui un design à ce bloc avec notre identité », puis, devant
 * « Abandonner les modifications ? » : « refonte de ce popup aussi dans
 * notre style ».
 *
 * L'app a ses fenêtres depuis longtemps — `ActionSheet` et `PromptSheet`,
 * feuilles du bas, notre typographie, nos rayons, nos icônes — et le fichier
 * qui les porte s'ouvre sur la raison : « `Alert.alert` et `Alert.prompt`
 * sont ceux d'iOS : police système, boutons bleus empilés, coins de 2019. Au
 * milieu d'une app qui a sa typographie, ils font tache. »
 *
 * Deux gardes étaient restées à l'alerte système, et ce sont justement les
 * deux qu'on voit le plus : celle qui protège le travail non enregistré (sur
 * TROIS chemins de sortie) et celle du mur qu'on referme sans garder.
 *
 * Ce banc tient la règle là où elle se vérifie : plus aucune alerte système
 * pour une CONFIRMATION. Les alertes d'échec — « Export impossible » — ne
 * sont pas concernées : elles ne demandent rien, elles annoncent.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ResultScreen } from '../src/screens/ResultScreen';
import { WallElevation } from '../src/components/WallElevation';
import { useScanStore } from '../src/store/scanStore';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';
import type { Fixture } from '../src/geometry/electrical';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  jest.restoreAllMocks();
});

const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string')
        .join(''),
    )
    .join(' | ');

describe('quitter un plan modifié', () => {
  function ecran() {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({
        screen: 'result',
        scanName: 'Chantier',
        walls: SNAPSHOT_WALLS,
        openings: SNAPSHOT_OPENINGS,
        objects: SNAPSHOT_OBJECTS,
        rooms: SNAPSHOT_ROOMS.map((r, i) => ({
          id: r.id,
          name: `Pièce ${i + 1}`,
          floor: null,
        })),
        fixtures: SNAPSHOT_FIXTURES,
        ceiling: [],
        photos: [],
        dirty: true,
      });
      t = TestRenderer.create(<ResultScreen />);
    });
    act(() => {
      for (const n of t.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
        }
      }
    });
    act(() => jest.advanceTimersByTime(400));
    arbre = t;
    return t;
  }

  it('demande dans NOTRE feuille, pas dans celle d’iOS', () => {
    const alerte = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const t = ecran();
    const retour = t.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Retour')!;
    act(() => retour.props.onPress());
    act(() => jest.advanceTimersByTime(400));
    expect(alerte).not.toHaveBeenCalled();
    const vu = mots(t);
    expect(vu).toMatch(/Modifications non enregistrées/);
    // Les trois issues, dans l'ordre : enregistrer d'abord.
    expect(vu).toMatch(/Enregistrer/);
    expect(vu).toMatch(/Quitter sans enregistrer/);
  });

  it('et n’ouvre rien quand il n’y a rien à perdre', () => {
    const alerte = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const t = ecran();
    act(() => {
      useScanStore.setState({ dirty: false });
    });
    const retour = t.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Retour')!;
    act(() => retour.props.onPress());
    act(() => jest.advanceTimersByTime(400));
    expect(alerte).not.toHaveBeenCalled();
    expect(mots(t)).not.toMatch(/Quitter sans enregistrer/);
  });
});

describe('refermer un mur sans garder', () => {
  const FX: Fixture[] = [
    { id: 'f1', kind: 'prise', wallId: 'n', along: 1.2, height: 0.25, side: 1 },
  ];

  it('demande dans NOTRE feuille aussi', () => {
    const alerte = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let t!: TestRenderer.ReactTestRenderer;
    const demandes: { title: string }[] = [];
    act(() => {
      useScanStore.setState({
        walls: SNAPSHOT_WALLS,
        openings: [],
        objects: [],
        rooms: [{ id: SNAPSHOT_ROOMS[0].id, name: 'Chambre', floor: null }],
        fixtures: FX,
        photos: [],
      });
      t = TestRenderer.create(
        <WallElevation
          wallId={SNAPSHOT_WALLS[0].id}
          selectedId="f1"
          onSelect={() => {}}
          onAddRequest={() => {}}
          onClose={() => {}}
          onDemander={(d) => demandes.push(d)}
        />,
      );
    });
    act(() => {
      const zone = t.root
        .findAllByType(View)
        .find((n) => typeof n.props.onLayout === 'function')!;
      zone.props.onLayout({ nativeEvent: { layout: { width: 390, height: 380 } } });
    });
    arbre = t;
    // On modifie quelque chose, puis on ferme sans garder.
    act(() => {
      useScanStore.getState().moveFixture('f1', 2, 0.25);
    });
    const croix = t.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Fermer sans garder')!;
    act(() => croix.props.onPress());
    expect(alerte).not.toHaveBeenCalled();
    expect(demandes).toHaveLength(1);
    expect(demandes[0].title).toMatch(/Abandonner/);
  });
});

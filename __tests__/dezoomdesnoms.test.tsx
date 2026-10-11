/**
 * AU DÉZOOM, LES NOMS ET LES « ×2 » SUIVENT LE PLAN.
 *
 * Relevé du patron : « au dézoom du plan 2D, les lumières restent bien en
 * place, mais le ×2 et les noms de pièces non ». Les points lumineux
 * rapetissaient déjà avec le plan (`rayonDuPointLumineux`) ; le cartouche
 * de la pièce gardait ses dix points et demi, et le symbole mural ne
 * descendait jamais sous cinq points et demi — avec son badge, qui avait en
 * plus ses propres planchers. Sur la vue d'ensemble, le nom d'une petite
 * pièce débordait sur ses murs et le « ×2 » couvrait le symbole voisin.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor, echelleDesNoms } from '../src/components/FloorplanEditor';
import { rayonDAppareil } from '../src/components/FixtureLayer';
import { useScanStore } from '../src/store/scanStore';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

describe('la règle', () => {
  it('le nom garde sa taille au cadrage d’ouverture et en zoomant', () => {
    expect(echelleDesNoms(1)).toBe(1);
    expect(echelleDesNoms(2.5)).toBe(1);
  });

  it('et rapetisse avec le plan au dézoom, sans devenir illisible', () => {
    expect(echelleDesNoms(0.6)).toBeCloseTo(0.6);
    expect(echelleDesNoms(0.2)).toBe(0.45);
  });

  it('le symbole mural suit l’échelle sous soixante pixels par mètre', () => {
    // Au-dessus : l'ancienne règle, inchangée.
    expect(rayonDAppareil(60)).toBeCloseTo(5.5);
    expect(rayonDAppareil(160)).toBe(10);
    // Au-dessous : à proportion, avec un plancher.
    expect(rayonDAppareil(30)).toBeCloseTo(2.75);
    expect(rayonDAppareil(5)).toBe(2.5);
  });
});

describe('sur le plan', () => {
  const monter = (zoom: number) => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.getState().commencerAuClavier();
      useScanStore.getState().addRoomRect({ x: 0, z: 0 }, { x: 4, z: 3 }, 'Chambre');
      const wallIds = useScanStore.getState().rooms[0].wallIds ?? [];
      useScanStore.setState({
        fixtures: [
          { id: 'p2', kind: 'prise2', wallId: wallIds[0], along: 1.5, height: 0.25, side: 1 },
        ],
        showSurfaces: true,
      });
    });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <FloorplanEditor
          showMeasures
          showFixtures
          selectedWallId={null}
          onSelectWall={() => {}}
          editable={false}
          vueInitiale={{ zoom, ox: 0, oy: 0, rot: 0 }}
        />,
      );
    });
    act(() => {
      const zone = t.root
        .findAllByType(View)
        .find((n) => typeof n.props.onLayout === 'function')!;
      zone.props.onLayout({ nativeEvent: { layout: { width: 390, height: 600 } } });
    });
    arbre = t;
    return t;
  };
  const taille = (t: TestRenderer.ReactTestRenderer, mot: string) => {
    const n = t.root.findAll(
      (x) => x.props.children === mot && typeof x.props.fontSize === 'number',
    );
    expect(n.length).toBeGreaterThan(0);
    return n[0].props.fontSize as number;
  };

  it('le nom de la pièce rapetisse au dézoom', () => {
    const plein = taille(monter(1), 'Chambre');
    act(() => arbre?.unmount());
    const demi = taille(monter(0.5), 'Chambre');
    expect(plein).toBeCloseTo(10.5);
    expect(demi).toBeCloseTo(10.5 * 0.5);
  });

  it('et le « ×2 » avec son symbole, sans plancher qui le garderait grand', () => {
    const plein = taille(monter(1), '×2');
    act(() => arbre?.unmount());
    const reduit = taille(monter(0.4), '×2');
    expect(reduit).toBeLessThan(plein * 0.75);
  });
});

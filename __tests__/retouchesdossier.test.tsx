/**
 * SIX RETOUCHES — la visite, le nord, « Décorer », le dossier PDF, les
 * symboles d'appareillage.
 *
 * Relevé du patron : « l'éclairage en visite agit trop sur les meubles,
 * cassant leurs couleurs. Enlève l'option "Nord", affiche-la que si elle a
 * été calculée lors du scan pour l'export PDF. L'option décorer, lorsqu'on
 * change de pièce, revient à la première pièce si on change de couleur […]
 * Améliore cette option pour voir en temps réel les changements avec une vue
 * 3D tournante. Donne la possibilité d'enlever les repères sur plan 3D lors
 * de la fiche d'export PDF. Sur plan PDF, enlève les icônes présentant les
 * portes, fenêtres et élévation. Change les icônes d'appareillage pour
 * légèrement plus petites et plus travaillées, moins intrusives : si 3 prises
 * en bloc de 3, mettre l'icône prise avec un "x3" en petit à côté. »
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DecorSheet } from '../src/components/DecorSheet';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
import { FIXTURE_SYMBOL, symboleCompact, type Fixture } from '../src/geometry/electrical';
import { buildScanPdf } from '../src/export/pdf';
import type { WallSeg } from '../src/geometry/floorplan';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

describe('la visite garde les couleurs des meubles', () => {
  it('des lampes plus douces, d’une lumière moins orangée, et une nuit moins noire', () => {
    const natif = lire('modules/react-native-room-scan/ios/RoomScanVisite.swift');
    expect(natif).toContain('let chaud = UIColor(red: 1.0, green: 0.91, blue: 0.79, alpha: 1)');
    // Chaque luminaire a sa teinte : le plafonnier est neutre, le spot blanc.
    expect(natif).toContain('intensite: 400, portee: 5.5, teinte: neutre');
    expect(natif).toContain('intensite: 380, portee: 4.5, teinte: blanc');
    expect(natif).not.toContain('intensite: 700');
    expect(natif).not.toContain('intensite: 720');
  });
});

describe('plus d’option « Nord » dans l’application', () => {
  it('ni dans les menus « Autres », ni en édition', () => {
    const barre = lire('src/screens/result/ResultToolbar.tsx');
    expect(barre).not.toContain("libelle: 'Points cardinaux'");
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).not.toContain('showNorth={showNorth || (editMode && !nordConnu)}');
    // Le dossier PDF, lui, garde sa rose des vents quand le scan a relevé le nord.
    expect(lire('src/export/pdf.ts')).toContain('north: scan.north ?? null');
  });
});

describe('« Décorer » reste sur la pièce, et la montre qui tourne', () => {
  beforeEach(() => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({
        screen: 'result',
        rooms: [
          { id: 'r1', name: 'Séjour', floor: null },
          { id: 'r2', name: 'Chambre', floor: null },
        ] as never,
        objects: [] as never,
      });
    });
  });
  const appuyer = (t: TestRenderer.ReactTestRenderer, label: string) => {
    const b = t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false })[0];
    expect([label, !!b]).toEqual([label, true]);
    act(() => b.props.onPress());
  };

  it('changer une couleur ne ramène plus à la première pièce', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<DecorSheet visible onClose={jest.fn()} pieceInitiale="r1" />);
    });
    appuyer(t, 'Chambre');
    appuyer(t, 'Murs : Vert sauge');
    appuyer(t, 'Sol : Noyer');
    const r2 = useScanStore.getState().rooms.find((r) => r.id === 'r2')!;
    expect(r2.peinture).toBe('sauge');
    expect(r2.sol).toBe('noyer');
    expect(useScanStore.getState().rooms.find((r) => r.id === 'r1')!.sol).toBeUndefined();
    const chambre = t.root.findAll((n) => n.props.accessibilityLabel === 'Chambre' && n.props.accessibilityState, { deep: false })[0];
    expect(chambre.props.accessibilityState).toEqual({ selected: true });
    act(() => t.unmount());
  });

  it('la pièce choisie tourne dans une vue 3D, au-dessus des teintes', () => {
    jest.useFakeTimers();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<DecorSheet visible onClose={jest.fn()} pieceInitiale="r2" />);
    });
    const vue = () => t.root.findAllByType(Iso3DView)[0];
    expect(vue()).toBeDefined();
    expect(vue().props.focusRoomId).toBe('r2');
    const avant = vue().props.value.theta;
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(vue().props.value.theta).not.toBe(avant);
    act(() => t.unmount());
    jest.useRealTimers();
  });
});

describe('le dossier PDF', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25, roomId: 'r1',
  });
  const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];
  const BAIES: WallSeg[] = [
    { ...mur('f1', 1, 0, 2.2, 0), type: 'window', height: 1.2, yCenter: 1.55 },
    { ...mur('p1', 0, 1, 0, 1.9), type: 'door', height: 2.04, yCenter: 1.02 },
  ];
  const PRISE3: Fixture = { id: 'x', kind: 'prise3', wallId: 'n', along: 3, height: 0.3, side: 1 } as Fixture;
  const dossier = (opts: object = {}, fixtures: Fixture[] = [PRISE3]) =>
    latin1(
      buildScanPdf(
        { name: 'Plan', walls: MURS, openings: BAIES, objects: [], rooms: [{ id: 'r1', wallIds: MURS.map((w) => w.id) }], roomNames: { r1: 'Séjour' }, fixtures },
        true,
        opts,
      ),
    );

  it('la légende ne présente plus les portes, les fenêtres ni les repères de mur', () => {
    const pdf = dossier({}, []);
    expect(pdf).not.toContain('(Repère de mur');
    expect(pdf).not.toContain('(PLAN)');
  });

  it('les repères de la 3D s’enlèvent du dossier', () => {
    expect(dossier({ reperes3D: false })).not.toBe(dossier({ reperes3D: true }));
    const ecran = lire('src/screens/ExportScreen.tsx');
    expect(ecran).toContain('accessibilityLabel="Repères sur la 3D"');
    expect(ecran).toContain('reperes3D,');
  });

  it('un bloc de trois prises : une prise et « ×3 »', () => {
    expect(dossier()).toContain('(×3)');
  });
});

describe('les symboles d’appareillage, compacts', () => {
  it('trois prises en bloc : UN symbole de prise, et « ×3 »', () => {
    const c = symboleCompact(['prise', 'prise', 'prise'], 'prise3');
    expect(c.fois).toBe(3);
    expect(c.symbole).toEqual(FIXTURE_SYMBOL.prise);
    expect(symboleCompact(['prise'], 'prise')).toEqual({ symbole: FIXTURE_SYMBOL.prise, fois: null });
  });

  it('un ensemble mêlé garde chaque nature une fois, et compte celle qui se répète', () => {
    const c = symboleCompact(['rj45', 'prise', 'prise'], 'rjPrise2');
    expect(c.fois).toBe(2);
    expect(c.symbole.length).toBe(FIXTURE_SYMBOL.rj45.length + FIXTURE_SYMBOL.prise.length);
  });

  it('le plan dessine le symbole compact, plus petit, et son badge', () => {
    const calque = lire('src/components/FixtureLayer.tsx');
    expect(calque).toContain('symboleCompact(postes, f.kind)');
    expect(calque).toContain('{`×${fois}`}');
    expect(calque).toContain('Math.min(10, 5.5 + (mapping.scale - 60) * 0.06)');
  });

  it('et rien n’est écrit tant qu’il n’y a qu’un poste', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<Text>{symboleCompact(['inter'], 'inter').fois ?? ''}</Text>);
    });
    expect(t.root.findByType(Text).props.children).toBe('');
    act(() => t.unmount());
  });
});

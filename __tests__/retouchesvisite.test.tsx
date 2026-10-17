/**
 * RETOUCHES : LA LUMIÈRE DE LA VISITE, LES RANGÉES DU TABLEAU, LES PIÈCES DE
 * LA VISITE ET LES POINTS LUMINEUX DU PLAN.
 *
 * Relevés du patron :
 *   — « diminue la lumière, son interrupteur allumé, dans la visite » — puis
 *     « supprime la possibilité d'éclairer la pièce en appuyant sur le bouton
 *     lors de la visite » : plus aucune lampe ne s'y allume ;
 *   — « un tableau de trois rangées doit pouvoir se réduire à deux en
 *     enlevant le rail vide, pas forcément le troisième : j'ai vidé le premier
 *     rail et je ne pouvais pas passer à deux rangées » ;
 *   — « lors de la visite, réduis les boutons de pièces, place-les plus
 *     intelligemment en gênant moins la visite, et donne une couleur à celui
 *     de la pièce où l'on se trouve » ;
 *   — « sur le plan 2D, les points lumineux (croix + rond) sont légèrement
 *     trop grands ; si on dézoome, ils doivent suivre le dézoom » ;
 *   — « les meubles et portes blancs sont trop blancs et font mal aux yeux ;
 *     réduis le blanc ».
 */
jest.mock('react-native-room-scan', () => ({
  RoomScan: { isSupported: jest.fn(async () => true), viewModel: jest.fn(async () => false) },
  scanEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  laserEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  RoomScanView: 'RoomScanView',
  RoomScanCanvas: 'RoomScanCanvas',
  RoomScanVisite: 'RoomScanVisite',
  poserCameraDeVisite: jest.fn(() => true),
  poserOrbiteDeMaquette: jest.fn(() => true),
  poserLeveeDeMaquette: jest.fn(() => true),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Exploration } from '../src/components/Exploration';
import { rayonDuPointLumineux } from '../src/components/CeilingLayer';
import {
  implanter,
  rangeeVideARetirer,
  sansLaRangee,
  type DepartExistant,
  type TableauExistant,
} from '../src/geometry/existant';
import { detectRooms, type WallSeg } from '../src/geometry/floorplan';
import { adoucirLeBlanc, maillageDesMeubles, TEINTES } from '../src/geometry/modeles3d';
import { ExistantSheet } from '../src/screens/result/ExistantSheet';
import { useScanStore } from '../src/store/scanStore';

const lire = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const dep = (id: string, organe: DepartExistant['organe'], rangee: number, calibre: number | null = 16): DepartExistant => ({
  id,
  organe,
  calibre,
  rangee,
});

// ------------------------------------------------------------ la lumière

describe('la lumière de la visite', () => {
  const natif = lire('modules', 'react-native-room-scan', 'ios', 'RoomScanVisite.swift');

  it('plus de lampe allumée : ni faisceau, ni halo, ni masque par pièce', () => {
    expect(natif).not.toMatch(/static func puissance|FORCE_DES_LAMPES|lumiereDeLaPiece/);
    expect(natif).not.toMatch(/SCNBillboardConstraint|matiereDuHalo|eclairage\.addChildNode/);
    expect(natif).not.toMatch(/masqueDeLaPiece|MASQUE_PIECE|MASQUE_MEUBLE/);
  });
});

// ------------------------------------------------------------ les rangées

describe('une rangée vide se retire, où qu’elle soit', () => {
  const PREMIERE_VIDE: TableauExistant = {
    rangees: 3,
    parRangee: 13,
    departs: [dep('id1', 'differentiel', 1, 40), dep('q1', 'disjoncteur', 1), dep('q2', 'disjoncteur', 2)],
  };

  it('la rangée vide la plus basse d’abord, sinon aucune', () => {
    expect(rangeeVideARetirer(implanter(PREMIERE_VIDE))).toBe(0);
    const derniere = { ...PREMIERE_VIDE, departs: [dep('a', 'disjoncteur', 0), dep('b', 'disjoncteur', 1)] };
    expect(rangeeVideARetirer(implanter(derniere))).toBe(2);
    const pleine = { ...derniere, departs: [...derniere.departs, dep('c', 'disjoncteur', 2)] };
    expect(rangeeVideARetirer(implanter(pleine))).toBeNull();
  });

  it('retirer la première : celles du dessous remontent d’un cran', () => {
    const apres = sansLaRangee(PREMIERE_VIDE, 0);
    expect(apres.rangees).toBe(2);
    expect(apres.departs.map((d) => [d.id, d.rangee])).toEqual([
      ['id1', 0],
      ['q1', 0],
      ['q2', 1],
    ]);
    // Une rangée garnie ne se retire jamais.
    expect(sansLaRangee(PREMIERE_VIDE, 1)).toBe(PREMIERE_VIDE);
  });

  it('dans la feuille : « une rangée de moins » retire le premier rail vidé', () => {
    jest.useFakeTimers();
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({ existant: PREMIERE_VIDE } as never);
    });
    const Feuille = () => {
      const existant = useScanStore((s) => s.existant);
      return (
        <ExistantSheet
          visible
          existant={existant}
          onClose={() => {}}
          onAjouter={(d) => useScanStore.getState().ajouterDepart(d)}
          onModifier={(id, c) => useScanStore.getState().modifierDepart(id, c)}
          onRetirer={(id) => useScanStore.getState().retirerDepart(id)}
          onDecrire={(t) => useScanStore.getState().decrireTableau(t)}
          onRetirerRangee={(k) => useScanStore.getState().retirerLaRangee(k)}
        />
      );
    };
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<Feuille />);
    });
    const moins = t.root.findAll(
      (n) => n.props.accessibilityLabel === 'Une rangée de moins' && typeof n.props.onPress === 'function',
    )[0];
    act(() => moins.props.onPress());
    const ex = useScanStore.getState().existant!;
    expect(ex.rangees).toBe(2);
    expect(ex.departs.map((d) => d.rangee)).toEqual([0, 0, 1]);
    // Plus aucune rangée vide : la suivante se refuse, et le dit.
    act(() => moins.props.onPress());
    expect(useScanStore.getState().existant!.rangees).toBe(2);
    const vu = t.root.findAllByType(Text).map((n) => [].concat(n.props.children).join('')).join(' | ');
    expect(vu).toMatch(/porte encore des organes/);
    act(() => t.unmount());
    jest.useRealTimers();
  });

  it('l’écran du plan branche le geste', () => {
    expect(lire('src', 'screens', 'ResultScreen.tsx')).toContain('onRetirerRangee={(k) => useScanStore.getState().retirerLaRangee(k)}');
  });
});

// ------------------------------------------------------------ les pièces

describe('les pièces de la visite', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
  });
  const MURS = [
    mur('n1', 0, 0, 6, 0),
    mur('n2', 6, 0, 9, 0),
    mur('e', 9, 0, 9, 4),
    mur('s2', 9, 4, 6, 4),
    mur('s1', 6, 4, 0, 4),
    mur('o', 0, 4, 0, 0),
    mur('c', 6, 0, 6, 4),
  ];
  const ROOMS = detectRooms(MURS).map((r, i) => {
    const xs = r.outline.map((p) => p.x);
    const grand = Math.max(...xs) - Math.min(...xs) > 4;
    return { id: `p${i}`, name: grand ? 'Séjour' : 'Chambre', wallIds: r.wallIds, floor: null };
  });

  it('petites, en colonne contre le bord droit, et celle où l’on est en couleur', () => {
    jest.useFakeTimers();
    act(() => {
      useScanStore.setState({
        walls: MURS,
        openings: [],
        objects: [],
        rooms: ROOMS as never,
        fixtures: [],
        ceiling: [],
        niveauCourant: 0,
      } as never);
    });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<Exploration visible onClose={() => {}} />);
    });
    act(() => {
      jest.advanceTimersByTime(50);
    });
    const bouton = (nom: string) =>
      t.root.findAll((n) => n.props?.accessibilityLabel === `Aller dans : ${nom}` && typeof n.props?.onPress === 'function')[0];
    const style = (nom: string) => {
      const s = bouton(nom).props.style;
      return StyleSheet.flatten(typeof s === 'function' ? s({ pressed: false }) : s);
    };

    // On entre au séjour : c'est lui qui est en couleur.
    expect(bouton('Séjour').props.accessibilityState).toEqual({ selected: true });
    expect(bouton('Chambre').props.accessibilityState).toEqual({ selected: false });
    expect(style('Séjour').backgroundColor).not.toEqual(style('Chambre').backgroundColor);
    // Petites : moins de trente points de haut.
    expect(style('Chambre').height).toBeLessThanOrEqual(28);

    // En colonne, contre le bord droit — plus de rangée en travers de la vue.
    const colonne = t.root.findAll((n) => n.props?.testID === 'pieces-de-la-visite')[0];
    const place = StyleSheet.flatten(colonne.props.style);
    expect(place.right).toBeDefined();
    expect(place.left).toBeUndefined();
    expect(colonne.props.horizontal).toBeFalsy();

    // On va dans la chambre : la couleur la suit.
    act(() => bouton('Chambre').props.onPress());
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(bouton('Chambre').props.accessibilityState).toEqual({ selected: true });
    expect(bouton('Séjour').props.accessibilityState).toEqual({ selected: false });
    act(() => t.unmount());
    jest.useRealTimers();
    expect(View).toBeDefined();
  });
});

// ------------------------------------------------------------ le plan 2D

describe('les points lumineux du plan', () => {
  it('suivent le zoom, et sont un peu plus petits qu’avant', () => {
    // Avant : neuf points au moins, quel que soit le zoom.
    expect(rayonDuPointLumineux(35)).toBeLessThan(9);
    expect(rayonDuPointLumineux(15)).toBeLessThan(rayonDuPointLumineux(35));
    expect(rayonDuPointLumineux(35)).toBeLessThan(rayonDuPointLumineux(55));
    // De très près, ils plafonnent sous l'ancien maximum (quinze).
    expect(rayonDuPointLumineux(400)).toBeLessThanOrEqual(11);
    // De très loin, ils restent visibles.
    expect(rayonDuPointLumineux(2)).toBeGreaterThan(2);
  });

  it('le plan et sa poignée les dessinent à cette taille', () => {
    expect(lire('src', 'components', 'CeilingLayer.tsx')).toContain('const r = rayonDuPointLumineux(mapping.scale);');
    expect(lire('src', 'components', 'FloorplanEditor.tsx')).not.toContain('Math.max(9, Math.min(15, mapping.scale * 0.14))');
  });
});

// ------------------------------------------------------------ le blanc

describe('le blanc des meubles et des portes', () => {
  const clarte = (hex: string) => Math.max(...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255));

  it('un blanc pur et une laque se tassent vers un blanc cassé, en gardant leur nuance', () => {
    expect(Math.max(...adoucirLeBlanc([1, 1, 1]))).toBeLessThanOrEqual(0.86);
    const laque = adoucirLeBlanc([0xf1 / 255, 0xf0 / 255, 0xec / 255]);
    expect(Math.max(...laque)).toBeLessThan(clarte(TEINTES.laque));
    expect(laque[0] / laque[2]).toBeCloseTo(0xf1 / 0xec, 6);
    // Ce qui est plus sombre ne bouge pas : un bois, un gris moyen.
    expect(adoucirLeBlanc([0.72, 0.6, 0.45])).toEqual([0.72, 0.6, 0.45]);
    expect(adoucirLeBlanc([0.5, 0.4, 0.3])).toEqual([0.5, 0.4, 0.3]);
  });

  it('ce qui part vers la 3D ne dépasse plus 86 % de clarté', () => {
    const src = lire('src', 'geometry', 'modeles3d.ts');
    expect(src).toContain('rgb: adoucirLeBlanc(composantesDe(couleur))');
    expect(typeof maillageDesMeubles).toBe('function');
  });
});

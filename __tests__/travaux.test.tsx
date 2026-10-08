/**
 * LES TRAVAUX — « ce qu'il faut acheter », tiré du relevé.
 *
 * Relevé du patron : « améliore l'app considérablement toujours avec l'idée
 * de plaire à tout le monde qui souhaite scanner son appartement sans y
 * connaître en élec ». Devant le plan de son salon, un particulier se
 * demande combien de pots, de paquets, de plinthes. Ce banc fait les comptes
 * à la main sur des pièces simples, et vérifie que l'app trouve les mêmes.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RoomPart, WallSeg } from '../src/geometry/floorplan';
import {
  HAUTEUR_PAR_DEFAUT,
  HYPOTHESES,
  achats,
  baiesDeLaPiece,
  nombre,
  travauxDesPieces,
} from '../src/geometry/travaux';
import { TravauxSheet } from '../src/components/TravauxSheet';
import { ResultScreen } from '../src/screens/ResultScreen';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';
import {
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

let n = 0;
const mur = (ax: number, az: number, bx: number, bz: number, height = 2.5): WallSeg => ({
  id: `m${n++}`,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height,
  yCenter: height / 2,
});
const baie = (type: 'door' | 'window' | 'opening', ax: number, az: number, bx: number, bz: number, height: number): WallSeg => ({
  id: `o${n++}`,
  type,
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height,
  yCenter: height / 2,
});
/** Une pièce rectangulaire, de (x0,z0) à (x1,z1). */
const piece = (id: string, x0: number, z0: number, x1: number, z1: number, height = 2.5): RoomPart => {
  const walls = [
    mur(x0, z0, x1, z0, height),
    mur(x1, z0, x1, z1, height),
    mur(x1, z1, x0, z1, height),
    mur(x0, z1, x0, z0, height),
  ];
  const pts = [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ];
  return {
    roomId: id,
    walls,
    surface: { pts, area: (x1 - x0) * (z1 - z0), exact: true },
    centroid: { x: (x0 + x1) / 2, z: (z0 + z1) / 2 },
    labelAt: { x: (x0 + x1) / 2, z: (z0 + z1) / 2 },
  };
};
const nom = (id: string) => id;

describe('le métré des travaux, pièce par pièce', () => {
  it('une chambre de 4 × 3, une porte et une fenêtre : les comptes à la main', () => {
    const ch = piece('chambre', 0, 0, 4, 3);
    const porte = baie('door', 1, 3, 1.9, 3, 2.1); // 0,90 × 2,10 sur le mur du bas
    const fenetre = baie('window', 1.4, 0, 2.6, 0, 1.25); // 1,20 × 1,25 sur le mur du haut
    const [p] = travauxDesPieces([ch], [porte, fenetre], nom);
    expect(p.sol).toBeCloseTo(12, 6);
    expect(p.plafond).toBeCloseTo(12, 6);
    expect(p.perimetre).toBeCloseTo(14, 6);
    // 14 × 2,5 = 35 m², moins 1,89 (porte) et 1,5 (fenêtre) = 31,61 → 31,6.
    expect(p.murs).toBeCloseTo(31.6, 6);
    // 14 m de tour, moins la porte (0,9) ; la fenêtre ne coupe pas la plinthe.
    expect(p.plinthes).toBeCloseTo(13.1, 6);
    expect(p.portes).toBe(1);
    expect(p.fenetres).toBe(1);
  });

  it('une porte entre deux pièces se déduit des deux côtés', () => {
    const a = piece('a', 0, 0, 3, 3);
    const b = piece('b', 3, 0, 6, 3);
    const porte = baie('door', 3, 1, 3, 1.8, 2); // sur la cloison commune
    const [pa, pb] = travauxDesPieces([a, b], [porte], nom);
    expect(pa.portes).toBe(1);
    expect(pb.portes).toBe(1);
    expect(pa.plinthes).toBeCloseTo(12 - 0.8, 6);
    expect(pb.plinthes).toBeCloseTo(12 - 0.8, 6);
  });

  it('une baie loin des murs d’une pièce ne la concerne pas', () => {
    const a = piece('a', 0, 0, 3, 3);
    expect(baiesDeLaPiece(a, [baie('door', 8, 8, 9, 8, 2)])).toHaveLength(0);
  });

  it('une baie ne se déduit jamais au-delà de la hauteur du mur', () => {
    const basse = piece('basse', 0, 0, 2, 2, 2);
    const [p] = travauxDesPieces([basse], [baie('opening', 0.5, 0, 1.5, 0, 3)], nom);
    // 8 × 2 = 16, moins 1 × 2 (et non 1 × 3).
    expect(p.murs).toBeCloseTo(14, 6);
  });

  it('sans hauteur relevée, 2,50 m ; sans contour, la pièce est laissée', () => {
    const sansHauteur = piece('h', 0, 0, 2, 2, 0);
    const [p] = travauxDesPieces([sansHauteur], [], nom);
    expect(p.hauteur).toBe(HAUTEUR_PAR_DEFAUT);
    const ouverte: RoomPart = { ...piece('o', 0, 0, 1, 1), surface: null };
    expect(travauxDesPieces([ouverte], [], nom)).toHaveLength(0);
  });
});

describe('ce qu’il faut acheter', () => {
  it('les quantités du chariot, arrondies au-dessus', () => {
    const [p] = travauxDesPieces(
      [piece('chambre', 0, 0, 4, 3)],
      [baie('door', 1, 3, 1.9, 3, 2.1), baie('window', 1.4, 0, 2.6, 0, 1.25)],
      nom,
    );
    const a = achats([p]);
    // 31,6 m² × 2 couches / 10 m²/L = 6,32 L → 3 pots de 2,5 L.
    expect(a.murs.litres).toBeCloseTo(6.3, 6);
    expect(a.murs.pots).toBe(3);
    // 12 m² × 2 / 10 = 2,4 L → 1 pot.
    expect(a.plafonds.pots).toBe(1);
    // 12 m² + 10 % = 13,2 m² → 7 paquets de 2 m².
    expect(a.sol.avecChute).toBeCloseTo(13.2, 6);
    expect(a.sol.paquets).toBe(7);
    // 13,1 m / 2,4 m = 5,46 → 6 barres.
    expect(a.plinthes.barres).toBe(6);
  });

  it('rien de choisi, rien à acheter — pas un pot fantôme', () => {
    const a = achats([]);
    expect([a.murs.pots, a.plafonds.pots, a.sol.paquets, a.plinthes.barres]).toEqual([0, 0, 0, 0]);
  });

  it('un compte juste ne prend pas un pot de trop', () => {
    // 12,5 m² × 2 / 10 = 2,5 L : un pot pile, pas deux.
    const p = { roomId: 'x', nom: 'x', sol: 0, plafond: 0, perimetre: 0, hauteur: 2.5, murs: 12.5, plinthes: 0, portes: 0, fenetres: 0 };
    expect(achats([p]).murs.pots).toBe(1);
  });

  it('les hypothèses sont celles du rayon', () => {
    expect(HYPOTHESES).toEqual({ couches: 2, rendement: 10, pot: 2.5, chute: 0.1, paquet: 2, barre: 2.4 });
    expect(nombre(12.0)).toBe('12');
    expect(nombre(13.25)).toBe('13,3');
  });
});

describe('la feuille', () => {
  let arbre: TestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => arbre?.unmount());
    arbre = null;
  });
  const pieces = travauxDesPieces([piece('Chambre', 0, 0, 4, 3), piece('Séjour', 4, 0, 9, 4)], [], nom);
  const textes = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAllByType(Text).map((x) => (Array.isArray(x.props.children) ? x.props.children.join('') : String(x.props.children)));

  it('quatre achats, les hypothèses écrites, une coche par pièce', () => {
    act(() => {
      arbre = TestRenderer.create(<TravauxSheet visible onClose={() => {}} pieces={pieces} />);
    });
    const vu = textes(arbre!).join(' | ');
    for (const mot of ['Peinture des murs', 'Peinture des plafonds', 'Revêtement de sol', 'Plinthes']) {
      expect(vu).toContain(mot);
    }
    expect(vu).toContain('Pour tout le logement.');
    expect(vu).toMatch(/2 couches à 10 m²\/L/);
    const coches = arbre!.root.findAll((x) => x.props?.accessibilityRole === 'checkbox' && typeof x.props?.onPress === 'function');
    expect(coches.map((x) => x.props.accessibilityLabel)).toEqual(['Chambre', 'Séjour']);
  });

  it('décocher une pièce refait les comptes', () => {
    act(() => {
      arbre = TestRenderer.create(<TravauxSheet visible onClose={() => {}} pieces={pieces} />);
    });
    const avant = textes(arbre!).find((x) => /m², chute comprise/.test(x));
    const sejour = arbre!.root.findAll((x) => x.props?.accessibilityLabel === 'Séjour' && typeof x.props?.onPress === 'function')[0];
    act(() => sejour.props.onPress());
    const apres = textes(arbre!).find((x) => /m², chute comprise/.test(x));
    expect(apres).not.toBe(avant);
    // 12 m² + 10 % : la chambre seule.
    expect(apres).toBe('13,2 m², chute comprise');
    expect(textes(arbre!).join(' | ')).toContain('Pour 1 pièce sur 2.');
  });
});

describe('dans l’écran du plan', () => {
  let arbre: TestRenderer.ReactTestRenderer | null = null;
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());
  afterEach(() => {
    act(() => arbre?.unmount());
    arbre = null;
    act(() => useUsage.setState({ modeElec: true, choisi: true }));
  });

  const monter = (modeElec: boolean) => {
    act(() => {
      useUsage.setState({ charge: true, modeElec, choisi: true });
      useScanStore.getState().reset();
      useScanStore.setState({
        screen: 'result',
        scanName: 'Appartement',
        walls: SNAPSHOT_WALLS,
        openings: SNAPSHOT_OPENINGS,
        objects: SNAPSHOT_OBJECTS,
        rooms: SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: `Pièce ${i + 1}`, floor: null, wallIds: r.wallIds })),
        fixtures: [],
        ceiling: [],
        photos: [],
      });
      arbre = TestRenderer.create(<ResultScreen />);
    });
    act(() => {
      for (const v of arbre!.root.findAllByType(View)) {
        if (typeof v.props.onLayout === 'function') {
          v.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
        }
      }
    });
    act(() => jest.advanceTimersByTime(400));
    return arbre!;
  };
  const pastille = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAllByType(TouchableOpacity).find((x) => x.props.accessibilityLabel === 'Travaux');

  it('le grand public a sa pastille « Travaux », qui ouvre la feuille avec ses pièces', () => {
    const t = monter(false);
    const p = pastille(t);
    expect(p).toBeDefined();
    expect(t.root.findAllByType(TravauxSheet)[0].props.visible).toBe(false);
    act(() => p!.props.onPress());
    const feuille = t.root.findAllByType(TravauxSheet)[0];
    expect(feuille.props.visible).toBe(true);
    expect(feuille.props.pieces.length).toBeGreaterThan(0);
  });

  it('l’électricien garde son prix et son contrôle à cette place', () => {
    const t = monter(true);
    expect(pastille(t)).toBeUndefined();
  });

  it('et tout le monde la trouve en tête du menu « Plus »', () => {
    const src = readFileSync(join(__dirname, '..', 'src/screens/ResultScreen.tsx'), 'utf8');
    const a = src.indexOf('actions: [', src.indexOf('title: scanName'));
    const premier = src.slice(a, src.indexOf('label:', a) + 60);
    expect(premier).toContain('Ce qu’il faut acheter');
  });
});

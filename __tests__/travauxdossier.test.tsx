/**
 * LES PIÈCES DÉCOCHÉES DANS « TRAVAUX » RESTENT HORS DU DOSSIER.
 *
 * Correctif de l'audit « dans la peau d'un utilisateur » : on décochait la
 * cuisine dans « Ce qu'il faut acheter », et le dossier PDF comptait quand
 * même sa peinture et son sol. La coche vit avec les réglages du calcul
 * (`reglagesTravaux`) : la feuille, le dossier et le tableur la lisent.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ExportScreen } from '../src/screens/ExportScreen';
import { useScanStore } from '../src/store/scanStore';
import { useReglagesTravaux } from '../src/store/reglagesTravaux';
import { useUsage } from '../src/store/usage';
import { appartementExemple } from '../src/data/exemple';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  useReglagesTravaux.setState({ horsTravaux: [] });
  useUsage.setState({ modeElec: true });
});

/** Les pièces que le dossier compte dans « Ce qu'il faut acheter ». */
function piecesDuDossier(): string[] {
  const pdf = require('../src/export/pdf');
  const espion = jest.spyOn(pdf, 'buildScanPdf');
  espion.mockClear();
  const ex = appartementExemple();
  act(() => {
    useScanStore.setState({
      screen: 'export',
      scanName: 'Appartement',
      walls: ex.walls,
      openings: ex.openings,
      objects: ex.objects,
      rooms: ex.rooms,
      fixtures: [],
      ceiling: [],
      photos: [],
    });
    arbre = TestRenderer.create(<ExportScreen />);
  });
  act(() => {
    for (const n of arbre!.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
      }
    }
  });
  act(() => {
    jest.advanceTimersByTime(1200);
  });
  const appels = espion.mock.calls;
  espion.mockRestore();
  expect(appels.length).toBeGreaterThan(0);
  const opts = appels[appels.length - 1][2] as { achats?: { pieces: { roomId: string }[] } | null };
  return (opts.achats?.pieces ?? []).map((p) => p.roomId);
}

describe('le décor de « Décorer » arrive aux achats du dossier', () => {
  it('la peinture choisie d’une pièce se compte à sa teinte', () => {
    useUsage.setState({ modeElec: false });
    const pdf = require('../src/export/pdf');
    const espion = jest.spyOn(pdf, 'buildScanPdf');
    espion.mockClear();
    const ex = appartementExemple();
    const peinte = ex.rooms[0].id;
    act(() => {
      useScanStore.setState({
        screen: 'export',
        scanName: 'Appartement',
        walls: ex.walls,
        openings: ex.openings,
        objects: ex.objects,
        rooms: ex.rooms.map((r) => (r.id === peinte ? { ...r, peinture: 'sauge' } : r)),
        fixtures: [],
        ceiling: [],
        photos: [],
      });
      arbre = TestRenderer.create(<ExportScreen />);
    });
    act(() => {
      for (const n of arbre!.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
        }
      }
    });
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    const appels = espion.mock.calls;
    espion.mockRestore();
    const opts = appels[appels.length - 1][2] as {
      achats: { pieces: { roomId: string; teintes?: { cle: string }[] }[] };
    };
    const piece = opts.achats.pieces.find((p) => p.roomId === peinte)!;
    expect(piece.teintes?.map((t) => t.cle)).toEqual(['sauge']);
  });

  it('et l’écran du plan passe le même décor à « Travaux » et au tableur', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const src: string = readFileSync(join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'), 'utf8');
    const appel = src.slice(src.indexOf('travauxDesPieces('), src.indexOf('travauxDesPieces(') + 400);
    expect(appel).toMatch(/\(id\) => rooms\.find\(\(r\) => r\.id === id\)/);
  });
});

describe('le dossier du particulier', () => {
  it('compte toutes les pièces quand rien n’est décoché', () => {
    useUsage.setState({ modeElec: false });
    const toutes = piecesDuDossier();
    expect(toutes.length).toBeGreaterThanOrEqual(3);
  });

  it('et laisse dehors celle qu’on a décochée', () => {
    useUsage.setState({ modeElec: false });
    const toutes = piecesDuDossier();
    act(() => arbre?.unmount());
    arbre = null;
    useReglagesTravaux.setState({ horsTravaux: [toutes[0]] });
    const retenues = piecesDuDossier();
    expect(retenues).not.toContain(toutes[0]);
    expect(retenues).toHaveLength(toutes.length - 1);
  });
});

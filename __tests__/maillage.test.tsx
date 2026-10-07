/**
 * LE MAILLAGE LIDAR, RELEVÉ — première étape vers les coffres, les retours
 * et les épaisseurs que RoomPlan lisse.
 *
 * Relevé du patron : « lent pour vraiment comprendre la structure des parois,
 * ne forme pas les angles des retours de volets roulants ». RoomPlan rend
 * des plans ; ARKit tient la vraie surface, classée. On ne bâtit pas une
 * détection sur une pièce imaginée : il faut des maillages RÉELS, rejoués au
 * banc. Ce banc tient ce qui rend ces maillages exploitables ici :
 *
 *   — le format se relit exactement (sommets, faces, classes, par ancre) ;
 *   — le natif lit les ancres AVANT d'arrêter la session (après, il n'y a
 *     plus d'image courante), passe les sommets dans le monde, sort les
 *     indices sur quatre octets et ne garde qu'un fichier ;
 *   — la fin d'un scan note le maillage avec sa dépense, et le Diagnostic
 *     le décrit et le partage.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text } from 'react-native';
import { RoomScan } from 'react-native-room-scan';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JournalSheet } from '../src/components/JournalSheet';
import { usePannes } from '../src/ui/journalPannes';
import {
  CLASSES,
  ecrireMaillage,
  lireMaillage,
  phraseMaillage,
  type AncreDeMaillage,
} from '../src/geometry/maillage';

const racine = join(__dirname, '..');
const natif = (f: string) => readFileSync(join(racine, 'modules/react-native-room-scan/ios', f), 'utf8');

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  jest.restoreAllMocks();
  act(() => usePannes.setState({ dernierScan: null }));
});

describe('le format se relit exactement', () => {
  const ancre = (n: number, classe: boolean): AncreDeMaillage => {
    const sommets = new Float32Array(n * 3);
    for (let i = 0; i < sommets.length; i++) sommets[i] = Math.sin(i) * 3.5;
    const faces = new Uint32Array((n - 2) * 3);
    for (let i = 0; i + 2 < n; i++) {
      faces[i * 3] = 0;
      faces[i * 3 + 1] = i + 1;
      faces[i * 3 + 2] = i + 2;
    }
    const classes = classe ? new Uint8Array(n - 2).map((_, i) => i % CLASSES.length) : null;
    return { sommets, faces, classes };
  };

  it('deux ancres, l’une classée, l’autre non : tout revient', () => {
    const a = ancre(9, true);
    const b = ancre(5, false);
    const m = lireMaillage(ecrireMaillage([a, b]));
    expect(m.ancres).toHaveLength(2);
    expect(m.sommets).toBe(14);
    expect(m.faces).toBe(7 + 3);
    expect(m.classe).toBe(true);
    expect(Array.from(m.ancres[0].sommets)).toEqual(Array.from(a.sommets));
    expect(Array.from(m.ancres[0].faces)).toEqual(Array.from(a.faces));
    expect(Array.from(m.ancres[0].classes!)).toEqual(Array.from(a.classes!));
    expect(m.ancres[1].classes).toBeNull();
    expect(Array.from(m.ancres[1].faces)).toEqual(Array.from(b.faces));
  });

  it('refuse ce qui n’est pas un maillage EchoPlan', () => {
    expect(() => lireMaillage(new Uint8Array([1, 2, 3, 4, 0, 0, 0, 0]))).toThrow(/maillage/);
  });

  it('les classes d’ARKit, dans son ordre : mur en 1, sol en 2, plafond en 3', () => {
    expect(CLASSES[1]).toBe('mur');
    expect(CLASSES[2]).toBe('sol');
    expect(CLASSES[3]).toBe('plafond');
    expect(CLASSES[6]).toBe('fenêtre');
    expect(CLASSES[7]).toBe('porte');
  });
});

describe('le natif', () => {
  const m = natif('RoomScanMaillage.swift');
  const g = natif('RoomScanManager.swift');

  it('lit les ancres de maillage, dans le monde, et les classes', () => {
    expect(m).toContain('ARMeshAnchor');
    expect(m).toContain('ancre.transform');
    expect(m).toContain('g.classification');
    expect(m).toContain('"EPM1"');
    // Les indices sortent toujours sur quatre octets, quoi qu'ARKit ait choisi.
    expect(m).toContain('bytesPerIndex == 4');
    expect(m).toContain('UInt16.self');
  });

  it('AVANT d’arrêter la session, et un seul fichier gardé', () => {
    const stop = g.slice(g.indexOf('func stop(resolve:'), g.indexOf('private func clearPromise'));
    expect(stop.indexOf('RoomScanMaillage.relever')).toBeGreaterThan(0);
    expect(stop.indexOf('RoomScanMaillage.relever')).toBeLessThan(stop.indexOf('captureSession.stop()'));
    expect(m).toContain('hasPrefix("maillage-")');
    expect(m).toContain('removeItem');
    expect(g).toContain('payload["maillage"]');
  });
});

describe('le Diagnostic', () => {
  it('décrit le maillage et le partage', () => {
    act(() =>
      usePannes.getState().noterScan(
        { secondes: 90, batterie: 2, thermique: 'frais' },
        { ancres: 38, faces: 312000, sommets: 160000, classe: true, fichier: '/docs/maillage-x.bin', octets: 7_200_000 },
      ),
    );
    let j!: TestRenderer.ReactTestRenderer;
    act(() => {
      j = TestRenderer.create(<JournalSheet visible fermer={() => {}} />);
    });
    arbre = j;
    const textes = j.root.findAllByType(Text).map((n) => String(n.props.children));
    expect(textes.some((x) => x.includes('38 ancres') && x.includes('312 000 faces') && x.includes('classé') && x.includes('7,2 Mo'))).toBe(true);
    const bouton = j.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Partager le maillage' && typeof n.props?.onPress === 'function',
    )[0];
    expect(bouton).toBeDefined();
    act(() => bouton.props.onPress());
    expect(RoomScan.shareFile).toHaveBeenCalledWith('/docs/maillage-x.bin');
  });

  it('sans fichier, pas de bouton ; sans ancre, il le dit', () => {
    expect(phraseMaillage({ ancres: 0, faces: 0, sommets: 0, classe: false })).toMatch(/aucun maillage/);
    act(() =>
      usePannes.getState().noterScan(
        { secondes: 90 },
        { ancres: 0, faces: 0, sommets: 0, classe: false },
      ),
    );
    let j!: TestRenderer.ReactTestRenderer;
    act(() => {
      j = TestRenderer.create(<JournalSheet visible fermer={() => {}} />);
    });
    arbre = j;
    expect(j.root.findAll((n) => n.props?.accessibilityLabel === 'Partager le maillage')).toHaveLength(0);
  });
});

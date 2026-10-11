/**
 * LE SYMBOLE REGARDE SON MUR, ET SON FILET S'ARRÊTE AVANT LUI.
 *
 * Relevé du patron : « les icônes du plan 2D doivent être positionnées
 * selon leur place dans le plan, tournées de façon à comprendre sur quel
 * mur elles se posent — sur un mur à 90°, une prise doit être aussi à 90°.
 * Aussi, le trait rouge ne doit pas traverser l'icône mais s'arrêter 1 px
 * avant. »
 *
 * L'écran tournait déjà ses symboles ; le dossier PDF les posait tous
 * droits — la tige vers le bas de la feuille, donc à l'envers sur le mur du
 * haut et en travers sur les murs de côté. Et partout, le filet qui relie
 * le symbole à son mur filait jusqu'au CENTRE du symbole : il le barrait.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { View } from 'react-native';
import { G, Line } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import {
  FIXTURE_SYMBOL,
  filetJusquAuSymbole,
  porteeVersLeMur,
  symbolePose,
} from '../src/geometry/electrical';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';

describe('la portée d’un symbole vers son mur', () => {
  it('est le bout de sa tige, dans son repère', () => {
    // Le socle : sa tige descend jusqu'à y = 10.
    expect(porteeVersLeMur(FIXTURE_SYMBOL.prise)).toBeCloseTo(10);
    // L'interrupteur : le point du mur, centré à 8, de rayon 2,4.
    expect(porteeVersLeMur(FIXTURE_SYMBOL.inter)).toBeCloseTo(10.4);
  });
});

describe('le filet s’arrête avant le symbole', () => {
  it('au bout de la tige, plus le jeu demandé', () => {
    const { versLeMur, bout } = filetJusquAuSymbole(
      { x: 0, y: 0 },
      { x: 0, y: 20 },
      FIXTURE_SYMBOL.prise,
      0.5,
      1.5,
    );
    expect(versLeMur.x).toBeCloseTo(0);
    expect(versLeMur.y).toBeCloseTo(-1);
    // Tige de 10 × 0,5 = 5, plus 1,5 de jeu : le filet finit à 6,5 du centre.
    expect(bout!.x).toBeCloseTo(0);
    expect(bout!.y).toBeCloseTo(13.5);
  });

  it('et ne se trace pas quand le symbole touche déjà son mur', () => {
    const { bout } = filetJusquAuSymbole({ x: 0, y: 0 }, { x: 0, y: 4 }, FIXTURE_SYMBOL.prise, 0.5, 1.5);
    expect(bout).toBeNull();
  });
});

describe('dans le dossier, le symbole tourne vers son mur', () => {
  // Le bout de la tige d'un socle, posé en (100, 100) à l'échelle 0,5.
  const boutDeTige = (versLeMur: { x: number; y: number }) => {
    const traits = symbolePose(FIXTURE_SYMBOL.prise, 100, 100, 0.5, versLeMur);
    // La tige : le trait « M0 2 V10 », le troisième du socle.
    return traits[2].pts[1];
  };

  it('droit par défaut : la tige vers le bas de la feuille (y du PDF vers le haut)', () => {
    const p = boutDeTige({ x: 0, y: -1 });
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(95);
  });

  it('mur du haut : la tige monte', () => {
    const p = boutDeTige({ x: 0, y: 1 });
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(105);
  });

  it('mur de droite : la tige part à droite — le symbole a tourné d’un quart de tour', () => {
    const p = boutDeTige({ x: 1, y: 0 });
    expect(p.x).toBeCloseTo(105);
    expect(p.y).toBeCloseTo(100);
    // Et le diamètre du socle, horizontal quand il est droit, est vertical.
    const diametre = symbolePose(FIXTURE_SYMBOL.prise, 100, 100, 0.5, { x: 1, y: 0 })[0].pts;
    expect(diametre[0].x).toBeCloseTo(diametre[1].x);
  });

  it('et le plan du dossier s’en sert, filet compris', () => {
    const pdf = readFileSync(join(__dirname, '..', 'src', 'export', 'pdf.ts'), 'utf8');
    expect(pdf).toContain('filetJusquAuSymbole(anchor, q, symbole, ECHELLE_SYMBOLE');
    expect(pdf).toContain('drawSymbol(d, symbole, q.x, q.y, ECHELLE_SYMBOLE, ENCRE_ELEC, 0.9, versLeMur)');
  });
});

describe('à l’écran, le filet ne barre plus le symbole', () => {
  let arbre: TestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => arbre?.unmount());
    arbre = null;
  });

  it('il s’arrête avant la tige, sur la ligne qui mène au centre', () => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.getState().commencerAuClavier();
      useScanStore.getState().addRoomRect({ x: 0, z: 0 }, { x: 4, z: 3 }, 'Chambre');
      const wallIds = useScanStore.getState().rooms[0].wallIds ?? [];
      useScanStore.setState({
        fixtures: wallIds.map((w, i) => ({
          id: `p${i}`,
          kind: 'prise' as const,
          wallId: w,
          along: 1.2,
          height: 0.25,
          side: 1 as const,
        })),
      });
    });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <FloorplanEditor editable={false} showMeasures showFixtures selectedWallId={null} onSelectWall={() => {}} />,
      );
    });
    act(() => {
      const zone = t.root.findAllByType(View).find((n) => typeof n.props.onLayout === 'function')!;
      zone.props.onLayout({ nativeEvent: { layout: { width: 390, height: 600 } } });
    });
    arbre = t;
    const appareils = t.root.findAll(
      (n) => n.type === G && typeof n.props.accessibilityLabel === 'string'
        && n.findAll((m) => m.type === G && /rotate\(/.test(String(m.props.transform ?? ''))).length === 1,
    );
    expect(appareils.length).toBe(4);
    for (const a of appareils) {
      const tour = a.findAll((m) => m.type === G && /rotate\(/.test(String(m.props.transform ?? '')))[0];
      const [, cx, cy, , sc] = String(tour.props.transform).match(
        /translate\(([-\d.e]+), ([-\d.e]+)\) rotate\(([-\d.e]+)\) scale\(([-\d.e]+)\)/,
      )!;
      const centre = { x: Number(cx), y: Number(cy) };
      const filet = a.findAllByType(Line)[0];
      const fin = { x: filet.props.x2, y: filet.props.y2 };
      const debut = { x: filet.props.x1, y: filet.props.y1 };
      // Le filet finit hors du symbole : au-delà de sa tige et de son trait.
      const s = Number(sc);
      expect(Math.hypot(fin.x - centre.x, fin.y - centre.y)).toBeGreaterThanOrEqual((10 + 0.7) * s + 1 - 1e-6);
      // Et toujours sur la ligne du mur au centre : il ne change pas de cap.
      const v1 = { x: centre.x - debut.x, y: centre.y - debut.y };
      const v2 = { x: fin.x - debut.x, y: fin.y - debut.y };
      expect(Math.abs(v1.x * v2.y - v1.y * v2.x)).toBeLessThan(1e-6 * Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) + 1e-9);
    }
  });
});

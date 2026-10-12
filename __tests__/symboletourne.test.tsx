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
    // L'interrupteur : son rond creux, centré à 7,6, de rayon 2,4.
    expect(porteeVersLeMur(FIXTURE_SYMBOL.inter)).toBeCloseTo(10);
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
  // Les pointes de l'arc d'un socle — contre le mur — et le bout de sa tige
  // — vers la pièce —, posé en (100, 100) à l'échelle 0,5.
  const pose = (versLeMur: { x: number; y: number }) => {
    const [arc, tige] = symbolePose(FIXTURE_SYMBOL.prise, 100, 100, 0.5, versLeMur);
    return { pointes: [arc.pts[0], arc.pts[arc.pts.length - 1]], bout: tige.pts[1] };
  };

  it('droit par défaut : l’arc vers le bas de la feuille (y du PDF vers le haut), la tige vers la pièce', () => {
    const { pointes, bout } = pose({ x: 0, y: -1 });
    for (const p of pointes) expect(p.y).toBeCloseTo(95);
    expect(bout.x).toBeCloseTo(100);
    expect(bout.y).toBeCloseTo(101.5);
  });

  it('mur du haut : l’arc monte', () => {
    const { pointes, bout } = pose({ x: 0, y: 1 });
    for (const p of pointes) expect(p.y).toBeCloseTo(105);
    expect(bout.y).toBeCloseTo(98.5);
  });

  it('mur de droite : l’arc part à droite — le symbole a tourné d’un quart de tour', () => {
    const { pointes, bout } = pose({ x: 1, y: 0 });
    // Les deux pointes contre le mur : à la même abscisse.
    for (const p of pointes) expect(p.x).toBeCloseTo(105);
    expect(bout.x).toBeCloseTo(98.5);
    expect(bout.y).toBeCloseTo(100);
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

  it('le premier appareil touche son mur : plus de filet ; le suivant garde le sien, arrêté avant lui', () => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.getState().commencerAuClavier();
      useScanStore.getState().addRoomRect({ x: 0, z: 0 }, { x: 4, z: 3 }, 'Chambre');
      const wallIds = useScanStore.getState().rooms[0].wallIds ?? [];
      useScanStore.setState({
        // Sur chaque mur, deux appareils au même point : le second s'échelonne.
        fixtures: wallIds.flatMap((w, i) => [
          { id: `p${i}`, kind: 'prise' as const, wallId: w, along: 1.2, height: 0.25, side: 1 as const },
          { id: `q${i}`, kind: 'prise' as const, wallId: w, along: 1.2, height: 1.1, side: 1 as const },
        ]),
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
    expect(appareils.length).toBe(8);
    // Contre le mur, comme sur un plan d'architecte : rien entre lui et le nu.
    expect(appareils.filter((a) => a.findAllByType(Line).length === 0)).toHaveLength(4);
    for (const a of appareils.filter((x) => x.findAllByType(Line).length > 0)) {
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

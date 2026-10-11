/**
 * LE DÉCOR SE VOIT SUR LE PLAN 2D.
 *
 * Correctif de l'audit « dans la peau d'un utilisateur » : le décor choisi
 * dans « Décorer » était invisible sur le plan 2D. Peindre un mur depuis la
 * 2D ne changeait rien à l'écran. Désormais :
 *   — le sol de la pièce prend la teinte du revêtement choisi, adoucie pour
 *     que les noms et les cotes restent lisibles ;
 *   — la peinture des murs court en bande le long de leur nu, côté pièce ;
 *   — un mur d'accent porte la sienne.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { Line, Polygon } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';
import { hexDePeinture } from '../src/ui/peintures';
import { solDe, solSurLePlan } from '../src/ui/habillage';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});
const MURS = [mur('n', 0, 0, 5, 0), mur('e', 5, 0, 5, 4), mur('s', 5, 4, 0, 4), mur('o', 0, 4, 0, 0)];

/*
  LE PLAN DU PARTICULIER : celui de l'électricien, calque électrique allumé,
  met l'architecture en retrait (sols blancs) pour qu'on lise ses circuits,
  et ne porte donc pas le décor.
*/
beforeAll(() => useUsage.setState({ modeElec: false }));
afterAll(() => useUsage.setState({ modeElec: true }));

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function plan(piece: Record<string, unknown>) {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null, wallIds: ['n', 'e', 's', 'o'], ...piece }] as never,
      fixtures: [],
      ceiling: [],
      photos: [],
      niveauCourant: 0,
      showSurfaces: true,
    } as never);
    t = TestRenderer.create(
      <FloorplanEditor showMeasures={false} editable={false} selectedWallId={null} onSelectWall={() => {}} />,
    );
  });
  act(() => {
    t.root.findAllByType(View)[0].props.onLayout?.({ nativeEvent: { layout: { width: 400, height: 400 } } });
  });
  arbre = t;
  return t;
}

const traitsDe = (t: TestRenderer.ReactTestRenderer, hex: string) => [
  ...t.root.findAllByType(Polygon).filter((p) => p.props.stroke === hex),
  ...t.root.findAllByType(Line).filter((p) => p.props.stroke === hex),
];

describe('le décor sur le plan 2D', () => {
  it('le sol prend la teinte du revêtement choisi, adoucie', () => {
    const fondsDe = (t: TestRenderer.ReactTestRenderer) =>
      new Set(t.root.findAllByType(Polygon).map((p) => String(p.props.fill)));
    const neutres = fondsDe(plan({}));
    act(() => arbre?.unmount());
    const teintes = fondsDe(plan({ sol: 'noyer' }));
    const nouveaux = [...teintes].filter((f) => !neutres.has(f));
    // Le fond neutre de la pièce, mêlé au noyer : ni l'un, ni l'autre.
    const attendus = [...neutres].map((f) => solSurLePlan('noyer', f)).filter(Boolean);
    expect(nouveaux.some((f) => attendus.includes(f))).toBe(true);
    expect(nouveaux).not.toContain(solDe('noyer')!.hex);
  });

  it('la peinture court le long des murs, côté pièce', () => {
    const t = plan({ peinture: 'terracotta' });
    const bande = t.root.findAllByType(Polygon).find((p) => p.props.stroke === hexDePeinture('terracotta'));
    expect(bande).toBeDefined();
    expect(bande!.props.fill).toBe('none');
    // Tenue dans la pièce : elle ne déborde pas chez le voisin.
    expect(String(bande!.props.clipPath)).toMatch(/^url\(#/);
  });

  it('le mur d’accent porte sa propre teinte', () => {
    const t = plan({ peinture: 'sauge', accents: { n: 'anthracite' } });
    expect(traitsDe(t, hexDePeinture('anthracite')!).length).toBeGreaterThan(0);
  });

  it('sans décor, rien ne change', () => {
    const t = plan({});
    expect(traitsDe(t, hexDePeinture('terracotta')!)).toHaveLength(0);
    expect(traitsDe(t, hexDePeinture('anthracite')!)).toHaveLength(0);
  });

  it('le mélange garde la teinte et l’adoucit', () => {
    expect(solSurLePlan('noyer', '#FFFFFF')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(solSurLePlan(null, '#FFFFFF')).toBeNull();
    expect(solSurLePlan('auto', '#FFFFFF')).toBeNull();
  });
});

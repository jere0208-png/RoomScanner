/**
 * MANQUES ET DÉFAUT DES VUES — proposés par les agents testeurs PLAN 3D et
 * PLAN 2D :
 *   — la maquette a sa pastille : recentrer, vue de dessus, perspective ;
 *   — une porte d'un mur mitoyen passe sous le plafond baissé d'une des deux
 *     pièces (elle traversait le plafond du couloir abaissé à 1,90 m).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ResultScreen } from '../src/screens/ResultScreen';
import { DEFAULT_VIEW3D, Iso3DView, type View3DParams } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
import { Presse } from '../src/components/Presse';
import { estCadree, gesteDeVue, TILT_DESSUS, vueApres, vueEntre } from '../src/ui/vueMaquette';
import type { WallSeg } from '../src/geometry/floorplan';

const estUneTouche = (n: { type: unknown }) => n.type === TouchableOpacity || n.type === Presse;

describe('la pastille de la maquette, sans écran', () => {
  const tournee: View3DParams = { theta: 40, tilt: 50, zoom: 2.3, ox: 80, oy: -40 };

  it('recentre d’abord, en gardant l’orientation et l’inclinaison choisies', () => {
    expect(gesteDeVue(tournee)).toBe('recentrer');
    const v = vueApres(tournee);
    expect(v).toEqual({ theta: 40, tilt: 50, zoom: 1, ox: 0, oy: 0 });
    expect(estCadree(v)).toBe(true);
  });

  it('puis bascule en vue de dessus, puis revient en perspective', () => {
    const cadree = vueApres(tournee);
    expect(gesteDeVue(cadree)).toBe('dessus');
    const dessus = vueApres(cadree);
    expect(dessus.tilt).toBe(TILT_DESSUS);
    expect(gesteDeVue(dessus)).toBe('perspective');
    expect(vueApres(dessus).tilt).toBe(DEFAULT_VIEW3D.tilt);
    // Une vue de dessus déplacée se recentre… et reste vue de dessus.
    const poussee = { ...dessus, ox: 30 };
    expect(vueApres(poussee).tilt).toBe(TILT_DESSUS);
  });

  it('l’animation tourne par le plus court chemin', () => {
    const a = { ...DEFAULT_VIEW3D, theta: 350 };
    const b = { ...DEFAULT_VIEW3D, theta: 10 };
    expect(vueEntre(a, b, 0.5).theta).toBeCloseTo(360, 6);
    expect(vueEntre(a, b, 1).theta % 360).toBeCloseTo(10, 6);
  });
});

describe('la pastille dans l’écran du plan', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('n’existe qu’en 3D, et chaque appui fait le geste qu’elle annonce', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.getState().ouvrirExemple();
      t = TestRenderer.create(<ResultScreen />);
    });
    act(() => {
      for (const n of t.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
        }
      }
    });
    const pastille = () => t.root.findAll((n) => n.props.testID === 'pastille-vue-maquette' && estUneTouche(n))[0];
    expect(pastille()).toBeUndefined();
    const vers3D = t.root.findAll(estUneTouche).find((n) => n.props.accessibilityLabel === '2D, passer en 3D')!;
    act(() => vers3D.props.onPress());
    // Le fondu de la bascule, puis le relèvement du plan en volume.
    for (let k = 0; k < 10; k++) act(() => jest.advanceTimersByTime(200));
    const vue = () => t.root.findByType(Iso3DView).props.value as View3DParams;
    // Entrée en 3D : la vue reprend le cadrage du plan, puis se relève.
    expect(pastille()).toBeDefined();
    const libelle = pastille().props.accessibilityLabel as string;
    expect(['Recentrer', 'Vue de dessus']).toContain(libelle);
    if (libelle === 'Recentrer') {
      act(() => pastille().props.onPress());
      act(() => jest.advanceTimersByTime(500));
      expect(estCadree(vue())).toBe(true);
    }
    expect(pastille().props.accessibilityLabel).toBe('Vue de dessus');
    act(() => pastille().props.onPress());
    act(() => jest.advanceTimersByTime(500));
    expect(vue().tilt).toBeCloseTo(TILT_DESSUS, 6);
    expect(pastille().props.accessibilityLabel).toBe('Perspective');
    act(() => pastille().props.onPress());
    act(() => jest.advanceTimersByTime(500));
    expect(vue().tilt).toBeCloseTo(DEFAULT_VIEW3D.tilt, 6);
    act(() => t.unmount());
  });
});

describe('une porte passe sous le plafond baissé', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
  });
  // Séjour (0..4) et couloir (4..6), le refend x = 4 en commun.
  const MURS = [
    mur('n1', 0, 0, 4, 0),
    mur('refend', 4, 0, 4, 3),
    mur('s1', 4, 3, 0, 3),
    mur('o1', 0, 3, 0, 0),
    mur('n2', 4, 0, 6, 0),
    mur('e2', 6, 0, 6, 3),
    mur('s2', 6, 3, 4, 3),
  ];
  const PORTE: WallSeg = { id: 'porte', type: 'door', a: { x: 4, z: 1 }, b: { x: 4, z: 1.83 }, height: 2.04, yCenter: 1.02 };

  it('couloir baissé à 1,90 m : la porte du refend aussi, et un « Annuler » rend tout', () => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({
        walls: MURS,
        openings: [PORTE],
        rooms: [
          { id: 'sejour', name: 'Séjour', wallIds: ['n1', 'refend', 's1', 'o1'] },
          { id: 'couloir', name: 'Couloir', wallIds: ['n2', 'e2', 's2', 'refend'] },
        ],
        objects: [],
        fixtures: [],
      });
    });
    act(() => useScanStore.getState().setRoomHeight('couloir', 1.9));
    const st = useScanStore.getState();
    // Le refend garde la hauteur du séjour ; le couloir porte la sienne.
    expect(st.walls.find((w) => w.id === 'refend')!.height).toBeCloseTo(2.5, 6);
    expect(st.rooms.find((r) => r.id === 'couloir')!.hauteur).toBeCloseTo(1.9, 6);
    const p = st.openings.find((o) => o.id === 'porte')!;
    expect(p.yCenter + p.height / 2).toBeLessThanOrEqual(1.9 + 1e-9);
    // Une porte reste posée au sol.
    expect(p.yCenter - p.height / 2).toBeCloseTo(0, 6);
    act(() => useScanStore.getState().undo());
    const apres = useScanStore.getState();
    expect(apres.openings.find((o) => o.id === 'porte')!.height).toBeCloseTo(2.04, 6);
    expect(apres.rooms.find((r) => r.id === 'couloir')!.hauteur).toBeUndefined();
  });
});

describe('l’export 3D range le sol de chaque pièce', () => {
  it('« Sols — Séjour » : un groupe par pièce', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildObj } = require('../src/export/model3d') as typeof import('../src/export/model3d');
    act(() => useScanStore.getState().ouvrirExemple());
    const st = useScanStore.getState();
    const obj = buildObj({ walls: st.walls, openings: st.openings, objects: st.objects, rooms: st.rooms, fixtures: st.fixtures });
    const groupes = obj.split('\n').filter((l) => l.startsWith('g Sols'));
    for (const r of st.rooms) expect(groupes).toContain(`g Sols — ${r.name}`);
  });
});

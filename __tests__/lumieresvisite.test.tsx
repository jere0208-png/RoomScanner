/**
 * ON APPUIE SUR L'INTERRUPTEUR, LA PIÈCE S'ÉCLAIRE — dans la visite.
 *
 * Relevé du patron : « donne la possibilité d'allumer les lumières depuis un
 * interrupteur, et fais une lumière plus réaliste pour chaque luminaire, en
 * fonction de leur forme et de leur usage (par exemple une lumière diffuse en
 * haut et en bas de l'applique murale proposée) ».
 *
 * La lumière elle-même se rend sur la carte graphique, que ce banc ne voit
 * pas. Il tient tout ce qui la commande :
 *   — les lampes de la scène, et la façon d'éclairer de chacune ;
 *   — le diffuseur de chaque lampe dans SON groupe, pour s'allumer seul ;
 *   — ce qu'un interrupteur allume : ses liens, sinon sa pièce ;
 *   — l'interrupteur sous le doigt, et pas celui d'à côté de la cloison ;
 *   — les sources réservées aux lampes les plus proches, dans le budget ;
 *   — et, dans la visite, l'appui qui allume puis éteint.
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
  poserLampesDeVisite: jest.fn(() => true),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Dimensions } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { poserLampesDeVisite } from 'react-native-room-scan';
import {
  GENRE,
  SOURCES_MAX,
  basculer,
  interrupteurSousLeDoigt,
  interrupteursDeLaVisite,
  lampesDeLaScene,
  lampesDeLInterrupteur,
  lampesPourLeNatif,
  projeterDansLaVisite,
  rangsDesLampes,
} from '../src/geometry/lumieres';
import { groupesDesAppareils } from '../src/geometry/appareils3d';
import { maillageDesMeubles } from '../src/geometry/modeles3d';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { HAUTEUR_OEIL, obstaclesDeLaVisite } from '../src/geometry/exploration';
import { wallFace, type Fixture } from '../src/geometry/electrical';
import type { CeilingFixture } from '../src/geometry/ceiling';
import { detectRooms, mergeColinear, splitAtJunctions, weldCorners, type WallSeg } from '../src/geometry/floorplan';
import { Exploration } from '../src/components/Exploration';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';

const PAL: ScenePalette = {
  floor: '#EEEEEE', floorStroke: '#CCCCCC', wall: '#FFFFFF', wallStroke: '#888888', wallTop: '#F4F4F4',
  wallTopStroke: '#949494', opening: '#B9C2CE', door: '#E8A13B', window: '#3EB8E5', passage: '#2F6BFF',
  object: '#D8E1F2', objectTop: '#E9EEF9', objectStroke: '#9FACBF',
};
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25,
});
const MURS = mergeColinear(
  splitAtJunctions(weldCorners([mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('w', 0, 3, 0, 0)])),
).map((w) => ({ ...w, roomId: 'room-1' }));
const ROOMS = detectRooms(MURS).map((r, i) => ({ id: `room-${i + 1}`, name: 'Séjour', wallIds: r.wallIds }));
const murDuNord = MURS.find((w) => Math.abs(w.a.z) < 1e-6 && Math.abs(w.b.z) < 1e-6)!;
const coteInterieur = (w: WallSeg): 1 | -1 => {
  const f = wallFace(w, undefined, 1);
  const mx = (w.a.x + w.b.x) / 2 + f.nx * 0.5;
  const mz = (w.a.z + w.b.z) / 2 + f.nz * 0.5;
  return mx > 0 && mx < 4 && mz > 0 && mz < 3 ? 1 : -1;
};

const fix = (id: string, kind: Fixture['kind'], w: WallSeg, along: number, height: number, o: Partial<Fixture> = {}): Fixture => ({
  id, kind, wallId: w.id, along, height, side: coteInterieur(w), ...o,
});

describe('les lampes de la scène, et leur façon d’éclairer', () => {
  const fixtures = [fix('ap', 'applique', murDuNord, 1, 1.9), fix('i', 'inter', murDuNord, 3, 1.1)];
  const ceiling: CeilingFixture[] = [
    { id: 's', kind: 'spot', roomId: 'room-1', at: { x: 1, z: 1.5 } },
    { id: 'd', kind: 'dcl', roomId: 'room-1', at: { x: 2, z: 1.5 } },
    { id: 'f', kind: 'daaf', roomId: 'room-1', at: { x: 3, z: 1.5 } },
  ];
  const scene = buildScene(MURS, [], [], { palette: PAL, rooms: ROOMS as never, showSurfaces: true, fixtures, ceiling });
  const lampes = lampesDeLaScene(scene.appareils ?? []);

  it('une applique, un spot, une ampoule — un détecteur de fumée n’éclaire pas', () => {
    const genres = new Map(lampes.map((l) => [l.id, l.genre]));
    expect(genres.get('ap')).toBe(GENRE.appliqueMurale);
    expect(genres.get('cl-s')).toBe(GENRE.spot);
    expect(genres.get('cl-d')).toBe(GENRE.ampoule);
    expect(genres.has('cl-f')).toBe(false);
    // L'applique éclaire en haut ET en bas : deux faisceaux.
    expect(lampes.find((l) => l.id === 'ap')!.sources).toBe(2);
  });

  it('chaque lampe a son diffuseur à elle, qui porte son rang', () => {
    const flux = maillageDesMeubles([], groupesDesAppareils(scene.appareils ?? [], rangsDesLampes(lampes)));
    const codes: number[] = [];
    let k = 0;
    while (k < flux.length) {
      codes.push(flux[k]);
      k += 8 + flux[k + 6] * 8 + flux[k + 7];
    }
    const diffuseurs = codes.filter((c) => c >= 100).sort((a, b) => a - b);
    expect(diffuseurs).toEqual(lampes.map((l) => 5 + 100 * (l.index + 1)).sort((a, b) => a - b));
    // Sans rangs (la maquette), tous les diffuseurs restent allumés, réunis.
    const brut = maillageDesMeubles([], groupesDesAppareils(scene.appareils ?? []));
    let j = 0;
    while (j < brut.length) {
      expect(brut[j]).toBeLessThan(100);
      j += 8 + brut[j + 6] * 8 + brut[j + 7];
    }
  });
});

describe('ce qu’un interrupteur allume', () => {
  const inter = fix('i', 'inter', murDuNord, 3, 1.1);
  const lie = fix('ap', 'applique', murDuNord, 1, 1.9, { commands: ['i'] });
  const ceiling: CeilingFixture[] = [
    { id: 'd', kind: 'dcl', roomId: 'room-1', at: { x: 2, z: 1.5 }, commands: ['i'] },
    { id: 's', kind: 'spot', roomId: 'room-1', at: { x: 1, z: 1.5 } },
  ];
  const piece = () => 'room-1';

  it('ce qui le nomme, et rien d’autre', () => {
    expect(lampesDeLInterrupteur(inter, [inter, lie], ceiling, piece).sort()).toEqual(['ap', 'cl-d']);
  });

  it('sans lien, la pièce où il est', () => {
    const libre = fix('j', 'inter', murDuNord, 2, 1.1);
    const appliques = [fix('ap2', 'applique', murDuNord, 0.5, 1.9)];
    expect(lampesDeLInterrupteur(libre, [libre, ...appliques], ceiling, piece).sort()).toEqual(
      ['ap2', 'cl-d', 'cl-s'].sort(),
    );
  });

  it('bascule tout son groupe ensemble', () => {
    const une = basculer(new Set(['cl-d']), ['cl-d', 'ap']);
    expect([...une].sort()).toEqual(['ap', 'cl-d']);
    expect([...basculer(une, ['cl-d', 'ap'])]).toEqual([]);
  });
});

describe('l’interrupteur sous le doigt', () => {
  const ecran = { w: 390, h: 844 };
  const inter = fix('i', 'inter', murDuNord, 2, 1.1);
  const inters = interrupteursDeLaVisite([inter], MURS);
  // Au milieu de la pièce, face au mur nord (les z décroissants).
  const oeil = { x: 2, y: HAUTEUR_OEIL, z: 2, lacet: Math.PI, tangage: 0, fov: 70 };
  const obstacles = obstaclesDeLaVisite(MURS, [], []);

  it('un point droit devant tombe au centre de l’écran', () => {
    const q = projeterDansLaVisite(oeil, { x: 2, y: HAUTEUR_OEIL, z: 0.5 }, ecran)!;
    expect(q.x).toBeCloseTo(ecran.w / 2, 3);
    expect(q.y).toBeCloseTo(ecran.h / 2, 3);
    // Et ce qui est derrière ne se projette pas.
    expect(projeterDansLaVisite(oeil, { x: 2, y: 1, z: 2.8 }, ecran)).toBeNull();
  });

  it('se prend à portée de doigt, plus large que le mécanisme', () => {
    const q = projeterDansLaVisite(oeil, inters[0], ecran)!;
    expect(interrupteurSousLeDoigt({ x: q.x + 25, y: q.y - 20 }, oeil, ecran, inters, obstacles)).toBe('i');
    expect(interrupteurSousLeDoigt({ x: q.x + 120, y: q.y }, oeil, ecran, inters, obstacles)).toBeNull();
  });

  it('mais pas à travers une cloison', () => {
    // Le même interrupteur, vu de l'autre côté du mur nord.
    const dehors = { ...oeil, z: -2, lacet: 0 };
    const q = projeterDansLaVisite(dehors, inters[0], ecran)!;
    expect(q).not.toBeNull();
    expect(interrupteurSousLeDoigt({ x: q.x, y: q.y }, dehors, ecran, inters, obstacles)).toBeNull();
  });
});

describe('les sources vont aux lampes allumées les plus proches', () => {
  const lampes = [0, 1, 2, 3].map((i) => ({
    id: `a${i}`, index: i, genre: GENRE.appliqueMurale, x: i * 2, y: 1.9, z: 0, nx: 0, nz: 1, sources: 2,
  }));
  it('dans le budget, les plus proches d’abord, et toutes disent si elles sont allumées', () => {
    const v = lampesPourLeNatif(lampes, new Set(['a0', 'a1', 'a2', 'a3']), { x: 0, z: 0 });
    expect(v).toHaveLength(lampes.length * 9);
    const sources = [0, 1, 2, 3].map((i) => v[i * 9 + 3]);
    const allumees = [0, 1, 2, 3].map((i) => v[i * 9 + 2]);
    expect(allumees).toEqual([1, 1, 1, 1]);
    // Deux appliques de deux faisceaux : quatre sources sur cinq, la troisième n'entre pas.
    expect(sources).toEqual([1, 1, 0, 0]);
    expect(sources.reduce((t, s, i) => t + s * lampes[i].sources, 0)).toBeLessThanOrEqual(SOURCES_MAX);
  });
});

describe('dans la visite, l’appui allume, puis éteint', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('touche l’interrupteur visible, et la lampe part allumée au natif', () => {
    // Un interrupteur au milieu de chaque mur : l'un d'eux est forcément en vue.
    const fixtures = MURS.map((w, i) =>
      fix(`i${i}`, 'inter', w, Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z) / 2, 1.3),
    );
    const ceiling: CeilingFixture[] = [{ id: 'd', kind: 'dcl', roomId: 'room-1', at: { x: 2, z: 1.5 } }];
    act(() => {
      useUsage.setState({ modeElec: true, choisi: true, charge: true } as never);
      useScanStore.setState({
        walls: MURS,
        openings: [],
        objects: [],
        rooms: ROOMS as never,
        fixtures,
        ceiling,
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
    const vue = t.root.findAll((n) => n.type === ('RoomScanVisite' as never))[0];
    expect(vue).toBeDefined();
    const [x, y, z, lacet, tangage, fov] = vue.props.camera as number[];
    const { width, height } = Dimensions.get('window');
    const ecran = { w: width, h: height };
    const oeil = { x, y, z, lacet, tangage, fov };
    // L'interrupteur le plus proche du centre de l'écran.
    const inters = interrupteursDeLaVisite(fixtures, MURS);
    const vus = inters
      .map((it) => ({ it, q: projeterDansLaVisite(oeil, it, ecran) }))
      .filter((v) => v.q && v.q.x > 0 && v.q.x < ecran.w && v.q.y > 0 && v.q.y < ecran.h)
      .sort((a, b) => Math.abs(a.q!.x - ecran.w / 2) - Math.abs(b.q!.x - ecran.w / 2));
    expect(vus.length).toBeGreaterThan(0);
    const cible = vus[0].q!;
    const zone = t.root.findAll((n) => n.props?.accessibilityLabel === 'Marcher et regarder' && typeof n.props?.onResponderGrant === 'function')[0];
    const toucher = () => {
      const touche = { identifier: 1, pageX: cible.x, pageY: cible.y };
      act(() => {
        zone.props.onResponderGrant({ nativeEvent: { touches: [touche], changedTouches: [touche] } });
      });
      act(() => {
        zone.props.onResponderRelease({ nativeEvent: { touches: [], changedTouches: [touche] } });
      });
      act(() => {
        jest.advanceTimersByTime(20);
      });
    };
    const derniere = () => {
      const appels = (poserLampesDeVisite as jest.Mock).mock.calls;
      return appels[appels.length - 1]?.[1] as number[] | undefined;
    };
    toucher();
    // Sans lien, l'interrupteur allume la pièce : la DCL, allumée, avec sa source.
    expect(derniere()?.[2]).toBe(1);
    expect(derniere()?.[3]).toBe(1);
    toucher();
    expect(derniere()?.[2]).toBe(0);
    act(() => t.unmount());
  });
});

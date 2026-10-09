/**
 * LA MAQUETTE SUR LA CARTE GRAPHIQUE.
 *
 * Relevé du patron : « le modèle 3D d'un plan contenant des meubles, comme
 * le plan de test, est très lent. Les autres apps sont fluides, peu importe
 * le nombre de meubles ».
 *
 * Mesuré sur l'appartement d'exemple : 2 617 faces et 7 803 sommets que la
 * vue en JavaScript projetait, triait et redessinait à CHAQUE image du
 * doigt — sur un moteur JavaScript interprété. Ils partent maintenant une
 * fois vers SceneKit, en triangles, et le geste n'envoie que la caméra.
 *
 * Ce banc tient trois choses :
 *   — la caméra native tombe AU PIXEL sur la projection des cotes, qui
 *     restent posées par-dessus en JavaScript ;
 *   — chaque face part dans le bon groupe, tournée du bon côté (sans quoi la
 *     maison de poupée ne s'ouvrirait pas, ou des murs disparaîtraient) ;
 *   — la vue 3D prend ce chemin quand SceneKit est là, et la géométrie ne
 *     voyage plus quand seule la caméra bouge.
 */
const natifPresent = { valeur: true };
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    viewModel: jest.fn(async () => false),
  },
  scanEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  laserEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  RoomScanView: 'RoomScanView',
  RoomScanCanvas: 'RoomScanCanvas',
  get RoomScanVisite() {
    return natifPresent.valeur ? 'RoomScanVisite' : undefined;
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
import { appartementExemple } from '../src/data/exemple';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import {
  cameraOrbite,
  echelleDeLaVue,
  maillageDeLaMaquette,
  projeterParLaCamera,
} from '../src/geometry/maquette3d';

const PAL: ScenePalette = {
  floor: '#EEEEEE', floorStroke: '#CCCCCC', wall: '#FFFFFF', wallStroke: '#888888', wallTop: '#F4F4F4',
  wallTopStroke: '#949494', opening: '#B9C2CE', door: '#E8A13B', window: '#3EB8E5', passage: '#2F6BFF',
  object: '#D8E1F2', objectTop: '#E9EEF9', objectStroke: '#9FACBF',
};
const ex = appartementExemple();
const scene = buildScene(ex.walls, ex.openings, ex.objects as never, { palette: PAL, rooms: ex.rooms as never, showSurfaces: true });

describe('la caméra tombe au pixel sur la projection des cotes', () => {
  /** La projection de `Iso3DView`, recopiée telle quelle. */
  const projectionJs = (
    v: { theta: number; tilt: number; zoom: number; ox: number; oy: number },
    c: { x: number; y: number; z: number },
    rayon: number,
    l: { w: number; h: number },
    p: { x: number; y: number; z: number },
  ) => {
    const ct = Math.cos((v.theta * Math.PI) / 180);
    const st = Math.sin((v.theta * Math.PI) / 180);
    const cp = Math.cos((v.tilt * Math.PI) / 180);
    const sp = Math.sin((v.tilt * Math.PI) / 180);
    const scale = ((Math.min(l.w, l.h) * 0.44) / rayon) * v.zoom;
    const x = p.x - c.x;
    const y = p.y - c.y;
    const z = p.z - c.z;
    const rx = x * ct - z * st;
    const rz = x * st + z * ct;
    return { sx: l.w / 2 + v.ox + rx * scale, sy: l.h / 2 + v.oy + (rz * cp - y * sp) * scale };
  };

  it('sous tous les angles, zooms et décalages', () => {
    const c = { x: 4, y: 1.25, z: 3 };
    const rayon = 5.2;
    const l = { w: 390, h: 620 };
    let pire = 0;
    for (const theta of [-170, -90, -32, 0, 45, 120, 179]) {
      for (const tilt of [12, 35, 58, 80, 89]) {
        for (const [zoom, ox, oy] of [[1, 0, 0], [2.4, 37, -52], [0.6, -80, 140]]) {
          const v = { theta, tilt, zoom, ox, oy };
          const cam = cameraOrbite(v, c, rayon, l);
          for (const p of [{ x: 0, y: 0, z: 0 }, { x: 8, y: 2.5, z: 6 }, { x: 3.3, y: 1.1, z: -0.4 }]) {
            const a = projectionJs(v, c, rayon, l, p);
            const b = projeterParLaCamera(cam, p, l);
            pire = Math.max(pire, Math.abs(a.sx - b.sx), Math.abs(a.sy - b.sy));
          }
        }
      }
    }
    expect(pire).toBeLessThan(1e-6);
  });

  it('la demi-hauteur visible est l’écran, en mètres', () => {
    const v = { theta: 0, tilt: 58, zoom: 2, ox: 0, oy: 0 };
    const l = { w: 390, h: 620 };
    expect(cameraOrbite(v, { x: 0, y: 0, z: 0 }, 5, l)[9]).toBeCloseTo(l.h / 2 / echelleDeLaVue(v, 5, l), 9);
  });
});

describe('chaque face part dans son groupe, tournée du bon côté', () => {
  const m = maillageDeLaMaquette(scene.faces);
  /** Les triangles d'un groupe, avec leur normale par sens de parcours. */
  const tris = (src: number[]) => {
    const out: { n: { x: number; y: number; z: number } }[] = [];
    for (let i = 0; i + 12 <= src.length; i += 12) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = src.slice(i, i + 9);
      const u = { x: bx - ax, y: by - ay, z: bz - az };
      const w = { x: cx - ax, y: cy - ay, z: cz - az };
      out.push({ n: { x: u.y * w.z - u.z * w.y, y: u.z * w.x - u.x * w.z, z: u.x * w.y - u.y * w.x } });
    }
    return out;
  };

  it('le logement entier part : bâti orienté, écorché, mobilier, sols', () => {
    expect(m.orientes.length / 12).toBeGreaterThan(300);
    expect(m.ecorche.length / 12).toBeGreaterThan(20);
    expect(m.sols.length).toBeGreaterThan(0);
    // Douze nombres par triangle, sans reste : un tableau tronqué ferait
    // lire au natif des sommets décalés.
    for (const g of [m.maillage, m.orientes, m.ecorche]) expect(g.length % 12).toBe(0);
  });

  it('les arêtes, les ombres et les plafonds ne partent pas : la lumière les fait', () => {
    const arêtes = scene.faces.filter((f) => !f.fill).length;
    expect(arêtes).toBeGreaterThan(0);
    const total = (m.maillage.length + m.orientes.length + m.ecorche.length) / 12;
    expect(total).toBeLessThan(scene.faces.length * 4);
  });

  it('chaque face orientée montre sa normale à l’œil — sinon la carte graphique la jetterait', () => {
    // Les faces orientées sont émises dans l'ordre des faces : on vérifie
    // qu'aucun triangle n'est retourné par rapport à la face d'où il vient.
    let i = 0;
    for (const f of scene.faces) {
      if (f.pts.length < 3 || !f.fill || f.ombre || f.isCeiling || f.isFloor) continue;
      if (!f.normal || f.cutaway) continue;
      const sub = maillageDeLaMaquette([f]).orientes;
      for (const t of tris(sub)) {
        expect(t.n.x * f.normal.x + t.n.y * f.normal.y + t.n.z * f.normal.z).toBeGreaterThan(-1e-9);
      }
      i++;
    }
    expect(i).toBeGreaterThan(50);
  });
});

describe('la vue 3D', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());
  let arbre: TestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => arbre?.unmount());
    arbre = null;
  });

  const monter = (v = { theta: 35, tilt: 58, zoom: 1, ox: 0, oy: 0 }) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        walls: ex.walls,
        openings: ex.openings,
        objects: ex.objects as never,
        rooms: ex.rooms as never,
        fixtures: [],
        ceiling: [],
        showFurniture: true,
      });
      t = TestRenderer.create(<Iso3DView value={v} />);
    });
    act(() => {
      const z = t.root.findAllByType(View).find((n) => typeof n.props.onLayout === 'function')!;
      z.props.onLayout({ nativeEvent: { layout: { width: 390, height: 620 } } });
    });
    arbre = t;
    return t;
  };
  const natif = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAll((n) => n.props?.testID === 'maquette-native' && Array.isArray(n.props?.orbite))[0];

  it('confie la maquette à SceneKit quand il est là — et plus rien au canevas', () => {
    natifPresent.valeur = true;
    const t = monter();
    const vue = natif(t);
    expect(vue).toBeDefined();
    expect(vue.props.orientes.length).toBeGreaterThan(1000);
    expect(vue.props.orbite).toHaveLength(10);
    expect(t.root.findAll((n) => Array.isArray(n.props?.formes))).toHaveLength(0);
    // Aucun tracé de géométrie ne reste à peindre en JavaScript.
    expect(t.root.findAll((n) => typeof n.props?.d === 'string' && n.props.d.length > 2)).toHaveLength(0);
  });

  it('quand la caméra tourne, seule la caméra voyage : la géométrie ne bouge pas', () => {
    natifPresent.valeur = true;
    const t = monter();
    const avant = natif(t).props;
    act(() => {
      t.update(<Iso3DView value={{ theta: 80, tilt: 40, zoom: 1.6, ox: 12, oy: -8 }} />);
    });
    const apres = natif(t).props;
    expect(apres.orientes).toBe(avant.orientes);
    expect(apres.maillage).toBe(avant.maillage);
    expect(apres.sols).toBe(avant.sols);
    expect(apres.orbite).not.toEqual(avant.orbite);
  });

  it('sans SceneKit, le canevas reprend la maquette, entière', () => {
    natifPresent.valeur = false;
    const t = monter();
    expect(natif(t)).toBeUndefined();
    const canevas = t.root.findAll((n) => Array.isArray(n.props?.formes));
    expect(canevas).toHaveLength(1);
    expect(canevas[0].props.formes.length).toBeGreaterThan(500);
    natifPresent.valeur = true;
  });
});

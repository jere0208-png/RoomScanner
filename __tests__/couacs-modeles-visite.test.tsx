/**
 * LES COUACS DES MODÈLES ET DE LA VISITE.
 *
 * Relevés des testeurs « bug-3d » et « bug-natif-appstore » : des faces de
 * deux matières qui se disputent le même plan (elles clignotent à l'écran),
 * un cache de modèles qui ne gardait plus rien au-delà de 240 meubles, une
 * mini-carte en NaN sur un niveau sans mur, un « Terminer » bloqué, un NaN
 * qui fermait l'app, un cache d'images sans limite. Et la demande du
 * patron : sur le plan 3D, des murs vraiment blancs et des arêtes légères.
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
import TestRenderer, { act } from 'react-test-renderer';
import { Exploration } from '../src/components/Exploration';
import { appartementExemple } from '../src/data/exemple';
import { detectRooms, type WallSeg } from '../src/geometry/floorplan';
import { maillageDeLaMaquette } from '../src/geometry/maquette3d';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { PEINTURES } from '../src/ui/peintures';
import { fabriquer, modeleDe, CACHE_DES_MODELES, type ModeleLocal, type PoseDeMeuble } from '../src/geometry/modeles3d';
import { useScanStore } from '../src/store/scanStore';

type P2 = [number, number];

/**
 * LES FACES QUI SE DISPUTENT L'ÉCRAN — deux triangles de groupes différents
 * (matière ou teinte), dans le même plan, tournés du même côté, qui se
 * recouvrent sur une vraie surface : le tampon de profondeur ne sait pas
 * lequel montrer, et l'image clignote.
 */
function facesQuiSeDisputent(m: ModeleLocal): string[] {
  type Tri = { g: number; plan: string; pts: P2[] };
  const tris: Tri[] = [];
  m.groupes.forEach((g, gi) => {
    for (let j = 0; j + 2 < g.i.length; j += 3) {
      const p = [g.i[j], g.i[j + 1], g.i[j + 2]].map((k) => [g.v[k * 8], g.v[k * 8 + 1], g.v[k * 8 + 2]]);
      const u = [0, 1, 2].map((c) => p[1][c] - p[0][c]);
      const w = [0, 1, 2].map((c) => p[2][c] - p[0][c]);
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const l = Math.hypot(n[0], n[1], n[2]);
      if (l < 1e-10) continue;
      // Les faces droites seules : c'est là que les boîtes se rencontrent.
      const axe = [0, 1, 2].find((c) => Math.abs(n[c]) / l > 0.9999);
      if (axe === undefined) continue;
      const signe = n[axe] > 0 ? 1 : -1;
      const niveau = Math.round(p[0][axe] * 1e5);
      const [a, b] = [0, 1, 2].filter((c) => c !== axe);
      tris.push({ g: gi, plan: `${axe}|${signe}|${niveau}`, pts: p.map((q) => [q[a], q[b]] as P2) });
    }
  });
  const parPlan = new Map<string, Tri[]>();
  for (const t of tris) parPlan.set(t.plan, [...(parPlan.get(t.plan) ?? []), t]);
  const out: string[] = [];
  for (const [plan, liste] of parPlan) {
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length; j++) {
        if (liste[i].g === liste[j].g) continue;
        if (seRecouvrent(liste[i].pts, liste[j].pts)) {
          out.push(`${plan} ${m.groupes[liste[i].g].mat}/${m.groupes[liste[j].g].mat}`);
        }
      }
    }
  }
  return [...new Set(out)];
}

/** Deux triangles du plan qui partagent plus qu'une arête (axes séparateurs). */
function seRecouvrent(A: P2[], B: P2[]): boolean {
  const marge = 1e-7;
  for (const T of [A, B]) {
    for (let k = 0; k < 3; k++) {
      const p = T[k];
      const q = T[(k + 1) % 3];
      const ax: P2 = [q[1] - p[1], p[0] - q[0]];
      const proj = (S: P2[]) => S.map((s) => s[0] * ax[0] + s[1] * ax[1]);
      const a = proj(A);
      const b = proj(B);
      if (Math.max(...a) - Math.min(...b) <= marge || Math.max(...b) - Math.min(...a) <= marge) return false;
    }
  }
  return true;
}

const commande = (modele = '') => ({ modele, attributs: [], hasard: () => 0.5 });

describe('les faces ne se disputent plus l’écran', () => {
  it('la télé murale : l’écran devant la dalle', () => {
    expect(facesQuiSeDisputent(fabriquer('television', { W: 1.2, D: 0.08, H: 0.7 }, commande()))).toEqual([]);
  });
  it('la télé sur pied, comme avant', () => {
    expect(facesQuiSeDisputent(fabriquer('television', { W: 1.2, D: 0.25, H: 0.8 }, commande()))).toEqual([]);
  });
  it('le radiateur : la grille du dessus au-dessus du panneau', () => {
    expect(facesQuiSeDisputent(fabriquer('radiateur', { W: 0.8, D: 0.1, H: 0.6 }, commande('radiateur')))).toEqual([]);
  });
  it('le tableau : chaque aplat devant le précédent', () => {
    for (const modele of ['', 'triptyque', 'cadresphotos']) {
      expect(facesQuiSeDisputent(fabriquer('cadre', { W: 0.9, D: 0.03, H: 0.6 }, commande(modele)))).toEqual([]);
    }
  });
  it('l’évier de cuisine : la cuve en retrait du plan', () => {
    expect(facesQuiSeDisputent(fabriquer('sink', { W: 1.2, D: 0.6, H: 0.9 }, commande('evier')))).toEqual([]);
  });
});

describe('le cache des modèles garde ce qui sert', () => {
  const pose = (id: string): PoseDeMeuble => ({
    id,
    category: 'table',
    width: 1.2,
    depth: 0.8,
    height: 0.75,
    cx: 0,
    cz: 0,
    yaw: 0,
    yb: 0,
  });

  it('un logement de 300 meubles ne refabrique rien à la scène suivante', () => {
    const poses = Array.from({ length: 300 }, (_, k) => pose(`grand-${k}`));
    const premiere = poses.map(modeleDe);
    const seconde = poses.map(modeleDe);
    seconde.forEach((m, k) => expect(m).toBe(premiere[k]));
  });

  it('un modèle resservi repasse en tête : c’est le plus délaissé qui part', () => {
    const poses = Array.from({ length: CACHE_DES_MODELES }, (_, k) => pose(`lru-${k}`));
    const modeles = poses.map(modeleDe);
    // Le plus ancien resservi…
    expect(modeleDe(poses[0])).toBe(modeles[0]);
    // …puis un meuble de plus : c'est le deuxième, délaissé, qui part.
    modeleDe(pose('lru-nouveau'));
    expect(modeleDe(poses[0])).toBe(modeles[0]);
    expect(modeleDe(poses[1])).not.toBe(modeles[1]);
  });
});

describe('la mini-carte de la visite', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
  });
  const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];

  const ouvrir = (walls: WallSeg[]) => {
    const rooms = detectRooms(walls).map((r, i) => ({ id: `p${i}`, name: 'Séjour', wallIds: r.wallIds, floor: null }));
    act(() => {
      useScanStore.setState({
        walls,
        openings: [],
        objects: [],
        rooms: rooms as never,
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
    return t;
  };
  const cartes = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAll((n) => n.props?.accessibilityLabel === 'Plan' && typeof n.type === 'string');
  const terminer = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAll((n) => n.props?.accessibilityLabel === 'Terminer l’exploration' && typeof n.props?.onPress === 'function');

  it('sur un niveau sans mur : pas de carte en NaN, et « Terminer » reste là', () => {
    const t = ouvrir([]);
    expect(cartes(t)).toHaveLength(0);
    expect(terminer(t).length).toBeGreaterThan(0);
    act(() => t.unmount());
  });

  it('avec des murs, la carte se dessine en nombres finis', () => {
    const t = ouvrir(MURS);
    expect(cartes(t).length).toBeGreaterThan(0);
    const traits = cartes(t)[0].findAll((n) => n.props?.x1 !== undefined);
    expect(traits.length).toBeGreaterThanOrEqual(MURS.length);
    for (const l of traits) {
      for (const k of ['x1', 'y1', 'x2', 'y2']) expect(Number.isFinite(l.props[k])).toBe(true);
    }
    act(() => t.unmount());
  });
});

const lire = (chemin: string) => readFileSync(join(__dirname, '..', chemin), 'utf8');
const visite = lire('modules/react-native-room-scan/ios/RoomScanVisite.swift');
const manager = lire('modules/react-native-room-scan/ios/RoomScanManager.swift');

describe('le natif ne tombe plus, ne grossit plus, ne bloque plus', () => {
  it('un NaN reçu du JavaScript ne fait plus tomber la visite', () => {
    expect(visite).toMatch(/private func entier<F: BinaryFloatingPoint>\(_ f: F\) -> Int \{\n  f > -1e9 && f < 1e9 \? Int\(f\) : -1\n\}/);
    // Plus aucune conversion directe d'un flottant reçu en entier.
    expect(visite).not.toMatch(/Int\(v\[/);
    expect(visite).not.toMatch(/Int32\(\(p\.[xyz] \* 2000\)/);
    expect(visite).not.toMatch(/Int\([rgb] \* 255\)/);
  });

  it('les images de sols vivent dans un cache borné', () => {
    expect(visite).toMatch(/private static let imagesDesSols: NSCache<NSString, UIImage>/);
    expect(visite).toMatch(/imagesDesSols\.setObject\(image, forKey: cle as NSString, cost: cout\)/);
    expect(visite).not.toMatch(/imagesDesSols\[/);
  });

  it('une session finie en erreur rejette la promesse de « Terminer »', () => {
    const fin = manager.slice(manager.indexOf('didEndWith data: CapturedRoomData'), manager.indexOf('dernierReleve = data'));
    expect(fin).toMatch(/if stopResolver != nil && dernierReleve == nil \{/);
    expect(fin).toMatch(/stopRejecter\?\("SCAN_FAILED", error\.localizedDescription, error\)/);
    expect(fin).toMatch(/clearPromise\(\)/);
  });
});

describe('le plan 3D : murs vraiment blancs, arêtes légères', () => {
  const PAL: ScenePalette = {
    floor: '#EEEEEE', floorStroke: '#CCCCCC', wall: '#FFFFFF', wallStroke: '#888888', wallTop: '#F4F4F4',
    wallTopStroke: '#949494', opening: '#B9C2CE', door: '#E8A13B', window: '#3EB8E5', passage: '#2F6BFF',
    object: '#D8E1F2', objectTop: '#E9EEF9', objectStroke: '#9FACBF',
  };
  const ex = appartementExemple();
  const scene = buildScene(ex.walls, ex.openings, ex.objects as never, { palette: PAL, rooms: ex.rooms as never, showSurfaces: true });

  it('la maquette envoie les arêtes du bâti, et la vue les passe au natif', () => {
    const m = maillageDeLaMaquette(scene.faces, { sansMeubles: true });
    expect(m.aretes.length).toBeGreaterThan(0);
    expect(m.aretes.length % 6).toBe(0);
    expect(m.aretes.every((x) => Number.isFinite(x))).toBe(true);
    // Des traits verticaux : les fins de mur, les angles, les tableaux.
    const verticaux = Array.from({ length: m.aretes.length / 6 }, (_, k) => m.aretes.slice(k * 6, k * 6 + 6)).filter(
      (s) => Math.abs(s[0] - s[3]) < 1e-6 && Math.abs(s[2] - s[5]) < 1e-6 && Math.abs(s[1] - s[4]) > 0.5,
    );
    expect(verticaux.length).toBeGreaterThan(4);
    expect(lire('src/components/Iso3DView.tsx')).toMatch(/aretes=\{maquette\.aretes\}/);
  });

  it('les flancs de la maquette ont leur clarté : un blanc pur ressort au-dessus de 245', () => {
    expect(visite).toMatch(/static let CLARTE_MAQUETTE: CGFloat = 0\.22/);
    expect(visite).toMatch(/clarteFlancs \* \(1\.0 - abs\(normaleMonde\.y\)\)/);
    expect(visite).toMatch(/modePose == true \? Self\.CLARTE_MAQUETTE : 0/);
    // Le gris mesuré sur capture (220 pour un blanc), plus 22 % de la teinte, en lumière linéaire.
    const lineaire = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const ecran = (l: number) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);
    expect(Math.min(1, ecran(lineaire(220 / 255) + 0.22)) * 255).toBeGreaterThan(245);
    // Et le blanc pur est au nuancier des murs.
    expect(PEINTURES.some((p) => p.hex === '#FFFFFF')).toBe(true);
  });
});

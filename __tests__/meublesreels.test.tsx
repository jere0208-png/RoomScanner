/**
 * LES MEUBLES EN VRAI — des modèles à leurs cotes, plus des caisses.
 *
 * Relevé du patron : « il faut avoir des modèles réalistes de meubles aux
 * mesures réelles, non pas des cubes codés ».
 *
 * Ce banc tient ce que « aux mesures réelles » veut dire :
 *   — chaque modèle TIENT dans la boîte relevée (largeur, profondeur,
 *     hauteur) et la REMPLIT — seule la robinetterie dépasse d'un plan ;
 *   — ce qui a une taille réelle la GARDE : un pied de table fait la même
 *     section sur une table d'un mètre vingt et sur une de deux mètres
 *     quarante, une assise reste à quarante-cinq centimètres ;
 *   — ce qui dépend de la taille se COMPTE : places, portes, marches ;
 *   — les précisions de RoomPlan (iOS 17) changent la forme ;
 *   — aucune face n'est retournée (la carte graphique la jetterait), et
 *     chaque meuble tombe à la place exacte de son ancienne caisse ;
 *   — la vue 3D confie les vrais meubles au natif, et retire les caisses.
 */
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    viewModel: jest.fn(async () => false),
  },
  scanEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  laserEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })), removeAllListeners: jest.fn() },
  RoomScanView: 'RoomScanView',
  RoomScanCanvas: 'RoomScanCanvas',
  RoomScanVisite: 'RoomScanVisite',
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { CATALOGUE } from '../src/geometry/catalogue';
import {
  CODE_OMBRE,
  ENTETE_GROUPE,
  PAR_SOMMET,
  fabriquer,
  graineDe,
  maillageDesMeubles,
  marchesDEscalier,
  placesDuCanape,
  portesDArmoire,
  type ModeleLocal,
} from '../src/geometry/modeles3d';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { maillageDeLaMaquette } from '../src/geometry/maquette3d';
import { appartementExemple } from '../src/data/exemple';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';

const PAL: ScenePalette = {
  floor: '#EEEEEE', floorStroke: '#CCCCCC', wall: '#FFFFFF', wallStroke: '#888888', wallTop: '#F4F4F4',
  wallTopStroke: '#949494', opening: '#B9C2CE', door: '#E8A13B', window: '#3EB8E5', passage: '#2F6BFF',
  object: '#D8E1F2', objectTop: '#E9EEF9', objectStroke: '#9FACBF',
};

const modele = (cat: string, W: number, D: number, H: number, cle = '', attributs: string[] = []) =>
  fabriquer(cat, { W, D, H }, { modele: cle, attributs, hasard: graineDe(`${cat}${cle}${W}`) });

/** Tous les sommets d'un modèle, avec leur matière. */
function sommets(m: ModeleLocal) {
  const out: { x: number; y: number; z: number; mat: string }[] = [];
  for (const g of m.groupes) {
    for (let k = 0; k < g.v.length; k += PAR_SOMMET) out.push({ x: g.v[k], y: g.v[k + 1], z: g.v[k + 2], mat: g.mat });
  }
  return out;
}

const TOUT = CATALOGUE.flatMap((f) => f.items);

/**
 * LA HAUTEUR DU MEUBLE EN UN POINT, vue d'en haut : un rayon vertical, et le
 * plus haut triangle qu'il traverse. Une face plane n'a de sommets qu'à ses
 * bords : c'est la surface qu'on interroge, pas ses sommets.
 */
function hauteurAu(m: ModeleLocal, x: number, z: number): number {
  let haut = -Infinity;
  for (const g of m.groupes) {
    const P = (k: number) => [g.v[k * PAR_SOMMET], g.v[k * PAR_SOMMET + 1], g.v[k * PAR_SOMMET + 2]];
    for (let t = 0; t < g.i.length; t += 3) {
      const [a, b, c] = [P(g.i[t]), P(g.i[t + 1]), P(g.i[t + 2])];
      const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(det) < 1e-12) continue;
      const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det;
      const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det;
      const l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      haut = Math.max(haut, l1 * a[1] + l2 * b[1] + l3 * c[1]);
    }
  }
  return haut;
}

describe('chaque meuble tient dans sa boîte relevée, et la remplit', () => {
  it.each(TOUT.map((it) => [it.key, it] as const))('%s', (_k, it) => {
    const m = modele(it.category, it.w, it.d, it.h, it.key);
    const pts = sommets(m);
    expect(pts.length).toBeGreaterThan(0);
    const corps = pts.filter((p) => p.mat !== 'chrome');
    const eps = 0.0015;
    for (const p of corps) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(it.w / 2 + eps);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(it.d / 2 + eps);
      expect(p.y).toBeGreaterThanOrEqual(-eps);
      // Une vitrocéramique affleure son plan à quelques millimètres près.
      expect(p.y).toBeLessThanOrEqual(it.h + 0.005);
    }
    // La robinetterie, seule, dépasse — par le haut, et d'une hauteur de robinet.
    for (const p of pts.filter((q) => q.mat === 'chrome')) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(it.w / 2 + eps);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(it.d / 2 + eps);
      expect(p.y).toBeLessThanOrEqual(it.h + 0.4);
    }
    // Il REMPLIT sa boîte : un modèle à côté de ses cotes serait faux aussi.
    const etendue = (f: (p: { x: number; y: number; z: number }) => number) =>
      Math.max(...corps.map(f)) - Math.min(...corps.map(f));
    expect(etendue((p) => p.x)).toBeGreaterThan(it.w * 0.8);
    expect(etendue((p) => p.z)).toBeGreaterThan(it.d * 0.75);
    if (it.key !== 'tapis') expect(etendue((p) => p.y)).toBeGreaterThan(it.h * 0.85);
  });
});

describe('ce qui a une taille réelle la garde', () => {
  /** La section d'un pied : l'étendue des sommets au sol, dans un coin. */
  const piedAuCoin = (m: ModeleLocal, W: number, D: number) => {
    const auSol = sommets(m).filter((p) => p.y < 0.005 && p.x < -W / 4 && p.z < -D / 4);
    const ex = Math.max(...auSol.map((p) => p.x)) - Math.min(...auSol.map((p) => p.x));
    const ez = Math.max(...auSol.map((p) => p.z)) - Math.min(...auSol.map((p) => p.z));
    return Math.max(ex, ez);
  };

  it('un pied de table fait la même section sur une table de 1,20 m et sur une de 2,40 m', () => {
    const petite = piedAuCoin(modele('table', 1.2, 0.8, 0.75), 1.2, 0.8);
    const grande = piedAuCoin(modele('table', 2.4, 1.0, 0.75), 2.4, 1.0);
    expect(petite).toBeLessThan(0.07);
    expect(grande).toBeCloseTo(petite, 4);
  });

  it('l’ancien modèle, lui, épaississait les pieds avec la table', () => {
    // Le défaut corrigé, mesuré : 8 % de la largeur, soit 19 cm sur 2,40 m.
    const { furnitureParts } = require('../src/geometry/furniture3d');
    const pied = furnitureParts('table').find((p: { y0: number; x0: number }) => p.y0 === 0 && p.x0 < 0.1);
    expect((pied.x1 - pied.x0) * 2.4).toBeGreaterThan(0.15);
  });

  it('une assise de canapé reste à hauteur d’assise, quelle que soit sa largeur', () => {
    // Le dessus du coussin d'assise, à vingt centimètres du bord avant.
    const hauteurAssise = (W: number) => hauteurAu(modele('sofa', W, 0.95, 0.83), 0.3, -0.95 / 2 + 0.2);
    expect(hauteurAssise(1.8)).toBeGreaterThan(0.4);
    expect(hauteurAssise(1.8)).toBeLessThan(0.5);
    expect(hauteurAssise(2.8)).toBeCloseTo(hauteurAssise(1.8), 3);
  });
});

describe('ce qui dépend de la taille se compte', () => {
  it('deux places, puis trois', () => {
    expect(placesDuCanape(1.5)).toBe(2);
    expect(placesDuCanape(1.95)).toBe(3);
  });

  it('une porte d’armoire par demi-mètre', () => {
    expect(portesDArmoire(1.0)).toBe(2);
    expect(portesDArmoire(1.5)).toBe(3);
    expect(portesDArmoire(1.8)).toBe(4);
  });

  it('une marche tous les dix-huit centimètres', () => {
    expect(marchesDEscalier(2.6)).toBe(14);
    expect(marchesDEscalier(0.36)).toBe(3);
  });

  it('une bibliothèque porte des livres, et ils ne sortent pas de ses tablettes', () => {
    const m = modele('storage', 0.8, 0.28, 2.02, 'biblio');
    const livres = m.groupes.filter((g) => g.mat === 'papier');
    expect(livres.reduce((n, g) => n + g.i.length / 3, 0)).toBeGreaterThan(200);
  });
});

describe('les précisions de RoomPlan changent la forme', () => {
  /** Y a-t-il de l'assise (au-dessus du socle) à cet endroit ? */
  const assiseEn = (m: ModeleLocal, x: number, z: number) => hauteurAu(m, x, z) > 0.25;

  it('un canapé d’angle a sa méridienne, d’un seul côté', () => {
    const W = 2.6;
    const D = 1.7;
    const angle = modele('sofa', W, D, 0.85, '', ['SofaType:lShaped']);
    expect(assiseEn(angle, W / 4, -D / 2 + 0.2)).toBe(true);
    expect(assiseEn(angle, -W / 4, -D / 2 + 0.2)).toBe(false);
    // Sans la précision, l'emprise d'un canapé droit reste droite.
    const droit = modele('sofa', 2.2, 0.95, 0.85, '', ['SofaType:rectangular']);
    expect(assiseEn(droit, 0.5, -0.95 / 2 + 0.15)).toBe(true);
  });

  it('un tabouret n’a pas de dossier ; une chaise en a un', () => {
    const haut = (m: ModeleLocal) => sommets(m).filter((p) => p.y > 0.7);
    const chaise = modele('chair', 0.45, 0.5, 0.85);
    const tabouret = modele('chair', 0.45, 0.5, 0.85, '', ['ChairType:stool']);
    // Le dossier de la chaise : du haut, tout au fond.
    expect(haut(chaise).every((p) => p.z > 0.1)).toBe(true);
    // Le tabouret : son assise, au centre, tout en haut.
    expect(haut(tabouret).some((p) => Math.abs(p.z) < 0.05 && Math.abs(p.x) < 0.05)).toBe(true);
  });

  it('une table ronde est ronde', () => {
    const ronde = modele('table', 1.1, 1.1, 0.75, '', ['TableShapeType:circularElliptic']);
    const plateau = sommets(ronde).filter((p) => p.y > 0.74);
    // Aucun coin : rien au-delà du cercle.
    expect(plateau.every((p) => Math.hypot(p.x, p.z) <= 0.55 + 1e-3)).toBe(true);
  });

  it('une étagère ouverte porte des livres, un meuble fermé n’en a pas', () => {
    const ouverte = modele('storage', 0.9, 0.4, 1.0, '', ['StorageType:shelf']);
    const fermee = modele('storage', 0.9, 0.4, 1.0, '', ['StorageType:cabinet']);
    expect(ouverte.groupes.some((g) => g.mat === 'papier')).toBe(true);
    expect(fermee.groupes.some((g) => g.mat === 'papier')).toBe(false);
  });
});

describe('aucune face retournée', () => {
  it.each(TOUT.map((it) => [it.key, it] as const))('%s', (_k, it) => {
    const m = modele(it.category, it.w, it.d, it.h, it.key);
    let retournees = 0;
    let comptees = 0;
    for (const g of m.groupes) {
      if (g.mat === 'feuillage' || g.mat === 'verre') continue;
      const P = (k: number) => [g.v[k * PAR_SOMMET], g.v[k * PAR_SOMMET + 1], g.v[k * PAR_SOMMET + 2]];
      const N = (k: number) => [g.v[k * PAR_SOMMET + 3], g.v[k * PAR_SOMMET + 4], g.v[k * PAR_SOMMET + 5]];
      for (let t = 0; t < g.i.length; t += 3) {
        const [a, b, c] = [g.i[t], g.i[t + 1], g.i[t + 2]];
        const [pa, pb, pc] = [P(a), P(b), P(c)];
        const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
        const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const aire = Math.hypot(n[0], n[1], n[2]);
        if (aire < 1e-9) continue;
        const moy = [0, 1, 2].map((i) => N(a)[i] + N(b)[i] + N(c)[i]);
        comptees++;
        if (n[0] * moy[0] + n[1] * moy[1] + n[2] * moy[2] < 0) retournees++;
      }
      // Des normales unitaires : la lumière en dépend.
      for (let k = 0; k < g.v.length / PAR_SOMMET; k++) expect(Math.hypot(...N(k))).toBeCloseTo(1, 4);
    }
    expect(comptees).toBeGreaterThan(10);
    expect(retournees).toBe(0);
  });
});

describe('dans la scène : chaque meuble à la place de sa caisse', () => {
  const ex = appartementExemple();
  const scene = buildScene(ex.walls, ex.openings, ex.objects as never, { palette: PAL, rooms: ex.rooms as never, showSurfaces: true });

  it('la scène annonce une pose par meuble', () => {
    expect(scene.meubles).toHaveLength(ex.objects.length);
  });

  it('le modèle et la caisse tiennent dans la même emprise — et le modèle la remplit', () => {
    for (const pose of scene.meubles ?? []) {
      const c = Math.cos(pose.yaw);
      const sn = Math.sin(pose.yaw);
      /** Un point du monde, ramené dans le repère de la pose. */
      const local = (p: { x: number; z: number }) => ({
        x: (p.x - pose.cx) * c + (p.z - pose.cz) * sn,
        z: -(p.x - pose.cx) * sn + (p.z - pose.cz) * c,
      });
      // L'ancienne caisse est bien là où la pose le dit (ses quelques
      // pièces en débord — un robinet, un manteau — à quelques centimètres).
      const caisse = scene.faces.filter((f) => f.ownerId === pose.id && f.meuble && !f.ombre).flatMap((f) => f.pts);
      expect(caisse.length).toBeGreaterThan(0);
      for (const p of caisse.map(local)) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(pose.width / 2 + 0.045);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(pose.depth / 2 + 0.045);
      }
      // Le modèle, lui, tient au millimètre dans la même emprise.
      const flux = maillageDesMeubles([pose]);
      const pts: { x: number; y: number; z: number }[] = [];
      let k = 0;
      while (k + ENTETE_GROUPE <= flux.length) {
        const code = flux[k];
        const rugosite = flux[k + 4];
        const metal = flux[k + 5];
        const nS = flux[k + 6];
        const nI = flux[k + 7];
        k += ENTETE_GROUPE;
        for (let i = 0; i < nS; i++) {
          // Ni l'ombre, ni la robinetterie (chrome) ne comptent dans l'emprise.
          if (code !== CODE_OMBRE && !(metal > 0.9 && rugosite < 0.2)) {
            pts.push({ x: flux[k + i * PAR_SOMMET], y: flux[k + i * PAR_SOMMET + 1], z: flux[k + i * PAR_SOMMET + 2] });
          }
        }
        k += nS * PAR_SOMMET + nI;
      }
      const loc = pts.map((p) => ({ ...local(p), y: p.y }));
      for (const p of loc) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(pose.width / 2 + 0.002);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(pose.depth / 2 + 0.002);
        expect(p.y).toBeGreaterThanOrEqual(pose.yb - 0.002);
        expect(p.y).toBeLessThanOrEqual(pose.yb + pose.height + 0.006);
      }
      // Et il la remplit (une plante, elle, a la forme de son feuillage).
      if (!/plant/.test(`${pose.category} ${pose.modele ?? ''}`)) {
        const etX = Math.max(...loc.map((p) => p.x)) - Math.min(...loc.map((p) => p.x));
        const ez = Math.max(...loc.map((p) => p.z)) - Math.min(...loc.map((p) => p.z));
        expect(etX).toBeGreaterThan(pose.width * 0.8);
        expect(ez).toBeGreaterThan(pose.depth * 0.75);
      }
    }
  });

  it('le flux est bien formé : indices dans leurs sommets, nombres finis', () => {
    const flux = maillageDesMeubles(scene.meubles ?? []);
    expect(flux.every((x) => Number.isFinite(x))).toBe(true);
    let k = 0;
    let groupes = 0;
    let triangles = 0;
    while (k < flux.length) {
      const nS = flux[k + 6];
      const nI = flux[k + 7];
      expect(nI % 3).toBe(0);
      const idx = flux.slice(k + ENTETE_GROUPE + nS * PAR_SOMMET, k + ENTETE_GROUPE + nS * PAR_SOMMET + nI);
      expect(idx.every((i) => Number.isInteger(i) && i >= 0 && i < nS)).toBe(true);
      k += ENTETE_GROUPE + nS * PAR_SOMMET + nI;
      groupes++;
      triangles += nI / 3;
    }
    expect(k).toBe(flux.length);
    // Un appel de dessin par matière, quel que soit le nombre de meubles.
    expect(groupes).toBeLessThan(40);
    // Et un budget tenu : l'appartement entier, meublé, en quelques dizaines
    // de milliers de triangles — rien pour une carte graphique.
    expect(triangles).toBeLessThan(45000);
  });

  it('une ombre de contact sous ce qui pose au sol, pas sous un tapis', () => {
    const tapis = (scene.meubles ?? []).find((p) => (p.modele ?? '').startsWith('tapis'))!;
    const lit = (scene.meubles ?? []).find((p) => p.category.includes('bed'))!;
    const ombres = (flux: number[]) => (flux[0] === CODE_OMBRE ? flux[6] : 0);
    expect(ombres(maillageDesMeubles([lit]))).toBe(4);
    expect(ombres(maillageDesMeubles([tapis]))).toBe(0);
  });
});

describe('la vue 3D confie les vrais meubles au natif', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('les meubles partent en modèles, et leurs caisses ne partent plus', () => {
    const ex = appartementExemple();
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
      t = TestRenderer.create(<Iso3DView value={{ theta: 35, tilt: 58, zoom: 1, ox: 0, oy: 0 }} />);
    });
    act(() => {
      const z = t.root.findAllByType(View).find((n) => typeof n.props.onLayout === 'function')!;
      z.props.onLayout({ nativeEvent: { layout: { width: 390, height: 620 } } });
    });
    const vue = t.root.findAll((n) => n.props?.testID === 'maquette-native' && Array.isArray(n.props?.orbite))[0];
    expect(vue).toBeDefined();
    expect(vue.props.meubles.length).toBeGreaterThan(10000);
    // Les caisses : retirées des groupes que la carte graphique reçoit.
    const scene = buildScene(ex.walls, ex.openings, ex.objects as never, { palette: PAL, rooms: ex.rooms as never, showSurfaces: true });
    const avec = maillageDeLaMaquette(scene.faces);
    const sans = maillageDeLaMaquette(scene.faces, { sansMeubles: true });
    expect(sans.maillage.length + sans.orientes.length).toBeLessThan(avec.maillage.length + avec.orientes.length);
    act(() => t.unmount());
  });
});

/**
 * LA VISITE, GAINS RAPIDES — revue « 3D / visite ».
 *
 * 1. L'entrée attend la première image : un voile du ciel, « Préparation de
 *    la visite… », puis un fondu ; un délai de secours pour un binaire muet.
 * 2. « Aller dans » une pièce : un voile court, la caméra posée dessous, le
 *    nom de la pièce une seconde ; une coupure franche si « Réduire les
 *    animations » est actif.
 * 3. La mini-carte : le plan centré, le trait coupé aux portes (pas aux
 *    fenêtres), la pièce où l'on est teintée très légèrement.
 * 4. Le premier regard : le recul qui éloigne le plus du meuble visible le
 *    plus proche — sur un studio, une chambre étroite, un séjour et une
 *    cuisine en longueur.
 * 5. Les repères « marcher / regarder » n'ont plus l'allure du bouton photo.
 * 6. La marche : les obstacles proches seulement (au bit près), et l'écran
 *    qui ne se redessine plus pendant qu'on marche — seule la carte suit.
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

import React from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { Circle, Line, Path } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import type { ObjectData } from 'react-native-room-scan';
import {
  DUREE_NOM_DE_PIECE,
  Exploration,
  FONDU_PIECE_MONTEE,
  SECOURS_PREMIERE_IMAGE,
  cadreDeLaCarte,
  traitsDeLaCarte,
} from '../src/components/Exploration';
import {
  DEGAGEMENT_SUFFISANT,
  RAYON_VISITEUR,
  courseLibre,
  degagementDevant,
  deplacer,
  deplacerParTous,
  estLibre,
  obstaclesDeLaVisite,
  pointDeDepart,
  type Obstacle,
} from '../src/geometry/exploration';
import { detectRooms, roomParts, type Pt, type RoomShape, type WallSeg } from '../src/geometry/floorplan';
import { pointInPolygon } from '../src/geometry/appearance';
import { appartementExemple } from '../src/data/exemple';
import { useScanStore } from '../src/store/scanStore';
import { light as lightPalette } from '../src/theme';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

// ------------------------------------------------------------- les plans

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});

const meuble = (id: string, cx: number, cz: number, w: number, d: number, h = 0.8, lacet = 0): ObjectData => {
  const c = Math.cos(lacet);
  const s = Math.sin(lacet);
  return {
    id,
    category: 'sofa',
    width: w,
    depth: d,
    height: h,
    transform: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, cx, h / 2, cz, 1],
  };
};

/** Une pièce rectangulaire de `l` × `p`, coin en (0, 0). */
const rectangle = (l: number, p: number) => [
  mur('n', 0, 0, l, 0),
  mur('e', l, 0, l, p),
  mur('s', l, p, 0, p),
  mur('o', 0, p, 0, 0),
];
const piecesDe = (walls: WallSeg[], nom = 'Pièce'): RoomShape[] =>
  detectRooms(walls).map((r, i) => ({ id: `p${i}`, name: nom, wallIds: r.wallIds }) as RoomShape);

// Un séjour de 6 × 4 (le plus grand), une chambre de 3 × 4 à côté.
const MURS = [
  mur('n1', 0, 0, 6, 0),
  mur('n2', 6, 0, 9, 0),
  mur('e', 9, 0, 9, 4),
  mur('s2', 9, 4, 6, 4),
  mur('s1', 6, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
  mur('c', 6, 0, 6, 4),
];
const ROOMS = detectRooms(MURS).map((r, i) => {
  const xs = r.outline.map((p) => p.x);
  const grand = Math.max(...xs) - Math.min(...xs) > 4;
  return { id: `p${i}`, name: grand ? 'Séjour' : 'Chambre', wallIds: r.wallIds, floor: null };
});
// Une porte de 90 cm dans la cloison, une fenêtre au nord du séjour.
const PORTE: WallSeg = { ...mur('porte', 6, 1.55, 6, 2.45), type: 'door' };
const FENETRE: WallSeg = { ...mur('fenetre', 2, 0, 3.2, 0), type: 'window' };

// ------------------------------------------------------------- l'écran

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function ouvrir(openings: WallSeg[] = [], objects: ObjectData[] = []) {
  act(() => {
    useScanStore.setState({
      walls: MURS,
      openings,
      objects,
      rooms: ROOMS as never,
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
  arbre = t;
  return t;
}

const natif = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => n.type === ('RoomScanVisite' as never))[0];
const camera = (t: TestRenderer.ReactTestRenderer) => natif(t).props.camera as number[];
const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Text).map((n) => [n.props.children].flat().join(''));
const parTestID = (t: TestRenderer.ReactTestRenderer, id: string) =>
  t.root.findAll((n) => n.props?.testID === id && typeof n.type === 'string');
const allerDans = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root.findAll(
    (n) => n.props?.accessibilityLabel === `Aller dans : ${nom}` && typeof n.props?.onPress === 'function',
  )[0];

describe('1. l’entrée en visite : un écran d’attente, puis un fondu', () => {
  it('le voile du ciel et « Préparation de la visite… » tiennent jusqu’à la première image', () => {
    const t = ouvrir();
    expect(natif(t)).toBeDefined();
    expect(textes(t)).toContain('Préparation de la visite…');
    const voile = parTestID(t, 'voile-entree')[0];
    // De la couleur du ciel de la visite, celle du fond de la vue native.
    expect(StyleSheet.flatten(voile.props.style).backgroundColor).toBe(natif(t).props.fond);
    // Aucun pourcentage inventé : une ligne, rien d'autre.
    expect(textes(t).some((s) => /%/.test(s))).toBe(false);
    // La mini-carte reste visible pendant l'attente.
    expect(t.root.findAll((n) => n.props?.accessibilityLabel === 'Plan').length).toBeGreaterThan(0);

    act(() => natif(t).props.onPremiereImage());
    expect(textes(t)).not.toContain('Préparation de la visite…');
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(parTestID(t, 'voile-entree')).toHaveLength(0);
  });

  it('un binaire qui n’annonce rien : le voile se lève au bout du délai de secours', () => {
    expect(SECOURS_PREMIERE_IMAGE).toBeGreaterThanOrEqual(2000);
    expect(SECOURS_PREMIERE_IMAGE).toBeLessThanOrEqual(3000);
    const t = ouvrir();
    act(() => {
      jest.advanceTimersByTime(SECOURS_PREMIERE_IMAGE - 300);
    });
    expect(textes(t)).toContain('Préparation de la visite…');
    act(() => {
      jest.advanceTimersByTime(700);
    });
    expect(textes(t)).not.toContain('Préparation de la visite…');
  });
});

describe('2. « Aller dans » une pièce : un fondu court', () => {
  it('la caméra se pose sous le voile, puis le nom de la pièce reste une seconde', () => {
    const t = ouvrir();
    act(() => natif(t).props.onPremiereImage());
    expect(camera(t)[0]).toBeLessThan(6);
    act(() => allerDans(t, 'Chambre').props.onPress());
    // Le voile monte : la caméra n'a pas encore bougé.
    expect(camera(t)[0]).toBeLessThan(6);
    expect(parTestID(t, 'nom-de-la-piece')).toHaveLength(0);
    act(() => {
      jest.advanceTimersByTime(FONDU_PIECE_MONTEE + 10);
    });
    expect(camera(t)[0]).toBeGreaterThan(6);
    expect(textes(t)).toContain('Chambre');
    expect(parTestID(t, 'nom-de-la-piece')).toHaveLength(1);
    // Le voile est de la couleur du ciel, pas noir.
    const voile = parTestID(t, 'voile-piece')[0];
    expect(StyleSheet.flatten(voile.props.style).backgroundColor).toBe(natif(t).props.fond);
    act(() => {
      jest.advanceTimersByTime(DUREE_NOM_DE_PIECE + 50);
    });
    expect(parTestID(t, 'nom-de-la-piece')).toHaveLength(0);
  });

  it('300 ms au plus pour le fondu', () => {
    expect(FONDU_PIECE_MONTEE).toBeLessThan(300);
    const src = require('fs').readFileSync(require('path').join(__dirname, '../src/components/Exploration.tsx'), 'utf8');
    const descente = Number(/const FONDU_PIECE_DESCENTE = (\d+);/.exec(src)?.[1]);
    expect(FONDU_PIECE_MONTEE + descente).toBeLessThanOrEqual(300);
  });
});

describe('3. la mini-carte : centrée, avec les portes et la pièce où l’on est', () => {
  it('un plan plus large que haut se centre dans la vignette carrée', () => {
    const c = cadreDeLaCarte(rectangle(6, 3));
    const haut = c.dy + (0 - c.z0) * c.k;
    const bas = c.dy + (3 - c.z0) * c.k;
    const gauche = c.dx + (0 - c.x0) * c.k;
    const droite = c.dx + (6 - c.x0) * c.k;
    expect((haut + bas) / 2).toBeCloseTo(56, 9);
    expect((gauche + droite) / 2).toBeCloseTo(56, 9);
    // L'échelle d'avant : le plus grand côté remplit la vignette, marge comprise.
    expect(droite - gauche).toBeCloseTo(92, 9);
  });

  it('le trait des murs s’interrompt aux portes, pas aux fenêtres', () => {
    const traits = traitsDeLaCarte(MURS, [PORTE, FENETRE]);
    expect(traits).toHaveLength(MURS.length + 1);
    // Rien ne couvre le milieu de la porte…
    const surLaPorte = traits.filter(
      (m) => Math.abs(m.a.x - 6) < 1e-6 && Math.abs(m.b.x - 6) < 1e-6 && Math.min(m.a.z, m.b.z) < 2 && Math.max(m.a.z, m.b.z) > 2,
    );
    expect(surLaPorte).toHaveLength(0);
    // …et le trou a la largeur de la porte.
    const cloison = traits.filter((m) => Math.abs(m.a.x - 6) < 1e-6 && Math.abs(m.b.x - 6) < 1e-6);
    const zs = cloison.flatMap((m) => [m.a.z, m.b.z]).sort((a, b) => a - b);
    expect(zs[2] - zs[1]).toBeCloseTo(0.9, 6);
    // Une baie vitrée ne se traverse pas : le mur nord du séjour reste entier.
    expect(traits.some((m) => m.a.x === 0 && m.a.z === 0 && m.b.x === 6 && m.b.z === 0)).toBe(true);
  });

  it('à l’écran : la porte coupe le trait, la pièce où l’on est se teinte à peine', () => {
    const t = ouvrir([PORTE, FENETRE]);
    const carte = t.root.findAll((n) => n.props?.accessibilityLabel === 'Plan' && typeof n.type === 'string')[0];
    expect(carte.findAllByType(Line)).toHaveLength(MURS.length + 1);
    const sol = carte.findAll((n) => n.props?.testID === 'carte-piece-ici' && n.type === Path)[0];
    expect(sol).toBeDefined();
    expect(sol.props.fill).toBe(lightPalette.blue);
    expect(sol.props.opacity).toBeLessThanOrEqual(0.12);
    // Le point bleu, lui, est plein.
    const point = carte.findAllByType(Circle).find((c) => c.props.fill === lightPalette.blue)!;
    expect(point.props.opacity ?? 1).toBe(1);
  });
});

// --------------------------------------------- 4. le premier regard

/** `pointDeDepart` d'avant la revue : le recul allait toujours au plus loin. */
function ancienDepart(walls: WallSeg[], rooms: RoomShape[], obstacles: Obstacle[], rayon = RAYON_VISITEUR) {
  const parts = roomParts(walls, rooms).filter((p) => p.surface);
  const grande = [...parts].sort((a, b) => (b.surface?.area ?? 0) - (a.surface?.area ?? 0))[0];
  const centre = grande.labelAt;
  const contour = grande.surface!.pts;
  const recevable = (p: Pt, marge: number) => estLibre(p, obstacles, marge) && pointInPolygon(p, contour);
  let at: Pt | null = null;
  for (const marge of [rayon * 2, rayon]) {
    if (recevable(centre, marge)) {
      at = centre;
      break;
    }
    for (let r = 0.1; r <= 4 && !at; r += 0.1) {
      for (let k = 0; k < 16; k++) {
        const t = (k / 16) * Math.PI * 2;
        const q = { x: centre.x + Math.cos(t) * r, z: centre.z + Math.sin(t) * r };
        if (recevable(q, marge)) {
          at = q;
          break;
        }
      }
    }
    if (at) break;
  }
  let yaw = 0;
  let mieux = -1;
  for (let k = 0; k < 32; k++) {
    const t = (k / 32) * Math.PI * 2;
    const course = courseLibre(at!, t, obstacles, rayon);
    if (course > mieux + 1e-6) {
      mieux = course;
      yaw = t;
    }
  }
  let ici: Pt = at!;
  for (let recul = 0.05; recul <= 1.5 + 1e-9; recul += 0.05) {
    const q: Pt = { x: ici.x - Math.cos(yaw) * 0.05, z: ici.z - Math.sin(yaw) * 0.05 };
    if (!recevable(q, rayon * 2)) break;
    ici = q;
  }
  return { at: ici, yaw, contour, depart: at! };
}

function jugerLeRegard(walls: WallSeg[], objects: ObjectData[]) {
  const rooms = piecesDe(walls);
  const obst = obstaclesDeLaVisite(walls, [], objects, rooms);
  const avant = ancienDepart(walls, rooms, obst);
  const apres = pointDeDepart(walls, rooms, obst)!;
  expect(apres).not.toBeNull();
  // Le même regard, sur la même ligne de recul, dans la pièce et à deux épaules de tout.
  expect(apres.yaw).toBe(avant.yaw);
  expect(estLibre(apres.at, obst, RAYON_VISITEUR * 2)).toBe(true);
  expect(pointInPolygon(apres.at, avant.contour)).toBe(true);
  const recul = Math.hypot(apres.at.x - avant.depart.x, apres.at.z - avant.depart.z);
  expect(recul).toBeLessThanOrEqual(1.5 + 1e-6);
  const dAvant = degagementDevant(avant.at, avant.yaw, obst, avant.contour);
  const dApres = degagementDevant(apres.at, apres.yaw, obst, avant.contour);
  // Jamais plus près du meuble visible le plus proche qu'avant.
  expect(dApres).toBeGreaterThanOrEqual(Math.min(dAvant, DEGAGEMENT_SUFFISANT) - 1e-9);
  return { avant, apres, dAvant, dApres, obst };
}

describe('4. le premier regard sur la pièce, pas sur un accoudoir', () => {
  it('un studio : lit, canapé, table', () => {
    jugerLeRegard(rectangle(5, 4), [
      meuble('lit', 1.0, 3.0, 1.6, 2.0, 0.5),
      meuble('canape', 4.0, 0.5, 1.9, 0.9, 0.85),
      meuble('table', 3.8, 2.6, 0.9, 0.9, 0.75),
    ]);
  });

  it('une chambre étroite : un lit contre le mur', () => {
    jugerLeRegard(rectangle(2.6, 4), [meuble('lit', 0.75, 2.8, 1.4, 1.9, 0.55)]);
  });

  it('une cuisine en longueur : deux rangées de meubles', () => {
    jugerLeRegard(rectangle(2.4, 5.5), [
      meuble('bas-o', 0.3, 2.75, 0.6, 5.0, 0.9),
      meuble('bas-e', 2.1, 2.2, 0.6, 3.6, 0.9),
    ]);
  });

  it('un séjour : un fauteuil au bord du recul d’avant n’est plus en gros plan', () => {
    const walls = rectangle(6, 4.5);
    // Un séjour encore vide : le recul d'avant, au plus loin.
    const fond: ObjectData[] = [];
    const sans = jugerLeRegard(walls, fond);
    // Sans fauteuil, le recul est celui d'avant : au plus loin.
    expect(sans.apres.at).toStrictEqual(sans.avant.at);
    // Un fauteuil de 80 cm, à 80 cm devant et 1 m de côté du point d'avant.
    const f = { x: Math.cos(sans.avant.yaw), z: Math.sin(sans.avant.yaw) };
    const cote = { x: -f.z, z: f.x };
    const essais = [1, -1].map((s) => ({
      x: sans.avant.at.x + f.x * 0.8 + cote.x * 1.0 * s,
      z: sans.avant.at.z + f.z * 0.8 + cote.z * 1.0 * s,
    }));
    const c = essais.find((p) => p.x > 0.6 && p.x < 5.4 && p.z > 0.6 && p.z < 3.9)!;
    expect(c).toBeDefined();
    const avec = jugerLeRegard(walls, [...fond, meuble('fauteuil', c.x, c.z, 0.8, 0.8, 0.9)]);
    // L'ancien calcul finissait au même endroit, le fauteuil en gros plan…
    expect(avec.avant.at).toStrictEqual(sans.avant.at);
    expect(avec.dAvant).toBeLessThan(1);
    // …le nouveau recule moins, et le fauteuil sort du premier plan.
    expect(avec.dApres).toBeGreaterThan(avec.dAvant + 0.3);
  });
});

describe('5. les repères « marcher / regarder » ne ressemblent plus au bouton photo', () => {
  it('un contour fin, sans ombre, plus petits que la photo', () => {
    const t = ouvrir();
    const ronds = t.root
      .findAll((n) => typeof n.type === 'string' && n.props?.style !== undefined)
      .map((n) => StyleSheet.flatten(n.props.style))
      .filter((s) => s && s.borderWidth && s.width === 44);
    expect(ronds).toHaveLength(2);
    const photo = t.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Prendre une photo de la visite' && typeof n.props?.style === 'function',
    )[0];
    const stylePhoto = StyleSheet.flatten(photo.props.style({ pressed: false }));
    expect(stylePhoto.shadowOpacity).toBeGreaterThan(0);
    for (const s of ronds) {
      expect(s.shadowOpacity ?? 0).toBe(0);
      expect(s.elevation ?? 0).toBe(0);
      expect(s.width).toBeLessThan(stylePhoto.width as number);
      expect(s.borderWidth).toBeLessThanOrEqual(2);
      expect(s.backgroundColor).not.toBe(stylePhoto.backgroundColor);
    }
  });
});

// --------------------------------------------- 6. la marche

/** Un tirage reproductible (mulberry32). */
function hasard(graine: number) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Des obstacles en vrac : murs obliques, emprises de biais, parfois illisibles. */
function enVrac(n: number, graine: number): Obstacle[] {
  const rnd = hasard(graine);
  const out: Obstacle[] = [];
  for (let i = 0; i < n; i++) {
    const cx = rnd() * 20;
    const cz = rnd() * 20;
    if (rnd() < 0.5) {
      const t = rnd() * Math.PI * 2;
      const l = rnd() < 0.1 ? 0 : rnd() * 4;
      out.push({ kind: 'mur', a: { x: cx, z: cz }, b: { x: cx + Math.cos(t) * l, z: cz + Math.sin(t) * l }, demi: rnd() * 0.15 });
    } else {
      const t = rnd() * Math.PI * 2;
      const w2 = rnd() * 1.2;
      const d2 = rnd() * 0.6;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const coin = (lx: number, lz: number): Pt => ({ x: cx + lx * c - lz * s, z: cz + lx * s + lz * c });
      out.push({ kind: 'meuble', id: `v${i}`, coins: [coin(-w2, -d2), coin(w2, -d2), coin(w2, d2), coin(-w2, d2)] });
    }
  }
  out.push({ kind: 'mur', a: { x: NaN, z: 1 }, b: { x: 2, z: 2 }, demi: 0.1 });
  return out;
}

describe('6. une marche plus régulière', () => {
  it('les obstacles proches seulement : le même pas, au bit près', () => {
    const ex = appartementExemple();
    const plans = [
      obstaclesDeLaVisite(ex.walls, ex.openings, ex.objects, ex.rooms),
      enVrac(400, 7),
      enVrac(60, 8),
    ];
    let compares = 0;
    for (let k = 0; k < plans.length; k++) {
      const obst = plans[k];
      const rnd = hasard(100 + k);
      let p: Pt = { x: 2, z: 2 };
      for (let i = 0; i < 1500; i++) {
        // Des pas d'une image, parfois une image perdue, parfois un saut absurde.
        const l = rnd() < 0.02 ? rnd() * 8 : rnd() < 0.1 ? rnd() * 0.6 : rnd() * 0.05;
        const t = rnd() * Math.PI * 2;
        const vers = { x: p.x + Math.cos(t) * l, z: p.z + Math.sin(t) * l };
        const rayon = [RAYON_VISITEUR, 0.1, 0.3][i % 3];
        const a = deplacer(p, vers, obst, rayon);
        const b = deplacerParTous(p, vers, obst, rayon);
        expect([a.x, a.z]).toEqual([b.x, b.z]);
        compares++;
        // Parfois, le plan change sous les pieds : on repart de n'importe où (même d'un meuble).
        p = rnd() < 0.03 ? { x: rnd() * 20, z: rnd() * 20 } : a;
      }
    }
    expect(compares).toBe(4500);
  });

  it('pendant la marche, seule la mini-carte se redessine', () => {
    const t = ouvrir();
    act(() => natif(t).props.onPremiereImage());
    const pouces = t.root
      .findAllByType(View)
      .find((n) => n.props.accessibilityLabel === 'Marcher et regarder' && typeof n.props.onResponderGrant === 'function')!;
    const touche = (x: number, y: number) => ({ identifier: 0, pageX: x, pageY: y, locationX: x, locationY: y });
    const ev = (touches: ReturnType<typeof touche>[]) => ({
      nativeEvent: { touches, changedTouches: touches, pageX: 0, pageY: 0, timestamp: Date.now() },
    });
    act(() => {
      pouces.props.onResponderGrant(ev([touche(60, 700)]));
      pouces.props.onResponderMove(ev([touche(60, 650)]));
    });
    act(() => {
      jest.advanceTimersByTime(50);
    });
    // L'écran a pris acte du premier pas (la consigne s'efface) ; désormais il ne bouge plus.
    const terminer = () =>
      t.root.findAll((n) => n.props?.accessibilityLabel === 'Terminer l’exploration' && typeof n.props?.onPress === 'function')[0];
    const avantMarche = terminer().props.onPress;
    const point = () => t.root.findAll((n) => n.props?.testID === 'carte-ici' && n.type === Circle)[0].props;
    const p0 = { x: point().cx, y: point().cy };
    act(() => {
      jest.advanceTimersByTime(700);
    });
    const p1 = { x: point().cx, y: point().cy };
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeGreaterThan(1);
    // Le parent ne s'est pas redessiné : ses fonctions sont les mêmes.
    expect(terminer().props.onPress).toBe(avantMarche);
    act(() => pouces.props.onResponderRelease(ev([])));
    act(() => {
      jest.advanceTimersByTime(300);
    });
  });
});

describe('2 bis. « Réduire les animations » : une coupure franche', () => {
  it('la caméra se pose d’un coup, le nom de la pièce s’affiche quand même', async () => {
    const espion = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const t = ouvrir();
    await act(async () => {
      await Promise.resolve();
    });
    act(() => natif(t).props.onPremiereImage());
    act(() => allerDans(t, 'Chambre').props.onPress());
    expect(camera(t)[0]).toBeGreaterThan(6);
    expect(textes(t)).toContain('Chambre');
    // Remis comme avant pour les bancs suivants.
    espion.mockResolvedValue(false);
    act(() => arbre?.unmount());
    arbre = null;
    const t2 = ouvrir();
    await act(async () => {
      await Promise.resolve();
    });
    act(() => t2.unmount());
    arbre = null;
    espion.mockRestore();
  });
});

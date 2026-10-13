/**
 * LES PORTES EN VOLUME, LES SIÈGES DANS LE BON SENS.
 *
 * Relevé du patron : « ajoute des portes 3D lors des ouvrants portes ; si rien
 * derrière, la porte doit être fermée » — et « parfois les fauteuils sont
 * captés mais tournés vers le mur sans logique ; il faut manuellement les
 * tourner tout le temps ».
 */
import type { ObjectData } from 'react-native-room-scan';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { modeleDe, type PoseDeMeuble } from '../src/geometry/modeles3d';
import { orienterLesSieges } from '../src/geometry/sieges';
import type { WallSeg } from '../src/geometry/floorplan';
import { maillageDeLaVisite } from '../src/geometry/visite3d';
import { maillageDeLaMaquette } from '../src/geometry/maquette3d';
import { mixHex } from '../src/geometry/appearance';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAL: ScenePalette = {
  floor: '#EEEEEE',
  floorStroke: '#CCCCCC',
  wall: '#FFFFFF',
  wallStroke: '#888888',
  wallTop: '#F4F4F4',
  wallTopStroke: '#949494',
  opening: '#B9C2CE',
  door: '#E8A13B',
  window: '#3EB8E5',
  passage: '#2F6BFF',
  object: '#D8E1F2',
  objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  roomId = 'r1',
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId,
});

/** Deux pièces côte à côte : 0–4 m puis 4–7 m, la cloison en x = 4. */
const DEUX = [
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 3),
  mur('s', 4, 3, 0, 3),
  mur('o', 0, 3, 0, 0),
  mur('n2', 4, 0, 7, 0, 'r2'),
  mur('e2', 7, 0, 7, 3, 'r2'),
  mur('s2', 7, 3, 4, 3, 'r2'),
  mur('o2', 4, 3, 4, 0, 'r2'),
];

const porte = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  roomId = 'r1',
): WallSeg => ({
  id,
  type: 'door',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.05,
  yCenter: 1.025,
  roomId,
});

const boite = (
  id: string,
  category: string,
  cx: number,
  cz: number,
  w: number,
  d: number,
  h = 0.8,
): ObjectData => ({
  id,
  category,
  width: w,
  depth: d,
  height: h,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, h / 2, cz, 1],
});

const scene = (
  walls: WallSeg[],
  openings: WallSeg[],
  objects: ObjectData[] = [],
  rooms = [{ id: 'r1' }, { id: 'r2' }],
) =>
  buildScene(walls, openings, objects, {
    palette: PAL,
    showSurfaces: true,
    rooms,
  });

const portesDe = (s: ReturnType<typeof buildScene>) =>
  (s.meubles ?? []).filter(m => m.category === 'porte3d');
const attr = (m: PoseDeMeuble, k: string) =>
  (m.attributes ?? []).find(a => a.startsWith(`${k}:`))?.split(':')[1];

describe('une porte en volume à chaque ouvrant porte', () => {
  it('la porte de la cloison, entre deux pièces, s’ouvre', () => {
    const s = scene(DEUX, [porte('p', 4, 1, 4, 1.9)]);
    const [p] = portesDe(s);
    expect(p).toBeDefined();
    expect(p.width).toBeCloseTo(0.9, 2);
    // Au cœur de la cloison : relevée depuis la première pièce, son trait
    // est sa face, et son épaisseur part dans la seconde.
    expect(p.cx).toBeCloseTo(4.07, 2);
    expect(p.cz).toBeCloseTo(1.45, 2);
    expect(Number(attr(p, 'PorteAngle'))).toBeGreaterThan(0);
    // Elle se tient au seuil, à la hauteur de la baie.
    expect(p.height).toBeCloseTo(2.05, 2);
    expect(p.yb).toBeCloseTo(0, 2);
  });

  it('rien derrière — la porte d’entrée, sur le dehors — : fermée', () => {
    const s = scene(DEUX, [porte('entree', 1, 0, 1.9, 0)]);
    const [p] = portesDe(s);
    expect(p).toBeDefined();
    expect(attr(p, 'PorteAngle')).toBe('0');
  });

  it('un meuble dans le débattement, de chaque côté : elle reste fermée plutôt que de le traverser', () => {
    const s = scene(
      DEUX,
      [porte('p', 4, 1, 4, 1.9)],
      [
        boite('armoireA', 'storage', 3.55, 1.45, 0.7, 2, 2),
        boite('armoireB', 'storage', 4.45, 1.45, 0.7, 2, 2),
      ],
    );
    const [p] = portesDe(s);
    expect(attr(p, 'PorteAngle')).toBe('0');
  });

  it('un meuble à l’écart ne la gêne pas : grande ouverte', () => {
    const s = scene(
      DEUX,
      [porte('p', 4, 1, 4, 1.9)],
      [boite('lit', 'bed', 1.2, 1.5, 1.4, 1.9, 0.5)],
    );
    expect(attr(portesDe(s)[0], 'PorteAngle')).toBe('85');
  });

  it('le même gond que le dessin du plan', () => {
    const a = portesDe(
      scene(DEUX, [{ ...porte('p', 4, 1, 4, 1.9), pivot: 'a' }]),
    )[0];
    const b = portesDe(
      scene(DEUX, [{ ...porte('p', 4, 1, 4, 1.9), pivot: 'b' }]),
    )[0];
    expect(attr(a, 'PorteGond')).not.toBe(attr(b, 'PorteGond'));
  });

  it('le vantail ouvert sort de l’épaisseur du mur, du côté demandé ; fermé, il y reste', () => {
    const pose = (angle: number, sens: 1 | -1): PoseDeMeuble => ({
      id: `porte-${angle}-${sens}`,
      category: 'porte3d',
      width: 0.9,
      depth: 0.1,
      height: 2.05,
      cx: 0,
      cz: 0,
      yaw: 0,
      yb: 0,
      attributes: [
        `PorteAngle:${angle}`,
        'PorteGond:gauche',
        `PorteSens:${sens}`,
      ],
    });
    const etendue = (p: PoseDeMeuble) => {
      let min = Infinity;
      let max = -Infinity;
      for (const g of modeleDe(p).groupes)
        for (let k = 2; k < g.v.length; k += 8) {
          min = Math.min(min, g.v[k]);
          max = Math.max(max, g.v[k]);
        }
      return { min, max };
    };
    const fermee = etendue(pose(0, 1));
    expect(modeleDe(pose(0, 1)).triangles).toBeGreaterThan(20);
    expect(fermee.max).toBeLessThan(0.15);
    expect(fermee.min).toBeGreaterThan(-0.15);
    expect(etendue(pose(85, 1)).max).toBeGreaterThan(0.6);
    expect(etendue(pose(85, -1)).min).toBeLessThan(-0.6);
  });

  it('le canevas garde son seuil : la porte en volume ne vit que dans les flux de la carte graphique', () => {
    const s = scene(DEUX, [porte('p', 4, 1, 4, 1.9)]);
    // Les faces du canevas ne portent pas de vantail : il n'y a que les poses.
    expect(
      s.faces.some(f =>
        /porte3d/.test(String((f as { kind?: string }).kind ?? '')),
      ),
    ).toBe(false);
    expect(portesDe(s)).toHaveLength(1);
  });
});

describe('les fenêtres et les baies en volume, au bleu du dehors', () => {
  const fenetre = (
    id: string,
    ax: number,
    az: number,
    bx: number,
    bz: number,
    y0: number,
    y1: number,
  ): WallSeg => ({
    id,
    type: 'window',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: y1 - y0,
    yCenter: (y0 + y1) / 2,
    roomId: 'r1',
  });
  const fenetresDe = (s: ReturnType<typeof buildScene>) =>
    (s.meubles ?? []).filter(m => m.category === 'fenetre3d');

  it('une fenêtre d’allège : deux vantaux à la française, fermée, à sa hauteur, vitrée du bleu du dehors', () => {
    const s = scene(DEUX, [fenetre('f', 1, 0, 2.2, 0, 0.95, 2.15)]);
    const [f] = fenetresDe(s);
    expect(f).toBeDefined();
    expect(f.width).toBeCloseTo(1.2, 2);
    expect(f.yb).toBeCloseTo(0.95, 2);
    expect(f.height).toBeCloseTo(1.2, 2);
    expect(attr(f, 'FenetreType')).toBe('fenetre');
    expect(attr(f, 'Vantaux')).toBe('2');
    expect(f.color).toBe(mixHex(PAL.window, '#FFFFFF', 0.55));
    expect(f.murId).toBe('n');
  });

  it('jusqu’au sol : une porte-fenêtre ; large, une baie coulissante', () => {
    const s = scene(DEUX, [
      fenetre('pf', 0.5, 0, 1.4, 0, 0, 2.15),
      fenetre('baie', 4.5, 0, 6.9, 0, 0, 2.15),
    ]);
    const [pf, baie] = ['pf', 'baie'].map(
      id => fenetresDe(s).find(m => m.id === `fenetre-${id}`)!,
    );
    expect(attr(pf, 'FenetreType')).toBe('portefenetre');
    expect(attr(baie, 'FenetreType')).toBe('coulissant');
    expect(attr(baie, 'Vantaux')).toBe('2');
  });

  it('le vitrage est la matière du jour ; la crémone est côté pièce', () => {
    const pose = (sens: 1 | -1): PoseDeMeuble => ({
      id: `fenetre-${sens}`,
      category: 'fenetre3d',
      width: 1.2,
      depth: 0.2,
      height: 1.2,
      cx: 0,
      cz: 0,
      yaw: 0,
      yb: 0.95,
      color: '#ABCDEF',
      attributes: ['FenetreType:fenetre', 'Vantaux:2', `FenetreSens:${sens}`],
    });
    const m = modeleDe(pose(1));
    const vitrages = m.groupes.filter(g => g.mat === 'vitrage');
    expect(vitrages.length).toBeGreaterThan(0);
    expect(vitrages.every(g => g.couleur.toUpperCase() === '#ABCDEF')).toBe(
      true,
    );
    // Côté pièce : la menuiserie et sa poignée penchent vers +z quand la pièce y est.
    const zMax = (p: PoseDeMeuble) =>
      Math.max(
        ...modeleDe(p).groupes.flatMap(g => g.v.filter((_, k) => k % 8 === 2)),
      );
    const zMin = (p: PoseDeMeuble) =>
      Math.min(
        ...modeleDe(p).groupes.flatMap(g => g.v.filter((_, k) => k % 8 === 2)),
      );
    expect(zMax(pose(1))).toBeGreaterThan(-zMin(pose(1)));
    expect(-zMin(pose(-1))).toBeGreaterThan(zMax(pose(-1)));
    // Et tout tient dans l'épaisseur du mur, à la poignée près.
    expect(zMax(pose(1))).toBeLessThan(0.2 / 2 + 0.06);
  });

  it('la carte graphique saute l’aplat de la fenêtre ; le canevas le garde', () => {
    const s = scene(DEUX, [fenetre('f', 1, 0, 2.2, 0, 0.95, 2.15)]);
    const aplats = s.faces.filter(f => f.enVolume);
    expect(aplats.length).toBeGreaterThan(0);
    const avec = maillageDeLaVisite(s.faces);
    const sans = maillageDeLaVisite(s.faces, { sansMeubles: true });
    expect(sans.maillage.length).toBeLessThan(avec.maillage.length);
    const mAvec = maillageDeLaMaquette(s.faces);
    const mSans = maillageDeLaMaquette(s.faces, { sansMeubles: true });
    const tout = (x: typeof mAvec) =>
      x.maillage.length + x.orientes.length + x.ecorche.length;
    expect(tout(mSans)).toBeLessThan(tout(mAvec));
  });

  it('le natif peint le vitrage de sa propre teinte, un rien transparent, sans liseré', () => {
    const v = readFileSync(
      join(
        __dirname,
        '..',
        'modules/react-native-room-scan/ios/RoomScanVisite.swift',
      ),
      'utf8',
    );
    expect(v).toMatch(
      /case 6:[\s\S]{0,260}m\.lightingModel = \.constant[\s\S]{0,80}m\.transparency = 0\.82/,
    );
    expect(v).toContain('if code == 3 || code == 6 { n.renderingOrder = 6 }');
    expect(v).toContain('code != 5 && code != 6 {');
  });
});

describe('les sièges regardent la pièce, pas le mur', () => {
  const PIECE = [
    mur('n', 0, 0, 4, 0),
    mur('e', 4, 0, 4, 4),
    mur('s', 4, 4, 0, 4),
    mur('o', 0, 4, 0, 0),
  ];
  /** Un siège dont l'avant (−z local) pointe vers `avant`. */
  const siege = (
    id: string,
    category: string,
    cx: number,
    cz: number,
    avant: { x: number; z: number },
    d = 0.8,
  ): ObjectData => ({
    id,
    category,
    width: 0.8,
    depth: d,
    height: 0.9,
    // Colonne z locale = −avant ; colonne x = (z.z, −z.x) pour un repère direct.
    transform: [
      -avant.z,
      0,
      avant.x,
      0,
      0,
      1,
      0,
      0,
      -avant.x,
      0,
      -avant.z,
      0,
      cx,
      0.45,
      cz,
      1,
    ],
  });
  const avantDe = (o: ObjectData) => ({
    x: -o.transform[8],
    z: -o.transform[10],
  });

  it('le nez à 30 cm de la cloison, la pièce dans le dos : demi-tour', () => {
    const f = siege('f', 'chair', 2, 0.75, { x: 0, z: -1 });
    const [r] = orienterLesSieges([f], PIECE);
    expect(avantDe(r).z).toBeCloseTo(1, 5);
    // Un demi-tour, rien d'autre : même place, mêmes cotes.
    expect(r.transform[12]).toBe(2);
    expect(r.transform[14]).toBe(0.75);
    expect(r.width).toBe(0.8);
  });

  it('adossé au mur, il regarde déjà la pièce : on n’y touche pas', () => {
    const f = siege('f', 'chair', 2, 0.45, { x: 0, z: 1 });
    expect(orienterLesSieges([f], PIECE)[0]).toBe(f);
  });

  it('un canapé au milieu qui tourne le dos à la télé fait demi-tour', () => {
    const canape = {
      ...siege('c', 'sofa', 2, 2.6, { x: 0, z: 1 }, 0.9),
      width: 2,
    };
    const tv = boite('tv', 'television', 2, 0.15, 1.2, 0.1, 0.7);
    const [r] = orienterLesSieges([canape, tv], PIECE);
    expect(avantDe(r).z).toBeCloseTo(-1, 5);
  });

  it('une chaise glissée sous un bureau contre le mur : attablée, elle ne bouge pas', () => {
    const bureau = boite('b', 'table', 2, 0.35, 1.2, 0.6, 0.75);
    const chaise = siege('ch', 'chair', 2, 0.85, { x: 0, z: -1 }, 0.5);
    expect(orienterLesSieges([bureau, chaise], PIECE)[1]).toBe(chaise);
  });

  it('le reste du mobilier n’est jamais retourné', () => {
    const lit = boite('lit', 'bed', 2, 0.4, 1.6, 2);
    expect(orienterLesSieges([lit], PIECE)[0]).toBe(lit);
  });
});

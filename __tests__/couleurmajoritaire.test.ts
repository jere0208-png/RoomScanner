/**
 * UNE COULEUR PAR MUR — LA MAJORITAIRE —, ET PLUS DE DÉCOR RECOPIÉ.
 *
 * Relevé du patron : « enlève la récupération exacte des couleurs (et donc
 * décors des pièces) car c'est jamais qualitatif ; récupère simplement la
 * couleur majoritaire d'un mur pour la reconstituer ».
 *
 * Les orthophotos (l'image de chaque face de mur et du sol, collée sur la
 * 3D), la matière du sol devinée dans la grille (lattes, carreaux) et les
 * deux couleurs d'un meuble (dessus, côtés) disparaissent. Il reste, pour
 * chaque mur et chaque sol, UNE couleur : celle de la famille de teintes qui
 * couvre le plus de surface — mesurée là où la lumière la montre, pour ne
 * pas retomber dans le « sol violet » des cases dans l'ombre.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react-test-renderer';
import type { ObjectData, SurfaceData } from 'react-native-room-scan';
import { couleurMajoritaire } from '../src/geometry/appearance';
import { bilanDuReleve } from '../src/geometry/bilan';
import { buildScene } from '../src/geometry/scene3d';
import type { WallSeg } from '../src/geometry/floorplan';
import { MAQUETTE } from '../src/ui/maquette';
import { useScanStore } from '../src/store/scanStore';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 };
};
const lum = (hex: string) => {
  const c = rgb(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};
const ecart = (a: string, b: string) => {
  const x = rgb(a);
  const y = rgb(b);
  return Math.max(Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b));
};
const grille = (texels: string[], cols = 6) => ({ cols, rows: Math.ceil(texels.length / cols), texels });

describe('la couleur majoritaire d’un mur', () => {
  it('la teinte qui couvre le mur l’emporte sur quelques cases plus claires', () => {
    // Un mur beige, et six cases blanches : un cadre de fenêtre, un radiateur.
    const BEIGE = '#D2BE9A';
    const tex = grille([...Array(18).fill(BEIGE), ...Array(6).fill('#F6F4F0')]);
    expect(ecart(couleurMajoritaire(tex)!, BEIGE)).toBeLessThanOrEqual(6);
  });

  it('les nuances d’une même peinture, à l’ombre ou au jour, font une seule famille, rendue au jour', () => {
    const tex = grille(['#D8C8A8', '#C9B998', '#B3A485', '#D6C6A6', '#A89A7C', '#D0C0A0', '#BCAD8E', '#D8C8A8']);
    const c = couleurMajoritaire(tex)!;
    expect(lum(c)).toBeGreaterThan(lum('#C2B293'));
    expect(ecart(c, '#D8C8A8')).toBeLessThanOrEqual(14);
  });

  it('l’ombre profonde vote moins fort : le chêne éclairé gagne sur le violet sombre', () => {
    const S = '#4A4058';
    const C = '#C89A66';
    const tex = grille([S, S, C, S, S, C, S, S, S, S, C, S], 4);
    const c = couleurMajoritaire(tex)!;
    expect(rgb(c).r).toBeGreaterThan(rgb(c).b);
    expect(lum(c)).toBeGreaterThan(lum('#7A6E60'));
  });

  it('sans relevé, le repli répond', () => {
    expect(couleurMajoritaire(undefined, '#ABCDEF')).toBe('#ABCDEF');
    expect(couleurMajoritaire(undefined)).toBeUndefined();
  });
});

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});
const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];

describe('la 3D reconstitue, elle ne recopie plus', () => {
  const A = '#B98F5F';
  const SOMBRE = '#4A4058';
  /** Une grille de sol en lattes franches — que l'on ne lit plus comme telle. */
  const lattes = {
    cols: 6,
    rows: 4,
    texels: [...Array(6).fill(A), ...Array(6).fill(SOMBRE), ...Array(6).fill(A), ...Array(6).fill('#8A6A45')],
    minX: 0,
    minZ: 0,
    maxX: 4,
    maxZ: 3,
  };
  const ORTHO = {
    path: '/tmp/ortho-mur.jpg',
    cote: 1 as const,
    cx: 2,
    cz: 0,
    dx: 1,
    dz: 0,
    longueur: 4,
    hauteur: 2.5,
    yBas: 0,
    couverture: 0.9,
  };

  const scene = () =>
    buildScene(
      MURS.map((w) => ({ ...w, color: '#D2BE9A', texture: grille(Array(24).fill('#D2BE9A')), orthos: [ORTHO] })) as unknown as WallSeg[],
      [],
      [],
      {
        palette: MAQUETTE,
        showSurfaces: true,
        showTextures: true,
        rooms: [{ id: 'r1', wallIds: ['n', 'e', 's', 'o'] }],
        floors: {
          r1: {
            color: '#5A4E68',
            texture: lattes,
            ortho: { path: '/tmp/ortho-sol.jpg', minX: 0, minZ: 0, maxX: 4, maxZ: 3, y: 0, couverture: 0.9 },
          },
        },
      },
    );

  it('aucune face ne porte plus d’image, même d’un ancien plan qui en avait', () => {
    expect(scene().faces.filter((f) => f.habillage).length).toBe(0);
  });

  it('chaque mur porte sa couleur majoritaire', () => {
    const pans = scene().faces.filter((f) => f.captured && f.fill && !f.isFloor);
    expect(pans.length).toBeGreaterThan(0);
    for (const p of pans) expect(ecart(p.fill!, '#D2BE9A')).toBeLessThanOrEqual(6);
  });

  it('le sol aussi, et sans lattes devinées dans la grille', () => {
    const sc = scene();
    const sol = sc.faces.find((f) => f.isFloor && f.pts.length > 2)!;
    expect(sol.fill).toBe(couleurMajoritaire(lattes, '#5A4E68'));
    expect(sol.matiere).toBeUndefined();
    expect(sc.faces.filter((f) => f.isFloor && f.pts.length === 2)).toHaveLength(0);
  });
});

describe('le scan ne fabrique plus d’images de décor', () => {
  it('le natif ne projette plus les murs ni le sol en images', () => {
    const gerant = lire('modules/react-native-room-scan/ios/RoomScanManager.swift');
    expect(gerant).not.toContain('OrthophotosDuReleve');
    expect(gerant).not.toContain('sortie["orthos"]');
    expect(existsSync(join(__dirname, '..', 'modules/react-native-room-scan/ios/RoomScanOrtho.swift'))).toBe(false);
  });

  it('la fin du scan n’habille plus les murs, et montre les couleurs relevées', () => {
    const surface = (id: string, ax: number, az: number, bx: number, bz: number): SurfaceData =>
      ({ id, type: 'wall', length: Math.hypot(bx - ax, bz - az), height: 2.5, ax, az, bx, bz, color: '#D2BE9A' }) as SurfaceData;
    act(() => {
      useScanStore.setState({ showTextures: false });
      useScanStore.getState().finalize({
        modelPath: '',
        surfaces: [surface('n', 0, 0, 4, 0), surface('e', 4, 0, 4, 3), surface('s', 4, 3, 0, 3), surface('o', 0, 3, 0, 0)],
        objects: [] as ObjectData[],
        orthos: { murs: [{ wallId: 'n', ...{ path: '/tmp/a.jpg', cote: 1, cx: 2, cz: 0, dx: 1, dz: 0, longueur: 4, hauteur: 2.5, yBas: 0, couverture: 0.9 } }] },
      } as never);
    });
    const st = useScanStore.getState();
    expect(st.walls.every((w) => !w.orthos?.length)).toBe(true);
    expect(st.showTextures).toBe(true);
  });

  it('un meuble garde une seule couleur : plus de dessus relevé à part', () => {
    const scene3d = lire('src/geometry/scene3d.ts');
    expect(scene3d).not.toMatch(/couleurs: opts\.showTextures/);
  });
});

describe('le bilan du relevé ne note plus les images', () => {
  it('« Couleur des murs » et « Couleur du sol » remplacent les vraies images', () => {
    const b = bilanDuReleve({
      rooms: [{ id: 'r1', name: 'Séjour', floor: { color: '#C8B89A', texture: grille(Array(24).fill('#C8B89A')) }, releve: { plafond: { min: 2.5, max: 2.5, moyenne: 2.5 } as never } }] as never,
      walls: MURS.map((w) => ({ ...w, color: '#D2BE9A', confidence: 'high' })),
      openings: [],
      objects: [],
    })!;
    const libelles = b.criteres.map((c) => c.libelle);
    expect(libelles).toContain('Couleur des murs');
    expect(libelles).toContain('Couleur du sol');
    expect(libelles.join(' ')).not.toMatch(/vraie image/);
    expect(b.score).toBe(100);
  });
});

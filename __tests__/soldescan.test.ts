/**
 * LE SOL D'UN SCAN DIT SA VRAIE COULEUR — ET SA MATIÈRE.
 *
 * Relevé du patron, capture d'un scan à l'appui : « le sol dans un scan que
 * j'ai fait est violet et il n'y a pas l'effet parquet de partout. La
 * couleur doit refléter la couleur du sol lors du scan, à son pic de
 * luminosité, et détecter si on a des lattes, des carreaux, ou autre et
 * l'incorporer au plan. Les murs aussi doivent avoir la même couleur au pic
 * de luminosité du scan. »
 *
 * POURQUOI LE VIOLET : la couleur du relevé est une MOYENNE — et la moyenne
 * d'un sol pris entre ombres et reflets tire vers un gris-violet qui
 * n'existe nulle part dans la pièce. Ce qu'on voit « en vrai », c'est le
 * sol là où la lumière le montre : LE PIC. On garde donc les cases les plus
 * lumineuses du relevé et l'on peint leur teinte — la mesure reste une
 * mesure, on choisit juste le bon échantillon.
 *
 * ET LA MATIÈRE SE LIT DANS LA GRILLE : des lattes font varier la couleur
 * EN TRAVERS des lames et presque pas le long ; un carrelage varie dans les
 * deux sens ; un sol uni ne varie pas. L'anisotropie du relevé décide —
 * lattes, carreaux, ou rien — et le plan dessine les joints qui vont avec,
 * dans la teinte du scan.
 */
import {
  couleurAuPic,
  matiereRelevee,
} from '../src/geometry/appearance';
import { buildScene } from '../src/geometry/scene3d';
import { MAQUETTE } from '../src/ui/maquette';
import type { WallSeg } from '../src/geometry/floorplan';
import type { FloorTexture } from 'react-native-room-scan';

/** Une grille de cases, écrite ligne par ligne. */
const grille = (lignes: string[][]): FloorTexture => ({
  cols: lignes[0].length,
  rows: lignes.length,
  texels: lignes.flat(),
  minX: 0,
  minZ: 0,
  maxX: 4,
  maxZ: 3,
});

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};

describe('la couleur au pic de luminosité', () => {
  it('ignore l’ombre : le chêne éclairé gagne sur le violet sombre', () => {
    const tex = grille([
      ['#4A4058', '#4A4058', '#C89A66', '#4A4058'],
      ['#4A4058', '#C89A66', '#4A4058', '#4A4058'],
      ['#4A4058', '#4A4058', '#4A4058', '#C89A66'],
    ]);
    const pic = couleurAuPic(tex)!;
    // Nettement plus lumineuse que la moyenne, et du côté du chêne.
    expect(lum(pic)).toBeGreaterThan(lum('#7A6E60'));
    const n = parseInt(pic.slice(1), 16);
    const r = n >> 16;
    const b = n & 255;
    expect(r).toBeGreaterThan(b);
  });

  it('et sans relevé, le repli répond', () => {
    expect(couleurAuPic(undefined, '#ABCDEF')).toBe('#ABCDEF');
    expect(couleurAuPic(undefined)).toBeUndefined();
  });
});

describe('la matière se lit dans la grille', () => {
  const A = '#B98F5F';
  const B = '#8A6A45';
  it('des lattes : la couleur varie en travers, pas le long', () => {
    const tex = grille([
      [A, A, A, A, A, A],
      [B, B, B, B, B, B],
      [A, A, A, A, A, A],
      [B, B, B, B, B, B],
    ]);
    const m = matiereRelevee(tex);
    expect(m?.type).toBe('lattes');
    // Les rangées courent en x : les lames aussi.
    expect(m && 'sens' in m ? m.sens : null).toBe('x');
  });

  it('un damier : des carreaux', () => {
    const tex = grille([
      [A, B, A, B],
      [B, A, B, A],
      [A, B, A, B],
      [B, A, B, A],
    ]);
    expect(matiereRelevee(tex)?.type).toBe('carreaux');
  });

  it('un sol uni ne prétend rien', () => {
    const tex = grille([
      [A, A, A],
      [A, A, A],
      [A, A, A],
    ]);
    expect(matiereRelevee(tex)).toBeNull();
  });
});

describe('la scène incorpore le relevé', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
    roomId: 'r1',
  });
  const MURS = [
    mur('n', 0, 0, 4, 0),
    mur('e', 4, 0, 4, 3),
    mur('s', 4, 3, 0, 3),
    mur('o', 0, 3, 0, 0),
  ];
  const A = '#B98F5F';
  const B = '#8A6A45';
  const SOMBRE = '#4A4058';
  const lattes = grille([
    [A, A, A, A, A, A],
    [SOMBRE, SOMBRE, SOMBRE, SOMBRE, SOMBRE, SOMBRE],
    [A, A, A, A, A, A],
    [B, B, B, B, B, B],
  ]);

  const scene = () =>
    buildScene(MURS, [], [], {
      palette: MAQUETTE,
      showSurfaces: true,
      showTextures: true,
      rooms: [{ id: 'r1', wallIds: ['n', 'e', 's', 'o'] }],
      floors: { r1: { color: '#5A4E68', texture: lattes } },
    });

  it('le sol n’est plus violet : il porte le pic du relevé', () => {
    const sol = scene().faces.find((f) => f.isFloor && f.pts.length > 2)!;
    expect(sol.fill).not.toBe('#5A4E68');
    expect(lum(sol.fill!)).toBeGreaterThan(lum('#5A4E68'));
  });

  it('et l’effet lattes est là, SANS matière déclarée : le relevé a parlé', () => {
    const joints = scene().faces.filter((f) => f.isFloor && f.pts.length === 2);
    expect(joints.length).toBeGreaterThan(4);
    /*
      Les ABOUTS sont courts et perpendiculaires — c'est le calepinage. Ce
      qui dit le sens des lames, ce sont les GRANDES lignes : toutes celles
      qui dépassent le mètre courent en x, comme les rangées du relevé.
    */
    const longues = joints.filter(
      (f) => Math.hypot(f.pts[0].x - f.pts[1].x, f.pts[0].z - f.pts[1].z) > 1,
    );
    expect(longues.length).toBeGreaterThan(4);
    for (const f of longues) {
      expect(Math.abs(f.pts[0].x - f.pts[1].x)).toBeGreaterThan(
        Math.abs(f.pts[0].z - f.pts[1].z),
      );
    }
  });

  it('les murs relevés portent aussi leur pic, pas leur moyenne', () => {
    const texMur = {
      cols: 4,
      rows: 2,
      texels: [SOMBRE, '#E8E2D4', SOMBRE, SOMBRE, SOMBRE, '#E8E2D4', SOMBRE, SOMBRE],
    };
    const murs = MURS.map((w) => ({ ...w, color: '#6A6072', texture: texMur }));
    const sc = buildScene(murs, [], [], {
      palette: MAQUETTE,
      showTextures: true,
      rooms: [{ id: 'r1', wallIds: ['n', 'e', 's', 'o'] }],
    });
    const pans = sc.faces.filter((f) => f.captured && f.fill);
    expect(pans.length).toBeGreaterThan(0);
    for (const p of pans.slice(0, 6)) {
      expect(lum(p.fill!)).toBeGreaterThan(lum('#6A6072'));
    }
  });
});

describe('plus de pointillés sur les sols 3D', () => {
  it('la vue et le dossier montrent le nom et le sol, sans semis', () => {
    /*
      Relevé du patron : « enlève les points de la surface sur le plan 3D.
      On doit voir le nom et le sol, sans pointillés. » Par la mesure du
      code source, comme `motsclairs` : les deux rendus 3D — la vue de
      l'app et la page 3D du dossier — ne sèment plus de points.
    */
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const iso = readFileSync(
      join(__dirname, '..', 'src', 'components', 'Iso3DView.tsx'),
      'utf8',
    );
    const pdf = readFileSync(
      join(__dirname, '..', 'src', 'export', 'pdf.ts'),
      'utf8',
    );
    expect(iso).not.toContain('pointsDuSol(');
    expect(pdf).not.toContain('floorDots(');
  });
});

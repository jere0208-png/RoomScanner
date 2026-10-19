/**
 * REVUE DU GÉOMÈTRE — sept écarts entre la géométrie et ce qu'on en écrit :
 *   1. l'allège du carnet des menuiseries se comptait depuis l'origine du
 *      relevé, pas depuis le sol (sur iOS, le sol n'est pas à zéro) ;
 *   2. la fiche de la pièce prenait son tour à l'axe, le reste au nu ;
 *   3. la fiche prenait la hauteur du plus haut mur, sans le faux plafond ;
 *   4. la position d'une baie contre un pan coupé ne partait pas du même nu
 *      que la chaîne de cotes : retaper la cote affichée la déplaçait ;
 *   5. le DXF centrait ses lignes de cote sur une demi-épaisseur forfaitaire ;
 *   6. l'écran et le PDF n'arrondissaient pas les m² de la même façon ;
 *   7. un contour qui se recoupe passait pour exact, à 0,00 m².
 */
import * as fs from 'fs';
import * as path from 'path';
import { carnetDesMenuiseries } from '../src/geometry/menuiseries';
import { ficheDeLaPiece } from '../src/geometry/fichePiece';
import {
  hauteurDeLaPiece,
  ouvertureCotee,
  perimetreDesPieces,
  positionOuverture,
  roomParts,
  wallRunsAuNu,
  type WallSeg,
} from '../src/geometry/floorplan';
import { buildDxf } from '../src/export/dxf';
import { arrondiM2, frM2, resumeDuScan } from '../src/ui/mots';

const mur = (id: string, a: { x: number; z: number }, b: { x: number; z: number }, x: Partial<WallSeg> = {}): WallSeg => ({
  id,
  type: 'wall',
  a,
  b,
  height: 2.5,
  yCenter: 1.25,
  ...x,
});
/** Une pièce dessinée au nu, à partir de ses sommets. */
const piece = (pts: number[][], x: Partial<WallSeg> = {}) =>
  pts.map(([ax, az], i) => {
    const [bx, bz] = pts[(i + 1) % pts.length];
    return mur(`m${i}`, { x: ax, z: az }, { x: bx, z: bz }, { auNu: true, epaisseur: 0.14, ...x });
  });

describe('1. l’allège se compte depuis le sol', () => {
  it('sol du relevé à −1,30 : la fenêtre à 0,95 du sol reste une fenêtre', () => {
    const SOL = -1.3;
    const m = (id: string, a: { x: number; z: number }, b: { x: number; z: number }) => mur(id, a, b, { yCenter: SOL + 1.25 });
    const walls = [m('n', { x: 0, z: 0 }, { x: 4, z: 0 }), m('e', { x: 4, z: 0 }, { x: 4, z: 3 }), m('s', { x: 4, z: 3 }, { x: 0, z: 3 }), m('o', { x: 0, z: 3 }, { x: 0, z: 0 })];
    const fen: WallSeg = { id: 'f', type: 'window', a: { x: 1, z: 0 }, b: { x: 2.2, z: 0 }, height: 1.15, yCenter: SOL + 0.95 + 1.15 / 2 };
    const [l] = carnetDesMenuiseries(walls, [fen], [{ id: 'r', wallIds: ['n', 'e', 's', 'o'] }], { r: 'Chambre' });
    expect(l.type).toBe('Fenêtre');
    expect(l.allege).toBeCloseTo(0.95, 6);
  });
});

describe('2 et 3. la fiche de la pièce lit ce que lit le reste de l’app', () => {
  const walls = piece([[0, 0], [4, 0], [4, 3], [0, 3]]);
  const part = roomParts(walls, [{ id: 'r', wallIds: walls.map((w) => w.id), hauteur: 2.3 }])[0];
  const fiche = ficheDeLaPiece({
    contour: part.surface!.nu ?? part.surface!.pts,
    surface: part.surface!.area,
    surfaceExacte: true,
    centre: part.labelAt,
    murs: part.walls,
    tousLesMurs: walls,
    ouvertures: [],
    objets: [],
    fixtures: [],
    north: null,
    releve: null,
    hauteurPiece: hauteurDeLaPiece(part),
  });

  it('au nu : le tour de la fiche est celui du plan', () => {
    expect(fiche.perimetre).toBeCloseTo(perimetreDesPieces([part]), 2);
    expect(fiche.perimetre).toBeCloseTo(13.44, 2);
  });

  it('le faux plafond fait la hauteur et le volume', () => {
    expect(fiche.hauteur).toBeCloseTo(2.3, 6);
    expect(fiche.volume).toBeCloseTo(part.surface!.area * 2.3, 1);
  });

  it('sans hauteur donnée, la hauteur courante des murs, pas celle du plus haut', () => {
    const inegaux = walls.map((w, i) => (i === 0 ? { ...w, height: 3.2, yCenter: 1.6 } : w));
    const p = roomParts(inegaux, [{ id: 'r', wallIds: inegaux.map((w) => w.id) }])[0];
    const f = ficheDeLaPiece({
      contour: p.surface!.pts, surface: p.surface!.area, surfaceExacte: true, centre: p.labelAt,
      murs: p.walls, tousLesMurs: inegaux, ouvertures: [], objets: [], fixtures: [], north: null, releve: null,
    });
    expect(f.hauteur).toBeCloseTo(hauteurDeLaPiece(p), 6);
    expect(f.hauteur).toBeLessThan(3);
  });

  it('l’écran passe le contour au nu et la hauteur de la pièce', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/screens/ResultScreen.tsx'), 'utf8');
    expect(src).toMatch(/contour: part\.surface\?\.nu \?\? part\.surface\?\.pts/);
    expect(src).toMatch(/hauteurPiece: hauteurDeLaPiece\(part\)/);
  });
});

describe('4. la position d’une baie part du même nu que la chaîne de cotes', () => {
  // Un pan coupé à 45° au nord-est.
  const walls = piece([[0, 0], [4, 0], [5, 1], [5, 3], [0, 3]]);
  const rooms = [{ id: 'r', wallIds: walls.map((w) => w.id) }];
  const parts = roomParts(walls, rooms);
  const fen: WallSeg = { id: 'f', type: 'window', a: { x: 3, z: 0 }, b: { x: 3.8, z: 0 }, height: 1.2, yCenter: 0.9 + 0.6 };

  it('la cote affichée et la position sont les mêmes', () => {
    const chaine = wallRunsAuNu(walls, walls[0], [fen], parts).map((r) => r.length);
    const pos = positionOuverture(fen, walls)!;
    expect(pos.depuisB).toBeCloseTo(chaine[chaine.length - 1], 3);
    expect(pos.depuisA).toBeCloseTo(chaine[0], 3);
  });

  it('retaper la cote affichée ne déplace pas la fenêtre', () => {
    const pos = positionOuverture(fen, walls)!;
    const cote = ouvertureCotee(fen, walls, { largeur: 0.8, hauteur: 1.2, allege: 0.9, depuis: pos.depuisB, depuisB: true })!;
    expect(Math.max(cote.a.x, cote.b.x)).toBeCloseTo(3.8, 3);
    expect(Math.min(cote.a.x, cote.b.x)).toBeCloseTo(3, 3);
  });
});

describe('5. le DXF cote de nu à nu', () => {
  it('le mur d’une pièce dessinée : la ligne de cote couvre exactement la cote écrite', () => {
    const walls = piece([[0, 0], [4, 0], [4, 3], [0, 3]]);
    const rooms = [{ id: 'r', name: 'Séjour', wallIds: walls.map((w) => w.id) }];
    const dxf = buildDxf({ walls, openings: [], rooms, fixtures: [] } as never);
    // Les LIGNES du calque des cotes : la plus longue horizontale est la cote du mur nord ou sud.
    const lignes = dxf.split('\n0\nLINE\n').slice(1).map((b) => `\n${b}`).filter((b) => /\n8\nECHOPLAN-COTES\n/.test(b));
    const val = (b: string, code: string) => Number(b.match(new RegExp(`\\n${code}\\n([-0-9.]+)`))?.[1]);
    const horiz = lignes
      .map((b) => ({ x1: val(b, '10'), y1: val(b, '20'), x2: val(b, '11'), y2: val(b, '21') }))
      .filter((l) => Math.abs(l.y1 - l.y2) < 0.5)
      .map((l) => Math.abs(l.x2 - l.x1));
    // 4,00 à l'axe, 3,86 au nu : la ligne fait 3 860 mm, pas 4 000 ni 3 790.
    expect(Math.max(...horiz)).toBeCloseTo(3860, 0);
    expect(dxf).toContain('3,86 m');
  });
});

describe('5 bis. le DXF d’un plan scanné, refend vu des deux faces', () => {
  it('la cote du mur de façade va du nu de la façade au nu du refend', () => {
    const walls = [
      mur('n1', { x: 0, z: 0 }, { x: 4, z: 0 }),
      mur('c', { x: 4, z: 0 }, { x: 4, z: 3 }, { deuxFaces: true, epaisseur: 0.14 }),
      mur('s1', { x: 4, z: 3 }, { x: 0, z: 3 }),
      mur('o', { x: 0, z: 3 }, { x: 0, z: 0 }),
      mur('n2', { x: 4, z: 0 }, { x: 8, z: 0 }),
      mur('e', { x: 8, z: 0 }, { x: 8, z: 3 }),
      mur('s2', { x: 8, z: 3 }, { x: 4, z: 3 }),
    ];
    const rooms = [
      { id: 'r1', name: 'Séjour', wallIds: ['n1', 'c', 's1', 'o'] },
      { id: 'r2', name: 'Chambre', wallIds: ['n2', 'e', 's2', 'c'] },
    ];
    const dxf = buildDxf({ walls, openings: [], rooms, fixtures: [] } as never);
    expect(dxf).toContain('3,93 m');
    const lignes = dxf.split('\n0\nLINE\n').slice(1).map((b) => `\n${b}`).filter((b) => /\n8\nECHOPLAN-COTES\n/.test(b));
    const val = (b: string, code: string) => Number(b.match(new RegExp(`\\n${code}\\n([-0-9.]+)`))?.[1]);
    const segs = lignes.map((b) => ({ x1: val(b, '10'), y1: val(b, '20'), x2: val(b, '11'), y2: val(b, '21') }));
    // La ligne de cote du mur n1 : horizontale, 3 930 mm, de x = 0 à x = 3 930.
    const n1 = segs.filter((l) => Math.abs(l.y1 - l.y2) < 0.5 && Math.abs(Math.abs(l.x2 - l.x1) - 3930) < 1);
    expect(n1.length).toBeGreaterThan(0);
    expect(n1.some((l) => Math.abs(Math.min(l.x1, l.x2)) < 1)).toBe(true);
  });
});

describe('6. une surface s’écrit partout de la même façon', () => {
  it('au centième d’abord, puis deux décimales et la virgule', () => {
    expect(frM2(12.345678)).toBe('12,35');
    expect(frM2(4)).toBe('4,00');
    expect(frM2(2.05 * 2.1)).toBe((Math.round(2.05 * 2.1 * 100) / 100).toFixed(2).replace('.', ','));
    expect(arrondiM2(10.004)).toBe(10);
  });

  it('la bibliothèque dit deux décimales, comme le dossier', () => {
    expect(resumeDuScan({ pieces: 1, murs: 4, objets: 0, surface: { area: 45.8, exact: true } as never })).toContain('45,80 m²');
  });

  it('l’écran, le PDF et le DXF passent par la même fonction', () => {
    const lire = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    for (const f of ['src/components/FloorplanEditor.tsx', 'src/components/RoomBar.tsx', 'src/export/pdf.ts', 'src/export/dxf.ts', 'src/screens/ResultScreen.tsx']) {
      expect(lire(f)).toMatch(/frM2\b.*from '\.\.\/ui\/mots'/);
    }
  });
});

describe('7. un contour qui se recoupe n’est pas exact', () => {
  it('(0,0)→(4,0)→(0,3)→(4,3) : « ≈ », jamais « 0,00 m² » pour exact', () => {
    const walls = piece([[0, 0], [4, 0], [0, 3], [4, 3]], { auNu: false });
    const s = roomParts(walls, [{ id: 'r', wallIds: walls.map((w) => w.id) }])[0].surface!;
    expect(s.exact).toBe(false);
    expect(s.croise).toBe(true);
  });

  it('un rectangle ordinaire reste exact', () => {
    const walls = piece([[0, 0], [4, 0], [4, 3], [0, 3]], { auNu: false });
    const s = roomParts(walls, [{ id: 'r', wallIds: walls.map((w) => w.id) }])[0].surface!;
    expect(s.exact).toBe(true);
    expect(s.croise).toBeUndefined();
  });
});

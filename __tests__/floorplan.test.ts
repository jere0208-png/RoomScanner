import {
  bounds,
  closedLoop,
  loopAreaM2,
  makeMapping,
  segLength,
  snapAngle,
  toSegment,
  weldCorners,
  type WallSeg,
} from '../src/geometry/floorplan';
import { buildScanPdf, toBase64 } from '../src/export/pdf';

const seg = (
  id: string,
  a: { x: number; z: number },
  b: { x: number; z: number },
): WallSeg => ({ id, type: 'wall', a, b, height: 2.5, yCenter: 1.25 });

describe('toSegment', () => {
  it('convertit une matrice iOS (colonne-major) en segment au sol', () => {
    // Mur de 4 m le long de l'axe X, centré en (1, 1.25, 2).
    const transform = [
      1, 0, 0, 0, // colonne 0 : direction X
      0, 1, 0, 0,
      0, 0, 1, 0,
      1, 1.25, 2, 1, // colonne 3 : position
    ];
    const s = toSegment({
      id: 'w1',
      type: 'wall',
      length: 4,
      height: 2.5,
      transform,
    });
    expect(s.a.x).toBeCloseTo(-1);
    expect(s.b.x).toBeCloseTo(3);
    expect(s.a.z).toBeCloseTo(2);
    expect(s.yCenter).toBeCloseTo(1.25);
    expect(segLength(s)).toBeCloseTo(4);
  });

  it('reprend directement les extrémités Android', () => {
    const s = toSegment({
      id: 'w2',
      type: 'wall',
      length: 3,
      height: 2.4,
      ax: 0,
      az: 0,
      bx: 3,
      bz: 0,
    });
    expect(s.b.x).toBe(3);
    expect(segLength(s)).toBeCloseTo(3);
  });
});

describe('weldCorners', () => {
  it('soude les extrémités proches sur un point commun', () => {
    const walls = [
      seg('a', { x: 0, z: 0 }, { x: 4, z: 0.05 }),
      seg('b', { x: 4.08, z: -0.03 }, { x: 4, z: 3 }),
    ];
    const welded = weldCorners(walls);
    expect(welded[0].b).toEqual(welded[1].a);
  });
});

describe('snapAngle', () => {
  it("colle un mur presque horizontal à l'horizontale", () => {
    const p = snapAngle({ x: 0, z: 0 }, { x: 4, z: 0.1 });
    expect(p.z).toBeCloseTo(0);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(Math.hypot(4, 0.1));
  });

  it('ne touche pas un mur en diagonale franche', () => {
    const p = snapAngle({ x: 0, z: 0 }, { x: 3, z: 2 });
    expect(p).toEqual({ x: 3, z: 2 });
  });
});

describe('makeMapping', () => {
  it('aller-retour mètres ↔ pixels cohérent', () => {
    const walls = [
      seg('a', { x: -2, z: -1 }, { x: 2, z: -1 }),
      seg('b', { x: 2, z: -1 }, { x: 2, z: 3 }),
    ];
    const m = makeMapping(bounds(walls), 400, 600);
    const p = { x: 1.2, z: 0.7 };
    const back = m.toMeters(m.toPx(p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.z).toBeCloseTo(p.z);
  });
});

describe('closedLoop + loopAreaM2', () => {
  const rect = [
    seg('n', { x: 0, z: 0 }, { x: 4, z: 0 }),
    seg('e', { x: 4, z: 0 }, { x: 4, z: 3 }),
    seg('s', { x: 4, z: 3 }, { x: 0, z: 3 }),
    seg('w', { x: 0, z: 3 }, { x: 0, z: 0 }),
  ];

  it('détecte une boucle fermée et son aire (pièce 4×3 = 12 m²)', () => {
    const loop = closedLoop(rect);
    expect(loop).not.toBeNull();
    expect(loop!.length).toBe(4);
    expect(loopAreaM2(loop!)).toBeCloseTo(12);
  });

  it("l'ordre des murs et le sens des segments n'importent pas", () => {
    const shuffled = [rect[2], rect[0], { ...rect[3], a: rect[3].b, b: rect[3].a }, rect[1]];
    const loop = closedLoop(shuffled);
    expect(loop).not.toBeNull();
    expect(loopAreaM2(loop!)).toBeCloseTo(12);
  });

  it('renvoie null pour un plan ouvert', () => {
    expect(closedLoop(rect.slice(0, 3))).toBeNull();
  });

  it('renvoie null quand un coin porte trois murs', () => {
    expect(closedLoop([...rect, seg('x', { x: 0, z: 0 }, { x: -2, z: 0 })])).toBeNull();
  });
});

describe('buildScanPdf', () => {
  const latin1String = (bytes: Uint8Array): string => {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  };
  const rect = [
    seg('n', { x: 0, z: 0 }, { x: 4, z: 0 }),
    seg('e', { x: 4, z: 0 }, { x: 4, z: 3 }),
    seg('s', { x: 4, z: 3 }, { x: 0, z: 3 }),
    seg('w', { x: 0, z: 3 }, { x: 0, z: 0 }),
  ];
  const scan = { name: 'Salon test', walls: rect, openings: [], objects: [] };

  it('produit un PDF valide à une page (plan seul)', () => {
    const s = latin1String(buildScanPdf(scan, false));
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s).toContain('/Count 1');
    expect(s.endsWith('%%EOF')).toBe(true);
    expect(s).toContain('Salon test');
    expect(s).toContain('4,00 m'); // cote d'un mur
    expect(s).toContain('EchoPlan'); // cartouche
  });

  it('ajoute la feuille des vues 3D quand demandé', () => {
    const s = latin1String(buildScanPdf(scan, true));
    expect(s).toContain('/Count 2');
    expect(s).toContain('Vues 3D');
  });

  it('encode le base64 correctement', () => {
    expect(toBase64(new Uint8Array([72, 101, 108, 108, 111]))).toBe('SGVsbG8=');
    expect(toBase64(new Uint8Array([77, 97]))).toBe('TWE=');
  });
});

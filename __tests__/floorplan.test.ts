import {
  bounds,
  closedLoop,
  loopAreaM2,
  makeMapping,
  quadPoints,
  roomSurface,
  segLength,
  snapAngle,
  toSegment,
  wallQuads,
  weldCorners,
  WALL_T,
  type Pt,
  type WallSeg,
} from '../src/geometry/floorplan';
import { dotStep, floorDots, sampleTexture } from '../src/geometry/appearance';
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

  it('ne modifie pas les murs reçus', () => {
    const walls = [
      seg('a', { x: 0, z: 0 }, { x: 4, z: 0.05 }),
      seg('b', { x: 4.08, z: -0.03 }, { x: 4, z: 3 }),
    ];
    weldCorners(walls);
    expect(walls[0].b).toEqual({ x: 4, z: 0.05 });
    expect(walls[1].a).toEqual({ x: 4.08, z: -0.03 });
  });

  it("projette une extrémité libre sur le flanc du mur qu'elle touche (T)", () => {
    const walls = [
      seg('long', { x: 0, z: 0 }, { x: 6, z: 0 }),
      // Cloison qui arrive au milieu du grand mur, à 8 cm près.
      seg('refend', { x: 3, z: 0.08 }, { x: 3, z: 2.5 }),
    ];
    const welded = weldCorners(walls);
    expect(welded[1].a.z).toBeCloseTo(0);
    expect(welded[1].a.x).toBeCloseTo(3);
    // Le grand mur, lui, n'est pas coupé.
    expect(welded[0].a).toEqual({ x: 0, z: 0 });
    expect(welded[0].b).toEqual({ x: 6, z: 0 });
  });
});

describe('wallQuads', () => {
  const near = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-6;

  it("taille un onglet à angle droit, partagé au point près par les deux murs", () => {
    const walls = [
      seg('n', { x: 0, z: 0 }, { x: 4, z: 0 }),
      seg('e', { x: 4, z: 0 }, { x: 4, z: 3 }),
    ];
    const q = wallQuads(walls, 0.14);
    const n = q.get('n')!;
    const e = q.get('e')!;
    // Coin intérieur et coin extérieur, à ± une demi-épaisseur du nœud.
    expect(n.b1.x).toBeCloseTo(3.93);
    expect(n.b1.z).toBeCloseTo(0.07);
    expect(n.b2.x).toBeCloseTo(4.07);
    expect(n.b2.z).toBeCloseTo(-0.07);
    // Le mur voisin reprend EXACTEMENT les mêmes points : pas de fente,
    // pas de recouvrement.
    expect(near(e.a1, n.b1)).toBe(true);
    expect(near(e.a2, n.b2)).toBe(true);
  });

  it('referme une pièce rectangulaire sans trou ni chevauchement', () => {
    const rect = [
      seg('n', { x: 0, z: 0 }, { x: 4, z: 0 }),
      seg('e', { x: 4, z: 0 }, { x: 4, z: 3 }),
      seg('s', { x: 4, z: 3 }, { x: 0, z: 3 }),
      seg('w', { x: 0, z: 3 }, { x: 0, z: 0 }),
    ];
    const q = wallQuads(rect);
    // À chaque coin, les deux murs voisins livrent la même paire de points.
    const pairs: [string, 'a' | 'b', string, 'a' | 'b'][] = [
      ['n', 'b', 'e', 'a'],
      ['e', 'b', 's', 'a'],
      ['s', 'b', 'w', 'a'],
      ['w', 'b', 'n', 'a'],
    ];
    for (const [id1, e1, id2, e2] of pairs) {
      const q1 = q.get(id1)!;
      const q2 = q.get(id2)!;
      const set1 = [q1[`${e1}1`], q1[`${e1}2`]];
      const set2 = [q2[`${e2}1`], q2[`${e2}2`]];
      for (const p of set1) {
        expect(set2.some((r) => near(p, r))).toBe(true);
      }
    }
    // Aucun quad dégénéré : quatre points distincts par mur.
    for (const id of ['n', 'e', 's', 'w']) {
      const pts = quadPoints(q.get(id)!);
      expect(new Set(pts.map((p) => `${p.x.toFixed(4)}:${p.z.toFixed(4)}`)).size).toBe(4);
    }
  });

  it('donne un about droit à une extrémité libre', () => {
    const walls = [seg('seul', { x: 0, z: 0 }, { x: 3, z: 0 })];
    const { a1, a2 } = wallQuads(walls, WALL_T).get('seul')!;
    expect(a1.x).toBeCloseTo(0);
    expect(a2.x).toBeCloseTo(0);
    expect(Math.abs(a1.z - a2.z)).toBeCloseTo(0.14);
  });

  it("prolonge une cloison en T jusque dans le corps du mur porteur", () => {
    const walls = [
      seg('long', { x: 0, z: 0 }, { x: 6, z: 0 }),
      seg('refend', { x: 3, z: 0 }, { x: 3, z: 2.5 }),
    ];
    const { a1, a2 } = wallQuads(walls, WALL_T).get('refend')!;
    // L'about descend d'une demi-épaisseur sous l'axe du mur porteur.
    expect(a1.z).toBeCloseTo(-0.07);
    expect(a2.z).toBeCloseTo(-0.07);
  });
});

describe('roomSurface', () => {
  const rect = [
    seg('n', { x: 0, z: 0 }, { x: 4, z: 0 }),
    seg('e', { x: 4, z: 0 }, { x: 4, z: 3 }),
    seg('s', { x: 4, z: 3 }, { x: 0, z: 3 }),
    seg('w', { x: 0, z: 3 }, { x: 0, z: 0 }),
  ];

  it('donne la surface exacte quand la pièce est fermée', () => {
    const s = roomSurface(rect)!;
    expect(s.exact).toBe(true);
    expect(s.area).toBeCloseTo(12);
    expect(s.pts.length).toBe(4);
  });

  it('referme une chaîne ouverte et annonce une surface approchée', () => {
    const s = roomSurface(rect.slice(0, 3))!;
    expect(s.exact).toBe(false);
    expect(s.area).toBeGreaterThan(0);
  });

  it('renvoie null quand il n’y a pas de quoi faire un contour', () => {
    expect(roomSurface(rect.slice(0, 1))).toBeNull();
  });
});

describe('semis du sol', () => {
  const square = [
    { x: 0, z: 0 },
    { x: 2, z: 0 },
    { x: 2, z: 2 },
    { x: 0, z: 2 },
  ];

  it('ne pose des points qu’à l’intérieur du contour', () => {
    const dots = floorDots(square, 0.25);
    expect(dots.length).toBeGreaterThan(20);
    for (const d of dots) {
      expect(d.x).toBeGreaterThan(-1e-9);
      expect(d.x).toBeLessThan(2 + 1e-9);
      expect(d.z).toBeGreaterThan(-1e-9);
      expect(d.z).toBeLessThan(2 + 1e-9);
    }
  });

  it('adapte le pas à l’échelle pour garder un semis lisible', () => {
    // 20 px/m : un point tous les 25 cm ferait 5 px, on écarte le semis.
    expect(dotStep(20) * 20).toBeGreaterThanOrEqual(10);
    // 400 px/m : on resserre au lieu d’étaler les points.
    expect(dotStep(400) * 400).toBeLessThanOrEqual(25);
  });

  it('respecte le plafond de points', () => {
    expect(floorDots(square, 0.01, 50).length).toBe(50);
  });
});

describe('sampleTexture', () => {
  const tex = {
    cols: 2,
    rows: 2,
    texels: ['#111111', '#222222', '#333333', '#444444'],
  };

  it('lit la bonne case (ligne 0 = haut, colonne 0 = extrémité A)', () => {
    expect(sampleTexture(tex, 0.1, 0.1)).toBe('#111111');
    expect(sampleTexture(tex, 0.9, 0.1)).toBe('#222222');
    expect(sampleTexture(tex, 0.1, 0.9)).toBe('#333333');
    expect(sampleTexture(tex, 0.9, 0.9)).toBe('#444444');
  });

  it('ignore une grille vide ou une couleur invalide', () => {
    expect(sampleTexture(undefined, 0.5, 0.5)).toBeUndefined();
    expect(
      sampleTexture({ cols: 1, rows: 1, texels: ['rouge'] }, 0.5, 0.5),
    ).toBeUndefined();
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

  it('porte la surface au sol, et la retire quand on la décoche', () => {
    expect(latin1String(buildScanPdf(scan, false))).toContain('surface au sol');
    expect(latin1String(buildScanPdf(scan, false))).toContain('12,0 m');
    const sans = latin1String(buildScanPdf(scan, false, { surfaces: false }));
    expect(sans).not.toContain('surface au sol');
  });

  it('accepte les couleurs relevées au scan sans casser le document', () => {
    const withColors = {
      ...scan,
      walls: rect.map((w) => ({
        ...w,
        color: '#C8B79A',
        texture: {
          cols: 2,
          rows: 2,
          texels: ['#C8B79A', '#BFAF93', '#B7A78C', '#D0C0A4'],
        },
      })),
      floor: {
        color: '#8A6E4B',
        texture: {
          cols: 2,
          rows: 2,
          texels: ['#8A6E4B', '#7E6444', '#93764F', '#876A48'],
          minX: 0,
          maxX: 4,
          minZ: 0,
          maxZ: 3,
        },
      },
    };
    const s = latin1String(buildScanPdf(withColors, true, { textures: true }));
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.endsWith('%%EOF')).toBe(true);
    expect(s).toContain('/Count 2');
  });

  it('encode le base64 correctement', () => {
    expect(toBase64(new Uint8Array([72, 101, 108, 108, 111]))).toBe('SGVsbG8=');
    expect(toBase64(new Uint8Array([77, 97]))).toBe('TWE=');
  });
});

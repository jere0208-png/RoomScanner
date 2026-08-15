import {
  bounds,
  clampFootprint,
  closedLoop,
  detectRooms,
  interiorPole,
  groupByRoom,
  loopAreaM2,
  makeMapping,
  mergeColinear,
  pointOnSeg,
  quadPoints,
  roomParts,
  roomSurface,
  segLength,
  snapAngle,
  splitAtJunctions,
  toFootprint,
  toSegment,
  totalArea,
  wallQuads,
  weldCorners,
  WALL_T,
  type Pt,
  type WallSeg,
} from '../src/geometry/floorplan';
import {
  dotStep,
  floorDots,
  pointInPolygon,
  sampleTexture,
} from '../src/geometry/appearance';
import {
  assignOpenings,
  buildScene,
  isHiddenFace,
  sceneFraming,
  wallPanels,
  type ScenePalette,
  type WallHole,
} from '../src/geometry/scene3d';
import { buildScanPdf, toBase64 } from '../src/export/pdf';

/** Palette neutre : les tests ne jugent que la géométrie et les relevés. */
const TEST_PALETTE: ScenePalette = {
  floor: '#EEEEEE',
  floorStroke: '#CCCCCC',
  wall: '#FFFFFF',
  wallStroke: '#888888',
  wallTop: '#F2F2F2',
  wallTopStroke: '#888888',
  opening: '#BBBBBB',
  door: '#E8A13B',
  window: '#3EB8E5',
  object: '#DDDDDD',
  objectTop: '#EEEEEE',
  objectStroke: '#999999',
};

const seg = (
  id: string,
  a: { x: number; z: number },
  b: { x: number; z: number },
): WallSeg => ({ id, type: 'wall', a, b, height: 2.5, yCenter: 1.25 });

/** Rattache des murs à une pièce donnée (les murs sans `roomId` sont room-1). */
const inRoom = (roomId: string, walls: WallSeg[]): WallSeg[] =>
  walls.map((w) => ({ ...w, roomId }));

/** Rectangle de murs fermé, coin haut-gauche en (x, z). */
const room = (
  prefix: string,
  x: number,
  z: number,
  w: number,
  h: number,
): WallSeg[] => [
  seg(`${prefix}n`, { x, z }, { x: x + w, z }),
  seg(`${prefix}e`, { x: x + w, z }, { x: x + w, z: z + h }),
  seg(`${prefix}s`, { x: x + w, z: z + h }, { x, z: z + h }),
  seg(`${prefix}w`, { x, z: z + h }, { x, z }),
];

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

describe('pose du cartouche', () => {
  it('place le nom au large, loin de tout mur', () => {
    const p = interiorPole([
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 4 },
      { x: 0, z: 4 },
    ]);
    expect(p.x).toBeCloseTo(2, 1);
    expect(p.z).toBeCloseTo(2, 1);
  });

  it('sort du mur dans une pièce en L, là où le barycentre tombe dedans', () => {
    // L : le barycentre du contour tombe dans le renfoncement, donc dans
    // le mur — c'est exactement ce qui coupait le cartouche en deux.
    const L = [
      { x: 0, z: 0 },
      { x: 6, z: 0 },
      { x: 6, z: 2 },
      { x: 2, z: 2 },
      { x: 2, z: 6 },
      { x: 0, z: 6 },
    ];
    const p = interiorPole(L);
    expect(pointInPolygon(p, L)).toBe(true);
    // Et vraiment au large : au moins 80 cm de tout bord.
    const dist = Math.min(
      ...L.map((_, i) => {
        const a = L[i];
        const b = L[(i + 1) % L.length];
        return pointOnSeg(p, a, b).dist;
      }),
    );
    expect(dist).toBeGreaterThan(0.8);
  });

  it('donne à chaque pièce son propre point de pose', () => {
    const parts = roomParts([
      ...room('a', 0, 0, 4, 3),
      ...inRoom('room-2', room('b', 9, 0, 3, 3)),
    ]);
    expect(parts).toHaveLength(2);
    expect(parts[0].labelAt.x).toBeCloseTo(2, 1);
    expect(parts[1].labelAt.x).toBeCloseTo(10.5, 1);
  });
});

describe('meubles', () => {
  const height = 2.5;
  const box = [
    { ...seg('n', { x: 0, z: 0 }, { x: 4, z: 0 }), height },
    { ...seg('e', { x: 4, z: 0 }, { x: 4, z: 3 }), height },
    { ...seg('s', { x: 4, z: 3 }, { x: 0, z: 3 }), height },
    { ...seg('w', { x: 0, z: 3 }, { x: 0, z: 0 }), height },
  ];
  /** Télé plaquée sur le mur nord, centre DERRIÈRE le nu du mur. */
  const tv = {
    id: 'tv',
    category: 'television',
    width: 1.2,
    height: 0.7,
    depth: 0.08,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 1.3, -0.02, 1],
  };

  it('ramène un meuble à cheval sur un mur du côté de sa pièce', () => {
    const f = clampFootprint(toFootprint(tv), box, { x: 2, z: 1.5 });
    // Aucun coin ne doit plus dépasser dans le mur (nu à z = 0,07).
    expect(f.cz - tv.depth / 2).toBeGreaterThan(WALL_T / 2);
  });

  it('rend chaque meuble comme un volume, faces arrière masquées', () => {
    const scene = buildScene(box, [], [tv], { palette: TEST_PALETTE });
    const faces = scene.faces.filter((f) => f.fill === TEST_PALETTE.object);
    expect(faces.length).toBeGreaterThan(0);
    // Toutes les faces d'un meuble portent leur normale : c'est ce qui
    // empêche les flancs de clignoter au fil de la rotation.
    expect(faces.every((f) => f.normal !== undefined)).toBe(true);
    const rad = (d: number) => (d * Math.PI) / 180;
    for (const theta of [-180, -90, -32, 0, 45, 90, 180]) {
      const cam = {
        ct: Math.cos(rad(theta)),
        st: Math.sin(rad(theta)),
        cp: Math.cos(rad(58)),
        sp: Math.sin(rad(58)),
      };
      const shown = faces.filter((f) => !isHiddenFace(f, cam));
      // Jamais deux flancs opposés en même temps, jamais aucun.
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.length).toBeLessThan(faces.length);
    }
  });
});

describe('splitAtJunctions', () => {
  it('coupe le mur porteur là où une cloison vient buter', () => {
    const cut = splitAtJunctions([
      seg('n', { x: 0, z: 0 }, { x: 7, z: 0 }),
      seg('refend', { x: 4, z: 0 }, { x: 4, z: 3 }),
    ]);
    expect(cut).toHaveLength(3);
    const pieces = cut.filter((w) => w.id.startsWith('n'));
    expect(pieces.map((w) => Math.round(segLength(w)))).toEqual([4, 3]);
  });

  it('ne coupe pas à un simple coin', () => {
    const cut = splitAtJunctions([
      seg('n', { x: 0, z: 0 }, { x: 4, z: 0 }),
      seg('e', { x: 4, z: 0 }, { x: 4, z: 3 }),
    ]);
    expect(cut).toHaveLength(2);
  });

  it('trouve les pièces d’un appartement tel que RoomPlan le livre', () => {
    // Enveloppe d'un seul tenant, cloison qui bute au milieu : sans découpe,
    // aucun cycle ne passe par elle et tout ressort en une pièce unique.
    const brut = [
      seg('n', { x: 0, z: 0 }, { x: 7, z: 0 }),
      seg('e', { x: 7, z: 0 }, { x: 7, z: 3 }),
      seg('s', { x: 7, z: 3 }, { x: 0, z: 3 }),
      seg('w', { x: 0, z: 3 }, { x: 0, z: 0 }),
      seg('refend', { x: 4, z: 0.05 }, { x: 4, z: 2.95 }),
    ];
    expect(detectRooms(mergeColinear(weldCorners(brut)))).toHaveLength(1);
    const propre = mergeColinear(splitAtJunctions(weldCorners(brut)));
    const found = detectRooms(propre);
    expect(found).toHaveLength(2);
    expect(found.map((r) => Math.round(r.area))).toEqual([12, 9]);
  });

  it('démêle un T3 : séjour et deux chambres', () => {
    const brut = [
      seg('N', { x: 0, z: 0 }, { x: 9, z: 0 }),
      seg('E', { x: 9, z: 0 }, { x: 9, z: 4 }),
      seg('S', { x: 9, z: 4 }, { x: 0, z: 4 }),
      seg('W', { x: 0, z: 4 }, { x: 0, z: 0 }),
      seg('c1', { x: 5, z: 0.03 }, { x: 5, z: 4 }),
      seg('c2', { x: 5, z: 2 }, { x: 9, z: 2 }),
    ];
    const found = detectRooms(mergeColinear(splitAtJunctions(weldCorners(brut))));
    expect(found.map((r) => Math.round(r.area))).toEqual([20, 8, 8]);
  });

  it('recoupe la grille de couleurs avec le mur', () => {
    const n = {
      ...seg('n', { x: 0, z: 0 }, { x: 8, z: 0 }),
      texture: { cols: 8, rows: 1, texels: ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777'] },
    };
    const cut = splitAtJunctions([n, seg('r', { x: 4, z: 0 }, { x: 4, z: 3 })]);
    const [left, right] = cut.filter((w) => w.id.startsWith('n'));
    expect(left.texture!.cols).toBe(4);
    expect(right.texture!.cols).toBe(4);
    expect(left.texture!.texels[0]).toBe('#000000');
    expect(right.texture!.texels[3]).toBe('#777777');
  });
});

describe('detectRooms', () => {
  it('trouve une pièce unique et jette le contour extérieur', () => {
    const found = detectRooms(room('r', 0, 0, 4, 3));
    expect(found).toHaveLength(1);
    expect(found[0].area).toBeCloseTo(12);
    expect(found[0].wallIds.sort()).toEqual(['re', 'rn', 'rs', 'rw']);
  });

  it('trouve deux pièces séparées par un refend, partagé entre elles', () => {
    // Un 7 × 3 coupé en deux par une cloison à x = 4.
    const walls = [
      seg('n1', { x: 0, z: 0 }, { x: 4, z: 0 }),
      seg('n2', { x: 4, z: 0 }, { x: 7, z: 0 }),
      seg('e', { x: 7, z: 0 }, { x: 7, z: 3 }),
      seg('s2', { x: 7, z: 3 }, { x: 4, z: 3 }),
      seg('s1', { x: 4, z: 3 }, { x: 0, z: 3 }),
      seg('w', { x: 0, z: 3 }, { x: 0, z: 0 }),
      seg('refend', { x: 4, z: 0 }, { x: 4, z: 3 }),
    ];
    const found = detectRooms(walls);
    expect(found).toHaveLength(2);
    expect(found.map((r) => Math.round(r.area))).toEqual([12, 9]);
    // Le refend borde les DEUX pièces.
    expect(found.every((r) => r.wallIds.includes('refend'))).toBe(true);
  });

  it('trouve trois pièces dans un plan en peigne', () => {
    const walls = [
      seg('n', { x: 0, z: 0 }, { x: 9, z: 0 }),
      seg('e', { x: 9, z: 0 }, { x: 9, z: 3 }),
      seg('s', { x: 9, z: 3 }, { x: 0, z: 3 }),
      seg('w', { x: 0, z: 3 }, { x: 0, z: 0 }),
      seg('c1', { x: 3, z: 0 }, { x: 3, z: 3 }),
      seg('c2', { x: 6, z: 0 }, { x: 6, z: 3 }),
    ];
    // Les murs extérieurs doivent d'abord être coupés aux cloisons.
    const cut = [
      seg('n1', { x: 0, z: 0 }, { x: 3, z: 0 }),
      seg('n2', { x: 3, z: 0 }, { x: 6, z: 0 }),
      seg('n3', { x: 6, z: 0 }, { x: 9, z: 0 }),
      walls[1],
      seg('s3', { x: 9, z: 3 }, { x: 6, z: 3 }),
      seg('s2', { x: 6, z: 3 }, { x: 3, z: 3 }),
      seg('s1', { x: 3, z: 3 }, { x: 0, z: 3 }),
      walls[3],
      walls[4],
      walls[5],
    ];
    const found = detectRooms(cut);
    expect(found).toHaveLength(3);
    expect(found.map((r) => Math.round(r.area))).toEqual([9, 9, 9]);
  });

  it('ignore une cloison qui ne ferme rien', () => {
    const found = detectRooms([
      ...room('r', 0, 0, 4, 3),
      seg('pendant', { x: 2, z: 3 }, { x: 2, z: 1.5 }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].area).toBeCloseTo(12);
  });

  it('ne rend rien quand aucun contour ne se referme', () => {
    expect(detectRooms(room('r', 0, 0, 4, 3).slice(0, 3))).toHaveLength(0);
  });

  it('écarte les boucles minuscules dues au bruit du scan', () => {
    const found = detectRooms(room('t', 0, 0, 0.5, 0.5));
    expect(found).toHaveLength(0);
  });

  it('gère deux pièces qui ne se touchent pas', () => {
    const found = detectRooms([
      ...room('a', 0, 0, 4, 3),
      ...room('b', 9, 0, 3, 3),
    ]);
    expect(found).toHaveLength(2);
    expect(found.map((r) => Math.round(r.area))).toEqual([12, 9]);
  });
});

describe('mergeColinear', () => {
  it('recolle en un seul mur les morceaux alignés bout à bout', () => {
    const merged = mergeColinear([
      seg('a', { x: 0, z: 0 }, { x: 1.5, z: 0 }),
      seg('b', { x: 1.5, z: 0 }, { x: 2.7, z: 0 }),
      seg('c', { x: 2.7, z: 0 }, { x: 4, z: 0 }),
    ]);
    expect(merged).toHaveLength(1);
    expect(segLength(merged[0])).toBeCloseTo(4);
    expect(merged[0].a.x).toBeCloseTo(0);
    expect(merged[0].b.x).toBeCloseTo(4);
  });

  it('recolle quel que soit l’ordre et le sens des segments', () => {
    const merged = mergeColinear([
      seg('c', { x: 4, z: 0 }, { x: 2.7, z: 0 }),
      seg('a', { x: 1.5, z: 0 }, { x: 0, z: 0 }),
      seg('b', { x: 1.5, z: 0 }, { x: 2.7, z: 0 }),
    ]);
    expect(merged).toHaveLength(1);
    expect(segLength(merged[0])).toBeCloseTo(4);
  });

  it('ne touche pas à un vrai angle', () => {
    const merged = mergeColinear([
      seg('a', { x: 0, z: 0 }, { x: 4, z: 0 }),
      seg('b', { x: 4, z: 0 }, { x: 4, z: 3 }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('ne fusionne pas au travers d’une jonction en T', () => {
    const merged = mergeColinear([
      seg('a', { x: 0, z: 0 }, { x: 2, z: 0 }),
      seg('b', { x: 2, z: 0 }, { x: 4, z: 0 }),
      seg('t', { x: 2, z: 0 }, { x: 2, z: 2 }),
    ]);
    expect(merged).toHaveLength(3);
  });

  it('ne fusionne pas deux murs de pièces différentes', () => {
    const merged = mergeColinear([
      seg('a', { x: 0, z: 0 }, { x: 2, z: 0 }),
      { ...seg('b', { x: 2, z: 0 }, { x: 4, z: 0 }), roomId: 'room-2' },
    ]);
    expect(merged).toHaveLength(2);
  });

  it('ne fusionne pas des murs de hauteurs franchement différentes', () => {
    const merged = mergeColinear([
      seg('a', { x: 0, z: 0 }, { x: 2, z: 0 }),
      { ...seg('b', { x: 2, z: 0 }, { x: 4, z: 0 }), height: 1.1 },
    ]);
    expect(merged).toHaveLength(2);
  });

  it('laisse une boucle fermée intacte et calculable', () => {
    // Le mur nord est livré en deux morceaux : après fusion, 4 murs et une
    // boucle toujours fermée.
    const merged = mergeColinear([
      seg('n1', { x: 0, z: 0 }, { x: 2, z: 0 }),
      seg('n2', { x: 2, z: 0 }, { x: 4, z: 0 }),
      seg('e', { x: 4, z: 0 }, { x: 4, z: 3 }),
      seg('s', { x: 4, z: 3 }, { x: 0, z: 3 }),
      seg('w', { x: 0, z: 3 }, { x: 0, z: 0 }),
    ]);
    expect(merged).toHaveLength(4);
    expect(roomSurface(merged)?.exact).toBe(true);
    expect(roomSurface(merged)?.area).toBeCloseTo(12);
  });

  it('recompose la grille de couleurs le long du mur reconstitué', () => {
    const gauche = {
      ...seg('a', { x: 0, z: 0 }, { x: 2, z: 0 }),
      color: '#FF0000',
      texture: { cols: 1, rows: 1, texels: ['#FF0000'] },
    };
    const droite = {
      ...seg('b', { x: 2, z: 0 }, { x: 4, z: 0 }),
      color: '#0000FF',
      texture: { cols: 1, rows: 1, texels: ['#0000FF'] },
    };
    const merged = mergeColinear([gauche, droite]);
    expect(merged).toHaveLength(1);
    const tex = merged[0].texture!;
    // La première moitié reste rouge, la seconde bleue : pas d'étirement.
    expect(sampleTexture(tex, 0.1, 0.5)).toBe('#FF0000');
    expect(sampleTexture(tex, 0.9, 0.5)).toBe('#0000FF');
  });
});

describe('contours de la scène 3D', () => {
  const rect = [
    seg('n', { x: 0, z: 0 }, { x: 4, z: 0 }),
    seg('e', { x: 4, z: 0 }, { x: 4, z: 3 }),
    seg('s', { x: 4, z: 3 }, { x: 0, z: 3 }),
    seg('w', { x: 0, z: 3 }, { x: 0, z: 0 }),
  ];

  /** Plus grande étendue horizontale d'une face (m). */
  const span = (f: { pts: { x: number; z: number }[] }) => {
    let max = 0;
    for (const p of f.pts) {
      for (const q of f.pts) {
        max = Math.max(max, Math.hypot(p.x - q.x, p.z - q.z));
      }
    }
    return max;
  };

  it('ne pose aucun contour à cheval sur plusieurs bandes', () => {
    // Un contour d'un seul tenant sur un mur découpé se trierait à une
    // profondeur moyenne, et traverserait les meubles placés devant. Aucun
    // contour ne doit donc dépasser une bande (60 cm) — en diagonale, plus
    // l'épaisseur du mur pour le dessus des murs.
    const scene = buildScene(rect, [], [], { palette: TEST_PALETTE });
    const outlines = scene.faces.filter((f) => f.fill === null);
    expect(outlines.length).toBeGreaterThan(0);
    expect(Math.max(...outlines.map(span))).toBeLessThan(0.6 + WALL_T + 0.02);
    // Un mur de 4 m : un contour d'un seul tenant ferait cinq fois ça.
    expect(Math.max(...outlines.map(span))).toBeLessThan(1);
  });

  it('garde les contours en mode geste, avec des pans d’un seul tenant', () => {
    const fine = buildScene(rect, [], [], { palette: TEST_PALETTE });
    const coarse = buildScene(rect, [], [], { palette: TEST_PALETTE, coarse: true });
    // Beaucoup moins de polygones…
    expect(coarse.faces.length).toBeLessThan(fine.faces.length / 2);
    // …mais toujours des contours : c'est leur disparition qui faisait
    // fondre le modèle en blanc pendant les gestes.
    expect(coarse.faces.some((f) => f.fill === null && f.stroke !== null)).toBe(true);
    // Pans entiers : les contours redeviennent des quadrilatères fermés.
    expect(
      coarse.faces.filter((f) => f.fill === null).every((f) => f.pts.length === 4),
    ).toBe(true);
  });

  it('donne une normale sortante à toute face de volume', () => {
    // Sans normale, impossible de masquer la face arrière : les deux faces
    // d'un mur, distantes de 14 cm, se disputaient l'affichage bande par
    // bande — d'où les rayures verticales sur les murs.
    const scene = buildScene(rect, [], [], { palette: TEST_PALETTE });
    const solid = scene.faces.filter((f) => !f.isFloor);
    expect(solid.length).toBeGreaterThan(0);
    expect(solid.every((f) => f.normal !== undefined)).toBe(true);
    // Normales unitaires.
    for (const f of solid) {
      const n = f.normal!;
      expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 6);
    }
  });

  it('ne montre jamais les deux faces d’un mur en même temps', () => {
    const scene = buildScene(rect, [], [], { palette: TEST_PALETTE });
    // Vue par défaut de l'app.
    const rad = (d: number) => (d * Math.PI) / 180;
    const cam = {
      ct: Math.cos(rad(-32)),
      st: Math.sin(rad(-32)),
      cp: Math.cos(rad(58)),
      sp: Math.sin(rad(58)),
    };
    const visible = scene.faces.filter((f) => !isHiddenFace(f, cam));
    // Une face et son opposée ont des normales opposées : au plus une des
    // deux survit, quelle que soit l'orientation.
    for (const f of visible) {
      const n = f.normal;
      if (!n) continue;
      const opposite = { ...f, normal: { x: -n.x, y: -n.y, z: -n.z } };
      expect(isHiddenFace(opposite, cam)).toBe(true);
    }
    expect(visible.length).toBeLessThan(scene.faces.length);
  });
});

describe('portes et fenêtres en volumes', () => {
  const height = 2.5;
  const rect = [
    { ...seg('n', { x: 0, z: 0 }, { x: 4, z: 0 }), height },
    { ...seg('e', { x: 4, z: 0 }, { x: 4, z: 3 }), height },
    { ...seg('s', { x: 4, z: 3 }, { x: 0, z: 3 }), height },
    { ...seg('w', { x: 0, z: 3 }, { x: 0, z: 0 }), height },
  ];
  /** Porte de 1 m au milieu du mur nord, du sol à 2,05 m. */
  const porte: WallSeg = {
    id: 'd1',
    type: 'door',
    a: { x: 1.5, z: 0 },
    b: { x: 2.5, z: 0 },
    height: 2.05,
    yCenter: 1.025,
  };
  /** Fenêtre de 1,2 m sur le mur est, allège à 0,9 m. */
  const fenetre: WallSeg = {
    id: 'w1',
    type: 'window',
    a: { x: 4, z: 1 },
    b: { x: 4, z: 2.2 },
    height: 1.1,
    yCenter: 1.45,
  };

  it('rattache chaque ouverture au mur qui la porte', () => {
    const holes = assignOpenings(rect, [porte, fenetre], 0);
    expect(holes.get('n')).toHaveLength(1);
    expect(holes.get('e')).toHaveLength(1);
    const d = holes.get('n')![0];
    expect(d.t0).toBeCloseTo(1.5 / 4);
    expect(d.t1).toBeCloseTo(2.5 / 4);
    expect(d.y0).toBeCloseTo(0);
    expect(d.y1).toBeCloseTo(2.05);
  });

  it('n’attrape pas une ouverture d’un mur perpendiculaire ou lointain', () => {
    const ailleurs: WallSeg = { ...porte, id: 'x', a: { x: 1.5, z: 9 }, b: { x: 2.5, z: 9 } };
    expect(assignOpenings(rect, [ailleurs], 0).size).toBe(0);
  });

  it('bâtit le mur AUTOUR de la porte, jamais dedans', () => {
    const holes = assignOpenings(rect, [porte], 0);
    const panels = wallPanels(holes.get('n')!, height);
    // Trumeau gauche, linteau au-dessus de la porte, trumeau droit.
    expect(panels).toHaveLength(3);
    expect(panels[0]).toMatchObject({ t0: 0, y0: 0, y1: height });
    expect(panels[1].y0).toBeCloseTo(2.05);
    expect(panels[1].y1).toBeCloseTo(height);
    expect(panels[2].t1).toBe(1);
    // Aucun morceau plein ne recouvre le vide de la porte.
    const dans = panels.filter(
      (p) => p.t0 < 0.6 && p.t1 > 0.4 && p.y0 < 2 && p.y1 > 0.1,
    );
    expect(dans).toHaveLength(0);
  });

  it('ajoute une allège sous une fenêtre', () => {
    const holes = assignOpenings(rect, [fenetre], 0);
    const panels = wallPanels(holes.get('e')!, height);
    // Deux trumeaux, une allège, un linteau.
    expect(panels).toHaveLength(4);
    expect(panels.some((p) => p.y0 === 0 && Math.abs(p.y1 - 0.9) < 1e-6)).toBe(true);
  });

  it('fusionne deux ouvertures qui se chevauchent au lieu de les empiler', () => {
    const a: WallHole = { seg: porte, t0: 0.2, t1: 0.5, y0: 0, y1: 2 };
    const b: WallHole = { seg: porte, t0: 0.4, t1: 0.7, y0: 0, y1: 2 };
    const panels = wallPanels([a, b], height);
    // Aucun panneau ne doit se superposer à un autre.
    for (let i = 0; i < panels.length; i++) {
      for (let j = i + 1; j < panels.length; j++) {
        const p = panels[i];
        const q = panels[j];
        const overlap =
          Math.min(p.t1, q.t1) - Math.max(p.t0, q.t0) > 1e-6 &&
          Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0) > 1e-6;
        expect(overlap).toBe(false);
      }
    }
  });

  it('rend la porte comme un bloc, sans plan flottant devant le mur', () => {
    const scene = buildScene(rect, [porte], [], {
      palette: TEST_PALETTE,
      colorOpenings: true,
    });
    const portes = scene.faces.filter((f) => f.fill === TEST_PALETTE.door);
    // Un bloc, donc plusieurs faces orientées différemment — pas un seul plan.
    expect(portes.length).toBeGreaterThan(3);
    expect(portes.every((f) => f.normal !== undefined)).toBe(true);
    // Plus aucun biais de tri : c'est lui qui faisait passer la porte devant
    // ou derrière le mur selon l'angle.
    expect(portes.every((f) => (f.bias ?? 0) < 0.01)).toBe(true);
  });

  it('cadre à l’identique en mode geste : le modèle ne saute pas', () => {
    // Le centre venait de la MOYENNE des sommets : moins de bandes, moins de
    // sommets, centre déplacé — le modèle sursautait au premier doigt posé.
    const fine = sceneFraming(buildScene(rect, [], [], { palette: TEST_PALETTE }).faces);
    const coarse = sceneFraming(
      buildScene(rect, [], [], { palette: TEST_PALETTE, coarse: true }).faces,
    );
    expect(coarse.center.x).toBeCloseTo(fine.center.x, 6);
    expect(coarse.center.y).toBeCloseTo(fine.center.y, 6);
    expect(coarse.center.z).toBeCloseTo(fine.center.z, 6);
    expect(coarse.radius3d).toBeCloseTo(fine.radius3d, 6);
  });
});

describe('multi-pièces', () => {
  // Deux pièces mitoyennes : salon 4 × 3, chambre 3 × 3, cloisons distantes
  // de 8 cm — soit MOINS que la tolérance de soudure, exprès.
  const salon = room('s', 0, 0, 4, 3);
  const chambre = inRoom('room-2', room('c', 4.08, 0, 3, 3));
  const plan = [...salon, ...chambre];

  it('range les murs par pièce, dans l’ordre d’apparition', () => {
    const groups = groupByRoom(plan);
    expect(groups.map((g) => g.roomId)).toEqual(['room-1', 'room-2']);
    expect(groups[0].items).toHaveLength(4);
    expect(groups[1].items).toHaveLength(4);
  });

  it('ne soude jamais deux pièces entre elles', () => {
    const welded = weldCorners(plan);
    const salonEst = welded.find((w) => w.id === 'se')!;
    const chambreOuest = welded.find((w) => w.id === 'cw')!;
    // Les deux cloisons restent où elles étaient : 4 et 4,08.
    expect(salonEst.a.x).toBeCloseTo(4);
    expect(chambreOuest.a.x).toBeCloseTo(4.08);
  });

  it('garde un contour fermé et une surface par pièce', () => {
    const parts = roomParts(weldCorners(plan));
    expect(parts).toHaveLength(2);
    expect(parts[0].surface?.exact).toBe(true);
    expect(parts[0].surface?.area).toBeCloseTo(12);
    expect(parts[1].surface?.exact).toBe(true);
    expect(parts[1].surface?.area).toBeCloseTo(9);
  });

  it('cumule les surfaces des pièces', () => {
    const total = totalArea(roomParts(weldCorners(plan)));
    expect(total?.area).toBeCloseTo(21);
    expect(total?.exact).toBe(true);
  });

  it('signale une surface approchée dès qu’une pièce est ouverte', () => {
    const ouverte = [...salon, ...inRoom('room-2', chambre.slice(0, 3))];
    const total = totalArea(roomParts(ouverte));
    expect(total?.exact).toBe(false);
  });

  it('ne prolonge pas un mur dans la cloison de la pièce voisine', () => {
    // Cloison du salon (room-1) butant en x = 4. Contre le mur est du salon,
    // c'est une jonction en T ; contre celui de la chambre (room-2, à 8 cm
    // seulement), ce doit rester un about droit.
    const cloison = seg('t', { x: 2, z: 1.5 }, { x: 4, z: 1.5 });
    const withTee = wallQuads([...salon, cloison]).get('t')!;
    const acrossRooms = wallQuads([...chambre, cloison]).get('t')!;
    // Même pièce : le bout entre dans le corps du mur (x > 4).
    expect(Math.max(withTee.b1.x, withTee.b2.x)).toBeGreaterThan(4);
    // Pièce voisine : la cloison s'arrête net.
    expect(Math.max(acrossRooms.b1.x, acrossRooms.b2.x)).toBeCloseTo(4);
  });

  it('donne au sol de chaque pièce sa propre couleur relevée', () => {
    const scene = buildScene(weldCorners(plan), [], [], {
      palette: TEST_PALETTE,
      showSurfaces: true,
      showTextures: true,
      floors: {
        'room-1': { color: '#8A6E4B' },
        'room-2': { color: '#4B6E8A' },
      },
    });
    expect(scene.rooms.map((r) => r.floorFill)).toEqual(['#8A6E4B', '#4B6E8A']);
    // Deux sols distincts dans la scène, pas un seul.
    expect(scene.faces.filter((f) => f.isFloor)).toHaveLength(2);
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
  // Pièce mitoyenne 3 × 3, sa cloison à 20 cm de celle du salon.
  const voisine = inRoom('room-2', room('v', 4.2, 0, 3, 3));

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
      floors: {
        'room-1': {
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

  it('nomme chaque pièce sur le plan multi-pièces', () => {
    const s = latin1String(
      buildScanPdf(
        {
          name: 'T2',
          walls: [...rect, ...voisine],
          openings: [],
          objects: [],
          roomNames: { 'room-1': 'Salon', 'room-2': 'Chambre' },
        },
        false,
      ),
    );
    expect(s).toContain('Salon');
    expect(s).toContain('Chambre');
    // Deux surfaces distinctes, pas une seule agrégée.
    expect(s).toContain('12,0 m');
    expect(s).toContain('9,0 m');
  });
});

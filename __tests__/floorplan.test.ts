import {
  bounds,
  makeMapping,
  segLength,
  snapAngle,
  toSegment,
  weldCorners,
} from '../src/geometry/floorplan';

describe('toSegment', () => {
  it('convertit une matrice iOS (colonne-major) en segment au sol', () => {
    // Mur de 4 m le long de l'axe X, centré en (1, 0, 2).
    const transform = [
      1, 0, 0, 0, // colonne 0 : direction X
      0, 1, 0, 0,
      0, 0, 1, 0,
      1, 1.25, 2, 1, // colonne 3 : position
    ];
    const seg = toSegment({
      id: 'w1',
      type: 'wall',
      length: 4,
      height: 2.5,
      transform,
    });
    expect(seg.a.x).toBeCloseTo(-1);
    expect(seg.b.x).toBeCloseTo(3);
    expect(seg.a.z).toBeCloseTo(2);
    expect(segLength(seg)).toBeCloseTo(4);
  });

  it('reprend directement les extrémités Android', () => {
    const seg = toSegment({
      id: 'w2',
      type: 'wall',
      length: 3,
      height: 2.4,
      ax: 0,
      az: 0,
      bx: 3,
      bz: 0,
    });
    expect(seg.b.x).toBe(3);
    expect(segLength(seg)).toBeCloseTo(3);
  });
});

describe('weldCorners', () => {
  it('soude les extrémités proches sur un point commun', () => {
    const walls = [
      { id: 'a', type: 'wall' as const, a: { x: 0, z: 0 }, b: { x: 4, z: 0.05 }, height: 2.5 },
      { id: 'b', type: 'wall' as const, a: { x: 4.08, z: -0.03 }, b: { x: 4, z: 3 }, height: 2.5 },
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
      { id: 'a', type: 'wall' as const, a: { x: -2, z: -1 }, b: { x: 2, z: -1 }, height: 2.5 },
      { id: 'b', type: 'wall' as const, a: { x: 2, z: -1 }, b: { x: 2, z: 3 }, height: 2.5 },
    ];
    const m = makeMapping(bounds(walls), 400, 600);
    const p = { x: 1.2, z: 0.7 };
    const back = m.toMeters(m.toPx(p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.z).toBeCloseTo(p.z);
  });
});

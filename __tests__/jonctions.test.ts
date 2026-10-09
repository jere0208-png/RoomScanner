/**
 * LES JONCTIONS DE MURS SONT PLEINES — plus de triangle dans la maçonnerie.
 *
 * Relevé du patron : « il y a aussi des triangles visibles dans les murs lors
 * de jonctions, il faut corriger ça ».
 *
 * La cause : à un nœud où TROIS murs se rejoignent (une cloison qui tombe sur
 * un mur coupé à cet endroit — le cas de toute jonction en T d'un plan
 * relevé pièce par pièce), chaque mur était taillé en onglet contre ses deux
 * voisins. Deux murs en angle partagent leurs onglets au point près ; trois
 * murs, non : leurs trois bouts d'onglet bordent au centre un TRIANGLE que
 * personne ne remplit. Le plan le montrait en blanc, la 3D aussi, le PDF
 * aussi — c'est le même contour partout.
 *
 * Le remède : à un nœud de trois murs ou plus, deux murs ALIGNÉS forment un
 * seul mur qui continue — leurs bouts se rejoignent sur toute l'épaisseur —,
 * et les autres viennent buter contre sa face.
 */
import { wallQuads, type WallQuad, type WallSeg } from '../src/geometry/floorplan';
import { appartementExemple } from '../src/data/exemple';

const mur = (id: string, ax: number, az: number, bx: number, bz: number, epaisseur?: number): WallSeg =>
  ({
    id,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
    ...(epaisseur ? { epaisseur } : {}),
  }) as WallSeg;

/** Le point est-il dans ce quadrilatère (convexe ou non) ? */
function dans(p: { x: number; z: number }, q: WallQuad): boolean {
  const pts = [q.a1, q.b1, q.b2, q.a2];
  let dedans = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) dedans = !dedans;
  }
  return dedans;
}

/** Les points d'un carré, sur une grille fine, qu'AUCUN mur ne couvre. */
function trous(quads: Map<string, WallQuad>, cx: number, cz: number, demi: number, pas = 0.005) {
  const vides: { x: number; z: number }[] = [];
  for (let x = cx - demi + pas / 2; x < cx + demi; x += pas) {
    for (let z = cz - demi + pas / 2; z < cz + demi; z += pas) {
      if (![...quads.values()].some((q) => dans({ x, z }, q))) vides.push({ x, z });
    }
  }
  return vides;
}

describe('une jonction en T est pleine', () => {
  // Le mur du haut, coupé au nœud ; la cloison qui y tombe.
  const MURS = [mur('g', 0, 0, 5, 0), mur('d', 5, 0, 8, 0), mur('c', 5, 0, 5, 3)];

  it('aucun jour dans le carré de la jonction', () => {
    const q = wallQuads(MURS);
    // Le corps du mur continu autour du nœud : 7 cm de part et d'autre.
    expect(trous(q, 5, 0, 0.065)).toHaveLength(0);
  });

  it('la cloison bute contre la face du mur, sans le traverser', () => {
    const q = wallQuads(MURS).get('c')!;
    for (const p of [q.a1, q.a2]) {
      // Son bout est sur la face intérieure du mur porteur (z = +0,07)…
      expect(p.z).toBeGreaterThan(0.07 - 1e-6);
    }
    // … et le mur porteur, lui, garde toute son épaisseur au nœud.
    const g = wallQuads(MURS).get('g')!;
    expect(Math.abs(g.b1.z - g.b2.z)).toBeCloseTo(0.14, 6);
    expect(g.b1.x).toBeCloseTo(5, 6);
    expect(g.b2.x).toBeCloseTo(5, 6);
  });

  it('pareil quand le mur porteur est un peu plus épais que la cloison', () => {
    const q = wallQuads([mur('g', 0, 0, 5, 0, 0.2), mur('d', 5, 0, 8, 0, 0.2), mur('c', 5, 0, 5, 3, 0.07)]);
    expect(trous(q, 5, 0, 0.095)).toHaveLength(0);
  });

  it('et quand le mur relevé n’est pas tout à fait droit (un degré)', () => {
    const z = Math.tan((1 * Math.PI) / 180) * 3;
    const q = wallQuads([mur('g', 0, 0, 5, 0), mur('d', 5, 0, 8, z), mur('c', 5, 0, 5, 3)]);
    expect(trous(q, 5, 0, 0.06)).toHaveLength(0);
  });
});

describe('une croix est pleine', () => {
  it('quatre murs, aucun jour', () => {
    const q = wallQuads([mur('o', 0, 0, 5, 0), mur('e', 5, 0, 8, 0), mur('s', 5, 0, 5, 3), mur('n', 5, -3, 5, 0)]);
    expect(trous(q, 5, 0, 0.065)).toHaveLength(0);
  });
});

describe('un angle reste un onglet', () => {
  it('deux murs partagent leurs coins au point près, comme avant', () => {
    const q = wallQuads([mur('a', 0, 0, 4, 0), mur('b', 4, 0, 4, 3)]);
    const a = q.get('a')!;
    const b = q.get('b')!;
    const coinsA = [a.b1, a.b2].map((p) => `${p.x.toFixed(6)},${p.z.toFixed(6)}`).sort();
    const coinsB = [b.a1, b.a2].map((p) => `${p.x.toFixed(6)},${p.z.toFixed(6)}`).sort();
    expect(coinsA).toEqual(coinsB);
    expect(trous(q, 4, 0, 0.065)).toHaveLength(0);
  });
});

describe('l’appartement d’exemple n’a plus un seul triangle', () => {
  it('chaque nœud de trois murs ou plus est plein', () => {
    const ex = appartementExemple();
    const walls = ex.walls as WallSeg[];
    const q = wallQuads(walls);
    const cle = (p: { x: number; z: number }) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`;
    const compte = new Map<string, number>();
    for (const w of walls) for (const p of [w.a, w.b]) compte.set(cle(p), (compte.get(cle(p)) ?? 0) + 1);
    const noeuds = [...compte.entries()].filter(([, n]) => n >= 3).map(([k]) => k.split(',').map(Number));
    expect(noeuds.length).toBeGreaterThan(2);
    for (const [x, z] of noeuds) expect(trous(q, x, z, 0.06)).toHaveLength(0);
  });
});

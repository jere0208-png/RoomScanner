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
 * Le remède : la jonction a SON polygone de maçonnerie, que chaque rendu
 * dessine avec les murs. On ne rallonge pas les murs pour la boucher : leur
 * contour sert aussi à mesurer leurs FACES — les cotes « depuis la gauche,
 * depuis la droite » de l'établi —, et ces faces doivent rester exactement où
 * elles sont.
 */
import { jonctionsDeMurs, wallQuads, type WallQuad, type WallSeg } from '../src/geometry/floorplan';
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

function polyContient(p: { x: number; z: number }, pts: { x: number; z: number }[]): boolean {
  let dedans = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) dedans = !dedans;
  }
  return dedans;
}

/**
 * Les points d'un carré, sur une grille fine, que NI les murs NI leurs
 * jonctions ne couvrent — ce que le plan, la 3D et le PDF peignent.
 */
function trous(murs: WallSeg[], cx: number, cz: number, demi: number, pas = 0.005) {
  const quads = wallQuads(murs);
  const jonctions = jonctionsDeMurs(murs);
  const vides: { x: number; z: number }[] = [];
  for (let x = cx - demi + pas / 2; x < cx + demi; x += pas) {
    for (let z = cz - demi + pas / 2; z < cz + demi; z += pas) {
      const p = { x, z };
      if (![...quads.values()].some((q) => dans(p, q)) && !jonctions.some((j) => polyContient(p, j))) vides.push(p);
    }
  }
  return vides;
}

describe('une jonction en T est pleine', () => {
  // Le mur du haut, coupé au nœud ; la cloison qui y tombe.
  const MURS = [mur('g', 0, 0, 5, 0), mur('d', 5, 0, 8, 0), mur('c', 5, 0, 5, 3)];

  it('aucun jour dans le carré de la jonction', () => {
    // Le corps du mur continu autour du nœud : 7 cm de part et d'autre.
    expect(trous(MURS, 5, 0, 0.065)).toHaveLength(0);
  });

  it('sans les jonctions, le trou était bien là — c’est lui qu’on bouche', () => {
    const quads = wallQuads(MURS);
    const p = { x: 5, z: 0.03 };
    expect([...quads.values()].some((q) => dans(p, q))).toBe(false);
    expect(jonctionsDeMurs(MURS).some((j) => polyContient(p, j))).toBe(true);
  });

  it('les faces des murs ne bougent pas : la cloison bute, le mur s’arrête à elle', () => {
    const q = wallQuads(MURS);
    const c = q.get('c')!;
    // Le bout de la cloison est sur la face du mur porteur (z = +0,07)…
    for (const p of [c.a1, c.a2]) expect(p.z).toBeCloseTo(0.07, 6);
    // … et la face du mur porteur, côté cloison, s'arrête à la face de la
    // cloison : c'est la longueur qu'on cote dans la pièce.
    const g = q.get('g')!;
    const coteCloison = [g.b1, g.b2].find((p) => p.z > 0)!;
    expect(coteCloison.x).toBeCloseTo(4.93, 6);
  });

  it('la jonction ne déborde pas de la maçonnerie', () => {
    for (const j of jonctionsDeMurs(MURS)) {
      for (const p of j) {
        expect(p.x).toBeGreaterThanOrEqual(4.93 - 1e-6);
        expect(p.x).toBeLessThanOrEqual(5.07 + 1e-6);
        expect(p.z).toBeGreaterThanOrEqual(-0.07 - 1e-6);
        expect(p.z).toBeLessThanOrEqual(0.07 + 1e-6);
      }
    }
  });

  it('pareil quand le mur porteur est un peu plus épais que la cloison', () => {
    expect(trous([mur('g', 0, 0, 5, 0, 0.2), mur('d', 5, 0, 8, 0, 0.2), mur('c', 5, 0, 5, 3, 0.07)], 5, 0, 0.095)).toHaveLength(0);
  });

  it('et quand le mur relevé n’est pas tout à fait droit (un degré)', () => {
    const z = Math.tan((1 * Math.PI) / 180) * 3;
    expect(trous([mur('g', 0, 0, 5, 0), mur('d', 5, 0, 8, z), mur('c', 5, 0, 5, 3)], 5, 0, 0.06)).toHaveLength(0);
  });
});

describe('une croix est pleine', () => {
  it('quatre murs, aucun jour', () => {
    expect(trous([mur('o', 0, 0, 5, 0), mur('e', 5, 0, 8, 0), mur('s', 5, 0, 5, 3), mur('n', 5, -3, 5, 0)], 5, 0, 0.065)).toHaveLength(0);
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
    expect(trous([mur('a', 0, 0, 4, 0), mur('b', 4, 0, 4, 3)], 4, 0, 0.065)).toHaveLength(0);
    // Un angle n'a pas besoin de jonction : il n'en reçoit pas.
    expect(jonctionsDeMurs([mur('a', 0, 0, 4, 0), mur('b', 4, 0, 4, 3)])).toHaveLength(0);
  });
});

describe('l’appartement d’exemple n’a plus un seul triangle', () => {
  it('chaque nœud de trois murs ou plus est plein', () => {
    const ex = appartementExemple();
    const walls = ex.walls as WallSeg[];
    const cle = (p: { x: number; z: number }) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`;
    const compte = new Map<string, number>();
    for (const w of walls) for (const p of [w.a, w.b]) compte.set(cle(p), (compte.get(cle(p)) ?? 0) + 1);
    const noeuds = [...compte.entries()].filter(([, n]) => n >= 3).map(([k]) => k.split(',').map(Number));
    expect(noeuds.length).toBeGreaterThan(2);
    for (const [x, z] of noeuds) expect(trous(walls, x, z, 0.06)).toHaveLength(0);
  });
});

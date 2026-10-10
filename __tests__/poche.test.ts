/**
 * LE POCHÉ — la maçonnerie d'un seul tenant, comme sur un plan d'architecte.
 *
 * Relevé du patron, plans d'architecte à l'appui : « pas de triangle de
 * jonction, tout est clean. On ne doit pas peindre mais revoir le système de
 * jonction lui-même pour qu'il s'adapte et fasse un mur en continu avec celui
 * qu'il rencontre. Les murs extérieurs sont plus épais. »
 *
 * Ce banc tient :
 *   — la CONTINUITÉ : un mur qui en rencontre un autre continue — sa face
 *     opposée est un seul trait droit, la jonction n'a ni couture ni trou ;
 *   — les FAÇADES : plus épaisses, vers le dehors seulement ; l'intérieur des
 *     pièces ne bouge pas ; les cloisons gardent leur épaisseur ;
 *   — les BAIES : de vrais vides, à travers toute l'épaisseur ;
 *   — l'appartement d'exemple, nœud par nœud.
 */
import { pocheDesMurs, aireSignee, SUREPAISSEUR_FACADE } from '../src/geometry/poche';
import { type Pt, type WallSeg } from '../src/geometry/floorplan';
import { appartementExemple } from '../src/data/exemple';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg =>
  ({ id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25 }) as WallSeg;

/** Dans le poché ? Pair-impair, comme le dessin. */
function dans(p: Pt, contours: Pt[][]): boolean {
  let n = 0;
  for (const c of contours) {
    let dedans = false;
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
      const a = c[i];
      const b = c[j];
      if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) dedans = !dedans;
    }
    if (dedans) n++;
  }
  return n % 2 === 1;
}

/** La maçonnerie seule, sans façade ni baie : la jonction, et rien d'autre. */
const maconnerie = (walls: WallSeg[]) => pocheDesMurs(walls, [], undefined, 0).contours;

describe('un mur rencontré continue', () => {
  // Un mur coupé à la jonction, et la cloison qui y tombe.
  const MURS = [mur('g', 0, 0, 5, 0), mur('d', 5, 0, 8, 0), mur('c', 5, 0, 5, 3)];

  it('une seule forme, pleine au cœur de la jonction', () => {
    const contours = maconnerie(MURS);
    expect(contours).toHaveLength(1);
    for (let x = 4.94; x < 5.07; x += 0.01) {
      for (let z = -0.065; z < 0.2; z += 0.01) {
        expect(dans({ x, z }, contours)).toBe(true);
      }
    }
  });

  it('la face opposée est UN trait droit, d’un bout à l’autre', () => {
    const [c] = maconnerie(MURS);
    const droits = c
      .map((a, i) => [a, c[(i + 1) % c.length]] as const)
      .filter(([a, b]) => Math.abs(a.z + 0.07) < 1e-6 && Math.abs(b.z + 0.07) < 1e-6);
    expect(droits).toHaveLength(1);
    const [a, b] = droits[0];
    expect(Math.abs(a.x - b.x)).toBeCloseTo(8, 3);
    // Et aucun sommet ne traîne au droit de la jonction, sur cette face.
    expect(c.some((p) => Math.abs(p.z + 0.07) < 1e-6 && Math.abs(p.x - 5) < 1e-3)).toBe(false);
  });

  it('une croix aussi', () => {
    const contours = maconnerie([mur('o', 0, 0, 5, 0), mur('e', 5, 0, 8, 0), mur('s', 5, 0, 5, 3), mur('n', 5, -3, 5, 0)]);
    expect(contours).toHaveLength(1);
    for (let x = 4.94; x < 5.07; x += 0.01) {
      for (let z = -0.065; z < 0.07; z += 0.01) expect(dans({ x, z }, contours)).toBe(true);
    }
  });

  it('une pièce fermée : un anneau, le dedans est un trou', () => {
    const contours = maconnerie([mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)]);
    expect(contours).toHaveLength(2);
    const aires = contours.map(aireSignee).sort((a, b) => a - b);
    // L'anneau : un contour extérieur, un trou dans l'autre sens.
    expect(aires[0]).toBeLessThan(0);
    expect(aires[1]).toBeGreaterThan(0);
    expect(dans({ x: 2, z: 1.5 }, contours)).toBe(false);
    expect(dans({ x: 2, z: 0.03 }, contours)).toBe(true);
  });
});

describe('l’appartement d’exemple, en plan d’architecte', () => {
  const ex = appartementExemple();
  const walls = ex.walls as WallSeg[];
  const openings = ex.openings as WallSeg[];
  const poche = pocheDesMurs(walls, openings, ex.rooms as never);
  const c = poche.contours;

  it('les façades s’épaississent vers le dehors — et seulement vers le dehors', () => {
    const e = SUREPAISSEUR_FACADE;
    expect(e).toBeGreaterThan(0.05);
    // Le mur du nord, loin des baies (x = 2,7) : de la face intérieure
    // (z = +0,07) à la face de façade (z = −0,07 − e).
    expect(dans({ x: 2.7, z: 0.06 }, c)).toBe(true);
    expect(dans({ x: 2.7, z: 0.08 }, c)).toBe(false);
    expect(dans({ x: 2.7, z: -0.07 - e + 0.01 }, c)).toBe(true);
    expect(dans({ x: 2.7, z: -0.07 - e - 0.01 }, c)).toBe(false);
  });

  it('l’angle saillant de la façade est plein', () => {
    const e = SUREPAISSEUR_FACADE;
    expect(dans({ x: -0.07 - e + 0.01, z: -0.07 - e + 0.01 }, c)).toBe(true);
    expect(dans({ x: -0.07 - e - 0.01, z: -0.07 - e - 0.01 }, c)).toBe(false);
  });

  it('les cloisons gardent leur épaisseur', () => {
    // Le refend séjour / chambre, x = 5, à mi-hauteur de son tracé.
    expect(dans({ x: 4.94, z: 1.2 }, c)).toBe(true);
    expect(dans({ x: 5.06, z: 1.2 }, c)).toBe(true);
    expect(dans({ x: 4.92, z: 1.2 }, c)).toBe(false);
    expect(dans({ x: 5.08, z: 1.2 }, c)).toBe(false);
  });

  it('les baies sont des vides, à travers toute l’épaisseur', () => {
    // La fenêtre de la cuisine, au nord (x de 0,8 à 2,2).
    for (const z of [0.05, 0, -0.1, -0.16]) expect(dans({ x: 1.5, z }, c)).toBe(false);
    // La porte du séjour vers la chambre, dans le refend (z de 2,5 à 3,33).
    for (const x of [4.95, 5, 5.05]) expect(dans({ x, z: 2.9 }, c)).toBe(false);
    // Et la menuiserie sait l'épaisseur où elle se loge : côté dehors, la façade.
    const fenetre = poche.baies.find((b) => b.type === 'window' && Math.abs(b.a.z) < 1e-6 && b.a.x < 1)!;
    expect(Math.max(fenetre.plus, fenetre.moins)).toBeCloseTo(0.07 + SUREPAISSEUR_FACADE, 6);
    expect(Math.min(fenetre.plus, fenetre.moins)).toBeCloseTo(0.07, 6);
  });

  it('aucun nœud de trois murs n’a de lacune', () => {
    const cle = (p: Pt) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`;
    const compte = new Map<string, number>();
    for (const w of walls) for (const p of [w.a, w.b]) compte.set(cle(p), (compte.get(cle(p)) ?? 0) + 1);
    const noeuds = [...compte.entries()].filter(([, n]) => n >= 3).map(([k]) => k.split(',').map(Number));
    expect(noeuds.length).toBeGreaterThan(2);
    const pres = (x: number, z: number) =>
      openings.some((o) => Math.min(Math.hypot(o.a.x - x, o.a.z - z), Math.hypot(o.b.x - x, o.b.z - z)) < 0.2);
    for (const [x, z] of noeuds) {
      if (pres(x, z)) continue;
      for (let dx = -0.06; dx <= 0.06; dx += 0.02) {
        for (let dz = -0.06; dz <= 0.06; dz += 0.02) expect(dans({ x: x + dx, z: z + dz }, c)).toBe(true);
      }
    }
  });

  it('se calcule vite, et une fois par plan', () => {
    const t0 = Date.now();
    const neuf = pocheDesMurs([...walls], openings, ex.rooms as never);
    expect(Date.now() - t0).toBeLessThan(400);
    expect(pocheDesMurs(walls, openings, ex.rooms as never)).not.toBe(neuf);
    const encore = pocheDesMurs(walls, openings, ex.rooms as never);
    expect(pocheDesMurs(walls, openings, ex.rooms as never)).toBe(encore);
  });
});

/**
 * LES COTES DE LA PERSPECTIVE, À LA FAÇON D'UN ARCHITECTE.
 *
 * Relevé du patron : « rends les cotes 3D plus professionnelles, sans gêner
 * le plan avec les délimitations et sans gros bloc blanc arrière ; un rendu
 * clean et compréhensible ». Voir `geometry/cotes3d`.
 */
import { buildScanPdf } from '../src/export/pdf';
import { pointInPolygon } from '../src/geometry/appearance';
import { cotesExterieures } from '../src/geometry/cotes3d';
import { detectRooms, roomParts, type WallSeg } from '../src/geometry/floorplan';

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

let n = 0;
const mur = (ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id: `m${n++}`,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});
// Deux pièces, 4 × 3 et 5 × 3, un refend à x = 4, et un muret isolé dans la seconde.
const walls = [
  mur(0, 0, 4, 0),
  mur(4, 0, 9, 0),
  mur(9, 0, 9, 3),
  mur(9, 3, 4, 3),
  mur(4, 3, 0, 3),
  mur(0, 3, 0, 0),
  mur(4, 0, 4, 3),
  mur(6, 1, 7.37, 1),
];
const rooms = detectRooms(walls).map((r, i) => ({ id: `r${i}`, wallIds: r.wallIds }));
const parts = roomParts(walls, rooms);
// L'œil au sud-est, en hauteur : il voit les façades sud (z = 3) et est (x = 9).
const vers = { x: 0.6, z: 0.8 };

describe('les cotes de l’enveloppe', () => {
  const cotes = cotesExterieures(walls, parts, vers);
  const longueurs = cotes.filter((c) => c.genre === 'longueur');

  it('cotent les façades, pas les cloisons ni le muret', () => {
    expect(longueurs.map((c) => c.texte).sort()).toEqual(['3,00 m', '3,00 m', '4,00 m', '4,00 m', '5,00 m', '5,00 m']);
    expect(cotes.some((c) => c.texte === '1,37 m')).toBe(false);
  });

  it('se tiennent hors du volume, parallèles à leur façade', () => {
    for (const c of longueurs) {
      const milieu = { x: (c.a.x + c.b.x) / 2, z: (c.a.z + c.b.z) / 2 };
      expect(parts.some((p) => pointInPolygon(milieu, p.surface!.pts))).toBe(false);
    }
  });

  it('au sol devant les façades qui font face, au faîte derrière les autres', () => {
    const sud = longueurs.filter((c) => c.a.z > 3 && c.b.z > 3);
    const nord = longueurs.filter((c) => c.a.z < 0 && c.b.z < 0);
    expect(sud.length).toBe(2);
    expect(nord.length).toBe(2);
    for (const c of sud) expect(c.a.y).toBe(0);
    for (const c of nord) expect(c.a.y).toBe(2.5);
  });

  it('la hauteur se cote une fois, sur l’angle extrême du volume à l’écran', () => {
    const h = cotes.filter((c) => c.genre === 'hauteur');
    expect(h).toHaveLength(1);
    expect(h[0].texte).toBe('2,50 m');
    // La droite de l'écran est au nord-est : l'angle x = 9, z = 0, écarté vers l'extérieur.
    expect(h[0].a.x).toBeGreaterThan(9);
    expect(h[0].a.z).toBeLessThan(0);
    expect(h[0].b.y - h[0].a.y).toBeCloseTo(2.5, 6);
    // À gauche, l'angle opposé : x = 0, z = 3.
    const g = cotesExterieures(walls, parts, vers, undefined, 'gauche').find((c) => c.genre === 'hauteur')!;
    expect(g.a.x).toBeLessThan(0);
    expect(g.a.z).toBeGreaterThan(3);
  });

  it('sans pièce fermée, rien à coter', () => {
    expect(cotesExterieures(walls, [], vers)).toEqual([]);
  });
});

describe('dans la perspective du dossier', () => {
  const src = latin1(buildScanPdf({ name: 'Plan', walls, openings: [], objects: [], rooms }, true, { metre: false }));
  const perspective = src.split('endstream').find((s) => s.includes('(Perspective) Tj'))!;

  it('les façades sont cotées, la cloison et le muret ne le sont pas', () => {
    expect(perspective).toContain('(4,00 m) Tj');
    expect(perspective).toContain('(5,00 m) Tj');
    expect(perspective).toContain('(2,50 m) Tj');
    expect(perspective).not.toContain('(1,37 m) Tj');
    // Six longueurs et une hauteur : pas une cote de plus.
    expect((perspective.match(/\(\d+,\d{2} m\) Tj/g) ?? []).length).toBe(7);
  });

  it('plus un seul pavé blanc sous un chiffre', () => {
    const paves = perspective
      .split('\n')
      .filter((l) => /1 1 1 rg/.test(l) && / f$/.test(l.trim()) && (l.match(/ l /g) ?? []).length === 3);
    expect(paves).toHaveLength(0);
  });
});

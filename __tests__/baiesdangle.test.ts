/**
 * UNE PORTE NE S'ENFONCE PAS DANS LE MUR D'ANGLE.
 *
 * Relevé du patron, diagnostic du scan du 12/10 à 08h57 à l'appui : « la
 * porte est imbriquée dans le mur, cachant une partie ».
 *
 * RoomPlan avait vu la porte à 2 cm de l'angle. Le plan, lui, pose le trait
 * d'un mur sur son AXE : le mur d'angle s'épaissit de 7 cm vers la pièce, et
 * son nu tombait 5 cm DANS l'ouverture — le gond, le dormant et le battant
 * mangés par la maçonnerie. Une baie qui empiète se recale contre le nu, en
 * gardant le petit jeu que le scan avait mesuré ; une baie trop large pour le
 * mur se réduit à l'espace libre.
 *
 * Les murs et les portes de ce banc sont ceux du diagnostic, au millimètre.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baiesHorsDesAngles, segLength, type WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.61,
  yCenter: -0.654,
});
const porte = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'door',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.185,
  yCenter: -0.867,
});

// Le diagnostic : trois murs, deux portes.
const M1 = mur('m1', 0.4282895278268182, -1.4560171213598654, 3.6487618719669683, 0.6474967927154864);
const M2 = mur('m2', 3.6487618719669683, 0.6474967927154864, 2.4755393833343646, 2.4436971229840196);
const M3 = mur('m3', -0.41769171688514106, -0.16082251565253713, 0.4282895278268182, -1.4560171213598654);
const MURS = [M1, M2, M3];
const P1 = porte('p1', 3.6383733848804596, 0.6634017303037325, 3.161881436896884, 1.3929094002199491);
const P2 = porte('p2', -0.08596100046103672, -0.6687011496252033, 0.38494043185179905, -1.3896496518426922);

/** Où commence et finit une baie sur son mur (m depuis `a` du mur). */
const surLeMur = (o: WallSeg, w: WallSeg) => {
  const L = segLength(w);
  const u = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
  const t = (p: { x: number; z: number }) => (p.x - w.a.x) * u.x + (p.z - w.a.z) * u.z;
  return { t0: Math.min(t(o.a), t(o.b)), t1: Math.max(t(o.a), t(o.b)), L };
};

describe('la porte collée à l’angle', () => {
  const [p1, p2] = baiesHorsDesAngles([P1, P2], MURS);

  it('se recale contre le nu du mur d’angle, en gardant le jeu du scan', () => {
    const avant = surLeMur(P1, M2);
    const apres = surLeMur(p1, M2);
    // Le scan : 2 cm de l'angle. Le nu du mur d'angle est à 7 cm de l'axe.
    expect(avant.t0).toBeLessThan(0.07);
    expect(apres.t0).toBeGreaterThanOrEqual(0.07);
    expect(apres.t0).toBeCloseTo(0.07 + avant.t0, 3);
  });

  it('garde sa largeur — on la déplace, on ne la rogne pas', () => {
    expect(segLength(p1)).toBeCloseTo(segLength(P1), 6);
  });

  it('la porte qui laissait déjà son jeu ne bouge pas', () => {
    expect(p2).toBe(P2);
  });

  it('sans rien à corriger, la liste rendue est la même', () => {
    const deja = baiesHorsDesAngles([p1, p2], MURS);
    expect(deja[0]).toBe(p1);
    expect(deja[1]).toBe(p2);
  });

  it('une baie plus large que l’espace libre s’y réduit, entre les deux nus', () => {
    // Un mur de 1 m entre deux murs de 14 cm : 86 cm de libre.
    const court = [mur('a', 0, 0, 1, 0), mur('g', 0, 0, 0, 2), mur('d', 1, 0, 1, 2)];
    const [b] = baiesHorsDesAngles([porte('b', 0, 0, 1, 0)], court);
    const { t0, t1 } = surLeMur(b, court[0]);
    expect(t0).toBeGreaterThanOrEqual(0.07 - 1e-9);
    expect(t1).toBeLessThanOrEqual(0.93 + 1e-9);
  });
});

describe('partout où les baies naissent', () => {
  it('à l’import du scan, et à l’ouverture d’un plan déjà enregistré', () => {
    const magasin = readFileSync(join(__dirname, '..', 'src', 'store', 'scanStore.ts'), 'utf8');
    // Les trois chemins d'import (scan, pièce ajoutée, scan d'un seul tenant).
    expect((magasin.match(/baiesHorsDesAngles\(\s*baiesVitrees\(/g) ?? []).length).toBe(3);
    // Et la migration des plans enregistrés.
    expect(magasin).toMatch(/const recalees = baiesHorsDesAngles\(s\.openings/);
  });
});

/**
 * LES NOMS DES PIÈCES SORTENT DU DESSIN.
 *
 * Relevé du patron, sur la vue d'ensemble de la page de garde : « les notes
 * avec les noms des pièces font cheap ; les sortir du plan pour ne pas gêner
 * la vue, et faire un trait vers la pièce concernée pour chaque nom ».
 *
 * Les étiquettes — un cartouche blanc « Séjour · 21,0 m² » posé sur le
 * modèle — cachaient les murs et les meubles qu'on voulait justement
 * montrer. Elles se rangent désormais en marge, à gauche les pièces de
 * gauche, à droite celles de droite, dans l'ordre de leur hauteur à l'écran
 * (les traits ne se croisent pas), et un trait fin mène chacune à sa pièce.
 */
import { buildScanPdf, rangerEnColonne } from '../src/export/pdf';
import { detectRooms, type WallSeg } from '../src/geometry/floorplan';

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

describe('ranger une colonne d’étiquettes', () => {
  it('garde chaque étiquette à la hauteur de sa pièce quand la place le permet', () => {
    expect(rangerEnColonne([500, 400, 300], 100, 700, 24)).toEqual([500, 400, 300]);
  });

  it('écarte celles qui se chevaucheraient, sans changer leur ordre', () => {
    const ys = rangerEnColonne([500, 495, 490, 200], 100, 700, 24);
    for (let i = 1; i < ys.length; i++) expect(ys[i - 1] - ys[i]).toBeGreaterThanOrEqual(24 - 1e-9);
    // L'ordre des pièces à l'écran est celui des étiquettes : pas de traits croisés.
    expect([...ys].sort((a, b) => b - a)).toEqual(ys);
  });

  it('remonte la colonne plutôt que de sortir du cadre par le bas', () => {
    const ys = rangerEnColonne([130, 125, 120, 115], 100, 700, 24);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(100);
    expect(Math.max(...ys)).toBeLessThanOrEqual(700);
  });

  it('accepte des pièces données dans n’importe quel ordre', () => {
    const ys = rangerEnColonne([200, 500, 495], 100, 700, 24);
    // Chacune garde sa place dans l'ordre d'entrée.
    expect(ys[1]).toBeGreaterThan(ys[2]);
    expect(ys[2]).toBeGreaterThan(ys[0]);
  });
});

describe('dans la perspective du dossier', () => {
  let n = 0;
  const mur = (ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id: `m${n++}`,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
  });
  const walls = [mur(0, 0, 4, 0), mur(4, 0, 8, 0), mur(8, 0, 8, 3), mur(8, 3, 4, 3), mur(4, 3, 0, 3), mur(0, 3, 0, 0), mur(4, 0, 4, 3)];
  const rooms = detectRooms(walls).map((r, i) => ({ id: `r${i}`, wallIds: r.wallIds }));
  const roomNames = Object.fromEntries(rooms.map((r, i) => [r.id, i === 0 ? 'Chambre' : 'Séjour']));

  it('le nom et la surface s’écrivent à part, et chaque pièce a son trait', () => {
    const src = latin1(buildScanPdf({ name: 'Plan', walls, openings: [], objects: [], rooms, roomNames }, true, { metre: false }));
    const perspective = src.split('endstream').find((s) => s.includes('(Perspective) Tj'))!;
    expect(perspective).toContain('(Chambre) Tj');
    expect(perspective).toContain('(Séjour) Tj');
    expect(perspective).toContain('(12,00 m²) Tj');
    // Plus de cartouche « Nom · surface » posé sur le dessin.
    expect(perspective).not.toMatch(/\((Chambre|Séjour) . 12,00? m²\) Tj/);
  });
});

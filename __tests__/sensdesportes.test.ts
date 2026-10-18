/**
 * UNE PORTE S'OUVRE DANS SA PIÈCE — et la même partout : plan, PDF, DXF, 3D.
 *
 * Enquête 2D : le sens se tirait du point au large de la pièce rattachée à
 * la porte. Une pièce en L le perdait (le point au large tombe au-delà de
 * la ligne du mur), une porte rattachée à une pièce qu'elle ne borde pas
 * battait dehors, et une porte sans pièce existante n'avait plus de battant.
 */
import { normaleVersLaPiece, roomParts, type WallSeg } from '../src/geometry/floorplan';
import { battantsDesPortes } from '../src/geometry/passage';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});
// Un séjour en L : 10 m de long sur 1,5 m, plus un bras de 4 × 5 m.
const L = [
  mur('n', 0, 0, 10, 0),
  mur('e', 10, 0, 10, 1.5),
  mur('r', 10, 1.5, 4, 1.5),
  mur('i', 4, 1.5, 4, 5),
  mur('s', 4, 5, 0, 5),
  mur('o', 0, 5, 0, 0),
];
const ROOMS = [{ id: 'sejour', name: 'Séjour', wallIds: L.map((w) => w.id) }];
const porte = (a: [number, number], b: [number, number], roomId?: string): WallSeg => ({
  id: 'p',
  type: 'door',
  a: { x: a[0], z: a[1] },
  b: { x: b[0], z: b[1] },
  height: 2.04,
  yCenter: 1.02,
  ...(roomId ? { roomId } : {}),
});

// Deux pièces de 4 × 4 côte à côte, la cloison en x = 4.
const DEUX_PIECES = [
  mur('n1', 0, 0, 4, 0),
  mur('n2', 4, 0, 8, 0),
  mur('e', 8, 0, 8, 4),
  mur('s2', 8, 4, 4, 4),
  mur('s1', 4, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
  mur('c', 4, 0, 4, 4),
];
const DEUX_ROOMS = [
  { id: 'sejour', name: 'Séjour', wallIds: ['n1', 'c', 's1', 'o'] },
  { id: 'chambre', name: 'Chambre', wallIds: ['n2', 'e', 's2', 'c'] },
];

describe('le sens d’ouverture des portes', () => {
  const parts = roomParts(L, ROOMS);

  it('sur le mur du recoin d’une pièce en L, la porte bat DANS la pièce', () => {
    const n = normaleVersLaPiece(porte([6.5, 1.5], [7.4, 1.5], 'sejour'), parts)!;
    // La pièce est au nord du mur du recoin (z < 1,5).
    expect(n.z).toBeLessThan(0);
    const [b] = battantsDesPortes([porte([6.5, 1.5], [7.4, 1.5], 'sejour')], L, ROOMS);
    expect(b.ouvert.z).toBeLessThan(1.5);
  });

  it('une porte rattachée à une pièce qui n’existe pas garde un battant, côté pièce', () => {
    const p = porte([1, 5], [1.9, 5], 'room-9');
    const n = normaleVersLaPiece(p, parts)!;
    expect(n.z).toBeLessThan(0);
    expect(battantsDesPortes([p], L, ROOMS)).toHaveLength(1);
  });

  it('une porte de façade rattachée à une autre pièce ne bat pas dehors', () => {
    // Deux pièces : la porte d'entrée, sur la façade sud de la chambre, a
    // été rattachée au séjour (relevé).
    const murs = DEUX_PIECES;
    const rooms = DEUX_ROOMS;
    const pp = roomParts(murs, rooms);
    // Le séjour est à x < 4 : la porte, à x 6, n'est pas sur son contour.
    const n = normaleVersLaPiece(porte([6, 4], [6.9, 4], 'sejour'), pp)!;
    expect(n.z).toBeLessThan(0);
  });

  it('entre deux pièces, la porte s’ouvre dans la sienne', () => {
    const murs = DEUX_PIECES;
    const rooms = DEUX_ROOMS;
    const pp = roomParts(murs, rooms);
    expect(normaleVersLaPiece(porte([4, 1], [4, 1.9], 'chambre'), pp)!.x).toBeGreaterThan(0);
    expect(normaleVersLaPiece(porte([4, 1], [4, 1.9], 'sejour'), pp)!.x).toBeLessThan(0);
  });
});

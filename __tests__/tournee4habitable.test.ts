/**
 * LA SURFACE HABITABLE SOUS COMBLES — revue « Sébastien », diagnostiqueur.
 *
 * - Sans plafond relevé au LiDAR, une chambre sous combles aux jambettes de
 *   1,00 m comptait tout son sol comme habitable (+44,8 %), et le PDF
 *   affirmait « hauteur sous plafond d'au moins 1,80 m ».
 * - Un pignon reculé de 10 cm : le sol passait de 30,00 à 30,60 m², et
 *   l'habitable restait figé à 22,50.
 */
import { surfacesHabitables } from '../src/geometry/habitable';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import type { PlafondDeLaPiece } from '../src/geometry/fichePiece';

/** Une pièce de `l` × `p` : murs nord et sud à `h1`, est et ouest à `h2`. */
const piece = (l: number, p: number, h1: number, h2: number) => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number, h: number): WallSeg => ({
    id,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: h,
    yCenter: h / 2,
  });
  const walls = [
    mur('n', 0, 0, l, 0, h1),
    mur('e', l, 0, l, p, h2),
    mur('s', l, p, 0, p, h1),
    mur('o', 0, p, 0, 0, h2),
  ];
  return { walls, parts: roomParts(walls, [{ id: 'r', wallIds: ['n', 'e', 's', 'o'] }]) };
};

describe('ce qui compte, d’après le nom', () => {
  it('une pièce habitée le reste, même « sous combles »', () => {
    const { parts } = piece(4, 4, 2.5, 2.5);
    for (const nom of ['Chambre sous combles', 'Combles aménagés', 'Grenier aménagé', 'Bureau (ancien garage)']) {
      expect(surfacesHabitables([{ id: 'r', name: nom }], parts).total).toBeCloseTo(16, 6);
    }
    for (const nom of ['Garage', 'Jardin d’hiver', 'Remise', 'Sous-sol', 'Combles']) {
      expect(surfacesHabitables([{ id: 'r', name: nom }], parts).total).toBe(0);
    }
  });
});

describe('sans plafond relevé', () => {
  it('des jambettes de 1,00 m : la pièce est dite « à vérifier »', () => {
    const { parts } = piece(5, 6, 1.0, 2.5);
    const hab = surfacesHabitables([{ id: 'r', name: 'Chambre sous combles' }], parts);
    expect(hab.aVerifier).toBe(1);
    expect(hab.pieces[0].aVerifier).toBe(true);
    expect(hab.pieces[0].raison).toMatch(/murs sous 1,80 m/);
  });

  it('une pièce aux murs de 2,50 m n’a rien à vérifier', () => {
    const { parts } = piece(5, 6, 2.5, 2.5);
    const hab = surfacesHabitables([{ id: 'r', name: 'Chambre' }], parts);
    expect(hab.aVerifier).toBe(0);
    expect(hab.total).toBeCloseTo(30, 6);
  });
});

describe('sous un rampant relevé', () => {
  const plafond = (solAuReleve?: number): PlafondDeLaPiece => ({
    hMin: 0.8,
    hMax: 2.6,
    hMoy: 1.9,
    couverture: 0.9,
    rampant: true,
    surfaceHabitable: 22.5,
    ...(solAuReleve !== undefined ? { solAuReleve } : {}),
  });

  it('l’habitable suit le pignon reculé : la part basse reste la même', () => {
    // Relevé à 5,00 × 6,00 = 30 m², pignon reculé de 10 cm : 5,10 × 6,00.
    const { parts } = piece(5.1, 6, 2.6, 2.6);
    const hab = surfacesHabitables([{ id: 'r', name: 'Chambre', releve: { plafond: plafond(30) } }], parts);
    expect(hab.pieces[0].sol).toBeCloseTo(30.6, 6);
    expect(hab.pieces[0].habitable).toBeCloseTo(23.1, 6);
  });

  it('un relevé d’avant (sans sol au relevé) garde l’ancien calcul', () => {
    const { parts } = piece(5.1, 6, 2.6, 2.6);
    const hab = surfacesHabitables([{ id: 'r', name: 'Chambre', releve: { plafond: plafond() } }], parts);
    expect(hab.pieces[0].habitable).toBeCloseTo(22.5, 6);
  });
});

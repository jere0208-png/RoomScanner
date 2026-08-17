/**
 * LA GAINE EN VOLUME — ce qu'on doit voir avant de percer.
 *
 * Sur le plan, un tireté suffit : on lit un tracé. Dans le modèle, on
 * prépare une pose — et un trait posé à plat ne dit ni par où passe le
 * tube, ni où il remonte. C'est pourtant la seule chose qu'on cherche des
 * yeux en préparant un chantier : par où arrive le fil.
 *
 * Ce fichier vérifie qu'une gaine demandée est bien un TUBE, qu'elle court
 * dans la chape, qu'elle remonte jusqu'à l'appareil qu'elle dessert, et
 * qu'elle ne coûte rien quand le calque est éteint.
 */
import { buildScene, type Face3D } from '../src/geometry/scene3d';
import type { WallSeg } from '../src/geometry/floorplan';

const PAL = {
  floor: '#EEE',
  floorStroke: '#CCC',
  wall: '#FFF',
  wallStroke: '#888',
  wallTop: '#F4F7FB',
  wallTopStroke: '#94A0B4',
  opening: '#B9C2CE',
  door: '#E0A030',
  window: '#40A0E0',
  passage: '#2F6FF0',
  object: '#D8E1F2',
  objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const MURS: WallSeg[] = [
  mur('a', 0, 0, 5, 0),
  mur('b', 5, 0, 5, 4),
  mur('c', 5, 4, 0, 4),
  mur('d', 0, 4, 0, 0),
];

const ROUTE = [
  {
    id: 'f1',
    path: [
      { x: 0.4, z: 0.1 },
      { x: 3.2, z: 3.9 },
    ],
  },
];

const gaines = (faces: Face3D[]) => faces.filter((f) => f.ownerId === 'gaine');

describe('la gaine dans le modèle 3D', () => {
  it('ne coûte pas une face quand le calque est éteint', () => {
    const { faces } = buildScene(MURS, [], [], { palette: PAL });
    expect(gaines(faces)).toHaveLength(0);
  });

  it('est un tube à quatre faces, pas un trait', () => {
    const { faces } = buildScene(MURS, [], [], { palette: PAL, routes: ROUTE });
    const g = gaines(faces);
    // Un tronçon = quatre faces, chacune un quadrilatère.
    expect(g).toHaveLength(4);
    for (const f of g) {
      expect(f.pts).toHaveLength(4);
      expect(f.normal).toBeDefined();
      for (const p of f.pts) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
        expect(Number.isFinite(p.z)).toBe(true);
      }
    }
  });

  /**
   * ELLE COURT DANS LA CHAPE, pas en l'air.
   *
   * Cinq centimètres au-dessus de la dalle : c'est là qu'on la déroule
   * avant de couler, et c'est la hauteur qui permet de la reconnaître au
   * premier coup d'œil dans le modèle.
   */
  it('court au ras du sol', () => {
    const { faces, floorY } = buildScene(MURS, [], [], {
      palette: PAL,
      routes: ROUTE,
    });
    for (const f of gaines(faces)) {
      for (const p of f.pts) {
        expect(p.y).toBeGreaterThan(floorY + 0.03);
        expect(p.y).toBeLessThan(floorY + 0.07);
      }
    }
  });

  /**
   * ET ELLE REMONTE JUSQU'À L'APPAREIL.
   *
   * Sans la remontée, le modèle montrait des prises alimentées par magie :
   * le tube s'arrêtait au sol, à l'aplomb, et personne ne pouvait dire
   * dans quelle cloison il monte.
   */
  it('remonte jusqu’à l’appareil desservi', () => {
    const { faces, floorY } = buildScene(MURS, [], [], {
      palette: PAL,
      routes: ROUTE,
      routeHeights: { f1: 1.1 },
    });
    const g = gaines(faces);
    // Deux tronçons : le parcours au sol, puis la remontée.
    expect(g).toHaveLength(8);
    const haut = Math.max(...g.flatMap((f) => f.pts.map((p) => p.y)));
    expect(haut).toBeGreaterThan(floorY + 1.05);
    expect(haut).toBeLessThan(floorY + 1.15);
    // La remontée est bien à l'aplomb du dernier point du tracé.
    const hautes = g.filter((f) => f.pts.some((p) => p.y > floorY + 0.5));
    for (const f of hautes) {
      for (const p of f.pts) {
        expect(Math.hypot(p.x - 3.2, p.z - 3.9)).toBeLessThan(0.05);
      }
    }
  });

  /** Une prise au ras du sol n'a pas de remontée à dessiner. */
  it('ne dessine pas de remontée pour un appareil au sol', () => {
    const { faces } = buildScene(MURS, [], [], {
      palette: PAL,
      routes: ROUTE,
      routeHeights: { f1: 0.05 },
    });
    expect(gaines(faces)).toHaveLength(4);
  });
});

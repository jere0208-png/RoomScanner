/**
 * LES SURFACES DE L'EXEMPLE, AU NU DES CLOISONS — revue « Nadia », métreuse.
 *
 * L'appartement d'exemple annonçait 48,00 m² « habitables » : l'enveloppe
 * 8 × 6 comptée à l'axe des cloisons, pour un intérieur de 45,8 (murs de
 * 14 cm). Le bureau 4,68 pour 4,38, l'entrée 4,32 pour 3,91. La cause : ses
 * refends, tracés à l'axe, n'étaient pas marqués comme tels, et un refend
 * scanné dont on ne sait pas de quel côté est le trait reste compté à son
 * trait (décision « un plan scanné ne change pas » du README, que la
 * correction générale aurait renversée).
 */
import { appartementExemple } from '../src/data/exemple';
import {
  WALL_T,
  cloisonsNonVues,
  longueurCotee,
  roomParts,
  type WallSeg,
} from '../src/geometry/floorplan';

const proche = (a: number, b: number, tol = 0.005) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('l’appartement d’exemple', () => {
  const ex = appartementExemple();
  const parts = roomParts(ex.walls, ex.rooms);
  const aire = (nom: string) => {
    const r = ex.rooms.find((x) => x.name === nom)!;
    return parts.find((p) => p.roomId === r.id)!.surface!.area;
  };

  it('compte ses pièces au nu des refends, ses façades à leur trait', () => {
    // Séjour : 0 → 4,93 × 0 → 4,13.
    proche(aire('Séjour-cuisine'), 4.93 * 4.13);
    // Chambre : 5,07 → 8 × 0 → 3,53.
    proche(aire('Chambre'), 2.93 * 3.53);
    proche(aire('Salle d’eau'), 2.93 * 2.33);
    proche(aire('Bureau'), 2.53 * 1.73);
    proche(aire('Entrée'), 2.26 * 1.73);
    proche(aire('Bureau'), 4.38, 0.01);
    proche(aire('Entrée'), 3.91, 0.01);
  });

  it('fait 45,8 m², l’enveloppe moins ses cloisons — plus 48,00', () => {
    const total = parts.reduce((t, p) => t + (p.surface?.area ?? 0), 0);
    // 15,8 m de refends de 14 cm, moins les trois carrés des jonctions en T
    // qu'on aurait retirés deux fois.
    proche(total, 48 - 15.8 * WALL_T + 3 * (WALL_T / 2) * WALL_T, 0.001);
    proche(total, 45.82, 0.005);
    expect(total).toBeLessThan(46);
  });

  it('cote ses façades à l’intérieur : 4,93 au mur nord du séjour', () => {
    const nord = ex.walls.find((w) => w.a.z === 0 && w.b.z === 0 && Math.max(w.a.x, w.b.x) === 5)!;
    proche(longueurCotee(ex.walls, nord, parts), 4.93, 1e-6);
  });

  it('marque ses refends comme posés à leur axe', () => {
    const refends = ex.walls.filter((w) => w.deuxFaces);
    // refend (3 tronçons), séjour-sud (2), bureau-est, chambre-sud.
    expect(refends).toHaveLength(7);
  });
});

describe('le refend d’un plan scanné', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number, extra: Partial<WallSeg> = {}): WallSeg => ({
    id,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
    ...extra,
  });
  // Deux pièces 4 × 4 et 3 × 4, un refend d'un seul trait en x = 4.
  const MURS = [
    mur('n1', 0, 0, 4, 0),
    mur('n2', 4, 0, 7, 0),
    mur('e', 7, 0, 7, 4),
    mur('s2', 7, 4, 4, 4),
    mur('s1', 4, 4, 0, 4),
    mur('o', 0, 4, 0, 0),
    mur('c', 4, 0, 4, 4),
  ];
  const ROOMS = [
    { id: 'gauche', wallIds: ['n1', 'c', 's1', 'o'] },
    { id: 'droite', wallIds: ['n2', 'e', 's2', 'c'] },
  ];

  it('posé à son axe (`deuxFaces`) : une demi-épaisseur de chaque côté', () => {
    const axe = MURS.map((w) => (w.id === 'c' ? { ...w, deuxFaces: true } : w));
    const [g, d] = roomParts(axe, ROOMS);
    proche(g.surface!.area, (4 - WALL_T / 2) * 4, 1e-6);
    proche(d.surface!.area, (3 - WALL_T / 2) * 4, 1e-6);
  });

  it('vu d’un côté (D7) : zéro du côté vu, l’épaisseur entière de l’autre', () => {
    const vus = MURS.map((w) => (w.id === 'c' ? { ...w, vu: { x: -1, z: 0 } } : w));
    const [g, d] = roomParts(vus, ROOMS);
    proche(g.surface!.area, 4 * 4, 1e-6);
    proche(d.surface!.area, (3 - WALL_T) * 4, 1e-6);
    expect(cloisonsNonVues(d).map((w) => w.id)).toEqual(['c']);
  });

  it('côté non établi : reste au trait, en attendant le mètre (décision du README)', () => {
    const [g, d] = roomParts(MURS, ROOMS);
    proche(g.surface!.area, 16, 1e-6);
    proche(d.surface!.area, 12, 1e-6);
  });
});

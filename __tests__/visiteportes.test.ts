/**
 * LA VISITE SUIT LES PORTES DE LA 3D — enquête de la visite.
 *
 * On traversait la porte palière de l'exemple, dessinée fermée, et l'on
 * finissait dans le vide ; on se tenait dans le vantail ouvert d'une porte ;
 * on passait sous l'allège d'un passe-plat.
 */
import { obstaclesDeLaVisite, type Obstacle, type PorteDeLaScene } from '../src/geometry/exploration';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});
// Deux pièces de 4 × 4, la cloison en x = 4.
const MURS = [
  mur('n1', 0, 0, 4, 0),
  mur('n2', 4, 0, 8, 0),
  mur('e', 8, 0, 8, 4),
  mur('s2', 8, 4, 4, 4),
  mur('s1', 4, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
  mur('c', 4, 0, 4, 4),
];
const ROOMS = [
  { id: 'a', name: 'Séjour', wallIds: ['n1', 'c', 's1', 'o'] },
  { id: 'b', name: 'Chambre', wallIds: ['n2', 'e', 's2', 'c'] },
];
const porte = (id: string, a: [number, number], b: [number, number]): WallSeg => ({
  id,
  type: 'door',
  a: { x: a[0], z: a[1] },
  b: { x: b[0], z: b[1] },
  height: 2.04,
  yCenter: 1.02,
});
/** Le nombre de pans pleins d'un mur (ses morceaux d'obstacle). */
const pansSur = (obs: Obstacle[], test: (o: Extract<Obstacle, { kind: 'mur' }>) => boolean) =>
  obs.filter((o): o is Extract<Obstacle, { kind: 'mur' }> => o.kind === 'mur' && test(o)).length;
const surLaCloison = (o: { a: { x: number }; b: { x: number } }) => Math.abs(o.a.x - 4) < 0.2 && Math.abs(o.b.x - 4) < 0.2;
const surLaFacadeSud = (o: { a: { z: number }; b: { z: number } }) => Math.abs(o.a.z - 4) < 0.2 && Math.abs(o.b.z - 4) < 0.2;

describe('la visite suit les portes de la 3D', () => {
  it('une porte entre deux pièces perce son mur ; une porte vers le dehors, non', () => {
    const obs = obstaclesDeLaVisite(MURS, [porte('int', [4, 1], [4, 1.9]), porte('ext', [1, 4], [1.9, 4])], [], ROOMS);
    expect(pansSur(obs, surLaCloison)).toBe(2);
    expect(pansSur(obs, (o) => surLaFacadeSud(o) && o.a.x < 4.1 && o.b.x < 4.1)).toBe(1);
  });

  it('avec les poses de la 3D : fermée, elle arrête ; ouverte, son vantail arrête', () => {
    const p = porte('int', [4, 1], [4, 1.9]);
    const fermee: PorteDeLaScene = { id: 'porte-int', cx: 4, cz: 1.45, yaw: Math.PI / 2, width: 0.9, attributes: ['PorteAngle:0'] };
    expect(pansSur(obstaclesDeLaVisite(MURS, [p], [], ROOMS, [fermee]), surLaCloison)).toBe(1);
    const ouverte: PorteDeLaScene = {
      ...fermee,
      attributes: ['PorteAngle:85', 'PorteGond:gauche', 'PorteSens:1'],
    };
    const obs = obstaclesDeLaVisite(MURS, [p], [], ROOMS, [ouverte]);
    expect(pansSur(obs, surLaCloison)).toBe(2);
    expect(obs.some((o) => o.kind === 'meuble' && o.id === 'porte-int')).toBe(true);
  });

  it('un passe-plat (ouverture avec allège) ne se traverse pas', () => {
    const passePlat: WallSeg = { id: 'pp', type: 'opening', a: { x: 4, z: 1 }, b: { x: 4, z: 2 }, height: 0.6, yCenter: 1.3 };
    expect(pansSur(obstaclesDeLaVisite(MURS, [passePlat], [], ROOMS), surLaCloison)).toBe(1);
    const passage: WallSeg = { ...passePlat, height: 2.1, yCenter: 1.05 };
    expect(pansSur(obstaclesDeLaVisite(MURS, [passage], [], ROOMS), surLaCloison)).toBe(2);
  });
});

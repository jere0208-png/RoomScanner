/**
 * LE SEMIS DU SOL S'ARRETE AU NU DES MURS.
 *
 * Releve du patron, capture 3D a l'appui : « la surface ne doit pas se voir
 * a travers les murs du modele 3D ». Sur l'image, les points du sol
 * apparaissent DANS la bande du mur avant.
 *
 * Ce n'est pas un defaut de tri : le semis est peint en premier, tout au
 * fond. C'est que le mur de devant est estompe — l'ecorche, qui existe pour
 * qu'on voie DANS la piece sans la retourner — et qu'un mur a quinze pour
 * cent d'opacite laisse voir ce qui est dessous.
 *
 * Le remede n'est donc pas dans l'ordre de peinture mais dans la GEOMETRIE :
 * le contour d'une piece suit l'AXE de ses murs, et le semis s'etendait donc
 * sous la moitie de leur epaisseur. S'il s'arrete au nu interieur, il n'y a
 * plus rien a voir au travers — et le dessin gagne au passage un liseré net
 * le long des murs, comme sur un plan d'architecte.
 */
import { pointsDuSol } from '../src/geometry/appearance';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz },
  height: 2.5, yCenter: 1.25, roomId: 'r1',
});
/** Un sejour de 4 x 3, contour pris sur l'AXE des murs. */
const MURS = [
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 3),
  mur('s', 4, 3, 0, 3),
  mur('w', 0, 3, 0, 0),
];
const CONTOUR = [
  { x: 0, z: 0 },
  { x: 4, z: 0 },
  { x: 4, z: 3 },
  { x: 0, z: 3 },
];

describe('le semis du sol', () => {
  it('ne pose aucun point sous un mur', () => {
    const pts = pointsDuSol(CONTOUR, MURS, 0.15, 400);
    expect(pts.length).toBeGreaterThan(20);
    for (const p of pts) {
      // Le nu interieur : la moitie de l'epaisseur depuis l'axe.
      expect(p.x).toBeGreaterThan(0.06);
      expect(p.x).toBeLessThan(3.94);
      expect(p.z).toBeGreaterThan(0.06);
      expect(p.z).toBeLessThan(2.94);
    }
  });

  it('mais en garde assez pour qu’on voie la surface', () => {
    const pts = pointsDuSol(CONTOUR, MURS, 0.3, 400);
    // Une piece de douze metres carres au pas de trente centimetres : il
    // reste de quoi lire un sol, pas trois points perdus.
    expect(pts.length).toBeGreaterThan(50);
  });

  it('et ne pretend rien quand la piece n’a pas de murs connus', () => {
    const pts = pointsDuSol(CONTOUR, [], 0.3, 400);
    expect(pts.length).toBeGreaterThan(50);
  });
});

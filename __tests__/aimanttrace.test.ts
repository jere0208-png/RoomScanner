/**
 * LE RECTANGLE QU'ON TIRE SE COLLE AUX MURS QUI SONT LA.
 *
 * Le geste « poser, glisser, lacher » reprend un mur existant quand un cote
 * tombe dessus — a douze centimetres pres. Sans aide, y tomber releve de la
 * CHANCE : douze centimetres sur un plan dezoome, c'est deux pixels.
 *
 * On aimante donc les deux coins pendant qu'on tire, sur les lignes que les
 * murs existants dessinent deja : leur abscisse pour un mur vertical, leur
 * ordonnee pour un mur horizontal. C'est ainsi qu'un logement se construit —
 * les pieces s'alignent sur ce qui existe, elles ne flottent pas a cote.
 *
 * ET SEULEMENT DE PRES : au large, on tire ou l'on veut. Une piece posee a
 * un metre du reste est un choix, pas une erreur de visee.
 */
import { aimanterCoin } from '../src/geometry/poser';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz },
  height: 2.5, yCenter: 1.25, roomId: 'r1',
});
/** Un sejour de 4 x 3, coin a l'origine. */
const MURS = [
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 3),
  mur('s', 4, 3, 0, 3),
  mur('w', 0, 3, 0, 0),
];

describe('l’aimant du tracé', () => {
  it('colle un coin sur la ligne d’un mur voisin', () => {
    // A huit centimetres du mur est (x = 4) : on y va.
    const p = aimanterCoin({ x: 4.08, z: 1.5 }, MURS);
    expect(p.x).toBeCloseTo(4, 3);
    // L'autre axe ne bouge pas : rien ne l'appelle.
    expect(p.z).toBeCloseTo(1.5, 3);
  });

  it('colle les deux axes quand on vise un coin', () => {
    const p = aimanterCoin({ x: 4.06, z: 2.94 }, MURS);
    expect(p.x).toBeCloseTo(4, 3);
    expect(p.z).toBeCloseTo(3, 3);
  });

  it('mais laisse tirer au large', () => {
    const p = aimanterCoin({ x: 5.4, z: 1.5 }, MURS);
    expect(p.x).toBeCloseTo(5.4, 3);
    expect(p.z).toBeCloseTo(1.5, 3);
  });

  it('ne pretend rien sur un plan vierge', () => {
    const p = aimanterCoin({ x: 2, z: 2 }, []);
    expect(p.x).toBeCloseTo(2, 3);
    expect(p.z).toBeCloseTo(2, 3);
  });

  it('prend la ligne la PLUS proche quand deux se disputent le coin', () => {
    // Deux murs verticaux voisins : c'est celui qu'on frole qui gagne.
    const deux = [...MURS, mur('bis', 4.3, 0, 4.3, 3)];
    expect(aimanterCoin({ x: 4.26, z: 1 }, deux).x).toBeCloseTo(4.3, 3);
    expect(aimanterCoin({ x: 4.04, z: 1 }, deux).x).toBeCloseTo(4, 3);
  });
});

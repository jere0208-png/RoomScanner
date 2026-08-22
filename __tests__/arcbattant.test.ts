/**
 * UN BATTANT NE FAIT JAMAIS PLUS D'UN QUART DE TOUR.
 *
 * Trouve a l'oeil, en regardant le DXF rendu en image : sur une porte qui
 * ouvre vers l'exterieur, l'arc du battant partait dans le mauvais sens et
 * decrivait presque un TOUR COMPLET — il traversait le mur, ressortait de
 * l'autre cote, et enfermait la piece dans une boucle.
 *
 * La cause tient a une soustraction d'angles. Le dormant est a un cap, le
 * vantail ouvert a un autre, et l'on interpolait de l'un a l'autre en
 * ligne droite : quand les deux caps tombent de part et d'autre de la
 * coupure a plus ou moins pi, l'ecart calcule vaut trois cents degres au
 * lieu de soixante. Le trace prend alors le chemin long.
 *
 * UNE PORTE NE S'OUVRE QUE D'UN COTE, ET PAS AU-DELA DU DEMI-TOUR : on
 * ramene donc l'ecart dans l'intervalle qui a un sens physique. C'est le
 * genre de defaut qu'aucune relecture du flux ne montre — il faut REGARDER
 * le dessin, et c'est pour ca que les PDF de ce projet se verifient en
 * image.
 */
import { arcDuBattant } from '../src/geometry/floorplan';

describe('l’arc d’un battant', () => {
  it('ne depasse jamais le demi-tour, meme a la coupure des angles', () => {
    // Une porte sur un mur horizontal, ouvrant vers le haut : le dormant
    // pointe a 180 degres, le vantail a -90. L'ecart naif vaut 270.
    const arc = arcDuBattant(
      { x: 1, z: 0 },
      { x: 0, z: 0 },
      { x: 0, z: -1 },
      1,
      8,
    );
    // Chaque point de l'arc reste a la distance du vantail : c'est un arc,
    // pas une spirale.
    for (const p of arc) {
      expect(Math.hypot(p.x - 1, p.z - 0)).toBeCloseTo(1, 6);
    }
    // Et il ne repasse pas de l'autre cote du mur : tous les points sont
    // du cote ou la porte s'ouvre.
    for (const p of arc) {
      expect(p.z).toBeLessThanOrEqual(1e-6);
    }
  });

  it('va bien du dormant au vantail', () => {
    const arc = arcDuBattant(
      { x: 1, z: 0 },
      { x: 0, z: 0 },
      { x: 0, z: -1 },
      1,
      8,
    );
    expect(arc[0].x).toBeCloseTo(0, 6);
    expect(arc[0].z).toBeCloseTo(0, 6);
    expect(arc[arc.length - 1].x).toBeCloseTo(1, 6);
    expect(arc[arc.length - 1].z).toBeCloseTo(-1, 6);
  });

  it('et fonctionne dans l’autre sens d’ouverture', () => {
    const arc = arcDuBattant(
      { x: 1, z: 0 },
      { x: 0, z: 0 },
      { x: 0, z: 1 },
      1,
      8,
    );
    for (const p of arc) {
      expect(p.z).toBeGreaterThanOrEqual(-1e-6);
    }
    expect(arc[arc.length - 1].z).toBeCloseTo(1, 6);
  });
});

/**
 * UN POINT DE PLAFOND SE POSE AU CENTRE, PAS OU LE DOIGT TREMBLE.
 *
 * Suite du releve du patron : « si on vise le plafond pour mettre un point
 * lumineux, on le centre a la largeur deja calculee par le scan, et si c'est
 * la meme piece, l'ajout d'un point s'axe automatiquement au premier, dans
 * une logique de placement ».
 *
 * C'est la regle du metier : un point de centre est AU CENTRE. Personne ne
 * pose un DCL a quarante centimetres de l'axe parce que le telephone
 * tremblait ; et deux points dans une meme piece se posent sur un axe, pas
 * en diagonale. Le scan connait le contour : il sait ou est le centre, et il
 * sait ou passe l'axe du premier point.
 *
 * ON N'INVENTE PAS DE PIECE : hors de tout contour, on ne centre rien —
 * il n'y a pas de centre. Le point garde alors le lieu vise.
 */
import { aimanterPlafond } from '../src/geometry/viseur';

/** Un sejour de 5 x 4, coin a l'origine : centre en (2,5 ; 2). */
const CONTOUR = [
  { x: 0, z: 0 },
  { x: 5, z: 0 },
  { x: 5, z: 4 },
  { x: 0, z: 4 },
];

describe('la pose d’un point de plafond', () => {
  it('se centre dans la piece quand il est seul', () => {
    const p = aimanterPlafond({ x: 3.4, z: 1.2 }, CONTOUR, []);
    expect(p.at.x).toBeCloseTo(2.5, 2);
    expect(p.at.z).toBeCloseTo(2, 2);
    expect(p.mot).toMatch(/centr/i);
  });

  it('mais s’axe sur le premier quand il y en a deja un', () => {
    /*
      DEUX POINTS FONT UNE LIGNE, PAS UN NUAGE.

      Le second se pose sur l'axe du premier — meme abscisse s'il est
      au-dessus ou au-dessous, meme ordonnee s'il est a cote. On ne le
      DEPLACE pas le long de cet axe : sa distance au premier est ce que
      l'electricien a voulu, c'est son alignement qui tremblait.
    */
    const premier = { x: 2.5, z: 2 };
    // Visé plus loin sur l'axe des x, avec un ecart en z du au tremblement.
    const p = aimanterPlafond({ x: 4.1, z: 2.18 }, CONTOUR, [premier]);
    expect(p.at.z).toBeCloseTo(2, 2);
    expect(p.at.x).toBeCloseTo(4.1, 2);
    expect(p.mot).toMatch(/align/i);
  });

  it('et dans l’autre sens aussi', () => {
    const premier = { x: 2.5, z: 2 };
    const p = aimanterPlafond({ x: 2.62, z: 3.3 }, CONTOUR, [premier]);
    expect(p.at.x).toBeCloseTo(2.5, 2);
    expect(p.at.z).toBeCloseTo(3.3, 2);
  });

  it('ne force rien quand la visee est franchement de biais', () => {
    // A un metre de l'axe dans les deux sens, ce n'est plus un tremblement :
    // c'est un placement voulu, en quinconce ou dans un angle.
    const premier = { x: 1, z: 1 };
    const p = aimanterPlafond({ x: 4, z: 3.2 }, CONTOUR, [premier]);
    expect(p.at.x).toBeCloseTo(4, 2);
    expect(p.at.z).toBeCloseTo(3.2, 2);
    expect(p.mot).toBeNull();
  });

  it('hors de tout contour, il n’y a pas de centre a trouver', () => {
    const p = aimanterPlafond({ x: 9, z: 9 }, null, []);
    expect(p.at.x).toBeCloseTo(9, 2);
    expect(p.at.z).toBeCloseTo(9, 2);
    expect(p.mot).toBeNull();
  });
});

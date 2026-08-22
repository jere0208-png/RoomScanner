/**
 * ON POSE UN MEUBLE OU L'ON VEUT, SAUF DANS UN MUR.
 *
 * Releve du patron : « le deplacement des meubles est a revoir. On doit
 * pouvoir les placer n'importe ou, meme traverser les murs, mais impossible
 * a placer SUR un mur (meuble rouge au placement si impossible), et une
 * legere attraction contre les murs (sans les toucher), et pas de bouton
 * valider ».
 *
 * C'EST L'INVERSE DE CE QUE FAISAIT L'APPLICATION. Le meuble etait contraint
 * A CHAQUE IMAGE : rabattu hors des murs, retourne pour entrer dans une
 * niche, rabote pour tenir dans un recoin. Le doigt proposait, la geometrie
 * disposait — et l'on se battait avec un meuble qui glissait tout seul.
 *
 * La regle du patron est plus simple et plus juste : LE DOIGT COMMANDE. Le
 * meuble suit exactement, y compris a travers les murs — on traverse une
 * cloison pour aller dans la piece d'a cote, c'est le geste naturel. Ce qui
 * est refuse, c'est de LACHER dans la maconnerie : la, le meuble se signale
 * en rouge, et le lacher le ramene ou il etait.
 *
 * L'ATTRACTION, ELLE, NE TOUCHE PAS LE MUR. Un meuble se pose CONTRE un mur,
 * pas dedans : l'aimant l'amene au nu, jamais au-dela.
 */
import { poserLibre } from '../src/geometry/poser';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz },
  height: 2.5, yCenter: 1.25, roomId: 'r1',
});
/** Un sejour de 5 x 4, mur nord en z=0. */
const MURS = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];
/** Une commode de 1,20 x 0,45. */
const MEUBLE = { width: 1.2, depth: 0.45, yaw: 0 };

describe('poser un meuble a la main', () => {
  it('suit le doigt au large, sans rien corriger', () => {
    const p = poserLibre({ x: 2.5, z: 2 }, MEUBLE, MURS);
    expect(p.centre.x).toBeCloseTo(2.5, 3);
    expect(p.centre.z).toBeCloseTo(2, 3);
    expect(p.valide).toBe(true);
    expect(p.aimante).toBe(false);
  });

  it('traverse les murs pendant qu’on le tient', () => {
    // Le doigt est passe de l'autre cote de la cloison : le meuble y va.
    // C'est le geste de quelqu'un qui change une commode de piece.
    const p = poserLibre({ x: 2.5, z: -1 }, MEUBLE, MURS);
    expect(p.centre.x).toBeCloseTo(2.5, 3);
    expect(p.centre.z).toBeCloseTo(-1, 3);
  });

  it('mais dit NON quand il chevauche la maconnerie', () => {
    // Centre a douze centimetres du mur nord : la commode mord dedans.
    const p = poserLibre({ x: 2.5, z: 0.12 }, MEUBLE, MURS);
    expect(p.valide).toBe(false);
  });

  it('et se laisse attirer contre un mur, sans le toucher', () => {
    /*
      L'AIMANT AMENE AU NU, JAMAIS AU-DELA.

      Une commode posee a trente centimetres du mur, ce n'est pas un choix :
      c'est un doigt qui n'a pas vise juste. On l'amene contre le mur — sa
      face arriere au nu, a un centimetre pres — et le meuble reste ENTIER
      du bon cote.
    */
    const p = poserLibre({ x: 2.5, z: 0.5 }, MEUBLE, MURS);
    expect(p.aimante).toBe(true);
    expect(p.valide).toBe(true);
    // Le bord arriere touche le nu du mur (epaisseur comprise), pas plus.
    const bordArriere = p.centre.z - MEUBLE.depth / 2;
    expect(bordArriere).toBeGreaterThanOrEqual(0.04);
    expect(bordArriere).toBeLessThanOrEqual(0.12);
  });

  it('n’attire pas de loin : au large, on ne touche a rien', () => {
    const p = poserLibre({ x: 2.5, z: 1.2 }, MEUBLE, MURS);
    expect(p.aimante).toBe(false);
    expect(p.centre.z).toBeCloseTo(1.2, 3);
  });

  it('ne pretend rien quand il n’y a pas de mur', () => {
    const p = poserLibre({ x: 2.5, z: 2 }, MEUBLE, []);
    expect(p.valide).toBe(true);
    expect(p.aimante).toBe(false);
  });
});

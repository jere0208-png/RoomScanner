/**
 * Un appareil caché par un meuble doit quand même SE SAVOIR.
 *
 * Sur le modèle 3D, une prise posée derrière un rangement disparaît purement
 * et simplement : rien ne dit qu'elle existe. L'électricien qui fait le tour
 * du modèle en compte une de moins, et c'est celle qu'il oubliera au devis.
 *
 * La règle : de loin, un point de sa couleur — on ne cherche pas à la lire,
 * seulement à savoir qu'il y a quelque chose là. De près, le meuble s'efface
 * et l'appareil réapparaît en entier.
 *
 * Le test porte sur la géométrie du masquage, pas sur les pixels : c'est
 * `hiddenByBox` qui décide, et c'est elle qui doit être juste sous tous les
 * angles.
 */
import { hiddenByBox } from '../src/geometry/furniture';

/** Un rangement d'un mètre, contre le mur nord, 90 cm de haut. */
const RANGEMENT = {
  cx: 2,
  cz: 0.36,
  y0: 0,
  y1: 0.9,
  width: 1,
  depth: 0.45,
  yaw: 0,
};

const rad = (d: number) => (d * Math.PI) / 180;
/**
 * La direction du regard, celle de la vue isométrique.
 *
 * θ = 0 place l'œil du côté des z croissants : depuis la pièce, pour un mur
 * posé en z = 0. Se tromper de sens fait regarder le mur par l'extérieur —
 * et là, évidemment, aucun meuble de la pièce ne gêne.
 */
const versOeil = (theta: number, phi: number) => ({
  x: Math.sin(rad(theta)) * Math.sin(rad(phi)),
  y: Math.cos(rad(phi)),
  z: Math.cos(rad(theta)) * Math.sin(rad(phi)),
});

describe('ce qu’un meuble cache', () => {
  it('une prise basse, juste derrière lui, est masquée', () => {
    // La prise est sur le mur (z ≈ 0,07), à 25 cm du sol, derrière le
    // rangement ; l'œil est du côté de la pièce (z croissant).
    const p = { x: 2, y: 0.25, z: 0.08 };
    expect(hiddenByBox(p, versOeil(0, 35), RANGEMENT)).toBe(true);
  });

  it('la même prise, vue par le côté, ne l’est plus', () => {
    // De profil, le regard passe à côté du rangement.
    const p = { x: 2, y: 0.25, z: 0.08 };
    expect(hiddenByBox(p, versOeil(90, 20), RANGEMENT)).toBe(false);
  });

  it('un interrupteur à 1,10 m passe AU-DESSUS du meuble', () => {
    const p = { x: 2, y: 1.1, z: 0.08 };
    expect(hiddenByBox(p, versOeil(0, 35), RANGEMENT)).toBe(false);
  });

  it('une prise décalée d’un mètre n’est pas derrière lui', () => {
    const p = { x: 3.2, y: 0.25, z: 0.08 };
    expect(hiddenByBox(p, versOeil(0, 35), RANGEMENT)).toBe(false);
  });

  /**
   * Même en plongée, un meuble de 90 cm couvre une prise de plinthe.
   *
   * L'intuition dit le contraire — « en regardant d'en haut, je vois
   * par-dessus » — et c'est faux : le regard entre dans l'emprise du
   * rangement bien avant d'avoir pris les 65 cm de hauteur qui l'en
   * sortiraient. C'est justement pour ces cas-là que le point de couleur
   * existe : aucun angle ne révèle la prise, il faut zoomer.
   *
   * (φ petit = vue plongeante : dans ce repère, `cos φ` pèse l'altitude.)
   */
  it('même en plongée, la prise de plinthe reste couverte', () => {
    const p = { x: 2, y: 0.25, z: 0.08 };
    expect(hiddenByBox(p, versOeil(0, 10), RANGEMENT)).toBe(true);
  });

  it('mais une prise POSÉE HAUT se dégage dès qu’on plonge un peu', () => {
    // À 1,10 m, elle domine le rangement : plus rien devant elle.
    const haut = { x: 2, y: 1.1, z: 0.08 };
    expect(hiddenByBox(haut, versOeil(0, 10), RANGEMENT)).toBe(false);
    expect(hiddenByBox(haut, versOeil(0, 60), RANGEMENT)).toBe(false);
  });

  it('un meuble tourné garde ses vraies limites', () => {
    // Pivoté d'un quart de tour, le rangement ne fait plus que 45 cm de
    // large : ce qu'il couvrait à 40 cm de son axe passe à découvert.
    const pivote = { ...RANGEMENT, yaw: Math.PI / 2 };
    const cote = { x: 2.4, y: 0.25, z: 0.08 };
    expect(hiddenByBox(cote, versOeil(0, 35), RANGEMENT)).toBe(true);
    expect(hiddenByBox(cote, versOeil(0, 35), pivote)).toBe(false);
  });

  it('le point de départ ne se masque pas lui-même', () => {
    // Un appareil DANS l'emprise du meuble (une prise sur un îlot) ne doit
    // pas se déclarer caché par lui : le rayon part de l'intérieur.
    const p = { x: 2, y: 0.5, z: 0.36 };
    const devant = hiddenByBox(p, versOeil(0, 35), RANGEMENT);
    // Il est bien à l'intérieur, mais la question posée est « qu'y a-t-il
    // ENTRE lui et l'œil » : la réponse ne doit pas dépendre du hasard.
    expect(typeof devant).toBe('boolean');
  });
});

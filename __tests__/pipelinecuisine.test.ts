/**
 * LE RELEVÉ REJOUÉ NE DÉPLACE PAS CE QUI ÉTAIT JUSTE — rejeu des relevés du
 * patron dans le pipeline de fin de scan (finalize).
 *
 * Un lave-linge relevé pile contre son mur — un côté SUR le trait du mur, au
 * centième près — était lu du mauvais côté de ce mur : la face prise était
 * celle de l'autre côté (l'épaisseur devinée, 14 cm), le mur sortait du
 * compte, et l'alignement de cuisine faisait glisser l'appareil de 5 cm…
 * dans le mur. À l'affichage, le recadrage le ressortait : le plan et la 3D
 * ne montraient pas la même chose. Le frigo de l'alcôve, pareil.
 *
 * Géométrie synthétique : une pièce rectangulaire tournée d'un angle
 * quelconque (les calculs y tombent sur des flottants, comme un vrai relevé).
 */
import type { ObjectData } from 'react-native-room-scan';
import type { WallSeg } from '../src/geometry/floorplan';
import { alignerLesMeubles, calerLesMeubles } from '../src/geometry/niche';

const ANGLE = -1.818;
const C = Math.cos(ANGLE);
const S = Math.sin(ANGLE);
const tourne = (x: number, z: number) => ({ x: 3.1 + x * C - z * S, z: -1.2 + x * S + z * C });
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: tourne(ax, az),
  b: tourne(bx, bz),
  height: 2.5,
  yCenter: 1.25,
  roomId: 'room-1',
});
// Le contour, parcouru de sorte que la pièce soit du côté « moins » de chaque mur.
const MURS = [mur('o', 0, -3, 0, 0), mur('s', 0, 0, 3, 0), mur('e', 3, 0, 3, -3), mur('n', 3, -3, 0, -3)];

/** Un meuble dans le repère de la pièce : centre, largeur le long de x, profondeur le long de z. */
const meuble = (id: string, category: string, x: number, z: number, w: number, d: number, base = 0, h = 0.88): ObjectData => {
  const c = tourne(x, z);
  return {
    id,
    category,
    width: w,
    depth: d,
    height: h,
    roomId: 'room-1',
    transform: [C, 0, S, 0, 0, 1, 0, 0, -S, 0, C, 0, c.x, base + h / 2, c.z, 1],
  } as ObjectData;
};
const dans = (o: ObjectData) => {
  // Retour dans le repère de la pièce.
  const dx = o.transform[12] - 3.1;
  const dz = o.transform[14] + 1.2;
  return { x: dx * C + dz * S, z: -dx * S + dz * C };
};

describe('l’alignement de cuisine sur un relevé tourné', () => {
  it('le lave-linge pile contre le mur ne glisse pas dans ce mur', () => {
    // Son bout gauche SUR le trait du mur ouest (x = 0), son dos contre le mur nord.
    const lave = meuble('lave', 'washerDryer', 0.3, -2.7, 0.6, 0.6);
    // Le meuble bas voisin, à 4,6 cm.
    const bas = meuble('bas', 'storage', 0.646 + 0.5, -2.7, 1.0, 0.6);
    const sortie = alignerLesMeubles(calerLesMeubles([lave, bas], MURS), MURS);
    const l = dans(sortie[0]);
    expect(l.x - sortie[0].width / 2).toBeGreaterThanOrEqual(-0.005);
    expect(Math.hypot(sortie[0].transform[12] - lave.transform[12], sortie[0].transform[14] - lave.transform[14])).toBeLessThan(0.005);
    // Un appareil garde sa largeur.
    expect(sortie[0].width).toBeCloseTo(0.6, 6);
    // Le meuble bas, lui, vient toucher le lave-linge.
    const b = dans(sortie[1]);
    expect(b.x - sortie[1].width / 2).toBeCloseTo(l.x + sortie[0].width / 2, 2);
  });

  it('le frigo calé contre un mur n’y est pas poussé par l’autre côté', () => {
    // Le frigo touche le mur est par son bout droit ; une prise d'épaisseur à gauche ne le pousse pas dans ce mur.
    const frigo = meuble('frigo', 'refrigerator', 3 - 0.33, -2.66, 0.66, 0.67, 0, 1.8);
    const [f] = alignerLesMeubles(calerLesMeubles([frigo], MURS), MURS);
    const p = dans(f);
    expect(p.x + f.width / 2).toBeLessThanOrEqual(3 + 0.005);
    expect(p.z - f.depth / 2).toBeGreaterThanOrEqual(-3 - 0.005);
  });
});

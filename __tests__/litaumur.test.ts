/**
 * LE LIT POSE SA TÊTE AU MUR — relevé du patron : « un lit scanné doit avoir
 * la partie coussins vers le mur, par logique, après un scan ».
 *
 * La tête d'un lit est son côté +z local (`furnitureParts` : le bandeau et
 * les oreillers côté dos). RoomPlan ne dit ni où elle est, ni toujours dans
 * quel sens court le lit : `orienterLesSieges`, appelé à la fin de chaque
 * scan, tranche.
 */
import { orienterLeLit, orienterLesSieges } from '../src/geometry/sieges';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25,
});
// Une chambre de 4 × 3,5.
const CHAMBRE: WallSeg[] = [
  mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3.5), mur('s', 4, 3.5, 0, 3.5), mur('o', 0, 3.5, 0, 0),
];

/** Un meuble, son axe +z local tourné vers `tete`. */
const meuble = (category: string, x: number, z: number, width: number, depth: number, tete: { x: number; z: number }) => ({
  id: category, category, width, depth, height: 0.5,
  transform: [tete.z, 0, -tete.x, 0, 0, 1, 0, 0, tete.x, 0, tete.z, 0, x, 0.25, z, 1],
});
const teteDe = (o: { transform: number[] }) => ({ x: o.transform[8], z: o.transform[10] });

describe('après un scan, le lit a la tête au mur', () => {
  it('la tête vers la pièce : demi-tour, même place, mêmes cotes', () => {
    // Lit de 140 × 190 contre le mur nord, la tête (+z) vers le sud.
    const lit = meuble('bed', 2, 0.97, 1.4, 1.9, { x: 0, z: 1 });
    const r = orienterLeLit(lit, CHAMBRE);
    expect(teteDe(r).z).toBeCloseTo(-1, 5);
    expect([r.transform[12], r.transform[14]]).toEqual([2, 0.97]);
    expect([r.width, r.depth]).toEqual([1.4, 1.9]);
  });

  it('déjà la tête au mur : on n’y touche pas', () => {
    const lit = meuble('bed', 2, 0.97, 1.4, 1.9, { x: 0, z: -1 });
    expect(orienterLeLit(lit, CHAMBRE)).toBe(lit);
  });

  it('la tête sur un grand côté : un quart de tour, largeur et longueur échangées', () => {
    // RoomPlan a rendu « 190 de large, 140 de profond », la tête vers le sud,
    // le lit couché le long du mur nord… mais il court en fait d'ouest en
    // est, adossé au mur ouest par son petit bout.
    const lit = meuble('bed', 0.97, 1.5, 1.9, 1.4, { x: 0, z: 1 });
    const r = orienterLeLit(lit, CHAMBRE);
    // La tête vers l'ouest, le mur le plus proche dans le sens de la longueur.
    expect(teteDe(r).x).toBeCloseTo(-1, 5);
    expect(r.width).toBe(1.4);
    expect(r.depth).toBe(1.9);
    // La boîte au sol est la même : 1,9 d'est en ouest, 1,4 du nord au sud.
    const enX = Math.abs(r.transform[0]) * r.width + Math.abs(r.transform[8]) * r.depth;
    expect(enX).toBeCloseTo(1.9, 5);
  });

  it('un lit carré prend le côté le plus proche d’un mur', () => {
    const lit = meuble('bed', 3.0, 2.4, 1.8, 1.8, { x: 0, z: -1 });
    // Mur est à 1 − 0,9 = 0,1 ; mur sud à 1,1 − 0,9 = 0,2.
    expect(teteDe(orienterLeLit(lit, CHAMBRE)).x).toBeCloseTo(1, 5);
  });

  it('passe par la fin du scan, avec les sièges', () => {
    const lit = meuble('bed', 2, 0.97, 1.4, 1.9, { x: 0, z: 1 });
    const [r] = orienterLesSieges([lit], CHAMBRE);
    expect(teteDe(r).z).toBeCloseTo(-1, 5);
  });
});

describe('les meubles adossés ne regardent pas le mur', () => {
  // Leur avant est −z local : « tete » donne ici leur DOS.
  it('une commode le nez contre le mur fait demi-tour', () => {
    const commode = meuble('storage', 2, 0.25, 1.2, 0.45, { x: 0, z: 1 });
    const [r] = orienterLesSieges([commode], CHAMBRE);
    // Son dos (+z) va au mur nord.
    expect(teteDe(r).z).toBeCloseTo(-1, 5);
  });

  it('un frigo déjà adossé ne bouge pas', () => {
    const frigo = meuble('refrigerator', 2, 0.35, 0.6, 0.65, { x: 0, z: -1 });
    expect(orienterLesSieges([frigo], CHAMBRE)[0]).toBe(frigo);
  });

  it('un meuble au milieu de la pièce garde son sens', () => {
    const meubleTv = meuble('storage', 2, 1.75, 1.2, 0.45, { x: 0, z: 1 });
    expect(orienterLesSieges([meubleTv], CHAMBRE)[0]).toBe(meubleTv);
  });
});

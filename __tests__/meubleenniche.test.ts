/**
 * LE MEUBLE PREND SA PLACE DANS SA NICHE.
 *
 * Relevé du patron, capture à l'appui : « mon frigo ne veut pas se caler
 * dans le coin dans lequel il se trouve, entre trois murs sur le plan 2D.
 * Pourtant il a été scanné tel quel. On doit adapter la taille des meubles à
 * leur espace pour une reconstitution parfaite. »
 *
 * RoomPlan rend une boîte un peu plus petite que le meuble — 46 × 42 cm
 * pour un frigo logé dans un renfoncement de 62 cm. Quand un meuble est
 * ENTRE DEUX MURS qui se font face, à quelques centimètres de chacun, il
 * remplit l'intervalle ; et s'il y a aussi un mur dans son dos, il s'y
 * adosse. Un meuble contre un seul mur, lui, ne bouge pas : il est rare
 * qu'un canapé touche le mur, et rien ne dit qu'il le touche.
 */
import type { ObjectData } from 'react-native-room-scan';
import { calerDansLaNiche, calerLesMeubles } from '../src/geometry/niche';
import type { WallSeg } from '../src/geometry/floorplan';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  epaisseur: 0.1,
});
/**
 * Le renfoncement : nus intérieurs en x = 0 et x = 0,62, fond en z = 0 ;
 * la pièce s'ouvre vers +z.
 */
const NICHE = [mur('g', -0.05, 0, -0.05, 0.7), mur('d', 0.67, 0, 0.67, 0.7), mur('f', -0.1, -0.05, 0.72, -0.05)];

/** Un objet RoomPlan : centre (x, z), tourné de `yaw`, mesures. */
const objet = (id: string, category: string, x: number, z: number, w: number, d: number, h: number, yaw = 0): ObjectData => {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { id, category, width: w, depth: d, height: h, transform: [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, x, h / 2, z, 1] } as ObjectData;
};
/** Le frigo, le dos au fond (son avant regarde la pièce, +z). */
const FRIGO = objet('frigo', 'refrigerator', 0.31, 0.26, 0.46, 0.42, 1.94, Math.PI);

describe('un frigo dans son renfoncement', () => {
  it('remplit la largeur entre les deux murs, et s’adosse au fond', () => {
    const f = calerDansLaNiche(FRIGO, NICHE)!;
    expect(f).not.toBeNull();
    expect(f.width).toBeCloseTo(0.62, 2);
    expect(f.depth).toBeCloseTo(0.47, 2);
    // Centré dans la niche, son dos sur le nu du fond.
    expect(f.transform[12]).toBeCloseTo(0.31, 2);
    expect(f.transform[14] - f.depth / 2).toBeCloseTo(0, 2);
    // Sa hauteur et son orientation ne bougent pas.
    expect(f.height).toBe(1.94);
    expect(f.transform[0]).toBeCloseTo(FRIGO.transform[0], 6);
  });

  it('un meuble qui déborde dans le mur est ramené au nu', () => {
    const large = objet('l', 'storage', 0.31, 0.3, 0.66, 0.5, 0.9);
    expect(calerDansLaNiche(large, NICHE)!.width).toBeCloseTo(0.62, 2);
  });
});

describe('ce qui n’est pas dans une niche ne bouge pas', () => {
  const PIECE = [mur('n', 0, -0.05, 5, -0.05), mur('o', -0.05, 0, -0.05, 4)];

  it('un canapé contre un seul mur', () => {
    expect(calerDansLaNiche(objet('c', 'sofa', 2, 0.5, 2.2, 0.9, 0.85, Math.PI), PIECE)).toBeNull();
  });

  it('un buffet dans un angle : deux murs, mais pas face à face', () => {
    expect(calerDansLaNiche(objet('b', 'storage', 0.55, 0.25, 1, 0.45, 0.85, Math.PI), PIECE)).toBeNull();
  });

  it('un meuble entre deux murs trop loin l’un de l’autre', () => {
    const couloir = [mur('g', -0.05, 0, -0.05, 2), mur('d', 1.55, 0, 1.55, 2)];
    expect(calerDansLaNiche(objet('m', 'storage', 0.75, 1, 0.8, 0.4, 0.9, Math.PI / 2), couloir)).toBeNull();
  });

  it('un meuble suspendu ou un tapis', () => {
    const haut = objet('h', 'storage', 0.31, 0.2, 0.46, 0.32, 0.7);
    haut.transform[13] = 1.4 + 0.35;
    expect(calerDansLaNiche(haut, NICHE)).toBeNull();
    expect(calerDansLaNiche(objet('t', 'tapis', 0.31, 0.3, 0.5, 0.5, 0.01), NICHE)).toBeNull();
  });
});

describe('tout le relevé, et sans chevaucher un voisin', () => {
  it('chaque meuble en niche se cale ; les autres restent', () => {
    const autre = objet('t', 'table', 2, 2, 1.2, 0.8, 0.75);
    const r = calerLesMeubles([FRIGO, autre], NICHE);
    expect(r[0].width).toBeCloseTo(0.62, 2);
    expect(r[1]).toBe(autre);
  });

  it('un voisin collé dans la niche : on ne l’écrase pas', () => {
    const voisin = objet('v', 'storage', 0.31, 0.62, 0.62, 0.15, 0.9);
    const r = calerLesMeubles([objet('f', 'refrigerator', 0.31, 0.26, 0.46, 0.42, 1.94, Math.PI), voisin], [
      ...NICHE.slice(0, 2),
      NICHE[2],
    ]);
    // Le frigo s'élargit, mais ne s'avance pas sur le voisin.
    expect(r[0].transform[14] + r[0].depth / 2).toBeLessThanOrEqual(0.62 - 0.075 + 1e-6);
  });

  it('la fin du scan cale les meubles, et la barre du meuble le propose', () => {
    const store = readFileSync(join(__dirname, '..', 'src/store/scanStore.ts'), 'utf8');
    expect(store.match(/calerLesMeubles\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(store).toContain('calerMeuble: (id) =>');
    expect(readFileSync(join(__dirname, '..', 'src/components/ObjectBar.tsx'), 'utf8')).toContain('accessibilityLabel="Caler dans sa niche"');
  });
});

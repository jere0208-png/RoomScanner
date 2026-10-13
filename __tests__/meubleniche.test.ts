/**
 * UN MEUBLE ENTRE DANS LA NICHE OÙ ON LE LÂCHE — ET S'Y AJUSTE.
 *
 * Relevé du patron, capture à l'appui : « pourquoi un meuble plus petit
 * qu'une zone, avec la zone où je souhaite l'imbriquer, ne veut pas y
 * aller ? Fais en sorte que ce soit possible et que le meuble s'adapte en
 * conséquence. » Un réfrigérateur relevé (47 × 39 cm), glissé au doigt
 * dans un renfoncement de 66 cm, revenait se coller au mur, de l'autre côté.
 *
 * LA CAUSE. Au lâcher, le meuble se range dans la pièce où il atterrit
 * (`rangerMeuble`). Le renfoncement, lui, n'était dans AUCUNE pièce fermée
 * — la pièce autour restait ouverte, un mur manquait — et le rangement
 * prenait alors la pièce d'OÙ VENAIT le meuble : il le ramenait dans son
 * contour, contre le mur, du mauvais côté.
 *
 * Désormais, lâché dans un lieu qu'aucune pièce ne ferme mais que des murs
 * entourent (trois côtés sur quatre), le meuble y reste : les murs autour
 * l'arrêtent, rien ne le renvoie. Lâché vraiment dehors, au-delà d'une
 * façade, il revient dans sa pièce comme avant. Et un meuble RELEVÉ — dont
 * RoomPlan sous-estime les cotes — se cale dans la niche où il atterrit ; un
 * meuble du catalogue garde ses cotes (« Caler dans sa niche » reste à un
 * appui).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { ObjectData } from 'react-native-room-scan';
import { useScanStore } from '../src/store/scanStore';
import { detectRooms, type WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});
// La pièce A, fermée (4 × 2). Dessous, un renfoncement ouvert à gauche :
// le mur sud de A au-dessus, un retour à droite, un mur en bas.
const MURS = [
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 2),
  mur('s', 4, 2, 0, 2),
  mur('o', 0, 2, 0, 0),
  mur('retour', 4, 2, 4, 2.8),
  mur('fond', 4, 2.8, 3.3, 2.8),
];
const [A] = detectRooms(MURS.slice(0, 4));

const frigo = (extra: Partial<ObjectData> = {}): ObjectData => ({
  id: 'frigo',
  category: 'refrigerator',
  width: 0.47,
  depth: 0.39,
  height: 1.85,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3.65, 0.925, 1.6, 1],
  roomId: 'A',
  ...extra,
});

function poser(o: ObjectData) {
  useScanStore.setState({
    walls: MURS,
    openings: [],
    rooms: [{ id: 'A', name: 'Cuisine', floor: null, wallIds: A.wallIds }] as never,
    objects: [o],
  } as never);
}
const lui = () => useScanStore.getState().objects.find((o) => o.id === 'frigo')!;

describe('lâché dans un renfoncement qu’aucune pièce ne ferme', () => {
  it('le meuble y reste, entre les murs qui l’entourent', () => {
    poser(frigo());
    useScanStore.getState().rangerMeuble('frigo', 3.65, 2.4);
    const o = lui();
    const z = o.transform[14];
    const x = o.transform[12];
    // Sous le mur sud de A (relevé depuis A : son épaisseur part dans la
    // niche, nu à 2,14), au-dessus du mur du fond (nu à 2,73).
    expect(z - o.depth / 2).toBeGreaterThanOrEqual(2.14 - 1e-6);
    expect(z + o.depth / 2).toBeLessThanOrEqual(2.73 + 1e-6);
    // Et à gauche du retour (nu à 3,93).
    expect(x + o.width / 2).toBeLessThanOrEqual(3.93 + 1e-6);
  });

  it('un meuble relevé s’ajuste à la niche ; un meuble du catalogue garde ses cotes', () => {
    poser(frigo());
    useScanStore.getState().rangerMeuble('frigo', 3.65, 2.4);
    // Il remplit l'entre-deux, d'un nu à l'autre : de 2,14 à 2,73.
    expect(lui().depth).toBeCloseTo(0.59, 2);

    poser(frigo({ modele: 'frigo-combine' }));
    useScanStore.getState().rangerMeuble('frigo', 3.65, 2.4);
    expect(lui().depth).toBeCloseTo(0.39, 6);
    expect(lui().transform[14]).toBeGreaterThan(2.14);
  });

  it('lâché vraiment dehors, au-delà d’une façade, il revient dans sa pièce', () => {
    poser(frigo());
    useScanStore.getState().rangerMeuble('frigo', 2, -0.5);
    const z = lui().transform[14];
    // Dos au nu du mur nord de A : son trait, z = 0.
    expect(z - lui().depth / 2).toBeGreaterThanOrEqual(-1e-6);
    expect(z).toBeLessThan(2);
  });

  it('dans sa pièce, au large, rien ne change : ni place ni cotes', () => {
    poser(frigo());
    useScanStore.getState().rangerMeuble('frigo', 2, 1);
    expect(lui().transform[12]).toBeCloseTo(2, 6);
    expect(lui().transform[14]).toBeCloseTo(1, 6);
    expect(lui().width).toBeCloseTo(0.47, 6);
    expect(lui().depth).toBeCloseTo(0.39, 6);
  });
});

/**
 * LA PETITE CUISINE DU 19/10 — diagnostic du patron : « le meuble qui doit
 * être collé à la même profondeur que le lave-linge sort de son emplacement
 * et ne rentre pas manuellement ; les meubles hauts ne prennent pas la
 * largeur du mur alors que dans la réalité si, et rentrent dans un mur. Il
 * manque une logique de placement, même si le scan pense voir autre chose. »
 * Puis : « les meubles hauts ont des pieds… si hauteur, pas de pied ».
 *
 * Trois causes :
 *   — la pièce n'est pas fermée (1,24 m sans mur) : les murs relevés d'un
 *     côté étaient centrés sur leur trait, et les meubles hauts, posés juste
 *     par RoomPlan, entraient dans leur épaisseur devinée ;
 *   — le coffrage de l'angle (deux petits murs) est tout entier SOUS le
 *     meuble bas : il le repoussait de 32 cm, devant le lave-linge ;
 *   — aucune logique de cuisine : le meuble haut du mur de droite s'arrêtait
 *     à 11 cm du retour.
 * La géométrie reprend celle du relevé, redressée et arrondie au centimètre.
 */
import type { ObjectData } from 'react-native-room-scan';
import {
  clampFootprint,
  facesDesMurs,
  fitInNook,
  pushOutOfWalls,
  roomParts,
  toFootprint,
  type WallSeg,
} from '../src/geometry/floorplan';
import { alignerLesMeubles } from '../src/geometry/niche';
import { fabriquer, graineDe, modeleDe } from '../src/geometry/modeles3d';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});
const MURS: WallSeg[] = [
  mur('ouest', 0.13, -1.5, 0.13, -3.61),
  mur('nord', 0.13, -3.61, 1.37, -3.61),
  // Le coffrage de l'angle : 50 × 31 cm.
  mur('coffrage-1', 1.37, -3.61, 1.37, -3.3),
  mur('coffrage-2', 1.37, -3.3, 1.87, -3.3),
  mur('est', 1.87, -3.3, 1.87, -1.99),
  mur('retour', 1.87, -1.99, 1.4, -1.99),
  // … et rien entre le retour et le mur ouest : la pièce reste ouverte.
];
const ROOMS = [{ id: 'room-1', wallIds: MURS.map((w) => w.id) }];

const QUART = Math.PI / 2;
const meuble = (id: string, category: string, cx: number, cz: number, w: number, d: number, yaw: number, base = 0, h = 0.9): ObjectData =>
  ({
    id,
    category,
    width: w,
    depth: d,
    height: h,
    roomId: 'room-1',
    transform: [Math.cos(yaw), 0, Math.sin(yaw), 0, 0, 1, 0, 0, -Math.sin(yaw), 0, Math.cos(yaw), 0, cx, base + h / 2, cz, 1],
  }) as ObjectData;

const MEUBLES = [
  meuble('lave-linge', 'washerDryer', 0.43, -3.29, 0.6, 0.64, 0, 0, 0.85),
  // Le meuble bas d'angle, par-dessus le coffrage.
  meuble('bas-angle', 'storage', 1.31, -3.29, 1.13, 0.64, 0),
  meuble('haut-nord', 'storage', 0.75, -3.43, 1.23, 0.37, 0, 1.58, 0.7),
  meuble('haut-est', 'storage', 1.73, -2.7, 1.195, 0.276, QUART, 1.39, 0.7),
  meuble('bas-est', 'storage', 1.6, -2.48, 0.97, 0.53, QUART),
];
const par = (os: ObjectData[], id: string) => os.find((o) => o.id === id)!;

describe('le plan les dessine où le scan les a vus', () => {
  const part = roomParts(MURS, ROOMS)[0];
  const faces = facesDesMurs(MURS);

  it('la pièce ouverte : le trait d’un mur relevé d’un côté reste sa face, côté cuisine', () => {
    expect(part.surface?.exact).toBeFalsy();
    for (const id of ['nord', 'est', 'coffrage-2']) {
      const f = faces.get(id)!;
      // Toute l'épaisseur passe de l'autre côté : une face à zéro.
      expect(Math.min(f.plus, f.moins)).toBeCloseTo(0, 6);
    }
  });

  for (const o of MEUBLES) {
    it(`${o.id} : à moins de 2 cm de sa place, sans être raboté`, () => {
      const avant = toFootprint(o);
      const apres = clampFootprint(avant, part.walls, part.labelAt, undefined, undefined, faces, part.surface?.pts);
      expect(Math.hypot(apres.cx - avant.cx, apres.cz - avant.cz)).toBeLessThan(0.02);
      expect(apres.width).toBeCloseTo(avant.width, 2);
      expect(apres.depth).toBeCloseTo(avant.depth, 2);
    });
  }

  it('le meuble bas se glisse à la main sous le coffrage, au même nu que le lave-linge', () => {
    const box = { width: 1.13, depth: 0.64, yaw: 0 };
    const vise = { x: 1.31, z: -3.29 };
    const p = pushOutOfWalls(vise, box, part.walls, part.labelAt, part.surface?.pts, { x: 1.31, z: -2.6 }, faces);
    expect(Math.hypot(p.x - vise.x, p.z - vise.z)).toBeLessThan(0.02);
    const n = fitInNook(vise, box, part.walls, part.surface?.pts);
    expect(n.width).toBeCloseTo(1.13, 6);
    expect(n.depth).toBeCloseTo(0.64, 6);
  });
});

describe('la logique de placement de la cuisine', () => {
  const ranges = alignerLesMeubles(MEUBLES, MURS);

  it('le meuble haut prend toute la largeur du mur, du coffrage au retour', () => {
    const h = par(ranges, 'haut-est');
    expect(h.width).toBeCloseTo(1.31, 2);
    expect(h.transform[14] - h.width / 2).toBeCloseTo(-3.3, 2);
    expect(h.transform[14] + h.width / 2).toBeCloseTo(-1.99, 2);
    // Toujours contre le mur, et à sa hauteur.
    expect(h.transform[12] + h.depth / 2).toBeCloseTo(1.87, 2);
    expect(h.transform[13]).toBeCloseTo(MEUBLES[3].transform[13], 9);
  });

  it('le meuble bas reste au nu du lave-linge, contre lui', () => {
    const b = par(ranges, 'bas-angle');
    const l = par(ranges, 'lave-linge');
    expect(b.transform[14]).toBeCloseTo(l.transform[14], 2);
    expect(b.transform[14] - b.depth / 2).toBeCloseTo(-3.61, 2);
    expect(b.transform[12] - b.width / 2).toBeCloseTo(l.transform[12] + l.width / 2, 2);
  });

  it('ce qui était déjà bien posé ne bouge pas de plus de deux centimètres', () => {
    for (const o of MEUBLES) {
      const r = par(ranges, o.id);
      expect(Math.hypot(r.transform[12] - o.transform[12], r.transform[14] - o.transform[14])).toBeLessThan(0.07);
      expect(Math.abs(r.width - o.width)).toBeLessThan(o.id === 'haut-est' ? 0.12 : 0.02);
      expect(r.depth).toBe(o.depth);
    }
  });

  it('un meuble bas à 10 cm du mur s’y adosse ; un canapé, jamais', () => {
    const decolle = meuble('bas', 'storage', 0.8, -3.61 + 0.32 + 0.1, 0.6, 0.64, 0);
    const canape = meuble('canape', 'sofa', 0.8, -3.61 + 0.45 + 0.1, 2.0, 0.9, 0);
    const [b] = alignerLesMeubles([decolle], MURS);
    expect(b.transform[14] - b.depth / 2).toBeCloseTo(-3.61, 2);
    expect(alignerLesMeubles([canape], MURS)[0]).toBe(canape);
  });

  it('jamais au point de doubler : un écart de 40 cm reste un écart', () => {
    const court = meuble('haut', 'storage', 1.73, -2.9, 0.8, 0.28, QUART, 1.39, 0.7);
    const [h] = alignerLesMeubles([court], MURS);
    // Collé au coffrage (0,0 cm) ; le retour, à 51 cm, ne compte pas.
    expect(h.width).toBeCloseTo(0.8, 6);
  });
});

describe('en hauteur, pas de pieds', () => {
  const commande = (suspendu: boolean, modele = '') => ({ modele, attributs: [], hasard: graineDe('x'), suspendu });

  it('le « storage » de RoomPlan posé en hauteur est le meuble haut du catalogue, pas un buffet sur pieds', () => {
    const g = { W: 1.23, D: 0.37, H: 0.7 };
    const haut = fabriquer('storage', g, commande(true));
    expect(haut).toEqual(fabriquer('storage', g, commande(false, 'meubleHaut')));
    expect(haut).not.toEqual(fabriquer('storage', g, commande(false)));
  });

  it('la scène le reconnaît à son dessous : au-dessus de 30 cm du sol', () => {
    const pose = { id: 'h', category: 'storage', width: 1.23, depth: 0.37, height: 0.7, cx: 0, cz: 0, yaw: 0 };
    const enHaut = modeleDe({ ...pose, yb: 1.58 });
    const auSol = modeleDe({ ...pose, yb: 0 });
    expect(enHaut).not.toEqual(auSol);
    expect(enHaut).toEqual(fabriquer('storage', { W: 1.23, D: 0.37, H: 0.7 }, { ...commande(false, 'meubleHaut'), hasard: graineDe('h') }));
  });
});

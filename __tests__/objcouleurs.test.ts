/**
 * LE FICHIER 3D PART EN COULEURS.
 *
 * Correctif de l'audit « dans la peau d'un utilisateur » : le fichier 3D
 * (OBJ) partait tout blanc, sans le décor choisi. Il porte maintenant une
 * couleur par sommet — l'écriture « v x y z r g b » que lisent Blender,
 * MeshLab et la plupart des visionneuses —, celle de la maquette de l'app,
 * peintures, sols et murs d'accent compris. Un seul fichier : pas de .mtl à
 * égarer en chemin.
 */
import { buildObj } from '../src/export/model3d';
import { detectRooms, type WallSeg } from '../src/geometry/floorplan';
import { hexDePeinture } from '../src/ui/peintures';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});
const walls = [mur('n', 0, 0, 5, 0), mur('e', 5, 0, 5, 4), mur('s', 5, 4, 0, 4), mur('o', 0, 4, 0, 0)];
const [forme] = detectRooms(walls);

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const couleurs = (obj: string) =>
  obj
    .split('\n')
    .filter((l) => l.startsWith('v '))
    .map((l) => l.split(' ').slice(4).map(Number));

describe('l’OBJ en couleurs', () => {
  it('chaque sommet porte sa couleur', () => {
    const obj = buildObj({ walls, openings: [], objects: [], rooms: [{ id: 'r', wallIds: forme.wallIds }] });
    const vs = obj.split('\n').filter((l) => l.startsWith('v '));
    expect(vs.length).toBeGreaterThan(0);
    for (const v of vs) expect(v.split(' ')).toHaveLength(7);
  });

  it('la peinture choisie se retrouve sur les murs', () => {
    const obj = buildObj({
      walls,
      openings: [],
      objects: [],
      rooms: [{ id: 'r', wallIds: forme.wallIds, peinture: 'terracotta' } as never],
    });
    const [r, g, b] = rgb(hexDePeinture('terracotta')!);
    const proche = couleurs(obj).some(([x, y, z]) => Math.abs(x - r) < 0.06 && Math.abs(y - g) < 0.06 && Math.abs(z - b) < 0.06);
    expect(proche).toBe(true);
  });

  it('sans décor, les murs restent clairs, pas blancs d’office ni noirs', () => {
    const obj = buildObj({ walls, openings: [], objects: [], rooms: [{ id: 'r', wallIds: forme.wallIds }] });
    const cs = couleurs(obj);
    expect(cs.every((c) => c.every((v) => v >= 0 && v <= 1))).toBe(true);
    expect(new Set(cs.map((c) => c.join(','))).size).toBeGreaterThan(1);
  });
});

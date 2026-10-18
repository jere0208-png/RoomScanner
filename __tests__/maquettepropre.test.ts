/**
 * LA MAQUETTE SANS TRAIT PARASITE — enquête 3D.
 *
 * Diagnostic du patron : « on voit encore des traits verticaux autour des
 * ouvrants ; on doit avoir un mur continu et une fenêtre posée dessus ».
 * L'enquête en a trouvé d'autres sources que les morceaux autour des baies :
 *   — à chaque ANGLE, le bout de chaque mur dessinait son chant dans la
 *     maçonnerie de son voisin : une bande verticale à travers l'écorché ;
 *   — dans le PDF et les vignettes, chaque morceau cernait ses montants de
 *     haut en bas, au droit de chaque jambage ;
 *   — deux baies jointives laissaient l'allège ouverte ;
 *   — une porte relevée depuis un placard perçait le fond du placard ;
 *   — un vantail ouvert traversait la cloison d'en face.
 */
import { assignOpenings, buildScene, type ScenePalette } from '../src/geometry/scene3d';
import type { WallSeg } from '../src/geometry/floorplan';

const PALETTE = {
  floor: '#EEEEEE',
  floorStroke: '#CCCCCC',
  wall: '#FFFFFF',
  wallStroke: '#888888',
  wallTop: '#DDDDDD',
  wallTopStroke: '#777777',
  opening: '#AACCEE',
  door: '#AA8866',
  window: '#AACCEE',
  passage: '#AACCEE',
  object: '#BBBBBB',
  objectTop: '#CCCCCC',
  objectStroke: '#999999',
} as unknown as ScenePalette;

const H = 2.5;
const mur = (id: string, ax: number, az: number, bx: number, bz: number, roomId?: string): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: H,
  yCenter: H / 2,
  ...(roomId ? { roomId } : {}),
});
const baie = (id: string, type: 'door' | 'window', a: [number, number], b: [number, number], y0: number, y1: number, roomId?: string): WallSeg => ({
  id,
  type,
  a: { x: a[0], z: a[1] },
  b: { x: b[0], z: b[1] },
  height: y1 - y0,
  yCenter: (y0 + y1) / 2,
  ...(roomId ? { roomId } : {}),
});
const PIECE = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];

/** Une face pleine verticale dont la trace au sol n'est parallèle à aucun mur : un chant d'onglet. */
const chantsDOnglet = (faces: ReturnType<typeof buildScene>['faces']) =>
  faces.filter((f) => {
    if (!f.fill || f.pts.length < 4 || f.isFloor || f.isCeiling) return false;
    const ys = f.pts.map((p) => p.y);
    if (Math.max(...ys) - Math.min(...ys) < 0.5) return false;
    const dx = Math.max(...f.pts.map((p) => p.x)) - Math.min(...f.pts.map((p) => p.x));
    const dz = Math.max(...f.pts.map((p) => p.z)) - Math.min(...f.pts.map((p) => p.z));
    return dx > 0.02 && dz > 0.02;
  });

describe('la maquette sans trait parasite', () => {
  it('aux angles, aucun chant enfoui dans le mur voisin', () => {
    const scene = buildScene(PIECE, [], [], { palette: PALETTE });
    expect(chantsDOnglet(scene.faces)).toHaveLength(0);
  });

  it('le PDF et les vignettes ne cernent pas un jambage de haut en bas', () => {
    const fenetre = baie('f', 'window', [1.4, 0], [2.6, 0], 0.9, 2.1);
    const scene = buildScene(PIECE, [fenetre], [], { palette: PALETTE });
    // Les traits (faces sans aplat) verticaux au droit des jambages.
    const traits = scene.faces.filter((f) => {
      if (f.fill !== null || f.pts.length < 2) return false;
      const xs = f.pts.map((p) => p.x);
      const zs = f.pts.map((p) => p.z);
      const ys = f.pts.map((p) => p.y);
      const vertical = Math.max(...xs) - Math.min(...xs) < 1e-6 && Math.max(...zs) - Math.min(...zs) < 1e-6;
      return vertical && Math.max(...ys) - Math.min(...ys) > 0.05 && (Math.abs(xs[0] - 1.4) < 0.01 || Math.abs(xs[0] - 2.6) < 0.01);
    });
    for (const t of traits) {
      const ys = t.pts.map((p) => p.y);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(0.9 - 1e-6);
      expect(Math.max(...ys)).toBeLessThanOrEqual(2.1 + 1e-6);
    }
    // Et les grandes faces des morceaux (parallèles au mur) ne portent plus
    // leur contour entier : il passait par les jambages.
    const cernees = scene.faces.filter((f) => {
      if (!f.fill || !f.stroke) return false;
      const xs = f.pts.map((p) => p.x);
      const zs = f.pts.map((p) => p.z);
      const grandeFace = Math.max(...zs) - Math.min(...zs) < 1e-6 && Math.max(...xs) - Math.min(...xs) > 0.05;
      return grandeFace && xs.some((x) => Math.abs(x - 1.4) < 0.01) && Math.abs(zs[0]) < 0.2;
    });
    expect(cernees).toHaveLength(0);
  });

  it('une porte suivie d’une fenêtre : l’allège de la fenêtre se ferme face à la porte', () => {
    const porte = baie('p', 'door', [0.8, 0], [1.7, 0], 0, 2.04);
    const fenetre = baie('f', 'window', [1.7, 0], [2.9, 0], 0.9, 2.1);
    const scene = buildScene(PIECE, [porte, fenetre], [], { palette: PALETTE });
    const chant = scene.faces.find((f) => {
      if (!f.fill || f.pts.length < 4) return false;
      const xs = f.pts.map((p) => p.x);
      const ys = f.pts.map((p) => p.y);
      return xs.every((x) => Math.abs(x - 1.7) < 0.01) && Math.min(...ys) < 0.05 && Math.abs(Math.max(...ys) - 0.9) < 0.01;
    });
    expect(chant).toBeDefined();
  });

  it('une porte posée sur la cloison, relevée depuis un placard de 50 cm, perce la cloison', () => {
    const murs = [mur('Ae', 4, 0, 4, 3, 'A'), mur('B1', 4.5, 0, 4.5, 1, 'B')];
    const porte = baie('p', 'door', [4, 0.1], [4, 0.9], 0, 2.04, 'B');
    const trous = assignOpenings(murs, [porte], 0);
    expect(trous.get('Ae')?.length).toBe(1);
    expect(trous.get('B1')).toBeUndefined();
  });

  it('le vantail ouvert ne traverse pas la cloison d’en face', () => {
    // Une chambre de 3 × 3, un dégagement de 65 cm (entre axes) à l'est.
    const murs = [
      mur('n1', 0, 0, 3, 0, 'ch'),
      mur('n2', 3, 0, 3.65, 0, 'dg'),
      mur('e', 3.65, 0, 3.65, 3, 'dg'),
      mur('s2', 3.65, 3, 3, 3, 'dg'),
      mur('s1', 3, 3, 0, 3, 'ch'),
      mur('o', 0, 3, 0, 0, 'ch'),
      mur('c', 3, 0, 3, 3, 'ch'),
    ];
    const rooms = [
      { id: 'ch', name: 'Chambre', wallIds: ['n1', 'c', 's1', 'o'] },
      { id: 'dg', name: 'Dégagement', wallIds: ['n2', 'e', 's2', 'c'] },
    ];
    // Une porte de 83 cm sur la cloison, qui ouvre dans le dégagement.
    const porte = baie('p', 'door', [3, 1], [3, 1.83], 0, 2.04, 'dg');
    const scene = buildScene(murs, [porte], [], { palette: PALETTE, rooms });
    const pose = scene.meubles?.find((m) => m.category === 'porte3d');
    expect(pose).toBeDefined();
    const angle = Number(pose!.attributes?.find((a) => a.startsWith('PorteAngle:'))?.split(':')[1]);
    // Le bout du vantail, à `angle` degrés de la cloison, reste en deçà du
    // nu du mur d'en face (3,65 − demi-épaisseur).
    const avance = 0.83 * Math.sin((angle * Math.PI) / 180);
    expect(3 + avance).toBeLessThan(3.65 - 0.05);
  });
});

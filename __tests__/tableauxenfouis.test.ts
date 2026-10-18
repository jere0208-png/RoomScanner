/**
 * UN MUR CONTINU, ET LA FENÊTRE POSÉE DESSUS.
 *
 * Diagnostic du patron, sur la maquette 3D : « on voit encore des traits
 * verticaux autour des ouvrants, ça ne devrait pas exister visuellement ».
 * Un mur percé se bâtit en morceaux — trumeaux, allège, linteau — et chacun
 * dessinait ses deux bouts sur toute sa hauteur, y compris DANS l'épaisseur
 * du mur, là où il touche son voisin. À travers les murs voilés de la
 * maquette, ces faces enfouies se lisaient de haut en bas. Seuls restent
 * les vrais tableaux : le bout d'un morceau qui borde le vide de la baie.
 */
import { buildScene, wallPanels, type ScenePalette, type WallHole } from '../src/geometry/scene3d';
import type { WallSeg } from '../src/geometry/floorplan';

const PALETTE: ScenePalette = {
  floor: '#EEEEEE',
  floorStroke: '#CCCCCC',
  wall: '#FFFFFF',
  wallStroke: '#888888',
  wallTop: '#DDDDDD',
  wallTopStroke: '#777777',
  opening: '#AACCEE',
  door: '#AA8866',
  window: '#AACCEE',
} as ScenePalette;

const H = 2.5;
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: H,
  yCenter: H / 2,
});
// Une pièce de 4 × 3, une fenêtre de 1,20 au milieu du mur nord, allège à 0,90.
const PIECE = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];
const FENETRE: WallSeg = { id: 'f', type: 'window', a: { x: 1.4, z: 0 }, b: { x: 2.6, z: 0 }, height: 1.2, yCenter: 1.5 };

describe('les tableaux enfouis ne se dessinent plus', () => {
  it('le trumeau ne montre son bout que face au vide de la baie ; allège et linteau n’en montrent pas', () => {
    const trou: WallHole = { seg: FENETRE, t0: 0.35, t1: 0.65, y0: 0.9, y1: 2.1 };
    const [gauche, allege, linteau, droite] = wallPanels([trou], H);
    expect(gauche.chants?.fin).toEqual([[0.9, 2.1]]);
    expect(droite.chants?.debut).toEqual([[0.9, 2.1]]);
    for (const p of [allege, linteau]) {
      expect(p.chants?.debut).toEqual([]);
      expect(p.chants?.fin).toEqual([]);
    }
  });

  it('dans la scène, aucune face en travers du mur hors du vide de la fenêtre', () => {
    const scene = buildScene(PIECE, [FENETRE], [], { palette: PALETTE });
    // Les faces verticales en travers du mur nord (x constant), à hauteur
    // d'un jambage de la fenêtre.
    const enTravers = scene.faces.filter((f) => {
      if (f.pts.length < 3 || f.isFloor || f.isCeiling) return false;
      const xs = f.pts.map((p) => p.x);
      const zs = f.pts.map((p) => p.z);
      const x = xs[0];
      if (!xs.every((v) => Math.abs(v - x) < 1e-6)) return false;
      if (Math.abs(x - 1.4) > 0.02 && Math.abs(x - 2.6) > 0.02) return false;
      // Dans l'épaisseur du mur nord.
      return Math.max(...zs) < 0.3 && Math.min(...zs) > -0.3;
    });
    expect(enTravers.length).toBeGreaterThan(0);
    for (const f of enTravers) {
      const ys = f.pts.map((p) => p.y);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(0.9 - 1e-6);
      expect(Math.max(...ys)).toBeLessThanOrEqual(2.1 + 1e-6);
    }
  });
});

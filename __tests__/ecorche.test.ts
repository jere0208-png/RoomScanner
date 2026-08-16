/**
 * L'écorché : voir DANS la pièce sans tourner le modèle par-dessus.
 *
 * Un mur qui nous fait face cache tout ce qu'il y a derrière — et c'est
 * exactement ce qu'on veut regarder. Il s'efface donc à mesure qu'il nous
 * fait face, en gardant son arête pour dire où il passe. Deux propriétés à
 * tenir : la progression (pas de saut au degré près) et la RÉSERVE — un mur
 * vu de champ, ou vu de l'intérieur, reste plein, sinon le modèle devient
 * une soupe transparente.
 */
import {
  buildScene,
  cutawayOpacity,
  isHiddenFace,
  type CameraTrig,
  type ScenePalette,
} from '../src/geometry/scene3d';
import { type WallSeg } from '../src/geometry/floorplan';

const PAL: ScenePalette = {
  floor: '#EEEEEE',
  floorStroke: '#CCCCCC',
  wall: '#FFFFFF',
  wallStroke: '#888888',
  wallTop: '#F4F4F4',
  wallTopStroke: '#949494',
  opening: '#B9C2CE',
  door: '#E8A13B',
  window: '#3EB8E5',
  passage: '#2F6BFF',
  object: '#D8E1F2',
  objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const PIECE: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];

const rad = (d: number) => (d * Math.PI) / 180;
const cam = (theta: number, tilt = 55): CameraTrig => ({
  ct: Math.cos(rad(theta)),
  st: Math.sin(rad(theta)),
  cp: Math.cos(rad(tilt)),
  sp: Math.sin(rad(tilt)),
});

describe('le voile d’un mur, selon l’angle', () => {
  const vue = cam(0);

  it('un mur qui nous fait face s’efface presque', () => {
    // Normale vers la caméra : c'est le mur qui bouche la vue.
    const o = cutawayOpacity({ x: 0, y: 0, z: 1 }, vue);
    expect(o).toBeLessThan(0.2);
    expect(o).toBeGreaterThan(0.1);
  });

  it('un mur de champ reste plein', () => {
    expect(cutawayOpacity({ x: 1, y: 0, z: 0 }, vue)).toBe(1);
  });

  it('un mur vu de l’intérieur reste plein', () => {
    expect(cutawayOpacity({ x: 0, y: 0, z: -1 }, vue)).toBe(1);
  });

  it('la transition est continue : aucun saut d’un degré à l’autre', () => {
    let precedent = cutawayOpacity({ x: 0, y: 0, z: 1 }, cam(0));
    for (let theta = 1; theta <= 180; theta++) {
      const o = cutawayOpacity({ x: 0, y: 0, z: 1 }, cam(theta));
      expect(Math.abs(o - precedent)).toBeLessThan(0.06);
      expect(o).toBeGreaterThanOrEqual(0.14);
      expect(o).toBeLessThanOrEqual(1);
      precedent = o;
    }
  });

  it('elle est monotone : plus le mur nous fait face, plus il s’efface', () => {
    const angles = [90, 70, 50, 30, 10, 0];
    const os = angles.map((a) => cutawayOpacity({ x: 0, y: 0, z: 1 }, cam(a)));
    for (let i = 1; i < os.length; i++) {
      expect(os[i]).toBeLessThanOrEqual(os[i - 1] + 1e-9);
    }
  });
});

describe('qui porte le voile, dans la scène', () => {
  const scene = buildScene(PIECE, [], [], { palette: PAL });

  it('seules les faces de MUR sont marquées', () => {
    const marquees = scene.faces.filter((f) => f.cutaway);
    expect(marquees.length).toBeGreaterThan(0);
    // Le sol, jamais : un sol ne cache rien, et le voiler viderait le plan.
    expect(marquees.some((f) => f.isFloor)).toBe(false);
    // Toutes verticales : un dessus de mur n'a pas à s'effacer.
    for (const f of marquees) {
      expect(Math.abs(f.normal?.y ?? 0)).toBeLessThan(1e-9);
    }
  });

  it('une seule des deux faces d’un mur : l’extérieure', () => {
    // Mur nord : intérieur côté +z (la pièce est en z > 0).
    const duNord = scene.faces.filter(
      (f) =>
        f.fill === PAL.wall &&
        f.normal &&
        Math.abs(f.normal.z) > 0.9 &&
        f.pts.every((p) => Math.abs(p.z) < 0.1),
    );
    expect(duNord.length).toBeGreaterThan(0);
    for (const f of duNord) {
      // La normale sort vers −z (dehors) ⇔ la face est marquée.
      expect(!!f.cutaway).toBe((f.normal?.z ?? 0) < 0);
    }
  });

  it('à chaque angle, il reste des murs pleins et des murs voilés', () => {
    for (const theta of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const vue = cam(theta);
      const visibles = scene.faces.filter(
        (f) => f.fill === PAL.wall && !isHiddenFace(f, vue),
      );
      const voiles = visibles.map((f) =>
        f.cutaway && f.normal ? cutawayOpacity(f.normal, vue) : 1,
      );
      expect(voiles.some((v) => v > 0.9)).toBe(true);
      expect(voiles.some((v) => v < 0.5)).toBe(true);
    }
  });
});

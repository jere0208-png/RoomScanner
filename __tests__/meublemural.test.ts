/**
 * Un meuble contre un mur ne se voit pas de l'autre côté.
 *
 * Même piège que pour l'appareillage, et il ressort sur les objets plats :
 * un pan de mur se trie sur le centre de sa tuile, donc à mi-hauteur ; une
 * télé accrochée à 1,35 m se trie plus haut, et le terme d'altitude de la
 * profondeur la faisait passer DEVANT le mur. Résultat, on la voyait depuis
 * la pièce d'à côté — au travers de la cloison.
 *
 * Ce test vérifie l'ordre de peinture des deux côtés d'un refend, sous
 * plusieurs inclinaisons : c'est en vue plongeante que le terme d'altitude
 * l'emporte, donc c'est là qu'il faut regarder.
 */
import {
  buildScene,
  isHiddenFace,
  type Face3D,
  type ScenePalette,
} from '../src/geometry/scene3d';
import { furnitureParts } from '../src/geometry/furniture3d';
import type { WallSeg } from '../src/geometry/floorplan';

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

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  room: string,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: room,
});

/** Deux pièces mitoyennes, séparées par un refend à z = 3. */
const MURS: WallSeg[] = [
  mur('n', 0, 0, 6, 0, 'r1'),
  mur('e', 6, 0, 6, 3, 'r1'),
  mur('s', 6, 3, 0, 3, 'r1'),
  mur('w', 0, 3, 0, 0, 'r1'),
  mur('n2', 0, 3, 6, 3, 'r2'),
  mur('e2', 6, 3, 6, 6, 'r2'),
  mur('s2', 6, 6, 0, 6, 'r2'),
  mur('w2', 0, 6, 0, 3, 'r2'),
];
const ROOMS = [
  { id: 'r1', name: 'Séjour', wallIds: ['n', 'e', 's', 'w'] },
  { id: 'r2', name: 'Chambre', wallIds: ['n2', 'e2', 's2', 'w2'] },
];

/** La télé, accrochée dans la CHAMBRE, contre le refend. */
const TV = {
  id: 'tv',
  category: 'television',
  width: 1.2,
  depth: 0.08,
  height: 0.7,
  roomId: 'r2',
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 1.35, 3.12, 1],
};

const rad = (d: number) => (d * Math.PI) / 180;
const cam = (theta: number, tilt: number) => ({
  ct: Math.cos(rad(theta)),
  st: Math.sin(rad(theta)),
  cp: Math.cos(rad(tilt)),
  sp: Math.sin(rad(tilt)),
});
const prof = (c: ReturnType<typeof cam>) => (p: { x: number; y: number; z: number }) =>
  (p.x * c.st + p.z * c.ct) * c.sp + p.y * c.cp;
const depth = (c: ReturnType<typeof cam>) => (f: Face3D) => {
  const P = prof(c);
  return (
    (f.depthRefs
      ? Math.max(...f.depthRefs.map(P))
      : f.depthAt
      ? P(f.depthAt)
      : f.pts.reduce((s, p) => s + P(p), 0) / f.pts.length) + (f.bias ?? 0)
  );
};

const scene = buildScene(MURS, [], [TV], { palette: PAL, rooms: ROOMS });
/**
 * LES FACES DE LA TÉLÉ, ISOLÉES PAR LEUR COULEUR.
 *
 * Elles l'étaient par un DÉCALAGE D'INDEX : on bâtissait la même scène sans
 * meuble, et l'on prenait les faces ajoutées à la fin. Cela tenait tant que
 * les deux scènes bâtissaient leurs murs à l'identique — et cette
 * coïncidence est tombée le jour où un mur ne se découpe en bandes que s'il
 * a quelque chose à départager devant lui : la scène nue, sans meuble,
 * garde ses pans d'un seul tenant, et le décalage attrapait des morceaux de
 * mur.
 *
 * La couleur du mobilier ne dépend, elle, de rien d'autre que du mobilier.
 */
const tele = scene.faces.filter(
  (f) =>
    !f.isFloor &&
    !!f.fill &&
    f.fill !== PAL.wall &&
    f.fill !== PAL.wallTop &&
    f.fill !== PAL.floor,
);
/** Le refend, vu de la pièce d'à côté (z ≈ 3 − épaisseur/2). */
const refend = scene.faces.filter(
  (f) =>
    f.fill === PAL.wall &&
    f.pts.every((p) => Math.abs(p.z - 2.93) < 0.02) &&
    f.pts.some((p) => Math.abs(p.x - 3) < 1.2),
);

describe('la télé est bien accrochée, pas posée', () => {
  it('sa silhouette n’a ni pied ni socle', () => {
    const parts = furnitureParts('television');
    expect(parts).toHaveLength(2);
    // Rien qui descende au sol : la dalle part du bas de SON emprise, et
    // l'emprise, elle, est à 1,10 m du sol.
    expect(parts.filter((p) => p.z0 > 0.7)).toHaveLength(1);
  });

  it('elle occupe toute son épaisseur, sinon elle disparaît de profil', () => {
    const [dalle] = furnitureParts('television');
    expect(dalle.z1 - dalle.z0).toBeGreaterThan(0.6);
  });
});

describe('vue depuis la pièce voisine, le mur la cache', () => {
  // θ = 180 : la caméra regarde vers les z décroissants, donc depuis le
  // séjour. La télé est derrière le refend.
  for (const tilt of [22, 35, 50, 70]) {
    it(`inclinaison ${tilt}° : aucune face de la télé ne passe devant`, () => {
      const c = cam(180, tilt);
      const d = depth(c);
      const vus = scene.faces.filter((f) => !isHiddenFace(f, c));
      const mursVus = refend.filter((f) => !isHiddenFace(f, c));
      expect(mursVus.length).toBeGreaterThan(0);
      const devant = Math.max(...mursVus.map(d));
      for (const f of tele.filter((x) => !isHiddenFace(x, c))) {
        expect(vus).toContain(f);
        expect(d(f)).toBeLessThan(devant);
      }
    });
  }
});

describe('vue depuis SA pièce, elle reste visible', () => {
  for (const tilt of [22, 35, 50, 70]) {
    it(`inclinaison ${tilt}° : elle passe devant son mur`, () => {
      const c = cam(0, tilt);
      const d = depth(c);
      const face = tele.filter((f) => !isHiddenFace(f, c));
      expect(face.length).toBeGreaterThan(0);
      const mursVus = refend.filter((f) => !isHiddenFace(f, c));
      const derriere = Math.max(-Infinity, ...mursVus.map(d));
      expect(Math.max(...face.map(d))).toBeGreaterThan(derriere);
    });
  }
});

/**
 * Chaque appareil doit se voir en 3D, à ses cotes.
 *
 * Un test par type du catalogue, ensembles multipostes compris : le volume
 * existe, il mesure ce qu'annonce sa fiche, il est posé devant le nu du mur,
 * et son symbole est gravé dessus — à l'entraxe quand il y a plusieurs
 * postes. C'est le genre de vérification qu'on ne fait pas à l'œil sur
 * quinze types.
 */
import {
  ENTRAXE,
  FIXTURES,
  FIXTURE_KINDS,
  assemblySymbol,
  faceX,
  interiorSide,
  postsOf,
  symbolPolylines,
  wallFace,
  type Fixture,
} from '../src/geometry/electrical';
import { wallQuads, type WallSeg } from '../src/geometry/floorplan';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { mixHex } from '../src/geometry/appearance';

const wall = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});

/** Pièce de 5 m : de quoi loger la plus large des plaques. */
const BOX: WallSeg[] = [
  wall('n', 0, 0, 5, 0),
  wall('e', 5, 0, 5, 4),
  wall('s', 5, 4, 0, 4),
  wall('w', 0, 4, 0, 0),
];

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

const side = interiorSide(BOX[0], BOX);
const face = wallFace(BOX[0], wallQuads(BOX).get('n'), side);

describe('tout l’appareillage se voit en 3D, à ses cotes', () => {
  for (const kind of FIXTURE_KINDS) {
    const spec = FIXTURES[kind];
    const f: Fixture = {
      id: 'x',
      kind,
      wallId: 'n',
      along: 2,
      height: 1.2,
      side,
    };
    const scene = buildScene(BOX, [], [], { palette: PAL, fixtures: [f] });
    const nu = buildScene(BOX, [], [], { palette: PAL });
    // La plaque : ses flancs portent la couleur de l'appareil.
    const plaque = scene.faces.filter((x) => x.fill === spec.color);
    // Le symbole gravé : des traits, dans la teinte foncée de l'appareil.
    const grave = mixHex(spec.color, '#000000', 0.55);
    const traits = scene.faces.filter(
      (x) => x.fill === null && x.stroke === grave,
    );
    const along = (p: { x: number; z: number }) =>
      (p.x - face.A.x) * face.ux + (p.z - face.A.z) * face.uz;
    const out = (p: { x: number; z: number }) =>
      (p.x - face.A.x) * face.nx + (p.z - face.A.z) * face.nz;

    it(`${spec.label} : un volume s’ajoute au modèle`, () => {
      expect(scene.faces.length).toBeGreaterThan(nu.faces.length);
      expect(plaque.length).toBeGreaterThan(0);
    });

    it(`${spec.label} : ${Math.round(spec.w * 1000)} × ${Math.round(
      spec.h * 1000,
    )} mm, ${Math.round(spec.depth * 1000)} de saillie`, () => {
      const pts = plaque.flatMap((x) => x.pts);
      const xs = pts.map(along);
      const ys = pts.map((p) => p.y);
      const ns = pts.map(out);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(spec.w, 3);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(spec.h, 3);
      // Devant le nu, jamais dedans, et à la saillie annoncée.
      expect(Math.min(...ns)).toBeGreaterThanOrEqual(faceX(face, 0) * 0 - 1e-9);
      expect(Math.max(...ns)).toBeCloseTo(spec.depth, 3);
      // Centrée sur la cote demandée.
      const centre = (Math.max(...xs) + Math.min(...xs)) / 2;
      expect(centre).toBeCloseTo(faceX(face, 2), 3);
      const milieu = (Math.max(...ys) + Math.min(...ys)) / 2;
      expect(milieu).toBeCloseTo(1.2, 3);
    });

    it(`${spec.label} : son symbole est gravé sur la façade`, () => {
      expect(traits.length).toBeGreaterThan(0);
      const pts = traits.flatMap((x) => x.pts);
      // Le tracé reste DANS la plaque, et devant elle.
      const xs = pts.map(along);
      const centre = faceX(face, 2);
      expect(Math.min(...xs)).toBeGreaterThan(centre - spec.w / 2 - 1e-6);
      expect(Math.max(...xs)).toBeLessThan(centre + spec.w / 2 + 1e-6);
      for (const p of pts) expect(out(p)).toBeGreaterThan(spec.depth);
    });

    const n = postsOf(kind).length;
    if (n > 1) {
      it(`${spec.label} : ${n} postes à ${Math.round(
        ENTRAXE * 1000,
      )} mm d’entraxe`, () => {
        // L'écartement des symboles, mesuré sur le tracé lui-même : c'est
        // l'entraxe des boîtes, ramené à l'échelle du symbole.
        const lignes = symbolPolylines(assemblySymbol(kind));
        const xs = lignes.flatMap((l) => l.pts.map((p) => p.x));
        const etendue = Math.max(...xs) - Math.min(...xs);
        // Repère du symbole : 22 unités pour 82 mm de plaque.
        const enMetres = (etendue / 22) * 0.082;
        expect(enMetres).toBeGreaterThan((n - 1) * ENTRAXE * 0.9);
        expect(enMetres).toBeLessThan((n - 1) * ENTRAXE + 0.082);
      });
    }
  }

  it('deux appareils sous une même plaque restent deux volumes', () => {
    // Un ensemble monté à la main : deux boîtes à l'entraxe, deux
    // mécanismes. Le modèle doit en montrer deux, pas un bloc unique.
    const prise: Fixture = { id: 'a', kind: 'prise', wallId: 'n', along: 2, height: 0.25, side, group: 'g1' };
    const rj: Fixture = {
      id: 'b',
      kind: 'rj45',
      wallId: 'n',
      along: 2 + ENTRAXE * (face.s1 >= face.s0 ? 1 : -1),
      height: 0.25,
      side,
      group: 'g1',
    };
    const scene = buildScene(BOX, [], [], { palette: PAL, fixtures: [prise, rj] });
    const along = (p: { x: number; z: number }) =>
      (p.x - face.A.x) * face.ux + (p.z - face.A.z) * face.uz;
    const centres = ['prise', 'rj45'].map((k) => {
      const col = FIXTURES[k as 'prise'].color;
      const pts = scene.faces.filter((x) => x.fill === col).flatMap((x) => x.pts);
      const xs = pts.map(along);
      return (Math.max(...xs) + Math.min(...xs)) / 2;
    });
    expect(Math.abs(centres[0] - centres[1])).toBeCloseTo(ENTRAXE, 3);
  });
});

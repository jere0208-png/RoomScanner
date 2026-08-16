/**
 * Chaque appareil doit se voir en 3D, à ses cotes RÉELLES.
 *
 * Ce que le modèle doit montrer, c'est ce que l'électricien voit sur le mur :
 * une plaque blanche — 82 mm pour un poste, 153 pour deux, 224 pour trois —
 * et, en saillie dessus, un mécanisme de 45 mm par poste, à 71 mm d'entraxe.
 * Deux prises réunies à la main donnent exactement la même chose qu'une prise
 * double du catalogue : c'est ce qui distingue un ensemble de deux plaques
 * posées l'une sur l'autre.
 *
 * On vérifie aussi l'ORDRE DE PEINTURE, dans les deux sens. Un volume peut
 * exister et rester invisible (le mur le repeint), ou se voir alors qu'il
 * devrait être caché (il traverse la cloison) : les deux sont arrivés.
 */
import {
  ENTRAXE,
  FIXTURES,
  FIXTURE_KINDS,
  PLAQUE,
  faceX,
  interiorSide,
  postsOf,
  wallFace,
  type Fixture,
} from '../src/geometry/electrical';
import { wallQuads, type WallSeg } from '../src/geometry/floorplan';
import {
  buildScene,
  isHiddenFace,
  type Face3D,
  type ScenePalette,
} from '../src/geometry/scene3d';
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
/** Couleur de la plaque : le neutre du décor éclairci. */
const BLANC = mixHex(PAL.object, '#FFFFFF', 0.72);
const MECANISME = 0.045;

const along = (p: { x: number; z: number }) =>
  (p.x - face.A.x) * face.ux + (p.z - face.A.z) * face.uz;
const out = (p: { x: number; z: number }) =>
  (p.x - face.A.x) * face.nx + (p.z - face.A.z) * face.nz;

/** Étendue d'un jeu de faces, dans le repère de la face du mur. */
const etendue = (fs: Face3D[]) => {
  const pts = fs.flatMap((f) => f.pts);
  const xs = pts.map(along);
  const ys = pts.map((p) => p.y);
  const ns = pts.map(out);
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
    n0: Math.min(...ns),
    n1: Math.max(...ns),
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
};

const scener = (fixtures: Fixture[]) =>
  buildScene(BOX, [], [], { palette: PAL, fixtures });

describe('l’appareillage, à ses cotes réelles', () => {
  for (const kind of FIXTURE_KINDS) {
    const spec = FIXTURES[kind];
    const n = postsOf(kind).length;
    const encastre = spec.h <= 0.12;
    const f: Fixture = { id: 'x', kind, wallId: 'n', along: 2, height: 1.2, side };
    const scene = scener([f]);
    const nu = buildScene(BOX, [], [], { palette: PAL });
    // Un ensemble mixte (RJ + prise) porte DEUX couleurs de mécanisme : on
    // les prend toutes, sinon on ne mesure qu'un poste sur deux.
    const teintes = new Set(postsOf(kind).map((k) => FIXTURES[k].color));
    const meca = scene.faces.filter((x) => !!x.fill && teintes.has(x.fill));
    const plaque = scene.faces.filter((x) => x.fill === BLANC);

    it(`${spec.label} : un volume s’ajoute au modèle`, () => {
      expect(scene.faces.length).toBeGreaterThan(nu.faces.length);
      expect(meca.length).toBeGreaterThan(0);
    });

    if (encastre) {
      it(`${spec.label} : plaque de ${Math.round(
        ((n - 1) * ENTRAXE + PLAQUE) * 1000,
      )} × ${Math.round(PLAQUE * 1000)} mm`, () => {
        const e = etendue(plaque);
        expect(e.x1 - e.x0).toBeCloseTo((n - 1) * ENTRAXE + PLAQUE, 3);
        expect(e.y1 - e.y0).toBeCloseTo(PLAQUE, 3);
        // Posée sur le nu, 8 mm d'épaisseur, centrée sur la cote demandée.
        expect(e.n1).toBeCloseTo(0.008, 3);
        expect(e.cx).toBeCloseTo(faceX(face, 2), 3);
        expect(e.cy).toBeCloseTo(1.2, 3);
      });

      it(`${spec.label} : ${n} mécanisme(s) de 45 mm en saillie`, () => {
        const e = etendue(meca);
        expect(e.y1 - e.y0).toBeCloseTo(MECANISME, 3);
        expect(e.x1 - e.x0).toBeCloseTo((n - 1) * ENTRAXE + MECANISME, 3);
        // En saillie DE LA PLAQUE, jamais dedans.
        expect(e.n0).toBeGreaterThanOrEqual(0.008 - 1e-9);
        expect(e.n1).toBeCloseTo(Math.max(0.012, spec.depth), 3);
      });
    } else {
      it(`${spec.label} : ${Math.round(spec.w * 1000)} × ${Math.round(
        spec.h * 1000,
      )} mm, ${Math.round(spec.depth * 1000)} de saillie`, () => {
        const e = etendue(meca);
        expect(e.x1 - e.x0).toBeCloseTo(spec.w, 3);
        expect(e.y1 - e.y0).toBeCloseTo(spec.h, 3);
        expect(e.n1).toBeCloseTo(spec.depth, 3);
        expect(e.cx).toBeCloseTo(faceX(face, 2), 3);
        expect(e.cy).toBeCloseTo(1.2, 3);
      });
    }

    it(`${spec.label} : son symbole est gravé sur la façade`, () => {
      const grave = mixHex(FIXTURES[postsOf(kind)[0]].color, '#000000', 0.55);
      const traits = scene.faces.filter(
        (x) => x.fill === null && x.stroke === grave,
      );
      expect(traits.length).toBeGreaterThan(0);
      const e = etendue(traits);
      const m = etendue(meca);
      expect(e.x0).toBeGreaterThan(m.x0 - 1e-6);
      expect(e.x1).toBeLessThan(m.x1 + 1e-6);
      for (const p of traits.flatMap((x) => x.pts)) {
        expect(out(p)).toBeGreaterThan(m.n1 - 1e-9);
      }
    });
  }

  it('deux prises réunies = une prise double, au millimètre', () => {
    const a: Fixture = { id: 'a', kind: 'prise', wallId: 'n', along: 2, height: 0.25, side, group: 'g1' };
    const b: Fixture = {
      id: 'b',
      kind: 'prise',
      wallId: 'n',
      along: 2 + ENTRAXE * (face.s1 >= face.s0 ? 1 : -1),
      height: 0.25,
      side,
      group: 'g1',
    };
    const ensemble = scener([a, b]);
    const double = scener([
      { id: 'd', kind: 'prise2', wallId: 'n', along: 2 + ENTRAXE / 2, height: 0.25, side },
    ]);

    const pl1 = etendue(ensemble.faces.filter((x) => x.fill === BLANC));
    const pl2 = etendue(double.faces.filter((x) => x.fill === BLANC));
    // Même plaque : 153 mm, au même endroit.
    expect(pl1.x1 - pl1.x0).toBeCloseTo(ENTRAXE + PLAQUE, 3);
    expect(pl1.x1 - pl1.x0).toBeCloseTo(pl2.x1 - pl2.x0, 3);
    expect(pl1.cx).toBeCloseTo(pl2.cx, 3);

    // Et deux mécanismes distincts, à 71 mm d'entraxe.
    const col = FIXTURES.prise.color;
    for (const sc of [ensemble, double]) {
      // Une seule face par mécanisme : sa FAÇADE. Prendre tous les flancs
      // reviendrait à mesurer l'étendue de l'ensemble, pas l'entraxe.
      const xs = sc.faces
        .filter(
          (x) =>
            x.fill === col &&
            !!x.normal &&
            x.normal.x * face.nx + x.normal.z * face.nz > 0.9,
        )
        .map((x) => x.pts.map(along))
        .map((v) => (Math.min(...v) + Math.max(...v)) / 2)
        .sort((a2, b2) => a2 - b2);
      expect(xs).toHaveLength(2);
      expect(xs[1] - xs[0]).toBeCloseTo(ENTRAXE, 3);
    }
  });

  it('une seule plaque pour un ensemble, pas une par appareil', () => {
    const a: Fixture = { id: 'a', kind: 'prise', wallId: 'n', along: 2, height: 0.25, side, group: 'g' };
    const b: Fixture = { id: 'b', kind: 'rj45', wallId: 'n', along: 2.071, height: 0.25, side, group: 'g' };
    const sc = scener([a, b]);
    const e = etendue(sc.faces.filter((x) => x.fill === BLANC));
    expect(e.x1 - e.x0).toBeCloseTo(ENTRAXE + PLAQUE, 3);
    // Les deux mécanismes gardent LEUR couleur : on lit ce qui est posé.
    expect(sc.faces.some((x) => x.fill === FIXTURES.prise.color)).toBe(true);
    expect(sc.faces.some((x) => x.fill === FIXTURES.rj45.color)).toBe(true);
  });
});

describe('l’ordre de peinture, dans les deux sens', () => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const ANGLES = [15, 75, 135, 195, 255, 315];
  const camAt = (theta: number) => ({
    ct: Math.cos(rad(theta)),
    st: Math.sin(rad(theta)),
    cp: Math.cos(rad(35)),
    sp: Math.sin(rad(35)),
  });
  const profAt =
    (cam: ReturnType<typeof camAt>) =>
    (p: { x: number; y: number; z: number }) =>
      (p.x * cam.st + p.z * cam.ct) * cam.sp + p.y * cam.cp;
  const depAt =
    (prof: (p: { x: number; y: number; z: number }) => number) => (x: Face3D) =>
      (x.depthRefs
        ? Math.max(...x.depthRefs.map(prof))
        : x.depthAt
        ? prof(x.depthAt)
        : x.pts.reduce((s, p) => s + prof(p), 0) / x.pts.length) + (x.bias ?? 0);

  for (const kind of FIXTURE_KINDS) {
    const spec = FIXTURES[kind];

    it(`${spec.label} : visible de face, sous tous les angles`, () => {
      for (const h of [0.25, 1.2]) {
        const scene = scener([
          { id: 'x', kind, wallId: 'n', along: 2, height: h, side },
        ]);
        const e = etendue(
          scene.faces.filter((x) => x.fill === spec.color || x.fill === BLANC),
        );
        let vue = false;
        for (const theta of ANGLES) {
          const cam = camAt(theta);
          const dep = depAt(profAt(cam));
          const vus = scene.faces.filter((x) => !isHiddenFace(x, cam));
          const facade = vus.filter(
            (x) =>
              (x.fill === spec.color || x.fill === BLANC) &&
              !!x.normal &&
              x.normal.x * face.nx + x.normal.z * face.nz > 0.9,
          );
          if (!facade.length) continue;
          vue = true;
          const dPlaque = Math.min(...facade.map(dep));
          const dessous = vus.filter(
            (x) =>
              x.fill === PAL.wall &&
              x.pts.every((p) => Math.abs(out(p)) < 0.01) &&
              Math.max(...x.pts.map(along)) > e.x0 &&
              Math.min(...x.pts.map(along)) < e.x1,
          );
          expect(Math.max(-Infinity, ...dessous.map(dep))).toBeLessThan(dPlaque);
        }
        expect(vue).toBe(true);
      }
    });

    it(`${spec.label} : invisible à travers la cloison`, () => {
      const scene = scener([
        { id: 'x', kind, wallId: 'n', along: 2, height: 1.2, side },
      ]);
      let vuDeDos = false;
      for (const theta of ANGLES) {
        const cam = camAt(theta);
        if (face.nx * cam.st * cam.sp + face.nz * cam.ct * cam.sp > 0) continue;
        vuDeDos = true;
        const dep = depAt(profAt(cam));
        const vus = scene.faces.filter((x) => !isHiddenFace(x, cam));
        const appareil = vus.filter(
          (x) => x.fill === spec.color || x.fill === BLANC,
        );
        const dos = vus.filter(
          (x) => x.fill === PAL.wall && x.pts.every((p) => out(p) < -0.13),
        );
        for (const a of appareil) {
          const ax0 = Math.min(...a.pts.map(along));
          const ax1 = Math.max(...a.pts.map(along));
          const dessus = dos.filter(
            (x) =>
              Math.max(...x.pts.map(along)) > ax0 + 1e-6 &&
              Math.min(...x.pts.map(along)) < ax1 - 1e-6,
          );
          for (const d of dessus) expect(dep(a)).toBeLessThan(dep(d));
        }
      }
      expect(vuDeDos).toBe(true);
    });
  }
});

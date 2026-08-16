/**
 * Rien de ce qui est posé sur un mur ne doit se voir À TRAVERS un autre.
 *
 * L'appareillage et les meubles muraux se trient avec le mur qu'ils longent :
 * vu de la pièce ils passent juste après lui, vu de dos il les couvre. Ce
 * raisonnement ne vaut que pour LEUR mur. Un tableau posé au fond de la
 * pièce reste comparé à sa propre cloison, jamais à celle qu'on a devant les
 * yeux — et il se peignait par-dessus, un rectangle rouge flottant sur un
 * mur plein.
 *
 * Le test ne compare pas des profondeurs à la main : il lance un rayon
 * depuis l'appareil vers la caméra et cherche les pans de mur qu'il
 * traverse. Tout pan traversé DOIT se peindre après lui.
 */
import {
  buildScene,
  faceDepth,
  isHiddenFace,
  type Face3D,
} from '../src/geometry/scene3d';
import type { WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';
import type { ObjectData } from 'react-native-room-scan';

const wall = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** La pièce du relevé : 3,50 × 2,46. */
const W: WallSeg[] = [
  wall('n', 0, 0, 3.5, 0),
  wall('e', 3.5, 0, 3.5, 2.46),
  wall('s', 3.5, 2.46, 0, 2.46),
  wall('w', 0, 2.46, 0, 0),
];
const R = [{ id: 'r1', name: 'Pièce 1', wallIds: W.map((w) => w.id) }];

const PAL = {
  floor: '#EFF1F5',
  floorStroke: '#C9D0DA',
  wall: '#FFFFFF',
  wallStroke: '#8A94A6',
  wallTop: '#F4F7FB',
  wallTopStroke: '#94A0B4',
  opening: '#B9C2CE',
  door: '#E0A33A',
  window: '#5AB6E8',
  passage: '#2F6BFF',
  object: '#D8E1F2',
  objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};

const rad = (d: number) => (d * Math.PI) / 180;
const camAt = (theta: number, phi = 35) => ({
  ct: Math.cos(rad(theta)),
  st: Math.sin(rad(theta)),
  cp: Math.cos(rad(phi)),
  sp: Math.sin(rad(phi)),
});
type Cam = ReturnType<typeof camAt>;
type P3 = { x: number; y: number; z: number };

/** Profondeur d'un point : plus c'est grand, plus c'est près de l'œil. */
const prof = (cam: Cam) => (p: P3) =>
  (p.x * cam.st + p.z * cam.ct) * cam.sp + p.y * cam.cp;

/** Le vecteur unitaire qui va vers l'œil. */
const versOeil = (cam: Cam): P3 => ({
  x: cam.st * cam.sp,
  y: cam.cp,
  z: cam.ct * cam.sp,
});

/**
 * La profondeur de tri : CELLE DE LA PRODUCTION, pas une copie.
 *
 * Une première version du test la recalculait à la main. Elle mesurait donc
 * le code d'avant, et restait rouge après le correctif comme avant lui :
 * un test qui réimplémente ce qu'il vérifie ne vérifie rien.
 */
const depOf = (f: Face3D, P: (p: P3) => number, cam: Cam) =>
  faceDepth(f, (p) => ({ depth: P(p) }), cam);

const centroide = (pts: P3[]): P3 => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  z: pts.reduce((s, p) => s + p.z, 0) / pts.length,
});

/**
 * Le rayon parti de `depuis` vers l'œil traverse-t-il ce quadrilatère ?
 *
 * On coupe le plan de la face, puis on vérifie que le point d'impact tombe
 * bien dans le quadrilatère — dans son repère local, pas dans le monde.
 */
function traverse(face: Face3D, depuis: P3, dir: P3): boolean {
  if (face.pts.length < 3 || !face.fill) return false;
  const [a, b, c] = face.pts;
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const n = {
    x: u.y * v.z - u.z * v.y,
    y: u.z * v.x - u.x * v.z,
    z: u.x * v.y - u.y * v.x,
  };
  const nn = Math.hypot(n.x, n.y, n.z);
  if (nn < 1e-9) return false;
  const dn = (dir.x * n.x + dir.y * n.y + dir.z * n.z) / nn;
  if (Math.abs(dn) < 1e-6) return false;
  const w = { x: a.x - depuis.x, y: a.y - depuis.y, z: a.z - depuis.z };
  const t = (w.x * n.x + w.y * n.y + w.z * n.z) / nn / dn;
  // Devant l'appareil, et pas collé à lui (les faces de la plaque elle-même).
  if (t < 0.02) return false;
  const p = {
    x: depuis.x + dir.x * t,
    y: depuis.y + dir.y * t,
    z: depuis.z + dir.z * t,
  };
  // Dans le quadrilatère : coordonnées locales sur (u, v) orthonormalisés.
  const ex = { x: u.x, y: u.y, z: u.z };
  const el = Math.hypot(ex.x, ex.y, ex.z);
  if (el < 1e-9) return false;
  ex.x /= el;
  ex.y /= el;
  ex.z /= el;
  const ey = {
    x: n.y * ex.z - n.z * ex.y,
    y: n.z * ex.x - n.x * ex.z,
    z: n.x * ex.y - n.y * ex.x,
  };
  const eyn = Math.hypot(ey.x, ey.y, ey.z);
  ey.x /= eyn;
  ey.y /= eyn;
  ey.z /= eyn;
  const loc = (q: P3) => ({
    x: (q.x - a.x) * ex.x + (q.y - a.y) * ex.y + (q.z - a.z) * ex.z,
    y: (q.x - a.x) * ey.x + (q.y - a.y) * ey.y + (q.z - a.z) * ey.z,
  });
  const poly = face.pts.map(loc);
  const q = loc(p);
  // Marge d'un millimètre : un rayon qui frôle l'arête ne compte pas.
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].y > q.y;
    const yj = poly[j].y > q.y;
    if (yi === yj) continue;
    const xx =
      ((poly[j].x - poly[i].x) * (q.y - poly[i].y)) / (poly[j].y - poly[i].y) +
      poly[i].x;
    if (q.x < xx) dedans = !dedans;
  }
  return dedans;
}

const ANGLES = Array.from({ length: 24 }, (_, i) => i * 15);
const PHIS = [20, 35, 55];

/** Les pans de MAÇONNERIE traversés par le rayon, et mal ordonnés. */
function fuites(faces: Face3D[], cible: Face3D[]): string[] {
  const out: string[] = [];
  for (const theta of ANGLES) {
    for (const phi of PHIS) {
      const cam = camAt(theta, phi);
      const P = prof(cam);
      const dir = versOeil(cam);
      const vus = faces.filter((f) => !isHiddenFace(f, cam));
      for (const f of cible) {
        if (isHiddenFace(f, cam)) continue;
        const c = centroide(f.pts);
        const d = depOf(f, P, cam);
        for (const m of vus) {
          if (m.fill !== PAL.wall && m.fill !== PAL.wallTop) continue;
          if (!traverse(m, c, dir)) continue;
          if (depOf(m, P, cam) < d) {
            out.push(`θ=${theta} φ=${phi}`);
          }
        }
      }
    }
  }
  return [...new Set(out)];
}

describe('un appareil ne traverse aucune cloison', () => {
  const scener = (fixtures: Fixture[], objects: ObjectData[] = []) =>
    buildScene(W, [], objects, {
      palette: PAL,
      rooms: R,
      fixtures,
      showSurfaces: false,
    });

  it('le tableau, posé au fond, reste derrière le mur qu’on a devant soi', () => {
    const sc = scener([
      { id: 't', kind: 'tableau', wallId: 'n', along: 1.5, height: 1.35, side: 1 },
    ]);
    const appareil = sc.faces.filter(
      (f) => !!f.fill && (f.depthRefs || f.depthAt) && f.fill !== PAL.wall,
    );
    expect(appareil.length).toBeGreaterThan(0);
    expect(fuites(sc.faces, appareil)).toEqual([]);
  });

  it('une prise basse non plus, à tous les angles et toutes les hauteurs d’œil', () => {
    const sc = scener([
      { id: 'p', kind: 'prise', wallId: 's', along: 1, height: 0.25, side: 1 },
    ]);
    const appareil = sc.faces.filter(
      (f) => !!f.fill && (f.depthRefs || f.depthAt) && f.fill !== PAL.wall,
    );
    expect(fuites(sc.faces, appareil)).toEqual([]);
  });
});

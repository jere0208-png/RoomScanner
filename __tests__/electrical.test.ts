/**
 * Appareillage électrique : le repère de la face de mur, la pose à 20/20,
 * le volume rendu en 3D, et le passage par le store.
 *
 * Le point le plus délicat n'est pas la 3D mais la GAUCHE : de l'autre côté
 * d'une cloison, la gauche et la droite s'échangent. Un test projette donc
 * les deux bords de la face exactement comme le fait la vue 3D, et vérifie
 * que le bord annoncé « gauche » sort bien à gauche à l'écran.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import {
  wallQuads,
  WALL_T,
  type WallSeg,
} from '../src/geometry/floorplan';
import {
  FIXTURES,
  faceX,
  facePoint,
  fixtureDims,
  fromFaceX,
  interiorSide,
  newFixture,
  wallFace,
  type Fixture,
} from '../src/geometry/electrical';
import { buildScene, isHiddenFace, type ScenePalette } from '../src/geometry/scene3d';
import { useScanStore } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const wall = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});

/** Pièce carrée de 4 m, parcourue dans le sens horaire. */
const BOX: WallSeg[] = [
  wall('n', 0, 0, 4, 0),
  wall('e', 4, 0, 4, 4),
  wall('s', 4, 4, 0, 4),
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

describe('repère de la face de mur', () => {
  const w = BOX[0];
  const q = wallQuads(BOX).get('n');

  it('chaque face a SA longueur, et les deux sens sont opposés', () => {
    const plus = wallFace(w, q, 1);
    const moins = wallFace(w, q, -1);
    // Les deux faces d'un mur ne mesurent pas la même chose : l'onglet des
    // coins raccourcit celle de l'intérieur d'une épaisseur de mur et
    // rallonge celle de l'extérieur d'autant. C'est bien ce qu'on veut —
    // l'électricien mesure depuis le coin fini qu'il a sous les yeux.
    expect(plus.len).toBeCloseTo(4 - WALL_T, 6);
    expect(moins.len).toBeCloseTo(4 + WALL_T, 6);
    // La face +1 part de l'extrémité `a` ; la face −1 en part à l'envers.
    expect(plus.s1).toBeGreaterThan(plus.s0);
    expect(moins.s1).toBeLessThan(moins.s0);
    expect(plus.ux).toBeCloseTo(-moins.ux, 6);
    expect(plus.nx).toBeCloseTo(-moins.nx, 6);
  });

  it('la normale est bien sortante, de part et d’autre du nu', () => {
    const plus = wallFace(w, q, 1);
    const moins = wallFace(w, q, -1);
    const pp = facePoint(plus, plus.len / 2, 0);
    const pm = facePoint(moins, moins.len / 2, 0);
    // Les deux faces sont séparées par l'épaisseur du mur…
    expect(Math.hypot(pp.x - pm.x, pp.z - pm.z)).toBeCloseTo(WALL_T, 2);
    // …et la normale de chacune s'éloigne de l'autre.
    expect((pp.x - pm.x) * plus.nx + (pp.z - pm.z) * plus.nz).toBeGreaterThan(0);
  });

  it('faceX et fromFaceX sont réciproques sur les deux faces', () => {
    for (const side of [1, -1] as const) {
      const face = wallFace(w, q, side);
      for (const along of [0, 0.7, 2, 3.9]) {
        expect(fromFaceX(face, faceX(face, along))).toBeCloseTo(along, 9);
      }
    }
  });

  it('un point donné du mur tombe au même endroit vu des deux faces', () => {
    const plus = wallFace(w, q, 1);
    const moins = wallFace(w, q, -1);
    // Même cote de segment (1,2 m depuis `a`) : les deux points ne diffèrent
    // que par l'épaisseur du mur, jamais le long de celui-ci.
    const p = facePoint(plus, faceX(plus, 1.2), 0);
    const m = facePoint(moins, faceX(moins, 1.2), 0);
    expect(Math.hypot(p.x - m.x, p.z - m.z)).toBeCloseTo(WALL_T, 2);
    expect((p.x - m.x) * plus.ux + (p.z - m.z) * plus.uz).toBeCloseTo(0, 6);
  });

  it('la gauche annoncée est la gauche à l’écran', () => {
    // On se place devant la face : la caméra de la vue 3D regarde dans la
    // direction de la normale, donc (st, ct) = (nx, nz). Son abscisse écran
    // est rx = x·ct − z·st (Iso3DView, svgSnapshot et le PDF, à l'identique).
    for (const side of [1, -1] as const) {
      const face = wallFace(w, q, side);
      const st = face.nx;
      const ct = face.nz;
      const sx = (p: { x: number; z: number }) => p.x * ct - p.z * st;
      expect(sx(face.B)).toBeGreaterThan(sx(face.A));
    }
  });

  it('la face par défaut est celle qui regarde la pièce', () => {
    for (const w2 of BOX) {
      const side = interiorSide(w2, BOX);
      const face = wallFace(w2, wallQuads(BOX).get(w2.id), side);
      const p = facePoint(face, face.len / 2, 0.3);
      // 30 cm devant la face : on doit être DANS la pièce (0..4 en x et z).
      expect(p.x).toBeGreaterThan(0.05);
      expect(p.x).toBeLessThan(3.95);
      expect(p.z).toBeGreaterThan(0.05);
      expect(p.z).toBeLessThan(3.95);
    }
  });
});

describe('pose d’un appareil', () => {
  const q = wallQuads(BOX);

  it('arrive à 20 cm du coin bas gauche, quelle que soit la face', () => {
    for (const side of [1, -1] as const) {
      const f = newFixture('f1', 'prise', BOX[0], q.get('n'), side);
      const face = wallFace(BOX[0], q.get('n'), side);
      expect(faceX(face, f.along)).toBeCloseTo(0.2, 6);
      expect(f.height).toBeCloseTo(0.2, 6);
      const dims = fixtureDims(face, f);
      expect(dims.left).toBeCloseTo(0.2, 6);
      expect(dims.left + dims.right).toBeCloseTo(face.len, 6);
    }
  });

  it('un appareil large ne déborde pas du mur', () => {
    const petit = wall('court', 0, 0, 0.5, 0);
    const f = newFixture('f2', 'tableau', petit, undefined, 1);
    const face = wallFace(petit, undefined, 1);
    const demi = FIXTURES.tableau.w / 2;
    expect(faceX(face, f.along)).toBeGreaterThanOrEqual(
      Math.min(demi, face.len / 2) - 1e-9,
    );
  });
});

describe('rendu 3D de l’appareillage', () => {
  const q = wallQuads(BOX);
  const side = interiorSide(BOX[0], BOX);
  const prise: Fixture = {
    id: 'p1',
    kind: 'prise',
    wallId: 'n',
    along: 2,
    height: 0.25,
    side,
  };
  const scene = buildScene(BOX, [], [], { palette: PAL, fixtures: [prise] });
  const nu = buildScene(BOX, [], [], { palette: PAL });
  const spec = FIXTURES.prise;
  const mine = scene.faces.filter(
    (f) => f.fill === spec.color || f.stroke === spec.color,
  );

  it('ajoute bien un volume au modèle', () => {
    expect(scene.faces.length).toBeGreaterThan(nu.faces.length);
    expect(mine.length).toBeGreaterThan(0);
  });

  it('se pose DEVANT le nu du mur, sans y entrer', () => {
    const face = wallFace(BOX[0], q.get('n'), side);
    const nuPoint = facePoint(face, faceX(face, prise.along), 0);
    for (const f of mine) {
      for (const p of f.pts) {
        const out =
          (p.x - nuPoint.x) * face.nx + (p.z - nuPoint.z) * face.nz;
        expect(out).toBeGreaterThanOrEqual(-1e-6);
        expect(out).toBeLessThanOrEqual(spec.depth + 1e-6);
      }
    }
  });

  it('tient dans son gabarit, à la bonne hauteur', () => {
    const ys = mine.flatMap((f) => f.pts.map((p) => p.y));
    expect(Math.min(...ys)).toBeCloseTo(prise.height - spec.h / 2, 3);
    expect(Math.max(...ys)).toBeCloseTo(prise.height + spec.h / 2, 3);
  });

  it('porte des normales unitaires, et jamais deux opposées visibles', () => {
    const cam = {
      ct: Math.cos(0.7),
      st: Math.sin(0.7),
      cp: Math.cos(0.9),
      sp: Math.sin(0.9),
    };
    const vues = mine.filter((f) => f.normal && !isHiddenFace(f, cam));
    for (const f of mine) {
      if (!f.normal) continue;
      expect(Math.hypot(f.normal.x, f.normal.y, f.normal.z)).toBeCloseTo(1, 6);
    }
    for (const a of vues) {
      for (const b of vues) {
        const d =
          a.normal!.x * b.normal!.x +
          a.normal!.y * b.normal!.y +
          a.normal!.z * b.normal!.z;
        expect(d).toBeGreaterThan(-0.99);
      }
    }
  });

  it('disparaît quand on passe derrière son mur', () => {
    const face = wallFace(BOX[0], q.get('n'), side);
    // Caméra dans le dos de la face : (st, ct) = −n.
    const dos = { ct: -face.nz, st: -face.nx, cp: Math.cos(1), sp: Math.sin(1) };
    const devant = { ct: face.nz, st: face.nx, cp: Math.cos(1), sp: Math.sin(1) };
    const avant = mine.filter((f) => f.fill === spec.color);
    expect(avant.some((f) => !isHiddenFace(f, devant))).toBe(true);
    const versLaPiece = avant.filter(
      (f) =>
        f.normal &&
        f.normal.x * face.nx + f.normal.z * face.nz > 0.9,
    );
    expect(versLaPiece.length).toBeGreaterThan(0);
    expect(versLaPiece.every((f) => isHiddenFace(f, dos))).toBe(true);
  });

  it('un appareil orphelin ne dessine rien', () => {
    const perdu = buildScene(BOX, [], [], {
      palette: PAL,
      fixtures: [{ ...prise, wallId: 'mur-disparu' }],
    });
    expect(perdu.faces.length).toBe(nu.faces.length);
  });
});

describe('le store et l’appareillage', () => {
  beforeEach(() => {
    useScanStore.setState({
      walls: BOX,
      openings: [],
      objects: [],
      fixtures: [],
      rooms: [{ id: 'room-1', name: 'Séjour', wallIds: BOX.map((w) => w.id) }],
      currentSaveId: null,
      saves: [],
      canUndo: false,
      dirty: false,
    });
  });

  it('pose l’appareil à 20/20 sur la face de la pièce', () => {
    const id = useScanStore.getState().addFixture('prise', 'n');
    expect(id).toBeTruthy();
    const f = useScanStore.getState().fixtures[0];
    const face = wallFace(BOX[0], wallQuads(BOX).get('n'), f.side);
    expect(faceX(face, f.along)).toBeCloseTo(0.2, 6);
    expect(f.height).toBeCloseTo(0.2, 6);
    expect(f.side).toBe(interiorSide(BOX[0], BOX));
  });

  it('borne les cotes au mur', () => {
    const id = useScanStore.getState().addFixture('prise', 'n')!;
    // Bien au-delà du mur, et au-dessus du plafond.
    useScanStore.getState().moveFixture(id, 99, 99);
    const f = useScanStore.getState().fixtures[0];
    const face = wallFace(BOX[0], wallQuads(BOX).get('n'), f.side);
    const x = faceX(face, f.along);
    expect(x).toBeLessThanOrEqual(face.len + 1e-9);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(f.height).toBeLessThanOrEqual(2.5);
  });

  it('retourner un appareil ne le déplace pas le long du mur', () => {
    const id = useScanStore.getState().addFixture('prise', 'n')!;
    useScanStore.getState().moveFixture(id, 1.3, 0.25);
    const q = wallQuads(BOX);
    const avant = useScanStore.getState().fixtures[0];
    const fa = wallFace(BOX[0], q.get('n'), avant.side);
    const pa = facePoint(fa, faceX(fa, avant.along), 0);

    useScanStore.getState().flipFixture(id);
    const apres = useScanStore.getState().fixtures[0];
    expect(apres.side).toBe(-avant.side);
    const fb = wallFace(BOX[0], q.get('n'), apres.side);
    const pb = facePoint(fb, faceX(fb, apres.along), 0);
    // Le point a traversé le mur, mais n'a pas glissé le long de celui-ci.
    expect(Math.hypot(pa.x - pb.x, pa.z - pb.z)).toBeCloseTo(WALL_T, 2);
    expect((pa.x - pb.x) * fa.ux + (pa.z - pb.z) * fa.uz).toBeCloseTo(0, 6);
  });

  it('supprimer un mur emporte son appareillage', () => {
    useScanStore.getState().addFixture('prise', 'n');
    useScanStore.getState().addFixture('inter', 'e');
    useScanStore.getState().removeWall('n');
    const rest = useScanStore.getState().fixtures;
    expect(rest.map((f) => f.wallId)).toEqual(['e']);
  });

  it('l’annulation rend l’appareil supprimé', () => {
    const id = useScanStore.getState().addFixture('prise', 'n')!;
    useScanStore.getState().removeFixture(id);
    expect(useScanStore.getState().fixtures).toHaveLength(0);
    useScanStore.getState().undo();
    expect(useScanStore.getState().fixtures.map((f) => f.id)).toEqual([id]);
  });

  it('les scans enregistrés sans électricité se rouvrent sans erreur', () => {
    useScanStore.setState({
      saves: [
        {
          id: 'vieux',
          name: 'Ancien scan',
          createdAt: 0,
          updatedAt: 0,
          modelPath: null,
          rooms: [{ id: 'room-1', name: 'Séjour' }],
          walls: BOX,
          openings: [],
          objects: [],
        },
      ],
    });
    useScanStore.getState().openSave('vieux');
    expect(useScanStore.getState().fixtures).toEqual([]);
  });
});

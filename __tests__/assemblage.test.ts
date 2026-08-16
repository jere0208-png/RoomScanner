/**
 * Poser un appareil là où il y en a déjà un.
 *
 * Le geste est courant — on ajoute une prise à une prise — et il donnait
 * quatre plaques superposées : illisibles au plan, illisibles en 3D, et
 * fausses sur le chantier. Un appareil se range désormais À CÔTÉ, à
 * l'entraxe, sous une plaque commune ; l'écran de face propose ensuite le
 * côté, ou de recentrer l'ensemble sur l'axe du premier percement.
 *
 * Ce fichier vérifie la mécanique de bout en bout : la pose, l'entraxe, le
 * recentrage, la séparation, et ce que le modèle 3D en fait.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import {
  assemblySymbol,
  postsSymbol,
  ENTRAXE,
  FIXTURES,
  PLAQUE,
  faceX,
  fromFaceX,
  interiorSide,
  overlaps,
  wallFace,
} from '../src/geometry/electrical';
import { wallQuads, type WallSeg } from '../src/geometry/floorplan';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { useScanStore } from '../src/store/scanStore';
import { mixHex } from '../src/geometry/appearance';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

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
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 3),
  mur('s', 4, 3, 0, 3),
  mur('w', 0, 3, 0, 0),
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

const neuf = () => {
  useScanStore.setState({
    walls: PIECE,
    rooms: [{ id: 'r1', name: 'Séjour', wallIds: PIECE.map((w) => w.id) }],
    objects: [],
    openings: [],
    fixtures: [],
    pendingJoin: null,
  });
};

const faceDuMur = () => {
  const w = PIECE[0];
  return wallFace(w, wallQuads(PIECE).get('n'), interiorSide(w, PIECE));
};

/** Abscisses des appareils sur la face, dans l'ordre. */
const abscisses = () => {
  const face = faceDuMur();
  return useScanStore
    .getState()
    .fixtures.map((f) => faceX(face, f.along))
    .sort((a, b) => a - b);
};

describe('poser une prise sur une prise', () => {
  it('les range à l’entraxe, sous une plaque commune', () => {
    neuf();
    const a = useScanStore.getState().addFixture('prise', 'n')!;
    const b = useScanStore.getState().addFixture('prise', 'n')!;
    const fx = useScanStore.getState().fixtures;
    expect(fx).toHaveLength(2);

    const xs = abscisses();
    expect(xs[1] - xs[0]).toBeCloseTo(ENTRAXE, 6);

    // Même plaque, et l'app le sait : elle propose de régler l'ensemble.
    const [f1, f2] = fx;
    expect(f1.group).toBeTruthy();
    expect(f2.group).toBe(f1.group);
    expect(useScanStore.getState().pendingJoin).toEqual({ moved: b, base: a });
  });

  it('la troisième vient à son tour, sans jamais se superposer', () => {
    neuf();
    useScanStore.getState().addFixture('prise', 'n');
    useScanStore.getState().addFixture('prise', 'n');
    useScanStore.getState().addFixture('rj45', 'n');
    const face = faceDuMur();
    const fx = useScanStore.getState().fixtures;
    expect(fx).toHaveLength(3);
    const xs = abscisses();
    expect(xs[1] - xs[0]).toBeCloseTo(ENTRAXE, 6);
    expect(xs[2] - xs[1]).toBeCloseTo(ENTRAXE, 6);
    // Deux appareils d'un même ensemble PARTAGENT leur plaque : leurs
    // plaques se chevauchent donc, et c'est justement ce qu'on veut. Ce qui
    // ne doit jamais arriver, c'est deux BOÎTES au même endroit.
    for (const p of fx) {
      for (const q of fx) {
        if (p.id === q.id) continue;
        const dx = Math.abs(faceX(face, p.along) - faceX(face, q.along));
        const dy = Math.abs(p.height - q.height);
        expect(dx > ENTRAXE - 1e-6 || dy > ENTRAXE - 1e-6).toBe(true);
      }
    }
    // Et tous sous la même plaque.
    expect(new Set(fx.map((f) => f.group)).size).toBe(1);
    expect(fx[0].group).toBeTruthy();
  });

  it('un appareil posé au large ne rejoint personne', () => {
    neuf();
    const a = useScanStore.getState().addFixture('prise', 'n')!;
    const face = faceDuMur();
    useScanStore.getState().moveFixture(a, fromFaceX(face, 3), 0.25);
    useScanStore.getState().addFixture('prise', 'n');
    const fx = useScanStore.getState().fixtures;
    expect(fx.every((f) => !f.group)).toBe(true);
    expect(useScanStore.getState().pendingJoin).toBeNull();
  });
});

describe('régler l’ensemble : le côté, puis l’axe', () => {
  /** Rejoue ce que fait le bandeau de l'écran de face. */
  const poser = (
    baseId: string,
    movedId: string,
    axe: number,
    cote: 'gauche' | 'droite' | 'haut' | 'bas',
    centre: boolean,
  ) => {
    const face = faceDuMur();
    const base = useScanStore.getState().fixtures.find((f) => f.id === baseId)!;
    const horiz = cote === 'gauche' || cote === 'droite';
    const sens = cote === 'gauche' || cote === 'bas' ? -1 : 1;
    const demi = centre ? ENTRAXE / 2 : 0;
    const bx = horiz ? axe - sens * demi : axe;
    const by = horiz ? base.height : base.height - sens * demi;
    const mx = horiz ? bx + sens * ENTRAXE : bx;
    const my = horiz ? by : by + sens * ENTRAXE;
    useScanStore
      .getState()
      .placeAssembly(
        baseId,
        movedId,
        { along: fromFaceX(face, bx), height: by },
        { along: fromFaceX(face, mx), height: my },
      );
  };

  const monter = () => {
    neuf();
    const a = useScanStore.getState().addFixture('prise', 'n')!;
    const b = useScanStore.getState().addFixture('prise', 'n')!;
    const face = faceDuMur();
    const axe = faceX(
      face,
      useScanStore.getState().fixtures.find((f) => f.id === a)!.along,
    );
    return { a, b, axe, face };
  };

  it('« 1re fixe » : la première ne bouge pas, la seconde se range à 71 mm', () => {
    const { a, b, axe, face } = monter();
    poser(a, b, axe, 'droite', false);
    const fx = useScanStore.getState().fixtures;
    const xa = faceX(face, fx.find((f) => f.id === a)!.along);
    const xb = faceX(face, fx.find((f) => f.id === b)!.along);
    expect(xa).toBeCloseTo(axe, 6);
    expect(xb - xa).toBeCloseTo(ENTRAXE, 6);
  });

  it('« Centré » : l’ensemble s’axe sur le premier percement', () => {
    const { a, b, axe, face } = monter();
    poser(a, b, axe, 'droite', true);
    const fx = useScanStore.getState().fixtures;
    const xa = faceX(face, fx.find((f) => f.id === a)!.along);
    const xb = faceX(face, fx.find((f) => f.id === b)!.along);
    // Symétriques autour de l'axe d'origine, toujours à l'entraxe.
    expect((xa + xb) / 2).toBeCloseTo(axe, 6);
    expect(xb - xa).toBeCloseTo(ENTRAXE, 6);
    expect(axe - xa).toBeCloseTo(ENTRAXE / 2, 6);
  });

  it('à gauche, c’est le même ensemble en miroir', () => {
    const { a, b, axe, face } = monter();
    poser(a, b, axe, 'gauche', false);
    const fx = useScanStore.getState().fixtures;
    const xa = faceX(face, fx.find((f) => f.id === a)!.along);
    const xb = faceX(face, fx.find((f) => f.id === b)!.along);
    expect(xa).toBeCloseTo(axe, 6);
    expect(xa - xb).toBeCloseTo(ENTRAXE, 6);
  });

  it('en hauteur : même abscisse, 71 mm d’écart vertical', () => {
    const { a, b, axe, face } = monter();
    poser(a, b, axe, 'haut', false);
    const fx = useScanStore.getState().fixtures;
    const fa = fx.find((f) => f.id === a)!;
    const fb = fx.find((f) => f.id === b)!;
    expect(faceX(face, fa.along)).toBeCloseTo(faceX(face, fb.along), 6);
    expect(fb.height - fa.height).toBeCloseTo(ENTRAXE, 6);
  });

  it('changer d’avis ne dérive pas : deux réglages de suite restent justes', () => {
    const { a, b, axe, face } = monter();
    poser(a, b, axe, 'droite', false);
    poser(a, b, axe, 'gauche', true);
    poser(a, b, axe, 'droite', true);
    const fx = useScanStore.getState().fixtures;
    const xa = faceX(face, fx.find((f) => f.id === a)!.along);
    const xb = faceX(face, fx.find((f) => f.id === b)!.along);
    expect((xa + xb) / 2).toBeCloseTo(axe, 6);
    expect(xb - xa).toBeCloseTo(ENTRAXE, 6);
  });

  it('« Séparer » sort l’appareil de l’ensemble et l’écarte', () => {
    const { a, b, axe, face } = monter();
    useScanStore.getState().splitFixture(b, fromFaceX(face, axe + 0.4));
    const fx = useScanStore.getState().fixtures;
    expect(fx.find((f) => f.id === b)!.group).toBeUndefined();
    const xb = faceX(face, fx.find((f) => f.id === b)!.along);
    expect(xb - axe).toBeCloseTo(0.4, 6);
    expect(
      overlaps(
        { x: axe, y: 0.2, kind: 'prise' },
        { x: xb, y: 0.2, kind: 'prise' },
      ),
    ).toBe(false);
    // La première garde sa place et son identité.
    expect(faceX(face, fx.find((f) => f.id === a)!.along)).toBeCloseTo(axe, 6);
  });

  it('le réglage s’annule d’un seul retour en arrière', () => {
    const { a, b, axe, face } = monter();
    const avant = useScanStore
      .getState()
      .fixtures.map((f) => faceX(face, f.along))
      .sort((x, y) => x - y);
    poser(a, b, axe, 'droite', true);
    expect(useScanStore.getState().canUndo).toBe(true);
    useScanStore.getState().undo();
    const apres = useScanStore
      .getState()
      .fixtures.map((f) => faceX(face, f.along))
      .sort((x, y) => x - y);
    expect(apres[0]).toBeCloseTo(avant[0], 6);
    expect(apres[1]).toBeCloseTo(avant[1], 6);
  });
});

describe('ce que le modèle 3D en montre', () => {
  it('une seule plaque de 153 mm, deux mécanismes de 45', () => {
    neuf();
    useScanStore.getState().addFixture('prise', 'n');
    useScanStore.getState().addFixture('prise', 'n');
    const st = useScanStore.getState();
    const scene = buildScene(st.walls, [], [], {
      palette: PAL,
      fixtures: st.fixtures,
    });
    const face = faceDuMur();
    const along = (p: { x: number; z: number }) =>
      (p.x - face.A.x) * face.ux + (p.z - face.A.z) * face.uz;
    const blanc = mixHex(PAL.object, '#FFFFFF', 0.72);

    const plaque = scene.faces.filter((f) => f.fill === blanc).flatMap((f) => f.pts);
    const xs = plaque.map(along);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(ENTRAXE + PLAQUE, 3);

    // Deux façades de mécanisme, à l'entraxe.
    const centres = scene.faces
      .filter(
        (f) =>
          f.fill === FIXTURES.prise.color &&
          !!f.normal &&
          f.normal.x * face.nx + f.normal.z * face.nz > 0.9,
      )
      .map((f) => f.pts.map(along))
      .map((v) => (Math.min(...v) + Math.max(...v)) / 2)
      .sort((a, b) => a - b);
    expect(centres).toHaveLength(2);
    expect(centres[1] - centres[0]).toBeCloseTo(ENTRAXE, 3);
  });
});

describe('un ensemble se déplace d’un bloc', () => {
  const face = faceDuMur();
  const cotes = () =>
    useScanStore
      .getState()
      .fixtures.map((f) => ({
        id: f.id,
        x: faceX(face, f.along),
        y: f.height,
      }))
      .sort((a, b) => a.x - b.x);

  const paire = () => {
    neuf();
    const a = useScanStore.getState().addFixture('prise', 'n')!;
    const b = useScanStore.getState().addFixture('prise', 'n')!;
    return { a, b };
  };

  it('déplacer un poste emporte l’autre, à l’entraxe', () => {
    const { a } = paire();
    const avant = cotes();
    const ecart = avant[1].x - avant[0].x;
    useScanStore.getState().moveFixture(a, fromFaceX(face, 2.5), 1.1);
    const apres = cotes();
    expect(apres[1].x - apres[0].x).toBeCloseTo(ecart, 6);
    expect(apres[0].y).toBeCloseTo(1.1, 6);
    expect(apres[1].y).toBeCloseTo(1.1, 6);
    // Et le poste saisi est bien allé où on le demandait.
    const saisi = useScanStore.getState().fixtures.find((f) => f.id === a)!;
    expect(faceX(face, saisi.along)).toBeCloseTo(2.5, 6);
  });

  it('poussé au bord, le BLOC s’arrête — pas le poste saisi tout seul', () => {
    const { a } = paire();
    useScanStore.getState().moveFixture(a, fromFaceX(face, 99), 1.1);
    const apres = cotes();
    const spec = FIXTURES.prise;
    // Le dernier poste touche le bord, et l'entraxe est intact.
    expect(apres[1].x + spec.w / 2).toBeCloseTo(face.len, 6);
    expect(apres[1].x - apres[0].x).toBeCloseTo(ENTRAXE, 6);
  });

  it('et dans l’autre sens, contre le coin de départ', () => {
    const { b } = paire();
    useScanStore.getState().moveFixture(b, fromFaceX(face, -5), 0.25);
    const apres = cotes();
    expect(apres[0].x - FIXTURES.prise.w / 2).toBeCloseTo(0, 6);
    expect(apres[1].x - apres[0].x).toBeCloseTo(ENTRAXE, 6);
  });

  it('en hauteur aussi, le bloc reste sous le plafond', () => {
    const { a } = paire();
    useScanStore.getState().moveFixture(a, fromFaceX(face, 2), 9);
    for (const f of useScanStore.getState().fixtures) {
      expect(f.height + FIXTURES[f.kind].h / 2).toBeLessThanOrEqual(2.5 + 1e-9);
    }
  });

  it('retirer un poste défait la plaque : le dernier redevient libre', () => {
    const { a } = paire();
    useScanStore.getState().removeFixture(a);
    const restant = useScanStore.getState().fixtures;
    expect(restant).toHaveLength(1);
    expect(restant[0].group).toBeUndefined();
  });

  it('à trois postes, en retirer un laisse un ensemble de deux', () => {
    neuf();
    const a = useScanStore.getState().addFixture('prise', 'n')!;
    useScanStore.getState().addFixture('prise', 'n');
    useScanStore.getState().addFixture('prise', 'n');
    useScanStore.getState().removeFixture(a);
    const restant = useScanStore.getState().fixtures;
    expect(restant).toHaveLength(2);
    expect(restant[0].group).toBeTruthy();
    expect(restant[1].group).toBe(restant[0].group);
  });

  it('un appareil seul se déplace toujours seul', () => {
    neuf();
    const a = useScanStore.getState().addFixture('prise', 'n')!;
    useScanStore.getState().moveFixture(a, fromFaceX(face, 1.4), 0.9);
    const f = useScanStore.getState().fixtures[0];
    expect(faceX(face, f.along)).toBeCloseTo(1.4, 6);
    expect(f.height).toBeCloseTo(0.9, 6);
  });
});

/**
 * Un ensemble se DESSINE comme un ensemble, pas comme deux appareils.
 *
 * Sur le mur, deux prises liées forment une plaque de 153 mm à deux
 * mécanismes — exactement une prise double du catalogue. Le plan dessinait
 * pourtant le symbole de chacune à sa propre place : deux socles distants de
 * 71 mm, soit deux pixels à l'échelle d'un logement. On n'en voyait qu'un, et
 * rien ne disait qu'ils étaient liés.
 */
describe('le symbole d’un ensemble', () => {
  it('porte autant de socles que l’ensemble a de postes', () => {
    const seul = postsSymbol(['prise']);
    const double = postsSymbol(['prise', 'prise']);
    const triple = postsSymbol(['prise', 'prise', 'prise']);
    expect(double.length).toBe(seul.length * 2);
    expect(triple.length).toBe(seul.length * 3);
  });

  it('deux prises liées donnent le MÊME tracé qu’une prise double', () => {
    const compose = postsSymbol(['prise', 'prise']);
    const catalogue = assemblySymbol('prise2');
    expect(compose.map((s) => s.d)).toEqual(catalogue.map((s) => s.d));
  });

  it('un ensemble mixte garde le symbole propre à chaque poste', () => {
    const mixte = postsSymbol(['prise', 'rj45']);
    const prise = postsSymbol(['prise']);
    const rj = postsSymbol(['rj45']);
    expect(mixte).toHaveLength(prise.length + rj.length);
    // Et il est CENTRÉ : les deux postes s'écartent de part et d'autre.
    const xs = mixte.map((s) => parseFloat(s.d.match(/-?\d+(\.\d+)?/)![0]));
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(0);
  });

  it('sans poste connu, on retombe sur le symbole de l’appareil', () => {
    expect(postsSymbol([], 'tableau')).toEqual(assemblySymbol('tableau'));
  });
});

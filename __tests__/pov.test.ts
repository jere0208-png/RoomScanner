/**
 * LA VUE DEPUIS L'INTÉRIEUR — l'œil à hauteur d'homme, dans la pièce.
 *
 * Relevé du chantier : « une animation de présentation plus poussée, comme
 * dans un jeu vidéo où on se trouve dans l'appartement en POV, et on tourne
 * autour en présentant chaque mur ». Le moteur ne savait faire qu'une chose :
 * une maquette vue de loin, sans fuyantes. On y ajoute une caméra posée DANS
 * le logement — et ce banc dit ce qu'elle doit garantir, parce qu'une
 * projection fausse ne se voit qu'une fois sur l'appareil.
 */
import {
  buildScene,
  coupeDevant,
  dosTourne,
  povProjector,
  visibleAvecLeMur,
  type P3,
  type PovCamera,
  type ScenePalette,
} from '../src/geometry/scene3d';
import type { Fixture } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';

const PAL: ScenePalette = {
  floor: '#EEEEEE', floorStroke: '#CCCCCC', wall: '#FFFFFF', wallStroke: '#888888',
  wallTop: '#F4F4F4', wallTopStroke: '#949494', opening: '#B9C2CE', door: '#E8A13B',
  window: '#3EB8E5', passage: '#2F6BFF', object: '#D8E1F2', objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz },
  height: 2.5, yCenter: 1.25, roomId: 'r1',
});
/** Une pièce de 4 × 3, l'œil en son centre à 1,60 m. */
const MURS = [
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 3),
  mur('s', 4, 3, 0, 3),
  mur('o', 0, 3, 0, 0),
];
const OEIL = { x: 2, y: 1.6, z: 1.5 };
const ECRAN = { w: 390, h: 700 };
const cam = (yaw: number, pitch = 0): PovCamera => ({
  at: OEIL, yaw, pitch, fov: 62,
});

describe('la caméra posée dans la pièce', () => {
  it('agrandit ce qui est proche — c’est toute la différence', () => {
    const p = povProjector(cam(0), ECRAN);
    // Deux points de même hauteur, l'un à deux mètres, l'autre à quatre.
    const pres = p({ x: 2.5, y: 1.6, z: 3.5 });
    const loin = p({ x: 2.5, y: 1.6, z: 5.5 });
    // Le proche s'écarte plus du centre : c'est la fuyante.
    expect(Math.abs(pres.sx - ECRAN.w / 2)).toBeGreaterThan(
      Math.abs(loin.sx - ECRAN.w / 2) * 1.5,
    );
    // Et il est devant : la profondeur croît vers l'œil, comme en plan.
    expect(pres.depth).toBeGreaterThan(loin.depth);
  });

  it('met l’horizon au milieu de l’écran, regard droit', () => {
    const p = povProjector(cam(0), ECRAN);
    const droit = p({ x: 2, y: 1.6, z: 10 });
    expect(droit.sy).toBeCloseTo(ECRAN.h / 2, 6);
    expect(droit.sx).toBeCloseTo(ECRAN.w / 2, 6);
  });

  it('coupe au ras de l’œil ce qui le traverse', () => {
    // Le sol : il passe sous nos pieds, donc derrière l'œil aussi.
    const sol: P3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
      { x: 4, y: 0, z: 3 },
      { x: 0, y: 0, z: 3 },
    ];
    const c = cam(0);
    const taille = coupeDevant(sol, c);
    expect(taille.length).toBeGreaterThanOrEqual(3);
    const p = povProjector(c, ECRAN);
    // Plus un seul sommet derrière l'œil : sinon le polygone se retourne et
    // barre l'écran.
    for (const q of taille) expect(p(q).devant).toBeGreaterThan(0.049);
  });

  it('ne garde que les faces qui nous font face', () => {
    const { faces } = buildScene(MURS, [], [], {
      palette: PAL,
      showSurfaces: true,
      rooms: [{ id: 'r1' }],
    });
    // Depuis le centre, on doit voir les quatre murs — leur face intérieure —
    // et jamais leur dos.
    const vues = faces.filter((f) => !dosTourne(f, OEIL) && f.fill !== null);
    expect(vues.length).toBeGreaterThan(4);
    for (const f of vues) {
      if (!f.normal) continue;
      const c = f.pts.reduce(
        (a, q) => ({ x: a.x + q.x / f.pts.length, y: a.y + q.y / f.pts.length, z: a.z + q.z / f.pts.length }),
        { x: 0, y: 0, z: 0 },
      );
      const vers =
        (c.x - OEIL.x) * f.normal.x +
        (c.y - OEIL.y) * f.normal.y +
        (c.z - OEIL.z) * f.normal.z;
      expect(vers).toBeLessThan(0);
    }
  });

  it('montre un mur différent à chaque quart de tour', () => {
    const { faces } = buildScene(MURS, [], [], {
      palette: PAL,
      showSurfaces: true,
      rooms: [{ id: 'r1' }],
    });
    /** Les murs dont un pan tombe au centre de l'écran. */
    const devantSoi = (yaw: number) => {
      const c = cam(yaw);
      const p = povProjector(c, ECRAN);
      const vus = new Set<string>();
      for (const f of faces) {
        if (f.fill === null || dosTourne(f, OEIL)) continue;
        const q = coupeDevant(f.pts, c).map(p);
        if (q.length < 3) continue;
        const cx = q.reduce((a, r) => a + r.sx, 0) / q.length;
        const cy = q.reduce((a, r) => a + r.sy, 0) / q.length;
        // Une bande centrale : un mur de 2,50 m vu à un mètre cinquante
        // déborde largement du milieu de l'écran, et son milieu à lui tombe
        // sous l'horizon — l'œil est à 1,60 m, le mur est centré à 1,25 m.
        if (Math.abs(cx - ECRAN.w / 2) < 70 && Math.abs(cy - ECRAN.h / 2) < 220) {
          vus.add(`${Math.round(f.pts[0].x)},${Math.round(f.pts[0].z)}`);
        }
      }
      return vus;
    };
    const nord = devantSoi(0);
    const est = devantSoi(Math.PI / 2);
    expect(nord.size).toBeGreaterThan(0);
    expect(est.size).toBeGreaterThan(0);
    // Ce qu'on voit droit devant change avec le regard : sans quoi le tour
    // d'horizon ne montrerait rien.
    expect([...nord].some((k) => !est.has(k))).toBe(true);
  });
});

/**
 * UN MUR À LA FOIS — ce que la visite guidée montre quand elle en présente un.
 *
 * On annonce « Mur nord · Chambre » : les trois autres murs sont dans le
 * champ, celui de gauche et celui de droite fuient vers l'œil et prennent la
 * moitié de l'image. Le client ne sait plus lequel on lui désigne.
 *
 * Deux choses à tenir, et ce banc les sépare : chaque face doit SAVOIR de
 * quel mur elle vient — sans quoi il n'y a rien à filtrer —, et le filtre ne
 * doit emporter QUE de la maçonnerie.
 */
describe('le mur présenté', () => {
  /** Deux prises : une sur le mur nord, une sur le mur est. */
  const PRISES: Fixture[] = [
    { id: 'f-nord', kind: 'prise', wallId: 'n', along: 1.2, height: 0.3, side: 1 },
    { id: 'f-est', kind: 'prise', wallId: 'e', along: 1.4, height: 0.3, side: 1 },
  ];
  const scene = () =>
    buildScene(MURS, [], [], {
      palette: PAL,
      showSurfaces: true,
      rooms: [{ id: 'r1' }],
      fixtures: PRISES,
    });

  it('marque chaque face de la maçonnerie du mur dont elle vient', () => {
    const { faces } = scene();
    // Les quatre murs sont représentés, chacun par ses propres faces.
    const parMur = new Map<string, number>();
    for (const f of faces) {
      if (!f.wallId) continue;
      parMur.set(f.wallId, (parMur.get(f.wallId) ?? 0) + 1);
    }
    expect([...parMur.keys()].sort()).toEqual(['e', 'n', 'o', 's']);
    for (const n of parMur.values()) expect(n).toBeGreaterThan(3);
    // Le sol, lui, n'appartient à aucun mur : il reste quand on en isole un.
    expect(faces.some((f) => f.isFloor && !f.wallId)).toBe(true);
  });

  it('emmène l’appareillage avec le mur qui le porte', () => {
    const { faces } = scene();
    // Une prise est un volume plaqué sur la face : plusieurs faces, toutes
    // rattachées au mur, sinon elle resterait en l'air.
    const ailleurs = faces.filter(
      (f) => !visibleAvecLeMur(f, 'n') && f.wallId === 'e',
    );
    expect(ailleurs.length).toBeGreaterThan(0);
    // Et rien de la prise du mur nord ne part avec le mur est.
    const gardees = faces.filter((f) => visibleAvecLeMur(f, 'n'));
    expect(gardees.some((f) => f.wallId === 'n')).toBe(true);
    expect(gardees.every((f) => f.wallId !== 'e')).toBe(true);
  });

  it('ne retire que de la maçonnerie — le sol et le reste demeurent', () => {
    const { faces } = scene();
    const partis = faces.filter((f) => !visibleAvecLeMur(f, 'n'));
    expect(partis.length).toBeGreaterThan(0);
    // Tout ce qui s'en va appartient à un mur, et jamais au mur présenté.
    for (const f of partis) {
      expect(f.wallId).toBeTruthy();
      expect(f.wallId).not.toBe('n');
      expect(f.isFloor).toBeFalsy();
    }
    // Sans mur désigné, la scène est intacte.
    expect(faces.every((f) => visibleAvecLeMur(f, null))).toBe(true);
  });
});

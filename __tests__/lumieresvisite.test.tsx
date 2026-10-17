/**
 * LES LUMINAIRES DE LA VISITE — ils se voient, ils ne s'allument plus.
 *
 * Relevé du patron : « le système de lumière est mal fait et nuit au
 * développement de l'app. Supprime la possibilité d'éclairer la pièce en
 * appuyant sur le bouton lors de la visite ». Plus d'interrupteur sous le
 * doigt, plus de lumière envoyée au natif (voir `visitesanslampes.test.tsx`).
 *
 * Il reste ce que le maillage des meubles lit : les lampes de la scène, et le
 * diffuseur de chacune dans SON groupe, marqué de son rang — c'est ce qui le
 * distingue, côté natif, des diffuseurs de la maquette, et le garde éteint.
 */
import { GENRE, lampesDeLaScene, rangsDesLampes } from '../src/geometry/lumieres';
import { groupesDesAppareils } from '../src/geometry/appareils3d';
import { maillageDesMeubles } from '../src/geometry/modeles3d';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { wallFace, type Fixture } from '../src/geometry/electrical';
import type { CeilingFixture } from '../src/geometry/ceiling';
import { detectRooms, mergeColinear, splitAtJunctions, weldCorners, type WallSeg } from '../src/geometry/floorplan';

const PAL: ScenePalette = {
  floor: '#EEEEEE', floorStroke: '#CCCCCC', wall: '#FFFFFF', wallStroke: '#888888', wallTop: '#F4F4F4',
  wallTopStroke: '#949494', opening: '#B9C2CE', door: '#E8A13B', window: '#3EB8E5', passage: '#2F6BFF',
  object: '#D8E1F2', objectTop: '#E9EEF9', objectStroke: '#9FACBF',
};
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25,
});
const MURS = mergeColinear(
  splitAtJunctions(weldCorners([mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('w', 0, 3, 0, 0)])),
).map((w) => ({ ...w, roomId: 'room-1' }));
const ROOMS = detectRooms(MURS).map((r, i) => ({ id: `room-${i + 1}`, name: 'Séjour', wallIds: r.wallIds }));
const murDuNord = MURS.find((w) => Math.abs(w.a.z) < 1e-6 && Math.abs(w.b.z) < 1e-6)!;
const coteInterieur = (w: WallSeg): 1 | -1 => {
  const f = wallFace(w, undefined, 1);
  const mx = (w.a.x + w.b.x) / 2 + f.nx * 0.5;
  const mz = (w.a.z + w.b.z) / 2 + f.nz * 0.5;
  return mx > 0 && mx < 4 && mz > 0 && mz < 3 ? 1 : -1;
};

const fix = (id: string, kind: Fixture['kind'], w: WallSeg, along: number, height: number, o: Partial<Fixture> = {}): Fixture => ({
  id, kind, wallId: w.id, along, height, side: coteInterieur(w), ...o,
});

describe('les lampes de la scène, et leur diffuseur', () => {
  const fixtures = [fix('ap', 'applique', murDuNord, 1, 1.9), fix('i', 'inter', murDuNord, 3, 1.1)];
  const ceiling: CeilingFixture[] = [
    { id: 's', kind: 'spot', roomId: 'room-1', at: { x: 1, z: 1.5 } },
    { id: 'd', kind: 'dcl', roomId: 'room-1', at: { x: 2, z: 1.5 } },
    { id: 'f', kind: 'daaf', roomId: 'room-1', at: { x: 3, z: 1.5 } },
  ];
  const scene = buildScene(MURS, [], [], { palette: PAL, rooms: ROOMS as never, showSurfaces: true, fixtures, ceiling });
  const lampes = lampesDeLaScene(scene.appareils ?? []);

  it('une applique, un spot, une ampoule — un détecteur de fumée n’éclaire pas', () => {
    const genres = new Map(lampes.map((l) => [l.id, l.genre]));
    expect(genres.get('ap')).toBe(GENRE.appliqueMurale);
    expect(genres.get('cl-s')).toBe(GENRE.spot);
    expect(genres.get('cl-d')).toBe(GENRE.ampoule);
    expect(genres.has('cl-f')).toBe(false);
  });

  it('chaque lampe a son diffuseur à elle, qui porte son rang (le natif le garde éteint)', () => {
    const flux = maillageDesMeubles([], groupesDesAppareils(scene.appareils ?? [], rangsDesLampes(lampes)));
    const codes: number[] = [];
    let k = 0;
    while (k < flux.length) {
      codes.push(flux[k]);
      k += 8 + flux[k + 6] * 8 + flux[k + 7];
    }
    const diffuseurs = codes.filter((c) => c >= 100).sort((a, b) => a - b);
    expect(diffuseurs).toEqual(lampes.map((l) => 5 + 100 * (l.index + 1)).sort((a, b) => a - b));
    // Sans rangs (la maquette), tous les diffuseurs restent allumés, réunis.
    const brut = maillageDesMeubles([], groupesDesAppareils(scene.appareils ?? []));
    let j = 0;
    while (j < brut.length) {
      expect(brut[j]).toBeLessThan(100);
      j += 8 + brut[j + 6] * 8 + brut[j + 7];
    }
  });
});

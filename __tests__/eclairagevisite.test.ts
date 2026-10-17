/**
 * LA LUMIÈRE DE LA VISITE ET DE LA MAQUETTE — relevés du patron :
 *   — « les murs intérieurs lors de la visite et 3D sont de base trop gris ;
 *     donne-leur un ton plus beige » ;
 *   — « les éléments élec sont trop sous faible luminosité sans lumière, ils
 *     sont trop gris ; ajoute-leur un peu de lumière même sans lumière de
 *     pièce » ;
 *   — « la lumière plafond éclaire encore beaucoup trop les meubles et
 *     éléments élec ; elle doit être perceptible sur les murs mais très peu
 *     sur les meubles et éléments : max 10 % de leur couleur de base ».
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CODE_APPAREIL, maillageDesMeubles, type GroupeLocal } from '../src/geometry/modeles3d';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { MAQUETTE } from '../src/ui/maquette';
import type { WallSeg } from '../src/geometry/floorplan';

const swift = readFileSync(
  join(__dirname, '../modules/react-native-room-scan/ios/RoomScanVisite.swift'),
  'utf8',
);

describe('les murs côté pièce sont beiges', () => {
  it('la palette a son beige, plus chaud que le blanc cassé de la façade', () => {
    expect(MAQUETTE.wallInside).toBeDefined();
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [r, , b] = rgb(MAQUETTE.wallInside!);
    // Beige : le rouge passe nettement le bleu.
    expect(r - b).toBeGreaterThan(20);
  });

  it('la face côté pièce prend le beige, la façade garde son blanc cassé', () => {
    const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
      id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25,
    });
    const walls = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];
    const pal: ScenePalette = { ...MAQUETTE, wallInside: '#ABCDEF', wall: '#123456' };
    const { faces } = buildScene(walls, [], [], {
      palette: pal,
      colorOpenings: false,
      showSurfaces: false,
      rooms: [{ id: 'r', name: 'Pièce', wallIds: ['n', 'e', 's', 'o'] }],
    } as never);
    const teintes = new Set(faces.map((f) => (f.fill ?? '').toUpperCase()));
    // Les faces ombrées dérivent leur teinte : on cherche la famille.
    const proche = (cible: string) =>
      [...teintes].some((t) => t.length === 7 && Math.abs(parseInt(t.slice(1, 3), 16) - parseInt(cible.slice(1, 3), 16)) < 40 &&
        Math.abs(parseInt(t.slice(5, 7), 16) - parseInt(cible.slice(5, 7), 16)) < 40);
    expect(proche('#ABCDEF')).toBe(true);
    expect(proche('#123456')).toBe(true);
  });
});

describe('l’appareillage se voit sans lampe', () => {
  const plaque: GroupeLocal = { mat: 'laque', couleur: '#F4F4F2', v: [0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1], i: [0, 1, 2] };

  it('il part sous son code, à part des meubles de même matière', () => {
    const flux = maillageDesMeubles([], [plaque]);
    expect(flux[0]).toBe(CODE_APPAREIL);
  });

  it('le natif lui donne une part de sa teinte en émission, sans le faire briller', () => {
    const bloc = swift.slice(swift.indexOf('case 7:'));
    const e = Number((bloc.match(/m\.emission\.intensity = ([\d.]+)/) ?? [])[1]);
    expect(e).toBeGreaterThan(0);
    expect(e).toBeLessThanOrEqual(0.3);
  });
});

describe('la lampe du plafond, sur les meubles et l’appareillage : au plus 10 %', () => {
  const nombre = (re: RegExp, src = swift) => Number((src.match(re) ?? [])[1]);

  it('la lueur des meubles reste sous le dixième de l’ambiance', () => {
    const lueur = nombre(/l\.intensity = (\d+)/, swift.slice(swift.indexOf('private func lueurDesMeubles')));
    const ambiance = nombre(/ambiante\.intensity = (\d+)/);
    expect(lueur).toBeLessThanOrEqual(ambiance * 0.1);
  });

  it('allumer ne touche ni à l’ambiance, ni au jour', () => {
    const bloc = swift.slice(swift.indexOf('private func appliquerLampes'), swift.indexOf('private func reglerLeJour'));
    expect(bloc).not.toMatch(/ambiante\.|jour\.|contre\./);
  });

  it('les faisceaux ne touchent que le bâti, meubles et appareils portent l’autre masque', () => {
    expect(swift).toMatch(/l\.categoryBitMask = Self\.MASQUE_PIECE/);
    expect(swift).toMatch(/m\.categoryBitMask = Self\.MASQUE_MEUBLE/);
  });
});

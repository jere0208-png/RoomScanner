/**
 * LE DÉCOR DANS LES PERSPECTIVES DU DOSSIER.
 *
 * Correctif de l'audit « dans la peau d'un utilisateur » : on peignait le
 * séjour en terracotta dans « Décorer », on posait un parquet de chêne, on
 * soulignait un mur en anthracite — et le dossier PDF montrait des murs
 * blancs. Les perspectives sont bâties par la même scène que la 3D de
 * l'app ; elles reçoivent désormais le même décor.
 */
import * as scene3d from '../src/geometry/scene3d';
import { buildScanPdf } from '../src/export/pdf';
import { detectRooms, type WallSeg } from '../src/geometry/floorplan';
import { peinturesDesPieces } from '../src/ui/habillage';
import { hexDePeinture } from '../src/ui/peintures';

let n = 0;
const mur = (ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id: `m${n++}`,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});

const walls = [mur(0, 0, 5, 0), mur(5, 0, 5, 4), mur(5, 4, 0, 4), mur(0, 4, 0, 0)];
const [forme] = detectRooms(walls);
const sejour = {
  id: 'sejour',
  wallIds: forme.wallIds,
  peinture: 'terracotta',
  sol: 'chene',
  accents: { [walls[0].id]: 'anthracite' },
};

describe('le décor dans les perspectives', () => {
  it('la scène du dossier reçoit la peinture, le sol et le mur d’accent', () => {
    const espion = jest.spyOn(scene3d, 'buildScene');
    buildScanPdf({ name: 'Séjour peint', walls, openings: [], objects: [], rooms: [sejour] as never }, true, { metre: false });
    const appels = espion.mock.calls;
    espion.mockRestore();
    expect(appels.length).toBeGreaterThan(0);
    const opts = appels[appels.length - 1][3];
    expect(opts.peintures).toEqual({ sejour: hexDePeinture('terracotta') });
    expect(opts.sols?.sejour?.motif).toBe('parquet');
    expect(opts.accents).toEqual({ sejour: { [walls[0].id]: hexDePeinture('anthracite') } });
  });

  it('une pièce sans décor garde les murs du dessin', () => {
    expect(peinturesDesPieces([{ id: 'a' }, { id: 'b', peinture: 'inconnue' }])).toEqual({});
    expect(peinturesDesPieces([{ id: 'a', peinture: 'sauge' }])).toEqual({ a: hexDePeinture('sauge') });
  });
});

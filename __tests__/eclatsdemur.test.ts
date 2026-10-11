/**
 * LES ÉCLATS DE MUR — la pièce qui ne se fermait pas.
 *
 * Relevé du patron, diagnostic à l'appui : « une pièce n'est pas fermée et
 * ne veut pas se fermer ; quand j'essaye de la fermer, une forme de
 * triangle coupe tout l'appartement ». Le dossier envoyé disait tout : neuf
 * murs qui font une boucle parfaite, et DEUX « murs » de 0 cm posés sur un
 * même coin. Un mur de moins de quinze centimètres dont les deux bouts sont
 * soudés au même coin (`weldCorners`) devient un point. Ce coin portait six
 * bouts de mur au lieu de deux : aucune boucle ne passait, et le parcours
 * des pièces traçait n'importe quoi.
 *
 * Les murs du banc sont ceux du dossier, au millimètre.
 */
import { closedLoop, roomParts, sansEclats, type WallSeg } from '../src/geometry/floorplan';
import { diagnostiquerPlan } from '../src/geometry/diagnosticPlan';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.49,
  yCenter: 0,
});

const MURS: WallSeg[] = [
  mur('7EDB', 4.632, 0.489, -0.655, 0.578),
  mur('9947', -0.655, 0.578, -0.712, -2.77),
  mur('C3B5', -0.712, -2.77, 2.166, -2.818),
  mur('EA28', 4.958, -1.335, 4.979, -0.115),
  mur('5005', 4.051, -1.32, 4.958, -1.335),
  mur('DC0D', 3.17, -1.282, 3.17, -1.282),
  mur('7524', 4.622, -0.109, 4.632, 0.489),
  mur('4A76', 4.051, -1.32, 3.17, -1.282),
  mur('FEEA', 4.979, -0.115, 4.622, -0.109),
  mur('7332', 3.17, -1.282, 3.17, -1.282),
  mur('6BF3', 2.166, -2.818, 3.17, -1.282),
];

describe('un éclat de 0 cm sur un coin', () => {
  it('ne casse plus la boucle : les neuf vrais murs ferment la pièce', () => {
    expect(closedLoop(MURS)).not.toBeNull();
    const [part] = roomParts(MURS, [{ id: 'room-1' }]);
    expect(part.surface?.exact).toBe(true);
    expect(part.surface!.area).toBeGreaterThan(15);
  });

  it('les éclats s’en vont du plan, et des listes de murs des pièces', () => {
    const { walls, rooms } = sansEclats(MURS, [{ id: 'room-1', wallIds: MURS.map((w) => w.id) }]);
    expect(walls.map((w) => w.id)).not.toContain('DC0D');
    expect(walls.map((w) => w.id)).not.toContain('7332');
    expect(walls).toHaveLength(9);
    expect(rooms[0].wallIds).toHaveLength(9);
  });

  it('un vrai petit mur, lui, reste', () => {
    const { walls } = sansEclats([mur('court', 0, 0, 0.06, 0)], []);
    expect(walls).toHaveLength(1);
  });

  it('le diagnostic le nomme, s’il en reste', () => {
    const avecEclatOuvert = [...MURS.filter((w) => w.id !== '6BF3'), mur('6BF3', 2.166, -2.818, 3.1, -1.35)];
    const d = diagnostiquerPlan({ walls: avecEclatOuvert, openings: [], rooms: [{ id: 'room-1', name: 'Séjour' }], objects: [] });
    expect(d.pieces[0].raisons.join(' ')).toMatch(/0 cm/);
  });

  it('la fin du scan et l’ouverture d’un plan les retirent', () => {
    const store = readFileSync(join(__dirname, '..', 'src/store/scanStore.ts'), 'utf8');
    expect(store.match(/sansEclats\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});

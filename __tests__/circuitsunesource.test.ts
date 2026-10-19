/**
 * LE MÉTRÉ ARRIVE SUR SON CIRCUIT — revue « chantier » : la liste du
 * matériel et le tracé des câbles numérotaient leurs circuits chacun à sa
 * façon. Une prise de terrasse posée sur la face extérieure d'un mur de la
 * cuisine était rangée « en cuisine » d'un côté (la pièce de son mur), « hors
 * pièce » de l'autre : les numéros se décalaient, et le câble de l'éclairage
 * se retrouvait sur la ligne de la prise de terrasse.
 */
import type { WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';
import type { CeilingFixture } from '../src/geometry/ceiling';
import { placerAuxNiveaux } from '../src/geometry/devisplan';
import { planRoutes } from '../src/geometry/elecplan';
import { fixturePlacement, materialList, wallToRooms } from '../src/geometry/nfc15100';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});
const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];
const PIECES = [{ id: 'r1', name: 'Cuisine', wallIds: ['n', 'e', 's', 'o'] }];

it('la ligne de l’éclairage porte l’interrupteur et le point, pas la prise de terrasse', () => {
  const app = (id: string, kind: Fixture['kind'], wallId: string, along: number, height: number, side: 1 | -1): Fixture => ({
    id, kind, wallId, along, height, side,
  });
  // Le côté intérieur de chaque mur : celui que `fixturePlacement` place dans la cuisine.
  const { entrees } = placerAuxNiveaux(MURS, PIECES, []);
  const dedans = (wallId: string): 1 | -1 =>
    fixturePlacement([app('t', 'prise', wallId, 1, 0.3, 1)], MURS, entrees).size > 0 ? 1 : -1;
  const fixtures: Fixture[] = [
    app('tab', 'tableau', 'o', 1.5, 1.4, dedans('o')),
    app('p1', 'prise', 'e', 1, 0.3, dedans('e')),
    app('p2', 'prise', 'e', 2, 0.3, dedans('e')),
    app('p3', 'prise', 's', 2, 0.3, dedans('s')),
    app('i1', 'inter', 's', 0.5, 1.1, dedans('s')),
    // La prise de terrasse : sur la face EXTÉRIEURE du mur nord.
    app('pext', 'prise', 'n', 2, 0.3, dedans('n') === 1 ? -1 : 1),
  ];
  const ceiling: CeilingFixture[] = [{ id: 'dcl', kind: 'dcl', roomId: 'r1', at: { x: 2, z: 1.5 }, commands: ['i1'] }];
  const pl = placerAuxNiveaux(MURS, PIECES, fixtures);
  expect(pl.placement.has('pext')).toBe(false);
  const chemins = planRoutes(MURS, PIECES.map((r) => ({ ...r })), pl.parts, fixtures, pl.placement, ceiling, [])!;
  const liste = materialList(pl.entrees, fixtures, wallToRooms(pl.entrees), pl.placement, chemins.parCircuit, ceiling);
  for (const c of liste.circuits) {
    const troncons = (chemins.metre.get(c.id)?.troncons ?? []).map((t) => t.id).sort();
    if (c.nature === 'eclairage') expect(troncons).toEqual(['dcl', 'i1']);
    // Chaque ligne porte les appareils de SON circuit, et eux seuls.
    for (const id of troncons) expect([...c.fixtureIds, ...(c.ceilingIds ?? [])]).toContain(id);
  }
});

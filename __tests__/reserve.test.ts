/**
 * Un métré approché doit le DIRE.
 *
 * La surface d'une pièce mal refermée porte déjà son « ≈ » : le contour a
 * été reconstitué, on ne garantit pas le mètre carré. Mais la gaine longe ce
 * même contour, et sa longueur partait au devis sans la moindre réserve —
 * un chiffre net, d'apparence mesurée, tiré d'un tracé supposé.
 *
 * C'est l'erreur la plus chère de toutes celles que l'app peut commettre :
 * une surface fausse se rattrape au chantier, un métré de câble faux se
 * commande, se livre et se paie.
 */
import {
  roomParts,
  segLength,
  type WallSeg,
} from '../src/geometry/floorplan';
import { planRoutes } from '../src/geometry/elecplan';
import { pullSchedule } from '../src/geometry/conduits';
import {
  fixturePlacement,
  materialList,
  roomInputsOf,
  wallToRooms,
} from '../src/geometry/nfc15100';
import type { Fixture } from '../src/geometry/electrical';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** Le séjour refermé : quatre murs, boucle complète. */
const FERME: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];

/** Le même, un mur en moins : le scan s'est arrêté avant de boucler. */
const OUVERT: WallSeg[] = FERME.slice(0, 3);

const FX = (walls: WallSeg[]): Fixture[] => [
  { id: 't', kind: 'tableau', wallId: walls[0].id, along: 0.6, height: 1.35, side: 1 },
  { id: 'a', kind: 'prise', wallId: walls[1].id, along: 1.5, height: 0.25, side: 1 },
  { id: 'b', kind: 'prise', wallId: walls[2].id, along: 2, height: 0.25, side: 1 },
];

function plan(walls: WallSeg[]) {
  const rooms = [{ id: 'r1', name: 'Séjour', wallIds: walls.map((w) => w.id) }];
  const parts = roomParts(walls, rooms);
  const inputs = roomInputsOf(rooms, parts);
  const fixtures = FX(walls);
  const placement = fixturePlacement(fixtures, walls, inputs);
  const routes = planRoutes(walls, rooms, parts, fixtures, placement)!;
  const list = materialList(inputs, fixtures, wallToRooms(inputs), placement);
  return { routes, list, parts };
}

describe('le contour reconstitué', () => {
  it('la pièce ouverte est bien signalée comme approchée — le socle du test', () => {
    expect(plan(FERME).parts[0].surface!.exact).toBe(true);
    expect(plan(OUVERT).parts[0].surface!.exact).toBe(false);
    // Le mur manquant fait bien 5 m : la pièce n'est pas dégénérée.
    expect(segLength(FERME[2])).toBeCloseTo(5, 6);
  });

  it('un relevé complet ne porte aucune réserve', () => {
    const { routes } = plan(FERME);
    expect(routes.exact).toBe(true);
    expect(routes.approx.size).toBe(0);
  });

  it('un relevé ouvert marque TOUS ses circuits', () => {
    const { routes } = plan(OUVERT);
    expect(routes.exact).toBe(false);
    expect(routes.approx.size).toBeGreaterThan(0);
    // Et le métré existe quand même : on ne prive pas d'une estimation,
    // on l'accompagne de sa réserve.
    for (const id of routes.approx) {
      expect(routes.metre.get(id)!.cable).toBeGreaterThan(0);
    }
  });
});

describe('la feuille de tirage', () => {
  it('reporte la réserve ligne par ligne', () => {
    const { routes, list } = plan(OUVERT);
    const rows = pullSchedule(list.circuits, routes.metre, routes.approx);
    const tires = rows.filter((r) => r.conduitLength > 0);
    expect(tires.length).toBeGreaterThan(0);
    for (const r of tires) expect(r.approx).toBe(true);
  });

  it('et n’en invente pas quand le relevé est complet', () => {
    const { routes, list } = plan(FERME);
    const rows = pullSchedule(list.circuits, routes.metre, routes.approx);
    expect(rows.every((r) => !r.approx)).toBe(true);
  });

  it('sans réserve transmise, la feuille reste muette plutôt que fausse', () => {
    const { routes, list } = plan(OUVERT);
    const rows = pullSchedule(list.circuits, routes.metre);
    expect(rows.every((r) => !r.approx)).toBe(true);
  });
});

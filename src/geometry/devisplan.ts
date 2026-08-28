/**
 * LE DEVIS D'UN LOGEMENT — un seul chemin, deux endroits qui le lisent.
 *
 * La pastille du plan affiche le total, la page du devis affiche le détail :
 * ce sont deux lectures d'un même calcul, et il ne peut pas y en avoir deux.
 * Le jour où l'une recompterait de son côté, le bouton annoncerait un prix
 * que la page ne retrouverait pas — et c'est exactement le genre d'écart que
 * personne ne remarque avant le client.
 *
 * Rien n'est recompté ici non plus : `buyingList` lit le tracé réel du plan,
 * `planCircuits` déduit les protections, `chiffrer` ne fait qu'y poser un
 * prix. Cette fonction ne fait que les enchaîner, dans l'ordre de l'export.
 */
import { buyingList, pullSchedule } from './conduits';
import { chiffrer, type AjustementsDevis, type Devis } from './devis';
import { planRoutes } from './elecplan';
import { roomParts, type WallSeg } from './floorplan';
import {
  fixturePlacement,
  materialList,
  roomInputsOf,
  wallToRooms,
  type RoomInput,
} from './nfc15100';
import type { CeilingFixture } from './ceiling';
import type { Fixture } from './electrical';
import type { GammeId } from './prix';
import type { RoomShape } from './floorplan';

/** Une pièce, telle que le store la garde. */
type Piece = RoomShape & { name?: string };

export function chiffrerLePlan(
  walls: WallSeg[],
  rooms: Piece[],
  fixtures: Fixture[],
  ceiling: CeilingFixture[],
  gamme: GammeId,
  /** Les articles écartés à la main : voir `chiffrer`. */
  ecartes?: ReadonlySet<string>,
  /** Les menuiseries : elles coupent les pans, donc les pontages. */
  openings: WallSeg[] = [],
  /** Ce que l'électricien corrige ou ajoute à la main : voir `chiffrer`. */
  ajustements?: AjustementsDevis,
): Devis {
  const parts = roomParts(walls, rooms);
  const nommees = rooms.map((r) => ({ ...r, name: r.name ?? '' }));
  const entrees: RoomInput[] = roomInputsOf(nommees, parts);
  const placement = fixturePlacement(fixtures, walls, entrees);
  // Sans tableau posé, `planRoutes` s'abstient — et le bordereau estime
  // alors au forfait, en le disant (voir `buyingList`).
  const chemins = planRoutes(
    walls,
    nommees,
    parts,
    fixtures,
    placement,
    ceiling,
    openings,
  );
  const liste = materialList(
    entrees,
    fixtures,
    wallToRooms(entrees),
    placement,
    chemins?.parCircuit,
    ceiling,
  );
  const pull = pullSchedule(
    liste.circuits,
    chemins?.metre,
    chemins?.approx,
    fixtures,
  );
  return chiffrer(
    buyingList(pull, fixtures, ceiling),
    liste.circuits,
    liste.differentials,
    gamme,
    ecartes,
    ajustements,
  );
}

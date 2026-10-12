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
import { filtrerAuNiveau, niveauxPresents, roomParts, type RoomPart, type WallSeg } from './floorplan';
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
type Piece = RoomShape & { name?: string; niveau?: number };

/**
 * CHAQUE APPAREIL DANS SA PIÈCE, SUR SON NIVEAU — revue « Mehdi ». Le devis
 * d'une maison R+1 posait l'appareillage sur les contours des deux niveaux
 * superposés : 25 appareils de l'étage rangés dans les pièces du
 * rez-de-chaussée, « Chambre 2 : 0 socle sur 3 », et un total de
 * 2 861,10 € quand les deux niveaux, chacun chez lui, en faisaient
 * 3 207,04. Les pièces se découpent et l'appareillage se place niveau par
 * niveau, comme pour le tableau (`circuitsDuLogement`) ; le reste du calcul
 * voit la maison entière.
 */
export function placerAuxNiveaux(
  walls: WallSeg[],
  rooms: Piece[],
  fixtures: Fixture[],
): { parts: RoomPart[]; entrees: RoomInput[]; placement: Map<string, string> } {
  const niveaux = niveauxPresents(walls, rooms);
  if (niveaux.length <= 1) {
    const parts = roomParts(walls, rooms);
    const entrees = roomInputsOf(
      rooms.map((r) => ({ ...r, name: r.name ?? '' })),
      parts,
    );
    return { parts, entrees, placement: fixturePlacement(fixtures, walls, entrees) };
  }
  const parts: RoomPart[] = [];
  const entrees: RoomInput[] = [];
  const placement = new Map<string, string>();
  for (const n of niveaux) {
    const x = filtrerAuNiveau(
      { walls, openings: [] as WallSeg[], rooms, fixtures, photos: [], objects: [], ceiling: [] },
      n,
    );
    const p = roomParts(x.walls, x.rooms);
    const e = roomInputsOf(
      x.rooms.map((r) => ({ ...r, name: r.name ?? '' })),
      p,
    );
    parts.push(...p);
    entrees.push(...e);
    for (const [k, v] of fixturePlacement(x.fixtures, x.walls, e)) placement.set(k, v);
  }
  return { parts, entrees, placement };
}

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
  const nommees = rooms.map((r) => ({ ...r, name: r.name ?? '' }));
  const { parts, entrees, placement } = placerAuxNiveaux(walls, rooms, fixtures);
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
    buyingList(pull, fixtures, ceiling, openings),
    liste.circuits,
    liste.differentials,
    gamme,
    ecartes,
    ajustements,
    // Le tableau ne se compte que si son GESTE a été fait : un TGBT posé.
    fixtures.some((f) => f.kind === 'tableau'),
  );
}

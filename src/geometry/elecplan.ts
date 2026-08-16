/**
 * Le plan des gaines, tel qu'il sort du relevé.
 *
 * Une seule fonction, appelée par l'écran de résultat comme par l'export :
 * les longueurs portées au devis et les tracés dessinés sur le plan doivent
 * venir de la MÊME source, sinon le document dit une chose et l'écran une
 * autre.
 */
import {
  faceX,
  facePoint,
  wallFace,
  type Fixture,
} from './electrical';
import { wallQuadsOf, type Pt, type RoomPart, type WallSeg } from './floorplan';
import { planCircuits, roomUse } from './nfc15100';
import type { RoomKind } from './furniture';
import {
  HAUTEUR_GAINE,
  cableRuns,
  circuitLength,
  projectOnRing,
} from './routing';
import type { CeilingFixture } from './ceiling';

export interface ElecPlan {
  /** Métré total par circuit, en mètres de câble, arrondi. */
  parCircuit: Map<string, number>;
  /** Détail par circuit : gaine, câble, nombre de départs. */
  metre: Map<string, { conduit: number; cable: number; runs: number }>;
  /**
   * Le métré repose-t-il sur des contours SÛRS ?
   *
   * La gaine longe le contour de la pièce desservie. Quand la pièce n'a pas
   * été relevée en boucle fermée, ce contour est reconstitué : la surface
   * l'annonce déjà par un « ≈ », la longueur de câble le taisait. Un métré
   * qu'on croit exact part au devis tel quel — et c'est le genre d'erreur
   * qui se paie au mètre de câble, pas au centimètre carré.
   */
  exact: boolean;
  /** Les circuits dont le tracé longe un contour reconstitué. */
  approx: Set<string>;
  /** Tracés au sol, un par appareil desservi. */
  traces: { id: string; path: Pt[] }[];
}

/**
 * Sans tableau posé, on ne sait pas d'où part le câble : on ne devine pas,
 * on s'abstient, et le devis garde son estimation forfaitaire.
 */
export function planRoutes(
  walls: WallSeg[],
  rooms: { id: string; name: string; kind?: RoomKind | null }[],
  parts: RoomPart[],
  fixtures: Fixture[],
  placement: Map<string, string>,
  /** Les appareils de plafond : eux aussi demandent du fil. */
  ceiling: CeilingFixture[] = [],
): ElecPlan | null {
  const tableau = fixtures.find((f) => f.kind === 'tableau');
  if (!tableau) return null;
  const quads = wallQuadsOf(walls);
  const murs = new Map(walls.map((w) => [w.id, w]));
  const posDe = (f: Fixture) => {
    const w = murs.get(f.wallId);
    if (!w) return null;
    const fa = wallFace(w, quads.get(w.id), f.side);
    const p = facePoint(fa, faceX(fa, f.along), 0.02);
    return { at: { x: p.x, z: p.z }, height: f.height };
  };
  const depart = posDe(tableau);
  if (!depart) return null;

  const pieceDe = (f: Fixture) => rooms.find((r) => r.id === placement.get(f.id));
  const circuits = planCircuits(
    fixtures,
    (f) => pieceDe(f)?.name ?? '',
    (f) => roomUse(pieceDe(f)?.name ?? '', pieceDe(f)?.kind) === 'cuisine',
    (f) => pieceDe(f)?.id,
    ceiling,
  );
  const plafondParId = new Map(ceiling.map((c) => [c.id, c]));
  /** Hauteur sous plafond de la pièce, pour la montée du fil. */
  const hauteurDe = (roomId: string) =>
    (parts.find((p) => p.roomId === roomId)?.walls ?? walls).reduce(
      (h, w) => Math.max(h, w.height),
      0,
    ) || 2.5;

  const parCircuit = new Map<string, number>();
  const metre = new Map<
    string,
    { conduit: number; cable: number; runs: number }
  >();
  const traces: { id: string; path: Pt[] }[] = [];
  const approx = new Set<string>();

  for (const c of circuits) {
    const runs = c.fixtureIds.flatMap((id) => {
      const f = fixtures.find((x) => x.id === id);
      if (!f || f.id === tableau.id) return [];
      const pos = posDe(f);
      if (!pos) return [];
      // La gaine longe le contour de la pièce DESSERVIE ; à défaut, celui
      // de la première pièce du plan — mieux vaut un tracé approché qu'une
      // ligne droite à travers les cloisons.
      const piece = parts.find((p) => p.roomId === placement.get(f.id));
      const surface = piece?.surface ?? parts[0]?.surface;
      const ring = surface?.pts ?? [];
      if (ring.length < 3) return [];
      // Contour reconstitué, ou pièce introuvable et contour emprunté à une
      // autre : dans les deux cas le tracé est approché, et on le dit.
      if (!surface?.exact || !piece) approx.add(c.id);
      return cableRuns(ring, depart.at, depart.height, [
        { id: f.id, at: pos.at, height: pos.height },
      ]);
    });
    /**
     * LE FIL MONTE AU PLAFOND.
     *
     * Un point lumineux n'est pas sur un mur : la gaine longe le contour
     * comme pour un appareil mural, puis MONTE le long du mur le plus
     * proche du point, et traverse le plafond jusqu'à lui. Sans ces deux
     * derniers segments, un circuit de six spots ne comptait que le tour
     * de la pièce — et le métré sous-estimait tous les éclairages.
     */
    for (const id of c.ceilingIds ?? []) {
      const cl = plafondParId.get(id);
      if (!cl) continue;
      const piece = parts.find((p) => p.roomId === cl.roomId);
      const ring = piece?.surface?.pts ?? parts[0]?.surface?.pts ?? [];
      if (ring.length < 3) continue;
      if (!piece?.surface?.exact || !piece) approx.add(c.id);
      // Le point du contour le plus proche : c'est par là que le fil monte.
      const pied = projectOnRing(ring, cl.at).at;
      const [run] = cableRuns(ring, depart.at, depart.height, [
        { id: cl.id, at: pied, height: HAUTEUR_GAINE },
      ]);
      if (!run) continue;
      const montee = hauteurDe(cl.roomId) - HAUTEUR_GAINE;
      const traversee = Math.hypot(cl.at.x - pied.x, cl.at.z - pied.z);
      runs.push({
        ...run,
        // Le parcours physique gagne la montée et la traversée ; le câble
        // aussi, avec son mou déjà compté par `cableRuns`.
        conduit: run.conduit + montee + traversee,
        length: run.length + montee + traversee,
        path: [...run.path, cl.at],
      });
    }
    if (runs.length === 0) continue;
    parCircuit.set(c.id, circuitLength(runs));
    metre.set(c.id, {
      conduit: runs.reduce((t, r) => t + r.conduit, 0),
      cable: runs.reduce((t, r) => t + r.length, 0),
      runs: runs.length,
    });
    for (const r of runs) traces.push({ id: r.fixtureId, path: r.path });
  }
  return { parCircuit, metre, traces, exact: approx.size === 0, approx };
}

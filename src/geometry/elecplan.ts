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
import {
  segLength,
  wallQuadsOf,
  wallRuns,
  type Pt,
  type RoomPart,
  type WallSeg,
} from './floorplan';
import { planCircuits, roomUse, type Circuit } from './nfc15100';
import { COMMANDES, LUMIERES } from './schema';
import type { RoomKind } from './furniture';
import {
  HAUTEUR_GAINE,
  MOU,
  cableRuns,
  circuitLength,
  projectOnRing,
} from './routing';
import type { CeilingFixture } from './ceiling';

/**
 * UN DÉPART DU TABLEAU VERS UN APPAREIL — et ce que cet appareil est.
 *
 * Le rôle n'est pas décoratif : il dit quels CONDUCTEURS passent dans ce
 * tronçon-là. Relevé du patron : « je veux que tout soit compté comme si on
 * ramenait toutes les gaines de tous les éléments au tableau ; donc le retour
 * lampe fait tableau/interrupteur et tableau/point lumineux, pareil pour les
 * navettes, on les passe via le tableau ». C'est un câblage en ÉTOILE, et
 * dans une étoile un retour de lampe ne court pas « tout le circuit » : il
 * court sur le départ de la commande et sur celui du point qu'elle allume.
 */
export interface TronconMetre {
  /** L'appareil desservi. */
  id: string;
  /** Mètres de gaine. */
  conduit: number;
  /** Mètres de câble, mou compris. */
  cable: number;
  /** Ce que ce départ dessert : une commande, un point lumineux, ou le reste. */
  role: 'commande' | 'lumiere' | 'autre';
}

export interface ElecPlan {
  /** Métré total par circuit, en mètres de câble, arrondi. */
  parCircuit: Map<string, number>;
  /**
   * Détail par circuit : gaine, câble, nombre de départs — et le DÉTAIL des
   * départs, un par un.
   *
   * Relevé du patron : « si une gaine est achetée, elle est utile pas pour un
   * seul trajet mais peut servir sur les 100 m… sauf si longueur plus longue
   * que le restant de gaine, on ne rallonge pas les gaines ». Le total ne
   * suffit donc pas à savoir combien de couronnes commander : il faut la
   * longueur de CHAQUE tronçon, parce qu'aucun ne se raboute (voir
   * `couronnes` dans `conduits.ts`).
   */
  metre: Map<
    string,
    {
      conduit: number;
      cable: number;
      runs: number;
      troncons: TronconMetre[];
    }
  >;
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
  /**
   * LES MENUISERIES, POUR LE PONTAGE DES PRISES.
   *
   * Une porte coupe le pan : deux socles de part et d'autre ne se pontent
   * pas, la gaine ne traverse pas une menuiserie. Sans cette liste, on ne
   * voit pas les trous et l'on ponterait à travers — d'où ce paramètre,
   * plutôt qu'un pan deviné.
   */
  openings: WallSeg[] = [],
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
    {
      conduit: number;
      cable: number;
      runs: number;
      troncons: TronconMetre[];
    }
  >();
  const traces: { id: string; path: Pt[] }[] = [];
  const approx = new Set<string>();

  /*
    LE PONTAGE DES PRISES — la seule exception à l'étoile.

    Relevé du patron : « si elles sont voisines, même pan de mur, et que ça
    rentre dans la norme en terme de quantité, pièce etc : on fait des
    pontages de prise à prise. C'est le seul élément qu'on ponte au mur (la
    gaine va de prise en prise du coup si c'est valide). »

    C'est ce que fait tout le monde, et c'est ce que la norme permet : elle
    borne le nombre de socles par circuit, pas la façon de les alimenter. Un
    interrupteur, lui, ne se ponte pas — son retour de lampe lui est propre —
    et un socle spécialisé encore moins, puisqu'il a son circuit à lui.

    QUATRE CONDITIONS, et elles sont toutes nécessaires :
      — c'est un socle 16 A (`prise`), rien d'autre ;
      — même circuit : la norme compte les socles par circuit, et deux
        circuits qui se pontent, c'est un pont entre deux disjoncteurs ;
      — même pan de mur et même face : on ne ponte pas à travers une porte,
        et pas non plus d'un côté d'une cloison à l'autre ;
      — la prise ne l'a pas refusé (`sansPontage`).

    LA TÊTE DE CHAÎNE EST LA PLUS PROCHE DU TABLEAU, et non la première par
    ordre d'abscisse : c'est elle qu'on alimente, et les autres se prennent
    de proche en proche en s'éloignant. Prendre la première venue allongeait
    le départ de toute la longueur du pan.
  */
  const murParId = new Map(walls.map((w) => [w.id, w]));
  const chaines = (c: Circuit): Map<string, string[]> => {
    const groupes = new Map<string, Fixture[]>();
    for (const id of c.fixtureIds) {
      const f = fixtures.find((x) => x.id === id);
      if (!f || f.kind !== 'prise' || f.sansPontage) continue;
      const w = murParId.get(f.wallId);
      if (!w) continue;
      // Le pan : le tronçon plein qui porte la prise. Une porte entre deux
      // socles les sépare — la gaine ne traverse pas une menuiserie.
      const L = segLength(w) || 1;
      const t = f.along / L;
      const pan = wallRuns(w, openings).findIndex(
        (r) => r.kind === 'mur' && t >= r.t0 - 1e-6 && t <= r.t1 + 1e-6,
      );
      const cle = `${f.wallId}|${f.side}|${pan}`;
      const l = groupes.get(cle);
      if (l) l.push(f);
      else groupes.set(cle, [f]);
    }
    /** Pour chaque prise pontée, celle dont elle se nourrit. */
    const amont = new Map<string, string[]>();
    for (const lot of groupes.values()) {
      if (lot.length < 2) continue;
      const tri = [...lot].sort((a, b) => a.along - b.along);
      // La tête : celle dont le départ depuis le tableau est le plus court.
      let tete = 0;
      let court = Infinity;
      tri.forEach((f, i) => {
        const pos = posDe(f);
        if (!pos) return;
        const d = Math.hypot(pos.at.x - depart.at.x, pos.at.z - depart.at.z);
        if (d < court) {
          court = d;
          tete = i;
        }
      });
      // On s'éloigne de la tête dans les deux sens : c'est le tirage réel.
      for (let i = tete + 1; i < tri.length; i++) {
        amont.set(tri[i].id, [tri[i - 1].id]);
      }
      for (let i = tete - 1; i >= 0; i--) {
        amont.set(tri[i].id, [tri[i + 1].id]);
      }
    }
    return amont;
  };

  for (const c of circuits) {
    const pontees = chaines(c);
    const runs = c.fixtureIds.flatMap((id) => {
      const f = fixtures.find((x) => x.id === id);
      if (!f || f.id === tableau.id) return [];
      const pos = posDe(f);
      if (!pos) return [];
      /*
        UNE PRISE PONTÉE NE PART PAS DU TABLEAU : elle part de sa voisine.
        Le tronçon vaut l'écart le long du mur, plus le mou d'about — et
        c'est le seul endroit de l'application où une gaine ne remonte pas
        au tableau.
      */
      const source = pontees.get(f.id)?.[0];
      if (source) {
        const voisine = fixtures.find((x) => x.id === source);
        const w = murParId.get(f.wallId);
        if (voisine && w) {
          const ecart = Math.abs(voisine.along - f.along);
          const de = posDe(voisine);
          if (de) {
            return [
              {
                fixtureId: f.id,
                path: [de.at, pos.at],
                conduit: ecart,
                length: ecart + MOU,
              },
            ];
          }
        }
      }
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
    /*
      UNE LIGNE DE SPOTS EST UN PONTAGE — comme une rangée de prises.

      Relevé du patron : « pour les choses logiques de pontage, comme la ligne
      de spots qu'on met, c'est des spots pontés entre eux ». C'est exact, et
      c'est le seul autre endroit où la gaine ne remonte pas au tableau : six
      spots alignés au plafond se tirent de proche en proche, on ne redescend
      pas six fois.

      La ligne existait déjà dans le modèle (`CeilingFixture.row`) — on la
      pose, on la déplace, on la retourne d'un bloc. Elle ne servait qu'à
      l'écran ; elle sert maintenant au métré.

      LA TÊTE EST LE SPOT LE PLUS PROCHE DU TABLEAU, pour la même raison que
      chez les prises : c'est lui qu'on alimente, et les autres se prennent en
      s'éloignant.
    */
    const ligneDe = new Map<string, string>();
    const parLigne = new Map<string, CeilingFixture[]>();
    for (const id of c.ceilingIds ?? []) {
      const cl = plafondParId.get(id);
      if (!cl?.row) continue;
      const l = parLigne.get(cl.row);
      if (l) l.push(cl);
      else parLigne.set(cl.row, [cl]);
    }
    for (const lot of parLigne.values()) {
      if (lot.length < 2) continue;
      // On enfile les spots du plus proche au plus lointain : la gaine suit
      // la ligne, elle ne fait pas d'aller-retour.
      const tri = [...lot].sort(
        (a, b) =>
          Math.hypot(a.at.x - depart.at.x, a.at.z - depart.at.z) -
          Math.hypot(b.at.x - depart.at.x, b.at.z - depart.at.z),
      );
      for (let i = 1; i < tri.length; i++) ligneDe.set(tri[i].id, tri[i - 1].id);
    }

    for (const id of c.ceilingIds ?? []) {
      const cl = plafondParId.get(id);
      if (!cl) continue;
      /*
        UN SPOT PONTÉ PART DE SON VOISIN, au plafond, en ligne droite : ils
        sont sur le même plan et rien ne s'interpose. C'est le tirage réel
        d'une ligne de spots.
      */
      const amont = ligneDe.get(cl.id);
      if (amont) {
        const de = plafondParId.get(amont);
        if (de) {
          const saut = Math.hypot(cl.at.x - de.at.x, cl.at.z - de.at.z);
          runs.push({
            fixtureId: cl.id,
            path: [de.at, cl.at],
            conduit: saut,
            length: saut + MOU,
          });
          continue;
        }
      }
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
      /*
        UN TRONÇON = UN DÉPART DU TABLEAU VERS UN APPAREIL.

        C'est l'unité qu'on ne peut pas couper en deux couronnes, et c'est
        aussi celle qui décide des conducteurs : un départ vers une commande
        ne porte pas les mêmes fils qu'un départ vers une prise. Le plafond
        est toujours un point lumineux ; au mur, c'est le type de l'appareil
        qui tranche.
      */
      troncons: runs.map((r) => {
        const mural = fixtures.find((x) => x.id === r.fixtureId);
        const role: TronconMetre['role'] = !mural
          ? 'lumiere'
          : COMMANDES.includes(mural.kind)
          ? 'commande'
          : LUMIERES.includes(mural.kind)
          ? 'lumiere'
          : 'autre';
        return { id: r.fixtureId, conduit: r.conduit, cable: r.length, role };
      }),
    });
    for (const r of runs) traces.push({ id: r.fixtureId, path: r.path });
  }
  return { parCircuit, metre, traces, exact: approx.size === 0, approx };
}

/**
 * L'ÉLEC POSÉE PENDANT LE SCAN — du point visé à l'appareil du plan.
 *
 * Relevé du chantier : « pendant un scan, permet d'ajouter manuellement des
 * PC, inter, point lumineux. Le scan crée aussi un plafond, où l'on peut
 * placer aussi les points lumineux plafond. Ça permettrait lors d'un devis
 * de quantifier les éléments et leur placement — on mémorise l'emplacement
 * avec un viseur au centre. »
 *
 * C'est le bon moment pour le faire : on est DEVANT le mur, on voit la
 * boîte existante, on sait où passera la nouvelle. Viser au centre de
 * l'écran vaut mieux que replacer de mémoire, une heure plus tard, sur un
 * plan.
 *
 * Le natif ne rend que des ANCRES : un point du monde et le type visé —
 * c'est tout ce qu'un raycast sait dire. Tout le métier est ici : rattacher
 * chaque ancre à son mur ou au plafond de sa pièce, et en faire ce que le
 * plan sait déjà dessiner, compter et facturer.
 */
import { FIXTURES, faceX, interiorSide, wallFace } from './electrical';
import type { Fixture, FixtureKind } from './electrical';
import { pointInPolygon } from './appearance';
import { segLength, wallQuads, type Pt, type WallSeg } from './floorplan';
import type { CeilingFixture, CeilingKind } from './ceiling';

/**
 * Ce que le viseur mémorise.
 *
 * D'ABORD LE MUR VISÉ, quand le natif a su le nommer : un identifiant ne se
 * déplace pas. Relevé du chantier : « ça a bien pris en compte mais rien ne
 * s'affiche sur le plan 2D ensuite » — les ancres n'étaient que des points
 * du monde ARKit, or le modèle livré passe par `RoomBuilder`, et par
 * `StructureBuilder` dès qu'il y a plusieurs passages : ces
 * post-traitements RECALENT la géométrie dans leur propre repère. Les
 * points, restés dans l'ancien, tombaient à des mètres de tout mur, et se
 * faisaient jeter — silencieusement.
 *
 * Le point du monde reste en secours : si le mur a été redécoupé par la
 * fusion, son identifiant ne répond plus, et la position reprend la main.
 */
export interface AncreElec {
  /** Type d'appareil visé — mural (`prise`, `inter`…) ou de plafond. */
  kind: string;
  /** Identifiant de la surface visée, tel que RoomPlan l'a donné. */
  wallId?: string;
  /** Cote relevée sur ce mur, depuis son extrémité `a` (m). */
  along?: number;
  /** Hauteur relevée au-dessus du sol de ce mur (m). */
  height?: number;
  x: number;
  y: number;
  z: number;
}

/**
 * À quelle distance d'un mur une ancre lui appartient encore.
 *
 * Un raycast tombe sur la surface vue par la caméra, qui est le NU du mur —
 * mais le mur du modèle est un axe, à une demi-épaisseur de là, et la main
 * ne vise pas au centimètre. Trente-cinq centimètres laissent la place à
 * tout cela sans jamais attraper le mur d'en face : le plus étroit des
 * couloirs fait quatre-vingts.
 */
const PORTEE_MUR = 0.35;

/**
 * Sous le plafond, on ne pose plus sur un mur.
 *
 * Un point lumineux visé au plafond tombe au milieu de la pièce, loin de
 * tout mur — mais une applique visée haut, elle, reste contre son mur. La
 * hauteur seule ne suffit donc pas : c'est la CONJONCTION d'une hauteur et
 * d'un éloignement des murs qui fait un point de plafond.
 */
const SOUS_PLAFOND = 0.35;

/** Les appareils qui vivent au plafond, et non sur un mur. */
const AU_PLAFOND: CeilingKind[] = [
  'dcl',
  'spot',
  'daaf',
  'vmc',
  'ventilateur',
  'camera',
  'detecteur',
];

const estDuPlafond = (kind: string): kind is CeilingKind =>
  (AU_PLAFOND as string[]).includes(kind);

/**
 * Rattache les points visés au plan : appareils muraux d'un côté, points
 * de plafond de l'autre.
 *
 * Ce qui ne tombe ni sur un mur ni dans une pièce est JETÉ. On vise en
 * marchant, la caméra passe par des fenêtres et des couloirs ; poser au
 * hasard ce qu'on n'a pas su rattacher salirait le plan et le métré, et
 * l'électricien ne saurait pas d'où sort la prise en trop.
 */
export function ancrerElec(
  ancres: AncreElec[],
  walls: WallSeg[],
  rooms: { id: string; outline?: Pt[] }[],
  /** Fabrique un identifiant : le magasin a le sien. */
  id: (prefixe: string, n: number) => string = (p, n) =>
    `${p}-vis-${n}-${Math.random().toString(36).slice(2, 6)}`,
): { fixtures: Fixture[]; ceiling: CeilingFixture[] } {
  const quads = wallQuads(walls);
  const fixtures: Fixture[] = [];
  const ceiling: CeilingFixture[] = [];
  /** La pièce qui contient ce point au sol. */
  const pieceDe = (p: Pt) =>
    rooms.find((r) => (r.outline?.length ?? 0) >= 3 && pointInPolygon(p, r.outline!));

  ancres.forEach((a, n) => {
    /*
      LE MUR NOMMÉ D'ABORD. Le natif l'a identifié au moment de la pose,
      dans le repère où il travaillait : c'est la seule information qu'un
      recalage du modèle ne peut pas fausser.
    */
    const nomme = a.wallId ? walls.find((w) => w.id === a.wallId) : undefined;
    if (nomme && a.along !== undefined && a.height !== undefined) {
      const l = segLength(nomme) || 1;
      const side = interiorSide(nomme, walls, rooms as never);
      const kind = a.kind as FixtureKind;
      if (FIXTURES[kind]) {
        fixtures.push({
          id: id(a.kind, n),
          kind,
          wallId: nomme.id,
          // Bornées au mur : un relevé de travers ne sort pas du pan.
          along: Math.max(0.02, Math.min(l - 0.02, a.along)),
          height: Math.max(0.05, Math.min(nomme.height - 0.05, a.height)),
          side,
        });
        return;
      }
    }

    const sol = { x: a.x, z: a.z };
    /*
      LE MUR LE PLUS PROCHE, et sa distance — mesurée à l'AXE, comme le
      modèle. On ne retient que ceux dont la projection tombe DANS le
      segment : sinon un mur lointain, mais bien orienté, attraperait un
      point posé au-delà de son extrémité.
    */
    let best: { w: WallSeg; dist: number; along: number } | null = null;
    for (const w of walls) {
      if (w.type !== 'wall') continue;
      const l = segLength(w) || 1;
      const u = { x: (w.b.x - w.a.x) / l, z: (w.b.z - w.a.z) / l };
      const t = (sol.x - w.a.x) * u.x + (sol.z - w.a.z) * u.z;
      if (t < -0.05 || t > l + 0.05) continue;
      const proj = { x: w.a.x + u.x * t, z: w.a.z + u.z * t };
      const dist = Math.hypot(sol.x - proj.x, sol.z - proj.z);
      if (!best || dist < best.dist) {
        best = { w, dist, along: Math.max(0, Math.min(l, t)) };
      }
    }

    const piece = pieceDe(sol);
    const hauteurPiece = best?.w.height ?? walls[0]?.height ?? 2.5;
    const enHaut = a.y >= hauteurPiece - SOUS_PLAFOND;
    const loinDesMurs = !best || best.dist > PORTEE_MUR;

    /*
      AU PLAFOND : soit l'appareil n'y va que là (un détecteur de fumée),
      soit on l'a visé haut ET loin des murs — c'est alors le plafond qu'on
      regardait, pas la cloison.
    */
    if (estDuPlafond(a.kind) && (loinDesMurs || enHaut) && piece) {
      ceiling.push({
        id: id(a.kind, n),
        kind: a.kind,
        roomId: piece.id,
        at: { x: a.x, z: a.z },
      });
      return;
    }

    if (!best || best.dist > PORTEE_MUR) return;
    const kind = a.kind as FixtureKind;
    if (!FIXTURES[kind]) return;
    /*
      LA FACE QUI REGARDE LA PIÈCE. Le raycast donne un point, pas un côté :
      on prend la face intérieure du mur, celle que l'électricien voit — et
      pour un refend, celle de la pièce où l'on se tient.
    */
    const side = interiorSide(best.w, walls, rooms as never);
    const face = wallFace(best.w, quads.get(best.w.id), side);
    // L'abscisse de la face, et non celle de l'axe : c'est dans ce repère
    // que l'établi et les cotes travaillent.
    const surFace = faceX(face, best.along);
    fixtures.push({
      id: id(a.kind, n),
      kind,
      wallId: best.w.id,
      along: best.along,
      // La hauteur relevée, bornée au mur : un raycast qui traverse une
      // baie peut revenir au-dessus du linteau.
      height: Math.max(0.05, Math.min(best.w.height - 0.05, a.y)),
      side,
    });
    // `surFace` ne sert qu'à vérifier que la pose tient sur la face ; un
    // point visé au ras d'un angle se recale sur le premier centimètre.
    if (surFace < 0 || surFace > face.len) {
      fixtures[fixtures.length - 1].along = Math.max(
        0.02,
        Math.min(segLength(best.w) - 0.02, best.along),
      );
    }
  });

  return { fixtures, ceiling };
}

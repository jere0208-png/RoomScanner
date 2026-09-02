/**
 * OÙ ATTERRIT UN MEUBLE QU'ON LÂCHE — le glisser-poser du catalogue.
 *
 * Cinquième des dix améliorations. Poser un meuble se faisait en trois
 * temps : toucher une tuile, répondre à « dans quelle pièce ? », puis
 * rattraper au doigt le meuble atterri au centre. Le geste des applications
 * de plan, c'est l'autre : on TIRE la tuile sur le plan et on la lâche où
 * elle va. La pièce se déduit du point, plus personne ne la demande.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TOUT LE POIDS DU GESTE EST DANS L'ATTERRISSAGE, et c'est pour ça qu'il
 * vit ici, à part du rendu : un lâcher, ça vise mal. Le doigt cache la
 * cible, il tombe sur un mur, à trois centimètres d'un coin, ou franchement
 * à côté du plan. Quatre situations, quatre réponses — et aucune ne doit
 * être « le meuble se pose à cheval sur la cloison », parce que celui-là,
 * on ne le voit qu'au devis, trois jours plus tard.
 */
import {
  WALL_T,
  roomExtent,
  fitsInRoom,
  type Pt,
} from './floorplan';

/** Le cadre du plan à l'écran, en coordonnées de page. */
export interface CadreEcran {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Une pièce, telle que l'atterrissage a besoin de la connaître. */
export interface SalleCible {
  roomId: string;
  /** Contour au sol. */
  pts: Pt[];
  /** Le point de repli : le centre de la pièce, là où le catalogue posait. */
  centre: Pt;
}

/**
 * CE QU'ON ACCEPTE DE RATTRAPER AUTOUR D'UNE PIÈCE (mètres).
 *
 * Un contour n'est pas une frontière franche pour un doigt : le mur fait
 * quatorze centimètres, et on lâche volontiers DESSUS en visant le long
 * d'un mur. Refuser là n'a aucun sens à l'usage — mais accepter à un mètre
 * fabriquerait des meubles posés dans le vide, à rattraper. Trente
 * centimètres : deux épaisseurs de mur, la largeur d'un pouce sur le plan.
 */
export const TOLERANCE_LACHER = 0.3;

/** Le verdict d'un lâcher. */
export type Lacher =
  | {
      pose: true;
      roomId: string;
      /** Le point de pose, emprise rentrée dans la pièce. */
      at: Pt;
      /** Vrai si le meuble n'est pas exactement là où le doigt l'a laissé. */
      rectifie: boolean;
    }
  | { pose: false; raison: 'hors-piece' }
  | { pose: false; raison: 'trop-grand'; roomId: string };

const fini = (n: number) => Number.isFinite(n);

/**
 * Un point de PAGE ramené dans le cadre du plan. `null` s'il tombe dehors.
 *
 * Le catalogue s'efface pendant le geste, mais l'en-tête et la barre
 * d'outils restent : lâcher dessus n'est pas lâcher sur le plan.
 */
export function dansLeCadre(
  page: { x: number; y: number },
  cadre: CadreEcran,
): { x: number; y: number } | null {
  if (!fini(page.x) || !fini(page.y)) return null;
  if (!fini(cadre.x) || !fini(cadre.y) || cadre.w <= 0 || cadre.h <= 0) {
    return null;
  }
  const x = page.x - cadre.x;
  const y = page.y - cadre.y;
  if (x < 0 || y < 0 || x > cadre.w || y > cadre.h) return null;
  return { x, y };
}

/** Point dans un polygone (lancer de rayon). */
function dedans(p: Pt, ring: Pt[]): boolean {
  let oui = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
    ) {
      oui = !oui;
    }
  }
  return oui;
}

/** Distance d'un point au contour d'une pièce (0 s'il est dessus). */
function distanceAuContour(p: Pt, ring: Pt[]): number {
  let d = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j];
    const b = ring[i];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const l2 = vx * vx + vz * vz;
    const t =
      l2 <= 1e-12
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2),
          );
    d = Math.min(d, Math.hypot(p.x - (a.x + t * vx), p.z - (a.z + t * vz)));
  }
  return d;
}

/**
 * La pièce visée par un point : celle qui le CONTIENT, sinon la plus proche
 * à portée de tolérance. Jamais « la plus grande » : le doigt a désigné.
 */
function salleVisee(p: Pt, salles: SalleCible[]): SalleCible | null {
  for (const s of salles) {
    if (s.pts.length >= 3 && dedans(p, s.pts)) return s;
  }
  let proche: SalleCible | null = null;
  let mieux = TOLERANCE_LACHER;
  for (const s of salles) {
    if (s.pts.length < 3) continue;
    const d = distanceAuContour(p, s.pts);
    if (d <= mieux) {
      mieux = d;
      proche = s;
    }
  }
  return proche;
}

/**
 * ATTERRIT UN MEUBLE AU POINT LÂCHÉ.
 *
 * L'emprise se recale dans le rectangle hors-tout de la pièce, murs
 * déduits : c'est le geste juste dans un logement, dont les pièces SONT des
 * rectangles, et il garde le meuble collé au coin qu'on visait au lieu de
 * le renvoyer au centre.
 *
 * Une pièce en L, elle, a un rectangle hors-tout plus grand qu'elle : le
 * recalage peut y laisser un coin du meuble dehors. On vérifie donc les
 * quatre coins, et à défaut on retombe sur le centre de la pièce —
 * exactement où le catalogue posait hier. Un repli connu vaut mieux qu'un
 * meuble à cheval sur une cloison.
 */
export function lacherUnMeuble(
  boite: { width: number; depth: number },
  monde: Pt,
  salles: SalleCible[],
): Lacher {
  if (
    !fini(monde.x) ||
    !fini(monde.z) ||
    !fini(boite.width) ||
    !fini(boite.depth)
  ) {
    // La leçon de la maison : une garde qui nomme ce qu'elle REFUSE laisse
    // passer les NaN. Un meuble à NaN mètres disparaît du plan.
    return { pose: false, raison: 'hors-piece' };
  }

  const salle = salleVisee(monde, salles);
  if (!salle) return { pose: false, raison: 'hors-piece' };

  if (!fitsInRoom({ width: boite.width, depth: boite.depth }, salle.pts)) {
    return { pose: false, raison: 'trop-grand', roomId: salle.roomId };
  }

  // Rectangle hors-tout dans les axes du monde, réduit de l'épaisseur des
  // murs : le meuble se pose contre la face intérieure, pas dans le doublage.
  const xs = salle.pts.map((p) => p.x);
  const zs = salle.pts.map((p) => p.z);
  const marge = WALL_T / 2;
  const x0 = Math.min(...xs) + marge + boite.width / 2;
  const x1 = Math.max(...xs) - marge - boite.width / 2;
  const z0 = Math.min(...zs) + marge + boite.depth / 2;
  const z1 = Math.max(...zs) - marge - boite.depth / 2;

  // Une pièce moins large que le meuble sur un axe : on centre sur cet axe
  // plutôt que de croiser les bornes.
  const at: Pt = {
    x: x0 > x1 ? (x0 + x1) / 2 : Math.min(x1, Math.max(x0, monde.x)),
    z: z0 > z1 ? (z0 + z1) / 2 : Math.min(z1, Math.max(z0, monde.z)),
  };

  const coins: Pt[] = [
    { x: at.x - boite.width / 2, z: at.z - boite.depth / 2 },
    { x: at.x + boite.width / 2, z: at.z - boite.depth / 2 },
    { x: at.x + boite.width / 2, z: at.z + boite.depth / 2 },
    { x: at.x - boite.width / 2, z: at.z + boite.depth / 2 },
  ];
  const tientVraiment = coins.every(
    (c) => dedans(c, salle.pts) || distanceAuContour(c, salle.pts) <= marge,
  );
  if (!tientVraiment) {
    return {
      pose: true,
      roomId: salle.roomId,
      at: salle.centre,
      rectifie: true,
    };
  }

  const bouge =
    Math.abs(at.x - monde.x) > 1e-6 || Math.abs(at.z - monde.z) > 1e-6;
  return { pose: true, roomId: salle.roomId, at, rectifie: bouge };
}

/**
 * L'ANGLE DE POSE, déduit de la pièce.
 *
 * Un meuble lâché dans une pièce scannée de biais doit se poser DANS LES
 * AXES DE LA PIÈCE, pas dans ceux de l'écran : un lit posé à sept degrés
 * du mur, c'est ce qu'on remarque en premier sur une maquette, et ça se
 * rattrape à la poignée de rotation, un quart de tour à la fois.
 */
export function angleDePose(pts: Pt[]): number {
  if (pts.length < 3) return 0;
  const { angle } = roomExtent(pts);
  return angle;
}

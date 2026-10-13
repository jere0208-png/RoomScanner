/**
 * LES TRAVAUX — ce qu'il faut acheter, tiré du relevé.
 *
 * Relevé du patron : « améliore l'app considérablement toujours avec l'idée
 * de plaire à tout le monde qui souhaite scanner son appartement sans y
 * connaître en élec ». Devant le plan de son salon, un particulier ne se
 * demande pas si la NF C 15-100 est respectée ; il se demande combien de
 * pots de peinture prendre, combien de paquets de parquet, combien de
 * plinthes. Le relevé le sait : les surfaces, les hauteurs, les portes et
 * les fenêtres. Il suffit de faire les comptes — et de dire sur quelles
 * hypothèses on les fait.
 *
 * PAR PIÈCE :
 *   sol       la surface au sol, celle du contour ;
 *   plafond   la même ;
 *   murs      le tour × la hauteur, MOINS les baies (portes, fenêtres,
 *             passages) : on ne peint pas une fenêtre ;
 *   plinthes  le tour, MOINS la largeur des portes et des passages : on ne
 *             pose pas de plinthe en travers d'un seuil.
 *
 * Une porte entre deux pièces se retire des DEUX côtés : chacun peint sa
 * face de la cloison, et chacun la perd sur la largeur de la porte.
 */
import type { Pt, RoomPart, WallSeg } from './floorplan';
import { hauteurDeLaPiece } from './floorplan';

/** Les hypothèses du calcul — dites à l'écran, sous les chiffres. */
export interface HypothesesTravaux {
  /** Couches de peinture. */
  couches: number;
  /** Rendement d'une peinture murale, en m² par litre et par couche. */
  rendement: number;
  /** Contenance d'un pot, en litres. */
  pot: number;
  /** Chute à prévoir sur un revêtement de sol (0,10 = 10 %). */
  chute: number;
  /** Surface d'un paquet de revêtement de sol, en m². */
  paquet: number;
  /** Longueur d'une barre de plinthe, en mètres. */
  barre: number;
}

/**
 * Les valeurs courantes en grande surface de bricolage : deux couches d'une
 * peinture à 10 m²/L, pots de 2,5 L ; 10 % de chute sur un sol posé droit,
 * paquets de 2 m² (stratifié et parquet clipsable en vendent entre 1,7 et
 * 2,5) ; plinthes de 2,4 m.
 */
export const HYPOTHESES: HypothesesTravaux = {
  couches: 2,
  rendement: 10,
  pot: 2.5,
  chute: 0.1,
  paquet: 2,
  barre: 2.4,
};

/** Hauteur retenue quand le relevé n'en donne pas. */
export const HAUTEUR_PAR_DEFAUT = 2.5;

/** Une baie est rattachée au mur qui la porte s'il passe à moins de ça. */
const PRES_DU_MUR = 0.3;

export interface PieceTravaux {
  roomId: string;
  nom: string;
  /** m² */
  sol: number;
  /** m² */
  plafond: number;
  /** m */
  perimetre: number;
  /** m */
  hauteur: number;
  /** m² de murs à peindre, baies déduites */
  murs: number;
  /** m de plinthes, seuils déduits */
  plinthes: number;
  portes: number;
  fenetres: number;
  /**
   * Les murs, teinte par teinte, quand le décor est connu : la peinture de
   * la pièce (clé de `ui/peintures`, `''` sans choix) et ses murs d'accent.
   * La somme fait `murs`.
   */
  teintes?: { cle: string; surface: number }[];
}

/** Le décor d'une pièce, tel que « Décorer » l'enregistre. */
export interface DecorDeLaPiece {
  peinture?: string;
  /** Identifiant de mur → clé de peinture. */
  accents?: Record<string, string>;
}

function distanceAuSegment(p: Pt, a: Pt, b: Pt): number {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * vx), p.z - (a.z + t * vz));
}

const arrondi = (v: number, pas = 0.1) => Math.round(v / pas) * pas;
/** Au dixième, sans traîne de virgule flottante : 27,5 et non 27,500000000000004. */
const auDixieme = (v: number) => Math.round(v * 10) / 10;

/** Le tour d'un contour fermé. */
export function perimetre(pts: Pt[]): number {
  let tour = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    tour += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return tour;
}

/** Les baies d'une pièce : celles posées sur l'un de SES murs. */
export function baiesDeLaPiece(part: Pick<RoomPart, 'walls'>, baies: WallSeg[]): WallSeg[] {
  return baies.filter((o) => {
    const milieu = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
    return part.walls.some((w) => distanceAuSegment(milieu, w.a, w.b) < PRES_DU_MUR);
  });
}

/**
 * LA SURFACE MURALE NETTE D'UNE PIÈCE — UN SEUL CALCUL.
 *
 * Relevé du patron, point 5 de la réflexion « grand public » : le même plan
 * donnait trois surfaces de murs — le tableur ne déduisait pas les baies, le
 * PDF sommait les axes des murs, la fiche et « Travaux » le contour. Ce que
 * l'on peint, c'est le TOUR INTÉRIEUR de la pièce sur sa hauteur, moins
 * chaque baie à sa hauteur (jamais plus haute que le mur). L'écran, la
 * fiche, le PDF et le tableur passent tous par ici.
 */
export function mursNetsDe(
  contour: Pt[],
  hauteur: number,
  baies: WallSeg[],
  /**
   * LES MURS DE LA PIÈCE, CHACUN À SA HAUTEUR — revues « Léon » et
   * « Malik » : le tour de la pièce se multipliait par la hauteur de son
   * plus haut mur. Sous les toits, la jambette de 1,10 m comptait 2,55 m ;
   * dans le loft, la cloison de la chambre (2,60 m) comptait 5 m. Chaque
   * côté du contour prend la hauteur du mur qui le porte.
   */
  murs?: readonly WallSeg[],
): number {
  if (contour.length < 3 || !(hauteur > 0)) return 0;
  const trous = baies.reduce(
    (t, o) => t + Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) * Math.min(o.height || 0, hauteur),
    0,
  );
  if (!murs || murs.length === 0) return Math.max(0, perimetre(contour) * hauteur - trous);
  let aire = 0;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-9) continue;
    const u = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
    const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    let h = hauteur;
    let mieux = Infinity;
    for (const w of murs) {
      if (w.type !== undefined && w.type !== 'wall') continue;
      const lw = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
      if (lw < 1e-9) continue;
      if (Math.abs((u.x * (w.b.x - w.a.x) + u.z * (w.b.z - w.a.z)) / lw) < 0.95) continue;
      const t = ((m.x - w.a.x) * (w.b.x - w.a.x) + (m.z - w.a.z) * (w.b.z - w.a.z)) / (lw * lw);
      if (t < -0.05 || t > 1.05) continue;
      const d = Math.abs(((m.x - w.a.x) * -(w.b.z - w.a.z) + (m.z - w.a.z) * (w.b.x - w.a.x)) / lw);
      if (d <= 0.35 && d < mieux) {
        mieux = d;
        h = Math.min(w.height, hauteur);
      }
    }
    aire += L * h;
  }
  return Math.max(0, aire - trous);
}

/**
 * LES MURS D'UNE PIÈCE, TEINTE PAR TEINTE — correctif de l'audit : la
 * peinture ne tenait pas compte des couleurs choisies dans « Décorer ».
 *
 * Un mur d'accent compte sa FACE dans la pièce : les côtés du contour qui
 * courent sur lui, sur la hauteur, moins ses baies. Le reste des murs prend
 * la peinture de la pièce.
 */
function teintesDeLaPiece(
  part: RoomPart,
  contour: Pt[],
  hauteur: number,
  murs: number,
  siennes: WallSeg[],
  decor: DecorDeLaPiece,
): { cle: string; surface: number }[] {
  const parCle = new Map<string, number>();
  let accents = 0;
  for (const [wallId, cle] of Object.entries(decor.accents ?? {})) {
    const w = part.walls.find((x) => x.id === wallId);
    if (!w || !cle) continue;
    let longueur = 0;
    for (let i = 0; i < contour.length; i++) {
      const a = contour[i];
      const b = contour[(i + 1) % contour.length];
      if (distanceAuSegment(a, w.a, w.b) < 0.15 && distanceAuSegment(b, w.a, w.b) < 0.15) {
        longueur += Math.hypot(b.x - a.x, b.z - a.z);
      }
    }
    const trous = siennes
      .filter((o) => distanceAuSegment({ x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 }, w.a, w.b) < PRES_DU_MUR)
      .reduce((t, o) => t + Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) * Math.min(o.height || 0, hauteur), 0);
    const face = Math.min(Math.max(0, longueur * hauteur - trous), Math.max(0, murs - accents));
    if (!(face > 0)) continue;
    accents += face;
    parCle.set(cle, (parCle.get(cle) ?? 0) + face);
  }
  const fond = decor.peinture ?? '';
  parCle.set(fond, (parCle.get(fond) ?? 0) + Math.max(0, murs - accents));
  // La teinte de la pièce d'abord, ses accents ensuite.
  return [...parCle.entries()]
    .filter(([, s]) => s > 0)
    .sort(([p], [q]) => (p === fond ? -1 : q === fond ? 1 : 0))
    .map(([cle, s]) => ({ cle, surface: auDixieme(s) }));
}

/** Le métré des travaux, pièce par pièce. Les pièces sans contour sont laissées. */
export function travauxDesPieces(
  parts: RoomPart[],
  baies: WallSeg[],
  nomDe: (roomId: string, rang: number) => string,
  /** Le décor de chaque pièce (« Décorer ») : la peinture se compte par teinte. */
  decorDe?: (roomId: string) => DecorDeLaPiece | undefined,
): PieceTravaux[] {
  const out: PieceTravaux[] = [];
  parts.forEach((part, rang) => {
    const surface = part.surface;
    if (!surface || !(surface.area > 0)) return;
    const hauteur = hauteurDeLaPiece(part) || HAUTEUR_PAR_DEFAUT;
    /*
      LE TOUR DE LA PIÈCE, AU NU — revues « Sophie » et « Karim » : compté à
      l'axe des murs, il ajoutait 6 % de peinture et de plinthes (séjour
      19,20 m au lieu de 18,54). Une pièce dessinée a son contour au nu.
    */
    const contour = surface.nu ?? surface.pts;
    const tour = perimetre(contour);
    const siennes = baiesDeLaPiece(part, baies);
    let seuils = 0;
    let portes = 0;
    let fenetres = 0;
    for (const o of siennes) {
      const largeur = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z);
      if (o.type === 'window') fenetres += 1;
      else {
        // Porte ou passage : on y marche, la plinthe s'arrête.
        portes += 1;
        seuils += largeur;
      }
    }
    // Une baie ne monte pas plus haut que le mur qui la porte.
    const murs = mursNetsDe(contour, hauteur, siennes, part.walls);
    const decor = decorDe?.(part.roomId);
    out.push({
      roomId: part.roomId,
      nom: nomDe(part.roomId, rang),
      sol: arrondi(surface.area),
      plafond: arrondi(surface.area),
      perimetre: arrondi(tour),
      hauteur: arrondi(hauteur, 0.01),
      murs: arrondi(murs),
      plinthes: arrondi(Math.max(0, tour - seuils)),
      portes,
      fenetres,
      ...(decor ? { teintes: teintesDeLaPiece(part, surface.pts, hauteur, murs, siennes, decor) } : {}),
    });
  });
  return out;
}

/**
 * LES PIÈCES RETENUES — celles qu'on n'a pas décochées dans « Travaux ».
 * La feuille, le dossier PDF et le tableur passent tous par ici (correctif
 * de l'audit : les pièces décochées comptaient quand même au dossier).
 */
export function piecesRetenues<T extends { roomId: string }>(
  pieces: T[],
  horsTravaux: readonly string[],
  /** Le plan ouvert (`currentSaveId`) : la coche est la sienne. */
  plan?: string | null,
): T[] {
  if (horsTravaux.length === 0) return pieces;
  const hors = new Set(horsTravaux);
  return pieces.filter((p) => !hors.has(cleHorsTravaux(plan, p.roomId)));
}

/**
 * LA COCHE D'UNE PIÈCE, RANGÉE AVEC SON PLAN — revue « Fatou » : décocher la
 * chambre de la variante B la retirait aussi des achats de la variante A
 * (17 paquets de sol devenaient 11). La liste se repérait au seul numéro de
 * la pièce, qu'une copie garde et que « Redétecter » refait : `room-1` est
 * dans tous les plans. Elle se repère maintenant au plan ET à la pièce.
 */
export function cleHorsTravaux(plan: string | null | undefined, roomId: string): string {
  return `${plan ?? 'neuf'}|${roomId}`;
}

export interface Achats {
  murs: {
    surface: number;
    litres: number;
    pots: number;
    /**
     * Teinte par teinte, dès qu'une couleur est choisie : chacune s'achète à
     * part, et `pots` en fait la somme. `cle` vaut `''` sans choix.
     */
    /** Les pièces de chaque teinte, pour savoir où va le pot (revue « Lucas »). */
    parTeinte?: { cle: string; surface: number; litres: number; pots: number; pieces: string[] }[];
  };
  plafonds: { surface: number; litres: number; pots: number };
  sol: { surface: number; avecChute: number; paquets: number };
  plinthes: { metres: number; barres: number };
}

/** Ce qu'il faut acheter pour ces pièces, sur ces hypothèses. */
export function achats(pieces: PieceTravaux[], h: HypothesesTravaux = HYPOTHESES): Achats {
  const somme = (f: (p: PieceTravaux) => number) => pieces.reduce((t, p) => t + f(p), 0);
  const peinture = (surface: number) => {
    const litres = (surface * h.couches) / h.rendement;
    return {
      surface: arrondi(surface),
      litres: arrondi(litres),
      // Un pot entamé s'achète entier ; rien du tout ne s'achète pas.
      pots: litres > 0 ? Math.ceil(litres / h.pot - 1e-9) : 0,
    };
  };
  const sol = somme((p) => p.sol);
  const avecChute = sol * (1 + h.chute);
  const plinthes = somme((p) => p.plinthes);
  /*
    PAR TEINTE — un pot entamé de sauge ne repeint pas le mur terracotta :
    chaque couleur s'arrondit au pot entier pour elle-même, et le total des
    pots en fait la somme.
  */
  let murs: Achats['murs'] = peinture(somme((p) => p.murs));
  if (pieces.some((p) => p.teintes?.some((t) => t.cle !== ''))) {
    const parCle = new Map<string, number>();
    const ou = new Map<string, string[]>();
    for (const p of pieces) {
      for (const t of p.teintes ?? [{ cle: '', surface: p.murs }]) {
        parCle.set(t.cle, (parCle.get(t.cle) ?? 0) + t.surface);
        const noms = ou.get(t.cle) ?? [];
        if (t.surface > 0 && !noms.includes(p.nom)) noms.push(p.nom);
        ou.set(t.cle, noms);
      }
    }
    const parTeinte = [...parCle.entries()]
      .filter(([, s]) => s > 0)
      .map(([cle, s]) => {
        const litres = (s * h.couches) / h.rendement;
        return {
          cle,
          surface: auDixieme(s),
          litres: auDixieme(litres),
          pots: litres > 0 ? Math.ceil(litres / h.pot - 1e-9) : 0,
          pieces: ou.get(cle) ?? [],
        };
      });
    murs = { ...murs, pots: parTeinte.reduce((t, x) => t + x.pots, 0), parTeinte };
  }
  return {
    murs,
    plafonds: peinture(somme((p) => p.plafond)),
    sol: {
      surface: arrondi(sol),
      avecChute: arrondi(avecChute),
      paquets: avecChute > 0 ? Math.ceil(avecChute / h.paquet - 1e-9) : 0,
    },
    plinthes: {
      metres: arrondi(plinthes),
      barres: plinthes > 0 ? Math.ceil(plinthes / h.barre - 1e-9) : 0,
    },
  };
}

/**
 * LES PRIX, QUAND ON VEUT UN ORDRE D'IDÉE — relevé du patron : « un prix
 * estimé si on le souhaite ». Des prix d'unité, pas de m² : c'est ce qu'on
 * lit sur l'étiquette en magasin, et ce qu'on corrige d'un coup d'œil.
 */
export interface PrixTravaux {
  /** Un pot de peinture murale (€). */
  potMurs: number;
  /** Un pot de peinture de plafond (€). */
  potPlafond: number;
  /** Un paquet de revêtement de sol (€). */
  paquetSol: number;
  /** Une barre de plinthe (€). */
  barrePlinthe: number;
}

/**
 * Des prix courants d'entrée de gamme en grande surface de bricolage, en
 * 2026 — un ordre d'idée, que chacun remplace par les siens.
 */
export const PRIX_INDICATIFS: PrixTravaux = {
  potMurs: 35,
  potPlafond: 30,
  paquetSol: 30,
  barrePlinthe: 6,
};

export interface CoutAchats {
  murs: number;
  plafonds: number;
  sol: number;
  plinthes: number;
  total: number;
}

/** Ce que coûtent ces achats, à ces prix d'unité. */
export function coutDesAchats(a: Achats, prix: PrixTravaux): CoutAchats {
  const murs = a.murs.pots * prix.potMurs;
  const plafonds = a.plafonds.pots * prix.potPlafond;
  const sol = a.sol.paquets * prix.paquetSol;
  const plinthes = a.plinthes.barres * prix.barrePlinthe;
  return { murs, plafonds, sol, plinthes, total: murs + plafonds + sol + plinthes };
}

/** « 1 245 € » — un montant à la française, à l'euro près. */
export function euros(v: number): string {
  const entier = String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  return `${entier}\u00A0€`;
}

/** « 12,4 » — un nombre à la française, une décimale au plus. */
export function nombre(v: number): string {
  const r = Math.round(v * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ',');
}

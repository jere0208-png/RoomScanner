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
import { roomHeight } from './floorplan';

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
}

function distanceAuSegment(p: Pt, a: Pt, b: Pt): number {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * vx), p.z - (a.z + t * vz));
}

const arrondi = (v: number, pas = 0.1) => Math.round(v / pas) * pas;

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
export function baiesDeLaPiece(part: RoomPart, baies: WallSeg[]): WallSeg[] {
  return baies.filter((o) => {
    const milieu = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
    return part.walls.some((w) => distanceAuSegment(milieu, w.a, w.b) < PRES_DU_MUR);
  });
}

/** Le métré des travaux, pièce par pièce. Les pièces sans contour sont laissées. */
export function travauxDesPieces(
  parts: RoomPart[],
  baies: WallSeg[],
  nomDe: (roomId: string, rang: number) => string,
): PieceTravaux[] {
  const out: PieceTravaux[] = [];
  parts.forEach((part, rang) => {
    const surface = part.surface;
    if (!surface || !(surface.area > 0)) return;
    const hauteur = roomHeight(part.walls) || HAUTEUR_PAR_DEFAUT;
    const tour = perimetre(surface.pts);
    const siennes = baiesDeLaPiece(part, baies);
    let trous = 0;
    let seuils = 0;
    let portes = 0;
    let fenetres = 0;
    for (const o of siennes) {
      const largeur = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z);
      // Une baie ne monte pas plus haut que le mur qui la porte.
      trous += largeur * Math.min(o.height || 0, hauteur);
      if (o.type === 'window') fenetres += 1;
      else {
        // Porte ou passage : on y marche, la plinthe s'arrête.
        portes += 1;
        seuils += largeur;
      }
    }
    out.push({
      roomId: part.roomId,
      nom: nomDe(part.roomId, rang),
      sol: arrondi(surface.area),
      plafond: arrondi(surface.area),
      perimetre: arrondi(tour),
      hauteur: arrondi(hauteur, 0.01),
      murs: arrondi(Math.max(0, tour * hauteur - trous)),
      plinthes: arrondi(Math.max(0, tour - seuils)),
      portes,
      fenetres,
    });
  });
  return out;
}

export interface Achats {
  murs: { surface: number; litres: number; pots: number };
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
  return {
    murs: peinture(somme((p) => p.murs)),
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

/** « 12,4 » — un nombre à la française, une décimale au plus. */
export function nombre(v: number): string {
  const r = Math.round(v * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ',');
}

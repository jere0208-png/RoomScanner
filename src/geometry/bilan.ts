/**
 * LE BILAN DU RELEVÉ — ce que le balayage a donné, et ce qu'il vaut.
 *
 * Relevé du patron : « améliore encore nativement l'application pour être au
 * top de la concurrence ; on doit proposer mieux, repense la chose en
 * modernité et ludique ». Le moment de vérité d'une application de relevé,
 * c'est la seconde où le scan s'arrête : on veut savoir ce qu'on a, et si
 * c'est bon. Un bandeau « 3 pièces · 48 m² » le disait à moitié.
 *
 * Le bilan compte (pièces, mètres carrés, murs, portes, fenêtres, meubles)
 * et NOTE le relevé sur cent, sur ce qui fait sa valeur pour la suite :
 *
 *   — STRUCTURE (35) : les pièces se referment-elles ? Un contour ouvert
 *     n'a pas de surface, ni de plan juste ;
 *   — PRÉCISION (25) : la confiance que RoomPlan accorde à chaque mur ;
 *   — MURS EN IMAGE (20) : la part des murs que l'orthophoto a habillés —
 *     la 3D à l'identique en dépend ;
 *   — SOL EN IMAGE (12) et PLAFOND MESURÉ (8) : ce qui fait une pièce
 *     reconnaissable et une hauteur sûre.
 *
 * Trois étoiles, une mention, et pour le critère le plus faible UN conseil
 * — le geste qui le corrige au prochain passage. On n'invente rien : chaque
 * point se lit dans ce que le relevé contient.
 */
import type { ObjectData } from 'react-native-room-scan';
import { roomSurface, type WallSeg } from './floorplan';

/** Ce que le bilan lit d'une pièce. */
export interface PieceDuBilan {
  id: string;
  floor?: { ortho?: unknown } | null;
  releve?: { plafond?: unknown | null } | null;
}

export type CleDuCritere =
  | 'structure'
  | 'precision'
  | 'murs'
  | 'sol'
  | 'plafond';

export interface CritereDuBilan {
  cle: CleDuCritere;
  libelle: string;
  points: number;
  sur: number;
}

export interface BilanDuReleve {
  pieces: number;
  /** Surface totale des pièces refermées, au mètre carré. */
  surface: number;
  murs: number;
  portes: number;
  fenetres: number;
  meubles: number;
  /** De 0 à 100. */
  score: number;
  etoiles: 1 | 2 | 3;
  mention: 'Excellent' | 'Très bon' | 'Bon' | 'À compléter';
  criteres: CritereDuBilan[];
  /** Le geste qui relèverait le critère le plus faible ; rien si tout est bon. */
  conseil: string | null;
}

const BAREME: Record<
  CleDuCritere,
  { sur: number; libelle: string; conseil: string }
> = {
  structure: {
    sur: 35,
    libelle: 'Pièces refermées',
    conseil:
      'Un contour reste ouvert : longez le mur manquant avant de terminer.',
  },
  precision: {
    sur: 25,
    libelle: 'Murs bien vus',
    conseil:
      'Quelques murs ont été vus de loin : un passage lent, à un mètre, les fiabilise.',
  },
  murs: {
    sur: 20,
    libelle: 'Murs en vraie image',
    conseil:
      'Balayez les murs de face, à un ou deux mètres : la 3D les reproduira à l’identique.',
  },
  sol: {
    sur: 12,
    libelle: 'Sol en vraie image',
    conseil:
      'Inclinez le téléphone vers le sol en marchant : son parquet ou son carrelage apparaîtra en 3D.',
  },
  plafond: {
    sur: 8,
    libelle: 'Plafond mesuré',
    conseil:
      'Levez le téléphone vers le plafond un instant : sa hauteur sera mesurée.',
  },
};

const ORDRE: CleDuCritere[] = [
  'structure',
  'precision',
  'murs',
  'sol',
  'plafond',
];

/** La confiance d'un mur, de 0 à 1 : RoomPlan sait de quoi il doute. */
function confiance(w: WallSeg): number {
  if (w.confidence === 'low') return 0;
  if (w.confidence === 'medium') return 0.6;
  return 1;
}

export function bilanDuReleve(e: {
  rooms: readonly PieceDuBilan[];
  walls: readonly WallSeg[];
  openings: readonly WallSeg[];
  objects: readonly ObjectData[];
}): BilanDuReleve | null {
  const murs = e.walls.filter(w => w.type === 'wall');
  if (murs.length === 0) return null;
  const pieces = e.rooms.length;
  const aires = e.rooms.map(
    r => roomSurface(murs.filter(w => w.roomId === r.id))?.area ?? 0,
  );
  const refermees = aires.filter(a => a > 1).length;
  const surface = Math.round(aires.reduce((s, a) => s + a, 0));
  const part = (n: number, d: number) =>
    d > 0 ? Math.max(0, Math.min(1, n / d)) : 0;

  const fractions: Record<CleDuCritere, number> = {
    structure: part(refermees, pieces),
    precision: murs.reduce((s, w) => s + confiance(w), 0) / murs.length,
    murs: part(
      murs.filter(w => (w.orthos?.length ?? 0) > 0).length,
      murs.length,
    ),
    sol: part(e.rooms.filter(r => !!r.floor?.ortho).length, pieces),
    plafond: part(e.rooms.filter(r => !!r.releve?.plafond).length, pieces),
  };
  const criteres = ORDRE.map(cle => ({
    cle,
    libelle: BAREME[cle].libelle,
    sur: BAREME[cle].sur,
    points: Math.round(BAREME[cle].sur * fractions[cle]),
  }));
  const score = Math.max(
    0,
    Math.min(
      100,
      criteres.reduce((s, c) => s + c.points, 0),
    ),
  );
  // Le conseil vise le critère qui perd le plus de points — s'il en perd vraiment.
  const faible = [...criteres].sort(
    (a, b) => b.sur - b.points - (a.sur - a.points),
  )[0];
  const conseil =
    faible && faible.sur - faible.points >= Math.max(3, faible.sur * 0.3)
      ? BAREME[faible.cle].conseil
      : null;
  return {
    pieces,
    surface,
    murs: murs.length,
    portes: e.openings.filter(o => o.type === 'door').length,
    fenetres: e.openings.filter(o => o.type === 'window').length,
    meubles: e.objects.length,
    score,
    etoiles: score >= 85 ? 3 : score >= 60 ? 2 : 1,
    mention:
      score >= 85
        ? 'Excellent'
        : score >= 70
        ? 'Très bon'
        : score >= 50
        ? 'Bon'
        : 'À compléter',
    criteres,
    conseil,
  };
}

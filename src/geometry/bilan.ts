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
import { roomParts, type WallSeg } from './floorplan';

/** Ce que le bilan lit d'une pièce. */
export interface PieceDuBilan {
  id: string;
  /** Les murs qui la bordent, tels que la fin du scan les a rangés. */
  wallIds?: string[];
  floor?: { texture?: { texels?: readonly unknown[] } } | null;
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
  /**
   * La même, au dixième — revue « Yasmine » : le bilan disait « 45 m² »,
   * l'en-tête « 44,9 m² » ; deux arrondis pour un chiffre sèment le doute.
   */
  surfaceAuDixieme?: number;
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
  /*
    LA NOTE DIT SI LES COTES SONT FIABLES — revues « Marc », « Yasmine » et
    « Paul » : un relevé géométriquement parfait, sans couleur relevée,
    affichait « 60 / 100 · Bon ». La couleur des murs et du sol pesait 32
    points : un artisan lisait « mes cotes ne valent que 60 % ». Les
    pièces refermées et les murs bien vus font désormais la note ; la
    couleur ne compte presque plus.
  */
  structure: {
    sur: 55,
    libelle: 'Pièces refermées',
    conseil:
      'Un contour reste ouvert : longez le mur manquant avant de terminer.',
  },
  precision: {
    sur: 35,
    libelle: 'Murs bien vus',
    conseil:
      'Quelques murs ont été vus de loin : un passage lent, à un mètre, les fiabilise.',
  },
  /*
    PLUS DE « VRAIE IMAGE » — relevé du patron : « enlève la récupération
    exacte des couleurs et des décors ». Le relevé ne photographie plus les
    murs ni le sol : ce qu'il note, c'est d'en avoir lu la couleur.
  */
  murs: {
    sur: 2,
    libelle: 'Couleur des murs',
    conseil:
      'Balayez les murs à un ou deux mètres : leur couleur sera relevée.',
  },
  sol: {
    sur: 2,
    libelle: 'Couleur du sol',
    conseil:
      'Inclinez le téléphone vers le sol en marchant : sa couleur sera relevée.',
  },
  plafond: {
    sur: 6,
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
  /*
    LES MURS DE CHAQUE PIÈCE SONT CEUX QU'ELLE NOMME — revue « Amandine » :
    le bilan cherchait les murs d'une pièce par leur `roomId`, que la fin du
    scan ne pose jamais. Toute pièce y valait 0 m² : « 0 m² », « Pièces
    refermées 0 », et le conseil de longer un mur manquant sur un studio
    parfaitement fermé.
  */
  const parts = roomParts(
    murs,
    e.rooms.map(r => ({ id: r.id, wallIds: r.wallIds })),
  );
  const surfaces = e.rooms.map(
    r => parts.find(p => p.roomId === r.id)?.surface ?? null,
  );
  const aires = surfaces.map(s => s?.area ?? 0);
  const refermees = surfaces.filter(s => !!s?.exact && s.area > 1).length;
  const surface = Math.round(aires.reduce((s, a) => s + a, 0));
  const part = (n: number, d: number) =>
    d > 0 ? Math.max(0, Math.min(1, n / d)) : 0;

  const fractions: Record<CleDuCritere, number> = {
    structure: part(refermees, pieces),
    precision: murs.reduce((s, w) => s + confiance(w), 0) / murs.length,
    murs: part(murs.filter(w => !!w.color).length, murs.length),
    // Une couleur de sol RELEVÉE : sa grille le prouve (un sol sans relevé
    // peut porter une teinte par défaut).
    sol: part(e.rooms.filter(r => !!r.floor?.texture?.texels?.length).length, pieces),
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
    surfaceAuDixieme: Math.round(aires.reduce((s, a) => s + a, 0) * 10) / 10,
    murs: murs.length,
    // Une façade de placard n'est pas une porte de la pièce.
    portes: e.openings.filter(o => o.type === 'door' && !o.placard).length,
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

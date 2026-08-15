/**
 * Conformité électrique et découpage en circuits.
 *
 * Ce que fait ce fichier : compter ce qui est posé, le comparer aux
 * exigences usuelles de la **NF C 15-100** (installations électriques
 * basse tension des locaux d'habitation, telle qu'amendée A5), puis répartir
 * l'appareillage en circuits et proposer la protection de chacun.
 *
 * Ce qu'il ne fait pas, et qu'il faut dire clairement : il ne délivre aucune
 * attestation. Trois familles d'exigences lui échappent complètement —
 *
 * - **les volumes de la salle d'eau** (0, 1, 2), qui se mesurent par rapport
 *   à la baignoire ou au receveur : l'app ne sait pas où ils sont ;
 * - **les points d'éclairage en plafond**, qui n'ont pas de support dans le
 *   modèle (tout s'accroche à un mur) — aucun minimum d'éclairage n'est donc
 *   vérifié ;
 * - **la puissance réellement raccordée** (chauffage, cumulus), qui décide
 *   de la section et du calibre.
 *
 * Le dernier mot reste à l'électricien. L'app lui épargne le comptage, pas
 * le métier.
 */
import type { RoomKind } from './furniture';
import { pointInPolygon } from './appearance';
import {
  faceX,
  facePoint,
  wallFace,
} from './electrical';
import { wallQuadsOf, type Pt, type WallSeg } from './floorplan';
import {
  FIXTURES,
  postsOf,
  rjOf,
  socketsOf,
  type Fixture,
  type FixtureKind,
} from './electrical';

// --------------------------------------------------------------- usages

export type RoomUse =
  | 'sejour'
  | 'chambre'
  | 'bureau'
  | 'cuisine'
  | 'sdb'
  | 'wc'
  | 'circulation'
  | 'autre';

const sansAccent = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Usage d'une pièce, d'abord d'après le nom qu'on lui a donné — c'est la
 * décision de l'utilisateur, elle prime sur la déduction faite au scan.
 */
export function roomUse(name: string, kind?: RoomKind | null): RoomUse {
  const n = sansAccent(name);
  if (/sejour|salon|salle a manger|living/.test(n)) return 'sejour';
  if (/cuisine/.test(n)) return 'cuisine';
  if (/chambre/.test(n)) return 'chambre';
  if (/bureau/.test(n)) return 'bureau';
  if (/salle de bain|salle d'eau|salle deau|sdb/.test(n)) return 'sdb';
  if (/\bwc\b|toilette/.test(n)) return 'wc';
  if (/couloir|entree|degagement|circulation|palier/.test(n)) return 'circulation';
  if (/dressing|buanderie|cellier|garage|placard|local/.test(n)) return 'autre';
  switch (kind) {
    case 'kitchen':
      return 'cuisine';
    case 'bathroom':
      return 'sdb';
    case 'wc':
      return 'wc';
    case 'bedroom':
      return 'chambre';
    case 'living':
    case 'dining':
      return 'sejour';
    default:
      return 'autre';
  }
}

export const USE_LABEL: Record<RoomUse, string> = {
  sejour: 'Séjour',
  chambre: 'Chambre',
  bureau: 'Bureau',
  cuisine: 'Cuisine',
  sdb: 'Salle d’eau',
  wc: 'WC',
  circulation: 'Circulation',
  autre: 'Autre pièce',
};

/** Pièce principale au sens de la norme : séjour, chambres, bureau. */
const PRINCIPALE: RoomUse[] = ['sejour', 'chambre', 'bureau'];

// ------------------------------------------------------------- exigences

/** Ce qu'une pièce doit comporter, et pourquoi. */
export interface RoomRequirement {
  socles: number;
  rj45: number;
  /** Socles à poser au-dessus du plan de travail (cuisine). */
  surPlan: number;
  regle: string;
}

/**
 * Exigences d'une pièce selon son usage et sa surface.
 *
 * Les nombres ci-dessous sont ceux couramment retenus pour la NF C 15-100
 * amendée A5. La règle du séjour est proportionnelle : un socle par tranche
 * de 4 m², jamais moins de cinq.
 */
export function requirementFor(use: RoomUse, area: number): RoomRequirement {
  switch (use) {
    case 'sejour':
      return {
        socles: Math.max(5, Math.ceil(area / 4)),
        rj45: 1,
        surPlan: 0,
        regle:
          'Séjour : un socle 16 A par tranche de 4 m², cinq au minimum, ' +
          'et au moins une prise de communication RJ45.',
      };
    case 'chambre':
      return {
        socles: 3,
        rj45: 1,
        surPlan: 0,
        regle:
          'Chambre : trois socles 16 A au minimum, et une prise de ' +
          'communication RJ45.',
      };
    case 'bureau':
      return {
        socles: 3,
        rj45: 1,
        surPlan: 0,
        regle:
          'Pièce principale : trois socles 16 A au minimum, et une prise ' +
          'de communication RJ45.',
      };
    case 'cuisine':
      return area >= 4
        ? {
            socles: 6,
            rj45: 0,
            surPlan: 4,
            regle:
              'Cuisine d’au moins 4 m² : six socles 16 A, dont quatre ' +
              'au-dessus du plan de travail. Aucun au-dessus des feux ou ' +
              'de l’évier.',
          }
        : {
            socles: 3,
            rj45: 0,
            surPlan: 0,
            regle: 'Cuisine de moins de 4 m² : trois socles 16 A au minimum.',
          };
    case 'sdb':
      return {
        socles: 1,
        rj45: 0,
        surPlan: 0,
        regle:
          'Salle d’eau : au moins un socle, obligatoirement hors des ' +
          'volumes 0, 1 et 2 — l’app ne sait pas où ils tombent, c’est à ' +
          'vérifier sur place.',
      };
    case 'circulation':
      return {
        socles: area > 4 ? 1 : 0,
        rj45: 0,
        surPlan: 0,
        regle: 'Circulation de plus de 4 m² : un socle 16 A au minimum.',
      };
    case 'wc':
      return { socles: 0, rj45: 0, surPlan: 0, regle: 'WC : aucun socle exigé.' };
    default:
      return {
        socles: area >= 4 ? 1 : 0,
        rj45: 0,
        surPlan: 0,
        regle: 'Autre pièce d’au moins 4 m² : un socle 16 A au minimum.',
      };
  }
}

// ------------------------------------------------------- hauteurs de pose

/** Plage de hauteur d'axe admise, quand la norme en fixe une. */
export const HEIGHT_RULES: Partial<
  Record<FixtureKind, { min?: number; max?: number; regle: string }>
> = {
  prise: {
    min: 0.05,
    max: 1.3,
    regle:
      'Socle 16 A : axe à 5 cm du sol au minimum, 1,30 m au maximum ' +
      '(hors plan de travail).',
  },
  prise2: {
    min: 0.05,
    max: 1.3,
    regle: 'Socle 16 A : axe entre 5 cm et 1,30 m du sol.',
  },
  prise32: {
    min: 0.12,
    regle: 'Socle 32 A de cuisson : axe à 12 cm du sol au minimum.',
  },
  inter: {
    min: 0.9,
    max: 1.3,
    regle: 'Organe de commande : manette entre 0,90 m et 1,30 m du sol.',
  },
  va: {
    min: 0.9,
    max: 1.3,
    regle: 'Organe de commande : manette entre 0,90 m et 1,30 m du sol.',
  },
  poussoir: {
    min: 0.9,
    max: 1.3,
    regle: 'Organe de commande : manette entre 0,90 m et 1,30 m du sol.',
  },
  variateur: {
    min: 0.9,
    max: 1.3,
    regle: 'Organe de commande : manette entre 0,90 m et 1,30 m du sol.',
  },
  tableau: {
    min: 0.9,
    max: 1.8,
    regle:
      'Tableau : organes de manœuvre entre 0,90 m et 1,80 m du sol ' +
      '(1,30 m au plus pour un logement adapté).',
  },
};

/** Un socle est réputé « au-dessus du plan de travail » à partir de 90 cm. */
const PLAN_TRAVAIL = 0.9;

/** Un appareil porte-t-il au moins un socle 16 A ? */
const porteSocle = (k: FixtureKind) => socketsOf(k) > 0;

// ------------------------------------------------------------- constats

/**
 * Le geste qui règle le constat.
 *
 * Un défaut qu'on se contente d'afficher laisse l'utilisateur chercher tout
 * seul où et comment le corriger. Chaque constat porte donc, quand elle
 * existe, l'action qui l'efface — poser l'appareil qui manque, ou remettre
 * à sa hauteur celui qui est mal posé.
 */
export type ElecFix =
  | { type: 'poser'; kind: FixtureKind; height?: number; label: string }
  | { type: 'hauteur'; fixtureId: string; height: number; label: string };

/** Nature du constat : de quoi on parle, sans lire la phrase. */
export type ElecCode =
  | 'socles'
  | 'surPlan'
  | 'rj45'
  | 'hauteur'
  | 'circuits'
  | 'cuisson'
  | 'volumes'
  | 'tableau';

export interface ElecIssue {
  code: ElecCode;
  roomId?: string;
  fixtureId?: string;
  severity: 'alerte' | 'info';
  /** Ce qui ne va pas, en une phrase, nom de la pièce compris. */
  message: string;
  /** La règle, en une ou deux phrases. */
  regle: string;
  /** Comment le régler, s'il y a un geste évident. */
  fix?: ElecFix;
}

export interface RoomInput {
  id: string;
  name: string;
  kind?: RoomKind | null;
  area: number;
  /** Identifiants des murs qui bordent la pièce. */
  wallIds: string[];
  /** Contour au sol : c'est lui qui dit dans quelle pièce tombe un appareil. */
  outline?: Pt[];
}

/**
 * Dans quelle pièce se trouve chaque appareil.
 *
 * Un refend borde DEUX pièces : compter ses appareils pour les deux, c'est
 * offrir un moyen de tricher — poser cinq prises sur l'autre face d'un mur
 * mitoyen rendait le séjour conforme alors que tout était chez le voisin.
 * On regarde donc où l'appareil DONNE : un point pris quinze centimètres
 * devant sa face, et la pièce qui contient ce point. C'est exactement ce que
 * montre le symbole sur le plan.
 */
export function fixturePlacement(
  fixtures: Fixture[],
  walls: WallSeg[],
  rooms: RoomInput[],
): Map<string, string> {
  const quads = wallQuadsOf(walls);
  const byId = new Map(walls.map((w) => [w.id, w]));
  const out = new Map<string, string>();
  for (const f of fixtures) {
    const w = byId.get(f.wallId);
    if (!w) continue;
    const face = wallFace(w, quads.get(w.id), f.side);
    const p = facePoint(face, faceX(face, f.along), 0.15);
    const r = rooms.find(
      (x) => (x.outline?.length ?? 0) >= 3 && pointInPolygon(p, x.outline!),
    );
    if (r) out.set(f.id, r.id);
  }
  return out;
}

/**
 * Tous les constats électriques du logement.
 *
 * Une remarque de vocabulaire, parce qu'elle a son importance : la norme ne
 * fixe **aucun maximum de socles par pièce**. Ce qui est plafonné, c'est le
 * nombre de points par CIRCUIT — huit socles sur un 20 A. Poser dix prises
 * dans une cuisine n'est donc pas une faute : il faut un deuxième circuit,
 * et l'app le prévoit toute seule. Ce cas ressort en simple information,
 * jamais en alerte.
 */
export function checkElectrical(
  rooms: RoomInput[],
  fixtures: Fixture[],
  roomOfWall: Map<string, string[]>,
  /** Pièce de chaque appareil, quand on la connaît (voir `fixturePlacement`). */
  placement?: Map<string, string>,
): ElecIssue[] {
  const out: ElecIssue[] = [];
  const roomOfFixture = (f: Fixture): string | undefined =>
    placement?.get(f.id) ?? roomOfWall.get(f.wallId)?.[0];

  // -------------------------------------------------- hauteurs de pose
  for (const f of fixtures) {
    const rule = HEIGHT_RULES[f.kind];
    if (!rule) continue;
    const spec = FIXTURES[f.kind];
    const cm = Math.round(f.height * 100);
    const remise: ElecFix = {
      type: 'hauteur',
      fixtureId: f.id,
      height: spec.std,
      label: `Remettre à ${Math.round(spec.std * 100)} cm`,
    };
    if (rule.min !== undefined && f.height < rule.min - 1e-6) {
      out.push({
        roomId: roomOfFixture(f),
        fixtureId: f.id,
        severity: 'alerte',
        code: 'hauteur',
        message: `${spec.label} posée à ${cm} cm : trop bas`,
        regle: rule.regle,
        fix: remise,
      });
    } else if (rule.max !== undefined && f.height > rule.max + 1e-6) {
      out.push({
        roomId: roomOfFixture(f),
        fixtureId: f.id,
        severity: 'alerte',
        code: 'hauteur',
        message: `${spec.label} posée à ${cm} cm : trop haut`,
        regle: rule.regle,
        fix: remise,
      });
    }
  }

  // ------------------------------------------------ équipement par pièce
  for (const room of rooms) {
    const use = roomUse(room.name, room.kind);
    const req = requirementFor(use, room.area);
    // Un appareil ne compte QUE pour la pièce où il donne.
    const mine = fixtures.filter((f) => roomOfFixture(f) === room.id);
    // Des SOCLES, pas des plaques : un ensemble double en porte un, un
    // triple en porte deux.
    const socles = mine.reduce((somme, f) => somme + socketsOf(f.kind), 0);
    const rj45 = mine.reduce((somme, f) => somme + rjOf(f.kind), 0);
    const label = room.name || USE_LABEL[use];

    if (socles < req.socles) {
      const manque = req.socles - socles;
      out.push({
        code: 'socles',
        roomId: room.id,
        severity: 'alerte',
        message:
          `${label} : ${socles} socle${socles > 1 ? 's' : ''} sur ` +
          `${req.socles} exigé${req.socles > 1 ? 's' : ''} — il en manque ` +
          `${manque}`,
        regle: req.regle,
        fix: {
          type: 'poser',
          kind: 'prise',
          label: manque > 1 ? 'Poser une prise' : 'Poser la prise manquante',
        },
      });
    }
    if (rj45 < req.rj45) {
      out.push({
        roomId: room.id,
        severity: 'alerte',
        code: 'rj45',
        message: `${label} : aucune prise RJ45`,
        regle: req.regle,
        fix: { type: 'poser', kind: 'rj45', label: 'Poser une prise RJ45' },
      });
    }
    if (req.surPlan > 0) {
      const hauts = mine.reduce(
        (somme, f) => somme + (f.height >= PLAN_TRAVAIL ? socketsOf(f.kind) : 0),
        0,
      );
      if (hauts < req.surPlan) {
        out.push({
          code: 'surPlan',
          roomId: room.id,
          severity: 'alerte',
          message:
            `${label} : ${hauts} socle${hauts > 1 ? 's' : ''} au-dessus du ` +
            `plan de travail sur ${req.surPlan}`,
          regle:
            'Quatre des six socles de la cuisine se posent au-dessus du ' +
            'plan de travail. L’app les reconnaît à leur hauteur d’axe, ' +
            'à partir de 90 cm.',
          fix: {
            type: 'poser',
            kind: 'prise',
            height: 1.1,
            label: 'Poser une prise à 110 cm',
          },
        });
      }
    }

    // Trop de socles pour un seul circuit : ce n'est pas une faute, c'est
    // un circuit de plus. On le dit, sans crier.
    if (socles > MAX_SOCLES) {
      out.push({
        code: 'circuits',
        roomId: room.id,
        severity: 'info',
        message:
          `${label} : ${socles} socles, soit ` +
          `${Math.ceil(socles / MAX_SOCLES)} circuits`,
        regle:
          `Un circuit de prises 16 A en 2,5 mm² protégé par un disjoncteur ` +
          `20 A porte ${MAX_SOCLES} socles au maximum. Au-delà, il en faut ` +
          `un second — la liste du matériel le prévoit déjà.`,
      });
    }

    // Une prise de cuisson ailleurs qu'en cuisine mérite une question.
    const cuisson = mine.filter((f) => f.kind === 'prise32').length;
    if (cuisson > 0 && use !== 'cuisine') {
      out.push({
        roomId: room.id,
        severity: 'alerte',
        code: 'cuisson',
        message: `${label} : socle 32 A hors cuisine`,
        regle:
          'Le socle 32 A alimente la plaque de cuisson, sur un circuit ' +
          'dédié en 6 mm². Ailleurs, c’est probablement une erreur de type.',
      });
    }
    if (use === 'sdb' && mine.some((f) => porteSocle(f.kind))) {
      out.push({
        roomId: room.id,
        severity: 'info',
        code: 'volumes',
        message: `${label} : vérifier les volumes`,
        regle:
          'Aucun socle dans les volumes 0, 1 et 2 (baignoire, douche). ' +
          'Ces volumes se mesurent depuis l’appareil sanitaire, que l’app ' +
          'ne connaît pas : la vérification reste manuelle.',
      });
    }
  }

  // ------------------------------------------------------ vue d'ensemble
  const principales = rooms.filter((r) =>
    PRINCIPALE.includes(roomUse(r.name, r.kind)),
  ).length;
  const rj45Total = fixtures.reduce((somme, f) => somme + rjOf(f.kind), 0);
  const rj45Min = Math.max(2, principales);
  if (principales > 0 && rj45Total < rj45Min) {
    out.push({
      code: 'rj45',
      severity: 'alerte',
      message: `Logement : ${rj45Total} prise${
        rj45Total > 1 ? 's' : ''
      } RJ45 sur ${rj45Min}`,
      regle:
        'Une prise de communication au minimum par pièce principale, et ' +
        'jamais moins de deux dans le logement.',
    });
  }
  if (fixtures.length > 0 && !fixtures.some((f) => f.kind === 'tableau')) {
    out.push({
      code: 'tableau',
      severity: 'info',
      message: 'Aucun tableau électrique placé',
      regle:
        'Le tableau se place dans la gaine technique du logement (GTL), ' +
        'ses manettes entre 0,90 m et 1,80 m du sol.',
    });
  }

  // Les alertes d'abord : c'est ce qui rend l'installation non conforme.
  return out.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'alerte' ? -1 : 1,
  );
}

/**
 * Prépare les pièces telles que les contrôles les attendent : leur surface
 * vient du contour calculé, leurs murs de la liste que porte la pièce.
 */
export function roomInputsOf(
  rooms: { id: string; name: string; kind?: RoomKind | null; wallIds?: string[] }[],
  parts: {
    roomId: string;
    surface: { area: number; pts: Pt[] } | null;
    walls: { id: string }[];
  }[],
): RoomInput[] {
  return rooms.map((r) => {
    const part = parts.find((p) => p.roomId === r.id);
    return {
      id: r.id,
      name: r.name,
      kind: r.kind ?? null,
      area: part?.surface?.area ?? 0,
      wallIds: r.wallIds ?? part?.walls.map((w) => w.id) ?? [],
      outline: part?.surface?.pts,
    };
  });
}

/**
 * De quel mur relève quelle pièce. Un refend borde DEUX pièces : la liste
 * en porte donc deux, et un appareil posé dessus compte pour la première —
 * celle de sa face, faute de mieux.
 */
export function wallToRooms(rooms: RoomInput[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rooms) {
    for (const id of r.wallIds) {
      const list = out.get(id) ?? [];
      list.push(r.id);
      out.set(id, list);
    }
  }
  return out;
}

/** Pièces qui portent au moins une alerte : ce sont elles qu'on montre. */
export function roomsInAlert(issues: ElecIssue[]): Set<string> {
  return new Set(
    issues
      .filter((i) => i.severity === 'alerte' && i.roomId)
      .map((i) => i.roomId as string),
  );
}

// -------------------------------------------------------------- circuits

/** Points maximum sur un circuit de prises 16 A (2,5 mm², 20 A). */
export const MAX_SOCLES = 8;
/** Points maximum sur un circuit d'éclairage (1,5 mm², 16 A). */
export const MAX_LUMIERE = 8;
/** Circuits maximum derrière un même interrupteur différentiel. */
export const MAX_PAR_DIFF = 8;

export type CircuitNature =
  | 'prises'
  | 'eclairage'
  | 'specialise'
  | 'cuisson'
  | 'sortie'
  | 'vdi';

export interface Circuit {
  id: string;
  label: string;
  nature: CircuitNature;
  /** Nombre de points portés par le circuit. */
  points: number;
  /** Section des conducteurs (mm²). Nulle pour les courants faibles. */
  section: number | null;
  /** Calibre du disjoncteur (A). Nul pour les courants faibles. */
  breaker: number | null;
  rooms: string[];
  fixtureIds: string[];
  note?: string;
}

const chunk = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/**
 * Remplit des circuits à la CHARGE et non au nombre d'appareils : un
 * ensemble triple pèse deux socles, il ne doit pas voyager en huitième
 * position d'un circuit déjà plein.
 */
function chunkByLoad(
  list: Fixture[],
  max: number,
  poids: (f: Fixture) => number,
): Fixture[][] {
  const out: Fixture[][] = [];
  let lot: Fixture[] = [];
  let charge = 0;
  for (const f of list) {
    const p = Math.max(1, poids(f));
    if (lot.length > 0 && charge + p > max) {
      out.push(lot);
      lot = [];
      charge = 0;
    }
    lot.push(f);
    charge += p;
  }
  if (lot.length > 0) out.push(lot);
  return out;
}

/**
 * Répartit l'appareillage en circuits et propose la protection de chacun.
 *
 * Les règles appliquées :
 * - un circuit **dédié** par socle 32 A (cuisson) : 6 mm², 32 A ;
 * - un circuit **dédié** par socle 20 A (four, lave-linge, lave-vaisselle…) :
 *   2,5 mm², 20 A ;
 * - les socles 16 A par paquets de huit : 2,5 mm², 20 A, **la cuisine à
 *   part** — ses circuits ne se mélangent pas à ceux des autres pièces ;
 * - l'éclairage par paquets de huit : 1,5 mm², 16 A ;
 * - les sorties de câble par paquets de huit : 2,5 mm², 20 A, à revoir selon
 *   la puissance réellement raccordée ;
 * - les courants faibles ne sont pas protégés par un disjoncteur : ils
 *   rejoignent le coffret de communication.
 */
export function planCircuits(
  fixtures: Fixture[],
  roomNameOf: (f: Fixture) => string,
  isKitchen: (f: Fixture) => boolean,
): Circuit[] {
  const out: Circuit[] = [];
  let n = 0;
  const add = (c: Omit<Circuit, 'id'>) => {
    n += 1;
    out.push({ ...c, id: `c${n}` });
  };
  const roomsOf = (list: Fixture[]) => [...new Set(list.map(roomNameOf))];

  for (const f of fixtures.filter((x) => x.kind === 'prise32')) {
    add({
      label: `Cuisson — ${roomNameOf(f)}`,
      nature: 'cuisson',
      points: 1,
      section: 6,
      breaker: 32,
      rooms: [roomNameOf(f)],
      fixtureIds: [f.id],
      note: 'Circuit dédié à la plaque de cuisson.',
    });
  }
  for (const f of fixtures.filter((x) => x.kind === 'prise20')) {
    add({
      label: `Spécialisé 20 A — ${roomNameOf(f)}`,
      nature: 'specialise',
      points: 1,
      section: 2.5,
      breaker: 20,
      rooms: [roomNameOf(f)],
      fixtureIds: [f.id],
      note: 'Circuit dédié : four, lave-linge, lave-vaisselle ou sèche-linge.',
    });
  }

  const socles = fixtures.filter((f) => socketsOf(f.kind) > 0);
  const cuisine = socles.filter(isKitchen);
  const ailleurs = socles.filter((f) => !isKitchen(f));
  chunkByLoad(cuisine, MAX_SOCLES, (f) => socketsOf(f.kind)).forEach((lot, i) =>
    add({
      label: `Prises cuisine ${i + 1}`,
      nature: 'prises',
      points: lot.reduce((somme, f) => somme + socketsOf(f.kind), 0),
      section: 2.5,
      breaker: 20,
      rooms: roomsOf(lot),
      fixtureIds: lot.map((f) => f.id),
      note: 'Les prises de cuisine ne partagent pas leur circuit.',
    }),
  );
  chunkByLoad(ailleurs, MAX_SOCLES, (f) => socketsOf(f.kind)).forEach((lot, i) =>
    add({
      label: `Prises ${i + 1}`,
      nature: 'prises',
      points: lot.reduce((somme, f) => somme + socketsOf(f.kind), 0),
      section: 2.5,
      breaker: 20,
      rooms: roomsOf(lot),
      fixtureIds: lot.map((f) => f.id),
    }),
  );

  const lumieres = fixtures.filter((f) => f.kind === 'applique');
  chunk(lumieres, MAX_LUMIERE).forEach((lot, i) =>
    add({
      label: `Éclairage ${i + 1}`,
      nature: 'eclairage',
      points: lot.length,
      section: 1.5,
      breaker: 16,
      rooms: roomsOf(lot),
      fixtureIds: lot.map((f) => f.id),
    }),
  );

  const sorties = fixtures.filter((f) => f.kind === 'sortieCable');
  chunk(sorties, MAX_SOCLES).forEach((lot, i) =>
    add({
      label: `Sorties de câble ${i + 1}`,
      nature: 'sortie',
      points: lot.length,
      section: 2.5,
      breaker: 20,
      rooms: roomsOf(lot),
      fixtureIds: lot.map((f) => f.id),
      note: 'À revoir selon la puissance raccordée (chauffage, sèche-serviettes).',
    }),
  );

  const vdi = fixtures.filter(
    (f) => postsOf(f.kind).some((k) => k === 'rj45' || k === 'tv'),
  );
  if (vdi.length > 0) {
    add({
      label: 'Courants faibles',
      nature: 'vdi',
      points: vdi.reduce(
        (somme, f) =>
          somme + postsOf(f.kind).filter((k) => k === 'rj45' || k === 'tv').length,
        0,
      ),
      section: null,
      breaker: null,
      rooms: roomsOf(vdi),
      fixtureIds: vdi.map((f) => f.id),
      note: 'Raccordés au coffret de communication, sans disjoncteur.',
    });
  }
  return out;
}

/** Un interrupteur différentiel et les circuits qu'il protège. */
export interface Differential {
  label: string;
  type: 'A' | 'AC';
  rating: number;
  circuits: string[];
}

/**
 * Répartit les circuits derrière les interrupteurs différentiels 30 mA.
 *
 * Un différentiel de type **A** est exigé pour la cuisson et le lave-linge —
 * leurs courants de défaut peuvent comporter une composante continue que le
 * type AC ne voit pas. Les autres circuits vont derrière des type AC, huit
 * au maximum par appareil.
 */
export function planDifferentials(circuits: Circuit[]): Differential[] {
  const proteges = circuits.filter((c) => c.nature !== 'vdi');
  if (proteges.length === 0) return [];
  const typeA = proteges.filter(
    (c) => c.nature === 'cuisson' || c.nature === 'specialise',
  );
  const reste = proteges.filter((c) => !typeA.includes(c));
  const out: Differential[] = [];
  chunk(typeA, MAX_PAR_DIFF).forEach((lot, i) =>
    out.push({
      label: `Différentiel type A ${i + 1}`,
      type: 'A',
      rating: 40,
      circuits: lot.map((c) => c.label),
    }),
  );
  chunk(reste, MAX_PAR_DIFF).forEach((lot, i) =>
    out.push({
      label: `Différentiel type AC ${i + 1}`,
      type: 'AC',
      rating: 40,
      circuits: lot.map((c) => c.label),
    }),
  );
  // Un logement sans circuit spécialisé n'aurait aucun type A : la norme en
  // impose un de toute façon.
  if (!out.some((d) => d.type === 'A')) {
    out.unshift({
      label: 'Différentiel type A 1',
      type: 'A',
      rating: 40,
      circuits: [],
    });
  }
  return out;
}

// -------------------------------------------------------- liste matériel

export interface MaterialRow {
  label: string;
  quantity: number;
}

export interface RoomMaterial {
  room: string;
  use: string;
  area: number;
  rows: MaterialRow[];
}

export interface MaterialList {
  rooms: RoomMaterial[];
  circuits: Circuit[];
  differentials: Differential[];
  /** Matériel de tableau, hors appareillage des pièces. */
  board: MaterialRow[];
  issues: ElecIssue[];
}

/**
 * La liste du matériel, prête à chiffrer.
 *
 * Le tableau est déduit des circuits : un disjoncteur par circuit, à son
 * calibre, plus les différentiels, plus le coffret de communication s'il y a
 * des courants faibles.
 */
export function materialList(
  rooms: RoomInput[],
  fixtures: Fixture[],
  roomOfWall: Map<string, string[]>,
  placement?: Map<string, string>,
): MaterialList {
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const firstRoom = (f: Fixture) => {
    const pose = placement?.get(f.id);
    if (pose) return roomById.get(pose);
    const ids = roomOfWall.get(f.wallId) ?? [];
    return ids.map((id) => roomById.get(id)).find((r) => !!r);
  };
  const nameOf = (f: Fixture) => firstRoom(f)?.name || 'Hors pièce';
  const isKitchen = (f: Fixture) => {
    const r = firstRoom(f);
    return !!r && roomUse(r.name, r.kind) === 'cuisine';
  };

  const byRoom: RoomMaterial[] = rooms.map((r) => {
    const mine = fixtures.filter((f) => firstRoom(f)?.id === r.id);
    const counts = new Map<FixtureKind, number>();
    for (const f of mine) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
    return {
      room: r.name || USE_LABEL[roomUse(r.name, r.kind)],
      use: USE_LABEL[roomUse(r.name, r.kind)],
      area: r.area,
      rows: [...counts.entries()].map(([kind, quantity]) => ({
        label: FIXTURES[kind].label,
        quantity,
      })),
    };
  });

  const circuits = planCircuits(fixtures, nameOf, isKitchen);
  const differentials = planDifferentials(circuits);

  const breakers = new Map<number, number>();
  for (const c of circuits) {
    if (c.breaker === null) continue;
    breakers.set(c.breaker, (breakers.get(c.breaker) ?? 0) + 1);
  }
  const board: MaterialRow[] = [...breakers.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([amp, quantity]) => ({
      label: `Disjoncteur ${amp} A`,
      quantity,
    }));
  const diffA = differentials.filter((d) => d.type === 'A').length;
  const diffAC = differentials.filter((d) => d.type === 'AC').length;
  if (diffA > 0) {
    board.push({ label: 'Interrupteur différentiel 40 A 30 mA type A', quantity: diffA });
  }
  if (diffAC > 0) {
    board.push({
      label: 'Interrupteur différentiel 40 A 30 mA type AC',
      quantity: diffAC,
    });
  }
  if (circuits.some((c) => c.nature === 'vdi')) {
    board.push({ label: 'Coffret de communication', quantity: 1 });
  }
  const metres = circuits.reduce(
    (s, c) => s + (c.section === null ? 0 : c.points * 12),
    0,
  );
  if (metres > 0) {
    board.push({
      label: `Câble — environ ${metres} m au total (12 m par point, à ajuster)`,
      quantity: 1,
    });
  }

  return {
    rooms: byRoom,
    circuits,
    differentials,
    board,
    issues: checkElectrical(rooms, fixtures, roomOfWall, placement),
  };
}

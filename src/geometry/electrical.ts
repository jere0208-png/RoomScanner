/**
 * Appareillage électrique — prises, commandes, courants faibles.
 *
 * Un appareil n'existe pas tout seul dans l'espace : il est POSÉ SUR UNE
 * FACE DE MUR. Tout part donc de là, et le repère est celui de l'électricien
 * qui se met devant le mur, mètre en main : une distance depuis le bord
 * gauche, une hauteur depuis le sol.
 *
 * Le point délicat est le stockage. On garde `along` mesuré le long du
 * SEGMENT de mur depuis son extrémité `a` — jamais depuis le bord de la face
 * affichée. Deux raisons :
 *
 * 1. Retourner un appareil sur l'autre face ne doit pas le faire sauter à
 *    l'autre bout du mur. Une valeur ancrée sur le segment reste au même
 *    endroit dans le monde, quelle que soit la face qu'on regarde.
 * 2. La face, elle, change de longueur quand un mur voisin bouge : les
 *    onglets de jonction la rallongent ou la raccourcissent. Une cote ancrée
 *    dessus dériverait toute seule.
 *
 * `wallFace()` fait la conversion, et il la fait de sorte que A→B aille
 * TOUJOURS de la gauche vers la droite pour qui regarde cette face-là. C'est
 * vérifié contre la projection réelle de la vue 3D (voir les tests) : sans
 * ça, la gauche et la droite s'inverseraient sur une face sur deux.
 */
import {
  perpOf,
  roomOf,
  roomParts,
  segLength,
  wallsCentroid,
  WALL_T,
  type Pt,
  type RoomShape,
  type WallQuad,
  type WallSeg,
} from './floorplan';

export type FixtureKind =
  | 'prise'
  | 'prise2'
  | 'prise20'
  | 'prise32'
  | 'inter'
  | 'va'
  | 'poussoir'
  | 'variateur'
  | 'rj45'
  | 'tv'
  | 'applique'
  | 'tableau'
  | 'thermostat'
  | 'sortieCable'
  | 'boite';

/** Un appareil posé sur une face de mur. */
export interface Fixture {
  id: string;
  kind: FixtureKind;
  wallId: string;
  /** Abscisse de l'axe le long du segment de mur, depuis l'extrémité `a` (m). */
  along: number;
  /** Hauteur de l'axe au-dessus du sol (m). */
  height: number;
  /** Face du mur : +1 = côté de la normale `perpOf(u)`, −1 = l'autre. */
  side: 1 | -1;
}

export interface FixtureSpec {
  label: string;
  /** Sigle porté par le symbole du plan 2D. */
  short: string;
  family: string;
  /** Largeur et hauteur de la plaque (m). */
  w: number;
  h: number;
  /** Saillie hors du nu du mur (m). */
  depth: number;
  color: string;
  /** Hauteur d'axe usuelle (m). */
  std: number;
  /** Ce qu'il faut savoir sur cette hauteur, en une ligne. */
  note: string;
}

/** Teintes par famille : le modèle 3D doit se lire sans légende. */
const C_PRISE = '#F0A202';
const C_CMD = '#2D9CDB';
const C_FAIBLE = '#9B51E0';
const C_LUM = '#F2C94C';
const C_DIVERS = '#EB5757';

export const FIXTURES: Record<FixtureKind, FixtureSpec> = {
  prise: {
    label: 'Prise 16 A',
    short: 'P',
    family: 'Prises',
    w: 0.08,
    h: 0.08,
    depth: 0.012,
    color: C_PRISE,
    std: 0.25,
    note: 'Axe usuel à 25 cm ; 5 cm au-dessus du sol au minimum.',
  },
  prise2: {
    label: 'Prise double',
    short: 'P2',
    family: 'Prises',
    w: 0.15,
    h: 0.08,
    depth: 0.012,
    color: C_PRISE,
    std: 0.25,
    note: 'Deux socles sous une plaque : compte pour deux prises.',
  },
  prise20: {
    label: 'Prise 20 A',
    short: '20',
    family: 'Prises',
    w: 0.08,
    h: 0.08,
    depth: 0.012,
    color: C_PRISE,
    std: 1.1,
    note: 'Four, lave-linge : circuit dédié. Souvent au-dessus du plan.',
  },
  prise32: {
    label: 'Prise 32 A',
    short: '32',
    family: 'Prises',
    w: 0.1,
    h: 0.1,
    depth: 0.014,
    color: C_PRISE,
    std: 0.25,
    note: 'Plaque de cuisson : axe à 12 cm du sol au minimum.',
  },
  inter: {
    label: 'Interrupteur',
    short: 'I',
    family: 'Commandes',
    w: 0.08,
    h: 0.08,
    depth: 0.012,
    color: C_CMD,
    std: 1.1,
    note: 'Manette entre 0,90 m et 1,30 m du sol.',
  },
  va: {
    label: 'Va-et-vient',
    short: 'VV',
    family: 'Commandes',
    w: 0.08,
    h: 0.08,
    depth: 0.012,
    color: C_CMD,
    std: 1.1,
    note: 'Deux points de commande pour un même éclairage.',
  },
  poussoir: {
    label: 'Bouton poussoir',
    short: 'BP',
    family: 'Commandes',
    w: 0.08,
    h: 0.08,
    depth: 0.012,
    color: C_CMD,
    std: 1.1,
    note: 'Télérupteur : au-delà de deux points de commande.',
  },
  variateur: {
    label: 'Variateur',
    short: 'VAR',
    family: 'Commandes',
    w: 0.08,
    h: 0.08,
    depth: 0.014,
    color: C_CMD,
    std: 1.1,
    note: 'Vérifier la compatibilité des lampes menées.',
  },
  rj45: {
    label: 'Prise RJ45',
    short: 'RJ',
    family: 'Courants faibles',
    w: 0.08,
    h: 0.08,
    depth: 0.012,
    color: C_FAIBLE,
    std: 0.25,
    note: 'Deux au minimum par pièce principale.',
  },
  tv: {
    label: 'Prise TV',
    short: 'TV',
    family: 'Courants faibles',
    w: 0.08,
    h: 0.08,
    depth: 0.012,
    color: C_FAIBLE,
    std: 0.25,
    note: 'Souvent doublée d’une prise 16 A et d’un RJ45.',
  },
  applique: {
    label: 'Applique murale',
    short: 'AP',
    family: 'Éclairage',
    w: 0.12,
    h: 0.12,
    depth: 0.06,
    color: C_LUM,
    std: 1.9,
    note: 'Hors volume dans une salle d’eau.',
  },
  tableau: {
    label: 'Tableau électrique',
    short: 'TAB',
    family: 'Divers',
    w: 0.55,
    h: 0.65,
    depth: 0.09,
    color: C_DIVERS,
    std: 1.35,
    note: 'Manettes entre 0,90 m et 1,80 m du sol.',
  },
  thermostat: {
    label: 'Thermostat',
    short: 'TH',
    family: 'Divers',
    w: 0.09,
    h: 0.09,
    depth: 0.02,
    color: C_DIVERS,
    std: 1.5,
    note: 'À l’abri des courants d’air et du soleil direct.',
  },
  sortieCable: {
    label: 'Sortie de câble',
    short: 'SC',
    family: 'Divers',
    w: 0.08,
    h: 0.08,
    depth: 0.02,
    color: C_DIVERS,
    std: 0.25,
    note: 'Sèche-serviettes, radiateur, volet roulant.',
  },
  boite: {
    label: 'Boîte de dérivation',
    short: 'BD',
    family: 'Divers',
    w: 0.1,
    h: 0.1,
    depth: 0.03,
    color: C_DIVERS,
    std: 2.3,
    note: 'Doit rester accessible après travaux.',
  },
};

/** Le catalogue, rangé par famille : l'ordre du sélecteur. */
export const FIXTURE_FAMILIES: { name: string; kinds: FixtureKind[] }[] = [
  { name: 'Prises', kinds: ['prise', 'prise2', 'prise20', 'prise32'] },
  { name: 'Commandes', kinds: ['inter', 'va', 'poussoir', 'variateur'] },
  { name: 'Courants faibles', kinds: ['rj45', 'tv'] },
  { name: 'Éclairage', kinds: ['applique'] },
  { name: 'Divers', kinds: ['tableau', 'thermostat', 'sortieCable', 'boite'] },
];

export const FIXTURE_KINDS = FIXTURE_FAMILIES.flatMap((f) => f.kinds);

/** Retrait initial, aux deux cotes : 20 cm du coin bas. */
export const FIXTURE_MARGIN = 0.2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/**
 * Une face de mur, vue par quelqu'un qui se place devant.
 *
 * `A` est le bord GAUCHE tel qu'il apparaît de ce côté-là, `B` le bord droit.
 * `s0`/`s1` sont les abscisses, sur cette face, des extrémités `a` et `b` du
 * segment de mur — elles ne valent ni 0 ni `len` dès qu'un onglet de jonction
 * rallonge la face.
 */
export interface WallFace {
  A: Pt;
  B: Pt;
  len: number;
  /** Direction A→B, unitaire. */
  ux: number;
  uz: number;
  /** Normale sortante, tournée vers l'observateur. */
  nx: number;
  nz: number;
  s0: number;
  s1: number;
}

/** Quadrilatère d'un mur sans jonction : about droit aux deux bouts. */
function squareQuad(w: WallSeg): WallQuad {
  const len = segLength(w) || 1;
  const u = { x: (w.b.x - w.a.x) / len, z: (w.b.z - w.a.z) / len };
  const n = perpOf(u);
  const h = WALL_T / 2;
  return {
    a1: { x: w.a.x + n.x * h, z: w.a.z + n.z * h },
    b1: { x: w.b.x + n.x * h, z: w.b.z + n.z * h },
    b2: { x: w.b.x - n.x * h, z: w.b.z - n.z * h },
    a2: { x: w.a.x - n.x * h, z: w.a.z - n.z * h },
  };
}

/**
 * Face d'un mur, du côté demandé.
 *
 * Le sens de A→B n'est pas anodin : de l'autre côté du mur, la gauche et la
 * droite s'échangent. On prend donc `a1→b1` d'un côté et `b2→a2` de l'autre,
 * ce qui donne dans les deux cas le sens gauche→droite de l'observateur.
 */
export function wallFace(
  wall: WallSeg,
  quad: WallQuad | undefined,
  side: 1 | -1,
): WallFace {
  const q = quad ?? squareQuad(wall);
  const A = side > 0 ? q.a1 : q.b2;
  const B = side > 0 ? q.b1 : q.a2;
  const len = Math.hypot(B.x - A.x, B.z - A.z) || 1e-6;
  const ux = (B.x - A.x) / len;
  const uz = (B.z - A.z) / len;
  const along = (p: Pt) => (p.x - A.x) * ux + (p.z - A.z) * uz;
  return {
    A,
    B,
    len,
    ux,
    uz,
    nx: -uz,
    nz: ux,
    s0: along(wall.a),
    s1: along(wall.b),
  };
}

/** Abscisse sur la face (m depuis le bord gauche) d'une cote de segment. */
export function faceX(face: WallFace, along: number): number {
  return face.s1 >= face.s0 ? face.s0 + along : face.s0 - along;
}

/** L'inverse : une abscisse lue sur la face redevient une cote de segment. */
export function fromFaceX(face: WallFace, x: number): number {
  return face.s1 >= face.s0 ? x - face.s0 : face.s0 - x;
}

/** Abscisse sur la face d'une fraction du segment (ce que livre `assignOpenings`). */
export function faceXofT(face: WallFace, t: number): number {
  return face.s0 + (face.s1 - face.s0) * t;
}

/** Point du sol, à l'aplomb de l'appareil, décalé de `out` devant le nu. */
export function facePoint(face: WallFace, x: number, out = 0): Pt {
  return {
    x: face.A.x + face.ux * x + face.nx * out,
    z: face.A.z + face.uz * x + face.nz * out,
  };
}

/**
 * De quel côté du mur se trouve la pièce. C'est la face que l'électricien
 * voit, donc celle qui reçoit l'appareil par défaut.
 */
export function interiorSide(
  wall: WallSeg,
  walls: WallSeg[],
  rooms?: RoomShape[],
): 1 | -1 {
  const part = roomParts(walls, rooms).find(
    (p) => p.walls.some((w) => w.id === wall.id) || p.roomId === roomOf(wall),
  );
  const inside = part?.labelAt ?? wallsCentroid(walls);
  const len = segLength(wall) || 1;
  const n = perpOf({
    x: (wall.b.x - wall.a.x) / len,
    z: (wall.b.z - wall.a.z) / len,
  });
  const mid = {
    x: (wall.a.x + wall.b.x) / 2,
    z: (wall.a.z + wall.b.z) / 2,
  };
  return (inside.x - mid.x) * n.x + (inside.z - mid.z) * n.z > 0 ? 1 : -1;
}

/**
 * Un appareil neuf, posé à 20 cm du coin bas gauche de la face — le point de
 * départ demandé, qu'on déplace ensuite au doigt ou à la cote.
 */
export function newFixture(
  id: string,
  kind: FixtureKind,
  wall: WallSeg,
  quad: WallQuad | undefined,
  side: 1 | -1,
): Fixture {
  const face = wallFace(wall, quad, side);
  const spec = FIXTURES[kind];
  // Un appareil large (un tableau) ne peut pas avoir son AXE à 20 cm du bord
  // sans déborder : on le recale au plus près possible du coin.
  const x = clamp(FIXTURE_MARGIN, Math.min(spec.w / 2, face.len / 2), face.len / 2);
  return {
    id,
    kind,
    wallId: wall.id,
    along: fromFaceX(face, x),
    height: FIXTURE_MARGIN,
    side,
  };
}

/** Cotes lues sur la face : gauche, droite, hauteur — ce que l'app affiche. */
export function fixtureDims(
  face: WallFace,
  f: Fixture,
): { left: number; right: number; height: number } {
  const x = faceX(face, f.along);
  return { left: x, right: face.len - x, height: f.height };
}


/**
 * Symboles de plan.
 *
 * Un rond de couleur avec deux lettres dedans n'est pas un plan
 * d'électricité : personne du métier ne le lit. Les symboles ci-dessous
 * suivent les conventions habituelles des schémas d'installation — celles de
 * la série NF EN 60617, à laquelle renvoient les plans NF C 15-100 : le socle
 * de prise est un demi-cercle barré de son diamètre avec une tige vers le
 * mur, l'interrupteur un point posé au mur avec sa manette, le point
 * lumineux un cercle croisé. Ce sont des symboles dessinés à la main d'après
 * ces conventions, pas une reproduction certifiée de la norme.
 *
 * Repère local : centré sur (0, 0), rayon utile 11, **+y vers le mur**. Le
 * plan tourne ensuite le symbole pour qu'il regarde sa face.
 */
export interface SymbolStroke {
  d: string;
  /** Tracé plein (le point d'un interrupteur, par exemple). */
  fill?: boolean;
}

const SOCLE: SymbolStroke[] = [
  { d: 'M-8 2 H8' },
  { d: 'M-8 2 A8 8 0 0 1 8 2' },
  { d: 'M0 2 V10' },
];

const POINT_MUR: SymbolStroke = {
  d: 'M0 8 m-2.4 0 a2.4 2.4 0 1 0 4.8 0 a2.4 2.4 0 1 0 -4.8 0',
  fill: true,
};

const MANETTE: SymbolStroke[] = [
  POINT_MUR,
  { d: 'M0 8 L6 -4' },
  { d: 'M2.6 -5.6 L9.6 -2.2' },
];

export const FIXTURE_SYMBOL: Record<FixtureKind, SymbolStroke[]> = {
  prise: SOCLE,
  prise2: [...SOCLE, { d: 'M-4.5 2 A4.5 4.5 0 0 1 4.5 2' }],
  prise20: SOCLE,
  prise32: SOCLE,
  inter: MANETTE,
  va: [...MANETTE, { d: 'M1.2 -8.4 L8.2 -5' }],
  poussoir: [POINT_MUR, { d: 'M0 8 V-4' }, { d: 'M-5 -4 H5' }],
  variateur: [
    ...MANETTE,
    { d: 'M-9 -1 L-2.5 -6.5' },
    { d: 'M-9 -1 l3.4 0.5' },
    { d: 'M-9 -1 l0.5 -3.4' },
  ],
  rj45: SOCLE,
  tv: SOCLE,
  applique: [
    { d: 'M-6 -2 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0' },
    { d: 'M-4.2 -6.2 L4.2 2.2' },
    { d: 'M4.2 -6.2 L-4.2 2.2' },
    { d: 'M0 4 V9' },
    { d: 'M-7 9.5 H7' },
  ],
  tableau: [
    { d: 'M-9 -7 H9 V7 H-9 Z' },
    { d: 'M-4 7 L2 -7' },
    { d: 'M1 7 L7 -7' },
  ],
  thermostat: [
    { d: 'M-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0' },
    { d: 'M-4 0 H4' },
  ],
  sortieCable: [
    { d: 'M0 4 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0', fill: true },
    { d: 'M0 1 V-8' },
    { d: 'M-4 -8 H4' },
  ],
  boite: [
    { d: 'M-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0' },
    { d: 'M0 -6 V-10' },
    { d: 'M0 6 V10' },
    { d: 'M-6 0 H-10' },
    { d: 'M6 0 H10' },
  ],
};

/**
 * Mention portée à côté du symbole quand le dessin seul ne suffit pas : le
 * socle d'une prise 20 A est le même que celui d'une 16 A, seule
 * l'intensité change, et un plan l'écrit.
 */
export const FIXTURE_TAG: Partial<Record<FixtureKind, string>> = {
  prise20: '20A',
  prise32: '32A',
  rj45: 'RJ',
  tv: 'TV',
};

/**
 * Rang d'empilement des appareils qui tombent au même point du plan.
 *
 * Vu de dessus, une prise à 25 cm et un interrupteur à 1,10 m sur le même
 * point de mur se superposent EXACTEMENT : on n'en voyait qu'un, et le plan
 * mentait. Ils s'échelonnent donc le long de leur filet de rappel, du mur
 * vers l'intérieur de la pièce, dans l'ordre où ils ont été posés.
 */
export function stackRanks(
  items: { id: string; wallId: string; side: 1 | -1; x: number }[],
): Map<string, number> {
  const seen = new Map<string, number>();
  const out = new Map<string, number>();
  for (const it of items) {
    // Seau de 12 cm : deux appareils plus proches que ça se gêneraient.
    const key = `${it.wallId}|${it.side}|${Math.round(it.x / 0.12)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    out.set(it.id, n);
  }
  return out;
}

/** Nombre d'appareils par pièce et par type, pour le récapitulatif. */
export function countByKind(fixtures: Fixture[]): [FixtureKind, number][] {
  const n = new Map<FixtureKind, number>();
  for (const f of fixtures) n.set(f.kind, (n.get(f.kind) ?? 0) + 1);
  return FIXTURE_KINDS.filter((k) => n.has(k)).map((k) => [k, n.get(k) ?? 0]);
}

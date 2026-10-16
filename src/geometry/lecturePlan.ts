/**
 * LA LECTURE D'UN PLAN PAPIER — de la photo d'une feuille à un plan 2D juste.
 *
 * Relevé du patron : « on ouvre une page photo qui demande de scanner un
 * plan papier ; si la vision détecte le plan, elle le scanne et crée à partir
 * de lui un plan 2D. Les symboles, les cotes, tout doit être lu parfaitement.
 * Si les symboles reconnus ne sont pas les nôtres, on les convertit à notre
 * manière. »
 *
 * DEUX LECTEURS, ET CHACUN À SA PLACE.
 *
 *   — L'IA (Claude, par le serveur : voir `server/lecture-plan.php`) VOIT le
 *     plan : elle dit où sont les murs, les ouvertures, les pièces et les
 *     symboles, et elle LIT les cotes. Elle situe les choses sur l'image, en
 *     millièmes de sa largeur et de sa hauteur — c'est ce qu'une vision sait
 *     faire, à quelques pour mille près.
 *   — CE MODULE MESURE. Quelques pour mille d'un plan de dix mètres, ce sont
 *     cinq centimètres : un plan « à peu près » n'est pas un plan. Ce qui est
 *     juste sur une feuille, ce sont ses COTES ; le dessin, lui, n'est qu'une
 *     indication. On reconstruit donc le plan à partir des cotes :
 *
 *       1. l'orientation : les murs d'un plan sont d'équerre, on redresse
 *          la photo sur leur direction dominante ;
 *       2. l'échelle : chaque cote lue donne des mètres par pixel ; on prend
 *          la médiane, et une cote qui s'en écarte est relue dans les autres
 *          unités (« 320 » est-il en centimètres ?) ou écartée ;
 *       3. la trame : les murs se rangent sur des AXES — tous les murs
 *          verticaux d'une même abscisse forment un axe ;
 *       4. les cotes deviennent des CONTRAINTES entre axes, chacune selon ce
 *          qu'elle mesure (entre axes, entre nus intérieurs, hors tout), et
 *          les axes se placent aux moindres carrés : là où toutes les cotes
 *          tombent juste. Une cote qui contredit les autres est écartée, et
 *          le rapport le dit ;
 *       5. les ouvertures se posent sur leur mur, à leur largeur cotée ; les
 *          pièces se referment, prennent leur nom ; les symboles se
 *          CONVERTISSENT à nos appareils (`convertirSymbole`) et se posent
 *          sur le mur le plus proche, ou au plafond.
 *
 * Le banc (`lectureplan.test.ts`) éprouve tout cela sur des centaines de
 * plans générés : conventions de cotes, unités, symboles d'autres écoles,
 * photos tournées, bruit de lecture, cotes mal lues.
 */
import { pointInPolygon } from './appearance';
import { CEILINGS, type CeilingFixture, type CeilingKind } from './ceiling';
import { FIXTURES, type Fixture, type FixtureKind } from './electrical';
import {
  detectRooms,
  mergeColinear,
  roomParts,
  segLength,
  splitAtJunctions,
  weldCorners,
  type Pt,
  type WallSeg,
} from './floorplan';

// ------------------------------------------------------------------ ce que l'IA rend

/** Un point de l'image, en millièmes de sa largeur (x) et de sa hauteur (y), y vers le bas. */
export type PointLu = [number, number];

/** Ce qu'une cote mesure : entre axes, entre nus intérieurs, hors tout. */
export type ReferenceDeCote = 'axes' | 'interieur' | 'exterieur' | 'inconnu';

/**
 * LA LECTURE BRUTE — telle que le serveur la rend (voir l'outil `plan_lu`
 * de `server/lecture-plan.php`). Tout ce qui n'est pas sûr est absent :
 * l'IA a pour consigne de taire plutôt que d'inventer.
 */
export interface LectureBrute {
  est_un_plan: boolean;
  /** Pourquoi ce n'est pas un plan, ou pourquoi il est illisible. */
  raison?: string;
  /** [x1, y1, x2, y2, épaisseur] : l'AXE de chaque pan droit de mur. */
  murs?: number[][];
  ouvertures?: {
    type: string;
    a: PointLu;
    b: PointLu;
    /** La largeur écrite, si le plan la cote (« 0,83 », « 90 »). */
    largeur?: string;
  }[];
  cotes?: {
    /** Le texte tel qu'écrit sur le plan : « 3,20 », « 320 », « 3.20 m ». */
    texte: string;
    /** Ce que l'IA en comprend, en mètres — relu ici, jamais cru sur parole. */
    metres?: number;
    a: PointLu;
    b: PointLu;
    reference?: ReferenceDeCote;
  }[];
  pieces?: {
    nom: string;
    point: PointLu;
    surface?: string;
    /**
     * Les coins INTÉRIEURS de la pièce, dans l'ordre du tour (le nu des
     * murs). Chaque côté longe un mur : là où aucun mur lu ne le borde, il
     * en devient un — voir `reconstruirePlan`, étape 3.
     */
    contour?: PointLu[];
  }[];
  /** Le rectangle du plan principal, [x1, y1, x2, y2] : le reste est écarté. */
  cadre?: number[];
  symboles?: {
    /** Ce que le symbole représente, en mots : « prise 16 A », « point lumineux ». */
    libelle: string;
    /** Le sigle écrit à côté, s'il y en a un : « PC », « S », « DCL ». */
    code?: string;
    point: PointLu;
    /** Combien de postes sous la même plaque (une double prise : 2). */
    nombre?: number;
    plafond?: boolean;
  }[];
  /** [i, j] : le symbole i (une commande) allume le symbole j. */
  liens?: number[][];
  /** Hauteur sous plafond, si le plan la donne (m). */
  hauteur?: number;
}

/** Les dimensions de la photo envoyée, en pixels. */
export interface ImageLue {
  largeur: number;
  hauteur: number;
}

// ------------------------------------------------------------------ les cotes

/**
 * UNE COTE, LUE COMME ON LA LIT SUR UN CHANTIER.
 *
 * « 3,20 », « 3.20 », « 3,20 m », « 320 », « 320 cm », « 3200 mm »,
 * « 3m20 », « 3 m 20 », « 0,83 ». L'unité écrite est prise au mot ; sans
 * unité, un nombre décimal est en mètres, un entier peut être en mètres, en
 * centimètres ou en millimètres — c'est l'échelle qui tranchera
 * (`metresCandidats`).
 */
export function lireCote(texte: string): { valeur: number; unite: 'm' | 'cm' | 'mm' | null; decimal: boolean } | null {
  const t = texte
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[≈~]/g, '')
    .trim();
  /*
    « 3m20 », « 3 m 20 » : des mètres, puis leur fraction. Et « 3m405 » —
    revue « Nadia » : le laser donne le millimètre, et la cote recopiée
    telle quelle était refusée. Ce qui suit le « m » se lit comme des
    décimales : « 3m2 » 3,20, « 3m05 » 3,05, « 3m405 » 3,405.
  */
  const mEtCm = /^(\d+)\s*m\s*(\d{1,3})$/.exec(t);
  if (mEtCm) {
    return { valeur: Number(`${mEtCm[1]}.${mEtCm[2]}`), unite: 'm', decimal: true };
  }
  const m = /^(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\.?$/.exec(t.replace(/(\d) (\d{3})\b/, '$1$2'));
  if (!m) return null;
  const decimal = /[.,]/.test(m[1]);
  const valeur = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(valeur) || valeur <= 0) return null;
  return { valeur, unite: (m[2] as 'm' | 'cm' | 'mm' | undefined) ?? null, decimal };
}

/** Les lectures possibles d'une cote, en mètres, de la plus probable à la moins. */
export function metresCandidats(texte: string, metresIA?: number): number[] {
  const lu = lireCote(texte);
  const out: number[] = [];
  if (lu) {
    if (lu.unite === 'm') out.push(lu.valeur);
    else if (lu.unite === 'cm') out.push(lu.valeur / 100);
    else if (lu.unite === 'mm') out.push(lu.valeur / 1000);
    else if (lu.decimal) out.push(lu.valeur, lu.valeur / 100);
    else out.push(lu.valeur / 100, lu.valeur / 1000, lu.valeur);
  }
  if (metresIA && metresIA > 0 && !out.some((v) => Math.abs(v - metresIA) < 1e-6)) out.push(metresIA);
  return out.filter((v) => v > 0.02 && v < 80);
}

// ------------------------------------------------------------------ les symboles

/** Sans accents, en minuscules, la ponctuation en espaces. */
const plat = (s: string) =>
  ` ${s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, ' ')
    .replace(/[^a-z0-9+×x]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;

/** Une règle de conversion : des mots qui disent un appareil. */
interface Regle {
  /** Au moins un de ces fragments (déjà « à plat », entourés d'espaces si mot entier). */
  mots: string[];
  /** L'appareil mural, ou celui du plafond. */
  mur?: FixtureKind;
  plafond?: CeilingKind;
  /** Si le plan ne dit pas « au plafond », l'appareil y va quand même. */
  toujoursAuPlafond?: boolean;
}

/*
  LA TABLE DES ÉQUIVALENCES — les symboles des autres, convertis aux nôtres.

  Un plan d'architecte, un plan de constructeur, un schéma d'électricien,
  un plan anglais : chacun nomme les choses à sa façon. L'IA dit ce qu'elle
  voit (« prise de courant 2P+T », « socket », « PC », « S ») ; cette table
  le ramène à l'un de nos appareils. L'ordre compte : la règle la plus
  précise passe avant la générale (« prise 20 A » avant « prise »).
*/
const REGLES: Regle[] = [
  { mots: [' tableau', ' tgbt ', ' gtl ', ' coffret ', ' panneau electrique', ' electrical panel', ' consumer unit', ' distribution board', ' disjoncteur general', ' tde '], mur: 'tableau' },
  { mots: [' daaf', ' daf ', ' detecteur de fumee', ' detecteur fumee', ' smoke', ' df '], plafond: 'daaf', toujoursAuPlafond: true },
  { mots: [' vmc', ' bouche d extraction', ' bouche extraction', ' extraction', ' extracteur', ' extract ', ' bouche '], plafond: 'vmc', toujoursAuPlafond: true },
  { mots: [' detecteur de presence', ' detecteur de mouvement', ' detecteur presence', ' pir ', ' motion'], plafond: 'detecteur', toujoursAuPlafond: true },
  { mots: [' camera', ' cctv'], plafond: 'camera', toujoursAuPlafond: true },
  { mots: [' ventilateur', ' brasseur', ' ceiling fan', ' fan '], plafond: 'ventilateur', toujoursAuPlafond: true },
  { mots: [' spot', ' encastre', ' downlight', ' led encastree'], plafond: 'spot', toujoursAuPlafond: true },
  { mots: [' plafonnier', ' applique plafond', ' luminaire plafond'], plafond: 'applique', toujoursAuPlafond: true },
  { mots: [' applique', ' wall light', ' sconce', ' lum ', ' lampe murale', ' eclairage mural'], mur: 'applique', plafond: 'applique' },
  { mots: [' dcl', ' point lumineux', ' point d eclairage', ' point eclairage', ' pl ', ' centre ', ' point de centre', ' ceiling light', ' light point', ' lampe au plafond', ' suspension', ' luminaire ', ' eclairage '], plafond: 'dcl', toujoursAuPlafond: true },
  { mots: [' thermostat', ' thermo ', ' sonde '], mur: 'thermostat' },
  { mots: [' boite de derivation', ' derivation', ' junction box', ' boite '], mur: 'boite' },
  { mots: [' sortie de cable', ' sortie cable', ' sc ', ' alimentation directe', ' radiateur', ' convecteur', ' seche serviette', ' chauffe eau', ' ballon', ' hotte', ' terminal ', ' cable outlet'], mur: 'sortieCable' },
  { mots: [' volet', ' vr ', ' store', ' shutter', ' blind'], mur: 'volet' },
  { mots: [' variateur', ' dimmer', ' var '], mur: 'variateur' },
  { mots: [' poussoir', ' bp ', ' push', ' minuterie', ' telerupteur'], mur: 'poussoir' },
  { mots: [' va et vient', ' va vient', ' vv ', ' 2 way', ' two way', ' 2way', ' va '], mur: 'va' },
  { mots: [' triple allumage', ' triple interrupteur', ' interrupteur triple', ' 3 allumages'], mur: 'inter3' },
  { mots: [' double allumage', ' double interrupteur', ' interrupteur double', ' 2 allumages', ' da ', ' double switch'], mur: 'inter2' },
  { mots: [' interrupteur', ' inter ', ' simple allumage', ' sa ', ' switch', ' s '], mur: 'inter' },
  { mots: [' rj45', ' rj 45', ' rj ', ' reseau', ' ethernet', ' data', ' informatique', ' communication', ' tel ', ' telephone', ' internet', ' grade '], mur: 'rj45' },
  { mots: [' tv', ' television', ' antenne', ' coax', ' tnt ', ' satellite'], mur: 'tv' },
  { mots: [' prise 32', ' 32a', ' 32 a', ' cuisson', ' plaque', ' cooker', ' hob '], mur: 'prise32' },
  { mots: [' prise 20', ' 20a', ' 20 a', ' specialis', ' dedie', ' lave linge', ' lave vaisselle', ' seche linge', ' four', ' congelateur', ' machine a laver', ' washing', ' dishwasher', ' oven'], mur: 'prise20' },
  { mots: [' prise triple', ' triple prise', ' 3 prises', ' bloc 3', ' 3pc', ' 3 pc'], mur: 'prise3' },
  { mots: [' prise double', ' double prise', ' 2 prises', ' 2pc', ' 2 pc', ' duplex', ' double socket'], mur: 'prise2' },
  { mots: [' prise', ' pc ', ' socket', ' outlet', ' 16a', ' 16 a', ' 2p t', ' 2p+t', ' courant', ' power'], mur: 'prise' },
];

/** Une règle trouvée dans un texte « à plat ». */
const trouver = (t: string) => REGLES.find((r) => r.mots.some((m) => t.includes(m)));

/**
 * CONVERTIT UN SYMBOLE LU EN L'UN DES NÔTRES.
 *
 * Le libellé d'abord, puis le sigle écrit à côté. Un ensemble se reconnaît
 * à ses mots (« RJ45 + prise », « prise TV et 2 prises ») et à son nombre de
 * postes : deux prises font une double prise, deux allumages un double
 * interrupteur. Ce qui n'est l'un d'aucun de nos appareils rend `null` — le
 * rapport le dit, on ne pose pas un appareil inventé.
 */
export function convertirSymbole(
  libelle: string,
  code?: string,
  nombre?: number,
  plafond?: boolean,
): { mur: FixtureKind } | { plafond: CeilingKind } | null {
  const t = plat(`${libelle} ${code ?? ''}`);
  const n = Math.max(1, Math.round(nombre ?? 1));
  const r = trouver(t) ?? (code ? trouver(plat(code)) : undefined);
  if (!r) return null;
  if (r.plafond && (r.toujoursAuPlafond || (plafond && !r.mur) || (plafond && r.mur === 'applique'))) {
    return { plafond: r.plafond };
  }
  if (!r.mur) return r.plafond ? { plafond: r.plafond } : null;
  let k: FixtureKind = r.mur;
  // Les ensembles de communication : la prise de courant qui les accompagne.
  const avecPrise = /( prise| pc | 16a| 16 a| socket| courant)/.test(t.replace(/ prise (rj|tv|tele|reseau|ethernet|data|informatique|antenne)\w*/g, ' '));
  const prisesEnPlus = /( 2 prises| double prise| prise double| 2pc| 2 pc)/.test(t) ? 2 : avecPrise ? 1 : 0;
  if (k === 'rj45') {
    if (prisesEnPlus >= 2 || (prisesEnPlus === 1 && n >= 3)) k = 'rjPrise2';
    else if (prisesEnPlus === 1) k = 'rjPrise';
    else if (n >= 2) k = 'rj2';
  } else if (k === 'tv') {
    if (prisesEnPlus >= 1) k = 'tvPrise';
  } else if (k === 'prise') {
    if (n >= 3) k = 'prise3';
    else if (n === 2) k = 'prise2';
  } else if (k === 'prise2' && n >= 3) {
    k = 'prise3';
  } else if (k === 'inter') {
    if (n >= 3) k = 'inter3';
    else if (n === 2) k = 'inter2';
  } else if (k === 'inter2' && n >= 3) {
    k = 'inter3';
  }
  return { mur: k };
}

// ------------------------------------------------------------------ la géométrie

/** Un segment en mètres, dans le repère redressé (x vers la droite, z vers le bas). */
interface Seg {
  a: Pt;
  b: Pt;
  ep: number | null;
}

/** La médiane : la valeur qu'aucune lecture aberrante ne déplace. */
function mediane(v: number[]): number {
  if (v.length === 0) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Une équation de la trame : Σ coef × inconnue = d, avec son poids. */
interface Equation {
  termes: [number, number][];
  d: number;
  poids: number;
}

/**
 * LES MOINDRES CARRÉS — les équations normales, résolues par élimination de
 * Gauss (pivot partiel). Une trame de plan compte rarement plus de quarante
 * axes : quatre-vingts inconnues avec leurs épaisseurs, c'est instantané.
 */
export function moindresCarres(n: number, equations: Equation[], repli: number[]): number[] {
  const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const r = new Array<number>(n).fill(0);
  for (const { termes, d, poids } of equations) {
    for (const [i, ci] of termes) {
      r[i] += poids * ci * d;
      for (const [j, cj] of termes) A[i][j] += poids * ci * cj;
    }
  }
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let l = c + 1; l < n; l++) if (Math.abs(A[l][c]) > Math.abs(A[p][c])) p = l;
    [A[c], A[p]] = [A[p], A[c]];
    [r[c], r[p]] = [r[p], r[c]];
    const piv = A[c][c];
    if (Math.abs(piv) < 1e-12) continue;
    for (let l = c + 1; l < n; l++) {
      const f = A[l][c] / piv;
      if (f === 0) continue;
      for (let k = c; k < n; k++) A[l][k] -= f * A[c][k];
      r[l] -= f * r[c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let c = n - 1; c >= 0; c--) {
    let s = r[c];
    for (let k = c + 1; k < n; k++) s -= A[c][k] * x[k];
    x[c] = Math.abs(A[c][c]) < 1e-12 ? repli[c] : s / A[c][c];
  }
  return x;
}

/**
 * LES MOINDRES CARRÉS DE LA TRAME, entre axes seulement.
 *
 * Chaque cote dit « l'axe j est à d de l'axe i » (poids 1) ; chaque axe se
 * souvient d'où l'IA l'a vu (poids faible) — c'est ce qui fixe l'origine et
 * place ce qu'aucune cote ne tient.
 */
export function placerLesAxes(
  mesures: number[],
  contraintes: { i: number; j: number; d: number }[],
  poidsMesure = 1e-4,
): number[] {
  return moindresCarres(
    mesures.length,
    [
      ...mesures.map((m, k) => ({ termes: [[k, 1]] as [number, number][], d: m, poids: poidsMesure })),
      ...contraintes.map(({ i, j, d }) => ({ termes: [[j, 1], [i, -1]] as [number, number][], d, poids: 1 })),
    ],
    mesures,
  );
}

/** Des valeurs voisines réunies : la position de chaque groupe, et le groupe de chaque valeur. */
function grouper(valeurs: number[], tol: number): { centres: number[]; de: number[] } {
  const ordre = valeurs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const de = new Array<number>(valeurs.length).fill(-1);
  const centres: number[] = [];
  let lot: { v: number; i: number }[] = [];
  const fermer = () => {
    if (lot.length === 0) return;
    const c = lot.reduce((s, x) => s + x.v, 0) / lot.length;
    for (const x of lot) de[x.i] = centres.length;
    centres.push(c);
    lot = [];
  };
  for (const x of ordre) {
    if (lot.length > 0 && x.v - lot[lot.length - 1].v > tol) fermer();
    lot.push(x);
  }
  fermer();
  return { centres, de };
}

/** Les largeurs de vantail du commerce : une porte lue à 82 cm en fait 83. */
const VANTAUX = [0.63, 0.73, 0.83, 0.93, 1.03, 1.2, 1.4, 1.6, 1.8, 2.4];

// ------------------------------------------------------------------ le rapport

export interface RapportDeLecture {
  /** Mètres par pixel de la photo, et d'où vient l'échelle. */
  echelle: number;
  echelleDepuis: 'cotes' | 'surfaces' | 'portes';
  cotes: {
    lues: number;
    /** Celles qui tiennent la trame. */
    retenues: number;
    /** Lues, mais contredites par les autres : écartées. */
    ecartees: { texte: string; raison: string }[];
    /** Corrigées d'unité (« 320 » lu en centimètres). */
    relues: number;
  };
  /** La part des axes que tient au moins une cote : 1 = tout est coté. */
  couverture: number;
  /**
   * CE QUE VAUT CHAQUE MUR — ce qui le place :
   *   — recoupés : deux cotes au moins, qui s'accordent ;
   *   — uniques : une seule cote, que rien ne vérifie ;
   *   — dessin : aucune cote, placé là où le dessin le montre ;
   *   — douteux : la résolution l'a emmené à plus de 12 cm du dessin.
   * `aVerifier` : les murs « dessin » ou « douteux », que l'écran montre.
   */
  murs: { recoupes: number; uniques: number; dessin: number; douteux: number; aVerifier: string[] };
  symboles: {
    lus: number;
    poses: number;
    /** Ce qu'on a converti à nos appareils : « socket » → « Prise 16 A ». */
    convertis: { lu: string; vers: string }[];
    /** Ce que rien ne reconnaît : pas posé, mais dit. */
    inconnus: string[];
  };
  /** Les surfaces écrites qui ne collent pas au plan reconstruit. */
  surfacesDouteuses: { piece: string; ecrite: number; calculee: number }[];
  confiance: 'bonne' | 'moyenne' | 'faible';
}

export interface PlanLu {
  walls: WallSeg[];
  openings: WallSeg[];
  rooms: { id: string; name: string; wallIds: string[] }[];
  fixtures: Fixture[];
  ceiling: CeilingFixture[];
  hauteur: number;
  rapport: RapportDeLecture;
}

export type ResultatDeLecture = { ok: true; plan: PlanLu } | { ok: false; raison: string };

// ------------------------------------------------------------------ la reconstruction

/** Hauteur sous plafond par défaut, et ses bornes raisonnables. */
const HSP = 2.5;
/**
 * Deux axes plus proches que ça sont le même mur (m). Pas davantage : deux
 * cloisons décalées de quinze centimètres, de part et d'autre d'un refend,
 * sont deux murs — fondues, l'une des deux pièces perdait sa cote.
 */
const TOL_AXE = 0.08;
/** Un bout de mur à moins de ça d'un axe s'y raccorde (m). */
const TOL_BOUT = 0.35;

/**
 * RECONSTRUIT LE PLAN À PARTIR DE SA LECTURE. Voir l'en-tête du module pour
 * la marche ; chaque étape est commentée là où elle se fait.
 */
export function reconstruirePlan(lu: LectureBrute, image: ImageLue): ResultatDeLecture {
  if (!lu || !lu.est_un_plan) {
    return { ok: false, raison: lu?.raison || 'Ce n’est pas un plan, ou il est illisible.' };
  }
  // 0. LE PLAN PRINCIPAL SEUL — voir `garderLePlanPrincipal`.
  const brut = garderLePlanPrincipal(lu);
  const W = Math.max(1, image.largeur);
  const H = Math.max(1, image.hauteur);
  /** Millièmes → pixels. */
  const px = (p: PointLu | number[]): { x: number; y: number } => ({ x: (p[0] / 1000) * W, y: (p[1] / 1000) * H });
  const mursBruts = (brut.murs ?? []).filter((m) => Array.isArray(m) && m.length >= 4 && m.slice(0, 4).every(Number.isFinite));
  const contours = contoursLus(brut);
  if (mursBruts.length < 3 && contours.length === 0) {
    return { ok: false, raison: 'Trop peu de murs lus : le plan est-il entier sur la photo ?' };
  }

  // 1. L'ORIENTATION — la direction dominante des murs, modulo l'équerre.
  let C = 0;
  let S = 0;
  // Les murs lus, et les côtés des pièces : tous disent l'équerre du plan.
  const traits = [
    ...mursBruts.map((m) => [m[0], m[1], m[2], m[3]]),
    ...contours.flatMap((c) => c.map((q, k) => [q[0], q[1], c[(k + 1) % c.length][0], c[(k + 1) % c.length][1]])),
  ];
  for (const m of traits) {
    const a = px([m[0], m[1]]);
    const b = px([m[2], m[3]]);
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const t = Math.atan2(b.y - a.y, b.x - a.x);
    C += L * Math.cos(4 * t);
    S += L * Math.sin(4 * t);
  }
  const theta = Math.atan2(S, C) / 4;
  const cos = Math.cos(-theta);
  const sin = Math.sin(-theta);
  const cx = W / 2;
  const cy = H / 2;
  /** Pixels → pixels redressés. */
  const redresse = (p: { x: number; y: number }) => ({
    x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
    y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
  });
  const ptR = (p: PointLu | number[]) => redresse(px(p));

  // 2. L'ÉCHELLE — mètres par pixel, à la médiane des cotes.
  const cotesBrutes = (brut.cotes ?? []).filter((c) => c && c.a && c.b && typeof c.texte === 'string');
  const longueurPx = (c: { a: PointLu; b: PointLu }) => {
    const a = ptR(c.a);
    const b = ptR(c.b);
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  // Premier passage : les lectures sans ambiguïté (unité écrite, ou décimale).
  const sures: number[] = [];
  for (const c of cotesBrutes) {
    const L = longueurPx(c);
    if (L < 5) continue;
    const lu = lireCote(c.texte);
    const v = lu && (lu.unite || lu.decimal) ? metresCandidats(c.texte)[0] : c.metres;
    if (v && v > 0.05) sures.push(v / L);
  }
  let echelle = mediane(sures);
  let echelleDepuis: RapportDeLecture['echelleDepuis'] = 'cotes';
  if (!Number.isFinite(echelle)) {
    // Sans cote : les surfaces écrites, puis la largeur d'une porte.
    echelle = NaN;
  }
  // Second passage : chaque cote prend l'unité qui colle à l'échelle.
  let relues = 0;
  const cotesM: { texte: string; d: number; a: Pt; b: Pt; ref: ReferenceDeCote; L: number }[] = [];
  const ecartees: RapportDeLecture['cotes']['ecartees'] = [];
  if (Number.isFinite(echelle)) {
    for (const c of cotesBrutes) {
      const L = longueurPx(c);
      if (L < 5) continue;
      const cands = metresCandidats(c.texte, c.metres);
      if (cands.length === 0) {
        ecartees.push({ texte: c.texte, raison: 'illisible' });
        continue;
      }
      const attendu = L * echelle;
      let mieux = cands[0];
      for (const v of cands) if (Math.abs(Math.log(v / attendu)) < Math.abs(Math.log(mieux / attendu))) mieux = v;
      if (Math.abs(mieux - attendu) > Math.max(0.25, attendu * 0.12)) {
        ecartees.push({ texte: c.texte, raison: 'ne colle pas au dessin' });
        continue;
      }
      if (mieux !== cands[0]) relues += 1;
      const a = ptR(c.a);
      const b = ptR(c.b);
      cotesM.push({
        texte: c.texte,
        d: mieux,
        a: { x: a.x * echelle, z: a.y * echelle },
        b: { x: b.x * echelle, z: b.y * echelle },
        ref: c.reference ?? 'inconnu',
        L,
      });
    }
    // L'échelle se refait sur les cotes retenues.
    const e2 = mediane(cotesM.map((c) => c.d / c.L));
    if (Number.isFinite(e2)) {
      const k = e2 / echelle;
      echelle = e2;
      for (const c of cotesM) {
        c.a = { x: c.a.x * k, z: c.a.z * k };
        c.b = { x: c.b.x * k, z: c.b.z * k };
      }
    }
  }
  if (!Number.isFinite(echelle)) {
    // LES SURFACES ÉCRITES, faute de cote : l'aire d'une pièce donne l'échelle au carré.
    echelle = echelleDesSurfaces(brut, ptR, mursBruts);
    echelleDepuis = 'surfaces';
  }
  if (!Number.isFinite(echelle)) {
    // LA LARGEUR D'UNE PORTE, en dernier recours : 0,83 m, la plus courante.
    const portes = (brut.ouvertures ?? []).filter((o) => /porte/.test(plat(o.type ?? '')) && !/fenetre/.test(plat(o.type ?? '')));
    const largeurs = portes.map((o) => {
      const a = ptR(o.a);
      const b = ptR(o.b);
      return Math.hypot(b.x - a.x, b.y - a.y);
    });
    const l = mediane(largeurs.filter((v) => v > 3));
    if (Number.isFinite(l)) {
      echelle = 0.83 / l;
      echelleDepuis = 'portes';
    }
  }
  if (!Number.isFinite(echelle) || echelle <= 0) {
    return { ok: false, raison: 'Aucune cote lisible : le plan ne peut pas être mis à l’échelle. Photographiez-le avec ses cotes.' };
  }
  const enM = (p: PointLu | number[]): Pt => {
    const q = ptR(p);
    return { x: q.x * echelle, z: q.y * echelle };
  };

  // 3. LES MURS, D'ÉQUERRE — et un mur dessiné deux fois (ses deux nus) n'en fait qu'un.
  let segs: Seg[] = mursBruts.map((m) => {
    const a = enM([m[0], m[1]]);
    const b = enM([m[2], m[3]]);
    const ep = m.length >= 5 && Number.isFinite(m[4]) && m[4] > 0 ? ((m[4] / 1000) * W * echelle) : null;
    return { a, b, ep };
  });
  segs = segs.filter((s) => Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) > 0.08);
  const sens = (s: Seg): 'h' | 'v' | 'o' => {
    const dx = Math.abs(s.b.x - s.a.x);
    const dz = Math.abs(s.b.z - s.a.z);
    if (dz <= dx * Math.tan((10 * Math.PI) / 180)) return 'h';
    if (dx <= dz * Math.tan((10 * Math.PI) / 180)) return 'v';
    return 'o';
  };
  /*
    LES CONTOURS DES PIÈCES TIENNENT LES MURS — relevé du patron : « il a
    scanné cela, rien à voir, manque beaucoup de murs ». L'IA trace mieux une
    pièce, ancrée à son nom, qu'une liste de soixante segments. Chaque côté
    d'un contour longe un mur, sur son nu : là où aucun mur lu ne le borde
    (parallèle, à moins de 30 cm, sur la moitié de sa longueur), il en
    devient un. Les côtés de deux pièces voisines, à l'épaisseur d'une
    cloison l'un de l'autre, se fondent ensuite en UNE cloison, au milieu
    (`fusionnerLesNus`).
  */
  const faces: Seg[] = contours.flatMap((c) =>
    c.map((q, k) => ({ a: enM(q), b: enM(c[(k + 1) % c.length]), ep: null as number | null })),
  ).filter((s) => Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) > 0.15);
  // Lus ou déduits, tous se mettent d'équerre de la même façon.
  for (const s of [...segs, ...faces]) {
    if (sens(s) === 'h') {
      const z = (s.a.z + s.b.z) / 2;
      const x0 = Math.min(s.a.x, s.b.x);
      const x1 = Math.max(s.a.x, s.b.x);
      s.a = { x: x0, z };
      s.b = { x: x1, z };
    } else if (sens(s) === 'v') {
      const x = (s.a.x + s.b.x) / 2;
      const z0 = Math.min(s.a.z, s.b.z);
      const z1 = Math.max(s.a.z, s.b.z);
      s.a = { x, z: z0 };
      s.b = { x, z: z1 };
    }
  }
  const lus = [...segs];
  for (const f of faces) {
    const s = sens(f);
    if (s === 'o') {
      segs.push(f);
      continue;
    }
    const pos = (v: Seg) => (s === 'h' ? v.a.z : v.a.x);
    const lo = (v: Seg) => (s === 'h' ? v.a.x : v.a.z);
    const hi = (v: Seg) => (s === 'h' ? v.b.x : v.b.z);
    const borde = lus.some(
      (m) =>
        sens(m) === s &&
        Math.abs(pos(m) - pos(f)) <= 0.3 &&
        Math.min(hi(m), hi(f)) - Math.max(lo(m), lo(f)) >= (hi(f) - lo(f)) * 0.5,
    );
    if (!borde) segs.push(f);
  }
  segs = fusionnerLesNus(segs, sens);

  // 4. LA TRAME — les axes verticaux (x) et horizontaux (z).
  const verticaux = segs.filter((s) => sens(s) === 'v');
  const horizontaux = segs.filter((s) => sens(s) === 'h');
  const gx = grouper(verticaux.map((s) => s.a.x), TOL_AXE);
  const gz = grouper(horizontaux.map((s) => s.a.z), TOL_AXE);
  const epDe = (lot: Seg[], de: number[], k: number, bord: boolean) => {
    const e = lot.filter((_, i) => de[i] === k).map((s) => s.ep).filter((v): v is number => !!v);
    const v = e.length ? mediane(e) : bord ? 0.2 : 0.1;
    return Math.round(Math.min(0.6, Math.max(0.05, v)) * 100) / 100;
  };
  const minX = Math.min(...gx.centres);
  const maxX = Math.max(...gx.centres);
  const minZ = Math.min(...gz.centres);
  const maxZ = Math.max(...gz.centres);
  const epX = gx.centres.map((c, k) => epDe(verticaux, gx.de, k, c === minX || c === maxX));
  const epZ = gz.centres.map((c, k) => epDe(horizontaux, gz.de, k, c === minZ || c === maxZ));

  // 5. LES COTES DEVIENNENT DES ÉQUATIONS — sur les axes ET sur les épaisseurs.
  /*
    UNE COTE MESURE ENTRE DEUX NUS, PAS ENTRE DEUX AXES. Un mur a deux faces,
    à une demi-épaisseur de part et d'autre de son axe : la cote d'une pièce
    va d'un nu intérieur à l'autre, la cote hors tout d'un nu extérieur à
    l'autre, une chaîne d'architecte souvent d'axe en axe. Chaque cote
    s'écrit donc

        (X_j + σj·T_j) − (X_i + σi·T_i) = d,      σ ∈ {−1, 0, +1}

    où X est la position d'un axe et T sa demi-épaisseur — et T est une
    INCONNUE au même titre que X. Une cote hors tout, les cotes intérieures
    des pièces et une chaîne d'axes ensemble disent l'épaisseur de chaque
    mur, au millimètre ; à défaut, elle garde celle que le dessin montre.
  */
  const proche = (centres: number[], eps: number[], v: number) => {
    let mieux = -1;
    let ecart = Infinity;
    centres.forEach((c, k) => {
      const e = Math.abs(v - c);
      if (e < eps[k] / 2 + 0.3 && e < ecart) {
        ecart = e;
        mieux = k;
      }
    });
    return mieux;
  };
  /** `douteuse` : sa référence n'est pas dite, ou ne colle pas — elle se décide après. */
  type Cote = { i: number; j: number; si: number; sj: number; d: number; c: number; douteuse: boolean; dedans: boolean };
  const cotesX: Cote[] = [];
  const cotesZ: Cote[] = [];
  const FACES: Record<ReferenceDeCote, [number, number][]> = {
    axes: [[0, 0]],
    interieur: [[1, -1]],
    exterieur: [[-1, 1]],
    inconnu: [-1, 0, 1].flatMap((si) => [-1, 0, 1].map((sj) => [si, sj] as [number, number])),
  };
  cotesM.forEach((c, ci) => {
    const dx = Math.abs(c.b.x - c.a.x);
    const dz = Math.abs(c.b.z - c.a.z);
    const horizontale = dx >= dz * 3;
    const verticale = dz >= dx * 3;
    if (!horizontale && !verticale) return;
    const [centres, eps, va, vb, out] = horizontale
      ? [gx.centres, epX, c.a.x, c.b.x, cotesX]
      : [gz.centres, epZ, c.a.z, c.b.z, cotesZ];
    // La ligne de cote passe-t-elle DANS le logement ? Alors elle cote une pièce.
    const travers = horizontale ? (c.a.z + c.b.z) / 2 : (c.a.x + c.b.x) / 2;
    const dedans = horizontale ? travers > minZ + 0.1 && travers < maxZ - 0.1 : travers > minX + 0.1 && travers < maxX - 0.1;
    let i = proche(centres, eps, va);
    let j = proche(centres, eps, vb);
    if (i < 0 || j < 0 || i === j) return;
    if (centres[i] > centres[j]) [i, j] = [j, i];
    // La lecture qui colle au dessin : la référence dite, sinon la plus proche.
    const ecartDe = ([si, sj]: [number, number]) =>
      Math.abs(centres[j] + (sj * eps[j]) / 2 - (centres[i] + (si * eps[i]) / 2) - c.d);
    const meilleure = (choix: [number, number][]) => choix.reduce((m, x) => (ecartDe(x) < ecartDe(m) ? x : m), choix[0]);
    let f = meilleure(FACES[c.ref] ?? FACES.inconnu);
    let douteuse = c.ref === 'inconnu' || !FACES[c.ref];
    if (ecartDe(f) > 0.3) {
      f = meilleure(FACES.inconnu);
      douteuse = true;
    }
    // L'usage de l'architecte : une cote tracée dans une pièce va de nu à nu.
    if (douteuse && dedans && ecartDe([1, -1]) < 0.12) f = [1, -1];
    out.push({ i, j, si: f[0], sj: f[1], d: c.d, c: ci, douteuse, dedans });
  });

  // Les moindres carrés, et ce qui les contredit s'en va — une cote à la fois.
  const resoudre = (centres: number[], eps: number[], cs: Cote[]) => {
    const n = centres.length;
    const repli = [...centres, ...eps.map((e) => e / 2)];
    const resous = (actives: Cote[]) =>
      moindresCarres(
        2 * n,
        [
          ...centres.map((m, k) => ({ termes: [[k, 1]] as [number, number][], d: m, poids: 1e-4 })),
          // L'épaisseur que montre le dessin : un rappel, que les cotes l'emportent.
          ...eps.map((e, k) => ({ termes: [[n + k, 1]] as [number, number][], d: e / 2, poids: 0.02 })),
          ...actives.map((c) => ({
            termes: [
              [c.j, 1],
              [c.i, -1],
              [n + c.j, c.sj],
              [n + c.i, -c.si],
            ].filter(([, coef]) => coef !== 0) as [number, number][],
            d: c.d,
            poids: 1,
          })),
        ],
        repli,
      );
    /*
      CE QUE MESURE UNE COTE QU'ON N'A PAS SU QUALIFIER — l'usage de
      l'architecte, d'abord : tracée DANS une pièce, elle va de nu à nu ;
      tracée dehors d'un bout à l'autre du logement, c'est le hors-tout ;
      dehors entre deux murs, c'est une chaîne d'axes. Décider sur
      l'épaisseur que montre le dessin, c'était tirer au sort entre deux
      lectures voisines : à 25 % près sur une épaisseur, on se trompe d'un nu.
    */
    const iMin = centres.indexOf(Math.min(...centres));
    const iMax = centres.indexOf(Math.max(...centres));
    for (const c of cs) {
      if (!c.douteuse) continue;
      [c.si, c.sj] = c.dedans ? [1, -1] : c.i === iMin && c.j === iMax ? [-1, 1] : [0, 0];
    }
    let actives = [...cs];
    const residuDans = (v: number[], c: Cote) => Math.abs(v[c.j] + c.sj * v[n + c.j] - (v[c.i] + c.si * v[n + c.i]) - c.d);
    // Une cote s'écrit au centimètre : un demi-centimètre d'arrondi, deux
    // cotes qui s'additionnent — au-delà de 1,2 cm, elle contredit.
    const SEUIL = 0.012;
    /**
     * CE QUE VAUT UNE TRAME. Le pire écart à une cote, plus une pénalité
     * pour chaque invraisemblance : une épaisseur hors de 3 à 65 cm, un axe
     * que la résolution a emmené à plus de 25 cm de là où le dessin le
     * montre. Les épaisseurs étant inconnues, des cotes contradictoires
     * peuvent toujours s'accorder en déformant les murs : c'est la
     * vraisemblance qui les départage.
     */
    const evaluer = (liste: Cote[]) => {
      const v = resous(liste);
      let pire = 0;
      for (const c of liste) pire = Math.max(pire, residuDans(v, c));
      const dec = v.slice(0, n).map((y, k) => y - centres[k]);
      const med = mediane(dec);
      const suspects = new Set<number>();
      for (let k = 0; k < n; k++) {
        const e = 2 * v[n + k];
        if (e < 0.03 || e > 0.65 || Math.abs(dec[k] - med) > 0.25) suspects.add(k);
      }
      return { v, pire, suspects, cout: pire + suspects.size };
    };
    let etat = evaluer(actives);
    const relues = new Set<Cote>();
    /*
      UNE COTE QUI CONTREDIT LES AUTRES S'EN VA — mais laquelle ? Pas
      forcément celle qui s'écarte le plus : les moindres carrés répartissent
      la faute. On essaie donc, à chaque tour, d'écarter chaque cote en cause
      — ou de RELIRE celle dont on ne savait pas ce qu'elle mesure —, et l'on
      garde la trame la plus vraisemblable. Une cote dont la référence était
      dite ne se relit pas : elle s'écarte.
    */
    for (let tour = 0; tour < 30; tour++) {
      if (etat.pire <= SEUIL && etat.suspects.size === 0) break;
      const enCause = actives.filter(
        (c) => residuDans(etat.v, c) > SEUIL / 3 || etat.suspects.has(c.i) || etat.suspects.has(c.j),
      );
      let mieux: { cout: number; appliquer: () => void } | null = null;
      for (const c of enCause) {
        const sans = actives.filter((x) => x !== c);
        const e = evaluer(sans);
        // Écarter coûte un peu : on préfère relire quand c'est aussi bon.
        if (!mieux || e.cout + 0.002 < mieux.cout) {
          mieux = {
            cout: e.cout + 0.002,
            appliquer: () => {
              ecartees.push({
                texte: cotesM[c.c].texte,
                raison: `contredite par les autres cotes (${Math.round(residuDans(etat.v, c) * 100)} cm)`,
              });
              actives = sans;
              etat = e;
            },
          };
        }
        if (!c.douteuse || relues.has(c)) continue;
        const avant: [number, number] = [c.si, c.sj];
        for (const f of FACES.inconnu) {
          if (f[0] === avant[0] && f[1] === avant[1]) continue;
          [c.si, c.sj] = f;
          const e2 = evaluer(actives);
          if (e2.cout < mieux.cout) {
            const choisi = f;
            mieux = {
              cout: e2.cout,
              appliquer: () => {
                [c.si, c.sj] = choisi;
                relues.add(c);
                etat = e2;
              },
            };
          }
        }
        [c.si, c.sj] = avant;
      }
      if (!mieux || mieux.cout >= etat.pire + etat.suspects.size) break;
      mieux.appliquer();
    }
    const x = etat.v;
    const ep = x.slice(n).map((t) => Math.round(Math.min(0.6, Math.max(0.05, 2 * t)) * 100) / 100);
    // Ce qui tient chaque axe : combien de cotes, et de combien il a quitté le dessin.
    const tenue = new Array<number>(n).fill(0);
    for (const c of actives) {
      tenue[c.i] += 1;
      tenue[c.j] += 1;
    }
    const dec = x.slice(0, n).map((y, k) => y - centres[k]);
    const med = mediane(dec);
    return { x: x.slice(0, n), ep, actives, tenue, ecartDessin: dec.map((d) => Math.abs(d - med)) };
  };
  const rx = resoudre(gx.centres, epX, cotesX);
  const rz = resoudre(gz.centres, epZ, cotesZ);
  const X = rx.x;
  const Z = rz.x;
  for (let k = 0; k < epX.length; k++) epX[k] = rx.ep[k];
  for (let k = 0; k < epZ.length; k++) epZ[k] = rz.ep[k];
  const tenus = new Set<string>();
  for (const c of rx.actives) tenus.add(`x${c.i}`).add(`x${c.j}`);
  for (const c of rz.actives) tenus.add(`z${c.i}`).add(`z${c.j}`);
  const couverture = (tenus.size || 0) / Math.max(1, X.length + Z.length);

  // 6. LES MURS SUR LA TRAME — chaque bout se raccorde à l'axe qui le croise.
  const bout = (centres: number[], resolus: number[], v: number) => {
    let mieux = v;
    let ecart = TOL_BOUT;
    centres.forEach((c, k) => {
      const e = Math.abs(v - c);
      if (e < ecart) {
        ecart = e;
        mieux = resolus[k];
      }
    });
    return mieux;
  };
  const bruts: WallSeg[] = [];
  const hsp = brut.hauteur && brut.hauteur > 2 && brut.hauteur < 4.5 ? brut.hauteur : HSP;
  let nMur = 0;
  const mur = (a: Pt, b: Pt, ep: number): WallSeg => ({
    id: `lu-mur-${++nMur}`,
    type: 'wall',
    a,
    b,
    height: hsp,
    yCenter: hsp / 2,
    epaisseur: ep,
  });
  verticaux.forEach((s, i) => {
    const k = gx.de[i];
    const x = X[k];
    const z0 = bout(gz.centres, Z, s.a.z);
    const z1 = bout(gz.centres, Z, s.b.z);
    if (Math.abs(z1 - z0) > 0.05) bruts.push(mur({ x, z: z0 }, { x, z: z1 }, epX[k]));
  });
  horizontaux.forEach((s, i) => {
    const k = gz.de[i];
    const z = Z[k];
    const x0 = bout(gx.centres, X, s.a.x);
    const x1 = bout(gx.centres, X, s.b.x);
    if (Math.abs(x1 - x0) > 0.05) bruts.push(mur({ x: x0, z }, { x: x1, z }, epZ[k]));
  });
  for (const s of segs.filter((v) => sens(v) === 'o')) {
    const a = { x: bout(gx.centres, X, s.a.x), z: bout(gz.centres, Z, s.a.z) };
    const b = { x: bout(gx.centres, X, s.b.x), z: bout(gz.centres, Z, s.b.z) };
    bruts.push(mur(a, b, s.ep ? Math.round(s.ep * 100) / 100 : 0.14));
  }
  // L'origine au coin du logement : le plan commence en (0, 0).
  const ox = Math.min(...bruts.flatMap((w) => [w.a.x, w.b.x]));
  const oz = Math.min(...bruts.flatMap((w) => [w.a.z, w.b.z]));
  const deplace = (p: Pt): Pt => ({ x: arrondi(p.x - ox), z: arrondi(p.z - oz) });
  const walls = mergeColinear(
    splitAtJunctions(weldCorners(bruts.map((w) => ({ ...w, a: deplace(w.a), b: deplace(w.b) })), 0.06)),
  ).map((w, i) => ({ ...w, id: `lu-mur-${i + 1}` }));
  /** Un point lu, dans le repère final du plan. */
  const auPlan = (p: PointLu | number[]): Pt => {
    const q = enM(p);
    return { x: q.x - ox, z: q.z - oz };
  };

  // 7. LES OUVERTURES, sur leur mur, à leur largeur.
  const openings: WallSeg[] = [];
  (brut.ouvertures ?? []).forEach((o, i) => {
    if (!o?.a || !o?.b) return;
    const a = auPlan(o.a);
    const b = auPlan(o.b);
    const milieu = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const sur = murSous(walls, milieu, 0.45);
    if (!sur) return;
    const { w, along } = sur;
    const len = segLength(w);
    const u = { x: (w.b.x - w.a.x) / len, z: (w.b.z - w.a.z) / len };
    const projette = (p: Pt) => (p.x - w.a.x) * u.x + (p.z - w.a.z) * u.z;
    let largeur = Math.abs(projette(b) - projette(a));
    const ecrite = o.largeur ? metresCandidats(o.largeur).find((v) => Math.abs(v - largeur) < Math.max(0.2, largeur * 0.3)) : undefined;
    if (ecrite) largeur = ecrite;
    else {
      const v = VANTAUX.find((x) => Math.abs(x - largeur) < 0.06);
      if (v) largeur = v;
    }
    largeur = Math.min(largeur, len - 0.02);
    if (largeur < 0.3) return;
    const centre = Math.min(len - largeur / 2, Math.max(largeur / 2, along));
    const p0 = { x: arrondi(w.a.x + u.x * (centre - largeur / 2)), z: arrondi(w.a.z + u.z * (centre - largeur / 2)) };
    const p1 = { x: arrondi(w.a.x + u.x * (centre + largeur / 2)), z: arrondi(w.a.z + u.z * (centre + largeur / 2)) };
    const t = plat(o.type ?? '');
    const id = `lu-baie-${i + 1}`;
    if (/porte fenetre|baie vitree|baie coulissante|french window|patio/.test(t)) {
      openings.push({ id, type: 'window', a: p0, b: p1, height: 2.15, yCenter: 2.15 / 2 });
    } else if (/fenetre|window|chassis|velux|lucarne/.test(t)) {
      openings.push({ id, type: 'window', a: p0, b: p1, height: 1.2, yCenter: 0.95 + 0.6 });
    } else if (/passage|baie|ouverture|opening|arche/.test(t)) {
      openings.push({ id, type: 'opening', a: p0, b: p1, height: 2.1, yCenter: 1.05, open: true });
    } else {
      openings.push({ id, type: 'door', a: p0, b: p1, height: 2.04, yCenter: 1.02 });
    }
  });

  // 8. LES PIÈCES — refermées par les murs, nommées par leurs étiquettes.
  const detectees = detectRooms(walls);
  const mursDe = new Map(detectees.map((r, i) => [`lu-piece-${i + 1}`, r.wallIds]));
  const parts = roomParts(
    walls,
    detectees.map((r, i) => ({ id: `lu-piece-${i + 1}`, wallIds: r.wallIds })),
  ).filter((p) => p.surface);
  const etiquettes = (brut.pieces ?? []).filter((p) => p?.nom && p.point);
  const surfacesDouteuses: RapportDeLecture['surfacesDouteuses'] = [];
  const rooms = parts.map((p, i) => {
    const pts = p.surface?.pts ?? [];
    const qui = etiquettes.find((e) => pointInPolygon(auPlan(e.point), pts));
    const nom = qui ? nomDePiece(qui.nom) : `Pièce ${i + 1}`;
    if (qui?.surface && p.surface) {
      const lue = lireCote(qui.surface.replace(/m(²|2)/i, '').trim());
      if (lue && Math.abs(lue.valeur - p.surface.area) > Math.max(0.6, lue.valeur * 0.08)) {
        surfacesDouteuses.push({ piece: nom, ecrite: lue.valeur, calculee: Math.round(p.surface.area * 10) / 10 });
      }
    }
    return { id: p.roomId, name: nom, wallIds: mursDe.get(p.roomId) ?? [] };
  });

  // 9. LES SYMBOLES, convertis aux nôtres et posés.
  const fixtures: Fixture[] = [];
  const ceiling: CeilingFixture[] = [];
  const convertis: RapportDeLecture['symboles']['convertis'] = [];
  const inconnus: string[] = [];
  const idDuSymbole = new Map<number, { mur?: string; plafond?: string }>();
  (brut.symboles ?? []).forEach((s, i) => {
    if (!s?.point || !s.libelle) return;
    const c = convertirSymbole(s.libelle, s.code, s.nombre, s.plafond);
    if (!c) {
      inconnus.push(s.code ? `${s.libelle} (${s.code})` : s.libelle);
      return;
    }
    const ici = auPlan(s.point);
    if ('plafond' in c) {
      const part = parts.find((p) => pointInPolygon(ici, p.surface?.pts ?? [])) ?? parts[0];
      if (!part) return;
      const id = `lu-plafond-${i + 1}`;
      ceiling.push({ id, kind: c.plafond, roomId: part.roomId, at: { x: arrondi(ici.x), z: arrondi(ici.z) } });
      idDuSymbole.set(i, { plafond: id });
      convertis.push({ lu: s.libelle, vers: CEILINGS[c.plafond].label });
      return;
    }
    const sur = murSous(walls, ici, 1.0);
    if (!sur) {
      inconnus.push(`${s.libelle} (loin de tout mur)`);
      return;
    }
    const { w, along, side } = sur;
    const len = segLength(w);
    const id = `lu-appareil-${i + 1}`;
    fixtures.push({
      id,
      kind: c.mur,
      wallId: w.id,
      along: arrondi(Math.min(len - 0.1, Math.max(0.1, along))),
      height: FIXTURES[c.mur].std,
      side,
    });
    idDuSymbole.set(i, { mur: id });
    convertis.push({ lu: s.libelle, vers: FIXTURES[c.mur].label });
  });
  // Les liens de commande : l'interrupteur et ce qu'il allume.
  for (const l of brut.liens ?? []) {
    if (!Array.isArray(l) || l.length < 2) continue;
    const cmd = idDuSymbole.get(l[0])?.mur;
    const cible = idDuSymbole.get(l[1]);
    if (!cmd || !cible) continue;
    if (cible.plafond) {
      const cl = ceiling.find((x) => x.id === cible.plafond);
      if (cl) cl.commands = [...new Set([...(cl.commands ?? []), cmd])];
    } else if (cible.mur) {
      const f = fixtures.find((x) => x.id === cible.mur);
      if (f) f.commands = [...new Set([...(f.commands ?? []), cmd])];
    }
  }

  const retenues = rx.actives.length + rz.actives.length;
  // L'état de chaque mur, par l'axe qui le porte.
  const etatDe = (tenue: number, ecart: number) =>
    ecart > 0.12 ? 'douteux' : tenue >= 2 ? 'recoupes' : tenue === 1 ? 'uniques' : 'dessin';
  const murs = { recoupes: 0, uniques: 0, dessin: 0, douteux: 0, aVerifier: [] as string[] };
  for (const w of walls) {
    const vertical = Math.abs(w.a.x - w.b.x) < 1e-6;
    const horizontal = Math.abs(w.a.z - w.b.z) < 1e-6;
    if (!vertical && !horizontal) {
      murs.dessin += 1;
      murs.aVerifier.push(w.id);
      continue;
    }
    const [resolus, r] = vertical ? [X, rx] : [Z, rz];
    const v = vertical ? w.a.x + ox : w.a.z + oz;
    let k = 0;
    resolus.forEach((y, i) => {
      if (Math.abs(y - v) < Math.abs(resolus[k] - v)) k = i;
    });
    const e = etatDe(r.tenue[k] ?? 0, r.ecartDessin[k] ?? 0);
    murs[e] += 1;
    if (e === 'dessin' || e === 'douteux') murs.aVerifier.push(w.id);
  }
  const fragiles = murs.dessin + murs.douteux;
  const confiance: RapportDeLecture['confiance'] =
    echelleDepuis !== 'cotes' || retenues === 0 || fragiles > walls.length * 0.3
      ? 'faible'
      : fragiles === 0 && ecartees.length === 0 && murs.uniques <= walls.length * 0.5
        ? 'bonne'
        : 'moyenne';
  return {
    ok: true,
    plan: {
      walls,
      openings,
      rooms,
      fixtures,
      ceiling,
      hauteur: hsp,
      rapport: {
        echelle,
        echelleDepuis,
        cotes: { lues: cotesBrutes.length, retenues, ecartees, relues },
        couverture,
        murs,
        symboles: {
          lus: (brut.symboles ?? []).length,
          poses: fixtures.length + ceiling.length,
          convertis,
          inconnus,
        },
        surfacesDouteuses,
        confiance,
      },
    },
  };
}

/** Au millimètre : le plan ne porte pas les décimales d'une division. */
const arrondi = (v: number) => Math.round(v * 1000) / 1000;

/** « SÉJOUR », « séjour / cuisine » → « Séjour », « Séjour / cuisine ». */
function nomDePiece(nom: string): string {
  const t = nom.replace(/\s+/g, ' ').replace(/\s*\d+[.,]?\d*\s*m(²|2)\s*$/i, '').trim();
  if (!t) return 'Pièce';
  if (t !== t.toUpperCase()) return t.charAt(0).toUpperCase() + t.slice(1);
  // En capitales : on les baisse, sauf les sigles qu'on écrit ainsi (WC, SDB…).
  const bas = t
    .split(' ')
    .map((m) => (SIGLES_DE_PIECE.has(m.replace(/[^A-Z0-9]/g, '')) ? m : m.toLowerCase()))
    .join(' ');
  return bas.charAt(0).toUpperCase() + bas.slice(1);
}

/** Les sigles qu'une pièce garde en capitales. */
const SIGLES_DE_PIECE = new Set(['WC', 'SDB', 'SDE', 'DGT', 'RDC', 'GTL', 'CH', 'CH1', 'CH2', 'CH3', 'CH4']);

/**
 * LE MUR SOUS UN POINT — le plus proche, à moins de `portee` mètres, avec
 * l'abscisse du point le long de lui et le côté où il se trouve.
 */
function murSous(walls: WallSeg[], p: Pt, portee: number): { w: WallSeg; along: number; side: 1 | -1 } | null {
  let mieux: { w: WallSeg; along: number; side: 1 | -1; d: number } | null = null;
  for (const w of walls) {
    const len = segLength(w);
    if (len < 1e-6) continue;
    const ux = (w.b.x - w.a.x) / len;
    const uz = (w.b.z - w.a.z) / len;
    const along = (p.x - w.a.x) * ux + (p.z - w.a.z) * uz;
    if (along < -0.05 || along > len + 0.05) continue;
    const ecart = (p.x - w.a.x) * -uz + (p.z - w.a.z) * ux;
    const d = Math.abs(ecart);
    if (d > portee) continue;
    if (!mieux || d < mieux.d) mieux = { w, along: Math.min(len, Math.max(0, along)), side: ecart >= 0 ? 1 : -1, d };
  }
  return mieux;
}

/**
 * LES DEUX NUS D'UN MÊME MUR N'EN FONT QU'UN. Un plan dessine un mur par
 * ses deux faces ; l'IA a pour consigne d'en donner l'axe, mais un trait
 * double peut lui échapper. Deux traits parallèles à moins de 50 cm qui se
 * recouvrent sur plus de 60 % deviennent un mur, à mi-distance, de
 * l'épaisseur qui les sépare : aucune pièce n'est si étroite, et la lecture
 * bruitée écarte parfois les deux nus d'un mur de vingt centimètres
 * jusqu'à trente-cinq.
 */
function fusionnerLesNus(segs: Seg[], sens: (s: Seg) => 'h' | 'v' | 'o'): Seg[] {
  const out = [...segs];
  let change = true;
  while (change) {
    change = false;
    for (let i = 0; i < out.length && !change; i++) {
      for (let j = i + 1; j < out.length && !change; j++) {
        const a = out[i];
        const b = out[j];
        const s = sens(a);
        if (s === 'o' || s !== sens(b)) continue;
        const pos = (v: Seg) => (s === 'h' ? v.a.z : v.a.x);
        const lo = (v: Seg) => (s === 'h' ? v.a.x : v.a.z);
        const hi = (v: Seg) => (s === 'h' ? v.b.x : v.b.z);
        const ecart = Math.abs(pos(a) - pos(b));
        if (ecart < 0.04 || ecart > 0.5) {
          // Le même trait lu deux fois : il se fond aussi.
          if (ecart >= 0.04) continue;
        }
        const recouvre = Math.min(hi(a), hi(b)) - Math.max(lo(a), lo(b));
        const court = Math.min(hi(a) - lo(a), hi(b) - lo(b));
        if (recouvre < court * 0.6) continue;
        const m = (pos(a) + pos(b)) / 2;
        const l0 = Math.min(lo(a), lo(b));
        const l1 = Math.max(hi(a), hi(b));
        const ep = ecart >= 0.04 ? Math.max(ecart, a.ep ?? 0, b.ep ?? 0) : (a.ep ?? b.ep);
        const fondu: Seg =
          s === 'h'
            ? { a: { x: l0, z: m }, b: { x: l1, z: m }, ep: ep ?? null }
            : { a: { x: m, z: l0 }, b: { x: m, z: l1 }, ep: ep ?? null };
        out.splice(j, 1);
        out.splice(i, 1, fondu);
        change = true;
      }
    }
  }
  return out;
}

/** Les contours de pièces exploitables : trois coins au moins, tous chiffrés. */
function contoursLus(brut: LectureBrute): PointLu[][] {
  return (brut.pieces ?? [])
    .map((p) => p?.contour)
    .filter(
      (c): c is PointLu[] =>
        Array.isArray(c) &&
        c.length >= 3 &&
        c.every((q) => Array.isArray(q) && q.length >= 2 && Number.isFinite(q[0]) && Number.isFinite(q[1])),
    );
}

/**
 * LE PLAN PRINCIPAL, ET LUI SEUL — relevé du patron : la photo montrait
 * aussi le bas d'une autre feuille, avec ses cotes. Ce qui est lu hors du
 * cadre que l'IA a reconnu au plan principal est écarté : murs, pièces,
 * ouvertures, symboles (à 3 % près), et les cotes (à 6 % près : les chaînes
 * extérieures courent au-delà des murs). Les liens se renumérotent sur les
 * symboles gardés. Sans cadre lisible, rien ne change.
 */
function garderLePlanPrincipal(brut: LectureBrute): LectureBrute {
  const c = brut.cadre;
  if (!Array.isArray(c) || c.length < 4 || !c.slice(0, 4).every(Number.isFinite)) return brut;
  const boite = (marge: number) => ({
    x0: Math.min(c[0], c[2]) - marge,
    x1: Math.max(c[0], c[2]) + marge,
    y0: Math.min(c[1], c[3]) - marge,
    y1: Math.max(c[1], c[3]) + marge,
  });
  const serre = boite(30);
  if (serre.x1 - serre.x0 < 150 || serre.y1 - serre.y0 < 150) return brut;
  const large = boite(60);
  const dans = (b: typeof serre, p?: number[] | null) =>
    !!p && p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1;
  const milieu = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const symboles = brut.symboles ?? [];
  const nouvelIndice = new Map<number, number>();
  symboles.forEach((s, i) => {
    if (dans(serre, s?.point)) nouvelIndice.set(i, nouvelIndice.size);
  });
  return {
    ...brut,
    murs: (brut.murs ?? []).filter((m) => Array.isArray(m) && m.length >= 4 && dans(serre, milieu([m[0], m[1]], [m[2], m[3]]))),
    ouvertures: (brut.ouvertures ?? []).filter((o) => o?.a && o.b && dans(serre, milieu(o.a, o.b))),
    cotes: (brut.cotes ?? []).filter((x) => x?.a && x.b && dans(large, milieu(x.a, x.b))),
    pieces: (brut.pieces ?? []).filter((p) => dans(serre, p?.point)),
    symboles: symboles.filter((_, i) => nouvelIndice.has(i)),
    liens: (brut.liens ?? [])
      .filter((l) => Array.isArray(l) && nouvelIndice.has(l[0]) && nouvelIndice.has(l[1]))
      .map((l) => [nouvelIndice.get(l[0])!, nouvelIndice.get(l[1])!]),
  };
}

/**
 * L'ÉCHELLE PAR LES SURFACES ÉCRITES — quand aucune cote n'est lisible.
 * L'aire d'une pièce, en pixels carrés sur la photo, contre ses mètres
 * carrés écrits : la racine du rapport est l'échelle. On prend la médiane
 * sur les pièces que les murs lus referment.
 */
function echelleDesSurfaces(
  brut: LectureBrute,
  ptR: (p: PointLu | number[]) => { x: number; y: number },
  mursBruts: number[][],
): number {
  const etiquettes = (brut.pieces ?? []).filter((p) => p?.surface && p.point);
  if (etiquettes.length === 0) return NaN;
  /*
    LES CONTOURS D'ABORD — l'aire d'une pièce lue directement, sans dépendre
    des murs qui la referment : sur un plan dont la moitié des cloisons
    manquaient à la lecture, aucune pièce ne se refermait, et l'échelle se
    prenait sur la seule qui restait (relevé du patron : « WC : 2,48 m²
    écrits, 4,7 m² dessinés »).
  */
  const parContour: number[] = [];
  for (const e of etiquettes) {
    const c = e.contour;
    if (!Array.isArray(c) || c.length < 3) continue;
    const lue = lireCote((e.surface ?? '').replace(/m(²|2)/i, '').trim());
    if (!lue || !(lue.valeur > 0)) continue;
    const pts = c.map((q) => ptR(q));
    let aire = 0;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      const q = pts[(k + 1) % pts.length];
      aire += p.x * q.y - q.x * p.y;
    }
    aire = Math.abs(aire) / 2;
    if (aire > 1) parContour.push(Math.sqrt(lue.valeur / aire));
  }
  if (parContour.length > 0) return mediane(parContour);
  const murs: WallSeg[] = mursBruts.map((m, i) => {
    const a = ptR([m[0], m[1]]);
    const b = ptR([m[2], m[3]]);
    return { id: `e${i}`, type: 'wall', a: { x: a.x, z: a.y }, b: { x: b.x, z: b.y }, height: 1, yCenter: 0.5 };
  });
  const soudes = mergeColinear(splitAtJunctions(weldCorners(murs, 12), 6));
  const det = detectRooms(soudes, 10);
  const parts = roomParts(soudes, det.map((r, i) => ({ id: `s${i}`, wallIds: r.wallIds })));
  const rapports: number[] = [];
  for (const e of etiquettes) {
    const q = ptR(e.point);
    const part = parts.find((p) => pointInPolygon({ x: q.x, z: q.y }, p.surface?.pts ?? []));
    const lue = lireCote((e.surface ?? '').replace(/m(²|2)/i, '').trim());
    if (!part?.surface || !lue) continue;
    rapports.push(Math.sqrt(lue.valeur / part.surface.area));
  }
  return mediane(rapports);
}

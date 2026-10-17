/**
 * L'EXPORT DXF — la porte des architectes et des bureaux d'études.
 *
 * L'application ne sortait que du PDF : un document qu'on LIT, jamais un
 * dessin qu'on REPREND. Un architecte, un économiste de la construction, un
 * cuisiniste, une menuiserie demandent un fichier qu'ils ouvrent dans
 * AutoCAD, ArchiCAD, SketchUp ou leur machine à commande numérique — et l'on
 * ne pouvait pas répondre. C'est le format d'échange du bâtiment depuis
 * quarante ans ; ne pas l'avoir ferme la porte des clients qui paient le
 * mieux.
 *
 * ON ÉCRIT DU R12 (AC1009), le dialecte que TOUT lit — y compris les vieux
 * logiciels de menuiserie et les découpeuses. Les versions récentes
 * apportent des entités dont un plan de logement n'a aucun besoin, et
 * referment la compatibilité qu'on cherchait précisément à ouvrir. C'est
 * pour la même raison qu'on s'en tient à quatre entités : LINE, POLYLINE,
 * CIRCLE et TEXT. Un dessin fait de primitives simples s'ouvre partout et se
 * retouche sans surprise.
 *
 * LE FICHIER EST EN MILLIMÈTRES et son axe est retourné : ce sont les deux
 * conventions du dessin de bâtiment, et les deux erreurs qui ne se voient
 * qu'une fois le mobilier commandé.
 */
import { dansLeBati, pocheDesMurs } from '../geometry/poche';
import { contourDuQuad, seDistingue, type NatureMur } from '../geometry/natureMurs';
import {
  arcDuBattant,
  demiFacesDe,
  epaisseurDe,
  pivotsDesBattants,
  planFrameAngle,
  retraitDuCoin,
  roomParts,
  segLength,
  longueurCotee,
  wallQuadsOf,
  type Pt,
  type WallSeg,
} from '../geometry/floorplan';
import { FIXTURES, type Fixture } from '../geometry/electrical';
import { CEILINGS, type CeilingFixture } from '../geometry/ceiling';
import { longueurDuRuban } from '../geometry/ruban';
import { deplierLigatures } from '../ui/mots';
import { nomDeFichier } from './nomDeFichier';

/** Un calque du fichier : son nom, et sa couleur d'index AutoCAD. */
export interface CalqueDxf {
  nom: string;
  /** Index de couleur : 7 = noir/blanc selon le fond, 1 = rouge, 5 = bleu… */
  couleur: number;
  /** Le calque se trace en tireté (`DASHED`) : les murs à démolir. */
  tirete?: boolean;
}

/**
 * LES CALQUES, comme un dessinateur les attend.
 *
 * Un architecte éteint les calques qui ne le concernent pas : s'il reçoit un
 * plan où tout est mélangé, il ne peut ni le nettoyer ni l'intégrer à son
 * fond. Le préfixe évite d'écraser SES calques à lui en collant notre
 * dessin dans son projet.
 */
export const DXF_CALQUES: CalqueDxf[] = [
  { nom: 'ECHOPLAN-MURS', couleur: 7 },
  { nom: 'ECHOPLAN-OUVERTURES', couleur: 5 },
  /*
    UN CALQUE PAR NATURE DE MENUISERIE.

    Tout sortait en un segment sur un calque unique : porte, fenêtre et baie
    libre, le même trait. Celui qui reçoit le fichier rouvrait le plan dans
    son logiciel, ne voyait que des trous dans des murs, et redessinait à la
    main les battants qu'on lui avait déjà donnés sur le PDF — deux dessins
    du même logement qui ne disent pas la même chose, et c'est celui qu'on
    croit à jour qui se trompe.

    Séparés, parce que c'est ainsi qu'un architecte travaille : il éteint ce
    qui ne le concerne pas.
  */
  { nom: 'ECHOPLAN-PORTES', couleur: 5 },
  { nom: 'ECHOPLAN-FENETRES', couleur: 4 },
  /*
    UN CALQUE PAR NATURE DE MUR (voir `natureMurs`) : le contour de chaque
    cloison, doublage, mur à démolir ou à créer, par-dessus la maçonnerie —
    l'architecte hachure ou éteint chaque famille à sa guise.
  */
  { nom: 'ECHOPLAN-CLOISONS', couleur: 8 },
  { nom: 'ECHOPLAN-DOUBLAGES', couleur: 9 },
  /*
    À DÉMOLIR, EN TIRETÉ — comme sur le PDF : en trait continu, le DXF
    disait « mur » là où le dossier disait « mur qui part ».
  */
  { nom: 'ECHOPLAN-A-DEMOLIR', couleur: 2, tirete: true },
  { nom: 'ECHOPLAN-A-CREER', couleur: 1 },
  { nom: 'ECHOPLAN-MEUBLES', couleur: 8 },
  { nom: 'ECHOPLAN-ELEC', couleur: 1 },
  // Le plafond : points lumineux et rubans LED (revue « Claire »).
  { nom: 'ECHOPLAN-ECLAIRAGE', couleur: 5 },
  { nom: 'ECHOPLAN-PIECES', couleur: 3 },
  { nom: 'ECHOPLAN-COTES', couleur: 4 },
];

const CALQUE = {
  murs: 'ECHOPLAN-MURS',
  ouvertures: 'ECHOPLAN-OUVERTURES',
  portes: 'ECHOPLAN-PORTES',
  fenetres: 'ECHOPLAN-FENETRES',
  meubles: 'ECHOPLAN-MEUBLES',
  elec: 'ECHOPLAN-ELEC',
  eclairage: 'ECHOPLAN-ECLAIRAGE',
  pieces: 'ECHOPLAN-PIECES',
  cotes: 'ECHOPLAN-COTES',
} as const;

/** Le relevé, tel que le DXF a besoin de le connaître. */
export interface PlanPourDxf {
  walls: WallSeg[];
  openings: WallSeg[];
  rooms: { id: string; name: string; wallIds?: string[] }[];
  /*
    L appareillage, reduit a ce que le dessin en fait : ce qu il est, sur
    quel mur, et a quelle cote. Sa hauteur, sa face et son groupe ne se
    voient pas sur un plan — on ne les demande donc pas, et un appelant qui
    passe un  entier reste accepte.
  */
  fixtures: Pick<Fixture, 'id' | 'kind' | 'wallId' | 'along'>[];
  objects?: { id: string; transform: number[]; width: number; depth: number }[];
  /**
   * LE PLAFOND — revue « Claire » : le ruban LED n'existait jamais en DXF.
   * Ce qui y est posé, sur son calque ; un ruban, à son tracé.
   */
  ceiling?: Pick<CeilingFixture, 'id' | 'kind' | 'at' | 'trace' | 'ferme'>[];
}

/**
 * TRANSLITTÉRATION — le R12 ne transporte pas nos accents.
 *
 * Le format est de l'ASCII : un « é » y devient un caractère de contrôle, et
 * le fichier s'ouvre avec des noms de pièces illisibles — quand il s'ouvre.
 * On translittère donc, plutôt que de livrer un dessin sali : « Séjour »
 * devient « Sejour », ce qu'un dessinateur lit sans y penser.
 */
export function sansAccent(s: string): string {
  // « œ », « æ », « ß » : deux lettres, pas zéro (voir `deplierLigatures`).
  return deplierLigatures(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[«»]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/²/g, '2')
    .replace(/[^\x20-\x7E]/g, '');
}

/** Le millimètre, unité du plan de bâtiment. */
const MM = 1000;

/**
 * Un point du relevé vers le repère du dessin.
 *
 * DEUX CONVERSIONS, et les deux comptent. Les MÈTRES deviennent des
 * millimètres — c'est l'unité dans laquelle travaillent les plans
 * d'exécution. Et l'AXE SE RETOURNE : le relevé compte z vers le bas, comme
 * un écran, le DXF y vers le haut, comme les mathématiques. Sans ce
 * retournement, le plan s'ouvre EN MIROIR chez le destinataire — portes à
 * gauche au lieu de la droite —, une erreur qui ne se voit qu'une fois le
 * mobilier commandé.
 */
/*
  LE DESSIN SUR LA TRAME DU LOGEMENT — revues « Gérard » et « Bérénice » : le
  PDF redressait le plan, le DXF le livrait dans le repère du scan, tourné de
  17° ou 27°. Comme le PDF, il tourne la géométrie avant de la poser : les
  murs sortent d'aplomb. Posée à chaque `buildDxf`.
*/
let tourner: (p: Pt) => Pt = (p) => p;
/*
  L'ÉTENDUE DU DESSIN, relevée au passage — chaque point écrit passe par
  `pt`. Remise à zéro à chaque `buildDxf`, elle remplit $EXTMIN et $EXTMAX
  (voir l'en-tête).
*/
let etendue = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
const pt = (p: Pt) => {
  const q = tourner(p);
  const r = { x: q.x * MM, y: -q.z * MM };
  if (Number.isFinite(r.x) && Number.isFinite(r.y)) {
    if (r.x < etendue.x0) etendue.x0 = r.x;
    if (r.x > etendue.x1) etendue.x1 = r.x;
    if (r.y < etendue.y0) etendue.y0 = r.y;
    if (r.y > etendue.y1) etendue.y1 = r.y;
  }
  return r;
};

/**
 * LE TIRETÉ, EN MILLIMÈTRES DU BÂTIMENT — le fichier est en millimètres :
 * un motif de 0,5 unité (celui des gabarits d'AutoCAD, pensé en pouces de
 * papier) ferait des traits d'un demi-millimètre sur un mur de quatre
 * mètres, et la ligne paraîtrait continue. 150 mm de trait, 75 mm de blanc :
 * au 1:50, trois millimètres et un et demi sur la feuille, comme au PDF.
 */
export const TIRETE_MM = { trait: 150, blanc: 75 };

/** La marge autour du dessin dans l'étendue déclarée : 5 % de chaque côté. */
const MARGE_ETENDUE = 0.05;

/** Une paire code/valeur, la brique unique du format. */
const paire = (code: number | string, valeur: string | number) =>
  `${code}\n${valeur}\n`;

function ligne(calque: string, a: Pt, b: Pt): string {
  const p1 = pt(a);
  const p2 = pt(b);
  return (
    paire(0, 'LINE') +
    paire(8, calque) +
    paire(10, p1.x.toFixed(2)) +
    paire(20, p1.y.toFixed(2)) +
    paire(30, '0.0') +
    paire(11, p2.x.toFixed(2)) +
    paire(21, p2.y.toFixed(2)) +
    paire(31, '0.0')
  );
}

/**
 * Une polyligne fermée — le contour d'un mur, d'un meuble.
 *
 * Le R12 ne connaît pas LWPOLYLINE : il faut une POLYLINE suivie d'autant de
 * VERTEX que de sommets, puis un SEQEND. C'est verbeux, et c'est ce que tous
 * les logiciels savent relire.
 */
function polyligne(calque: string, points: Pt[], fermee = true): string {
  if (points.length < 2) return '';
  let out =
    paire(0, 'POLYLINE') +
    paire(8, calque) +
    paire(66, 1) +
    paire(70, fermee ? 1 : 0) +
    paire(10, '0.0') +
    paire(20, '0.0') +
    paire(30, '0.0');
  for (const p of points) {
    const q = pt(p);
    out +=
      paire(0, 'VERTEX') +
      paire(8, calque) +
      paire(10, q.x.toFixed(2)) +
      paire(20, q.y.toFixed(2)) +
      paire(30, '0.0');
  }
  return out + paire(0, 'SEQEND') + paire(8, calque);
}

function texte(calque: string, p: Pt, hauteurMm: number, s: string): string {
  const q = pt(p);
  return (
    paire(0, 'TEXT') +
    paire(8, calque) +
    paire(10, q.x.toFixed(2)) +
    paire(20, q.y.toFixed(2)) +
    paire(30, '0.0') +
    paire(40, hauteurMm.toFixed(1)) +
    paire(1, sansAccent(s))
  );
}

/**
 * Un texte couché selon `angle` (degrés), centré sur son point : le R12
 * prend alors le point d'alignement (11/21), et garde le point d'insertion
 * pour les logiciels qui l'ignorent.
 */
function texteCentre(calque: string, p: Pt, hauteurMm: number, angle: number, s: string): string {
  const q = pt(p);
  return (
    paire(0, 'TEXT') +
    paire(8, calque) +
    paire(10, q.x.toFixed(2)) +
    paire(20, q.y.toFixed(2)) +
    paire(30, '0.0') +
    paire(40, hauteurMm.toFixed(1)) +
    paire(1, sansAccent(s)) +
    paire(50, angle.toFixed(1)) +
    paire(72, 1) +
    paire(11, q.x.toFixed(2)) +
    paire(21, q.y.toFixed(2)) +
    paire(31, '0.0')
  );
}

/** Un point dans un contour fermé (pair-impair). */
function dansLeContour(q: Pt, pts: Pt[]): boolean {
  let dedans = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.z > q.z !== b.z > q.z && q.x < ((b.x - a.x) * (q.z - a.z)) / (b.z - a.z) + a.x) dedans = !dedans;
  }
  return dedans;
}

function cercle(calque: string, p: Pt, rayonMm: number): string {
  const q = pt(p);
  return (
    paire(0, 'CIRCLE') +
    paire(8, calque) +
    paire(10, q.x.toFixed(2)) +
    paire(20, q.y.toFixed(2)) +
    paire(30, '0.0') +
    paire(40, rayonMm.toFixed(1))
  );
}

/**
 * LE FICHIER COMPLET.
 *
 * Trois sections, et pas une de plus : l'en-tête qui annonce la version et
 * l'unité, la table des calques, les entités. Un DXF mal fermé est refusé en
 * bloc — AutoCAD ne répare rien — d'où l'attention portée aux `ENDSEC`.
 */
export function buildDxf(plan: PlanPourDxf): string {
  let out = '';
  const trame = planFrameAngle(plan.walls);
  const cosT = Math.cos(-trame);
  const sinT = Math.sin(-trame);
  tourner = (p: Pt) => ({ x: p.x * cosT - p.z * sinT, z: p.x * sinT + p.z * cosT });
  etendue = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

  /*
    LES ENTITÉS D'ABORD, L'EN-TÊTE ENSUITE — l'en-tête déclare l'étendue du
    dessin, qu'on ne connaît qu'une fois tout tracé. Il est posé devant au
    moment de rendre le fichier (voir `enTeteEtTables`).
  */
  /* ----------------------------------------------------------- entités */
  out += paire(0, 'SECTION') + paire(2, 'ENTITIES');

  /*
    LES MURS SORTENT AVEC LEUR ÉPAISSEUR.

    Un mur réduit à son axe se retouche mal : le destinataire doit redonner
    l'épaisseur à la main, sur chaque cloison. On exporte donc le CONTOUR
    calculé pour le plan — le même que celui du PDF, jonctions d'onglet
    comprises.
  */
  /*
    ET D'UN SEUL TENANT — le contour de la maçonnerie (voir `pocheDesMurs`),
    pas un rectangle par mur : l'architecte reçoit des murs qui se fondent à
    leurs jonctions, des façades à leur épaisseur, des baies ouvertes. Un mur
    sans corps (longueur nulle) garde son trait.
  */
  const poche = pocheDesMurs(plan.walls, plan.openings, plan.rooms);
  for (const contour of poche.contours) out += polyligne(CALQUE.murs, contour);
  const quads = wallQuadsOf(plan.walls);
  for (const w of plan.walls) {
    if (!quads.get(w.id)) out += ligne(CALQUE.murs, w.a, w.b);
  }
  const CALQUE_NATURE: Partial<Record<NatureMur, string>> = {
    cloison: 'ECHOPLAN-CLOISONS',
    doublage: 'ECHOPLAN-DOUBLAGES',
    demolir: 'ECHOPLAN-A-DEMOLIR',
    creer: 'ECHOPLAN-A-CREER',
  };
  for (const w of plan.walls.filter(seDistingue)) {
    const q = quads.get(w.id);
    const calque = CALQUE_NATURE[w.nature!];
    if (q && calque) out += polyligne(calque, contourDuQuad(q));
  }

  /*
    LES MENUISERIES, CHACUNE SUR SON CALQUE — et les portes avec leur
    battant.

    Une baie libre reste un simple segment : elle n'a pas de vantail, et lui
    en dessiner un serait inventer une menuiserie que personne n'a relevée.
    Une porte, elle, porte le sens que l'électricien a réglé sur le plan —
    c'est la cote qui décide de la place de l'interrupteur, et elle ne doit
    pas se perdre en chemin.
  */
  const pivots = pivotsDesBattants(
    plan.openings
      .filter((o) => o.type === 'door')
      .map((o) => ({ id: o.id, a: o.a, b: o.b, pivot: o.pivot })),
  );
  // Le découpage se calcule UNE fois : appelé par porte, il refaisait tout
  // le parcours des faces du logement à chaque menuiserie.
  const decoupage = roomParts(plan.walls, plan.rooms);
  const centreDe = (o: WallSeg) =>
    decoupage.find((x) => x.roomId === o.roomId)?.labelAt ?? null;
  for (const o of plan.openings) {
    if (o.type !== 'door') {
      out += ligne(
        o.type === 'window' ? CALQUE.fenetres : CALQUE.ouvertures,
        o.a,
        o.b,
      );
      continue;
    }
    // Le dormant.
    out += ligne(CALQUE.portes, o.a, o.b);
    // La porte de garage ne bat pas : le dormant suffit.
    if (o.garage || o.placard) continue;
    const len = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z);
    if (len < 0.05) continue;
    const ux = (o.b.x - o.a.x) / len;
    const uz = (o.b.z - o.a.z) / len;
    // La normale tournée vers l'intérieur de la pièce, puis retournée si
    // la porte ouvre de l'autre côté : le même choix qu'à l'écran.
    let nx = -uz;
    let nz = ux;
    const dedans = centreDe(o);
    const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
    if (dedans && (dedans.x - mid.x) * nx + (dedans.z - mid.z) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    if (o.versExterieur) {
      nx = -nx;
      nz = -nz;
    }
    const gond = pivots.get(o.id) === 'b' ? o.b : o.a;
    const opp = gond === o.a ? o.b : o.a;
    // Deux vantaux : chacun de son tableau jusqu'au milieu.
    const feuilles: [Pt, Pt][] = o.vantaux === 2 ? [[o.a, mid], [o.b, mid]] : [[gond, opp]];
    for (const [g, q] of feuilles) {
      const r = Math.hypot(q.x - g.x, q.z - g.z);
      // Le vantail, ouvert à angle droit.
      out += ligne(CALQUE.portes, g, { x: g.x + nx * r, z: g.z + nz * r });
      // Et l'arc qu'il décrit, du dormant au vantail — le calcul commun,
      // qui ramène l'écart d'angle dans le demi-tour (voir `arcDuBattant`).
      out += polyligne(CALQUE.portes, arcDuBattant(g, q, { x: nx, z: nz }, r, 8));
    }
  }

  /*
    LES PIÈCES : leur nom et leur surface, posés au même endroit que sur le
    plan imprimé. C'est ce qu'un économiste vient chercher en premier.

    CENTRÉS, ET À DEUX DÉCIMALES — relevé de l'architecte : le nom partait
    du point d'étiquette vers la droite (il débordait sur le mur d'une
    pièce étroite), et la surface s'écrivait « 12,3 » quand le dossier PDF
    écrit « 12,34 » (`frM2`, revue « Nadia »). Le même arrondi au centième,
    pour que le DXF et le PDF disent le même chiffre.
  */
  for (const part of roomParts(plan.walls, plan.rooms)) {
    const nom = plan.rooms.find((r) => r.id === part.roomId)?.name ?? '';
    const aire = part.surface?.area ?? 0;
    if (nom) out += texteCentre(CALQUE.pieces, part.labelAt, 200, 0, nom);
    if (aire > 0) {
      out += texteCentre(
        CALQUE.pieces,
        { x: part.labelAt.x, z: part.labelAt.z + 0.3 },
        150,
        0,
        `${(Math.round(aire * 100) / 100).toFixed(2).replace('.', ',')} m2`,
      );
    }
  }

  /*
    L'APPAREILLAGE : un cercle et un sigle, à sa cote sur le mur.

    On ne redessine pas les symboles normalisés — ils ne se retoucheraient
    pas, et chaque logiciel a les siens. Un repère à la bonne place, sur son
    propre calque, est ce qui sert vraiment : l'architecte voit où passent
    les points, et les efface d'un clic s'il n'en veut pas.
  */
  for (const f of plan.fixtures) {
    const mur = plan.walls.find((w) => w.id === f.wallId);
    if (!mur) continue;
    const L = segLength(mur) || 1;
    const t = Math.min(1, Math.max(0, f.along / L));
    const p = {
      x: mur.a.x + (mur.b.x - mur.a.x) * t,
      z: mur.a.z + (mur.b.z - mur.a.z) * t,
    };
    out += cercle(CALQUE.elec, p, 60);
    // En toutes lettres (revue « Claire » : « inter », « prise2 », « rjPrise »).
    out += texte(CALQUE.elec, { x: p.x + 0.1, z: p.z }, 100, FIXTURES[f.kind].label);
  }

  /* Le plafond : chaque point à sa place, chaque ruban à son tracé. */
  for (const c of plan.ceiling ?? []) {
    if (c.trace && c.trace.length >= 2) {
      out += polyligne(CALQUE.eclairage, c.trace, !!c.ferme);
      const L = longueurDuRuban(c.trace, c.ferme);
      out += texte(
        CALQUE.eclairage,
        { x: c.trace[0].x + 0.1, z: c.trace[0].z },
        100,
        `LED ${L.toFixed(2).replace('.', ',')} m`,
      );
      continue;
    }
    out += cercle(CALQUE.eclairage, c.at, 80);
    out += texte(CALQUE.eclairage, { x: c.at.x + 0.12, z: c.at.z }, 100, CEILINGS[c.kind].label);
  }

  /*
    Les meubles : leur emprise au sol, TOURNÉE COMME SUR LE PLAN — revue
    « Inès » : un banc de 2 × 0,5 m tourné d'un quart de tour sortait couché
    en x. Les deux axes du meuble (colonnes x et z de sa matrice) donnent
    ses quatre coins, quel que soit l'angle.
  */
  for (const o of plan.objects ?? []) {
    const t = o.transform;
    const cx = t[12];
    const cz = t[14];
    const lx = Math.hypot(t[0], t[2]) || 1;
    const lz = Math.hypot(t[8], t[10]) || 1;
    const ux = { x: t[0] / lx, z: t[2] / lx };
    const uz = { x: t[8] / lz, z: t[10] / lz };
    const w = o.width / 2;
    const d = o.depth / 2;
    const coin = (sx: number, sz: number) => ({
      x: cx + ux.x * w * sx + uz.x * d * sz,
      z: cz + ux.z * w * sx + uz.z * d * sz,
    });
    out += polyligne(CALQUE.meubles, [coin(-1, -1), coin(1, -1), coin(1, 1), coin(-1, 1)]);
  }

  /*
    LA COTE DE CHAQUE MUR, COMME À LA PLANCHE — revue « Claire » : elle
    n'était qu'un texte posé à plat sur l'axe du mur, dans la maçonnerie, et
    couché en travers des murs verticaux ; rien à accrocher dans son
    logiciel. Elle se trace maintenant DANS LA PIÈCE, au nu : une ligne de
    cote de la longueur écrite, ses tirets à 45°, ses lignes d'attache
    depuis la face du mur, et le chiffre le long du mur, lisible depuis le
    bas ou la droite. Toujours en LINE et TEXT : une entité DIMENSION se
    relit différemment d'un logiciel à l'autre.
  */
  const contoursDesPieces = decoupage
    .map((x) => x.surface?.pts)
    .filter((x): x is Pt[] => !!x && x.length >= 3);
  const dansUnePiece = (q: Pt) => contoursDesPieces.some((c) => dansLeContour(q, c));
  for (const w of plan.walls) {
    // La cote du plan : au nu pour un mur dessiné (revue « Léa »).
    // Avec ses pièces : la face d'un pan coupé (revue « Claire »).
    const L = longueurCotee(plan.walls, w, decoupage);
    if (L < 0.2) continue;
    const lax = segLength(w);
    if (lax < 1e-6) continue;
    const u = { x: (w.b.x - w.a.x) / lax, z: (w.b.z - w.a.z) / lax };
    const demi = epaisseurDe(w) / 2;
    const mil = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
    // Du côté d'une pièce : une façade se cote dedans. Un mur qui n'en borde
    // aucune (le fond d'un coffre de cheminée, l'angle plein derrière un pan
    // coupé) se cote dehors, hors de la maçonnerie.
    const deCote = (s: number): Pt => ({ x: mil.x - u.z * s * (demi + 0.3), z: mil.z + u.x * s * (demi + 0.3) });
    const sgn =
      [1, -1].find((s) => dansUnePiece(deCote(s))) ?? [1, -1].find((s) => !dansLeBati(plan.walls, deCote(s))) ?? 1;
    const n = { x: -u.z * sgn, z: u.x * sgn };
    // La face de ce côté : sur le trait, côté pièce, pour un mur relevé
    // d'un côté (voir `facesDesMurs`).
    const faces = demiFacesDe(plan.walls, w);
    const e = sgn > 0 ? faces.plus : faces.moins;
    // Centrée sur le nu, entre les demi-murs qui ferment ses deux bouts.
    const r0 = w.auNu ? retraitDuCoin(plan.walls, w, w.a) : 0;
    const r1 = w.auNu ? retraitDuCoin(plan.walls, w, w.b) : 0;
    const sMil = (r0 + lax - r1) / 2;
    const s0 = sMil - L / 2;
    const s1 = sMil + L / 2;
    const D = e + 0.3;
    const sur = (s: number, k: number): Pt => ({ x: w.a.x + u.x * s + n.x * k, z: w.a.z + u.z * s + n.z * k });
    out += ligne(CALQUE.cotes, sur(s0, D), sur(s1, D));
    for (const s of [s0, s1]) {
      // La ligne d'attache, de la face du mur à un peu au-delà du trait.
      out += ligne(CALQUE.cotes, sur(s, e + 0.02), sur(s, D + 0.05));
      // Le tiret à 45°.
      out += ligne(CALQUE.cotes, sur(s - 0.06, D - 0.06), sur(s + 0.06, D + 0.06));
    }
    // Le chiffre se lit depuis le bas ou la droite de la feuille, posé du
    // côté de la pièce, à 5 cm de son trait.
    const ur = tourner(u);
    let angle = (Math.atan2(-ur.z, ur.x) * 180) / Math.PI;
    if (angle > 90.5) angle -= 180;
    if (angle <= -89.5) angle += 180;
    const r = (angle * Math.PI) / 180;
    // Le haut du texte, dans le repère du dessin (y vers le haut), puis du relevé.
    const haut = { x: -Math.sin(r), z: -Math.cos(r) };
    const nr = tourner(n);
    const versLaPiece = haut.x * nr.x + haut.z * nr.z > 0;
    const H = 0.12;
    const base = sur(sMil, D + 0.05 + (versLaPiece ? 0 : H));
    out += texteCentre(CALQUE.cotes, base, H * MM, angle, `${L.toFixed(2).replace('.', ',')} m`);
  }

  out += paire(0, 'ENDSEC');
  out += paire(0, 'EOF');
  return enTeteEtTables() + out;
}

/**
 * L'EN-TÊTE ET LES TABLES — la version, l'unité, l'étendue, les types de
 * trait et les calques.
 *
 * L'ÉTENDUE — revue de l'export : sans $EXTMIN/$EXTMAX ni $LIMMIN/$LIMMAX,
 * bien des visionneuses (iPhone, eDrawings, logiciels de menuiserie)
 * ouvraient la vue par défaut, 12 × 9 unités, sur un dessin qui en fait huit
 * mille : le destinataire voyait un écran vide tant qu'il n'avait pas fait
 * un « zoom étendu ». Le dessin est déclaré avec 5 % de marge.
 */
function enTeteEtTables(): string {
  let out = '';
  /* ------------------------------------------------------------ en-tête */
  out += paire(0, 'SECTION') + paire(2, 'HEADER');
  out += paire(9, '$ACADVER') + paire(1, 'AC1009');
  // 4 = millimètres. Le logiciel d'accueil sait alors mettre le dessin à
  // l'échelle de son projet sans qu'on ait à le dire dans un courriel.
  // (Variable venue après le R12 : un lecteur R12 strict l'ignore, les
  // logiciels récents la lisent — on la garde.)
  out += paire(9, '$INSUNITS') + paire(70, 4);
  if (Number.isFinite(etendue.x0) && Number.isFinite(etendue.y0)) {
    // Un dessin réduit à un point garde une étendue d'un mètre.
    const mx = Math.max(etendue.x1 - etendue.x0, 1000) * MARGE_ETENDUE;
    const my = Math.max(etendue.y1 - etendue.y0, 1000) * MARGE_ETENDUE;
    const x0 = (etendue.x0 - mx).toFixed(2);
    const y0 = (etendue.y0 - my).toFixed(2);
    const x1 = (etendue.x1 + mx).toFixed(2);
    const y1 = (etendue.y1 + my).toFixed(2);
    out += paire(9, '$EXTMIN') + paire(10, x0) + paire(20, y0) + paire(30, '0.0');
    out += paire(9, '$EXTMAX') + paire(10, x1) + paire(20, y1) + paire(30, '0.0');
    out += paire(9, '$LIMMIN') + paire(10, x0) + paire(20, y0);
    out += paire(9, '$LIMMAX') + paire(10, x1) + paire(20, y1);
  }
  // L'échelle des types de trait : 1, le motif est déjà en millimètres.
  out += paire(9, '$LTSCALE') + paire(40, '1.0');
  out += paire(0, 'ENDSEC');

  out += paire(0, 'SECTION') + paire(2, 'TABLES');
  /* ---------------------------------------------------- types de trait */
  // Le R12 range les types de trait AVANT les calques qui les nomment.
  const { trait, blanc } = TIRETE_MM;
  out += paire(0, 'TABLE') + paire(2, 'LTYPE') + paire(70, 2);
  out +=
    paire(0, 'LTYPE') +
    paire(2, 'CONTINUOUS') +
    paire(70, 0) +
    paire(3, 'Solid line') +
    paire(72, 65) +
    paire(73, 0) +
    paire(40, '0.0');
  out +=
    paire(0, 'LTYPE') +
    paire(2, 'DASHED') +
    paire(70, 0) +
    paire(3, 'Dashed __ __ __') +
    paire(72, 65) +
    paire(73, 2) +
    paire(40, (trait + blanc).toFixed(1)) +
    paire(49, trait.toFixed(1)) +
    paire(49, (-blanc).toFixed(1));
  out += paire(0, 'ENDTAB');

  /* ------------------------------------------------------------ calques */
  out += paire(0, 'TABLE') + paire(2, 'LAYER') + paire(70, DXF_CALQUES.length);
  for (const c of DXF_CALQUES) {
    out +=
      paire(0, 'LAYER') +
      paire(2, c.nom) +
      paire(70, 0) +
      paire(62, c.couleur) +
      paire(6, c.tirete ? 'DASHED' : 'CONTINUOUS');
  }
  out += paire(0, 'ENDTAB') + paire(0, 'ENDSEC');
  return out;
}

/**
 * « Dupont - Plan.dxf » : la règle commune à tous les exports (voir
 * `nomDeFichier`), accents dépliés — le fichier part chez des logiciels de
 * dessin qui n'en veulent pas. Le « + » reste : « R+1 » devenait « R-1 »,
 * lu comme un sous-sol (revue « Inès »).
 */
export function dxfFilename(nom: string, niveau?: string): string {
  return nomDeFichier(nom, 'dxf', { genre: 'Plan', niveau, ascii: true });
}

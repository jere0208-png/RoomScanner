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
import {
  arcDuBattant,
  pivotsDesBattants,
  roomParts,
  segLength,
  wallQuadsOf,
  type Pt,
  type WallSeg,
} from '../geometry/floorplan';
import type { Fixture } from '../geometry/electrical';

/** Un calque du fichier : son nom, et sa couleur d'index AutoCAD. */
export interface CalqueDxf {
  nom: string;
  /** Index de couleur : 7 = noir/blanc selon le fond, 1 = rouge, 5 = bleu… */
  couleur: number;
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
  { nom: 'ECHOPLAN-MEUBLES', couleur: 8 },
  { nom: 'ECHOPLAN-ELEC', couleur: 1 },
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
  return s
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
const pt = (p: Pt) => ({ x: p.x * MM, y: -p.z * MM });

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
function polyligne(calque: string, points: Pt[]): string {
  if (points.length < 2) return '';
  let out =
    paire(0, 'POLYLINE') +
    paire(8, calque) +
    paire(66, 1) +
    paire(70, 1) +
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

  /* ------------------------------------------------------------ en-tête */
  out += paire(0, 'SECTION') + paire(2, 'HEADER');
  out += paire(9, '$ACADVER') + paire(1, 'AC1009');
  // 4 = millimètres. Le logiciel d'accueil sait alors mettre le dessin à
  // l'échelle de son projet sans qu'on ait à le dire dans un courriel.
  out += paire(9, '$INSUNITS') + paire(70, 4);
  out += paire(0, 'ENDSEC');

  /* ------------------------------------------------------------ calques */
  out += paire(0, 'SECTION') + paire(2, 'TABLES');
  out += paire(0, 'TABLE') + paire(2, 'LAYER') + paire(70, DXF_CALQUES.length);
  for (const c of DXF_CALQUES) {
    out +=
      paire(0, 'LAYER') +
      paire(2, c.nom) +
      paire(70, 0) +
      paire(62, c.couleur) +
      paire(6, 'CONTINUOUS');
  }
  out += paire(0, 'ENDTAB') + paire(0, 'ENDSEC');

  /* ----------------------------------------------------------- entités */
  out += paire(0, 'SECTION') + paire(2, 'ENTITIES');

  /*
    LES MURS SORTENT AVEC LEUR ÉPAISSEUR.

    Un mur réduit à son axe se retouche mal : le destinataire doit redonner
    l'épaisseur à la main, sur chaque cloison. On exporte donc le CONTOUR
    calculé pour le plan — le même que celui du PDF, jonctions d'onglet
    comprises.
  */
  const quads = wallQuadsOf(plan.walls);
  for (const w of plan.walls) {
    const q = quads.get(w.id);
    if (q) out += polyligne(CALQUE.murs, [q.a1, q.b1, q.b2, q.a2]);
    else out += ligne(CALQUE.murs, w.a, w.b);
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
    // Le vantail, ouvert à angle droit.
    const bout = { x: gond.x + nx * len, z: gond.z + nz * len };
    out += ligne(CALQUE.portes, gond, bout);
    // Et l'arc qu'il décrit, du dormant au vantail — le calcul commun,
    // qui ramène l'écart d'angle dans le demi-tour (voir `arcDuBattant`).
    out += polyligne(
      CALQUE.portes,
      arcDuBattant(gond, opp, { x: nx, z: nz }, len, 8),
    );
  }

  /*
    LES PIÈCES : leur nom et leur surface, posés au même endroit que sur le
    plan imprimé. C'est ce qu'un économiste vient chercher en premier.
  */
  for (const part of roomParts(plan.walls, plan.rooms)) {
    const nom = plan.rooms.find((r) => r.id === part.roomId)?.name ?? '';
    const aire = part.surface?.area ?? 0;
    if (nom) out += texte(CALQUE.pieces, part.labelAt, 200, nom);
    if (aire > 0) {
      out += texte(
        CALQUE.pieces,
        { x: part.labelAt.x, z: part.labelAt.z + 0.3 },
        150,
        `${aire.toFixed(1).replace('.', ',')} m2`,
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
    out += texte(CALQUE.elec, { x: p.x + 0.1, z: p.z }, 100, f.kind);
  }

  /* Les meubles : leur emprise au sol, rien de plus. */
  for (const o of plan.objects ?? []) {
    const cx = o.transform[12];
    const cz = o.transform[14];
    const w = o.width / 2;
    const d = o.depth / 2;
    out += polyligne(CALQUE.meubles, [
      { x: cx - w, z: cz - d },
      { x: cx + w, z: cz - d },
      { x: cx + w, z: cz + d },
      { x: cx - w, z: cz + d },
    ]);
  }

  /* La cote de chaque mur, sur son calque : elle se relit, elle ne se calcule pas. */
  for (const w of plan.walls) {
    const L = segLength(w);
    if (L < 0.2) continue;
    out += texte(
      CALQUE.cotes,
      { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 },
      120,
      `${L.toFixed(2).replace('.', ',')} m`,
    );
  }

  out += paire(0, 'ENDSEC');
  out += paire(0, 'EOF');
  return out;
}

/** Le nom du fichier : celui du dossier, débarrassé de ce qu'un disque refuse. */
export function dxfFilename(nom: string): string {
  const base = sansAccent(nom).trim().replace(/[^A-Za-z0-9 _-]/g, ' ');
  const propre = base.replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
  return `${propre || 'plan'}.dxf`;
}

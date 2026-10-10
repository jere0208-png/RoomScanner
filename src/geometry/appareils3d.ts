/**
 * L'APPAREILLAGE EN VRAI — des prises, plus des pastilles de couleur.
 *
 * Relevé du patron : « trouve un moyen, comme les meubles, d'avoir des
 * modèles réalistes des prises, luminaires, tableau élec, etc. Tout
 * appareillage élec. On ne doit plus voir un bloc noté mais une vraie prise
 * ajoutée, comme le rendu qu'on aura à la fin. »
 *
 * Une prise était une plaque blanche et un cube ambre en saillie : la teinte
 * de sa FAMILLE, posée là pour se lire sans légende. C'est le code d'un plan
 * d'électricien, pas l'objet qu'on verra au mur. Le plan garde ses symboles
 * et ses couleurs (c'est lui qui fait foi) ; la maquette et la visite, elles,
 * montrent maintenant ce que la pièce sera, une fois le chantier fini.
 *
 * Chaque appareil est FABRIQUÉ à ses cotes de catalogue, comme les meubles
 * de `modeles3d` et avec le même atelier :
 *
 *   — une PLAQUE de 82 mm, épaisse de 9, au bord adouci, percée d'une
 *     fenêtre de 51 mm par poste, à 71 mm d'entraxe. Une double prise est
 *     UNE plaque à deux fenêtres, pas deux plaques collées ;
 *   — dans chaque fenêtre, son MÉCANISME : le puits d'une prise, ses deux
 *     alvéoles et sa broche de terre ; la bascule d'un interrupteur, deux
 *     demi-touches fléchées pour un volet, le bouton d'un variateur, le
 *     connecteur d'une prise TV, le port d'un RJ45, le presse-étoupe d'une
 *     sortie de câble ;
 *   — hors gabarit, ce qui n'est pas une plaque : le TABLEAU (son coffret,
 *     ses rangées de modules derrière une porte fumée), l'APPLIQUE (un
 *     cylindre qui éclaire en haut et en bas), le THERMOSTAT et son écran,
 *     la BOÎTE DE DÉRIVATION et ses quatre vis ;
 *   — au plafond : le SPOT et sa collerette, la DCL — rosace, câble,
 *     douille, ampoule —, le PLAFONNIER, le VENTILATEUR et ses pales de
 *     bois, le DÉTECTEUR DE FUMÉE, la CAMÉRA en dôme, la BOUCHE DE VMC et
 *     ses gorges, le DÉTECTEUR DE PRÉSENCE.
 *
 * Ce qui éclaire — le verre d'un spot, le diffuseur d'une applique, une
 * ampoule — est de la matière `lumiere` : il se peint de sa propre teinte,
 * sans ombre, comme une lampe allumée.
 *
 * ON FABRIQUE EN CENTIMÈTRES. L'atelier des meubles ignore les arrondis de
 * moins de cinq millimètres — à l'échelle d'une armoire, ils ne se voient
 * pas. À celle d'une prise, le bord d'une plaque EST son dessin. On
 * fabrique donc en centimètres et l'on pose en mètres : l'échelle est
 * uniforme, les normales ne bougent pas.
 *
 * Le repère local d'un appareil mural : `x` vers la droite quand on fait
 * face au mur depuis la pièce, `y` vers le haut, `z` sortant du mur, vers la
 * pièce ; l'origine est le centre de l'appareil, au nu du mur. Au plafond :
 * `x` et `z` ceux de la scène, `y` vers le haut, l'origine au nu du plafond
 * — l'appareil pend donc vers les `y` négatifs.
 */
import {
  Atelier,
  PAR_SOMMET,
  deplacer,
  tourner,
  type GroupeLocal,
  type Matiere,
  type ModeleLocal,
} from './modeles3d';
import { FIXTURES, PLAQUE, boxOffsets, postsOf, type Fixture, type FixtureKind } from './electrical';
import type { CeilingKind } from './ceiling';

type V3 = [number, number, number];
type P2 = [number, number];

/** Les teintes du rendu : un blanc d'appareillage, pas le blanc pur d'un écran. */
export const TEINTES_APPAREIL = {
  plaque: '#F3F2EE',
  /** Le mécanisme, un rien plus gris : on lit la plaque autour de lui. */
  meca: '#ECEBE6',
  alveole: '#1C1D20',
  chrome: '#D5D8DB',
  gris: '#8C9298',
  anthracite: '#45484D',
  lumiere: '#FFF2D6',
  fume: '#5C666E',
  ecran: '#111316',
  bois: '#C9A27A',
  module: '#F6F6F4',
  etiquette: '#DCE3E8',
} as const;
const T = TEINTES_APPAREIL;

// ------------------------------------------------------------ les cotes
// Tout est en centimètres, dans le repère local (voir l'en-tête).

/** Épaisseur d'une plaque, et l'arrondi de son bord. */
const EP = 0.9;
const BISEAU = 0.3;
const R_PLAQUE = 0.9;
/** Demi-côté d'une fenêtre de plaque : 51 mm. */
const FENETRE = 2.55;
/** Le nu du mécanisme, un rien en retrait de la plaque. */
const Z_MECA = 0.74;
/** Le fond du puits d'une prise. */
const Z_FOND = 0.14;
/** Le rayon du puits d'une prise : 39 mm. */
const R_PUITS = 1.95;

// ------------------------------------------------------------- les poses

/** Un poste de plaque : son mécanisme, à sa place depuis le centre (m). */
export interface PosteDAppareil {
  kind: FixtureKind;
  dx: number;
  dy: number;
  /** L'appareil qui porte ce mécanisme (un ensemble en réunit plusieurs). */
  source?: string;
}

/** Ce qu'on fabrique. */
export type GenreDAppareil =
  | 'plaque'
  | 'applique'
  | 'tableau'
  | 'thermostat'
  | 'boite'
  | 'plafond';

/** Un appareil à sa place : ce que la scène a décidé (voir `buildScene`). */
export interface PoseDAppareil {
  /** Ce qui identifie l'appareil (ou l'ensemble sous une plaque). */
  id: string;
  genre: GenreDAppareil;
  /** Plaque : sa largeur et sa hauteur (m), et ses postes. */
  largeur?: number;
  hauteur?: number;
  postes?: PosteDAppareil[];
  /** Au plafond : ce qui y est posé. */
  plafond?: CeilingKind;
  /** Le mur qui le porte — un mur isolé ne garde que les siens. */
  wallId?: string;
  /** Le centre de l'appareil, au nu du mur ou du plafond (m, repère de la scène). */
  x: number;
  y: number;
  z: number;
  /** La normale de la face qui le porte, vers la pièce (horizontale pour un mur). */
  nx: number;
  nz: number;
}

/** Les postes qui sont des mécanismes de plaque (et non un appareil hors gabarit). */
export function seMetSousPlaque(kind: FixtureKind): boolean {
  return !HORS_PLAQUE.has(kind);
}
const HORS_PLAQUE = new Set<FixtureKind>(['applique', 'tableau', 'thermostat', 'boite']);

// ---------------------------------------------------------- les contours

/**
 * UN RECTANGLE ARRONDI, parcouru dans le sens trigonométrique, avec ses
 * normales sortantes. `coin` points par quart de cercle : le même nombre
 * pour tous les anneaux d'un même bord, qui se répondent ainsi point à point.
 */
function rectArrondi(a: number, b: number, r: number, coin: number): { p: P2[]; n: P2[] } {
  const rr = Math.max(0, Math.min(r, a, b));
  const p: P2[] = [];
  const n: P2[] = [];
  const centres: [number, number, number][] = [
    [a - rr, -(b - rr), -Math.PI / 2],
    [a - rr, b - rr, 0],
    [-(a - rr), b - rr, Math.PI / 2],
    [-(a - rr), -(b - rr), Math.PI],
  ];
  for (const [cx, cy, t0] of centres) {
    for (let k = 0; k <= coin; k++) {
      const t = t0 + (k / coin) * (Math.PI / 2);
      p.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr]);
      n.push([Math.cos(t), Math.sin(t)]);
    }
  }
  return { p, n };
}

/** Un cercle, dans le sens trigonométrique. */
function cercle(cx: number, cy: number, r: number, n: number): P2[] {
  return Array.from({ length: n }, (_, k) => {
    const t = (k / n) * Math.PI * 2;
    return [cx + Math.cos(t) * r, cy + Math.sin(t) * r] as P2;
  });
}

/** Le bord d'un carré de demi-côté `h`, sur le rayon d'angle `t` issu de son centre. */
function bordDuCarre(cx: number, cy: number, h: number, t: number): P2 {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const d = h / Math.max(Math.abs(c), Math.abs(s));
  return [cx + c * d, cy + s * d];
}

/** Garde la part d'un polygone convexe où `sens·(coord − v) ≥ 0`. */
function couper(poly: P2[], axe: 0 | 1, v: number, sens: 1 | -1): P2[] {
  if (!Number.isFinite(v)) return poly;
  const dedans = (p: P2) => sens * (p[axe] - v) >= -1e-9;
  const out: P2[] = [];
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k];
    const q = poly[(k + 1) % poly.length];
    const ip = dedans(p);
    const iq = dedans(q);
    if (ip) out.push(p);
    if (ip !== iq) {
      const t = (v - p[axe]) / (q[axe] - p[axe]);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

const aire = (poly: P2[]) =>
  Math.abs(poly.reduce((s, p, k) => {
    const q = poly[(k + 1) % poly.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0)) / 2;

/**
 * L'AVANT D'UNE PLAQUE, MOINS SES FENÊTRES — en morceaux convexes.
 *
 * Les fenêtres sont alignées sur une rangée (c'est ainsi qu'on pose une
 * double prise) : une bande au-dessus, une au-dessous, et entre les deux
 * les montants, de part et d'autre de chaque fenêtre.
 */
function avantDeLaPlaque(contour: P2[], fenetres: P2[], h: number): P2[][] {
  if (fenetres.length === 0) return [contour];
  const y0 = Math.min(...fenetres.map((f) => f[1])) - h;
  const y1 = Math.max(...fenetres.map((f) => f[1])) + h;
  const morceaux: P2[][] = [couper(contour, 1, y1, 1), couper(contour, 1, y0, -1)];
  const milieu = couper(couper(contour, 1, y0, 1), 1, y1, -1);
  let gauche = -Infinity;
  for (const x of fenetres.map((f) => f[0]).sort((a, b) => a - b)) {
    morceaux.push(couper(couper(milieu, 0, gauche, 1), 0, x - h, -1));
    gauche = x + h;
  }
  morceaux.push(couper(milieu, 0, gauche, 1));
  return morceaux.filter((m) => m.length >= 3 && aire(m) > 1e-6);
}

const AVANT: V3 = [0, 0, 1];
const en3 = (pts: P2[], z: number): V3[] => pts.map(([x, y]) => [x, y, z]);
const pareil = <X>(n: number, x: X): X[] => Array.from({ length: n }, () => x);

/** Une pièce tournée autour de l'axe `z` (sortant du mur), centrée en (cx, cy). */
function tourne(a: Atelier, cx: number, cy: number, faire: () => void) {
  a.avec(deplacer(cx, cy, 0), () => a.avec(tourner('x', Math.PI / 2), faire));
}

// ------------------------------------------------------------- la plaque

/**
 * LA PLAQUE : un flanc, un biseau en quart de rond, l'avant percé d'une
 * fenêtre par poste, et le tableau de chaque fenêtre qui descend jusqu'au
 * mécanisme. Pas de dos : il est contre le mur, personne ne le verra.
 */
function plaque(a: Atelier, W: number, H: number, fenetres: P2[]) {
  const A = W / 2;
  const B = H / 2;
  const R = Math.min(R_PLAQUE, A, B);
  const coin = 4;
  const bord = rectArrondi(A, B, R, coin);
  const nb = bord.n.map(([x, y]) => [x, y, 0] as V3);
  a.bande(en3(bord.p, 0), en3(bord.p, EP - BISEAU), nb, nb, 'laque', T.plaque);
  // Le biseau : trois anneaux sur le quart de rond.
  const S = 3;
  let avant = { p: en3(bord.p, EP - BISEAU), n: nb };
  for (let s = 1; s <= S; s++) {
    const phi = (s / S) * (Math.PI / 2);
    const retrait = BISEAU * (1 - Math.cos(phi));
    const anneau = rectArrondi(A - retrait, B - retrait, Math.max(0, R - retrait), coin);
    const z = EP - BISEAU + BISEAU * Math.sin(phi);
    const n = anneau.n.map(([x, y]) => [x * Math.cos(phi), y * Math.cos(phi), Math.sin(phi)] as V3);
    const pts = en3(anneau.p, z);
    a.bande(avant.p, pts, avant.n, n, 'laque', T.plaque);
    avant = { p: pts, n };
  }
  // L'avant, percé.
  const face = rectArrondi(A - BISEAU, B - BISEAU, Math.max(0, R - BISEAU), coin).p;
  for (const m of avantDeLaPlaque(face, fenetres, FENETRE)) {
    a.polygone(en3(m, EP), AVANT, 'laque', T.plaque);
  }
  // Le tableau de chaque fenêtre : quatre parois tournées vers son centre.
  for (const [cx, cy] of fenetres) {
    const h = FENETRE;
    const coins: P2[] = [
      [cx - h, cy - h],
      [cx + h, cy - h],
      [cx + h, cy + h],
      [cx - h, cy + h],
    ];
    for (let k = 0; k < 4; k++) {
      const p = coins[k];
      const q = coins[(k + 1) % 4];
      const mx = (p[0] + q[0]) / 2 - cx;
      const my = (p[1] + q[1]) / 2 - cy;
      const l = Math.hypot(mx, my) || 1;
      const n: V3 = [-mx / l, -my / l, 0];
      a.bande(
        [
          [p[0], p[1], Z_MECA],
          [q[0], q[1], Z_MECA],
        ],
        [
          [p[0], p[1], EP],
          [q[0], q[1], EP],
        ],
        [n, n],
        [n, n],
        'laque',
        T.plaque,
        false,
      );
    }
  }
}

// --------------------------------------------------------- les mécanismes

/** Le nu d'un mécanisme : la fenêtre, pleine. */
function nu(a: Atelier, cx: number, cy: number, couleur: string = T.meca) {
  const h = FENETRE;
  a.polygone(
    [
      [cx - h, cy - h, Z_MECA],
      [cx + h, cy - h, Z_MECA],
      [cx + h, cy + h, Z_MECA],
      [cx - h, cy + h, Z_MECA],
    ],
    AVANT,
    'laque',
    couleur,
  );
}

/** Un disque plat, posé à `z` (une alvéole, un voyant, une vis). */
function pastille(a: Atelier, cx: number, cy: number, r: number, z: number, mat: Matiere, couleur: string, n = 14) {
  a.polygone(en3(cercle(cx, cy, r, n), z), AVANT, mat, couleur);
}

/**
 * LA PRISE 2P+T : un puits rond dans le mécanisme, deux alvéoles à 19 mm
 * d'entraxe, et la broche de terre au-dessus — c'est elle qui fait une prise
 * française au premier regard.
 */
function prise(a: Atelier, cx: number, cy: number, calibre32 = false) {
  const N = 40;
  const ext = Array.from({ length: N }, (_, k) => bordDuCarre(cx, cy, FENETRE, (k / N) * Math.PI * 2));
  const bouche = cercle(cx, cy, R_PUITS, N);
  a.bande(en3(ext, Z_MECA), en3(bouche, Z_MECA), pareil(N, AVANT), pareil(N, AVANT), 'laque', T.meca);
  // La paroi du puits, tournée vers son axe.
  const dedans = bouche.map(([x, y]) => {
    const l = Math.hypot(x - cx, y - cy) || 1;
    return [-(x - cx) / l, -(y - cy) / l, 0] as V3;
  });
  a.bande(en3(bouche, Z_MECA), en3(bouche, Z_FOND), dedans, dedans, 'laque', T.meca);
  a.polygone(en3(bouche, Z_FOND), AVANT, 'laque', T.meca);
  if (calibre32) {
    // Trois alvéoles plus fortes : phase, neutre, terre.
    for (const [dx, dy] of [
      [-1.0, -0.45],
      [1.0, -0.45],
      [0, 0.95],
    ]) {
      pastille(a, cx + dx, cy + dy, 0.36, Z_FOND + 0.015, 'noir', T.alveole);
    }
    return;
  }
  for (const dx of [-0.95, 0.95]) pastille(a, cx + dx, cy - 0.15, 0.27, Z_FOND + 0.015, 'noir', T.alveole);
  a.tube([cx, cy + 1.0, Z_FOND], [cx, cy + 1.0, Z_MECA - 0.08], 0.24, 0.22, 'chrome', T.chrome, { seg: 10, bouts: 'haut' });
}

/** La bascule d'un interrupteur : une touche qui couvre la fenêtre, légèrement inclinée. */
function bascule(a: Atelier, cx: number, cy: number, inclinaison = 0.055) {
  nu(a, cx, cy);
  const h = FENETRE - 0.18;
  a.avec(tourner('x', inclinaison, [cx, cy, Z_MECA]), () =>
    a.boite(cx - h, cx + h, cy - h, cy + h, Z_MECA - 0.1, Z_MECA + 0.34, 'laque', T.meca, {
      r: [0.35, 0.35, 0.18],
      seg: 2,
      sans: ['avant'],
    }),
  );
}

/** Une flèche en relief léger, pointe vers le haut (`sens` 1) ou le bas (−1). */
function fleche(a: Atelier, cx: number, cy: number, z: number, sens: 1 | -1) {
  const l = 0.5;
  const hh = 0.32 * sens;
  a.polygone(
    [
      [cx - l, cy - hh, z],
      [cx + l, cy - hh, z],
      [cx, cy + hh, z],
    ],
    AVANT,
    'laque',
    T.gris,
  );
}

/** La commande de volet : deux demi-touches, montée et descente. */
function volet(a: Atelier, cx: number, cy: number) {
  nu(a, cx, cy);
  const h = FENETRE - 0.18;
  for (const sens of [1, -1] as const) {
    const y0 = sens > 0 ? cy + 0.07 : cy - h;
    const y1 = sens > 0 ? cy + h : cy - 0.07;
    a.boite(cx - h, cx + h, y0, y1, Z_MECA - 0.1, Z_MECA + 0.3, 'laque', T.meca, {
      r: [0.3, 0.3, 0.15],
      seg: 2,
      sans: ['avant'],
    });
    fleche(a, cx, cy + sens * 1.15, Z_MECA + 0.305, sens);
  }
}

/** Le poussoir : une touche droite, et son voyant. */
function poussoir(a: Atelier, cx: number, cy: number) {
  bascule(a, cx, cy, 0);
  pastille(a, cx, cy + 1.55, 0.22, Z_MECA + 0.345, 'lumiere', '#FFC56B', 12);
}

/** Le variateur : un bouton rond, et son repère. */
function variateur(a: Atelier, cx: number, cy: number) {
  nu(a, cx, cy);
  tourne(a, cx, cy, () =>
    a.tour(
      [
        [1.55, Z_MECA - 0.05, true],
        [1.6, Z_MECA + 0.62],
        [1.42, Z_MECA + 0.88],
        [0, Z_MECA + 0.92],
      ],
      0,
      0,
      'laque',
      T.meca,
      { seg: 28 },
    ),
  );
  a.boite(cx - 0.09, cx + 0.09, cy + 0.55, cy + 1.25, Z_MECA + 0.86, Z_MECA + 0.95, 'laque', T.gris);
}

/** Le RJ45 : le port, sous son volet, et l'étiquette de repérage. */
function rj45(a: Atelier, cx: number, cy: number) {
  nu(a, cx, cy);
  const z = Z_MECA + 0.01;
  a.polygone(
    [
      [cx - 0.8, cy - 0.45, z],
      [cx + 0.8, cy - 0.45, z],
      [cx + 0.8, cy + 0.8, z],
      [cx - 0.8, cy + 0.8, z],
    ],
    AVANT,
    'noir',
    T.alveole,
  );
  a.boite(cx - 0.95, cx + 0.95, cy + 0.8, cy + 1.15, Z_MECA - 0.05, Z_MECA + 0.35, 'laque', T.meca);
  a.polygone(
    [
      [cx - 1.3, cy - 1.75, z],
      [cx + 1.3, cy - 1.75, z],
      [cx + 1.3, cy - 1.15, z],
      [cx - 1.3, cy - 1.15, z],
    ],
    AVANT,
    'laque',
    T.etiquette,
  );
}

/** La prise TV : la fiche coaxiale mâle, chromée, sur sa collerette. */
function tv(a: Atelier, cx: number, cy: number) {
  nu(a, cx, cy);
  tourne(a, cx, cy, () => {
    a.tour(
      [
        [1.15, Z_MECA - 0.02, true],
        [1.15, Z_MECA + 0.18],
        [0.66, Z_MECA + 0.26, true],
      ],
      0,
      0,
      'laque',
      T.meca,
      { seg: 28 },
    );
    a.tour(
      [
        [0.62, Z_MECA + 0.2, true],
        [0.62, Z_MECA + 0.95, true],
        [0.47, Z_MECA + 0.95, true],
        [0.47, Z_MECA + 0.4, true],
        [0, Z_MECA + 0.4],
      ],
      0,
      0,
      'chrome',
      T.chrome,
      { seg: 22 },
    );
  });
  a.tube([cx, cy, Z_MECA + 0.4], [cx, cy, Z_MECA + 0.75], 0.07, 0.07, 'chrome', T.chrome, { seg: 8, bouts: 'haut' });
}

/** La sortie de câble : le presse-étoupe, et le câble qui descend vers l'appareil. */
function sortieCable(a: Atelier, cx: number, cy: number) {
  nu(a, cx, cy);
  tourne(a, cx, cy, () =>
    a.tour(
      [
        [1.05, Z_MECA - 0.02, true],
        [1.0, Z_MECA + 0.45],
        [0.62, Z_MECA + 0.9],
        [0.45, Z_MECA + 0.92],
      ],
      0,
      0,
      'laque',
      T.meca,
      { seg: 24 },
    ),
  );
  const zc = Z_MECA + 1.35;
  a.tube([cx, cy, Z_MECA + 0.6], [cx, cy - 0.5, zc], 0.38, 0.38, 'laque', T.plaque, { seg: 10, bouts: 'aucun' });
  a.tube([cx, cy - 0.5, zc], [cx, cy - 13, zc + 0.15], 0.38, 0.38, 'laque', T.plaque, { seg: 10, bouts: 'bas' });
}

function mecanisme(a: Atelier, kind: FixtureKind, cx: number, cy: number) {
  switch (kind) {
    case 'prise':
    case 'prise20':
      prise(a, cx, cy);
      break;
    case 'prise32':
      prise(a, cx, cy, true);
      break;
    case 'inter':
    case 'va':
      bascule(a, cx, cy);
      break;
    case 'poussoir':
      poussoir(a, cx, cy);
      break;
    case 'volet':
      volet(a, cx, cy);
      break;
    case 'variateur':
      variateur(a, cx, cy);
      break;
    case 'rj45':
      rj45(a, cx, cy);
      break;
    case 'tv':
      tv(a, cx, cy);
      break;
    case 'sortieCable':
      sortieCable(a, cx, cy);
      break;
    default:
      // Un mécanisme qu'on ne sait pas dessiner : son nu, sans rien prétendre.
      nu(a, cx, cy);
  }
}

// ---------------------------------------------------- hors gabarit, au mur

/**
 * L'APPLIQUE : un coin de lumière, comme celle du catalogue — étroit contre
 * le mur, large devant, et ouvert en haut et en bas : ses deux faisceaux
 * lavent le mur au-dessus et au-dessous. Blanche, sur sa platine.
 */
function applique(a: Atelier) {
  const L = 6;
  const zM = 0.6;
  const zA = 8.4;
  const hM = 1.9;
  const hA = 3.6;
  a.boite(-2.2, 2.2, -2.2, 2.2, 0, zM, 'laque', T.plaque, { r: [0.5, 0.5, 0.2], seg: 1, sans: ['avant'] });
  // L'avant, et les deux flancs en trapèze.
  a.polygone(
    [
      [-L, -hA, zA],
      [L, -hA, zA],
      [L, hA, zA],
      [-L, hA, zA],
    ],
    AVANT,
    'laque',
    T.plaque,
  );
  for (const sx of [-1, 1]) {
    a.polygone(
      [
        [sx * L, -hM, zM],
        [sx * L, -hA, zA],
        [sx * L, hA, zA],
        [sx * L, hM, zM],
      ],
      [sx, 0, 0],
      'laque',
      T.plaque,
    );
  }
  // Les deux ouvertures, allumées : le dessus regarde le plafond, le dessous le sol.
  const pente = Math.hypot(zA - zM, hA - hM);
  for (const sy of [1, -1]) {
    const n: V3 = [0, (sy * (zA - zM)) / pente, -(hA - hM) / pente];
    a.polygone(
      [
        [-L, sy * hM, zM],
        [L, sy * hM, zM],
        [L, sy * hA, zA],
        [-L, sy * hA, zA],
      ],
      n,
      'lumiere',
      T.lumiere,
    );
  }
}

/**
 * LE TABLEAU : un coffret blanc, une porte de verre fumé, et derrière elle
 * quatre rangées — un interrupteur différentiel en tête, ses disjoncteurs, et
 * des obturateurs pour les places libres, comme sur un tableau qu'on vient de
 * fermer. Les rangées passent dans les fentes d'un plastron ; seules les
 * manettes en dépassent, noires.
 */
function tableau(a: Atelier, W: number, H: number, D: number) {
  const A = W / 2;
  const B = H / 2;
  const ep = 1.2;
  const r = { r: [0.5, 0.5, 0.5] as V3, seg: 1 };
  // Le fond et les quatre côtés du coffret.
  a.boite(-A, A, -B, B, 0, 0.6, 'laque', T.plaque, { sans: ['avant'] });
  a.boite(-A, -A + ep, -B, B, 0, D, 'laque', T.plaque, { ...r, sans: ['avant'] });
  a.boite(A - ep, A, -B, B, 0, D, 'laque', T.plaque, { ...r, sans: ['avant'] });
  a.boite(-A + ep, A - ep, B - ep, B, 0, D, 'laque', T.plaque, { ...r, sans: ['avant'] });
  a.boite(-A + ep, A - ep, -B, -B + ep, 0, D, 'laque', T.plaque, { ...r, sans: ['avant'] });
  // Le cadre de la porte, et son verre.
  const cadre = 3;
  const zp0 = D - 0.8;
  a.boite(-A + ep, -A + cadre, -B + ep, B - ep, zp0, D, 'laque', T.plaque);
  a.boite(A - cadre, A - ep, -B + ep, B - ep, zp0, D, 'laque', T.plaque);
  a.boite(-A + cadre, A - cadre, B - cadre, B - ep, zp0, D, 'laque', T.plaque);
  a.boite(-A + cadre, A - cadre, -B + ep, -B + cadre, zp0, D, 'laque', T.plaque);
  // La poignée.
  a.boite(A - cadre + 0.4, A - cadre + 1.1, -3, 3, D, D + 0.5, 'laque', T.gris, { r: [0.3, 0.3, 0.2], seg: 1 });
  a.polygone(
    [
      [-A + cadre, -B + cadre, D - 0.4],
      [A - cadre, -B + cadre, D - 0.4],
      [A - cadre, B - cadre, D - 0.4],
      [-A + cadre, B - cadre, D - 0.4],
    ],
    AVANT,
    'verre',
    T.fume,
  );
  // Le plastron et ses rangées.
  const zPl = Math.min(5.0, D - 2.6);
  const xg = -A + cadre;
  const xd = A - cadre;
  const rangees = 4;
  const pas = (2 * (B - cadre)) / rangees;
  const fente = 2.2;
  const module = 1.75;
  const largeurRangee = Math.min(xd - xg - 4, 24 * module);
  const x0 = -largeurRangee / 2;
  let yHaut = B - cadre;
  for (let k = 0; k < rangees; k++) {
    const yc = B - cadre - pas * (k + 0.5);
    // Le plastron entre deux rangées, et de part et d'autre de la fente.
    a.boite(xg, xd, yc + fente, yHaut, zPl - 0.4, zPl, 'laque', T.plaque, { sans: ['avant'] });
    a.boite(xg, x0, yc - fente, yc + fente, zPl - 0.4, zPl, 'laque', T.plaque, { sans: ['avant'] });
    a.boite(-x0, xd, yc - fente, yc + fente, zPl - 0.4, zPl, 'laque', T.plaque, { sans: ['avant'] });
    yHaut = yc - fente;
    // Le fond de la fente : l'ombre entre deux modules.
    a.polygone(
      [
        [x0, yc - fente, zPl - 0.6],
        [-x0, yc - fente, zPl - 0.6],
        [-x0, yc + fente, zPl - 0.6],
        [x0, yc + fente, zPl - 0.6],
      ],
      AVANT,
      'noir',
      T.alveole,
    );
    // L'étiquette de la rangée.
    a.boite(x0, -x0, yc + fente + 0.4, yc + fente + 1.3, zPl, zPl + 0.05, 'laque', T.etiquette);
    // Le différentiel (deux modules), les disjoncteurs, puis les obturateurs.
    const disjoncteurs = [13, 10, 14, 8][k];
    let x = x0;
    const poserModule = (n: number, test: boolean) => {
      const x1 = x + n * module;
      a.boite(x + 0.06, x1 - 0.06, yc - fente + 0.05, yc + fente - 0.05, zPl - 0.6, zPl + 1.4, 'laque', T.module);
      const xm = (x + x1) / 2;
      a.boite(xm - 0.32, xm + 0.32, yc - 0.3, yc + 1.25, zPl + 1.4, zPl + 2.0, 'noir', T.alveole);
      if (test) a.boite(x1 - 0.75, x1 - 0.3, yc - 1.6, yc - 1.15, zPl + 1.4, zPl + 1.6, 'laque', '#4F7FB8');
      x = x1;
    };
    poserModule(2, true);
    for (let d = 0; d < disjoncteurs; d++) poserModule(1, false);
    if (x < -x0 - 0.1) {
      a.boite(x + 0.06, -x0 - 0.06, yc - fente + 0.05, yc + fente - 0.05, zPl - 0.6, zPl + 0.5, 'laque', T.module);
    }
  }
  a.boite(xg, xd, -B + cadre, yHaut, zPl - 0.4, zPl, 'laque', T.plaque, { sans: ['avant'] });
}

/** Le thermostat : un boîtier blanc, son écran, deux touches. */
function thermostat(a: Atelier, W: number, H: number) {
  const A = W / 2;
  const B = H / 2;
  a.boite(-A, A, -B, B, 0, 1.9, 'laque', T.plaque, { r: [0.9, 0.9, 0.55], seg: 2, sans: ['avant'] });
  a.boite(-A * 0.6, A * 0.6, B * 0.08, B * 0.66, 1.84, 1.96, 'ecran', T.ecran, { r: [0.25, 0.25, 0.05], seg: 1 });
  a.polygone(
    [
      [-A * 0.3, B * 0.22, 1.965],
      [A * 0.3, B * 0.22, 1.965],
      [A * 0.3, B * 0.5, 1.965],
      [-A * 0.3, B * 0.5, 1.965],
    ],
    AVANT,
    'lumiere',
    '#CFE8FF',
  );
  for (const dx of [-A * 0.32, A * 0.32]) {
    a.tube([dx, -B * 0.42, 1.85], [dx, -B * 0.42, 2.08], 0.55, 0.52, 'laque', T.meca, { seg: 16, bouts: 'haut' });
  }
}

/** La boîte de dérivation : son couvercle, et ses quatre vis. */
function boite(a: Atelier, W: number, H: number) {
  const A = W / 2;
  const B = H / 2;
  a.boite(-A, A, -B, B, 0, 0.8, 'laque', T.plaque, { r: [0.6, 0.6, 0.3], seg: 2, sans: ['avant'] });
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      a.tube([sx * (A - 1.1), sy * (B - 1.1), 0.7], [sx * (A - 1.1), sy * (B - 1.1), 0.9], 0.33, 0.33, 'chrome', T.chrome, {
        seg: 10,
        bouts: 'haut',
      });
    }
  }
}

// -------------------------------------------------------------- au plafond

function spot(a: Atelier) {
  a.tour(
    [
      [3.1, -0.05, true],
      [3.1, -0.38, true],
      [4.5, -0.38, true],
      [4.6, 0],
    ],
    0,
    0,
    'laque',
    T.plaque,
    { seg: 32 },
  );
  a.tour([[0, -0.2], [3.1, -0.2]], 0, 0, 'lumiere', T.lumiere, { seg: 32 });
}

function dcl(a: Atelier) {
  // La rosace, le câble textile, la douille, l'ampoule.
  a.tour(
    [
      [0, -2.3],
      [4.4, -2.3, true],
      [5.0, 0],
    ],
    0,
    0,
    'laque',
    T.plaque,
    { seg: 28 },
  );
  a.tube([0, -2.3, 0], [0, -46, 0], 0.26, 0.26, 'noir', T.anthracite, { seg: 8, bouts: 'aucun' });
  a.tour(
    [
      [0, -53],
      [1.75, -52.8, true],
      [1.75, -46.5],
      [0.9, -45.6],
      [0.26, -45.5],
    ],
    0,
    0,
    'laque',
    T.plaque,
    { seg: 20 },
  );
  a.tour(
    [
      [0, -64.5],
      [2.2, -63.8],
      [3.3, -61.8],
      [3.0, -58.6],
      [1.6, -55.6],
      [1.35, -53],
    ],
    0,
    0,
    'lumiere',
    T.lumiere,
    { seg: 24 },
  );
}

function plafonnier(a: Atelier) {
  a.tour(
    [
      [12.2, -6.0, true],
      [14.0, -5.6, true],
      [14.0, 0],
    ],
    0,
    0,
    'laque',
    T.plaque,
    { seg: 40 },
  );
  a.tour(
    [
      [0, -6.6],
      [8.0, -6.4],
      [12.2, -6.0],
    ],
    0,
    0,
    'lumiere',
    T.lumiere,
    { seg: 40 },
  );
}

/**
 * LE VENTILATEUR : sa tige, son moteur, son plafonnier, et trois pales de
 * bois de 1,10 m d'envergure — un ventilateur se voit à son envergure, que
 * le symbole du plan ne dit pas.
 */
function ventilateur(a: Atelier) {
  a.tour(
    [
      [0.9, -4],
      [3.8, -4, true],
      [5.5, -0.5],
      [5.6, 0],
    ],
    0,
    0,
    'laque',
    T.plaque,
    { seg: 24 },
  );
  a.tube([0, -4, 0], [0, -22, 0], 0.9, 0.9, 'laque', T.plaque, { seg: 12, bouts: 'aucun' });
  a.tour(
    [
      [6.5, -32],
      [9.2, -29.5],
      [9.5, -26],
      [7.0, -22.5],
      [0.9, -22],
    ],
    0,
    0,
    'laque',
    T.plaque,
    { seg: 32 },
  );
  a.tour(
    [
      [0, -36.5],
      [4.0, -35.6],
      [6.5, -32],
    ],
    0,
    0,
    'lumiere',
    T.lumiere,
    { seg: 28 },
  );
  for (let k = 0; k < 3; k++) {
    const angle = (k / 3) * Math.PI * 2;
    a.avec(tourner('y', angle), () => {
      a.boite(7.5, 13, -29.4, -28.4, -1.4, 1.4, 'inox', T.chrome);
      a.avec(tourner('x', 0.18, [34, -28.6, 0]), () =>
        a.boite(12, 55, -29.0, -28.2, -6.5, 6.5, 'bois', T.bois, { r: [2.4, 0.3, 2.4], seg: 2 }),
      );
    });
  }
}

function daaf(a: Atelier) {
  a.tour(
    [
      [0, -3.6],
      [4.6, -3.5],
      [5.4, -3.0],
      [5.5, -2.6, true],
      [5.5, 0],
    ],
    0,
    0,
    'laque',
    T.plaque,
    { seg: 36 },
  );
  // Le bouton de test, et son voyant.
  a.tour([[0, -3.85], [1.3, -3.8], [1.4, -3.5]], 0, 0, 'laque', T.meca, { seg: 24 });
  a.tube([2.6, -3.45, 0], [2.6, -3.62, 0], 0.18, 0.18, 'lumiere', '#FF5A4E', { seg: 8, bouts: 'haut' });
}

function camera(a: Atelier) {
  a.tour(
    [
      [5.2, -1.6, true],
      [6.0, -1.2],
      [6.0, 0],
    ],
    0,
    0,
    'laque',
    T.plaque,
    { seg: 32 },
  );
  const profil: [number, number, boolean?][] = [];
  for (let k = 0; k <= 8; k++) {
    const t = (k / 8) * (Math.PI / 2);
    profil.push([Math.sin(t) * 4.6, -1.6 - Math.cos(t) * 4.6]);
  }
  a.tour(profil, 0, 0, 'ecran', '#262A30', { seg: 32 });
  a.tour([[4.6, -1.6], [5.2, -1.6]], 0, 0, 'laque', T.plaque, { seg: 32 });
}

function vmc(a: Atelier) {
  // Une bouche à gorges concentriques : le pavillon, puis les anneaux.
  a.tour(
    [
      [0, -2.2],
      [3.0, -2.2, true],
      [3.1, -1.7, true],
      [3.9, -1.7, true],
      [4.0, -1.25, true],
      [4.8, -1.25, true],
      [4.9, -0.8, true],
      [5.8, -0.8, true],
      [6.25, -0.35],
      [6.3, 0],
    ],
    0,
    0,
    'laque',
    T.plaque,
    { seg: 36 },
  );
}

function detecteur(a: Atelier) {
  a.tour(
    [
      [4.6, -1.5, true],
      [5.4, -1.2],
      [5.5, 0],
    ],
    0,
    0,
    'laque',
    T.plaque,
    { seg: 32 },
  );
  // La lentille à facettes : peu de côtés, exprès.
  const profil: [number, number, boolean?][] = [];
  for (let k = 0; k <= 4; k++) {
    const t = (k / 4) * (Math.PI / 2);
    profil.push([Math.sin(t) * 3.4, -1.5 - Math.cos(t) * 3.0, true]);
  }
  a.tour(profil, 0, 0, 'laque', T.meca, { seg: 12 });
  a.tour([[3.4, -1.5], [4.6, -1.5]], 0, 0, 'laque', T.plaque, { seg: 32 });
}

// ------------------------------------------------------------ l'aiguillage

/** Le modèle d'un appareil, dans son repère local, en centimètres. */
export function fabriquerAppareil(p: PoseDAppareil): ModeleLocal {
  const a = new Atelier();
  const cm = (m: number) => m * 100;
  switch (p.genre) {
    case 'plaque': {
      const postes = p.postes ?? [];
      const fenetres = postes.map((q) => [cm(q.dx), cm(q.dy)] as P2);
      plaque(a, cm(p.largeur ?? PLAQUE), cm(p.hauteur ?? PLAQUE), fenetres);
      postes.forEach((q, k) => mecanisme(a, q.kind, fenetres[k][0], fenetres[k][1]));
      break;
    }
    case 'applique':
      applique(a);
      break;
    case 'tableau':
      tableau(a, cm(p.largeur ?? 0.55), cm(p.hauteur ?? 0.65), 9);
      break;
    case 'thermostat':
      thermostat(a, cm(p.largeur ?? 0.09), cm(p.hauteur ?? 0.09));
      break;
    case 'boite':
      boite(a, cm(p.largeur ?? 0.1), cm(p.hauteur ?? 0.1));
      break;
    case 'plafond':
      switch (p.plafond) {
        case 'spot':
          spot(a);
          break;
        case 'dcl':
          dcl(a);
          break;
        case 'applique':
          plafonnier(a);
          break;
        case 'ventilateur':
          ventilateur(a);
          break;
        case 'daaf':
          daaf(a);
          break;
        case 'camera':
          camera(a);
          break;
        case 'vmc':
          vmc(a);
          break;
        case 'detecteur':
          detecteur(a);
          break;
      }
      break;
  }
  return a.finir();
}

/** Un mécanisme d'un ensemble, à sa place sur la face du mur (m). */
export interface PosteSurLaFace {
  kind: FixtureKind;
  x: number;
  y: number;
  /** L'appareil qui le porte. */
  source: string;
  /** Le gabarit de cet appareil (m) — pour ce qui n'est pas une plaque. */
  w: number;
  h: number;
}

/**
 * LES POSTES D'UN ENSEMBLE, à l'entraxe — un mécanisme par fonction, qu'il
 * vienne d'un appareil multiposte du catalogue ou d'appareils réunis à la
 * main. La même règle pour la maquette et pour la vue « Face au mur ».
 */
export function postesDuLot(lot: Fixture[], xDe: (f: Fixture) => number): PosteSurLaFace[] {
  const out: PosteSurLaFace[] = [];
  for (const f of lot) {
    const sp = FIXTURES[f.kind];
    const gauche = xDe(f) - sp.w / 2;
    const offs = boxOffsets(f.kind);
    postsOf(f.kind).forEach((k, i) =>
      out.push({ kind: k, x: gauche + offs[i], y: f.height, source: f.id, w: sp.w, h: sp.h }),
    );
  }
  return out;
}

/**
 * LES POSES D'UN ENSEMBLE SOUS UNE PLAQUE — ou d'un appareil seul.
 *
 * `postes` vient de la scène : chaque mécanisme à sa place sur la face du
 * mur (m), dans l'ordre de gauche à droite. Une plaque n'existe que si tous
 * ses postes en sont ; un appareil hors gabarit glissé dans un ensemble —
 * une applique réunie à une prise — garde son propre modèle, et ses voisins
 * leur plaque.
 */
export function posesDUnLot(
  id: string,
  wallId: string | undefined,
  postes: PosteSurLaFace[],
  /** Un point de la face : abscisse le long du mur, altitude (m) → la scène. */
  surLeMur: (x: number, y: number) => { x: number; y: number; z: number },
  n: { nx: number; nz: number },
): PoseDAppareil[] {
  const out: PoseDAppareil[] = [];
  const enPlaque = postes.filter((q) => seMetSousPlaque(q.kind));
  // Un appareil hors gabarit : son modèle à sa place.
  for (const q of postes.filter((p) => !seMetSousPlaque(p.kind))) {
    const c = surLeMur(q.x, q.y);
    out.push({
      id: `${q.source}`,
      genre: q.kind as GenreDAppareil,
      largeur: q.w,
      hauteur: q.h,
      wallId,
      ...c,
      ...n,
    });
  }
  if (enPlaque.length === 0) return out;
  // Des postes à des hauteurs différentes ne partagent pas une plaque.
  const memeRangee = enPlaque.every((q) => Math.abs(q.y - enPlaque[0].y) < 0.005);
  const lots = memeRangee ? [enPlaque] : enPlaque.map((q) => [q]);
  for (const lot of lots) {
    const xs = lot.map((q) => q.x);
    const x0 = Math.min(...xs) - PLAQUE / 2;
    const x1 = Math.max(...xs) + PLAQUE / 2;
    const yc = lot[0].y;
    const xc = (x0 + x1) / 2;
    const c = surLeMur(xc, yc);
    out.push({
      id: lot.length === postes.length ? id : lot.map((q) => q.source).join('+'),
      genre: 'plaque',
      largeur: x1 - x0,
      hauteur: PLAQUE,
      postes: lot.map((q) => ({ kind: q.kind, dx: q.x - xc, dy: q.y - yc, source: q.source })),
      wallId,
      ...c,
      ...n,
    });
  }
  return out;
}

// ------------------------------------------------------------ dans la scène

const CACHE = new Map<string, ModeleLocal>();
const CACHE_MAX = 160;

function cleDe(p: PoseDAppareil): string {
  return [
    p.genre,
    p.plafond ?? '',
    (p.largeur ?? 0).toFixed(4),
    (p.hauteur ?? 0).toFixed(4),
    (p.postes ?? []).map((q) => `${q.kind}@${q.dx.toFixed(4)},${q.dy.toFixed(4)}`).join(';'),
  ].join('|');
}

/** Le modèle d'un appareil — fabriqué une fois par forme : vingt prises, un modèle. */
export function modeleDAppareil(p: PoseDAppareil): ModeleLocal {
  const cle = cleDe(p);
  const deja = CACHE.get(cle);
  if (deja) return deja;
  const m = fabriquerAppareil(p);
  if (CACHE.size >= CACHE_MAX) {
    const premiere = CACHE.keys().next().value;
    if (premiere !== undefined) CACHE.delete(premiere);
  }
  CACHE.set(cle, m);
  return m;
}

/**
 * TOUT L'APPAREILLAGE, POSÉ DANS LA SCÈNE — des groupes en mètres, prêts à
 * rejoindre ceux des meubles (voir `maillageDesMeubles`).
 *
 * Un appareil mural : `x` local suit la face vers la droite, (nz, −nx) ; `z`
 * local est la normale ; le repère est direct, la carte graphique garde donc
 * le bon sens des faces. Au plafond, les axes sont ceux de la scène.
 */
export function groupesDesAppareils(poses: PoseDAppareil[]): GroupeLocal[] {
  const groupes = new Map<string, GroupeLocal>();
  for (const p of poses) {
    const modele = modeleDAppareil(p);
    const auPlafond = p.genre === 'plafond';
    const X: V3 = auPlafond ? [1, 0, 0] : [p.nz, 0, -p.nx];
    const Y: V3 = [0, 1, 0];
    const Z: V3 = auPlafond ? [0, 0, 1] : [p.nx, 0, p.nz];
    for (const gl of modele.groupes) {
      const cle = `${gl.mat}|${gl.couleur}`;
      let g = groupes.get(cle);
      if (!g) {
        g = { mat: gl.mat, couleur: gl.couleur, v: [], i: [] };
        groupes.set(cle, g);
      }
      const base = g.v.length / PAR_SOMMET;
      const v = gl.v;
      for (let k = 0; k < v.length; k += PAR_SOMMET) {
        const x = v[k] / 100;
        const y = v[k + 1] / 100;
        const z = v[k + 2] / 100;
        const nx = v[k + 3];
        const ny = v[k + 4];
        const nz = v[k + 5];
        g.v.push(
          p.x + X[0] * x + Y[0] * y + Z[0] * z,
          p.y + X[1] * x + Y[1] * y + Z[1] * z,
          p.z + X[2] * x + Y[2] * y + Z[2] * z,
          X[0] * nx + Y[0] * ny + Z[0] * nz,
          X[1] * nx + Y[1] * ny + Z[1] * nz,
          X[2] * nx + Y[2] * ny + Z[2] * nz,
          v[k + 6] / 100,
          v[k + 7] / 100,
        );
      }
      for (const idx of gl.i) g.i.push(base + idx);
    }
  }
  return [...groupes.values()];
}

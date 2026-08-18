/**
 * Ce qui se pose AU PLAFOND, et ce qui le commande.
 *
 * L'appareillage mural se repère sur une face : un mur, une abscisse, une
 * hauteur. Un point lumineux, un détecteur ou une caméra, non — ils vivent
 * dans le plan de la pièce, à deux coordonnées, et se cotent depuis les murs
 * comme un meuble. C'est un autre objet, et le mélanger à l'appareillage
 * mural aurait obligé chaque calcul à se demander à chaque ligne de quel
 * genre d'appareil il parle.
 *
 * Le second apport de ce module est le **lien de commande** : le trait
 * pointillé qui va d'un interrupteur au point qu'il allume. C'est LUI qu'on
 * lit sur un plan d'électricien — un plan qui montre six interrupteurs et
 * huit points lumineux sans dire lequel commande quoi n'est pas un plan de
 * travail, c'est un inventaire.
 */
import { castToWall, interiorPole, type Pt, type WallSeg } from './floorplan';
import { pointInPolygon } from './appearance';

export type CeilingKind =
  | 'dcl'
  | 'spot'
  | 'applique'
  | 'ventilateur'
  | 'daaf'
  | 'camera'
  | 'vmc'
  | 'detecteur';

export interface CeilingSpec {
  label: string;
  /** Sigle porté sur le plan, à côté du symbole. */
  short: string;
  family: string;
  /** Diamètre du symbole au plan, en mètres réels. */
  d: number;
  color: string;
  /** Puissance d'usage, pour le bilan (W). Nulle si l'appareil n'éclaire pas. */
  watts: number;
  /** Se commande par un interrupteur ? Un détecteur, non. */
  commandable: boolean;
  note: string;
}

const C_LUM = '#E0A33A';
const C_SECU = '#EB5757';
const C_VENT = '#3EB8E5';

export const CEILING_KINDS: CeilingKind[] = [
  'dcl',
  'spot',
  'applique',
  'ventilateur',
  'daaf',
  'camera',
  'vmc',
  'detecteur',
];

export const CEILINGS: Record<CeilingKind, CeilingSpec> = {
  dcl: {
    label: 'Point lumineux DCL',
    short: 'DCL',
    family: 'Éclairage',
    d: 0.22,
    color: C_LUM,
    watts: 60,
    commandable: true,
    note:
      'Boîte DCL au plafond, une par pièce au minimum dans les pièces ' +
      'principales. Point de centre, sur socle DCL.',
  },
  spot: {
    label: 'Spot encastré',
    short: 'SP',
    family: 'Éclairage',
    d: 0.09,
    color: C_LUM,
    watts: 8,
    commandable: true,
    note: 'Encastré, Ø 75 mm percé. Se compte par ligne de spots.',
  },
  applique: {
    label: 'Applique plafond',
    short: 'AP',
    family: 'Éclairage',
    d: 0.16,
    color: C_LUM,
    watts: 25,
    commandable: true,
    note: 'Luminaire en applique, alimenté par boîte de dérivation.',
  },
  ventilateur: {
    label: 'Ventilateur de plafond',
    short: 'VT',
    family: 'Éclairage',
    d: 0.3,
    color: C_LUM,
    watts: 70,
    commandable: true,
    note: 'Fixation renforcée : un crochet DCL ne porte pas un ventilateur.',
  },
  daaf: {
    label: 'Détecteur de fumée',
    short: 'DAAF',
    family: 'Sécurité',
    d: 0.13,
    color: C_SECU,
    watts: 0,
    commandable: false,
    note:
      'Obligatoire, au moins un par logement, dans la circulation qui ' +
      'dessert les chambres. Jamais en cuisine ni en salle d’eau.',
  },
  camera: {
    label: 'Caméra',
    short: 'CAM',
    family: 'Sécurité',
    d: 0.12,
    color: C_SECU,
    watts: 6,
    commandable: false,
    note: 'Alimentation PoE ou 12 V : prévoir la liaison au coffret VDI.',
  },
  detecteur: {
    label: 'Détecteur de présence',
    short: 'DP',
    family: 'Sécurité',
    d: 0.11,
    color: C_SECU,
    watts: 2,
    commandable: false,
    note: 'Commande l’éclairage à la place d’un interrupteur.',
  },
  vmc: {
    label: 'Bouche de VMC',
    short: 'VMC',
    family: 'Ventilation',
    d: 0.125,
    color: C_VENT,
    watts: 0,
    commandable: false,
    note: 'Extraction en pièce humide, amenée d’air en pièce sèche.',
  },
};

/** Un appareil de plafond posé dans une pièce. */
export interface CeilingFixture {
  id: string;
  kind: CeilingKind;
  /** Pièce qui le porte : c'est elle qui donne son circuit et son métré. */
  roomId: string;
  /** Position au sol, dans le repère du plan. */
  at: Pt;
  /**
   * Les commandes qui l'allument — les identifiants d'appareils MURAUX.
   *
   * Plusieurs pour un va-et-vient : deux interrupteurs, un point. C'est ce
   * lien qui se dessine en pointillé sur le plan, et c'est la seule chose
   * qu'un plan d'implantation dit de plus qu'un inventaire.
   */
  commands?: string[];
  /**
   * LA LIGNE à laquelle il appartient, quand il a été posé en série.
   *
   * Quatre spots posés d'un geste, ce n'est pas quatre appareils
   * indépendants : c'est une ligne, qu'on déplace, qu'on retourne et
   * qu'on supprime d'un bloc. Sans ce lien, retourner une ligne de six
   * demandait six réglages au centimètre — exactement ce que la pose en
   * série était censée épargner.
   */
  row?: string;
  /** L'axe sur lequel la ligne a été tendue : longueur ou largeur. */
  axe?: SpotAxis;
}

/** Le sens d'une ligne de spots, par rapport à la pièce. */
export type SpotAxis = 'longueur' | 'largeur';

/** Un pavé rectangulaire de la pièce, mesuré DANS LA TRAME. */
export interface Zone {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Le symbole d'un appareil de plafond, dans un carré de 24 centré. */
export const CEILING_SYMBOL: Record<CeilingKind, { d: string; fill?: boolean }[]> = {
  // La croix du point lumineux : le symbole normalisé, celui que tout
  // électricien reconnaît sans légende.
  dcl: [{ d: 'M-8 -8 L8 8' }, { d: 'M8 -8 L-8 8' }],
  spot: [
    { d: 'M-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0' },
    { d: 'M0 -8 v3', },
    { d: 'M0 5 v3' },
    { d: 'M-8 0 h3' },
    { d: 'M5 0 h3' },
  ],
  applique: [
    { d: 'M-7 4 h14' },
    { d: 'M-4 4 a4 4 0 0 1 8 0' },
    { d: 'M0 -6 v2' },
  ],
  ventilateur: [
    { d: 'M-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0', fill: true },
    { d: 'M0 -2 C -3 -9 -8 -7 -8 -3 C -5 -3 -2 -2 0 -2' },
    { d: 'M2 0 C 9 -3 7 -8 3 -8 C 3 -5 2 -2 2 0' },
    { d: 'M-1 2 C -8 5 -6 9 -2 9 C -2 6 -1 4 -1 2' },
  ],
  daaf: [
    { d: 'M-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0' },
    { d: 'M-3.5 0 a3.5 3.5 0 1 0 7 0 a3.5 3.5 0 1 0 -7 0', fill: true },
  ],
  camera: [
    { d: 'M-8 -4 h11 v8 h-11 z' },
    { d: 'M3 -2 L8 -5 v10 L3 2 z', fill: true },
  ],
  detecteur: [
    { d: 'M-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0' },
    { d: 'M-4 3 L0 -4 L4 3' },
  ],
  vmc: [
    { d: 'M-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0' },
    { d: 'M-4.5 -3 h9' },
    { d: 'M-4.5 0 h9' },
    { d: 'M-4.5 3 h9' },
  ],
};

/**
 * Le point du plafond le plus proche, pour accrocher un lien de commande.
 *
 * Le trait pointillé part du bord du symbole, pas de son centre : un trait
 * qui s'arrête au milieu d'une croix la barre et la rend illisible.
 */
export function linkAnchor(from: Pt, to: Pt, radius: number): Pt {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) return to;
  return { x: to.x - (dx / l) * radius, z: to.z - (dz / l) * radius };
}

/**
 * La courbe d'un lien de commande : un arc, jamais une droite.
 *
 * Sur un plan d'électricien, le lien de commande est tracé en courbe pour
 * qu'on ne le confonde pas avec une cote, un mur ou un cheminement de
 * gaine. La flèche du milieu est décalée perpendiculairement d'un dixième
 * de la portée — assez pour que deux liens partant du même interrupteur ne
 * se superposent pas.
 */
export function linkCurve(a: Pt, b: Pt, courbure = 0.16): Pt[] {
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz) || 1;
  const cx = mx - (dz / l) * l * courbure;
  const cz = mz + (dx / l) * l * courbure;
  // Quadratique échantillonnée : le PDF comme l'écran ne tracent que des
  // segments, et douze points suffisent à ce qu'on n'en voie pas les coins.
  const out: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const u = 1 - t;
    out.push({
      x: u * u * a.x + 2 * u * t * cx + t * t * b.x,
      z: u * u * a.z + 2 * u * t * cz + t * t * b.z,
    });
  }
  return out;
}

/** Nombre de points lumineux et puissance installée, par pièce. */
export function lightingLoad(
  items: CeilingFixture[],
): Map<string, { points: number; watts: number }> {
  const out = new Map<string, { points: number; watts: number }>();
  for (const c of items) {
    const spec = CEILINGS[c.kind];
    const cur = out.get(c.roomId) ?? { points: 0, watts: 0 };
    if (spec.watts > 0) cur.points += 1;
    cur.watts += spec.watts;
    out.set(c.roomId, cur);
  }
  return out;
}


/**
 * Ramène un point SUR le contour d'une pièce, légèrement en retrait.
 *
 * Le doigt dépasse tout le temps : on vise le coin d'une pièce et on sort
 * d'un centimètre. Plutôt que de refuser le geste — l'appareil resterait
 * bloqué loin de là où on le veut —, on le pose au point du bord le plus
 * proche, reculé de `marge` vers l'intérieur pour que son symbole ne
 * chevauche pas la maçonnerie.
 */
export function insetOnRing(ring: Pt[], p: Pt, marge: number): Pt {
  let best: Pt = p;
  let dist = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    if (l2 < 1e-12) continue;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2),
    );
    const q = { x: a.x + dx * t, z: a.z + dz * t };
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d >= dist) continue;
    dist = d;
    /**
     * On recule vers un point SÛREMENT intérieur, pas vers le barycentre.
     *
     * Le barycentre d'une pièce en L tombe dans le vide : la normale
     * calculée par rapport à lui pointait alors vers l'extérieur, et le
     * recalage poussait l'appareil hors du mur au lieu de l'y ramener.
     * Le pôle d'inaccessibilité, lui, est intérieur par construction.
     */
    const dedans = interiorPole(ring);
    const vx = dedans.x - q.x;
    const vz = dedans.z - q.z;
    const vl = Math.hypot(vx, vz) || 1;
    best = { x: q.x + (vx / vl) * marge, z: q.z + (vz / vl) * marge };
  }
  return best;
}

/**
 * LES ZONES RECTANGULAIRES D'UNE PIÈCE.
 *
 * Une pièce n'est presque jamais un rectangle : il y a l'entrée, le
 * dégagement derrière la porte, le renfoncement de la cheminée. Poser une
 * ligne de spots sur l'emprise TOTALE revient à la faire passer dans le
 * vide — et le point qui tombe dehors est ramené contre le mur le plus
 * proche : le fameux spot collé à la cloison de la petite partie.
 *
 * On découpe donc la pièce en pavés : on cherche le plus grand rectangle
 * inscrit, on le retire, on recommence. Deux ou trois passées suffisent à
 * séparer « le grand séjour » de « son retour », et chacun reçoit ensuite
 * sa part de spots.
 *
 * Le calcul passe par une grille de douze centimètres, ÉRODÉE de trente :
 * on ne cherche pas la surface au sol, on cherche où un spot peut se poser
 * sans être à dix centimètres d'un mur. C'est aussi ce qui élimine les
 * échardes des murs en biais, qu'un découpage par bandes verticales
 * transformerait en dizaines de fausses zones.
 */
export function roomZones(ring: Pt[], frame: number, max = 3): Zone[] {
  if (ring.length < 3 || max < 1) return [];
  const cos = Math.cos(frame);
  const sin = Math.sin(frame);
  const pts = ring.map((p) => ({
    x: p.x * cos + p.z * sin,
    z: -p.x * sin + p.z * cos,
  }));
  const x0 = Math.min(...pts.map((p) => p.x));
  const x1 = Math.max(...pts.map((p) => p.x));
  const z0 = Math.min(...pts.map((p) => p.z));
  const z1 = Math.max(...pts.map((p) => p.z));
  const PAS = 0.12;
  /** Recul minimal devant un mur : un spot ne s'y colle pas. */
  const MARGE = 0.3;
  const nx = Math.min(220, Math.max(1, Math.ceil((x1 - x0) / PAS)));
  const nz = Math.min(220, Math.max(1, Math.ceil((z1 - z0) / PAS)));
  if (nx < 2 || nz < 2) return [];
  const cx = (i: number) => x0 + ((i + 0.5) * (x1 - x0)) / nx;
  const cz = (j: number) => z0 + ((j + 0.5) * (z1 - z0)) / nz;
  let libre = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      libre[j * nx + i] = pointInPolygon({ x: cx(i), z: cz(j) }, pts) ? 1 : 0;
    }
  }
  // Érosion : on ôte les cases trop près d'un bord, MARGE en cases.
  const k = Math.max(1, Math.round(MARGE / PAS));
  for (let pas = 0; pas < k; pas++) {
    const suivant = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        if (!libre[j * nx + i]) continue;
        const bord =
          i === 0 ||
          j === 0 ||
          i === nx - 1 ||
          j === nz - 1 ||
          !libre[j * nx + i - 1] ||
          !libre[j * nx + i + 1] ||
          !libre[(j - 1) * nx + i] ||
          !libre[(j + 1) * nx + i];
        suivant[j * nx + i] = bord ? 0 : 1;
      }
    }
    libre = suivant;
  }

  const zones: Zone[] = [];
  for (let n = 0; n < max; n++) {
    const r = plusGrandPave(libre, nx, nz);
    if (!r) break;
    const larg = ((r.i1 - r.i0 + 1) * (x1 - x0)) / nx;
    const haut = ((r.j1 - r.j0 + 1) * (z1 - z0)) / nz;
    // Une écharde n'est pas une zone : ni surface, ni largeur utile.
    if (larg * haut < 1 || Math.min(larg, haut) < 0.5) break;
    /**
     * LA ZONE EST RENDUE À SA VRAIE TAILLE.
     *
     * L'érosion sert à TROUVER les pavés, pas à les mesurer : garder le
     * rectangle érodé reviendrait à comprimer la ligne de trente
     * centimètres à chaque bout, et le demi-intervalle du métier — quatre
     * spots dans six mètres, donc à 0,75 m des murs — deviendrait un
     * espacement bâtard qu'aucun électricien ne reconnaît. On la redonne
     * donc à sa dimension, bornée par l'emprise de la pièce ; c'est
     * ensuite le demi-intervalle qui écarte les spots des murs.
     */
    // On redonne EXACTEMENT ce que l'érosion a pris : k cases de chaque
    // côté. À un demi-centimètre près, la zone d'une pièce rectangulaire
    // redevient la pièce, et la ligne retrouve ses cotes rondes.
    const rendreX = (k * (x1 - x0)) / nx;
    const rendreZ = (k * (z1 - z0)) / nz;
    zones.push({
      x0: Math.max(x0, x0 + (r.i0 * (x1 - x0)) / nx - rendreX),
      x1: Math.min(x1, x0 + ((r.i1 + 1) * (x1 - x0)) / nx + rendreX),
      z0: Math.max(z0, z0 + (r.j0 * (z1 - z0)) / nz - rendreZ),
      z1: Math.min(z1, z0 + ((r.j1 + 1) * (z1 - z0)) / nz + rendreZ),
    });
    for (let j = r.j0; j <= r.j1; j++) {
      for (let i = r.i0; i <= r.i1; i++) libre[j * nx + i] = 0;
    }
  }
  return zones;
}

/** Le plus grand rectangle plein d'une grille booléenne, en cases. */
function plusGrandPave(
  libre: Uint8Array,
  nx: number,
  nz: number,
): { i0: number; i1: number; j0: number; j1: number } | null {
  const haut = new Int32Array(nx);
  let best: { i0: number; i1: number; j0: number; j1: number } | null = null;
  let bestAire = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) haut[i] = libre[j * nx + i] ? haut[i] + 1 : 0;
    // Le plus grand rectangle sous un histogramme, à la pile.
    const pile: number[] = [];
    for (let i = 0; i <= nx; i++) {
      const h = i === nx ? 0 : haut[i];
      while (pile.length > 0 && haut[pile[pile.length - 1]] >= h) {
        const t = pile.pop() as number;
        const hauteur = haut[t];
        const gauche = pile.length > 0 ? pile[pile.length - 1] + 1 : 0;
        const aire = hauteur * (i - gauche);
        if (hauteur > 0 && aire > bestAire) {
          bestAire = aire;
          best = { i0: gauche, i1: i - 1, j0: j - hauteur + 1, j1: j };
        }
      }
      pile.push(i);
    }
  }
  return best;
}

/** Répartit `total` unités au prorata des poids, sans en perdre. */
function repartir(total: number, poids: number[]): number[] {
  const somme = poids.reduce((a, b) => a + b, 0);
  if (somme <= 0) return poids.map(() => 0);
  const brut = poids.map((p) => (total * p) / somme);
  const part = brut.map((v) => Math.floor(v));
  let reste = total - part.reduce((a, b) => a + b, 0);
  const ordre = brut
    .map((v, i) => ({ i, r: v - Math.floor(v) }))
    .sort((a, b) => b.r - a.r);
  for (const o of ordre) {
    if (reste <= 0) break;
    part[o.i] += 1;
    reste -= 1;
  }
  return part;
}

/**
 * Répartit N points lumineux dans une pièce, comme on pose une ligne de spots.
 *
 * Quatre spots dans un séjour, c'était quatre poses au doigt suivies de
 * quatre réglages au centimètre — un quart d'heure pour un geste que
 * personne ne fait à la main sur un vrai chantier. On les aligne à
 * intervalles égaux, avec un demi-intervalle aux extrémités : c'est la
 * règle du métier, celle qui évite deux spots collés au mur et un trou au
 * milieu.
 *
 * DEUX CHOSES ONT CHANGÉ depuis la première version, et les deux venaient
 * du même défaut : la pièce était traitée comme son rectangle englobant.
 *
 *   — On pose maintenant par ZONES (`roomZones`) : le retour d'une pièce
 *     en L reçoit SA part de spots, centrée chez lui, au lieu de voir
 *     passer une ligne venue d'ailleurs dont le dernier point finissait
 *     rabattu contre sa cloison.
 *   — L'axe se CHOISIT : sur la longueur (par défaut, la règle) ou sur la
 *     largeur. Une cuisine se éclaire en travers, un couloir en long, et
 *     personne d'autre que l'électricien ne peut trancher.
 *
 * Le calcul se fait dans la TRAME du logement, jamais dans le repère du
 * scan : une pièce relevée de biais donnerait sinon une ligne de spots en
 * écharpe.
 */
export function spreadPoints(
  ring: Pt[],
  count: number,
  frame: number,
  axe: SpotAxis = 'longueur',
): Pt[] {
  if (count < 1 || ring.length < 3) return [];
  const cos = Math.cos(frame);
  const sin = Math.sin(frame);
  const versTrame = (p: Pt): Pt => ({
    x: p.x * cos + p.z * sin,
    z: -p.x * sin + p.z * cos,
  });
  const versMonde = (p: Pt): Pt => ({
    x: p.x * cos - p.z * sin,
    z: p.x * sin + p.z * cos,
  });
  const pts = ring.map(versTrame);
  const x0 = Math.min(...pts.map((p) => p.x));
  const x1 = Math.max(...pts.map((p) => p.x));
  const z0 = Math.min(...pts.map((p) => p.z));
  const z1 = Math.max(...pts.map((p) => p.z));
  // La longueur de la PIÈCE, pas celle d'une zone : c'est d'elle que parle
  // l'électricien quand il dit « sur la longueur ».
  const longueurSurX = x1 - x0 >= z1 - z0;
  const surX = axe === 'longueur' ? longueurSurX : !longueurSurX;
  // Une zone par spot au plus : inutile de découper plus fin qu'on ne pose.
  const zones = roomZones(ring, frame, Math.min(3, count));
  const cibles: Zone[] = zones.length > 0 ? zones : [{ x0, x1, z0, z1 }];
  const parts = repartir(
    count,
    cibles.map((z) => (z.x1 - z.x0) * (z.z1 - z.z0)),
  );
  const out: Pt[] = [];
  cibles.forEach((z, k) => {
    const n = parts[k];
    if (n < 1) return;
    const d0 = surX ? z.x0 : z.z0;
    const d1 = surX ? z.x1 : z.z1;
    const milieu = surX ? (z.z0 + z.z1) / 2 : (z.x0 + z.x1) / 2;
    for (let i = 0; i < n; i++) {
      // Demi-intervalle aux bouts : (i + ½) / n, jamais i / (n − 1).
      const le = d0 + (d1 - d0) * ((i + 0.5) / n);
      const p = surX ? { x: le, z: milieu } : { x: milieu, z: le };
      const monde = versMonde(p);
      out.push(
        pointInPolygon(monde, ring) ? monde : insetOnRing(ring, monde, 0.25),
      );
    }
  });
  // Un ordre lisible : la ligne se numérote de bout en bout.
  return out.sort((a, b) => {
    const ta = versTrame(a);
    const tb = versTrame(b);
    return surX ? ta.x - tb.x || ta.z - tb.z : ta.z - tb.z || ta.x - tb.x;
  });
}

/**
 * LA CHAÎNE DE COTES D'UNE LIGNE D'APPAREILS DE PLAFOND.
 *
 * Poser six spots, ce n'est pas poser six points : c'est tracer une ligne au
 * cordeau et percer à intervalles réguliers. Ce qu'on lit sur le plan pour
 * les implanter, ce sont donc les ÉCARTS — du mur au premier, entre chacun,
 * du dernier au mur — et non six paires de coordonnées.
 *
 * C'est la cote qu'on emporte sur le chantier, celle qu'on relève au mètre
 * en levant les yeux. Un plan qui ne la donne pas se recalcule à la main,
 * spot par spot, avec une chance sur deux de se tromper d'un centimètre.
 *
 * L'axe se prend sur la TRAME du logement : une ligne relevée de biais se
 * cote quand même d'équerre avec les murs.
 */
export interface CeilingChain {
  /** Les appareils, ordonnés le long de la ligne. */
  points: Pt[];
  /** Les deux points de mur qui ferment la chaîne, s'ils existent. */
  bouts: [Pt | null, Pt | null];
  /**
   * Les écarts successifs, en mètres : mur→1, 1→2, …, n→mur.
   *
   * Les extrémités valent `null` quand le rayon ne rencontre aucun mur —
   * un contour ouvert, un scan incomplet : mieux vaut ne rien écrire que
   * d'annoncer une cote inventée.
   */
  cotes: (number | null)[];
}

export function ceilingChain(
  items: CeilingFixture[],
  walls: WallSeg[],
  frame: number,
): CeilingChain | null {
  if (items.length < 2) return null;
  const cos = Math.cos(frame);
  const sin = Math.sin(frame);
  // Deux axes possibles : celui de la trame et sa perpendiculaire. On garde
  // celui sur lequel la ligne s'étend — c'est le sens dans lequel on l'a
  // tendue.
  const le = { x: cos, z: sin };
  const tr = { x: -sin, z: cos };
  const etendue = (d: Pt) => {
    const vs = items.map((c) => c.at.x * d.x + c.at.z * d.z);
    return Math.max(...vs) - Math.min(...vs);
  };
  const axe = etendue(le) >= etendue(tr) ? le : tr;
  const points = [...items]
    .sort((a, b) => a.at.x * axe.x + a.at.z * axe.z - (b.at.x * axe.x + b.at.z * axe.z))
    .map((c) => c.at);

  const versArriere = castToWall(points[0], { x: -axe.x, z: -axe.z }, walls);
  const dernier = points[points.length - 1];
  const versAvant = castToWall(dernier, axe, walls);
  const bout = (p: Pt, d: Pt, gap: number | null): Pt | null =>
    gap === null ? null : { x: p.x + d.x * gap, z: p.z + d.z * gap };

  const cotes: (number | null)[] = [versArriere];
  for (let i = 1; i < points.length; i++) {
    cotes.push(
      Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z),
    );
  }
  cotes.push(versAvant);

  return {
    points,
    bouts: [
      bout(points[0], { x: -axe.x, z: -axe.z }, versArriere),
      bout(dernier, axe, versAvant),
    ],
    cotes,
  };
}

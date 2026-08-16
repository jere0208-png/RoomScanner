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
import type { Pt } from './floorplan';

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
    // La normale rentrante de ce côté : on recule vers le centre.
    const l = Math.sqrt(l2);
    const n = { x: -dz / l, z: dx / l };
    const cx = ring.reduce((t2, r) => t2 + r.x, 0) / ring.length;
    const cz = ring.reduce((t2, r) => t2 + r.z, 0) / ring.length;
    const sens = (cx - q.x) * n.x + (cz - q.z) * n.z >= 0 ? 1 : -1;
    best = { x: q.x + n.x * sens * marge, z: q.z + n.z * sens * marge };
  }
  return best;
}

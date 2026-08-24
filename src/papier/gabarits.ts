/**
 * LE DICTIONNAIRE DES SYMBOLES — ce qu'on sait reconnaître sur un plan.
 *
 * Un plan d'électricien parle par symboles, et personne ne les dessine tout
 * à fait pareil : la CEI 60617 en fixe l'esprit, chaque bureau d'études en
 * fait sa variante, et un plan de rénovation tracé à la main en fait une
 * troisième. On ne peut donc PAS reconnaître un symbole en comparant des
 * pixels. Ce qu'on compare, ce sont des INVARIANTS — combien de trous, quelle
 * compacité, combien de branches, quelle allongement — c'est-à-dire ce qui
 * survit à une rotation, à un changement d'échelle, et à la main de celui
 * qui a dessiné.
 *
 * D'où ce fichier : chaque symbole est un DESSIN, pas une image. Il sert
 * deux fois — à imprimer les planches d'essai, et à calculer les invariants
 * de référence en le rasterisant une fois pour toutes. Une seule source de
 * vérité : le jour où l'on redresse le symbole d'une prise, la référence
 * suit toute seule.
 *
 * CE QU'ON NE SAIT PAS LIRE, ON LE DIT. Un symbole qui ne ressemble à rien
 * d'assez près ne devient pas « une prise, sans doute » : il devient un
 * repère à qualifier, posé au bon endroit sur le plan, avec sa vignette. Un
 * plan qui ment est pire qu'un plan incomplet — c'est la même règle que pour
 * l'électricité proposée en fin de scan.
 */
import type { CeilingKind } from '../geometry/ceiling';
import type { FixtureKind } from '../geometry/electrical';
import type { Forme } from './trace';

/** Ce que devient un symbole reconnu, une fois posé dans le plan. */
export type CibleSymbole =
  | { sorte: 'mural'; kind: FixtureKind }
  | { sorte: 'plafond'; kind: CeilingKind }
  | { sorte: 'meuble'; item: string }
  | { sorte: 'repere' };

export interface Gabarit {
  cle: string;
  nom: string;
  cible: CibleSymbole;
  /**
   * Empreinte usuelle du symbole, en MÈTRES DU MONDE.
   *
   * Un symbole n'est pas à l'échelle de ce qu'il représente : une prise de
   * 8 cm se dessine sur un plan au 1/50 par un symbole qui en couvrirait 25.
   * C'est cette taille-là qu'on note — elle sert à écarter d'emblée ce qui
   * est dix fois trop gros ou trop petit pour être ce symbole.
   */
  taille: number;
  /** Le dessin, dans un carré de −1 à 1, centré sur le point de pose. */
  formes: Forme[];
  /**
   * Le symbole se pose CONTRE un mur (prise, interrupteur) plutôt qu'au
   * milieu de la pièce (plafonnier, meuble). C'est ce qui décide s'il faut
   * lui chercher un mur porteur ou le laisser où il est.
   */
  contreMur?: boolean;
}

const T = 0.16; // épaisseur relative du trait d'un symbole

const seg = (x1: number, y1: number, x2: number, y2: number, w = T): Forme => ({
  t: 'seg',
  a: { x: x1, y: y1 },
  b: { x: x2, y: y2 },
  w,
});
const cercle = (x: number, y: number, r: number, w = T): Forme => ({
  t: 'arc',
  c: { x, y },
  r,
  a0: 0,
  a1: Math.PI * 2,
  w,
});
const arc = (x: number, y: number, r: number, a0: number, a1: number, w = T): Forme => ({
  t: 'arc',
  c: { x, y },
  r,
  a0,
  a1,
  w,
});
const disque = (x: number, y: number, r: number): Forme => ({ t: 'disque', c: { x, y }, r });
const P = Math.PI;

/**
 * LE SOCLE DE PRISE, dos au mur.
 *
 * Le demi-cercle repose sur son diamètre — le côté plat est celui du mur —
 * et la tige en sort par-derrière : c'est le dessin de la CEI, celui qu'on
 * trouve sur neuf plans sur dix. La prise 2P+T ajoute la barre de terre en
 * travers de la tige, et c'est le seul écart entre les deux : les invariants
 * les distinguent par le nombre de branches, pas par la ressemblance.
 */
const PRISE: Forme[] = [
  seg(-0.72, 0.28, 0.72, 0.28),
  arc(0, 0.28, 0.72, P, 2 * P),
  seg(0, 0.28, 0, 0.95),
];

export const GABARITS: Gabarit[] = [
  {
    cle: 'prise',
    nom: 'Prise 16 A',
    cible: { sorte: 'mural', kind: 'prise' },
    taille: 0.22,
    contreMur: true,
    formes: PRISE,
  },
  {
    cle: 'prise2p t',
    nom: 'Prise 2P+T',
    cible: { sorte: 'mural', kind: 'prise' },
    taille: 0.22,
    contreMur: true,
    formes: [...PRISE, seg(-0.34, 0.72, 0.34, 0.72)],
  },
  {
    cle: 'prise2',
    nom: 'Prise double',
    cible: { sorte: 'mural', kind: 'prise2' },
    taille: 0.3,
    contreMur: true,
    formes: [
      seg(-0.95, 0.28, 0.95, 0.28),
      arc(-0.45, 0.28, 0.5, P, 2 * P),
      arc(0.45, 0.28, 0.5, P, 2 * P),
      seg(0, 0.28, 0, 0.95),
    ],
  },
  {
    cle: 'prise20',
    nom: 'Prise 20 A',
    cible: { sorte: 'mural', kind: 'prise20' },
    taille: 0.24,
    contreMur: true,
    formes: [...PRISE, seg(-0.34, 0.6, 0.34, 0.6), seg(-0.34, 0.85, 0.34, 0.85)],
  },
  {
    cle: 'prise32',
    nom: 'Prise 32 A',
    cible: { sorte: 'mural', kind: 'prise32' },
    taille: 0.26,
    contreMur: true,
    formes: [
      seg(-0.72, 0.28, 0.72, 0.28),
      arc(0, 0.28, 0.72, P, 2 * P),
      seg(0, 0.28, 0, 0.95),
      seg(-0.5, -0.1, 0.5, -0.1),
    ],
  },
  {
    cle: 'inter',
    nom: 'Interrupteur',
    cible: { sorte: 'mural', kind: 'inter' },
    taille: 0.2,
    contreMur: true,
    formes: [disque(-0.5, 0.55, 0.28), seg(-0.5, 0.55, 0.45, -0.5), seg(0.15, -0.75, 0.7, -0.3)],
  },
  {
    cle: 'va',
    nom: 'Va-et-vient',
    cible: { sorte: 'mural', kind: 'va' },
    taille: 0.2,
    contreMur: true,
    formes: [
      disque(-0.5, 0.55, 0.28),
      seg(-0.5, 0.55, 0.45, -0.5),
      seg(0.15, -0.75, 0.7, -0.3),
      seg(-0.05, -0.95, 0.5, -0.5),
    ],
  },
  {
    cle: 'poussoir',
    nom: 'Bouton poussoir',
    cible: { sorte: 'mural', kind: 'poussoir' },
    taille: 0.2,
    contreMur: true,
    formes: [disque(-0.5, 0.55, 0.28), seg(-0.5, 0.55, 0.3, -0.35), cercle(0.5, -0.6, 0.3)],
  },
  {
    cle: 'variateur',
    nom: 'Variateur',
    cible: { sorte: 'mural', kind: 'variateur' },
    taille: 0.2,
    contreMur: true,
    formes: [
      disque(-0.5, 0.55, 0.28),
      seg(-0.5, 0.55, 0.45, -0.5),
      seg(0.15, -0.75, 0.7, -0.3),
      seg(-0.8, -0.2, -0.2, -0.2),
      seg(-0.8, -0.5, -0.35, -0.5),
      seg(-0.8, -0.8, -0.5, -0.8),
    ],
  },
  {
    cle: 'rj45',
    nom: 'Prise RJ45',
    cible: { sorte: 'mural', kind: 'rj45' },
    taille: 0.2,
    contreMur: true,
    formes: [
      { t: 'poly', pts: [{ x: -0.75, y: 0.5 }, { x: 0.75, y: 0.5 }, { x: 0, y: -0.8 }], ferme: true, w: T },
      seg(0, 0.5, 0, 0.95),
    ],
  },
  {
    cle: 'tv',
    nom: 'Prise TV',
    cible: { sorte: 'mural', kind: 'tv' },
    taille: 0.2,
    contreMur: true,
    formes: [
      { t: 'poly', pts: [{ x: -0.75, y: 0.5 }, { x: 0.75, y: 0.5 }, { x: 0, y: -0.8 }], ferme: true, w: T },
      seg(0, 0.5, 0, 0.95),
      seg(-0.4, -0.05, 0.4, -0.05),
    ],
  },
  {
    cle: 'applique',
    nom: 'Applique',
    cible: { sorte: 'mural', kind: 'applique' },
    taille: 0.24,
    contreMur: true,
    formes: [
      arc(0, 0.35, 0.68, P, 2 * P),
      seg(-0.9, 0.35, 0.9, 0.35),
      seg(-0.48, -0.13, 0.48, -0.13),
      seg(0, 0.35, 0, -0.33),
    ],
  },
  {
    cle: 'tableau',
    nom: 'Tableau électrique',
    cible: { sorte: 'mural', kind: 'tableau' },
    taille: 0.5,
    contreMur: true,
    formes: [
      {
        t: 'poly',
        pts: [
          { x: -0.95, y: -0.55 },
          { x: 0.95, y: -0.55 },
          { x: 0.95, y: 0.55 },
          { x: -0.95, y: 0.55 },
        ],
        ferme: true,
        w: T,
      },
      seg(-0.55, -0.55, -0.95, 0.55),
      seg(0, -0.55, -0.4, 0.55),
      seg(0.55, -0.55, 0.15, 0.55),
    ],
  },
  {
    cle: 'thermostat',
    nom: 'Thermostat',
    cible: { sorte: 'mural', kind: 'thermostat' },
    taille: 0.2,
    contreMur: true,
    formes: [cercle(0, 0, 0.7), seg(-0.35, 0, 0.35, 0), seg(0, 0.35, 0, 0.7)],
  },
  {
    cle: 'sortieCable',
    nom: 'Sortie de câble',
    cible: { sorte: 'mural', kind: 'sortieCable' },
    taille: 0.18,
    contreMur: true,
    formes: [cercle(0, 0, 0.55), seg(0.4, 0.4, 0.95, 0.95)],
  },
  {
    cle: 'boite',
    nom: 'Boîte de dérivation',
    cible: { sorte: 'mural', kind: 'boite' },
    taille: 0.18,
    contreMur: true,
    formes: [cercle(0, 0, 0.7), disque(0, 0, 0.22)],
  },
  {
    cle: 'dcl',
    nom: 'Point lumineux',
    cible: { sorte: 'plafond', kind: 'dcl' },
    taille: 0.28,
    formes: [cercle(0, 0, 0.8), seg(-0.57, -0.57, 0.57, 0.57), seg(-0.57, 0.57, 0.57, -0.57)],
  },
  {
    cle: 'spot',
    nom: 'Spot',
    cible: { sorte: 'plafond', kind: 'spot' },
    taille: 0.14,
    formes: [cercle(0, 0, 0.75), disque(0, 0, 0.35)],
  },
  {
    cle: 'vmc',
    nom: 'Bouche de VMC',
    cible: { sorte: 'plafond', kind: 'vmc' },
    taille: 0.2,
    formes: [cercle(0, 0, 0.8), cercle(0, 0, 0.4), seg(-0.4, 0, 0.4, 0)],
  },
  {
    cle: 'daaf',
    nom: 'Détecteur de fumée',
    cible: { sorte: 'plafond', kind: 'daaf' },
    taille: 0.2,
    formes: [
      cercle(0, 0, 0.8),
      seg(-0.45, -0.45, 0.45, 0.45),
      seg(-0.45, 0.45, 0.45, -0.45),
      seg(-0.8, 0, 0.8, 0),
      seg(0, -0.8, 0, 0.8),
    ],
  },
  {
    cle: 'evier',
    nom: 'Évier',
    cible: { sorte: 'meuble', item: 'evier' },
    taille: 0.8,
    formes: [
      {
        t: 'poly',
        pts: [
          { x: -0.95, y: -0.7 },
          { x: 0.95, y: -0.7 },
          { x: 0.95, y: 0.7 },
          { x: -0.95, y: 0.7 },
        ],
        ferme: true,
        w: 0.1,
      },
      cercle(-0.35, 0, 0.42, 0.1),
      cercle(0.45, 0, 0.18, 0.1),
    ],
  },
  {
    cle: 'wc',
    nom: 'WC',
    cible: { sorte: 'meuble', item: 'wc' },
    taille: 0.5,
    formes: [
      seg(-0.55, -0.9, 0.55, -0.9, 0.14),
      arc(0, 0.05, 0.62, -P * 0.95, P * 0.95, 0.1),
      seg(-0.6, -0.55, 0.6, -0.55, 0.1),
    ],
  },
  {
    cle: 'baignoire',
    nom: 'Baignoire',
    cible: { sorte: 'meuble', item: 'baignoire' },
    taille: 1.7,
    formes: [
      {
        t: 'poly',
        pts: [
          { x: -0.95, y: -0.45 },
          { x: 0.95, y: -0.45 },
          { x: 0.95, y: 0.45 },
          { x: -0.95, y: 0.45 },
        ],
        ferme: true,
        w: 0.08,
      },
      arc(0.55, 0, 0.3, 0, 2 * P, 0.08),
      seg(-0.75, -0.28, -0.75, 0.28, 0.08),
    ],
  },
  {
    cle: 'douche',
    nom: 'Douche',
    cible: { sorte: 'meuble', item: 'douche' },
    taille: 0.9,
    formes: [
      {
        t: 'poly',
        pts: [
          { x: -0.9, y: -0.9 },
          { x: 0.9, y: -0.9 },
          { x: 0.9, y: 0.9 },
          { x: -0.9, y: 0.9 },
        ],
        ferme: true,
        w: 0.09,
      },
      seg(-0.9, -0.9, 0.9, 0.9, 0.09),
      seg(-0.9, 0.9, 0.9, -0.9, 0.09),
    ],
  },
];

export function gabarit(cle: string): Gabarit | undefined {
  return GABARITS.find((g) => g.cle === cle);
}

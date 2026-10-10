/**
 * LA POSE, ESTIMÉE — le devis compte enfin ce qu'il excluait.
 *
 * Proposée comme amélioration « productive » (le patron : « améliore
 * considérablement l'app avec des idées que tu trouveras intéressantes et
 * productives »). Le devis chiffrait le MATÉRIEL, au prix public, et le
 * disait sous son total : « la pose n'est pas comprise ». C'était honnête, et
 * c'était laisser l'électricien finir son devis à la main — la moitié du prix
 * d'un chantier, et la seule qu'il fixe lui-même.
 *
 * L'estimation part de ce que le plan sait déjà : CHAQUE POINT posé, au mur
 * ou au plafond, avec un temps de pose par sorte d'appareil — boîte,
 * saignée, tirage, raccordement, rebouchage compris en rénovation — et le
 * TABLEAU, compté à son nombre de protections. Deux réglages, et deux
 * seulement, parce que ce sont ceux qui changent d'un artisan à l'autre et
 * d'un chantier à l'autre :
 *
 *   — le TAUX HORAIRE, hors taxes, propre à chacun ;
 *   — la NATURE du chantier : en RÉNOVATION d'un logement de plus de deux
 *     ans, la TVA de la main-d'œuvre est à 10 % et chaque point demande une
 *     saignée ; dans le NEUF, elle est à 20 % et les gaines sont en attente
 *     dans les cloisons — un tiers du temps en moins.
 *
 * Ce sont des temps d'ESTIMATION, et c'est écrit sous le chiffre : ils
 * servent à ne pas oublier la pose, pas à remplacer le métré d'un artisan.
 */
import type { CeilingFixture, CeilingKind } from './ceiling';
import { FIXTURES, type Fixture, type FixtureKind } from './electrical';

export type NatureDeChantier = 'renovation' | 'neuf';

/** La TVA de la main-d'œuvre, selon la nature du chantier. */
export const TVA_POSE: Record<NatureDeChantier, number> = { renovation: 0.1, neuf: 0.2 };

/** Le neuf : gaines en attente, pas de saignée — un tiers du temps en moins. */
export const COEF_NEUF = 0.65;

/** Le taux horaire de départ, hors taxes — un artisan le règle une fois. */
export const TAUX_PAR_DEFAUT = 45;
export const TAUX_MIN = 25;
export const TAUX_MAX = 120;
export const PAS_DU_TAUX = 5;

/**
 * Temps de pose d'un appareil MURAL, en heures, en rénovation : boîte
 * d'encastrement, saignée, tirage depuis le tableau, raccordement, rebouchage.
 */
export const TEMPS_MUR: Record<FixtureKind, number> = {
  prise: 1.0,
  prise2: 1.2,
  prise3: 1.4,
  prise20: 1.2,
  prise32: 1.5,
  inter: 0.9,
  va: 1.1,
  poussoir: 0.9,
  variateur: 1.0,
  volet: 1.2,
  inter2: 1.1,
  inter3: 1.3,
  rj45: 0.9,
  tv: 0.9,
  rj2: 1.1,
  rjPrise: 1.3,
  rjPrise2: 1.5,
  tvPrise: 1.3,
  applique: 1.1,
  thermostat: 1.0,
  sortieCable: 0.8,
  boite: 0.6,
  // Le tableau se compte à part, à ses protections : voir `TABLEAU_*`.
  tableau: 0,
};

/** Temps de pose d'un point de PLAFOND, en heures, en rénovation. */
export const TEMPS_PLAFOND: Record<CeilingKind, number> = {
  dcl: 1.0,
  spot: 0.6,
  applique: 1.0,
  ventilateur: 2.0,
  daaf: 0.4,
  camera: 1.2,
  vmc: 0.8,
  detecteur: 0.7,
};

/** Le tableau : sa pose et son câblage de base, puis chaque protection. */
export const TABLEAU_BASE = 4;
export const TABLEAU_PAR_PROTECTION = 0.3;

/** Une ligne de la pose : une famille, combien de points, combien d'heures. */
export interface LigneDePose {
  famille: string;
  quantite: number;
  heures: number;
}

export interface Pose {
  lignes: LigneDePose[];
  heures: number;
  taux: number;
  ht: number;
  tauxTva: number;
  tva: number;
  ttc: number;
}

const FAMILLE_PLAFOND = 'Plafond';
/** L'ordre du ticket : celui du catalogue, puis le plafond, puis le tableau. */
const ORDRE = ['Prises', 'Commandes', 'Courants faibles', 'Éclairage', 'Divers', FAMILLE_PLAFOND, 'Tableau'];

/** Au quart d'heure, comme se compte une journée de chantier. */
const auQuart = (h: number) => Math.round(h * 4) / 4;

/**
 * L'ESTIMATION DE LA POSE.
 *
 * `protections` : le nombre de disjoncteurs et d'interrupteurs différentiels
 * du devis — ce qui fait le temps de câblage d'un tableau.
 */
export function estimerLaPose(
  fixtures: readonly Fixture[],
  ceiling: readonly CeilingFixture[],
  protections: number,
  reglages: { taux: number; chantier: NatureDeChantier },
): Pose {
  const k = reglages.chantier === 'neuf' ? COEF_NEUF : 1;
  const parFamille = new Map<string, LigneDePose>();
  const ajouter = (famille: string, quantite: number, heures: number) => {
    const l = parFamille.get(famille) ?? { famille, quantite: 0, heures: 0 };
    l.quantite += quantite;
    l.heures += heures;
    parFamille.set(famille, l);
  };
  let tableau = false;
  for (const f of fixtures) {
    if (f.kind === 'tableau') {
      tableau = true;
      continue;
    }
    ajouter(FIXTURES[f.kind]?.family ?? 'Divers', 1, (TEMPS_MUR[f.kind] ?? 1) * k);
  }
  for (const cl of ceiling) ajouter(FAMILLE_PLAFOND, 1, (TEMPS_PLAFOND[cl.kind] ?? 0.8) * k);
  if (tableau || protections > 0) {
    // Le tableau ne gagne rien au neuf : ses fils se raccordent un à un.
    ajouter('Tableau', 1, TABLEAU_BASE + TABLEAU_PAR_PROTECTION * Math.max(0, protections));
  }
  const lignes = [...parFamille.values()]
    .map((l) => ({ ...l, heures: auQuart(l.heures) }))
    .sort((a, b) => ORDRE.indexOf(a.famille) - ORDRE.indexOf(b.famille));
  const heures = lignes.reduce((t, l) => t + l.heures, 0);
  const taux = Math.max(TAUX_MIN, Math.min(TAUX_MAX, reglages.taux));
  const ht = Math.round(heures * taux * 100) / 100;
  const tauxTva = TVA_POSE[reglages.chantier];
  const tva = Math.round(ht * tauxTva * 100) / 100;
  return { lignes, heures, taux, ht, tauxTva, tva, ttc: Math.round((ht + tva) * 100) / 100 };
}

/** « 23 h 30 », « 45 min ». */
export function enHeures(h: number): string {
  const min = Math.round(h * 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

/** Les protections d'un devis : ses disjoncteurs et ses différentiels. */
export function protectionsDuDevis(lignes: readonly { code: string; quantite: number; ecarte?: boolean }[]): number {
  return lignes
    .filter((l) => !l.ecarte && /^(disj-|diff-)/.test(l.code))
    .reduce((t, l) => t + l.quantite, 0);
}

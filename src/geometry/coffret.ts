/**
 * LE COFFRET, UNE SEULE FOIS — relecture « tableaux chiffrés » du PDF : le
 * devis commandait un coffret de deux rangées et deux peignes, la liste du
 * matériel en dessinait trois, et la feuille du tableau en annonçait quatre.
 * Trois règles pour une même boîte : celle du devis (la réserve de 20 %),
 * celle du dessin (une rangée par différentiel), celle du tableau projeté
 * (une rangée pour l'interrupteur général, puis une par différentiel).
 *
 * Il n'en reste qu'une, ici, et les trois documents la lisent :
 *   — CHAQUE DIFFÉRENTIEL OUVRE SA RANGÉE, suivi de ses disjoncteurs (une
 *     rangée de plus s'il en déborde) : c'est ainsi qu'on câble un tableau,
 *     un peigne par rangée ;
 *   — les organes de commande (contacteurs, télérupteurs) prennent la place
 *     libre, puis une rangée de plus ;
 *   — LA RÉSERVE DE LA NORME : les modules occupés ne remplissent jamais plus
 *     des quatre cinquièmes du coffret ;
 *   — un coffret du commerce a de une à quatre rangées.
 */
import { postsOf, type Fixture } from './electrical';
import type { CeilingFixture } from './ceiling';

/** Treize modules par rangée, la largeur du coffret courant. */
export const MODULES_PAR_RANGEE = 13;
/** Le plus grand coffret qu'on commande. */
export const RANGEES_MAX = 4;
/** La part occupée au plus : 20 % de réserve. */
const REMPLISSAGE_MAX = 0.8;

/** Les organes de commande qui se rangent au tableau, un module chacun. */
export interface OrganeDuTableau {
  code: 'contacteur-ig' | 'contacteur-jn' | 'telerupteur';
  label: string;
  spec: string;
  quantity: number;
  note?: string;
  /** Ce qui s'écrit dans le module du dessin. */
  marque: string;
}

/**
 * Les contacteurs et télérupteurs que l'appareillage appelle au tableau. Le
 * bordereau les achète (`buyingList`), le coffret leur fait place.
 */
export function organesDuTableau(fixtures: readonly Fixture[], ceiling: readonly CeilingFixture[] = []): OrganeDuTableau[] {
  const out: OrganeDuTableau[] = [];
  /*
    L'INTERRUPTEUR GÉNÉRAL COMMANDE UN CONTACTEUR — revue « Mehdi » : il était
    compté comme une commande de plus, sans rien au tableau. Il coupe
    l'éclairage en sortant : c'est la bobine d'un contacteur de tableau
    qu'il commande, et ce contacteur s'achète.
  */
  if (fixtures.some((f) => postsOf(f.kind).includes('interGeneral'))) {
    out.push({
      code: 'contacteur-ig',
      label: 'Contacteur 2F 25 A',
      spec: 'Au tableau, commandé par l’interrupteur général : il coupe l’éclairage',
      quantity: 1,
      marque: 'KM',
    });
  }
  /*
    LE CHAUFFE-EAU EN HEURES CREUSES A SON CONTACTEUR — revue « chantier » :
    la note de son circuit le dit (« commandé par un contacteur heures
    creuses ») ; le bordereau ne l'achetait pas. Un par chauffe-eau.
  */
  const chauffeEau = fixtures.filter((f) => f.kind === 'sortieCable' && f.usage === 'CU').length;
  if (chauffeEau > 0) {
    out.push({
      code: 'contacteur-jn',
      label: 'Contacteur jour/nuit 20 A',
      spec: 'Au tableau : le chauffe-eau chauffe en heures creuses',
      quantity: chauffeEau,
      note: 'un par chauffe-eau',
      marque: 'HC',
    });
  }
  /*
    LE POUSSOIR COMMANDE UN TÉLÉRUPTEUR — revue « Karim » : trois poussoirs
    reliés à un point, et rien au tableau, alors que la fiche du poussoir
    dit elle-même « télérupteur ». Un télérupteur par jeu de poussoirs qui
    commande les mêmes points ; des poussoirs reliés à rien en demandent un.
  */
  const poussoirs = new Set(fixtures.filter((f) => f.kind === 'poussoir').map((f) => f.id));
  if (poussoirs.size > 0) {
    const jeux = new Set<string>();
    for (const p of [...ceiling, ...fixtures]) {
      const siens = (p.commands ?? []).filter((c) => poussoirs.has(c)).sort();
      if (siens.length > 0) jeux.add(siens.join('|'));
    }
    const lies = new Set([...jeux].flatMap((j) => j.split('|')));
    out.push({
      code: 'telerupteur',
      label: 'Télérupteur 16 A',
      spec: 'Au tableau, commandé par les boutons-poussoirs',
      quantity: jeux.size + ([...poussoirs].some((p) => !lies.has(p)) ? 1 : 0),
      note: 'un par groupe de poussoirs',
      marque: 'TL',
    });
  }
  return out;
}

/**
 * LES RANGÉES, REMPLIES — les modules occupés de chaque rangée. `groupes` :
 * la largeur de chaque différentiel suivi de ses disjoncteurs (deux modules
 * pour le différentiel, un par disjoncteur), puis celle des disjoncteurs
 * qu'aucun différentiel ne reprend ; `organes` : le nombre d'organes de
 * commande, un module chacun.
 */
export function remplirLeCoffret(groupes: readonly number[], organes = 0): number[] {
  const rangees: number[] = [];
  for (const g of groupes) {
    if (g <= 0) continue;
    let reste = g;
    while (reste > 0) {
      const pris = Math.min(MODULES_PAR_RANGEE, reste);
      rangees.push(pris);
      reste -= pris;
    }
  }
  let o = Math.max(0, organes);
  for (let i = 0; i < rangees.length && o > 0; i++) {
    const p = Math.min(MODULES_PAR_RANGEE - rangees[i], o);
    rangees[i] += p;
    o -= p;
  }
  while (o > 0) {
    const p = Math.min(MODULES_PAR_RANGEE, o);
    rangees.push(p);
    o -= p;
  }
  return rangees;
}

/** Le coffret à commander : ses rangées et les modules qu'il porte. */
export interface TailleDuCoffret {
  rangees: number;
  /** Les modules occupés. */
  modules: number;
}

export function tailleDuCoffret(groupes: readonly number[], organes = 0): TailleDuCoffret {
  const remplies = remplirLeCoffret(groupes, organes);
  const modules = remplies.reduce((s, m) => s + m, 0);
  if (modules === 0) return { rangees: 0, modules: 0 };
  const reserve = Math.ceil(modules / (MODULES_PAR_RANGEE * REMPLISSAGE_MAX));
  return { rangees: Math.max(1, Math.min(RANGEES_MAX, Math.max(remplies.length, reserve))), modules };
}

/** « 3 rangées », « 1 module » : le nom s'accorde avec son nombre. */
export function auPluriel(n: number, mot: string, pluriel = `${mot}s`): string {
  return `${String(n).replace('.', ',')} ${Math.abs(n) >= 2 ? pluriel : mot}`;
}

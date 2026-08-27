/**
 * LE CATALOGUE DES PRIX — versionné, daté, et signé de sa source.
 *
 * Relevé du patron : « fais une recherche des prix et stocke-les », pour un
 * outil « complet, autonome et précis sur les prix ».
 *
 * POURQUOI CHAQUE PRIX PORTE SA DATE. Un tarif vieillit, et il ne vieillit
 * pas tout seul : le cuivre bouge d'un trimestre à l'autre, l'appareillage
 * beaucoup moins. Un chiffre nu, dans six mois, ne se distingue plus d'un
 * chiffre juste. Chaque article porte donc le mois de son relevé et l'endroit
 * où on l'a vu — c'est ce qui permet de savoir CE QU'IL FAUT REVOIR sans
 * tout revoir.
 *
 * D'OÙ VIENNENT CES PRIX. Les sites de vente refusent la lecture
 * automatique : Leroy Merlin et 123elec renvoient tous deux une page de
 * vérification anti-robot. Ces tarifs sont donc posés à la main, aux ordres
 * de grandeur du marché français en août 2026, TTC, et ils attendent d'être
 * relus par quelqu'un qui achète — c'est marqué sur chacun (`source`), et
 * l'écran du devis le dit aussi au lecteur. Un devis qui cache d'où sortent
 * ses chiffres n'est pas un devis, c'est une devinette.
 *
 * TTC, ET PAS HT. L'écran répond à « combien j'en aurais pour mon
 * installation actuelle » : c'est le prix qu'on paie au comptoir.
 */
import type { FixtureKind } from './electrical';
import type { CeilingKind } from './ceiling';

/** Un prix, et ce qu'il faut savoir pour s'en méfier. */
export interface Tarif {
  /** Prix unitaire TTC, en euros. */
  pu: number;
  /** Mois du relevé, AAAA-MM : ce qui dit si le prix a vieilli. */
  releve: string;
  /** D'où il sort. */
  source: string;
}

/**
 * LA VERSION DU CATALOGUE.
 *
 * Elle s'affiche sur le devis. Deux devis d'un même logement à deux mois
 * d'écart ne donnent pas le même total, et c'est normal : encore faut-il
 * pouvoir le dire.
 */
export const VERSION_TARIFS = '2026-08';

/** La source commune à tout ce qui a été posé à la main. */
const A_VALIDER = 'Ordre de grandeur du marché français, à valider au comptoir';
const RELEVE = '2026-08';
const t = (pu: number): Tarif => ({ pu, releve: RELEVE, source: A_VALIDER });

// --------------------------------------------------------------- gammes

export type GammeId = 'dooxie' | 'celiane' | 'mosaic' | 'odace' | 'ovalis';

export interface Gamme {
  id: GammeId;
  marque: string;
  nom: string;
  /** Ce qui la distingue, en une phrase d'électricien. */
  note: string;
}

/**
 * LES GAMMES PROPOSÉES, LA PLUS COURANTE EN PREMIER.
 *
 * Relevé du patron : « le modèle d'appareillage voulu : Legrand Céliane,
 * Legrand Mosaïc, etc. ». On en garde cinq — trois Legrand, deux Schneider —
 * parce qu'au-delà on ne choisit plus, on feuillette.
 *
 * L'ORDRE N'EST PAS CELUI DU PRIX. Elles étaient rangées du moins cher au
 * plus habillé, ce qui paraissait logique et ne l'était pas : relevé du
 * patron, « mets le Legrand Céliane et Mosaic en premier, c'est les plus
 * communs ». Une liste de choix se range par ce qu'on prend le plus souvent,
 * pas par ce qu'elle coûte — l'électricien qui pose du Céliane toute la
 * semaine ne doit pas faire défiler trois lignes pour le trouver.
 */
export const GAMMES: Gamme[] = [
  {
    id: 'celiane',
    marque: 'Legrand',
    nom: 'Céliane',
    note: 'Le haut de gamme Legrand, matières et finitions.',
  },
  {
    id: 'mosaic',
    marque: 'Legrand',
    nom: 'Mosaic',
    note: 'Support + mécanisme + enjoliveur : le modulaire du tertiaire.',
  },
  {
    id: 'dooxie',
    marque: 'Legrand',
    nom: 'dooxie',
    note: 'L’entrée de gamme Legrand : complet, blanc, pose rapide.',
  },
  {
    id: 'odace',
    marque: 'Schneider',
    nom: 'Odace',
    note: 'Milieu de gamme, plaques interchangeables.',
  },
  {
    id: 'ovalis',
    marque: 'Schneider',
    nom: 'Ovalis',
    note: 'L’équivalent Schneider : le moins cher qui tienne le chantier.',
  },
];

/**
 * L'APPAREILLAGE, GAMME PAR GAMME.
 *
 * Un prix = le mécanisme AVEC son enjoliveur, plaque NON comprise : c'est le
 * découpage du bordereau (`buyingList`), où les mécanismes se comptent par
 * type et les plaques par nombre de postes. Les confondre fait compter deux
 * fois la finition d'un ensemble double.
 */
export const TARIFS_MECANISME: Record<
  GammeId,
  Partial<Record<FixtureKind, Tarif>>
> = {
  dooxie: {
    prise: t(4.5),
    prise20: t(8.5),
    prise32: t(14.5),
    inter: t(4.2),
    va: t(4.2),
    poussoir: t(5.9),
    variateur: t(24),
    rj45: t(14.9),
    tv: t(8.9),
    sortieCable: t(5.5),
    thermostat: t(45),
    applique: t(0),
    boite: t(2.2),
    tableau: t(0),
  },
  ovalis: {
    prise: t(4.9),
    prise20: t(8.9),
    prise32: t(15),
    inter: t(4.5),
    va: t(4.5),
    poussoir: t(6.2),
    variateur: t(26),
    rj45: t(15.5),
    tv: t(9.5),
    sortieCable: t(5.8),
    thermostat: t(48),
    applique: t(0),
    boite: t(2.2),
    tableau: t(0),
  },
  odace: {
    prise: t(8.5),
    prise20: t(12.5),
    prise32: t(21),
    inter: t(7.9),
    va: t(7.9),
    poussoir: t(9.5),
    variateur: t(39),
    rj45: t(18.5),
    tv: t(11.5),
    sortieCable: t(7.5),
    thermostat: t(69),
    applique: t(0),
    boite: t(2.2),
    tableau: t(0),
  },
  mosaic: {
    prise: t(9.5),
    prise20: t(13.5),
    prise32: t(22),
    inter: t(8.9),
    va: t(8.9),
    poussoir: t(10.5),
    variateur: t(42),
    rj45: t(19.5),
    tv: t(12.5),
    sortieCable: t(8),
    thermostat: t(72),
    applique: t(0),
    boite: t(2.2),
    tableau: t(0),
  },
  celiane: {
    prise: t(12.5),
    prise20: t(17),
    prise32: t(26),
    inter: t(11.5),
    va: t(11.5),
    poussoir: t(13.5),
    variateur: t(49),
    rj45: t(24),
    tv: t(14.5),
    sortieCable: t(9.5),
    thermostat: t(79),
    applique: t(0),
    boite: t(2.2),
    tableau: t(0),
  },
};

/**
 * LES PLAQUES, par nombre de postes.
 *
 * Une plaque triple ne vaut pas trois plaques simples — la matière est
 * partagée, le prix suit mal. C'est pour cela qu'elles ont leur propre
 * table plutôt qu'un prix au poste.
 */
export const TARIFS_PLAQUE: Record<GammeId, number[]> = {
  // Index 0 = plaque 1 poste, index 1 = 2 postes, et ainsi de suite.
  dooxie: [1.9, 3.5, 5.5, 8, 10.5],
  ovalis: [2.1, 3.8, 5.8, 8.5, 11],
  odace: [4.2, 7.5, 10.5, 14.5, 18.5],
  mosaic: [4.9, 8.5, 12, 16.5, 21],
  celiane: [6.5, 11, 15.5, 21, 27],
};

// --------------------------------------------------------- hors gamme

/**
 * CE QUI NE DÉPEND PAS DE LA GAMME.
 *
 * Une gaine est une gaine, un disjoncteur est un disjoncteur : changer de
 * modèle d'interrupteur ne change rien à ce qui court dans les murs. C'est
 * la moitié du devis, et c'est la moitié qui ne se voit pas.
 */
export const TARIFS_COMMUNS: Record<string, Tarif> = {
  // Conduits — la couronne de 100 m, telle qu'elle se commande.
  'icta-16': t(22),
  'icta-20': t(28),
  'icta-25': t(42),
  'icta-32': t(68),
  // Conducteurs rigides — la couronne de 100 m, par section.
  'fil-1.5': t(16),
  'fil-2.5': t(26),
  'fil-6': t(62),
  'fil-10': t(105),
  // Courants faibles — ce qu'on tire dans la gaine de communication.
  futp6: t(78),
  coax: t(55),
  // Encastrement.
  'boite-encastrement': t(0.9),
  'boite-dcl': t(3.5),
  'boite-derivation': t(2.2),
  // Tableau : le calibre change le prix, pas beaucoup.
  'disj-2': t(9.5),
  'disj-10': t(9.5),
  'disj-16': t(9.5),
  'disj-20': t(10.5),
  'disj-32': t(14.5),
  'diff-AC': t(42),
  'diff-A': t(62),
  'coffret-com': t(135),
  /*
    LE COFFRET SE CHIFFRE À LA RANGÉE, ET IL EN FAUT UN.

    Il n'existait au devis que si l'on avait posé un tableau SUR UN MUR du
    plan. Or le tableau se déduit des circuits — on sait combien de modules
    il faut avant de savoir où on l'accroche —, et un devis sans coffret
    manque le poste le plus visible du tableau.
  */
  'coffret-1': t(22),
  'coffret-2': t(38),
  'coffret-3': t(52),
  'coffret-4': t(68),
  // Le peigne, qu'on oublie toujours. (Le bornier de terre, lui, est fourni
  // avec le coffret : voir `chiffrer`.)
  peigne: t(9),
  // Plafond : ce qui n'est pas un luminaire.
  'plafond-daaf': t(18),
  'plafond-vmc': t(12),
  'plafond-detecteur': t(35),
  'plafond-camera': t(89),
};

/**
 * LES LUMINAIRES NE SE CHIFFRENT PAS.
 *
 * Relevé du patron : « on mentionne que les luminaires ne sont pas comptés —
 * cela dépend des envies — mais tout le reste l'est ». Un point lumineux
 * peut coûter neuf euros ou neuf cents ; ce qui se chiffre, c'est ce qui
 * l'alimente : la boîte, le fil, l'interrupteur. Ils sont donc listés au
 * récapitulatif, à zéro euro, et le devis le DIT au lieu de les taire.
 */
export const LUMINAIRES: CeilingKind[] = [
  'dcl',
  'spot',
  'applique',
  'ventilateur',
];

/** Le prix d'une plaque, à n postes, dans une gamme. */
export function tarifPlaque(gamme: GammeId, postes: number): Tarif | null {
  const table = TARIFS_PLAQUE[gamme];
  const pu = table[Math.min(Math.max(postes, 1), table.length) - 1];
  return pu === undefined ? null : { pu, releve: RELEVE, source: A_VALIDER };
}

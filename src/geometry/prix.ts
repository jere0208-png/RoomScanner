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
export const VERSION_TARIFS = '2026-08.2';

/** La source commune à tout ce qui a été posé à la main. */
const A_VALIDER =
  'Estimation au niveau des grandes surfaces, à valider en rayon';
const RELEVE = '2026-08';
const t = (pu: number): Tarif => ({ pu, releve: RELEVE, source: A_VALIDER });

/**
 * UN PRIX QU'ON EST ALLÉ VOIR — enseigne et jour à l'appui.
 *
 * Relevé du patron : « tu fais un vrai catalogue aux prix actuels mis à jour »,
 * puis, une fois le premier relevé fait : « sers-toi de grands magasins publics
 * comme Leroy Merlin, Castorama, etc. — les prix sont plus réalistes ».
 *
 * ET IL AVAIT RAISON. Le premier relevé était allé chez un DISTRIBUTEUR
 * PROFESSIONNEL, en se disant que c'est là qu'un électricien achète. Le
 * chiffre qui a tranché : un interrupteur différentiel 40 A type AC coûte
 * 37,31 € chez le pro et **72,90 € chez Castorama** — presque le double. Un
 * devis qu'on montre à un client doit être celui qu'il verra en rayon s'il va
 * vérifier ; sinon on annonce un prix qu'on ne tiendra pas.
 *
 * LEROY MERLIN REFUSE TOUJOURS LA LECTURE AUTOMATIQUE (HTTP 403, comme
 * 123elec), CASTORAMA NON. Le relevé du 28 août 2026 est donc fait chez
 * Castorama, et c'est écrit sur chaque prix qui en vient.
 *
 * ONZE ARTICLES RELEVÉS, ET DEUX SURPRISES EN SENS INVERSE.
 *
 *   LE CUIVRE ET LES GAINES ÉTAIENT SOUS-ESTIMÉS. Fil 1,5 mm² : 16 € posés,
 *   **25,90 € en rayon**. Fil 2,5 mm² : 26 € posés, **41,90 €**. Gaine ICTA
 *   Ø 20 : 28 € posés, **30,90 €**. Or les conduits et les conducteurs sont la
 *   MOITIÉ INVISIBLE d'un devis — celle qu'on ne voit pas sur les murs, et
 *   celle qui pèse le plus lourd sur un logement entier.
 *
 *   ET LE PETIT MATÉRIEL AUSSI. Une boîte d'encastrement : 0,90 € posés,
 *   **1,69 € en rayon** — presque le double, sur l'article qu'on achète par
 *   cinquante.
 *
 * CE QUI RESTE ESTIMÉ EST MARQUÉ COMME TEL. On ne relève pas cent
 * cinquante articles à la main ; ceux qu'on n'a pas vus sont recalés famille
 * par famille sur l'écart mesuré par ceux qu'on a vus, et ils portent
 * `A_VALIDER`. L'écran du devis le dit ligne par ligne.
 */
const releveLe = (pu: number, source: string, jour: string): Tarif => ({
  pu,
  releve: jour,
  source,
});
/** L'enseigne du relevé du 28 août 2026, et le jour. */
const ENSEIGNE = 'Castorama';
const JOUR = '2026-08-28';
const r = (pu: number): Tarif => releveLe(pu, ENSEIGNE, JOUR);

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
    // Relevé chez Castorama le 28/08/2026 : la 2P+T blanche complète y est à
    // 5,50 €, la RJ45 à 19,50 €, la TV à 12,90 €. Le catalogue en posait
    // 4,50 / 14,90 / 8,90 — l'appareillage d'entrée de gamme était lui aussi
    // sous-estimé, d'un bon quart.
    prise: r(5.5),
    prise20: t(11.9),
    prise32: t(18.9),
    inter: t(5.2),
    va: t(5.5),
    poussoir: t(7.5),
    variateur: t(29.9),
    rj45: r(19.5),
    tv: r(12.9),
    sortieCable: t(6.9),
    thermostat: t(55),
    applique: t(0),
    boite: t(2.2),
    tableau: t(0),
  },
  ovalis: {
    prise: t(5.9),
    prise20: t(12.5),
    prise32: t(19.9),
    inter: t(5.5),
    va: t(5.9),
    poussoir: t(7.9),
    variateur: t(32),
    rj45: t(20.9),
    tv: t(13.9),
    sortieCable: t(7.2),
    thermostat: t(59),
    applique: t(0),
    boite: t(2.2),
    tableau: t(0),
  },
  odace: {
    prise: t(10.9),
    prise20: t(16.9),
    prise32: t(27),
    inter: t(9.9),
    va: t(10.5),
    poussoir: t(12.5),
    variateur: t(49),
    rj45: t(24.9),
    tv: t(16.5),
    sortieCable: t(9.9),
    thermostat: t(89),
    applique: t(0),
    boite: t(2.2),
    tableau: t(0),
  },
  mosaic: {
    prise: t(11.9),
    prise20: t(17.9),
    prise32: t(28),
    inter: t(11.5),
    va: t(11.9),
    poussoir: t(13.9),
    variateur: t(52),
    rj45: t(25.9),
    tv: t(17.5),
    sortieCable: t(10.5),
    thermostat: t(92),
    applique: t(0),
    boite: t(2.2),
    tableau: t(0),
  },
  celiane: {
    prise: t(15.9),
    prise20: t(22),
    prise32: t(33),
    inter: t(14.9),
    va: t(15.5),
    poussoir: t(17.9),
    variateur: t(62),
    rj45: t(31),
    tv: t(19.9),
    sortieCable: t(12.5),
    thermostat: t(99),
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
  dooxie: [2.5, 4.6, 7.2, 10.4, 13.7],
  ovalis: [2.7, 4.9, 7.5, 11, 14.3],
  odace: [5.5, 9.8, 13.7, 18.9, 24],
  mosaic: [6.4, 11, 15.6, 21.5, 27.3],
  celiane: [8.5, 14.3, 20.2, 27.3, 35],
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
  'icta-16': t(24),
  'icta-20': r(30.9),
  'icta-25': t(46),
  'icta-32': t(75),
  // Conducteurs rigides — la couronne de 100 m, par section.
  'fil-1.5': r(25.9),
  'fil-2.5': r(41.9),
  'fil-6': t(99),
  'fil-10': t(165),
  // Courants faibles — ce qu'on tire dans la gaine de communication.
  futp6: t(99),
  coax: t(69),
  // Encastrement.
  'boite-encastrement': r(1.69),
  'boite-dcl': t(4.9),
  'boite-derivation': t(3.9),
  // Tableau : le calibre change le prix, pas beaucoup.
  'disj-2': t(10.5),
  'disj-10': r(10.5),
  'disj-16': r(10.5),
  'disj-20': r(10.5),
  'disj-32': r(23.9),
  'diff-AC': r(72.9),
  'diff-A': r(81.9),
  'coffret-com': t(179),
  /*
    LE COFFRET SE CHIFFRE À LA RANGÉE, ET IL EN FAUT UN.

    Il n'existait au devis que si l'on avait posé un tableau SUR UN MUR du
    plan. Or le tableau se déduit des circuits — on sait combien de modules
    il faut avant de savoir où on l'accroche —, et un devis sans coffret
    manque le poste le plus visible du tableau.
  */
  'coffret-1': r(34.9),
  'coffret-2': r(52.9),
  'coffret-3': t(70.9),
  'coffret-4': t(88.9),
  // Le peigne, qu'on oublie toujours. (Le bornier de terre, lui, est fourni
  // avec le coffret : voir `chiffrer`.)
  peigne: r(5.19),
  // Plafond : ce qui n'est pas un luminaire.
  'plafond-daaf': t(24.9),
  'plafond-vmc': t(16.9),
  'plafond-detecteur': t(44.9),
  'plafond-camera': t(119),
  /*
    ET TOUT CE QU'ON ACHÈTE AUSSI — relevé du patron : « tu fais un vrai
    catalogue aux prix actuels mis à jour avec un maximum de produits utiles,
    JUSQU'AUX VIS ».

    Le devis ne chiffrait que ce que le plan sait compter : des gaines, des
    fils, des mécanismes, des protections. Or on ne part pas au comptoir avec
    cette liste-là — il y manque les chevilles qui tiennent les boîtes, les
    colliers qui tiennent les gaines, le ruban, les wago, le plâtre, et
    l'aiguille sans laquelle rien ne passe. Ce sont des petits prix, et
    ensemble ils font le plein d'un caddie.

    CES ARTICLES-LÀ NE SE DÉDUISENT PAS DU PLAN, et c'est voulu : personne ne
    peut savoir combien de vis tient un chantier. Ils vivent au MAGASIN, on
    les ajoute au devis à la main, avec leur quantité — voir `magasin.ts`.
  */
  // ------------------------------------------------ conducteurs et conduits
  'fil-4': t(66),
  'fil-16': t(255),
  'fil-25': t(390),
  // Les câbles souples, pour ce qui sort du mur : four, plaque, extérieur.
  'cable-3g1.5': t(89),
  'cable-3g2.5': t(139),
  'cable-5g2.5': t(219),
  'cable-3g6': t(289),
  'icta-40': t(59),
  // Les gaines de terre et de réseau, en tranchée.
  'gaine-tpc-40': t(32),
  'gaine-tpc-63': t(55),
  'gaine-annelee-16': t(12),
  // Ce qui passe EN APPARENT, quand on ne saigne pas le mur.
  'goulotte-40': t(9.5),
  'plinthe-passe-cable': t(12),
  // ---------------------------------------------------------- encastrement
  'boite-encastrement-2': t(2.9),
  'boite-encastrement-3': t(4.2),
  'boite-maconnerie': t(1.95),
  'boite-maconnerie-2': t(3.3),
  'boite-etanche': t(6.9),
  'boite-derivation-etanche': t(7.9),
  'couvercle-derivation': t(2.2),
  'boite-sol': t(45),
  // --------------------------------------------------------------- tableau
  'disj-6': t(10.5),
  'disj-25': t(16.9),
  'disj-40': t(28.9),
  'diff-A-63': t(105),
  'diff-AC-63': t(92),
  'diff-HPI': t(119),
  parafoudre: t(89),
  'contacteur-jn': t(56),
  telerupteur: t(42),
  'horloge-modulaire': t(72),
  delesteur: t(169),
  'bornier-terre': t(8.9),
  'bornier-repartition': t(18.9),
  'peigne-vertical': t(30.9),
  gtl: t(79),
  'coffret-etanche': t(59),
  'disj-abonne': t(99),
  'sectionneur-63': t(36),
  // ------------------------------------------------------- courants faibles
  'rj45-keystone': t(8.9),
  brassage: t(5.9),
  dti: t(24.9),
  'repartiteur-tv': t(18.9),
  // ------------------------------------------------- fixation, jusqu'aux vis
  'vis-placo': t(6.9),
  'vis-beton': t(18),
  'cheville-placo': t(14),
  'cheville-nylon': t(5.5),
  'collier-colson': r(9.99),
  'collier-gaine-20': t(9.5),
  'cavalier-16': t(4.5),
  'agrafe-icta': t(8.9),
  // ------------------------------------------------------------ connexions
  'ruban-isolant': t(5.9),
  'wago-2': r(19.9),
  'wago-3': t(17.9),
  'wago-5': t(15.9),
  domino: t(4.5),
  'embout-cable': t(16),
  'gaine-thermo': t(9.9),
  // ------------------------------------------------------- scellement, pose
  'platre-scellement': t(14),
  'mousse-pu': t(8.9),
  silicone: t(6.5),
  // ----------------------------------------------------------------- outils
  'tire-fil': t(32),
  'scie-cloche-67': t(18),
  'foret-beton-6': t(4.5),
  'fraise-placo-67': t(22),
  'niveau-40': t(15),
  'pince-coupante': t(22),
  'tournevis-testeur': t(9),
  multimetre: t(35),
  /*
    CE QU'UNE RÉNOVATION D'APPARTEMENT DEMANDE, ET QUI MANQUAIT.

    Relevé du patron : « fais un check du rayon complet électrique pour les
    besoins standards, rénovation d'appartement par exemple ». Le catalogue
    couvrait le neuf — saigner, tirer, câbler — et laissait de côté ce qui est
    PROPRE À LA RÉNOVATION, où l'on travaille dans des murs déjà finis.

    LE PLUS IMPORTANT EST LA LIAISON ÉQUIPOTENTIELLE. Elle est OBLIGATOIRE
    dans une salle d'eau (NF C 15-100), elle se refait à chaque rénovation
    parce qu'on y touche les canalisations, et elle ne coûte presque rien —
    c'est exactement le genre de poste qu'on oublie au devis et qu'on paie sur
    le chantier. Elle n'était nulle part.
  */
  // ---------------------------------------------- propre à la rénovation
  'icta-prefilee-3g1.5': r(95.9),
  'icta-prefilee-3g2.5': r(149.9),
  'barrette-equipotentielle': t(12.9),
  'collier-equipotentiel': t(4.5),
  'rehausse-boite': t(1.9),
  'obturateur': r(6.09),
  // Protections d'un départ seul : courantes en rénovation, où l'on ajoute
  // un circuit sans refaire toute la rangée.
  'disj-diff-16': t(59),
  'disj-diff-20': t(62),
  // Pièces humides et non chauffées — salle d'eau, cave, balcon.
  'prise-etanche': t(12.9),
  'inter-etanche': t(14.9),
  // Ce qui se raccorde en dur : plaque, sèche-serviette, volet.
  'sortie-cable-32': t(12.9),
  'inter-volet': t(24.9),
  carillon: t(32),
  // ------------------------------------------------------ plafond et divers
  'transfo-led': t(28),
  'ruban-led': t(24),
  'gaine-vmc-125': t(18),
  'bouche-vmc': t(12),
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

// ------------------------------------------------ le catalogue qui arrive

/**
 * UN CATALOGUE REÇU DU SERVEUR — des prix qui remplacent les nôtres.
 *
 * Relevé du patron : « pour les prix, j'aimerais une actualisation
 * automatique via l'application, au clic sur le devis, un chargement des prix
 * pour voir si les prix sont à jour. Fournir une référence pour le prix
 * (ex : Castorama - date). »
 *
 * C'ÉTAIT LE SEUL ENDROIT OÙ L'APPLICATION AVANÇAIT SANS PREUVE. Les tarifs
 * ci-dessus sont datés et signés, mais POSÉS À LA MAIN : les rafraîchir
 * demandait une nouvelle version de l'application, et un tarif vieillit tout
 * seul. Le devis peut maintenant aller les chercher.
 *
 * IL REMPLACE ARTICLE PAR ARTICLE, ET SEULEMENT CE QU'IL PORTE. Un catalogue
 * qui ne connaîtrait que le cuivre ne doit pas effacer l'appareillage : ce
 * qu'il ignore reste ce qu'il était. C'est aussi ce qui permet de le remplir
 * peu à peu, rayon par rayon, sans jamais casser le devis.
 *
 * LES CLÉS SONT CELLES DU BORDEREAU, à une exception près : l'appareillage
 * dépend de la gamme, et le bordereau ne la porte pas dans son code. Un
 * mécanisme s'écrit donc `meca-<gamme>-<type>` et une plaque
 * `plaque-<gamme>-<postes>` — voir `cleDuTarif`.
 */
export interface TarifsRecus {
  /** La version du catalogue distant : elle s'affiche sur le devis. */
  version: string;
  /** Le JOUR du relevé, AAAA-MM-JJ. Le nôtre n'a que le mois. */
  releve: string;
  /** L'enseigne où ces prix ont été relevés — « Castorama », par exemple. */
  source: string;
  /** Le prix TTC de chaque article connu, par clé de catalogue. */
  prix: Record<string, number>;
}

/*
  L'ÉTAT VIT DANS LE MODULE, ET C'EST VOULU.

  `chiffrer` est appelé depuis une demi-douzaine d'endroits — l'écran du
  devis, la pastille du plan, le PDF, le CSV. Faire descendre le catalogue en
  paramètre jusqu'à chacun d'eux, c'était six chemins à tenir d'accord, et le
  premier oublié aurait annoncé un prix que les autres ne retrouvaient pas.
  Un seul catalogue courant, posé une fois, lu partout.

  EN CONTREPARTIE, IL SURVIT D'UN BANC À L'AUTRE — le même piège que le
  magasin Zustand. `appliquerLesTarifs(null)` le remet à zéro, et les bancs
  s'en servent après chaque épreuve.
*/
let recus: TarifsRecus | null = null;

/** Pose (ou retire) le catalogue reçu. `null` rend les prix embarqués. */
export function appliquerLesTarifs(t: TarifsRecus | null): void {
  recus = t;
}

/** Ce qui est appliqué en ce moment — `null` quand rien n'est venu. */
export function tarifsAppliques(): TarifsRecus | null {
  return recus;
}

/**
 * LA CLÉ D'UN ARTICLE DANS UN CATALOGUE REÇU.
 *
 * Le code du bordereau, sauf pour ce qui dépend de la gamme : un « meca-prise »
 * ne veut rien dire sans savoir si l'on pose du dooxie ou du Céliane.
 */
export function cleDuTarif(code: string, gamme: GammeId): string {
  if (code.startsWith('meca-')) return `meca-${gamme}-${code.slice(5)}`;
  if (code.startsWith('plaque-')) return `plaque-${gamme}-${code.slice(7)}`;
  return code;
}

/** Le prix reçu pour cette clé, s'il en est venu un. */
export function tarifRecu(cle: string): Tarif | null {
  const pu = recus?.prix[cle];
  if (pu === undefined || !isFinite(pu) || pu < 0) return null;
  return { pu, releve: recus!.releve, source: recus!.source };
}

/**
 * LE RELEVÉ D'UN PRIX, ÉCRIT POUR ÊTRE LU.
 *
 * Deux formes cohabitent, et c'est voulu : le catalogue embarqué est posé au
 * MOIS (« 2026-08 ») parce qu'un ordre de grandeur ne se date pas au jour ;
 * un catalogue reçu du serveur est daté au JOUR (« 2026-09-03 ») parce qu'on
 * sait exactement quand on est allé voir. On rend donc ce qu'on a, sans
 * inventer une précision qui n'existe pas.
 */
const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

export function dateDuReleve(releve: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(releve);
  if (!m) return releve;
  const mois = MOIS[Number(m[2]) - 1] ?? m[2];
  return m[3] ? `${Number(m[3])} ${mois} ${m[1]}` : `${mois} ${m[1]}`;
}

/** Le prix d'une plaque, à n postes, dans une gamme. */
export function tarifPlaque(gamme: GammeId, postes: number): Tarif | null {
  const table = TARIFS_PLAQUE[gamme];
  const pu = table[Math.min(Math.max(postes, 1), table.length) - 1];
  return pu === undefined ? null : { pu, releve: RELEVE, source: A_VALIDER };
}

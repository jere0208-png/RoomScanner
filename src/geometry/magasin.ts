/**
 * LE MAGASIN — tout ce qu'on met dans le caddie, et pas seulement ce que le
 * plan sait compter.
 *
 * Relevé du patron : « tu fais un vrai catalogue aux prix actuels mis à jour
 * avec un maximum de produits utiles, jusqu'aux vis. Page entière Magasin. »
 *
 * POURQUOI CE FICHIER EXISTE, ALORS QUE `prix.ts` EXISTE DÉJÀ. `prix.ts` est
 * une table de TARIFS : un code, un prix, une date, une source. Elle répond à
 * « combien coûte `icta-20` ? ». Elle ne répond pas à « qu'est-ce que c'est,
 * dans quel rayon, et vendu comment ? » — ces trois réponses-là venaient du
 * bordereau, qui les fabrique à la volée pour les seuls articles que le plan
 * sait déduire. Un magasin, lui, doit nommer TOUT ce qu'il vend, y compris ce
 * qu'aucun plan ne peut compter.
 *
 * ET IL N'Y A TOUJOURS QU'UNE SEULE SOURCE POUR LE PRIX. Ce fichier ne porte
 * aucun euro : il décrit, `prix.ts` chiffre. Deux tables de prix finiraient
 * par diverger, et le magasin annoncerait un tarif que le devis ne
 * retrouverait pas — l'écart que personne ne remarque avant le client.
 *
 * CE QU'AUCUN PLAN NE PEUT COMPTER. Le devis chiffre ce qui se déduit du
 * relevé : la longueur des gaines, le nombre de socles, les protections qu'ils
 * appellent. Personne ne peut en déduire combien de chevilles tient un
 * chantier, ni s'il faudra une aiguille — ça dépend du mur, de l'ancienneté du
 * bâti, de ce qu'on a déjà dans la camionnette. Ces articles-là s'ajoutent à
 * la main, avec leur quantité, et le devis dit qu'ils viennent du magasin et
 * non du métré.
 */
import {
  GAMMES,
  TARIFS_COMMUNS,
  TARIFS_MECANISME,
  tarifPlaque,
  type GammeId,
  type Tarif,
} from './prix';
import { FIXTURES, type FixtureKind } from './electrical';
import { CEILINGS, type CeilingKind } from './ceiling';

/**
 * LES RAYONS, DANS L'ORDRE OÙ ON REMPLIT LE CHARIOT.
 *
 * C'est l'ordre du chantier, pas l'alphabet : on tire d'abord les gaines, on
 * pose ensuite les boîtes, on câble, on équipe, on ferme le tableau. Les
 * quatre premiers rayons portent les mêmes noms que ceux du bordereau — ce
 * sont les mêmes familles, et deux nomenclatures pour une seule chose
 * obligeraient à traduire à chaque ligne du devis.
 */
export const RAYONS = [
  'Conduits et conducteurs',
  'Encastrement et finition',
  'Appareillage',
  'Plafond',
  'Tableau',
  'Courants faibles',
  'Fixation et consommables',
  'Outillage',
] as const;

export type Rayon = (typeof RAYONS)[number];

/**
 * UNE OFFRE VÉRIFIÉE — un prix qu'on est allé voir, sur un produit qu'on a
 * IDENTIFIÉ.
 *
 * Relevé du patron : « on n'a pas le droit à l'erreur, pour chaque produit tu
 * dois vérifier que ce soit bien celui qu'on présente ».
 *
 * C'EST `reference` QUI PORTE TOUT LE POIDS DE CETTE PHRASE. Un prix sans
 * référence de fabricant ne prouve rien : deux interrupteurs différentiels
 * « 40 A 30 mA type AC » peuvent être deux appareils différents, à trente
 * euros d'écart. Le couple n'a été retenu que quand la MÊME référence a été
 * lue des deux côtés — pour celui-ci, `092840` sur la fiche Legrand derrière
 * l'EAN de Castorama, et `092840` écrit dans la page Amazon.
 *
 * ET ON A ÉCARTÉ CE QU'ON NE POUVAIT PAS PROUVER. La boîte d'encastrement
 * Castorama est une « plaque de plâtre » ; le premier résultat Amazon au même
 * prix était une « multimatériaux ». Deux produits voisins, deux usages
 * différents : pas de rapprochement.
 */
export interface Offre {
  /** Où on l'a vu — « Castorama », « Amazon ». */
  enseigne: string;
  /** Prix TTC en euros, tel qu'affiché le jour du relevé. */
  prix: number;
  /** Le titre du produit TEL QU'IL EST ÉCRIT chez le marchand. */
  intitule: string;
  /**
   * DE QUOI PROUVER QUE C'EST LE MÊME ARTICLE.
   *
   * La référence du fabricant quand elle existe (« 092840 »), à défaut celle
   * du marchand. C'est ce qu'on relit pour vérifier, et c'est ce qui interdit
   * de comparer deux produits qui se ressemblent.
   */
  reference: string;
  /** Le jour du relevé, AAAA-MM-JJ. */
  jour: string;
  /**
   * L'identifiant Amazon (ASIN), quand l'offre en vient.
   *
   * On garde l'ASIN et NON l'adresse complète : le lien se fabrique à un seul
   * endroit (`lienAmazon`), et le jour où l'on ajoutera la balise partenaire —
   * relevé du patron : « on mettra plus tard un lien partenaires amazon » —
   * il n'y aura qu'une ligne à changer, pas cent cinquante adresses à
   * réécrire.
   */
  asin?: string;
}

/**
 * LA BALISE PARTENAIRE AMAZON — vide tant qu'on n'en a pas.
 *
 * Relevé du patron : « on mettra plus tard un lien partenaires amazon ». Le
 * jour où le compte existe, on écrit la balise ICI et tous les liens du
 * magasin la portent. Vide, les liens marchent quand même : ils mènent
 * simplement à la fiche produit sans rien rapporter.
 */
export const PARTENAIRE_AMAZON = '';

/** L'adresse d'une offre Amazon, balise partenaire comprise s'il y en a une. */
export function lienAmazon(asin: string): string {
  const base = `https://www.amazon.fr/dp/${asin}`;
  return PARTENAIRE_AMAZON ? `${base}?tag=${PARTENAIRE_AMAZON}` : base;
}

/** Un article du magasin : ce qu'il est, pas ce qu'il coûte. */
export interface ArticleMagasin {
  code: string;
  rayon: Rayon;
  libelle: string;
  /** Ce qui précise l'article : norme, section, dimensions, conditionnement. */
  precision?: string;
  /** L'unité de vente — c'est elle qui donne son sens à la quantité. */
  unite: string;
  /**
   * CE QUE LE PLAN SAIT DÉDUIRE.
   *
   * Un article « du métré » se compte tout seul depuis le relevé ; on peut
   * corriger sa quantité, mais il arrive au devis sans qu'on le demande. Les
   * autres n'y entrent que si on les prend au magasin. Le devis le dit, parce
   * que la confiance qu'on accorde à un chiffre n'est pas la même.
   */
  duMetre?: boolean;
  /**
   * LES OFFRES VÉRIFIÉES POUR CET ARTICLE, s'il y en a.
   *
   * Un article sans offre n'est pas un article douteux : c'est un article dont
   * le prix est une ESTIMATION recalée sur le niveau des grandes surfaces, et
   * l'écran le dit. Il n'aura simplement jamais de bouton « Voir sur
   * Amazon » : on ne compare pas un prix vu à un prix supposé.
   */
  offres?: Offre[];
}

/**
 * L'OFFRE AMAZON À MONTRER — et seulement quand elle vaut le détour.
 *
 * Relevé du patron : « tu fais un bouton qui affiche le prix et "Voir sur
 * Amazon" [...] à chaque produit où le prix est équivalent ou inférieur à
 * celui qu'on indique en grande surface ».
 *
 * DEUX CONDITIONS, ET LA SECONDE EST LA PLUS IMPORTANTE.
 *
 *   1. l'offre Amazon est au plus au prix de la grande surface — « équivalent
 *      ou inférieur », donc on garde l'égalité ;
 *   2. **LES DEUX PRIX ONT ÉTÉ VUS.** Comparer une offre Amazon relevée à une
 *      estimation, c'est annoncer une économie qu'on n'a pas mesurée. Un
 *      article dont le prix de référence est estimé n'a donc pas de bouton,
 *      quoi qu'en dise Amazon.
 */
export function offreAmazon(a: ArticleMagasin, tarif: Tarif): Offre | null {
  const amazon = (a.offres ?? []).find((o) => o.enseigne === 'Amazon');
  if (!amazon) return null;
  // Le prix de référence a-t-il été VU ? Une estimation ne se compare pas.
  const vu = (a.offres ?? []).some(
    (o) => o.enseigne !== 'Amazon' && Math.abs(o.prix - tarif.pu) < 0.005,
  );
  if (!vu) return null;
  return amazon.prix <= tarif.pu + 0.005 ? amazon : null;
}

/*
  ------------------------------------------------------------------------
  LE CATALOGUE. Chaque ligne est un article qu'on peut mettre au caddie.
  ------------------------------------------------------------------------
*/
const CONDUITS: ArticleMagasin[] = [
  {
    code: 'icta-16',
    rayon: 'Conduits et conducteurs',
    libelle: 'Gaine ICTA Ø 16',
    precision: 'ICTA 3422, avec tire-fil — couronne de 100 m',
    unite: 'couronne',
    duMetre: true,
  },
  {
    code: 'icta-20',
    rayon: 'Conduits et conducteurs',
    libelle: 'Gaine ICTA Ø 20',
    precision: 'ICTA 3422, avec tire-fil — couronne de 100 m',
    unite: 'couronne',
    duMetre: true,
    /*
      PAS D'OFFRE AMAZON ICI, ET C'EST LE BANC QUI L'A EXIGÉ.

      On en avait posé une — une gaine Zenitech à 39,90 € — en la croyant
      comparable. Elle ne l'est pas : celle de Castorama est une Diall. Deux
      marques, deux produits, et le banc `magasin` refuse tout rapprochement
      dont les deux côtés ne portent pas la MÊME référence. Il avait raison :
      c'est précisément l'erreur que « on n'a pas le droit à l'erreur »
      interdit, et elle était passée inaperçue à l'écriture.
    */
    offres: [
      {
        enseigne: 'Castorama',
        prix: 30.9,
        intitule: 'Gaine électrique ICTA Diall ø20 - 100 m',
        reference: '3454978152419',
        jour: '2026-08-28',
      },
    ],
  },
  {
    code: 'icta-25',
    rayon: 'Conduits et conducteurs',
    libelle: 'Gaine ICTA Ø 25',
    precision: 'ICTA 3422, avec tire-fil — couronne de 100 m',
    unite: 'couronne',
    duMetre: true,
  },
  {
    code: 'icta-32',
    rayon: 'Conduits et conducteurs',
    libelle: 'Gaine ICTA Ø 32',
    precision: 'ICTA 3422, avec tire-fil — couronne de 100 m',
    unite: 'couronne',
    duMetre: true,
  },
  {
    code: 'icta-40',
    rayon: 'Conduits et conducteurs',
    libelle: 'Gaine ICTA Ø 40',
    precision: 'Couronne de 50 m — colonne montante, alimentation de tableau',
    unite: 'couronne',
  },
  {
    code: 'fil-1.5',
    rayon: 'Conduits et conducteurs',
    libelle: 'Fil H07V-U 1,5 mm²',
    precision: 'Rigide, couronne de 100 m — éclairage, commandes',
    unite: 'couronne',
    duMetre: true,
    offres: [
      {
        enseigne: 'Castorama',
        prix: 25.9,
        intitule: 'Fil 1,5 mm² H07VU couronne 100 m',
        reference: '3427500597262',
        jour: '2026-08-28',
      },
    ],
  },
  {
    code: 'fil-2.5',
    rayon: 'Conduits et conducteurs',
    libelle: 'Fil H07V-U 2,5 mm²',
    precision: 'Rigide, couronne de 100 m — prises, spécialisés 20 A',
    unite: 'couronne',
    duMetre: true,
    offres: [
      {
        enseigne: 'Castorama',
        prix: 41.9,
        intitule: 'Fil électrique H07VU 2,5 mm² rouge couronne 100 m',
        reference: '3427500597828',
        jour: '2026-08-28',
      },
      /*
        Le Zenitech d'Amazon (45,39 €) n'est pas le fil de Castorama : deux
        fabricants pour une même norme. On ne le rapproche donc pas — même
        s'il était moins cher, ce ne serait pas le même article.
      */
    ],
  },
  {
    code: 'fil-4',
    rayon: 'Conduits et conducteurs',
    libelle: 'Fil H07V-U 4 mm²',
    precision: 'Rigide, couronne de 100 m',
    unite: 'couronne',
  },
  {
    code: 'fil-6',
    rayon: 'Conduits et conducteurs',
    libelle: 'Fil H07V-U 6 mm²',
    precision: 'Rigide, couronne de 100 m — plaque de cuisson 32 A',
    unite: 'couronne',
    duMetre: true,
  },
  {
    code: 'fil-10',
    rayon: 'Conduits et conducteurs',
    libelle: 'Fil H07V-U 10 mm²',
    precision: 'Rigide, couronne de 100 m — liaison au disjoncteur d’abonné',
    unite: 'couronne',
    duMetre: true,
  },
  {
    code: 'fil-16',
    rayon: 'Conduits et conducteurs',
    libelle: 'Fil H07V-U 16 mm²',
    precision: 'Rigide, couronne de 100 m — alimentation de tableau',
    unite: 'couronne',
  },
  {
    code: 'fil-25',
    rayon: 'Conduits et conducteurs',
    libelle: 'Fil H07V-U 25 mm²',
    precision: 'Rigide, couronne de 100 m — liaison au compteur',
    unite: 'couronne',
  },
  {
    code: 'cable-3g1.5',
    rayon: 'Conduits et conducteurs',
    libelle: 'Câble R2V 3G1,5',
    precision: 'Couronne de 100 m — ce qui sort du mur, apparent ou enterré',
    unite: 'couronne',
  },
  {
    code: 'cable-3g2.5',
    rayon: 'Conduits et conducteurs',
    libelle: 'Câble R2V 3G2,5',
    precision: 'Couronne de 100 m',
    unite: 'couronne',
  },
  {
    code: 'cable-5g2.5',
    rayon: 'Conduits et conducteurs',
    libelle: 'Câble R2V 5G2,5',
    precision: 'Couronne de 100 m — triphasé, moteur, portail',
    unite: 'couronne',
  },
  {
    code: 'cable-3g6',
    rayon: 'Conduits et conducteurs',
    libelle: 'Câble R2V 3G6',
    precision: 'Couronne de 100 m — dépendance, abri de jardin',
    unite: 'couronne',
  },
  {
    code: 'gaine-tpc-40',
    rayon: 'Conduits et conducteurs',
    libelle: 'Gaine TPC Ø 40 rouge',
    precision: 'Couronne de 25 m — enterré, sous fourreau',
    unite: 'couronne',
  },
  {
    code: 'gaine-tpc-63',
    rayon: 'Conduits et conducteurs',
    libelle: 'Gaine TPC Ø 63 rouge',
    precision: 'Couronne de 25 m',
    unite: 'couronne',
  },
  {
    code: 'gaine-annelee-16',
    rayon: 'Conduits et conducteurs',
    libelle: 'Gaine annelée Ø 16',
    precision: 'Couronne de 25 m — protection d’un passage court',
    unite: 'couronne',
  },
  {
    code: 'goulotte-40',
    rayon: 'Conduits et conducteurs',
    libelle: 'Goulotte 40 × 25',
    precision: 'Longueur de 2 m — passage apparent, rénovation sans saignée',
    unite: 'barre',
  },
  {
    code: 'plinthe-passe-cable',
    rayon: 'Conduits et conducteurs',
    libelle: 'Plinthe passe-câbles 70 × 20',
    precision: 'Longueur de 2 m',
    unite: 'barre',
  },
  {
    code: 'futp6',
    rayon: 'Courants faibles',
    libelle: 'Câble F/UTP catégorie 6',
    precision: 'Touret de 100 m — réseau et téléphone',
    unite: 'touret',
    duMetre: true,
  },
  {
    code: 'coax',
    rayon: 'Courants faibles',
    libelle: 'Câble coaxial 17 VATC',
    precision: 'Touret de 100 m — télévision, satellite',
    unite: 'touret',
    duMetre: true,
  },
];

const ENCASTREMENT: ArticleMagasin[] = [
  {
    code: 'boite-encastrement',
    rayon: 'Encastrement et finition',
    libelle: 'Boîte d’encastrement 1 poste',
    precision: 'Legrand Batibox cloison sèche, profondeur 40 mm',
    unite: 'u',
    duMetre: true,
    /*
      LE PIÈGE QU'ON A ÉVITÉ ICI, et il vaut d'être écrit. Amazon propose une
      « Batibox MULTIMATÉRIAUX 1 poste profondeur 40 » à 1,69 € — exactement le
      prix de Castorama, donc un bouton « équivalent » tout trouvé. Mais la
      boîte de Castorama est une CLOISON SÈCHE : deux produits voisins, deux
      poses différentes, et l'électricien qui commande la mauvaise s'en aperçoit
      devant le mur. La seule référence identique (080041) est à 2,95 € chez
      Amazon : plus cher, donc pas de bouton.
    */
    offres: [
      {
        enseigne: 'Castorama',
        prix: 1.69,
        intitule:
          'Boîte d’encastrement simple plaque de plâtre Legrand P. 40 mm',
        reference: '3245060905415',
        jour: '2026-08-28',
      },
      /*
        Amazon vend bien la 080041 (2,95 €, plus cher), mais la page Castorama
        ne publie que son EAN et l'on n'a PAS établi qu'il désigne cette
        référence-là. Sans cette preuve, pas de rapprochement : c'est la même
        règle que pour la gaine, et elle vaut aussi quand le rapprochement
        n'aurait rien changé à l'écran.
      */
    ],
  },
  {
    code: 'boite-encastrement-2',
    rayon: 'Encastrement et finition',
    libelle: 'Boîte d’encastrement 2 postes',
    precision: 'Cloison sèche, profondeur 40 mm',
    unite: 'u',
  },
  {
    code: 'boite-encastrement-3',
    rayon: 'Encastrement et finition',
    libelle: 'Boîte d’encastrement 3 postes',
    precision: 'Cloison sèche, profondeur 40 mm',
    unite: 'u',
  },
  {
    code: 'boite-maconnerie',
    rayon: 'Encastrement et finition',
    libelle: 'Boîte à sceller 1 poste',
    precision: 'Maçonnerie, profondeur 40 mm',
    unite: 'u',
  },
  {
    code: 'boite-maconnerie-2',
    rayon: 'Encastrement et finition',
    libelle: 'Boîte à sceller 2 postes',
    precision: 'Maçonnerie, profondeur 40 mm',
    unite: 'u',
  },
  {
    code: 'boite-dcl',
    rayon: 'Encastrement et finition',
    libelle: 'Boîte de point de centre DCL',
    precision: 'Avec crochet et fiche — plafond',
    unite: 'u',
    duMetre: true,
  },
  {
    code: 'boite-derivation',
    rayon: 'Encastrement et finition',
    libelle: 'Boîte de dérivation',
    precision: 'Encastrée, avec couvercle',
    unite: 'u',
    duMetre: true,
  },
  {
    code: 'couvercle-derivation',
    rayon: 'Encastrement et finition',
    libelle: 'Couvercle de dérivation',
    precision: 'Transforme une boîte d’appareillage en boîte de dérivation',
    unite: 'u',
  },
  {
    code: 'boite-etanche',
    rayon: 'Encastrement et finition',
    libelle: 'Boîte étanche IP 55',
    precision: 'Extérieur, cave, garage',
    unite: 'u',
  },
  {
    code: 'boite-derivation-etanche',
    rayon: 'Encastrement et finition',
    libelle: 'Boîte de dérivation étanche IP 55',
    unite: 'u',
  },
  {
    code: 'boite-sol',
    rayon: 'Encastrement et finition',
    libelle: 'Boîte de sol',
    precision: 'Îlot de cuisine, bureau au milieu d’une pièce',
    unite: 'u',
  },
];

const TABLEAU: ArticleMagasin[] = [
  {
    code: 'disj-2',
    rayon: 'Tableau',
    libelle: 'Disjoncteur 2 A',
    precision: '1P+N, courbe C',
    unite: 'u',
    duMetre: true,
  },
  {
    code: 'disj-6',
    rayon: 'Tableau',
    libelle: 'Disjoncteur 6 A',
    precision: '1P+N, courbe C',
    unite: 'u',
  },
  {
    code: 'disj-10',
    rayon: 'Tableau',
    libelle: 'Disjoncteur 10 A',
    precision: '1P+N, courbe C — éclairage',
    unite: 'u',
    duMetre: true,
  },
  {
    code: 'disj-16',
    rayon: 'Tableau',
    libelle: 'Disjoncteur 16 A',
    precision: 'Legrand phase + neutre, courbe C — prises, éclairage',
    unite: 'u',
    duMetre: true,
    offres: [
      {
        enseigne: 'Castorama',
        prix: 10.5,
        intitule: 'Disjoncteur Phase + neutre 16A Legrand',
        reference: '3245060928230',
        jour: '2026-08-28',
      },
    ],
  },
  {
    code: 'disj-20',
    rayon: 'Tableau',
    libelle: 'Disjoncteur 20 A',
    precision: '1P+N, courbe C — prises, lave-linge, four',
    unite: 'u',
    duMetre: true,
  },
  {
    code: 'disj-25',
    rayon: 'Tableau',
    libelle: 'Disjoncteur 25 A',
    precision: '1P+N, courbe C',
    unite: 'u',
  },
  {
    code: 'disj-32',
    rayon: 'Tableau',
    libelle: 'Disjoncteur 32 A',
    precision: '1P+N, courbe C — plaque de cuisson',
    unite: 'u',
    duMetre: true,
  },
  {
    code: 'disj-40',
    rayon: 'Tableau',
    libelle: 'Disjoncteur 40 A',
    precision: '1P+N, courbe C',
    unite: 'u',
  },
  {
    code: 'diff-AC',
    rayon: 'Tableau',
    libelle: 'Interrupteur différentiel 40 A type AC',
    precision: 'Legrand 092840 — 30 mA, bipolaire, arrivée haut/départ haut',
    unite: 'u',
    duMetre: true,
    /*
      LE COUPLE LE MIEUX PROUVÉ DU CATALOGUE, et le plus rentable : vingt-cinq
      euros d'écart sur un article qu'un tableau porte deux à quatre fois.

      COMMENT ON A ÉTABLI QUE C'EST LE MÊME APPAREIL. La page Castorama ne
      donne pas la référence Legrand, seulement l'EAN 3245060928407 ; cet EAN
      renvoie, au catalogue Legrand, à l'« interrupteur différentiel bipolaire
      type AC 30 mA arrivée haut/départ haut par bornes à vis 40 A », soit la
      référence 092840. Et la fiche Amazon porte « 092840 » écrit noir sur
      blanc. Même référence des deux côtés : on peut comparer.

      On a écarté au passage un « 411632 DX3 » à 42,80 €, moins cher encore :
      c'est une autre référence, donc un autre appareil.
    */
    offres: [
      {
        enseigne: 'Castorama',
        prix: 72.9,
        intitule: 'Interrupteur différentiel 40A 30mA type AC sortie haut Legrand',
        reference: '092840',
        jour: '2026-08-28',
      },
      {
        enseigne: 'Amazon',
        prix: 47.49,
        intitule:
          'Legrand - Interrupteur différentiel bipolaire - Type AC 30mA arrivée haut/départ haut par bornes à vis 40A',
        reference: '092840',
        jour: '2026-08-28',
        asin: 'B007AKRUZG',
      },
    ],
  },
  {
    code: 'diff-A',
    rayon: 'Tableau',
    libelle: 'Interrupteur différentiel 40 A type A',
    precision: '30 mA — lave-linge, plaque, borne de recharge',
    unite: 'u',
    duMetre: true,
  },
  {
    code: 'diff-AC-63',
    rayon: 'Tableau',
    libelle: 'Interrupteur différentiel 63 A type AC',
    precision: '30 mA',
    unite: 'u',
  },
  {
    code: 'diff-A-63',
    rayon: 'Tableau',
    libelle: 'Interrupteur différentiel 63 A type A',
    precision: '30 mA',
    unite: 'u',
  },
  {
    code: 'diff-HPI',
    rayon: 'Tableau',
    libelle: 'Différentiel type F (HPI)',
    precision: '40 A, 30 mA — informatique, congélateur',
    unite: 'u',
  },
  {
    code: 'coffret-1',
    rayon: 'Tableau',
    libelle: 'Coffret 1 rangée',
    precision: '13 modules, avec porte',
    unite: 'u',
    duMetre: true,
  },
  {
    code: 'coffret-2',
    rayon: 'Tableau',
    libelle: 'Coffret 2 rangées',
    precision: '26 modules, avec porte',
    unite: 'u',
    duMetre: true,
  },
  {
    code: 'coffret-3',
    rayon: 'Tableau',
    libelle: 'Coffret 3 rangées',
    precision: '39 modules, avec porte',
    unite: 'u',
    duMetre: true,
  },
  {
    code: 'coffret-4',
    rayon: 'Tableau',
    libelle: 'Coffret 4 rangées',
    precision: '52 modules, avec porte',
    unite: 'u',
    duMetre: true,
  },
  {
    code: 'coffret-etanche',
    rayon: 'Tableau',
    libelle: 'Coffret étanche IP 65',
    precision: '12 modules — garage, atelier, extérieur',
    unite: 'u',
  },
  {
    code: 'peigne',
    rayon: 'Tableau',
    libelle: 'Peigne d’alimentation horizontal',
    precision: '13 modules, 1P+N',
    unite: 'u',
    duMetre: true,
  },
  {
    code: 'peigne-vertical',
    rayon: 'Tableau',
    libelle: 'Peigne vertical',
    precision: 'Relie les rangées entre elles',
    unite: 'u',
  },
  {
    code: 'bornier-terre',
    rayon: 'Tableau',
    libelle: 'Bornier de terre',
    precision: 'Répartition — fourni avec la plupart des coffrets',
    unite: 'u',
  },
  {
    code: 'bornier-repartition',
    rayon: 'Tableau',
    libelle: 'Répartiteur modulaire',
    precision: '4 × 12 bornes',
    unite: 'u',
  },
  {
    code: 'parafoudre',
    rayon: 'Tableau',
    libelle: 'Parafoudre type 2',
    precision: 'Obligatoire en zone AQ2 et pour un paratonnerre',
    unite: 'u',
  },
  {
    code: 'contacteur-jn',
    rayon: 'Tableau',
    libelle: 'Contacteur jour/nuit',
    precision: '20 A — chauffe-eau en heures creuses',
    unite: 'u',
  },
  {
    code: 'telerupteur',
    rayon: 'Tableau',
    libelle: 'Télérupteur modulaire',
    precision: 'Commande d’un point lumineux depuis trois endroits ou plus',
    unite: 'u',
  },
  {
    code: 'horloge-modulaire',
    rayon: 'Tableau',
    libelle: 'Interrupteur horaire',
    precision: 'Programmation journalière et hebdomadaire',
    unite: 'u',
  },
  {
    code: 'delesteur',
    rayon: 'Tableau',
    libelle: 'Délesteur',
    precision: 'Évite de dépasser la puissance souscrite',
    unite: 'u',
  },
  {
    code: 'sectionneur-63',
    rayon: 'Tableau',
    libelle: 'Interrupteur sectionneur 63 A',
    precision: 'Coupure de tête de rangée',
    unite: 'u',
  },
  {
    code: 'disj-abonne',
    rayon: 'Tableau',
    libelle: 'Disjoncteur d’abonné',
    precision: '500 mA sélectif — remplacement en rénovation',
    unite: 'u',
  },
  {
    code: 'gtl',
    rayon: 'Tableau',
    libelle: 'Goulotte GTL',
    precision: '13 modules, hauteur 2,10 m — obligatoire en neuf',
    unite: 'u',
  },
];

const FAIBLES: ArticleMagasin[] = [
  {
    code: 'coffret-com',
    rayon: 'Courants faibles',
    libelle: 'Coffret de communication',
    precision: 'Grade 2 TV, 4 à 8 RJ45 — obligatoire en neuf',
    unite: 'u',
    duMetre: true,
  },
  {
    code: 'rj45-keystone',
    rayon: 'Courants faibles',
    libelle: 'Prise RJ45 catégorie 6',
    precision: 'Keystone, à sertir',
    unite: 'u',
  },
  {
    code: 'brassage',
    rayon: 'Courants faibles',
    libelle: 'Cordon de brassage',
    precision: 'RJ45 catégorie 6, 1 m',
    unite: 'u',
  },
  {
    code: 'dti',
    rayon: 'Courants faibles',
    libelle: 'DTI — dispositif de terminaison intérieur',
    precision: 'Arrivée de la ligne, dans le coffret de communication',
    unite: 'u',
  },
  {
    code: 'repartiteur-tv',
    rayon: 'Courants faibles',
    libelle: 'Répartiteur TV',
    precision: '4 sorties, blindé',
    unite: 'u',
  },
];

const FIXATION: ArticleMagasin[] = [
  {
    code: 'vis-placo',
    rayon: 'Fixation et consommables',
    libelle: 'Vis à placo 3,5 × 25',
    precision: 'Boîte de 200 — fixation des boîtes et des goulottes',
    unite: 'boîte',
  },
  {
    code: 'vis-beton',
    rayon: 'Fixation et consommables',
    libelle: 'Vis à béton 6 × 60',
    precision: 'Boîte de 100 — sans cheville, dans le dur',
    unite: 'boîte',
  },
  {
    code: 'cheville-placo',
    rayon: 'Fixation et consommables',
    libelle: 'Chevilles à expansion 4 × 38',
    precision: 'Boîte de 50 — cloison sèche',
    unite: 'boîte',
  },
  {
    code: 'cheville-nylon',
    rayon: 'Fixation et consommables',
    libelle: 'Chevilles nylon Ø 6',
    precision: 'Boîte de 100 — maçonnerie',
    unite: 'boîte',
  },
  {
    code: 'collier-colson',
    rayon: 'Fixation et consommables',
    libelle: 'Colliers de serrage 4,8 × 250',
    precision: 'Diall, nylon noir — lot de 100',
    unite: 'lot',
    /*
      LE CAS « ÉQUIVALENT » DU RELEVÉ DU PATRON : neuf euros quatre-vingt-dix-
      neuf des deux côtés, à l'euro près. La même marque (Diall, celle de
      Castorama), les mêmes dimensions, le même conditionnement — c'est un
      article qu'on peut prendre indifféremment chez l'un ou chez l'autre, et
      le bouton le dit.

      L'ARTICLE A CHANGÉ DE DÉFINITION POUR ÇA, et c'est assumé : il annonçait
      du 200 × 4,8, que Castorama ne référence pas. Décrire un article qu'on ne
      sait pas où acheter n'aide personne — mieux vaut celui qui est en rayon.
    */
    offres: [
      {
        enseigne: 'Castorama',
        prix: 9.99,
        intitule: '100 colliers de serrage en nylon Diall 4,8 x 250 mm noir',
        reference: '3663602792376',
        jour: '2026-08-28',
      },
      {
        enseigne: 'Amazon',
        prix: 9.99,
        intitule: 'Diall - 100 colliers de serrage nylon 4,8 x 250 mm noir',
        reference: '3663602792376',
        jour: '2026-08-28',
        asin: 'B0H6XB37CM',
      },
    ],
  },
  {
    code: 'collier-gaine-20',
    rayon: 'Fixation et consommables',
    libelle: 'Colliers à clouer Ø 20',
    precision: 'Sachet de 100 — maintien des gaines en apparent',
    unite: 'sachet',
  },
  {
    code: 'cavalier-16',
    rayon: 'Fixation et consommables',
    libelle: 'Cavaliers Ø 16',
    precision: 'Sachet de 100',
    unite: 'sachet',
  },
  {
    code: 'agrafe-icta',
    rayon: 'Fixation et consommables',
    libelle: 'Agrafes à gaine ICTA',
    precision: 'Boîte de 100 — fixation en plafond et en cloison',
    unite: 'boîte',
  },
  {
    code: 'ruban-isolant',
    rayon: 'Fixation et consommables',
    libelle: 'Ruban isolant',
    precision: 'Lot de 3 rouleaux de 10 m',
    unite: 'lot',
  },
  {
    code: 'wago-2',
    rayon: 'Fixation et consommables',
    libelle: 'Bornes de connexion automatiques',
    precision: 'Wago série 273 — lot de 100, entrées assorties',
    unite: 'lot',
    offres: [
      {
        enseigne: 'Castorama',
        prix: 19.9,
        intitule: '100 bornes automatiques Wago (série 273) 1 - 2,5 mm²',
        reference: '3662366023993',
        jour: '2026-08-28',
      },
    ],
  },
  {
    code: 'wago-3',
    rayon: 'Fixation et consommables',
    libelle: 'Bornes de connexion 3 entrées',
    precision: 'Sachet de 50, à levier',
    unite: 'sachet',
  },
  {
    code: 'wago-5',
    rayon: 'Fixation et consommables',
    libelle: 'Bornes de connexion 5 entrées',
    precision: 'Sachet de 25, à levier',
    unite: 'sachet',
  },
  {
    code: 'domino',
    rayon: 'Fixation et consommables',
    libelle: 'Barrettes de dominos',
    precision: 'Lot de 10, 10 A',
    unite: 'lot',
  },
  {
    code: 'embout-cable',
    rayon: 'Fixation et consommables',
    libelle: 'Embouts de câblage',
    precision: 'Coffret de 800, sections assorties',
    unite: 'coffret',
  },
  {
    code: 'gaine-thermo',
    rayon: 'Fixation et consommables',
    libelle: 'Gaine thermorétractable',
    precision: 'Assortiment de diamètres',
    unite: 'lot',
  },
  {
    code: 'platre-scellement',
    rayon: 'Fixation et consommables',
    libelle: 'Plâtre de scellement',
    precision: 'Sac de 25 kg — rebouchage des saignées et des boîtes',
    unite: 'sac',
  },
  {
    code: 'mousse-pu',
    rayon: 'Fixation et consommables',
    libelle: 'Mousse polyuréthane',
    precision: 'Cartouche de 500 ml',
    unite: 'u',
  },
  {
    code: 'silicone',
    rayon: 'Fixation et consommables',
    libelle: 'Mastic silicone',
    precision: 'Cartouche — étanchéité des traversées',
    unite: 'u',
  },
];

const OUTILS: ArticleMagasin[] = [
  {
    code: 'tire-fil',
    rayon: 'Outillage',
    libelle: 'Aiguille tire-fil',
    precision: '20 m, nylon — sans elle, rien ne passe',
    unite: 'u',
  },
  {
    code: 'scie-cloche-67',
    rayon: 'Outillage',
    libelle: 'Scie cloche Ø 67',
    precision: 'Le diamètre d’une boîte d’encastrement',
    unite: 'u',
  },
  {
    code: 'fraise-placo-67',
    rayon: 'Outillage',
    libelle: 'Fraise à placo Ø 67',
    precision: 'Cloison sèche — plus propre qu’une scie cloche',
    unite: 'u',
  },
  {
    code: 'foret-beton-6',
    rayon: 'Outillage',
    libelle: 'Foret béton Ø 6',
    unite: 'u',
  },
  {
    code: 'niveau-40',
    rayon: 'Outillage',
    libelle: 'Niveau 40 cm',
    precision: 'L’alignement d’une rangée de socles se voit',
    unite: 'u',
  },
  {
    code: 'pince-coupante',
    rayon: 'Outillage',
    libelle: 'Pince coupante isolée',
    precision: '1000 V',
    unite: 'u',
  },
  {
    code: 'tournevis-testeur',
    rayon: 'Outillage',
    libelle: 'Tournevis testeur',
    unite: 'u',
  },
  {
    code: 'multimetre',
    rayon: 'Outillage',
    libelle: 'Multimètre',
    precision: 'Continuité, tension, résistance',
    unite: 'u',
  },
];

const PLAFOND: ArticleMagasin[] = [
  {
    code: 'plafond-daaf',
    rayon: 'Plafond',
    libelle: 'Détecteur de fumée DAAF',
    precision: 'NF EN 14604 — obligatoire, un par niveau',
    unite: 'u',
    duMetre: true,
  },
  {
    code: 'plafond-vmc',
    rayon: 'Plafond',
    libelle: 'Bouche de VMC',
    unite: 'u',
    duMetre: true,
  },
  {
    code: 'plafond-detecteur',
    rayon: 'Plafond',
    libelle: 'Détecteur de présence',
    precision: 'Circulation, escalier, extérieur',
    unite: 'u',
    duMetre: true,
  },
  {
    code: 'plafond-camera',
    rayon: 'Plafond',
    libelle: 'Caméra',
    unite: 'u',
    duMetre: true,
  },
  {
    code: 'transfo-led',
    rayon: 'Plafond',
    libelle: 'Alimentation LED 24 V',
    precision: '60 W — ruban et spots basse tension',
    unite: 'u',
  },
  {
    code: 'ruban-led',
    rayon: 'Plafond',
    libelle: 'Ruban LED',
    precision: 'Rouleau de 5 m, 24 V',
    unite: 'rouleau',
  },
  {
    code: 'gaine-vmc-125',
    rayon: 'Plafond',
    libelle: 'Gaine VMC Ø 125',
    precision: 'Longueur de 3 m, isolée',
    unite: 'u',
  },
  {
    code: 'bouche-vmc',
    rayon: 'Plafond',
    libelle: 'Bouche d’extraction',
    precision: 'Hygroréglable',
    unite: 'u',
  },
];

/**
 * TOUT LE CATALOGUE, HORS APPAREILLAGE.
 *
 * L'appareillage n'est pas ici, et c'est voulu : il dépend de la GAMME
 * choisie — un même socle s'appelle dooxie, Céliane ou Odace, et n'a pas le
 * même prix. Il se fabrique donc à la demande, une fois la gamme connue :
 * voir `catalogueDuMagasin`.
 */
export const ARTICLES: ArticleMagasin[] = [
  ...CONDUITS,
  ...ENCASTREMENT,
  ...PLAFOND,
  ...TABLEAU,
  ...FAIBLES,
  ...FIXATION,
  ...OUTILS,
];

/** Un article du catalogue, avec son prix. */
export interface ArticleTarife extends ArticleMagasin {
  tarif: Tarif;
}

/**
 * LE CATALOGUE COMPLET POUR UNE GAMME — description ET prix.
 *
 * C'est le seul point d'entrée de la page Magasin. L'appareillage y entre
 * avec les mots de la gamme choisie (« Prise 16 A — Legrand Céliane ») : un
 * magasin qui afficherait « meca-prise » ne serait pas un magasin.
 *
 * Un article dont le catalogue de prix ne sait rien n'est pas vendu : mieux
 * vaut un rayon plus court qu'une étiquette sans chiffre.
 */
export function catalogueDuMagasin(gamme: GammeId): ArticleTarife[] {
  const out: ArticleTarife[] = [];
  for (const a of ARTICLES) {
    const tarif = TARIFS_COMMUNS[a.code];
    if (tarif) out.push({ ...a, tarif });
  }
  const g = GAMMES.find((x) => x.id === gamme);
  const marque = g ? `${g.marque} ${g.nom}` : gamme;
  for (const [kind, tarif] of Object.entries(TARIFS_MECANISME[gamme])) {
    // Un mécanisme à zéro euro n'est pas un article : c'est une place tenue
    // dans la table pour un appareil qui se chiffre ailleurs (le tableau) ou
    // qui ne se chiffre pas du tout (un luminaire).
    if (!tarif || tarif.pu <= 0) continue;
    const spec = FIXTURES[kind as FixtureKind];
    if (!spec) continue;
    out.push({
      code: `meca-${kind}`,
      rayon: 'Appareillage',
      libelle: spec.label,
      precision: `${marque} — mécanisme et enjoliveur, plaque non comprise`,
      unite: 'u',
      duMetre: true,
      tarif,
    });
  }
  // Les plaques, par nombre de postes : une plaque triple ne vaut pas trois
  // plaques simples, la matière est partagée.
  for (let n = 1; n <= 5; n++) {
    const tarif = tarifPlaque(gamme, n);
    if (!tarif || tarif.pu <= 0) continue;
    out.push({
      code: `plaque-${n}`,
      rayon: 'Appareillage',
      libelle: `Plaque ${n} poste${n > 1 ? 's' : ''}`,
      precision: marque,
      unite: 'u',
      duMetre: true,
      tarif,
    });
  }
  return out;
}

/** Un article du magasin, par son code — pour une gamme donnée. */
export function articleDuMagasin(
  code: string,
  gamme: GammeId,
): ArticleTarife | null {
  return catalogueDuMagasin(gamme).find((a) => a.code === code) ?? null;
}

/**
 * LE LIBELLÉ D'UN ARTICLE DU PLAFOND, tel que le bordereau l'écrit.
 *
 * Le magasin et le bordereau doivent dire le MÊME mot pour la même chose :
 * une ligne de devis qui s'appellerait autrement au rayon obligerait à
 * traduire de tête, et l'on rachèterait deux fois le même article.
 */
export function libelleDePlafond(k: CeilingKind): string {
  return CEILINGS[k]?.label ?? String(k);
}

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

/** Le prix d'un article dans UNE enseigne. */
export interface OffreEnseigne {
  enseigne: string;
  /** Prix TTC, au conditionnement du devis. */
  pu: number;
  /** Le jour où on l'a vu, AAAA-MM-JJ. */
  jour?: string;
  /** La page produit. */
  url?: string;
}

/**
 * L'ENSEIGNE QUI DONNE LE « PRIX PUBLIC » DE RÉFÉRENCE.
 *
 * Relevé du patron : « le devis total se fiera au prix le moins cher ; donne
 * aussi le prix total "public" sous le total, en petit ». Le total prend
 * l'enseigne la moins chère article par article ; le prix public, lui, est
 * celui de l'enseigne de référence du catalogue — là où tous les articles ont
 * été relevés, celle qu'un client trouve partout.
 */
export const ENSEIGNE_PUBLIQUE = 'Castorama';

/** Un prix, et ce qu'il faut savoir pour s'en méfier. */
export interface Tarif {
  /** Prix unitaire TTC, en euros — le MOINS CHER des enseignes relevées. */
  pu: number;
  /** Mois du relevé, AAAA-MM : ce qui dit si le prix a vieilli. */
  releve: string;
  /** D'où il sort — l'enseigne de ce prix-là. */
  source: string;
  /** Le prix de chaque enseigne où l'article a été vu, du moins cher au plus cher. */
  offres?: OffreEnseigne[];
  /** Le prix public de référence (`ENSEIGNE_PUBLIQUE`), quand il diffère. */
  public?: number;
}

/**
 * LA VERSION DU CATALOGUE.
 *
 * Elle s'affiche sur le devis. Deux devis d'un même logement à deux mois
 * d'écart ne donnent pas le même total, et c'est normal : encore faut-il
 * pouvoir le dire.
 */
export const VERSION_TARIFS = '2026-10.1';

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
 *
 * (Depuis le relevé du 10 octobre 2026, chaque prix vu l'est dans CHAQUE
 * enseigne qui vend le produit — voir `v`, plus bas.)
 */
/**
 * LE JOUR DU DERNIER PASSAGE EN RAYON — exporté, et c'était le manque.
 *
 * Relevé du patron : « le "prix non vérifiés" n'inspire pas confiance alors
 * qu'ils sont vérifiés ». Il avait raison, et la cause était plus bête que le
 * symptôme : hors ligne, le bandeau datait le catalogue avec la VERSION des
 * tarifs — « 2026-08.2 » —, une chaîne que `dateDuReleve` ne sait pas mettre
 * en français et rend telle quelle. Le jour du passage existait pourtant ici,
 * à la journée près ; personne ne le lui passait.
 */
export const RELEVE_RAYON = '2026-10-10';

/**
 * UN PRIX RELEVÉ DANS CHAQUE ENSEIGNE QUI VEND LE PRODUIT — le relevé du
 * 10 octobre 2026, page produit par page produit (`server/sources-prix.json`).
 *
 * Relevés du patron : « vérifie que tous les prix sont bien réels », puis « le
 * devis total se fiera au prix le moins cher ». Le moins cher fait le prix, et
 * dit d'où il vient ; les autres restent sur la ligne, en petit ; Castorama
 * reste le prix public de référence. Ces valeurs sont le FOND DE CARTE : le
 * relevé de chaque matin (voir `net/tarifs`) les remplace dès qu'il arrive.
 *
 * UNE SEULE DATE, celle du relevé — relevé du patron : « des prix s'affichent
 * à la date d'aujourd'hui mais d'autres restent par exemple au 28 août ».
 * Deux dates dans un catalogue embarqué, c'est une campagne laissée à moitié.
 *
 * Écrites par le relevé : ne pas les retoucher à la main.
 */
const v = (offres: [string, number][]): Tarif => {
  const triees = [...offres].sort((a, b) => a[1] - b[1]);
  const tarif: Tarif = {
    pu: triees[0][1],
    releve: RELEVE_RAYON,
    source: triees[0][0],
    offres: triees.map(([enseigne, pu]) => ({ enseigne, pu, jour: RELEVE_RAYON })),
  };
  const pub = offres.find(([e]) => e === ENSEIGNE_PUBLIQUE)?.[1];
  if (pub !== undefined && pub !== tarif.pu) tarif.public = pub;
  return tarif;
};

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
    /*
      RELEVÉ EN RAYON, PIÈCE PAR PIÈCE, le 28/08/2026 : la 2P+T blanche à
      5,50 €, le va-et-vient à 5,50 €, le poussoir à 9,69 €, la RJ45 à
      19,50 €, la TV à 12,90 €. Le catalogue posait 4,50 / 5,20 / 7,50 /
      14,90 / 8,90 — l'entrée de gamme était sous-estimée d'un bon quart,
      partout.

      LE VARIATEUR N'EST PAS RETENU, et c'est délibéré. Le rayon affiche
      74,90 € pour « variateur dooxie blanc » ; c'est plus cher que le
      variateur Céliane, ce qui n'a pas de sens pour une entrée de gamme —
      il s'agit très probablement d'un modèle connecté, et l'on n'a pas pu
      le confirmer. Un prix qu'on ne comprend pas ne se recopie pas : il
      reste estimé, et l'écran le dit.
    */
    prise: v([['Castorama', 5.5]]),
    prise20: v([['Castorama', 5.5]]),
    prise32: v([['Brico Dépôt', 6.79], ['Castorama', 8.25]]),
    inter: v([['Brico Dépôt', 4.59], ['Castorama', 5.5]]),
    volet: v([['Brico Dépôt', 23.9], ['Castorama', 25]]),
    va: v([['Brico Dépôt', 4.59], ['Castorama', 5.5]]),
    poussoir: v([['Brico Dépôt', 8.99], ['Castorama', 9.69]]),
    variateur: v([['Brico Dépôt', 71.9], ['Castorama', 74.9]]),
    rj45: v([['Brico Dépôt', 15.9], ['Castorama', 19.5]]),
    tv: v([['Brico Dépôt', 9.99], ['Castorama', 12.9]]),
    sortieCable: v([['Brico Dépôt', 5.99], ['Castorama', 7.09]]),
    thermostat: v([['Castorama', 179.9]]),
    applique: t(0),
    boite: t(2.2),
    tableau: t(0),
  },
  /*
    LES TROIS GAMMES DU MILIEU SE RECALENT ENTRE DEUX BORNES MESURÉES.

    Le rayon donne maintenant l'entrée (dooxie) et le haut (Céliane) pièce par
    pièce, et LA BORNE HAUTE A BAISSÉ : la prise Céliane était posée à 15,90 €,
    elle en vaut 10,90. Or les gammes du milieu avaient été estimées SOUS
    l'ancienne borne — la prise Odace à 10,90 €, la Mosaic à 11,90 €. Elles
    rattrapaient donc, voire dépassaient, le haut de gamme réel.

    L'ordre n'était pas encore inversé dans l'ancien catalogue (on l'a vérifié
    en le remettant : le banc passe), mais il ne tenait plus qu'à un centime,
    et il aurait basculé au premier relevé suivant. On redescend donc tout le
    milieu, et un banc garde l'ordre — c'est un garde-fou posé avant l'accident,
    pas la réparation d'un accident.

    MOSAIC N'EST PAS UNE GAMME DE GRANDE SURFACE, et le relevé l'a montré :
    Castorama n'en vend presque pas, et le peu qu'on y trouve vient de
    vendeurs tiers. C'est une gamme de distributeur professionnel — légitime
    au catalogue, elle se pose beaucoup en tertiaire —, mais ses prix
    resteront estimés tant qu'on relèvera en grande surface.
  */
  ovalis: {
    prise: v([['Brico Dépôt', 4.09], ['Castorama', 5.45]]),
    prise20: v([['Brico Dépôt', 4.09], ['Castorama', 5.45]]),
    prise32: v([['Brico Dépôt', 6.79], ['Castorama', 8.25]]),
    inter: v([['Brico Dépôt', 3.29], ['Castorama', 4.99]]),
    volet: v([['Brico Dépôt', 21.9], ['Castorama', 24.9]]),
    va: v([['Brico Dépôt', 3.29], ['Castorama', 4.99]]),
    poussoir: v([['Brico Dépôt', 6.99], ['Castorama', 8.99]]),
    variateur: v([['Castorama', 59.9], ['Brico Dépôt', 60.9]]),
    rj45: v([['Brico Dépôt', 13.9], ['Castorama', 17.5]]),
    tv: v([['Brico Dépôt', 9.99], ['Castorama', 10.9]]),
    sortieCable: v([['Brico Dépôt', 4.99], ['Castorama', 6.99]]),
    thermostat: v([['Castorama', 79.9]]),
    applique: t(0),
    boite: t(2.2),
    tableau: t(0),
  },
  odace: {
    prise: v([['Castorama', 5.19]]),
    prise20: v([['Castorama', 5.19]]),
    prise32: v([['Brico Dépôt', 6.79], ['Castorama', 8.25]]),
    inter: v([['Castorama', 5.49]]),
    volet: v([['Castorama', 22.9]]),
    va: v([['Castorama', 5.49]]),
    poussoir: v([['Castorama', 5.49]]),
    variateur: v([['Castorama', 54.9]]),
    rj45: v([['Castorama', 18.9]]),
    tv: v([['Castorama', 11.9]]),
    sortieCable: v([['Castorama', 5.99]]),
    thermostat: v([['Castorama', 79.9]]),
    applique: t(0),
    boite: t(2.2),
    tableau: t(0),
  },
  mosaic: {
    prise: v([['Brico Dépôt', 5.79], ['Castorama', 7.59]]),
    prise20: v([['Brico Dépôt', 5.79], ['Castorama', 7.59]]),
    prise32: v([['Brico Dépôt', 6.79], ['Castorama', 8.25]]),
    inter: v([['Brico Dépôt', 7.49], ['Castorama', 9.25]]),
    volet: v([['Brico Dépôt', 36.9], ['Castorama', 41.9]]),
    va: v([['Brico Dépôt', 7.49], ['Castorama', 9.25]]),
    poussoir: v([['Brico Dépôt', 12.9], ['Castorama', 13.9]]),
    variateur: v([['Brico Dépôt', 109], ['Castorama', 119.9]]),
    rj45: v([['Brico Dépôt', 16.9], ['Castorama', 19.5]]),
    tv: v([['Brico Dépôt', 11.9], ['Castorama', 13.5]]),
    sortieCable: v([['Brico Dépôt', 9.99], ['Castorama', 11.9]]),
    thermostat: v([['Castorama', 179.9]]),
    applique: t(0),
    boite: t(2.2),
    tableau: t(0),
  },
  celiane: {
    /*
      RELEVÉ EN RAYON, MÉCANISME SEUL (la plaque se compte à part, c'est le
      découpage du bordereau) : prise 10,90 €, va-et-vient 11,90 €, poussoir
      20,90 €, RJ45 25,90 €.

      LE CATALOGUE SURESTIMAIT LE HAUT DE GAMME. Il posait 15,90 € la prise
      et 31 € la RJ45 — l'écart avec l'entrée de gamme était supposé plus
      grand qu'il n'est. Deux bornes mesurées valent mieux qu'une pente
      devinée : la prise Céliane vaut deux fois la dooxie, pas trois.

      DEUX PRIX ÉCARTÉS : le variateur (43,92 €) et la TV (19,74 €) étaient
      affichés en DÉSTOCKAGE. Un prix de fin de série n'est pas un prix
      courant, et le devis d'un chantier qui commence dans trois semaines ne
      peut pas s'appuyer dessus.
    */
    prise: v([['Castorama', 10.9]]),
    prise20: v([['Castorama', 10.9]]),
    prise32: v([['Brico Dépôt', 6.79], ['Castorama', 8.25]]),
    inter: v([['Castorama', 11.9]]),
    volet: v([['Castorama', 52.9]]),
    va: v([['Castorama', 11.9]]),
    poussoir: v([['Castorama', 20.9]]),
    variateur: v([['Castorama', 92.9]]),
    rj45: v([['Castorama', 25.9]]),
    tv: v([['Castorama', 19.9]]),
    sortieCable: v([['Castorama', 20.5]]),
    thermostat: v([['Castorama', 179.9]]),
    applique: t(0),
    boite: t(2.2),
    tableau: t(0),
  },
};

/**
 * LES PLAQUES, par nombre de postes — RELEVÉES EN RAYON le 05/09/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ELLES ÉTAIENT FAUSSES, ET DE TRÈS LOIN.
 *
 * Relevé du patron, lien à l'appui : la plaque 1 poste Legrand Céliane
 * CP0021 blanc émaillé est à **2,29 €** chez Castorama ; le devis en
 * annonçait **8,50 €**. Odace : 1,99 € en rayon contre 5,50 € posés. Mosaic
 * de même. Sur un logement de quarante postes, cela faisait deux à trois
 * cents euros de devis qui n'existaient pas.
 *
 * LA CAUSE, ET ELLE SE LIT DANS LES CHIFFRES. L'ancienne ligne Céliane
 * (8,50 / 14,30 / 20,20 / 27,30) est à un cheveu du **blanc amande
 * décoratif** relevé le même jour (7,29 / 14,50 / 21,50 / 27,90). On avait
 * chiffré une finition de DÉCORATION là où un devis compte du blanc
 * standard. Le prix d'une plaque ne suit pas la gamme : il suit la
 * FINITION — la même Céliane 1 poste va de 1,84 € (blanc laqué) à 39,90 €
 * (verre opale). C'est le blanc de base qu'on chiffre, et lui seul.
 *
 * ET POURQUOI ÇA N'A PAS ÉTÉ VU. Les mécanismes portaient leur provenance
 * depuis le premier relevé ; les plaques n'étaient qu'un tableau de nombres
 * NUS — pas de date, pas d'enseigne, rien qui dise qu'on ne les avait
 * jamais vérifiées. Elles portent maintenant leur `Tarif`, comme tout le
 * reste, et un banc refuse une plaque qui coûterait plus que la moitié du
 * mécanisme qu'elle finit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA « MATIÈRE PARTAGÉE » N'EXISTE PAS, et l'ancien commentaire l'affirmait.
 *
 * Il disait : « une plaque triple ne vaut pas trois plaques simples — la
 * matière est partagée ». Le rayon dit le contraire. Céliane : 2,29 puis
 * 4,59 puis 6,99 puis 9,45 — soit 2,29 / 2,30 / 2,33 / 2,36 le poste. Le
 * prix est LINÉAIRE, et monte même très légèrement avec la taille (une
 * grande plaque casse plus au transport). La table reste, parce que ce
 * « très légèrement » se mesure ; le motif, lui, était faux, et un
 * commentaire qui donne une fausse raison est pire qu'un commentaire absent.
 *
 * LE 5 POSTES N'EST PAS VENDU EN GRANDE SURFACE : il est extrapolé au prix
 * du poste de sa gamme, et il le dit.
 */
export const TARIFS_PLAQUE: Record<GammeId, Tarif[]> = {
  // Index 0 = plaque 1 poste, index 1 = 2 postes, et ainsi de suite.
  /* Legrand Dooxie 6 009 0x, blanc. */
  dooxie: [
    v([['Brico Dépôt', 1.69], ['Castorama', 1.9]]),
    v([['Brico Dépôt', 3.19], ['Castorama', 3.9]]),
    v([['Brico Dépôt', 4.99], ['Castorama', 6.09]]),
    v([['Castorama', 7.9]]),
    t(9.9),
  ],
  /* Schneider Ovalis S3207xx, blanc. Le 4 postes n'était pas affiché au
     relevé : il suit le prix du poste des trois autres. */
  ovalis: [
    v([['Brico Dépôt', 1.19], ['Castorama', 2.15]]),
    v([['Brico Dépôt', 3.49], ['Castorama', 4.29]]),
    v([['Brico Dépôt', 5.59], ['Castorama', 6.49]]),
    v([['Castorama', 6.49]]),
    t(8.1),
  ],
  /* Schneider Odace, blanc craie — la finition de base de la gamme. */
  odace: [
    v([['Castorama', 1.99]]),
    v([['Castorama', 3.99]]),
    v([['Castorama', 5.69]]),
    v([['Castorama', 8]]),
    t(9.95),
  ],
  /*
    MOSAIC RESTE ESTIMÉE, et le relevé l'a confirmé une seconde fois :
    Castorama n'affiche qu'UN article Mosaic blanc, vendu par un tiers. C'est
    une gamme de distributeur professionnel — légitime au catalogue, elle se
    pose beaucoup en tertiaire —, mais son prix ne peut pas prétendre avoir
    été vu en rayon. Recalée sur le poste des gammes voisines.
  */
  mosaic: [
    v([['Castorama', 4.99]]),
    v([['Castorama', 12.5]]),
    v([['Castorama', 22.5]]),
    t(30),
    t(37.5),
  ],
  /* Legrand Céliane CP002x, blanc émaillé — celui du relevé du patron. */
  celiane: [
    v([['Castorama', 2.29]]),
    v([['Castorama', 4.59]]),
    v([['Castorama', 6.99]]),
    v([['Castorama', 9.45]]),
    t(11.8),
  ],
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
  'icta-16': v([['Castorama', 26.9]]),
  'icta-20': v([['Castorama', 30.9]]),
  'icta-25': v([['Castorama', 53.9]]),
  'icta-32': t(84),
  // Conducteurs rigides — la couronne de 100 m, par section.
  'fil-1.5': v([['Castorama', 27.9], ['Brico Dépôt', 27.9]]),
  'fil-2.5': v([['Brico Dépôt', 31.9], ['Castorama', 47.9]]),
  'fil-6': v([['Castorama', 18.9], ['Brico Dépôt', 18.9]]),
  'fil-10': v([['Castorama', 26.9]]),
  // Courants faibles — ce qu'on tire dans la gaine de communication.
  futp6: v([['Castorama', 79.9], ['Brico Dépôt', 82.9]]),
  coax: v([['Castorama', 44.9], ['Brico Dépôt', 45.9]]),
  // Encastrement.
  /*
    LA BOÎTE SE VEND PAR DIX, et c'est comme ça qu'on l'achète pour un
    logement : le lot Batibox cloison sèche P.40 de dix boîtes est à 20,50 €,
    soit 2,05 € l'unité (2,39 € à la pièce). Même doctrine que la couronne de
    cent mètres — on chiffre au conditionnement du chantier, pas à la pièce
    détachée. L'ancienne valeur, 1,69 €, ne correspondait à aucun des deux.
  */
  'boite-encastrement': v([['Brico Dépôt', 1.99], ['Castorama', 2.39]]),
  'boite-dcl': v([['Castorama', 11.5]]),
  'boite-derivation': v([['Castorama', 4.19]]),
  /*
    LE TABLEAU, RELEVÉ ARTICLE PAR ARTICLE LE 05/09/2026.

    Relevé du patron : « il est impossible que l'interrupteur différentiel
    était à 219 € — c'est hors norme comme prix pour ça. Les prix doivent
    absolument être exacts. » Il avait raison deux fois : les 219 € venaient
    d'un RÉSUMÉ DE RECHERCHE, qui mélangeait des produits, et le vrai prix,
    lu sur la page produit, est de 49,90 €.

    SEULE UNE PAGE PRODUIT FAIT FOI, et ce relevé l'a prouvé trois fois : une
    liste de recherche a annoncé 72,90 € pour un câble à 89,90 €, 4,90 € pour
    un peigne à 5,19 €, et 219 € pour ce différentiel. C'est exactement le
    piège qui avait fait chiffrer les plaques sur une finition décorative.

    CE QUI A BOUGÉ, ET C'EST LE TABLEAU QUI PAYAIT LE PLUS CHER :
      · différentiel type AC : 72,90 → 49,90 (−32 %)
      · différentiel type A  : 81,90 → 64,90 (−21 %)
      · disjoncteurs 10/16/20 : 10,50 → 9,99
    Un tableau de logement porte trois à quatre différentiels : le devis en
    annonçait près de quatre-vingts euros de trop, sur le seul poste que le
    client regarde en premier.

    ET DEUX ESTIMATIONS SONT DEVENUES DES RELEVÉS : le disjoncteur 2 A, très
    sous-estimé (10,50 posés, 27,90 en rayon — un petit calibre est rare, donc
    cher), et les coffrets 3 et 4 rangées.
  */
  'disj-2': v([['Castorama', 27.9], ['Brico Dépôt', 27.9]]),
  'disj-10': v([['Brico Dépôt', 8.99], ['Castorama', 9.99]]),
  'disj-16': v([['Brico Dépôt', 8.99], ['Castorama', 9.99]]),
  'disj-20': v([['Brico Dépôt', 8.99], ['Castorama', 9.99]]),
  'disj-32': v([['Castorama', 23.9], ['Brico Dépôt', 23.9]]),
  'diff-AC': v([['Castorama', 49.9], ['Brico Dépôt', 51.9]]),
  'diff-A': v([['Brico Dépôt', 59.9], ['Castorama', 64.9]]),
  'coffret-com': v([['Brico Dépôt', 91.9], ['Castorama', 99]]),
  /*
    LE COFFRET SE CHIFFRE À LA RANGÉE, ET IL EN FAUT UN.

    Il n'existait au devis que si l'on avait posé un tableau SUR UN MUR du
    plan. Or le tableau se déduit des circuits — on sait combien de modules
    il faut avant de savoir où on l'accroche —, et un devis sans coffret
    manque le poste le plus visible du tableau.
  */
  'coffret-1': v([['Brico Dépôt', 28.9], ['Castorama', 34.9]]),
  'coffret-2': v([['Brico Dépôt', 48.9], ['Castorama', 52.9]]),
  'coffret-3': v([['Brico Dépôt', 75.9], ['Castorama', 85.9]]),
  'coffret-4': v([['Brico Dépôt', 96.9], ['Castorama', 109.9]]),
  // Le peigne, qu'on oublie toujours. (Le bornier de terre, lui, est fourni
  // avec le coffret : voir `chiffrer`.)
  peigne: v([['Castorama', 5.19], ['Brico Dépôt', 5.49]]),
  // Plafond : ce qui n'est pas un luminaire.
  'plafond-daaf': v([['Castorama', 21.9]]),
  'plafond-vmc': v([['Castorama', 8.55]]),
  'plafond-detecteur': v([['Castorama', 22.9]]),
  'plafond-camera': v([['Castorama', 49.9]]),
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
  'fil-16': v([['Castorama', 36.9]]),
  'fil-25': t(65),
  // Les câbles souples, pour ce qui sort du mur : four, plaque, extérieur.
  'cable-3g1.5': v([['Castorama', 94.9], ['Brico Dépôt', 94.9]]),
  'cable-3g2.5': v([['Brico Dépôt', 139], ['Castorama', 144.9]]),
  'cable-5g2.5': v([['Brico Dépôt', 270], ['Castorama', 279.8]]),
  'cable-3g6': v([['Castorama', 359.8], ['Brico Dépôt', 378]]),
  'icta-40': t(59),
  // Les gaines de terre et de réseau, en tranchée.
  'gaine-tpc-40': v([['Castorama', 24.9]]),
  'gaine-tpc-63': v([['Castorama', 45.9]]),
  'gaine-annelee-16': v([['Castorama', 13.9]]),
  // Ce qui passe EN APPARENT, quand on ne saigne pas le mur.
  'goulotte-40': v([['Brico Dépôt', 15.9], ['Castorama', 16.5]]),
  'plinthe-passe-cable': v([['Brico Dépôt', 31], ['Castorama', 33.9]]),
  // ---------------------------------------------------------- encastrement
  'boite-encastrement-2': v([['Castorama', 6.49], ['Brico Dépôt', 6.49]]),
  'boite-encastrement-3': v([['Brico Dépôt', 8.09], ['Castorama', 8.15]]),
  'boite-maconnerie': v([['Brico Dépôt', 1.89], ['Castorama', 2.09]]),
  'boite-maconnerie-2': v([['Castorama', 5.19]]),
  'boite-etanche': v([['Brico Dépôt', 3.5], ['Castorama', 4.5]]),
  'boite-derivation-etanche': v([['Castorama', 3.59]]),
  'couvercle-derivation': v([['Castorama', 0.95]]),
  'boite-sol': v([['Castorama', 61.9]]),
  // --------------------------------------------------------------- tableau
  'disj-6': t(10.5),
  'disj-25': t(16.9),
  'disj-40': t(28.9),
  'diff-A-63': v([['Brico Dépôt', 109], ['Castorama', 109.9]]),
  'diff-AC-63': v([['Brico Dépôt', 89.9], ['Castorama', 99.9]]),
  'diff-HPI': v([['Castorama', 219.9]]),
  parafoudre: v([['Castorama', 264.9], ['Brico Dépôt', 272]]),
  'contacteur-jn': v([['Brico Dépôt', 57.9], ['Castorama', 59.9]]),
  telerupteur: v([['Brico Dépôt', 29.9], ['Castorama', 39.9]]),
  'horloge-modulaire': v([['Castorama', 229.9]]),
  delesteur: t(169),
  'bornier-terre': v([['Castorama', 13.5]]),
  'bornier-repartition': t(18.9),
  'peigne-vertical': v([['Brico Dépôt', 18.35], ['Castorama', 25.9]]),
  gtl: v([['Brico Dépôt', 125], ['Castorama', 139]]),
  'coffret-etanche': v([['Castorama', 29.9]]),
  'disj-abonne': v([['Brico Dépôt', 159], ['Castorama', 189]]),
  'sectionneur-63': t(36),
  // ------------------------------------------------------- courants faibles
  'rj45-keystone': v([['Brico Dépôt', 18.9], ['Castorama', 19.9]]),
  brassage: v([['Castorama', 5.99]]),
  dti: v([['Castorama', 30.03]]),
  'repartiteur-tv': v([['Castorama', 9.9]]),
  // ------------------------------------------------- fixation, jusqu'aux vis
  'vis-placo': v([['Castorama', 4.99]]),
  'vis-beton': v([['Castorama', 43.9]]),
  'cheville-placo': v([['Castorama', 14.9]]),
  'cheville-nylon': v([['Brico Dépôt', 5.79], ['Castorama', 7.39]]),
  'collier-colson': v([['Brico Dépôt', 9.49], ['Castorama', 9.99]]),
  'collier-gaine-20': v([['Brico Dépôt', 14.98], ['Castorama', 15.1]]),
  'cavalier-16': v([['Brico Dépôt', 14.98], ['Castorama', 15.1]]),
  'agrafe-icta': v([['Brico Dépôt', 14.98], ['Castorama', 15.1]]),
  // ------------------------------------------------------------ connexions
  'ruban-isolant': v([['Castorama', 4.07]]),
  /*
    LES BORNES WAGO 273 NE SONT PLUS VENDUES — l'article est marqué « n'est
    plus proposé à la vente ». Le prix redevient donc une ESTIMATION : un
    relevé qu'on ne peut plus refaire n'est plus un relevé, et le laisser
    passer pour tel ferait vieillir la confiance qu'on accorde à tous les
    autres. La valeur est celle du dernier lot vu (10,90 € les cinquante).
  */
  'wago-2': v([['Brico Dépôt', 18.71], ['Castorama', 19.41]]),
  'wago-3': v([['Brico Dépôt', 32.45], ['Castorama', 42.95]]),
  'wago-5': v([['Castorama', 19.45]]),
  domino: v([['Brico Dépôt', 14.9], ['Castorama', 17.5]]),
  'embout-cable': t(16),
  'gaine-thermo': v([['Brico Dépôt', 8.29], ['Castorama', 8.99]]),
  // ------------------------------------------------------- scellement, pose
  'platre-scellement': v([['Castorama', 12.5], ['Brico Dépôt', 12.5]]),
  'mousse-pu': v([['Castorama', 9.99]]),
  silicone: v([['Castorama', 3.79]]),
  // ----------------------------------------------------------------- outils
  'tire-fil': v([['Castorama', 16.5]]),
  'scie-cloche-67': v([['Brico Dépôt', 24.9], ['Castorama', 25.9]]),
  'foret-beton-6': v([['Castorama', 5.25]]),
  'fraise-placo-67': v([['Castorama', 32.9]]),
  'niveau-40': v([['Castorama', 14.9]]),
  'pince-coupante': v([['Brico Dépôt', 9.99], ['Castorama', 12.5]]),
  'tournevis-testeur': v([['Castorama', 3.25]]),
  multimetre: v([['Castorama', 24.9]]),
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
  'icta-prefilee-3g1.5': v([['Castorama', 95.9]]),
  'icta-prefilee-3g2.5': v([['Castorama', 149.9]]),
  'barrette-equipotentielle': v([['Brico Dépôt', 9.89], ['Castorama', 10.9]]),
  'collier-equipotentiel': v([['Castorama', 3.89]]),
  'rehausse-boite': t(1.9),
  /*
    L'OBTURATEUR N'EST PLUS AFFICHÉ QU'EN DÉSTOCKAGE (7,92 € le 05/09). La
    maison refuse les prix de fin de série depuis le premier relevé — le
    variateur dooxie et la prise TV Céliane ont été écartés pour la même
    raison : « le devis d'un chantier qui commence dans trois semaines ne
    peut pas s'appuyer dessus ». Le prix retombe donc au rang d'estimation,
    à la valeur du dernier relevé courant.
  */
  'obturateur': v([['Castorama', 6.09]]),
  // Protections d'un départ seul : courantes en rénovation, où l'on ajoute
  // un circuit sans refaire toute la rangée.
  'disj-diff-16': v([['Castorama', 90.9]]),
  'disj-diff-20': v([['Castorama', 94.9]]),
  // Pièces humides et non chauffées — salle d'eau, cave, balcon.
  'prise-etanche': v([['Brico Dépôt', 9.49], ['Castorama', 10.5]]),
  'inter-etanche': v([['Brico Dépôt', 9.89], ['Castorama', 9.99]]),
  // Ce qui se raccorde en dur : plaque, sèche-serviette, volet.
  'sortie-cable-32': v([['Brico Dépôt', 6.79], ['Castorama', 8.25]]),
  'inter-volet': v([['Brico Dépôt', 23.9], ['Castorama', 25]]),
  carillon: v([['Castorama', 13.9]]),
  // ------------------------------------------------------ plafond et divers
  'transfo-led': v([['Castorama', 51.9]]),
  'ruban-led': v([['Castorama', 52.99]]),
  'gaine-vmc-125': v([['Castorama', 14.95]]),
  'bouche-vmc': v([['Castorama', 69.9]]),
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
  /**
   * LE JOUR OÙ CHAQUE PRIX A ÉTÉ VU, quand il diffère du relevé.
   *
   * Le relevé du matin ne relit pas toujours toutes les pages : un article
   * qu'il n'a pas pu revoir garde le jour où on l'a vu pour la dernière fois.
   * Le dater du jour du catalogue écrirait « aujourd'hui » sur un prix qu'on
   * n'a pas vu aujourd'hui — l'antidate à l'envers.
   */
  jours?: Record<string, string>;
  /** Le code EAN du produit relevé, par clé : ce qui le désigne sans ambiguïté. */
  ean?: Record<string, string>;
  /** La page produit où le prix a été lu, par clé. */
  liens?: Record<string, string>;
  /**
   * LE PRIX DE CHAQUE ENSEIGNE, par clé — du moins cher au plus cher.
   * `prix` est alors le premier : c'est lui qui fait le total du devis.
   */
  offres?: Record<string, OffreEnseigne[]>;
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
  // Le jour de CE prix d'abord ; celui du catalogue à défaut.
  const tarif: Tarif = { pu, releve: recus!.jours?.[cle] ?? recus!.releve, source: recus!.source };
  const offres = recus!.offres?.[cle];
  if (offres && offres.length) {
    tarif.offres = offres;
    // L'enseigne du prix retenu — la moins chère — et non celle du catalogue.
    const retenue = offres.find((o) => Math.abs(o.pu - pu) < 0.005);
    if (retenue) tarif.source = retenue.enseigne;
    const pub = offres.find((o) => o.enseigne === ENSEIGNE_PUBLIQUE);
    if (pub && Math.abs(pub.pu - pu) >= 0.005) tarif.public = pub.pu;
  }
  return tarif;
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

/**
 * LE MOIS D'UNE VERSION DE TARIFS — « 2026-08.2 » → « Août 2026 ».
 *
 * Relevé du patron : « dans la page devis, "tarifs 2026-08.2" est peu
 * compréhensible. Fais "Tarifs Août 2026". »
 *
 * ET C'EST LA SECONDE FOIS QUE CETTE CHAÎNE SE MONTRE OÙ IL NE FAUT PAS. Le
 * bandeau des prix la donnait déjà pour une date — corrigé le jour même en lui
 * passant le jour du relevé. Elle restait en clair dans l'en-tête du ticket, où
 * elle a un sens pour le code et aucun pour qui lit un devis.
 *
 * LA RÉVISION NE SE PERD PAS POUR AUTANT : le rang du relevé dans le mois vit
 * dans `VERSION_TARIFS`, il voyage avec le devis, et c'est lui qui distingue
 * deux chiffrages du même août. Il ne s'AFFICHE simplement plus — ce qu'on
 * montre à un client, c'est un mois.
 *
 * LA MAJUSCULE EST DEMANDÉE, et c'est un intitulé : « Tarifs Août 2026 » se lit
 * comme un titre de colonne, pas comme une phrase. Ailleurs — dans le bandeau,
 * au fil du texte — `dateDuReleve` garde la minuscule du français.
 *
 * CE QU'ON NE SAIT PAS LIRE SE RECOPIE : une version d'un format inattendu
 * ressort telle quelle, plutôt que de devenir « Janvier 1970 ». C'est la règle
 * du prix qu'on ne comprend pas, appliquée aux dates.
 */
export function moisDeLaVersion(version: string): string {
  const m = /^(\d{4})-(\d{2})(?:\.\d+)?$/.exec(version);
  const mois = m ? MOIS[Number(m[2]) - 1] : undefined;
  if (!m || !mois) return version;
  return `${mois[0].toUpperCase()}${mois.slice(1)} ${m[1]}`;
}

/**
 * CE RELEVÉ EST-IL D'AUJOURD'HUI ?
 *
 * Relevé du patron : « si le jour de l'update est le jour même, on met "prix
 * vérifiés" avec belle couleur ». Un catalogue passé en rayon le matin même
 * n'est pas « non vérifié » — le dire fait douter du reste.
 *
 * L'HEURE SE PASSE EN PARAMÈTRE. Une fonction qui lit l'horloge du monde ne
 * se met pas sur un banc, et c'est la règle de la maison partout ailleurs
 * (voir `verifierLesTarifs`).
 *
 * UN RELEVÉ SANS JOUR — « 2026-08 », celui des prix estimés — n'est JAMAIS du
 * jour : on ne sait pas quand il a été posé, donc on n'affirme rien. C'est la
 * règle du prix qu'on ne comprend pas, appliquée aux dates.
 */
export function releveDuJour(releve: string, maintenant: number): boolean {
  const d = new Date(maintenant);
  const deuxChiffres = (n: number) => String(n).padStart(2, '0');
  const aujourdhui = `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;
  return releve === aujourdhui;
}

/**
 * Le prix d'une plaque, à n postes, dans une gamme.
 *
 * Il rend le `Tarif` DE LA TABLE, avec sa provenance : une plaque relevée en
 * rayon cite l'enseigne et le jour, une plaque estimée le dit. C'était le
 * manque — un tableau de nombres nus ne laisse à personne le moyen de savoir
 * ce qui a été vérifié.
 */
export function tarifPlaque(gamme: GammeId, postes: number): Tarif | null {
  const table = TARIFS_PLAQUE[gamme];
  return table[Math.min(Math.max(postes, 1), table.length) - 1] ?? null;
}

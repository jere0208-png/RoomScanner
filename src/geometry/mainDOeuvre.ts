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
import { ENTRAXE, FIXTURES, type Fixture, type FixtureKind } from './electrical';

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
  interGeneral: 1.1,
  videophone: 1.5,
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

/** Le poste de plus sous une plaque déjà posée : son mécanisme, sans saignée
 *  (une prise double vaut 1,2 h, une simple 1,0). */
export const POSTE_ACCOLE = 0.2;

/** Temps de pose d'un point de PLAFOND, en heures, en rénovation. */
export const TEMPS_PLAFOND: Record<CeilingKind, number> = {
  dcl: 1.0,
  spot: 0.6,
  // Un ruban : sa pose en profilé et son alimentation.
  led: 1.5,
  spotSol: 0.8,
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
  /** Les heures viennent de l'artisan, pas du barème (voir `OptionsDuDevis.heures`). */
  corrigee?: boolean;
  /**
   * SON PRIX HT, ARRONDI AU CENTIME UNE FOIS — posé par `vendreLeDevis`.
   * Le total de la pose est la somme de ces prix : le client qui additionne
   * les lignes du PDF retombe sur le total, au centime.
   */
  totalHt?: number;
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
  /*
    UNE PLAQUE, UNE SAIGNÉE — revue « Karim » : deux prises réunies sous une
    même plaque comptaient deux heures, une prise double du catalogue 1,2.
    Le poste posé à l'entraxe d'un autre (même mur, même face, même hauteur)
    partage sa saignée et son arrivée : il ne coûte que son mécanisme.
  */
  const accole = new Set<string>();
  const parMur = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    if (f.kind === 'tableau') continue;
    const cle = `${f.wallId}|${f.side}|${Math.round(f.height * 100)}`;
    parMur.set(cle, [...(parMur.get(cle) ?? []), f]);
  }
  for (const rang of parMur.values()) {
    const tries = [...rang].sort((a, b) => a.along - b.along);
    for (let i = 1; i < tries.length; i++) {
      if (Math.abs(tries[i].along - tries[i - 1].along - ENTRAXE) < 0.01) accole.add(tries[i].id);
    }
  }
  let tableau = false;
  for (const f of fixtures) {
    if (f.kind === 'tableau') {
      tableau = true;
      continue;
    }
    const temps = accole.has(f.id) ? POSTE_ACCOLE : TEMPS_MUR[f.kind] ?? 1;
    ajouter(FIXTURES[f.kind]?.family ?? 'Divers', 1, temps * k);
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

/**
 * LES PRIX PUBLICS DU CATALOGUE SONT TTC, À 20 % — revue « Karim » : les
 * fournitures s'additionnaient au prix public TTC à la main-d'œuvre taxée au
 * taux du chantier, sans un seul total hors taxes. Un devis d'artisan donne
 * le HT, la TVA et le TTC ; et en rénovation, le matériel fourni et posé
 * par l'entreprise suit la main-d'œuvre au taux réduit (CGI art. 279-0 bis).
 * (Cette cuisine-là reste dans l'app : le PDF remis au client ne parle ni
 * d'enseigne ni de prix relevé — revue « Gérard ».)
 */
export const TVA_DES_PRIX_PUBLICS = 0.2;

/**
 * LES TROIS TAUX QU'UN DEVIS D'ÉLECTRICIEN PEUT PORTER — relevé d'un
 * électricien artisan : « 20 %, 10 %, 5,5 % ». Le choix se fait par devis :
 * c'est l'artisan qui sait si son client y a droit, pas l'application.
 */
export const TAUX_DE_TVA = [0.2, 0.1, 0.055] as const;

/** « 20 % », « 5,5 % » — un taux réduit ne s'arrondit pas à « 6 % ». */
export function pourcent(t: number): string {
  const p = Math.round(t * 1000) / 10;
  return `${Number.isInteger(p) ? String(p) : String(p).replace('.', ',')} %`;
}

/**
 * LES LIGNES LIBRES — relevé d'un électricien artisan (2 salariés, sur Obat
 * et Batappli) : « Dépose ancien tableau », « Déplacement », « Consuel »,
 * « Mise en service » ne sont ni au plan ni au magasin, et c'est la moitié
 * des lignes d'un vrai devis. L'artisan les écrit lui-même, en HT.
 */
export type TypeDeLigneLibre = 'fourniture' | 'mainDOeuvre' | 'forfait';

export interface LigneLibre {
  id: string;
  designation: string;
  quantite: number;
  unite: string;
  /** Prix unitaire de vente, HORS TAXES : c'est ainsi qu'un artisan compte. */
  puHt: number;
  type: TypeDeLigneLibre;
}

/**
 * CE QUE L'ARTISAN AJOUTE AU CALCUL DU PLAN — tout est facultatif : sans
 * rien, le devis est celui d'avant (prix public ramené HT, temps du barème,
 * TVA du chantier).
 */
export interface OptionsDuDevis {
  /**
   * LE PRIX D'ACHAT HT de chaque article que son tarif pro reconnaît, par
   * code d'article (voir `prixDAchat`). Il ne sort JAMAIS de l'app.
   */
  prixAchat?: Readonly<Record<string, number>>;
  /** Le coefficient de vente de « Mon entreprise » ; vide = prix public. */
  coefficient?: number | null;
  lignesLibres?: readonly LigneLibre[];
  /** Par famille de pose : les heures que l'artisan a corrigées. */
  heures?: Readonly<Record<string, number>>;
  /** Le taux du devis, quand l'artisan l'a choisi ; sinon celui du chantier. */
  tva?: number | null;
  /** L'acompte demandé, en pour cent du TTC (30 = 30 %). */
  acompte?: number | null;
}

/** Ce qu'une ligne du plan ou du magasin se vend, hors taxes. */
export interface LigneVendue<L> {
  ligne: L;
  /** Prix unitaire de vente HT ; `null` quand le catalogue n'en a pas. */
  puHt: number | null;
  /** Ce que la ligne pèserait si on la gardait (écartée ou non). */
  brutHt: number;
  /** Ce qu'elle pèse au total : zéro si elle est écartée. */
  totalHt: number;
  /** Vendue au prix d'achat × coefficient — l'écran le dit, le PDF jamais. */
  auCoefficient: boolean;
}

export interface TotauxDuDevis {
  /** Les fournitures du plan et du magasin, plus les fournitures libres. */
  fournituresHt: number;
  /** La pose estimée (si elle compte) plus la main-d'œuvre libre. */
  poseHt: number;
  /** Les forfaits libres : déplacement, Consuel, mise en service… */
  forfaitsHt: number;
  ht: number;
  tauxTva: number;
  tva: number;
  ttc: number;
  /** L'acompte, en pour cent, et son montant TTC. */
  tauxAcompte: number;
  acompte: number;
}

/** Ce qu'une ligne du devis doit porter pour être vendue. */
interface LigneAVendre {
  code: string;
  quantite: number;
  pu: number | null;
  ecarte?: boolean;
  prixAjuste?: boolean;
}

export interface PrixDuDevis<L extends LigneAVendre = LigneAVendre> {
  /** La pose, heures corrigées comprises, à la TVA du devis. */
  pose: Pose;
  /** Chaque ligne du devis, dans son ordre, à son prix de vente HT. */
  fournitures: LigneVendue<L>[];
  /** Les lignes libres, avec leur total HT. */
  libres: (LigneLibre & { totalHt: number })[];
  totaux: TotauxDuDevis;
}

const cents = (v: number) => Math.round(v * 100) / 100;

/** Une pose vide : le PDF d'un devis sans pose chiffrée. */
export const POSE_VIDE: Pose = { lignes: [], heures: 0, taux: 0, ht: 0, tauxTva: TVA_DES_PRIX_PUBLICS, tva: 0, ttc: 0 };

/**
 * LA POSE QUI ENTRE AU TOTAL : celle qui compte au moins un quart d'heure.
 * Sans point à poser, le matériel seul reste à 20 % — le PDF le lisait
 * ainsi, l'écran et la pastille aussi désormais.
 */
export function poseComptee<P extends Pick<Pose, 'heures' | 'ht' | 'tauxTva'>>(pose: P | null | undefined): P | null {
  return pose && pose.heures > 0 ? pose : null;
}

/**
 * LE PRIX D'ACHAT DE CHAQUE ARTICLE, lu dans le tarif pro importé (voir
 * `geometry/tarifPro`). `cleDe` est la clé du tarif d'un code d'article —
 * `cleDuTarif(code, gamme)`.
 */
export function prixDAchat(
  lignes: readonly { code: string }[],
  cleDe: (code: string) => string,
  tarif: { prix: Readonly<Record<string, { pu: number }>> } | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!tarif) return out;
  for (const l of lignes) {
    const p = tarif.prix[cleDe(l.code)];
    if (p && isFinite(p.pu) && p.pu > 0) out[l.code] = p.pu;
  }
  return out;
}

/**
 * VENDRE LE DEVIS — le prix de vente de chaque ligne, puis UN total.
 *
 * PRIX DE VENTE = PRIX D'ACHAT × COEFFICIENT — relevé d'un électricien
 * artisan : « je paierais pour de vrai si… ». Le devis vendait au prix
 * public relevé, ramené HT ; son tarif pro ne servait qu'à afficher « Achat
 * pro … HT ». Un artisan, lui, vend son achat multiplié par SON coefficient.
 * Trois cas, dans cet ordre :
 *   — un prix qu'il a tapé lui-même sur la ligne gagne toujours ;
 *   — sinon, un prix d'achat ET un coefficient : achat × coefficient ;
 *   — sinon, le prix public ramené hors taxes, comme avant.
 * Chaque ligne s'arrondit au centime, puis son total = PU HT × quantité : le
 * client qui refait la multiplication du PDF retombe sur le même chiffre.
 *
 * Les lignes libres s'ajoutent selon leur type, les heures corrigées
 * remplacent celles du barème, et une seule TVA s'applique : celle choisie
 * pour le devis, à défaut celle du chantier dès qu'il y a de la
 * main-d'œuvre, à défaut 20 %.
 */
export function vendreLeDevis<L extends LigneAVendre>(
  devis: { lignes: readonly L[] },
  poseEstimee: Pose,
  options: OptionsDuDevis = {},
): PrixDuDevis<L> {
  const k = options.coefficient && isFinite(options.coefficient) && options.coefficient > 0 ? options.coefficient : null;
  const fournitures = devis.lignes.map((l): LigneVendue<L> => {
    if (l.pu === null) return { ligne: l, puHt: null, brutHt: 0, totalHt: 0, auCoefficient: false };
    const achat = options.prixAchat?.[l.code];
    const auCoefficient = !l.prixAjuste && k !== null && achat !== undefined && achat > 0;
    const puHt = cents(auCoefficient ? achat * k : l.pu / (1 + TVA_DES_PRIX_PUBLICS));
    const brutHt = cents(puHt * l.quantite);
    return { ligne: l, puHt, brutHt, totalHt: l.ecarte ? 0 : brutHt, auCoefficient };
  });

  const libres = (options.lignesLibres ?? []).map((l) => ({ ...l, totalHt: cents(l.puHt * l.quantite) }));
  const deType = (t: TypeDeLigneLibre) => libres.filter((l) => l.type === t).reduce((s, l) => s + l.totalHt, 0);

  /*
    LES HEURES DE L'ARTISAN — relevé du même électricien : les temps du
    barème étaient figés. Une famille corrigée prend ses heures à lui ; le
    reste garde l'estimation.
  */
  const corrections = options.heures ?? {};
  const lignesPose = poseEstimee.lignes.map((l) => {
    const h = corrections[l.famille];
    const ligne = h !== undefined && isFinite(h) && h >= 0 ? { ...l, heures: auQuart(h), corrigee: true } : l;
    return { ...ligne, totalHt: cents(ligne.heures * poseEstimee.taux) };
  });
  const heures = lignesPose.reduce((t, l) => t + l.heures, 0);
  /*
    LA POSE EST LA SOMME DE SES LIGNES — relecture « tableaux chiffrés » : le
    total se calculait sur la somme des heures, chaque ligne du PDF à part ;
    à 42,50 €/h, quatre lignes faisaient 85,02 € et le total 85,00 €.
  */
  const poseHtBrut = cents(lignesPose.reduce((t, l) => t + l.totalHt, 0));
  const compte = heures > 0;

  const fournituresHt = cents(fournitures.reduce((s, f) => s + f.totalHt, 0) + deType('fourniture'));
  const poseHt = cents((compte ? poseHtBrut : 0) + deType('mainDOeuvre'));
  const forfaitsHt = cents(deType('forfait'));
  const ht = cents(fournituresHt + poseHt + forfaitsHt);
  const travaux = compte || deType('mainDOeuvre') > 0 || forfaitsHt > 0;
  const choisi = TAUX_DE_TVA.find((t) => t === options.tva);
  const tauxTva = choisi ?? (travaux ? poseEstimee.tauxTva : TVA_DES_PRIX_PUBLICS);
  const tva = cents(ht * tauxTva);
  const ttc = cents(ht + tva);
  const a = options.acompte;
  const tauxAcompte = a !== null && a !== undefined && isFinite(a) ? Math.max(0, Math.min(100, a)) : 0;

  const tvaPose = cents(poseHtBrut * tauxTva);
  return {
    pose: {
      ...poseEstimee,
      lignes: lignesPose,
      heures,
      ht: poseHtBrut,
      tauxTva,
      tva: tvaPose,
      ttc: cents(poseHtBrut + tvaPose),
    },
    fournitures,
    libres,
    totaux: {
      fournituresHt,
      poseHt,
      forfaitsHt,
      ht,
      tauxTva,
      tva,
      ttc,
      tauxAcompte,
      acompte: cents((ttc * tauxAcompte) / 100),
    },
  };
}

/**
 * LE PRIX DU DEVIS, UN SEUL — revue « Gérard » : trois totaux pour un même
 * chantier. La pastille du plan annonçait le matériel seul (1,5 k€), le gros
 * TOTAL TTC de la page aussi, à 20 % ; le PDF, matériel ET pose à 10 %. Le
 * client voyait trois prix, et l'artisan ne savait plus lequel il avait dit.
 *
 * Tous lisent maintenant cette fonction : la pose estimée au taux de
 * l'artisan, puis `vendreLeDevis` — coefficient, lignes libres, heures
 * corrigées, TVA et acompte compris.
 */
export function prixDuDevis<L extends LigneAVendre>(
  devis: { lignes: readonly L[] },
  fixtures: readonly Fixture[],
  ceiling: readonly CeilingFixture[],
  reglages: { taux: number; chantier: NatureDeChantier },
  options: OptionsDuDevis = {},
): PrixDuDevis<L> {
  const pose = estimerLaPose(fixtures, ceiling, protectionsDuDevis(devis.lignes), reglages);
  return vendreLeDevis(devis, pose, options);
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

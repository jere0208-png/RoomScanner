/**
 * LES PRIX PRO — le tarif du distributeur de l'électricien, rapproché du devis.
 *
 * Relevé du patron : « trouve un moyen d'avoir aussi les prix pro Rexel,
 * Balitrand, Yesss, etc. ».
 *
 * CE QUI NE SE FAIT PAS, ET POURQUOI. Aucun distributeur ne publie ses prix :
 * Rexel répond « connectez-vous pour voir vos prix », Balitrand et Yesss
 * réservent les leurs à l'espace pro. Ce sont des prix NETS, négociés compte
 * par compte — deux électriciens n'ont pas le même. Il n'existe donc pas de
 * « prix Rexel » à aller chercher pour tout le monde ; et lire le site à la
 * place de l'électricien demanderait ses identifiants et contournerait les
 * conditions de son distributeur.
 *
 * CE QUI SE FAIT DÉJÀ DANS LE MÉTIER. Chaque distributeur laisse son client
 * EXPORTER son tarif — un fichier Excel ou CSV depuis l'espace client, ou
 * celui que le commercial envoie (souvent au format FAB-DIS). L'app l'ouvre
 * (`native/tarifPro`), en trouve les colonnes, et rapproche chaque ligne d'un
 * article du devis par son CODE EAN — le code-barres du fabricant, le même
 * chez Castorama et chez Rexel pour une même prise Legrand — ou, à défaut,
 * par la RÉFÉRENCE FABRICANT. Jamais par la désignation : deux libellés qui se
 * ressemblent ne font pas un même produit, et c'est la règle du relevé.
 *
 * Rien ne quitte le téléphone : on ne garde que les prix des articles
 * reconnus, pas le fichier.
 */

/** Une ligne utile du tarif, quelles que soient les colonnes d'origine. */
export interface LigneTarifPro {
  ean?: string;
  refFab?: string;
  refDistrib?: string;
  designation: string;
  /** Prix net HT, pour `parQuantite` unités. */
  net: number | null;
  /** Prix public HT (le tarif « brut »), quand le fichier le donne. */
  public: number | null;
  /** Le nombre d'unités auquel le prix s'applique : 1, 100 (« C »), 1000 (« M »). */
  parQuantite: number;
}

/** Ce qu'un article du catalogue donne pour se laisser reconnaître. */
export interface RefCatalogue {
  ean?: string;
  /** La référence fabricant (« 600901 », « S520059 »). */
  ref?: string;
  /**
   * Le conditionnement du devis rapporté à celui du produit : 0,1 pour un lot
   * de dix boîtes quand le devis compte à la boîte, 2 pour une couronne de
   * 50 m quand il compte en 100 m. C'est le même que celui du relevé.
   */
  facteur?: number;
}

/** Un prix pro rapproché d'un article du devis. */
export interface PrixPro {
  /** Prix d'achat HT, à l'unité du devis. */
  pu: number;
  designation: string;
  /** Ce qui l'a fait reconnaître. */
  par: 'ean' | 'ref';
}

/** Le tarif importé, tel qu'on le garde. */
export interface TarifPro {
  distributeur: string;
  fichier: string;
  /** Le jour de l'import, AAAA-MM-JJ. */
  importe: string;
  /** Lignes lues dans le fichier. */
  lues: number;
  prix: Record<string, PrixPro>;
}

/** Sans accents, en minuscules, la ponctuation en espaces : un en-tête lisible. */
export function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * UN NOMBRE FRANÇAIS — « 1 234,56 € », « 12.5 », « 0,95 HT ».
 * Ce qui ne se lit pas comme un prix rend `null`, jamais zéro.
 */
export function nombre(s: string | undefined): number | null {
  if (!s) return null;
  let t = s.replace(/[\s  €]|HT|TTC|EUR/gi, '');
  if (!t) return null;
  // « 1.234,56 » : le point sépare les milliers, la virgule les décimales.
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * LE DÉCOUPAGE D'UN CSV — séparateur deviné, guillemets respectés.
 *
 * Les exports français séparent au point-virgule (la virgule est le séparateur
 * décimal) ; certains au tabulateur, quelques-uns à la virgule. On prend celui
 * qui revient le plus dans les premières lignes, hors guillemets.
 */
export function lireCSV(texte: string): string[][] {
  const t = texte.replace(/^﻿/, '');
  const debut = t.split(/\r?\n/).slice(0, 10).join('\n').replace(/"[^"]*"/g, '');
  const compte = (c: string) => debut.split(c).length - 1;
  const sep = [';', '\t', ','].sort((a, b) => compte(b) - compte(a))[0];
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = '';
  let entre = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entre) {
      if (c === '"' && t[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') entre = false;
      else champ += c;
    } else if (c === '"') entre = true;
    else if (c === sep) {
      ligne.push(champ);
      champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else champ += c;
  }
  if (champ || ligne.length) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes.filter((l) => l.some((x) => x.trim()));
}

type Role =
  | 'ean'
  | 'refFab'
  | 'refDistrib'
  | 'designation'
  | 'net'
  | 'public'
  | 'prix'
  | 'remise'
  | 'parQuantite';

/**
 * LE RÔLE D'UNE COLONNE, d'après son en-tête — les mots des exports Rexel,
 * Sonepar (CGED), Yesss, Würth, et ceux du format FAB-DIS.
 */
export function roleDe(entete: string): Role | null {
  const e = normaliser(entete);
  if (!e) return null;
  if (/\b(ean|ean13|gtin|code barre|code barres|codebarre)\b/.test(e)) return 'ean';
  if (/\b(unite de prix|unite prix|quantite de prix|qte prix|par quantite|prix pour|base prix|up)\b/.test(e)) return 'parQuantite';
  if (/\b(ref|reference|code|article)\b/.test(e) && /\b(fab|fabricant|fournisseur|constructeur|frs|marque)\b/.test(e)) return 'refFab';
  if (/^(ref|reference|code article|ref article|reference article|code produit)\b/.test(e) || /\b(ref|reference) (rexel|sonepar|cged|yesss|distributeur|interne)\b/.test(e)) return 'refDistrib';
  if (/\b(designation|libelle|description|intitule)\b/.test(e)) return 'designation';
  // « Remise % » seule : le net se calcule sur le prix public.
  if (/\b(remise|rabais)\b/.test(e) && !/\b(prix|tarif|pu|montant)\b/.test(e)) return 'remise';
  if (/\b(public|brut|catalogue|base|tarif general|ppi|ppc)\b/.test(e) && /\b(prix|tarif|pu|montant)\b/.test(e)) return 'public';
  if (/\b(net|remise|achat|client|votre prix|vos prix|prix pro)\b/.test(e) && /\b(prix|tarif|pu|montant|net)\b/.test(e)) return 'net';
  if (/\b(prix|pu|tarif|montant)\b/.test(e)) return 'prix';
  return null;
}

/** « C » cent, « M » mille, un nombre tel quel ; tout le reste vaut 1. */
export function quantiteDePrix(s: string | undefined): number {
  const t = (s ?? '').trim().toUpperCase();
  if (t === 'C' || t === '100') return 100;
  if (t === 'M' || t === '1000') return 1000;
  const n = nombre(t);
  return n && n > 0 ? n : 1;
}

/**
 * LES LIGNES UTILES D'UN TARIF — l'en-tête trouvé, les colonnes reconnues.
 *
 * L'en-tête n'est pas toujours la première ligne (un titre, une date, le nom
 * du client au-dessus) : on prend, parmi les quinze premières, celle qui
 * reconnaît le plus de colonnes, et il en faut au moins une qui désigne le
 * produit (EAN ou référence) et une qui porte un prix.
 */
export function lireTarif(lignes: string[][]): LigneTarifPro[] | null {
  let entete = -1;
  let roles: (Role | null)[] = [];
  let meilleur = 0;
  for (let i = 0; i < Math.min(15, lignes.length); i++) {
    const r = lignes[i].map(roleDe);
    const designe = r.some((x) => x === 'ean' || x === 'refFab' || x === 'refDistrib');
    const chiffre = r.some((x) => x === 'net' || x === 'prix' || x === 'public');
    const n = r.filter(Boolean).length;
    if (designe && chiffre && n > meilleur) {
      meilleur = n;
      entete = i;
      roles = r;
    }
  }
  if (entete < 0) return null;
  const col = (role: Role) => roles.indexOf(role);
  const cNet = col('net') >= 0 ? col('net') : col('prix');
  const out: LigneTarifPro[] = [];
  for (const l of lignes.slice(entete + 1)) {
    const v = (c: number) => (c >= 0 ? (l[c] ?? '').trim() : '');
    const ean = v(col('ean')).replace(/\D/g, '');
    const ligne: LigneTarifPro = {
      designation: v(col('designation')),
      net: nombre(v(cNet)),
      public: nombre(v(col('public'))),
      parQuantite: quantiteDePrix(v(col('parQuantite'))),
    };
    // Un prix public et une remise, sans net : le net, c'est le public remisé.
    const brut = v(col('remise'));
    const remise = nombre(brut.replace('%', ''));
    if (ligne.net === null && ligne.public !== null && remise !== null && remise >= 0 && remise < 100) {
      // « 35 % », « 35 » : un pourcentage ; « 0,35 » : une fraction.
      const taux = brut.includes('%') || remise >= 1 ? remise / 100 : remise;
      ligne.net = Math.round(ligne.public * (1 - taux) * 10000) / 10000;
    }
    if (ean.length >= 8) ligne.ean = ean.padStart(13, '0');
    if (v(col('refFab'))) ligne.refFab = v(col('refFab'));
    if (v(col('refDistrib'))) ligne.refDistrib = v(col('refDistrib'));
    if ((ligne.ean || ligne.refFab || ligne.refDistrib) && (ligne.net !== null || ligne.public !== null)) {
      out.push(ligne);
    }
  }
  return out;
}

/** Une référence comparable : lettres et chiffres, sans les zéros de tête. */
export function cleDeRef(r: string): string {
  return r.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+(?=\d)/, '');
}

/**
 * LE RAPPROCHEMENT — chaque article du catalogue, cherché dans le tarif.
 *
 * Par l'EAN d'abord (le même produit, au même conditionnement : c'est le
 * code-barres de la boîte). Par la référence fabricant ensuite, exacte — ou
 * portée par la référence du distributeur, qui la préfixe souvent de la
 * marque (« LEG600901 ») ; on exige alors cinq caractères au moins, pour
 * qu'une référence courte ne se trouve pas par hasard dans une autre.
 *
 * Un article sans prix NET garde la main sur le prix public : on ne présente
 * pas un prix « brut » de catalogue comme le prix d'achat de l'électricien.
 */
export function rapprocher(
  lignes: LigneTarifPro[],
  refs: Record<string, RefCatalogue>,
): Record<string, PrixPro> {
  const parEan = new Map<string, LigneTarifPro>();
  const parRef = new Map<string, LigneTarifPro>();
  const distrib: { cle: string; l: LigneTarifPro }[] = [];
  for (const l of lignes) {
    if (l.net === null || l.net <= 0) continue;
    if (l.ean && !parEan.has(l.ean)) parEan.set(l.ean, l);
    if (l.refFab) {
      const k = cleDeRef(l.refFab);
      if (k && !parRef.has(k)) parRef.set(k, l);
    }
    if (l.refDistrib) distrib.push({ cle: cleDeRef(l.refDistrib), l });
  }
  const out: Record<string, PrixPro> = {};
  for (const [cle, r] of Object.entries(refs)) {
    const ean = r.ean ? r.ean.replace(/\D/g, '').padStart(13, '0') : '';
    let trouve: LigneTarifPro | undefined = ean ? parEan.get(ean) : undefined;
    let par: PrixPro['par'] = 'ean';
    if (!trouve && r.ref) {
      const k = cleDeRef(r.ref);
      trouve = parRef.get(k);
      if (!trouve && k.length >= 5) trouve = distrib.find((d) => d.cle.endsWith(k))?.l;
      par = 'ref';
    }
    if (!trouve || trouve.net === null) continue;
    const pu = (trouve.net / trouve.parQuantite) * (r.facteur ?? 1);
    out[cle] = { pu: Math.round(pu * 100) / 100, designation: trouve.designation, par };
  }
  return out;
}

const ENSEIGNES: [RegExp, string][] = [
  [/rexel/i, 'Rexel'],
  [/sonepar/i, 'Sonepar'],
  [/cged/i, 'CGED'],
  [/yesss/i, 'Yesss Électrique'],
  [/balitrand/i, 'Balitrand'],
  [/c[eé]d[eé]o/i, 'Cédéo'],
  [/w[uü]rth/i, 'Würth'],
  [/coaxel/i, 'Coaxel'],
  [/re[s]?eau.?pro|reseaupro/i, 'Réseau Pro'],
  [/comptoir.?electrique|cefi/i, 'Comptoir électrique'],
  [/legrand/i, 'Legrand'],
];

/** Le distributeur, d'après le nom du fichier — « Votre distributeur » sinon. */
export function distributeurDe(fichier: string): string {
  return ENSEIGNES.find(([re]) => re.test(fichier))?.[1] ?? 'Votre distributeur';
}

/** Ce que les prix pro disent d'un devis : ligne par ligne, et en tout. */
export interface AchatPro {
  /** Le prix pro de chaque article reconnu, par clé de catalogue. */
  parCle: Record<string, PrixPro>;
  /** L'achat HT des articles reconnus (et gardés au devis). */
  totalHT: number;
  /** Ce que ces mêmes articles coûtent au prix public, TTC. */
  publicTTC: number;
  /** Combien de lignes du devis ont un prix pro. */
  reconnus: number;
}

/**
 * L'ACHAT PRO D'UN DEVIS — sur les seuls articles reconnus.
 *
 * Le total ne mélange pas : un article que le tarif ne connaît pas n'est pas
 * compté à son prix public dans « l'achat pro », il n'y est pas du tout — et
 * l'écran dit sur combien d'articles porte la comparaison.
 */
export function achatPro(
  lignes: { code: string; quantite: number; total: number; ecarte?: boolean }[],
  cleDe: (code: string) => string,
  tarif: TarifPro | null,
): AchatPro | null {
  if (!tarif) return null;
  let totalHT = 0;
  let publicTTC = 0;
  let reconnus = 0;
  const parCle: Record<string, PrixPro> = {};
  for (const l of lignes) {
    const cle = cleDe(l.code);
    const p = tarif.prix[cle];
    if (!p) continue;
    parCle[cle] = p;
    if (l.ecarte || l.quantite <= 0) continue;
    totalHT += p.pu * l.quantite;
    publicTTC += l.total;
    reconnus++;
  }
  return {
    parCle,
    totalHT: Math.round(totalHT * 100) / 100,
    publicTTC: Math.round(publicTTC * 100) / 100,
    reconnus,
  };
}

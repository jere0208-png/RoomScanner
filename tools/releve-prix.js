#!/usr/bin/env node
/**
 * LE RELEVÉ DES PRIX, CHAQUE MATIN — sans personne.
 *
 * Relevé du patron : « revois le système de devis, les prix ne s'actualisent
 * pas même après un forçage, ça reste antidaté ; vérifie que tous les prix
 * sont bien réels ».
 *
 * IL AVAIT RAISON, ET LA CAUSE N'ÉTAIT PAS DANS L'APP. Le « forçage » allait
 * bien chercher le catalogue — mais le catalogue était un fichier posé À LA
 * MAIN sur le serveur, relevé le 5 septembre, et personne ne repassait en
 * rayon. Redemander un fichier qui ne change pas rend le même fichier : la
 * date du 5 septembre revenait, fidèlement. Et trois prix sur quatre étaient
 * encore des estimations.
 *
 * CE SCRIPT REPASSE EN RAYON TOUS LES MATINS (voir
 * `.github/workflows/releve-prix.yml`). Pour chaque article du catalogue,
 * `server/sources-prix.json` donne LA page produit Castorama qui le vend —
 * choisie une fois, à la main, article par article — et son code EAN. Le
 * script relit chaque page, vérifie que c'est bien le même produit (l'EAN),
 * lit le prix affiché, le ramène au conditionnement du devis (`facteur` :
 * une couronne de 50 m quand le devis compte en 100 m, un lot de 6 quand il
 * compte à la pièce), et écrit le catalogue du jour.
 *
 * LES RÈGLES, QUI SONT CELLES DU RELEVÉ À LA MAIN :
 *   — SEULE UNE PAGE PRODUIT FAIT FOI. Jamais une liste de recherche (elle a
 *     annoncé trois prix faux au relevé du 5 septembre) — et robots.txt
 *     l'interdit de toute façon. Les pages produit, elles, sont ouvertes.
 *   — LE MÊME PRODUIT OU RIEN. Une page dont l'EAN n'est plus celui qu'on
 *     attend n'est pas relue : on garde le prix d'avant, avec SA date.
 *   — UN SAUT INVRAISEMBLABLE SE SIGNALE, IL NE S'APPLIQUE PAS. Un prix qui
 *     triple ou s'effondre d'un jour à l'autre est plus souvent une page
 *     changée qu'un vrai prix : on garde l'ancien et on le dit.
 *   — CHAQUE PRIX PORTE SON JOUR (`jours`). Un article qu'on n'a pas pu relire
 *     garde le jour où on l'a vu pour la dernière fois — l'app le date à part
 *     — et au-delà d'une semaine il quitte le catalogue : l'app reprend alors
 *     son prix embarqué, daté lui aussi. On n'écrit jamais « aujourd'hui » sur
 *     un prix qu'on n'a pas vu aujourd'hui.
 *   — POLI. Une page par seconde et demie, une fois par jour : deux cents
 *     pages, c'est la visite d'un client pressé.
 *
 * Usage : node tools/releve-prix.js [--sources F] [--precedent F] [--sortie F]
 *   (deux cent quatre-vingts pages environ : quatre à sept minutes)
 *   Sort en erreur (sans rien écrire) si moins de 80 % des pages ont été lues :
 *   un relevé raté ne doit jamais remplacer un relevé réussi.
 */
const { readFile, writeFile } = require('node:fs/promises');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
    return acc;
  }, []),
);
const SOURCES = args.sources ?? 'server/sources-prix.json';
const SORTIE = args.sortie ?? 'server/tarifs.json';
const PRECEDENT = args.precedent ?? SORTIE;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const PAUSE_MS = Number(args.pause ?? 1500);
/** Au-delà d'une semaine sans relecture, un prix quitte le catalogue. */
const GARDE_JOURS = 7;
/** Un prix qui triple ou tombe au tiers d'un jour à l'autre se signale. */
const SAUT = 3;

/** Le jour à Paris, AAAA-MM-JJ : c'est le jour du lecteur du devis. */
function jourDeParis(d = new Date()) {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** L'écart en jours entre deux dates AAAA-MM-JJ. */
function joursEntre(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/**
 * Le produit d'une page Castorama, lu dans ses données structurées
 * (schema.org) : rien de ce qui s'affiche, tout ce qui se déclare.
 */
function produitDeLaPage(html) {
  const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    let d;
    try {
      d = JSON.parse(m[1]);
    } catch {
      continue;
    }
    for (const x of Array.isArray(d) ? d : [d]) {
      if (!x || x['@type'] !== 'Product' || !x.offers) continue;
      const o = Array.isArray(x.offers) ? x.offers[0] : x.offers;
      const prix = Number(o?.price);
      return {
        ean: String(x.gtin13 ?? x.sku ?? ''),
        prix: Number.isFinite(prix) && prix > 0 ? prix : null,
        dispo: String(o?.availability ?? '').split('/').pop(),
        intitule: String(x.name ?? ''),
      };
    }
  }
  return null;
}

/** Les pages d'un article : celle de l'enseigne de référence, puis les autres. */
function pagesDe(sources, s) {
  const principale = sources.enseigne ?? 'Castorama';
  const out = s.url ? [{ enseigne: principale, url: s.url }] : [];
  for (const a of s.autres ?? []) if (a.url && a.enseigne) out.push({ enseigne: a.enseigne, url: a.url });
  return out;
}

/**
 * LE CATALOGUE DU JOUR, à partir de ce qu'on a lu et de celui de la veille.
 * Pure : elle ne touche ni au réseau ni au disque — c'est elle qu'on éprouve.
 *
 * `lus[cle][enseigne]` : ce que la page de cette enseigne a donné ce matin.
 * Chaque enseigne est jugée À PART — le même produit (l'EAN), un saut
 * vraisemblable, et, faute de relecture, son prix d'hier avec son jour. Le
 * devis prend ensuite LA MOINS CHÈRE (relevé du patron : « le devis total se
 * fiera au prix le moins cher »), et garde toutes les autres pour les lister.
 */
function catalogueDuJour({ sources, lus, precedent, jour }) {
  const principale = sources.enseigne ?? 'Castorama';
  const prix = {};
  const jours = {};
  const ean = {};
  const liens = {};
  const facteurs = {};
  const offres = {};
  const echecs = [];
  const suspects = [];
  for (const [cle, s] of Object.entries(sources.articles)) {
    if (s.ean) ean[cle] = s.ean;
    if (s.url) liens[cle] = s.url;
    if ((s.facteur ?? 1) !== 1) facteurs[cle] = s.facteur;
    // Ce qu'on avait hier, enseigne par enseigne (l'ancien format n'avait que
    // l'enseigne de référence).
    const hier = {};
    for (const o of precedent?.offres?.[cle] ?? []) hier[o.enseigne] = o;
    if (!precedent?.offres && precedent?.prix?.[cle]) {
      hier[principale] = {
        enseigne: principale,
        pu: precedent.prix[cle],
        jour: precedent.jours?.[cle] ?? precedent.releve,
      };
    }
    const liste = [];
    for (const page of pagesDe(sources, s)) {
      const lu = lus[cle]?.[page.enseigne];
      const ok = lu && lu.prix && (!s.ean || lu.ean === s.ean);
      let pu = ok ? Math.round(lu.prix * (s.facteur ?? 1) * 100) / 100 : null;
      const avant = hier[page.enseigne]?.pu;
      if (pu && avant && (pu > avant * SAUT || pu < avant / SAUT)) {
        suspects.push(`${cle} (${page.enseigne}) : ${avant} → ${pu}`);
        pu = null;
      }
      if (pu) {
        liste.push({ enseigne: page.enseigne, pu, jour, url: page.url });
        continue;
      }
      if (page.enseigne === principale) echecs.push(cle);
      // On garde ce qu'on avait, avec SON jour — tant qu'il n'a pas une semaine.
      const h = hier[page.enseigne];
      if (h && h.jour && joursEntre(h.jour, jour) <= GARDE_JOURS) {
        liste.push({ enseigne: page.enseigne, pu: h.pu, jour: h.jour, url: page.url });
      }
    }
    if (!liste.length) continue;
    liste.sort((x, y) => x.pu - y.pu);
    offres[cle] = liste;
    prix[cle] = liste[0].pu;
    jours[cle] = liste[0].jour;
  }
  const [a, mo, j] = jour.split('-');
  return {
    _lisez_moi: [
      'LE CATALOGUE DES PRIX DU JOUR — écrit chaque matin par tools/releve-prix.js.',
      'Ne pas le modifier à la main : corriger plutôt server/sources-prix.json',
      '(la page produit de chaque article) ; le prochain relevé le réécrira.',
      'Tous les prix sont TTC, en euros, au conditionnement du devis.',
      '`prix` : le MOINS CHER des enseignes ; `offres` : chaque enseigne, du moins cher au plus cher.',
      '`jours` : le jour où chaque prix a été vu ; `ean`, `liens`, `facteurs` : le produit.',
    ],
    // « 2026-10.10 » : un mois que l'app sait écrire, et un rang unique par jour.
    version: `${a}-${mo}.${j}`,
    releve: jour,
    source: principale,
    prix,
    jours,
    offres,
    ean,
    liens,
    facteurs,
    echecs,
    suspects,
  };
}

async function lirePage(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return produitDeLaPage(await r.text());
}

async function principal() {
  const sources = JSON.parse(await readFile(SOURCES, 'utf8'));
  let precedent = null;
  try {
    precedent = JSON.parse(await readFile(PRECEDENT, 'utf8'));
  } catch {
    // Premier relevé : rien à garder.
  }
  const jour = jourDeParis();
  const lus = {};
  const articles = Object.entries(sources.articles).filter(([, s]) => s.url);
  let n = 0;
  for (const [cle, s] of articles) {
    lus[cle] = {};
    for (const page of pagesDe(sources, s)) {
      if (n++) await new Promise((suite) => setTimeout(suite, PAUSE_MS));
      try {
        const l = await lirePage(page.url);
        lus[cle][page.enseigne] = l;
        console.log(`${l?.prix ?? '—'}\t${l?.ean === s.ean ? '' : 'EAN ≠ '}${cle}\t${page.enseigne}`);
      } catch (e) {
        console.log(`ÉCHEC\t${cle}\t${page.enseigne}\t${e.message}`);
      }
    }
  }
  const cat = catalogueDuJour({ sources, lus, precedent, jour });
  const lues = articles.length - cat.echecs.length;
  console.log(`\n${lues}/${articles.length} pages de référence relues le ${jour}.`);
  if (cat.suspects.length) console.log(`Sauts écartés :\n  ${cat.suspects.join('\n  ')}`);
  if (articles.length === 0 || lues / articles.length < 0.8) {
    console.error('Moins de 80 % des pages relues : le catalogue de la veille reste en place.');
    process.exit(1);
  }
  await writeFile(SORTIE, `${JSON.stringify(cat, null, 2)}\n`, 'utf8');
  console.log(`Écrit : ${SORTIE}`);
}

module.exports = { jourDeParis, joursEntre, produitDeLaPage, catalogueDuJour };

if (require.main === module) {
  principal().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

/**
 * LE DEVIS — « combien j'en aurais pour mon installation actuelle ».
 *
 * Relevé du patron, 27/08/2026 : un bouton vert en haut de l'écran, une page
 * de questions étape par étape (le modèle d'appareillage voulu), et un prix
 * approximatif avec un récapitulatif détaillé et un plan qui EXPLIQUE ce
 * prix. « Un outil complet, autonome et précis sur les prix. »
 *
 * ON NE RECOMPTE RIEN. Tout le métré existe déjà et sert ailleurs : les
 * gaines et le fil viennent de `conduits.ts` (`buyingList`, qui lit le tracé
 * réel du plan), les circuits et leurs protections de `nfc15100.ts`. Le
 * devis n'ajoute qu'une chose : un prix par article. C'est volontaire — le
 * jour où le métré change, le devis change avec lui, et il ne peut pas dire
 * autre chose que le bordereau de matériel.
 *
 * CE QUI N'EST PAS COMPTÉ, ET QUI LE DIT. Les luminaires — « cela dépend des
 * envies ». Ils figurent quand même au récapitulatif, à zéro euro, avec la
 * raison : un article qu'on ne voit pas est un article qu'on croit oublié.
 *
 * ET CE QU'ON SAIT DE L'APPROXIMATION. Un article sans prix au catalogue ne
 * disparaît pas du total en silence : il remonte dans `sansPrix`, et l'écran
 * l'affiche. Un total qui se tait sur ce qu'il ignore est un total faux.
 */
import type { BuyRow } from './conduits';
import { CEILINGS, type CeilingKind } from './ceiling';
import { FIXTURES, type FixtureKind } from './electrical';
import type { Circuit, Differential } from './nfc15100';
import {
  LUMINAIRES,
  TARIFS_COMMUNS,
  TARIFS_MECANISME,
  VERSION_TARIFS,
  tarifPlaque,
  type GammeId,
  type Tarif,
} from './prix';

export interface LigneDevis {
  /** Rayon, celui du bordereau de matériel. */
  famille: string;
  code: string;
  libelle: string;
  /** Ce qui précise l'article : norme, matière, dimensions. */
  precision?: string;
  quantite: number;
  unite: string;
  /** Prix unitaire TTC. `null` quand le catalogue ne le connaît pas. */
  pu: number | null;
  /** Ce que la ligne pèse au total. Zéro quand le prix manque. */
  total: number;
  note?: string;
  /** Le mois du relevé du prix, pour savoir ce qui vieillit. */
  releve?: string;
}

/**
 * UNE VEDETTE : ce que le plan met en valeur pour expliquer le prix.
 *
 * Relevé du patron : « un plan qui explique pourquoi ce prix : affichage du
 * plan général avec une animation qui met en valeur les interrupteurs (par
 * exemple), et affiche leur nombre et le prix moyen public ». Une vedette
 * porte donc les deux moitiés de la phrase : les appareils à faire briller
 * sur le plan, et le chiffre à écrire à côté.
 */
export interface Vedette {
  id: string;
  titre: string;
  /** Combien il y en a. */
  quantite: number;
  /** Le prix moyen public de l'un d'eux, TTC. */
  pu: number;
  /** Ce que le lot pèse. */
  total: number;
  /** Les appareils muraux à mettre en valeur sur le plan. */
  murs: FixtureKind[];
  /** Ceux du plafond. */
  plafonds: CeilingKind[];
}

export interface Devis {
  gamme: GammeId;
  /** La version du catalogue employé : deux devis à deux mois ne s'égalent pas. */
  version: string;
  lignes: LigneDevis[];
  /** Total TTC des fournitures. */
  total: number;
  /** Par rayon, ce que ça pèse — le récapitulatif court. */
  parFamille: { famille: string; total: number }[];
  /** Les articles que le catalogue ne connaît pas : dits, jamais tus. */
  sansPrix: string[];
  /** Ce qui n'est volontairement pas compté, et pourquoi. */
  exclusions: string[];
  /** Ce que le plan animera, du lot le plus lourd au plus léger. */
  vedettes: Vedette[];
}

/** Les mécanismes qu'on met en valeur ensemble, et sous quel nom. */
const LOTS: { id: string; titre: string; murs: FixtureKind[] }[] = [
  { id: 'prises', titre: 'Prises de courant', murs: ['prise', 'prise20', 'prise32'] },
  {
    id: 'commandes',
    titre: 'Interrupteurs et commandes',
    murs: ['inter', 'va', 'poussoir', 'variateur'],
  },
  { id: 'faibles', titre: 'Courants faibles', murs: ['rj45', 'tv'] },
  { id: 'divers', titre: 'Sorties et appareils divers', murs: ['sortieCable', 'thermostat', 'boite'] },
];

/**
 * Le prix d'une ligne du bordereau, dans une gamme.
 *
 * Un seul endroit décide : sans quoi le total et le détail se mettraient à
 * diverger dès la première exception.
 */
function tarifDe(code: string, gamme: GammeId): Tarif | null {
  if (code.startsWith('meca-')) {
    const kind = code.slice(5) as FixtureKind;
    return TARIFS_MECANISME[gamme][kind] ?? null;
  }
  if (code.startsWith('plaque-')) {
    return tarifPlaque(gamme, Number(code.slice(7)) || 1);
  }
  return TARIFS_COMMUNS[code] ?? null;
}

/** Deux décimales, comme un ticket de caisse : on ne facture pas des millièmes. */
const centimes = (v: number) => Math.round(v * 100) / 100;

export function chiffrer(
  achats: BuyRow[],
  circuits: Circuit[],
  differentiels: Differential[],
  gamme: GammeId,
): Devis {
  const lignes: LigneDevis[] = [];
  const sansPrix: string[] = [];

  const poser = (r: Omit<LigneDevis, 'pu' | 'total' | 'releve'> & { code: string }) => {
    const tarif = tarifDe(r.code, gamme);
    if (!tarif) {
      sansPrix.push(r.libelle);
      lignes.push({ ...r, pu: null, total: 0 });
      return;
    }
    lignes.push({
      ...r,
      pu: tarif.pu,
      total: centimes(tarif.pu * r.quantite),
      releve: tarif.releve,
    });
  };

  for (const a of achats) {
    if (!a.code) {
      // Une ligne du bordereau sans article : on la montre quand même, à
      // zéro, plutôt que de la laisser tomber du récapitulatif.
      sansPrix.push(a.label);
      lignes.push({
        famille: a.family,
        code: '',
        libelle: a.label,
        precision: a.spec,
        quantite: a.quantity,
        unite: a.unit,
        pu: null,
        total: 0,
        note: a.note,
      });
      continue;
    }
    /*
      LES LUMINAIRES NE SE CHIFFRENT PAS — et le disent.

      Relevé du patron : « on mentionne que les luminaires ne sont pas
      comptés — cela dépend des envies ». Un point lumineux vaut neuf euros
      ou neuf cents ; ce qui se chiffre, c'est ce qui l'alimente. La ligne
      reste au récapitulatif, à zéro, avec sa raison écrite dessus.
    */
    if (
      a.code.startsWith('plafond-') &&
      (LUMINAIRES as string[]).includes(a.code.slice(8))
    ) {
      lignes.push({
        famille: a.family,
        code: a.code,
        libelle: a.label,
        precision: a.spec,
        quantite: a.quantity,
        unite: a.unit,
        pu: 0,
        total: 0,
        note: 'Luminaire non compté : cela dépend des envies.',
      });
      continue;
    }
    poser({
      famille: a.family,
      code: a.code,
      libelle: a.label,
      precision: a.spec,
      quantite: a.quantity,
      unite: a.unit,
      note:
        a.code === 'meca-tableau'
          ? 'Coffret de répartition. Il compte aussi pour une boîte et une plaque plus haut : environ trois euros en trop, assumés.'
          : a.note,
    });
  }

  // ------------------------------------------------------------ tableau
  /*
    LES PROTECTIONS SORTENT DES CIRCUITS, PAS D'UN FORFAIT.

    Un disjoncteur par circuit, à son calibre ; les différentiels tels que
    `planDifferentials` les a répartis ; le coffret de communication dès
    qu'il y a du courant faible. C'est la même déduction que celle du
    dossier de conformité — deux feuilles d'un même dossier ne peuvent pas
    annoncer deux tableaux différents.
  */
  const calibres = new Map<number, number>();
  for (const c of circuits) {
    if (c.breaker === null) continue;
    calibres.set(c.breaker, (calibres.get(c.breaker) ?? 0) + 1);
  }
  for (const [amp, q] of [...calibres.entries()].sort((a, b) => a[0] - b[0])) {
    poser({
      famille: 'Tableau',
      code: `disj-${amp}`,
      libelle: `Disjoncteur ${amp} A`,
      precision: 'Phase + neutre, courbe C, à vis ou automatique',
      quantite: q,
      unite: 'u',
      note: 'un par circuit',
    });
  }
  for (const type of ['A', 'AC'] as const) {
    const q = differentiels.filter((d) => d.type === type).length;
    if (q === 0) continue;
    poser({
      famille: 'Tableau',
      code: `diff-${type}`,
      libelle: `Interrupteur différentiel 40 A 30 mA type ${type}`,
      precision:
        type === 'A'
          ? 'Exigé sur la cuisson et le lave-linge'
          : 'Huit circuits au maximum derrière chacun',
      quantite: q,
      unite: 'u',
    });
  }
  if (circuits.some((c) => c.nature === 'vdi')) {
    poser({
      famille: 'Tableau',
      code: 'coffret-com',
      libelle: 'Coffret de communication',
      precision: 'Grade 2 TV, brassage RJ45',
      quantite: 1,
      unite: 'u',
    });
  }

  // ---------------------------------------------------------- les totaux
  const total = centimes(lignes.reduce((s, l) => s + l.total, 0));
  const parFamille: { famille: string; total: number }[] = [];
  for (const l of lignes) {
    const f = parFamille.find((x) => x.famille === l.famille);
    if (f) f.total = centimes(f.total + l.total);
    else parFamille.push({ famille: l.famille, total: l.total });
  }

  // --------------------------------------------------------- les vedettes
  /*
    CE QUE LE PLAN VA MONTRER.

    Une vedette ne se calcule pas à part : elle regroupe des lignes déjà
    chiffrées. Le nombre affiché sur le plan et le nombre du récapitulatif
    sont donc le MÊME nombre — c'est la seule façon qu'ils ne se
    contredisent jamais.
  */
  const vedettes: Vedette[] = [];
  for (const lot of LOTS) {
    const mien = lignes.filter((l) => lot.murs.some((k) => l.code === `meca-${k}`));
    const quantite = mien.reduce((s, l) => s + l.quantite, 0);
    if (quantite === 0) continue;
    const somme = centimes(mien.reduce((s, l) => s + l.total, 0));
    vedettes.push({
      id: lot.id,
      titre: lot.titre,
      quantite,
      pu: centimes(somme / quantite),
      total: somme,
      murs: lot.murs,
      plafonds: [],
    });
  }
  const auPlafond = lignes.filter((l) => l.code.startsWith('plafond-'));
  const nPlafond = auPlafond.reduce((s, l) => s + l.quantite, 0);
  if (nPlafond > 0) {
    const somme = centimes(auPlafond.reduce((s, l) => s + l.total, 0));
    vedettes.push({
      id: 'plafond',
      titre: 'Points de plafond',
      quantite: nPlafond,
      pu: centimes(somme / nPlafond),
      total: somme,
      murs: [],
      plafonds: auPlafond.map((l) => l.code.slice(8) as CeilingKind),
    });
  }
  vedettes.sort((a, b) => b.total - a.total);

  const exclusions = [
    'Luminaires — lampes, spots, appliques, suspensions : cela dépend des envies. Leur boîte, leur fil et leur commande, eux, sont comptés.',
    'Main-d’œuvre : ce devis chiffre la fourniture.',
    'Chutes et pertes de pose : les couronnes sont comptées entières, ce qui en tient lieu.',
  ];

  return {
    gamme,
    version: VERSION_TARIFS,
    lignes,
    total,
    parFamille,
    sansPrix,
    exclusions,
    vedettes,
  };
}

/** Le libellé d'un appareil, pour l'écran — une seule source de vérité. */
export function nomDeVedette(k: FixtureKind | CeilingKind): string {
  return (
    (FIXTURES as Partial<Record<string, { label: string }>>)[k]?.label ??
    (CEILINGS as Partial<Record<string, { label: string }>>)[k]?.label ??
    String(k)
  );
}

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
  /**
   * ÉCARTÉ DU DEVIS — présent sur le ticket, absent du total.
   *
   * Relevé du patron : « fais en sorte qu'on puisse désélectionner des
   * éléments dans le devis si on en a pas besoin par exemple, le prix doit
   * s'adapter ». Le cas est courant : on refait l'appareillage d'un logement
   * dont les gaines sont déjà en place, ou le client fournit son tableau.
   *
   * La ligne ne DISPARAÎT pas — elle reste barrée, à zéro. Un article retiré
   * qu'on ne voit plus est un article qu'on croit oublié, et c'est
   * exactement le reproche qu'on faisait déjà aux luminaires.
   */
  ecarte?: boolean;
}

/**
 * UNE LIGNE DE LÉGENDE : le symbole du plan, et ce qu'il coûte.
 *
 * Relevé du patron : « un plan qui explique pourquoi ce prix ». La première
 * version faisait défiler des lots en les entourant d'une bague verte, un à
 * la fois. Elle a été RETIRÉE — relevé du patron, sur le téléphone : « ne
 * fais pas l'animation, fais un simple listing avec les icônes en légende du
 * plan ». Il avait raison sur le fond : on ne lit pas un prix en attendant
 * son tour, et une animation qui cache quatre lignes sur cinq oblige à
 * regarder le plan trois fois pour le comprendre une.
 *
 * La légende dit donc tout en même temps, une ligne par appareil DESSINÉ sur
 * le plan : son symbole — celui-là même qu'on voit au-dessus —, son nombre,
 * le prix moyen public de l'un d'eux, et ce que le lot pèse.
 */
export interface LigneLegende {
  /** L'appareil, tel que le plan le dessine : c'est lui qui choisit le symbole. */
  kind: FixtureKind | CeilingKind;
  /** Au plafond ou au mur : les deux symboles ne sont pas dans la même table. */
  plafond: boolean;
  titre: string;
  quantite: number;
  /** Le prix moyen public de l'un d'eux, TTC. */
  pu: number;
  total: number;
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
  /** La légende du plan, du poste le plus lourd au plus léger. */
  legende: LigneLegende[];
}

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
  /*
    LE FIL SE VEND À LA SECTION, PAS À LA COULEUR.

    Le bordereau distingue les conducteurs par leur rôle — `fil-1.5-phase`,
    `fil-1.5-retour` — parce qu'on achète une couronne par couleur. Le prix,
    lui, ne bouge pas d'une couleur à l'autre : une couronne de rouge coûte
    ce que coûte une couronne de bleu. Le catalogue n'a donc qu'une entrée
    par section, et c'est ici qu'on retombe dessus.
  */
  if (code.startsWith('fil-')) {
    return (
      TARIFS_COMMUNS[code] ??
      TARIFS_COMMUNS[`fil-${code.slice(4).split('-')[0]}`] ??
      null
    );
  }
  return TARIFS_COMMUNS[code] ?? null;
}

/** Modules d'une rangée de tableau : la taille normalisée d'un coffret. */
const MODULES_PAR_RANGEE = 13;

/** Deux décimales, comme un ticket de caisse : on ne facture pas des millièmes. */
const centimes = (v: number) => Math.round(v * 100) / 100;

/**
 * La clé d'une ligne, pour la retenir d'un calcul à l'autre.
 *
 * Le code de l'article quand il en a un — il ne change pas quand on réécrit
 * un libellé. À défaut, le libellé : mieux vaut une clé fragile qu'aucune.
 */
export function cleDeLigne(l: { code: string; libelle: string }): string {
  return l.code || l.libelle;
}

export function chiffrer(
  achats: BuyRow[],
  circuits: Circuit[],
  differentiels: Differential[],
  gamme: GammeId,
  /** Les articles que l'on ne veut pas : ils restent listés, à zéro. */
  ecartes?: ReadonlySet<string>,
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
          ? 'Le coffret lui-même est compté au rayon Tableau, dimensionné aux modules.'
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
  /*
    LE COFFRET ET SES PEIGNES.

    Relevé du patron, en relisant le devis : « il manque des choses, refais
    un passage d'éléments ». Le coffret n'existait que si l'on avait posé un
    tableau SUR UN MUR du plan — or on sait combien de modules il faut bien
    avant de savoir où on l'accroche, et un devis sans coffret manque le
    poste le plus visible du tableau. Les peignes, eux, n'y étaient pas du
    tout : c'est exactement l'article qu'on oublie au comptoir et qu'on
    retourne chercher.

    UN BORNIER DE TERRE A FIGURÉ ICI, ET IL EN EST PARTI. Relevé du patron :
    « pas besoin de bornier de terre, c'est déjà dans les tableaux
    actuels ». C'est vrai de tous les coffrets du commerce depuis longtemps
    — le comptabiliser, c'était faire payer deux fois une pièce déjà dans la
    boîte. La photo qu'on lui avait trouvée était en prime un répartiteur de
    phases, ce qui aurait fait acheter la mauvaise pièce à qui se fie à
    l'image.

    On compte un module par disjoncteur, deux par différentiel, et deux de
    réserve par rangée — la règle de tout tableau qu'on veut pouvoir
    reprendre. Treize modules par rangée.
  */
  const modules =
    [...calibres.values()].reduce((t2, q) => t2 + q, 0) + differentiels.length * 2;
  if (modules > 0) {
    const rangees = Math.max(1, Math.min(4, Math.ceil((modules + 2) / MODULES_PAR_RANGEE)));
    poser({
      famille: 'Tableau',
      code: `coffret-${rangees}`,
      libelle: `Coffret de répartition ${rangees} rangée${rangees > 1 ? 's' : ''}`,
      precision: `${rangees * MODULES_PAR_RANGEE} modules, porte et rail DIN`,
      quantite: 1,
      unite: 'u',
      note: `${modules} modules occupés, réserve comprise`,
    });
    poser({
      famille: 'Tableau',
      code: 'peigne',
      libelle: 'Peigne d’alimentation',
      precision: 'Horizontal, à couper à la longueur de la rangée',
      quantite: rangees,
      unite: 'u',
      note: 'un par rangée',
    });
  }

  // ---------------------------------------------------------- les totaux
  /*
    CE QU'ON A ÉCARTÉ NE COMPTE PLUS, ET SE VOIT ENCORE.

    On marque la ligne et on met son total à zéro plutôt que de la retirer :
    le ticket la garde, barrée. Le prix unitaire, lui, reste écrit — c'est ce
    qu'on regarde pour décider si on la remet.
  */
  if (ecartes && ecartes.size > 0) {
    for (const l of lignes) {
      if (!ecartes.has(cleDeLigne(l))) continue;
      l.ecarte = true;
      l.total = 0;
    }
  }
  const total = centimes(lignes.reduce((s, l) => s + l.total, 0));
  const parFamille: { famille: string; total: number }[] = [];
  for (const l of lignes) {
    const f = parFamille.find((x) => x.famille === l.famille);
    if (f) f.total = centimes(f.total + l.total);
    else parFamille.push({ famille: l.famille, total: l.total });
  }

  // --------------------------------------------------------- la légende
  /*
    CE QUE LE PLAN MONTRE, LIGNE PAR LIGNE.

    La légende ne calcule rien : elle relit des lignes DÉJÀ chiffrées. Le
    nombre écrit à côté d'un symbole et celui du récapitulatif sont donc le
    MÊME nombre — c'est la seule façon qu'ils ne se contredisent jamais.
  */
  const legende: LigneLegende[] = lignes
    .filter(
      (l) =>
        (l.code.startsWith('meca-') || l.code.startsWith('plafond-')) &&
        l.quantite > 0 &&
        !l.ecarte,
    )
    .map((l) => {
      const plafond = l.code.startsWith('plafond-');
      return {
        kind: (plafond ? l.code.slice(8) : l.code.slice(5)) as
          | FixtureKind
          | CeilingKind,
        plafond,
        titre: l.libelle,
        quantite: l.quantite,
        pu: l.pu ?? 0,
        total: l.total,
      };
    })
    // Du plus lourd au plus léger : on explique un prix en commençant par ce
    // qui le fait.
    .sort((a, b) => b.total - a.total);

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
    legende,
  };
}

/** Le libellé d'un appareil, pour l'écran — une seule source de vérité. */
export function nomDAppareil(k: FixtureKind | CeilingKind): string {
  return (
    (FIXTURES as Partial<Record<string, { label: string }>>)[k]?.label ??
    (CEILINGS as Partial<Record<string, { label: string }>>)[k]?.label ??
    String(k)
  );
}

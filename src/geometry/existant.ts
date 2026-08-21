/**
 * LE RELEVÉ DE L'EXISTANT — le tableau qu'on trouve en arrivant.
 *
 * La moitié des chantiers d'un électricien est de la rénovation, et elle
 * commence toujours pareil : on ouvre le tableau, on regarde ce qu'il y a,
 * et on dit au client ce qu'il faut reprendre. Les applications de plan
 * dessinent du NEUF ; celle-ci sait aussi lire ce qui est déjà là.
 *
 * CE QUE CE MODULE N'EST PAS : un diagnostic réglementaire. Mesurer une
 * prise de terre, contrôler une continuité, vérifier un serrage — cela
 * demande un appareil et la main de quelqu'un. Ce qui SE VOIT dans un
 * tableau ouvert, en revanche, se dit ici : les différentiels, leur type,
 * leur nombre, ce qu'ils portent, les calibres, la place qui reste.
 *
 * TROIS DEGRÉS, et ils comptent :
 *
 *   `danger`     — ce qui expose quelqu'un aujourd'hui. Sans 30 mA, un
 *                  défaut d'isolement passe par la personne.
 *   `ecart`      — l'installation tient, mais elle n'est pas aux normes
 *                  d'aujourd'hui. C'est ce qui se chiffre dans le devis.
 *   `vigilance`  — ce qu'il faut aller voir, appareil en main.
 *
 * Tout mettre en rouge, c'est n'alerter sur rien : un électricien qui voit
 * douze lignes rouges sur un tableau correct cesse de lire la liste.
 */

/** Ce qu'on trouve sur un rail : un organe, et ce qu'il commande. */
export interface DepartExistant {
  id: string;
  organe:
    | 'disjoncteur'
    /** Interrupteur différentiel : c'est lui qui protège les personnes. */
    | 'differentiel'
    /** Porte-fusible : installation d'avant, à remplacer. */
    | 'fusible'
    | 'parafoudre'
    /** Appareil général de commande et de protection (le disjoncteur d'abonné). */
    | 'agcp'
    | 'autre';
  /** Calibre en ampères. Nul quand l'organe n'en a pas. */
  calibre: number | null;
  /** Sensibilité d'un différentiel, en milliampères (30, 300…). */
  sensibilite?: number;
  /** Type d'un différentiel : A pour les charges à composante continue. */
  typeDiff?: 'A' | 'AC' | 'F' | 'B';
  /** Ce qu'il protège, en clair : « Prises cuisine ». */
  usage?: string;
  /** Le différentiel sous lequel ce départ est raccordé. */
  sousDifferentiel?: string;
  /** Photo du tableau ou de l'étiquette, si elle a été prise. */
  photoId?: string;
}

/**
 * L'installation trouvée sur place : le contenant et ce qu'il porte.
 *
 * Les rangées ne servent qu'à juger la RÉSERVE — la place qui reste pour
 * ajouter un circuit. On ne les devine pas : sans elles, treize modules
 * occupés peuvent aussi bien remplir un tableau de treize que d'en occuper
 * le tiers, et annoncer un manque de place serait un faux constat.
 */
export interface TableauExistant {
  departs: DepartExistant[];
  /** Rangées du tableau, quand elles ont été relevées. */
  rangees?: number;
  /** Modules par rangée (13, 18…). */
  parRangee?: number;
  /** Ce qu'on note en ouvrant : marque, année, état des serrages. */
  note?: string;
}

export type GraviteConstat = 'danger' | 'ecart' | 'vigilance';

export interface ConstatExistant {
  id: string;
  gravite: GraviteConstat;
  titre: string;
  detail: string;
  /** Ce qu'il faut faire — c'est cette ligne qui devient une ligne de devis. */
  remede: string;
}

/**
 * LES CALIBRES ADMIS PAR USAGE.
 *
 * Un disjoncteur ne protège pas un appareil : il protège LE FIL. Un 20 A
 * sur du 1,5 mm² d'éclairage laisse fondre le conducteur sans jamais se
 * déclencher — c'est l'écart le plus fréquent, et le plus dangereux, dans
 * les tableaux qu'on ouvre.
 */
const CALIBRE_MAX: { motif: RegExp; max: number; quoi: string }[] = [
  { motif: /éclairage|eclairage|lumi|spot|dcl/i, max: 16, quoi: 'éclairage' },
  { motif: /volet/i, max: 16, quoi: 'volets roulants' },
  { motif: /cuisson|plaque|four/i, max: 32, quoi: 'cuisson' },
  { motif: /lave|sèche|seche|lv|ll/i, max: 20, quoi: 'appareil spécialisé' },
  { motif: /prise/i, max: 20, quoi: 'prises' },
];

/** Au-delà, le différentiel ne protège plus rien correctement. */
export const MAX_CIRCUITS_PAR_DIFF = 8;

/** La norme demande de garder de quoi ajouter : un cinquième du tableau. */
export const RESERVE_MINIMALE = 0.2;

/** Les places encore libres, rangées et modules donnés. */
export function modulesLibres(
  departs: DepartExistant[],
  rangees: number,
  parRangee: number,
): number {
  return Math.max(0, rangees * parRangee - departs.length);
}

/**
 * Reste-t-il de quoi ajouter un circuit sans changer le tableau ?
 *
 * C'est exactement la question qu'on vient poser en rénovation : ajouter
 * une salle de bains, une borne de recharge, un circuit de cuisine.
 */
export function reserveSuffisante(places: number, occupes: number): boolean {
  if (places <= 0) return false;
  return (places - occupes) / places >= RESERVE_MINIMALE;
}

/**
 * CE QU'ON PEUT DIRE D'UN TABLEAU SANS SORTIR UN APPAREIL.
 *
 * L'ordre compte : le danger d'abord, l'écart ensuite, la vérification en
 * dernier. C'est l'ordre dans lequel on en parle au client, et l'ordre dans
 * lequel les lignes tombent dans le devis.
 */
export function diagnosticExistant(
  departs: DepartExistant[],
  /** Le contenant, quand on l'a relevé : de quoi juger la réserve. */
  tableau?: { rangees: number; parRangee: number },
): ConstatExistant[] {
  const constats: ConstatExistant[] = [];
  const differentiels = departs.filter((d) => d.organe === 'differentiel');
  const trenteMA = differentiels.filter((d) => (d.sensibilite ?? 0) <= 30);
  const fusibles = departs.filter((d) => d.organe === 'fusible');

  /* ------------------------------------------------------- ce qui expose */

  if (trenteMA.length === 0) {
    constats.push({
      id: 'sans-30ma',
      gravite: 'danger',
      titre: 'Aucun différentiel 30 mA',
      detail:
        'Rien ne protège les personnes contre les contacts indirects : ' +
        'un défaut d’isolement passe par celui qui touche l’appareil.',
      remede:
        'Poser au minimum deux interrupteurs différentiels 30 mA, ' +
        'dont un de type A.',
    });
  }

  if (fusibles.length > 0) {
    constats.push({
      id: 'fusibles',
      gravite: 'danger',
      titre: `${fusibles.length} porte-fusible(s) en service`,
      detail:
        'Un porte-fusible ne coupe pas comme un disjoncteur, et son ' +
        'calibre est celui que l’occupant a bien voulu y remettre.',
      remede: 'Remplacer le tableau par un tableau à disjoncteurs.',
    });
  }

  /* --------------------------------------------------- les écarts de norme */

  if (trenteMA.length === 1) {
    constats.push({
      id: 'un-seul-diff',
      gravite: 'ecart',
      titre: 'Un seul différentiel 30 mA (deux au minimum)',
      detail:
        'Un logement en demande au moins deux : sur un seul, le moindre ' +
        'défaut coupe tout, chauffage et congélateur compris.',
      remede: 'Ajouter un second interrupteur différentiel 30 mA.',
    });
  }

  if (trenteMA.length > 0 && !trenteMA.some((d) => d.typeDiff === 'A')) {
    constats.push({
      id: 'sans-type-a',
      gravite: 'ecart',
      titre: 'Aucun différentiel de type A',
      detail:
        'Lave-linge, plaque à induction et borne de recharge produisent ' +
        'des défauts à composante continue, qu’un type AC ne voit pas.',
      remede:
        'Remplacer un différentiel par un 30 mA type A et y raccorder ces ' +
        'circuits.',
    });
  }

  for (const d of trenteMA) {
    const portes = departs.filter((x) => x.sousDifferentiel === d.id);
    if (portes.length > MAX_CIRCUITS_PAR_DIFF) {
      constats.push({
        id: `charge-${d.id}`,
        gravite: 'ecart',
        titre: `${portes.length} circuits sous un même différentiel (huit au plus)`,
        detail:
          'Trop de circuits sous un même différentiel : les fuites de ' +
          'chacun s’additionnent et le font déclencher sans défaut réel.',
        remede: 'Répartir les circuits sur un différentiel supplémentaire.',
      });
    }
  }

  for (const d of departs) {
    if (d.organe !== 'disjoncteur' || !d.calibre) continue;
    const regle = CALIBRE_MAX.find((r) => r.motif.test(d.usage ?? ''));
    if (regle && d.calibre > regle.max) {
      constats.push({
        id: `calibre-${d.id}`,
        gravite: 'ecart',
        titre: `Calibre ${d.calibre} A sur « ${d.usage} »`,
        detail:
          `Un circuit ${regle.quoi} se protège à ${regle.max} A au plus : ` +
          'au-delà, c’est le conducteur qui fond avant que le disjoncteur ' +
          'ne s’en aperçoive.',
        remede: `Remplacer par un disjoncteur ${regle.max} A, ou reprendre la section.`,
      });
    }
  }

  if (tableau) {
    const places = tableau.rangees * tableau.parRangee;
    if (!reserveSuffisante(places, departs.length)) {
      constats.push({
        id: 'reserve',
        gravite: 'ecart',
        titre: 'Pas de réserve dans le tableau',
        detail:
          `${modulesLibres(departs, tableau.rangees, tableau.parRangee)} ` +
          `module(s) libre(s) sur ${places} : la norme demande d’en garder ` +
          'un cinquième pour les ajouts.',
        remede: 'Prévoir une rangée supplémentaire ou un tableau plus grand.',
      });
    }
  }

  /* ------------------------------------------- ce qu'il faut aller vérifier */

  constats.push({
    id: 'terre',
    gravite: 'vigilance',
    titre: 'Prise de terre et liaison équipotentielle à vérifier',
    detail:
      'Une valeur de terre ne se lit pas sur un plan : elle se mesure sur ' +
      'place, comme la liaison équipotentielle de la salle de bains.',
    remede: 'Mesurer la terre au contrôleur et vérifier les liaisons.',
  });

  return constats;
}

/** Le compte par gravité — ce qu'on montre sur la pastille de l'écran. */
export function bilanExistant(constats: ConstatExistant[]) {
  return {
    dangers: constats.filter((c) => c.gravite === 'danger').length,
    ecarts: constats.filter((c) => c.gravite === 'ecart').length,
    vigilances: constats.filter((c) => c.gravite === 'vigilance').length,
  };
}

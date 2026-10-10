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
 *
 * LE TABLEAU EST UN OBJET, PAS UNE LISTE — relevé du patron : « le tableau
 * placé sur le plan doit visuellement correspondre au tableau existant, et
 * les deux systèmes doivent être liés : si on a un disjoncteur, alors un
 * seul doit s'afficher sur le tableau, avec les normes qui feront blocage,
 * comme deux rangées minimum ». Chaque organe a donc sa PLACE : une rangée,
 * une position sur le rail, une largeur en modules (`implanter`). C'est de
 * là que se lisent la place qui reste, le différentiel qui protège chaque
 * disjoncteur (celui qui le précède sur le rail, comme le peigne le câble),
 * et le dessin du tableau sur le plan, en élévation et en 3D (`railDuReleve`).
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
    /** Contacteur jour/nuit du chauffe-eau. */
    | 'contacteur'
    /** Télérupteur d'un éclairage commandé de plusieurs endroits. */
    | 'telerupteur'
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
  /**
   * La rangée où il est clipsé — 0 en haut. Absente sur un relevé d'avant
   * le tableau dessiné : on range alors les organes dans l'ordre, rangée
   * après rangée, comme on les avait notés.
   */
  rangee?: number;
}

export type Organe = DepartExistant['organe'];

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
  /**
   * BLOQUANT : ce que le contrôle de conformité refusera. Tout danger et
   * tout écart à la norme le sont ; ce qu'on doit seulement aller vérifier
   * ne l'est pas.
   */
  bloquant: boolean;
  /** Les organes en cause — ceux que le tableau dessiné montre du doigt. */
  cibles: string[];
}

/* ====================================================================== */
/*  LE RAIL : chaque organe à sa place                                    */
/* ====================================================================== */

/**
 * CE QU'UN ORGANE OCCUPE SUR LE RAIL, en modules de 17,5 mm.
 *
 * Un interrupteur différentiel en prend deux, comme le disjoncteur d'abonné
 * et le parafoudre ; un disjoncteur divisionnaire, un porte-fusible, un
 * contacteur ou un télérupteur, un seul. C'est ce compte qui dit si un
 * tableau est plein — pas le nombre de lignes du relevé.
 */
export const LARGEUR_ORGANE: Record<Organe, number> = {
  differentiel: 2,
  agcp: 2,
  parafoudre: 2,
  disjoncteur: 1,
  fusible: 1,
  contacteur: 1,
  telerupteur: 1,
  autre: 1,
};

export const largeurDe = (d: { organe: Organe }): number => LARGEUR_ORGANE[d.organe] ?? 1;

/**
 * DEUX RANGÉES AU MINIMUM — relevé du patron : « les normes qui feront
 * blocage, comme deux rangées minimum ». Un coffret d'une rangée ne laisse
 * ni la place des deux différentiels et de leurs départs, ni celle de la
 * réserve : c'est un point bloquant du contrôle, et le tableau dessiné en
 * montre toujours deux tant qu'on n'a pas relevé le contraire.
 */
export const RANGEES_MIN = 2;
/** Le coffret de logement le plus courant : treize modules par rangée. */
export const PAR_RANGEE_DEFAUT = 13;

/** Un organe à sa place : sa rangée, son premier module, sa largeur. */
export interface ModuleImplante {
  depart: DepartExistant;
  rangee: number;
  debut: number;
  largeur: number;
}

export interface Implantation {
  rangees: number;
  parRangee: number;
  /** Les rangées ont-elles été relevées, ou est-ce le minimum supposé ? */
  decrit: boolean;
  modules: ModuleImplante[];
  /** Ce qui ne tient plus sur le rail (une rangée retirée sous des organes). */
  horsRail: DepartExistant[];
  /** Les places libres de chaque rangée, à droite des organes. */
  libres: number[];
  places: number;
  occupees: number;
  /** Les places à garder libres : un cinquième du tableau, arrondi au-dessus. */
  reserve: number;
}

/** Combien de rangées il faut pour tout clipser dans l'ordre noté. */
function rangeesPourTout(departs: DepartExistant[], parRangee: number): number {
  let rangee = 0;
  let rempli = 0;
  for (const d of departs) {
    const l = Math.min(largeurDe(d), parRangee);
    if (rempli + l > parRangee) {
      rangee += 1;
      rempli = 0;
    }
    rempli += l;
  }
  return departs.length === 0 ? 1 : rangee + 1;
}

/**
 * LE TABLEAU, ORGANE PAR ORGANE, À SA PLACE.
 *
 * Un organe qui porte sa rangée y va, à la suite de ceux qui y sont déjà ;
 * un organe d'un relevé plus ancien, sans rangée, prend la première place
 * libre en lisant le tableau de haut en bas. Ce qui ne tient pas sur le rail
 * n'est jamais perdu : il est rendu à part (`horsRail`), pour qu'on le voie
 * et qu'on le reclipse.
 */
export function implanter(t: {
  departs: DepartExistant[];
  rangees?: number;
  parRangee?: number;
}): Implantation {
  const parRangee = t.parRangee && t.parRangee > 0 ? t.parRangee : PAR_RANGEE_DEFAUT;
  const decrit = !!(t.rangees && t.rangees > 0);
  const rangees = decrit
    ? (t.rangees as number)
    : Math.max(
        RANGEES_MIN,
        rangeesPourTout(t.departs, parRangee),
        ...t.departs.map((d) => (typeof d.rangee === 'number' ? d.rangee + 1 : 0)),
      );
  const rempli = new Array<number>(rangees).fill(0);
  const modules: ModuleImplante[] = [];
  const horsRail: DepartExistant[] = [];
  let curseur = 0;
  for (const d of t.departs) {
    const l = largeurDe(d);
    let r: number | null = null;
    if (typeof d.rangee === 'number' && d.rangee >= 0) {
      r = d.rangee < rangees && rempli[d.rangee] + l <= parRangee ? d.rangee : null;
    } else {
      while (curseur < rangees && rempli[curseur] + l > parRangee) curseur += 1;
      r = curseur < rangees ? curseur : null;
    }
    if (r === null) {
      horsRail.push(d);
      continue;
    }
    modules.push({ depart: d, rangee: r, debut: rempli[r], largeur: l });
    rempli[r] += l;
  }
  const places = rangees * parRangee;
  const occupees = rempli.reduce((s, x) => s + x, 0);
  return {
    rangees,
    parRangee,
    decrit,
    modules,
    horsRail,
    libres: rempli.map((x) => parRangee - x),
    places,
    occupees,
    reserve: Math.ceil(places * RESERVE_MINIMALE),
  };
}

/** Les organes qu'un différentiel peut avoir sous lui. */
const PROTEGEABLE = new Set<Organe>(['disjoncteur', 'fusible', 'contacteur', 'telerupteur', 'autre']);

/**
 * CHAQUE DÉPART SOUS SON DIFFÉRENTIEL — celui qui le précède sur le rail.
 *
 * C'est la règle du câblage en peigne : un interrupteur différentiel en tête,
 * ses disjoncteurs à sa droite ; une rangée qui commence par des
 * disjoncteurs les tient du dernier différentiel de la rangée d'au-dessus.
 * On ne demande donc plus « sous quel différentiel ? » : on le lit sur le
 * tableau, comme on le lirait sur place. Ce qui précède tout différentiel
 * n'est protégé par aucun.
 */
export function rattacher(departs: DepartExistant[], impl: Implantation): DepartExistant[] {
  const parId = new Map<string, string | undefined>();
  const ordre = [...impl.modules].sort((a, b) => a.rangee - b.rangee || a.debut - b.debut);
  let courant: string | undefined;
  for (const m of ordre) {
    if (m.depart.organe === 'differentiel') {
      courant = m.depart.id;
      parId.set(m.depart.id, undefined);
    } else if (PROTEGEABLE.has(m.depart.organe)) {
      parId.set(m.depart.id, courant);
    } else {
      parId.set(m.depart.id, undefined);
    }
  }
  return departs.map((d) => {
    if (!parId.has(d.id)) return d;
    const sous = parId.get(d.id);
    if (d.sousDifferentiel === sous) return d;
    if (sous) return { ...d, sousDifferentiel: sous };
    const reste = { ...d };
    delete reste.sousDifferentiel;
    return reste;
  });
}

/** Le genre d'un organe, tel que le dessin du tableau le connaît. */
export type GenreDeModule = 'differentiel' | 'disjoncteur' | 'fusible' | 'parafoudre' | 'agcp' | 'autre';

/**
 * LE RAIL DU TABLEAU, POUR LE DESSINER — en élévation, en 3D, partout où le
 * tableau posé sur le plan se montre. Un organe relevé, un organe dessiné :
 * ni plus, ni moins.
 */
export interface RailDuTableau {
  rangees: number;
  parRangee: number;
  modules: { rangee: number; debut: number; largeur: number; genre: GenreDeModule }[];
}

export function railDuReleve(t: TableauExistant | null | undefined): RailDuTableau | null {
  if (!t || (t.departs.length === 0 && !t.rangees)) return null;
  const impl = implanter(t);
  const genre = (o: Organe): GenreDeModule =>
    o === 'differentiel' || o === 'disjoncteur' || o === 'fusible' || o === 'parafoudre' || o === 'agcp'
      ? o
      : 'autre';
  return {
    rangees: impl.rangees,
    parRangee: impl.parRangee,
    modules: impl.modules.map((m) => ({
      rangee: m.rangee,
      debut: m.debut,
      largeur: m.largeur,
      genre: genre(m.depart.organe),
    })),
  };
}

/** Un module DIN : 17,5 mm. */
export const MODULE_M = 0.0175;

/**
 * LES COTES DU COFFRET, À PARTIR DE SON RAIL — 17,5 mm par module, 12,5 cm
 * par rangée, et le cadre autour. Un tableau de deux rangées de treize fait
 * une trentaine de centimètres sur trente-quatre : c'est ce qu'on dessine,
 * et non plus un coffret de 55 × 65 cm quel que soit ce qu'il contient.
 */
export function dimensionsDuCoffret(rail: { rangees: number; parRangee: number }): {
  largeur: number;
  hauteur: number;
} {
  return {
    largeur: rail.parRangee * MODULE_M + 0.1,
    hauteur: rail.rangees * 0.125 + 0.09,
  };
}

/* ====================================================================== */
/*  LE DIAGNOSTIC                                                         */
/* ====================================================================== */

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

/** Le calibre le plus fort qu'admet un usage — `null` s'il n'est pas noté. */
export function calibreMaxDe(usage: string | undefined): number | null {
  const regle = CALIBRE_MAX.find((r) => r.motif.test(usage ?? ''));
  return regle ? regle.max : null;
}

/** Au-delà, le différentiel ne protège plus rien correctement. */
export const MAX_CIRCUITS_PAR_DIFF = 8;

/** La norme demande de garder de quoi ajouter : un cinquième du tableau. */
export const RESERVE_MINIMALE = 0.2;

/**
 * Les places encore libres, rangées et modules donnés — en modules : un
 * différentiel en prend deux, et le compter pour un annonçait de la place
 * qui n'existait pas.
 */
export function modulesLibres(
  departs: DepartExistant[],
  rangees: number,
  parRangee: number,
): number {
  return Math.max(0, rangees * parRangee - departs.reduce((s, d) => s + largeurDe(d), 0));
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

/** Un différentiel qui protège les personnes : 30 mA au plus. */
const protegeLesPersonnes = (d: DepartExistant) =>
  d.organe === 'differentiel' && (d.sensibilite ?? 0) <= 30;

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
  const dire = (c: Omit<ConstatExistant, 'bloquant' | 'cibles'> & { cibles?: string[] }) =>
    constats.push({ ...c, bloquant: c.gravite !== 'vigilance', cibles: c.cibles ?? [] });
  const differentiels = departs.filter((d) => d.organe === 'differentiel');
  const trenteMA = differentiels.filter(protegeLesPersonnes);
  const fusibles = departs.filter((d) => d.organe === 'fusible');

  /* ------------------------------------------------------- ce qui expose */

  if (trenteMA.length === 0) {
    dire({
      id: 'sans-30ma',
      gravite: 'danger',
      titre: 'Aucun différentiel 30 mA',
      detail:
        'Rien ne protège les personnes contre les contacts indirects : ' +
        'un défaut d’isolement passe par celui qui touche l’appareil.',
      remede:
        'Poser au minimum deux interrupteurs différentiels 30 mA, ' +
        'dont un de type A.',
      cibles: differentiels.map((d) => d.id),
    });
  }

  if (fusibles.length > 0) {
    dire({
      id: 'fusibles',
      gravite: 'danger',
      titre: `${fusibles.length} porte-fusible(s) en service`,
      detail:
        'Un porte-fusible ne coupe pas comme un disjoncteur, et son ' +
        'calibre est celui que l’occupant a bien voulu y remettre.',
      remede: 'Remplacer le tableau par un tableau à disjoncteurs.',
      cibles: fusibles.map((d) => d.id),
    });
  }

  /*
    DES CIRCUITS AVANT TOUT DIFFÉRENTIEL. Le tableau en a un, deux — mais ce
    qui est clipsé avant eux, ou sous un 300 mA, n'est protégé par aucun
    30 mA : pour la personne qui touche, c'est comme s'il n'y en avait pas.
  */
  if (trenteMA.length > 0) {
    const nus = departs.filter(
      (d) =>
        (d.organe === 'disjoncteur' || d.organe === 'fusible') &&
        !trenteMA.some((x) => x.id === d.sousDifferentiel),
    );
    if (nus.length > 0) {
      dire({
        id: 'hors-30ma',
        gravite: 'danger',
        titre: `${nus.length} circuit(s) sans 30 mA en amont`,
        detail:
          'Ces départs ne sont derrière aucun différentiel 30 mA : un défaut ' +
          'sur leurs circuits passe par la personne.',
        remede: 'Les raccorder sous un interrupteur différentiel 30 mA.',
        cibles: nus.map((d) => d.id),
      });
    }
  }

  /* --------------------------------------------------- les écarts de norme */

  if (trenteMA.length === 1) {
    dire({
      id: 'un-seul-diff',
      gravite: 'ecart',
      titre: 'Un seul différentiel 30 mA (deux au minimum)',
      detail:
        'Un logement en demande au moins deux : sur un seul, le moindre ' +
        'défaut coupe tout, chauffage et congélateur compris.',
      remede: 'Ajouter un second interrupteur différentiel 30 mA.',
      cibles: trenteMA.map((d) => d.id),
    });
  }

  // Un type F fait tout ce que fait un type A, et davantage.
  if (trenteMA.length > 0 && !trenteMA.some((d) => d.typeDiff === 'A' || d.typeDiff === 'F')) {
    dire({
      id: 'sans-type-a',
      gravite: 'ecart',
      titre: 'Aucun différentiel de type A',
      detail:
        'Lave-linge, plaque à induction et borne de recharge produisent ' +
        'des défauts à composante continue, qu’un type AC ne voit pas.',
      remede:
        'Remplacer un différentiel par un 30 mA type A et y raccorder ces ' +
        'circuits.',
      cibles: trenteMA.map((d) => d.id),
    });
  }

  for (const d of trenteMA) {
    const portes = departs.filter((x) => x.sousDifferentiel === d.id);
    if (portes.length > MAX_CIRCUITS_PAR_DIFF) {
      dire({
        id: `charge-${d.id}`,
        gravite: 'ecart',
        titre: `${portes.length} circuits sous un même différentiel (huit au plus)`,
        detail:
          'Trop de circuits sous un même différentiel : les fuites de ' +
          'chacun s’additionnent et le font déclencher sans défaut réel.',
        remede: 'Répartir les circuits sur un différentiel supplémentaire.',
        cibles: [d.id],
      });
    }
  }

  for (const d of departs) {
    if (d.organe !== 'disjoncteur' || !d.calibre) continue;
    const regle = CALIBRE_MAX.find((r) => r.motif.test(d.usage ?? ''));
    if (regle && d.calibre > regle.max) {
      dire({
        id: `calibre-${d.id}`,
        gravite: 'ecart',
        titre: `Calibre ${d.calibre} A sur « ${d.usage} »`,
        detail:
          `Un circuit ${regle.quoi} se protège à ${regle.max} A au plus : ` +
          'au-delà, c’est le conducteur qui fond avant que le disjoncteur ' +
          'ne s’en aperçoive.',
        remede: `Remplacer par un disjoncteur ${regle.max} A, ou reprendre la section.`,
        cibles: [d.id],
      });
    }
  }

  if (tableau) {
    if (tableau.rangees < RANGEES_MIN) {
      dire({
        id: 'une-rangee',
        gravite: 'ecart',
        titre: `Une seule rangée (deux au minimum)`,
        detail:
          'Un coffret d’une rangée ne loge ni deux différentiels et leurs ' +
          'départs, ni la réserve que la norme demande.',
        remede: 'Remplacer par un tableau de deux rangées au moins.',
      });
    }
    const places = tableau.rangees * tableau.parRangee;
    const occupes = departs.reduce((s, d) => s + largeurDe(d), 0);
    if (!reserveSuffisante(places, occupes)) {
      dire({
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

  dire({
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
    bloquants: constats.filter((c) => c.bloquant).length,
  };
}

/**
 * LE CONTRÔLE, RÈGLE PAR RÈGLE — ce qu'on coche en refermant le tableau.
 *
 * Une liste de constats dit ce qui ne va pas ; elle ne dit pas ce qui VA.
 * La grille, si : chaque règle de la norme qu'on sait juger sur un tableau
 * ouvert, cochée ou bloquée. On voit le tableau passer au vert à mesure
 * qu'on le décrit — et ce qu'il reste pour y arriver.
 */
export interface RegleDuTableau {
  id: string;
  titre: string;
  /** `null` : on ne peut pas encore la juger (rien de relevé qui la concerne). */
  ok: boolean | null;
}

export function grilleDuTableau(
  departs: DepartExistant[],
  constats: ConstatExistant[],
  decrit: boolean,
): RegleDuTableau[] {
  const a = (prefixe: string) => constats.some((c) => c.id === prefixe || c.id.startsWith(`${prefixe}-`));
  const vide = departs.length === 0;
  const juger = (echec: boolean): boolean | null => (vide ? null : !echec);
  return [
    { id: 'trente', titre: 'Un différentiel 30 mA protège les personnes', ok: juger(a('sans-30ma')) },
    { id: 'deux', titre: 'Deux différentiels 30 mA au moins', ok: juger(a('sans-30ma') || a('un-seul-diff')) },
    { id: 'type-a', titre: 'Un différentiel de type A', ok: juger(a('sans-30ma') || a('sans-type-a')) },
    { id: 'proteges', titre: 'Chaque circuit sous un 30 mA', ok: juger(a('sans-30ma') || a('hors-30ma')) },
    { id: 'huit', titre: 'Huit circuits au plus par différentiel', ok: juger(a('charge')) },
    { id: 'calibres', titre: 'Des calibres faits pour leurs fils', ok: juger(a('calibre')) },
    { id: 'fusibles', titre: 'Aucun porte-fusible', ok: juger(a('fusibles')) },
    { id: 'rangees', titre: 'Deux rangées au minimum', ok: decrit ? !a('une-rangee') : null },
    { id: 'reserve', titre: 'Un cinquième de réserve', ok: decrit && !vide ? !a('reserve') : null },
  ];
}

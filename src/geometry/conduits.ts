/**
 * Gaines, sections, et ce qu'il faut commander.
 *
 * Écrit du point de vue de celui qui chiffre : il ne veut pas « une liste
 * d'appareils », il veut savoir combien de couronnes de gaine ICTA 20 mettre
 * dans la camionnette, combien de boîtes d'encastrement, et quelle longueur
 * de 2,5 mm² tirer. Tout se déduit du plan — c'est bien pour ça qu'on l'a
 * relevé.
 *
 * Les diamètres suivent la règle de remplissage de la NF C 15-100 : la
 * section occupée par les conducteurs ne dépasse pas le tiers de la section
 * intérieure du conduit. En pratique, pour trois conducteurs isolés :
 *
 * | Section | Conduit |
 * | ------- | ------- |
 * | 1,5 mm² | ICTA 16 |
 * | 2,5 mm² | ICTA 20 |
 * | 4–6 mm² | ICTA 25 |
 * | 10 mm²  | ICTA 32 |
 *
 * Les courants faibles (RJ45, coaxial) passent en ICTA 25 : on y tire
 * rarement une seule paire, et une gaine trop juste se paie au tirage.
 */
import { CEILINGS, type CeilingFixture } from './ceiling';
import { FIXTURES, postsOf, type Fixture } from './electrical';
import type { Circuit } from './nfc15100';
import { wiresOf, type Wire } from './schema';

/** Diamètre extérieur du conduit ICTA, en millimètres. */
export type ConduitD = 16 | 20 | 25 | 32;

/**
 * DIAMÈTRE EXTÉRIEUR D'UN CONDUCTEUR ISOLÉ H07V-U, en millimètres.
 *
 * C'est l'isolant qui occupe le conduit, pas le cuivre : un 1,5 mm² mesure
 * trois millimètres de diamètre hors tout, soit sept millimètres carrés
 * d'encombrement. Ce sont ces valeurs-là qui décident du tirage.
 */
const D_CONDUCTEUR: Record<number, number> = {
  1.5: 3.0,
  2.5: 3.6,
  4: 4.2,
  6: 4.8,
  10: 6.4,
  16: 7.8,
};

/**
 * DIAMÈTRE INTÉRIEUR UTILE d'un ICTA, en millimètres.
 *
 * Le nombre qui nomme la gaine est son diamètre EXTÉRIEUR : un ICTA 16 ne
 * laisse passer que dix millimètres et demi. Confondre les deux fait croire
 * qu'on tire six fils là où trois passent à peine.
 */
const D_INTERIEUR: Record<ConduitD, number> = {
  16: 10.7,
  20: 14.1,
  25: 18.3,
  32: 24.3,
};

/**
 * LE CONDUIT QUI CONVIENT, SELON LE NOMBRE DE FILS — la règle du tiers.
 *
 * Relevé du patron : « les diamètres recommandés pour chaque tirage selon
 * nombre de fils aux normes ». L'application choisissait sur la SEULE
 * section : 1,5 mm² donnait ICTA 16, quel que soit le compte. C'est vrai
 * pour trois fils, et faux dès le quatrième — un va-et-vient en tire six, et
 * six ne passent pas dans du 16.
 *
 * La norme borne le remplissage AU TIERS de la section intérieure du
 * conduit. C'est ce qui rend le tirage possible à la main : au-delà, le
 * faisceau coince dans les coudes et l'on tire au treuil ce qui devrait
 * glisser. On calcule donc, plutôt que de recopier une table — et le calcul
 * se vérifie.
 *
 * Les courants faibles gardent leur ICTA 25 : on y tire rarement une seule
 * paire, et une gaine trop juste se paie au tirage.
 */
export function conduitPour(
  section: number | null,
  fils: number,
): ConduitD {
  if (section === null) return 25;
  const d = D_CONDUCTEUR[section] ?? D_CONDUCTEUR[1.5];
  const occupee = Math.max(1, fils) * Math.PI * (d / 2) ** 2;
  for (const taille of [16, 20, 25, 32] as ConduitD[]) {
    const utile = (Math.PI * D_INTERIEUR[taille] ** 2) / 4 / 3;
    if (occupee <= utile) return taille;
  }
  return 32;
}

/**
 * Le conduit qui convient à un circuit, d'après sa seule section.
 *
 * Reste employée là où le nombre de conducteurs n'est pas connu : elle vaut
 * le câblage à trois fils, le plus courant. Quand on les compte, c'est
 * `conduitPour` qui tranche.
 */
export function conduitFor(section: number | null): ConduitD {
  if (section === null) return 25; // courants faibles
  if (section <= 1.5) return 16;
  if (section <= 2.5) return 20;
  if (section <= 6) return 25;
  return 32;
}

export interface PullRow {
  circuitId: string;
  label: string;
  /**
   * Nombre de conducteurs tirés dans la gaine.
   *
   * C'est lui qui décide du diamètre, avec la section — relevé du patron :
   * « les diamètres recommandés pour chaque tirage selon nombre de fils aux
   * normes ». Il s'imprime à côté du conduit : celui qui tire doit pouvoir
   * vérifier le compte avant de commander la couronne.
   */
  fils: number;
  /**
   * LES CONDUCTEURS EUX-MÊMES — leur rôle, donc leur couleur.
   *
   * Relevé du patron, après un essai sur un éclairage complet : « le devis
   * ne compte que le fil bleu, alors qu'en réalité il faut la phase pour
   * l'interrupteur, autre couleur pour retour lampe, etc. ». Le compte
   * (`fils`) suffisait à choisir la gaine ; il ne suffit pas à remplir un
   * chariot. On n'achète pas « cinq conducteurs » : on achète une couronne
   * de rouge, une de bleu, une de vert-jaune, une de violet.
   */
  brins: Wire[];
  /** Section des conducteurs (mm²), nulle en courants faibles. */
  section: number | null;
  conduit: ConduitD;
  /** Nombre de départs tirés depuis le tableau. */
  runs: number;
  /** Mètres de gaine (le parcours physique). */
  conduitLength: number;
  /** Mètres de câble (parcours + mou d'about). */
  cableLength: number;
  /**
   * Longueur approchée : la pièce desservie n'a pas été relevée en boucle
   * fermée, son contour est reconstitué, et la gaine le longe. À chiffrer
   * avec une marge, ou à re-scanner.
   */
  approx: boolean;
  protection: string;
}

/**
 * Le tableau de tirage : une ligne par circuit, dans l'ordre du tableau.
 *
 * Sans métré (pas de tableau posé sur le plan), la ligne existe quand même
 * avec ses longueurs à zéro : mieux vaut un circuit sans métré qu'un circuit
 * oublié.
 */
export function pullSchedule(
  circuits: Circuit[],
  metre?: Map<string, { conduit: number; cable: number; runs: number }>,
  /** Circuits dont le tracé longe un contour reconstitué (voir `ElecPlan`). */
  approx?: Set<string>,
  /**
   * L'appareillage posé, quand on l'a : il donne le NOMBRE DE CONDUCTEURS,
   * et c'est lui qui décide du diamètre — voir `conduitPour`. Sans lui, on
   * s'en tient au câblage à trois fils.
   */
  fixtures?: Fixture[],
): PullRow[] {
  return circuits.map((c) => {
    const m = metre?.get(c.id);
    const brins = wiresOf(c, fixtures);
    const fils = brins.length;
    return {
      brins,
      approx: !!approx?.has(c.id),
      circuitId: c.id,
      label: c.label,
      section: c.section,
      fils,
      conduit: conduitPour(c.section, fils),
      runs: m?.runs ?? c.fixtureIds.length,
      conduitLength: Math.ceil(m?.conduit ?? 0),
      cableLength: Math.ceil(m?.cable ?? 0),
      protection:
        c.breaker === null ? 'coffret com.' : `${c.breaker} A · ${c.section} mm²`,
    };
  });
}

/**
 * Une ligne de commande, telle qu'un fournisseur la lit.
 *
 * Le libellé seul ne suffit pas au comptoir : « Plaque 1 poste » ne dit pas
 * de quelle gamme, « Gaine Ø20 » ne dit pas la norme. On sépare donc ce qui
 * DÉSIGNE (le libellé), ce qui SPÉCIFIE (la norme, la matière, la
 * profondeur) et ce qui EXPLIQUE d'où vient la quantité (la note). Chaque
 * ligne porte enfin son rayon, pour que le bordereau se lise dans l'ordre
 * où l'on remplit le chariot.
 */
export interface BuyRow {
  /** Rayon : « Conduits et câbles », « Encastrement », « Appareillage ». */
  family: string;
  /**
   * L'ARTICLE, POUR LE CATALOGUE DE PRIX.
   *
   * Le libellé est fait pour être lu au comptoir, pas pour servir de clé :
   * « Plaque de finition 2 postes » se réécrit le jour où l'on change un
   * mot, et le chiffrage suivrait sans rien dire. Le code, lui, ne change
   * que si l'article change. Voir `chiffrer` et `src/geometry/prix.ts`.
   */
  code?: string;
  label: string;
  /** Ce qui précise l'article : norme, matière, dimensions utiles. */
  spec?: string;
  quantity: number;
  /** Unité courte, celle des bordereaux : « u », « cour. 100 m ». */
  unit: string;
  /** D'où sort la quantité : le chiffrage doit être vérifiable. */
  note?: string;
}

/** Les rayons, dans l'ordre où on les parcourt. */
export const BUY_FAMILIES = [
  'Conduits et conducteurs',
  'Encastrement et finition',
  'Appareillage',
  'Plafond',
] as const;

/** Écrit une section à la française : 2,5 et non 2.5. */
const frSection = (v: number) => String(v).replace('.', ',');

/** Longueur d'une couronne du commerce, en mètres. */
const COURONNE = 100;

/**
 * Ce qu'on compte par départ quand le tracé manque.
 *
 * Le même chiffre que `materialList` : deux feuilles d'un même dossier ne
 * peuvent pas estimer différemment le même logement.
 */
const METRES_PAR_DEPART = 12;

/**
 * La liste d'achat : gaines par diamètre, câble par section, boîtes et
 * plaques par nombre de postes.
 *
 * On donne les mètres ET les couronnes : le premier chiffre sert à vérifier,
 * le second à commander. Les boîtes se comptent par POSTE — une plaque
 * double, ce sont deux boîtes à 71 mm d'entraxe — et les plaques par
 * ensemble, ce qui n'est pas la même chose et se confond tout le temps.
 */
export function buyingList(
  rows: PullRow[],
  fixtures: Fixture[],
  /**
   * Ce qui est posé AU PLAFOND.
   *
   * On le dessinait sur le plan et personne ne l'achetait : huit spots
   * figuraient au dossier sans jamais apparaître sur un bordereau. Chaque
   * point lumineux emporte en outre sa boîte — une DCL pour un point de
   * centre, une boîte de dérivation pour une applique — qu'on oublie
   * encore plus facilement que le luminaire lui-même.
   */
  ceiling: CeilingFixture[] = [],
): BuyRow[] {
  const out: BuyRow[] = [];

  /*
    QUAND LE TRACÉ MANQUE, ON ESTIME — ET ON L'ÉCRIT.

    Relevé du patron, en relisant le devis : « il manque des choses, refais
    un passage d'éléments ». Le tracé des gaines ne se calcule qu'avec un
    tableau posé sur le plan : sans lui, `planRoutes` s'abstient — et il a
    raison, on ne devine pas d'où part le câble. Mais le bordereau sortait
    alors SANS UNE SEULE LIGNE de gaine ni de fil : le poste le plus lourd
    après l'appareillage, disparu en silence, sur le document même qu'on
    emporte au comptoir.

    Un zéro muet est le pire des chiffres. On pose donc l'estimation que la
    liste du matériel emploie déjà — douze mètres par départ, le même chiffre
    qu'elle, deux feuilles d'un dossier ne pouvant pas estimer
    différemment — et chaque ligne porte écrit que c'est un forfait.
  */
  const mesure = rows.reduce((t, r) => t + r.conduitLength, 0) > 0;
  const longueur = (r: PullRow, quoi: 'conduit' | 'cable') =>
    mesure
      ? quoi === 'conduit'
        ? r.conduitLength
        : r.cableLength
      : r.runs * METRES_PAR_DEPART;
  const forfait = mesure
    ? undefined
    : `estimé à ${METRES_PAR_DEPART} m par départ, faute de tableau posé sur le plan`;

  const parConduit = new Map<ConduitD, number>();
  /** Ce que chaque diamètre doit avaler de conducteurs, au pire. */
  const filsDuConduit = new Map<ConduitD, number>();
  /*
    LE FIL SE COMPTE PAR COULEUR, ET NON PAR MÈTRE DE PARCOURS.

    Relevé du patron, après un essai sur un éclairage complet : « le devis ne
    compte que le fil bleu, alors qu'en réalité il faut la phase pour
    l'interrupteur, autre couleur pour retour lampe, etc. ».

    Le bordereau multipliait le parcours par TROIS, en dur, et sortait une
    seule ligne « rouge, bleu, vert-jaune ». C'était juste pour un circuit de
    prises et faux pour tout le reste : un simple allumage tire quatre
    conducteurs, un va-et-vient six — et surtout, on n'achète pas « cinq
    conducteurs », on achète une couronne de chaque couleur. Le chariot
    partait donc avec un tiers de fil en moins ET sans le violet du retour de
    lampe, que personne ne trouve au comptoir en cours de chantier.

    On regroupe donc par (section, rôle) : chaque rôle est une couleur, et
    chaque couleur est une couronne. Les deux navettes d'un va-et-vient
    comptent deux fois, comme il se doit.
  */
  const parBrin = new Map<string, { section: number; wire: Wire; metres: number }>();
  for (const r of rows) {
    parConduit.set(
      r.conduit,
      (parConduit.get(r.conduit) ?? 0) + longueur(r, 'conduit'),
    );
    filsDuConduit.set(
      r.conduit,
      Math.max(filsDuConduit.get(r.conduit) ?? 0, r.fils),
    );
    if (r.section === null) continue;
    const m = longueur(r, 'cable');
    for (const w of r.brins) {
      const cle = `${r.section}|${w.role}`;
      const e = parBrin.get(cle);
      if (e) e.metres += m;
      else parBrin.set(cle, { section: r.section, wire: w, metres: m });
    }
  }

  for (const [d, m] of [...parConduit.entries()].sort((a, b) => a[0] - b[0])) {
    if (m <= 0) continue;
    out.push({
      family: 'Conduits et conducteurs',
      code: `icta-${d}`,
      label: `Conduit ICTA Ø${d} mm`,
      spec: 'Gaine annelée souple avec tire-fil, NF EN 61386',
      quantity: Math.ceil(m / COURONNE),
      unit: 'cour. 100 m',
      /*
        LE NOMBRE DE FILS EST ÉCRIT SUR LA LIGNE DE GAINE.

        Relevé du patron : « chaque câblage doit être noté en terme de nombre
        de fils jusqu'au tableau, adapter la gaine en fonction ». C'est déjà
        ce qui choisit le diamètre (`conduitPour`, règle du tiers) — encore
        faut-il que celui qui tire puisse le VÉRIFIER avant de commander.
      */
      note: `${forfait ?? `${m} m relevés sur le plan`} · jusqu'à ${
        filsDuConduit.get(d) ?? 3
      } conducteurs par gaine`,
    });
  }

  const ordre: Record<string, number> = {
    phase: 0,
    neutre: 1,
    terre: 2,
    retour: 3,
    navette: 4,
  };
  for (const e of [...parBrin.values()].sort(
    (a, b) => a.section - b.section || ordre[a.wire.role] - ordre[b.wire.role],
  )) {
    if (e.metres <= 0) continue;
    out.push({
      family: 'Conduits et conducteurs',
      code: `fil-${e.section}-${e.wire.role}`,
      label: `Conducteur H07V-U ${frSection(e.section)} mm² — ${e.wire.label}`,
      spec: 'Rigide cuivre 450/750 V',
      quantity: Math.ceil(e.metres / COURONNE),
      unit: 'cour. 100 m',
      /*
        LA LONGUEUR EST CELLE DU PARCOURS ENTIER, ET C'EST VOLONTAIRE.

        Un retour de lampe ou une navette ne court pas tout le circuit : il
        va de la commande au point lumineux. On ne connaît pas ce
        sous-parcours — le tracé du plan mène le faisceau du tableau à chaque
        appareil, pas d'un appareil à l'autre. On compte donc chaque
        conducteur sur toute la longueur : c'est une marge, elle est du bon
        côté, et elle est écrite.
      */
      note: `${Math.round(e.metres)} m ${
        forfait ?? 'de parcours'
      }${
        e.wire.role === 'retour' || e.wire.role === 'navette'
          ? ' — compté sur tout le circuit, marge assumée'
          : ''
      }`,
    });
  }

  /*
    LES COURANTS FAIBLES PRENNENT LEUR CÂBLE, ET PERSONNE NE L'ACHETAIT.

    La boucle du dessus ne commande de conducteur que pour les circuits qui
    ont une SECTION — et un circuit de courant faible n'en a pas. C'était
    juste pour du H07V-U : on ne tire pas du fil rigide dans une gaine de
    communication. Mais on y tire autre chose, et le bordereau n'en disait
    rien : vingt mètres de gaine Ø25 figuraient au chariot, vides.

    Une prise RJ45 demande du F/UTP, une prise TV du coaxial. Le circuit ne
    dit pas laquelle est au bout : on répartit donc la longueur au PRORATA
    des prises de chaque nature, et la note dit que c'est un prorata.
  */
  const vdi = rows
    .filter((r) => r.section === null)
    .reduce((t, r) => t + longueur(r, 'cable'), 0);
  if (vdi > 0) {
    const postes = fixtures.flatMap((f) => postsOf(f.kind));
    const nRj = postes.filter((k) => k === 'rj45').length;
    const nTv = postes.filter((k) => k === 'tv').length;
    const total = nRj + nTv;
    const part: [string, string, string, number][] = [
      [
        'futp6',
        'Câble F/UTP catégorie 6',
        '4 paires, pour les prises RJ45',
        total === 0 ? vdi : (vdi * nRj) / total,
      ],
      [
        'coax',
        'Câble coaxial 17 VATC',
        'Classe A, pour les prises TV',
        total === 0 ? 0 : (vdi * nTv) / total,
      ],
    ];
    for (const [code, label, spec, m] of part) {
      if (m <= 0) continue;
      out.push({
        family: 'Conduits et conducteurs',
        code,
        label,
        spec,
        quantity: Math.ceil(m / COURONNE),
        unit: 'cour. 100 m',
        note: forfait
          ? `${Math.round(m)} m au prorata des prises, ${forfait}`
          : `${Math.round(m)} m au prorata des prises`,
      });
    }
  }

  // Boîtes et plaques : ce que porte le mur, poste par poste.
  const parEnsemble = new Map<string, number>();
  for (const f of fixtures) {
    const cle = f.group ?? f.id;
    parEnsemble.set(cle, (parEnsemble.get(cle) ?? 0) + postsOf(f.kind).length);
  }
  const postes = [...parEnsemble.values()].reduce((t, n) => t + n, 0);
  if (postes > 0) {
    out.push({
      family: 'Encastrement et finition',
      code: 'boite-encastrement',
      label: 'Boîte d’encastrement Ø 67 mm',
      spec: 'Profondeur 40 mm, à sceller ou pour cloison sèche',
      quantity: postes,
      unit: 'u',
      note: 'une boîte par poste',
    });
  }
  const plaques = new Map<number, number>();
  for (const n of parEnsemble.values()) plaques.set(n, (plaques.get(n) ?? 0) + 1);
  for (const [n, q] of [...plaques.entries()].sort((a, b) => a[0] - b[0])) {
    out.push({
      family: 'Encastrement et finition',
      code: `plaque-${n}`,
      label: `Plaque de finition ${n} poste${n > 1 ? 's' : ''}`,
      // La largeur d'une plaque ne se commande pas : elle découle du nombre
      // de postes. Ce qui se vérifie, en revanche, c'est l'entraxe — et
      // seulement à partir de deux postes.
      spec: n > 1 ? 'Entraxe 71 mm, horizontale ou verticale' : undefined,
      quantity: q,
      unit: 'u',
    });
  }

  // Les mécanismes, par type : c'est la ligne qu'on lit en dernier au
  // comptoir, mais celle qui coûte.
  const parType = new Map<string, number>();
  for (const f of fixtures) {
    for (const k of postsOf(f.kind)) {
      parType.set(k, (parType.get(k) ?? 0) + 1);
    }
  }
  for (const [k, q] of parType) {
    out.push({
      family: 'Appareillage',
      code: `meca-${k}`,
      label: FIXTURES[k as keyof typeof FIXTURES].label,
      spec: 'Mécanisme à encastrer, entraxe 60 mm, griffes ou vis',
      quantity: q,
      unit: 'u',
    });
  }

  // ------------------------------------------------------------- plafond
  const parPlafond = new Map<string, number>();
  for (const cl of ceiling) {
    parPlafond.set(cl.kind, (parPlafond.get(cl.kind) ?? 0) + 1);
  }
  for (const [k, q] of parPlafond) {
    const spec = CEILINGS[k as keyof typeof CEILINGS];
    out.push({
      family: 'Plafond',
      code: `plafond-${k}`,
      label: spec.label,
      spec: spec.note,
      quantity: q,
      unit: 'u',
    });
  }
  // Les boîtes : une par point lumineux, et pas la même selon le point.
  const dcl = (parPlafond.get('dcl') ?? 0) + (parPlafond.get('ventilateur') ?? 0);
  if (dcl > 0) {
    out.push({
      family: 'Plafond',
      code: 'boite-dcl',
      label: 'Boîte de centre DCL',
      spec: 'Avec fiche et douille, crochet pour luminaire suspendu',
      quantity: dcl,
      unit: 'u',
      note: 'une par point de centre',
    });
  }
  const derivation = parPlafond.get('applique') ?? 0;
  if (derivation > 0) {
    out.push({
      family: 'Plafond',
      code: 'boite-derivation',
      label: 'Boîte de dérivation Ø 80 mm',
      spec: 'Pour applique : la DCL ne convient qu\u2019au point de centre',
      quantity: derivation,
      unit: 'u',
    });
  }

  // Rangé par rayon : on ne fait pas trois fois le tour du magasin.
  const rang = (f: string) => {
    const i = (BUY_FAMILIES as readonly string[]).indexOf(f);
    return i < 0 ? BUY_FAMILIES.length : i;
  };
  out.sort((a, b) => rang(a.family) - rang(b.family));

  return out;
}

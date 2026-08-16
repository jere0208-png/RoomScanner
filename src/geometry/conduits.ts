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

/** Diamètre extérieur du conduit ICTA, en millimètres. */
export type ConduitD = 16 | 20 | 25 | 32;

/** Le conduit qui convient à un circuit. */
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
): PullRow[] {
  return circuits.map((c) => {
    const m = metre?.get(c.id);
    return {
      approx: !!approx?.has(c.id),
      circuitId: c.id,
      label: c.label,
      section: c.section,
      conduit: conduitFor(c.section),
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

  const parConduit = new Map<ConduitD, number>();
  const parSection = new Map<number, number>();
  for (const r of rows) {
    parConduit.set(r.conduit, (parConduit.get(r.conduit) ?? 0) + r.conduitLength);
    if (r.section !== null) {
      parSection.set(r.section, (parSection.get(r.section) ?? 0) + r.cableLength);
    }
  }

  for (const [d, m] of [...parConduit.entries()].sort((a, b) => a[0] - b[0])) {
    if (m <= 0) continue;
    out.push({
      family: 'Conduits et conducteurs',
      label: `Conduit ICTA Ø${d} mm`,
      spec: 'Gaine annelée souple avec tire-fil, NF EN 61386',
      quantity: Math.ceil(m / COURONNE),
      unit: 'cour. 100 m',
      note: `${m} m relevés sur le plan`,
    });
  }

  for (const [s, m] of [...parSection.entries()].sort((a, b) => a[0] - b[0])) {
    if (m <= 0) continue;
    // Trois conducteurs par départ : phase, neutre, terre.
    const brins = m * 3;
    out.push({
      family: 'Conduits et conducteurs',
      label: `Conducteur H07V-U ${frSection(s)} mm²`,
      spec: 'Rigide cuivre 450/750 V — rouge, bleu, vert-jaune',
      quantity: Math.ceil(brins / COURONNE),
      unit: 'cour. 100 m',
      note: `${m} m de parcours × 3 conducteurs = ${brins} m`,
    });
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

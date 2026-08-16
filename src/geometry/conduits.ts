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

export interface BuyRow {
  label: string;
  /** Quantité, dans l'unité du libellé (m, couronnes, pièces). */
  quantity: number;
  unit: string;
  /** Précision utile au comptoir. */
  note?: string;
}

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
export function buyingList(rows: PullRow[], fixtures: Fixture[]): BuyRow[] {
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
      label: `Gaine ICTA Ø${d}`,
      quantity: Math.ceil(m / COURONNE),
      unit: `couronne${Math.ceil(m / COURONNE) > 1 ? 's' : ''} de 100 m`,
      note: `${m} m mesurés sur le plan`,
    });
  }

  for (const [s, m] of [...parSection.entries()].sort((a, b) => a[0] - b[0])) {
    if (m <= 0) continue;
    // Trois conducteurs par départ : phase, neutre, terre.
    const brins = m * 3;
    out.push({
      label: `Conducteur H07V-U ${s} mm²`,
      quantity: Math.ceil(brins / COURONNE),
      unit: `couronne${Math.ceil(brins / COURONNE) > 1 ? 's' : ''} de 100 m`,
      note: `${m} m de parcours, 3 conducteurs, soit ${brins} m`,
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
      label: 'Boîte d’encastrement Ø67',
      quantity: postes,
      unit: `boîte${postes > 1 ? 's' : ''}`,
      note: 'une par poste, entraxe 71 mm pour les ensembles',
    });
  }
  const plaques = new Map<number, number>();
  for (const n of parEnsemble.values()) plaques.set(n, (plaques.get(n) ?? 0) + 1);
  for (const [n, q] of [...plaques.entries()].sort((a, b) => a[0] - b[0])) {
    out.push({
      label: `Plaque ${n} poste${n > 1 ? 's' : ''}`,
      quantity: q,
      unit: `plaque${q > 1 ? 's' : ''}`,
      note:
        n > 1
          ? `${Math.round((n - 1) * 71 + 82)} mm de large`
          : '82 mm de large',
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
      label: FIXTURES[k as keyof typeof FIXTURES].label,
      quantity: q,
      unit: q > 1 ? 'pièces' : 'pièce',
    });
  }

  return out;
}

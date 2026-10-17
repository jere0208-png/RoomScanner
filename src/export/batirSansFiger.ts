/**
 * BÂTIR LE DOSSIER SANS FIGER L'ÉCRAN — revue « électricien », « bug-exports »
 * et « bug-fluidité » : « l'export PDF se fige à chaque case cochée ».
 *
 * Le dossier se bâtissait d'un bloc, sur le fil JavaScript : pendant ce
 * temps, ni les interrupteurs ni le défilement ne répondaient. Ici, le
 * chantier (`chantierDuDossier`) avance par petits pas — une feuille à
 * dessiner, une page à compresser, puis l'assemblage —, et l'on REND LA
 * MAIN entre deux tranches (`setTimeout(…, 0)`) : un appui, un défilement,
 * un rendu de React passent entre deux feuilles. Une tranche enchaîne les
 * pas tant qu'elle tient dans son budget de temps, jamais moins d'un pas.
 *
 * Et l'on peut ANNULER : une option qui change rend le dossier en cours
 * caduc, il s'arrête au pas suivant. Ce qu'il a déjà dessiné reste au
 * cache, et servira au suivant.
 *
 * Pas de promesse entre deux pas : rien que des minuteries. Sous l'horloge
 * simulée des bancs, `advanceTimersByTime` mène donc le dossier à son
 * terme comme il menait l'ancien calcul d'un bloc.
 */
import type { ChantierDuDossier } from './pdf';

/** Le temps qu'une tranche s'accorde avant de rendre la main (ms). */
export const BUDGET_D_UNE_TRANCHE = 12;

const maintenant = (): number => {
  const p = (globalThis as { performance?: { now?: () => number } }).performance;
  return typeof p?.now === 'function' ? p.now() : Date.now();
};

export interface BatisseSansFiger {
  /** Arrête le dossier au pas suivant ; ni `fini`, ni `echec` ne seront appelés. */
  annuler: () => void;
}

export function batirSansFiger(
  preparer: () => ChantierDuDossier,
  {
    fini,
    echec,
    budget = BUDGET_D_UNE_TRANCHE,
    ceder = (suite: () => void) => setTimeout(suite, 0),
    horloge = maintenant,
    tranche,
  }: {
    fini: (octets: Uint8Array, chantier: ChantierDuDossier) => void;
    echec: (e: unknown) => void;
    /** 0 : un seul pas par tranche. */
    budget?: number;
    /** Rend la main, puis appelle `suite`. */
    ceder?: (suite: () => void) => void;
    horloge?: () => number;
    /** Chaque tranche, sa durée : pour la mesure. */
    tranche?: (ms: number) => void;
  },
): BatisseSansFiger {
  let annule = false;
  let chantier: ChantierDuDossier | null = null;
  const travailler = () => {
    if (annule) return;
    const t0 = horloge();
    let pret = false;
    try {
      // La planification est la première tranche : le prix d'un sommaire.
      if (!chantier) chantier = preparer();
      else {
        do {
          pret = chantier.avancer();
        } while (!pret && horloge() - t0 < budget);
      }
    } catch (e) {
      tranche?.(horloge() - t0);
      if (!annule) echec(e);
      return;
    }
    tranche?.(horloge() - t0);
    if (pret) {
      const octets = chantier.octets();
      if (octets && !annule) fini(octets, chantier);
      return;
    }
    ceder(travailler);
  };
  ceder(travailler);
  return {
    annuler: () => {
      annule = true;
    },
  };
}

/** Le même dossier, d'une traite : pour l'envoi, où l'on attend de toute façon. */
export function batirDUneTraite(chantier: ChantierDuDossier): Uint8Array {
  while (!chantier.avancer()) {
    // un pas après l'autre, sans rendre la main
  }
  return chantier.octets()!;
}

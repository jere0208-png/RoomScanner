/**
 * LES RÉGLAGES DE « CE QU'IL FAUT ACHETER » — les hypothèses du calcul, et
 * les prix quand on en veut.
 *
 * Relevé du patron, point 3 de la réflexion « grand public » : les comptes
 * se faisaient sur des hypothèses fixes — deux couches, 10 m²/L, des pots
 * de 2,5 L — que personne ne pouvait corriger. Or la peinture qu'on achète
 * dit son rendement sur le pot, et le parquet choisi sa surface par paquet.
 *
 * UNE PRÉFÉRENCE DE L'APPAREIL, comme le mode d'usage (`usage.ts`) : c'est
 * la personne qui achète tel pot, pas le salon. Gardée sur le disque, prise
 * au moment où l'on s'en sert (voir `usage.ts` pour le pourquoi).
 */
import { create } from 'zustand';
import {
  HYPOTHESES,
  PRIX_INDICATIFS,
  type HypothesesTravaux,
  type PrixTravaux,
} from '../geometry/travaux';

export const CLE_REGLAGES_TRAVAUX = 'echoplan.reglagesTravaux';

function disque(): {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require('@react-native-async-storage/async-storage');
  return m.default ?? m;
}

interface Etat {
  charge: boolean;
  hypotheses: HypothesesTravaux;
  /** Afficher un prix estimé ? Non au départ : on ne l'impose à personne. */
  avecPrix: boolean;
  prix: PrixTravaux;
  charger: () => Promise<void>;
  regler: (h: Partial<HypothesesTravaux>) => void;
  reglerPrix: (p: Partial<PrixTravaux>) => void;
  basculerPrix: () => void;
  /** Revient aux valeurs courantes. */
  reinitialiser: () => void;
}

function ecrire(e: Pick<Etat, 'hypotheses' | 'avecPrix' | 'prix'>): void {
  try {
    disque()
      .setItem(
        CLE_REGLAGES_TRAVAUX,
        JSON.stringify({ hypotheses: e.hypotheses, avecPrix: e.avecPrix, prix: e.prix }),
      )
      .catch(() => {});
  } catch {
    // Pas de disque : les réglages vivent le temps de la session.
  }
}

/** Ne garde d'un objet lu sur le disque que les nombres positifs attendus. */
function nombres<T extends object>(modele: T, lu: unknown): T {
  const out = { ...modele };
  if (lu && typeof lu === 'object') {
    for (const k of Object.keys(modele) as (keyof T)[]) {
      const v = (lu as Record<string, unknown>)[k as string];
      if (typeof v === 'number' && isFinite(v) && v >= 0) out[k] = v as T[keyof T];
    }
  }
  return out;
}

export const useReglagesTravaux = create<Etat>((set, get) => ({
  charge: false,
  hypotheses: HYPOTHESES,
  avecPrix: false,
  prix: PRIX_INDICATIFS,

  charger: async () => {
    let brut: string | null = null;
    try {
      brut = await disque().getItem(CLE_REGLAGES_TRAVAUX);
    } catch {
      brut = null;
    }
    let lu: { hypotheses?: unknown; avecPrix?: unknown; prix?: unknown } | null = null;
    try {
      lu = brut ? JSON.parse(brut) : null;
    } catch {
      lu = null;
    }
    set({
      charge: true,
      ...(lu
        ? {
            hypotheses: nombres(HYPOTHESES, lu.hypotheses),
            avecPrix: lu.avecPrix === true,
            prix: nombres(PRIX_INDICATIFS, lu.prix),
          }
        : {}),
    });
  },

  regler: (h) => {
    set({ hypotheses: { ...get().hypotheses, ...h } });
    ecrire(get());
  },

  reglerPrix: (p) => {
    set({ prix: { ...get().prix, ...p } });
    ecrire(get());
  },

  basculerPrix: () => {
    set({ avecPrix: !get().avecPrix });
    ecrire(get());
  },

  reinitialiser: () => {
    set({ hypotheses: HYPOTHESES, avecPrix: false, prix: PRIX_INDICATIFS });
    ecrire(get());
  },
}));

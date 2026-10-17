/**
 * L'INTENSITÉ DES LAMPES DE LA VISITE, EN POUR CENT — relevé du patron :
 * « réduis encore l'intensité de la lumière ; fais-moi un réglage de lumière
 * pour te guider vers le % voulu ». Cent pour cent est le réglage d'usine ;
 * on descend jusqu'à zéro, on monte jusqu'à deux cents, de dix en dix.
 *
 * UNE PRÉFÉRENCE DE L'APPAREIL, comme la température des lampes.
 */
import { create } from 'zustand';

export const INTENSITE_MIN = 0;
export const INTENSITE_MAX = 200;
export const PAS_INTENSITE = 10;

const CLE = 'echoplan.intensiteLampes.v1';

function disque(): {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require('@react-native-async-storage/async-storage');
  return m.default ?? m;
}

interface Etat {
  pourcent: number;
  charge: boolean;
  charger: () => Promise<void>;
  /** Plus ou moins un pas, borné : rend la nouvelle valeur. */
  ajuster: (sens: 1 | -1) => number;
}

export const useIntensiteLampes = create<Etat>((set, get) => ({
  pourcent: 100,
  charge: false,
  charger: async () => {
    if (get().charge) return;
    try {
      const brut = await disque().getItem(CLE);
      const v = Number(brut);
      if (brut !== null && Number.isFinite(v) && v >= INTENSITE_MIN && v <= INTENSITE_MAX) {
        set({ pourcent: Math.round(v / PAS_INTENSITE) * PAS_INTENSITE });
      }
    } catch {
      // Sans disque, cent pour cent.
    }
    set({ charge: true });
  },
  ajuster: (sens) => {
    const v = Math.max(INTENSITE_MIN, Math.min(INTENSITE_MAX, get().pourcent + sens * PAS_INTENSITE));
    set({ pourcent: v });
    try {
      void disque().setItem(CLE, String(v)).catch(() => {});
    } catch {
      // La préférence vaut pour la séance.
    }
    return v;
  },
}));

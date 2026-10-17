/**
 * LES COULEURS RÉCENTES DU SÉLECTEUR — les huit dernières couleurs libres
 * appliquées, la plus neuve en tête, sur ce téléphone.
 *
 * Elles ne vivent pas dans le plan : on reprend volontiers chez un client la
 * teinte trouvée chez le précédent. Sans stockage, elles vivent la session.
 */
import { create } from 'zustand';
import { lireHex } from '../ui/couleurLibre';

export const CLE_RECENTES = 'echoplan.couleursRecentes.v1';
export const RECENTES_MAX = 8;

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
  recentes: string[];
  charger: () => Promise<void>;
  retenir: (hex: string) => void;
}

export const useCouleursRecentes = create<Etat>((set, get) => ({
  charge: false,
  recentes: [],
  charger: async () => {
    if (get().charge) return;
    try {
      const brut = await disque().getItem(CLE_RECENTES);
      const lu: unknown = brut ? JSON.parse(brut) : null;
      const propres = Array.isArray(lu) ? lu.map((x) => lireHex(String(x))).filter((x): x is string => !!x) : [];
      // Ce qui a été retenu avant la lecture passe devant.
      const fusion = [...get().recentes, ...propres.filter((x) => !get().recentes.includes(x))];
      set({ charge: true, recentes: fusion.slice(0, RECENTES_MAX) });
    } catch {
      set({ charge: true });
    }
  },
  retenir: (hex) => {
    const h = lireHex(hex);
    if (!h) return;
    const recentes = [h, ...get().recentes.filter((x) => x !== h)].slice(0, RECENTES_MAX);
    set({ recentes });
    try {
      disque()
        .setItem(CLE_RECENTES, JSON.stringify(recentes))
        .catch(() => {});
    } catch {
      // Sans stockage, la rangée vit le temps de la session.
    }
  },
}));

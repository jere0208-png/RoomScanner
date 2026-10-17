/**
 * LA TEMPÉRATURE DES LAMPES DE LA VISITE — 2700, 3000, 4000 ou 6500 K.
 *
 * Relevé du patron : « offre la possibilité de choisir entre 2700, 3000,
 * 4000 K, et autre si tu penses nécessaire ». Le blanc chaud d'une chambre
 * n'est pas le blanc neutre d'une cuisine ; le client veut voir SA lumière.
 * La lumière du jour (6500 K) s'ajoute : c'est celle d'un bureau, d'un
 * atelier, d'une salle de bains éclairée pour le maquillage.
 *
 * UNE PRÉFÉRENCE DE L'APPAREIL, comme le mode d'usage (voir `usage`) : on
 * visite tous ses plans sous la même lumière, jusqu'à ce qu'on en change.
 * Le disque se lit à la demande, pour la même raison que là-bas.
 */
import { create } from 'zustand';

export const TEMPERATURES = [
  { k: 2700, nom: 'Blanc chaud' },
  { k: 3000, nom: 'Blanc' },
  { k: 4000, nom: 'Blanc neutre' },
  { k: 6500, nom: 'Lumière du jour' },
] as const;
export type Kelvin = (typeof TEMPERATURES)[number]['k'];

const CLE = 'echoplan.temperatureLampes.v1';

function disque(): {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require('@react-native-async-storage/async-storage');
  return m.default ?? m;
}

interface Etat {
  kelvin: Kelvin;
  charge: boolean;
  charger: () => Promise<void>;
  choisir: (k: Kelvin) => void;
  /** La suivante dans la liste — l'appui sur la pastille de la visite. */
  suivante: () => Kelvin;
}

export const useTemperatureLampes = create<Etat>((set, get) => ({
  kelvin: 3000,
  charge: false,
  charger: async () => {
    if (get().charge) return;
    try {
      const v = Number(await disque().getItem(CLE));
      if (TEMPERATURES.some((t) => t.k === v)) set({ kelvin: v as Kelvin });
    } catch {
      // Sans disque, le blanc par défaut.
    }
    set({ charge: true });
  },
  choisir: (k) => {
    set({ kelvin: k });
    try {
      void disque().setItem(CLE, String(k)).catch(() => {});
    } catch {
      // Rien à faire : la préférence vaut pour la séance.
    }
  },
  suivante: () => {
    const i = TEMPERATURES.findIndex((t) => t.k === get().kelvin);
    const k = TEMPERATURES[(i + 1) % TEMPERATURES.length].k;
    get().choisir(k);
    return k;
  },
}));

export const nomDeTemperature = (k: number): string => TEMPERATURES.find((t) => t.k === k)?.nom ?? `${k} K`;

/**
 * LE RENDU DE LA VISITE — quatre propositions à comparer.
 *
 * Relevé du patron : « fais une refonte de la visite plus propre et
 * réaliste, et fais des screens de quatre propositions, lumières allumées et
 * non allumées ; je devrai choisir quelle scène correspond le plus à mes
 * envies ». Le natif règle la lumière et les matières de chacune (voir
 * `RoomScanVisite.RENDUS`) ; la couleur des murs côté pièce vient d'ici.
 *
 * UNE PRÉFÉRENCE DE L'APPAREIL, comme la température des lampes : on visite
 * sous le rendu choisi jusqu'à ce qu'on en change.
 */
import { create } from 'zustand';

export const RENDUS_VISITE = [
  { lettre: 'A', nom: 'Comme hier', murs: '#FFFCF6' },
  { lettre: 'B', nom: 'Lumineux naturel', murs: '#FAF8F4' },
  { lettre: 'C', nom: 'Chaleureux du soir', murs: '#F6F1E8' },
  { lettre: 'D', nom: 'Studio doux', murs: '#FBFAF7' },
] as const;

const CLE = 'echoplan.renduVisite.v1';

function disque(): {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require('@react-native-async-storage/async-storage');
  return m.default ?? m;
}

interface Etat {
  rendu: number;
  charge: boolean;
  charger: () => Promise<void>;
  choisir: (r: number) => void;
  /** Le suivant dans la liste — l'appui sur la pastille de la visite. */
  suivant: () => number;
}

export const useRenduVisite = create<Etat>((set, get) => ({
  rendu: 0,
  charge: false,
  charger: async () => {
    if (get().charge) return;
    try {
      const v = Number(await disque().getItem(CLE));
      if (Number.isInteger(v) && v >= 0 && v < RENDUS_VISITE.length) set({ rendu: v });
    } catch {
      // Sans disque, le premier rendu.
    }
    set({ charge: true });
  },
  choisir: (r) => {
    set({ rendu: r });
    try {
      void disque().setItem(CLE, String(r)).catch(() => {});
    } catch {
      // La préférence vaut pour la séance.
    }
  },
  suivant: () => {
    const r = (get().rendu + 1) % RENDUS_VISITE.length;
    get().choisir(r);
    return r;
  },
}));

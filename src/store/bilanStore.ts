/**
 * Le bilan du dernier relevé, tant qu'on ne l'a pas refermé.
 *
 * Un petit magasin à part : il ne vit que quelques secondes, et l'écrire
 * dans le grand magasin du plan réveillerait tous ceux qui l'écoutent.
 */
import { create } from 'zustand';
import type { BilanDuReleve } from '../geometry/bilan';

interface EtatDuBilan {
  bilan: BilanDuReleve | null;
  montrer: (b: BilanDuReleve | null) => void;
  fermer: () => void;
}

export const useBilanStore = create<EtatDuBilan>(set => ({
  bilan: null,
  montrer: bilan => set({ bilan }),
  fermer: () => set({ bilan: null }),
}));

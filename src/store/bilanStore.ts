/**
 * Le bilan du dernier relevé, tant qu'on ne l'a pas refermé.
 *
 * Un petit magasin à part : il ne vit que quelques secondes, et l'écrire
 * dans le grand magasin du plan réveillerait tous ceux qui l'écoutent.
 */
import { create } from 'zustand';
import type { BilanDuReleve } from '../geometry/bilan';

/**
 * CE QUE LA CARTE DIT EN PLUS DES CHIFFRES — le contexte du passage et les
 * messages de fin de scan.
 *
 * Ils passaient en bandeaux à la racine de l'application, SOUS la fenêtre
 * du bilan : la fête du premier plan, la dépense du scan, la pièce vue par
 * la porte défilaient pendant qu'on lisait la note, et personne ne les
 * voyait. Ils vont dans la carte, là où l'on regarde.
 */
export interface MiseEnScene {
  /** « 1er étage relevé », « Pièce ajoutée », « Relevé complété ». */
  titre?: string;
  /** Ce qu'un passage de plus a apporté au niveau : « +1 pièce · +11,6 m² ». */
  apport?: string;
  /** « Tout le logement : 2 niveaux · 8 pièces · 92 m² au sol ». */
  logement?: string;
  /** Le premier plan de l'utilisateur : la pastille le fête. */
  premier?: boolean;
  /** Durée et batterie du scan, en petite note en bas de carte. */
  noteEnergie?: string;
  /** Passe devant le conseil du barème : la pièce vue par la porte. */
  conseilPrioritaire?: string;
}

export type BilanAffiche = BilanDuReleve & MiseEnScene;

interface EtatDuBilan {
  bilan: BilanAffiche | null;
  montrer: (b: BilanAffiche | null) => void;
  fermer: () => void;
}

export const useBilanStore = create<EtatDuBilan>(set => ({
  bilan: null,
  montrer: bilan => set({ bilan }),
  fermer: () => set({ bilan: null }),
}));

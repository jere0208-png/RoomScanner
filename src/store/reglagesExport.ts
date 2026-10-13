/**
 * LES CASES DU DOSSIER SE RETIENNENT — revues « Karim » et « Inès » : les
 * choix de l'écran d'export vivaient le temps de l'écran. L'électricien
 * recochait le plafond, le schéma et les gaines à chaque dossier ; l'agente
 * immobilière décochait « Ce qu'il faut acheter » à chaque annonce.
 *
 * UNE PRÉFÉRENCE DE L'APPAREIL, comme les réglages des travaux : c'est la
 * personne qui compose ses dossiers d'une certaine façon. Gardée sur le
 * disque, par mode d'usage — l'électricien et le particulier n'impriment pas
 * les mêmes feuilles.
 */
import { useCallback } from 'react';
import { create } from 'zustand';

export const CLE_REGLAGES_EXPORT = 'echoplan.reglagesExport';

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
  /** Par clé `mode.case` : la dernière valeur choisie. */
  choix: Record<string, boolean>;
  charger: () => Promise<void>;
  retenir: (cle: string, valeur: boolean) => void;
}

export const useReglagesExport = create<Etat>((set, get) => ({
  charge: false,
  choix: {},
  charger: async () => {
    try {
      const brut = await disque().getItem(CLE_REGLAGES_EXPORT);
      const lu = brut ? JSON.parse(brut) : null;
      const choix: Record<string, boolean> = {};
      if (lu && typeof lu === 'object') {
        for (const [k, v] of Object.entries(lu)) if (typeof v === 'boolean') choix[k] = v;
      }
      set({ charge: true, choix: { ...choix, ...get().choix } });
    } catch {
      set({ charge: true });
    }
  },
  retenir: (cle, valeur) => {
    const choix = { ...get().choix, [cle]: valeur };
    set({ choix });
    try {
      disque().setItem(CLE_REGLAGES_EXPORT, JSON.stringify(choix)).catch(() => {});
    } catch {
      // Pas de disque : le choix vit le temps de la session.
    }
  },
}));

/**
 * Une case de l'écran d'export : sa dernière valeur dans ce mode, sinon sa
 * valeur par défaut.
 */
export function useCaseRetenue(
  mode: 'elec' | 'grandPublic',
  cle: string,
  defaut: boolean,
): [boolean, (v: boolean | ((avant: boolean) => boolean)) => void] {
  const nom = `${mode}.${cle}`;
  const retenue = useReglagesExport((st) => st.choix[nom]);
  const valeur = retenue ?? defaut;
  const poser = useCallback(
    (v: boolean | ((avant: boolean) => boolean)) => {
      const avant = useReglagesExport.getState().choix[nom] ?? defaut;
      useReglagesExport.getState().retenir(nom, typeof v === 'function' ? v(avant) : v);
    },
    [nom, defaut],
  );
  return [valeur, poser];
}

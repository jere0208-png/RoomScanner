/**
 * L'ENTREPRISE DE L'ARTISAN — son nom et ses coordonnées, en tête du dossier.
 *
 * Correctif de l'audit « dans la peau d'un utilisateur » : le PDF n'avait ni
 * nom, ni coordonnées de l'artisan, et la marque EchoPlan y était figée.
 * Pour un électricien qui remet le dossier à son client, c'est sa signature
 * qui doit y paraître, pas celle de l'outil.
 *
 * UNE PRÉFÉRENCE DE L'APPAREIL, comme le mode d'usage (`usage.ts`) : c'est
 * l'artisan qui a une entreprise, pas le logement. Gardée sur le disque,
 * prise au moment où l'on s'en sert.
 */
import { create } from 'zustand';

export const CLE_ENTREPRISE = 'echoplan.entreprise.v1';

export interface Entreprise {
  nom: string;
  adresse: string;
  telephone: string;
  email: string;
  siret: string;
}

export const ENTREPRISE_VIDE: Entreprise = { nom: '', adresse: '', telephone: '', email: '', siret: '' };

function disque(): {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require('@react-native-async-storage/async-storage');
  return m.default ?? m;
}

interface Etat extends Entreprise {
  charge: boolean;
  charger: () => Promise<void>;
  /** Corrige un ou plusieurs champs ; les blancs autour s'en vont. */
  regler: (champs: Partial<Entreprise>) => void;
}

const champsDe = (e: Entreprise): Entreprise => ({
  nom: e.nom,
  adresse: e.adresse,
  telephone: e.telephone,
  email: e.email,
  siret: e.siret,
});

function ecrire(e: Entreprise): void {
  try {
    disque()
      .setItem(CLE_ENTREPRISE, JSON.stringify(champsDe(e)))
      .catch(() => {});
  } catch {
    // Pas de disque : l'entreprise vit le temps de la session.
  }
}

export const useEntreprise = create<Etat>((set, get) => ({
  charge: false,
  ...ENTREPRISE_VIDE,

  charger: async () => {
    let brut: string | null = null;
    try {
      brut = await disque().getItem(CLE_ENTREPRISE);
    } catch {
      brut = null;
    }
    let lu: Record<string, unknown> | null = null;
    try {
      lu = brut ? JSON.parse(brut) : null;
    } catch {
      lu = null;
    }
    const out: Partial<Entreprise> = {};
    if (lu && typeof lu === 'object') {
      for (const k of Object.keys(ENTREPRISE_VIDE) as (keyof Entreprise)[]) {
        if (typeof lu[k] === 'string') out[k] = lu[k] as string;
      }
    }
    set({ charge: true, ...out });
  },

  regler: (champs) => {
    const propres: Partial<Entreprise> = {};
    for (const [k, v] of Object.entries(champs) as [keyof Entreprise, string | undefined][]) {
      if (typeof v === 'string') propres[k] = v.trim();
    }
    set(propres);
    ecrire(get());
  },
}));

/**
 * L'entreprise à imprimer, ou rien : sans nom, le dossier garde la marque
 * EchoPlan plutôt qu'un cartouche à moitié vide.
 */
export function entrepriseAImprimer(e: Entreprise): Entreprise | null {
  return e.nom.trim() ? champsDe(e) : null;
}

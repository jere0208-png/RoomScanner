/**
 * LES RÉGLAGES DE LA POSE — le taux horaire et la nature du chantier.
 *
 * Un artisan règle son taux UNE fois : il vit donc ici, sur le téléphone,
 * et non dans chaque plan. La nature du chantier, elle, change d'un client à
 * l'autre — mais c'est le même geste, sous le même total, et la dernière
 * choisie est la plus probable pour le devis suivant.
 */
import { create } from 'zustand';
import {
  TAUX_MAX,
  TAUX_MIN,
  TAUX_PAR_DEFAUT,
  type NatureDeChantier,
} from '../geometry/mainDOeuvre';

export const CLE_POSE = 'echoplan.pose.v1';

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
  taux: number;
  chantier: NatureDeChantier;
  charger: () => Promise<void>;
  reglerTaux: (taux: number) => void;
  choisirChantier: (chantier: NatureDeChantier) => void;
}

const borne = (t: number) => Math.max(TAUX_MIN, Math.min(TAUX_MAX, Math.round(t)));

function ecrire(taux: number, chantier: NatureDeChantier): void {
  try {
    disque()
      .setItem(CLE_POSE, JSON.stringify({ taux, chantier }))
      .catch(() => {});
  } catch {
    // Sans stockage, le réglage vit le temps de la session.
  }
}

export const useReglagesPose = create<Etat>((set, get) => ({
  charge: false,
  taux: TAUX_PAR_DEFAUT,
  chantier: 'renovation',
  charger: async () => {
    if (get().charge) return;
    try {
      const brut = await disque().getItem(CLE_POSE);
      const lu = brut ? JSON.parse(brut) : null;
      set({
        charge: true,
        taux: typeof lu?.taux === 'number' ? borne(lu.taux) : get().taux,
        chantier: lu?.chantier === 'neuf' ? 'neuf' : 'renovation',
      });
    } catch {
      set({ charge: true });
    }
  },
  reglerTaux: (taux) => {
    const t = borne(taux);
    set({ taux: t });
    ecrire(t, get().chantier);
  },
  choisirChantier: (chantier) => {
    set({ chantier });
    ecrire(get().taux, chantier);
  },
}));

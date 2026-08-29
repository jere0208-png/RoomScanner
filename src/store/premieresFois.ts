/**
 * LES PREMIÈRES FOIS — ce qu'on ne dit qu'une seule fois dans une vie d'app.
 *
 * Relevé du patron, après une passe globale : « on doit penser utilisateur
 * simple, sans professionnalisme forcément. On doit rendre la chose ludique. »
 *
 * DEUX BESOINS, UN SEUL MÉCANISME.
 *
 *   LE GESTE CACHÉ. On touche un interrupteur sur la maquette 3D et la lumière
 *   s'allume. C'est le seul geste de l'application qui fasse sourire, et RIEN
 *   ne dit qu'il existe : celui qui ne l'a pas trouvé par hasard ne le
 *   trouvera jamais. Un mot, une fois, au moment où il devient vrai — c'est-à-
 *   dire quand on vient de relier un interrupteur à quelque chose.
 *
 *   LES MOMENTS QU'ON NE FÊTE PAS. Le premier plan enregistré ne dit rien.
 *   L'application a des retours haptiques et pas un seul instant de
 *   récompense — or c'est exactement là que quelqu'un décide s'il continue.
 *
 * POURQUOI UN MAGASIN À PART, ET PAS UN CHAMP DANS LE COMPTE. Ces marques ne
 * sont pas des préférences et n'appartiennent pas au compte : elles
 * appartiennent à L'APPAREIL, et elles ne se synchronisent pas. Quelqu'un qui
 * se reconnecte ne veut pas revoir la visite guidée ; quelqu'un qui installe
 * l'app sur un nouveau téléphone, si.
 *
 * ET ELLES NE SE DÉFONT JAMAIS TOUTES SEULES. Une « première fois » qui
 * repasserait au bout d'un temps ne serait plus une première fois : ce serait
 * un rappel, et un rappel qu'on n'a pas demandé est une notification.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * Les moments qui ne se disent qu'une fois.
 *
 * La liste est FERMÉE, et c'est voulu : chacun coûte une interruption à
 * quelqu'un qui travaille. Il faut pouvoir tous les lire d'un coup d'œil pour
 * juger s'ils valent leur dérangement.
 */
export const PREMIERES = [
  /** Le tout premier lancement : la vitrine raconte le cheminement. */
  'accueil',
  /** On vient de relier un interrupteur : dire qu'on peut l'allumer. */
  'allumer',
  /** Le premier plan enregistré : le seul moment où l'app doit se réjouir. */
  'planGarde',
] as const;

export type PremiereFois = (typeof PREMIERES)[number];

const CLE = 'roomscanner.premieresfois.v1';

interface Etat {
  /** Faux tant que le disque n'a pas répondu : voir `estNeuve`. */
  charge: boolean;
  vues: PremiereFois[];
  charger: () => Promise<void>;
  estNeuve: (k: PremiereFois) => boolean;
  marquer: (k: PremiereFois) => void;
  /** Tout remettre à neuf — pour les bancs, et pour un futur « revoir ». */
  oublier: () => void;
}

export const usePremieresFois = create<Etat>((set, get) => ({
  charge: false,
  vues: [],

  charger: async () => {
    const brut = await AsyncStorage.getItem(CLE).catch(() => null);
    const lu = (() => {
      try {
        const v = JSON.parse(brut ?? '[]');
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    })();
    /*
      ON NE GARDE QUE CE QU'ON CONNAÎT. Une clé retirée du code resterait
      sinon dans le disque pour toujours, et une clé inventée par un fichier
      corrompu ferait taire un message qu'on n'a jamais montré.
    */
    set({
      charge: true,
      vues: lu.filter((k: unknown): k is PremiereFois =>
        (PREMIERES as readonly string[]).includes(String(k)),
      ),
    });
  },

  /**
   * EST-CE LA PREMIÈRE FOIS ?
   *
   * FAUX TANT QUE LE DISQUE N'A PAS RÉPONDU, et c'est le sens prudent : au
   * démarrage, `vues` est vide et tout paraîtrait neuf. On montrerait la
   * visite guidée à chaque lancement, une demi-seconde avant que le disque ne
   * dise le contraire — ce qui se verrait, et exactement au pire moment.
   */
  estNeuve: (k) => get().charge && !get().vues.includes(k),

  marquer: (k) => {
    if (get().vues.includes(k)) return;
    const vues = [...get().vues, k];
    set({ vues });
    AsyncStorage.setItem(CLE, JSON.stringify(vues)).catch(() => {});
  },

  oublier: () => {
    set({ vues: [] });
    AsyncStorage.removeItem(CLE).catch(() => {});
  },
}));

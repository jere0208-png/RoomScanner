/**
 * LA BOÎTE DE RÉCEPTION — ce que l'éditeur a dit, ce qu'on a lu, ce qu'on a
 * jeté.
 *
 * Les messages viennent de deux sources : ceux que l'application porte en
 * elle (`data/nouveautes`) et ceux que le serveur publie (`net/messages`).
 * Ce que l'utilisateur en fait — lire, supprimer — lui appartient et reste
 * dans le téléphone : une notification supprimée ne revient pas à la
 * synchronisation suivante, une notification lue ne repasse pas en gras.
 *
 * LA DERNIÈRE LISTE REÇUE EST GARDÉE. Ouverte sans réseau — un sous-sol, un
 * chantier —, la boîte montre ce qu'elle avait, et la pastille ne retombe
 * pas à zéro pour autant.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { MESSAGES_EMBARQUES } from '../data/nouveautes';
import { demanderLesMessages, lireMessages, type Message } from '../net/messages';

const CLE = 'roomscanner.notifications.v1';

interface Etat {
  /** Faux tant que le disque n'a pas répondu. */
  charge: boolean;
  /** Ce que le serveur a publié, à la dernière réponse. */
  recus: Message[];
  /** Les identifiants lus, et ceux qu'on a supprimés. */
  lus: string[];
  supprimes: string[];
  /** Une synchronisation est en cours. */
  enCours: boolean;
  charger: () => Promise<void>;
  rafraichir: () => Promise<void>;
  marquerLu: (id: string) => void;
  toutLire: () => void;
  supprimer: (id: string) => void;
  /** Annule la dernière suppression — le « Annuler » du bandeau. */
  restaurer: (id: string) => void;
}

/** Tous les messages, sans les supprimés, du plus récent au plus ancien. */
export function messagesVisibles(s: Pick<Etat, 'recus' | 'supprimes'>): Message[] {
  const vus = new Set<string>();
  const tous: Message[] = [];
  for (const m of [...s.recus, ...MESSAGES_EMBARQUES]) {
    if (vus.has(m.id)) continue;
    vus.add(m.id);
    if (!s.supprimes.includes(m.id)) tous.push(m);
  }
  return tous.sort((a, b) => b.date - a.date);
}

/** Le nombre que porte la pastille de la cloche. */
export function nombreNonLus(s: Pick<Etat, 'recus' | 'supprimes' | 'lus'>): number {
  return messagesVisibles(s).filter((m) => !s.lus.includes(m.id)).length;
}

const ecrire = (s: Pick<Etat, 'recus' | 'lus' | 'supprimes'>) =>
  AsyncStorage.setItem(
    CLE,
    JSON.stringify({ recus: s.recus, lus: s.lus, supprimes: s.supprimes }),
  ).catch(() => {});

/*
  LES LISTES DE L'UTILISATEUR NE GRANDISSENT PAS SANS FIN. Un identifiant lu
  ou supprimé qui n'existe plus nulle part — ni reçu, ni embarqué — ne sert
  plus à rien : on l'oublie à chaque synchronisation.
*/
const elaguer = (ids: string[], recus: Message[]) => {
  const connus = new Set([...recus, ...MESSAGES_EMBARQUES].map((m) => m.id));
  return ids.filter((id) => connus.has(id));
};

export const useNotifications = create<Etat>((set, get) => ({
  charge: false,
  recus: [],
  lus: [],
  supprimes: [],
  enCours: false,

  charger: async () => {
    const brut = await AsyncStorage.getItem(CLE).catch(() => null);
    let lu: { recus?: unknown; lus?: unknown; supprimes?: unknown } = {};
    try {
      lu = JSON.parse(brut ?? '{}') ?? {};
    } catch {
      lu = {};
    }
    const ids = (v: unknown) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 500) : [];
    set({
      charge: true,
      recus: lireMessages(lu.recus ?? []) ?? [],
      lus: ids(lu.lus),
      supprimes: ids(lu.supprimes),
    });
  },

  rafraichir: async () => {
    if (get().enCours) return;
    set({ enCours: true });
    try {
      const recus = await demanderLesMessages();
      // Pas de réponse n'est pas « plus aucun message » : on garde la liste.
      if (recus === null) return;
      const s = get();
      const suite = {
        recus,
        lus: elaguer(s.lus, recus),
        supprimes: elaguer(s.supprimes, recus),
      };
      set(suite);
      ecrire(suite);
    } finally {
      set({ enCours: false });
    }
  },

  marquerLu: (id) => {
    const s = get();
    if (s.lus.includes(id)) return;
    const lus = [...s.lus, id];
    set({ lus });
    ecrire({ ...s, lus });
  },

  toutLire: () => {
    const s = get();
    const lus = Array.from(new Set([...s.lus, ...messagesVisibles(s).map((m) => m.id)]));
    set({ lus });
    ecrire({ ...s, lus });
  },

  supprimer: (id) => {
    const s = get();
    if (s.supprimes.includes(id)) return;
    // Supprimée, elle compte comme lue : elle ne doit plus peser sur la
    // pastille, même si on l'annule.
    const supprimes = [...s.supprimes, id];
    const lus = s.lus.includes(id) ? s.lus : [...s.lus, id];
    set({ supprimes, lus });
    ecrire({ ...s, supprimes, lus });
  },

  restaurer: (id) => {
    const s = get();
    const supprimes = s.supprimes.filter((x) => x !== id);
    set({ supprimes });
    ecrire({ ...s, supprimes });
  },
}));

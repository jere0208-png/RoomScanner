/**
 * LE JOURNAL DES PANNES — ce qui s'est passé quand l'application a quitté.
 *
 * Relevé du patron : « l'app a quitté plusieurs fois après des clics sur des
 * meubles. Fais en sorte qu'on ait un diagnostic d'erreurs. »
 *
 * CE QUI SE PASSAIT, ET POURQUOI ON N'EN SAVAIT RIEN. Une erreur JavaScript
 * non rattrapée dans un gestionnaire d'appui — le doigt sur un meuble — ne
 * passe PAS par les frontières d'erreur de React : celles-ci n'attrapent que
 * le rendu. Elle remonte au gestionnaire global, et en production elle est
 * FATALE : l'application se ferme. Sans console branchée, il ne reste rien —
 * ni message, ni pile, ni même la certitude qu'il s'agissait d'un défaut du
 * programme plutôt que d'un manque de mémoire.
 *
 * CE JOURNAL EST DONC LA PREMIÈRE CHOSE À FAIRE, avant même de chercher le
 * défaut : sans lui, on cherche à l'aveugle un plantage qu'on ne sait pas
 * reproduire. Avec lui, on lit le message et la pile sur le téléphone du
 * chantier, deux jours plus tard.
 *
 * IL EST ÉCRIT SUR LE DISQUE AVANT TOUT LE RESTE. C'est la seule contrainte
 * qui compte ici : une panne fatale ne laisse pas le temps d'une deuxième
 * opération. On écrit, puis on s'occupe de l'affichage.
 *
 * DIX INCIDENTS, PAS DAVANTAGE. Un journal qui grossit sans fin finit par
 * peser dans le stockage d'un téléphone, et personne ne lit le onzième : ce
 * qu'on cherche, c'est le dernier, et éventuellement de voir qu'il s'est déjà
 * produit trois fois.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export interface Panne {
  /** Quand, en millisecondes depuis l'époque : l'affichage met en français. */
  quand: number;
  /** Le message de l'erreur, tel quel. C'est lui qu'on lit en premier. */
  message: string;
  /** La pile d'appels, tronquée : au-delà, c'est du code de bibliothèque. */
  pile: string;
  /** L'écran affiché au moment de la panne — la moitié du diagnostic. */
  ecran: string;
  /** Fatale : l'application se serait fermée sans le garde-fou. */
  fatale: boolean;
}

const CLE = 'roomscanner.pannes.v1';
/** Ce qu'on garde : le dernier compte, et les précédents pour voir un motif. */
export const PANNES_GARDEES = 10;
/**
 * LA PILE EST COUPÉE À MILLE SIGNES.
 *
 * Les premières lignes disent où ça a cassé ; les suivantes sont le chemin de
 * React et de ses bibliothèques, identique à chaque fois. Tout garder ferait
 * un journal illisible et un fichier qui gonfle.
 */
const PILE_MAX = 1000;

interface EtatPannes {
  charge: boolean;
  incidents: Panne[];
  charger: () => Promise<void>;
  vider: () => void;
}

export const usePannes = create<EtatPannes>((set) => ({
  charge: false,
  incidents: [],
  charger: async () => {
    const brut = await AsyncStorage.getItem(CLE).catch(() => null);
    let lu: unknown = [];
    try {
      lu = JSON.parse(brut ?? '[]');
    } catch {
      lu = [];
    }
    const propre = Array.isArray(lu)
      ? (lu.filter(
          (x) =>
            !!x &&
            typeof x === 'object' &&
            typeof (x as Panne).message === 'string' &&
            typeof (x as Panne).quand === 'number',
        ) as Panne[])
      : [];
    set({ charge: true, incidents: propre.slice(0, PANNES_GARDEES) });
  },
  vider: () => {
    set({ incidents: [] });
    AsyncStorage.removeItem(CLE).catch(() => {});
  },
}));

/**
 * ENREGISTRE UNE PANNE — appelable de n'importe où, y compris hors de React.
 *
 * ELLE NE PEUT PAS ÉCHOUER, et c'est sa seule vraie exigence : une fonction de
 * diagnostic qui lève une erreur pendant qu'on traite une erreur fait perdre
 * la panne d'origine, et l'on se retrouve à chercher un défaut qui n'existe
 * pas. Tout ce qu'elle fait est donc sous garde.
 */
export function enregistrerPanne(
  erreur: unknown,
  contexte: { ecran?: string; fatale?: boolean } = {},
): Panne {
  const message = (() => {
    try {
      if (erreur instanceof Error) return erreur.message || String(erreur);
      if (typeof erreur === 'string') return erreur;
      return JSON.stringify(erreur) ?? 'Erreur sans message';
    } catch {
      return 'Erreur illisible';
    }
  })();
  const pile = (() => {
    try {
      const p = erreur instanceof Error ? erreur.stack ?? '' : '';
      return p.slice(0, PILE_MAX);
    } catch {
      return '';
    }
  })();
  const panne: Panne = {
    quand: Date.now(),
    message: message.slice(0, 400),
    pile,
    ecran: contexte.ecran ?? '?',
    fatale: contexte.fatale ?? false,
  };
  try {
    const avant = usePannes.getState().incidents;
    // Le plus récent en tête : c'est celui qu'on vient chercher.
    const apres = [panne, ...avant].slice(0, PANNES_GARDEES);
    usePannes.setState({ incidents: apres });
    /*
      ON ÉCRIT TOUT DE SUITE, SANS ATTENDRE.

      Une panne fatale ne laisse pas le temps d'une deuxième opération : si
      l'écriture était différée — regroupée, retardée d'une seconde —, la
      seule panne qui compte vraiment serait justement celle qu'on perdrait.
    */
    AsyncStorage.setItem(CLE, JSON.stringify(apres)).catch(() => {});
  } catch {
    // Le journal ne fait jamais tomber ce qu'il observe.
  }
  return panne;
}

/** La panne mise en français, pour l'écran de diagnostic. */
export function datePanne(quand: number): string {
  try {
    return new Date(quand).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

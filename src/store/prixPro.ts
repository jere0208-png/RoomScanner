/**
 * LES PRIX PRO DE L'ÉLECTRICIEN — le tarif de son distributeur, gardé sur le
 * téléphone (voir `geometry/tarifPro`).
 *
 * On ne garde QUE les prix des articles reconnus, pas le fichier : un tarif
 * client est une donnée commerciale de l'électricien, et le devis n'a besoin
 * que de quelques dizaines de lignes. Rien ne part sur un serveur.
 */
import { create } from 'zustand';
import {
  distributeurDe,
  lireCSV,
  lireTarif,
  rapprocher,
  type RefCatalogue,
  type TarifPro,
} from '../geometry/tarifPro';
import { choisirUnTarif } from '../native/tarifPro';

export const CLE_PRIX_PRO = 'echoplan.prixpro.v1';

function disque(): {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
  removeItem: (k: string) => Promise<void>;
} {
  const m = require('@react-native-async-storage/async-storage');
  return m.default ?? m;
}

/** Ce qu'un import a donné — pour le dire à l'écran, en une phrase. */
export type IssueImport =
  | { ok: true; tarif: TarifPro }
  | { ok: false; raison: 'annule' | 'illisible' | 'colonnes' | 'aucun' };

interface Etat {
  charge: boolean;
  tarif: TarifPro | null;
  charger: () => Promise<void>;
  /** Rapproche des lignes déjà lues (le banc d'essai passe par ici). */
  importerLignes: (
    lignes: string[][],
    fichier: string,
    refs: Record<string, RefCatalogue>,
    jour: string,
  ) => IssueImport;
  /** Ouvre Fichiers, lit le tarif choisi, le rapproche, le garde. */
  importer: (refs: Record<string, RefCatalogue>, jour: string) => Promise<IssueImport>;
  retirer: () => void;
}

export const usePrixPro = create<Etat>((set, get) => ({
  charge: false,
  tarif: null,
  charger: async () => {
    if (get().charge) return;
    try {
      const brut = await disque().getItem(CLE_PRIX_PRO);
      const lu = brut ? (JSON.parse(brut) as TarifPro) : null;
      set({ charge: true, tarif: lu && typeof lu.prix === 'object' ? lu : null });
    } catch {
      set({ charge: true });
    }
  },
  importerLignes: (lignes, fichier, refs, jour) => {
    const lues = lireTarif(lignes);
    if (!lues) return { ok: false, raison: 'colonnes' };
    const prix = rapprocher(lues, refs);
    if (Object.keys(prix).length === 0) return { ok: false, raison: 'aucun' };
    const tarif: TarifPro = {
      distributeur: distributeurDe(fichier),
      fichier,
      importe: jour,
      lues: lues.length,
      prix,
    };
    set({ tarif });
    try {
      disque()
        .setItem(CLE_PRIX_PRO, JSON.stringify(tarif))
        .catch(() => {});
    } catch {
      // Sans stockage, le tarif vit le temps de la session.
    }
    return { ok: true, tarif };
  },
  importer: async (refs, jour) => {
    const f = await choisirUnTarif();
    if (!f) return { ok: false, raison: 'annule' };
    if (f.erreur) return { ok: false, raison: 'illisible' };
    const lignes = f.lignes ?? (f.texte !== undefined ? lireCSV(f.texte) : null);
    if (!lignes) return { ok: false, raison: 'illisible' };
    return get().importerLignes(lignes, f.nom, refs, jour);
  },
  retirer: () => {
    set({ tarif: null });
    try {
      disque()
        .removeItem(CLE_PRIX_PRO)
        .catch(() => {});
    } catch {
      // Rien à effacer.
    }
  },
}));

/**
 * LE COMPTE, LE QUOTA, LE PRO.
 *
 * Trois décisions qui font le système, écrites ici pour ne pas se rediscuter :
 *
 * - UN COMPTE PAR APPAREIL. Le palier gratuit se contourne en recréant un
 *   compte ; le verrou est donc lié au TÉLÉPHONE, pas au compte : un marqueur
 *   dans le trousseau (il survit à la désinstallation) retient l'identifiant
 *   du compte créé ici et le nombre de plans consommés. Créer un AUTRE compte
 *   sur le même appareil est refusé ; se reconnecter au sien passe toujours.
 *
 * - LE QUOTA SE CONSOMME À L'ENREGISTREMENT, pas au scan. « Générer un
 *   plan », c'est le garder : un essai raté qu'on jette ne brûle pas l'unique
 *   plan gratuit. Et supprimer un relevé ne rend PAS le quota — sinon le
 *   palier gratuit serait infini par corbeille.
 *
 * - LE CODE PROMO DÉVERROUILLE LOCALEMENT. CARIDI12 donne le Pro sans
 *   paiement. L'abonnement réel (4,90 €/mois) passe par StoreKit : le
 *   produit `echoplan.pro.mensuel` doit exister dans App Store Connect —
 *   tant qu'il n'y est pas, le bouton d'achat le dit clairement.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  acheterAbonnement,
  connexionApple,
  ecrireMarqueur,
  lireMarqueur,
} from '../native/account';

export const PLANS_GRATUITS = 1;
export const PRIX_PRO = '4,90 €';
export const PRODUIT_PRO = 'echoplan.pro.mensuel';
/** Les codes qui déverrouillent le Pro, en clair : offre du patron. */
const CODES_PROMO = ['CARIDI12'];

const CLE = 'roomscanner.compte.v1';

export type MethodeConnexion = 'apple' | 'google' | 'email';

export interface Compte {
  id: string;
  prenom?: string;
  email?: string;
  methode: MethodeConnexion;
}

interface AccountState {
  charge: boolean;
  compte: Compte | null;
  pro: boolean;
  proVia: 'abonnement' | 'code' | null;
  plansUtilises: number;
  paywallVisible: boolean;

  charger: () => Promise<void>;
  /**
   * Crée ou rouvre le compte. Refuse un compte DIFFÉRENT de celui que
   * l'appareil a déjà porté — c'est le verrou anti-remise-à-zéro.
   */
  connecter: (compte: Compte) => Promise<{ ok: boolean; raison?: string }>;
  connecterApple: () => Promise<{ ok: boolean; raison?: string }>;
  deconnecter: () => void;
  utiliserCode: (code: string) => boolean;
  acheterPro: () => Promise<void>;
  peutCreerPlan: () => boolean;
  noterPlanCree: () => void;
  ouvrirPaywall: () => void;
  fermerPaywall: () => void;
}

const persister = (s: AccountState) =>
  AsyncStorage.setItem(
    CLE,
    JSON.stringify({
      compte: s.compte,
      pro: s.pro,
      proVia: s.proVia,
      plansUtilises: s.plansUtilises,
    }),
  ).catch(() => {});

export const useAccountStore = create<AccountState>((set, get) => ({
  charge: false,
  compte: null,
  pro: false,
  proVia: null,
  plansUtilises: 0,
  paywallVisible: false,

  charger: async () => {
    let local: Partial<AccountState> = {};
    try {
      const brut = await AsyncStorage.getItem(CLE);
      if (brut) local = JSON.parse(brut);
    } catch {
      // Un stockage illisible vaut un premier lancement.
    }
    // Le trousseau prime sur le stockage local : il a survécu aux
    // réinstallations, lui.
    const marqueur = await lireMarqueur();
    set({
      charge: true,
      compte: (local.compte as Compte) ?? null,
      pro: !!local.pro,
      proVia: (local.proVia as AccountState['proVia']) ?? null,
      plansUtilises: Math.max(
        Number(local.plansUtilises) || 0,
        marqueur?.plans ?? 0,
      ),
    });
  },

  connecter: async (compte) => {
    const marqueur = await lireMarqueur();
    if (marqueur && marqueur.compte && marqueur.compte !== compte.id) {
      return {
        ok: false,
        raison:
          'Un compte a déjà été créé sur ce téléphone. Reconnectez-vous ' +
          'avec celui-ci — le palier gratuit ne se remet pas à zéro.',
      };
    }
    await ecrireMarqueur({
      compte: compte.id,
      plans: marqueur?.plans ?? get().plansUtilises,
    });
    set({ compte });
    persister(get());
    return { ok: true };
  },

  connecterApple: async () => {
    try {
      const qui = await connexionApple();
      return get().connecter({
        id: `apple:${qui.id}`,
        prenom: qui.prenom,
        email: qui.email,
        methode: 'apple',
      });
    } catch (e) {
      return { ok: false, raison: (e as Error).message };
    }
  },

  deconnecter: () => {
    // Le marqueur d'appareil RESTE : c'est tout son sens.
    set({ compte: null });
    persister(get());
  },

  utiliserCode: (code) => {
    const propre = code.trim().toUpperCase();
    if (!CODES_PROMO.includes(propre)) return false;
    set({ pro: true, proVia: 'code', paywallVisible: false });
    persister(get());
    return true;
  },

  acheterPro: async () => {
    const ok = await acheterAbonnement(PRODUIT_PRO);
    if (ok) {
      set({ pro: true, proVia: 'abonnement', paywallVisible: false });
      persister(get());
    }
  },

  peutCreerPlan: () => {
    const s = get();
    return s.pro || s.plansUtilises < PLANS_GRATUITS;
  },

  noterPlanCree: () => {
    const s = get();
    const plans = s.plansUtilises + 1;
    set({ plansUtilises: plans });
    persister(get());
    if (s.compte) {
      ecrireMarqueur({ compte: s.compte.id, plans }).catch(() => {});
    }
  },

  ouvrirPaywall: () => set({ paywallVisible: true }),
  fermerPaywall: () => set({ paywallVisible: false }),
}));

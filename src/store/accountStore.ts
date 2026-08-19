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
  restaurerAbonnement,
  type DeviceMarker,
} from '../native/account';
import { SERVEUR } from '../config/serveur';

/**
 * L'API du serveur, quand il est configuré. OFFLINE-FIRST : cinq secondes
 * puis on passe — un serveur injoignable ne bloque jamais un chantier, et
 * `null` dit « pas de réponse », jamais « refusé ».
 */
async function api(
  action: string,
  corps: Record<string, unknown>,
): Promise<{ ok: boolean; [k: string]: unknown } | null> {
  if (!SERVEUR.url) return null;
  try {
    const reponse = await Promise.race([
      fetch(`${SERVEUR.url}/api.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...corps }),
      }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('délai')), 5000),
      ),
    ]);
    return await reponse.json();
  } catch {
    return null;
  }
}

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
  /**
   * Le popup « essai déjà utilisé » : levé à la CONNEXION quand le
   * téléphone a déjà consommé son relevé gratuit — on accueille le compte,
   * on annonce la couleur, on montre la page Pro. Jamais un refus.
   */
  essaiEpuiseVisible: boolean;
  /** Le jeton rendu par le serveur à la connexion — null hors ligne. */
  jeton: string | null;

  charger: () => Promise<void>;
  /**
   * Crée ou rouvre le compte. Refuse un compte DIFFÉRENT de celui que
   * l'appareil a déjà porté — c'est le verrou anti-remise-à-zéro.
   */
  connecter: (compte: Compte) => Promise<{ ok: boolean; raison?: string }>;
  connecterApple: () => Promise<{ ok: boolean; raison?: string }>;
  deconnecter: () => void;
  /**
   * Efface l'identité (exigence App Store : un compte doit pouvoir se
   * supprimer) mais GARDE le compteur de plans : supprimer-recréer ne rend
   * pas le palier gratuit. Le Pro tombe avec le compte — l'abonnement se
   * retrouve par « Restaurer l'achat ».
   */
  supprimerCompte: () => Promise<void>;
  utiliserCode: (code: string) => boolean;
  acheterPro: () => Promise<void>;
  restaurerPro: () => Promise<boolean>;
  peutCreerPlan: () => boolean;
  noterPlanCree: () => void;
  ouvrirPaywall: () => void;
  fermerPaywall: () => void;
  fermerEssaiEpuise: () => void;
}

const persister = (s: AccountState) =>
  AsyncStorage.setItem(
    CLE,
    JSON.stringify({
      compte: s.compte,
      pro: s.pro,
      proVia: s.proVia,
      plansUtilises: s.plansUtilises,
      jeton: s.jeton,
    }),
  ).catch(() => {});

/** Un identifiant d'appareil : posé une fois dans le trousseau, il sert au
 *  verrou côté serveur. Pas besoin de vrai aléa cryptographique — il doit
 *  être STABLE et unique, pas secret. */
const nouvelAppareil = () =>
  `ios-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Relit le marqueur et le réécrit fusionné : aucun champ ne se perd. */
async function fusionnerMarqueur(
  patch: Partial<DeviceMarker>,
): Promise<DeviceMarker> {
  const courant = (await lireMarqueur()) ?? {
    compte: '',
    plans: 0,
    appareil: nouvelAppareil(),
  };
  const fusion: DeviceMarker = {
    compte: patch.compte ?? courant.compte,
    plans: patch.plans ?? courant.plans,
    pro: 'pro' in patch ? patch.pro : courant.pro,
    appareil: courant.appareil ?? nouvelAppareil(),
  };
  await ecrireMarqueur(fusion);
  return fusion;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  charge: false,
  compte: null,
  pro: false,
  proVia: null,
  plansUtilises: 0,
  paywallVisible: false,
  essaiEpuiseVisible: false,
  jeton: null,

  charger: async () => {
    let local: Partial<AccountState> = {};
    try {
      const brut = await AsyncStorage.getItem(CLE);
      if (brut) local = JSON.parse(brut);
    } catch {
      // Un stockage illisible vaut un premier lancement.
    }
    // Le trousseau prime sur le stockage local : il a survécu aux
    // réinstallations, lui. Le compteur de plans vaut pour l'APPAREIL ;
    // le Pro, lui, appartient à SON COMPTE — il ne se relit du trousseau
    // que si c'est bien ce compte-là qui se recharge.
    const marqueur = await lireMarqueur();
    const compteLocal = (local.compte as Compte) ?? null;
    const proDuTrousseau =
      marqueur?.pro && marqueur.compte === compteLocal?.id
        ? marqueur.pro
        : null;
    set({
      charge: true,
      compte: compteLocal,
      pro: !!local.pro || !!proDuTrousseau,
      proVia:
        (local.proVia as AccountState['proVia']) ?? proDuTrousseau ?? null,
      plansUtilises: Math.max(
        Number(local.plansUtilises) || 0,
        marqueur?.plans ?? 0,
      ),
      jeton: typeof local.jeton === 'string' ? local.jeton : null,
    });
    // Le serveur, s'il est là, a le dernier mot — sans jamais bloquer.
    const s = get();
    if (s.compte && s.jeton) {
      const etat = await api('etat', {
        identifiant: s.compte.id,
        jeton: s.jeton,
      });
      if (etat?.ok) {
        set({
          pro: s.pro || etat.pro === 'code' || etat.pro === 'abonnement',
          proVia:
            s.proVia ??
            (etat.pro === 'code' || etat.pro === 'abonnement'
              ? (etat.pro as 'code' | 'abonnement')
              : null),
          plansUtilises: Math.max(s.plansUtilises, Number(etat.plans) || 0),
        });
      }
    }
  },

  connecter: async (compte) => {
    /*
      TOUS LES COMPTES SONT LES BIENVENUS — l'essai, lui, appartient au
      TÉLÉPHONE. L'ancien refus (« un compte par appareil ») bloquait le
      patron lui-même en voulant essayer Google après l'e-mail. Le trousseau
      et la base gardent le compteur de l'appareil ; un téléphone à sec voit
      le popup et la page Pro, jamais une porte fermée.
    */
    const marqueur = await lireMarqueur();
    /*
      LE PRO APPARTIENT AU COMPTE — pas au téléphone. Relevé du chantier :
      un compte neuf entrait « Pro directement » parce que le trousseau de
      l'appareil portait le Pro d'un autre. Trois gestes le garantissent :
      l'état repart à zéro quand l'identité change, le Pro du trousseau ne
      se relit que pour LE compte qui l'a acquis, et il est purgé du
      trousseau quand un autre compte s'installe (le serveur, lui, saura
      toujours le rendre au sien).
    */
    const memeCompte = marqueur?.compte === compte.id;
    if (get().compte?.id !== compte.id) {
      set({ pro: false, proVia: null, jeton: null });
    }
    if (memeCompte && marqueur?.pro && !get().pro) {
      set({ pro: true, proVia: marqueur.pro });
    }
    const fusion = await fusionnerMarqueur(
      memeCompte
        ? { compte: compte.id }
        : { compte: compte.id, pro: undefined },
    );
    const reponse = await api('connecter', {
      identifiant: compte.id,
      prenom: compte.prenom ?? '',
      email: compte.email ?? '',
      appareil: fusion.appareil ?? '',
    });
    if (reponse && !reponse.ok) {
      // Un refus serveur reste possible (compte banni, base en rade côté
      // logique) : on le respecte et on le dit.
      await fusionnerMarqueur({ compte: marqueur?.compte ?? '' });
      return { ok: false, raison: String(reponse.raison ?? 'Refusé.') };
    }
    set({
      compte,
      jeton: reponse?.ok ? String(reponse.jeton ?? '') : null,
      plansUtilises: Math.max(get().plansUtilises, marqueur?.plans ?? 0),
    });
    if (reponse?.ok) {
      const proServeur =
        reponse.pro === 'code' || reponse.pro === 'abonnement'
          ? (reponse.pro as 'code' | 'abonnement')
          : null;
      const s = get();
      set({
        pro: s.pro || !!proServeur,
        proVia: s.proVia ?? proServeur,
        plansUtilises: Math.max(s.plansUtilises, Number(reponse.plans) || 0),
      });
    }
    // L'annonce, à l'entrée : ce téléphone a déjà donné son essai.
    const s = get();
    if (!s.pro && s.plansUtilises >= PLANS_GRATUITS) {
      set({ essaiEpuiseVisible: true });
    }
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

  supprimerCompte: async () => {
    // L'identité sort du trousseau ; le compteur de plans y reste, et le
    // Pro tombe avec le compte.
    await fusionnerMarqueur({ compte: '', pro: undefined });
    set({ compte: null, pro: false, proVia: null, jeton: null });
    persister(get());
  },

  utiliserCode: (code) => {
    const propre = code.trim().toUpperCase();
    if (!CODES_PROMO.includes(propre)) return false;
    set({ pro: true, proVia: 'code', paywallVisible: false });
    persister(get());
    // Au trousseau (le Pro survit à la réinstallation) et au serveur,
    // meilleur effort : le local a déjà tranché.
    fusionnerMarqueur({ pro: 'code' }).catch(() => {});
    const s = get();
    if (s.compte && s.jeton) {
      api('code', {
        identifiant: s.compte.id,
        jeton: s.jeton,
        code: propre,
      }).catch(() => {});
    }
    return true;
  },

  acheterPro: async () => {
    const ok = await acheterAbonnement(PRODUIT_PRO);
    if (ok) {
      set({ pro: true, proVia: 'abonnement', paywallVisible: false });
      persister(get());
      fusionnerMarqueur({ pro: 'abonnement' }).catch(() => {});
    }
  },

  restaurerPro: async () => {
    const ok = await restaurerAbonnement(PRODUIT_PRO);
    if (ok) {
      set({ pro: true, proVia: 'abonnement', paywallVisible: false });
      persister(get());
    }
    return ok;
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
    fusionnerMarqueur({ plans })
      .then((fusion) => {
        if (s.compte && s.jeton) {
          // L'appareil voyage avec : c'est LUI que l'essai débite en base.
          return api('plan', {
            identifiant: s.compte.id,
            jeton: s.jeton,
            appareil: fusion.appareil ?? '',
          });
        }
        return null;
      })
      .catch(() => {});
  },

  ouvrirPaywall: () => set({ paywallVisible: true }),
  fermerPaywall: () => set({ paywallVisible: false }),
  fermerEssaiEpuise: () => set({ essaiEpuiseVisible: false }),
}));

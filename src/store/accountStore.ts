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
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Identite } from '../net/coffrePlans';
import {
  acheterAbonnement,
  connexionApple,
  echeanceAbonnement,
  ecrireMarqueur,
  lireMarqueur,
  restaurerAbonnement,
  type DeviceMarker,
} from '../native/account';
import { SERVEUR } from '../config/serveur';
import { alerte } from '../ui/alerte';

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
export const PRIX_PRO_NUM = 4.9;
export const PRODUIT_PRO = 'echoplan.pro.mensuel';
/*
  L'ANNUEL : DEUX MOIS OFFERTS, ET RIEN DE PLUS COMPLIQUÉ.

  La page d'abonnement propose le choix de la facturation, comme le design
  que le patron a donné. Un second onglet n'a de sens qu'avec un second
  prix : 49 € l'an, soit dix mois payés pour douze — la remise classique de
  l'abonnement annuel, assez lisible pour être annoncée sans calcul.

  ATTENTION CHANTIER APPLE : le produit `echoplan.pro.annuel` doit être
  créé dans App Store Connect à côté du mensuel. Tant qu'il n'y est pas,
  l'achat annuel échoue en le DISANT, comme le mensuel avant lui.
*/
export const PRIX_PRO_AN = '49,00 €';
export const PRIX_PRO_AN_NUM = 49;
export const PRODUIT_PRO_AN = 'echoplan.pro.annuel';
/** Ce que l'annuel fait gagner, en mois — de quoi l'écrire sans calculer. */
export const MOIS_OFFERTS = Math.round(
  (PRIX_PRO_NUM * 12 - PRIX_PRO_AN_NUM) / PRIX_PRO_NUM,
);
/** Les deux facturations, telles que la page les nomme. */
export type Offre = 'mensuel' | 'annuel';
/** Le prix remisé, écrit à la française. */
export const prixRemise = (pct: number, offre: Offre = 'mensuel') =>
  `${((offre === 'annuel' ? PRIX_PRO_AN_NUM : PRIX_PRO_NUM) * (1 - pct / 100))
    .toFixed(2)
    .replace('.', ',')} €`;
/** Les codes qui déverrouillent le Pro, en clair : offre du patron. */
const CODES_PROMO = ['CARIDI12'];
/**
 * Les codes de REMISE : ils baissent le prix, ils n'ouvrent rien. FIRST20
 * est l'offre de bienvenue (−20 % sur la première souscription), portée
 * par le popup « Surprise ! » — et par la table `codes_promo` en base,
 * qui connaît déjà les pourcentages.
 */
const CODES_REMISE: Record<string, number> = { FIRST20: 20 };
export const CODE_BIENVENUE = 'FIRST20';

const CLE = 'roomscanner.compte.v1';
/** La surprise ne se joue qu'une fois par appareil : le drapeau du déjà-vu. */
const CLE_SURPRISE = 'roomscanner.surprise.v1';
/**
 * La page « Rédiger un avis » de l'app sur l'App Store. L'identifiant est
 * un GABARIT tant que l'app n'est pas en ligne — à remplacer à la création
 * de la fiche App Store Connect. Avant ça, l'ouverture échoue sans bruit.
 */
const URL_AVIS =
  'itms-apps://apps.apple.com/app/id0000000000?action=write-review';

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
  /**
   * ON DÉCOUVRE SANS COMPTE. Le cœur de l'application est 100 % local —
   * scanner, tracer, coter, exporter — et la revue Apple (5.1.1) refuse
   * qu'on exige un compte pour ce qui n'en a pas besoin. L'invité passe la
   * porte ; le compte reste ce qu'il est : la sauvegarde en ligne et le
   * code promo. Et le PALIER GRATUIT NE CHANGE PAS DE RÈGLE : il se compte
   * par appareil (le marqueur du trousseau), invité ou pas.
   */
  invite: boolean;
  entrerEnInvite: () => void;
  /** Depuis le profil de l'invité : retombe sur l'écran de connexion. */
  quitterInvite: () => void;
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
  /**
   * Le popup « Surprise ! » : le cadeau qui offre −20 % (FIRST20). Levé à
   * la PREMIÈRE inscription de l'appareil, et quand l'essai épuisé bloque
   * un nouveau scan — l'offre à la place de la porte.
   */
  surpriseVisible: boolean;
  /** La remise appliquée sur l'abonnement, en pour cent (0 = plein prix). */
  remisePct: number;
  /** Le code que la page Pro doit préremplir — personne ne recopie un
   *  code depuis un popup fermé. */
  codeOffert: string | null;
  /**
   * L'AVIS CONTRE UN ESSAI. Refuser la surprise quand l'essai est épuisé
   * propose de laisser un avis App Store, contre UN relevé de plus.
   * ATTENTION revue Apple : récompenser un avis est contraire aux règles
   * (avis incités) — le patron est prévenu, à revoir avant la soumission.
   */
  avisVisible: boolean;
  /** L'avis ne se laisse (et ne se paie) qu'une fois. */
  avisDonne: boolean;
  /** Relevés offerts en plus du palier gratuit (l'avis en donne un). */
  bonusEssais: number;
  /** Le jeton rendu par le serveur à la connexion — null hors ligne. */
  jeton: string | null;
  /*
    JUSQU'À QUAND EST-CE RÉGLÉ — relevé du patron : « sur le profil on doit
    voir la date d'expiration de l'abonnement ».

    C'est ce qu'on vient vérifier après avoir payé, et « actif » n'y répond
    pas. La date vient de l'App Store, qui est le seul à savoir : c'est lui
    qui encaisse, et lui seul qui voit une résiliation faite depuis les
    Réglages d'iOS. `null` = inconnue, et la page n'écrit alors rien plutôt
    qu'une date inventée.
  */
  proEcheance: number | null;
  /** Un prélèvement suivra-t-il ? Faux quand l'abonnement a été résilié. */
  proReconduit: boolean;
  /** Redemande l'échéance à l'App Store. Silencieux : c'est un affichage. */
  rafraichirEcheance: () => Promise<void>;

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
  /** L'achat StoreKit de l'offre choisie. Mensuel par défaut. */
  acheterPro: (offre?: Offre) => Promise<void>;
  restaurerPro: () => Promise<boolean>;
  peutCreerPlan: () => boolean;
  /**
   * LA BARRIÈRE DE L'INVITÉ EST L'EXPORT — relevé du patron : « on doit
   * pouvoir scan des plans mais sans pouvoir rien exporter. Si un
   * "continuer sans compte" cherche à exporter, on lui propose de créer un
   * compte pour l'ouvrir avec. » Rend vrai si l'export peut partir ; sinon
   * pose la proposition de compte et rend faux.
   */
  exportOuvert: () => boolean;
  noterPlanCree: () => void;
  ouvrirPaywall: () => void;
  fermerPaywall: () => void;
  fermerEssaiEpuise: () => void;
  ouvrirSurprise: () => void;
  fermerSurprise: () => void;
  /** Ouvre la page d'avis, encaisse le bonus, referme. */
  donnerAvis: () => void;
  fermerAvis: () => void;
  /** Le clic sur la surprise : le code s'applique TOUT SEUL, et la page
   *  Pro s'ouvre avec le champ déjà rempli. */
  profiterSurprise: () => void;
}

const persister = (s: AccountState) =>
  AsyncStorage.setItem(
    CLE,
    JSON.stringify({
      compte: s.compte,
      invite: s.invite,
      pro: s.pro,
      proVia: s.proVia,
      plansUtilises: s.plansUtilises,
      remisePct: s.remisePct,
      avisDonne: s.avisDonne,
      bonusEssais: s.bonusEssais,
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
  invite: false,
  pro: false,
  proVia: null,
  plansUtilises: 0,
  paywallVisible: false,
  essaiEpuiseVisible: false,
  surpriseVisible: false,
  remisePct: 0,
  codeOffert: null,
  avisVisible: false,
  avisDonne: false,
  bonusEssais: 0,
  jeton: null,
  proEcheance: null,
  proReconduit: true,

  /*
    ON REDEMANDE À L'APP STORE, ON NE DÉDUIT RIEN.

    Une date d'abonnement se calcule très bien à la main — et se trompe tout
    aussi bien : un mois offert, un changement de formule, une résiliation
    faite depuis les Réglages d'iOS, et le compte local raconte une histoire
    que la banque ne suit pas. C'est l'App Store qui encaisse : c'est lui
    qu'on interroge, à chaque ouverture de l'application.

    Silencieux de bout en bout : un appareil sans module natif, un App Store
    muet, un vol en avion — la page n'écrit alors pas de date, et rien
    d'autre ne bouge.
  */
  rafraichirEcheance: async () => {
    const e = await echeanceAbonnement([PRODUIT_PRO, PRODUIT_PRO_AN]);
    if (!e) {
      set({ proEcheance: null });
      return;
    }
    set({ proEcheance: e.expiration, proReconduit: e.reconduit });
    // Une échéance trouvée, c'est un abonnement DÉTENU : sur un téléphone
    // neuf où l'utilisateur ne pense pas à « Restaurer l'achat », c'est
    // elle qui lui rend son Pro.
    if (!get().pro) {
      set({ pro: true, proVia: 'abonnement' });
      persister(get());
    }
  },

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
      // Le choix « sans compte » survit au redémarrage : sans ça, l'invité
      // retombe sur le mur de connexion à chaque lancement.
      invite: !!local.invite,
      pro: !!local.pro || !!proDuTrousseau,
      proVia:
        (local.proVia as AccountState['proVia']) ?? proDuTrousseau ?? null,
      plansUtilises: Math.max(
        Number(local.plansUtilises) || 0,
        marqueur?.plans ?? 0,
      ),
      // La remise survit au redémarrage : un −20 % accepté puis perdu au
      // relancement serait vécu comme une promesse reprise. Le bonus de
      // l'avis pareil — c'est un dû.
      remisePct: Number(local.remisePct) || 0,
      avisDonne: !!local.avisDonne,
      bonusEssais: Number(local.bonusEssais) || 0,
      jeton: typeof local.jeton === 'string' ? local.jeton : null,
    });
    // L'App Store, lui, sait jusqu'à quand c'est payé : on le demande à
    // chaque ouverture, sans attendre la réponse pour afficher l'app.
    get().rafraichirEcheance().catch(() => {});
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
      set({ pro: false, proVia: null, jeton: null, proEcheance: null });
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
    /*
      LA SURPRISE DE BIENVENUE, à la PREMIÈRE inscription de l'appareil :
      le trousseau n'avait encore porté aucun compte, et le drapeau du
      déjà-vu est vierge — une reconnexion, elle, ne rejoue rien. Sinon,
      l'annonce d'entrée : ce téléphone a déjà donné son essai.
    */
    const dejaVue = await AsyncStorage.getItem(CLE_SURPRISE).catch(() => null);
    const s = get();
    if (!marqueur?.compte && !dejaVue && !s.pro) {
      set({ surpriseVisible: true });
      AsyncStorage.setItem(CLE_SURPRISE, '1').catch(() => {});
    } else if (!s.pro && s.plansUtilises >= PLANS_GRATUITS) {
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

  entrerEnInvite: () => {
    set({ invite: true });
    persister(get());
  },

  quitterInvite: () => {
    set({ invite: false });
    persister(get());
  },

  deconnecter: () => {
    // Le marqueur d'appareil RESTE : c'est tout son sens. Et l'on retombe
    // sur l'écran de connexion, pas en invité : se déconnecter est un
    // geste de compte, il en appelle un autre.
    set({ compte: null, invite: false });
    persister(get());
  },

  supprimerCompte: async () => {
    // L'identité sort du trousseau ; le compteur de plans y reste, et le
    // Pro tombe avec le compte.
    await fusionnerMarqueur({ compte: '', pro: undefined });
    set({
      compte: null,
      pro: false,
      proVia: null,
      jeton: null,
      proEcheance: null,
    });
    persister(get());
  },

  utiliserCode: (code) => {
    const propre = code.trim().toUpperCase();
    if (propre in CODES_REMISE) {
      // Une remise n'ouvre rien : elle baisse le prix, et la page Pro
      // reste ouverte — c'est là qu'on la VOIT s'appliquer.
      set({ remisePct: CODES_REMISE[propre] });
      persister(get());
      return true;
    }
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

  acheterPro: async (offre = 'mensuel') => {
    const ok = await acheterAbonnement(
      offre === 'annuel' ? PRODUIT_PRO_AN : PRODUIT_PRO,
    );
    if (ok) {
      set({ pro: true, proVia: 'abonnement', paywallVisible: false });
      persister(get());
      fusionnerMarqueur({ pro: 'abonnement' }).catch(() => {});
      // La date vient de changer : la page profil doit la montrer JUSTE,
      // pas au prochain lancement.
      get().rafraichirEcheance().catch(() => {});
    }
  },

  restaurerPro: async () => {
    /*
      LES DEUX PRODUITS, PAS UN.

      Qui a pris l'annuel et change de téléphone ne détient PAS le mensuel :
      ne demander que celui-là lui répondrait « aucun achat trouvé » alors
      qu'il a payé l'année. On interroge donc les deux, et le premier qui
      répond oui suffit.
    */
    const ok =
      (await restaurerAbonnement(PRODUIT_PRO)) ||
      (await restaurerAbonnement(PRODUIT_PRO_AN));
    if (ok) {
      set({ pro: true, proVia: 'abonnement', paywallVisible: false });
      persister(get());
      get().rafraichirEcheance().catch(() => {});
    }
    return ok;
  },

  peutCreerPlan: () => {
    const s = get();
    /*
      L'INVITÉ SCANNE LIBREMENT — relevé du patron : « on doit pouvoir scan
      des plans mais sans pouvoir rien exporter ». Sa barrière est plus
      loin, à l'export (`exportOuvert`). Et ce n'est pas un contournement :
      chaque relevé passe par `noterPlanCree` comme les autres — le compte
      créé ensuite naît avec l'essai de l'appareil déjà consommé, « à 0
      scan possible par la suite ».

      C'était aussi LE bug du premier réglage : l'appareil avait un essai
      au compteur, chaque porte consultait le palier, et l'invité tombait
      sur l'offre −20 % avant d'avoir rien fait.
    */
    if (!s.compte && s.invite) return true;
    return s.pro || s.plansUtilises < PLANS_GRATUITS + s.bonusEssais;
  },

  exportOuvert: () => {
    const s = get();
    if (s.compte) return true;
    // Pas un refus sec : le plan est prêt, le compte est la clé qui
    // l'ouvre — et l'on revient exactement là où l'export attendait,
    // puisque l'écran du magasin de plans ne change pas.
    alerte(
      'Créez un compte pour exporter',
      'Votre plan est prêt. Un compte gratuit sert à l’ouvrir en PDF, ' +
        'CSV ou DXF — et à retrouver vos plans après une réinstallation.',
      [
        { label: 'Plus tard' },
        { label: 'Créer mon compte', onPress: () => get().quitterInvite() },
      ],
    );
    return false;
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
  ouvrirSurprise: () => set({ surpriseVisible: true }),
  fermerSurprise: () => {
    /*
      REFUSER L'OFFRE OUVRE LA DERNIÈRE CHANCE : l'avis contre un essai —
      seulement quand l'essai est vraiment épuisé (à la première
      inscription, l'utilisateur a encore son relevé : on le laisse
      découvrir l'app), et une seule fois.
    */
    const s = get();
    const propose =
      !s.pro &&
      !s.avisDonne &&
      s.plansUtilises >= PLANS_GRATUITS + s.bonusEssais;
    set({ surpriseVisible: false, avisVisible: propose });
  },
  donnerAvis: () => {
    // L'App Store s'ouvre sur « Rédiger un avis » ; le bonus est encaissé
    // sur l'honneur — aucune API ne dit si l'avis a été posté. Et une
    // ouverture qui échoue (fiche pas encore en ligne) ne bloque rien.
    try {
      Promise.resolve(Linking.openURL(URL_AVIS)).catch(() => {});
    } catch {
      // Rien : le bonus reste dû, l'App Store attendra.
    }
    set({ avisVisible: false, avisDonne: true, bonusEssais: get().bonusEssais + 1 });
    persister(get());
  },
  fermerAvis: () => set({ avisVisible: false }),
  profiterSurprise: () => {
    set({
      surpriseVisible: false,
      paywallVisible: true,
      remisePct: CODES_REMISE[CODE_BIENVENUE],
      codeOffert: CODE_BIENVENUE,
    });
    persister(get());
  },
}));

/*
  L'IDENTITE DU COMPTE, POUR LE COFFRE.

  Le couple identifiant+jeton se recopiait a la main partout ou l'on parle
  au serveur. Le coffre a plans en a besoin lui aussi, depuis un AUTRE
  store : il le demande ici plutot que d'aller fouiller deux champs.

  Sans jeton, pas d'identite : une connexion hors ligne ouvre bien l'app,
  mais le serveur, lui, n'a rien valide.
*/
export const identiteDuCompte = (): Identite | null => {
  const s = useAccountStore.getState();
  return s.compte && s.jeton
    ? { identifiant: s.compte.id, jeton: s.jeton }
    : null;
};

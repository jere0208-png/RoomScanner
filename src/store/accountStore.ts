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
 * - SCANNER EST GRATUIT, SANS LIMITE ; EXPORTER EST PRO. Relevé du patron :
 *   « l'utilisateur doit trouver un intérêt à l'achat ». Un particulier n'a
 *   qu'un logement : un palier au NOMBRE de logements ne le faisait jamais
 *   payer. Il relève, mesure, meuble et visite autant qu'il veut ; il paie
 *   au moment où il veut ENVOYER son plan — PDF, DXF, 3D, métré —, le
 *   sauvegarder en ligne ou, électricien, le chiffrer. Voir `exportOuvert`.
 *   Le compteur de plans continue de tourner (le trousseau le garde), mais
 *   ne ferme plus rien.
 *
 * - LE QUOTA SE CONSOMMAIT À L'ENREGISTREMENT, pas au scan. « Générer un
 *   plan », c'est le garder : un essai raté qu'on jette ne brûle pas l'unique
 *   plan gratuit. Et supprimer un relevé ne rend PAS le quota — sinon le
 *   palier gratuit serait infini par corbeille.
 *
 * - TOUT CE QUI SE PAIE PASSE PAR L'APP STORE. L'abonnement, ses prix (lus
 *   à l'App Store, jamais écrits en dur), son offre de lancement et ses
 *   codes d'offre. Il y a eu un code maison qui donnait le Pro sans paiement
 *   et un « −20 % » appliqué par l'app : le premier est interdit par la règle
 *   3.1.1, et le second affichait un prix que l'App Store ne facturait pas.
 *   Les deux sont partis ; la remise de bienvenue est désormais une OFFRE DE
 *   LANCEMENT Apple, et les codes sont ceux d'App Store Connect (voir
 *   `codeOffre`). Les produits `echoplan.pro.mensuel` et `.annuel` doivent
 *   exister dans App Store Connect.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Identite } from '../net/coffrePlans';
import {
  acheterAbonnement,
  connexionApple,
  echeanceAbonnement,
  ecrireMarqueur,
  lireMarqueur,
  ouvrirCodeOffre,
  produitsPro,
  restaurerAbonnement,
  type DeviceMarker,
  type ProduitPro,
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
/** Les abonnements tels que l'App Store les vend, par facturation. */
export type OffresPro = Partial<Record<Offre, ProduitPro>>;

/**
 * L'OFFRE DE BIENVENUE — celle qu'Apple accorde, et seulement si elle existe.
 *
 * Le popup « Surprise ! » et le prix barré de la page Pro ne s'affichent que
 * si App Store Connect porte une offre de lancement sur l'abonnement ET que
 * cet utilisateur y a droit. Au paiement, c'est l'App Store qui l'applique :
 * le prix annoncé est le prix facturé. Rend l'accroche à afficher en grand
 * (« −20 % », « 1 mois offert ») et la phrase qui la précise, ou `null`.
 */
export function offreDeBienvenue(
  offres: OffresPro | null,
  facturation: Offre = 'mensuel',
): { accroche: string; phrase: string; prix: string; apres: string } | null {
  const p = offres?.[facturation] ?? (facturation === 'mensuel' ? offres?.annuel : offres?.mensuel);
  const o = p?.offre;
  if (!p || !o || !o.eligible) return null;
  const unite = (u: string, n: number) =>
    u === 'mois' ? 'mois' : u === 'an' ? (n > 1 ? 'ans' : 'an') : u === 'semaine' ? (n > 1 ? 'semaines' : 'semaine') : n > 1 ? 'jours' : 'jour';
  const duree = `${o.periode.valeur * o.nombre} ${unite(o.periode.unite, o.periode.valeur * o.nombre)}`;
  const parPeriode = p.periode ? (p.periode.unite === 'an' ? '/an' : '/mois') : '';
  const apres = `puis ${p.prix}${parPeriode}`;
  if (o.mode === 'essai') {
    return { accroche: `${duree} offert${o.nombre > 1 || o.periode.valeur > 1 ? 's' : ''}`, phrase: `d’essai gratuit, ${apres}.`, prix: '0', apres };
  }
  const memePeriode = p.periode && p.periode.unite === o.periode.unite && p.periode.valeur === o.periode.valeur;
  const pct = memePeriode && p.valeur > 0 ? Math.round((1 - o.valeur / p.valeur) * 100) : 0;
  if (pct > 0 && o.mode === 'remise') {
    return {
      accroche: `−${pct} %`,
      phrase: `sur ${o.nombre > 1 ? `vos ${o.nombre} premiers ${unite(o.periode.unite, 2)}` : `votre premier ${unite(o.periode.unite, 1)}`} d’abonnement Pro, ${apres}.`,
      prix: o.prix,
      apres,
    };
  }
  return { accroche: o.prix, phrase: `pour ${duree}, ${apres}.`, prix: o.prix, apres };
}

const CLE = 'roomscanner.compte.v1';
/** La surprise ne se joue qu'une fois par appareil : le drapeau du déjà-vu. */
const CLE_SURPRISE = 'roomscanner.surprise.v1';

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
   * Le popup « Surprise ! » : l'offre de lancement d'Apple, quand elle
   * existe et que l'utilisateur y a droit. Levé à la PREMIÈRE inscription
   * de l'appareil, et quand l'essai épuisé bloque un nouveau scan.
   */
  surpriseVisible: boolean;
  /**
   * LES ABONNEMENTS, LUS À L'APP STORE — prix localisés, périodes, offre de
   * lancement. `null` tant qu'on ne les a pas demandés ; les prix de
   * référence (`PRIX_PRO`) tiennent lieu tant que l'App Store ne répond pas.
   */
  offres: OffresPro | null;
  chargerOffres: () => Promise<void>;
  /**
   * Relevés offerts en plus du palier gratuit.
   *
   * L'avis App Store en donnait un — offre retirée : les règles de l'App
   * Store interdisent de récompenser un avis. Plus rien n'en donne, mais
   * celui qu'on a déjà gagné reste acquis : c'est un dû.
   */
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
  /** La feuille d'Apple des codes d'offre, puis l'échéance relue. */
  codeOffre: () => Promise<void>;
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
  offres: null,
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
    /*
      SANS COMPTE, PAS DE PRO — relevé du patron : « le mode invité est en
      Pro, et donc pas d'intérêt de faire un compte ». C'était ici : l'App
      Store répondait pour l'IDENTIFIANT APPLE du téléphone, et la réponse
      passait l'application en Pro sans regarder qui était connecté. Un
      téléphone qui avait un jour porté un abonnement — celui du patron, en
      premier — faisait de chaque invité un abonné.

      Le Pro appartient au compte : l'abonnement se relit à la connexion
      (voir `connecter`), pas avant.
    */
    if (!get().compte) {
      set({ proEcheance: null });
      return;
    }
    const e = await echeanceAbonnement([PRODUIT_PRO, PRODUIT_PRO_AN]);
    if (!e) {
      set({ proEcheance: null });
      return;
    }
    if ('aucun' in e) {
      /*
        L'APP STORE DIT « AUCUN ABONNEMENT » — résilié et échu, ou remboursé.
        Le Pro tenu PAR ABONNEMENT s'en va ; celui d'un ancien code reste
        (il ne dépend pas de l'App Store). Sans cette branche, un abonné qui
        résiliait gardait le Pro à vie. Un silence (`null`), lui, ne retire
        rien : hors ligne ou sans réponse, on ne punit personne.
      */
      set({ proEcheance: null });
      if (get().pro && get().proVia === 'abonnement') {
        set({ pro: false, proVia: null });
        persister(get());
        fusionnerMarqueur({ pro: undefined }).catch(() => {});
      }
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
      // Sans compte, pas de Pro : voir `rafraichirEcheance`. Un invité que
      // l'ancienne version avait écrit « Pro » en est quitte ici.
      pro: !!compteLocal && (!!local.pro || !!proDuTrousseau),
      proVia: compteLocal
        ? (local.proVia as AccountState['proVia']) ?? proDuTrousseau ?? null
        : null,
      plansUtilises: Math.max(
        Number(local.plansUtilises) || 0,
        marqueur?.plans ?? 0,
      ),
      // Le relevé offert survit au redémarrage : c'est un dû.
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
      // On demande l'offre à l'App Store sans faire attendre la connexion :
      // la surprise ne se lève que si elle existe et s'applique.
      get()
        .chargerOffres()
        .then(() => {
          if (offreDeBienvenue(get().offres) && !get().pro) {
            set({ surpriseVisible: true });
            AsyncStorage.setItem(CLE_SURPRISE, '1').catch(() => {});
          }
        })
        .catch(() => {});
    }
    // Plus d'« essai épuisé » à l'entrée : le scan ne s'épuise plus.
    persister(get());
    // Le compte est là : l'abonnement que l'App Store connaît lui revient.
    get().rafraichirEcheance().catch(() => {});
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
    // Le Pro part avec le compte : sans quoi l'invité qui suit en hériterait.
    // Le serveur et l'App Store le rendront au compte qui se reconnecte.
    set({
      compte: null,
      invite: false,
      pro: false,
      proVia: null,
      proEcheance: null,
    });
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

  codeOffre: async () => {
    await ouvrirCodeOffre();
    // L'abonnement accordé par un code arrive par l'App Store : on relit.
    await get().rafraichirEcheance();
    if (get().pro) set({ paywallVisible: false });
  },

  chargerOffres: async () => {
    const liste = await produitsPro([PRODUIT_PRO, PRODUIT_PRO_AN]);
    if (liste.length === 0) return;
    const offres: OffresPro = {};
    for (const p of liste) {
      if (p.id === PRODUIT_PRO) offres.mensuel = p;
      if (p.id === PRODUIT_PRO_AN) offres.annuel = p;
    }
    set({ offres });
  },

  acheterPro: async (offre = 'mensuel') => {
    if (demanderUnCompte()) return;
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
    /*
      ET TOUT LE MONDE SCANNE SANS LIMITE — relevé du patron, modèle choisi :
      « exporter et partager » est Pro, scanner ne l'est pas. Les portes qui
      consultent encore cette règle (accueil, étages, copies) restent
      branchées : si le palier revenait un jour, il n'y aurait qu'ici à
      toucher.
    */
    return true;
  },

  exportOuvert: () => {
    const s = get();
    if (s.compte && s.pro) return true;
    if (s.compte) {
      /*
        LE MOMENT OÙ L'ON VEUT ENVOYER SON PLAN — c'est ce que le Pro vend.
        Le plan est fait, on l'a vu en PDF : l'offre arrive à l'instant où
        elle a un sens. La surprise si Apple porte une offre de lancement,
        sinon la page Pro.
      */
      get().ouvrirSurprise();
      return false;
    }
    // Pas un refus sec : le plan est prêt, le compte est la clé qui
    // l'ouvre — et l'on revient exactement là où l'export attendait,
    // puisque l'écran du magasin de plans ne change pas.
    alerte(
      'Créez un compte pour exporter',
      'Votre plan est prêt. Un compte sert à l’envoyer en PDF, ' +
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

  ouvrirPaywall: () => {
    if (demanderUnCompte()) return;
    set({ paywallVisible: true });
  },
  fermerPaywall: () => set({ paywallVisible: false }),
  fermerEssaiEpuise: () => set({ essaiEpuiseVisible: false }),
  /*
    LA SURPRISE N'EXISTE QUE SI L'OFFRE EXISTE. Sans offre de lancement
    éligible, le geste mène droit à la page Pro : promettre une remise que
    l'App Store ne fera pas, c'est le défaut qu'on vient de retirer.
  */
  ouvrirSurprise: () => {
    if (demanderUnCompte()) return;
    if (offreDeBienvenue(get().offres)) set({ surpriseVisible: true });
    else set({ paywallVisible: true });
  },
  /*
    Refuser l'offre referme, simplement. Elle ouvrait l'« avis contre un
    essai » — retiré : les règles de l'App Store interdisent de récompenser
    un avis, et c'était un refus assuré à la revue.
  */
  fermerSurprise: () => set({ surpriseVisible: false }),
  // En profiter, c'est ouvrir la page Pro : l'App Store applique l'offre.
  profiterSurprise: () => set({ surpriseVisible: false, paywallVisible: true }),
}));

/*
  LE PRO SE PREND AVEC UN COMPTE.

  L'invité découvre tout — scanner, tracer, coter, visiter —, et le compte
  est ce qui ouvre le reste : l'export, la sauvegarde en ligne, le Pro. Un
  invité qui veut passer Pro n'a donc pas de page de paiement sous les yeux,
  mais la porte du compte : son Pro lui appartiendra, et le suivra.

  Rend vrai quand il a fallu demander (l'appelant n'a plus rien à faire).
*/
function demanderUnCompte(): boolean {
  const s = useAccountStore.getState();
  if (s.compte) return false;
  alerte(
    'Créez un compte pour passer en Pro',
    'Le Pro appartient à votre compte : il vous suit sur un autre ' +
      'téléphone et garde vos plans en ligne. La création est gratuite.',
    [
      { label: 'Plus tard' },
      { label: 'Créer mon compte', onPress: () => s.quitterInvite() },
    ],
  );
  return true;
}

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

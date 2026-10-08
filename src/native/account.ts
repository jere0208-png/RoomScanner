/**
 * Le pont natif du COMPTE — trousseau, Apple, achat.
 *
 * Trois fonctions, cherchées dans `NativeModules` À CHAQUE APPEL, jamais
 * importées du module (règle du store : l'import construisait un
 * `NativeEventEmitter` au chargement et faisait tomber six suites de tests).
 *
 * LE MARQUEUR D'APPAREIL VIT DANS LE TROUSSEAU (Keychain), pas dans le
 * stockage de l'app : le trousseau SURVIT à la désinstallation. C'est lui
 * qui porte la règle « un seul compte par téléphone » et le compteur de
 * plans du palier gratuit — supprimer et réinstaller l'app ne remet ni
 * l'un ni l'autre à zéro.
 */
import { NativeModules } from 'react-native';

/** Ce que le trousseau retient de l'appareil, réinstallations comprises. */
export interface DeviceMarker {
  /** L'identifiant du compte créé sur cet appareil — '' après suppression. */
  compte: string;
  /** Plans créés sur cet appareil, palier gratuit. */
  plans: number;
  /** Le Pro, s'il a été acquis : il survit à la réinstallation lui aussi. */
  pro?: 'code' | 'abonnement';
  /** L'identité STABLE de l'appareil, pour le verrou côté serveur. */
  appareil?: string;
}

export interface AppleIdentity {
  id: string;
  prenom?: string;
  email?: string;
}

const natif = () => NativeModules.RoomScanAccount as
  | {
      accountMarker?: () => Promise<string | null>;
      setAccountMarker?: (json: string) => Promise<boolean>;
      appleSignIn?: () => Promise<AppleIdentity>;
      purchasePro?: (productId: string) => Promise<boolean>;
      restorePro?: (productId: string) => Promise<boolean>;
      proExpiry?: (
        productIds: string[],
      ) => Promise<{
        produit?: string;
        expiration?: number;
        reconduit?: boolean;
        aucun?: boolean;
      } | null>;
      proProducts?: (productIds: string[]) => Promise<unknown[]>;
      presentOfferCode?: () => Promise<boolean>;
      webAuth?: (url: string, scheme: string) => Promise<string>;
    }
  | undefined;

export async function lireMarqueur(): Promise<DeviceMarker | null> {
  try {
    const brut = await natif()?.accountMarker?.();
    if (!brut) return null;
    const lu = JSON.parse(brut);
    if (typeof lu?.compte !== 'string') return null;
    return {
      compte: lu.compte,
      plans: Number(lu.plans) || 0,
      pro: lu.pro === 'code' || lu.pro === 'abonnement' ? lu.pro : undefined,
      appareil: typeof lu.appareil === 'string' ? lu.appareil : undefined,
    };
  } catch {
    return null;
  }
}

export async function ecrireMarqueur(m: DeviceMarker): Promise<void> {
  try {
    await natif()?.setAccountMarker?.(JSON.stringify(m));
  } catch {
    // Sans trousseau (Android, simulateur), le verrou repose sur le
    // stockage local : moins fort, jamais bloquant.
  }
}

/** La connexion Apple native ; rejette si l'utilisateur annule. */
export async function connexionApple(): Promise<AppleIdentity> {
  const fn = natif()?.appleSignIn;
  if (!fn) {
    throw new Error(
      'Connexion Apple indisponible sur cet appareil — utilisez l’e-mail.',
    );
  }
  return fn();
}

/** L'achat StoreKit du produit Pro ; vrai si la transaction aboutit. */
export async function acheterAbonnement(productId: string): Promise<boolean> {
  const fn = natif()?.purchasePro;
  if (!fn) {
    throw new Error(
      'Achat indisponible — le produit doit être configuré dans App Store Connect.',
    );
  }
  return fn(productId);
}

/**
 * « Restaurer l'achat » : demande à l'App Store si CET identifiant Apple
 * détient déjà l'abonnement (nouvel appareil, réinstallation). Exigé par
 * les règles de l'App Store dès qu'on vend un abonnement.
 */
export async function restaurerAbonnement(productId: string): Promise<boolean> {
  const fn = natif()?.restorePro;
  if (!fn) {
    throw new Error('Restauration indisponible sur cet appareil.');
  }
  return fn(productId);
}

/** Ce que l'App Store sait de l'abonnement en cours. */
export interface EcheancePro {
  produit: string;
  /** Fin de la période payée, en millisecondes. */
  expiration: number;
  /** Un prélèvement suivra-t-il ? Faux si l'utilisateur a résilié. */
  reconduit: boolean;
}

/**
 * La réponse de l'App Store sur l'abonnement : une échéance, ou « AUCUN »
 * — dit explicitement, hors ligne compris —, ou `null` quand on n'a pas pu
 * demander (pas de natif, erreur). Seul « aucun » autorise à retirer le Pro.
 */
export type EtatAbonnement = EcheancePro | { aucun: true } | null;

/** Une période d'abonnement, telle que l'App Store la décrit. */
export interface Periode {
  unite: 'jour' | 'semaine' | 'mois' | 'an';
  valeur: number;
}

/** L'offre de lancement d'un abonnement, si App Store Connect en porte une. */
export interface OffreDeLancement {
  /** Prix affichable, dans la monnaie de l'App Store (« 3,92 € »). */
  prix: string;
  valeur: number;
  periode: Periode;
  /** Combien de périodes au prix d'offre. */
  nombre: number;
  mode: 'essai' | 'remise' | 'avance' | 'autre';
  /** Cet utilisateur y a-t-il droit ? Une seule par groupe d'abonnements. */
  eligible: boolean;
}

/** Un abonnement, tel que l'App Store le vend. */
export interface ProduitPro {
  id: string;
  prix: string;
  valeur: number;
  periode?: Periode;
  offre?: OffreDeLancement;
}

const UNITES = ['jour', 'semaine', 'mois', 'an'] as const;
const periodeDe = (x: unknown): Periode | undefined => {
  const p = x as { unite?: unknown; valeur?: unknown } | null;
  if (!p || !UNITES.includes(p.unite as Periode['unite'])) return undefined;
  return { unite: p.unite as Periode['unite'], valeur: Number(p.valeur) || 1 };
};

/**
 * Les abonnements, lus à l'App Store. `[]` quand il ne répond pas (hors
 * ligne, produits pas encore créés) : la page Pro retombe alors sur ses
 * prix de référence, et la feuille d'achat d'Apple dira le vrai.
 */
export async function produitsPro(productIds: string[]): Promise<ProduitPro[]> {
  const fn = natif()?.proProducts;
  if (!fn) return [];
  try {
    const brut = await fn(productIds);
    if (!Array.isArray(brut)) return [];
    return brut.flatMap((x): ProduitPro[] => {
      const p = x as Record<string, unknown>;
      if (typeof p?.id !== 'string' || typeof p.prix !== 'string') return [];
      const o = p.offre as Record<string, unknown> | undefined;
      const periodeOffre = o ? periodeDe(o.periode) : undefined;
      return [
        {
          id: p.id,
          prix: p.prix,
          valeur: Number(p.valeur) || 0,
          periode: periodeDe(p.periode),
          offre:
            o && typeof o.prix === 'string' && periodeOffre
              ? {
                  prix: o.prix,
                  valeur: Number(o.valeur) || 0,
                  periode: periodeOffre,
                  nombre: Number(o.nombre) || 1,
                  mode: (['essai', 'remise', 'avance'] as const).includes(o.mode as never)
                    ? (o.mode as OffreDeLancement['mode'])
                    : 'autre',
                  eligible: o.eligible === true,
                }
              : undefined,
        },
      ];
    });
  } catch {
    return [];
  }
}

/** La feuille d'Apple pour saisir un code d'offre. `false` si indisponible. */
export async function ouvrirCodeOffre(): Promise<boolean> {
  const fn = natif()?.presentOfferCode;
  if (!fn) return false;
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
}

/**
 * L'ÉCHÉANCE DE L'ABONNEMENT, DEMANDÉE À L'APP STORE.
 *
 * `null` quand personne ne détient l'abonnement, quand l'App Store ne
 * répond pas, ou quand l'appareil n'a pas le module natif : la page profil
 * n'écrit alors PAS de date, plutôt qu'une date inventée. Une échéance
 * fausse sur un abonnement est pire que pas d'échéance du tout.
 */
export async function echeanceAbonnement(
  productIds: string[],
): Promise<EtatAbonnement> {
  const fn = natif()?.proExpiry;
  if (!fn) return null;
  try {
    const r = await fn(productIds);
    if (r?.aucun === true) return { aucun: true };
    if (!r || typeof r.expiration !== 'number' || !isFinite(r.expiration)) {
      return null;
    }
    return {
      produit: String(r.produit ?? ''),
      expiration: r.expiration,
      reconduit: r.reconduit !== false,
    };
  } catch {
    return null;
  }
}

/**
 * La feuille web de connexion (flux Google via le serveur) : rend l'URL de
 * retour `echoplan://google?...` que la session livre — et elle seule.
 */
export async function connexionWeb(
  url: string,
  scheme: string,
): Promise<string> {
  const fn = natif()?.webAuth;
  if (!fn) {
    throw new Error('Connexion web indisponible sur cet appareil.');
  }
  return fn(url, scheme);
}

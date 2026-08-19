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

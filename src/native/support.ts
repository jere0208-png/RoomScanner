/**
 * ÉCRIRE AU SERVICE CLIENT — le composeur d'iOS, pas un envoi caché.
 *
 * On remplit le courrier d'avance et on l'ouvre : le doigt qui appuie sur
 * « Envoyer » est celui de l'utilisateur. Rien ne part dans son dos, son
 * adresse reste la sienne — et c'est elle qui nous permet de RÉPONDRE.
 *
 * Le composeur peut ne pas exister : beaucoup d'iPhone n'ont aucun compte
 * dans l'app Mail parce que tout se passe dans Gmail. Ce n'est pas une
 * panne, c'est un cas ordinaire — l'appelant bascule alors sur un
 * `mailto:`, qui ne sait pas porter de pièce jointe, et le dit.
 */
import { Linking, NativeModules, Platform } from 'react-native';
import { RoomScan } from 'react-native-room-scan';

/** L'adresse du service client, une seule fois dans toute l'application. */
export const COURRIEL_SUPPORT = 'echoplansupport@gmail.com';

const natif = () => NativeModules.RoomScanSupport as
  | {
      composeMail?: (
        destinataire: string,
        subject: string,
        body: string,
        attachment: string | null,
      ) => Promise<'sent' | 'cancelled' | 'unavailable'>;
      pickImage?: () => Promise<string | null>;
      composeMailTexte?: (
        destinataire: string,
        subject: string,
        body: string,
        fileName: string,
        content: string,
      ) => Promise<'sent' | 'cancelled' | 'unavailable'>;
      infos?: () => Promise<{ version?: string; build?: string; modele?: string; systeme?: string }>;
    }
  | undefined;

/**
 * Choisit une image dans la photothèque et la copie dans le temporaire.
 * `null` si l'utilisateur renonce, ou sans module natif.
 *
 * Aucune autorisation n'est demandée : le choix se fait dans une fenêtre du
 * SYSTÈME, et l'application ne reçoit que l'image désignée. Demander
 * l'accès à toute la photothèque pour une capture d'écran serait
 * disproportionné.
 */
export async function choisirPieceJointe(): Promise<string | null> {
  const fn = natif()?.pickImage;
  if (!fn) return null;
  try {
    return (await fn()) ?? null;
  } catch {
    return null;
  }
}

export type SortieCourrier = 'sent' | 'cancelled' | 'unavailable';

/**
 * Ouvre le courrier pré-rempli. Rend ce que l'utilisateur en a fait —
 * jamais une exception : un iPhone sans compte Mail n'est pas une erreur.
 */
export async function ecrireAuSupport(
  sujet: string,
  message: string,
  piece: string | null,
): Promise<SortieCourrier> {
  const fn = natif()?.composeMail;
  if (fn) {
    try {
      return await fn(COURRIEL_SUPPORT, sujet, message, piece);
    } catch {
      // On tombe sur le repli plutôt que d'abandonner l'utilisateur devant
      // un message d'erreur : il a un texte à envoyer, pas un diagnostic à
      // faire.
    }
  }
  const url =
    `mailto:${COURRIEL_SUPPORT}` +
    `?subject=${encodeURIComponent(sujet)}` +
    `&body=${encodeURIComponent(message)}`;
  try {
    await Linking.openURL(url);
  } catch {
    return 'unavailable';
  }
  return 'unavailable';
}

/**
 * LE DIAGNOSTIC D'UN PLAN, AU SUPPORT — le courrier qui se lit, et le
 * dossier JSON joint qui se rejoue au banc. Sans compte Mail sur le
 * téléphone (tout se passe dans Gmail), le dossier passe par la feuille de
 * partage d'iOS : l'utilisateur choisit sa messagerie, la page lui donne
 * l'adresse. `partage` le dit à l'appelant.
 */
export async function envoyerUnDiagnostic(
  sujet: string,
  corps: string,
  fichier: string,
  contenu: string,
): Promise<SortieCourrier | 'partage'> {
  const fn = natif()?.composeMailTexte;
  if (fn) {
    try {
      const sortie = await fn(COURRIEL_SUPPORT, sujet, corps, fichier, contenu);
      if (sortie !== 'unavailable') return sortie;
    } catch {
      // Le partage prend le relais : le dossier ne doit pas se perdre.
    }
  }
  try {
    await RoomScan.shareText(contenu, fichier);
    return 'partage';
  } catch {
    return 'unavailable';
  }
}

/** La version de l'application et le téléphone, pour situer un défaut. */
export async function infosDeLApp(): Promise<{ version?: string; appareil?: string; systeme?: string }> {
  const repli = { systeme: `${Platform.OS} ${String(Platform.Version)}` };
  const fn = natif()?.infos;
  if (!fn) return repli;
  try {
    const i = await fn();
    return {
      version: i.version ? `${i.version}${i.build ? ` (${i.build})` : ''}` : undefined,
      appareil: i.modele || undefined,
      systeme: i.systeme || repli.systeme,
    };
  } catch {
    return repli;
  }
}

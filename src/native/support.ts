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
import { Linking, NativeModules } from 'react-native';

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

/**
 * Fichiers des photos de repérage.
 *
 * Le store ne peut pas importer `react-native-room-scan` : le module crée un
 * `NativeEventEmitter` au chargement, ce qui fait tomber tous les tests du
 * store — et, sur un appareil sans le module natif, l'app entière. On passe
 * donc par `NativeModules`, cherché À CHAQUE APPEL comme pour l'haptique :
 * l'ordre d'enregistrement des modules n'est pas garanti, et un `undefined`
 * capturé une fois pour toutes couperait la fonction pour de bon.
 */
import { NativeModules, Platform } from 'react-native';

const natif = (): { deletePhotos?: (p: string[]) => Promise<number> } | undefined =>
  Platform.OS === 'ios' ? NativeModules.RoomScanPhoto : undefined;

/**
 * Efface des photos de repérage devenues inutiles.
 *
 * Ne lève jamais : perdre une image orpheline est un incident de ménage, pas
 * une raison d'interrompre la suppression d'un scan.
 */
export function deletePhotoFiles(paths: string[]): void {
  if (paths.length === 0) return;
  try {
    natif()?.deletePhotos?.(paths)?.catch?.(() => {});
  } catch {
    // Rien à faire : le fichier restera, l'app continue.
  }
}

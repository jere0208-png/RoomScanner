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

const natif = ():
  | {
      deletePhotos?: (p: string[]) => Promise<number>;
      cleanModels?: (gardes: string[]) => Promise<number>;
      restorePhoto?: (asset: string) => Promise<string | null>;
    }
  | undefined => (Platform.OS === 'ios' ? NativeModules.RoomScanPhoto : undefined);

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

/**
 * Redemande au coffre — la photothèque de l'utilisateur — l'image d'une
 * photo dont le fichier de cache a disparu, et rend son nouveau chemin.
 *
 * `null` si l'image n'y est plus (l'utilisateur l'a effacée de ses Photos),
 * si l'accès est refusé, ou hors iOS. L'écran affiche alors la punaise sans
 * vignette, comme pour toute photo dont le fichier manque : une photo perdue
 * n'a jamais empêché de lire un plan.
 */
export function reposerDuCoffre(asset: string): Promise<string | null> {
  try {
    const p = natif()?.restorePhoto?.(asset);
    return p ? p.catch(() => null) : Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
}

/**
 * Efface les modèles 3D qu'aucun scan ne réclame plus.
 *
 * On passe les modèles À GARDER : le natif balaie les Documents et fait le
 * reste. Un modèle pèse plusieurs mégaoctets, et jusqu'ici aucun n'était
 * jamais effacé — de quoi remplir un téléphone en une saison de chantiers.
 *
 * Ne lève jamais, pour la même raison que le ménage des photos.
 */
export function cleanModelFiles(gardes: string[]): Promise<number> {
  try {
    const p = natif()?.cleanModels?.(gardes);
    return p ? p.catch(() => 0) : Promise.resolve(0);
  } catch {
    // Le modèle restera sur le disque, l'app continue.
    return Promise.resolve(0);
  }
}

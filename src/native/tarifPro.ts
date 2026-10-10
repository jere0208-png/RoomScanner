/**
 * OUVRIR LE TARIF DU DISTRIBUTEUR — la fenêtre Fichiers d'iOS.
 *
 * L'électricien choisit le fichier exporté de son espace client (Excel ou
 * CSV) ; le téléphone le lit sur place et n'en rend que le contenu. Aucune
 * autorisation n'est demandée : le choix se fait dans une fenêtre du SYSTÈME,
 * et l'application ne reçoit que le fichier désigné.
 */
import { NativeModules } from 'react-native';

/** Ce que rend la fenêtre : un CSV en texte, un classeur en lignes. */
export interface FichierDeTarif {
  nom: string;
  texte?: string;
  lignes?: string[][];
  erreur?: string;
}

const natif = () =>
  NativeModules.RoomScanTarifPro as
    | { choisirUnTarif?: () => Promise<FichierDeTarif | null> }
    | undefined;

/** `null` si l'utilisateur renonce, ou sans natif. */
export async function choisirUnTarif(): Promise<FichierDeTarif | null> {
  const fn = natif()?.choisirUnTarif;
  if (!fn) return null;
  try {
    // Un fichier illisible revient AVEC son erreur : l'écran doit pouvoir
    // dire « illisible » plutôt que de faire comme si l'on avait renoncé.
    return (await fn()) ?? null;
  } catch {
    return null;
  }
}

/** La fenêtre existe-t-elle sur ce téléphone ? (non : Android, banc d'essai) */
export function importPossible(): boolean {
  return !!natif()?.choisirUnTarif;
}

/**
 * LE RACCOURCI « NOUVEAU RELEVÉ » — dixième et dernière des améliorations.
 *
 * Un électricien arrive sur un chantier les mains prises. Sortir le
 * téléphone, le déverrouiller, trouver l'icône, attendre l'accueil, viser le
 * bouton : cinq gestes pour commencer ce qu'il est venu faire. « Dis Siri,
 * nouveau relevé » les remplace, et l'appui long sur l'icône aussi — le même
 * raccourci, deux chemins.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI VIT ICI, C'EST LA DÉCISION, et elle mérite d'être à part.
 *
 * Un raccourci ne dit pas seulement « scanne » : il arrive à un moment, et
 * l'application est quelque part. Sur l'accueil, c'est simple. Mais si un
 * plan est OUVERT AVEC DES MODIFICATIONS NON ENREGISTRÉES, partir scanner
 * les perd — et personne ne relie une perte de travail à une phrase dite
 * trente secondes plus tôt. Pire : le silence ferait croire que le raccourci
 * n'a pas marché, on le redirait, et le plan serait perdu au second essai.
 * On refuse, et on dit pourquoi.
 *
 * ET LE RACCOURCI NE FRANCHIT PAS LA BARRIÈRE DU PALIER GRATUIT. Il rend
 * « scanner », et c'est l'accueil qui l'exécute par SON chemin — celui du
 * bouton, garde comprise. Une porte dérobée qui contourne l'offre est un
 * défaut, pas une facilité.
 */
import { NativeModules, Platform } from 'react-native';

/** Le seul raccourci que cette version connaisse. */
export const RACCOURCI_SCAN = 'nouveau-releve';

export type SuiteDuRaccourci =
  | { faire: 'scanner' }
  | { faire: 'rien' }
  | { faire: 'dire'; message: string };

/**
 * Que faire d'une demande de raccourci, vu où l'on est.
 *
 * Une demande inconnue — un raccourci ajouté par une version plus récente,
 * « Ouvrir le dernier plan » par exemple — est IGNORÉE et non devinée : la
 * prendre pour un scan démarrerait un relevé que personne n'a demandé.
 */
export function suiteDuRaccourci(etat: {
  demande: string | null;
  screen: string;
  dirty: boolean;
}): SuiteDuRaccourci {
  if (etat.demande !== RACCOURCI_SCAN) return { faire: 'rien' };
  // On est DÉJÀ en train de scanner, ou sur le point de l'être :
  // recommencer jetterait le relevé en cours, et ces écrans ne se quittent
  // pas au milieu.
  if (etat.screen === 'scan' || etat.screen === 'camera') return { faire: 'rien' };
  if (etat.screen === 'home' || !etat.dirty) return { faire: 'scanner' };
  return {
    faire: 'dire',
    message:
      'Enregistrez le plan en cours avant de démarrer un nouveau relevé.',
  };
}

/**
 * Le module natif se cherche À CHAQUE APPEL, comme pour l'haptique : sur
 * appareil, l'ordre d'enregistrement des modules n'est pas garanti.
 */
const natif = (): { prendre?: () => Promise<string | null> } | undefined =>
  Platform.OS === 'ios' ? NativeModules.RoomScanRaccourci : undefined;

/**
 * PREND la demande en attente — et l'efface du même geste.
 *
 * « Prendre » et non « lire » : une demande qui reste écrite redémarre un
 * scan à chaque retour au premier plan. On quitte l'application pour prendre
 * une photo, on revient, et le relevé recommence.
 */
export async function prendreLaDemande(): Promise<string | null> {
  try {
    const m = natif();
    if (!m?.prendre) return null;
    return await m.prendre();
  } catch {
    // Jamais bloquant : un raccourci qui lève emporterait le lancement.
    return null;
  }
}

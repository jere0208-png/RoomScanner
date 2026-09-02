/**
 * TENIR L'ÉCRAN ALLUMÉ — pendant qu'on montre, et jamais après.
 *
 * C'est LE défaut du mode présentation, et il ne se voit qu'en s'en
 * servant : on tend le téléphone au client, on retire la main de l'écran —
 * et iOS baisse la luminosité au bout de trente secondes, puis verrouille.
 * Une visite guidée dure plus que ça. Le seul geste qui la sauve, c'est de
 * retoucher l'écran, c'est-à-dire d'interrompre exactement ce qu'on était
 * en train de montrer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ON COMPTE LES PRENEURS, ET LE NATIF N'ENTEND QUE LES PASSAGES DE ZÉRO.
 *
 * Une veille prise deux fois et rendue une fois doit rester tenue : sans
 * compteur, le premier qui rend éteint l'écran du second. Et la garde de
 * l'autre côté vaut autant — un `useEffect` nettoyé deux fois ferait passer
 * le compteur SOUS zéro, et l'écran ne se rallumerait plus de toute la
 * session : le téléphone se vide dans la poche, et personne ne fait le
 * rapprochement avec une présentation d'il y a deux heures.
 *
 * LE MODULE NATIF SE CHERCHE À CHAQUE APPEL, comme pour l'haptique : sur
 * appareil, l'ordre d'enregistrement des modules n'est pas garanti, et un
 * `undefined` capturé au chargement couperait la veille pour de bon.
 */
import { NativeModules, Platform } from 'react-native';

const natif = (): { garderEveille?: (oui: boolean) => void } | undefined =>
  Platform.OS === 'ios' ? NativeModules.RoomScanEcran : undefined;

let preneurs = 0;

function dire(oui: boolean): void {
  try {
    natif()?.garderEveille?.(oui);
  } catch {
    // Jamais bloquant : une veille qui lève emporterait la présentation
    // qu'elle était censée protéger.
  }
}

/**
 * Retient l'écran allumé. Rend la fonction qui le relâche — appelable
 * plusieurs fois sans dommage.
 */
export function prendreLaVeille(): () => void {
  preneurs += 1;
  if (preneurs === 1) dire(true);
  let rendu = false;
  return () => {
    if (rendu) return;
    rendu = true;
    preneurs = Math.max(0, preneurs - 1);
    if (preneurs === 0) dire(false);
  };
}

/** Combien de preneurs tiennent l'écran. Pour les bancs, et pour le doute. */
export function veilleTenue(): number {
  return preneurs;
}

/** Remet le compteur à neuf — les bancs, qui partagent le même module. */
export function resetVeille(): void {
  preneurs = 0;
}

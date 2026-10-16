/**
 * LE CHEF D'ORCHESTRE DU MODE DIAGNOSTIC — un seul endroit pour tout allumer
 * et tout éteindre, pour qu'App n'ait pas à connaître les trois morceaux.
 *
 * Allumé : le natif arme l'écran en boucle, les gestes et le bouton flottant
 * (`Diagnostic.demarrer`), les capteurs remplissent le journal, et l'écoute de
 * l'événement `envoyer` est posée. Éteint : tout se défait, et le journal se
 * vide — rien ne traîne entre deux sessions.
 *
 * IDEMPOTENT : App peut appeler `activer` à chaque rendu sans rien doubler.
 */
import { Diagnostic } from 'react-native-room-scan';
import { brancher, debrancher } from './capteurs';
import { demarrerEnvoi, arreterEnvoi } from './envoi';
import { viderJournal } from './journal';

let actif = false;

export function activerDiagnostic(): void {
  if (actif) return;
  actif = true;
  brancher();
  demarrerEnvoi();
  Diagnostic.demarrer().catch(() => {
    // Sans natif (banc, Android), les capteurs JS tournent quand même : le
    // diagnostic a moins à envoyer, mais il n'est pas vide.
  });
}

export function desactiverDiagnostic(): void {
  if (!actif) return;
  actif = false;
  Diagnostic.arreter().catch(() => {});
  arreterEnvoi();
  debrancher();
  viderJournal();
}

/** Pour le banc : l'orchestre joue-t-il ? */
export function diagnosticActif(): boolean {
  return actif;
}

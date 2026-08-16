/**
 * Retour haptique — la main sait des choses avant l'œil.
 *
 * Un plan se manipule au doigt, et le doigt cache justement ce qu'il
 * déplace. Trois moments méritent une secousse : la BUTÉE (le meuble touche
 * le mur, inutile de pousser plus), l'ACCROCHE (l'appareil s'est rangé à
 * l'entraxe, l'angle est tombé pile sur le quart de tour) et l'AVIS (une
 * pose sort de la norme).
 *
 * Deux règles de conduite, sans lesquelles l'utilisateur coupe l'haptique
 * dans les réglages du téléphone :
 *
 * 1. **Jamais en rafale.** Un glissement contre un mur produit soixante
 *    « butée » par seconde si on ne filtre pas ; on n'en garde qu'une par
 *    120 ms, et une répétition ne se déclenche que si le geste a d'abord
 *    quitté l'état qui l'a provoquée (`releaseHaptic`).
 * 2. **Jamais bloquant.** Le module natif peut manquer — simulateur,
 *    Android, tests — et l'appel doit alors ne rien faire, sans lever.
 */
import { NativeModules, Platform } from 'react-native';

export type HapticKind = 'leger' | 'butee' | 'accroche' | 'succes' | 'alerte';

/**
 * Le module natif se cherche À CHAQUE APPEL, pas au chargement : sur
 * appareil l'ordre d'enregistrement des modules n'est pas garanti, et un
 * `undefined` capturé une fois pour toutes couperait l'haptique pour de bon.
 */
const natif = (): { tap?: (kind: string) => void } | undefined =>
  Platform.OS === 'ios' ? NativeModules.RoomScanHaptics : undefined;

/** Écart minimal entre deux secousses de même nature (ms). */
const REPOS = 120;

const dernier = new Map<HapticKind, number>();
/** États « en cours » : une butée maintenue ne re-déclenche pas. */
const tenu = new Set<HapticKind>();

/**
 * Une secousse, si elle a lieu d'être.
 *
 * `once` : ne rejoue pas tant que `releaseHaptic` n'a pas été appelé — c'est
 * ce qui distingue « je viens de toucher le mur » de « je pousse contre le
 * mur depuis deux secondes ».
 */
export function haptic(kind: HapticKind, once = false): boolean {
  if (once && tenu.has(kind)) return false;
  const now = Date.now();
  const avant = dernier.get(kind) ?? -Infinity;
  if (now - avant < REPOS) return false;
  dernier.set(kind, now);
  if (once) tenu.add(kind);
  try {
    natif()?.tap?.(kind);
  } catch {
    // Un retour haptique absent n'a jamais empêché personne de dessiner.
  }
  return true;
}

/** Le geste a quitté l'état : la prochaine occurrence pourra se sentir. */
export function releaseHaptic(kind: HapticKind): void {
  tenu.delete(kind);
}

/** Remet le filtre à zéro (tests, changement d'écran). */
export function resetHaptics(): void {
  dernier.clear();
  tenu.clear();
}

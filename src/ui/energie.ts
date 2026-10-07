/**
 * CE QU'UN SCAN A COÛTÉ — la phrase du Diagnostic.
 *
 * Relevé du patron : « la recherche scan de l'app consomme beaucoup de
 * batterie ». Avant de promettre mieux, il faut un chiffre : le natif relève
 * le niveau de batterie au départ et à la fin de chaque scan (à 1 % près,
 * c'est la résolution d'iOS), sa durée, et l'état thermique. On l'écrit en
 * une ligne, pour comparer un scan à l'autre — et une version à l'autre.
 */
import type { EnergieDuScan } from 'react-native-room-scan';

/** « frais », « tiède », « chaud », « brûlant » : les mots du natif. */
export function phraseEnergie(e: EnergieDuScan): string {
  const s = Math.max(0, Math.round(e.secondes));
  const duree =
    s < 60
      ? `${s} s`
      : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  const batterie =
    typeof e.batterie !== 'number'
      ? 'batterie non lue'
      : e.batterie < 1
      ? 'moins de 1 % de batterie'
      : `−${Math.round(e.batterie)} % de batterie`;
  const chaleur = e.thermique ? ` · iPhone ${e.thermique}` : '';
  return `${duree} · ${batterie}${chaleur}`;
}

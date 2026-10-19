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

/** Ce que le natif signale PENDANT le scan : la chaleur, la batterie basse. */
export interface EtatEnergie {
  /** « chaud » ou « brûlant » (état thermique sérieux ou critique) ; absent sinon. */
  thermique?: string;
  /** Le niveau de batterie, en %, seulement sous 15 % et hors charge. */
  batterie?: number;
}

/**
 * LE TÉLÉPHONE PRÉVIENT AVANT DE LÂCHER — agent testeur SCAN, manque relevé :
 * la chaleur et la batterie n'étaient mesurées qu'APRÈS le scan, dans le
 * Diagnostic. Vingt minutes de LiDAR dans une maison, et l'iPhone s'éteint ou
 * bride la caméra au milieu du dernier étage : le relevé en cours est perdu.
 * Le bandeau le dit pendant qu'il est temps de terminer, en une phrase qui
 * dit quoi faire. Le plus urgent passe devant ; rien quand tout va bien.
 */
export function alerteEnergie(e: EtatEnergie | null): string | null {
  if (!e) return null;
  if (e.thermique === 'brûlant') return 'iPhone brûlant : terminez le scan maintenant, puis laissez-le refroidir.';
  if (typeof e.batterie === 'number' && e.batterie <= 7) {
    return `Batterie à ${e.batterie} % : terminez le scan maintenant pour garder le relevé.`;
  }
  if (e.thermique === 'chaud') {
    return 'L’iPhone chauffe : terminez ce passage, et reprenez plus tard avec « Scanner une pièce ».';
  }
  if (typeof e.batterie === 'number') return `Batterie à ${e.batterie} % : pensez à terminer bientôt.`;
  return null;
}

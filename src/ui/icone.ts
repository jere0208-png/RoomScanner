/**
 * L'ICÔNE DE L'APPLICATION — quatre habits, un seul glyphe.
 *
 * Seconde moitié de la neuvième amélioration. La teinte d'accent habille
 * l'application ; l'icône habille l'écran d'accueil. Les deux vont ensemble
 * et se règlent au même endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MAIS ELLES RESTENT DEUX RÉGLAGES, et c'est iOS qui l'impose : changer
 * d'icône fait apparaître une alerte du système — « Vous avez changé l'icône
 * de EchoPlan » —, qu'aucune application ne peut supprimer. Lier les deux
 * ferait surgir cette alerte à chaque essai de teinte, c'est-à-dire trois
 * fois de suite pendant qu'on compare. Deux réglages, deux gestes.
 *
 * LE GLYPHE NE CHANGE JAMAIS. C'est lui qu'on reconnaît au pouce, sans lire,
 * parmi cent icônes : une icône dont la forme change n'est plus la même
 * application. Seul l'habit change.
 *
 * ET RIEN NE BLOQUE. Le module natif peut manquer — simulateur, Android,
 * bancs — et l'appel doit alors ne rien faire, sans lever : une icône qu'on
 * ne peut pas changer est un désagrément, une application qui s'arrête en
 * essayant est une panne.
 */
import { NativeModules, Platform } from 'react-native';

export interface Icone {
  /** La même clé que la teinte d'accent qui lui correspond. */
  cle: string;
  nom: string;
  /** Le nom du jeu dans le catalogue, ou `null` pour l'icône d'origine. */
  natif: string | null;
}

/** L'icône d'origine : fond clair, glyphe d'encre. */
export const ICONE_DEFAUT = 'bleu';

/*
  UNE ICÔNE PAR TEINTE, ET LES MÊMES CLÉS.

  Deux listes qui divergeraient donneraient une teinte sans habit, ou un
  habit qu'aucun réglage ne propose. Elles se règlent l'une à côté de
  l'autre ; le banc vérifie qu'elles se correspondent.
*/
export const ICONES: Icone[] = [
  { cle: ICONE_DEFAUT, nom: 'Claire', natif: null },
  { cle: 'indigo', nom: 'Indigo', natif: 'AppIcon-Indigo' },
  { cle: 'prune', nom: 'Prune', natif: 'AppIcon-Prune' },
  { cle: 'graphite', nom: 'Graphite', natif: 'AppIcon-Graphite' },
];

const PAR_CLE = new Map(ICONES.map((i) => [i.cle, i]));

/** Cette clé désigne-t-elle une icône connue ? */
export function estUneIcone(cle: unknown): boolean {
  return typeof cle === 'string' && PAR_CLE.has(cle);
}

/**
 * Le nom du jeu à demander au système, ou `null`.
 *
 * `null` pour l'icône d'origine — c'est ce qu'attend
 * `setAlternateIconName(nil)` — et `null` aussi pour une clé inconnue, qui
 * remet alors l'origine plutôt que de laisser l'écran d'accueil sur un habit
 * dont le réglage ne parle plus.
 */
export function nomNatifDIcone(cle: string | null | undefined): string | null {
  if (!cle) return null;
  return PAR_CLE.get(cle)?.natif ?? null;
}

/**
 * Le module natif se cherche À CHAQUE APPEL, comme pour l'haptique : sur
 * appareil, l'ordre d'enregistrement des modules n'est pas garanti, et un
 * `undefined` capturé au chargement couperait le réglage pour de bon.
 */
const natif = ():
  | { poser?: (nom: string | null) => Promise<boolean> }
  | undefined => (Platform.OS === 'ios' ? NativeModules.RoomScanIcone : undefined);

/**
 * Pose l'icône de l'application. Rend `false` si le système a refusé — ou
 * s'il n'y a pas de système en face.
 */
export async function poserIcone(cle: string | null): Promise<boolean> {
  try {
    const m = natif();
    if (!m?.poser) return false;
    return await m.poser(nomNatifDIcone(cle));
  } catch {
    // Jamais bloquant : voir l'en-tête.
    return false;
  }
}

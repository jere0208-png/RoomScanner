/**
 * FAIRE PARLER VOICEOVER — ce qui apparaît tout seul doit être dit.
 *
 * Revue d'accessibilité : les messages qui naissent sans qu'on les ait
 * demandés (« Mur validé », « Image prête », un refus de saisie, la bulle
 * « Aucun appareil à afficher… ») reposaient sur `accessibilityLiveRegion`.
 * C'est une prop ANDROÏDE : iOS l'ignore, et l'app n'existe que sur iPhone.
 * Aucun de ces messages n'était donc prononcé. On les garde (sans effet,
 * mais sans danger, pour une future version Android) et l'on annonce là où
 * le message naît, avec l'appel que VoiceOver entend vraiment.
 *
 * Deux règles :
 *
 * 1. **Jamais en rafale.** Le même texte, redemandé dans la seconde et
 *    demie (un rendu de plus, un état qui clignote), ne se répète pas.
 * 2. **Jamais bloquant.** Sans module (tests, simulateur), l'appel ne fait
 *    rien et ne lève pas.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Écart minimal avant de répéter la même phrase (ms). */
export const REPOS_ANNONCE = 1500;

let derniere: { texte: string; t: number } | null = null;

/**
 * Prononce `texte` si VoiceOver est actif (l'appel ne fait rien sinon).
 * La phrase passe APRÈS celle en cours plutôt que de la couper : un
 * « Mur validé » ne doit pas avaler le nom du bouton qu'on vient de toucher.
 */
export function annoncer(texte: string | null | undefined): boolean {
  const t = (texte ?? '').trim();
  if (!t) return false;
  const maintenant = Date.now();
  if (derniere && derniere.texte === t && maintenant - derniere.t < REPOS_ANNONCE) return false;
  derniere = { texte: t, t: maintenant };
  try {
    const avecOptions = AccessibilityInfo.announceForAccessibilityWithOptions;
    if (typeof avecOptions === 'function') avecOptions(t, { queue: true });
    else AccessibilityInfo.announceForAccessibility?.(t);
  } catch {
    // Une annonce perdue n'a jamais empêché personne de travailler.
  }
  return true;
}

/** Remet le filtre à zéro (tests). */
export function oublierAnnonces(): void {
  derniere = null;
}

/*
  LE LECTEUR D'ÉCRAN EST-IL ACTIF ? Lu une fois et suivi, comme
  « Réduire les animations » (voir `useReduceMotion`) : le dernier état
  connu se garde au niveau du module, pour une décision à l'instant.
*/
let lecteurConnu = false;

/** La dernière valeur lue, sans attendre. */
export function lecteurDEcranActif(): boolean {
  return lecteurConnu;
}

export function useLecteurDEcran(): boolean {
  const [actif, setActif] = useState(lecteurConnu);
  useEffect(() => {
    let vivant = true;
    let courant = lecteurConnu;
    const poser = (v: boolean) => {
      lecteurConnu = !!v;
      // Rien à rendre si rien ne change — le cas de presque tout le monde.
      if (vivant && !!v !== courant) {
        courant = !!v;
        setActif(!!v);
      }
    };
    Promise.resolve(AccessibilityInfo.isScreenReaderEnabled?.())
      .then((v) => poser(!!v))
      .catch(() => undefined);
    let abonnement: { remove: () => void } | undefined;
    try {
      abonnement = AccessibilityInfo.addEventListener?.('screenReaderChanged', poser);
    } catch {
      abonnement = undefined;
    }
    return () => {
      vivant = false;
      abonnement?.remove?.();
    };
  }, []);
  return actif;
}

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * « RÉDUIRE LES ANIMATIONS » — le réglage d'iOS, lu une fois et suivi.
 *
 * Deux composants le lisaient déjà chacun de leur côté (la bulle, le film
 * du tutoriel), à l'instant de jouer et sans l'écouter : un réglage changé
 * pendant que l'écran est ouvert n'était vu qu'au montage suivant. La levée
 * de la maquette et la pastille d'outil s'y ajoutent (revue I5) — on écrit
 * donc la lecture une fois, avec son écouteur.
 *
 * Le dernier état connu est gardé au niveau du module : un composant monté
 * après la première lecture part de la bonne valeur, sans attendre la
 * réponse asynchrone (et sans jouer une seconde d'animation pour rien).
 */
let dernierConnu = false;

/** La dernière valeur lue, sans attendre : pour une décision à l'instant. */
export function reduireLesAnimations(): boolean {
  return dernierConnu;
}

export function useReduceMotion(): boolean {
  const [reduit, setReduit] = useState(dernierConnu);
  useEffect(() => {
    let vivant = true;
    let courant = dernierConnu;
    const poser = (r: boolean) => {
      dernierConnu = !!r;
      // Rien à rendre si rien ne change — le cas de presque tout le monde.
      if (vivant && !!r !== courant) {
        courant = !!r;
        setReduit(!!r);
      }
    };
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
      .then((r) => poser(!!r))
      .catch(() => undefined);
    let abonnement: { remove: () => void } | undefined;
    try {
      abonnement = AccessibilityInfo.addEventListener?.('reduceMotionChanged', poser);
    } catch {
      abonnement = undefined;
    }
    return () => {
      vivant = false;
      abonnement?.remove?.();
    };
  }, []);
  return reduit;
}

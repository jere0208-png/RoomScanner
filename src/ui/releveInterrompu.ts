/**
 * UN RELEVÉ INTERROMPU NE S'EFFACE PAS SANS QU'ON LE DEMANDE.
 *
 * Revue « Agathe » : seule la tuile « Scanner » posait la question. « Dessiner
 * un plan », « Voir un exemple », « Lire un plan papier », l'action d'une
 * notification et « Dis Siri, nouveau relevé » remettaient tout à zéro,
 * brouillon compris — le relevé de la veille, perdu d'un appui.
 *
 * Une seule garde, que chaque porte appelle : une porte qui naîtrait demain
 * n'aurait qu'à faire de même.
 */
import { useScanStore } from '../store/scanStore';
import { alerte } from './alerte';

/**
 * Fait `suite` — après avoir demandé, si un relevé interrompu attend.
 *
 * `quoi` dit ce qui le remplacera (« Un nouveau scan »), `geste` nomme le
 * bouton qui confirme (« Nouveau scan »).
 */
export function sansPerdreLeReleve(suite: () => void, quoi: string, geste: string): void {
  if (!useScanStore.getState().brouillon) {
    suite();
    return;
  }
  alerte(
    'Un relevé interrompu vous attend',
    `${quoi} le remplacera. Vous pouvez aussi le reprendre là où il en était.`,
    [
      { label: 'Annuler' },
      { label: 'Reprendre', onPress: () => useScanStore.getState().reprendreBrouillon() },
      { label: geste, danger: true, onPress: suite },
    ],
  );
}

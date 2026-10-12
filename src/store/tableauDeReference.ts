/**
 * LE TABLEAU DE RÉFÉRENCE, POUR TOUS LES DESSINS — la 3D, le mur, la visite,
 * le rendu réaliste et l'écran du plan lisent ce crochet, et lui seul (voir
 * `tableauDeReference`). Deux dessins qui calculeraient chacun le leur
 * finiraient par montrer deux tableaux : c'est exactement ce que le patron a
 * vu sur le plan d'exemple.
 */
import { useMemo } from 'react';
import type { TableauExistant } from '../geometry/existant';
import { circuitsDuLogement, surfaceDuLogement, tableauDeReference } from '../geometry/tableauFini';
import { useScanStore } from './scanStore';

export function useTableauDeReference(): { tableau: TableauExistant | null; projete: boolean } {
  const existant = useScanStore((s) => s.existant);
  const walls = useScanStore((s) => s.walls);
  const rooms = useScanStore((s) => s.rooms);
  const fixtures = useScanStore((s) => s.fixtures);
  const ceiling = useScanStore((s) => s.ceiling);
  return useMemo(() => {
    if (existant) return { tableau: existant, projete: false };
    const tableau = tableauDeReference(
      null,
      circuitsDuLogement(walls, rooms, fixtures, ceiling),
      surfaceDuLogement(walls, rooms) || undefined,
    );
    return { tableau, projete: tableau !== null };
  }, [existant, walls, rooms, fixtures, ceiling]);
}

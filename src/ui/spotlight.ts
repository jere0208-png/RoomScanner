/**
 * LES PLANS DANS LA RECHERCHE DE L'IPHONE.
 *
 * Relevé du patron : « améliore encore nativement l'application ». Un
 * électricien cherche un chantier par le nom du client ou par sa rue — pas
 * en ouvrant l'app, en faisant défiler la bibliothèque. Chaque plan
 * enregistré entre dans Spotlight (sur le téléphone seulement : l'index ne
 * quitte pas l'appareil) : on tape « Martin » ou « rue des Lilas » depuis
 * l'écran d'accueil d'iOS, et le plan s'ouvre.
 *
 * Le toucher passe par le même chemin que les raccourcis : `AppDelegate`
 * pose « ouvrir-plan:<id> » dans les réglages partagés, et `App.tsx` le
 * prend (voir `ui/raccourci`).
 */
import { NativeModules, Platform } from 'react-native';

/** Ce que Spotlight retient d'un plan. */
export interface FicheSpotlight {
  id: string;
  titre: string;
  description: string;
  motsCles: string[];
}

interface PlanIndexable {
  id: string;
  name: string;
  updatedAt: number;
  supprimeLe?: number;
  corbeille?: number;
  client?: string;
  address?: string;
  rooms?: readonly unknown[];
}

const MOIS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

/**
 * Les fiches des plans ENREGISTRÉS — un brouillon rangé en partant, qui
 * s'efface seul, n'a rien à faire dans la recherche du téléphone. Un plan à
 * la corbeille non plus (relevé « bug-fluidité ») : la bibliothèque le
 * cache, Spotlight le trouvait et l'ouvrait.
 */
export function fichesSpotlight(
  plans: readonly PlanIndexable[],
): FicheSpotlight[] {
  return plans
    .filter(p => !p.supprimeLe && !p.corbeille)
    .map(p => {
      const n = p.rooms?.length ?? 0;
      const d = new Date(p.updatedAt);
      const bouts = [
        p.client?.trim(),
        p.address?.trim(),
        n > 0 ? `${n} pièce${n > 1 ? 's' : ''}` : undefined,
        `modifié le ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`,
      ].filter((x): x is string => !!x);
      return {
        id: p.id,
        titre: p.name,
        description: bouts.join(' · '),
        motsCles: [
          'EchoPlan',
          'plan',
          'relevé',
          p.client?.trim(),
          p.address?.trim(),
        ].filter((x): x is string => !!x),
      };
    });
}

const natif = ():
  | { indexer?: (fiches: FicheSpotlight[]) => void }
  | undefined =>
  Platform.OS === 'ios' ? NativeModules.RoomScanRaccourci : undefined;

/** Remplace l'index des plans par celui-ci. Silencieux sans le natif. */
export function indexerLesPlans(plans: readonly PlanIndexable[]): void {
  try {
    natif()?.indexer?.(fichesSpotlight(plans));
  } catch {
    // Un index manqué n'est qu'une recherche moins riche.
  }
}

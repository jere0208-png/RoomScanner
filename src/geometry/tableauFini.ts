/**
 * LE TABLEAU FINI — ce que porte chaque organe, et le tableau qu'on déduit du
 * plan quand rien n'a encore été constitué.
 *
 * Relevé du patron, photo d'un coffret à l'appui : « avoir un rendu visuel du
 * tableau fini réaliste, avec le tableau que l'on a constitué […] avec les
 * notes sous chaque disjoncteur selon ce que l'on a mis (des icônes Solar de
 * prises, lumières…), avec leur pièce si possible ».
 *
 * Ce module ne dessine rien : il dit, pour chaque organe du rail, son repère
 * (« IG », « ID1 », « Q3 »), l'icône de ce qu'il commande, son calibre et la
 * pièce qu'il dessert. Le rendu (`components/TableauRealiste`) et sa légende
 * (`components/TableauFiniSheet`) les lisent.
 */
import type { IconeSolaire } from '../ui/solaires';
import { implanter, PAR_RANGEE_DEFAUT, RANGEES_MIN, type DepartExistant, type TableauExistant } from './existant';
import type { Circuit, Differential } from './nfc15100';

/** L'icône Solar de chaque usage du tableau (`USAGES_DU_TABLEAU`). */
const ICONE_DE_L_USAGE: Record<string, IconeSolaire> = {
  Éclairage: 'lumiere',
  Prises: 'prise',
  'Prises cuisine': 'cuisine',
  'Plaque de cuisson': 'cuisson',
  Four: 'four',
  'Lave-linge': 'laveLinge',
  'Lave-vaisselle': 'laveVaisselle',
  'Chauffe-eau': 'chauffeEau',
  Chauffage: 'chauffage',
  'Volets roulants': 'volets',
  VMC: 'ventilateur',
  Extérieur: 'exterieur',
  Garage: 'garage',
};

/** L'icône d'un organe : celle de son usage, ou celle de ce qu'il est. */
export function iconeDeLOrgane(d: Pick<DepartExistant, 'organe' | 'usage'>): IconeSolaire {
  switch (d.organe) {
    case 'interrupteur':
    case 'agcp':
      return 'general';
    case 'differentiel':
      return 'bouclier';
    case 'parafoudre':
      return 'parafoudre';
    case 'repartiteur':
      return 'elec';
    default:
      return (d.usage && ICONE_DE_L_USAGE[d.usage]) || 'elec';
  }
}

/** Ce qui s'écrit sous un organe du rail. */
export interface EtiquetteDuModule {
  id: string;
  /** « IG », « ID1 », « Q3 » — l'ordre du rail, de haut en bas, de gauche à droite. */
  repere: string;
  icone: IconeSolaire;
  /** « 16 A », « 30 mA AC ». */
  calibre?: string;
  usage?: string;
  piece?: string;
}

/**
 * LES ÉTIQUETTES DU RAIL, dans l'ordre où on les lit : rangée après rangée,
 * de gauche à droite. Les disjoncteurs (et ce qui en tient lieu) se numérotent
 * Q1, Q2… ; les différentiels ID1, ID2… ; l'interrupteur général IG, le
 * parafoudre PF, le répartiteur R, le disjoncteur d'abonné AG.
 */
export function etiquettesDuTableau(t: TableauExistant): Map<string, EtiquetteDuModule> {
  const impl = implanter(t);
  const ordre = [...impl.modules].sort((a, b) => a.rangee - b.rangee || a.debut - b.debut);
  const compte = new Map<string, number>();
  const suivant = (prefixe: string, seul: boolean) => {
    const n = (compte.get(prefixe) ?? 0) + 1;
    compte.set(prefixe, n);
    return seul && n === 1 ? prefixe : `${prefixe}${n}`;
  };
  const out = new Map<string, EtiquetteDuModule>();
  for (const { depart: d } of ordre) {
    const repere =
      d.organe === 'interrupteur'
        ? suivant('IG', true)
        : d.organe === 'agcp'
          ? suivant('AG', true)
          : d.organe === 'parafoudre'
            ? suivant('PF', true)
            : d.organe === 'repartiteur'
              ? suivant('R', true)
              : d.organe === 'differentiel'
                ? suivant('ID', false)
                : suivant('Q', false);
    const calibre =
      d.organe === 'differentiel'
        ? `${d.sensibilite ?? 30} mA${d.typeDiff ? ` ${d.typeDiff}` : ''}`
        : d.calibre
          ? `${d.calibre} A`
          : undefined;
    out.set(d.id, {
      id: d.id,
      repere,
      icone: iconeDeLOrgane(d),
      ...(calibre ? { calibre } : {}),
      ...(d.usage ? { usage: d.usage } : {}),
      ...(d.piece ? { piece: d.piece } : {}),
    });
  }
  return out;
}

/** L'usage du tableau d'un circuit du plan. */
function usageDuCircuit(c: Circuit): string | undefined {
  switch (c.nature) {
    case 'eclairage':
      return 'Éclairage';
    case 'prises':
      return /cuisine/i.test(c.label) ? 'Prises cuisine' : 'Prises';
    case 'cuisson':
      return 'Plaque de cuisson';
    case 'specialise':
      return 'Circuit spécialisé';
    case 'sortie':
      return 'Sortie de câble';
    default:
      return undefined;
  }
}

/**
 * LE TABLEAU QUE LE PLAN APPELLE — tant que rien n'a été constitué, c'est
 * lui qu'on montre : l'interrupteur général en tête, puis chaque différentiel
 * suivi de ses départs, une rangée par différentiel (une de plus s'il en
 * déborde). Les courants faibles, sans disjoncteur, n'y sont pas.
 */
export function tableauDepuisLePlan(circuits: Circuit[], differentiels: Differential[]): TableauExistant {
  const parLabel = new Map(circuits.map((c) => [c.label, c]));
  const departs: DepartExistant[] = [{ id: 'plan-ig', organe: 'interrupteur', calibre: 63, rangee: 0 }];
  const poses = new Set<string>();
  let rangee = 1;
  const departDe = (c: Circuit, r: number): DepartExistant => {
    const usage = usageDuCircuit(c);
    return {
      id: `plan-${c.id}`,
      organe: 'disjoncteur',
      calibre: c.breaker,
      rangee: r,
      ...(usage ? { usage } : {}),
      ...(c.rooms.length > 0 ? { piece: c.rooms.join(', ') } : {}),
    };
  };
  differentiels.forEach((d, i) => {
    const siens = d.circuits
      .map((l) => parLabel.get(l))
      .filter((c): c is Circuit => !!c && c.breaker !== null);
    let r = rangee;
    let rempli = 2;
    departs.push({
      id: `plan-id${i + 1}`,
      organe: 'differentiel',
      calibre: d.rating,
      sensibilite: 30,
      typeDiff: d.type,
      rangee: r,
    });
    for (const c of siens) {
      if (rempli + 1 > PAR_RANGEE_DEFAUT) {
        r += 1;
        rempli = 0;
      }
      departs.push(departDe(c, r));
      poses.add(c.id);
      rempli += 1;
    }
    rangee = r + 1;
  });
  // Ce qu'aucun différentiel ne reprend : une rangée de plus, à la suite.
  const restes = circuits.filter((c) => c.breaker !== null && !poses.has(c.id));
  if (restes.length > 0) {
    let r = rangee;
    let rempli = 0;
    for (const c of restes) {
      if (rempli + 1 > PAR_RANGEE_DEFAUT) {
        r += 1;
        rempli = 0;
      }
      departs.push(departDe(c, r));
      rempli += 1;
    }
    rangee = r + 1;
  }
  return { departs, rangees: Math.max(RANGEES_MIN, rangee), parRangee: PAR_RANGEE_DEFAUT };
}

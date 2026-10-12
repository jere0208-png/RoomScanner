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
import { filtrerAuNiveau, niveauxPresents, roomParts, type RoomShape, type WallSeg } from './floorplan';
import type { CeilingFixture } from './ceiling';
import type { Fixture } from './electrical';
import {
  fixturePlacement,
  planCircuits,
  planDifferentials,
  roomInputsOf,
  priseDeCuisine,
  type Circuit,
  type Differential,
  circuitsDuDifferentiel,
} from './nfc15100';
import type { RoomKind } from './furniture';

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
    // Par identifiant : deux circuits du même libellé restent deux (revue « Nicolas »).
    const siens = circuitsDuDifferentiel(d, circuits).filter((c) => c.breaker !== null);
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

/**
 * LES CIRCUITS DE TOUT LE LOGEMENT — tous niveaux confondus : un tableau
 * dessert la maison entière. Chaque appareil est rattaché à sa pièce sur
 * SON niveau, comme le fait l'écran du plan, puis les circuits se forment
 * sur l'ensemble.
 */
export function circuitsDuLogement(
  walls: WallSeg[],
  rooms: (RoomShape & { id: string; name?: string; kind?: RoomKind | null; niveau?: number })[],
  fixtures: Fixture[],
  ceiling: CeilingFixture[],
): Circuit[] {
  if (fixtures.length === 0 && ceiling.length === 0) return [];
  const placement = new Map<string, string>();
  for (const n of niveauxPresents(walls, rooms)) {
    const x = filtrerAuNiveau(
      { walls, openings: [], rooms, fixtures, photos: [], objects: [], ceiling },
      n,
    );
    if (x.fixtures.length === 0) continue;
    const nommees = x.rooms.map((r) => ({ ...r, name: r.name ?? '' }));
    const p = fixturePlacement(x.fixtures, x.walls, roomInputsOf(nommees, roomParts(x.walls, x.rooms)));
    for (const [k, v] of p) placement.set(k, v);
  }
  const pieceDe = (f: Fixture) => rooms.find((r) => r.id === placement.get(f.id));
  return planCircuits(
    fixtures,
    (f) => pieceDe(f)?.name ?? '',
    (f) => priseDeCuisine(f, pieceDe(f)),
    (f) => pieceDe(f)?.id,
    ceiling,
  );
}

/**
 * LE TABLEAU DE RÉFÉRENCE — relevé du patron : la 3D, le rendu réaliste et
 * la feuille d'édition doivent « correspondre en toute circonstance ».
 * Celui qu'on a constitué s'il existe (même vide : c'est un choix) ; sinon
 * celui que le plan appelle ; sinon rien.
 */
export function tableauDeReference(existant: TableauExistant | null | undefined, circuits: Circuit[]): TableauExistant | null {
  if (existant) return existant;
  if (!circuits.some((c) => c.breaker !== null)) return null;
  return tableauDepuisLePlan(circuits, planDifferentials(circuits));
}

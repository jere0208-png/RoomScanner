/**
 * Schémas d'installation : unifilaire et multifilaire.
 *
 * Deux documents que tout dossier électrique porte, et que l'app peut
 * déduire du relevé puisqu'elle connaît déjà les circuits :
 *
 * - **l'unifilaire** montre l'ARCHITECTURE : le branchement, les
 *   différentiels, un départ par circuit avec son calibre et sa section.
 *   Un trait par circuit, barré du nombre de conducteurs ;
 * - **le multifilaire** montre le CÂBLAGE d'un circuit : chaque conducteur
 *   séparément, avec sa couleur, du disjoncteur jusqu'aux appareils.
 *
 * Les couleurs ne sont pas décoratives, elles sont normatives (NF C 15-100,
 * qui reprend la CEI 60446) :
 *
 * | Conducteur | Couleur |
 * | ---------- | ------- |
 * | Phase | rouge, marron ou noir — jamais bleu ni vert/jaune |
 * | Neutre | bleu clair, réservé |
 * | Terre | vert/jaune, réservé, jamais autre chose |
 * | Navette (va-et-vient) | orange, violet — n'importe quelle couleur de phase |
 *
 * Ce module ne dessine rien : il produit la STRUCTURE des deux schémas. Le
 * PDF s'occupe du tracé, l'écran pourra s'en servir plus tard.
 */
import { FIXTURES, postsOf, type Fixture, type FixtureKind } from './electrical';
import type { Circuit, Differential } from './nfc15100';
import { conduitFor } from './conduits';

/** Rôle d'un conducteur, au sens de la norme. */
export type WireRole = 'phase' | 'neutre' | 'terre' | 'navette' | 'retour';

export interface Wire {
  role: WireRole;
  /** Couleur normalisée, en hexadécimal, pour le tracé. */
  color: string;
  /** Son nom en clair : c'est lui qu'on lit sur le schéma. */
  label: string;
  /** Section en mm². */
  section: number;
}

/** Les couleurs de la norme, et rien d'autre. */
export const WIRE_COLORS: Record<WireRole, { color: string; label: string }> = {
  phase: { color: '#B8352A', label: 'Phase — rouge' },
  neutre: { color: '#2E6FD6', label: 'Neutre — bleu clair' },
  terre: { color: '#5A9E31', label: 'Terre — vert/jaune' },
  navette: { color: '#D98324', label: 'Navette — orange' },
  retour: { color: '#7B4BA8', label: 'Retour de lampe — violet' },
};

/**
 * Les conducteurs d'un circuit.
 *
 * Trois fils pour un circuit de prises (phase, neutre, terre) ; un
 * éclairage simple allumage en compte autant plus le retour de lampe ; un
 * va-et-vient ajoute deux navettes. Un circuit de communication n'a ni
 * phase ni terre : ce sont des paires, on ne les colorie pas comme du 230 V.
 */
export function wiresOf(circuit: Circuit): Wire[] {
  const section = circuit.section ?? 0;
  if (circuit.section === null) {
    return [
      { role: 'phase', color: '#8A94A6', label: 'Paires torsadées', section: 0 },
    ];
  }
  const base: Wire[] = [
    { role: 'phase', ...WIRE_COLORS.phase, section },
    { role: 'neutre', ...WIRE_COLORS.neutre, section },
    { role: 'terre', ...WIRE_COLORS.terre, section },
  ];
  if (circuit.nature !== 'eclairage') return base;
  return [
    ...base,
    { role: 'retour', ...WIRE_COLORS.retour, section },
    { role: 'navette', ...WIRE_COLORS.navette, section },
    { role: 'navette', ...WIRE_COLORS.navette, section },
  ];
}

export interface SchemaRow {
  /** Repère porté sur le plan et sur le tableau : C1, C2… */
  mark: string;
  circuitId: string;
  label: string;
  /** Calibre du disjoncteur, nul en courants faibles. */
  breaker: number | null;
  section: number | null;
  conduit: number;
  /** Nombre de conducteurs du départ. */
  wires: number;
  /** Ce que le départ dessert, en clair. */
  points: string;
  /** Différentiel qui le protège, s'il y en a un. */
  under?: string;
}

/** Un repère par circuit, dans l'ordre du tableau : C1, C2, C3… */
export function circuitMarks(circuits: Circuit[]): Map<string, string> {
  return new Map(circuits.map((c, i) => [c.id, `C${i + 1}`]));
}

/** Le repère de chaque APPAREIL : c'est lui qu'on lit sur le plan. */
export function fixtureMarks(circuits: Circuit[]): Map<string, string> {
  const marks = circuitMarks(circuits);
  const out = new Map<string, string>();
  for (const c of circuits) {
    for (const id of c.fixtureIds) out.set(id, marks.get(c.id) ?? '');
  }
  return out;
}

/** Ce que dessert un départ, en toutes lettres. */
function pointsOf(circuit: Circuit, fixtures: Fixture[]): string {
  const parType = new Map<FixtureKind, number>();
  for (const id of circuit.fixtureIds) {
    const f = fixtures.find((x) => x.id === id);
    if (!f) continue;
    for (const k of postsOf(f.kind)) {
      parType.set(k, (parType.get(k) ?? 0) + 1);
    }
  }
  if (parType.size === 0) return '—';
  return [...parType.entries()]
    .map(([k, n]) => `${n} × ${FIXTURES[k].label.toLowerCase()}`)
    .join(', ');
}

/**
 * L'unifilaire, ligne par ligne, dans l'ordre du tableau.
 *
 * On ne réinvente pas les circuits : ce sont ceux qui protègent déjà
 * l'installation dans la liste du matériel. Le schéma ne fait que les
 * mettre en forme — un document qui contredirait la liste ne servirait à
 * rien.
 */
export function schemaRows(
  circuits: Circuit[],
  differentials: Differential[],
  fixtures: Fixture[],
): SchemaRow[] {
  const marks = circuitMarks(circuits);
  const protecteur = new Map<string, string>();
  differentials.forEach((d, i) => {
    for (const nom of d.circuits) protecteur.set(nom, `ID${i + 1}`);
  });
  return circuits.map((c) => ({
    mark: marks.get(c.id) ?? '',
    circuitId: c.id,
    label: c.label,
    breaker: c.breaker,
    section: c.section,
    conduit: conduitFor(c.section),
    wires: wiresOf(c).length,
    points: pointsOf(c, fixtures),
    under: protecteur.get(c.label),
  }));
}

/**
 * Le multifilaire d'un circuit : les conducteurs, et ce qu'ils relient.
 *
 * On s'en tient à ce que le relevé sait vraiment — le nombre d'appareils et
 * leur nature. Un vrai multifilaire de va-et-vient dépend du câblage choisi
 * sur place ; celui-ci montre le principe, avec les bonnes couleurs et le
 * bon nombre de fils, ce qui est déjà ce qu'on vérifie sur un dossier.
 */
export interface MultiWireSchema {
  mark: string;
  label: string;
  wires: Wire[];
  /** Appareils desservis, dans l'ordre du plan. */
  devices: { id: string; kind: FixtureKind; label: string }[];
  note?: string;
}

export function multiWire(
  circuit: Circuit,
  fixtures: Fixture[],
  mark: string,
): MultiWireSchema {
  const devices = circuit.fixtureIds
    .map((id) => fixtures.find((f) => f.id === id))
    .filter((f): f is Fixture => !!f)
    .map((f) => ({ id: f.id, kind: f.kind, label: FIXTURES[f.kind].label }));
  const commandes = devices.filter((d) =>
    ['inter', 'inter2', 'inter3', 'va', 'poussoir', 'variateur'].includes(d.kind),
  ).length;
  return {
    mark,
    label: circuit.label,
    wires: wiresOf(circuit),
    devices,
    note:
      circuit.nature === 'eclairage' && commandes > 1
        ? 'Deux commandes ou plus : va-et-vient, deux navettes entre les ' +
          'boîtiers, retour de lampe au point lumineux.'
        : circuit.section === null
        ? 'Courants faibles : paires torsadées, jamais dans la même gaine ' +
          'que la puissance.'
        : undefined,
  };
}

/**
 * La teinte d'un circuit — la MÊME à l'écran et sur le PDF.
 *
 * Un repère « C3 » écrit en noir sur le plan et tracé en vert sur le schéma,
 * c'est deux documents qui parlent du même départ sans se ressembler. Sur le
 * chantier, on suit la couleur avant de lire le texte : elle doit donc être
 * décidée UNE fois, ici, et non dans chaque module qui dessine.
 *
 * Douze teintes, distinctes entre elles et lisibles sur fond blanc comme sur
 * un aplat de sol. Au-delà de douze départs on recommence la roue : deux
 * circuits de même teinte restent distingués par leur repère, et une
 * installation qui dépasse douze départs a de toute façon son tableau pour
 * référence.
 */
const ROUE = [
  '#2F6BFF', '#B8352A', '#2E8B57', '#8A5CD1', '#C77A18', '#0F8C9E',
  '#B5326E', '#5C7A1E', '#3757A8', '#A34D2A', '#6B4FA0', '#127A5E',
] as const;

export function circuitColor(index: number): string {
  return ROUE[((index % ROUE.length) + ROUE.length) % ROUE.length];
}

/**
 * La teinte d'après le repère (« C3 » → la troisième). Les repères sont
 * numérotés dans l'ordre du tableau, ce qui suffit à retrouver le rang sans
 * traîner la liste des circuits jusqu'au composant qui dessine.
 */
export function markColor(mark: string): string {
  const n = parseInt(mark.replace(/^\D+/, ''), 10);
  return circuitColor(Number.isFinite(n) && n > 0 ? n - 1 : 0);
}

/**
 * Les schémas unifilaire et multifilaire.
 *
 * Un dossier électrique en porte toujours deux : l'unifilaire pour
 * l'architecture (ce qui part du tableau, sous quelle protection), le
 * multifilaire pour le câblage (quel fil va où, de quelle couleur). Les
 * couleurs ne sont pas décoratives — bleu et vert/jaune sont RÉSERVÉS, et
 * un schéma qui les emploierait à tort est faux avant même d'être lu.
 */
import {
  WIRE_COLORS,
  circuitMarks,
  fixtureMarks,
  multiWire,
  schemaRows,
  wiresOf,
} from '../src/geometry/schema';
import type { Circuit, Differential } from '../src/geometry/nfc15100';
import type { Fixture } from '../src/geometry/electrical';

const circuit = (
  id: string,
  label: string,
  nature: Circuit['nature'],
  section: number | null,
  breaker: number | null,
  fixtureIds: string[],
): Circuit => ({
  id,
  label,
  nature,
  points: fixtureIds.length,
  section,
  breaker,
  rooms: ['Séjour'],
  fixtureIds,
});

const fx = (id: string, kind: Fixture['kind']): Fixture => ({
  id,
  kind,
  wallId: 'n',
  along: 1,
  height: 0.25,
  side: 1,
});

const PRISES = circuit('c1', 'Prises 1', 'prises', 2.5, 20, ['a', 'b']);
const LUM = circuit('c2', 'Éclairage 1', 'eclairage', 1.5, 16, ['l', 'i', 'j']);
const VDI = circuit('c3', 'Courants faibles', 'vdi', null, null, ['r']);
const FIXTURES = [
  fx('a', 'prise'),
  fx('b', 'prise2'),
  fx('l', 'applique'),
  fx('i', 'inter'),
  fx('j', 'va'),
  fx('r', 'rj45'),
];

describe('les couleurs sont celles de la norme', () => {
  it('le neutre est bleu, la terre vert/jaune, et rien d’autre ne l’est', () => {
    const bleu = WIRE_COLORS.neutre.color;
    const vert = WIRE_COLORS.terre.color;
    const autres = (['phase', 'navette', 'retour'] as const).map(
      (r) => WIRE_COLORS[r].color,
    );
    expect(autres).not.toContain(bleu);
    expect(autres).not.toContain(vert);
    expect(WIRE_COLORS.neutre.label).toMatch(/bleu/i);
    expect(WIRE_COLORS.terre.label).toMatch(/vert/i);
  });

  it('un circuit de prises : phase, neutre, terre', () => {
    const w = wiresOf(PRISES);
    expect(w.map((x) => x.role)).toEqual(['phase', 'neutre', 'terre']);
    expect(w.every((x) => x.section === 2.5)).toBe(true);
  });

  it('un circuit d’éclairage ajoute le retour de lampe et deux navettes', () => {
    const w = wiresOf(LUM);
    expect(w.filter((x) => x.role === 'navette')).toHaveLength(2);
    expect(w.some((x) => x.role === 'retour')).toBe(true);
    expect(w.every((x) => x.section === 1.5)).toBe(true);
  });

  it('les courants faibles ne se colorient pas comme du 230 V', () => {
    const w = wiresOf(VDI);
    expect(w).toHaveLength(1);
    expect(w[0].label).toMatch(/paires/i);
    expect(w[0].color).not.toBe(WIRE_COLORS.phase.color);
  });
});

describe('l’unifilaire', () => {
  const diffs: Differential[] = [
    { label: 'Différentiel type A 1', type: 'A', rating: 40, circuits: ['Prises 1'] },
    {
      label: 'Différentiel type AC 1',
      type: 'AC',
      rating: 40,
      circuits: ['Éclairage 1'],
    },
  ];
  const rows = schemaRows([PRISES, LUM, VDI], diffs, FIXTURES);

  it('numérote les départs dans l’ordre du tableau', () => {
    expect(rows.map((r) => r.mark)).toEqual(['C1', 'C2', 'C3']);
  });

  it('porte calibre, section, conduit et nombre de conducteurs', () => {
    expect(rows[0]).toMatchObject({
      breaker: 20,
      section: 2.5,
      conduit: 20,
      wires: 3,
    });
    expect(rows[1].wires).toBe(6);
    expect(rows[2].breaker).toBeNull();
  });

  it('dit ce que chaque départ dessert, poste par poste', () => {
    // Une prise simple plus une prise double : trois socles.
    expect(rows[0].points).toContain('3 ×');
    expect(rows[0].points).toMatch(/prise/i);
  });

  it('rattache chaque départ à son différentiel', () => {
    expect(rows[0].under).toBe('ID1');
    expect(rows[1].under).toBe('ID2');
    expect(rows[2].under).toBeUndefined();
  });

  it('le repère d’un appareil est celui de SON circuit', () => {
    const marks = fixtureMarks([PRISES, LUM, VDI]);
    expect(marks.get('a')).toBe('C1');
    expect(marks.get('i')).toBe('C2');
    expect(marks.get('r')).toBe('C3');
    expect(marks.get('inconnu')).toBeUndefined();
    expect(circuitMarks([PRISES]).get('c1')).toBe('C1');
  });
});

describe('le multifilaire', () => {
  it('liste les conducteurs et les appareils du circuit', () => {
    const m = multiWire(LUM, FIXTURES, 'C2');
    expect(m.mark).toBe('C2');
    expect(m.devices.map((d) => d.kind)).toEqual(['applique', 'inter', 'va']);
    expect(m.wires).toHaveLength(6);
  });

  it('prévient quand deux commandes imposent un va-et-vient', () => {
    const m = multiWire(LUM, FIXTURES, 'C2');
    expect(m.note).toMatch(/va-et-vient/i);
    expect(m.note).toMatch(/navettes/i);
  });

  it('rappelle qu’on ne mélange pas courants faibles et puissance', () => {
    const m = multiWire(VDI, FIXTURES, 'C3');
    expect(m.note).toMatch(/même gaine/i);
  });

  it('un circuit de prises n’a pas de note : il n’y a rien à préciser', () => {
    expect(multiWire(PRISES, FIXTURES, 'C1').note).toBeUndefined();
  });
});

/**
 * UNE COMMANDE ET SES POINTS NE SE SÉPARENT JAMAIS — revue « Karim » :
 * « Éclairage 1 » portait dix points, et l'interrupteur de la cuisine partait
 * sur un autre circuit que le plafonnier qu'il allume.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
import type { CeilingFixture } from '../src/geometry/ceiling';
import type { Fixture } from '../src/geometry/electrical';
import { MAX_LUMIERE, planCircuits } from '../src/geometry/nfc15100';
import { schemaRows } from '../src/geometry/schema';
import { chiffrer } from '../src/geometry/devis';
import { buyingList } from '../src/geometry/conduits';

const mur = (id: string, kind: Fixture['kind'], piece: string): Fixture =>
  ({ id, kind, wallId: piece, along: 1, height: 1.1, side: 1 }) as Fixture;
const dcl = (id: string, piece: string, commands: string[] = []): CeilingFixture =>
  ({ id, kind: 'dcl', roomId: piece, at: { x: 0, z: 0 }, commands }) as CeilingFixture;

const eclairages = (fixtures: Fixture[], ceiling: CeilingFixture[]) =>
  planCircuits(fixtures, (f) => f.wallId, () => false, (f) => f.wallId, ceiling).filter((c) => c.nature === 'eclairage');

describe('les circuits d’éclairage', () => {
  it('ne dépassent jamais huit points, même sans aucun lien', () => {
    const fixtures = [
      ...[1, 2, 3, 4].map((k) => mur(`a${k}`, 'applique', 'sejour')),
      ...[1, 2, 3, 4].map((k) => mur(`i${k}`, 'inter', 'sejour')),
    ];
    const ceiling = Array.from({ length: 12 }, (_, k) => dcl(`d${k}`, ['sejour', 'chambre', 'cuisine'][k % 3]));
    const c = eclairages(fixtures, ceiling);
    for (const x of c) expect(x.points).toBeLessThanOrEqual(MAX_LUMIERE);
    expect(c.reduce((t, x) => t + x.points, 0)).toBe(16);
  });

  it('gardent chaque interrupteur avec ce qu’il allume', () => {
    // Sept points au séjour et un ruban à la cuisine : le partage par rang
    // envoyait l'interrupteur de la cuisine sur un autre circuit.
    const fixtures = [mur('iSejour', 'inter', 'sejour'), mur('iCuisine', 'inter', 'cuisine')];
    const ceiling = [
      ...Array.from({ length: 7 }, (_, k) => dcl(`s${k}`, 'sejour', ['iSejour'])),
      dcl('cuisine1', 'cuisine', ['iCuisine']),
      dcl('cuisine2', 'cuisine', ['iCuisine']),
    ];
    const c = eclairages(fixtures, ceiling);
    const circuitDe = (id: string) => c.find((x) => x.fixtureIds.includes(id) || (x.ceilingIds ?? []).includes(id))!;
    expect(circuitDe('iCuisine').id).toBe(circuitDe('cuisine1').id);
    expect(circuitDe('iCuisine').id).toBe(circuitDe('cuisine2').id);
    expect(circuitDe('iSejour').id).toBe(circuitDe('s0').id);
    for (const x of c) expect(x.points).toBeLessThanOrEqual(MAX_LUMIERE);
  });

  it('un va-et-vient réunit ses deux commandes et leurs points', () => {
    const fixtures = [mur('va1', 'va', 'couloir'), mur('va2', 'va', 'couloir'), mur('i', 'inter', 'chambre')];
    const ceiling = [dcl('c1', 'couloir', ['va1', 'va2']), dcl('ch', 'chambre', ['i'])];
    const c = eclairages(fixtures, ceiling);
    const circuitDe = (id: string) => c.find((x) => x.fixtureIds.includes(id) || (x.ceilingIds ?? []).includes(id))!;
    expect(circuitDe('va1').id).toBe(circuitDe('va2').id);
    expect(circuitDe('va1').id).toBe(circuitDe('c1').id);
  });

  it('douze spots sur un même interrupteur : deux circuits, la commande avec le premier', () => {
    const fixtures = [mur('i', 'inter', 'sejour')];
    const ceiling = Array.from({ length: 12 }, (_, k) => ({ ...dcl(`sp${k}`, 'sejour', ['i']), kind: 'spot' }) as CeilingFixture);
    const c = eclairages(fixtures, ceiling);
    expect(c.map((x) => x.points)).toEqual([8, 4]);
    expect(c[0].fixtureIds).toContain('i');
  });
});

describe('l’unifilaire dit ce que dessert un circuit d’éclairage', () => {
  it('ses commandes ET ses points du plafond, sans perdre les majuscules', () => {
    const fixtures = [mur('i', 'inter', 'sejour')];
    const ceiling = [dcl('d1', 'sejour', ['i']), dcl('d2', 'sejour', ['i'])];
    const circuits = planCircuits(fixtures, (f) => f.wallId, () => false, (f) => f.wallId, ceiling);
    const [ligne] = schemaRows(circuits.filter((c) => c.nature === 'eclairage'), [], fixtures, ceiling);
    expect(ligne.points).toContain('2 × point lumineux DCL');
    expect(ligne.points).toContain('1 × interrupteur');
  });
});

describe('le coffret garde sa réserve', () => {
  it('vingt-quatre modules occupés : trois rangées, plus de 20 % libres', () => {
    // 18 disjoncteurs + 3 différentiels (deux modules chacun) = 24 modules.
    const circuits = Array.from({ length: 18 }, (_, k) => ({
      id: `c${k}`, label: `Prises ${k}`, nature: 'prises', points: 1, section: 2.5, breaker: 20, rooms: [], fixtureIds: [],
    })) as never[];
    const diffs = [0, 1, 2].map((k) => ({ label: `D${k}`, type: 'AC', rating: 40, circuits: [] })) as never[];
    const d = chiffrer([], circuits, diffs, 'dooxie');
    const coffret = d.lignes.find((l) => l.code.startsWith('coffret-') && l.code !== 'coffret-com')!;
    const rangees = Number(coffret.code.split('-')[1]);
    expect(1 - 24 / (rangees * 13)).toBeGreaterThanOrEqual(0.2);
  });
});

describe('le poussoir emporte son télérupteur', () => {
  it('trois poussoirs sur un point : un télérupteur au bordereau', () => {
    const fixtures = [mur('p1', 'poussoir', 'couloir'), mur('p2', 'poussoir', 'couloir'), mur('p3', 'poussoir', 'couloir')];
    const ceiling = [dcl('c', 'couloir', ['p1', 'p2', 'p3'])];
    const t = buyingList([], fixtures, ceiling).find((r) => r.code === 'telerupteur');
    expect(t?.quantity).toBe(1);
  });

  it('sans poussoir, pas de télérupteur', () => {
    expect(buyingList([], [mur('i', 'inter', 'x')], [dcl('c', 'x', ['i'])]).some((r) => r.code === 'telerupteur')).toBe(false);
  });
});

describe('les hauteurs suivent les postes', () => {
  const { checkElectrical } = require('../src/geometry/nfc15100');
  const hauteurs = (f: Fixture[]) =>
    (checkElectrical([], f, new Map()) as { code: string; severity: string; fixtureId?: string }[]).filter((c) => c.code === 'hauteur');
  const a = (id: string, kind: Fixture['kind'], height: number) => ({ ...mur(id, kind, 'x'), height }) as Fixture;

  it('un double interrupteur et l’interrupteur général à 1,60 m alertent, comme le simple', () => {
    const c = hauteurs([a('i', 'inter', 1.6), a('i2', 'inter2', 1.6), a('ig', 'interGeneral', 1.6)]);
    expect(c.filter((x) => x.severity === 'alerte').map((x) => x.fixtureId).sort()).toEqual(['i', 'i2', 'ig']);
  });

  it('une prise triple à 2 cm du sol alerte', () => {
    expect(hauteurs([a('p3', 'prise3', 0.02)])[0]?.severity).toBe('alerte');
  });

  it('une prise à 1,80 m (télévision murale) n’est qu’une information', () => {
    expect(hauteurs([a('p', 'prise', 1.8)])[0]?.severity).toBe('info');
  });
});

describe('le bordereau', () => {
  it('deux prises sous une même plaque se posent comme une prise double', () => {
    const { estimerLaPose } = require('../src/geometry/mainDOeuvre');
    const { ENTRAXE } = require('../src/geometry/electrical');
    const p1 = { ...mur('a', 'prise', 'w'), along: 1, height: 0.3 } as Fixture;
    const p2 = { ...mur('b', 'prise', 'w'), along: 1 + ENTRAXE, height: 0.3 } as Fixture;
    const double = { ...mur('d', 'prise2', 'w'), along: 3, height: 0.3 } as Fixture;
    const r = { taux: 50, chantier: 'renovation' };
    expect(estimerLaPose([p1, p2], [], 0, r).heures).toBeCloseTo(estimerLaPose([double], [], 0, r).heures, 2);
  });

  it('un différentiel de 25 A se dit 25 A', () => {
    const diffs = [{ label: 'D', type: 'AC', rating: 25, circuits: [] }, { label: 'A', type: 'A', rating: 40, circuits: [] }] as never[];
    const d = chiffrer([], [], diffs, 'dooxie');
    expect(d.lignes.some((l) => /différentiel 25 A 30 mA type AC/.test(l.libelle))).toBe(true);
    expect(d.lignes.some((l) => /différentiel 40 A 30 mA type AC/.test(l.libelle))).toBe(false);
  });
});

describe('l’applique murale et la boîte de dérivation', () => {
  it('prennent une boîte de dérivation, sans plaque ni mécanisme', () => {
    const l = buyingList([], [mur('ap', 'applique', 'w'), mur('bd', 'boite', 'w')], []);
    expect(l.find((r) => r.code === 'boite-derivation')?.quantity).toBe(2);
    expect(l.some((r) => r.code === 'boite-encastrement' || (r.code ?? '').startsWith('plaque-'))).toBe(false);
    expect(l.some((r) => r.code === 'meca-applique' || r.code === 'meca-boite')).toBe(false);
  });
});

describe('une prise posée devant un plan de travail', () => {
  it('part à 1,10 m, pas derrière le meuble', () => {
    const { useScanStore } = require('../src/store/scanStore');
    const st = () => useScanStore.getState();
    st().reset();
    st().commencerAuClavier();
    st().addRoomRect({ x: 0, z: 0 }, { x: 4, z: 3 }, 'Cuisine');
    // Un plan de travail de 2 m contre le mur nord (z = 0), 60 cm de fond.
    useScanStore.setState({
      objects: [{ id: 'pt', category: 'countertop', width: 2, depth: 0.6, height: 0.9, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.45, 0.3, 1] }],
    });
    const nord = st().walls.find((w: { type: string; a: { z: number }; b: { z: number } }) => w.type === 'wall' && Math.abs(w.a.z) < 1e-6 && Math.abs(w.b.z) < 1e-6)!;
    const id = st().addFixture('prise', nord.id, 2);
    const f = st().fixtures.find((x: Fixture) => x.id === id)!;
    expect(f.height).toBeCloseTo(1.1, 2);
  });
});

describe('pas de navette inventée (revue « Nadia »)', () => {
  it('deux interrupteurs simples de deux pièces, sans lien : pas de va-et-vient', () => {
    const c = eclairages([mur('i1', 'inter', 'sejour'), mur('i2', 'inter', 'chambre')], [dcl('d1', 'sejour'), dcl('d2', 'chambre')]);
    expect(c.every((x) => x.vaEtVient === false)).toBe(true);
  });
  it('des poussoirs ne font pas de navette', () => {
    const c = eclairages([mur('p1', 'poussoir', 'couloir'), mur('p2', 'poussoir', 'couloir')], [dcl('d', 'couloir', ['p1', 'p2'])]);
    expect(c[0].vaEtVient).toBe(false);
  });
  it('un vrai va-et-vient reste un va-et-vient', () => {
    const c = eclairages([mur('v1', 'va', 'couloir'), mur('v2', 'va', 'couloir')], [dcl('d', 'couloir', ['v1', 'v2'])]);
    expect(c[0].vaEtVient).toBe(true);
  });
});

/**
 * PEAUFINAGE ÉLECTRICITÉ — ce que l'électricien attend des gestes existants :
 *   — l'interrupteur posé par « Normes auto » ou « Corriger » va à l'entrée,
 *     à côté de la porte, côté poignée (jamais derrière le vantail) ;
 *   — un point lumineux posé, ou déjà là, se relie à l'interrupteur de sa
 *     pièce, et « point lumineux sans commande » se règle d'un appui ;
 *   — la fenêtre de contrôle montre le plus grave d'abord.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';
import type { CeilingFixture } from '../src/geometry/ceiling';
import { completerAuxNormes, corrigerConstat, poserAuxNormes } from '../src/geometry/auto';
import { checkElectrical, fixturePlacement, wallToRooms, type RoomInput } from '../src/geometry/nfc15100';
import { ordonnerLesConstats, type Constat } from '../src/components/DiagnosticSheet';
import { useScanStore } from '../src/store/scanStore';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});
// Une chambre de 4 × 3, la porte au mur sud, de x = 0,5 à 1,33, gond à l'ouest.
const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];
const porte = (pivot: 'a' | 'b'): WallSeg => ({
  id: 'p1',
  type: 'door',
  a: { x: 0.5, z: 3 },
  b: { x: 1.33, z: 3 },
  height: 2.04,
  yCenter: 1.02,
  roomId: 'r1',
  pivot,
});
const PIECE: RoomInput & { interieur: { x: number; z: number } } = {
  id: 'r1',
  name: 'Chambre',
  area: 12,
  wallIds: ['n', 'e', 's', 'o'],
  outline: [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 3 },
    { x: 0, z: 3 },
  ],
  interieur: { x: 2, z: 1.5 },
};
let n = 0;
const id = (p: string) => `${p}-${++n}`;

const interDe = (fx: Fixture[]) => fx.find((f) => f.kind === 'inter')!;

describe('l’interrupteur à l’entrée, côté poignée', () => {
  it('« Normes auto » le pose sur le mur de la porte, à une main du chambranle côté poignée', () => {
    // Gond en a (x = 0,5) : la poignée est côté x = 1,33.
    const pose = poserAuxNormes({
      rooms: [PIECE],
      walls: MURS,
      openings: [porte('a')],
      objects: [],
      fixtures: [],
      ceiling: [],
      placement: new Map(),
      id,
    });
    const inter = interDe(pose.fixtures);
    expect(inter.wallId).toBe('s');
    expect(inter.height).toBeCloseTo(1.1, 6);
    // Le mur sud va de x = 4 à x = 0 : along = 4 − x. Poignée à x = 1,33 → x ≈ 1,58.
    const x = 4 - inter.along;
    expect(x).toBeGreaterThan(1.33);
    expect(x).toBeLessThan(1.8);
    expect(pose.rapport.join(' ')).toMatch(/interrupteur à l’entrée/);
  });

  it('le gond de l’autre côté : l’interrupteur change de côté', () => {
    const pose = poserAuxNormes({
      rooms: [PIECE],
      walls: MURS,
      openings: [porte('b')],
      objects: [],
      fixtures: [],
      ceiling: [],
      placement: new Map(),
      id,
    });
    const x = 4 - interDe(pose.fixtures).along;
    expect(x).toBeLessThan(0.5);
    expect(x).toBeGreaterThan(0.15);
  });

  it('« Corriger » pose la commande au même endroit', () => {
    const res = corrigerConstat({ type: 'poser', kind: 'inter', label: 'Poser l’interrupteur' }, 'r1', {
      rooms: [PIECE],
      walls: MURS,
      openings: [porte('a')],
      objects: [],
      fixtures: [],
      id,
    })!;
    const inter = interDe(res.fixtures);
    expect(inter.wallId).toBe('s');
    expect(4 - inter.along).toBeGreaterThan(1.33);
  });

  it('sans porte, la règle d’avant : le mur le plus dégagé', () => {
    const pose = poserAuxNormes({
      rooms: [PIECE],
      walls: MURS,
      openings: [],
      objects: [],
      fixtures: [],
      ceiling: [],
      placement: new Map(),
      id,
    });
    expect(interDe(pose.fixtures)).toBeDefined();
    expect(pose.rapport.join(' ')).not.toMatch(/à l’entrée/);
  });
});

describe('le point lumineux s’allume', () => {
  const inter: Fixture = { id: 'i1', kind: 'inter', wallId: 's', along: 2.4, height: 1.1, side: 1 };

  it('« Poser le DCL » le relie à la seule commande de la pièce', () => {
    const res = corrigerConstat({ type: 'plafond', kind: 'dcl', label: 'Poser le DCL' }, 'r1', {
      rooms: [PIECE],
      walls: MURS,
      openings: [],
      objects: [],
      fixtures: [{ ...inter, side: sideDedans() }],
      id,
    })!;
    expect(res.ceiling[0].commands).toEqual(['i1']);
  });

  it('« point lumineux sans commande » se corrige d’un appui : interrupteur posé et relié', () => {
    const dcl: CeilingFixture = { id: 'dcl1', kind: 'dcl', roomId: 'r1', at: { x: 2, z: 1.5 } };
    const issues = checkElectrical([PIECE], [], wallToRooms([PIECE]), new Map(), undefined, undefined, [dcl]);
    const constat = issues.find((i) => i.message.includes('sans commande'))!;
    expect(constat.fix).toEqual(expect.objectContaining({ type: 'poser', kind: 'inter' }));
    const res = corrigerConstat(constat.fix!, constat.roomId, {
      rooms: [PIECE],
      walls: MURS,
      openings: [porte('a')],
      objects: [],
      fixtures: [],
      ceiling: [dcl],
      id,
    })!;
    expect(res.liens).toEqual([{ ceilingId: 'dcl1', commandeId: res.fixtures[0].id }]);
    // Dans le plan : un seul « Annuler » pour la pose et le lien.
    useScanStore.setState({ fixtures: [], ceiling: [dcl] });
    useScanStore.getState().poserDAuto(res.fixtures, res.ceiling, res.liens);
    expect(useScanStore.getState().ceiling[0].commands).toEqual([res.fixtures[0].id]);
  });

  it('« Normes auto » relie aussi le plafonnier déjà posé à l’interrupteur qu’il ajoute', () => {
    const dcl: CeilingFixture = { id: 'dcl1', kind: 'dcl', roomId: 'r1', at: { x: 2, z: 1.5 } };
    const pose = poserAuxNormes({
      rooms: [PIECE],
      walls: MURS,
      openings: [porte('a')],
      objects: [],
      fixtures: [],
      ceiling: [dcl],
      placement: new Map(),
      id,
    });
    expect(pose.liens).toEqual([{ ceilingId: 'dcl1', commandeId: interDe(pose.fixtures).id }]);
    expect(pose.ceiling).toHaveLength(0);
  });

  it('la passe de contrôle suit les liens : le constat ne revient pas', () => {
    const dcl: CeilingFixture = { id: 'dcl1', kind: 'dcl', roomId: 'r1', at: { x: 2, z: 1.5 } };
    const ctx = { rooms: [PIECE], walls: MURS, openings: [porte('a')], objects: [], fixtures: [] as Fixture[], ceiling: [dcl], id };
    const suite = completerAuxNormes(ctx, (fx, cl) =>
      checkElectrical([PIECE], fx, wallToRooms([PIECE]), fixturePlacement(fx, MURS, [PIECE]), undefined, undefined, cl),
    );
    const interPose = suite.fixtures.find((f) => f.kind === 'inter');
    expect(interPose).toBeDefined();
    expect(suite.liens).toContainEqual({ ceilingId: 'dcl1', commandeId: interPose!.id });
  });

  /** La face du mur sud qui regarde la chambre. */
  function sideDedans(): 1 | -1 {
    const p = fixturePlacement([{ ...inter, side: 1 }], MURS, [PIECE]);
    return p.get('i1') === 'r1' ? 1 : -1;
  }
});

describe('le contrôle montre le plus grave d’abord', () => {
  const c = (key: string, severity: string, fix = false): Constat => ({
    key,
    message: key,
    hint: '',
    severity,
    ...(fix ? { fix: { type: 'plafond', kind: 'dcl', label: 'x' } } : {}),
  });
  it('les pièces à corriger en tête, les alertes réparables d’abord', () => {
    const groupes = ordonnerLesConstats([
      { cle: 'a', alertes: 0, lignes: [c('a1', 'info')] },
      { cle: 'b', alertes: 2, lignes: [c('b1', 'info'), c('b2', 'alerte'), c('b3', 'alerte', true)] },
      { cle: 'c', alertes: 1, lignes: [c('c1', 'alerte')] },
    ]);
    expect(groupes.map((g) => g.cle)).toEqual(['b', 'c', 'a']);
    expect(groupes[0].lignes.map((l) => l.key)).toEqual(['b3', 'b2', 'b1']);
  });
});

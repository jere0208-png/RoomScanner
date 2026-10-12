/**
 * TOURNÉE N°4 — CE QUE L'ÉLECTRICIEN A RELEVÉ (revue « Mehdi »).
 *
 * - Le sigle ne décidait de rien : la plaque (PL), le chauffe-eau (CU) et
 *   la borne (VE) partaient sur un seul « Sorties de câble » en 20 A.
 * - Un lave-vaisselle, un sèche-serviettes et une climatisation faisaient
 *   « 3 spécialisés sur 3 ».
 * - La légende disait « Prise 20 A » quand le plan écrivait LV.
 * - « Normes auto » comptait les prises simples (un séjour à 12 socles sur
 *   12 recevait 4 prises de plus) et posait un interrupteur au WC qui avait
 *   un détecteur de présence.
 * - Huit socles par circuit de 2,5 mm² (c'est douze, six en cuisine), et
 *   des différentiels sans regard pour la surface du logement — corrigés
 *   avec l'accord du patron.
 * Et « Sébastien » : le métré du PDF n'avait qu'une décimale.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_SOCLES,
  MAX_SOCLES_CUISINE,
  checkElectrical,
  minimumAC,
  planCircuits,
  planDifferentials,
  wallToRooms,
} from '../src/geometry/nfc15100';
import { poserAuxNormes } from '../src/geometry/auto';
import { buildScanPdf } from '../src/export/pdf';
import type { Fixture } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';
import { useScanStore, floorsOf } from '../src/store/scanStore';

const f = (id: string, kind: Fixture['kind'], usage?: string): Fixture =>
  ({ id, kind, wallId: 'n', along: 1, height: 0.3, side: 1, ...(usage ? { usage } : {}) }) as Fixture;

describe('le sigle décide du circuit', () => {
  const circuits = planCircuits(
    [f('pl', 'sortieCable', 'PL'), f('cu', 'sortieCable', 'CU'), f('ve', 'sortieCable', 'VE'), f('ss', 'sortieCable', 'SS'), f('lv', 'prise20', 'LV')],
    () => 'Cuisine',
    () => true,
  );
  const de = (id: string) => circuits.find((c) => c.fixtureIds.includes(id))!;

  it('la plaque sur son 32 A en 6 mm², le chauffe-eau et la borne à part', () => {
    expect(de('pl')).toMatchObject({ nature: 'cuisson', breaker: 32, section: 6 });
    expect(de('pl').label).toMatch(/^Cuisson/);
    expect(de('cu')).toMatchObject({ breaker: 20, section: 2.5 });
    expect(de('cu').label).toMatch(/^Chauffe-eau/);
    expect(de('ve')).toMatchObject({ breaker: 40, section: 10 });
    // Le sèche-serviettes garde le circuit commun des sorties.
    expect(de('ss').label).toMatch(/^Sorties de câble/);
    expect(de('ss').fixtureIds).toEqual(['ss']);
  });

  it('le spécialisé porte le nom de son appareil', () => {
    expect(de('lv').label).toMatch(/^Lave-vaisselle/);
  });

  it('un sèche-serviettes et une climatisation ne sont pas des spécialisés', () => {
    const rooms = [{ id: 'r', name: 'Cuisine', area: 10, wallIds: ['n'] }];
    const constats = checkElectrical(
      rooms,
      [f('lv', 'prise20', 'LV'), f('ss', 'sortieCable', 'SS'), f('cl', 'sortieCable', 'CL')],
      wallToRooms(rooms),
    );
    expect(constats.find((c) => c.code === 'specialises')?.message).toMatch(/1 circuit spécialisé sur 3/);
  });
});

describe('normes auto compte comme le contrôle', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25, roomId: 'r1',
  });
  const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];
  const piece = (name: string, kind: 'bedroom' | 'wc') => ({
    id: 'r1', name, kind, area: 12, wallIds: ['n', 'e', 's', 'o'], interieur: { x: 2, z: 1.5 },
  });
  const id = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

  it('une triple (deux socles) et une simple font trois socles : la chambre est servie', () => {
    const triple = { ...f('p3', 'prise3'), along: 2 };
    const pose = poserAuxNormes({
      rooms: [piece('Chambre', 'bedroom')], walls: MURS, openings: [], objects: [],
      fixtures: [
        triple,
        { ...f('p1', 'prise'), along: 3.5 },
        { ...f('rj', 'rj45'), along: 3 },
        { ...f('i', 'variateur'), height: 1.1, along: 0.3 },
      ],
      ceiling: [{ id: 'd', kind: 'dcl', roomId: 'r1', at: { x: 2, z: 1.5 } }],
      placement: new Map([['p3', 'r1'], ['p1', 'r1'], ['rj', 'r1'], ['i', 'r1']]), id,
    });
    expect(pose.fixtures.filter((x) => x.kind === 'prise')).toHaveLength(0);
    // Le variateur est une commande : pas d'interrupteur de plus.
    expect(pose.fixtures.filter((x) => x.kind === 'inter')).toHaveLength(0);
  });

  it('un détecteur de présence au plafond commande le WC', () => {
    const pose = poserAuxNormes({
      rooms: [piece('WC', 'wc')], walls: MURS, openings: [], objects: [],
      fixtures: [],
      ceiling: [
        { id: 'd', kind: 'dcl', roomId: 'r1', at: { x: 2, z: 1.5 } },
        { id: 'pr', kind: 'detecteur', roomId: 'r1', at: { x: 1, z: 1 } },
      ],
      placement: new Map(), id,
    });
    expect(pose.fixtures.filter((x) => x.kind === 'inter')).toHaveLength(0);
  });
});

describe('le dossier PDF', () => {
  const latin1 = (b: Uint8Array) => {
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  };
  const dossier = (metre: boolean) => {
    const st = useScanStore.getState();
    st.reset();
    st.commencerAuClavier();
    const id = st.addRoomLibre(4, 3, 'Cuisine', { auNu: true })!;
    const mur = useScanStore.getState().walls[0];
    const a = useScanStore.getState().addFixture('prise20', mur.id)!;
    useScanStore.getState().setFixtureUsage(a, 'LV');
    const s = useScanStore.getState();
    return latin1(
      buildScanPdf(
        {
          name: 'Essai',
          walls: s.walls,
          openings: s.openings,
          objects: [],
          rooms: s.rooms,
          fixtures: s.fixtures,
          floors: floorsOf(s.rooms),
          roomNames: { [id]: 'Cuisine' },
        } as never,
        false,
        { metre, garde: false, measures2D: true } as never,
      ),
    );
  };

  it('la légende dit « Alim. lave-vaisselle (LV) », pas « Prise 20 A »', () => {
    const pdf = dossier(false);
    expect(pdf).toContain('Alim. lave-vaisselle \\(LV\\)');
    expect(pdf).not.toContain('(Prise 20 A)');
  });

  it('le métré porte deux décimales', () => {
    expect(dossier(true)).toContain('(12,00)');
  });
});

describe('le plan 2D', () => {
  it('dessine les tapis dessous, et chaque meuble à sa teinte', () => {
    const plan = readFileSync(join(__dirname, '..', 'src', 'components', 'FloorplanEditor.tsx'), 'utf8');
    expect(plan).toMatch(/\.sort\(\(a, b\) => \(a\.category === 'tapis' \? 0 : 1\) - \(b\.category === 'tapis' \? 0 : 1\)\)/);
    expect(plan).toContain('o.teinte ?? c.blueSoft');
  });
});

describe('les plafonds de la norme', () => {
  const prises = (n: number) => Array.from({ length: n }, (_, i) => f(`p${i}`, 'prise'));

  it('douze socles sur un circuit de prises en 2,5 mm², six en cuisine', () => {
    expect(MAX_SOCLES).toBe(12);
    expect(MAX_SOCLES_CUISINE).toBe(6);
    const sejour = (n: number) =>
      planCircuits(prises(n), () => 'Séjour', () => false).filter((c) => c.nature === 'prises');
    expect(sejour(12)).toHaveLength(1);
    expect(sejour(13)).toHaveLength(2);
    const cuisine = planCircuits(prises(7), () => 'Cuisine', () => true).filter((c) => c.nature === 'prises');
    expect(cuisine.map((c) => c.points)).toEqual([6, 1]);
  });

  it('les différentiels suivent la surface du logement', () => {
    expect(minimumAC(30)).toEqual({ nombre: 1, calibre: 25 });
    expect(minimumAC(80)).toEqual({ nombre: 2, calibre: 40 });
    expect(minimumAC(132)).toEqual({ nombre: 3, calibre: 40 });
    const circuits = planCircuits(
      [...prises(20), f('i', 'inter'), f('pl', 'prise32'), f('lv', 'prise20', 'LV')],
      () => 'Séjour',
      () => false,
    );
    const types = (s: number) => planDifferentials(circuits, s).map((d) => `${d.type}${d.rating}`);
    expect(types(30)).toEqual(['A40', 'AC25']);
    expect(types(80)).toEqual(['A40', 'AC40', 'AC40']);
    // 132 m², la maison de Mehdi : trois AC et un A.
    expect(types(132)).toEqual(['A40', 'AC40', 'AC40', 'AC40']);
    // Chaque AC reçoit des circuits : ils se répartissent.
    expect(planDifferentials(circuits, 132).every((d) => d.circuits.length > 0)).toBe(true);
  });
});


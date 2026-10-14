/**
 * LES PRISES DE LA CUISINE — revue « Nadia », électricienne.
 *
 * Les quatre « prises plan de travail » se posaient et se comptaient à leur
 * seule hauteur, sur des murs nus ; une 20 A partait derrière le
 * réfrigérateur ; le réfrigérateur n'avait pas sa prise.
 */
import { corrigerConstat, poserAuxNormes } from '../src/geometry/auto';
import type { WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';
import { checkElectrical, logementEntier, socleFaceAuPlan, worktopsOnWall } from '../src/geometry/nfc15100';
import { deviceNames } from '../src/geometry/naming';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz },
  height: 2.5, yCenter: 1.25, roomId: 'r1',
});
const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];
const meuble = (category: string, x: number, z: number, w: number, d: number, h: number) => ({
  category, width: w, depth: d, height: h, roomId: 'r1',
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, h / 2, z, 1],
});
// Plan de travail le long du mur nord, de 0,20 à 2,80 ; évier au milieu.
const PLAN = meuble('storage', 1.5, 0.3, 2.6, 0.6, 0.9);
const EVIER = meuble('sink', 1.5, 0.3, 0.6, 0.6, 0.9);
// Réfrigérateur de 1,80 m contre le mur est.
const FRIGO = meuble('refrigerator', 3.67, 1.5, 0.6, 0.65, 1.8);
const CUISINE = {
  id: 'r1', name: 'Cuisine', kind: 'kitchen' as const, area: 12,
  wallIds: ['n', 'e', 's', 'o'], interieur: { x: 2, z: 1.5 },
};
let k = 0;
const id = (p: string) => `${p}-${++k}`;
const FACE_N = { A: { x: 0, z: 0 }, ux: 1, uz: 0, nx: 0, nz: 1, len: 4 };

describe('les plans de travail portent leur nature', () => {
  it('l’évier est repéré, et un socle à son droit y est interdit', () => {
    const plans = worktopsOnWall(FACE_N, [PLAN, EVIER], true);
    expect(plans.find((w) => w.nature === 'evier')).toBeTruthy();
    expect(socleFaceAuPlan(1.5, 1.1, plans)).toBe('evier');
    expect(socleFaceAuPlan(0.6, 1.1, plans)).toBe('plan');
    // Derrière le meuble, ce n'est pas « au-dessus du plan ».
    expect(socleFaceAuPlan(0.6, 0.3, plans)).toBe(null);
    expect(socleFaceAuPlan(3.5, 1.1, plans)).toBe(null);
  });
});

describe('le contrôle compte au droit du plan, pas à la hauteur', () => {
  const rooms = [{ id: 'r1', name: 'Cuisine', kind: 'kitchen' as const, area: 12, wallIds: ['n', 'e', 's', 'o'] }];
  const w2r = new Map(['n', 'e', 's', 'o'].map((w) => [w, ['r1']]));
  const plans = worktopsOnWall(FACE_N, [PLAN, EVIER], true);
  const worktops = new Map([['n', { x: (f: Fixture) => f.along, plans }]]);
  const prise = (wallId: string, along: number, height = 1.1): Fixture => ({ id: `${wallId}${along}`, kind: 'prise', wallId, along, height, side: 1 });

  it('quatre prises à 1,10 m sur un mur nu ne sont pas « au-dessus du plan »', () => {
    const fx = [0.5, 1.2, 1.9, 2.6].map((a) => prise('s', a));
    const issues = checkElectrical(rooms, fx, w2r, undefined, undefined, worktops);
    expect(issues.find((i) => i.code === 'surPlan' && i.severity === 'alerte')?.message).toContain('0 socle au-dessus du plan de travail sur 4');
  });

  it('au droit du plan relevé, elles comptent', () => {
    const fx = [0.4, 0.9, 2.0, 2.6].map((a) => prise('n', a));
    const issues = checkElectrical(rooms, fx, w2r, undefined, undefined, worktops);
    expect(issues.filter((i) => i.code === 'surPlan')).toEqual([]);
  });

  it('au-dessus de l’évier : alerte, et elle ne compte pas', () => {
    const fx = [0.4, 0.9, 1.5, 2.6].map((a) => prise('n', a));
    const issues = checkElectrical(rooms, fx, w2r, undefined, undefined, worktops);
    expect(issues.some((i) => i.message === 'Cuisine : socle au-dessus de l’évier' && i.fixtureId === 'n1.5')).toBe(true);
    expect(issues.some((i) => i.message.includes('3 socles au-dessus du plan de travail sur 4'))).toBe(true);
  });

  it('sans plan relevé, la hauteur fait foi, et on le dit', () => {
    const fx = [0.5, 1.2, 1.9, 2.6].map((a) => prise('s', a));
    const issues = checkElectrical(rooms, fx, w2r, undefined, undefined, new Map());
    const info = issues.find((i) => i.code === 'surPlan');
    expect(info?.severity).toBe('info');
    expect(info?.message).toBe('Cuisine : plan de travail non relevé');
  });
});

describe('normes auto en cuisine équipée', () => {
  const pose = poserAuxNormes({
    rooms: [CUISINE], walls: MURS, openings: [], objects: [PLAN, EVIER, FRIGO],
    fixtures: [], ceiling: [], placement: new Map(), id,
  });

  it('les prises hautes se posent au-dessus du plan, hors évier', () => {
    const hautes = pose.fixtures.filter((f) => f.kind === 'prise' && !f.usage && f.height >= 0.9);
    expect(hautes.length).toBeGreaterThanOrEqual(2);
    for (const f of hautes) {
      expect(f.height).toBe(1.1);
      // Au mur nord, au droit du plan, hors évier ; ou au retour ouest, au
      // droit du bout du plan (z de 0 à 0,6 → abscisse 2,4 à 3 sur ce mur).
      if (f.wallId === 'o') {
        expect(f.along).toBeGreaterThan(2.4);
        continue;
      }
      expect(f.wallId).toBe('n');
      expect(f.along).toBeGreaterThan(0.25);
      expect(f.along).toBeLessThan(2.75);
      expect(Math.abs(f.along - 1.5)).toBeGreaterThan(0.3);
    }
    // Aucune sur les murs nus.
    expect(hautes.filter((f) => f.wallId === 's' || f.wallId === 'e')).toEqual([]);
  });

  it('le réfrigérateur a sa prise dédiée, à côté de lui', () => {
    const fri = pose.fixtures.filter((f) => f.usage === 'FRI');
    expect(fri).toHaveLength(1);
    expect(fri[0].wallId).toBe('e');
    // Le frigo couvre 1,175 → 1,825 sur le mur est : la prise est à côté.
    expect(Math.abs(fri[0].along - 1.5)).toBeGreaterThan(0.4);
    expect(Math.abs(fri[0].along - 1.5)).toBeLessThan(0.6);
    expect(pose.rapport.join(' ')).toContain('prise réfrigérateur');
  });

  it('une seconde passe ne repose pas la prise du réfrigérateur', () => {
    const placement = new Map(pose.fixtures.map((f) => [f.id, 'r1']));
    const encore = poserAuxNormes({
      rooms: [CUISINE], walls: MURS, openings: [], objects: [PLAN, EVIER, FRIGO],
      fixtures: pose.fixtures, ceiling: pose.ceiling, placement, id,
    });
    expect(encore.fixtures.filter((f) => f.usage === 'FRI')).toHaveLength(0);
  });
});

describe('la 20 A sans appareil relevé', () => {
  it('ne part pas derrière le réfrigérateur de 1,80 m', () => {
    // Seul le mur est est libre de menuiserie : les autres sont « percés ».
    const baie = (a: { x: number; z: number }, b: { x: number; z: number }): WallSeg => ({ id: `b${a.x}${a.z}`, type: 'window', a, b, height: 1, yCenter: 1.5 });
    const r = corrigerConstat({ type: 'poser', kind: 'prise20', label: 'Poser une 20 A' }, 'r1', {
      rooms: [CUISINE], walls: MURS,
      openings: [baie({ x: 0.1, z: 0 }, { x: 3.9, z: 0 }), baie({ x: 3.9, z: 3 }, { x: 0.1, z: 3 }), baie({ x: 0, z: 2.9 }, { x: 0, z: 0.1 })],
      objects: [FRIGO], fixtures: [], id,
    });
    const f = r!.fixtures[0];
    expect(f.wallId).toBe('e');
    expect(Math.abs(f.along - 1.5)).toBeGreaterThan(0.33);
  });

  it('derrière le lave-vaisselle relevé, elle porte son sigle', () => {
    const r = corrigerConstat({ type: 'poser', kind: 'prise20', label: 'Poser une 20 A' }, 'r1', {
      rooms: [CUISINE], walls: MURS, openings: [], objects: [meuble('dishwasher', 1, 0.3, 0.6, 0.6, 0.85)], fixtures: [], id,
    });
    expect(r!.fixtures[0].usage).toBe('LV');
  });
});

describe('le nom de la prise dit ce qu’elle est', () => {
  const plans = new Map([['n', { x: (f: { along: number }) => f.along, plans: worktopsOnWall(FACE_N, [PLAN], true) }]]);
  const fx: Fixture[] = [
    { id: 'a', kind: 'prise', wallId: 'n', along: 0.6, height: 1.1, side: 1 },
    { id: 'b', kind: 'prise', wallId: 's', along: 1, height: 1.1, side: 1 },
    { id: 'c', kind: 'prise', wallId: 'e', along: 1, height: 1.1, side: 1, usage: 'FRI' },
  ];
  const noms = deviceNames(fx, MURS, new Map(fx.map((f) => [f.id, 'r1'])), { r1: 'Cuisine' }, new Map(), null, plans);
  it('plan de travail, haute, réfrigérateur', () => {
    expect(noms.get('a')!.nom).toBe('Prise plan de travail 1');
    expect(noms.get('b')!.nom).toBe('Prise haute 1');
    expect(noms.get('c')!.nom).toBe('Prise réfrigérateur 1');
  });
});

describe('le duplex : les règles du logement comptent tous les niveaux (revue « Nadia »)', () => {
  it('à l’étage, « Logement : 1 prise RJ45 sur 2 » ne sort plus quand le logement en a 4', () => {
    const etage = [{ id: 'e1', name: 'Chambre', kind: 'bedroom' as const, area: 11, wallIds: ['n', 'e', 's', 'o'] }];
    const w2r = new Map(['n', 'e', 's', 'o'].map((w) => [w, ['e1']]));
    const rj: Fixture = { id: 'rj', kind: 'rj45', wallId: 'n', along: 1, height: 0.25, side: 1 };
    const seul = checkElectrical(etage, [rj], w2r);
    expect(seul.some((i) => i.message === 'Logement : 1 prise RJ45 sur 2')).toBe(true);
    const tout = logementEntier(
      [{ name: 'Séjour', kind: 'living' }, { name: 'Chambre', kind: 'bedroom' }, ...etage],
      [rj, { ...rj, id: 'a' }, { ...rj, id: 'b' }, { ...rj, id: 'c' }],
      [],
    );
    expect(tout).toMatchObject({ rj45: 4, principales: 3 });
    const avec = checkElectrical(etage, [rj], w2r, undefined, undefined, undefined, [], undefined, tout);
    expect(avec.some((i) => i.message.startsWith('Logement : ') && i.code === 'rj45')).toBe(false);
  });
});

import { achats, longueurDeCredence, type PieceTravaux } from '../src/geometry/travaux';

describe('la faïence de crédence (revue « Paul »)', () => {
  it('la longueur des plans relevés, l’évier compté une fois, sur 60 cm', () => {
    const plans = new Map([['n', { plans: worktopsOnWall(FACE_N, [PLAN, EVIER], true) }]]);
    const L = longueurDeCredence({ walls: [{ id: 'n' }, { id: 'e' }] }, plans);
    expect(L).toBeCloseTo(2.6, 2);
    const piece = { roomId: 'r1', nom: 'Cuisine', sol: 12, plafond: 12, perimetre: 14, hauteur: 2.5, murs: 30, plinthes: 13, portes: 1, fenetres: 1, credence: L } as PieceTravaux;
    const a = achats([piece]);
    expect(a.faience.longueur).toBeCloseTo(2.6, 1);
    expect(a.faience.surface).toBeCloseTo(1.56, 1);
    expect(a.faience.avecChute).toBeGreaterThan(a.faience.surface);
    expect(achats([{ ...piece, credence: undefined }]).faience.surface).toBe(0);
  });
});

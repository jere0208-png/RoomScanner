/**
 * LES GAINES PASSENT PAR LE PLAFOND.
 *
 * Relevé du patron (électricien) : « Pour les gaines, très souvent on passe
 * par le plafond, et pas les murs, sauf pour les retombées vers les points
 * d'élec (inter, etc.) ».
 *
 * La gaine courait au sol, dans la chape, en diagonale à travers les pièces
 * et sous les meubles (revue « électricien » : « ce qui ne se tire pas en
 * rénovation »). Elle monte maintenant du tableau au plafond, le traverse
 * en droite ligne jusqu'à l'aplomb de l'appareil, et RETOMBE le long du
 * mur jusqu'à lui. Un point de plafond n'a pas de retombée. Les pontages
 * restent ce qu'ils sont : de prise en prise au mur, de spot en spot au
 * plafond.
 *
 * Ce banc tient le MÉTRÉ — c'est lui qui part au devis, au schéma et à la
 * liste du matériel — sur un exemple chiffré à la main, puis vérifie que le
 * PDF, le plan et la 3D disent la même chose.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import {
  HAUTEUR_SOUS_PLAFOND,
  MOU,
  cableRuns,
  circuitLength,
  type TraceGaine,
} from '../src/geometry/routing';
import { planRoutes } from '../src/geometry/elecplan';
import { buildMaterialPdf, buildScanPdf } from '../src/export/pdf';
import { buyingList, pullSchedule } from '../src/geometry/conduits';
import {
  fixturePlacement,
  materialList,
  roomInputsOf,
  wallToRooms,
} from '../src/geometry/nfc15100';
import { roomParts, type Pt, type WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';
import type { CeilingFixture } from '../src/geometry/ceiling';
import { buildScene, type Face3D } from '../src/geometry/scene3d';
import { appartementExemple } from '../src/data/exemple';

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.z - a.z);

/* ------------------------------------------------------------------ */
/*  1. Le métré d'un départ, chiffré à la main                         */
/* ------------------------------------------------------------------ */

describe('le métré passe par le plafond — exemple chiffré à la main', () => {
  /*
    Tableau à 1,30 m, dans une pièce de 2,50 m sous plafond :
      montée = 2,50 − 1,30 = 1,20 m, pour CHAQUE départ (câblage en étoile).

    Interrupteur à 1,10 m, à (3, 5) — soit 5,00 m du tableau en plan (3-4-5) :
      1,20 + 5,00 + retombée (2,50 − 1,10 = 1,40) = 7,60 m de gaine,
      + 0,60 m de mou = 8,20 m de câble.

    Prise à 0,25 m, à (6, 9) — 10,00 m en plan (6-8-10) :
      1,20 + 10,00 + retombée (2,50 − 0,25 = 2,25) = 13,45 m de gaine,
      14,05 m de câble.

    DCL au plafond, à (3, 1) — 3,00 m en plan, PAS de retombée :
      1,20 + 3,00 = 4,20 m de gaine, 4,80 m de câble.

    Circuit interrupteur + prise : 8,20 + 14,05 = 22,25 → 23 m achetés.
  */
  const tableau = { at: { x: 0, z: 1 }, height: 1.3, plafond: 2.5 };
  const inter = { id: 'inter', at: { x: 3, z: 5 }, height: 1.1, plafond: 2.5 };
  const prise = { id: 'prise', at: { x: 6, z: 9 }, height: 0.25, plafond: 2.5 };
  const dcl = { id: 'dcl', at: { x: 3, z: 1 }, height: 2.5, plafond: 2.5, auPlafond: true };

  it('interrupteur : 7,60 m de gaine, 8,20 m de câble', () => {
    const [r] = cableRuns(tableau, [inter]);
    expect(r.conduit).toBeCloseTo(7.6, 9);
    expect(r.length).toBeCloseTo(8.2, 9);
  });

  it('prise : 13,45 m de gaine, 14,05 m de câble', () => {
    const [r] = cableRuns(tableau, [prise]);
    expect(r.conduit).toBeCloseTo(13.45, 9);
    expect(r.length).toBeCloseTo(14.05, 9);
  });

  it('DCL au plafond : pas de retombée — 4,20 m de gaine, 4,80 m de câble', () => {
    const [r] = cableRuns(tableau, [dcl]);
    expect(r.conduit).toBeCloseTo(4.2, 9);
    expect(r.length).toBeCloseTo(4.8, 9);
    expect(r.pose?.jusqua).toBeUndefined();
  });

  it('le circuit s’achète au mètre supérieur : 22,25 → 23 m', () => {
    expect(circuitLength(cableRuns(tableau, [inter, prise]))).toBe(23);
  });

  it('le tracé en plan est la droite du tableau à l’aplomb de l’appareil', () => {
    const [r] = cableRuns(tableau, [prise]);
    expect(r.path).toEqual([tableau.at, prise.at]);
  });

  it('la pose dit d’où la gaine monte, où elle court, jusqu’où elle retombe', () => {
    const [r] = cableRuns(tableau, [inter]);
    expect(r.pose).toEqual({ kind: 'plafond', niveau: 2.5, depuis: 1.3, jusqua: 1.1 });
  });

  it('chaque pièce a son plafond : la retombée part de celui de l’appareil', () => {
    // Tableau sous 2,40 m (montée 1,10), chambre sous 2,70 m.
    const [r] = cableRuns({ ...tableau, plafond: 2.4 }, [{ ...inter, plafond: 2.7 }]);
    // 1,10 + 5,00 + (2,70 − 1,10 = 1,60) = 7,70 m.
    expect(r.conduit).toBeCloseTo(7.7, 9);
  });

  it('un appareil au ras du plafond n’a pas de retombée à compter ni à dessiner', () => {
    const [r] = cableRuns(tableau, [{ ...inter, height: 2.6 }]);
    expect(r.conduit).toBeCloseTo(1.2 + 5, 9);
    expect(r.pose?.jusqua).toBeUndefined();
  });

  it('un tableau plus haut que le plafond ne fait pas de montée négative', () => {
    const [r] = cableRuns({ ...tableau, height: 2.8 }, [dcl]);
    expect(r.conduit).toBeCloseTo(3, 9);
  });

  it('sans hauteur relevée, le plafond vaut 2,50 m', () => {
    expect(HAUTEUR_SOUS_PLAFOND).toBe(2.5);
  });
});

/* ------------------------------------------------------------------ */
/*  2. Le plan des gaines d'une pièce                                   */
/* ------------------------------------------------------------------ */

const mur = (id: string, ax: number, az: number, bx: number, bz: number, h = 2.5): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: h,
  yCenter: h / 2,
  roomId: 'r1',
});

const PIECE: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];
const ROOMS = [{ id: 'r1', name: 'Séjour', wallIds: PIECE.map((w) => w.id) }];
const FIXTURES: Fixture[] = [
  { id: 't', kind: 'tableau', wallId: 'w', along: 1, height: 1.35, side: 1 },
  { id: 'a', kind: 'prise', wallId: 'n', along: 1, height: 0.25, side: 1 },
  { id: 'c', kind: 'inter', wallId: 'e', along: 1, height: 1.1, side: 1 },
  { id: 'd', kind: 'rj45', wallId: 's', along: 2, height: 0.25, side: 1 },
];
const DCL: CeilingFixture[] = [{ id: 'l1', kind: 'dcl', roomId: 'r1', at: { x: 2.5, z: 2 } }];

const parts = roomParts(PIECE, ROOMS);
const placement = fixturePlacement(FIXTURES, PIECE, roomInputsOf(ROOMS, parts));
const plan = planRoutes(PIECE, ROOMS, parts, FIXTURES, placement, DCL)!;
const traceDe = (id: string) => plan.traces.find((t) => t.id === id)!;
const tronconDe = (id: string) =>
  [...plan.metre.values()].flatMap((m) => m.troncons).find((t) => t.id === id)!;

describe('le plan des gaines d’une pièce', () => {
  it('chaque départ est une droite en plan, du tableau à l’appareil', () => {
    const depart = traceDe('a').path[0];
    for (const id of ['a', 'c', 'd', 'l1']) {
      const t = traceDe(id);
      expect(t.path).toHaveLength(2);
      expect(t.path[0]).toEqual(depart);
    }
  });

  it('le métré vaut montée + traversée + retombée, trace par trace', () => {
    const montee = 2.5 - 1.35;
    for (const [id, h] of [
      ['a', 0.25],
      ['c', 1.1],
      ['d', 0.25],
    ] as const) {
      const t = traceDe(id);
      const traversee = dist(t.path[0], t.path[1]);
      expect(tronconDe(id).conduit).toBeCloseTo(montee + traversee + (2.5 - h), 9);
      expect(tronconDe(id).cable).toBeCloseTo(montee + traversee + (2.5 - h) + MOU, 9);
    }
    // Le DCL : montée et traversée, rien d'autre.
    const l = traceDe('l1');
    expect(tronconDe('l1').conduit).toBeCloseTo(montee + dist(l.path[0], l.path[1]), 9);
  });

  it('et les chiffres tombent où la main les attend', () => {
    /*
      Tableau au mur ouest, à 3 m du coin sud-ouest ; prise au mur nord à
      1 m du coin : ≈ √(1² + 3²) = 3,16 m en plan. 1,15 + 3,16 + 2,25 ≈
      6,56 m de gaine — à l'épaisseur du mur près.
    */
    expect(Math.abs(tronconDe('a').conduit - 6.56)).toBeLessThan(0.15);
    // Le DCL au centre : ≈ √(2,5² + 1²) = 2,69 m ; 1,15 + 2,69 ≈ 3,84 m.
    expect(Math.abs(tronconDe('l1').conduit - 3.84)).toBeLessThan(0.15);
  });

  it('les tracés portent leur pose : plafond, montée, retombée', () => {
    expect(traceDe('c').pose).toMatchObject({ kind: 'plafond', niveau: 2.5, depuis: 1.35, jusqua: 1.1 });
    expect(traceDe('l1').pose).toMatchObject({ kind: 'plafond', niveau: 2.5 });
    expect(traceDe('l1').pose?.jusqua).toBeUndefined();
  });

  it('la hauteur sous plafond se lit sur les murs de la pièce', () => {
    const hauts = PIECE.map((w) => ({ ...w, height: 2.8, yCenter: 1.4 }));
    const p2 = roomParts(hauts, ROOMS);
    const plan2 = planRoutes(hauts, ROOMS, p2, FIXTURES, fixturePlacement(FIXTURES, hauts, roomInputsOf(ROOMS, p2)))!;
    const avant = tronconDe('c').conduit;
    const apres = [...plan2.metre.values()].flatMap((m) => m.troncons).find((t) => t.id === 'c')!.conduit;
    // 30 cm de plus à la montée, 30 cm de plus à la retombée.
    expect(apres - avant).toBeCloseTo(0.6, 6);
  });

  it('le total du circuit et la liste du matériel lisent ce métré-là', () => {
    const list = materialList(roomInputsOf(ROOMS, parts), FIXTURES, wallToRooms(roomInputsOf(ROOMS, parts)), placement);
    const pull = pullSchedule(list.circuits, plan.metre, plan.approx, FIXTURES);
    for (const r of pull) {
      const m = plan.metre.get(r.circuitId);
      if (!m) continue;
      // Au mètre supérieur : on n'achète pas au centimètre.
      expect(r.cableLength).toBe(Math.ceil(m.cable));
      expect(r.conduitLength).toBe(Math.ceil(m.conduit));
    }
  });
});

describe('les pontages ne changent pas de chemin', () => {
  it('deux prises voisines : la seconde se ponte AU MUR, sur l’écart', () => {
    const fx: Fixture[] = [
      FIXTURES[0],
      { id: 'p1', kind: 'prise', wallId: 'n', along: 1, height: 0.25, side: 1 },
      { id: 'p2', kind: 'prise', wallId: 'n', along: 2.5, height: 0.25, side: 1 },
    ];
    const pl = fixturePlacement(fx, PIECE, roomInputsOf(ROOMS, parts));
    const r = planRoutes(PIECE, ROOMS, parts, fx, pl)!;
    const p2 = r.traces.find((t) => t.id === 'p2')!;
    expect(p2.pose).toEqual({ kind: 'mur', niveau: 0.25 });
    const troncon = [...r.metre.values()].flatMap((m) => m.troncons).find((t) => t.id === 'p2')!;
    expect(troncon.conduit).toBeCloseTo(1.5, 9);
    // La tête de chaîne, elle, monte, traverse et retombe.
    expect(r.traces.find((t) => t.id === 'p1')!.pose?.jusqua).toBe(0.25);
  });

  it('une ligne de spots : de spot en spot au plafond, sans montée ni retombée', () => {
    const spots: CeilingFixture[] = [1, 2, 3].map((i) => ({
      id: `s${i}`,
      kind: 'spot',
      roomId: 'r1',
      at: { x: i, z: 2 },
      row: 'ligne',
    }));
    const fx: Fixture[] = [FIXTURES[0], { id: 'i1', kind: 'inter', wallId: 'n', along: 0.5, height: 1.1, side: 1, commands: spots.map((s) => s.id) }];
    const pl = fixturePlacement(fx, PIECE, roomInputsOf(ROOMS, parts));
    const r = planRoutes(PIECE, ROOMS, parts, fx, pl, spots)!;
    const s3 = r.traces.find((t) => t.id === 's3')!;
    expect(s3.pose).toEqual({ kind: 'plafond', niveau: 2.5 });
    const troncon = [...r.metre.values()].flatMap((m) => m.troncons).find((t) => t.id === 's3')!;
    expect(troncon.conduit).toBeCloseTo(1, 9);
  });
});

/* ------------------------------------------------------------------ */
/*  3. L'appartement d'exemple : les mesures avant / après             */
/* ------------------------------------------------------------------ */

describe('l’appartement d’exemple', () => {
  /*
    MESURÉ AVANT / APRÈS (même plan, même appareillage) :

      au sol (avant)       : 225,9 m de gaine · 246,9 m de câble
      par le plafond (après) : 230,8 m de gaine · 251,8 m de câble

    Le total bouge peu, mais il se redistribue : les prises paient leur
    retombée de 2,25 m (Prises 1 : 73,9 → 90,5 m de gaine), l'éclairage
    ne fait plus le tour des pièces pour rejoindre le plafond (83,0 →
    55,4 m). Le banc tient la fourchette, pas le centimètre : un meuble
    déplacé dans l'exemple ne doit pas le casser.
  */
  const ex = appartementExemple();
  const p = roomParts(ex.walls, ex.rooms);
  const pl = fixturePlacement(ex.fixtures, ex.walls, roomInputsOf(ex.rooms, p));
  const r = planRoutes(ex.walls, ex.rooms, p, ex.fixtures, pl, ex.ceiling, ex.openings)!;
  const somme = (k: 'conduit' | 'cable') => [...r.metre.values()].reduce((t, m) => t + m[k], 0);

  it('le métré total reste dans la fourchette mesurée', () => {
    expect(somme('conduit')).toBeGreaterThan(220);
    expect(somme('conduit')).toBeLessThan(242);
    expect(somme('cable') - somme('conduit')).toBeCloseTo(MOU * r.traces.length, 6);
  });

  it('aucune gaine ne court plus au sol : toutes ont leur pose', () => {
    expect(r.traces.length).toBeGreaterThan(30);
    for (const t of r.traces) expect(t.pose).toBeDefined();
    // Et presque toutes passent au plafond : seuls les pontages restent au mur.
    const auMur = r.traces.filter((t) => t.pose?.kind === 'mur').length;
    expect(auMur).toBeLessThan(r.traces.length / 2);
  });

  it('chaque départ mural direct a sa retombée, chaque point de plafond n’en a pas', () => {
    const plafond = new Set(ex.ceiling.map((c) => c.id));
    for (const t of r.traces) {
      if (t.pose?.kind !== 'plafond' || t.pose.depuis === undefined) continue;
      if (plafond.has(t.id)) expect(t.pose.jusqua).toBeUndefined();
      else expect(t.pose.jusqua).toBeDefined();
    }
  });
});

/* ------------------------------------------------------------------ */
/*  4. Le PDF : sous-titre, et un symbole par retombée                  */
/* ------------------------------------------------------------------ */

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};
const texte = (pdf: string) =>
  (pdf.match(/\(((?:[^()\\]|\\.)*)\) Tj/g) ?? []).map((m) => m.slice(1, m.lastIndexOf(')'))).join(' | ');

describe('la feuille « Plan des gaines »', () => {
  const dossier = (routes: TraceGaine[]) =>
    latin1(
      buildScanPdf(
        { name: 'Essai', walls: PIECE, openings: [], objects: [], rooms: ROOMS, fixtures: FIXTURES, routes },
        false,
        { metre: false, ceiling: DCL },
      ),
    );
  const avec = dossier(plan.traces);
  const sansPose = dossier(plan.traces.map((t) => ({ id: t.id, path: t.path })));
  /** Le triangle plein, cerné de blanc sur 0,4 point : la signature du symbole. */
  const triangles = (pdf: string) => (pdf.match(/ rg 1 1 1 RG 0\.4 w 1 j [\d.-]+ [\d.-]+ m [\d.-]+ [\d.-]+ l [\d.-]+ [\d.-]+ l b/g) ?? []).length;

  it('dit en sous-titre que la gaine passe en plafond', () => {
    expect(texte(avec)).toContain('Passage en plafond, retombées le long des murs');
  });

  it('pose un symbole de retombée au pied de chaque départ mural, pas sous le DCL', () => {
    const retombees = plan.traces.filter((t) => t.pose?.kind === 'plafond' && t.pose.jusqua !== undefined);
    // Prise, interrupteur, RJ45 : trois retombées ; le DCL n'en a pas.
    expect(retombees.map((t) => t.id).sort()).toEqual(['a', 'c', 'd']);
    expect(triangles(avec) - triangles(sansPose)).toBe(3);
  });

  it('la liste du matériel dit comment le métré a été pris', () => {
    const inputs = roomInputsOf(ROOMS, parts);
    const list = materialList(inputs, FIXTURES, wallToRooms(inputs), placement);
    const pull = pullSchedule(list.circuits, plan.metre, plan.approx, FIXTURES);
    const pdf = latin1(buildMaterialPdf('Essai', list, { pull, buy: buyingList(pull, FIXTURES) }));
    expect(texte(pdf)).toMatch(/passage en plafond/);
  });
});

/* ------------------------------------------------------------------ */
/*  5. La 3D : le tube monte, court sous le plafond, retombe            */
/* ------------------------------------------------------------------ */

describe('la gaine en volume', () => {
  const PAL = {
    floor: '#EEE',
    floorStroke: '#CCC',
    wall: '#FFF',
    wallStroke: '#888',
    wallTop: '#F4F7FB',
    wallTopStroke: '#94A0B4',
    opening: '#B9C2CE',
    door: '#E0A030',
    window: '#40A0E0',
    passage: '#2F6FF0',
    object: '#D8E1F2',
    objectTop: '#E9EEF9',
    objectStroke: '#9FACBF',
  };
  const gaines = (faces: Face3D[]) => faces.filter((f) => f.ownerId === 'gaine');
  const route: TraceGaine = {
    id: 'g',
    path: [
      { x: 0.1, z: 1 },
      { x: 3, z: 3.9 },
    ],
    pose: { kind: 'plafond', niveau: 2.5, depuis: 1.3, jusqua: 1.1 },
  };

  it('trois tronçons : montée, traversée sous plafond, retombée', () => {
    const { faces, floorY } = buildScene(PIECE, [], [], { palette: PAL, routes: [route] });
    const g = gaines(faces);
    expect(g).toHaveLength(12);
    const ys = g.flatMap((f) => f.pts.map((q) => q.y));
    // Sous le plafond, sans le traverser.
    expect(Math.max(...ys)).toBeLessThan(floorY + 2.5);
    expect(Math.max(...ys)).toBeGreaterThan(floorY + 2.4);
    // Et jamais plus bas que l'appareil : rien ne court dans la chape.
    expect(Math.min(...ys)).toBeGreaterThan(floorY + 1.05);
    // La retombée est à l'aplomb du dernier point.
    const basses = g.filter((f) => f.pts.some((q) => q.y < floorY + 1.2) && f.pts.some((q) => Math.hypot(q.x - 3, q.z - 3.9) < 0.05));
    expect(basses.length).toBeGreaterThan(0);
  });

  it('un point de plafond : la montée et la traversée, pas de retombée', () => {
    const { faces } = buildScene(PIECE, [], [], {
      palette: PAL,
      routes: [{ ...route, pose: { kind: 'plafond', niveau: 2.5, depuis: 1.3 } }],
    });
    expect(gaines(faces)).toHaveLength(8);
  });

  it('un pontage court au mur, à la hauteur des socles', () => {
    const { faces, floorY } = buildScene(PIECE, [], [], {
      palette: PAL,
      routes: [{ ...route, pose: { kind: 'mur', niveau: 0.25 } }],
    });
    const g = gaines(faces);
    expect(g).toHaveLength(4);
    for (const f of g) for (const q of f.pts) expect(Math.abs(q.y - (floorY + 0.25))).toBeLessThan(0.02);
  });
});

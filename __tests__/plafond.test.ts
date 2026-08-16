jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

/**
 * Le plafond, et LE TRAIT QUI DIT QUI COMMANDE QUOI.
 *
 * Le plan coté dit où sont les murs, la liste dit ce qu'il faut acheter ;
 * aucun des deux ne dit quel interrupteur allume quel point lumineux. C'est
 * pourtant la seule question qui reste une fois les gaines tirées, et celle
 * qui coûte une matinée quand personne n'y a répondu par écrit.
 *
 * On vérifie ici les trois choses dont dépend ce plan : la géométrie du lien
 * (une courbe, pas une droite, et qui s'arrête au bord du symbole), le
 * bilan par pièce, et la feuille PDF elle-même.
 */
import {
  CEILINGS,
  CEILING_KINDS,
  CEILING_SYMBOL,
  lightingLoad,
  spreadPoints,
  linkAnchor,
  linkCurve,
  type CeilingFixture,
} from '../src/geometry/ceiling';
import { buildScanPdf } from '../src/export/pdf';
import { buyingList } from '../src/geometry/conduits';
import {
  checkElectrical,
  fixturePlacement,
  materialList,
  roomInputsOf,
  wallToRooms,
} from '../src/geometry/nfc15100';
import { planRoutes } from '../src/geometry/elecplan';
import { castToWall, roomParts } from '../src/geometry/floorplan';
import { pointInPolygon } from '../src/geometry/appearance';

import type { WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';
import { useScanStore } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const W: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];
const R = [{ id: 'r1', name: 'Séjour', wallIds: W.map((w) => w.id) }];
const FX: Fixture[] = [
  { id: 'i1', kind: 'inter', wallId: 'n', along: 0.4, height: 1.1, side: 1 },
  { id: 'i2', kind: 'va', wallId: 's', along: 0.4, height: 1.1, side: 1 },
];
/** Un tableau en plus : sans lui, aucun cheminement n'est calculé. */
const FX2: Fixture[] = [
  ...FX,
  { id: 't', kind: 'tableau', wallId: 'w', along: 1, height: 1.35, side: 1 },
];

const PLAFOND: CeilingFixture[] = [
  { id: 'p1', kind: 'dcl', roomId: 'r1', at: { x: 2.5, z: 2 }, commands: ['i1', 'i2'] },
  { id: 'p2', kind: 'daaf', roomId: 'r1', at: { x: 1, z: 1 } },
  { id: 'p3', kind: 'spot', roomId: 'r1', at: { x: 4, z: 3 }, commands: ['i1'] },
];

describe('le catalogue du plafond', () => {
  it('chaque appareil a son symbole et sa note', () => {
    for (const k of CEILING_KINDS) {
      expect(CEILING_SYMBOL[k].length).toBeGreaterThan(0);
      expect(CEILINGS[k].note.length).toBeGreaterThan(20);
      expect(CEILINGS[k].d).toBeGreaterThan(0.05);
    }
  });

  it('ce qui n’éclaire pas ne se commande pas', () => {
    // Un détecteur de fumée n'a pas d'interrupteur, et une VMC non plus.
    expect(CEILINGS.daaf.commandable).toBe(false);
    expect(CEILINGS.vmc.commandable).toBe(false);
    expect(CEILINGS.dcl.commandable).toBe(true);
  });
});

describe('le lien de commande', () => {
  const a = { x: 0.4, z: 0.16 };
  const b = { x: 2.5, z: 2 };

  it('s’arrête AU BORD du symbole, pas en son centre', () => {
    // Un trait qui finit au milieu d'une croix la barre et la rend
    // illisible : c'est le symbole qu'on doit reconnaître, pas le trait.
    const bout = linkAnchor(a, b, 0.15);
    const reste = Math.hypot(b.x - bout.x, b.z - bout.z);
    expect(reste).toBeCloseTo(0.15, 6);
  });

  it('est une COURBE : on ne le confond ni avec une cote ni avec une gaine', () => {
    const pts = linkCurve(a, b);
    expect(pts.length).toBeGreaterThan(6);
    // Le milieu s'écarte franchement de la corde.
    const m = pts[Math.floor(pts.length / 2)];
    const droite = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    expect(Math.hypot(m.x - droite.x, m.z - droite.z)).toBeGreaterThan(0.1);
    // Mais il part et arrive bien où il faut.
    expect(pts[0].x).toBeCloseTo(a.x, 6);
    expect(pts[pts.length - 1].x).toBeCloseTo(b.x, 6);
  });

  it('deux liens partant du même point ne se superposent pas', () => {
    const c = { x: 4, z: 3 };
    const u = linkCurve(a, b);
    const v = linkCurve(a, c);
    const mu = u[6];
    const mv = v[6];
    expect(Math.hypot(mu.x - mv.x, mu.z - mv.z)).toBeGreaterThan(0.3);
  });
});

describe('le bilan par pièce', () => {
  it('compte les points lumineux, pas les détecteurs', () => {
    const load = lightingLoad(PLAFOND).get('r1')!;
    // DCL + spot = deux points ; le détecteur de fumée n'éclaire rien.
    expect(load.points).toBe(2);
    expect(load.watts).toBe(CEILINGS.dcl.watts + CEILINGS.spot.watts);
  });
});

describe('la feuille d’implantation', () => {
  const latin1 = (bytes: Uint8Array) => {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  };
  const doc = (ceiling?: CeilingFixture[]) =>
    latin1(
      buildScanPdf(
        { name: 'Séjour', walls: W, openings: [], objects: [], rooms: R, fixtures: FX },
        false,
        { metre: false, ceiling },
      ),
    );
  const texte = (src: string) =>
    (src.match(/\(((?:[^()\\]|\\.)*)\) Tj/g) ?? [])
      .map((m) => m.slice(1, m.lastIndexOf(')')))
      .join(' | ');

  it('n’existe que si le plafond est équipé', () => {
    const pages = (src: string) => (src.match(/\/Type \/Page /g) ?? []).length;
    expect(pages(doc(PLAFOND))).toBe(pages(doc()) + 1);
    expect(texte(doc())).not.toContain('implantation');
  });

  it('porte les appareils, leur sigle et la légende du lien', () => {
    const vu = texte(doc(PLAFOND));
    expect(vu).toContain('implantation');
    expect(vu).toContain('DCL');
    expect(vu).toContain('DAAF');
    expect(vu).toContain('Lien de commande');
  });

  it('garde les cotes du plan : un point lumineux se pose au mètre près', () => {
    expect(texte(doc(PLAFOND))).toMatch(/5,00 m/);
  });

  /**
   * UNE seule légende, en deux colonnes.
   *
   * La feuille en portait deux : celle de l'appareillage, que la page de
   * plan pose dans le coin qu'elle croit le plus libre, et celle du
   * plafond, clouée en bas à gauche. Elles se retrouvaient l'une sur
   * l'autre, et on ne lisait plus ni l'une ni l'autre. Le compte des
   * titres « APPAREILLAGE » le dit sans ambiguïté : la feuille du plafond
   * ne doit pas en ajouter un.
   */
  it('ne porte qu’une légende, commandes à gauche et plafond à droite', () => {
    const compte = (src: string, mot: string) =>
      texte(src).split(mot).length - 1;
    expect(compte(doc(PLAFOND), 'APPAREILLAGE')).toBe(
      compte(doc(), 'APPAREILLAGE'),
    );
    const vu = texte(doc(PLAFOND));
    expect(vu).toContain('COMMANDES');
    expect(vu).toContain('PLAFOND');
    // Ce qui commande, et seulement ça : la prise n'a rien à faire là.
    expect(vu).toContain('Va-et-vient');
  });

  it('et rien ne sort de la feuille', () => {
    const src = doc(PLAFOND);
    const re = /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (m|l) /g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      expect(parseFloat(m[1])).toBeGreaterThanOrEqual(-1);
      expect(parseFloat(m[1])).toBeLessThanOrEqual(596.28);
      expect(parseFloat(m[2])).toBeGreaterThanOrEqual(-1);
      expect(parseFloat(m[2])).toBeLessThanOrEqual(842.89);
    }
  });
});

/**
 * La liaison, dans le store : c'est elle qu'on manipule au doigt.
 *
 * Un point lumineux peut être allumé par une commande, par deux — c'est un
 * va-et-vient — et une même commande peut allumer plusieurs points. Le
 * modèle doit tenir les trois cas sans rien perdre, et savoir défaire.
 */
describe('relier une commande à un point', () => {
  const poser = () => {
    useScanStore.setState({
      walls: W,
      openings: [],
      rooms: R,
      objects: [],
      fixtures: FX,
      photos: [],
      ceiling: [
        { id: 'p1', kind: 'dcl', roomId: 'r1', at: { x: 2.5, z: 2 } },
        { id: 'p2', kind: 'spot', roomId: 'r1', at: { x: 4, z: 3 } },
      ],
    });
  };

  it('un interrupteur allume un point', () => {
    poser();
    useScanStore.getState().toggleCeilingCommand('p1', 'i1');
    const cl = useScanStore.getState().ceiling.find((c) => c.id === 'p1')!;
    expect(cl.commands).toEqual(['i1']);
  });

  it('deux commandes pour un point : le va-et-vient', () => {
    poser();
    useScanStore.getState().toggleCeilingCommand('p1', 'i1');
    useScanStore.getState().toggleCeilingCommand('p1', 'i2');
    const cl = useScanStore.getState().ceiling.find((c) => c.id === 'p1')!;
    expect(cl.commands).toEqual(['i1', 'i2']);
  });

  it('une commande peut allumer plusieurs points', () => {
    poser();
    useScanStore.getState().toggleCeilingCommand('p1', 'i1');
    useScanStore.getState().toggleCeilingCommand('p2', 'i1');
    const cl = useScanStore.getState().ceiling;
    expect(cl[0].commands).toEqual(['i1']);
    expect(cl[1].commands).toEqual(['i1']);
  });

  it('le même geste défait le lien', () => {
    poser();
    useScanStore.getState().toggleCeilingCommand('p1', 'i1');
    useScanStore.getState().toggleCeilingCommand('p1', 'i1');
    const cl = useScanStore.getState().ceiling.find((c) => c.id === 'p1')!;
    expect(cl.commands).toEqual([]);
  });

  it('et un retour en arrière rétablit ce qui était lié', () => {
    poser();
    useScanStore.getState().toggleCeilingCommand('p1', 'i1');
    jest.advanceTimersByTime(2000);
    useScanStore.getState().toggleCeilingCommand('p1', 'i2');
    useScanStore.getState().undo();
    const cl = useScanStore.getState().ceiling.find((c) => c.id === 'p1')!;
    expect(cl.commands).toEqual(['i1']);
  });
});

/**
 * Déplacer un appareil de plafond, au doigt puis au centimètre.
 *
 * Il se posait au centre de la pièce et n'en bougeait plus : pour quatre
 * spots, c'est quatre appareils empilés au même endroit. Le déplacement
 * doit donc être libre — un point lumineux n'a pas d'emprise au sol qui
 * buterait sur les murs, il se pose où l'on veut, y compris contre une
 * cloison quand c'est une applique.
 */
describe('déplacer un appareil de plafond', () => {
  it('le pose exactement où on le demande', () => {
    useScanStore.setState({
      walls: W,
      openings: [],
      rooms: R,
      objects: [],
      fixtures: FX,
      photos: [],
      ceiling: [{ id: 'p1', kind: 'spot', roomId: 'r1', at: { x: 2.5, z: 2 } }],
    });
    useScanStore.getState().moveCeiling('p1', { x: 1.2, z: 0.8 });
    const cl = useScanStore.getState().ceiling[0];
    expect(cl.at.x).toBeCloseTo(1.2, 6);
    expect(cl.at.z).toBeCloseTo(0.8, 6);
  });

  it('sans rien perdre de ses liens de commande', () => {
    useScanStore.setState({
      walls: W,
      openings: [],
      rooms: R,
      objects: [],
      fixtures: FX,
      photos: [],
      ceiling: [
        {
          id: 'p1',
          kind: 'dcl',
          roomId: 'r1',
          at: { x: 2.5, z: 2 },
          commands: ['i1'],
        },
      ],
    });
    useScanStore.getState().moveCeiling('p1', { x: 3, z: 1 });
    expect(useScanStore.getState().ceiling[0].commands).toEqual(['i1']);
  });

  it('et le déplacement s’annule', () => {
    useScanStore.setState({
      walls: W,
      openings: [],
      rooms: R,
      objects: [],
      fixtures: FX,
      photos: [],
      ceiling: [{ id: 'p1', kind: 'spot', roomId: 'r1', at: { x: 2.5, z: 2 } }],
    });
    useScanStore.getState().moveCeiling('p1', { x: 1, z: 1 });
    useScanStore.getState().undo();
    expect(useScanStore.getState().ceiling[0].at.x).toBeCloseTo(2.5, 6);
  });
});

/**
 * Les murs arrêtent un appareil de plafond, comme ils arrêtent un meuble.
 *
 * J'avais choisi l'inverse — un point lumineux n'a pas d'emprise au sol, il
 * peut se coller à une cloison. À l'usage, c'est faux : le doigt dépasse
 * tout le temps, on vise un coin et on sort de la pièce. Un appareil hors
 * de sa pièce n'a ni circuit, ni métré, ni sens sur le chantier.
 */
describe('les murs arrêtent l’appareil', () => {
  const poser = (at: { x: number; z: number }) => {
    useScanStore.setState({
      walls: W,
      openings: [],
      rooms: R,
      objects: [],
      fixtures: FX,
      photos: [],
      ceiling: [{ id: 'p1', kind: 'spot', roomId: 'r1', at: { x: 2.5, z: 2 } }],
    });
    useScanStore.getState().moveCeiling('p1', at);
    return useScanStore.getState().ceiling[0].at;
  };

  it('un point visé hors de la pièce revient sur son bord', () => {
    // La pièce fait 5 × 4 : viser à 9 m, c'est viser dehors.
    const at = poser({ x: 9, z: 2 });
    expect(at.x).toBeLessThan(5);
    expect(at.x).toBeGreaterThan(4.5);
  });

  it('et il ne chevauche pas la maçonnerie', () => {
    const at = poser({ x: -3, z: 2 });
    // Rentré d'au moins la demi-épaisseur du mur.
    expect(at.x).toBeGreaterThan(0.09);
  });

  it('à l’intérieur, rien ne le déplace', () => {
    const at = poser({ x: 1.4, z: 2.6 });
    expect(at.x).toBeCloseTo(1.4, 6);
    expect(at.z).toBeCloseTo(2.6, 6);
  });
});

/**
 * Le plafond entre dans le matériel — sinon personne ne l'achète.
 *
 * Huit spots figuraient au plan, et le bordereau n'en portait aucun. Chaque
 * point lumineux emporte en outre SA BOÎTE — une DCL pour un point de
 * centre, une boîte de dérivation pour une applique — qu'on oublie encore
 * plus facilement que le luminaire.
 */
describe('le plafond au bordereau', () => {
  const rows = [
    {
      circuitId: 'c1',
      label: 'Éclairage',
      section: 1.5,
      conduit: 16 as const,
      runs: 2,
      conduitLength: 20,
      cableLength: 24,
      approx: false,
      protection: '16 A',
    },
  ];
  const plafond: CeilingFixture[] = [
    { id: 'a', kind: 'spot', roomId: 'r1', at: { x: 1, z: 1 } },
    { id: 'b', kind: 'spot', roomId: 'r1', at: { x: 2, z: 1 } },
    { id: 'c', kind: 'dcl', roomId: 'r1', at: { x: 3, z: 1 } },
    { id: 'd', kind: 'applique', roomId: 'r1', at: { x: 4, z: 1 } },
    { id: 'e', kind: 'daaf', roomId: 'r1', at: { x: 1, z: 3 } },
  ];

  it('compte chaque appareil, dans son rayon', () => {
    const list = buyingList(rows, [], plafond);
    const spots = list.find((r) => r.label === CEILINGS.spot.label)!;
    expect(spots.quantity).toBe(2);
    expect(spots.family).toBe('Plafond');
    expect(list.find((r) => r.label === CEILINGS.daaf.label)!.quantity).toBe(1);
  });

  it('n’oublie pas les boîtes, et pas la même selon le point', () => {
    const list = buyingList(rows, [], plafond);
    const dcl = list.find((r) => r.label.includes('Boîte de centre DCL'))!;
    expect(dcl.quantity).toBe(1);
    const der = list.find((r) => r.label.includes('dérivation'))!;
    expect(der.quantity).toBe(1);
    // Un spot ne demande ni l'une ni l'autre : il s'encastre.
    expect(dcl.quantity + der.quantity).toBe(2);
  });

  it('sans plafond, le bordereau ne change pas', () => {
    const list = buyingList(rows, []);
    expect(list.some((r) => r.family === 'Plafond')).toBe(false);
  });
});

/**
 * Le plafond entre dans les CIRCUITS — sinon le dossier se contredit.
 *
 * On posait huit spots, le bordereau les comptait, et le tableau annonçait
 * « 0 point ». Le métré de gaine ne montait jamais au plafond, et les
 * schémas les ignoraient : trois feuilles qui décrivaient trois
 * installations différentes.
 */
describe('le plafond dans les circuits', () => {
  const inputs = roomInputsOf(R, roomParts(W, R));
  const w2r = wallToRooms(inputs);

  it('les points de plafond comptent dans le circuit d’éclairage', () => {
    const spots: CeilingFixture[] = Array.from({ length: 3 }, (_, i) => ({
      id: `s${i}`,
      kind: 'spot' as const,
      roomId: 'r1',
      at: { x: 1 + i, z: 2 },
    }));
    const list = materialList(inputs, FX, w2r, undefined, undefined, spots);
    const ecl = list.circuits.find((c) => c.nature === 'eclairage')!;
    expect(ecl.points).toBe(3);
    expect(ecl.ceilingIds).toHaveLength(3);
  });

  it('ce qui n’éclaire pas ne compte pas comme point', () => {
    const mix: CeilingFixture[] = [
      { id: 'a', kind: 'dcl', roomId: 'r1', at: { x: 1, z: 2 } },
      { id: 'b', kind: 'daaf', roomId: 'r1', at: { x: 2, z: 2 } },
      { id: 'c', kind: 'vmc', roomId: 'r1', at: { x: 3, z: 2 } },
    ];
    const list = materialList(inputs, FX, w2r, undefined, undefined, mix);
    expect(list.circuits.find((c) => c.nature === 'eclairage')!.points).toBe(1);
  });

  it('au-delà de huit points, un second circuit', () => {
    const dix: CeilingFixture[] = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      kind: 'spot' as const,
      roomId: 'r1',
      at: { x: 1, z: 1 },
    }));
    const list = materialList(inputs, FX, w2r, undefined, undefined, dix);
    const ecl = list.circuits.filter((c) => c.nature === 'eclairage');
    expect(ecl.length).toBe(2);
    expect(ecl.reduce((n, c) => n + c.points, 0)).toBe(10);
  });
});

/**
 * Et la gaine MONTE jusqu'à eux.
 *
 * Sans les deux derniers segments — la montée le long du mur et la traversée
 * du plafond — un circuit de six spots ne comptait que le tour de la pièce.
 */
describe('le cheminement jusqu’au plafond', () => {
  const parts = roomParts(W, R);
  const inputs = roomInputsOf(R, parts);
  const placement = fixturePlacement(FX2, W, inputs);

  it('le métré d’un circuit d’éclairage grandit avec ses points', () => {
    const sans = planRoutes(W, R, parts, FX2, placement, [])!;
    const avec = planRoutes(W, R, parts, FX2, placement, [
      { id: 'p', kind: 'dcl', roomId: 'r1', at: { x: 2.5, z: 2 } },
    ])!;
    const total = (p: typeof sans) =>
      [...p.metre.values()].reduce((n, m) => n + m.cable, 0);
    // La montée (2,5 − 0,3 m) et la traversée s'ajoutent : au moins deux
    // mètres de plus, et sûrement pas moins.
    expect(total(avec)).toBeGreaterThan(total(sans) + 2);
  });

  it('et son tracé va jusqu’au point, pas jusqu’au mur', () => {
    const plan = planRoutes(W, R, parts, FX2, placement, [
      { id: 'p', kind: 'dcl', roomId: 'r1', at: { x: 2.5, z: 2 } },
    ])!;
    const trace = plan.traces.find((t) => t.id === 'p')!;
    const bout = trace.path[trace.path.length - 1];
    expect(bout.x).toBeCloseTo(2.5, 6);
    expect(bout.z).toBeCloseTo(2, 6);
  });
});

/**
 * Les contrôles du plafond, et leur réserve.
 *
 * Ils ne parlent QUE si le plafond a commencé à être équipé : sans cela,
 * tout scan d'avant cette fonction sortirait avec une alerte par pièce, pour
 * une information que personne n'a saisie. Même règle que pour les volumes
 * de salle d'eau — se taire vaut mieux que crier au loup.
 */
describe('les contrôles du plafond', () => {
  const inputs = roomInputsOf(R, roomParts(W, R));
  const w2r = wallToRooms(inputs);
  const check = (ceiling: CeilingFixture[]) =>
    checkElectrical(inputs, FX, w2r, undefined, undefined, undefined, ceiling);

  it('se taisent tant que rien n’est posé au plafond', () => {
    const codes = check([]).map((i) => i.code);
    expect(codes).not.toContain('eclairage');
    expect(codes).not.toContain('daaf');
  });

  it('signalent une pièce sans point lumineux', () => {
    // Un détecteur ailleurs suffit à « ouvrir » les contrôles.
    const issues = check([
      { id: 'd', kind: 'daaf', roomId: 'autre', at: { x: 1, z: 1 } },
    ]);
    expect(issues.some((i) => i.code === 'eclairage')).toBe(true);
  });

  it('réclament un détecteur de fumée dans le logement', () => {
    const issues = check([
      { id: 'p', kind: 'dcl', roomId: 'r1', at: { x: 2, z: 2 } },
    ]);
    const daaf = issues.find((i) => i.code === 'daaf')!;
    expect(daaf.severity).toBe('alerte');
    expect(daaf.message).toMatch(/détecteur de fumée/);
  });

  it('et refusent un détecteur en cuisine', () => {
    const cuisine = roomInputsOf(
      [{ id: 'r1', name: 'Cuisine', wallIds: W.map((w) => w.id) }],
      roomParts(W, [{ id: 'r1', wallIds: W.map((w) => w.id) }]),
    );
    const issues = checkElectrical(
      cuisine,
      FX,
      wallToRooms(cuisine),
      undefined,
      undefined,
      undefined,
      [
        { id: 'p', kind: 'dcl', roomId: 'r1', at: { x: 2, z: 2 } },
        { id: 'd', kind: 'daaf', roomId: 'r1', at: { x: 1, z: 1 } },
      ],
    );
    expect(
      issues.some((i) => i.code === 'daaf' && /mal placé/.test(i.message)),
    ).toBe(true);
  });
});

/**
 * La ligne de spots : quatre poses en un geste.
 *
 * Sur un chantier, personne ne place des spots un par un « à peu près ». On
 * les aligne sur la longueur de la pièce, à intervalles égaux, avec un
 * demi-intervalle aux extrémités — sans quoi on obtient deux spots collés
 * aux murs et un trou au milieu.
 */
describe('répartir une ligne de spots', () => {
  /** Une pièce de 6 × 3, d'équerre avec le monde. */
  const SALLE = [
    { x: 0, z: 0 },
    { x: 6, z: 0 },
    { x: 6, z: 3 },
    { x: 0, z: 3 },
  ];

  it('les aligne sur la LONGUEUR, à intervalles égaux', () => {
    const pts = spreadPoints(SALLE, 4, 0);
    expect(pts).toHaveLength(4);
    // Tous sur l'axe médian de la pièce.
    for (const p of pts) expect(p.z).toBeCloseTo(1.5, 6);
    // Un demi-intervalle aux bouts : 0,75 / 2,25 / 3,75 / 5,25.
    expect(pts.map((p) => Math.round(p.x * 100) / 100)).toEqual([
      0.75, 2.25, 3.75, 5.25,
    ]);
  });

  it('suit la longueur même quand la pièce est en travers', () => {
    const couloir = [
      { x: 0, z: 0 },
      { x: 2, z: 0 },
      { x: 2, z: 8 },
      { x: 0, z: 8 },
    ];
    const pts = spreadPoints(couloir, 3, 0);
    // Ici c'est z qui est long : les spots s'y répartissent.
    for (const p of pts) expect(p.x).toBeCloseTo(1, 6);
    expect(pts.map((p) => Math.round(p.z * 100) / 100)).toEqual([
      1.33, 4, 6.67,
    ]);
  });

  it('et suit la TRAME quand la pièce est relevée de biais', () => {
    const a = (20 * Math.PI) / 180;
    const tourne = SALLE.map((p) => ({
      x: p.x * Math.cos(a) - p.z * Math.sin(a),
      z: p.x * Math.sin(a) + p.z * Math.cos(a),
    }));
    const pts = spreadPoints(tourne, 4, a);
    // Les quatre points restent alignés : leurs écarts successifs sont
    // égaux, ce qui ne serait pas le cas sur les axes du monde.
    const d = [0, 1, 2].map((i) =>
      Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z),
    );
    expect(d[1]).toBeCloseTo(d[0], 3);
    expect(d[2]).toBeCloseTo(d[0], 3);
    expect(d[0]).toBeCloseTo(1.5, 3);
  });

  it('un seul spot se pose au centre', () => {
    const [p] = spreadPoints(SALLE, 1, 0);
    expect(p.x).toBeCloseTo(3, 6);
    expect(p.z).toBeCloseTo(1.5, 6);
  });

  it('et rien ne sort du contour', () => {
    // Une pièce en L : la ligne droite traverserait le vide.
    const enL = [
      { x: 0, z: 0 },
      { x: 6, z: 0 },
      { x: 6, z: 1.2 },
      { x: 2, z: 1.2 },
      { x: 2, z: 4 },
      { x: 0, z: 4 },
    ];
    for (const p of spreadPoints(enL, 5, 0)) {
      expect(pointInPolygon(p, enL)).toBe(true);
    }
  });
});

/**
 * Le bandeau de réglage dit LA MÊME CHOSE que le plan.
 *
 * Il affichait des coordonnées comptées depuis le coin de l'emprise de la
 * pièce, pendant que les pointillés du plan montraient les distances aux
 * murs. Deux quantités différentes côte à côte : le bandeau contredisait le
 * dessin, et on ne savait plus laquelle croire.
 *
 * La règle, désormais : ce qu'on lit dans le bandeau est ce que mesure le
 * plan — la distance au nu du mur, dans la trame du logement. On la vérifie
 * ici en la parcourant à l'envers : poser l'appareil à N centimètres d'un
 * mur doit donner exactement N.
 */
describe('les cotes du bandeau', () => {
  const AXES = (frame: number) => ({
    gauche: { x: -Math.cos(frame), z: -Math.sin(frame) },
    haut: { x: Math.sin(frame), z: -Math.cos(frame) },
  });

  it('la distance lue est celle du mur, pas celle d’un coin', () => {
    // Pièce 5 × 4 d'équerre ; un point à 1,20 m du mur de gauche.
    const at = { x: 1.2, z: 2 };
    const gap = castToWall(at, AXES(0).gauche, W);
    // Le mur de gauche est en x = 0, son nu à 7 cm : 1,13 m.
    expect(gap).not.toBeNull();
    expect(gap!).toBeCloseTo(1.2 - 0.07, 2);
  });

  it('et déplacer de d change la distance de d, exactement', () => {
    const at = { x: 1.2, z: 2 };
    const avant = castToWall(at, AXES(0).gauche, W)!;
    const bouge = { x: at.x + 0.5, z: at.z };
    const apres = castToWall(bouge, AXES(0).gauche, W)!;
    expect(apres - avant).toBeCloseTo(0.5, 6);
  });

  it('les deux axes du bandeau sont perpendiculaires entre eux', () => {
    const a = AXES(0.37);
    expect(a.gauche.x * a.haut.x + a.gauche.z * a.haut.z).toBeCloseTo(0, 9);
  });
});

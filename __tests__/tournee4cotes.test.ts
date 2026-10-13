/**
 * TOURNÉE N°4 — LES COTES D'UN COFFRE DE CHEMINÉE.
 *
 * « Claire » : sur son haussmannien, « 0,42 m » se lisait « 42 m ». Les
 * retours du coffre de cheminée passaient pour des façades — à 30 cm
 * derrière eux, il n'y a pas de pièce — et leurs cotes se posaient en chaîne
 * « dehors », c'est-à-dire dans le poché, qui en mangeait le début. Le dehors
 * est ce qui n'est pas dans le bâti : la masse d'une cheminée ou un placard
 * muré n'en sont pas.
 */
import { buildScanPdf } from '../src/export/pdf';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import { dansLeBati } from '../src/geometry/poche';

const mur = (id: string, ax: number, az: number, bx: number, bz: number, epaisseur = 0.3): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.6,
  yCenter: 1.3,
  auNu: true,
  epaisseur,
});

/*
  Un séjour de 6 × 4,5 m à l'axe, et contre sa façade ouest un coffre de
  cheminée en saillie : deux retours de 0,60 m et une face de 1,40 m à
  l'axe, en 10 cm. Le mur
  du fond du coffre ne borde pas la pièce.
*/
const MURS: WallSeg[] = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 4.5),
  mur('s', 6, 4.5, 0, 4.5),
  mur('o1', 0, 4.5, 0, 2.9),
  mur('o2', 0, 2.9, 0, 1.5),
  mur('o3', 0, 1.5, 0, 0),
  mur('r1', 0, 1.5, 0.6, 1.5, 0.1),
  mur('r2', 0, 2.9, 0.6, 2.9, 0.1),
  mur('f', 0.6, 1.5, 0.6, 2.9, 0.1),
];
const PIECES = [{ id: 'sej', wallIds: ['n', 'e', 's', 'o1', 'r2', 'f', 'r1', 'o3'] }];

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};
const RE =
  /BT \/F\d ([\d.-]+) Tf [\d.-]+ [\d.-]+ [\d.-]+ rg ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) Tm \(((?:[^()\\]|\\.)*)\) Tj ET/g;

/** Les mots de la page du plan (la première du dossier), avec leur taille. */
const motsDuPlan = (walls: WallSeg[], rooms: typeof PIECES) => {
  const src = latin1(
    buildScanPdf(
      {
        name: 'Coffre',
        walls,
        openings: [],
        objects: [],
        rooms,
        roomNames: { sej: 'Séjour' },
        fixtures: [],
        notes: [],
        north: null,
      } as never,
      false,
      { metre: false, surfaces: true } as never,
    ),
  );
  const i = src.indexOf('stream\n');
  const page = src.slice(i + 7, src.indexOf('\nendstream', i));
  const out: { txt: string; taille: number; x: number }[] = [];
  let m: RegExpExecArray | null;
  RE.lastIndex = 0;
  while ((m = RE.exec(page))) out.push({ txt: m[8], taille: Number(m[1]), x: Number(m[6]) });
  return out;
};

describe('le dedans du bâti', () => {
  it('la masse d’une cheminée est dans le bâti, la rue n’y est pas', () => {
    expect(roomParts(MURS, PIECES)[0].surface?.exact).toBe(true);
    expect(dansLeBati(MURS, { x: 0.3, z: 2.2 })).toBe(true); // dans le coffre
    expect(dansLeBati(MURS, { x: 3, z: 2 })).toBe(true); // dans le séjour
    expect(dansLeBati(MURS, { x: -0.8, z: 2.2 })).toBe(false); // dehors, derrière le coffre
    expect(dansLeBati(MURS, { x: 3, z: 5.2 })).toBe(false);
  });
});

describe('les cotes du coffre', () => {
  const mots = motsDuPlan(MURS, PIECES);

  it('les retours et la face se cotent comme des cloisons, pas en chaîne de façade', () => {
    // Retours : du nu de la façade (0,15) à la face du coffre côté pièce (0,65).
    const retours = mots.filter((m) => m.txt === '0,50 m');
    expect(retours).toHaveLength(2);
    // Face : du nu d'un retour (1,45) à l'autre (2,95).
    const face = mots.filter((m) => m.txt === '1,50 m');
    expect(face).toHaveLength(1);
    // La chaîne des façades s'écrit en 8,5 ; une cloison, en 7,5 ou 6,5.
    for (const m of [...retours, ...face]) expect(m.taille).toBeLessThan(8);
  });

  it('elles s’écrivent dans la pièce, à droite de la façade et non dans le poché', () => {
    // La façade ouest se cote dehors, à sa gauche : sa chaîne est le repère.
    const chaine = mots.filter((m) => m.taille === 8.5 && m.txt === '1,40 m');
    expect(chaine).toHaveLength(1);
    const retours = mots.filter((x) => x.txt === '0,50 m');
    expect(retours).toHaveLength(2);
    for (const m of retours) expect(m.x).toBeGreaterThan(chaine[0].x + 20);
  });

  it('les vraies façades gardent leur chaîne dehors', () => {
    expect(mots.some((m) => m.txt === '5,70 m' && m.taille === 8.5)).toBe(true);
  });

  it('un pan coupé à l’angle du bâti reste une façade', () => {
    // Sans angle droit derrière lui, le pan coupé donne sur la rue.
    const murs = [
      mur('n', 0, 0, 5, 0),
      mur('p', 5, 0, 6, 1),
      mur('e', 6, 1, 6, 4.5),
      mur('s', 6, 4.5, 0, 4.5),
      mur('o', 0, 4.5, 0, 0),
    ];
    const m = motsDuPlan(murs, [{ id: 'sej', wallIds: ['n', 'p', 'e', 's', 'o'] }]);
    const pan = m.filter((x) => /^1,\d\d m$/.test(x.txt) && x.taille === 8.5);
    expect(pan.length).toBeGreaterThanOrEqual(1);
  });
});

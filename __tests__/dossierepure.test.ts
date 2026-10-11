/**
 * LE DOSSIER ÉPURÉ — « on enlève le superflu et on améliore la qualité de
 * l'utile ».
 *
 * Relevé du patron : « ajoute des agents sur l'export PDF qui chercheront
 * les défauts visuels et techniques, sur différentes conceptions
 * d'appartements. Compare ces plans à de réels plans pro dignes de vrais
 * architectes. » Quatre revues indépendantes (un T2 de 48 m², un T2
 * classique, une cloison équipée des deux côtés, une enfilade, un studio en
 * L, un pan coupé, une niche) ont relevé les mêmes choses. Ce banc tient ce
 * qu'on en a retiré, et ce qu'on a réparé.
 */
import { buildScanPdf } from '../src/export/pdf';
import { empriseDuCoffre, roomParts, type WallSeg } from '../src/geometry/floorplan';
import { fixturePlacement, materialList, roomInputsOf, wallToRooms } from '../src/geometry/nfc15100';
import { fixtureMarks, multiWire, schemaRows } from '../src/geometry/schema';
import type { Fixture } from '../src/geometry/electrical';
import type { CeilingFixture } from '../src/geometry/ceiling';

/** Le sol du relevé n'est pas à zéro : RoomPlan le met sous l'iPhone. */
const SOL = -1.32;

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: SOL + 1.25,
  roomId: 'r1',
});

const W: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];
/** Une fenêtre de 1,20 × 1,35 sur allège de 0,90, avec son coffre de 0,24. */
const FENETRE: WallSeg = {
  id: 'f1',
  type: 'window',
  a: { x: 1.5, z: 0 },
  b: { x: 2.7, z: 0 },
  height: 1.35,
  yCenter: SOL + 0.9 + 1.35 / 2,
  roomId: 'r1',
  coffre: 0.24,
};
const R = [{ id: 'r1', name: 'Séjour', wallIds: W.map((w) => w.id) }];

const f = (id: string, kind: Fixture['kind'], wallId: string, along: number, height: number): Fixture => ({
  id,
  kind,
  wallId,
  along,
  height,
  side: 1,
});
const FX: Fixture[] = [
  f('a', 'prise', 'n', 0.5, 0.25),
  f('b', 'prise2', 'e', 1.5, 0.25),
  f('i', 'inter', 'w', 3.4, 1.1),
  f('h', 'rj45', 's', 3, 0.25),
];
const DCL = (commands?: string[]): CeilingFixture[] => [
  { id: 'l1', kind: 'dcl', roomId: 'r1', at: { x: 2.5, z: 2 }, ...(commands ? { commands } : {}) },
];

const parts = roomParts(W, R);
const inputs = roomInputsOf(R, parts);
const placement = fixturePlacement(FX, W, inputs);
const list = materialList(inputs, FX, wallToRooms(inputs), placement);
const rows = schemaRows(list.circuits, list.differentials, FX);
const schemas = {
  rows,
  differentials: list.differentials,
  multi: list.circuits.map((c, i) => multiWire(c, FX, `C${i + 1}`)),
  marks: fixtureMarks(list.circuits),
};

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};
/** Une baie vitrée de 2,40 × 2,05, sans allège : une porte-fenêtre. */
const BAIE: WallSeg = {
  id: 'pf',
  type: 'window',
  a: { x: 1, z: 4 },
  b: { x: 3.4, z: 4 },
  height: 2.05,
  yCenter: SOL + 2.05 / 2,
  roomId: 'r1',
};
const dossier = (opts: Record<string, unknown> = {}, include3D = true, openings: WallSeg[] = [FENETRE]) =>
  latin1(
    buildScanPdf(
      {
        name: 'Séjour',
        walls: W,
        openings,
        objects: [],
        rooms: R,
        fixtures: FX,
        north: 0,
        client: 'M. et Mme Martin',
        address: '12 rue des Lilas, 69003 Lyon',
      } as never,
      include3D,
      {
        views: [{ theta: -32, tilt: 58, zoom: 1, fx: 0, fy: 0 }],
        schemas,
        ceiling: DCL(),
        metre: true,
        garde: true,
        elevations: true,
        ...opts,
      } as never,
    ),
  );

/** Les flux de pages, dans l'ordre. */
const flux = (src: string): string[] => {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const a = src.indexOf('stream\n', i);
    if (a < 0) break;
    const b = src.indexOf('\nendstream', a);
    out.push(src.slice(a + 7, b));
    i = b + 10;
  }
  return out;
};
const mots = (s: string): string[] =>
  (s.match(/\(((?:[^()\\]|\\.)*)\) Tj/g) ?? []).map((m) => m.slice(1, m.lastIndexOf(')')));
const texte = (s: string) => mots(s).join(' | ');
const pageOu = (src: string, mot: string) => flux(src).find((p) => texte(p).includes(mot)) ?? '';
/** La feuille dont le cartouche porte ce titre (le sommaire de la garde les cite toutes). */
const feuille = (src: string, titre: string) =>
  flux(src).find((p) => texte(p).includes(`DOCUMENT | ${titre}`)) ?? '';

const SRC = dossier();

describe('ce qu’on retire', () => {
  it('la page multifilaire : des traits de couleur, sans appareil ni borne', () => {
    expect(SRC).not.toContain('multifilaire');
  });

  it('la perspective qui redit la page de garde', () => {
    expect(texte(SRC)).not.toMatch(/\| Perspective \|/);
    // Sans page de garde, la vue garde sa feuille.
    expect(texte(dossier({ garde: false }))).toMatch(/Perspective/);
  });

  it('et la légende de la vue, qui ne disait que des degrés', () => {
    expect(SRC).not.toMatch(/inclinaison \d+/);
  });

  it('les quatre lignes de référence des élévations', () => {
    const vu = texte(SRC);
    for (const l of ['plinthe 25', 'commande 110', 'tableau 135', 'applique 210']) {
      expect(vu).not.toContain(l);
    }
  });

  it('la rose réduite au nord : plus de E, S, O éparpillés', () => {
    const plan = mots(feuille(SRC, 'Plan d'));
    expect(plan.length).toBeGreaterThan(10);
    expect(plan).toContain('N');
    for (const l of ['E', 'S', 'O']) expect(plan).not.toContain(l);
  });

  it('les watts d’éclairage du métré, qui ne veulent rien dire avec des LED', () => {
    expect(texte(SRC)).not.toMatch(/\d W\b/);
  });

  it('le pavé Loi Carrez, réduit à une ligne', () => {
    const vu = texte(SRC);
    expect(vu).toContain('Carrez');
    expect(vu).not.toContain('baisse du prix');
  });

  it('la surface habitable quand elle redit la surface au sol', () => {
    expect(texte(SRC)).not.toContain('Habitable estim');
  });

  it('la mention bavarde de l’unifilaire', () => {
    expect(texte(SRC)).not.toContain('Coupure d');
  });
});

describe('la légende ne promet que ce qui est dessiné', () => {
  it('pas de « Lien de commande » quand aucun lien n’est tracé', () => {
    expect(texte(SRC)).not.toContain('Lien de commande');
  });

  it('et il revient dès qu’un interrupteur commande le point', () => {
    expect(texte(dossier({ ceiling: DCL(['i']) }))).toContain('Lien de commande');
  });
});

describe('le coffre de volet sur son linteau', () => {
  it('son emprise se compte depuis le sol du relevé, pas depuis l’iPhone', () => {
    const e = empriseDuCoffre(FENETRE, 0, SOL)!;
    // Haut de baie : allège 0,90 + 1,35 = 2,25 ; coffre de 0,24 au-dessus.
    expect(e.y0).toBeCloseTo(2.25);
    expect(e.y1).toBeCloseTo(2.49);
    // Sans sol donné : le repère du scan, comme avant.
    expect(empriseDuCoffre(FENETRE)!.y0).toBeCloseTo(SOL + 2.25);
  });

  it('et l’élévation le dessine au-dessus de la fenêtre', () => {
    const page = pageOu(SRC, 'COFFRE');
    expect(page).not.toBe('');
    // Le mot « COFFRE » et le nom de la baie : le coffre est plus haut que
    // le bas de la fenêtre, et le mot « Fenêtre » plus haut que le coffre.
    const y = (mot: string) => {
      const m = page.match(new RegExp(`([\\d.-]+) Tm \\(${mot}[^)]*\\) Tj`));
      return m ? Number(m[1]) : NaN;
    };
    const yCoffre = y('COFFRE');
    const yFenetre = y('Fen');
    const yBas = y('120 ');
    expect(yCoffre).toBeLessThan(yFenetre);
    expect(yCoffre).toBeGreaterThan(yBas);
    // Et il n'est plus à mi-hauteur de la baie : collé sous le nom, posé
    // sur le linteau. Décalé de la hauteur du sol, il tombait 1,32 m plus
    // bas — à plus de la moitié du chemin vers le bas de la baie.
    expect((yFenetre - yCoffre) / (yFenetre - yBas)).toBeLessThan(0.4);
  });
});

describe('la baie qui part du sol', () => {
  it('se nomme porte-fenêtre', () => {
    const vu = texte(dossier({}, true, [FENETRE, BAIE]));
    expect(vu).toContain('Porte-fen');
    // La fenêtre sur allège garde son nom.
    expect(vu).toMatch(/\| Fen\S*tre \|/);
    expect(vu).toContain('240 ');
  });
});

describe('l’unifilaire se lit en entier', () => {
  const page = feuille(SRC, 'Schéma unifilaire');

  it('un départ 230 V, c’est trois conducteurs : phase, neutre, terre', () => {
    // Le chiffre de la barre oblique : jamais plus de trois sur un départ.
    const chiffres = mots(page).filter((m) => /^\d$/.test(m)).map(Number);
    expect(chiffres.length).toBeGreaterThan(0);
    for (const c of chiffres) expect(c).toBeLessThanOrEqual(3);
  });

  it('le coffret de communication dit ce qu’il est', () => {
    expect(texte(page)).not.toMatch(/\| GTL \|/);
    expect(texte(page)).toContain('Coffret');
  });
});

describe('le cartouche dit tout, sans couper', () => {
  it('le client et l’adresse en entier', () => {
    expect(texte(SRC)).toContain('12 rue des Lilas, 69003 Lyon');
  });

  it('l’élévation s’y nomme par son mur', () => {
    // (Le tiret cadratin s'écrit en WinAnsi, octet 0x97.)
    expect(texte(SRC)).toMatch(/DOCUMENT \| Mur \d+ \x97 /);
  });
});

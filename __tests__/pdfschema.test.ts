/**
 * Les deux feuilles de schéma, telles qu'elles sortent du PDF.
 *
 * Faute de pouvoir les regarder d'ici, on les relit : les repères y sont,
 * les protections aussi, les couleurs sont bien celles de la norme — et
 * surtout, rien ne sort de la feuille. Un trait qui déborde est invisible à
 * la génération et saute aux yeux à l'impression.
 */
import { buildScanPdf } from '../src/export/pdf';
import {
  fixturePlacement,
  materialList,
  roomInputsOf,
  wallToRooms,
} from '../src/geometry/nfc15100';
import { WIRE_COLORS, multiWire, schemaRows } from '../src/geometry/schema';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';

const PAGE_W = 595.28;
const PAGE_H = 841.89;

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
const R = [{ id: 'r1', name: 'Cuisine', wallIds: W.map((w) => w.id) }];

const f = (
  id: string,
  kind: Fixture['kind'],
  wallId: string,
  along: number,
  height: number,
): Fixture => ({ id, kind, wallId, along, height, side: 1 });

/** Une cuisine complète : cuisson, spécialisés, éclairage, VDI. */
const FX: Fixture[] = [
  f('t', 'tableau', 'w', 1, 1.35),
  f('a', 'prise', 'n', 0.5, 0.25),
  f('b', 'prise2', 'n', 1.5, 1.1),
  f('c', 'prise32', 'n', 3, 1.1),
  f('d', 'inter', 'e', 1, 1.1),
  f('e', 'va', 'e', 2, 1.1),
  f('g', 'applique', 's', 2, 2.1),
  f('h', 'rj45', 's', 3, 0.25),
  f('i', 'prise20', 'n', 4, 1.1),
];

const parts = roomParts(W, R);
const inputs = roomInputsOf(R, parts);
const placement = fixturePlacement(FX, W, inputs);
const list = materialList(inputs, FX, wallToRooms(inputs), placement);
const rows = schemaRows(list.circuits, list.differentials, FX);
const multi = list.circuits.map((c, i) => multiWire(c, FX, `C${i + 1}`));

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};

const pdf = latin1(
  buildScanPdf(
    { name: 'Cuisine', walls: W, openings: [], objects: [], rooms: R, fixtures: FX },
    false,
    { metre: false, schemas: { rows, differentials: list.differentials, multi } },
  ),
);

const sansSchema = latin1(
  buildScanPdf(
    { name: 'Cuisine', walls: W, openings: [], objects: [], rooms: R, fixtures: FX },
    false,
    { metre: false },
  ),
);

const texte = (src: string) =>
  (src.match(/\(((?:[^()\\]|\\.)*)\) Tj/g) ?? [])
    .map((m) => m.slice(1, m.lastIndexOf(')')))
    .join(' | ');

/** La couleur telle que le PDF l'écrit : « r g b RG ». */
const trait = (hex: string) => {
  const v = (i: number) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(2);
  return `${v(1)} ${v(3)} ${v(5)} RG`;
};

describe('la feuille unifilaire', () => {
  const doc = texte(pdf);

  it('n’existe que si on la demande', () => {
    expect(texte(sansSchema)).not.toContain('unifilaire');
    expect(doc).toContain('unifilaire');
  });

  it('part du disjoncteur de branchement', () => {
    expect(doc).toContain('AGCP');
    expect(doc).toContain('500 mA');
  });

  it('porte un repère par circuit, dans l’ordre du tableau', () => {
    expect(rows.length).toBeGreaterThan(3);
    for (const r of rows) expect(doc).toContain(r.mark);
    expect(rows.map((r) => r.mark)).toEqual(
      rows.map((_, i) => `C${i + 1}`),
    );
  });

  it('donne calibre, section et gaine de chaque départ', () => {
    const prises = rows.find((r) => r.label.startsWith('Prises'))!;
    expect(doc).toContain(`${prises.breaker} A`);
    expect(doc).toContain(`${prises.section} mm²`);
    expect(doc).toContain(`ICTA Ø${prises.conduit}`);
  });

  it('range les départs sous leur différentiel', () => {
    expect(list.differentials.length).toBeGreaterThan(0);
    expect(doc).toContain('ID1');
    expect(doc).toContain('30 mA');
    // Un circuit VDI n'est pas derrière un différentiel de puissance.
    expect(rows.find((r) => r.breaker === null)?.under).toBeUndefined();
  });
});

describe('la feuille multifilaire', () => {
  const doc = texte(pdf);

  it('emploie les couleurs de la norme, et le PDF les écrit vraiment', () => {
    expect(pdf).toContain(trait(WIRE_COLORS.neutre.color));
    expect(pdf).toContain(trait(WIRE_COLORS.terre.color));
    expect(pdf).toContain(trait(WIRE_COLORS.phase.color));
    expect(doc).toMatch(/bleu/i);
    expect(doc).toMatch(/vert/i);
  });

  it('montre un conducteur par trait, avec sa section', () => {
    const eclairage = multi.find((m) => m.label.startsWith('Éclairage'))!;
    // Phase, neutre, terre, retour de lampe, deux navettes.
    expect(eclairage.wires).toHaveLength(6);
    expect(doc).toContain('neutre 1.5');
    expect(doc).toContain('terre 2.5');
  });

  it('avertit là où le câblage se joue : va-et-vient, courants faibles', () => {
    expect(doc).toMatch(/va-et-vient/i);
    expect(doc).toMatch(/même gaine/i);
  });
});

describe('rien ne sort de la feuille', () => {
  it('tous les tracés tiennent dans la page', () => {
    const re = /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (m|l)\b/g;
    let m: RegExpExecArray | null;
    let n = 0;
    while ((m = re.exec(pdf))) {
      const x = parseFloat(m[1]);
      const y = parseFloat(m[2]);
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(PAGE_W + 1);
      expect(y).toBeGreaterThanOrEqual(-1);
      expect(y).toBeLessThanOrEqual(PAGE_H + 1);
      n += 1;
    }
    expect(n).toBeGreaterThan(200);
  });

  it('le document compte bien deux feuilles de plus', () => {
    const feuilles = (src: string) => (src.match(/\/Type \/Page\b/g) ?? []).length;
    expect(feuilles(pdf)).toBe(feuilles(sansSchema) + 2);
  });
});

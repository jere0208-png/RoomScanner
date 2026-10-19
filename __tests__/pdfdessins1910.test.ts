/**
 * LES DESSINS DU DOSSIER, LISIBLES IMPRIMÉS — relecture « dessins » et
 * « typographie » du 19/10, devenue des garde-fous :
 *   — un circuit a la même teinte sur le plan des gaines et l'unifilaire, et
 *     chaque gaine son tireté (distinct photocopié) ;
 *   — les mots des symboles ne descendent plus sous 6 pt ;
 *   — un numéro de mur posé sur une cloison claire s'écrit à l'encre ;
 *   — deux prises triples côte à côte se dessinent en une plaque « ×6 » ;
 *   — une feuille sans boussole le dit : « Nord non relevé ».
 */
import { buildScanPdf, motifDuRepere } from '../src/export/pdf';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import { fixturePlacement, materialList, roomInputsOf, wallToRooms } from '../src/geometry/nfc15100';
import { fixtureMarks, markColor, multiWire, schemaRows } from '../src/geometry/schema';
import { planRoutes } from '../src/geometry/elecplan';
import type { Fixture } from '../src/geometry/electrical';

const mur = (id: string, ax: number, az: number, bx: number, bz: number, roomId = 'a', o: Partial<WallSeg> = {}): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId,
  ...o,
});
const W: WallSeg[] = [
  mur('n1', 0, 0, 4, 0),
  mur('c', 4, 0, 4, 3, 'a', { nature: 'cloison', epaisseur: 0.1 }),
  mur('s1', 4, 3, 0, 3),
  mur('o', 0, 3, 0, 0),
  mur('n2', 4, 0, 8, 0, 'b'),
  mur('e', 8, 0, 8, 3, 'b'),
  mur('s2', 8, 3, 4, 3, 'b'),
];
const R = [
  { id: 'a', name: 'Séjour', wallIds: ['n1', 'c', 's1', 'o'] },
  { id: 'b', name: 'Chambre', wallIds: ['n2', 'e', 's2', 'c'] },
];
const FX: Fixture[] = [
  { id: 't', kind: 'tableau', wallId: 'o', along: 1, height: 1.35, side: 1 },
  { id: 'p3a', kind: 'prise3', wallId: 'n1', along: 1.5, height: 1.1, side: 1 },
  { id: 'p3b', kind: 'prise3', wallId: 'n1', along: 1.62, height: 1.1, side: 1 },
  { id: 'rj', kind: 'rj45', wallId: 's1', along: 2, height: 0.3, side: 1 },
  { id: 'i1', kind: 'inter', wallId: 's1', along: 1, height: 1.1, side: 1 },
  // Une prise sur la cloison : elle a sa feuille, donc son numéro.
  { id: 'pc', kind: 'prise', wallId: 'c', along: 1.5, height: 0.3, side: 1 },
] as Fixture[];

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};
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
const texte = (s: string) =>
  (s.match(/\(((?:[^()\\]|\\.)*)\) Tj/g) ?? []).map((m) => m.slice(1, m.lastIndexOf(')'))).join(' | ');
/** Le corps et la couleur de chaque mot posé : « BT /F2 6 Tf r g b rg … (mot) Tj ET ». */
const mots = (page: string) =>
  [...page.matchAll(/BT \/F(\d) ([\d.]+) Tf ([\d.]+) ([\d.]+) ([\d.]+) rg [^(]*\(((?:[^()\\]|\\.)*)\) Tj ET/g)].map((m) => ({
    gras: m[1] === '2',
    taille: Number(m[2]),
    rgb: [Number(m[3]), Number(m[4]), Number(m[5])],
    mot: m[6],
  }));
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')).join(' ');

const parts = roomParts(W, R);
const inputs = roomInputsOf(R, parts);
const placement = fixturePlacement(FX, W, inputs);
const list = materialList(inputs, FX, wallToRooms(inputs), placement);
const rows = schemaRows(list.circuits, list.differentials, FX);
const marks = fixtureMarks(list.circuits);
const routes = planRoutes(W, R, parts, FX, placement)!;
const dossier = (north?: number) =>
  latin1(
    buildScanPdf(
      {
        name: 'Deux pièces',
        walls: W,
        openings: [],
        objects: [],
        rooms: R,
        fixtures: FX,
        routes: routes.traces,
        roomNames: { a: 'Séjour', b: 'Chambre' },
        ...(north !== undefined ? { north } : {}),
      } as never,
      false,
      {
        metre: false,
        elevations: true,
        schemas: { rows, differentials: list.differentials, multi: list.circuits.map((c, i) => multiWire(c, FX, `C${i + 1}`)), marks },
      } as never,
    ),
  );
const SRC = dossier();
const PAGES = flux(SRC);
const page = (mot: string) => PAGES.find((p) => texte(p).includes(mot))!;

describe('un circuit, une teinte et un tireté, sur toutes les feuilles', () => {
  it('l’unifilaire et le tableau de tirage colorent chaque repère comme le plan', () => {
    const unifilaire = page('Schéma unifilaire');
    const gaines = page('Tirage par circuit');
    for (const r of rows.filter((x) => x.breaker !== null)) {
      const teinte = rgb(markColor(r.mark));
      const repere = (p: string) => mots(p).filter((m) => m.mot === r.mark).map((m) => m.rgb.join(' '));
      expect(repere(unifilaire)).toContain(teinte.split(' ').map((v) => Number(v)).join(' '));
      expect(repere(gaines)).toContain(teinte.split(' ').map((v) => Number(v)).join(' '));
    }
  });

  it('deux circuits n’ont pas le même tireté', () => {
    expect(motifDuRepere('C1')).not.toEqual(motifDuRepere('C2'));
    expect(motifDuRepere('C3')).not.toEqual(motifDuRepere('C4'));
    // La légende de la feuille des gaines les montre.
    expect(texte(page('Tirage par circuit'))).toContain('Gaine du circuit C1');
    expect(texte(page('Tirage par circuit'))).toContain('Retombée le long du mur');
  });
});

describe('le plan coté se lit imprimé', () => {
  // Le plan coté : le premier flux qui porte « Plan d… » (l'apostrophe est un octet Windows-1252).
  const plan = PAGES.find((p) => texte(p).includes('Plan d'))!;

  it('les mots des symboles ne descendent pas sous 6 pt', () => {
    const rj = mots(plan).filter((m) => m.mot === 'RJ45');
    expect(rj.length).toBeGreaterThan(0);
    for (const m of rj) expect(m.taille).toBeGreaterThanOrEqual(6);
  });

  it('le numéro d’une cloison claire s’écrit à l’encre, pas en blanc', () => {
    const numeros = mots(plan).filter((m) => /^\d+$/.test(m.mot) && !m.gras);
    // Les murs porteurs, en réserve dans le poché sombre ; la cloison, seule
    // claire, à l'encre.
    expect(numeros.filter((m) => m.rgb.every((v) => v === 1)).length).toBeGreaterThan(0);
    expect(numeros.filter((m) => m.rgb.every((v) => v < 0.2)).length).toBe(1);
  });

  it('sans boussole, la feuille dit « Nord non relevé » ; avec, elle n’en dit rien', () => {
    expect(texte(plan)).toContain('Nord non relev');
    const avecNord = flux(dossier(0)).find((p) => texte(p).includes('Plan d'))!;
    expect(texte(avecNord)).not.toContain('Nord non relev');
  });
});

describe('les élévations comptent ce qu’elles dessinent', () => {
  it('deux prises triples côte à côte : une plaque et « ×6 », pas six arcs', () => {
    const elev = PAGES.filter((p) => texte(p).includes('lévation')).find((p) => mots(p).some((m) => m.mot === '\xd76'));
    expect(elev).toBeTruthy();
  });
});

/**
 * LE DOSSIER SE LIT DANS L'ORDRE, ET SON SOMMAIRE DIT VRAI — revues
 * « structure » et « typographie » du 19/10 :
 *   — le sommaire comptait les FACES d'élévation (« Murs 20-21 ») quand les
 *     feuilles et le plan numérotent les MURS (« Mur 16 ») ;
 *   — la partie de l'électricien était éclatée (tableau, gaines, puis
 *     l'unifilaire quinze feuilles plus loin) ;
 *   — le PDF n'avait aucun signet ;
 *   — la largeur du texte était estimée à un demi-cadratin par signe.
 */
import { buildScanPdf, largeurDuTexte, sommaireDuDossier, type ScanForPdf } from '../src/export/pdf';
import { fixturePlacement, materialList, roomInputsOf, wallToRooms } from '../src/geometry/nfc15100';
import { fixtureMarks, multiWire, schemaRows } from '../src/geometry/schema';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import { planRoutes } from '../src/geometry/elecplan';
import type { Fixture } from '../src/geometry/electrical';

const mur = (id: string, ax: number, az: number, bx: number, bz: number, roomId = 'r1'): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId,
});
// Deux pièces séparées par une cloison vue des deux côtés.
const W: WallSeg[] = [
  mur('n1', 0, 0, 4, 0),
  mur('n2', 4, 0, 7, 0, 'r2'),
  mur('e', 7, 0, 7, 4, 'r2'),
  mur('s2', 7, 4, 4, 4, 'r2'),
  mur('s1', 4, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
  mur('cloison', 4, 0, 4, 4),
];
const R = [
  { id: 'r1', name: 'Séjour', wallIds: ['n1', 's1', 'w', 'cloison'] },
  { id: 'r2', name: 'Chambre', wallIds: ['n2', 'e', 's2', 'cloison'] },
];
const f = (id: string, kind: Fixture['kind'], wallId: string, along: number, height: number, side: 1 | -1 = 1): Fixture => ({
  id,
  kind,
  wallId,
  along,
  height,
  side,
});
const parts = roomParts(W, R);
const inputs = roomInputsOf(R, parts);
// Une prise de chaque côté de la cloison : ses deux faces ont une élévation.
const brut: Fixture[] = [f('t', 'tableau', 'w', 1, 1.35), f('a', 'prise', 'n1', 1, 0.25), f('b', 'prise', 'e', 1, 0.25), f('d', 'inter', 'w', 2, 1.1)];
const cote = (wallId: string, room: string): 1 | -1 =>
  fixturePlacement([f('x', 'prise', wallId, 2, 0.3, 1)], W, inputs).get('x') === room ? 1 : -1;
const FX: Fixture[] = [...brut, f('c1', 'prise', 'cloison', 1, 0.25, cote('cloison', 'r1')), f('c2', 'prise', 'cloison', 3, 0.25, cote('cloison', 'r2'))];
const placement = fixturePlacement(FX, W, inputs);
const list = materialList(inputs, FX, wallToRooms(inputs), placement);
const plan = planRoutes(W, R, parts, FX, placement)!;
const SCAN: ScanForPdf = {
  name: 'Appartement',
  walls: W,
  openings: [],
  objects: [],
  rooms: R,
  roomNames: { r1: 'Séjour', r2: 'Chambre' },
  fixtures: FX,
  routes: plan.traces,
  modeElec: true,
};
const OPTS = {
  metre: true,
  garde: true,
  elevations: true,
  schemas: {
    rows: schemaRows(list.circuits, list.differentials, FX),
    differentials: list.differentials,
    multi: list.circuits.map((c, i) => multiWire(c, FX, `C${i + 1}`)),
    marks: fixtureMarks(list.circuits),
  },
};

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};

describe('le sommaire', () => {
  const sommaire = sommaireDuDossier(SCAN, false, OPTS);

  it('le logement, puis l’électricité dans l’ordre du chantier', () => {
    const genres = sommaire.map((s) => s.genre);
    expect(genres[0]).toBe('garde');
    const rang = (g: string) => genres.indexOf(g as never);
    expect(rang('plan')).toBeLessThan(rang('unifilaire'));
    expect(rang('metre')).toBeLessThan(rang('unifilaire'));
    // Le schéma juste avant le plan des gaines, qui y renvoie ; les murs équipés à la fin.
    expect(rang('unifilaire')).toBeLessThan(rang('gaines'));
    expect(rang('gaines')).toBeLessThan(rang('elevation'));
  });

  it('les numéros de mur sont ceux que les feuilles impriment', () => {
    const pdf = latin1(buildScanPdf(SCAN, false, OPTS));
    const imprimes = new Set([...pdf.matchAll(/\(\xc9l\xe9vation \x97 Mur (\d+) /g)].map((m) => m[1]));
    const annonces = sommaire
      .filter((s) => s.genre === 'elevation')
      .flatMap((s) => [...s.titre.matchAll(/\d+/g)].map((m) => m[0]));
    expect(annonces.length).toBeGreaterThan(0);
    for (const n of annonces) expect(imprimes).toContain(n);
  });

  it('les deux faces d’une cloison sur une feuille, avec leurs deux pièces', () => {
    const cloison = sommaire.find((s) => s.genre === 'elevation' && s.titre.includes(' / '));
    expect(cloison?.titre).toMatch(/^Mur \d+ · (Séjour \/ Chambre|Chambre \/ Séjour)$/);
  });
});

describe('le document', () => {
  it('porte des signets, un par sorte de feuille', () => {
    const pdf = latin1(buildScanPdf(SCAN, false, OPTS));
    expect(pdf).toMatch(/\/Type \/Outlines \/First \d+ 0 R \/Last \d+ 0 R \/Count \d+/);
    expect(pdf).toMatch(/\/Outlines \d+ 0 R \/PageMode \/UseOutlines/);
    // Chaque signet mène à une feuille.
    expect((pdf.match(/\/Dest \[\d+ 0 R \/Fit\]/g) ?? []).length).toBeGreaterThan(4);
  });

  it('la page de garde annonce les deux parties', () => {
    const pdf = latin1(buildScanPdf(SCAN, false, OPTS));
    expect(pdf).toContain('(LE LOGEMENT) Tj');
    expect(pdf).toContain('(L\x92\xc9LECTRICIT\xc9) Tj');
  });
});

describe('la largeur du texte', () => {
  it('se mesure sur les métriques d’Helvetica, gras compris', () => {
    // D 722 + E 667 + V 667 + I 278 + S 667 = 3001 millièmes en gras.
    expect(largeurDuTexte('DEVIS', 22, true)).toBeCloseTo(66.02, 2);
    expect(largeurDuTexte('iiii', 10)).toBeCloseTo(8.88, 2);
    expect(largeurDuTexte('MMMM', 10)).toBeCloseTo(33.32, 2);
    // Les accents valent leur lettre ; l'espace insécable, une espace.
    expect(largeurDuTexte('é', 10)).toBeCloseTo(largeurDuTexte('e', 10), 6);
    expect(largeurDuTexte('12 m²', 10)).toBeCloseTo(largeurDuTexte('12 m', 10) + 3.33, 2);
  });
});

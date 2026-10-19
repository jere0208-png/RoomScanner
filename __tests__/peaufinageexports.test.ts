/**
 * PEAUFINAGE DES EXPORTS — ce qui restait imparfait dans le dossier, et ce
 * que l'écran d'export dit désormais avant l'envoi :
 *   — la perspective sur feuille en portrait : les noms des pièces passent en
 *     bandes au-dessus et au-dessous quand cela laisse plus de place à la
 *     maquette que deux colonnes en marge ;
 *   — la colonne « Protège » de la feuille du tableau passe à la ligne au
 *     lieu de finir en « Bure… » ;
 *   — les noms des meubles des élévations s'écrivent en entier sur deux
 *     lignes avant d'être abrégés ;
 *   — « À regarder avant d'envoyer » : pièce ouverte, pièce sans nom,
 *     cartouche vide, dossier d'électricien sans tableau.
 */
import { buildScanPdf } from '../src/export/pdf';
import { pointsAvantEnvoi } from '../src/export/avantEnvoi';
import { detectRooms, type WallSeg } from '../src/geometry/floorplan';
import { implanter, rattacher, type DepartExistant } from '../src/geometry/existant';
import { appartementExemple } from '../src/data/exemple';

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

let n = 0;
const mur = (ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id: `m${n++}`,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});
/** Un logement en enfilade, 12 × 3 m, quatre pièces : large et plat. */
const ENFILADE = [
  ...[0, 3, 6, 9].map((x) => mur(x, 0, x + 3, 0)),
  mur(12, 0, 12, 3),
  ...[12, 9, 6, 3].map((x) => mur(x, 3, x - 3, 3)),
  mur(0, 3, 0, 0),
  mur(3, 0, 3, 3),
  mur(6, 0, 6, 3),
  mur(9, 0, 9, 3),
];
const PIECES = detectRooms(ENFILADE).map((r, i) => ({ id: `r${i}`, wallIds: r.wallIds }));
const NOMS = Object.fromEntries(PIECES.map((r, i) => [r.id, ['Chambre', 'Séjour', 'Cuisine', 'Bureau'][i] ?? `P${i}`]));

/** Les positions (x, y) de chaque mot écrit dans un flux de page. */
const positions = (flux: string, mot: string) =>
  [...flux.matchAll(new RegExp(`1 0 0 1 ([\\d.-]+) ([\\d.-]+) Tm \\(${mot}\\) Tj`, 'g'))].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
  }));

describe('la perspective sur feuille en portrait', () => {
  it('un logement large et plat : les noms passent en bandes, la maquette prend la largeur', () => {
    const src = latin1(
      buildScanPdf(
        { name: 'Enfilade', walls: ENFILADE, openings: [], objects: [], rooms: PIECES, roomNames: NOMS },
        true,
        { metre: false, garde: false },
      ),
    );
    const flux = src.split('endstream').find((s) => /\(Perspective( 1)?\) Tj/.test(s))!;
    expect(flux).toBeTruthy();
    const noms = Object.values(NOMS).flatMap((m) => positions(flux, m));
    expect(noms.length).toBe(4);
    // En bandes : chaque nom au-dessus de sa pièce, à des abscisses
    // différentes ; en marge, ils s'aligneraient sur deux bords seulement.
    const xs = new Set(noms.map((p) => Math.round(p.x)));
    expect(xs.size).toBeGreaterThanOrEqual(3);
    // Et sur deux rangées au plus.
    const ys = new Set(noms.map((p) => Math.round(p.y)));
    expect(ys.size).toBeLessThanOrEqual(2);
  });
});

describe('la feuille du tableau', () => {
  it('« Protège » passe à la ligne au lieu de couper la liste des pièces', () => {
    const departs: DepartExistant[] = [
      { id: 'd', organe: 'differentiel', calibre: 40, sensibilite: 30, typeDiff: 'AC', rangee: 0 },
      {
        id: 'e',
        organe: 'disjoncteur',
        calibre: 16,
        usage: 'Éclairage',
        piece: 'Séjour-cuisine, Chambre, Salle d’eau, Bureau, Entrée, Cellier',
        rangee: 0,
      },
    ];
    const existant = { departs: rattacher(departs, implanter({ departs, rangees: 1, parRangee: 13 })), rangees: 1, parRangee: 13 };
    const src = latin1(
      buildScanPdf(
        { name: 'Tableau', walls: ENFILADE, openings: [], objects: [], rooms: PIECES, roomNames: NOMS },
        false,
        { metre: false, garde: false, existant },
      ),
    );
    const flux = src.split('endstream').find((s) => s.includes('(Protège) Tj'))!;
    expect(flux).toBeTruthy();
    // La fin de la liste est écrite, sans points de suspension.
    expect(flux).toMatch(/Cellier\) Tj/);
    expect(flux).not.toMatch(/Éclairage[^)]*…\) Tj/);
  });
});

describe('les noms des meubles dans les élévations', () => {
  it('« Fauteuil de bureau » s’écrit en entier sur deux lignes, plus « Fauteuil… »', () => {
    const ex = appartementExemple();
    const src = latin1(
      buildScanPdf(
        { name: 'Exemple', walls: ex.walls, openings: ex.openings, objects: ex.objects, rooms: ex.rooms, roomNames: {}, fixtures: [] } as never,
        false,
        { metre: false, garde: false, elevations: true, toutesElevations: true } as never,
      ),
    );
    expect(src).toContain('(Fauteuil de) Tj');
    expect(src).not.toContain('(Fauteuil…) Tj');
  });
});

describe('à regarder avant d’envoyer', () => {
  const base = { openings: [], objects: [] as { id: string }[] };

  it('rien à redire sur un plan fermé, nommé, au client renseigné', () => {
    const rooms = PIECES.map((r) => ({ ...r, name: NOMS[r.id] }));
    expect(
      pointsAvantEnvoi({ ...base, walls: ENFILADE, rooms }, { client: 'Mme Martin', adresse: '12 rue Pasteur', particulier: false, modeElec: false }),
    ).toEqual([]);
  });

  it('une pièce ouverte, une pièce sans nom, le client vide, l’électricité sans tableau', () => {
    // Le mur du fond de la dernière pièce manque : elle ne se ferme plus.
    const walls = ENFILADE.filter((w) => !(w.a.x === 12 && w.b.x === 12));
    const rooms = PIECES.map((r, i) => ({ ...r, name: i === 1 ? 'Pièce 2' : NOMS[r.id] }));
    const points = pointsAvantEnvoi(
      { ...base, walls, rooms, fixtures: [{ kind: 'prise' }] },
      { client: '', adresse: '', particulier: false, modeElec: true },
    );
    const cles = points.map((p) => p.cle);
    expect(cles).toContain('contour');
    expect(cles).toContain('sansNom');
    expect(cles).toContain('client');
    expect(cles).toContain('tableau');
    expect(points.find((p) => p.cle === 'client')!.geste).toBe('client');
    expect(points.find((p) => p.cle === 'contour')!.geste).toBe('plan');
  });

  it('le particulier n’a pas de client à renseigner', () => {
    const rooms = PIECES.map((r) => ({ ...r, name: NOMS[r.id] }));
    expect(
      pointsAvantEnvoi({ ...base, walls: ENFILADE, rooms }, { client: '', adresse: '', particulier: true, modeElec: false }).map(
        (p) => p.cle,
      ),
    ).toEqual([]);
  });
});

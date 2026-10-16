/**
 * LES SURFACES DU DOSSIER — revue « Nadia », métreuse.
 *
 *   — Quand le cartouche d'une pièce ne trouvait pas de place, il rendait sa
 *     surface : le séjour et l'entrée de l'exemple sortaient sans leurs m².
 *     La surface ne cède plus jamais ; c'est le nom qui s'abrège.
 *   — Trois arrondis pour une même pièce : 0,1 m² au plan, 0,01 au métré,
 *     0,1 sur la page de garde. Deux décimales partout, et chaque total est
 *     la somme des valeurs écrites.
 */
import { appartementExemple } from '../src/data/exemple';
import { buildScanPdf, nomAbrege } from '../src/export/pdf';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};
/** Tous les mots écrits, dans l'ordre. */
const mots = (src: string) => [...src.matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)].map((m) => m[1]);
const M2 = /^(≈ )?(\d+,\d+) m²$/;
const nombre = (t: string) => Number(t.replace(',', '.'));

const ex = appartementExemple();
const scan = (walls: WallSeg[], rooms: { id: string; name: string; wallIds: string[] }[], extra: object = {}) => ({
  name: 'Exemple',
  walls,
  openings: [],
  objects: [],
  rooms,
  roomNames: Object.fromEntries(rooms.map((r) => [r.id, r.name])),
  fixtures: [],
  ...extra,
});

describe('l’exemple, tel qu’on l’exporte', () => {
  const dossier = latin1(
    buildScanPdf(
      scan(ex.walls, ex.rooms, { openings: ex.openings, objects: ex.objects, fixtures: ex.fixtures }) as never,
      false,
      { garde: true, metre: true, surfaces: true, ceiling: ex.ceiling, elevations: false } as never,
    ),
  );
  const feuilles = dossier.split('(FEUILLE)');
  const parts = roomParts(ex.walls, ex.rooms);
  const attendues = parts.map((p) => p.surface!.area.toFixed(2).replace('.', ','));
  const plan = feuilles.find((f) => mots(f).some((t) => t.startsWith('Surface relev')))!;

  it('chaque pièce garde sa surface sur le plan, à deux décimales', () => {
    const ecrites = mots(plan)
      .map((t) => M2.exec(t)?.[2])
      .filter((x): x is string => !!x);
    for (const a of attendues) expect(ecrites).toContain(a);
  });

  it('aucune surface à une décimale dans tout le dossier', () => {
    const uneDecimale = mots(dossier).filter((t) => /\d,\d m²/.test(t) && !/\d,\d\d m²/.test(t));
    expect(uneDecimale).toEqual([]);
  });

  it('la page de garde annonce la somme des surfaces écrites', () => {
    const somme = attendues.reduce((t, a) => t + nombre(a), 0);
    const garde = mots(feuilles[0]);
    const sol = garde.find((t) => M2.test(t))!;
    expect(sol).toBeDefined();
    expect(nombre(M2.exec(sol)![2])).toBeCloseTo(somme, 6);
    // Et le plan dit le même total que la garde.
    expect(mots(plan).join(' ')).toContain(`${somme.toFixed(2).replace('.', ',')} m²`);
  });
});

describe('une pièce trop petite pour son cartouche', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
  });
  // Un séjour de 6 × 4 et, contre lui, un placard de 0,60 × 0,90 au nom long.
  const MURS = [
    mur('n', 0, 0, 6, 0),
    mur('e1', 6, 0, 6, 0.9),
    mur('e2', 6, 0.9, 6, 4),
    mur('s', 6, 4, 0, 4),
    mur('o', 0, 4, 0, 0),
    mur('pn', 6, 0, 6.6, 0),
    mur('pe', 6.6, 0, 6.6, 0.9),
    mur('ps', 6.6, 0.9, 6, 0.9),
  ];
  const ROOMS = [
    { id: 'sej', name: 'Séjour', wallIds: ['n', 'e1', 'e2', 's', 'o'] },
    { id: 'pl', name: 'Dégagement technique', wallIds: ['pn', 'pe', 'ps', 'e1'] },
  ];

  it('écrit quand même sa surface, sous un nom abrégé', () => {
    const plan = latin1(buildScanPdf(scan(MURS, ROOMS) as never, false, { surfaces: true } as never)).split('(FEUILLE)')[0];
    const ecrits = mots(plan);
    const parts = roomParts(MURS, ROOMS);
    for (const p of parts) {
      expect(ecrits).toContain(`${p.surface!.area.toFixed(2).replace('.', ',')} m²`);
    }
  });
});

describe('le nom abrégé', () => {
  it('suit l’usage des plans', () => {
    expect(nomAbrege('Séjour')).toBe('Séj.');
    expect(nomAbrege('Chambre 2')).toBe('Ch. 2');
    expect(nomAbrege('Salle d’eau')).toBe('SdE');
    expect(nomAbrege('Entrée')).toBe('Entr.');
    expect(nomAbrege('Placard technique')).toBe('Plac. tech.');
    expect(nomAbrege('WC')).toBe('WC');
  });
});

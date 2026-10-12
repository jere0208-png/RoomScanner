/**
 * LE PLAN IMPRIMÉ, ÉPURÉ — et l'élévation qui dit d'où on la regarde.
 *
 * Relevés du patron, capture du dossier à l'appui :
 *   — « les noms de pièces sont trop imposants et mal placés, gênant la
 *     visibilité des éléments électriques » ;
 *   — « les "DCL" etc. ne sont pas utiles, et la légende n'est pas adaptée :
 *     un simple logo RJ, sans faire les prises à côté, se comprend comme
 *     RJ + PC. Revois pour quelque chose de plus ludique » ;
 *   — « les éléments électriques ne doivent pas être en collision avec les
 *     cheminements tracés de leur interaction avec l'interrupteur ; laisse
 *     une marge. Rends ces lignes moins opaques » ;
 *   — « améliore la visibilité en général des éléments, de manière plus
 *     épurée et intelligente » ;
 *   — « sur les élévations des murs, note aussi le nom de la pièce du côté
 *     du mur observé ; on peut se tromper si le mur joint deux pièces ».
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildScanPdf, horsDesDisques } from '../src/export/pdf';
import { appartementExemple } from '../src/data/exemple';
import { pieceDuCote } from '../src/geometry/electrical';
import { detectRooms, type WallSeg } from '../src/geometry/floorplan';

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};
const ex = appartementExemple();
const dossier = latin1(
  buildScanPdf(
    {
      name: 'Exemple',
      walls: ex.walls,
      openings: ex.openings,
      objects: ex.objects,
      rooms: ex.rooms,
      roomNames: Object.fromEntries(ex.rooms.map((r) => [r.id, r.name])),
      fixtures: ex.fixtures,
    } as never,
    false,
    { metre: false, surfaces: true, ceiling: ex.ceiling, elevations: true } as never,
  ),
);
/** La feuille du plan : la première du dossier. */
const plan = dossier.split('(FEUILLE)')[0];
/** Tous les mots écrits, avec leur corps. */
const mots = (src: string) =>
  [...src.matchAll(/\/F(\d) ([\d.]+) Tf [^\n]*?\(((?:[^()\\]|\\.)*)\) Tj/g)].map((m) => ({
    gras: m[1] === '2',
    taille: Number(m[2]),
    texte: m[3],
  }));

describe('un trait qui s’interrompt autour des symboles', () => {
  it('coupe le lien là où il traverse un disque, et reprend après', () => {
    const morceaux = horsDesDisques(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [{ x: 50, y: 0, r: 10 }],
    );
    expect(morceaux).toHaveLength(2);
    for (const m of morceaux) {
      for (const q of m) expect(Math.hypot(q.x - 50, q.y)).toBeGreaterThanOrEqual(10);
    }
    // Les deux bouts restent : on ne raccourcit que ce qui touche.
    expect(morceaux[0][0]).toEqual({ x: 0, y: 0 });
    expect(morceaux[1][morceaux[1].length - 1]).toEqual({ x: 100, y: 0 });
  });

  it('un lien qui commence DANS son interrupteur en sort avec sa marge', () => {
    const morceaux = horsDesDisques(
      [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
      ],
      [
        { x: 0, y: 0, r: 9 },
        { x: 60, y: 0, r: 12 },
      ],
    );
    expect(morceaux).toHaveLength(1);
    expect(morceaux[0][0].x).toBeGreaterThanOrEqual(9);
    expect(morceaux[0][morceaux[0].length - 1].x).toBeLessThanOrEqual(48);
  });
});

describe('le plan de l’exemple, épuré', () => {
  it('plus aucun sigle à côté des symboles : ni DCL, ni DAAF, ni RJ, ni PC', () => {
    const ecrits = mots(plan).map((m) => m.texte);
    for (const sigle of ['DCL', 'DAAF', 'VMC', 'RJ', 'PC', 'PC 20A', 'RJ + PC', 'INT', 'LUM', 'TABLEAU']) {
      expect({ sigle, present: ecrits.includes(sigle) }).toEqual({ sigle, present: false });
    }
  });

  it('les liens de commande, fins et à moitié transparents', () => {
    const liens = plan.split('\n').filter((op) => op.includes('[3 2.2] 0 d'));
    expect(liens.length).toBeGreaterThan(0);
    for (const op of liens) {
      expect(op).toContain('/GA5 gs');
      // 0,55 sur le plan ; un peu plus dans la vignette de la légende.
      expect(Number(/ ([\d.]+) w /.exec(op)![1])).toBeLessThanOrEqual(0.8);
    }
  });

  it('des noms de pièce plus discrets : 8,5 points, plus 10,5', () => {
    const noms = mots(plan).filter((m) => ['Séjour', 'S\\351jour', 'Chambre', 'Bureau'].includes(m.texte) || m.texte.startsWith('S'));
    const chambre = mots(plan).find((m) => m.texte === 'Chambre')!;
    expect(chambre).toBeDefined();
    expect(chambre.gras).toBe(true);
    expect(chambre.taille).toBeLessThanOrEqual(8.5);
    expect(noms.length).toBeGreaterThan(0);
  });

  it('la légende dessine le logo RJ une fois, avec ou sans prises', () => {
    const ecrits = mots(plan).map((m) => m.texte);
    expect(ecrits.filter((t) => t.startsWith('RJ45') && t !== 'RJ45')).toEqual(['RJ45, seule ou avec prises']);
    // Et sur le plan, chaque prise de communication porte son mot, comme
    // chez l'architecte (DCE « Romeo »).
    expect(ecrits.filter((t) => t === 'RJ45').length).toBeGreaterThan(0);
    expect(ecrits).toContain('APPAREILLAGE');
    expect(ecrits).toContain('Lien de commande');
  });
});

describe('l’élévation dit d’où on la regarde', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg =>
    ({ id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25 }) as WallSeg;
  // Deux pièces de part et d'autre de la cloison « c », en x = 4.
  const MURS = [
    mur('n1', 0, 0, 4, 0),
    mur('n2', 4, 0, 7, 0),
    mur('e', 7, 0, 7, 4),
    mur('s2', 7, 4, 4, 4),
    mur('s1', 4, 4, 0, 4),
    mur('o', 0, 4, 0, 0),
    mur('c', 4, 0, 4, 4),
  ];
  const PIECES = detectRooms(MURS).map((r, i) => {
    const xs = r.outline.map((p) => p.x);
    return { id: `p${i}`, name: Math.max(...xs) <= 4.01 ? 'Séjour' : 'Chambre', wallIds: r.wallIds };
  });
  const cloison = MURS[6];

  it('chaque face de la cloison a SA pièce', () => {
    const a = pieceDuCote(cloison, 1, MURS, PIECES as never);
    const b = pieceDuCote(cloison, -1, MURS, PIECES as never);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
    const nom = (id: string | null) => PIECES.find((p) => p.id === id)?.name;
    expect([nom(a), nom(b)].sort()).toEqual(['Chambre', 'Séjour']);
  });

  it('une façade n’a personne dehors', () => {
    const facade = MURS[0];
    const dehors = [pieceDuCote(facade, 1, MURS, PIECES as never), pieceDuCote(facade, -1, MURS, PIECES as never)];
    expect(dehors.filter((x) => x === null)).toHaveLength(1);
  });

  it('le dossier titre chaque élévation « côté » de sa pièce', () => {
    const titres = mots(dossier).filter((m) => m.texte.startsWith('\\311l\\351vation') || m.texte.includes('vation \\227'));
    const tous = mots(dossier).map((m) => m.texte).filter((t) => t.includes('c\\364t\\351 ') || t.includes('côté '));
    expect(tous.length + titres.length).toBeGreaterThan(0);
  });

  it('l’établi du mur dit la pièce regardée, et celle du dos', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'components', 'WallElevation.tsx'), 'utf8');
    expect(src).toContain('pieceDuCote(wall, side, walls, rooms)');
    expect(src).toContain('`Côté ${roomName} · ${mesures}`');
    expect(src).toContain('` · dos : ${nomAuDos}`');
  });
});

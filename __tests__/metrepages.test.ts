/**
 * LE MÉTRÉ D'UN GRAND LOGEMENT TIENT SUR PLUSIEURS FEUILLES.
 *
 * Correctif de l'audit « dans la peau d'un utilisateur » : le métré tenait
 * sur une seule page. Dans un grand logement, les lignes qui dépassaient et
 * le total disparaissaient sans prévenir — ou passaient sous le cartouche.
 * Et le mot « Carrez » n'apparaissait nulle part, quand c'est le premier
 * chiffre qu'un vendeur cherche, et celui qui lui coûte cher s'il se trompe.
 */
import { buildScanPdf, sommaireDuDossier } from '../src/export/pdf';
import { detectRooms, type WallSeg } from '../src/geometry/floorplan';

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

/** Un logement en damier : `cols` × `rangs` pièces de 3 × 3 m. */
function damier(cols: number, rangs: number) {
  const walls: WallSeg[] = [];
  for (let j = 0; j <= rangs; j++) for (let i = 0; i < cols; i++) walls.push(mur(i * 3, j * 3, (i + 1) * 3, j * 3));
  for (let i = 0; i <= cols; i++) for (let j = 0; j < rangs; j++) walls.push(mur(i * 3, j * 3, i * 3, (j + 1) * 3));
  const rooms = detectRooms(walls).map((r, k) => ({ id: `r${k + 1}`, wallIds: r.wallIds }));
  const roomNames = Object.fromEntries(rooms.map((r, k) => [r.id, `Chambre ${k + 1}`]));
  return { name: 'Grand logement', walls, openings: [], objects: [], rooms, roomNames };
}

interface Mot {
  texte: string;
  y: number;
}

/** Les mots de chaque feuille du métré, avec leur hauteur sur la page. */
function feuillesDuMetre(pdf: Uint8Array): Mot[][] {
  const re = /BT \/F\d ([\d.]+) Tf [^]*?([-\d.]+) ([-\d.]+) Tm \(((?:\\.|[^\\)])*)\) Tj/g;
  return latin1(pdf)
    .split('endstream')
    .filter((s) => s.includes('(Métré par pièce'))
    .map((s) => {
      const mots: Mot[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) mots.push({ y: Number(m[3]), texte: m[4] });
      return mots;
    });
}

describe('le métré d’un grand logement', () => {
  const scan = damier(8, 5);

  it('se répartit sur plusieurs feuilles, que le sommaire annonce', () => {
    expect(scan.rooms).toHaveLength(40);
    const metres = sommaireDuDossier(scan, false, { metre: true }).filter((f) => f.genre === 'metre');
    expect(metres.length).toBeGreaterThanOrEqual(2);
    expect(metres[0].titre).toBe('Métré');
    expect(metres[1].titre).toBe('Métré (suite)');
  });

  it('chaque pièce y a sa ligne, et le total vient une fois, à la fin', () => {
    const feuilles = feuillesDuMetre(buildScanPdf(scan, false, { metre: true }));
    expect(feuilles.length).toBeGreaterThanOrEqual(2);
    const tous = feuilles.flat().map((m) => m.texte);
    for (let k = 1; k <= 40; k++) expect(tous).toContain(`Chambre ${k}`);
    // Pas une pièce deux fois.
    expect(tous.filter((t) => t === 'Chambre 1')).toHaveLength(1);
    // Le total : une fois, sur la dernière feuille, avec les 40 pièces (360 m²).
    expect(tous.filter((t) => t === 'Total')).toHaveLength(1);
    const derniere = feuilles[feuilles.length - 1].map((m) => m.texte);
    expect(derniere).toContain('Total');
    expect(derniere).toContain('360,0');
  });

  it('rien ne descend dans le cartouche, même une dernière feuille pleine', () => {
    // Vingt-quatre pièces : la feuille est pleine, et porte aussi le total.
    const plein = damier(6, 4);
    const feuilles = [
      ...feuillesDuMetre(buildScanPdf(scan, false, { metre: true })),
      ...feuillesDuMetre(buildScanPdf(plein, false, { metre: true })),
    ];
    for (const f of feuilles) {
      for (const m of f.filter((x) => /^Chambre \d+$|^Total$|Carrez|habitable|Surface murale|^Suite/.test(x.texte))) {
        // Le cartouche monte à 96 pt du bas de la page.
        expect({ [m.texte]: m.y >= 100 }).toEqual({ [m.texte]: true });
      }
    }
  });

  it('la mention Carrez est écrite, et cadrée', () => {
    const pdf = buildScanPdf(scan, false, { metre: true });
    const derniere = feuillesDuMetre(pdf).pop()!;
    expect(derniere.some((m) => /Loi Carrez/.test(m.texte))).toBe(true);
    // Un logement d'une pièce la porte aussi.
    const petit = feuillesDuMetre(buildScanPdf(damier(1, 1), false, { metre: true }));
    expect(petit).toHaveLength(1);
    expect(petit[0].some((m) => /Loi Carrez/.test(m.texte))).toBe(true);
  });
});

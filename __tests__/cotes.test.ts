/**
 * Deux cotes ne doivent JAMAIS se superposer sur le plan.
 *
 * Le plan à l'écran saute la valeur d'un mur trop court pour la porter ; le
 * PDF les écrivait toutes, quelle que soit la place. Un logement à retours
 * de mur nombreux sortait avec des chiffres empilés — et un chiffre
 * illisible sur un plan coté est pire qu'un chiffre absent, puisqu'on ne
 * sait pas qu'il manque.
 *
 * Le test relit le flux du PDF : il retrouve chaque valeur écrite, avec sa
 * position, et vérifie qu'aucune paire ne se recouvre. Il vérifie aussi le
 * revers : sur un plan qui a de la place, on n'a rien perdu.
 */
import { buildScanPdf } from '../src/export/pdf';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** Un séjour franc : quatre murs bien dégagés. */
const SIMPLE: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];

/**
 * Le cas qui cassait : un grand plateau de 14 m dont le mur nord est haché
 * en vingt retours de 12 cm. À cette échelle, « 0,12 m » occupe six fois la
 * place disponible entre deux voisines — les vingt valeurs ne peuvent pas
 * tenir, et il faut bien que quelqu'un arbitre.
 */
const DENTELE: WallSeg[] = [
  ...Array.from({ length: 20 }, (_, i) =>
    mur(`n${i}`, i * 0.12, 0, (i + 1) * 0.12, 0),
  ),
  mur('n', 2.4, 0, 14, 0),
  mur('e', 14, 0, 14, 8),
  mur('s', 14, 8, 0, 8),
  mur('w', 0, 8, 0, 0),
];

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};

/**
 * Les valeurs de cote écrites dans le flux, avec leur point d'ancrage.
 *
 * Le PDF pose un texte par `1 0 0 1 x y Tm` suivi de `(…) Tj`, ou par une
 * matrice pivotée pour les cotes obliques. On récupère les deux.
 */
interface Pose {
  texte: string;
  x: number;
  y: number;
  taille: number;
  /** Matrice de rotation : les cotes verticales sont écrites pivotées. */
  cos: number;
  sin: number;
}
function cotes(src: string): Pose[] {
  const out: Pose[] = [];
  const re =
    /\/F\d+ (\d+(?:\.\d+)?) Tf[\s\S]{0,80}?([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) Tm\s*\(((?:[^()\\]|\\.)*)\) Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const texte = m[8];
    if (!/^\d+,\d{2}( m)?$/.test(texte)) continue;
    out.push({
      texte,
      cos: parseFloat(m[2]),
      sin: parseFloat(m[3]),
      x: parseFloat(m[6]),
      y: parseFloat(m[7]),
      taille: parseFloat(m[1]),
    });
  }
  return out;
}

/**
 * Recouvrement de deux étiquettes, en points.
 *
 * Le texte part de son ancre le long de (cos, sin) et occupe la hauteur de
 * sa police perpendiculairement : la boîte se construit sur ces quatre
 * coins, sinon une cote verticale paraît tenir dans un ruban horizontal.
 */
const chevauche = (a: Pose, b: Pose) => {
  const box = (p: Pose) => {
    const l = p.texte.length * p.taille * 0.5;
    const xs = [p.x, p.x + l * p.cos, p.x - p.sin * p.taille,
                p.x + l * p.cos - p.sin * p.taille];
    const ys = [p.y, p.y + l * p.sin, p.y + p.cos * p.taille,
                p.y + l * p.sin + p.cos * p.taille];
    return {
      x0: Math.min(...xs), x1: Math.max(...xs),
      y0: Math.min(...ys), y1: Math.max(...ys),
    };
  };
  const A = box(a);
  const B = box(b);
  const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
  const oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
  return ox > 1 && oy > 1;
};

const pdfDe = (walls: WallSeg[]) =>
  latin1(
    buildScanPdf(
      {
        name: 'Essai',
        walls,
        openings: [],
        objects: [],
        rooms: [{ id: 'r1', wallIds: walls.map((w) => w.id) }],
      },
      false,
      { metre: false },
    ),
  );

describe('les valeurs de cote', () => {
  it('ne se recouvrent jamais, même sur un mur en dents de scie', () => {
    const poses = cotes(pdfDe(DENTELE));
    expect(poses.length).toBeGreaterThan(2);
    for (let i = 0; i < poses.length; i++) {
      for (let j = i + 1; j < poses.length; j++) {
        expect(chevauche(poses[i], poses[j])).toBe(false);
      }
    }
  });

  it('les grandes cotes survivent, ce sont elles qu’on lit', () => {
    const poses = cotes(pdfDe(DENTELE));
    const valeurs = poses.map((p) => p.texte);
    // Les grands murs passent d'abord : ce sont les cotes qu'on lit.
    expect(valeurs).toContain('14,00 m');
    expect(valeurs).toContain('8,00 m');
    // Et l'arbitrage a bien eu lieu : les vingt retours ne tiennent pas.
    const retours = valeurs.filter((v) => v === '0,12 m');
    expect(retours.length).toBeGreaterThan(0);
    expect(retours.length).toBeLessThan(20);
  });

  it('sur un plan dégagé, aucune cote n’est sacrifiée', () => {
    const poses = cotes(pdfDe(SIMPLE));
    expect(poses.map((p) => p.texte).sort()).toEqual([
      '4,00 m',
      '4,00 m',
      '5,00 m',
      '5,00 m',
    ]);
  });
});

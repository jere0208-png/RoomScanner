/**
 * Rien ne doit sortir du cadre.
 *
 * Un trait qui déborde de la feuille est invisible à la génération et
 * saute aux yeux à l'impression. Ce test relit le flux PDF, extrait tous
 * les points des tracés, et vérifie qu'ils tiennent dans la page.
 */
import { buildScanPdf } from '../src/export/pdf';
import type { WallSeg } from '../src/geometry/floorplan';
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
});

/** Pièce scannée DE BIAIS : le cas qui déborde, si quelque chose déborde. */
const cos = Math.cos(0.35);
const sin = Math.sin(0.35);
const tourne = (x: number, z: number) => ({
  x: x * cos - z * sin,
  z: x * sin + z * cos,
});
const A = tourne(0, 0);
const B = tourne(3.5, 0);
const C = tourne(3.5, 2.5);
const D = tourne(0, 2.5);
const BIAIS = [
  mur('n', A.x, A.z, B.x, B.z),
  mur('e', B.x, B.z, C.x, C.z),
  mur('s', C.x, C.z, D.x, D.z),
  mur('w', D.x, D.z, A.x, A.z),
];

const porte: WallSeg = {
  id: 'p1',
  type: 'door',
  a: tourne(1, 0),
  b: tourne(1.9, 0),
  height: 2.05,
  yCenter: 1.025,
};

const prises: Fixture[] = [
  { id: 'f1', kind: 'prise', wallId: 'n', along: 0.4, height: 0.25, side: 1 },
  { id: 'f2', kind: 'inter', wallId: 'e', along: 0.6, height: 1.1, side: 1 },
  { id: 'f3', kind: 'tableau', wallId: 's', along: 1.2, height: 1.35, side: 1 },
];

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};

/** Tous les points de tracé du document (opérateurs `m` et `l`). */
function points(pdf: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const re = /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (m|l)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pdf))) {
    out.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
  }
  return out;
}

describe('le plan PDF tient dans sa feuille', () => {
  const pdf = latin1(
    buildScanPdf(
      {
        name: 'Biais',
        walls: BIAIS,
        openings: [porte],
        objects: [],
        fixtures: prises,
      },
      false,
      { metre: false },
    ),
  );

  it('produit bien un document', () => {
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(points(pdf).length).toBeGreaterThan(50);
  });

  it('aucun trait ne sort du cadre', () => {
    // Le cadre, pas la page : un trait qui dépasse du cadre est déjà faux.
    const dehors = points(pdf).filter(
      (p) => p.x < 29 || p.y < 29 || p.x > PAGE_W - 29 || p.y > PAGE_H - 29,
    );
    expect(
      dehors
        .slice(0, 6)
        .map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`)
        .join(' | '),
    ).toBe('');
  });

  it('les ouvertures sont cotées', () => {
    // 0,90 m de porte : la cote doit figurer sur le plan.
    expect(pdf).toContain('0,90');
  });
});

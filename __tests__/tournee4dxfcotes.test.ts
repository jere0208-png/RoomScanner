/**
 * TOURNÉE N°4 — LES COTES DU DXF.
 *
 * « Claire » : dans son logiciel, chaque cote du DXF n'était qu'un texte
 * posé à plat sur l'axe du mur — dans la maçonnerie, et couché en travers
 * des murs verticaux. Pas de ligne de cote, rien à accrocher. Elle se trace
 * maintenant comme à la planche, dans la pièce : ligne de cote de la
 * longueur écrite, tirets, lignes d'attache, et le chiffre le long du mur.
 */
import { buildDxf } from '../src/export/dxf';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.6,
  yCenter: 1.3,
  auNu: true,
  epaisseur: 0.2,
});

// Une chambre de 4 × 3 m à l'axe, en murs de 20 cm : 3,80 × 2,80 au nu.
const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];

interface Entite {
  type: string;
  calque: string;
  codes: Map<string, string>;
}

/** Les entités du DXF, avec leurs codes (le premier de chaque). */
const relire = (dxf: string): Entite[] => {
  const l = dxf.split('\n');
  const out: Entite[] = [];
  let e: Entite | null = null;
  for (let i = 0; i + 1 < l.length; i += 2) {
    const code = l[i].trim();
    const val = l[i + 1].trim();
    if (code === '0') {
      e = { type: val, calque: '', codes: new Map() };
      out.push(e);
    } else if (e) {
      if (code === '8') e.calque = val;
      if (!e.codes.has(code)) e.codes.set(code, val);
    }
  }
  return out;
};

const dxf = buildDxf({
  walls: MURS,
  openings: [],
  rooms: [{ id: 'ch', name: 'Chambre', wallIds: ['n', 'e', 's', 'o'] }],
  fixtures: [],
} as never);
const cotes = relire(dxf).filter((e) => e.calque === 'ECHOPLAN-COTES');
const textes = cotes.filter((e) => e.type === 'TEXT');
const traits = cotes
  .filter((e) => e.type === 'LINE')
  .map((e) => {
    const [x1, y1, x2, y2] = ['10', '20', '11', '21'].map((c) => Number(e.codes.get(c)));
    return { x1, y1, x2, y2, L: Math.hypot(x2 - x1, y2 - y1) };
  });

describe('les cotes du DXF', () => {
  it('chaque mur a sa ligne de cote, de la longueur écrite', () => {
    expect(textes.map((t) => t.codes.get('1')).sort()).toEqual(['2,80 m', '2,80 m', '3,80 m', '3,80 m']);
    expect(traits.filter((t) => Math.abs(t.L - 3800) < 1)).toHaveLength(2);
    expect(traits.filter((t) => Math.abs(t.L - 2800) < 1)).toHaveLength(2);
    // Et des tirets, des lignes d'attache : plus qu'un trait par mur.
    expect(traits.length).toBeGreaterThan(4 * 3);
  });

  it('elle se trace dans la pièce, pas sur l’axe du mur', () => {
    // Le mur nord a son axe en y = 0 ; la pièce est en dessous (y < 0).
    const nord = traits.find((t) => Math.abs(t.L - 3800) < 1 && Math.abs(t.y1 - t.y2) < 1 && t.y1 > -1500)!;
    expect(nord.y1).toBeLessThan(-100); // au-delà de la face du mur
    expect(nord.y1).toBeGreaterThan(-800); // près de lui
    // Du nu au nu : de x = 100 à x = 3900.
    expect(Math.min(nord.x1, nord.x2)).toBeCloseTo(100, 0);
    expect(Math.max(nord.x1, nord.x2)).toBeCloseTo(3900, 0);
    // Aucun chiffre sur un axe de mur.
    for (const t of textes) {
      const x = Number(t.codes.get('11'));
      const y = Number(t.codes.get('21'));
      const surAxe = Math.abs(y) < 100 || Math.abs(y + 3000) < 100 || Math.abs(x) < 100 || Math.abs(x - 4000) < 100;
      expect(surAxe).toBe(false);
    }
  });

  it('le chiffre se couche le long du mur, centré sur sa ligne', () => {
    const angles = textes.map((t) => Number(t.codes.get('50') ?? '0'));
    expect(angles.filter((a) => a === 90)).toHaveLength(2); // murs verticaux
    expect(angles.filter((a) => a === 0)).toHaveLength(2);
    for (const t of textes) expect(t.codes.get('72')).toBe('1');
  });
});

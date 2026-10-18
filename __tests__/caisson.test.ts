/**
 * LE CAISSON SOUS PLAFOND SE LIT DANS LA CARTE DU PLAFOND — diagnostic du
 * patron : « le coffre en haut du mur ne se détecte pas au scan ».
 *
 * Des relevés synthétiques, carreau par carreau comme les écrit le natif
 * (moyenne des hauteurs des triangles de plafond qui tombent dans chaque
 * carreau de 25 cm) : un caisson franc, un caisson sur une partie du mur, un
 * plafond plat, un rampant, et une grille qui ne tombe pas sur les murs.
 */
import type { VolumeReleve } from 'react-native-room-scan';
import { caissonsDuVolume, empriseDuCaisson, lireLaStation, objetCaisson } from '../src/geometry/caisson';
import type { Pt, WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number, height = 2.4): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height,
  yCenter: height / 2,
});
// Une salle de 5 × 4, le mur nord en z = 0, la pièce vers z > 0.
const MURS = [mur('n', 0, 0, 5, 0), mur('e', 5, 0, 5, 4), mur('s', 5, 4, 0, 4), mur('o', 0, 4, 0, 0)];
const CONTOUR: Pt[] = [
  { x: 0, z: 0 },
  { x: 5, z: 0 },
  { x: 5, z: 4 },
  { x: 0, z: 4 },
];

/** Une carte du plafond, chaque carreau à la hauteur moyenne de `h(x, z)` sur sa surface. */
function carte(h: (x: number, z: number) => number, decalage = 0): VolumeReleve {
  const pas = 0.25;
  const minX = -0.5 + decalage;
  const minZ = -0.5 + decalage;
  const cols = 26;
  const rows = 22;
  const plafond: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let s = 0;
      let n = 0;
      for (let i = 0; i < 5; i++) {
        for (let k = 0; k < 5; k++) {
          const x = minX + (c + (i + 0.5) / 5) * pas;
          const z = minZ + (r + (k + 0.5) / 5) * pas;
          if (x < 0 || x > 5 || z < 0 || z > 4) continue;
          s += h(x, z);
          n++;
        }
      }
      plafond.push(n > 0 ? Math.round((s / n) * 100) : 0);
    }
  }
  return { sol: 0, pas, minX, minZ, cols, rows, plafond };
}

describe('le caisson sous plafond, au scan', () => {
  it('un caisson de 50 cm sur 40 le long du mur nord, sur toute sa longueur', () => {
    const v = carte((_x, z) => (z < 0.5 ? 2.4 : 2.8));
    const c = caissonsDuVolume(v, CONTOUR, MURS);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ wallId: 'n', t0: 0, t1: 5, sens: 1 });
    expect(c[0].profondeur).toBeCloseTo(0.5, 1);
    expect(c[0].retombee).toBeCloseTo(0.4, 2);
    expect(c[0].plafond).toBeCloseTo(2.8, 2);
  });

  it('sur une partie du mur seulement, de 1,00 à 3,50', () => {
    const v = carte((x, z) => (z < 0.4 && x > 1 && x < 3.5 ? 2.5 : 2.8));
    const c = caissonsDuVolume(v, CONTOUR, MURS);
    expect(c).toHaveLength(1);
    expect(c[0].t0).toBeGreaterThan(0.75);
    expect(c[0].t0).toBeLessThan(1.3);
    expect(c[0].t1).toBeGreaterThan(3.2);
    expect(c[0].t1).toBeLessThan(3.8);
    expect(c[0].profondeur).toBeCloseTo(0.4, 1);
    expect(c[0].retombee).toBeCloseTo(0.3, 2);
  });

  it('la grille du relevé ne tombe pas sur les murs : même lecture', () => {
    const v = carte((_x, z) => (z < 0.6 ? 2.35 : 2.75), 0.11);
    const c = caissonsDuVolume(v, CONTOUR, MURS);
    expect(c).toHaveLength(1);
    expect(c[0].profondeur).toBeGreaterThan(0.45);
    expect(c[0].profondeur).toBeLessThan(0.75);
    expect(c[0].retombee).toBeCloseTo(0.4, 1);
  });

  it('un plafond plat ne porte aucun caisson', () => {
    expect(caissonsDuVolume(carte(() => 2.5), CONTOUR, MURS)).toEqual([]);
  });

  it('un rampant monte peu à peu : ce n’est pas un caisson', () => {
    // Sous les toits : 1,20 contre le mur sud, 2,80 à deux mètres de lui.
    const v = carte((_x, z) => Math.min(2.8, 1.2 + Math.max(0, 4 - z) * 0.8));
    expect(caissonsDuVolume(v, CONTOUR, MURS)).toEqual([]);
  });

  it('un caisson de 50 cm de long n’est qu’un accident du relevé', () => {
    const v = carte((x, z) => (z < 0.5 && x > 2 && x < 2.5 ? 2.4 : 2.8));
    expect(caissonsDuVolume(v, CONTOUR, MURS)).toEqual([]);
  });

  it('une station : la marche se lit au carreau qui la porte', () => {
    // 2,40 contre le mur, puis un carreau à moitié bas, puis le plafond.
    const s = lireLaStation([2.4, 2.6, 2.8, 2.8], 2.8, null, 0.25);
    expect(s!.profondeur).toBeCloseTo(0.375, 6);
    expect(s!.retombee).toBeCloseTo(0.4, 6);
    // Le seul carreau bas est mêlé : le mur arrêté sous le caisson dit la retombée.
    const t = lireLaStation([2.6, 2.8], 2.8, 2.4, 0.25);
    expect(t!.retombee).toBeCloseTo(0.4, 6);
    expect(t!.profondeur).toBeCloseTo(0.125, 6);
    // Pas vu entre-temps : on ne devine pas.
    expect(lireLaStation([2.4, null, 2.8], 2.8, null, 0.25)).toBeNull();
  });
});

describe('le caisson, meuble du plan', () => {
  it('collé au plafond, contre la face du mur, sa largeur le long du mur', () => {
    const o = objetCaisson(MURS[0], { t0: 1, t1: 4, profondeur: 0.5, retombee: 0.4, plafond: 2.8, sens: 1 }, 0.1, 'c1');
    expect(o).toMatchObject({ category: 'caisson', width: 3, depth: 0.5, height: 0.4 });
    // Son dessus au plafond : centre à 0,1 + 2,8 − 0,2.
    expect(o.transform[13]).toBeCloseTo(2.7, 9);
    const e = empriseDuCaisson(o);
    const zs = e.map((p) => p.z);
    const xs = e.map((p) => p.x);
    expect(Math.min(...zs)).toBeCloseTo(0, 9);
    expect(Math.max(...zs)).toBeCloseTo(0.5, 9);
    expect(Math.min(...xs)).toBeCloseTo(1, 9);
    expect(Math.max(...xs)).toBeCloseTo(4, 9);
  });

  it('contre un mur dessiné, il part de son nu, pas de son axe', () => {
    const w = { ...MURS[2], auNu: true, epaisseur: 0.2 };
    const o = objetCaisson(w, { t0: 0, t1: 5, profondeur: 0.4, retombee: 0.3, plafond: 2.5, sens: 1 }, 0, 'c2');
    const zs = empriseDuCaisson(o).map((p) => p.z);
    // Le mur sud (z = 4), tracé vers l'ouest : la pièce est au nord, son nu à 3,90.
    expect(Math.max(...zs)).toBeCloseTo(3.9, 9);
    expect(Math.min(...zs)).toBeCloseTo(3.5, 9);
  });
});

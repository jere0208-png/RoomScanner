/**
 * LE CANAPÉ D'ANGLE SCANNÉ RESTE UN CANAPÉ D'ANGLE.
 *
 * Relevé du patron : « le canapé d'angle scanné détecte un canapé standard +
 * un fauteuil ». RoomPlan découpe souvent un L en deux boîtes : le grand
 * côté (un canapé) et la méridienne (un « canapé » étroit ou une « chaise »,
 * que le modèle 3D dessine en fauteuil). On les réunit à la fin du scan.
 */
import type { ObjectData } from 'react-native-room-scan';
import { reunirLesCanapesDAngle } from '../src/geometry/canapeAngle';
import { orienterLesSieges } from '../src/geometry/sieges';
import { PAR_SOMMET, fabriquer, graineDe, type ModeleLocal } from '../src/geometry/modeles3d';
import type { WallSeg } from '../src/geometry/floorplan';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Un objet RoomPlan : centre (x, z), tourné de `yaw` (radians), mesures. */
const objet = (
  id: string,
  category: string,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  yaw = 0,
  attributes?: string[],
): ObjectData => {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    id,
    category,
    width: w,
    depth: d,
    height: h,
    transform: [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, x, h / 2, z, 1],
    ...(attributes ? { attributes } : {}),
  };
};

/** Le canapé de 2,40 × 0,95 au centre, qui regarde vers −z. */
const CANAPE = objet('canape', 'sofa', 0, 0, 2.4, 0.95, 0.85, 0, ['SofaType:rectangular']);
/** La méridienne, vue comme un fauteuil, au bout droit, qui avance de 93 cm. */
const MERIDIENNE = objet('fauteuil', 'chair', 0.75, -0.94, 0.9, 0.93, 0.8);

const attr = (o: ObjectData) => (o as { attributes?: string[] }).attributes ?? [];
const avant = (o: ObjectData) => {
  const l = Math.hypot(o.transform[8], o.transform[10]);
  return { x: -o.transform[8] / l, z: -o.transform[10] / l };
};

describe('la méridienne rejoint son canapé', () => {
  it('un canapé et un fauteuil collés en L : un seul canapé d’angle, méridienne à droite', () => {
    const r = reunirLesCanapesDAngle([CANAPE, MERIDIENNE]);
    expect(r).toHaveLength(1);
    const L = r[0];
    expect(L.id).toBe('canape');
    expect(L.category).toBe('sofa');
    expect(attr(L)).toEqual(expect.arrayContaining(['SofaType:lShaped', 'SofaAngle:droite']));
    expect(attr(L)).not.toContain('SofaType:rectangular');
    expect(L.width).toBeCloseTo(2.4, 2);
    expect(L.depth).toBeCloseTo(0.475 + 1.405, 2);
    // Le centre recule vers l'avant, avec la méridienne.
    expect(L.transform[14]).toBeLessThan(-0.3);
    expect(avant(L).z).toBeCloseTo(-1, 3);
  });

  it('au bout gauche : méridienne à gauche', () => {
    const gauche = { ...MERIDIENNE, transform: [...MERIDIENNE.transform] };
    gauche.transform[12] = -0.75;
    const r = reunirLesCanapesDAngle([CANAPE, gauche]);
    expect(r).toHaveLength(1);
    expect(attr(r[0])).toContain('SofaAngle:gauche');
  });

  it('le même L tourné d’un quart de tour se réunit pareil', () => {
    const q = Math.PI / 2;
    const tourne = (o: ObjectData): ObjectData => {
      const x = o.transform[12];
      const z = o.transform[14];
      const yaw = Math.atan2(o.transform[2], o.transform[0]) + q;
      return objet(o.id, o.category, x * Math.cos(q) - z * Math.sin(q), x * Math.sin(q) + z * Math.cos(q), o.width, o.depth, o.height, yaw, attr(o));
    };
    const r = reunirLesCanapesDAngle([tourne(CANAPE), tourne(MERIDIENNE)]);
    expect(r).toHaveLength(1);
    expect(r[0].width).toBeCloseTo(2.4, 2);
    expect(attr(r[0])).toContain('SofaAngle:droite');
  });

  it('une méridienne vue comme un canapé étroit, en travers, se réunit aussi', () => {
    const travers = objet('bout', 'sofa', 0.75, -0.7, 1.6, 0.9, 0.82, Math.PI / 2);
    const r = reunirLesCanapesDAngle([CANAPE, travers]);
    expect(r).toHaveLength(1);
    expect(attr(r[0])).toContain('SofaType:lShaped');
  });

  it('une méridienne DERRIÈRE le canapé : RoomPlan l’avait retourné, on le remet face à la pièce', () => {
    const derriere = { ...MERIDIENNE, transform: [...MERIDIENNE.transform] };
    derriere.transform[14] = 0.94;
    const r = reunirLesCanapesDAngle([CANAPE, derriere]);
    expect(r).toHaveLength(1);
    // L'avant regarde maintenant vers +z, du côté de la méridienne.
    expect(avant(r[0]).z).toBeCloseTo(1, 3);
    expect(r[0].transform[14]).toBeGreaterThan(0.3);
  });
});

describe('la rallonge que RoomPlan nomme lui-même', () => {
  /*
    Le canapé d'un vrai relevé du patron (diagnostic du 11/10) : RoomPlan
    l'avait bien vu en L — `SofaType:lShaped` pour le grand côté, et
    `SofaType:lShapedExtension` pour la rallonge, rendue à part.
  */
  const grand = objet('EA55', 'sofa', 0.74, 0.05, 2.5, 1.0, 0.88, (-1 * Math.PI) / 180, ['SofaType:lShaped']);
  const rallonge = objet('320D', 'sofa', -0.06, -0.78, 0.65, 0.88, 0.88, (89 * Math.PI) / 180, ['SofaType:lShapedExtension']);

  it('le canapé du relevé se réunit, méridienne à gauche', () => {
    const r = reunirLesCanapesDAngle([grand, rallonge]);
    expect(r).toHaveLength(1);
    expect(attr(r[0])).toEqual(expect.arrayContaining(['SofaType:lShaped', 'SofaAngle:gauche']));
    expect(attr(r[0])).not.toContain('SofaType:lShapedExtension');
  });

  it('une rallonge nommée se réunit même un peu décollée ; une chaise, non', () => {
    const decollee = { ...rallonge, transform: [...rallonge.transform] };
    decollee.transform[14] -= 0.2;
    expect(reunirLesCanapesDAngle([grand, decollee])).toHaveLength(1);
    const chaise = { ...decollee, category: 'chair', attributes: undefined } as ObjectData;
    expect(reunirLesCanapesDAngle([grand, chaise])).toHaveLength(2);
  });
});

describe('ce qui n’est pas un L reste à sa place', () => {
  it('un fauteuil à un mètre du canapé', () => {
    const loin = objet('fauteuil', 'chair', 2.4, -0.9, 0.85, 0.85, 0.8);
    expect(reunirLesCanapesDAngle([CANAPE, loin])).toHaveLength(2);
  });

  it('un pouf ou un fauteuil au milieu, devant le canapé', () => {
    const milieu = objet('pouf', 'chair', 0, -0.95, 0.6, 0.6, 0.45);
    expect(reunirLesCanapesDAngle([CANAPE, milieu])).toHaveLength(2);
  });

  it('un fauteuil posé de biais contre le bout', () => {
    const biais = objet('fauteuil', 'chair', 0.75, -0.94, 0.9, 0.93, 0.8, Math.PI / 4);
    expect(reunirLesCanapesDAngle([CANAPE, biais])).toHaveLength(2);
  });

  it('une table basse devant le canapé', () => {
    const table = objet('table', 'table', 0.6, -1.0, 1.0, 0.6, 0.42);
    expect(reunirLesCanapesDAngle([CANAPE, table])).toHaveLength(2);
  });

  it('deux canapés côte à côte, alignés', () => {
    const voisin = objet('voisin', 'sofa', 2.45, 0, 2.4, 0.95, 0.85);
    expect(reunirLesCanapesDAngle([CANAPE, voisin])).toHaveLength(2);
  });
});

describe('le canapé réuni se dessine et se tient', () => {
  const modele = (attributs: string[]) =>
    fabriquer('sofa', { W: 2.4, D: 1.88, H: 0.85 }, { modele: '', attributs, hasard: graineDe('angle') });
  /** La hauteur la plus haute du modèle au-dessus de (x, z). */
  const hauteurAu = (m: ModeleLocal, x: number, z: number) => {
    let haut = -Infinity;
    for (const g of m.groupes) {
      const P = (k: number) => [g.v[k * PAR_SOMMET], g.v[k * PAR_SOMMET + 1], g.v[k * PAR_SOMMET + 2]];
      for (let t = 0; t < g.i.length; t += 3) {
        const [a, b, c] = [P(g.i[t]), P(g.i[t + 1]), P(g.i[t + 2])];
        const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
        if (Math.abs(det) < 1e-12) continue;
        const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det;
        const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        haut = Math.max(haut, l1 * a[1] + l2 * b[1] + l3 * c[1]);
      }
    }
    return haut;
  };

  it('la méridienne à gauche se dessine à gauche', () => {
    const g = modele(['SofaType:lShaped', 'SofaAngle:gauche']);
    expect(hauteurAu(g, -2.4 / 4, -1.88 / 2 + 0.2)).toBeGreaterThan(0.25);
    expect(hauteurAu(g, 2.4 / 4, -1.88 / 2 + 0.2)).toBeLessThan(0.25);
  });

  it('et sans une face retournée : le miroir garde l’endroit des faces', () => {
    const m = modele(['SofaType:lShaped', 'SofaAngle:gauche']);
    let retournees = 0;
    for (const g of m.groupes) {
      const P = (k: number) => [g.v[k * PAR_SOMMET], g.v[k * PAR_SOMMET + 1], g.v[k * PAR_SOMMET + 2]];
      const N = (k: number) => [g.v[k * PAR_SOMMET + 3], g.v[k * PAR_SOMMET + 4], g.v[k * PAR_SOMMET + 5]];
      for (let t = 0; t < g.i.length; t += 3) {
        const [a, b, c] = [g.i[t], g.i[t + 1], g.i[t + 2]];
        const u = P(b).map((v, i) => v - P(a)[i]);
        const v = P(c).map((x, i) => x - P(a)[i]);
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        if (Math.hypot(...n) < 1e-9) continue;
        const moy = [0, 1, 2].map((i) => N(a)[i] + N(b)[i] + N(c)[i]);
        if (n[0] * moy[0] + n[1] * moy[1] + n[2] * moy[2] < 0) retournees++;
      }
    }
    expect(retournees).toBe(0);
  });

  it('le redressement des sièges ne retourne pas un L réuni', () => {
    const [L] = reunirLesCanapesDAngle([CANAPE, MERIDIENNE]);
    const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
      id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25,
    });
    // Un mur juste devant la méridienne, rien derrière : un canapé droit ferait demi-tour.
    const murs = [mur('m', -3, -1.6, 3, -1.6)];
    const [apres] = orienterLesSieges([L], murs);
    expect(apres.transform).toEqual(L.transform);
  });

  it('les trois façons de finir un scan réunissent les canapés', () => {
    const store = readFileSync(join(__dirname, '..', 'src/store/scanStore.ts'), 'utf8');
    expect(store.match(/reunirLesCanapesDAngle\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});

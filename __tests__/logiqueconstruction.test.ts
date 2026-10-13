/**
 * LA LOGIQUE DE CONSTRUCTION — relevé du patron, vidéo d'un scan à l'appui :
 * l'encadrement de l'ouvrant décalé de quelques centimètres, et les ouvrants
 * voisins à des hauteurs qui diffèrent de quelques centimètres, quand tout
 * devrait être au même niveau. « Fais ça pour toute détection, murs, portes
 * et autres. »
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { SurfaceData } from 'react-native-room-scan';
import { areteDuProfil, avecLesBordsDuLidar, niveauxCommuns, releveLogique } from '../src/geometry/logique';
import { segLength, type WallSeg } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';

const st = () => useScanStore.getState();
const SOL = -1.3;
let n = 0;
/** Une surface telle que RoomPlan la livre (sol à −1,30 m). */
function surface(type: string, s: [number, number, number, number], h: number, bas = 0, id?: string): SurfaceData {
  const [ax, az, bx, bz] = s;
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L;
  const uz = (bz - az) / L;
  return {
    id: id ?? `${type}-lc-${++n}`,
    type,
    length: L,
    height: h,
    confidence: 'high',
    category: type === 'door' ? 'door(isOpen: false)' : type,
    transform: [ux, 0, uz, 0, 0, 1, 0, 0, -uz, 0, ux, 0, (ax + bx) / 2, SOL + bas + h / 2, (az + bz) / 2, 1],
  } as unknown as SurfaceData;
}
const haut = (o: WallSeg) => Math.round((o.yCenter + o.height / 2 - SOL) * 1000) / 1000;
const bas = (o: WallSeg) => Math.round((o.yCenter - o.height / 2 - SOL) * 1000) / 1000;

beforeEach(() => {
  useScanStore.setState({ walls: [], openings: [], objects: [], rooms: [], fixtures: [], ceiling: [], saves: [], niveauCourant: 0 } as never);
});

describe('des valeurs voisines, une seule valeur', () => {
  it('quatre linteaux à 2,14 / 2,16 / 2,17 / 2,19 se rejoignent ; un écart réel reste', () => {
    expect(niveauxCommuns([2.14, 2.16, 2.17, 2.19, 2.4], 0.04)).toEqual([2.17, 2.17, 2.17, 2.17, 2.4]);
  });

  it('une valeur seule ne bouge pas', () => {
    expect(niveauxCommuns([2.13], 0.04)).toEqual([2.13]);
  });
});

describe('le relevé ramené à la logique de construction', () => {
  // Un séjour de 6 × 4, un mur de 1,5° de travers et des hauteurs à 2-3 cm près.
  const scanner = () => {
    st().finalize({
      modelPath: '',
      surfaces: [
        surface('wall', [0, 0, 6, 0], 2.48),
        surface('wall', [6, 0, 6.1, 4], 2.51),
        surface('wall', [6.1, 4, 0, 4], 2.5),
        surface('wall', [0, 4, 0, 0], 2.52),
        // Trois fenêtres et une porte-fenêtre sur la façade.
        surface('window', [0.5, 0, 1.7, 0], 1.26, 0.88, 'f1'),
        surface('window', [2.0, 0, 3.21, 0], 1.25, 0.91, 'f2'),
        surface('window', [3.5, 0, 4.69, 0], 1.29, 0.9, 'f3'),
        surface('window', [4.9, 0, 5.8, 0], 2.16, 0.03, 'pf'),
        // Deux portes de chambre, à 2 cm près.
        surface('door', [6.1, 3.5, 0.5 + 6.1 - 0.5, 3.5], 2.03, 0, 'nul'),
        surface('door', [1, 4, 1.82, 4], 2.04, 0.01, 'p1'),
        surface('door', [3, 4, 3.84, 4], 2.06, 0, 'p2'),
      ].filter((x) => (x as unknown as { id: string }).id !== 'nul'),
      objects: [],
    } as never);
  };

  it('les murs sont d’équerre et à la même hauteur', () => {
    scanner();
    const murs = st().walls.filter((w) => w.type === 'wall');
    const hauts = new Set(murs.map((w) => Math.round((w.yCenter + w.height / 2) * 100)));
    expect(hauts.size).toBe(1);
    // D'équerre entre eux : le plan peut garder son cap, ses murs non leur biais.
    const angle = (w: WallSeg) => (Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x) * 180) / Math.PI;
    const ref = angle(murs[0]);
    for (const w of murs) {
      const ecart = Math.abs((((angle(w) - ref) % 90) + 90) % 90);
      expect(Math.min(ecart, 90 - ecart)).toBeLessThan(0.01);
    }
  });

  it('les linteaux et les appuis voisins s’alignent ; la porte-fenêtre part du sol', () => {
    scanner();
    const o = (id: string) => st().openings.find((x) => x.id === id)!;
    const linteaux = ['f1', 'f2', 'f3', 'pf'].map((id) => haut(o(id)));
    expect(new Set(linteaux).size).toBe(1);
    expect(['f1', 'f2', 'f3'].map((id) => bas(o(id)))).toEqual([0.9, 0.9, 0.9]);
    expect(bas(o('pf'))).toBe(0);
  });

  it('deux portes de chambre à 2 cm près ont la même largeur et partent du sol', () => {
    scanner();
    const portes = st().openings.filter((x) => x.type === 'door');
    expect(portes).toHaveLength(2);
    expect(Math.abs(segLength(portes[0]) - segLength(portes[1]))).toBeLessThan(1e-6);
    for (const p of portes) expect(bas(p)).toBe(0);
  });

  it('un écart réel reste : une imposte haute de 40 cm de plus garde son linteau', () => {
    const r = releveLogique(
      [{ id: 'm', type: 'wall', a: { x: 0, z: 0 }, b: { x: 8, z: 0 }, height: 3, yCenter: 1.5 }],
      [
        { id: 'a', type: 'window', a: { x: 1, z: 0 }, b: { x: 2, z: 0 }, height: 1.2, yCenter: 1.5 },
        { id: 'b', type: 'window', a: { x: 4, z: 0 }, b: { x: 5, z: 0 }, height: 1.6, yCenter: 1.7 },
      ],
    );
    expect(r.openings.map((x) => Math.round((x.yCenter + x.height / 2) * 100))).toEqual([210, 250]);
  });
});

describe('l’encadrement réel, lu dans le maillage', () => {
  /** Un profil : creux (rien de proche) jusqu'à la tranche `k`, puis le mur plein. */
  const profil = (k: number) => ({
    ecarts: Array.from({ length: 20 }, (_, i) => (i < k ? 0 : 0)),
    nombres: Array.from({ length: 20 }, (_, i) => (i < k ? 0 : 30)),
  });

  it('le mur reprend 6 cm sous le haut que RoomPlan donne : le linteau est là', () => {
    const p = profil(2);
    expect(areteDuProfil(p.ecarts, p.nombres, 0.02, -0.1)).toBeCloseTo(-0.06, 9);
  });

  it('un tableau en retrait (menuiserie à −12 cm) est encore la baie', () => {
    const ecarts = Array.from({ length: 20 }, (_, i) => (i < 7 ? -12 : 0));
    const nombres = Array.from({ length: 20 }, () => 30);
    expect(areteDuProfil(ecarts, nombres, 0.02, -0.1)).toBeCloseTo(0.04, 9);
  });

  it('un profil sans creux ne dit rien', () => {
    const p = profil(0);
    expect(areteDuProfil(p.ecarts, p.nombres, 0.02, -0.1)).toBeNull();
  });

  it('la baie se recale : haut sous le linteau, côtés sur les tableaux, appui sur la pierre', () => {
    const fen: WallSeg = { id: 'f', type: 'window', a: { x: 1, z: 0 }, b: { x: 2.2, z: 0 }, height: 1.3, yCenter: 0.25 };
    const dessus = { f: { pas: 0.02, depuis: -0.1, ...profil(2) } };
    const g = profil(3); // le tableau gauche est 4 cm DANS le cadre de RoomPlan
    const d = profil(7); // le tableau droit 4 cm au-delà
    const s = profil(6); // l'appui 2 cm plus bas
    const tableaux = {
      f: {
        pas: 0.02,
        depuis: -0.1,
        gauche: g.ecarts,
        nombresGauche: g.nombres,
        droite: d.ecarts,
        nombresDroite: d.nombres,
        dessous: s.ecarts,
        nombresDessous: s.nombres,
      },
    };
    const [o] = avecLesBordsDuLidar([fen], dessus as never, tableaux);
    expect(o.a.x).toBeCloseTo(1.04, 9);
    expect(o.b.x).toBeCloseTo(2.24, 9);
    // Haut : 0,25 + 0,65 − 0,06 = 0,84 ; bas : 0,25 − 0,65 − 0,02 = −0,42.
    expect(o.yCenter + o.height / 2).toBeCloseTo(0.84, 6);
    expect(o.yCenter - o.height / 2).toBeCloseTo(-0.42, 6);
  });
});

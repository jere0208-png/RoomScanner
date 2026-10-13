/**
 * TOURNÉE N°5 — LES RETOUCHES.
 *
 * - « Amandine » : la porte-fenêtre corrigée en fenêtre remontait à 35 cm ;
 *   l'évier et la plaque étaient éjectés de leur meuble ; la porte de la
 *   salle d'eau non relevée n'était dite que par un bandeau qui passe.
 * - « Malik », « Hélène » : « un appui la remonte » proposé au-dessus du mur
 *   qui porte la baie, ou d'après les fenêtres de l'autre façade.
 * - « Gérard », « Bérénice » : le DXF n'était pas redressé.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { buildDxf } from '../src/export/dxf';
import { linteauxRabotes, separerMeubles, type WallSeg } from '../src/geometry/floorplan';
import { diagnostiquerPlan } from '../src/geometry/diagnosticPlan';
import { useScanStore } from '../src/store/scanStore';

const st = () => useScanStore.getState();
const seg = (id: string, type: WallSeg['type'], ax: number, az: number, bx: number, bz: number, height: number, bas = 0): WallSeg => ({
  id,
  type,
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height,
  yCenter: bas + height / 2,
});

describe('les baies corrigées à la main', () => {
  const piece = [
    seg('n', 'wall', 0, 0, 4, 0, 2.5),
    seg('e', 'wall', 4, 0, 4, 3, 2.5),
    seg('s', 'wall', 4, 3, 0, 3, 2.5),
    seg('o', 'wall', 0, 3, 0, 0, 2.5),
  ];
  beforeEach(() => {
    useScanStore.setState({
      walls: piece,
      openings: [seg('pf', 'door', 1, 0, 2.2, 0, 2.15), seg('f', 'window', 2.5, 0, 3.5, 0, 1.2, 0.9)],
      rooms: [{ id: 'r', name: 'Séjour', wallIds: piece.map((w) => w.id) }],
      objects: [],
      fixtures: [],
      niveauCourant: 0,
    } as never);
  });

  it('une porte-fenêtre corrigée en fenêtre reste au sol', () => {
    st().setOpeningType('pf', 'window');
    const o = st().openings.find((x) => x.id === 'pf')!;
    expect(o.type).toBe('window');
    expect(o.yCenter - o.height / 2).toBeCloseTo(0, 6);
  });

  it('une fenêtre ne s’agrandit pas au-dessus du mur qui la porte', () => {
    st().resizeOpening('f', undefined, 2.4);
    const o = st().openings.find((x) => x.id === 'f')!;
    expect(o.yCenter + o.height / 2).toBeLessThanOrEqual(2.5 + 1e-9);
  });
});

describe('l’évier dans son meuble', () => {
  it('ne se sépare pas du meuble qui le porte ; deux meubles qui se traversent, si', () => {
    const meuble = (category: string, cx: number, w: number, d: number) => ({ category, cx, cz: 0.3, width: w, depth: d, yaw: 0, y0: 0, y1: 0.9 });
    expect(separerMeubles([meuble('storage', 1.2, 2.4, 0.6), meuble('sink', 1, 0.6, 0.45)])).toEqual([]);
    expect(separerMeubles([meuble('storage', 1.2, 2.4, 0.6), meuble('table', 1, 0.8, 0.6)]).length).toBeGreaterThan(0);
  });
});

describe('les linteaux', () => {
  it('ne se comparent qu’aux baies de la même façade', () => {
    const baies = [
      seg('r1', 'window', 1, 0, 2.2, 0, 2.41, 0.5),
      seg('r2', 'window', 4, 0, 5.2, 0, 2.41, 0.5),
      seg('c1', 'window', 1, 10, 2.2, 10, 1.96, 0.6),
      seg('c2', 'window', 4, 10, 5.2, 10, 1.96, 0.6),
    ];
    expect(linteauxRabotes(baies)).toEqual([]);
  });

  it('ne proposent pas de remonter une baie au-dessus de son mur', () => {
    const murs = [seg('atelier', 'wall', 0, 0, 6, 0, 5), seg('chambre', 'wall', 6, 0, 10, 0, 2.4)];
    const baies = [
      seg('a', 'window', 1, 0, 2.2, 0, 2.7, 0.5),
      seg('b', 'window', 3, 0, 4.2, 0, 2.7, 0.5),
      seg('c', 'window', 7, 0, 8.2, 0, 1.5, 0.6),
    ];
    expect(linteauxRabotes(baies, 0.15, [], 0, murs)).toEqual([]);
    // Sans les murs, la règle d'avant aurait parlé.
    expect(linteauxRabotes(baies).map((x) => x.id)).toEqual(['c']);
  });
});

describe('le DXF', () => {
  it('est redressé comme le PDF : une pièce scannée de biais sort d’aplomb', () => {
    const a = (17 * Math.PI) / 180;
    const tourne = (x: number, z: number) => ({ x: x * Math.cos(a) - z * Math.sin(a), z: x * Math.sin(a) + z * Math.cos(a) });
    const coins = [tourne(0, 0), tourne(4, 0), tourne(4, 3), tourne(0, 3)];
    const murs = coins.map((p, i) => {
      const q = coins[(i + 1) % 4];
      return seg(`m${i}`, 'wall', p.x, p.z, q.x, q.z, 2.5);
    });
    const dxf = buildDxf({ walls: murs, openings: [], rooms: [{ id: 'r', name: 'Séjour', wallIds: murs.map((w) => w.id) }], fixtures: [] });
    // Les lignes de cote : horizontales ou verticales, à la précision du fichier.
    const l = dxf.split('\n').map((x) => x.trim());
    const biais: number[] = [];
    for (let i = 0; i + 15 < l.length; i++) {
      if (l[i] !== 'LINE' || l[i + 2] !== 'ECHOPLAN-COTES') continue;
      const v = (code: string) => Number(l[l.indexOf(code, i + 3) + 1]);
      const dx = v('11') - v('10');
      const dy = v('21') - v('20');
      const ang = (Math.abs(Math.atan2(dy, dx)) * 180) / Math.PI % 90;
      if (Math.hypot(dx, dy) > 500) biais.push(Math.min(ang, 90 - ang));
    }
    expect(biais.length).toBeGreaterThan(0);
    expect(Math.max(...biais)).toBeLessThan(0.1);
  });
});

describe('la porte d’une pièce non relevée', () => {
  it('reste dite au diagnostic', () => {
    const murs = [
      seg('n', 'wall', 0, 0, 4, 0, 2.5),
      seg('e', 'wall', 4, 0, 4, 3, 2.5),
      seg('s', 'wall', 4, 3, 0, 3, 2.5),
      seg('o', 'wall', 0, 3, 0, 0, 2.5),
    ];
    const porte = { ...seg('p', 'door', 4, 1, 4, 1.73, 2.04), versNonReleve: true };
    const d = diagnostiquerPlan({ walls: murs, openings: [porte], rooms: [{ id: 'r', wallIds: murs.map((w) => w.id) }], objects: [] });
    expect(d.problemes.some((x) => x.code === 'pieceNonRelevee')).toBe(true);
    // Une porte d'entrée ordinaire, elle, ne dit rien.
    const entree = seg('q', 'door', 4, 1, 4, 1.9, 2.04);
    const d2 = diagnostiquerPlan({ walls: murs, openings: [entree], rooms: [{ id: 'r', wallIds: murs.map((w) => w.id) }], objects: [] });
    expect(d2.problemes.some((x) => x.code === 'pieceNonRelevee')).toBe(false);
  });
});

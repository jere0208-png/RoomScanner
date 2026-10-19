/**
 * LA 3D DIT CE QUE LE PLAN DIT — défauts trouvés par l'agent testeur
 * PLAN 3D, devenus des garde-fous :
 *   — un faux plafond : les points lumineux restaient vingt centimètres
 *     au-dessus du plafond de leur pièce ;
 *   — un frigo top (sous plan de travail) : ses poignées perçaient le sol et
 *     dépassaient son dessus ;
 *   — le modèle 3D exporté (OBJ) n'avait pas de plafond équipé ;
 *   — le « Meuble TV suspendu » du catalogue tombait par terre ;
 *   — un meuble au relevé abîmé partait au rendu natif avec des NaN ;
 *   — un meuble sans pièce était poussé vers le milieu du logement, à
 *     travers ses propres murs (la visite le heurtait au même faux endroit).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { ObjectData } from 'react-native-room-scan';
import { useScanStore } from '../src/store/scanStore';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { fabriquer, graineDe, modeleDe, PAR_SOMMET } from '../src/geometry/modeles3d';
import { buildObj } from '../src/export/model3d';
import { obstaclesDeLaVisite } from '../src/geometry/exploration';

const PAL = {
  floor: '#EEEEEE', floorStroke: '#CCCCCC', wall: '#FFFFFF', wallStroke: '#888888', wallTop: '#DDDDDD',
  wallTopStroke: '#777777', opening: '#AACCEE', door: '#AA8866', window: '#AACCEE', passage: '#AACCEE',
  object: '#BBBBBB', objectTop: '#CCCCCC', objectStroke: '#999999',
} as unknown as ScenePalette;

const st = () => useScanStore.getState();
const piece = (nom: string) => st().rooms.find((r) => r.name === nom)!;

beforeEach(() => {
  st().ouvrirExemple();
});

describe('le plafond équipé suit le plafond de sa pièce', () => {
  it('séjour baissé à 2,30 : ses points lumineux sont à 2,30, la chambre reste à 2,50', () => {
    const sejour = piece('Séjour-cuisine');
    st().setRoomHeight(sejour.id, 2.3);
    const s = st();
    const sc = buildScene(s.walls, s.openings, s.objects, {
      palette: PAL, rooms: s.rooms, fixtures: s.fixtures, ceiling: s.ceiling, plafonds: true, showSurfaces: true,
    });
    const auPlafond = (sc.appareils ?? []).filter((a) => a.plafond);
    const deLaPiece = (roomId: string) =>
      auPlafond.filter((a) => s.ceiling.some((c) => `cl-${c.id}` === a.id && c.roomId === roomId));
    expect(deLaPiece(sejour.id).length).toBeGreaterThan(0);
    for (const a of deLaPiece(sejour.id)) expect(a.y).toBeCloseTo(2.3, 6);
    for (const a of deLaPiece(piece('Chambre').id)) expect(a.y).toBeCloseTo(2.5, 6);
    // Et le plafond dessiné de la pièce est bien à cette hauteur-là.
    expect(sc.faces.some((f) => f.isCeiling && Math.abs(f.pts[0].y - 2.3) < 1e-6)).toBe(true);
  });
});

describe('le frigo top tient dans sa boîte', () => {
  const boite = (W: number, D: number, H: number) => {
    const m = fabriquer('refrigerator', { W, D, H }, { modele: '', attributs: [], hasard: graineDe('frigo') });
    let lo = Infinity;
    let hi = -Infinity;
    for (const g of m.groupes) for (let k = 0; k < g.v.length; k += PAR_SOMMET) {
      lo = Math.min(lo, g.v[k + 1]);
      hi = Math.max(hi, g.v[k + 1]);
    }
    return { lo, hi };
  };
  it.each([[0.48, 0.5, 0.5], [0.55, 0.55, 0.6], [0.5, 0.55, 0.85], [0.6, 0.65, 1.85]])('%p × %p × %p : ni sous le sol, ni au-dessus', (W, D, H) => {
    const { lo, hi } = boite(W, D, H);
    expect(lo).toBeGreaterThanOrEqual(-1e-6);
    expect(hi).toBeLessThanOrEqual(H + 1e-6);
  });
});

describe('le modèle 3D exporté porte le plafond équipé', () => {
  it('avec le plafond, des faces d’appareillage de plus', () => {
    const s = st();
    const sans = buildObj({ walls: s.walls, openings: s.openings, objects: s.objects, rooms: s.rooms, fixtures: s.fixtures });
    const avec = buildObj({ walls: s.walls, openings: s.openings, objects: s.objects, rooms: s.rooms, fixtures: s.fixtures, ceiling: s.ceiling });
    const faces = (obj: string) => obj.split('\n').filter((l) => l.startsWith('f ')).length;
    expect(s.ceiling.length).toBeGreaterThan(0);
    expect(faces(avec)).toBeGreaterThan(faces(sans));
  });
});

describe('ce que le catalogue a posé en hauteur y reste', () => {
  it('le meuble TV suspendu reste à 30 cm du sol ; un rangement relevé à 30 cm se pose', () => {
    const s = st();
    const sej = piece('Séjour-cuisine');
    const meuble = (id: string, modele: string | undefined): ObjectData =>
      ({
        id, category: 'storage', ...(modele ? { modele } : {}), width: 1.6, depth: 0.38, height: 0.35, roomId: sej.id,
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2.5, 0.3 + 0.175, 1.0, 1],
      }) as unknown as ObjectData;
    const sc = buildScene(s.walls, s.openings, [meuble('tvs', 'meubleTvSuspendu'), meuble('brut', undefined)], { palette: PAL, rooms: s.rooms });
    expect(sc.meubles?.find((m) => m.id === 'tvs')?.yb).toBeCloseTo(0.3, 6);
    expect(sc.meubles?.find((m) => m.id === 'brut')?.yb).toBe(0);
  });
});

describe('un relevé abîmé ne part pas au rendu', () => {
  it('un meuble à la position NaN n’a pas de pose', () => {
    const s = st();
    const abime = { ...s.objects[0], id: 'abime', transform: s.objects[0].transform.map((v, i) => (i === 12 ? NaN : v)) };
    const sc = buildScene(s.walls, s.openings, [...s.objects, abime], { palette: PAL, rooms: s.rooms });
    expect(sc.meubles?.some((m) => m.id === 'abime')).toBe(false);
    for (const m of sc.meubles ?? []) expect([m.cx, m.cz, m.yb, m.width, m.depth, m.yaw].every(Number.isFinite)).toBe(true);
  });
});

describe('un meuble sans pièce reste à sa place', () => {
  it('la 3D le pose là où elle pose le même meuble rattaché à sa pièce', () => {
    const s = st();
    const avec = buildScene(s.walls, s.openings, s.objects, { palette: PAL, rooms: s.rooms });
    const sansPiece = s.objects.map((o) => ({ ...o, roomId: undefined }) as unknown as ObjectData);
    const sans = buildScene(s.walls, s.openings, sansPiece, { palette: PAL, rooms: s.rooms });
    for (const m of avec.meubles ?? []) {
      const n = sans.meubles?.find((x) => x.id === m.id);
      if (!n) continue;
      expect(Math.hypot(m.cx - n.cx, m.cz - n.cz)).toBeLessThan(0.02);
    }
  });

  it('et la visite le heurte au même endroit', () => {
    const s = st();
    const coinsDe = (objects: ObjectData[]) =>
      new Map(
        obstaclesDeLaVisite(s.walls, s.openings, objects, s.rooms)
          .filter((o): o is Extract<typeof o, { kind: 'meuble' }> => o.kind === 'meuble')
          .map((o) => [o.id, o.coins]),
      );
    const avec = coinsDe(s.objects);
    const sans = coinsDe(s.objects.map((o) => ({ ...o, roomId: undefined }) as unknown as ObjectData));
    for (const [id, coins] of avec) {
      const autres = sans.get(id);
      if (!autres) continue;
      coins.forEach((c, i) => expect(Math.hypot(c.x - autres[i].x, c.z - autres[i].z)).toBeLessThan(0.02));
    }
  });
});

describe('la télé accrochée au mur n’a pas de pied', () => {
  it('à 1,20 m du sol, rien sous la dalle ; sur un meuble à 50 cm, son pied', () => {
    const pose = { id: 'tv', category: 'television', width: 1.2, depth: 0.2, height: 0.7, cx: 0, cz: 0, yaw: 0 };
    const basDe = (yb: number) => {
      const m = modeleDe({ ...pose, yb });
      let lo = Infinity;
      for (const g of m.groupes) for (let k = 0; k < g.v.length; k += PAR_SOMMET) lo = Math.min(lo, g.v[k + 1]);
      return lo;
    };
    // Au mur : la dalle commence au dessous du gabarit, aucun pied sous elle.
    expect(basDe(1.2)).toBeGreaterThanOrEqual(-1e-6);
    expect(basDe(1.2)).toBeCloseTo(0, 6);
    expect(modeleDe({ ...pose, yb: 1.2 })).not.toEqual(modeleDe({ ...pose, yb: 0.5 }));
  });
});

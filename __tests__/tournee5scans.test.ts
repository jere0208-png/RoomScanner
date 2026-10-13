/**
 * TOURNÉE N°5 — DES PIÈCES QUE LE SCAN NE PERD PLUS.
 *
 * Huit logements fabriqués comme RoomPlan les rend, avec leurs défauts. Sur
 * quatre d'entre eux, une pièce entière disparaissait, sans un mot :
 * - « Thomas », « Bérénice » : la fusion des murs vus deux fois rognait
 *   l'enveloppe (le séjour de 74 m²) ;
 * - « Gérard », « Hélène », « Bérénice » : un mur arrêté à 3-6 cm de la face
 *   d'un refend vu des deux côtés n'était ni recalé ni soudé ;
 * - « Bérénice » : la coupe en T laissait le bout à 0,3 mm, et la cloison se
 *   recollait ;
 * - « Amandine » : deux bouts à 1e-15 m de part et d'autre d'un arrondi
 *   faisaient deux nœuds.
 * Et cinq d'entre eux voyaient des triangles noirs dans le poché.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { act } from 'react-test-renderer';
import type { SurfaceData } from 'react-native-room-scan';
import {
  facesFermees,
  fusionnerMursDoubles,
  roomParts,
  sansEclatsLeLong,
  splitAtJunctions,
  weldCorners,
  type WallSeg,
} from '../src/geometry/floorplan';
import { pocheDesMurs } from '../src/geometry/poche';
import { bilanDuReleve } from '../src/geometry/bilan';
import { diagnostiquerPlan } from '../src/geometry/diagnosticPlan';
import { useScanStore } from '../src/store/scanStore';

const st = () => useScanStore.getState();
const mur = (id: string, ax: number, az: number, bx: number, bz: number, extra: Partial<WallSeg> = {}): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  ...extra,
});

let n = 0;
/** Une surface telle que RoomPlan la livre, dans le repère de la session (sol à −1,30 m). */
function surface(type: string, s: [number, number, number, number], h = 2.5, bas = 0): SurfaceData {
  const [ax, az, bx, bz] = s;
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L;
  const uz = (bz - az) / L;
  return {
    id: `${type}-t5-${++n}`,
    type,
    length: L,
    height: h,
    confidence: 'high',
    category: type === 'door' ? 'door(isOpen: false)' : type,
    transform: [ux, 0, uz, 0, 0, 1, 0, 0, -uz, 0, ux, 0, (ax + bx) / 2, -1.3 + bas + h / 2, (az + bz) / 2, 1],
  } as unknown as SurfaceData;
}
const scanner = (murs: [number, number, number, number][], portes: [number, number, number, number][] = []) => {
  act(() => {
    useScanStore.setState({ walls: [], openings: [], objects: [], rooms: [], fixtures: [], ceiling: [], saves: [], niveauCourant: 0 } as never);
    st().finalize({
      modelPath: '',
      surfaces: [...murs.map((m) => surface('wall', m)), ...portes.map((p) => surface('door', p, 2.05))],
      objects: [],
    } as never);
  });
  return roomParts(st().walls, st().rooms).filter((p) => p.surface?.exact);
};

describe('la fusion des murs vus deux fois', () => {
  it('garde l’étendue : le second morceau de façade puis l’éclat du coin', () => {
    const f = fusionnerMursDoubles([
      mur('long', 0, 0, 5.3, 0),
      mur('suite', 5.2, 0.01, 8.95, 0.01),
      mur('bout', 5.25, 0.02, 5.32, 0.02),
    ]);
    const w = f.find((x) => x.id === 'long')!;
    expect(Math.min(w.a.x, w.b.x)).toBeCloseTo(0, 2);
    expect(Math.max(w.a.x, w.b.x)).toBeCloseTo(8.95, 2);
  });

  it('range les faces en deux côtés : une face revue ne l’épaissit pas, quel que soit l’ordre', () => {
    const faces = [mur('f0', 0, 0, 4, 0), mur('f1', 0.2, 0.02, 3.8, 0.02), mur('g0', 0.1, 0.17, 3.9, 0.17), mur('g1', 0.3, 0.19, 3.7, 0.19)];
    for (const ordre of [faces, [...faces].reverse(), [faces[0], faces[2], faces[1], faces[3]]]) {
      const w = fusionnerMursDoubles(ordre).find((x) => x.deuxFaces)!;
      expect(w.epaisseur).toBeGreaterThan(0.15);
      expect(w.epaisseur).toBeLessThan(0.19);
    }
  });

  it('une façade arrêtée à 6 cm de la face d’un refend vu des deux côtés : les deux pièces existent', () => {
    // Deux pièces de 4 × 3 de part et d'autre d'un refend de 20 cm (faces x = 4 et x = 4,2).
    const pieces = scanner(
      [
        [0, 0, 3.94, 0], // arrêtée 6 cm avant la face
        [4.26, 0, 8.2, 0], // 6 cm après l'autre face
        [8.2, 0, 8.2, 3],
        [8.2, 3, 4.2, 3],
        [3.97, 3, 0, 3],
        [0, 3, 0, 0],
        [4, 0, 4, 3], // face ouest du refend
        [4.2, 3, 4.2, 0], // face est
      ],
      [[4, 1, 4, 1.83], [4.2, 1, 4.2, 1.83]],
    );
    expect(pieces).toHaveLength(2);
  });
});

describe('les jonctions en T', () => {
  it('le bout qui bute se pose au point de coupe, au millième près', () => {
    const coupes = splitAtJunctions([mur('long', 0, 0, 6, 0), mur('bute', 2.5, 3, 2.5, 0.0003)]);
    const bute = coupes.find((w) => w.id === 'bute')!;
    const noeuds = coupes.filter((w) => w.id.startsWith('long')).flatMap((w) => [w.a, w.b]);
    expect(noeuds.some((p) => p.x === bute.b.x && p.z === bute.b.z)).toBe(true);
  });

  it('une cloison qui bute à 17 cm d’un nœud coupe le mur', () => {
    const coupes = splitAtJunctions([mur('a', 0, 0, 3, 0), mur('b', 3, 0, 8, 0), mur('c', 3.17, 0, 3.17, 3)]);
    expect(coupes.filter((w) => w.id.startsWith('b'))).toHaveLength(2);
  });

  it('un même segment ne se trace qu’une fois', () => {
    const coupes = splitAtJunctions([mur('a', 0, 0, 1, 0), mur('a2', 0, 0, 1, 0), mur('b', 1, 0, 1, 2)]);
    expect(coupes.filter((w) => w.b.x === 1 && w.b.z === 0 && w.a.x === 0)).toHaveLength(1);
  });

  it('deux bouts à 1e-15 m de part et d’autre d’un arrondi sont le même nœud', () => {
    const d = 2 ** -51;
    const p1 = 2.0025 + d;
    const p2 = 2.0025 - d;
    const murs = [
      mur('b1', 0, 0, p2, 0), mur('b2', p2, 0, 5, 0), mur('d', 5, 0, 5, 3),
      mur('h2', 5, 3, p2, 3), mur('h1', p2, 3, 0, 3), mur('g', 0, 3, 0, 0),
      mur('cloison', p1, 0, p1, 3),
    ];
    expect(facesFermees(murs)).toHaveLength(2);
  });
});

describe('les coins et les éclats', () => {
  it('un coin ouvert de 4 cm se soude à la rencontre de ses deux murs', () => {
    const [f, p] = weldCorners([mur('façade', 0, 0, 3.56, 0), mur('pignon', 3.6, 0.04, 3.6, 2.5)]);
    expect(f.b.x).toBeCloseTo(3.6, 3);
    expect(f.b.z).toBeCloseTo(0, 3);
    expect(p.a.x).toBeCloseTo(3.6, 3);
  });

  it('un éclat couché le long d’un mur s’en va ; un retour de travers reste', () => {
    const murs = [mur('f', 0, 0, 4, 0), mur('eclat', 0.01, 0.01, 0.09, 0.02), mur('retour', 2, 0, 2, 0.12)];
    expect(sansEclatsLeLong(murs).map((w) => w.id)).toEqual(['f', 'retour']);
  });
});

describe('le poché', () => {
  it('deux morceaux de façade presque alignés ne tirent pas de diagonale', () => {
    const p = pocheDesMurs(
      [
        mur('b', 2.1636902566645757, 0.018287750679118808, 5.614679314319963, -0.005913379570832156),
        mur('a', -0.011057626258792141, 0.0010628321805477015, 2.1636902566645757, 0.018287750679118808),
      ],
      [],
      [],
    );
    const biais = p.contours.flatMap((c) =>
      c.filter((a, k) => {
        const b = c[(k + 1) % c.length];
        const ang = ((Math.abs(Math.atan2(b.z - a.z, b.x - a.x)) * 180) / Math.PI) % 90;
        return Math.hypot(b.x - a.x, b.z - a.z) > 0.3 && Math.min(ang, 90 - ang) > 3;
      }),
    );
    expect(biais).toEqual([]);
  });
});

describe('ce que l’app dit du relevé', () => {
  const studio: [number, number, number, number][] = [[0, 0, 6, 0], [6, 0, 6, 4], [6, 4, 0, 4], [0, 4, 0, 0]];

  it('le bilan de fin de scan compte la pièce fermée et sa surface', () => {
    scanner(studio, [[0, 1, 0, 1.9]]);
    const b = bilanDuReleve({ rooms: st().rooms, walls: st().walls, openings: st().openings, objects: st().objects })!;
    expect(b.surface).toBe(24);
    expect(b.criteres.find((c) => c.cle === 'structure')!.points).toBe(b.criteres.find((c) => c.cle === 'structure')!.sur);
  });

  it('des murs que plus aucune pièce ne réclame sont signalés', () => {
    const murs = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0), mur('x', 6, 0, 9, 0), mur('y', 9, 0, 9, 2)];
    const d = diagnostiquerPlan({ walls: murs, openings: [], rooms: [{ id: 'r', wallIds: ['n', 'e', 's', 'o'] }], objects: [] });
    const p = d.problemes.find((x) => x.code === 'murOrphelin')!;
    expect(p.gravite).toBe('alerte');
    expect(p.murIds).toEqual(['x', 'y']);
    // Un garde-corps n'en est pas un.
    const g = diagnostiquerPlan({
      walls: [...murs.slice(0, 4), mur('gc', 6, 0, 9, 0, { height: 1.05 })],
      openings: [],
      rooms: [{ id: 'r', wallIds: ['n', 'e', 's', 'o'] }],
      objects: [],
    });
    expect(g.problemes.some((x) => x.code === 'murOrphelin')).toBe(false);
  });
});

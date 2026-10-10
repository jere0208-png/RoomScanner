/**
 * LE SCAN VOIT MIEUX — le type de chaque pièce, et chaque mur en photo.
 *
 * Relevé du patron : « trouve encore des améliorations natives, en essayant
 * d'améliorer le scan en premier temps et ce qu'il détecte ; on ne veut pas
 * surcharger l'app d'éléments mais la rendre très qualitative ».
 *
 * Deux choses que le scan sait désormais, sans un bouton de plus :
 *
 *   — LE TYPE DE CHAQUE PIÈCE, tel que RoomPlan le classe (iOS 17) :
 *     cuisine, salle de bains, chambre, séjour, salle à manger. Le plan ne
 *     le devinait que d'après les meubles détourés ; RoomPlan l'emporte, sauf
 *     pour des WC, qu'il ne connaît pas ;
 *   — CHAQUE MUR PHOTOGRAPHIÉ DE FACE ET REDRESSÉ pendant le scan (le natif
 *     le fait ; ce banc tient le rattachement) : la photo va au mur du plan
 *     qui porte le mur relevé, sur la face d'où on la voyait, cadrée sur la
 *     part exacte qu'elle montre — même quand le plan a recousu deux pans.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { deduireLaPiece, kindFromRoomPlan } from '../src/geometry/furniture';
import { photosDesMurs } from '../src/geometry/photosAuto';
import { cadreDeLaPhoto } from '../src/ui/calage';
import { mergeColinear, splitAtJunctions, toSegment, weldCorners } from '../src/geometry/floorplan';
import type { ObjectData, SurfaceData } from 'react-native-room-scan';

const st = () => useScanStore.getState();

/** Un mur tel que RoomPlan le livre : son axe x le long du mur, z sa normale. */
const surface = (id: string, cx: number, cz: number, length: number, alongZ = false): SurfaceData => ({
  id,
  type: 'wall',
  length,
  height: 2.5,
  transform: alongZ
    ? [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, cx, 1.25, cz, 1]
    : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 1.25, cz, 1],
});
const boite = (p: string, x: number, z: number, w: number, h: number) => [
  surface(`${p}n`, x + w / 2, z, w),
  surface(`${p}s`, x + w / 2, z + h, w),
  surface(`${p}w`, x, z + h / 2, h, true),
  surface(`${p}e`, x + w, z + h / 2, h, true),
];
const meuble = (id: string, category: string, x: number, z: number): ObjectData => ({
  id,
  category,
  width: 0.8,
  height: 0.8,
  depth: 0.8,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.4, z, 1],
});

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  useScanStore.setState({ saves: [], currentSaveId: null });
});

describe('le type de chaque pièce, d’après RoomPlan', () => {
  it('traduit ses cinq types, et se tait sur ce qu’il ne sait pas', () => {
    expect(kindFromRoomPlan('kitchen')).toBe('kitchen');
    expect(kindFromRoomPlan('bathroom')).toBe('bathroom');
    expect(kindFromRoomPlan('bedroom')).toBe('bedroom');
    expect(kindFromRoomPlan('livingRoom')).toBe('living');
    expect(kindFromRoomPlan('diningRoom')).toBe('dining');
    expect(kindFromRoomPlan('unidentified')).toBeNull();
  });

  it('l’emporte sur le mobilier — sauf pour des WC, qu’il ne connaît pas', () => {
    // Une cuisine dont le réfrigérateur n'a pas été détouré, et une table.
    expect(deduireLaPiece(['kitchen'], ['table'])).toBe('kitchen');
    // Une pièce que le mobilier ne nommait pas.
    expect(deduireLaPiece(['bedroom'], [])).toBe('bedroom');
    // Rien de RoomPlan : le mobilier, comme avant.
    expect(deduireLaPiece([], ['bed'])).toBe('bedroom');
    expect(deduireLaPiece(['unidentified'], ['sofa'])).toBe('living');
    // Une cuvette seule dans ce que RoomPlan appelle salle de bains.
    expect(deduireLaPiece(['bathroom'], ['toilet'])).toBe('wc');
    // Un séjour ouvert sur sa cuisine : la plus caractéristique.
    expect(deduireLaPiece(['livingRoom', 'kitchen'], [])).toBe('kitchen');
  });

  it('nomme les pièces du relevé d’après ses sections', () => {
    st().beginScan();
    st().finalize({
      modelPath: '/tmp/scan.usdz',
      // Un logement de 7 × 3 m, coupé d'une cloison à 4 m : deux pièces.
      surfaces: [...boite('a', 0, 0, 7, 3), surface('cloison', 4, 1.5, 3, true)],
      objects: [meuble('o1', 'table', 1, 1)],
      sections: [
        { label: 'diningRoom', x: 2, y: 0, z: 1.5 },
        { label: 'bedroom', x: 5.6, y: 0, z: 1.5 },
      ],
    } as never);
    const noms = st().rooms.map((r) => r.name).sort();
    expect(noms).toEqual(['Chambre', 'Salle à manger']);
    expect(st().rooms.map((r) => r.kind).sort()).toEqual(['bedroom', 'dining']);
  });
});

describe('chaque mur, photographié et redressé', () => {
  const surfaces = boite('a', 0, 0, 4, 3);
  const walls = mergeColinear(splitAtJunctions(weldCorners(surfaces.map((x) => toSegment(x)))));

  it('va au mur qui le porte, sur la face d’où on le voyait, et le couvre', () => {
    // Le mur nord (z = 0), photographié depuis la pièce (les z positifs) :
    // c'est le côté de son axe z, +1.
    const [p] = photosDesMurs([{ wallId: 'an', path: '/tmp/mur.jpg', cote: 1, at: 5 }], surfaces, walls);
    expect(p).toBeDefined();
    const w = walls.find((x) => x.id === p.wallId)!;
    expect(Math.max(Math.abs(w.a.z), Math.abs(w.b.z))).toBeLessThan(0.05);
    expect(p.auto).toBe(true);
    // La photo couvre son mur entier : calage neutre.
    expect(p.calage.dx).toBeCloseTo(0, 3);
    expect(p.calage.k).toBeCloseTo(1, 3);
    // Vue de l'autre côté du même mur, l'autre face.
    const [q] = photosDesMurs([{ wallId: 'an', path: '/tmp/mur2.jpg', cote: -1, at: 6 }], surfaces, walls);
    expect(q.side).toBe(-p.side as 1 | -1);
  });

  it('sur un mur recousu, elle tombe sur sa part exacte', () => {
    // Deux pans relevés, alignés, que le plan réunit en un mur de 4 m.
    const deuxPans = [surface('g', 1, 0, 2), surface('d', 3, 0, 2)];
    const recousu = mergeColinear(deuxPans.map((x) => toSegment(x)));
    expect(recousu).toHaveLength(1);
    const [p] = photosDesMurs([{ wallId: 'g', path: '/tmp/g.jpg', cote: 1, at: 1 }], deuxPans, recousu);
    // La moitié du mur, et du bon côté de la face.
    expect(p.calage.k).toBeCloseTo(0.5, 3);
    expect(Math.abs(p.calage.dx)).toBeCloseTo(0.25, 3);
    // Le cadre de l'élévation la pose exactement sur sa moitié.
    const mur = { w: 400, h: 250 };
    const cadre = cadreDeLaPhoto(mur, { w: 1280, h: 1600 }, p.calage);
    expect(cadre.w).toBeCloseTo(200, 1);
    expect(cadre.h).toBeCloseTo(250, 1);
    expect(cadre.x === 0 || Math.abs(cadre.x - 200) < 1e-6).toBe(true);
  });

  it('arrive avec le relevé, une par face, sans punaise', () => {
    st().beginScan();
    st().finalize({
      modelPath: '/tmp/scan.usdz',
      surfaces,
      objects: [],
      photosMurs: [
        { wallId: 'an', path: '/tmp/n.jpg', cote: 1, at: 1 },
        { wallId: 'ae', path: '/tmp/e.jpg', cote: -1, at: 2 },
      ],
    } as never);
    const auto = st().photos.filter((p) => p.auto);
    expect(auto).toHaveLength(2);
    expect(auto.every((p) => p.side === 1 || p.side === -1)).toBe(true);
    // Et le dossier les garde.
    expect(st().saves[0].photos?.filter((p) => p.auto)).toHaveLength(2);
  });
});

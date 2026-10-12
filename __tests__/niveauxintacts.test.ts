/**
 * UN GESTE SUR UN NIVEAU NE TOUCHE PAS LES AUTRES.
 *
 * Revue « Inès » (maison de ville sur trois niveaux), vérifiée sur le vrai
 * magasin : « Redresser » puis « Redétecter les pièces », et les pièces du
 * premier étage et de la cave disparaissaient — tout se retrouvait au
 * rez-de-chaussée. La redétection nettoyait et cherchait les pièces sur les
 * murs de TOUS les niveaux mélangés, puis renumérotait `room-1…` sans niveau.
 * « Scinder » posait en plus sa cloison sans niveau : au rez-de-chaussée.
 *
 * Revues « Inès » et « Agathe » : « Scanner une pièce » remplaçait toute la
 * maison par le seul relevé natif — douze murs sur trois niveaux avant,
 * quatre au rez-de-chaussée après. Et quand l'iPhone avait oublié les
 * passages de la veille, le plan ne montrait plus que la pièce neuve, les
 * prises des autres pièces entassées sur ses murs.
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

import { RoomScan, type ObjectData, type SurfaceData } from 'react-native-room-scan';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { demarrerComplement } from '../src/native/useRoomScan';
import { niveauDe } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();

/** Un mur tel que RoomPlan le livre. */
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

/** Ce qu'un niveau contient, de quoi comparer avant et après. */
const empreinte = (n: number) => {
  const s = st();
  const murs = s.walls.filter((w) => niveauDe(w) === n);
  const ids = new Set(murs.map((w) => w.id));
  const pieces = s.rooms.filter((r) => niveauDe(r) === n);
  const idsPieces = new Set(pieces.map((r) => r.id));
  return JSON.stringify({
    murs: murs.map((w) => [w.id, w.a, w.b]),
    pieces: pieces.map((r) => [r.id, r.name, [...(r.wallIds ?? [])].sort()]),
    prises: s.fixtures.filter((f) => ids.has(f.wallId)).map((f) => [f.id, f.wallId, f.along]),
    meubles: s.objects.filter((o) => idsPieces.has(o.roomId ?? '')).map((o) => o.id),
    plafond: s.ceiling.filter((c) => idsPieces.has(c.roomId)).map((c) => c.id),
  });
};

const meuble = (id: string, roomId: string, x: number, z: number): ObjectData => ({
  id,
  category: 'storage',
  width: 0.6,
  height: 0.8,
  depth: 0.6,
  roomId,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.4, z, 1],
});

/**
 * La maison d'Inès, dessinée aux cotes : un séjour au rez-de-chaussée, une
 * chambre au premier, une cave — chacun équipé d'une prise, d'un meuble et
 * d'un point lumineux.
 */
function maisonSurTroisNiveaux() {
  st().commencerAuClavier();
  st().addRoomBox(5, 4, 'Séjour');
  st().allerAuNiveau(1);
  st().addRoomBox(5, 4, 'Chambre');
  st().allerAuNiveau(-1);
  st().addRoomBox(4, 3, 'Cave');
  const s = st();
  const fixtures = [];
  const objects = [];
  const ceiling = [];
  for (const n of [0, 1, -1]) {
    const piece = s.rooms.find((r) => niveauDe(r) === n)!;
    const murs = s.walls.filter((w) => (piece.wallIds ?? []).includes(w.id));
    const xs = murs.flatMap((w) => [w.a.x, w.b.x]);
    const zs = murs.flatMap((w) => [w.a.z, w.b.z]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    fixtures.push({ id: `pr${n}`, kind: 'prise' as const, wallId: murs[0].id, along: 1, height: 0.3, side: 1 as const });
    objects.push(meuble(`m${n}`, piece.id, cx, cz));
    ceiling.push({ id: `dcl${n}`, kind: 'dcl' as const, roomId: piece.id, at: { x: cx, z: cz } });
  }
  useScanStore.setState({ fixtures, objects, ceiling });
}

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  useScanStore.setState({ saves: [], currentSaveId: null });
  (RoomScan.start as jest.Mock).mockClear();
  (RoomScan.startAdditional as jest.Mock).mockClear();
});

describe('« Redétecter les pièces » sur une maison à trois niveaux', () => {
  it('ne refait que le niveau affiché : les deux autres restent tels quels', () => {
    maisonSurTroisNiveaux();
    const haut = empreinte(1);
    const cave = empreinte(-1);
    st().allerAuNiveau(0);
    st().redetectRooms();
    expect(empreinte(1)).toBe(haut);
    expect(empreinte(-1)).toBe(cave);
    // Le séjour est toujours là, au rez-de-chaussée, avec sa prise et son meuble.
    const rez = st().rooms.filter((r) => niveauDe(r) === 0);
    expect(rez.map((r) => r.name)).toEqual(['Séjour']);
    expect(st().fixtures).toHaveLength(3);
    expect(st().objects.find((o) => o.id === 'm0')?.roomId).toBe(rez[0].id);
    expect(st().ceiling.find((c) => c.id === 'dcl0')?.roomId).toBe(rez[0].id);
  });

  it('à l’étage, les pièces refaites gardent leur niveau et un identifiant qui le porte', () => {
    maisonSurTroisNiveaux();
    const rez = empreinte(0);
    st().allerAuNiveau(1);
    st().redetectRooms();
    expect(empreinte(0)).toBe(rez);
    const haut = st().rooms.filter((r) => niveauDe(r) === 1);
    expect(haut.map((r) => r.name)).toEqual(['Chambre']);
    // Aucun « room-1 » d'étage qui se confondrait avec celui du rez.
    expect(haut[0].id).toMatch(/^room-1-/);
    expect(st().objects.find((o) => o.id === 'm1')?.roomId).toBe(haut[0].id);
    expect(st().ceiling.find((c) => c.id === 'dcl1')?.roomId).toBe(haut[0].id);
    // Tous les murs de l'étage le sont restés.
    expect(st().walls.filter((w) => niveauDe(w) === 1).length).toBeGreaterThanOrEqual(4);
  });

  it('« Redresser » ne bouge que le niveau affiché', () => {
    maisonSurTroisNiveaux();
    const haut = empreinte(1);
    const cave = empreinte(-1);
    st().allerAuNiveau(0);
    st().straightenPlan();
    expect(empreinte(1)).toBe(haut);
    expect(empreinte(-1)).toBe(cave);
    expect(st().rooms.filter((r) => niveauDe(r) === 0)).toHaveLength(1);
  });

  it('« Scinder » à l’étage pose sa cloison à l’étage, et y laisse deux pièces', () => {
    maisonSurTroisNiveaux();
    const rez = empreinte(0);
    st().allerAuNiveau(1);
    const chambre = st().rooms.find((r) => niveauDe(r) === 1)!;
    const avant = st().walls.length;
    st().splitRoom(chambre.id);
    expect(st().walls.length).toBeGreaterThan(avant);
    // Aucun mur neuf au rez-de-chaussée.
    expect(empreinte(0)).toBe(rez);
    expect(st().rooms.filter((r) => niveauDe(r) === 1)).toHaveLength(2);
  });
});

describe('« Scanner une pièce » sur un dossier à niveaux', () => {
  it('réunit le passage au rez-de-chaussée sans toucher à l’étage', () => {
    st().finalize({ modelPath: '/tmp/a.usdz', surfaces: boite('a', 0, 0, 5, 4), objects: [] });
    st().oublierArrivage();
    st().finalizeEtage({ modelPath: '/tmp/e.usdz', surfaces: boite('c', 0, 0, 5, 4), objects: [] }, 1);
    const haut = empreinte(1);
    st().allerAuNiveau(0);
    st().finalizeMerge({
      modelPath: '/tmp/b.usdz',
      surfaces: [...boite('a', 0, 0, 5, 4), ...boite('b', 5, 0, 3, 4)],
      objects: [],
      passages: 2,
    });
    expect(empreinte(1)).toBe(haut);
    expect(st().rooms.filter((r) => niveauDe(r) === 0).length).toBeGreaterThanOrEqual(2);
    expect(st().rooms.filter((r) => niveauDe(r) === 1).length).toBeGreaterThanOrEqual(1);
  });

  it('quand l’iPhone a oublié les passages, la pièce neuve s’ajoute à côté : rien n’est remplacé', () => {
    st().finalize({ modelPath: '/tmp/a.usdz', surfaces: boite('a', 0, 0, 5, 4), objects: [] });
    st().oublierArrivage();
    const mur = st().walls[0];
    st().addFixture('prise', mur.id, 1);
    const avant = empreinte(0);
    const xMax = Math.max(...st().walls.flatMap((w) => [w.a.x, w.b.x]));
    // Le relevé natif ne rend QUE la pièce du jour, dans son propre repère.
    st().finalizeMerge({
      modelPath: '/tmp/b.usdz',
      surfaces: boite('b', 1, 1, 3, 3),
      objects: [],
      passages: 1,
    });
    const s = st();
    // Tout ce qui était là y est encore, au même endroit.
    const anciens = JSON.parse(avant).murs as [string, unknown, unknown][];
    for (const [id, a, b] of anciens) {
      const w = s.walls.find((x) => x.id === id);
      expect(w && [w.a, w.b]).toEqual([a, b]);
    }
    expect(s.fixtures).toHaveLength(1);
    expect(s.fixtures[0].wallId).toBe(mur.id);
    // La pièce neuve est là, posée À CÔTÉ — pas par-dessus le séjour.
    const neufs = s.walls.filter((w) => !anciens.some(([id]) => id === w.id));
    expect(neufs.length).toBeGreaterThanOrEqual(4);
    expect(Math.min(...neufs.flatMap((w) => [w.a.x, w.b.x]))).toBeGreaterThan(xMax);
    expect(s.rooms.length).toBe(2);
  });

  it('le meuble posé à la main survit au passage réuni', () => {
    st().finalize({ modelPath: '/tmp/a.usdz', surfaces: boite('a', 0, 0, 5, 4), objects: [] });
    st().oublierArrivage();
    const piece = st().rooms[0];
    useScanStore.setState({ objects: [meuble('canape-main', piece.id, 2, 2)] });
    st().finalizeMerge({
      modelPath: '/tmp/b.usdz',
      surfaces: [...boite('a', 0, 0, 5, 4), ...boite('b', 5, 0, 3, 4)],
      objects: [],
      passages: 2,
    });
    expect(st().objects.map((o) => o.id)).toContain('canape-main');
  });

  it('ne reprend les passages de l’iPhone que s’ils sont ceux du plan ouvert', async () => {
    st().finalize({ modelPath: '/tmp/a.usdz', surfaces: boite('a', 0, 0, 5, 4), objects: [] });
    st().oublierArrivage();
    await demarrerComplement();
    expect(RoomScan.startAdditional).toHaveBeenCalledTimes(1);
    expect(RoomScan.start).not.toHaveBeenCalled();
    st().setComplement(false);
    st().setScanning(false);

    // Un autre plan ouvert : les passages de l'iPhone ne sont pas les siens.
    st().commencerAuClavier();
    st().addRoomBox(4, 3, 'Bureau');
    await demarrerComplement();
    expect(RoomScan.startAdditional).toHaveBeenCalledTimes(1);
    expect(RoomScan.start).toHaveBeenCalledTimes(1);
  });

  it('ni ceux d’un étage quand on complète le rez-de-chaussée', async () => {
    st().finalize({ modelPath: '/tmp/a.usdz', surfaces: boite('a', 0, 0, 5, 4), objects: [] });
    st().oublierArrivage();
    st().finalizeEtage({ modelPath: '/tmp/e.usdz', surfaces: boite('c', 0, 0, 5, 4), objects: [] }, 1);
    st().allerAuNiveau(0);
    await demarrerComplement();
    expect(RoomScan.startAdditional).not.toHaveBeenCalled();
    expect(RoomScan.start).toHaveBeenCalledTimes(1);
  });
});

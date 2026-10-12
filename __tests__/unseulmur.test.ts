/**
 * UN SEUL MUR ENTRE DEUX PIÈCES, TOUJOURS.
 *
 * Revues « Sophie » (T3 dessiné à la main) et « Théo » (2 pièces à meubler) :
 * une pièce accolée ou glissée contre une autre posait son mur PAR-DESSUS
 * celui du voisin — quatre doublons en accolé, treize en glissé.
 *
 *   — en 3D, un seul des deux se perçait : 7 ouvertures sur 12 murées ;
 *   — la cote « depuis le coin » se prenait sur le mauvais mur ;
 *   — le contrôle conseillait d'en supprimer un, et le suivre ouvrait sept
 *     pièces sur huit ;
 *   — l'aimant, appliqué à chaque image du glisser, ramenait la pièce à
 *     chaque pas : un glissement lent d'un mètre ne la bougeait pas ;
 *   — une pièce tapée plus large que le mur choisi en prenait la longueur.
 *
 * Et revues « Karim » et « Sophie » : « Décaler » et « Longueur du mur »
 * tordaient les voisins d'un pan coupé ou d'un mur de biais, et faisaient un
 * trapèze de la pièce voisine d'une pièce accolée.
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
import {
  etendueDeLaPiece,
  niveauDe,
  roomParts,
  segLength,
  souderLesRecouvrements,
  type WallSeg,
} from '../src/geometry/floorplan';
import { assignOpenings } from '../src/geometry/scene3d';

const st = () => useScanStore.getState();
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25,
});

/** Deux murs du même niveau, sur la même ligne, qui se recouvrent de plus de 5 cm. */
function doublons(walls: WallSeg[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const p = walls[i];
      const q = walls[j];
      if (p.type !== 'wall' || q.type !== 'wall' || niveauDe(p) !== niveauDe(q)) continue;
      const L = segLength(p);
      const u = { x: (p.b.x - p.a.x) / L, z: (p.b.z - p.a.z) / L };
      const ecart = (r: { x: number; z: number }) => Math.abs((r.x - p.a.x) * u.z - (r.z - p.a.z) * u.x);
      if (ecart(q.a) > 0.03 || ecart(q.b) > 0.03) continue;
      const t = (r: { x: number; z: number }) => (r.x - p.a.x) * u.x + (r.z - p.a.z) * u.z;
      const o = Math.min(L, Math.max(t(q.a), t(q.b))) - Math.max(0, Math.min(t(q.a), t(q.b)));
      if (o > 0.05) out.push([p.id, q.id]);
    }
  }
  return out;
}
const murDe = (cote: 'est' | 'sud', roomName: string) => {
  const r = st().rooms.find((x) => x.name === roomName)!;
  const ws = st().walls.filter((w) => (r.wallIds ?? []).includes(w.id));
  const xs = ws.flatMap((w) => [w.a.x, w.b.x]);
  const zs = ws.flatMap((w) => [w.a.z, w.b.z]);
  return cote === 'est'
    ? ws.find((w) => Math.abs(w.a.x - Math.max(...xs)) < 1e-6 && Math.abs(w.b.x - Math.max(...xs)) < 1e-6)!
    : ws.find((w) => Math.abs(w.a.z - Math.max(...zs)) < 1e-6 && Math.abs(w.b.z - Math.max(...zs)) < 1e-6)!;
};
const surface = (nom: string) => {
  const r = st().rooms.find((x) => x.name === nom)!;
  return roomParts(st().walls, st().rooms).find((p) => p.roomId === r.id)!.surface!;
};

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  useScanStore.setState({ saves: [], currentSaveId: null });
  st().commencerAuClavier();
});

describe('la soudure des recouvrements', () => {
  it('un mur neuf posé sur un mur existant le partage, et garde ce qui dépasse', () => {
    const existant = mur('E', 0, 0, 4, 0);
    const neuf = mur('N', 2, 0, 7, 0);
    const { walls, rooms } = souderLesRecouvrements(
      [existant, neuf],
      [{ id: 'a', wallIds: ['E'] }, { id: 'b', wallIds: ['N'] }],
      new Set(['N']),
    );
    expect(doublons(walls)).toEqual([]);
    expect(walls.reduce((t, w) => t + segLength(w), 0)).toBeCloseTo(7, 9);
    const b = rooms.find((r) => r.id === 'b')!;
    const a = rooms.find((r) => r.id === 'a')!;
    // La part commune est dans les deux contours.
    expect(b.wallIds!.filter((id) => a.wallIds!.includes(id))).toHaveLength(1);
  });
});

describe('une pièce qui touche deux voisines', () => {
  it('partage les deux murs au lieu de les doubler', () => {
    st().addRoomLibre(4, 3, 'Séjour', { auNu: true });
    st().addRoomBox(3, 3, 'Bureau', murDe('est', 'Séjour').id, { auNu: true });
    // Une chambre sous le séjour ET sous le bureau : plus large que le mur choisi.
    st().addRoomBox(7.14, 3, 'Chambre', murDe('sud', 'Séjour').id, { auNu: true });
    expect(doublons(st().walls)).toEqual([]);
    const e = etendueDeLaPiece(surface('Chambre'));
    expect(Math.max(e.width, e.depth)).toBeCloseTo(7.14, 2);
    expect(surface('Séjour').area).toBeCloseTo(12, 6);
  });
});

describe('glisser une pièce contre une autre', () => {
  it('un glissement lent avance vraiment, et le lâcher soude les murs', () => {
    st().addRoomLibre(4, 3, 'Séjour', { auNu: true });
    st().addRoomLibre(3, 3, 'Chambre', { auNu: true });
    const ch = st().rooms.find((r) => r.name === 'Chambre')!;
    const ouest = (() => {
      const ws = st().walls.filter((w) => (ch.wallIds ?? []).includes(w.id));
      const xs = ws.flatMap((w) => [w.a.x, w.b.x]);
      return Math.min(...xs);
    })();
    const est = murDe('est', 'Séjour').a.x;
    const zSejour = Math.min(...st().walls.filter((w) => w.roomId === st().rooms[0].id).flatMap((w) => [w.a.z, w.b.z]));
    const zCh = Math.min(...st().walls.filter((w) => (ch.wallIds ?? []).includes(w.id)).flatMap((w) => [w.a.z, w.b.z]));
    // Vingt petits pas, sans aimant, comme le doigt les envoie.
    const dx = est - ouest + 0.02;
    const dz = zSejour - zCh + 0.015;
    for (let k = 0; k < 20; k++) st().moveRoom(ch.id, dx / 20, dz / 20, false);
    const apres = Math.min(...st().walls.filter((w) => (st().rooms.find((r) => r.id === ch.id)!.wallIds ?? []).includes(w.id)).flatMap((w) => [w.a.x, w.b.x]));
    expect(apres).toBeCloseTo(est + 0.02, 6);
    // Le lâcher : l'aimant (sur les deux axes) et la soudure.
    st().moveRoom(ch.id, 0, 0, true);
    expect(doublons(st().walls)).toEqual([]);
    expect(st().rooms.find((r) => r.id === ch.id)!.wallIds).toContain(murDe('est', 'Séjour').id);
  });
});

describe('le conseil du contrôle sur un mur doublé', () => {
  it('retirer l’un des deux laisse les pièces fermées', () => {
    // Un plan d'avant la soudure : deux pièces, chacune avec son mur au même endroit.
    const a = [mur('a1', 0, 0, 4, 0), mur('a2', 4, 0, 4, 3), mur('a3', 4, 3, 0, 3), mur('a4', 0, 3, 0, 0)];
    const b = [mur('b1', 4, 0, 7, 0), mur('b2', 7, 0, 7, 3), mur('b3', 7, 3, 4, 3), mur('b4', 4, 3, 4, 0)];
    useScanStore.setState({
      walls: [...a, ...b],
      rooms: [
        { id: 'A', name: 'Séjour', floor: null, wallIds: a.map((w) => w.id) },
        { id: 'B', name: 'Chambre', floor: null, wallIds: b.map((w) => w.id) },
      ] as never,
    });
    st().removeWall('b4');
    const parts = roomParts(st().walls, st().rooms);
    expect(parts).toHaveLength(2);
    for (const p of parts) expect(p.surface?.exact).toBe(true);
  });
});

describe('la 3D perce tous les murs confondus', () => {
  it('une porte sur deux murs superposés les ouvre tous les deux', () => {
    const w1 = mur('w1', 0, 0, 4, 0);
    const w2 = { ...mur('w2', 0, 0, 4, 0), roomId: 'autre' };
    const porte = { ...mur('p', 1, 0, 1.83, 0), type: 'door' as const, height: 2.04, yCenter: 1.02 };
    const trous = assignOpenings([w1, w2], [porte], 0);
    expect(trous.get('w1')).toHaveLength(1);
    expect(trous.get('w2')).toHaveLength(1);
  });
});

describe('décaler un mur sans tordre ses voisins', () => {
  const muNu = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({ ...mur(id, ax, az, bx, bz), auNu: true, roomId: 'C' });
  it('le pan coupé recule, les murs voisins restent droits', () => {
    // Cuisine 3,20 × 3,00, angle coupé d'un mètre en haut à droite.
    const pts = [[0, 0], [2.49, 0], [3.2, 0.71], [3.2, 3], [0, 3]];
    const murs = pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length];
      return muNu(`c${i}`, p[0], p[1], q[0], q[1]);
    });
    useScanStore.setState({ walls: murs, rooms: [{ id: 'C', name: 'Cuisine', floor: null, wallIds: murs.map((w) => w.id) }] as never });
    const pan = murs[1];
    const L = segLength(pan);
    const n = { x: (pan.b.z - pan.a.z) / L, z: -(pan.b.x - pan.a.x) / L };
    st().moveWall(pan.id, n.x * 0.1, n.z * 0.1, false);
    const haut = st().walls.find((w) => w.id === 'c0')!;
    const droite = st().walls.find((w) => w.id === 'c2')!;
    expect(Math.abs(haut.a.z - haut.b.z)).toBeLessThan(1e-9);
    expect(Math.abs(droite.a.x - droite.b.x)).toBeLessThan(1e-9);
  });

  it('le fond d’une pièce accolée recule, la voisine reste un rectangle', () => {
    st().addRoomLibre(4.2, 5.1, 'Séjour', { auNu: true });
    st().addRoomBox(5.1, 3, 'Cuisine', murDe('est', 'Séjour').id, { auNu: true });
    const avant = surface('Séjour').area;
    // Le mur de la cuisine qui prolonge le mur sud du séjour remonte de 2,10 m.
    const cuisine = st().rooms.find((r) => r.name === 'Cuisine')!;
    const ws = st().walls.filter((w) => (cuisine.wallIds ?? []).includes(w.id));
    const zMax = Math.max(...ws.flatMap((w) => [w.a.z, w.b.z]));
    const fond = ws.find((w) => Math.abs(w.a.z - zMax) < 1e-6 && Math.abs(w.b.z - zMax) < 1e-6)!;
    st().moveWall(fond.id, 0, -2.1, false);
    expect(surface('Séjour').area).toBeCloseTo(avant, 6);
    expect(surface('Séjour').exact).toBe(true);
  });
});

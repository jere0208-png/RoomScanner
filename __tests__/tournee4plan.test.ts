/**
 * TOURNÉE N°4 — CE QUI FAISAIT PERDRE UNE PIÈCE, OU FAUSSAIT UN TOTAL.
 *
 * - « Hugo » : une chambre accolée au couloir le dépasse d'une épaisseur de
 *   mur ; « Redétecter », « Scinder » ou « Couper » la perdaient (9 pièces
 *   devenaient 5).
 * - « Inès » : une salle de bains qui dépasse le séjour de 1 à 4 cm ouvrait
 *   son contour (4,37 m² « ≈ » au lieu de 3,80).
 * - « Sébastien » : derrière un mur de 15 à 30 cm relevé sur ses deux
 *   faces, la chambre disparaissait.
 * - « Mehdi » : le devis d'un R+1 rangeait l'appareillage de l'étage dans les
 *   pièces du rez-de-chaussée.
 * - « Fatou » et « Claire » : le métré du PDF et du tableur se prenait à
 *   l'axe des murs.
 * - « Yasmine » : un meuble lâché un peu au-delà d'une façade se posait
 *   dehors, collé au mur (8 lâchers sur 19).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { act } from 'react-test-renderer';
import { useScanStore } from '../src/store/scanStore';
import {
  fusionnerMursDoubles,
  perimetreDesPieces,
  roomParts,
  segLength,
  totalArea,
  type WallSeg,
} from '../src/geometry/floorplan';
import { placerAuxNiveaux } from '../src/geometry/devisplan';
import { catalogItem } from '../src/geometry/catalogue';
import { pointInPolygon } from '../src/geometry/appearance';
import type { SurfaceData } from 'react-native-room-scan';

const st = () => useScanStore.getState();
const total = () => totalArea(roomParts(st().walls, st().rooms))?.area ?? NaN;

/** Le mur d'un côté de la boîte d'une pièce (N : z min, S : z max, E : x max). */
function murCote(roomId: string, cote: 'N' | 'S' | 'E', libre = false): WallSeg {
  const r = st().rooms.find((x) => x.id === roomId)!;
  const ws = st().walls.filter((w) => (r.wallIds ?? []).includes(w.id));
  const xs = ws.flatMap((w) => [w.a.x, w.b.x]);
  const zs = ws.flatMap((w) => [w.a.z, w.b.z]);
  const ok = (w: WallSeg) =>
    cote === 'N'
      ? Math.abs(w.a.z - Math.min(...zs)) < 1e-3 && Math.abs(w.b.z - Math.min(...zs)) < 1e-3
      : cote === 'S'
        ? Math.abs(w.a.z - Math.max(...zs)) < 1e-3 && Math.abs(w.b.z - Math.max(...zs)) < 1e-3
        : Math.abs(w.a.x - Math.max(...xs)) < 1e-3 && Math.abs(w.b.x - Math.max(...xs)) < 1e-3;
  const partage = (w: WallSeg) => st().rooms.some((x) => x.id !== roomId && (x.wallIds ?? []).includes(w.id));
  return ws
    .filter(ok)
    .filter((w) => !libre || !partage(w))
    .sort((a, b) => segLength(b) - segLength(a))[0];
}

describe('une chambre qui dépasse le couloir d’une épaisseur de mur', () => {
  const coloc = () => {
    st().reset();
    st().commencerAuClavier();
    const add = (l: number, p: number, nom: string, murId?: string) => {
      const id = murId
        ? st().addRoomBox(l, p, nom, murId, { auNu: true })
        : st().addRoomLibre(l, p, nom, { auNu: true });
      if (id) st().arreterPiece(id);
      return id!;
    };
    const couloir = add(6.6, 1.4, 'Couloir');
    add(3.6, 3.4, 'Léa', murCote(couloir, 'N', true).id);
    add(3.0, 3.4, 'Hugo', murCote(couloir, 'N', true).id);
  };

  it('survit à « Redétecter », à « Redresser » et à « Scinder »', () => {
    coloc();
    expect(st().rooms).toHaveLength(3);
    expect(total()).toBeCloseTo(31.68, 2);
    st().redetectRooms();
    expect(st().rooms.map((r) => r.name).sort()).toEqual(['Couloir', 'Hugo', 'Léa']);
    expect(total()).toBeCloseTo(31.68, 2);
    st().undo();
    st().straightenPlan();
    expect(st().rooms).toHaveLength(3);
    st().undo();
    st().splitRoom(st().rooms.find((r) => r.name === 'Léa')!.id);
    expect(st().rooms).toHaveLength(4);
    expect(total()).toBeLessThan(31.68);
    expect(total()).toBeGreaterThan(31.68 - 0.5);
  });
});

describe('une salle de bains qui dépasse le séjour d’un rien', () => {
  it.each([1.87, 1.88, 1.9, 1.95])('2,00 × %s reste fermée, avant et après « Redétecter »', (prof) => {
    st().reset();
    st().commencerAuClavier();
    const sej = st().addRoomLibre(4.1, 5.2, 'Séjour', { auNu: true })!;
    const ch = st().addRoomBox(3.2, 3.4, 'Chambre', murCote(sej, 'E').id, { auNu: true })!;
    const sdb = st().addRoomBox(2.0, prof, 'SdB', murCote(ch, 'S').id, { auNu: true })!;
    const surface = () => {
      const r = st().rooms.find((x) => x.name === 'SdB') ?? st().rooms.find((x) => x.id === sdb)!;
      return roomParts(st().walls, st().rooms).find((p) => p.roomId === r.id)!.surface!;
    };
    expect(surface().exact).toBe(true);
    expect(surface().area).toBeCloseTo(2 * prof, 3);
    st().redetectRooms();
    expect(surface().exact).toBe(true);
    expect(surface().area).toBeCloseTo(2 * prof, 3);
  });
});

describe('un mur épais relevé de ses deux côtés', () => {
  let k = 0;
  const surf = (type: 'wall' | 'door', a: { x: number; z: number }, b: { x: number; z: number }, h: number): SurfaceData => {
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / L;
    const uz = (b.z - a.z) / L;
    k += 1;
    return {
      id: `${String(k).padStart(8, '0')}-AAAA-4BBB-8CCC-${String(k).padStart(12, '0')}`,
      type,
      length: L,
      height: h,
      confidence: 'high',
      category: type === 'door' ? 'door(isOpen: false)' : type,
      transform: [ux, 0, uz, 0, 0, 1, 0, 0, -uz, 0, ux, 0, (a.x + b.x) / 2, h / 2, (a.z + b.z) / 2, 1],
    } as SurfaceData;
  };
  // Une chambre de 4 × 5 et un garage de 3 × 6, le mur commun de `ep`.
  const releve = (ep: number) =>
    ({
      modelPath: '/tmp/x.usdz',
      surfaces: [
        surf('wall', { x: 0, z: 0 }, { x: 4, z: 0 }, 2.5),
        surf('wall', { x: 0, z: 0 }, { x: 0, z: 5 }, 2.5),
        surf('wall', { x: 0, z: 5 }, { x: 4, z: 5 }, 2.5),
        surf('wall', { x: 4, z: 0 }, { x: 4, z: 5 }, 2.5),
        surf('wall', { x: 4 + ep, z: 0 }, { x: 4 + ep, z: 6 }, 2.4),
        surf('wall', { x: 4 + ep, z: 0 }, { x: 7 + ep, z: 0 }, 2.4),
        surf('wall', { x: 7 + ep, z: 0 }, { x: 7 + ep, z: 6 }, 2.4),
        surf('wall', { x: 4 + ep, z: 6 }, { x: 7 + ep, z: 6 }, 2.4),
        surf('door', { x: 4, z: 2 }, { x: 4, z: 2.8 }, 2.04),
      ],
      objects: [],
    }) as never;

  it.each([0.15, 0.2, 0.3])('à %s m, les deux pièces restent, à leurs m² du laser', (ep) => {
    st().reset();
    act(() => st().finalize(releve(ep)));
    const aires = roomParts(st().walls, st().rooms)
      .map((p) => p.surface?.area ?? 0)
      .sort((a, b) => b - a);
    expect(aires).toHaveLength(2);
    expect(aires[0]).toBeCloseTo(20, 2);
    expect(aires[1]).toBeCloseTo(18, 2);
  });

  it('le mur se pose sur l’axe des deux faces, épais de leur écart', () => {
    const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
      id,
      type: 'wall',
      a: { x: ax, z: az },
      b: { x: bx, z: bz },
      height: 2.5,
      yCenter: 1.25,
    });
    const out = fusionnerMursDoubles([
      mur('face-garage', 4.2, 0, 4.2, 6),
      mur('face-chambre', 4, 0, 4, 5),
      mur('haut-chambre', 0, 0, 4, 0),
    ]);
    const fusion = out.find((w) => w.id === 'face-garage')!;
    expect(fusion.a.x).toBeCloseTo(4.1, 9);
    expect(fusion.epaisseur).toBeCloseTo(0.2, 9);
    expect(fusion.deuxFaces).toBe(true);
    // Le mur qui s'arrêtait sur une face vient jusqu'à l'axe.
    expect(out.find((w) => w.id === 'haut-chambre')!.b.x).toBeCloseTo(4.1, 9);
  });
});

describe('le devis d’une maison à étage', () => {
  it('range chaque appareil dans une pièce de son niveau', () => {
    st().reset();
    st().commencerAuClavier();
    st().addRoomLibre(4, 3, 'Séjour', { auNu: true });
    st().allerAuNiveau(1);
    st().addRoomLibre(4, 3, 'Chambre', { auNu: true });
    const chambre = st().rooms.find((r) => r.name === 'Chambre')!;
    const murEtage = st().walls.find((w) => (chambre.wallIds ?? []).includes(w.id))!;
    const id = st().addFixture('prise', murEtage.id)!;
    const { placement } = placerAuxNiveaux(st().walls, st().rooms, st().fixtures);
    // Superposée au séjour, la chambre garde sa prise.
    expect(placement.get(id)).toBe(chambre.id);
  });
});

describe('le métré au nu des murs', () => {
  it('le tour d’une pièce dessinée se prend à l’intérieur', () => {
    st().reset();
    st().commencerAuClavier();
    st().addRoomLibre(4, 3, 'Chambre', { auNu: true });
    expect(perimetreDesPieces(roomParts(st().walls, st().rooms))).toBeCloseTo(14, 6);
  });
});

describe('un meuble lâché au-delà d’une façade', () => {
  it.each([0, -0.05, -0.1, -0.2])('revient dans sa pièce, contre le mur (lâché à x = %s)', (x) => {
    st().reset();
    st().commencerAuClavier();
    st().addRoomLibre(6, 4, 'Séjour', { auNu: true });
    const part = roomParts(st().walls, st().rooms)[0];
    const item = catalogItem('biblio')!;
    const id = st().addObject(item, part.labelAt.x, part.labelAt.z);
    st().rotateObject(id, 1);
    // Glissé vers le mur de gauche, puis lâché au-delà.
    st().setObjectCenter(id, 0.3, 2, true);
    st().rangerMeuble(id, 0.3, 2);
    st().setObjectCenter(id, x, 2, true);
    st().rangerMeuble(id, x, 2);
    const o = st().objects.find((m) => m.id === id)!;
    expect(pointInPolygon({ x: o.transform[12], z: o.transform[14] }, part.surface!.pts)).toBe(true);
    expect(o.transform[14]).toBeCloseTo(2, 6);
  });
});

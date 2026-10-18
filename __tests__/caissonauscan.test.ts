/**
 * LA FIN DU SCAN POSE LE CAISSON SOUS PLAFOND — diagnostic du patron : « le
 * coffre en haut du mur ne se détecte pas au scan ». RoomPlan arrête le mur
 * sous le caisson (2,40) ; la carte du plafond, elle, l'a vu : 2,40 sur les
 * 50 premiers centimètres le long du mur nord, 2,80 au-delà.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import type { SurfaceData, VolumeReleve } from 'react-native-room-scan';
import { useScanStore } from '../src/store/scanStore';
import { empriseDuCaisson, estUnCaisson } from '../src/geometry/caisson';

const surface = (id: string, cx: number, cz: number, length: number, alongZ = false, height = 2.4): SurfaceData => ({
  id,
  type: 'wall',
  length,
  height,
  transform: alongZ
    ? [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, cx, height / 2, cz, 1]
    : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, height / 2, cz, 1],
});

/** La carte du plafond d'une pièce de 4 × 3, carreau par carreau (moyenne sur sa surface). */
function carte(h: (x: number, z: number) => number): VolumeReleve {
  const pas = 0.25;
  const cols = 16;
  const rows = 12;
  const plafond: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let s = 0;
      for (let i = 0; i < 5; i++) for (let k = 0; k < 5; k++) s += h((c + (i + 0.5) / 5) * pas, (r + (k + 0.5) / 5) * pas);
      plafond.push(Math.round((s / 25) * 100));
    }
  }
  return { sol: 0, pas, minX: 0, minZ: 0, cols, rows, plafond };
}

const scanner = (volume: VolumeReleve) =>
  useScanStore.getState().finalize({
    modelPath: '',
    surfaces: [surface('n', 2, 0, 4), surface('s', 2, 3, 4), surface('o', 0, 1.5, 3, true), surface('e', 4, 1.5, 3, true)],
    objects: [],
    maillage: { ancres: 1, faces: 1, sommets: 3, classe: true, volume },
  });

describe('le caisson sous plafond, à la fin du scan', () => {
  it('se pose contre le mur nord, collé au plafond, et ne fait pas de la pièce un rampant', () => {
    scanner(carte((_x, z) => (z < 0.5 ? 2.4 : 2.8)));
    const st = useScanStore.getState();
    const caissons = st.objects.filter(estUnCaisson);
    expect(caissons).toHaveLength(1);
    const c = caissons[0];
    expect(c.width).toBeCloseTo(4, 1);
    expect(c.depth).toBeCloseTo(0.5, 1);
    expect(c.height).toBeCloseTo(0.4, 2);
    // Son dessus au plafond (2,80 au-dessus du sol du scan, à 0).
    expect(c.transform[13] + c.height / 2).toBeCloseTo(2.8, 2);
    const zs = empriseDuCaisson(c).map((p) => p.z);
    expect(Math.min(...zs)).toBeCloseTo(0, 1);
    // Il appartient à la pièce, et la pièce garde un plafond plat à 2,80.
    expect(c.roomId).toBe(st.rooms[0].id);
    const plafond = st.rooms[0].releve?.plafond;
    expect(plafond?.rampant).toBe(false);
    expect(plafond?.hMin).toBeCloseTo(2.8, 1);
    // Enregistré avec le plan.
    expect(st.saves[0].objects?.some(estUnCaisson)).toBe(true);
  });

  it('un plafond plat ne pose aucun caisson', () => {
    scanner(carte(() => 2.5));
    expect(useScanStore.getState().objects.filter(estUnCaisson)).toEqual([]);
  });
});

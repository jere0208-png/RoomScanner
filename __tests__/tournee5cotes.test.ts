/**
 * TOURNÉE N°5 — LES COTES D'UN PLAN SCANNÉ, AU NU.
 *
 * - « Hélène » : le refend vu de ses deux faces est posé sur son axe ; la
 *   façade qui le rejoint se cotait jusqu'à cet axe (6,01 m pour 5,80 au
 *   métré).
 * - « Léon », « Malik » : « (à vérifier) » débordait de sa case sur la page
 *   de garde ; la surface au sol d'un logement à une pièce ouverte s'écrivait
 *   sans « ≈ ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SurfaceData } from 'react-native-room-scan';
import { longueurCotee, roomParts } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';

const st = () => useScanStore.getState();
let n = 0;
function surface(type: string, s: [number, number, number, number], h = 2.5): SurfaceData {
  const [ax, az, bx, bz] = s;
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L;
  const uz = (bz - az) / L;
  return {
    id: `${type}-ak-${++n}`,
    type,
    length: L,
    height: h,
    confidence: 'high',
    category: type === 'door' ? 'door(isOpen: false)' : type,
    transform: [ux, 0, uz, 0, 0, 1, 0, 0, -uz, 0, ux, 0, (ax + bx) / 2, -1.3 + h / 2, (az + bz) / 2, 1],
  } as unknown as SurfaceData;
}

describe('la cote d’une façade qui rejoint un refend vu des deux faces', () => {
  it('se prend au nu du refend, comme le métré', () => {
    useScanStore.setState({ walls: [], openings: [], objects: [], rooms: [], fixtures: [], ceiling: [], saves: [], niveauCourant: 0 } as never);
    // Deux pièces de part et d'autre d'un refend de 20 cm (faces x = 4 et 4,2).
    st().finalize({
      modelPath: '',
      surfaces: [
        surface('wall', [0, 0, 4, 0]),
        surface('wall', [4.2, 0, 8.2, 0]),
        surface('wall', [8.2, 0, 8.2, 3]),
        surface('wall', [8.2, 3, 4.2, 3]),
        surface('wall', [4, 3, 0, 3]),
        surface('wall', [0, 3, 0, 0]),
        surface('wall', [4, 0, 4, 3]),
        surface('wall', [4.2, 3, 4.2, 0]),
        surface('door', [4, 1, 4, 1.83], 2.05),
        surface('door', [4.2, 1, 4.2, 1.83], 2.05),
      ],
      objects: [],
    } as never);
    const s = st();
    const parts = roomParts(s.walls, s.rooms);
    expect(parts.filter((p) => p.surface?.exact)).toHaveLength(2);
    // La façade nord de la pièce ouest : de x = 0 à la face du refend, x = 4.
    const facade = s.walls.find(
      (w) => !w.deuxFaces && Math.abs(w.a.z) < 0.05 && Math.abs(w.b.z) < 0.05 && Math.min(w.a.x, w.b.x) < 0.5,
    )!;
    expect(longueurCotee(s.walls, facade, parts)).toBeCloseTo(4, 2);
  });
});

describe('la page de garde', () => {
  const pdf = readFileSync(join(__dirname, '..', 'src', 'export', 'pdf.ts'), 'utf8');

  it('dit « à vérifier » dans l’intitulé de la case, pas dans le chiffre', () => {
    expect(pdf).toContain("aVerifier > 0 ? 'Habitable estimée · à vérifier' : 'Habitable estimée'");
    expect(pdf).not.toContain("' (à vérifier)'");
  });

  it('approche la surface au sol quand une pièce reste ouverte', () => {
    expect(pdf).toContain("['Surface au sol', `${toutFerme ? '' : '≈ '}${fr1(sol)} m²`]");
  });
});

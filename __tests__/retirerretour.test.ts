/**
 * UN RETOUR DE MUR SE RETIRE, ET LUI SEUL.
 *
 * Diagnostic du patron : « impossible de supprimer un retour de mur ». Le
 * bandeau du retour offrait la hauteur, le mur entier, une ouverture, la
 * vue de face — rien pour l'enlever. Et passer par « Mur entier » puis
 * « Retirer » emportait le mur, sa porte et ses prises.
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

import * as fs from 'fs';
import * as path from 'path';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  auNu: true,
});

beforeEach(() => {
  mockMagasin.clear();
  useScanStore.setState({
    saves: [],
    currentSaveId: null,
    dirty: false,
    // Un mur de 4 m, une porte de 0,90 entre 1,00 et 1,90 : deux retours,
    // 0 → 1,00 et 1,90 → 4,00.
    walls: [mur('m', 0, 0, 4, 0), mur('g', 0, 0, 0, 3), mur('d', 4, 0, 4, 3), mur('s', 0, 3, 4, 3)],
    openings: [{ id: 'p', type: 'door', a: { x: 1, z: 0 }, b: { x: 1.9, z: 0 }, height: 2.04, yCenter: 1.02 }],
    rooms: [{ id: 'r', name: 'Séjour', wallIds: ['m', 'g', 'd', 's'] }],
    fixtures: [
      { id: 'f1', kind: 'prise', wallId: 'm', along: 0.5, height: 0.3, side: 1 },
      { id: 'f2', kind: 'prise', wallId: 'm', along: 3, height: 0.3, side: 1 },
    ],
    ceiling: [],
  });
});

describe('retirer un retour', () => {
  it('le premier retour part ; la porte, le reste du mur et la prise d’après restent', () => {
    st().retirerUnRetour('m', 0, 0.25);
    const restes = st().walls.filter((w) => Math.abs(w.a.z) < 1e-9 && Math.abs(w.b.z) < 1e-9);
    expect(restes).toHaveLength(1);
    expect(restes[0].a.x).toBeCloseTo(1, 6);
    expect(restes[0].b.x).toBeCloseTo(4, 6);
    expect(st().openings.map((o) => o.id)).toEqual(['p']);
    // La prise posée sur le retour part ; celle d'après suit son morceau.
    expect(st().fixtures.map((f) => f.id)).toEqual(['f2']);
    expect(st().fixtures[0].wallId).toBe(restes[0].id);
    expect(st().fixtures[0].along).toBeCloseTo(2, 6);
  });

  it('un retour au milieu coupe le mur en deux, et la pièce garde les deux morceaux', () => {
    st().retirerUnRetour('m', 0.5, 0.6);
    const morceaux = st().walls.filter((w) => Math.abs(w.a.z) < 1e-9 && Math.abs(w.b.z) < 1e-9);
    expect(morceaux).toHaveLength(2);
    const ids = morceaux.map((w) => w.id);
    expect(ids).toContain('m');
    for (const id of ids) expect(st().rooms[0].wallIds).toContain(id);
    // La prise à 3 m est passée sur le morceau d'après, à 0,60 m de son départ.
    const f2 = st().fixtures.find((f) => f.id === 'f2')!;
    expect(f2.wallId).not.toBe('m');
    expect(f2.along).toBeCloseTo(0.6, 6);
  });

  it('« Annuler » rend le retour', () => {
    st().retirerUnRetour('m', 0, 0.25);
    st().undo();
    const m = st().walls.find((w) => w.id === 'm')!;
    expect(m.a.x).toBeCloseTo(0, 6);
    expect(m.b.x).toBeCloseTo(4, 6);
    expect(st().fixtures).toHaveLength(2);
  });

  it('le bandeau du retour offre « Retirer »', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'), 'utf8');
    const bandeau = src.slice(src.indexOf('`retour · ${fr(mur.height, 2)}'), src.indexOf("{vue === '2d' && mesurant"));
    expect(bandeau).toContain("useScanStore.getState().retirerUnRetour(mur.id, pier.t0, pier.t1)");
    expect(bandeau).toContain("label: 'Retirer'");
  });
});

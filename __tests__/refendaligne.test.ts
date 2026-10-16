/**
 * CORRIGER UNE COTE NE TORD PAS LA PIÈCE VOISINE — revue « Nadia », métreuse.
 *
 * Sur l'exemple, une cote tapée au mur nord du séjour ne poussait que le
 * premier tronçon du refend (de z 0 à 3,60) : le suivant partait en oblique
 * de (4,93 ; 3,60) à (5,00 ; 4,20), la chambre s'élargissait en trapèze et un
 * bout de mur de 7 cm naissait au pied. Toute la ligne du refend se décale.
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
import { longueurCotee, roomParts, segLength } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();
const proche = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);
const nordDuSejour = () => st().walls.find((w) => w.id === 'nord')!;

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  st().ouvrirExemple();
});

describe('4,80 tapé au mur nord du séjour', () => {
  beforeEach(() => {
    const murs = st().walls;
    const parts = roomParts(murs, st().rooms);
    // La cote affichée est l'intérieure : 4,93.
    proche(longueurCotee(murs, nordDuSejour(), parts), 4.93);
    st().setWallLength('nord', 4.8, { auNu: false });
  });

  it('décale tout le refend, de la façade nord à la façade sud', () => {
    const refend = st().walls.filter((w) => w.id === 'refend' || w.id.startsWith('refend#'));
    expect(refend).toHaveLength(3);
    for (const w of refend) {
      proche(w.a.x, 4.87);
      proche(w.b.x, 4.87);
    }
  });

  it('ne crée ni oblique ni bout de mur', () => {
    for (const w of st().walls) {
      const dx = Math.abs(w.b.x - w.a.x);
      const dz = Math.abs(w.b.z - w.a.z);
      // D'équerre : horizontal ou vertical.
      expect(Math.min(dx, dz)).toBeLessThan(1e-6);
      expect(segLength(w)).toBeGreaterThan(0.2);
    }
    expect(st().walls).toHaveLength(16);
  });

  it('lit la cote tapée sur la cote affichée, et la chambre reste un rectangle', () => {
    const murs = st().walls;
    const parts = roomParts(murs, st().rooms);
    proche(longueurCotee(murs, nordDuSejour(), parts), 4.8);
    const chambre = parts.find((p) => p.roomId === st().rooms.find((r) => r.name === 'Chambre')!.id)!;
    proche(chambre.surface!.area, (8 - 4.87 - 0.07) * 3.53);
    // Les portes du refend ont suivi.
    for (const id of ['porte-chambre', 'porte-sde']) {
      const o = st().openings.find((x) => x.id === id)!;
      proche(o.a.x, 4.87);
      proche(o.b.x, 4.87);
    }
  });

  it('s’annule d’un seul geste', () => {
    st().undo();
    for (const w of st().walls.filter((x) => x.id.startsWith('refend'))) proche(w.a.x, 5);
  });
});

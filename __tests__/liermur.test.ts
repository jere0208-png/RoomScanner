/**
 * LIER UN APPAREIL MURAL À SA COMMANDE.
 *
 * Relevé du patron : « enlève le bouton copier, remplace-le par un bouton
 * lien... prise ou éclairage mural. Mais ça ne doit pas être possible pour
 * le courant faible. » Ce banc remplace celui du copier de mur, dont le
 * geste a vécu avec son bouton.
 *
 * Ce qui est fixé :
 * - la table de ce qui SE COMMANDE : prises 16 A et applique, oui ;
 *   courant faible, circuits spécialisés, commandes elles-mêmes, non ;
 * - le magasin noue et dénoue le lien du même geste, comme au plafond ;
 * - et il refuse de lier ce qui ne se commande pas, quel que soit le
 *   chemin qui le lui demande.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { seCommande } from '../src/geometry/electrical';
import { useScanStore } from '../src/store/scanStore';
import type { Fixture } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());
beforeEach(() => jest.advanceTimersByTime(2000));

const MUR: WallSeg = {
  id: 'n',
  type: 'wall',
  a: { x: 0, z: 0 },
  b: { x: 5, z: 0 },
  height: 2.5,
  yCenter: 1.25,
};

const fx = (id: string, kind: Fixture['kind'], along = 1): Fixture => ({
  id,
  kind,
  wallId: 'n',
  along,
  height: 0.25,
  side: 1,
});

describe('ce qui se commande', () => {
  it('prises 16 A et applique, oui — le reste, non', () => {
    expect(seCommande('prise')).toBe(true);
    expect(seCommande('prise2')).toBe(true);
    expect(seCommande('prise3')).toBe(true);
    expect(seCommande('applique')).toBe(true);
    // Courant faible : rien à allumer, mixtes compris.
    expect(seCommande('rj45')).toBe(false);
    expect(seCommande('tv')).toBe(false);
    expect(seCommande('rjPrise')).toBe(false);
    expect(seCommande('tvPrise')).toBe(false);
    // Circuits spécialisés : un lave-linge ne se commande pas du couloir.
    expect(seCommande('prise20')).toBe(false);
    expect(seCommande('prise32')).toBe(false);
    // Une commande ne se commande pas elle-même, un tableau non plus.
    expect(seCommande('inter')).toBe(false);
    expect(seCommande('tableau')).toBe(false);
  });
});

describe('le magasin', () => {
  it('noue et dénoue le lien du même geste, comme au plafond', () => {
    useScanStore.setState({
      walls: [MUR],
      fixtures: [fx('ap1', 'applique', 2), fx('i1', 'inter', 3)],
    });
    useScanStore.getState().toggleFixtureCommand('ap1', 'i1');
    let ap = useScanStore.getState().fixtures.find((f) => f.id === 'ap1')!;
    expect(ap.commands).toEqual(['i1']);
    useScanStore.getState().toggleFixtureCommand('ap1', 'i1');
    ap = useScanStore.getState().fixtures.find((f) => f.id === 'ap1')!;
    expect(ap.commands ?? []).toEqual([]);
  });

  it('refuse de lier le courant faible, quel que soit le chemin', () => {
    useScanStore.setState({
      walls: [MUR],
      fixtures: [fx('rj', 'rj45', 2), fx('i1', 'inter', 3)],
    });
    useScanStore.getState().toggleFixtureCommand('rj', 'i1');
    const rj = useScanStore.getState().fixtures.find((f) => f.id === 'rj')!;
    expect(rj.commands ?? []).toEqual([]);
  });

  it('refuse une commande qui n’en est pas une : une prise n’allume rien', () => {
    useScanStore.setState({
      walls: [MUR],
      fixtures: [fx('ap1', 'applique', 2), fx('p1', 'prise', 3)],
    });
    useScanStore.getState().toggleFixtureCommand('ap1', 'p1');
    const ap = useScanStore.getState().fixtures.find((f) => f.id === 'ap1')!;
    expect(ap.commands ?? []).toEqual([]);
  });
});

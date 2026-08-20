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

/**
 * LE LIEN S'IMPRIME SOUS LES SYMBOLES — le tour de l'application l'a
 * montré : le filet mural du PDF se dessinait APRÈS l'appareillage, donc
 * PAR-DESSUS les plaques, à rebours de la convention écrite trois lignes
 * plus bas pour le plafond (« les liens d'abord »). Un flux PDF est
 * séquentiel : ce qui s'imprime d'abord apparaît d'abord.
 */
describe('le lien sur le papier', () => {
  it('passe sous les symboles : son tireté precede leurs sigles', () => {
    const { buildScanPdf } = require('../src/export/pdf');
    const walls = [
      MUR,
      { ...MUR, id: 'e', a: { x: 5, z: 0 }, b: { x: 5, z: 4 } },
      { ...MUR, id: 's', a: { x: 5, z: 4 }, b: { x: 0, z: 4 } },
      { ...MUR, id: 'w', a: { x: 0, z: 4 }, b: { x: 0, z: 0 } },
    ];
    const bytes = buildScanPdf(
      {
        name: 'Lien test',
        walls,
        openings: [],
        objects: [],
        rooms: [{ id: 'r1', name: 'Séjour', wallIds: walls.map((w) => w.id) }],
        fixtures: [
          { ...fx('ap1', 'applique', 1), height: 1.8, commands: ['i1'] },
          { ...fx('i1', 'inter', 3), height: 1.1 },
          // Le témoin : son sigle « RJ » marque le bloc des symboles.
          fx('rj', 'rj45', 4),
        ],
        photos: [],
      },
      false,
      { metre: false },
    );
    let src = '';
    for (let i = 0; i < bytes.length; i++) src += String.fromCharCode(bytes[i]);
    const lien = src.indexOf('[1.6 3]');
    const sigle = src.indexOf('(RJ');
    expect(lien).toBeGreaterThanOrEqual(0);
    expect(sigle).toBeGreaterThanOrEqual(0);
    expect(lien).toBeLessThan(sigle);
  });
});

/**
 * LES CAPTEURS DU MODE DIAGNOSTIC — branches, debranches, et surs.
 *
 * Trois choses a tenir : un changement du plan se note, le JETON ne se
 * journalise JAMAIS, et une fois debranche, plus rien ne se note (un capteur
 * qui survivrait a l'arret serait une fuite).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('../src/native/account', () => ({
  acheterAbonnement: jest.fn(async () => true),
  restaurerAbonnement: jest.fn(async () => false),
  connexionApple: jest.fn(async () => null),
  lireMarqueur: jest.fn(async () => null),
  ecrireMarqueur: jest.fn(async () => {}),
  produitsPro: jest.fn(async () => []),
  ouvrirCodeOffre: jest.fn(async () => true),
  echeanceAbonnement: jest.fn(async () => null),
}));

import { brancher, debrancher, estBranche, valeurSure } from '../src/diagnostic/capteurs';
import { tamponBrut, viderJournal } from '../src/diagnostic/journal';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string): WallSeg =>
  ({ id, ax: 0, az: 0, bx: 1, bz: 0, height: 2.5 }) as unknown as WallSeg;

beforeEach(() => {
  debrancher();
  viderJournal();
});
afterEach(() => debrancher());

describe('valeurSure — ni jeton ni e-mail', () => {
  it('masque une adresse e-mail', () => {
    expect(valeurSure('jean.dupont@example.com')).toBe('[e-mail masqué]');
  });
  it('masque un jeton (longue chaine sans espace)', () => {
    expect(valeurSure('a'.repeat(64))).toBe('[masqué]');
  });
  it('laisse passer un nombre et une courte chaine', () => {
    expect(valeurSure(42)).toBe(42);
    expect(valeurSure('home')).toBe('home');
  });
  it('rend la longueur d’un tableau, pas son contenu', () => {
    expect(valeurSure([1, 2, 3])).toEqual({ longueur: 3 });
  });
});

describe('les capteurs branches', () => {
  it('notent un changement du plan', () => {
    brancher();
    const avant = tamponBrut().length;
    useScanStore.setState({ walls: [mur('m1'), mur('m2')] });
    const plan = tamponBrut().filter((e) => e.type === 'plan');
    expect(plan.length).toBeGreaterThan(0);
    expect(plan[plan.length - 1].donnees).toMatchObject({ walls: 2 });
    expect(tamponBrut().length).toBeGreaterThan(avant);
  });

  it('ne journalisent jamais une valeur qui ressemble a un jeton', () => {
    brancher();
    // Un nom de scan contenant une adresse : il doit ressortir masque.
    useScanStore.setState({ scanName: 'contact chez a@b.fr' });
    const brut = JSON.stringify(tamponBrut());
    expect(brut).not.toContain('a@b.fr');
    expect(brut).toContain('[e-mail masqué]');
  });
});

describe('les capteurs debranches', () => {
  it('ne notent plus rien, et rendent la console', () => {
    const warnAvant = console.warn;
    brancher();
    expect(estBranche()).toBe(true);
    debrancher();
    expect(estBranche()).toBe(false);
    // La console a retrouve son original.
    expect(console.warn).toBe(warnAvant);
    viderJournal();
    useScanStore.setState({ walls: [mur('z')] });
    expect(tamponBrut()).toHaveLength(0);
  });
});

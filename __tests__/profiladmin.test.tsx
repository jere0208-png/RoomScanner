/**
 * LA SECTION ADMINISTRATEUR DU PROFIL — vue par le seul administrateur.
 *
 * Le depot est public : aucune adresse n'y figure, c'est le serveur qui dit
 * `admin`. Le reglage « Mode diagnostic » ne doit paraitre que pour lui ;
 * pour tout autre compte, il n'existe pas.
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

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ProfilScreen } from '../src/screens/ProfilScreen';
import { useAccountStore } from '../src/store/accountStore';
import { useModeDiagnostic } from '../src/diagnostic/mode';
import { useScanStore } from '../src/store/scanStore';

const compte = { id: 'c1', prenom: 'Sam', email: 'sam@example.com', methode: 'email' as const };

beforeEach(() => {
  useScanStore.setState({ themePref: 'light' });
  useModeDiagnostic.setState({ charge: true, actif: false });
});

const monter = () => {
  let arbre: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    arbre = TestRenderer.create(<ProfilScreen />);
  });
  return arbre!;
};

const aLInterrupteur = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => n.props?.testID === 'interrupteur-diagnostic').length > 0;

describe('la section administrateur', () => {
  it('n’apparait pas pour un compte ordinaire', () => {
    act(() => useAccountStore.setState({ charge: true, compte, admin: false }));
    const t = monter();
    expect(aLInterrupteur(t)).toBe(false);
    act(() => t.unmount());
  });

  it('apparait pour l’administrateur', () => {
    act(() => useAccountStore.setState({ charge: true, compte, admin: true }));
    const t = monter();
    expect(aLInterrupteur(t)).toBe(true);
    act(() => t.unmount());
  });

  it('bascule le reglage du mode diagnostic', () => {
    act(() => useAccountStore.setState({ charge: true, compte, admin: true }));
    const t = monter();
    const inter = t.root.find((n) => n.props?.testID === 'interrupteur-diagnostic');
    act(() => inter.props.onValueChange(true));
    expect(useModeDiagnostic.getState().actif).toBe(true);
    act(() => t.unmount());
  });
});

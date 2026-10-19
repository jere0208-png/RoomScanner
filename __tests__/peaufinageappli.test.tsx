/**
 * PEAUFINAGE APPLI — trouver, ranger, nommer, sauvegarder.
 *
 *   — une seule recherche, accueil et bibliothèque : accents, plusieurs
 *     mots, client, adresse, numéro de devis, une faute de frappe pardonnée ;
 *   — « A → Z » range « Plan 2 » avant « Plan 10 », et un tri par client ;
 *   — le plan qui porte encore un nom donné par l'app prend celui de son
 *     chantier dès que le client ou l'adresse est tapé ;
 *   — la sauvegarde en ligne dit où elle en est, et se renvoie.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));
const mockDeposer = jest.fn(async (..._a: unknown[]) => true);
jest.mock('../src/net/coffrePlans', () => ({
  deposerPlan: (...a: unknown[]) => mockDeposer(...a),
  retirerPlan: jest.fn(async () => true),
  catalogueDesPlans: jest.fn(async () => []),
  reprendrePlan: jest.fn(async () => null),
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { aUneFautePres, correspondAuPlan } from '../src/ui/recherchePlans';
import { trierLesPlans } from '../src/screens/LibraryScreen';
import { nomDuChantier, useScanStore, type SavedScan } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { ProfilScreen } from '../src/screens/ProfilScreen';

const st = () => useScanStore.getState();

describe('une seule recherche des plans', () => {
  const plan = { name: 'Rénovation Hélène', client: 'M. Dupont', address: '12 rue de Lyon, 69003 Lyon', devis: { numero: 'D-2026-0042' } };
  it('les accents, la casse et l’ordre des mots ne comptent pas', () => {
    expect(correspondAuPlan(plan, 'helene')).toBe(true);
    expect(correspondAuPlan(plan, 'LYON dupont')).toBe(true);
    expect(correspondAuPlan(plan, 'dupont marseille')).toBe(false);
  });
  it('le client, l’adresse et le numéro du devis se cherchent aussi', () => {
    expect(correspondAuPlan(plan, 'dupont')).toBe(true);
    expect(correspondAuPlan(plan, '69003')).toBe(true);
    expect(correspondAuPlan(plan, '0042')).toBe(true);
  });
  it('une faute de frappe est pardonnée dans un mot long, pas dans un mot court', () => {
    expect(correspondAuPlan(plan, 'Duppont')).toBe(true);
    expect(correspondAuPlan(plan, 'renvation')).toBe(true);
    expect(correspondAuPlan(plan, 'lyan')).toBe(false);
    expect(aUneFautePres('appartement', 'apaprtement')).toBe(true);
    expect(aUneFautePres('maison', 'mairie')).toBe(false);
  });
});

describe('les tris de la bibliothèque', () => {
  const p = (name: string, updatedAt: number, client?: string) => ({ name, updatedAt, client });
  it('« A → Z » range les nombres comme des nombres', () => {
    const tries = trierLesPlans([p('Plan 10', 1), p('Plan 2', 2), p('plan 1', 3)], 'nom').map((x) => x.name);
    expect(tries).toEqual(['plan 1', 'Plan 2', 'Plan 10']);
  });
  it('« Client » regroupe les chantiers d’un même client, les plans sans client à la fin', () => {
    const tries = trierLesPlans(
      [p('Sans client', 9), p('Cuisine', 1, 'Martin'), p('Salle de bains', 5, 'Dupont'), p('Garage', 3, 'Martin')],
      'client',
    ).map((x) => x.name);
    expect(tries).toEqual(['Salle de bains', 'Garage', 'Cuisine', 'Sans client']);
  });
});

describe('le plan prend le nom de son chantier', () => {
  it('un nom donné par l’app devient celui du client, ou du début de l’adresse', () => {
    expect(nomDuChantier('T3 · 19/10', 'Dupont', '')).toBe('Dupont · T3');
    expect(nomDuChantier('Scan 19/10 · 21h31', '', '12 rue des Lilas, 69003 Lyon')).toBe('12 rue des Lilas · 19/10');
    expect(nomDuChantier('Chambre · 19/10', 'Mme Martin', '')).toBe('Mme Martin · Chambre');
  });
  it('un nom choisi à la main n’est jamais touché', () => {
    expect(nomDuChantier('Maison de vacances', 'Dupont', '')).toBeNull();
    expect(nomDuChantier('T3 · 19/10', '', '')).toBeNull();
  });
  it('à la saisie du client, l’en-tête du plan suit', () => {
    act(() => useScanStore.setState({ scanName: 'T2 · 19/10', saves: [], currentSaveId: null }));
    act(() => st().setClientInfo('Dupont', '3 place Bellecour'));
    expect(st().scanName).toBe('Dupont · T2');
    // Ensuite, c'est un nom de chantier : retaper le client ne le refait pas.
    act(() => st().setClientInfo('Durand', ''));
    expect(st().scanName).toBe('Dupont · T2');
  });
});

describe('la sauvegarde en ligne dit où elle en est', () => {
  const plan = { id: 'p1', name: 'Chantier', createdAt: 1, updatedAt: 1, rooms: [], walls: [], openings: [], objects: [] } as unknown as SavedScan;
  const qui = { identifiant: 'email:a@b.fr', jeton: 'j' } as never;
  beforeEach(() => {
    act(() => useScanStore.setState({ saves: [plan], envoiEnLigne: { enAttente: [], dernierEnvoi: null } }));
  });

  it('un envoi manqué est noté, et se renvoie', async () => {
    mockDeposer.mockResolvedValueOnce(false);
    await act(async () => {
      await st().deposerAuCompte('p1', qui);
    });
    expect(st().envoiEnLigne.enAttente).toEqual(['p1']);
    let passes = 0;
    await act(async () => {
      passes = await st().renvoyerLesPlansEnAttente(qui);
    });
    expect(passes).toBe(1);
    expect(st().envoiEnLigne.enAttente).toEqual([]);
    expect(st().envoiEnLigne.dernierEnvoi).not.toBeNull();
  });

  it('le profil le dit, et propose de réessayer', async () => {
    mockDeposer.mockResolvedValueOnce(false);
    await act(async () => {
      await st().deposerAuCompte('p1', qui);
    });
    act(() => useAccountStore.setState({ pro: true, proVia: 'code' } as never));
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ProfilScreen />);
    });
    const textes = () => t.root.findAllByType(Text).map((n) => [].concat(n.props.children).join('')).join(' | ');
    expect(textes()).toMatch(/1 plan pas encore en ligne · Réessayer/);
    act(() => t.unmount());
    act(() => useAccountStore.setState({ pro: false } as never));
  });
});

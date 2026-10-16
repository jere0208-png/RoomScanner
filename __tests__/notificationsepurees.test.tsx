/**
 * LA CLOCHE NE CRIE PAS POUR RIEN — revue des découvreurs (clair-30).
 *
 *   — au premier lancement, la pastille rouge portait un « 1 » pour le seul
 *     message de bienvenue : une fausse urgence, la première chose qu'on
 *     voyait. La bienvenue reste dans la boîte, sans pastille ;
 *   — « Toutes / Non lues » au-dessus d'un unique message : un outil de tri
 *     sans rien à trier. Les filtres paraissent à partir de deux messages.
 */
const mockDisque = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockDisque.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockDisque.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockDisque.delete(k);
  }),
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { BIENVENUE, NOUVEAUTES } from '../src/data/nouveautes';
import { nombreDeLaPastille, nombreNonLus, useNotifications } from '../src/store/notifications';
import { NotificationsScreen } from '../src/screens/NotificationsScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import type { Message } from '../src/net/messages';

const annonce: Message = { id: 'r1', date: Date.UTC(2026, 9, 9), titre: 'Annonce', texte: 'Texte.', genre: 'info' };
/** Ce que voit celui qui arrive : les notes de version écartées, la bienvenue seule. */
const premierLancement = () =>
  useNotifications.setState({ charge: true, recus: [], lus: [], supprimes: NOUVEAUTES.map((m) => m.id), enCours: false });

let arbre: TestRenderer.ReactTestRenderer | null = null;
const avant = global.fetch;
beforeEach(() => {
  jest.useFakeTimers();
  mockDisque.clear();
  global.fetch = jest.fn(async () => ({ ok: false, json: async () => null })) as never;
  useScanStore.setState({ screen: 'home', supported: true, saves: [], brouillon: null, error: null });
  useAccountStore.setState({ compte: null, pro: false });
  premierLancement();
});
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  jest.useRealTimers();
  global.fetch = avant;
});

const monter = (ecran: React.ReactElement) => {
  act(() => {
    arbre = TestRenderer.create(ecran);
  });
  return arbre!;
};
const pastille = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => n.props?.testID === 'pastille-notifications')[0];
const filtres = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll((n) => n.props?.testID === 'filtres-notifications');

describe('la pastille', () => {
  it('la bienvenue seule ne la fait pas paraître', () => {
    expect(nombreNonLus(useNotifications.getState())).toBe(1);
    expect(nombreDeLaPastille(useNotifications.getState())).toBe(0);
    const t = monter(<HomeScreen />);
    expect(pastille(t)).toBeUndefined();
    const cloche = t.root.findAll(
      (n) => typeof n.props?.onPress === 'function' && String(n.props?.accessibilityLabel ?? '').startsWith('Notifications'),
    )[0];
    expect(cloche.props.accessibilityLabel).toBe('Notifications');
  });

  it('un vrai message la fait paraître, et la bienvenue ne s’y ajoute pas', () => {
    useNotifications.setState({ recus: [annonce] });
    expect(nombreDeLaPastille(useNotifications.getState())).toBe(1);
    const t = monter(<HomeScreen />);
    expect(pastille(t).findByType(Text).props.children).toBe('1');
  });

  it('la bienvenue reste dans la boîte, non lue', () => {
    const t = monter(<NotificationsScreen />);
    expect(t.root.findAll((n) => n.props?.testID === `non-lu-${BIENVENUE.id}`).length).toBeGreaterThan(0);
  });
});

describe('les filtres « Toutes / Non lues »', () => {
  it('masqués pour un seul message', () => {
    const t = monter(<NotificationsScreen />);
    expect(filtres(t)).toHaveLength(0);
    expect(t.root.findAll((n) => n.props?.accessibilityLabel === 'Notifications non lues')).toHaveLength(0);
  });

  it('masqués pour aucun message', () => {
    useNotifications.setState({ supprimes: [...NOUVEAUTES.map((m) => m.id), BIENVENUE.id] });
    const t = monter(<NotificationsScreen />);
    expect(filtres(t)).toHaveLength(0);
  });

  it('paraissent dès deux messages', () => {
    useNotifications.setState({ recus: [annonce] });
    const t = monter(<NotificationsScreen />);
    expect(filtres(t).length).toBeGreaterThan(0);
  });

  it('un filtre resté sur « Non lues » ne cache pas le dernier message quand ils disparaissent', () => {
    useNotifications.setState({ recus: [annonce], lus: [annonce.id, BIENVENUE.id] });
    const t = monter(<NotificationsScreen />);
    const nonLues = t.root.findAll(
      (n) => typeof n.props?.onPress === 'function' && n.props?.accessibilityLabel === 'Notifications non lues',
    )[0];
    act(() => nonLues.props.onPress());
    act(() => useNotifications.getState().supprimer(annonce.id));
    expect(filtres(t)).toHaveLength(0);
    const vu = t.root.findAllByType(Text).map((n) => [].concat(n.props.children ?? []).join(''));
    expect(vu).toContain(BIENVENUE.titre);
  });
});

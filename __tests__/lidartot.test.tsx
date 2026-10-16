/**
 * SANS LIDAR, ON LE SAIT TÔT — ET L'ACCUEIL LE DIT LISIBLEMENT.
 *
 * Revue de lisibilité (bloquant) : sur un iPhone sans capteur, on
 * n'apprenait qu'à l'accueil, devant une tuile grisée à 50 % (2:1), que le
 * scan demandait « un iPhone Pro » — ce qui est faux pour l'iPad Pro et
 * trompeur pour l'iPhone 15. On le dit maintenant dès le premier lancement,
 * sans rien bloquer ; et sur l'accueil la tuile éteinte reste lisible :
 * opacité pleine, fond neutre, cadenas libellé, plus de flèche, et une
 * phrase qui oriente vers le dessin.
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
import { StyleSheet, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { HomeScreen, PHRASE_LIDAR } from '../src/screens/HomeScreen';
import { PremierLancement } from '../src/components/PremierLancement';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { useUsage } from '../src/store/usage';
import { useNotifications } from '../src/store/notifications';
import { light } from '../src/theme';

beforeEach(() => {
  jest.useFakeTimers();
  useScanStore.setState({ screen: 'home', supported: false, saves: [], brouillon: null, error: null });
  useAccountStore.setState({ compte: null, pro: false });
  useNotifications.setState({ charge: true, recus: [], lus: [], supprimes: [] });
});
let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  jest.useRealTimers();
  useUsage.setState({ charge: true, modeElec: true, choisi: true });
});

const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => [].concat(n.props.children ?? []).filter((x: unknown) => typeof x === 'string').join(''))
    .join(' | ');

describe('au premier lancement', () => {
  const question = (supported: boolean | null) => {
    useScanStore.setState({ supported });
    useUsage.setState({ charge: true, choisi: false });
    act(() => {
      arbre = TestRenderer.create(<PremierLancement onFini={() => {}} />);
    });
    // Passer le film mène à la question du mode.
    const passer = arbre!.root.findAll(
      (n) => typeof n.props?.onPress === 'function' && String(n.props?.accessibilityLabel ?? '').startsWith('Passer'),
    )[0];
    act(() => passer.props.onPress());
    return arbre!;
  };

  it('sans LiDAR, la question dit gentiment ce qui manque — et laisse choisir', () => {
    const t = question(false);
    expect(t.root.findAll((n) => n.props.testID === 'avis-lidar-premier').length).toBeGreaterThan(0);
    const vu = mots(t);
    expect(vu).toContain('iPhone ou iPad avec capteur LiDAR');
    expect(vu).not.toContain('iPhone Pro');
    // Rien n'est bloqué : les deux choix restent.
    expect(t.root.findAll((n) => n.props.accessibilityLabel === 'Mesurer et aménager' && n.props.onPress).length).toBeGreaterThan(0);
    expect(vu).toContain('Dessiner son logement');
  });

  it('avec LiDAR, pas un mot de trop', () => {
    const t = question(true);
    expect(t.root.findAll((n) => n.props.testID === 'avis-lidar-premier')).toHaveLength(0);
  });
});

describe('sur l’accueil', () => {
  const monter = () => {
    act(() => {
      arbre = TestRenderer.create(<HomeScreen />);
    });
    return arbre!;
  };
  const tuileScan = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAll((n) => n.props.accessibilityLabel === 'Scan indisponible sur cet appareil' && typeof n.props.onPress === 'function')[0];

  it('la tuile éteinte garde son opacité, prend un fond neutre et un cadenas libellé, sans flèche', () => {
    const t = monter();
    const tuile = tuileScan(t);
    expect(tuile).toBeDefined();
    const fonds = tuile.findAllByType(View).map((v) => StyleSheet.flatten(v.props.style) ?? {});
    // Aucune opacité sous 1 sur la tuile.
    for (const st of fonds) expect((st as { opacity?: number }).opacity ?? 1).toBe(1);
    expect(fonds.some((st) => (st as { backgroundColor?: string }).backgroundColor === light.surfaceSunken)).toBe(true);
    expect(tuile.findAll((n) => n.props.testID === 'cadenas-scan').length).toBeGreaterThan(0);
    expect(tuile.findAll((n) => n.props.testID === 'fleche-tuile')).toHaveLength(0);
    const vu = tuile.findAllByType(Text).map((n) => [].concat(n.props.children ?? []).join(''));
    expect(vu).toContain('Indisponible');
    expect(vu).toContain(PHRASE_LIDAR);
  });

  it('la phrase dit « iPhone ou iPad avec capteur LiDAR » et mène au dessin', () => {
    const avant = useScanStore.getState().commencerAuClavier;
    const dessine = jest.fn();
    useScanStore.setState({ commencerAuClavier: dessine } as never);
    const t = monter();
    const vu = mots(t);
    expect(vu).toContain('iPhone ou iPad avec capteur LiDAR');
    expect(vu).not.toContain('iPhone Pro');
    const lien = t.root.findAll((n) => n.props.accessibilityLabel === 'Dessiner le plan' && typeof n.props.onPress === 'function')[0];
    expect(lien).toBeDefined();
    act(() => lien.props.onPress());
    expect(dessine).toHaveBeenCalled();
    useScanStore.setState({ commencerAuClavier: avant } as never);
  });

  it('les tuiles actives gardent leur flèche', () => {
    useScanStore.setState({ supported: true });
    const t = monter();
    expect(t.root.findAll((n) => n.props.testID === 'fleche-tuile', { deep: false }).length).toBe(4);
  });
});

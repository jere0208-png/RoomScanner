/**
 * SANS LIDAR, ON LE SAIT TÔT — ET L'ACCUEIL LE DIT LISIBLEMENT.
 *
 * Revue de lisibilité (bloquant) : sur un iPhone sans capteur, on
 * n'apprenait qu'à l'accueil, devant une tuile grisée à 50 % (2:1), que le
 * scan demandait « un iPhone Pro » — ce qui est faux pour l'iPad Pro et
 * trompeur pour l'iPhone 15. On le dit maintenant dès le premier lancement,
 * sans rien bloquer ; et sur l'accueil la tuile éteinte reste lisible :
 * opacité pleine, fond neutre, cadenas libellé, plus de flèche, et son
 * appui oriente vers le dessin.
 *
 * Revue des découvreurs : le capteur était dit trois ou quatre fois (pied
 * de la connexion, carte de la question, tuile, paragraphe sous les tuiles
 * et lien « Dessiner le plan » qui doublait la tuile voisine). Il se dit
 * UNE fois par écran : une ligne sur la question, la tuile sur l'accueil —
 * et la tuile éteinte passe en dernière place.
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
import { AVIS_SANS_LIDAR, PremierLancement } from '../src/components/PremierLancement';
import { useAlerte } from '../src/ui/alerte';
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
    expect(vu).toContain(AVIS_SANS_LIDAR);
    expect(vu).not.toContain('iPhone Pro');
    // Rien n'est bloqué : les deux choix restent.
    expect(t.root.findAll((n) => n.props.accessibilityLabel === 'Mesurer et aménager' && n.props.onPress).length).toBeGreaterThan(0);
    expect(vu).toContain('Dessiner son logement');
  });

  it('sans LiDAR, la carte tient en une ligne', () => {
    const t = question(false);
    const carte = t.root.findAll((n) => n.props.testID === 'avis-lidar-premier')[0];
    const texte = carte.findByType(Text);
    expect(texte.props.numberOfLines).toBe(1);
    // Une ligne courte : au-delà, même réduite, elle ne se lirait plus.
    expect(AVIS_SANS_LIDAR.length).toBeLessThanOrEqual(55);
    // Et le capteur n'est dit qu'une fois sur l'écran.
    expect(mots(t).split('LiDAR').length - 1).toBe(1);
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

  it('le capteur n’est dit qu’une fois : sur la tuile, sans paragraphe ni lien en double', () => {
    const t = monter();
    const vu = mots(t);
    expect(vu.split('LiDAR').length - 1).toBe(1);
    expect(vu).not.toContain('iPhone Pro');
    expect(t.root.findAll((n) => n.props.testID === 'avis-lidar')).toHaveLength(0);
    // Plus de lien « Dessiner le plan » qui doublait la tuile « Dessiner un plan ».
    expect(
      t.root.findAll((n) => n.props.accessibilityLabel === 'Dessiner le plan' && typeof n.props.onPress === 'function'),
    ).toHaveLength(0);
  });

  it('l’appui sur la tuile éteinte mène au dessin', () => {
    const avant = useScanStore.getState().commencerAuClavier;
    const dessine = jest.fn();
    useScanStore.setState({ commencerAuClavier: dessine } as never);
    const t = monter();
    act(() => tuileScan(t).props.onPress());
    const alerte = useAlerte.getState().courante;
    expect(alerte?.message).toContain(PHRASE_LIDAR);
    const dessiner = alerte?.actions?.find((a) => a.label === 'Dessiner le plan');
    expect(dessiner).toBeDefined();
    act(() => dessiner!.onPress?.());
    expect(dessine).toHaveBeenCalled();
    act(() => useAlerte.setState({ courante: null } as never));
    useScanStore.setState({ commencerAuClavier: avant } as never);
  });

  it('sans capteur, la tuile du scan passe en dernier ; le dessin prend la première place', () => {
    const libelles = (t: TestRenderer.ReactTestRenderer) =>
      t.root
        .findAll(
          (n) =>
            typeof n.props.onPress === 'function' &&
            typeof n.props.accessibilityHint === 'string' &&
            ['Commencer le scan', 'Scan indisponible sur cet appareil', 'Dessiner un plan sans scanner', 'Voir un exemple', 'Lire un plan papier'].includes(
              n.props.accessibilityLabel,
            ),
          { deep: false },
        )
        .map((n) => n.props.accessibilityLabel as string);
    // Ordre de l'arbre : colonne gauche (haut, bas), puis colonne droite (haut, bas).
    const sans = libelles(monter());
    expect(sans).toEqual(['Dessiner un plan sans scanner', 'Voir un exemple', 'Lire un plan papier', 'Scan indisponible sur cet appareil']);
    act(() => arbre?.unmount());
    useScanStore.setState({ supported: true });
    const avec = libelles(monter());
    expect(avec).toEqual(['Commencer le scan', 'Voir un exemple', 'Dessiner un plan sans scanner', 'Lire un plan papier']);
  });

  it('plus aucune flèche « ↗ » sur les tuiles : elles faisaient croire à des liens externes', () => {
    useScanStore.setState({ supported: true });
    const t = monter();
    expect(t.root.findAll((n) => n.props.testID === 'fleche-tuile')).toHaveLength(0);
    // Aucun tracé de flèche oblique non plus, sous un autre nom.
    const traces = t.root.findAll((n) => typeof n.props.d === 'string').map((n) => n.props.d as string);
    expect(traces.some((d) => d.includes('M7 17 17 7'))).toBe(false);
  });
});

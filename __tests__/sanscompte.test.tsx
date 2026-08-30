/**
 * ON PEUT DÉCOUVRIR L'APPLICATION SANS COMPTE.
 *
 * Trouvé au tour du chef, la veille de la sortie : l'app entière vivait
 * derrière un mur de connexion — `if (!compte) → SignInScreen`, trois
 * boutons, aucune autre porte. Or son cœur est 100 % LOCAL : scanner,
 * tracer, coter, équiper, exporter — rien de tout ça n'a besoin d'une
 * identité. Le compte ne sert qu'à la sauvegarde en ligne et au code promo.
 *
 * DEUX RAISONS DE PERCER LA PORTE, ET CHACUNE SUFFIRAIT :
 *   — la revue Apple (5.1.1) refuse qu'on exige un compte pour des
 *     fonctions qui n'en ont pas besoin ;
 *   — le tout public : un curieux qui vient d'installer et tombe sur un
 *     formulaire repart — le mur de connexion est l'écran où l'on perd le
 *     plus de monde, et on le montrait AVANT la première seconde d'usage.
 *
 * CE QUE L'INVITÉ N'EST PAS : un contournement. Le palier gratuit se
 * compte PAR APPAREIL (le marqueur du trousseau), pas par compte — un
 * invité qui a relevé son logement gratuit est au même palier qu'un
 * connecté. C'est la contre-épreuve la plus importante de ce banc.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    viewModel: jest.fn(async () => false),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  laserEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  RoomScanView: 'RoomScanView',
  RoomScanCanvas: undefined,
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { SignInScreen } from '../src/screens/SignInScreen';
import { ProfilScreen } from '../src/screens/ProfilScreen';
import { useAccountStore } from '../src/store/accountStore';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  act(() => {
    useAccountStore.setState({
      compte: null,
      invite: false,
      pro: false,
      plansUtilises: 0,
    });
  });
});

const monter = (Ecran: React.ComponentType) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<Ecran />);
  });
  arbre = t;
  return t;
};

/** Ce qui répond au doigt et porte ce libellé (bouton ou lien). */
const porte = (t: TestRenderer.ReactTestRenderer, mot: string) =>
  t.root
    .findAll(
      (n) =>
        typeof n.props?.onPress === 'function' &&
        n.findAllByType(Text).some((x) => String(x.props.children) === mot),
    )
    .pop();

describe('la porte « sans compte »', () => {
  it('existe sur l’écran de connexion, et elle ouvre l’app', () => {
    const t = monter(SignInScreen);
    const lien = porte(t, 'Découvrir sans compte');
    expect(lien).toBeTruthy();
    act(() => lien!.props.onPress());
    // C'est ce drapeau que l'app lit à sa porte d'entrée : sans compte
    // mais en invité, l'accueil se montre.
    expect(useAccountStore.getState().invite).toBe(true);
    expect(useAccountStore.getState().compte).toBeNull();
  });

  it('et le choix survit au redémarrage', () => {
    /*
      Sans persistance, l'invité retombe sur le mur de connexion à CHAQUE
      lancement — un rappel forcé qui vaut un refus poli. Le drapeau part
      dans le même coffre que le reste du compte.
    */
    act(() => useAccountStore.getState().entrerEnInvite());
    const AsyncStorage = jest.requireMock(
      '@react-native-async-storage/async-storage',
    );
    const ecritures = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
      (c: string[]) => c[0] === 'roomscanner.compte.v1',
    );
    expect(ecritures.length).toBeGreaterThan(0);
    const dernier = JSON.parse(ecritures[ecritures.length - 1][1]);
    expect(dernier.invite).toBe(true);
  });
});

describe('le profil de l’invité', () => {
  it('offre la connexion — c’est ELLE qui manque à un invité', () => {
    act(() => useAccountStore.setState({ invite: true, compte: null }));
    const t = monter(ProfilScreen);
    const lien = porte(t, 'Créer un compte ou se connecter');
    expect(lien).toBeTruthy();
    act(() => lien!.props.onPress());
    // Le drapeau retombe : la porte d'entrée montre l'écran de connexion.
    expect(useAccountStore.getState().invite).toBe(false);
  });

  it('et ne propose ni déconnexion ni suppression : il n’y a rien à défaire', () => {
    act(() => useAccountStore.setState({ invite: true, compte: null }));
    const t = monter(ProfilScreen);
    const options = t.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Plus d’options',
    );
    expect(options).toHaveLength(0);
  });
});

describe('l’invité n’est pas un contournement', () => {
  it('le palier gratuit vaut pour lui comme pour un connecté', () => {
    /*
      LE PALIER EST À L'APPAREIL, PAS AU COMPTE — c'est déjà sa règle
      (supprimer-recréer un compte ne le remet pas à zéro), et l'invité
      s'y range : un logement gratuit relevé, et c'est l'offre qui parle.
    */
    act(() =>
      useAccountStore.setState({
        invite: true,
        compte: null,
        pro: false,
        plansUtilises: 1,
        bonusEssais: 0,
      }),
    );
    expect(useAccountStore.getState().peutCreerPlan()).toBe(false);
  });
});

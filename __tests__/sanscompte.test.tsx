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
 * LA BARRIÈRE DE L'INVITÉ EST L'EXPORT, PAS LA CRÉATION — relevé du
 * patron : « on doit pouvoir scan des plans mais sans pouvoir rien
 * exporter. Si un "continuer sans compte" fait un scan et cherche à
 * exporter, on lui propose de créer un compte pour l'ouvrir avec.
 * Cependant son compte sera à 0 scan possible par la suite. »
 *
 * L'invité scanne donc LIBREMENT — plus d'offre −20 % à la première porte
 * (le premier réglage bloquait ses portes dès que l'appareil avait un
 * essai consommé : on entrait « sans compte » et on tombait sur les
 * offres). Mais chaque relevé CONTINUE de se compter au marqueur de
 * l'appareil : le compte créé ensuite naît avec son essai déjà consommé —
 * zéro relevé gratuit restant. L'invité n'est pas un contournement, c'est
 * un paiement différé du même palier.
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
import { useAlerte } from '../src/ui/alerte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

describe('l’invité scanne librement, et paie à l’export', () => {
  it('les portes de création s’ouvrent, même l’essai de l’appareil consommé', () => {
    /*
      LE BUG DU PREMIER RÉGLAGE, mot pour mot : « j'ai fait continuer sans
      compte à l'ouverture de l'app, et je vois directement les offres
      -20 % ». L'appareil avait déjà un essai au compteur, chaque porte
      consultait le palier, et l'invité tombait sur l'offre avant d'avoir
      rien fait. Sa porte à lui est plus loin — à l'export.
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
    expect(useAccountStore.getState().peutCreerPlan()).toBe(true);
  });

  it('mais ses relevés se comptent : le compte créé ensuite naît à zéro', () => {
    act(() =>
      useAccountStore.setState({
        invite: true,
        compte: null,
        pro: false,
        plansUtilises: 0,
        bonusEssais: 0,
      }),
    );
    // Le relevé de l'invité passe par le même compteur que tout le monde.
    act(() => useAccountStore.getState().noterPlanCree());
    expect(useAccountStore.getState().plansUtilises).toBe(1);
    // Il crée son compte : l'essai de l'appareil est déjà consommé —
    // « son compte sera à 0 scan possible par la suite ».
    act(() =>
      useAccountStore.setState({
        compte: { id: 'email:a@b.fr', email: 'a@b.fr', methode: 'email' },
      }),
    );
    expect(useAccountStore.getState().peutCreerPlan()).toBe(false);
  });

  it('l’export se refuse à l’invité, et lui propose LE compte', () => {
    act(() =>
      useAccountStore.setState({ invite: true, compte: null, pro: false }),
    );
    expect(useAccountStore.getState().exportOuvert()).toBe(false);
    // La proposition est posée — pas un refus sec : le plan est prêt, le
    // compte est la clé qui l'ouvre.
    const q = useAlerte.getState().courante;
    expect(q).toBeTruthy();
    expect(`${q!.titre} ${q!.message ?? ''}`).toMatch(/compte/i);
    const creer = q!.actions?.find((a) => /compte/i.test(a.label));
    expect(creer).toBeTruthy();
    act(() => creer!.onPress?.());
    // Le drapeau retombe : la porte d'entrée montre l'écran de connexion,
    // et l'on revient exactement là où l'export attendait.
    expect(useAccountStore.getState().invite).toBe(false);
  });

  it('avec un compte, l’export s’ouvre sans un mot', () => {
    act(() => {
      useAlerte.setState({ courante: null, file: [] });
      useAccountStore.setState({
        invite: false,
        compte: { id: 'email:a@b.fr', email: 'a@b.fr', methode: 'email' },
      });
    });
    expect(useAccountStore.getState().exportOuvert()).toBe(true);
    expect(useAlerte.getState().courante).toBeNull();
  });

  it('et CHAQUE chemin d’export consulte la barrière', () => {
    /*
      PAR LA MESURE, comme `motsclairs` : cinq gestes sortent un livrable
      du plan — le dossier PDF, le modèle 3D, le PDF matériel, le métré
      CSV, le DXF. Un seul qui oublierait la barrière, et l'invité
      exporterait par cette porte-là. On lit le code source des deux
      écrans : chaque fonction de partage commence par la consulter.
    */
    const src =
      readFileSync(join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'), 'utf8') +
      readFileSync(join(__dirname, '..', 'src', 'screens', 'ExportScreen.tsx'), 'utf8');
    const gardes = src.match(/if \(!exportOuvert\(\)\) return;/g) ?? [];
    expect(gardes.length).toBeGreaterThanOrEqual(5);
  });
});

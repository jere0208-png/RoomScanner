/**
 * CHAQUE BOUTON A UNE VOIX — la garde VoiceOver.
 *
 * Un tour d'accessibilité l'a mesuré : sur les grands écrans de
 * l'application, AUCUN élément tactile n'est muet — chacun porte un texte
 * visible ou une étiquette d'accessibilité. C'est une propriété qui se perd
 * une pastille à la fois : le prochain bouton dessiné à la va-vite, une
 * icône seule posée sans son mot, et quelqu'un qui navigue à l'oreille
 * tombe sur « bouton » sans savoir lequel.
 *
 * Ce banc la fige : il monte les écrans et compte les MUETS — ce qui
 * répond au doigt sans rien donner à lire. Le compte exigé est ZÉRO, et il
 * doit le rester. Si ce banc rougit, la correction n'est jamais ici : elle
 * est sur le bouton qu'on vient d'ajouter.
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
    startHeading: jest.fn(async () => true),
    stopHeading: jest.fn(async () => true),
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
import { HomeScreen } from '../src/screens/HomeScreen';
import { LibraryScreen } from '../src/screens/LibraryScreen';
import { ProfilScreen } from '../src/screens/ProfilScreen';
import { DevisScreen } from '../src/screens/DevisScreen';
import { ExportScreen } from '../src/screens/ExportScreen';
import { SignInScreen } from '../src/screens/SignInScreen';
import { useScanStore } from '../src/store/scanStore';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

/** Ce qui répond au doigt sans texte visible ni étiquette : les muets. */
const muets = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAll((n) => typeof n.props?.onPress === 'function')
    .filter((n) => {
      if (n.props.accessibilityLabel) return false;
      try {
        if (
          n
            .findAllByType(Text)
            .some((x) => String(x.props.children ?? '').trim())
        ) {
          return false;
        }
      } catch {
        // Un nœud sans descendance texte : il reste candidat.
      }
      return true;
    });

const ECRANS: [string, React.ComponentType, () => void][] = [
  ['l’accueil', HomeScreen, () => useScanStore.setState({ screen: 'home' })],
  [
    'la bibliothèque',
    LibraryScreen,
    () =>
      useScanStore.setState({ screen: 'library', saves: [], folders: [] }),
  ],
  ['le profil', ProfilScreen, () => {}],
  ['le ticket', DevisScreen, () => {}],
  ['l’export', ExportScreen, () => {}],
  ['la connexion', SignInScreen, () => {}],
];

describe('aucun bouton muet', () => {
  for (const [nom, Ecran, prep] of ECRANS) {
    it(`sur ${nom}`, () => {
      let t!: TestRenderer.ReactTestRenderer;
      act(() => {
        prep();
        t = TestRenderer.create(React.createElement(Ecran));
      });
      arbre = t;
      expect(muets(t)).toHaveLength(0);
    });
  }
});

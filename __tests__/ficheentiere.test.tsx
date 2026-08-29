/**
 * LA FICHE D'ÉLÉVATION TIENT DANS L'ÉCRAN, BARRE D'ACCUEIL COMPRISE.
 *
 * Relevé du patron, capture à l'appui : « ce menu dépasse de l'écran
 * verticalement ». Sur la capture, la fiche d'un interrupteur dans une salle
 * de bains — un mur de trente-trois centimètres de large pour deux mètres
 * cinquante de haut — descend sous le bord bas du téléphone, et le bouton
 * « Enregistrer » est coupé en deux par la barre d'accueil.
 *
 * LE GARDE-FOU EXISTAIT, ET IL VISAIT TROP BAS.
 *
 * La fiche mesure sa propre hauteur une fois rendue et rabote son dessin de
 * ce qui dépasse (`raboter`) — c'est la bonne méthode, et elle avait déjà
 * sauvé cet écran une fois. Mais elle comparait la hauteur rendue à
 * `hauteurEcran − 24`, un nombre écrit à la main, alors que la fiche vit dans
 * une modale qui lui prend :
 *
 *   - CINQUANTE-SIX POINTS EN HAUT — la marge de la modale ;
 *   - DOUZE POINTS EN BAS — la sienne ;
 *   - ET LA BARRE D'ACCUEIL, trente-quatre points sur un iPhone récent.
 *
 * Soit cent deux points, contre vingt-quatre autorisés. Le garde-fou laissait
 * donc passer soixante-dix-huit points de débord — la hauteur du bouton
 * « Enregistrer », très exactement.
 *
 * CE QU'ON CHANGE, ET CE QU'ON NE CHANGE PAS. La méthode reste : on MESURE ce
 * que la fiche prend, on ne l'estime pas. Ce qui change, c'est la place
 * disponible : elle se déduit des marges de la modale — qui vivent désormais
 * à un seul endroit, et que les deux fichiers lisent — et de la barre du
 * système, que le téléphone est seul à connaître.
 */
const mockCap = { valeur: null as string | null };

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
  get RoomScanCanvas() {
    return mockCap.valeur;
  },
}));

import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TestRenderer, { act } from 'react-test-renderer';
import { WallElevation } from '../src/components/WallElevation';
import { ELEC_PLEIN_BAS, ELEC_PLEIN_HAUT } from '../src/screens/result/styles';
import { useScanStore } from '../src/store/scanStore';
import type { Fixture } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/**
 * LA SALLE DE BAINS DE LA CAPTURE — et son mur de trente-trois centimètres.
 *
 * C'est le pire cas, et ce n'est pas un cas tordu : un pan de mur étroit et
 * haut donne un dessin en colonne, donc le cadre le plus haut que la fiche
 * puisse demander. C'est là que le débord se voit.
 */
const MURS: WallSeg[] = [
  mur('n', 0, 0, 0.33, 0),
  mur('e', 0.33, 0, 0.33, 2),
  mur('s', 0.33, 2, 0, 2),
  mur('o', 0, 2, 0, 0),
];

const INTER: Fixture = {
  id: 'i1',
  kind: 'inter',
  wallId: 'n',
  along: 0.1,
  height: 1.1,
  side: 1,
};

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Salle de bains', floor: null }] as never,
      fixtures: [INTER],
      ceiling: [],
      photos: [],
    });
    t = TestRenderer.create(
      <WallElevation
        wallId="n"
        selectedId="i1"
        onSelect={() => {}}
        onAddRequest={() => {}}
        onClose={() => {}}
      />,
    );
  });
  act(() => {
    const zone = t.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({
      nativeEvent: { layout: { width: 330, height: 400 } },
    });
  });
  arbre = t;
  return t;
};

/** La hauteur du dessin : c'est elle que le garde-fou rabote. */
const hauteurDuDessin = (t: TestRenderer.ReactTestRenderer) => {
  const vues = t.root.findAllByType(View).filter((n) => {
    const st = (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<
      string,
      unknown
    >;
    return typeof st.height === 'number' && st.height > 100;
  });
  expect(vues.length).toBeGreaterThan(0);
  const st = (StyleSheet.flatten(vues[0].props.style as never) ?? {}) as Record<
    string,
    number
  >;
  return st.height;
};

/**
 * LE TÉMOIN DE FIN DE FEUILLE — la vue de zéro pixel, posée en dernier, dont
 * l'ordonnée dit à quelle hauteur la fiche se termine.
 */
const declarerHauteur = (t: TestRenderer.ReactTestRenderer, y: number) => {
  const temoin = t.root
    .findAllByType(View)
    .filter((n) => {
      const st = (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<
        string,
        unknown
      >;
      return st.height === 0 && typeof n.props.onLayout === 'function';
    })
    .pop()!;
  expect(temoin).toBeDefined();
  act(() => {
    temoin.props.onLayout({ nativeEvent: { layout: { y, height: 0 } } });
  });
};

describe('la place que la fiche a vraiment', () => {
  /**
   * Ce que la modale et le système lui prennent, en points. Le banc le
   * calcule comme l'écran : à partir des mêmes constantes, jamais d'un
   * nombre recopié — un nombre recopié serait juste le jour où on l'écrit.
   */
  const Marges = () => {
    const insets = useSafeAreaInsets();
    return ELEC_PLEIN_HAUT + ELEC_PLEIN_BAS + insets.bottom;
  };

  it('les marges de la modale sont dites à UN seul endroit', () => {
    /*
      C'est la cause profonde : la marge du haut vivait dans la feuille de
      styles de l'écran, et le garde-fou de la fiche en supposait une autre,
      écrite à la main chez lui. Deux nombres pour la même chose, et l'un des
      deux se trompe toujours.
    */
    expect(ELEC_PLEIN_HAUT).toBeGreaterThan(0);
    expect(ELEC_PLEIN_BAS).toBeGreaterThan(0);
  });

  it('et la barre d’accueil en fait partie', () => {
    // Trente-quatre points sur un iPhone à encoche : le banc les rend (voir
    // `jest.setup.js`), et c'est ce qui rend cette épreuve possible.
    expect(useSafeAreaInsets().bottom).toBeGreaterThan(0);
  });

  it('la fiche se rabote dès qu’elle dépasse CETTE place-là', () => {
    /*
      L'ÉPREUVE DU RELEVÉ. On déclare une hauteur rendue qui tient sous
      l'ancien seuil — `hauteurEcran − 24` — et qui dépasse la place réelle.
      L'ancien garde-fou ne bronchait pas : c'est exactement l'écran de la
      capture, avec son « Enregistrer » coupé en deux.
    */
    const ecran = Dimensions.get('window').height;
    const dispo = ecran - Marges();
    const t = monter();
    const avant = hauteurDuDessin(t);
    // Entre les deux seuils : trop grand pour la vraie place, assez petit
    // pour l'ancien.
    declarerHauteur(t, dispo + 60);
    expect(hauteurDuDessin(t)).toBeLessThan(avant);
  });

  it('mais il ne rabote pas ce qui TIENT', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, et il porte tout : un garde-fou qui
      rétrécit toujours finirait par réduire le dessin à son minimum sur
      chaque mur, et l'épreuve du dessus passerait sans rien prouver.
    */
    const ecran = Dimensions.get('window').height;
    const dispo = ecran - Marges();
    const t = monter();
    const avant = hauteurDuDessin(t);
    declarerHauteur(t, dispo - 20);
    expect(hauteurDuDessin(t)).toBe(avant);
  });
});

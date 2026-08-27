/**
 * L'APP N'EST PAS RÉSERVÉE AUX ÉLECTRICIENS — ET ELLE DOIT LE MONTRER.
 *
 * Relevé du patron : « L'app n'est pas destinée de base qu'aux électriciens,
 * mais je la trouve très axée élec, comment faire plus neutre en gardant nos
 * fonctionnalités élec ? Comment faire comprendre à l'utilisateur que ce
 * n'est pas que pour les élec mais aussi pour modéliser son appartement et
 * placer des meubles pour se projeter. »
 *
 * En cherchant OÙ l'application dit « élec » sans qu'on le lui demande, ce
 * n'est pas le vocabulaire qui est ressorti : l'accueil ne prononce pas le
 * mot, et sa promesse — « Votre appartement en 3D et en plan coté » — ne
 * parle déjà que de bâti. Ce sont les RÉGLAGES PAR DÉFAUT et l'ORDRE :
 *
 *   1. le popup de fin de scan cochait l'électricité D'OFFICE. Tout relevé
 *      revenait donc couvert de socles, de RJ45, de commandes et de points
 *      lumineux — y compris celui de quelqu'un qui voulait seulement voir
 *      son salon en 3D. Et cela tombait à la minute la plus décisive de
 *      l'app : la première fois qu'on voit son plan ;
 *   2. en édition, « Appareil » passait AVANT « Meuble » dans la rangée ;
 *   3. la page Pro énumérait six choses à acheter, dont deux électriques et
 *      AUCUNE qui parle de meubles, de 3D ou d'aménagement. La page qui
 *      demande de l'argent ne vendait pas la moitié non-élec du produit.
 *
 * La correction ne RETIRE rien du métier — c'est lui qui fait la valeur du
 * dossier. Elle change l'ordre et les défauts : l'électricité reste à un
 * seul geste, écrite en toutes lettres, jamais imposée. D'où le contrôle en
 * sens inverse dans chaque épreuve ci-dessous : on vérifie autant qu'elle
 * n'arrive PAS toute seule que qu'elle arrive quand on la demande.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    cameraStatus: jest.fn(async () => 'granted'),
    start: jest.fn(async () => true),
    stop: jest.fn(async () => null),
    pause: jest.fn(),
    resume: jest.fn(),
    startHeading: jest.fn(async () => true),
    stopHeading: jest.fn(async () => true),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
}));
jest.mock('../src/native/account', () => ({
  lireMarqueur: jest.fn(async () => null),
  ecrireMarqueur: jest.fn(async () => undefined),
  connexionApple: jest.fn(async () => ({ id: 'A1' })),
  acheterAbonnement: jest.fn(async () => true),
}));

import React from 'react';
import { Animated, Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ChoixScan } from '../src/components/ChoixScan';
import { Toolbar2D } from '../src/screens/result/ResultToolbar';
import { PaywallScreen } from '../src/screens/PaywallScreen';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { pourChercher } from '../src/ui/mots';

beforeEach(() => {
  jest.useFakeTimers();
  // Le magasin SURVIT d'un banc à l'autre : on repart d'un plan neuf,
  // sinon une épreuve voisine décide de ce que la rangée affiche.
  act(() => useScanStore.getState().reset());
  useScanStore.setState({ rooms: [], ceiling: [] });
});
afterEach(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (el: React.ReactElement) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(el);
  });
  arbre = t;
  return t;
};

/** Tout le texte affiché, mis à plat, pour chercher ce qui se LIT. */
const textesDe = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .join(' | ');

describe('la fin du scan ne pose pas d’électricité sans qu’on la demande', () => {
  /*
    ON CHERCHE LES LIGNES PAR LEUR NATURE, PAS PAR LEUR MOT.

    Une case se reconnaît à son rôle d'accessibilité — `checkbox` — et son
    état à `accessibilityState.checked`. Le titre de la ligne élec change
    avec le relevé (« Compléter aux normes » quand on a posé au viseur,
    « Électricité proposée aux normes » sinon) : un banc qui chercherait
    l'un des deux mots ne mesurerait qu'une moitié des cas.
  */
  const cases = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAll(
      (n) => n.props.accessibilityRole === 'checkbox' && !!n.props.onPress,
    );

  /** La case qui parle d'électricité, quel que soit le titre du moment. */
  const caseElec = (t: TestRenderer.ReactTestRenderer) =>
    cases(t).find((n) => {
      const mot = pourChercher(String(n.props.accessibilityLabel ?? ''));
      return mot.includes('electricite') || mot.includes('normes');
    })!;

  /** La case qui parle des meubles. */
  const caseMeubles = (t: TestRenderer.ReactTestRenderer) =>
    cases(t).find((n) =>
      pourChercher(String(n.props.accessibilityLabel ?? '')).includes('meuble'),
    )!;

  const valider = (t: TestRenderer.ReactTestRenderer) => {
    const b = t.root.findAllByType(TouchableOpacity).find(
      (n) => n.props.accessibilityLabel === 'Intégrer',
    )!;
    act(() => b.props.onPress());
  };

  it('coche les meubles, laisse l’électricité décochée', () => {
    const t = monter(
      <ChoixScan visible meubles={3} onValider={jest.fn()} onClose={jest.fn()} />,
    );
    expect(caseMeubles(t).props.accessibilityState.checked).toBe(true);
    expect(caseElec(t).props.accessibilityState.checked).toBe(false);
  });

  it('valide sans rien poser d’électrique quand on ne touche à rien', () => {
    const onValider = jest.fn();
    const t = monter(
      <ChoixScan visible meubles={2} onValider={onValider} onClose={jest.fn()} />,
    );
    valider(t);
    expect(onValider).toHaveBeenCalledWith({ meubles: true, elec: false });
  });

  /*
    LE CONTRÔLE EN SENS INVERSE — sans lui, l'épreuve ci-dessus passerait
    tout aussi bien si la ligne élec avait DISPARU. Or c'est exactement ce
    qu'on ne veut pas : le métier reste à un geste, et ce geste marche.
  */
  it('mais un seul appui la ramène, et elle se pose', () => {
    const onValider = jest.fn();
    const t = monter(
      <ChoixScan visible meubles={2} onValider={onValider} onClose={jest.fn()} />,
    );
    act(() => caseElec(t).props.onPress());
    expect(caseElec(t).props.accessibilityState.checked).toBe(true);
    valider(t);
    expect(onValider).toHaveBeenCalledWith({ meubles: true, elec: true });
  });

  it('et elle continue de dire ce qu’elle fait : la norme, en toutes lettres', () => {
    const vu = textesDe(
      monter(
        <ChoixScan visible meubles={1} onValider={jest.fn()} onClose={jest.fn()} />,
      ),
    );
    // Ce qui est décoché doit être LISIBLE : une case qu'on ne comprend pas
    // ne se coche jamais, et le métier serait perdu pour de bon.
    expect(vu).toContain('NF C 15-100');
    expect(pourChercher(vu)).toContain('propos');
  });
});

describe('la rangée d’édition met le meuble avant l’appareil', () => {
  /*
    L'ORDRE SE LIT DANS L'ARBRE, PAS DANS LE FICHIER.

    On monte la rangée à une largeur qui laisse tenir toutes les pastilles
    sur une seule ligne : dès qu'il y a trop-plein, RangeeOutils empile le
    reste dans la colonne de droite et l'ordre de rendu n'est plus l'ordre
    de lecture. `pendingKind` et consorts sont à null : aucune pastille
    n'est allumée, on ne mesure que le RANG.
  */
  const rangeeEnEdition = () =>
    monter(
      <Toolbar2D
        anim={new Animated.Value(1)}
        largeur={1200}
        bas={0}
        dessus={0}
        edition
        pendingKind={null}
        pendingCeiling={null}
        pendingNote={false}
        onNote={jest.fn()}
        showMeasures={false}
        setShowMeasures={jest.fn()}
        showRoutes={false}
        showFixtures={false}
        setShowFixtures={jest.fn()}
        setShowRoutes={jest.fn()}
        hasRoutes={false}
        showNorth={false}
        setShowNorth={jest.fn()}
        showCeiling={false}
        setShowCeiling={jest.fn()}
        onFixture={jest.fn()}
        onFurniture={jest.fn()}
        onFurnitureOff={jest.fn()}
        seulGeste={jest.fn()}
        setMenu={jest.fn()}
        setPendingCeiling={jest.fn()}
        setPendingSpots={jest.fn()}
      />,
    );

  /** Les libellés des pastilles, dans l'ordre où elles sont rendues. */
  const rang = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAllByType(TouchableOpacity)
      .map((n) => String(n.props.accessibilityLabel ?? ''))
      .filter((m) => m.length > 0);

  it('« Meuble » vient avant « Appareil »', () => {
    const ordre = rang(rangeeEnEdition());
    const meuble = ordre.indexOf('Meuble');
    const appareil = ordre.indexOf('Appareil');
    expect(meuble).toBeGreaterThanOrEqual(0);
    expect(appareil).toBeGreaterThanOrEqual(0);
    expect(meuble).toBeLessThan(appareil);
  });

  /*
    LE CONTRÔLE EN SENS INVERSE : reculer l'appareil ne doit pas le sortir
    de la rangée, ni le renvoyer derrière la note et le plafond. Il reste
    le SECOND geste de pose, celui qu'on trouve sans chercher.
  */
  it('sans reléguer l’appareil : il reste le second à poser', () => {
    const ordre = rang(rangeeEnEdition());
    expect(ordre.indexOf('Appareil')).toBeLessThan(ordre.indexOf('Plafond'));
    expect(ordre.indexOf('Appareil')).toBeLessThan(ordre.indexOf('Note'));
    // « Redresser » ouvre toujours la rangée : il ne pose rien, il remet le
    // fond d'équerre avant qu'on place quoi que ce soit.
    expect(ordre.indexOf('Redresser')).toBe(0);
  });
});

describe('la page Pro vend aussi ce qui n’est pas électrique', () => {
  beforeEach(() => {
    useAccountStore.setState({
      charge: true,
      compte: { id: 'email:x@y.fr', methode: 'email' },
      pro: false,
      proVia: null,
      plansUtilises: 0,
      paywallVisible: true,
      essaiEpuiseVisible: false,
    });
  });

  it('énumère la 3D et l’aménagement, pas seulement la norme', () => {
    const vu = pourChercher(textesDe(monter(<PaywallScreen />)));
    expect(vu).toContain('meuble');
    expect(vu).toContain('3d');
  });

  /*
    LE CONTRÔLE EN SENS INVERSE : on n'a pas troqué un métier contre
    l'autre. La norme et le tableau existant sont ce qui distingue
    l'application de tous les scanners de pièces du magasin — ils restent
    écrits, et ils restent vendus.
  */
  it('sans effacer le métier : la norme et le tableau restent vendus', () => {
    const vu = textesDe(monter(<PaywallScreen />));
    expect(vu).toContain('NF C 15-100');
    expect(pourChercher(vu)).toContain('tableau');
  });
});

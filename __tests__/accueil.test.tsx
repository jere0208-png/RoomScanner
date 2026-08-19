/**
 * L'ACCUEIL — ce qu'on montre avant d'avoir scanné quoi que ce soit.
 *
 * Il expliquait l'application en trois lignes : « Scannez, ajustez,
 * explorez ». Trois pictogrammes et neuf mots pour dire ce qu'une seule
 * image montre mieux — le résultat. On ne vend pas un scanner de pièces avec
 * une notice, on le vend avec le plan qui en sort.
 *
 * Ce banc tient trois choses : le mode d'emploi est bien parti, la maquette
 * TOURNE VRAIMENT (une image figée aurait le même arbre, et l'on ne verrait
 * rien), et elle sort du même moteur que la vue 3D de l'app — pas d'un
 * dessin qui promettrait ce que l'application ne fait pas.
 */
jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    // Le bouton demande l'autorisation de la caméra avant de lancer le scan.
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
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Image, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { HomeScreen } from '../src/screens/HomeScreen';
import { PhoneShowcase } from '../src/components/PhoneShowcase';
import { GlowButton } from '../src/components/GlowButton';
import { useScanStore } from '../src/store/scanStore';
import { SHOWCASE_IMAGES } from '../src/assets/showcase';
import { SHOWCASE_FRAMES } from '../src/export/showcaseFrames';

beforeEach(() => {
  jest.useFakeTimers();
  useScanStore.setState({
    screen: 'home',
    supported: true,
    saves: [],
    brouillon: null,
  });
});
afterEach(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function monter() {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<HomeScreen />);
  });
  arbre = t;
  return t;
}

const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .join(' | ');

const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root
    .findAllByType(GlowButton)
    .find((n) => (n.props.accessibilityLabel ?? n.props.label) === label);

describe('l’accueil', () => {
  it('ne récite plus le mode d’emploi', () => {
    const vu = textes(monter());
    for (const mot of ['Scannez', 'Ajustez', 'Explorez']) {
      expect(vu).not.toContain(mot);
    }
    // La promesse, elle, reste : c'est une phrase, pas une notice.
    expect(vu).toContain('en plan coté');
  });

  it('montre le logement, image par image', () => {
    const t = monter();
    expect(t.root.findAllByType(PhoneShowcase)).toHaveLength(1);
    // Toutes les images sont montées d'emblée : les charger une par une
    // ferait sauter la première boucle.
    expect(
      t.root.findByType(PhoneShowcase).findAllByType(Image),
    ).toHaveLength(SHOWCASE_IMAGES.length);
  });

  /**
   * LES IMAGES CUITES SUIVENT LE SCÉNARIO.
   *
   * Elles sont calculées au build : si quelqu'un change le scénario sans
   * relancer `npm run showcase`, l'accueil joue l'ancienne animation et rien
   * ne le dit. Le compte, lui, le dit.
   */
  it('a autant d’images que le scénario en demande', () => {
    expect(SHOWCASE_IMAGES).toHaveLength(SHOWCASE_FRAMES);
  });

  /**
   * ET ELLE TOURNE.
   *
   * Une maquette figée aurait exactement le même arbre au premier rendu :
   * seule la comparaison dans le temps prouve le mouvement.
   */
  it('déroule l’animation toute seule, et en boucle', () => {
    const t = monter();
    /**
     * L'image visible : la seule de la VITRINE dont l'opacité n'est pas
     * nulle. On cherche dans la vitrine et non dans l'écran entier — le
     * logotype de la marque est une image lui aussi, et il passait devant.
     */
    const visible = () =>
      t.root
        .findByType(PhoneShowcase)
        .findAllByType(Image)
        .findIndex((n) => {
          const st = Array.isArray(n.props.style)
            ? Object.assign({}, ...n.props.style.filter(Boolean))
            : n.props.style;
          return (st?.opacity ?? 1) !== 0;
        });
    expect(visible()).toBe(0);
    act(() => jest.advanceTimersByTime(500));
    const apres = visible();
    expect(apres).toBeGreaterThan(0);
    // Elle boucle : après un cycle complet, on est revenu au plan.
    act(() => jest.advanceTimersByTime(68 * SHOWCASE_FRAMES));
    expect(visible()).toBe(apres);
  });

  it('porte ses deux boutons, et le second seulement s’il y a des scans', () => {
    let t = monter();
    expect(bouton(t, 'Commencer le scan')).toBeDefined();
    expect(bouton(t, 'Mes scans')).toBeUndefined();
    act(() => t.unmount());
    arbre = null;
    useScanStore.setState({
      saves: [
        {
          id: 's1',
          name: 'Chantier',
          date: 1,
          walls: [],
          openings: [],
          objects: [],
          rooms: [],
        } as never,
      ],
    });
    t = monter();
    expect(bouton(t, 'Mes scans')).toBeDefined();
  });

  it('lance le scan au doigt', async () => {
    const t = monter();
    // Le départ demande l'autorisation de la caméra puis ouvre la session :
    // deux promesses avant que l'écran ne change.
    await act(async () => {
      bouton(t, 'Commencer le scan')!.props.onPress();
    });
    expect(useScanStore.getState().screen).toBe('scan');
  });

  /**
   * LE BOUTON RESTE MORT TANT QUE L'APPAREIL N'EST PAS DIT COMPATIBLE.
   *
   * Un contour qui tourne sur un bouton qui ne fera rien est une promesse en
   * l'air : l'animation s'arrête avec lui.
   */
  it('éteint le bouton sur un appareil incompatible', () => {
    useScanStore.setState({ supported: false });
    const t = monter();
    expect(bouton(t, 'Commencer le scan')!.props.disabled).toBe(true);
    expect(textes(t)).toContain('pas compatible');
  });
});
/**
 * « MES SCANS » EST CENTRÉ DANS SON BOUTON.
 *
 * Le mot et la pastille du compte vivaient côte à côte : c'est donc le
 * COUPLE qui se centrait, et le mot se retrouvait poussé à gauche du milieu
 * — d'autant plus loin que le nombre est long. Un bouton dont le texte
 * bouge selon le nombre de scans qu'on possède ne se lit pas comme un
 * bouton.
 *
 * La pastille se pose donc PAR RAPPORT au mot, à son bord droit, et ne pèse
 * plus rien dans le centrage.
 */
describe('le bouton « Mes scans »', () => {
  it('centre son mot, la pastille accrochée à côté', () => {
    // La pastille n'existe qu'avec des relevés à compter.
    act(() => {
      useScanStore.setState({
        saves: [{ id: 's1' }, { id: 's2' }] as never,
      });
    });
    const tree = monter();
    const badge = tree.root
      .findAllByType(View)
      .find((n) => n.props.accessibilityLabel === 'Nombre de scans');
    expect(badge).toBeDefined();
    /*
      ET ELLE EST CENTRÉE SUR LA LIGNE DU MOT.

      Premier jet : la pastille était posée à « 50 % de haut, moins la
      moitié de sa hauteur ». Deux approximations qui s'ajoutent — le
      pourcentage se prend sur la boîte du texte, dont la hauteur dépend de
      l'interligne de la police du téléphone, et la demi-hauteur de la
      pastille était écrite en dur. Elle tombait sous la ligne.

      Un cadre qui occupe TOUTE la hauteur du mot et centre son contenu ne
      dépend d'aucun chiffre : c'est la seule façon que ça tienne d'un
      appareil à l'autre.
    */
    const cadre = badge!.parent!;
    const st = (Array.isArray(cadre.props.style)
      ? Object.assign({}, ...cadre.props.style.filter(Boolean))
      : cadre.props.style) as {
      position?: string;
      left?: string;
      top?: number;
      bottom?: number;
      justifyContent?: string;
    };
    expect(st.position).toBe('absolute');
    expect(st.left).toBe('100%');
    expect(st.top).toBe(0);
    expect(st.bottom).toBe(0);
    expect(st.justifyContent).toBe('center');
    act(() => tree.unmount());
  });
});

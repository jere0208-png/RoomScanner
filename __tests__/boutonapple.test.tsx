/**
 * LE BOUTON APPLE SE VOIT SUR LES DEUX THÈMES.
 *
 * Relevé du patron, capture à l'appui : « le bouton Apple est noir
 * différent ».
 *
 * IL L'ÉTAIT, ET C'ÉTAIT UN NOIR QUI N'APPARTENAIT À PERSONNE. Sa couleur
 * était écrite en dur — `#0B0D12` —, et ce nombre-là n'est pas une couleur de
 * marque : c'est l'ENCRE DU THÈME CLAIR. Sur fond clair, un bouton noir : la
 * règle d'Apple, et le dessin juste. Sur fond sombre, le fond de page vaut
 * `#0D1015` et le bouton `#0B0D12` — un noir plus sombre que la page, à un
 * cheveu près. Il ne se lisait plus comme un bouton mais comme un trou, et
 * c'était le seul des trois à ne pas avoir de contour pour le rattraper.
 *
 * CE QUE DIT APPLE, ET QU'ON SUIVAIT À MOITIÉ. Le bouton « Se connecter avec
 * Apple » se pose en NOIR ou en BLANC — jamais dans une nuance de la charte
 * d'à côté — et l'on prend celui qui tranche sur le fond. Noir sur clair,
 * blanc sur sombre.
 *
 * CE QUE CE BANC TIENT, ET POURQUOI PAR LA MESURE. Vérifier « il est blanc en
 * sombre » n'empêcherait pas de le repeindre demain dans un gris de la
 * palette. On mesure donc ce qui compte vraiment : l'ÉCART DE CLARTÉ avec le
 * fond de la page. C'est la propriété qu'on veut, et elle survit à n'importe
 * quel changement de teinte.
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
import { StyleSheet, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { SignInScreen } from '../src/screens/SignInScreen';
import { useScanStore } from '../src/store/scanStore';
import { dark, light } from '../src/theme';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  act(() => useScanStore.setState({ themePref: 'system' }));
});

const monter = (theme: 'light' | 'dark') => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({ themePref: theme });
    t = TestRenderer.create(<SignInScreen />);
  });
  arbre = t;
  return t;
};

/** Le style d'un bouton, ses états de pression résolus. */
const styleDe = (t: TestRenderer.ReactTestRenderer, nom: string) => {
  const n = t.root.findAll(
    (x) =>
      typeof x.props?.onPress === 'function' &&
      String(x.props?.accessibilityLabel ?? '') === nom,
  )[0];
  expect(`${nom} : ${!!n}`).toBe(`${nom} : true`);
  const brut =
    typeof n.props.style === 'function'
      ? n.props.style({ pressed: false })
      : n.props.style;
  return (StyleSheet.flatten(brut) ?? {}) as Record<string, string>;
};

/** La couleur du texte porté par un bouton. */
const encreDe = (t: TestRenderer.ReactTestRenderer, mot: string) => {
  const n = t.root
    .findAllByType(Text)
    .find((x) => String(x.props.children) === mot)!;
  return ((StyleSheet.flatten(n.props.style as never) ?? {}) as Record<
    string,
    string
  >).color;
};

/**
 * LA CLARTÉ D'UNE COULEUR, de zéro (noir) à un (blanc).
 *
 * Les coefficients sont ceux de la luminance perçue : l'œil est bien plus
 * sensible au vert qu'au bleu, et une moyenne simple ferait passer un bleu
 * marine pour aussi clair qu'un vert olive.
 */
const clarte = (hex: string) => {
  const [r, v, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  return (0.2126 * r + 0.7152 * v + 0.0722 * b) / 255;
};

describe('le bouton Apple tranche sur le fond, sur les deux thèmes', () => {
  it('en thème clair, il est sombre', () => {
    const s = styleDe(monter('light'), 'Continuer avec Apple');
    expect(clarte(s.backgroundColor)).toBeLessThan(0.2);
    expect(encreDe(monter('light'), 'Continuer avec Apple')).toBe('#FFFFFF');
  });

  it('en thème sombre, il est CLAIR', () => {
    /*
      C'EST LA RÈGLE D'APPLE, ET C'EST AUSSI LA SEULE QUI MARCHE. Sur un fond
      de page presque noir, un bouton noir n'est pas un bouton discret : c'est
      un trou. Et celui-ci n'avait même pas de contour pour le rattraper,
      contrairement à ses deux voisins.
    */
    const s = styleDe(monter('dark'), 'Continuer avec Apple');
    expect(clarte(s.backgroundColor)).toBeGreaterThan(0.8);
    expect(clarte(encreDe(monter('dark'), 'Continuer avec Apple'))).toBeLessThan(
      0.2,
    );
  });

  it('et dans les deux cas, l’écart avec la page est FRANC', () => {
    /*
      L'ÉPREUVE QUI PORTE LE RELEVÉ, et la seule qui survivra à un changement
      de teinte : ce qu'on veut n'est pas une couleur, c'est un contraste.
      Avant, en sombre, l'écart valait un centième — le bouton et la page
      avaient la même clarté à un cheveu près.
    */
    for (const [nom, palette] of [
      ['clair', light],
      ['sombre', dark],
    ] as const) {
      const s = styleDe(monter(nom === 'clair' ? 'light' : 'dark'), 'Continuer avec Apple');
      const ecart = Math.abs(clarte(s.backgroundColor) - clarte(palette.bg));
      expect(`${nom} : ${ecart > 0.35}`).toBe(`${nom} : true`);
    }
  });

  it('mais les deux autres boutons gardent la surface du thème', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE. Le bouton Apple tranche parce que c'est un
      élément de MARQUE, avec ses propres règles. Les deux autres appartiennent
      à l'application : ils prennent sa surface et son contour, et repeindre
      tout le monde en blanc aurait remplacé un défaut par trois.
    */
    const t = monter('dark');
    for (const nom of ['Continuer avec Google', 'Continuer avec un e-mail']) {
      const s = styleDe(t, nom);
      expect(`${nom} : ${s.backgroundColor}`).toBe(`${nom} : ${dark.surface}`);
    }
  });

  it('et aucun bouton ne porte une couleur du thème d’en face', () => {
    /*
      LA CAUSE PROFONDE, TENUE DIRECTEMENT. Le noir du bouton n'était pas une
      couleur de marque : c'était `light.ink`, écrit en dur, qui se trouvait
      juste dans le thème clair. Une teinte de la palette OPPOSÉE dans un
      écran, c'est toujours un oubli — jamais un choix.
    */
    const t = monter('dark');
    for (const nom of [
      'Continuer avec Apple',
      'Continuer avec Google',
      'Continuer avec un e-mail',
    ]) {
      const s = styleDe(t, nom);
      expect(`${nom} : ${s.backgroundColor}`).not.toBe(`${nom} : ${light.ink}`);
      expect(`${nom} : ${s.backgroundColor}`).not.toBe(`${nom} : ${light.bg}`);
    }
  });
});

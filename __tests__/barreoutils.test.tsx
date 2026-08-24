/**
 * LA RANGÉE D'OUTILS : CE QUI EST ALLUMÉ, ET CE QUE LE PEIGNE ANNONCE.
 *
 * Trois relevés du patron sur la même bande d'écran :
 *
 *   1. « Sur la vue 3D de base au scan, on coche les boutons pour afficher
 *      les meubles et les murs seulement, le reste reste décoché. » Un
 *      modèle qui s'ouvre avec tout allumé — surfaces teintées, plafond,
 *      repères, cotes — ne montre plus le bâti qu'on vient regarder ;
 *   2. « La ligne du Afficher ne va pas jusqu'au dernier bouton. Il doit
 *      faire tous les boutons, et même sur la colonne de droite quand c'est
 *      des éléments à afficher/cacher. » Le peigne s'arrêtait au dernier
 *      outil de la LIGNE ; celui qui déborde à droite — « Murs » sur la
 *      capture — restait dehors, et se lisait donc comme autre chose ;
 *   3. « Le bouton Enregistrer doit être au-dessus du bouton Nord et de tout
 *      autre bouton de la colonne, lorsqu'il est affiché. » Il vivait avec
 *      les commandes, en bas de la colonne, sous le trop-plein de calques :
 *      le geste le plus important de l'écran était le plus bas.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Line } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { ResultScreen } from '../src/screens/ResultScreen';
import { RangeeOutils } from '../src/components/RangeeOutils';
import { getStyles } from '../src/screens/result/styles';
import { useScanStore } from '../src/store/scanStore';
import { light } from '../src/theme';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function monter(dirty = false) {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      screen: 'result',
      scanName: 'Chantier',
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({
        id: r.id,
        name: `Pièce ${i + 1}`,
        floor: null,
      })),
      fixtures: SNAPSHOT_FIXTURES,
      ceiling: [],
      photos: [],
      dirty,
    });
    t = TestRenderer.create(<ResultScreen />);
  });
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
      }
    }
  });
  act(() => jest.advanceTimersByTime(400));
  arbre = t;
  return t;
}

const presser = (t: TestRenderer.ReactTestRenderer, label: string) => {
  const b = t.root
    .findAllByType(TouchableOpacity)
    .find((n) => n.props.accessibilityLabel === label);
  expect(b).toBeDefined();
  act(() => b!.props.onPress());
  act(() => jest.advanceTimersByTime(400));
};

/** Une pastille d'outil est-elle allumée ? (fond bleu = active) */
const allume = (t: TestRenderer.ReactTestRenderer, label: string) => {
  const b = t.root
    .findAllByType(TouchableOpacity)
    .find((n) => n.props.accessibilityLabel === label);
  if (!b) return undefined;
  const st = StyleSheet.flatten(b.props.style) as { backgroundColor?: string };
  return st?.backgroundColor === light.blue;
};

describe('la vue 3D à l’ouverture d’un scan', () => {
  const ALLUMES = ['Meubles', 'Murs'];
  const ETEINTS = ['Cotes', 'Surfaces', 'Nord', 'Repères'];

  it('n’allume que les meubles et les murs', () => {
    const t = monter();
    presser(t, 'Passer en 3D');
    for (const nom of ALLUMES) {
      expect({ [nom]: allume(t, nom) }).toEqual({ [nom]: true });
    }
    for (const nom of ETEINTS) {
      const etat = allume(t, nom);
      if (etat === undefined) continue;
      expect({ [nom]: etat }).toEqual({ [nom]: false });
    }
  });
});

describe('le peigne « Afficher »', () => {
  /*
    ON MONTE LA RANGÉE SEULE, à une largeur qui force le trop-plein.

    Sur l'écran des résultats, sept outils tiennent parfois sur la ligne — le
    banc ne verrait alors jamais la pile de droite, c'est-à-dire justement ce
    que le relevé du patron vise : « la ligne du Afficher ne va pas jusqu'au
    dernier bouton… et même sur la colonne de droite ».
  */
  const outilsFactices = (n: number) =>
    Array.from({ length: n }, (_, i) => (
      <View key={`o${i}`} testID={`o${i}`} />
    ));

  const rangee = (n: number, largeur: number) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <RangeeOutils
          styles={getStyles(light) as unknown as Record<string, object>}
          anim={new Animated.Value(1)}
          largeur={largeur}
          reserve={62}
          bas={10}
          dessus={0}
          elements={outilsFactices(n)}
        />,
      );
    });
    arbre = t;
    return t
      .root.findAllByType(Line)
      .filter((x) => x.props.stroke === '#B6BECB');
  };

  it('descend sur chaque outil de la ligne, et sur la pile de droite', () => {
    // Sept outils sur trois cent quatre-vingt-dix points : quatre tiennent,
    // trois montent à droite.
    const traits = rangee(7, 390);
    const barre = traits.filter((n) => n.props.y1 === n.props.y2);
    const descentes = traits.filter((n) => n.props.y1 !== n.props.y2);
    expect(barre).toHaveLength(1);
    // Quatre descentes pour la ligne, une pour la pile : cinq.
    expect(descentes).toHaveLength(5);
  });

  it('et la barre va jusqu’à la dernière descente', () => {
    const traits = rangee(7, 390);
    const barre = traits.find((n) => n.props.y1 === n.props.y2)!;
    const descentes = traits.filter((n) => n.props.y1 !== n.props.y2);
    const plusADroite = Math.max(...descentes.map((n) => Number(n.props.x1)));
    expect(Number(barre.props.x2)).toBeGreaterThanOrEqual(plusADroite - 0.5);
  });

  it('s’arrête au dernier outil quand ils tiennent tous sur la ligne', () => {
    // Rien à rejoindre : la barre ne déborde pas vers une pile absente.
    const traits = rangee(3, 390);
    const descentes = traits.filter((n) => n.props.y1 !== n.props.y2);
    expect(descentes).toHaveLength(3);
  });
});

describe('le bouton Enregistrer', () => {
  it('se tient au-dessus de tout le reste de la colonne', () => {
    const t = monter(true);
    const pastille = (label: string) => {
      const b = t.root
        .findAllByType(TouchableOpacity)
        .find((n) => n.props.accessibilityLabel === label);
      if (!b) return null;
      // On remonte au bloc absolu qui porte la pastille : c'est lui qui
      // dit à quelle hauteur elle se tient.
      let n: TestRenderer.ReactTestInstance | null = b;
      while (n) {
        const st = StyleSheet.flatten(n.props?.style) as
          | { position?: string; bottom?: number }
          | undefined;
        if (st?.position === 'absolute' && typeof st.bottom === 'number') {
          return st.bottom;
        }
        n = n.parent;
      }
      return null;
    };
    const save = pastille('Enregistrer');
    const edition = pastille('Édition');
    expect(save).not.toBeNull();
    expect(edition).not.toBeNull();
    // Plus haut que les commandes, donc plus haut que tout le reste.
    expect(save!).toBeGreaterThan(edition!);
  });
});

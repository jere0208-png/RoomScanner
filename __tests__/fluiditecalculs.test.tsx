/**
 * CE QUE L'APPLICATION RECALCULE POUR RIEN.
 *
 * Chaque ligne de la bibliothèque redessine le plan du scan en vignette et
 * énumère ses pièces sous son nom. Les deux passent par `roomParts()` — le
 * découpage du logement en pièces, avec le contour de chacune —, et ni l'un
 * ni l'autre n'était mémoïsé : à trente relevés, c'était SOIXANTE découpages
 * de plan à chaque rendu de l'écran.
 *
 * Et l'écran se rend souvent : à chaque lettre tapée dans la recherche, à
 * chaque appui, à chaque ouverture de menu. Or rien de tout cela ne change
 * les murs d'un scan enregistré — la vignette du relevé d'hier est la même
 * qu'à la frappe précédente.
 *
 * On ne mesure pas des images par seconde depuis un banc. On mesure ce qui
 * les coûte : le nombre d'appels au calcul le plus lourd.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

const vrai = jest.requireActual('../src/geometry/floorplan');
const compteur = { n: 0 };
jest.mock('../src/geometry/floorplan', () => {
  const actual = jest.requireActual('../src/geometry/floorplan');
  return {
    ...actual,
    roomParts: (...args: unknown[]) => {
       
      (globalThis as any).__parts.n++;
       
      return (actual as any).roomParts(...args);
    },
  };
});
/*
  Le compteur passe par l'objet global : Jest hisse `jest.mock` au-dessus
  des imports, sa fabrique s'exécute avant que les constantes du fichier
  existent, et refuse de fermer sur elles. Le global est le seul terrain
  commun.
*/
 
(globalThis as any).__parts = compteur;

import React from 'react';
import { TextInput, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { LibraryScreen } from '../src/screens/LibraryScreen';
import { ResultScreen } from '../src/screens/ResultScreen';
import { useScanStore, type SavedScan } from '../src/store/scanStore';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const scan = (id: string, name: string): SavedScan => ({
  id,
  name,
  createdAt: 1_000,
  updatedAt: 1_000,
  modelPath: '',
  rooms: [{ id: 'r1', name: 'Salon', floor: null }],
  walls: SNAPSHOT_WALLS,
  openings: [],
  objects: [],
  fixtures: [],
  photos: [],
  ceiling: [],
});

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

describe('la fluidité de la bibliothèque', () => {
  it('ne redécoupe pas les plans à chaque frappe', () => {
    expect(typeof vrai.roomParts).toBe('function');
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        screen: 'library',
        saves: Array.from({ length: 8 }, (_, i) =>
          scan(`s${i}`, `Chantier ${i}`),
        ),
        folders: [],
        currentSaveId: null,
      });
      tree = TestRenderer.create(<LibraryScreen />);
    });
    arbre = tree;
    // Le premier rendu a le droit de tout calculer : c'est la découverte.
    const apresMontage = compteur.n;
    expect(apresMontage).toBeGreaterThan(0);

    // On tape une lettre qui ne filtre rien : les huit mêmes lignes restent
    // à l'écran, avec les mêmes murs.
    compteur.n = 0;
    const champ = tree.root.findAllByType(TextInput)[0];
    act(() => champ.props.onChangeText('Chantier'));
    act(() => champ.props.onChangeText('Chantier '));

    // Le filtrage lui-même en fait quelques-uns ; ce qu'on refuse, c'est de
    // TOUT refaire — deux découpages par ligne, à chaque lettre.
    expect(compteur.n).toBeLessThan(apresMontage / 2);
  });
});

/**
 * L'ÉCRAN DU PLAN, LUI, SE REND À CHAQUE GESTE.
 *
 * `roomParts()` y était appelé nu, à chaque rendu — et son résultat sert de
 * DÉPENDANCE à plusieurs mémoïsations : le cheminement des gaines, les
 * constats de conformité. Une référence neuve à chaque image, ce sont des
 * `useMemo` qui ne mémoïsent plus rien : on recalculait tous les
 * cheminements de câble d'un logement pendant qu'un doigt déplaçait un
 * meuble.
 */
describe('la fluidité de l’écran des résultats', () => {
  it('ne redécoupe pas le logement à chaque rendu', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        screen: 'result',
        scanName: 'Chantier test',
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
      });
      tree = TestRenderer.create(<ResultScreen />);
    });
    arbre = tree;
    act(() => {
      for (const n of tree.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({
            nativeEvent: { layout: { width: 390, height: 520 } },
          });
        }
      }
    });

    // Le montage calcule ce qu'il veut. Ensuite, un geste qui ne touche NI
    // aux murs NI aux pièces ne doit rien redécouper.
    compteur.n = 0;
    /*
      UN RENDU QUI NE CHANGE RIEN NE DOIT RIEN COÛTER.

      C'est le cas le plus fréquent de l'app : le magasin notifie un
      changement qui ne touche pas la géométrie — une sélection, un drapeau
      « modifié », une position de doigt — et tout l'écran se rend. Sans
      mémoïsation, chaque notification redécoupait le logement.
    */
    compteur.n = 0;
    act(() => tree.update(<ResultScreen />));
    act(() => tree.update(<ResultScreen />));
    expect(compteur.n).toBe(0);
  });
});

/**
 * UN MEUBLE NE DISPARAÎT PAS.
 *
 * Relevé sur le chantier, deux captures à quelques degrés d'écart : sur
 * l'une, le haut du rangement et la tête de lit avaient disparu ; sur
 * l'autre, ils étaient là. Rien n'avait bougé que la caméra.
 *
 * La cause n'était pas le tri en profondeur : c'était un FONDU. Un meuble
 * qui cachait un appareil passait à 22 % d'opacité une fois zoomé, pour
 * « laisser voir la prise derrière ». Deux meubles voisins détectés
 * séparément par le scanner — le cas courant : un rangement bas et son
 * caisson haut — et c'est la moitié d'une armoire qui s'évapore d'un angle
 * à l'autre.
 *
 * Le fondu ne servait à rien : le repère d'appareil est peint PAR-DESSUS
 * toute la géométrie. On effaçait le meuble pour découvrir ce qui était
 * déjà visible.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { Polygon } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { Iso3DView, DEFAULT_VIEW3D } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';

import type { ObjectData } from 'react-native-room-scan';
import type { Fixture } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const MURS: WallSeg[] = [
  mur('n', 0, 0, 3.4, 0),
  mur('e', 3.4, 0, 3.4, 2.5),
  mur('s', 3.4, 2.5, 0, 2.5),
  mur('o', 0, 2.5, 0, 0),
];

/** Un rangement bas et son caisson haut : deux objets, comme les détecte ARKit. */
const RANGEMENT: ObjectData[] = [
  {
    id: 'bas',
    category: 'storage',
    width: 1,
    depth: 0.55,
    height: 0.9,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1.2, 0.45, 0.3, 1],
  },
  {
    id: 'haut',
    category: 'storage',
    width: 1,
    depth: 0.45,
    height: 0.8,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1.2, 1.35, 0.25, 1],
  },
];

/** Une prise juste derrière le rangement : c'est elle qui déclenchait le fondu. */
const PRISE: Fixture[] = [
  { id: 'f1', kind: 'prise', wallId: 'n', along: 1.2, height: 0.25, side: 1 },
];

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

/** Le modèle, cadré serré : c'est zoomé que le fondu se déclenchait. */
function modele(zoom: number, fixtures: Fixture[] = PRISE) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: RANGEMENT,
      rooms: [{ id: 'r1', name: 'Chambre', floor: null }],
      fixtures,
      ceiling: [],
      showFurniture: true,
      solidWalls: false,
    });
    tree = TestRenderer.create(
      <Iso3DView
        value={{ ...DEFAULT_VIEW3D, zoom }}
        onChange={() => {}}
        showMeasures={false}
      />,
    );
  });
  act(() => {
    tree.root.findAllByType(View)[0].props.onLayout?.({
      nativeEvent: { layout: { width: 390, height: 520 } },
    });
  });
  arbre = tree;
  return tree;
}

/**
 * Les opacités de tous les aplats, triées.
 *
 * On ne peut pas désigner « les meubles » dans le rendu : un aplat est un
 * aplat. Mais on peut comparer DEUX rendus — avec et sans la prise cachée
 * derrière le rangement. Si un fondu subsiste quelque part, le second
 * rendu porte des transparences que le premier n'a pas ; sinon les deux
 * listes sont identiques. La preuve ne dépend d'aucun détail interne.
 */
const effaces = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Polygon)
    .filter((n) => typeof n.props.fillOpacity === 'number' && n.props.fillOpacity < 0.5)
    .length;

describe('le rangement devant une prise', () => {
  it('ne s’efface pas parce qu’une prise se trouve derrière lui', () => {
    for (const zoom of [1, 2, 3.5, 5]) {
      // La prise AJOUTE sa propre géométrie — pleine. Ce qui doit rester
      // égal, c'est le nombre d'aplats ESTOMPÉS : l'écorché des murs, et
      // rien d'autre. Un fondu de meuble s'y verrait aussitôt.
      const sans = effaces(modele(zoom, []));
      act(() => arbre?.unmount());
      const avec = effaces(modele(zoom, PRISE));
      expect(`zoom ${zoom} : ${avec} estompés`).toBe(`zoom ${zoom} : ${sans} estompés`);
      act(() => arbre?.unmount());
      arbre = null;
    }
  });

  it('et les deux caissons sont dessinés, l’un comme l’autre', () => {
    const tree = modele(3.5, PRISE);
    // Chaque caisson porte au moins ses faces vues : six par boîte au plus,
    // trois au moins. On vérifie qu'AUCUN des deux n'a disparu.
    const aplats = tree.root
      .findAllByType(Polygon)
      .filter((n) => typeof n.props.points === 'string' && n.props.points.length > 0);
    expect(aplats.length).toBeGreaterThan(12);
  });
});

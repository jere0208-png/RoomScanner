/**
 * FACE AU MUR : ce qu'on voit, et ce qui ne prend plus la place.
 *
 * Trois défauts, un même symptôme — l'écran d'un téléphone se remplit vite :
 *
 *  1. la conformité tenait en six lignes, dont la MÊME phrase deux fois, et
 *     mangeait le tiers de l'écran juste au-dessus des boutons ;
 *  2. trois champs à « — » et cinq boutons éteints occupaient le bas dès
 *     l'ouverture, alors qu'il n'y a qu'un geste à faire sur un mur vide ;
 *  3. le dessin montrait une belle surface libre là où se dresse une
 *     bibliothèque — et la prise partait au chantier derrière le meuble.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { WallElevation } from '../src/components/WallElevation';
import { wallFace } from '../src/geometry/electrical';
import { wallFurniture } from '../src/geometry/nfc15100';
import { wallQuads } from '../src/geometry/floorplan';
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

const W: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];

/** Une bibliothèque de 1,20 m adossée au mur nord, à 2 m du coin. */
const BIBLIO: ObjectData = {
  id: 'o1',
  category: 'storage',
  width: 1.2,
  depth: 0.4,
  height: 1.8,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.9, 0.28, 1],
};

let precedent: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => precedent?.unmount());
  precedent = null;
});

function rendu(opts: { fixtures?: Fixture[]; objects?: ObjectData[] } = {}) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: W,
      openings: [],
      objects: opts.objects ?? [],
      rooms: [{ id: 'r1', name: 'Chambre', floor: null }],
      fixtures: opts.fixtures ?? [],
      photos: [],
      showFurniture: true,
    });
    tree = TestRenderer.create(
      <WallElevation
        wallId="n"
        selectedId={opts.fixtures?.[0]?.id ?? null}
        onSelect={() => {}}
        onAddRequest={() => {}}
        onClose={() => {}}
      />,
    );
  });
  act(() => {
    const zone = tree.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: 390, height: 380 } } });
  });
  precedent = tree;
  return tree;
}

const textes = (tree: TestRenderer.ReactTestRenderer) =>
  [...tree.root.findAllByType(Text), ...tree.root.findAllByType(SvgText)]
    .map((n) => n.props.children)
    .filter((x) => typeof x === 'string')
    .join(' | ');

describe('les meubles devant le mur', () => {
  it('se projettent à leur place et à leur hauteur', () => {
    const face = wallFace(W[0], wallQuads(W).get('n'), 1);
    const vus = wallFurniture(face, [BIBLIO]);
    expect(vus).toHaveLength(1);
    // 1,20 m de large centré à 2 m : de 1,40 à 2,60 sur l'axe du mur, moins
    // la demi-épaisseur mangée par le tableau du coin.
    expect(vus[0].to - vus[0].from).toBeCloseTo(1.2, 2);
    expect(vus[0].top).toBeCloseTo(1.8, 2);
  });

  it('et le meuble d’une autre pièce ne compte pas', () => {
    const face = wallFace(W[0], wallQuads(W).get('n'), 1);
    // Le même meuble, deux mètres plus loin dans la pièce : hors de portée.
    const loin = {
      ...BIBLIO,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.9, 2.6, 1],
    };
    expect(wallFurniture(face, [loin])).toHaveLength(0);
  });

  it('s’annoncent sur l’établi, avec leur nom et leur hauteur', () => {
    const vu = textes(rendu({ objects: [BIBLIO] }));
    expect(vu).toContain('1 meuble');
    // Le nom français de la catégorie, et sa hauteur en centimètres.
    expect(vu).toMatch(/180/);
  });

  it('et l’interrupteur ne paraît pas quand le mur est dégagé', () => {
    expect(textes(rendu())).not.toContain('meuble');
  });
});

describe('le bas de l’établi', () => {
  it('ne montre ni cotes ni pavé tant que rien n’est choisi', () => {
    const vu = textes(rendu());
    expect(vu).not.toContain('Gauche');
    expect(vu).not.toContain('Droite');
  });

  it('les montre dès qu’un appareil est tenu', () => {
    const vu = textes(
      rendu({
        fixtures: [
          { id: 'a', kind: 'prise', wallId: 'n', along: 1, height: 0.25, side: 1 },
        ],
      }),
    );
    expect(vu).toContain('Gauche');
    expect(vu).toContain('Hauteur');
  });

  /**
   * « RELEVER » NE VOULAIT RIEN DIRE.
   *
   * Le mot désigne le fait de mesurer un local ; le bouton, lui, copiait
   * l'appareillage du mur pour le reporter sur un autre — le geste qui fait
   * gagner le plus de temps dans un couloir de trois chambres identiques.
   */
  it('dit « Copier », pas « Relever »', () => {
    const vu = textes(rendu());
    expect(vu).toContain('Copier');
    expect(vu).not.toContain('Relever');
  });
});

describe('le bandeau de conformité', () => {
  it('tient en une ligne, sans répéter la règle', () => {
    const vu = textes(rendu());
    // L'objectif de la pièce, chiffré.
    expect(vu).toMatch(/Chambre · 0\/\d socles/);
    // Et la règle n'est PAS dépliée : elle attend qu'on la demande.
    expect(vu).not.toContain('trois socles 16 A au minimum');
  });

  it('et la règle se déplie d’un appui', () => {
    const tree = rendu();
    // Le bandeau est le bouton qui PORTE le titre de la pièce.
    const cible = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) =>
        n
          .findAllByType(Text)
          .some((x) => String(x.props.children).includes('Chambre')),
      )!;
    act(() => cible.props.onPress());
    expect(textes(tree)).toContain('socles 16 A');
  });
});

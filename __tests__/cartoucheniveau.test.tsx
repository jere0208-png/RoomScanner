/**
 * LE CARTOUCHE D'UNE PIÈCE SUIT SON CALQUE — DANS LES DEUX MODES.
 *
 * Relevé du patron : « lors du mode édition, le plan affiche le nom de la
 * pièce, il ne faut pas tant que la surface n'est pas affichée. »
 *
 * DEUX VERSIONS, ET LA PREMIÈRE AVAIT UN BON ARGUMENT.
 *
 * Première : le cartouche restait allumé en édition quoi qu'il arrive, calque
 * éteint compris. C'est par lui qu'on nomme une pièce, et « un réglage
 * d'AFFICHAGE ne doit jamais retirer un outil de travail ».
 *
 * Seconde : l'argument se retourne. Un calque qu'on éteint et qui reste
 * allumé dans un mode, c'est un interrupteur qui ne commande pas ce qu'il
 * annonce — et l'on entre en édition pour POSER : le nom d'une pièce vient
 * alors se mettre entre le doigt et ce qu'on pose, alors même qu'on l'avait
 * éteint.
 *
 * CE QUE CELA COÛTE EST MESURÉ ICI AUSSI, et pas seulement écrit : calque
 * ALLUMÉ, le cartouche revient — dans les deux modes, et sur une pièce SANS
 * NOM aussi, où il porte alors sa surface. Le chemin du nommage n'a pas
 * disparu ; il passe par le calque qui porte justement les noms et les
 * surfaces, c'est-à-dire là où on le chercherait.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Text as SvgText } from 'react-native-svg';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const PIECE = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

/** Monte le plan, avec ou sans le calque des surfaces, en lecture ou en édition. */
function plan(surfaces: boolean, edition: boolean, nom = 'Séjour') {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: PIECE,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: nom, floor: null }],
      fixtures: [],
      ceiling: [],
      photos: [],
      showFurniture: true,
      showSurfaces: surfaces,
    });
    t = TestRenderer.create(
      <FloorplanEditor
        showMeasures
        editable={edition}
        selectedWallId={null}
        onSelectWall={() => {}}
      />,
    );
  });
  act(() => {
    t.root.findAllByType(View)[0].props.onLayout?.({
      nativeEvent: { layout: { width: 700, height: 560 } },
    });
  });
  arbre = t;
  return t;
}

/** Tous les mots écrits sur le plan. */
const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(SvgText)
    .map((n) =>
      Array.isArray(n.props.children)
        ? n.props.children.join('')
        : String(n.props.children ?? ''),
    )
    .join(' | ');

describe('le nom d’une pièce ne paraît qu’avec son calque', () => {
  it('calque éteint, EN ÉDITION : pas de nom sur le plan', () => {
    expect(mots(plan(false, true))).not.toContain('Séjour');
  });

  it('ni en lecture, évidemment', () => {
    expect(mots(plan(false, false))).not.toContain('Séjour');
  });

  /*
    LE CONTRÔLE EN SENS INVERSE, et il porte tout le lot : couper le cartouche
    partout passerait les deux épreuves du dessus sans rien valoir — et ferait
    perdre le seul chemin par lequel on nomme une pièce. Calque ALLUMÉ, il est
    là, dans les deux modes.
  */
  it('mais calque allumé, il revient — en lecture comme en édition', () => {
    expect(mots(plan(true, false))).toContain('Séjour');
    expect(mots(plan(true, true))).toContain('Séjour');
  });

  /*
    ET LA PORTE DU NOMMAGE RESTE OUVERTE, calque allumé.

    C'est ce qu'il fallait vérifier avant de couper quoi que ce soit : une
    pièce SANS NOM garde son cartouche — il porte alors sa surface, « 20,0 m² »,
    et c'est lui qu'on touche pour la nommer. Le chemin n'a pas disparu, il
    passe par le calque qui porte justement les noms et les surfaces.

    (L'invite « Nommer » en toutes lettres ne paraît que sur une pièce dont on
    ne sait RIEN — ni nom, ni surface. Une pièce mesurée montre sa mesure : un
    cartouche vide serait plus pauvre que celui-là.)
  */
  it('et une pièce sans nom garde son cartouche, donc sa porte', () => {
    const vu = mots(plan(true, true, ''));
    expect(vu).toContain('20,0 m²');
    // Et calque éteint, plus rien — c'est bien le calque qui commande.
    expect(mots(plan(false, true, ''))).not.toContain('20,0 m²');
  });
});

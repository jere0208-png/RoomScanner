/**
 * LA SURFACE NE SE VOIT PAS À TRAVERS LES MURS.
 *
 * Relevé du patron : « la surface du plan 3D d'un scan doit pas se voir à
 * travers les murs ».
 *
 * Deux choses portent ce nom-là sur le modèle, et les DEUX flottaient : le
 * semis de points qui dit le sol, et l'étiquette « Séjour · 12,0 m² ». Ce
 * n'est pas un défaut de tri — c'est un défaut d'ARCHITECTURE du rendu.
 *
 * Le modèle se dessine en deux couches : la géométrie (murs, meubles,
 * appareillage), qui part au canevas natif, et par-dessus une couche de
 * balises pour ce qui porte du TEXTE — repères de circuit, semis, étiquettes
 * de pièce. La seconde couche est, par construction, au-dessus de la
 * première : elle ne peut pas être cachée par un mur, quel que soit son rang
 * dans le tri.
 *
 * C'était même écrit noir sur blanc dans le code : « posé par-dessus tout le
 * reste : c'est une annotation, pas un volume — un mur ne doit pas la
 * trancher ». Le patron dit l'inverse, et il a raison sur un MODÈLE : ce
 * qu'on regarde là, c'est un volume vu de l'extérieur. Une pièce qu'on ne
 * voit pas ne doit pas annoncer sa surface — sans quoi on lit « 9,0 m² » sur
 * une façade aveugle, et l'on ne sait plus quelle pièce on regarde.
 *
 * Deux remèdes, un par couche :
 *
 *   — LE SEMIS descend dans la géométrie. Il y était déjà par sa
 *     profondeur (le sol passe avant tout) ; il lui manquait d'être dans la
 *     bonne COUCHE ;
 *   — L'ÉTIQUETTE reste une balise — c'est du texte, il doit rester net —
 *     mais elle ne se dessine plus quand un pan de mur PLEIN se dresse entre
 *     l'œil et son point. En écorché, elle reste : le mur y est justement
 *     effacé pour qu'on voie la pièce.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
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

/** Une pièce fermée : quatre murs, aucune ouverture. */
const MURS: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

/** Le modèle, vu de face — un mur plein se dresse devant la pièce. */
function modele(mursPleins: boolean) {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
      fixtures: [],
      ceiling: [],
      photos: [],
      showFurniture: true,
      showSurfaces: true,
    });
    t = TestRenderer.create(
      <Iso3DView
        value={{ theta: 0, tilt: 80, zoom: 1, ox: 0, oy: 0 }}
        cutaway={!mursPleins}
      />,
    );
  });
  act(() => {
    for (const n of t.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 560 } } });
      }
    }
  });
  arbre = t;
  return t;
}

/** Les mots écrits sur le modèle. */
const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(SvgText)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string')
        .join(''),
    )
    .join(' | ');

describe('l’étiquette de surface, derrière un mur plein', () => {
  it('ne s’écrit pas sur la façade qui la cache', () => {
    /*
      VUE PRESQUE DE PLAIN-PIED (huit degrés) : c'est là que le pan de
      devant bouche la piece. En plongee, on regarde PAR-DESSUS le mur et
      l'etiquette est legitimement visible — le banc viserait a cote.
    */
    expect(mots(modele(true))).not.toMatch(/12,5|Séjour/);
  });

  it('mais reste là dès que le mur s’efface', () => {
    // En écorché, le pan qui nous fait face passe à quinze pour cent : la
    // pièce se voit, donc son étiquette aussi.
    expect(mots(modele(false))).toMatch(/Séjour/);
  });
});

describe('le semis du sol', () => {
  it('appartient à la géométrie, pas à la couche des textes', () => {
    /*
      LA COUCHE DÉCIDE, PAS LA PROFONDEUR.

      Le semis se classait déjà sous tout le reste (`-Infinity`), et il se
      voyait quand même à travers les murs : il vivait dans la couche des
      balises, posée PAR-DESSUS la géométrie. On vérifie donc la couche —
      c'est elle qui a le dernier mot.
    */
    const t = modele(true);
    const cercles = t.root.findAll(
      (n) => typeof n.props?.cx === 'number' && n.props?.r === 1.1,
    );
    expect(cercles).toHaveLength(0);
  });
});

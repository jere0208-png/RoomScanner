/**
 * LE BANDEAU D'ENSEMBLE SE TOUCHE AVEC UN POUCE, pas avec une souris.
 *
 * Deux appareils réunis sous une même plaque ouvrent un réglage : de quel
 * côté se pose le second, et sur quel axe la plaque se centre. Tout tenait
 * sur une ligne — quatre flèches de 30 × 26 points, deux étiquettes de dix
 * points, un « Séparer » sans fond. Apple demande 44 points de côté pour
 * une cible tactile, et ce n'est pas un caprice : en dessous, un doigt sur
 * deux tombe sur le bouton voisin — ici, celui qui déplace la prise du
 * mauvais côté.
 *
 * On vérifie donc la seule chose qui compte : toute commande de ce bandeau
 * fait au moins 44 points de haut.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('react-native-room-scan', () => ({
  RoomScan: { takePhoto: jest.fn(async () => null) },
  scanEvents: { addListener: jest.fn(), removeAllListeners: jest.fn() },
}));

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { WallElevation } from '../src/components/WallElevation';
import { useScanStore } from '../src/store/scanStore';
import { dark, light } from '../src/theme';

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
/** Deux prises voisines : celles qu'on vient de réunir sous une plaque. */
const FX: Fixture[] = [
  { id: 'a', kind: 'prise', wallId: 'n', along: 1, height: 0.25, side: 1 },
  { id: 'b', kind: 'prise', wallId: 'n', along: 1.07, height: 0.25, side: 1 },
];

/**
 * L'arbre précédent doit Être DÉMONTÉ avant d'en monter un autre.
 *
 * Le piège coûte une demi-heure quand on ne le connaît pas : l'établi
 * consomme `pendingJoin` dès qu'il le voit et le remet à null. Un arbre
 * resté monté du test précédent le consomme donc à la place du nouveau,
 * qui s'affiche sans son bandeau — et le test échoue en accusant le
 * composant.
 */
let precedent: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => precedent?.unmount());
  precedent = null;
});

function rendu() {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: W,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
      fixtures: FX,
      photos: [],
      // C'est ainsi que le store annonce une fusion : l'établi doit alors
      // proposer le côté, sans qu'on ait eu à glisser quoi que ce soit.
      pendingJoin: { base: 'a', moved: 'b' },
    });
    tree = TestRenderer.create(
      <WallElevation
        wallId="n"
        selectedId="b"
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
    zone.props.onLayout({
      nativeEvent: { layout: { width: 390, height: 420 } },
    });
  });
  precedent = tree;
  return tree;
}

/** Les textes visibles, mis à plat. */
const textes = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .filter((x) => typeof x === 'string')
    .join(' | ');

/**
 * La cible EFFECTIVE d'un bouton : ce que le doigt peut atteindre.
 *
 * Ce n'est pas la taille du dessin. iOS distingue les deux : une croix de
 * 32 points avec 8 points de débord se touche sur 48. C'est cette
 * distinction qui permet de garder une interface fine ET sûre.
 */
const cible = (props: {
  style?: unknown;
  hitSlop?: { top?: number; bottom?: number } | number;
}): number => {
  const plat = StyleSheet.flatten(props.style as never) as
    | { minHeight?: number; height?: number }
    | undefined;
  const base = plat?.minHeight ?? plat?.height ?? 0;
  if (base === 0) return 0;
  const slop = props.hitSlop;
  const debord =
    typeof slop === 'number'
      ? slop * 2
      : (slop?.top ?? 0) + (slop?.bottom ?? 0);
  return base + debord;
};

describe('le bandeau d’un ensemble', () => {
  it('s’ouvre dès que le store annonce la fusion', () => {
    expect(textes(rendu())).toContain('Ensemble 2 postes');
  });

  it('pose ses questions une par une, en clair', () => {
    const vu = textes(rendu());
    expect(vu).toContain('CÔTÉ DU SECOND POSTE');
    expect(vu).toContain('AXE DE RÉFÉRENCE');
    // Les côtés se lisent, ils ne sont plus quatre flèches muettes.
    expect(vu).toContain('Gauche');
    expect(vu).toContain('Droite');
    expect(vu).toContain('Centré');
  });

  /**
   * LA RÈGLE DES 44 POINTS.
   *
   * On ne mesure pas le rendu — un test ne voit pas de pixels — mais la
   * hauteur que le style IMPOSE. C'est elle qui décide de la cible.
   */
  it('et toute commande de cet écran fait 44 points sous le doigt', () => {
    const tree = rendu();
    const boutons = tree.root
      .findAllByType(TouchableOpacity)
      .filter((n) => cible(n.props) > 0);
    // Le bandeau en apporte au moins six : quatre côtés, deux axes.
    expect(boutons.length).toBeGreaterThanOrEqual(6);
    for (const b of boutons) expect(cible(b.props)).toBeGreaterThanOrEqual(44);
  });

  /**
   * « Séparer » défait le travail : il se dit en rouge, et il se dit en
   * entier. « Séparer » tout court, dans un coin sans fond, se lisait
   * comme une note et se touchait par accident.
   */
  it('et « Séparer » s’annonce en clair, à part', () => {
    const tree = rendu();
    expect(textes(tree)).toContain('Séparer les appareils');
    const libelle = tree.root
      .findAllByType(Text)
      .find((n) => n.props.children === 'Séparer les appareils')!;
    const style = StyleSheet.flatten(libelle.props.style) as { color?: string };
    // La couleur d'alerte du thème, celle des actions destructives.
    expect([light.danger, dark.danger]).toContain(style.color);
  });
});

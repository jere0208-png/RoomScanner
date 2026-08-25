/**
 * LES QUATRE HAUTEURS DE RÉFÉRENCE NE DOIVENT PAS MANGER LE MUR.
 *
 * Défaut connu, noté et chiffré depuis longtemps : « en élévation, les
 * libellés de hauteur se serrent contre le bord droit du mur ». Ce ne sont
 * pas des décorations — plinthe 25, commande 110, tableau 135, applique
 * 210 sont les quatre lignes sur lesquelles toute l'installation se pose, et
 * les voir en filigrane fait repérer d'un coup l'appareil qui n'est aligné
 * avec rien.
 *
 * Mais ils étaient écrits À L'INTÉRIEUR du dessin, calés sur le bord droit :
 * « commande 110 » fait une cinquantaine de points à huit de corps, soit
 * près d'un mètre de mur recouvert, à quatre hauteurs différentes, juste là
 * où l'on pose les prises de plan de travail et les interrupteurs d'entrée.
 * Ils s'empilaient tous du même côté, celui-là même où la place manque
 * toujours.
 *
 * Ce banc mesure ce qu'on ne voyait qu'à l'œil : la boîte de chaque libellé
 * ne doit pas mordre sur le champ du mur, et le mot doit rester lisible —
 * l'abréger jusqu'à le rendre muet ne serait pas une correction.
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
import { View } from 'react-native';
import { Line, Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { WallElevation } from '../src/components/WallElevation';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/** Un séjour de 6 × 4 : le mur nord fait six mètres. */
const W: WallSeg[] = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 4),
  mur('s', 6, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];

function rendu(largeur = 700, hauteur = 420) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: W,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
      fixtures: [],
      photos: [],
    });
    tree = TestRenderer.create(
      <WallElevation
        wallId="n"
        selectedId={null}
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
    zone.props.onLayout({ nativeEvent: { layout: { width: largeur, height: hauteur } } });
  });
  arbre = tree;
  return tree;
}

/**
 * Le champ du mur, lu sur les lignes de référence elles-mêmes : ce sont les
 * seuls traits qui courent d'un bout à l'autre de la face.
 */
const champDuMur = (tree: TestRenderer.ReactTestRenderer) => {
  const lignes = tree.root
    .findAllByType(Line)
    .filter((n) => n.props.strokeDasharray === '2 6' && n.props.x1 !== n.props.x2);
  expect(lignes.length).toBeGreaterThan(0);
  return { x0: Number(lignes[0].props.x1), x1: Number(lignes[0].props.x2) };
};

/** Les libellés des quatre hauteurs, avec leur boîte estimée. */
const libelles = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(SvgText)
    .filter((n) => /\d{2,3}\b/.test(String(n.props.children ?? '')))
    .filter((n) => Number(n.props.fontSize) <= 9)
    .map((n) => {
      const mot = String(n.props.children);
      // Une lettre de corps 8 mesure un peu plus de la moitié de son corps.
      const large = mot.length * Number(n.props.fontSize) * 0.55;
      const x = Number(n.props.x);
      const debut = n.props.textAnchor === 'end' ? x - large : x;
      return { mot, debut, fin: debut + large };
    });

describe('les hauteurs de référence, en élévation', () => {
  it('sont toutes là : plinthe, commande, tableau, applique', () => {
    const mots = libelles(rendu()).map((l) => l.mot);
    for (const attendu of ['25', '110', '135', '210']) {
      expect(mots.join(' ')).toContain(attendu);
    }
  });

  it('n’écrivent pas par-dessus le mur', () => {
    /*
      C'EST LA MESURE DU DÉFAUT. Écrits à l'intérieur du champ, calés sur le
      bord droit, ils recouvraient près d'un mètre de mur à quatre hauteurs —
      celles-là mêmes où se posent les prises de plan de travail et les
      commandes. On les veut DEHORS, dans la marge que le cadre garde déjà de
      chaque côté.
    */
    const tree = rendu();
    const { x0, x1 } = champDuMur(tree);
    for (const l of libelles(tree)) {
      const mord = l.fin > x0 + 1 && l.debut < x1 - 1;
      expect(`${l.mot} mord le mur`).toBe(mord ? 'jamais' : `${l.mot} mord le mur`);
    }
  });

  it('tiennent dans le cadre, même sur un écran étroit', () => {
    // Un téléphone en portrait : la marge se réduit, le libellé doit se
    // raccourcir plutôt que sortir de la feuille.
    const largeur = 360;
    const tree = rendu(largeur, 520);
    for (const l of libelles(tree)) {
      expect(l.debut).toBeGreaterThanOrEqual(0);
      expect(l.fin).toBeLessThanOrEqual(largeur);
    }
  });
});

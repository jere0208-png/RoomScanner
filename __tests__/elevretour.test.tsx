/**
 * FACE AU MUR, UN RETOUR SE COTE ET S'AXE — comme le mur lui-même.
 *
 * L'élévation donnait la longueur du mur au-dessus, son milieu en accroche
 * et quatre hauteurs de référence en filigrane. Un mur percé, lui, n'est pas
 * une surface : c'est un retour, un trou, un retour. Et c'est sur ces trente
 * centimètres entre l'angle et l'huisserie qu'on pose l'interrupteur
 * d'entrée — sans jamais savoir combien ils mesuraient, ni où passait leur
 * milieu. Le recalage du store les connaissait pourtant : il déplaçait
 * l'appareil en silence, sans que rien ne l'annonce à l'écran.
 *
 * On vérifie donc ce que la face MONTRE : la cote de chaque retour, son axe,
 * et le fait qu'un mur plein n'en affiche aucun — il a déjà les siens.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

// Le module natif ouvre un `NativeEventEmitter` au chargement : hors
// téléphone, il n'a personne à écouter. On ne teste pas la caméra ici.
jest.mock('react-native-room-scan', () => ({
  RoomScan: { takePhoto: jest.fn(async () => null) },
  scanEvents: { addListener: jest.fn(), removeAllListeners: jest.fn() },
}));

import React from 'react';
import { View } from 'react-native';
import { Line, Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { WallElevation } from '../src/components/WallElevation';
import { masonryRuns, wallFace } from '../src/geometry/electrical';
import { segLength, wallQuads, wallRuns } from '../src/geometry/floorplan';
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

/** Un séjour de 6 × 4, porte de 90 cm posée de biais dans le mur nord. */
const W: WallSeg[] = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 4),
  mur('s', 6, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];
const PORTE: WallSeg = {
  id: 'p1',
  type: 'door',
  a: { x: 2.5, z: 0 },
  b: { x: 3.4, z: 0 },
  height: 2.04,
  yCenter: 1.02,
  roomId: 'r1',
};

const face = () => wallFace(W[0], wallQuads(W).get('n'), 1);
const attendus = () =>
  masonryRuns(wallRuns(W[0], [PORTE]), segLength(W[0]), face()).map((r) =>
    String(Math.round((r.x1 - r.x0) * 100)),
  );

function rendu(perce: boolean) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: W,
      openings: perce ? [PORTE] : [],
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
    // Sans taille, l'élévation ne dessine rien : elle ignore son échelle.
    const zone = tree.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({
      nativeEvent: { layout: { width: 700, height: 420 } },
    });
  });
  return tree;
}

const textes = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(SvgText)
    .map((n) => n.props.children)
    .filter((x) => typeof x === 'string');

/** Les traits verticaux tiretés bleus : les axes des retours. */
const axes = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Line)
    .filter(
      (n) =>
        n.props.strokeDasharray === '2 6' &&
        Math.abs(n.props.x1 - n.props.x2) < 0.001 &&
        Math.abs(n.props.y1 - n.props.y2) > 1,
    );

describe('la face d’un mur percé', () => {
  it('cote chaque retour, en centimètres', () => {
    const vus = textes(rendu(true));
    const veut = attendus();
    expect(veut).toHaveLength(2);
    for (const cote of veut) expect(vus).toContain(cote);
  });

  it('et trace l’axe de chacun, celui sur lequel on s’accroche', () => {
    const traits = axes(rendu(true));
    expect(traits).toHaveLength(2);
    const runs = masonryRuns(wallRuns(W[0], [PORTE]), segLength(W[0]), face());
    // Les deux axes sont dans l'ordre des retours, et l'écart entre eux
    // vaut celui de leurs milieux — à l'échelle près du dessin.
    const ecartDessin = Math.abs(traits[1].props.x1 - traits[0].props.x1);
    const ecartReel =
      (runs[1].x0 + runs[1].x1) / 2 - (runs[0].x0 + runs[0].x1) / 2;
    const echelle = ecartDessin / ecartReel;
    expect(echelle).toBeGreaterThan(10);
    // Le premier axe tombe à sa place sur la face, pas au hasard.
    const gauche = traits[0].props.x1 - ((runs[0].x0 + runs[0].x1) / 2) * echelle;
    const droite = traits[1].props.x1 - ((runs[1].x0 + runs[1].x1) / 2) * echelle;
    expect(gauche).toBeCloseTo(droite, 3);
  });

  it('un mur plein n’en affiche aucun : il a déjà sa cote et son milieu', () => {
    const tree = rendu(false);
    expect(axes(tree)).toHaveLength(0);
    // Sa longueur totale, elle, reste écrite au-dessus.
    expect(textes(tree).some((t) => t.includes('m'))).toBe(true);
  });
});

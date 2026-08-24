/**
 * ON VISE LE MUR, PAS SON HALO.
 *
 * Relevé du patron : « la sélection d'un mur est capricieuse, et un clic au
 * centre de la pièce sélectionne un mur proche… il faut que ce soit le mur
 * qui soit strictement cliquable ».
 *
 * Chaque mur portait une zone de toucher invisible de TRENTE pixels de large,
 * centrée sur son axe : quinze pixels débordant dans la pièce, quinze
 * au-dehors. À l'échelle d'ouverture d'un logement — une quarantaine de
 * pixels par mètre — quinze pixels valent trente-sept centimètres de pièce.
 * Sur un dégagement d'un mètre vingt, les deux halos se rejoignent AU MILIEU :
 * il n'existe plus un seul point où l'on puisse toucher le sol.
 *
 * Le même défaut avait déjà été corrigé sur les retours de mur percés — « 18
 * px de halo débordaient de neuf pixels dans la pièce » — et le mur entier,
 * lui, était resté à trente.
 *
 * La cible suit donc CE QUI EST DESSINÉ : l'épaisseur du poché, plus trois
 * pixels de part et d'autre pour le tremblement du doigt. Elle grandit quand
 * on zoome, comme le mur ; elle ne mord jamais la pièce. Qui vise un mur fin
 * zoome — c'est la règle de tout le plan, et elle vaut mieux qu'un halo qui
 * choisit à notre place.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { Line } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/*
  UN LOGEMENT ENTIER, ET UN PLACARD DEDANS.

  C'est le cas qui rate, et il faut les deux : un grand plan pour que
  l'échelle tombe bas, une petite pièce pour que le halo la traverse. Douze
  mètres dans six cents points font quarante-trois points par mètre ; à
  moitié dézoomé, le placard d'un mètre dix ne fait plus que vingt-quatre
  points de large — et deux halos de trente s'y rejoignent bien avant le
  milieu.
*/
const LOGEMENT = [
  mur('n', 0, 0, 12, 0),
  mur('e', 12, 0, 12, 9),
  mur('s', 12, 9, 0, 9),
  mur('o', 0, 9, 0, 0),
  mur('pn', 5, 4, 6.1, 4),
  mur('pe', 6.1, 4, 6.1, 5.1),
  mur('ps', 6.1, 5.1, 5, 5.1),
  mur('po', 5, 5.1, 5, 4),
];
/** Le plan est vu à demi dézoomé : c'est là qu'on cherche un mur. */
const ZOOM = 0.5;

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (murs: WallSeg[]) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: murs,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Dégagement', floor: null }] as never,
      fixtures: [],
      ceiling: [],
      photos: [],
      notes: [],
      niveauCourant: 0,
    });
    t = TestRenderer.create(
      <FloorplanEditor
        showMeasures={false}
        editable
        selectedWallId={null}
        onSelectWall={() => {}}
        vueInitiale={{ zoom: ZOOM, ox: 0, oy: 0, rot: 0 }}
      />,
    );
  });
  act(() => {
    const zone = t.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: 600, height: 480 } } });
  });
  arbre = t;
  return t;
};

/** Les zones de toucher des murs : les traits invisibles et larges. */
const cibles = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Line)
    .filter((n) => n.props.stroke === 'transparent' && Number(n.props.strokeWidth) > 2)
    .map((n) => ({
      a: { x: Number(n.props.x1), y: Number(n.props.y1) },
      b: { x: Number(n.props.x2), y: Number(n.props.y2) },
      large: Number(n.props.strokeWidth),
    }));

/** Distance d'un point à un segment, en pixels. */
const distance = (
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
) => {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
};

/** L'échelle réellement employée, lue sur le mur de douze mètres. */
const echelleDe = (zones: ReturnType<typeof cibles>) => {
  const grand = zones.reduce((a, b) =>
    Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y) >
    Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y)
      ? a
      : b,
  );
  return Math.hypot(grand.b.x - grand.a.x, grand.b.y - grand.a.y) / 12;
};

describe('viser un mur', () => {
  it('laisse le centre d’un placard libre, plan dézoomé', () => {
    const t = monter(LOGEMENT);
    const zones = cibles(t);
    expect(zones).toHaveLength(LOGEMENT.length);
    const echelle = echelleDe(zones);
    // Les quatre murs du placard : ceux qui font 1,10 m.
    const placard = zones.filter(
      (z) =>
        Math.abs(Math.hypot(z.b.x - z.a.x, z.b.y - z.a.y) - 1.1 * echelle) < 2,
    );
    expect(placard).toHaveLength(4);
    const pts = placard.flatMap((z) => [z.a, z.b]);
    const centre = {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    };
    const attrapes = placard.filter(
      (z) => distance(centre, z.a, z.b) <= z.large / 2,
    );
    expect(`murs attrapés au centre : ${attrapes.length}`).toBe(
      'murs attrapés au centre : 0',
    );
  });

  it('et la cible ne déborde pas du poché de plus de trois points', () => {
    const zones = cibles(monter(LOGEMENT));
    // L'épaisseur dessinée : 14 cm à l'échelle du cadrage, zoom compris.
    const poche = 0.14 * echelleDe(zones);
    // Trois points de part et d'autre — et jamais moins de douze au total,
    // sinon un mur dessiné fin deviendrait introuvable.
    const attendu = Math.max(12, poche + 6);
    for (const z of zones) {
      expect(z.large).toBeLessThanOrEqual(attendu + 0.001);
    }
  });

  it('mais reste visable : jamais moins de douze points', () => {
    // Un mur dessiné trop fin resterait introuvable au doigt : la cible ne
    // descend pas sous douze points, quel que soit le zoom.
    for (const z of cibles(monter(LOGEMENT))) {
      expect(z.large).toBeGreaterThanOrEqual(12);
    }
  });
});

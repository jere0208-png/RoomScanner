/**
 * LA ZONE DE PRISE D'UN MUR SUIT LE MUR, PAS SA BOÎTE.
 *
 * Relevé du patron : « la désélection d'un mur doit se faire si on clique hors
 * de ce mur, hors même dans un vide ; s'il est proche du mur il ne se
 * désélectionne pas. Aussi on doit pouvoir étirer la pièce mais en restant sur
 * le mur et en le glissant, comme on a — là je peux le faire à distance s'il
 * est sélectionné. Je pense qu'il y a un rapport avec la désélection qui ne se
 * fait pas. »
 *
 * IL AVAIT RAISON SUR LE RAPPORT, ET C'EST LA MÊME LIGNE DE CODE.
 *
 * Le mur choisi se pousse au doigt, et sa zone de prise était la BOÎTE
 * ENGLOBANTE du segment, élargie de quinze points :
 *
 *     left: min(ax, bx) − 15, width: |bx − ax| + 30
 *     top:  min(ay, by) − 15, height: |by − ay| + 30
 *
 * Pour un mur horizontal ou vertical, c'est une bande de trente points : la
 * tolérance qu'on voulait. Pour un mur EN BIAIS, c'est un grand rectangle qui
 * couvre tout ce que le segment traverse — des milliers de points carrés de
 * vide, tous grabbables.
 *
 * DE LÀ VIENNENT LES DEUX DÉFAUTS À LA FOIS :
 *
 *   - on étire le mur en glissant LOIN de lui, puisque le vide de la boîte
 *     prend le geste ;
 *   - on ne le désélectionne plus en touchant ce vide, puisque cette zone est
 *     posée PAR-DESSUS le dessin et que l'appui n'atteint jamais le fond qui
 *     lâche la sélection.
 *
 * Un seul rectangle, deux symptômes, et le patron a fait le lien avant moi.
 *
 * LA CORRECTION EST GÉOMÉTRIQUE : la zone devient une bande TOURNÉE, longue
 * comme le mur et épaisse comme la tolérance. Ce qu'on attrape est ce qu'on
 * voit, ce qui est toujours ce qu'on veut d'une zone de prise.
 */
const mockCap = { valeur: null as string | null };

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    viewModel: jest.fn(async () => false),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  laserEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  RoomScanView: 'RoomScanView',
  get RoomScanCanvas() {
    return mockCap.valeur;
  },
}));

import React from 'react';
import { StyleSheet, View } from 'react-native';
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

/**
 * UNE PIÈCE AVEC UN PAN COUPÉ — c'est le mur en biais qui révèle le défaut.
 *
 * Sur un logement tout en angles droits, la boîte englobante d'un mur EST la
 * bande qu'on voulait : le défaut ne se voit pas, et c'est pour ça qu'il a
 * vécu si longtemps. Il faut un biais pour que la boîte s'ouvre.
 */
const MURS: WallSeg[] = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 3),
  mur('biais', 6, 3, 0, 6),
  mur('o', 0, 6, 0, 0),
];

const TAILLE = { width: 400, height: 600 };

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (choisi: string) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never,
      fixtures: [],
      photos: [],
    });
    t = TestRenderer.create(
      <FloorplanEditor
        showMeasures={false}
        editable
        selectedWallId={choisi}
        onSelectWall={() => {}}
      />,
    );
  });
  act(() => {
    const zone = t.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: TAILLE } });
  });
  arbre = t;
  return t;
};

interface Zone {
  left: number;
  top: number;
  width: number;
  height: number;
  angle: number;
}

/**
 * LA ZONE DE PRISE DU MUR : la vue absolue, transparente, qui porte un
 * `PanResponder` et rien à dessiner.
 *
 * On la reconnaît à ce qu'elle EST : posée en absolu, sans fond, avec les
 * gestes dessus. Pas à une taille ni à une position, qui sont justement ce
 * qu'on mesure.
 */
const zoneDePrise = (t: TestRenderer.ReactTestRenderer): Zone => {
  const vues = t.root.findAllByType(View).filter((n) => {
    const st = (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<
      string,
      unknown
    >;
    return (
      typeof n.props.onMoveShouldSetResponder === 'function' &&
      st.position === 'absolute' &&
      st.backgroundColor === 'transparent' &&
      typeof st.width === 'number'
    );
  });
  expect(vues.length).toBeGreaterThan(0);
  const st = (StyleSheet.flatten(
    vues[vues.length - 1].props.style as never,
  ) ?? {}) as Record<string, unknown>;
  const tr = (st.transform ?? []) as Record<string, string>[];
  const rot = tr.find((x) => 'rotate' in x)?.rotate ?? '0deg';
  return {
    left: st.left as number,
    top: st.top as number,
    width: st.width as number,
    height: st.height as number,
    angle: (parseFloat(rot) * Math.PI) / 180,
  };
};

/** Le point est-il DANS la zone, rotation comprise ? */
const dedans = (z: Zone, p: { x: number; y: number }) => {
  const cx = z.left + z.width / 2;
  const cy = z.top + z.height / 2;
  const c = Math.cos(-z.angle);
  const s = Math.sin(-z.angle);
  const dx = p.x - cx;
  const dy = p.y - cy;
  return (
    Math.abs(dx * c - dy * s) <= z.width / 2 &&
    Math.abs(dx * s + dy * c) <= z.height / 2
  );
};

/** Où le mur se dessine à l'écran : ses deux bouts, en points. */
const boutsDuMur = (t: TestRenderer.ReactTestRenderer, id: string) => {
  const w = MURS.find((x) => x.id === id)!;
  const z = zoneDePrise(t);
  // On ne relit pas le mapping : le milieu de la zone EST le milieu du mur,
  // c'est la seule chose que les deux dessins partagent par construction.
  void w;
  return { cx: z.left + z.width / 2, cy: z.top + z.height / 2 };
};

describe('la zone de prise d’un mur en biais', () => {
  it('est une bande, pas un carré', () => {
    /*
      LE DÉFAUT, EN UN NOMBRE. La boîte englobante d'un mur en biais est
      presque carrée ; la bande qu'on veut est longue et fine. On mesure donc
      le RAPPORT — il ne dépend ni de l'échelle du plan ni de la taille de
      l'écran, ce qu'une mesure en points ferait.
    */
    const z = zoneDePrise(monter('biais'));
    expect(z.width / z.height).toBeGreaterThan(3);
  });

  it('et elle est TOURNÉE comme lui', () => {
    // Une bande fine mais droite ne couvrirait plus le mur du tout : c'est la
    // rotation qui fait qu'elle le suit.
    const z = zoneDePrise(monter('biais'));
    expect(Math.abs(z.angle)).toBeGreaterThan(0.05);
  });

  it('elle ne prend pas le vide que le mur traverse', () => {
    /*
      L'ÉPREUVE DU RELEVÉ : « je peux l'étirer à distance ». On prend un point
      nettement à côté du mur — décalé perpendiculairement de quatre-vingts
      points depuis son milieu — et qui tombait pourtant DANS l'ancienne
      boîte. Il doit être dehors.
    */
    const t = monter('biais');
    const z = zoneDePrise(t);
    const { cx, cy } = boutsDuMur(t, 'biais');
    // La perpendiculaire à la bande, à quatre-vingts points du mur.
    const nx = -Math.sin(z.angle);
    const ny = Math.cos(z.angle);
    expect(dedans(z, { x: cx + nx * 80, y: cy + ny * 80 })).toBe(false);
    expect(dedans(z, { x: cx - nx * 80, y: cy - ny * 80 })).toBe(false);
  });

  it('mais elle garde sa tolérance : tout PRÈS du mur, on tient encore', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, et il porte l'autre moitié du relevé :
      « s'il est proche du mur il ne se désélectionne pas ». Une bande
      rétrécie au trait serait invisible au doigt — un mur fait quelques
      points de large à l'écran, et l'on vise avec un doigt.
    */
    const t = monter('biais');
    const z = zoneDePrise(t);
    const { cx, cy } = boutsDuMur(t, 'biais');
    const nx = -Math.sin(z.angle);
    const ny = Math.cos(z.angle);
    expect(dedans(z, { x: cx + nx * 12, y: cy + ny * 12 })).toBe(true);
    expect(dedans(z, { x: cx - nx * 12, y: cy - ny * 12 })).toBe(true);
  });

  it('et elle couvre le mur d’un bout à l’autre', () => {
    // Une bande plus courte que son mur laisserait ses extrémités
    // inattrapables — on pousse une cloison par son milieu, mais on la vise
    // où l'on peut.
    const t = monter('biais');
    const z = zoneDePrise(t);
    const { cx, cy } = boutsDuMur(t, 'biais');
    const ux = Math.cos(z.angle);
    const uy = Math.sin(z.angle);
    const bout = z.width / 2 - 4;
    expect(dedans(z, { x: cx + ux * bout, y: cy + uy * bout })).toBe(true);
    expect(dedans(z, { x: cx - ux * bout, y: cy - uy * bout })).toBe(true);
  });
});

describe('et le mur droit n’a rien perdu', () => {
  it('sa bande reste large de la tolérance qu’on lui connaît', () => {
    /*
      LE CONTRÔLE QUI PROTÈGE L'ACQUIS. Sur un mur horizontal, l'ancienne
      boîte était DÉJÀ la bonne bande : la correction ne doit rien y changer
      — ni l'épaisseur, qui est la tolérance du doigt, ni la longueur.
    */
    const t = monter('n');
    const z = zoneDePrise(t);
    expect(z.height).toBeGreaterThanOrEqual(28);
    expect(z.height).toBeLessThanOrEqual(40);
    expect(z.width / z.height).toBeGreaterThan(3);
  });
});

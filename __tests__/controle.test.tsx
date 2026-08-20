/**
 * LE CONTRÔLE DES NORMES — une pastille qui bat, des constats qui se
 * corrigent d'un doigt.
 *
 * Relevé du patron : « mets le bouton contrôle en plus petit à côté du
 * switch 2D/3D, avec une légère onde rouge qui bump du bouton si
 * l'appartement n'est pas aux normes, et si rien n'est à redire, le contour
 * devient vert fixe. Refonte de la fenêtre, correction auto au clic sur un
 * élément manquant : on guide l'utilisateur. »
 *
 * Ce que le banc fixe :
 * - la pastille dit son verdict SANS qu'on l'ouvre : contour rouge et onde
 *   quand une alerte existe, contour vert fixe quand tout est bon ;
 * - chaque constat qui sait comment se régler PORTE son bouton, et ce
 *   bouton applique la correction — il ne se contente pas de naviguer ;
 * - les constats du plafond (point lumineux, détecteur de fumée) portent
 *   désormais leur geste, comme ceux des murs ;
 * - la correction pose l'appareil à une PLACE LIBRE de la bonne pièce, et
 *   le détecteur de fumée va dans la circulation — jamais au petit bonheur.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { checkElectrical, wallToRooms, type RoomInput } from '../src/geometry/nfc15100';
import { DiagnosticSheet, type Constat } from '../src/components/DiagnosticSheet';
import type { WallSeg, Pt } from '../src/geometry/floorplan';
import type { CeilingFixture } from '../src/geometry/ceiling';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

/* Couleurs du thème clair : le banc lit ce que l'œil verra. */
const ROUGE = '#E5484D';
const VERT = '#1DB954';

/** Un carré de quatre mètres : quatre murs francs, de quoi poser partout. */
const carre = (prefixe: string, ox = 0): WallSeg[] => {
  const p = (x: number, z: number): Pt => ({ x: x + ox, z });
  const mur = (id: string, a: Pt, b: Pt): WallSeg => ({
    id,
    type: 'wall',
    a,
    b,
    height: 2.5,
    yCenter: 1.25,
  });
  return [
    mur(`${prefixe}1`, p(0, 0), p(4, 0)),
    mur(`${prefixe}2`, p(4, 0), p(4, 4)),
    mur(`${prefixe}3`, p(4, 4), p(0, 4)),
    mur(`${prefixe}4`, p(0, 4), p(0, 0)),
  ];
};

const piece = (
  id: string,
  name: string,
  murs: WallSeg[],
  ox = 0,
): RoomInput & { kind: null; interieur: Pt } => ({
  id,
  name,
  kind: null,
  area: 16,
  wallIds: murs.map((w) => w.id),
  outline: [
    { x: ox, z: 0 },
    { x: ox + 4, z: 0 },
    { x: ox + 4, z: 4 },
    { x: ox, z: 4 },
  ],
  interieur: { x: ox + 2, z: 2 },
});

describe('les constats du plafond portent leur geste', () => {
  it('« aucun point lumineux » propose de poser le DCL', () => {
    const rooms = [piece('r1', 'Chambre', carre('w'))];
    const ceiling: CeilingFixture[] = [
      { id: 'c1', kind: 'dcl', roomId: 'r2', at: { x: 9, z: 9 } },
    ];
    const issues = checkElectrical(rooms, [], wallToRooms(rooms), undefined, undefined, undefined, ceiling);
    const lumiere = issues.find((i) => i.code === 'eclairage');
    expect(lumiere).toBeDefined();
    expect(lumiere!.fix).toMatchObject({ type: 'plafond', kind: 'dcl' });
  });

  it('« aucun détecteur de fumée » propose de le poser', () => {
    const rooms = [piece('r1', 'Chambre', carre('w'))];
    const ceiling: CeilingFixture[] = [
      { id: 'c1', kind: 'dcl', roomId: 'r1', at: { x: 2, z: 2 } },
    ];
    const issues = checkElectrical(rooms, [], wallToRooms(rooms), undefined, undefined, undefined, ceiling);
    const daaf = issues.find((i) => i.code === 'daaf');
    expect(daaf).toBeDefined();
    expect(daaf!.fix).toMatchObject({ type: 'plafond', kind: 'daaf' });
  });
});

describe('la correction d’un constat', () => {
  const ctx = (rooms: (RoomInput & { interieur: Pt })[], walls: WallSeg[]) => ({
    rooms,
    walls,
    openings: [] as WallSeg[],
    objects: [],
    fixtures: [],
    id: (prefixe: string) => `${prefixe}-test`,
  });

  it('pose la prise manquante sur un mur de LA pièce, loin des angles', () => {
    const { corrigerConstat } = require('../src/geometry/auto');
    const murs = carre('w');
    const rooms = [piece('r1', 'Chambre', murs)];
    const res = corrigerConstat(
      { type: 'poser', kind: 'prise', label: 'Poser la prise manquante' },
      'r1',
      ctx(rooms, murs),
    );
    expect(res).not.toBeNull();
    expect(res!.fixtures).toHaveLength(1);
    const f = res!.fixtures[0];
    expect(f.kind).toBe('prise');
    expect(rooms[0].wallIds).toContain(f.wallId);
    expect(f.along).toBeGreaterThan(0.15);
    expect(f.along).toBeLessThan(3.85);
    expect(f.height).toBeGreaterThan(0);
  });

  it('respecte la hauteur imposée par le geste — la PC 110 monte', () => {
    const { corrigerConstat } = require('../src/geometry/auto');
    const murs = carre('w');
    const rooms = [piece('r1', 'Cuisine', murs)];
    const res = corrigerConstat(
      { type: 'poser', kind: 'prise', height: 1.1, label: 'Poser PC 110' },
      'r1',
      ctx(rooms, murs),
    );
    expect(res!.fixtures[0].height).toBeCloseTo(1.1);
  });

  it('met le détecteur de fumée dans la circulation, pas en cuisine', () => {
    const { corrigerConstat } = require('../src/geometry/auto');
    const mursA = carre('a');
    const mursB = carre('b', 5);
    const rooms = [
      piece('r1', 'Cuisine', mursA),
      piece('r2', 'Couloir', mursB, 5),
    ];
    const res = corrigerConstat(
      { type: 'plafond', kind: 'daaf', label: 'Poser le détecteur' },
      undefined,
      ctx(rooms, [...mursA, ...mursB]),
    );
    expect(res).not.toBeNull();
    expect(res!.ceiling).toHaveLength(1);
    expect(res!.ceiling[0].kind).toBe('daaf');
    expect(res!.ceiling[0].roomId).toBe('r2');
  });

  it('avoue son échec quand aucun mur n’offre de place', () => {
    const { corrigerConstat } = require('../src/geometry/auto');
    // Des murs de cinquante centimètres : trop courts pour recevoir quoi
    // que ce soit — la fonction doit le DIRE, pas poser dans un angle.
    const murs: WallSeg[] = [
      { id: 'w1', type: 'wall', a: { x: 0, z: 0 }, b: { x: 0.5, z: 0 }, height: 2.5, yCenter: 1.25 },
    ];
    const rooms = [{ ...piece('r1', 'WC', murs), wallIds: ['w1'] }];
    const res = corrigerConstat(
      { type: 'poser', kind: 'prise', label: 'Poser la prise manquante' },
      'r1',
      ctx(rooms, murs),
    );
    expect(res).toBeNull();
  });
});

describe('la pastille de contrôle', () => {
  const monter = (alertes: number, onPress = jest.fn()) => {
    const { ControlePastille } = require('../src/components/ControlePastille');
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ControlePastille alertes={alertes} onPress={onPress} />,
      );
    });
    return tree;
  };

  const bordures = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root
      .findAll(() => true)
      .map((n) => (StyleSheet.flatten(n.props?.style) as { borderColor?: string })?.borderColor)
      .filter(Boolean);

  it('bat en rouge quand l’installation n’est pas aux normes', () => {
    const tree = monter(3);
    // Le contour ET l'onde sont rouges : deux bordures danger au moins.
    expect(bordures(tree).filter((b) => b === ROUGE).length).toBeGreaterThanOrEqual(2);
    const bouton = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => String(n.props.accessibilityLabel ?? '').startsWith('Contrôle'))!;
    expect(bouton.props.accessibilityLabel).toContain('3');
  });

  it('porte un contour vert fixe quand rien n’est à redire', () => {
    const tree = monter(0);
    const b = bordures(tree);
    expect(b).toContain(VERT);
    expect(b).not.toContain(ROUGE);
  });

  it('ouvre le contrôle d’un appui', () => {
    const onPress = jest.fn();
    const tree = monter(2, onPress);
    const bouton = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => String(n.props.accessibilityLabel ?? '').startsWith('Contrôle'))!;
    act(() => bouton.props.onPress());
    expect(onPress).toHaveBeenCalled();
  });
});

describe('la fenêtre guide et corrige', () => {
  it('un constat qui sait se régler porte son bouton, et le bouton corrige', () => {
    const onFix = jest.fn();
    const onGoToIssue = jest.fn();
    const issue: Constat = {
      key: 'x',
      message: 'Chambre : aucune prise RJ45',
      hint: 'Une prise de communication par pièce principale.',
      severity: 'alerte',
      roomId: 'r1',
      fix: { type: 'poser', kind: 'rj45', label: 'Poser RJ45' },
    };
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <DiagnosticSheet
          visible
          onClose={() => {}}
          issues={[issue]}
          rooms={[{ id: 'r1', name: 'Chambre' }]}
          onGoToIssue={onGoToIssue}
          onFix={onFix}
        />,
      );
    });
    const bouton = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Poser RJ45')!;
    expect(bouton).toBeDefined();
    act(() => bouton.props.onPress());
    expect(onFix).toHaveBeenCalledWith(issue);
    // Corriger n'est pas naviguer : le bouton n'emmène pas sur le plan.
    expect(onGoToIssue).not.toHaveBeenCalled();
  });
});

describe('la pastille sur l’écran des résultats', () => {
  it('vit dans la rangée du sélecteur de vue, plus dans la colonne', () => {
    const { ResultScreen } = require('../src/screens/ResultScreen');
    const { useScanStore } = require('../src/store/scanStore');
    const {
      SNAPSHOT_FIXTURES,
      SNAPSHOT_OBJECTS,
      SNAPSHOT_OPENINGS,
      SNAPSHOT_ROOMS,
      SNAPSHOT_WALLS,
    } = require('../src/export/snapshotFixture');
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        screen: 'result',
        scanName: 'Chantier test',
        walls: SNAPSHOT_WALLS,
        openings: SNAPSHOT_OPENINGS,
        objects: SNAPSHOT_OBJECTS,
        rooms: SNAPSHOT_ROOMS.map((r: { id: string }, i: number) => ({
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
    act(() => {
      for (const n of tree.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 520 } } });
        }
      }
    });
    const controle = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => String(n.props.accessibilityLabel ?? '').startsWith('Contrôle'));
    expect(controle).toBeDefined();
    // Dans la MÊME rangée flottante que le sélecteur 2D/3D.
    const rangee = tree.root.findAllByType(View).find((v) => {
      const st = StyleSheet.flatten(v.props.style) as {
        position?: string;
        flexDirection?: string;
      } | null;
      if (st?.position !== 'absolute' || st?.flexDirection !== 'row') return false;
      const dedans = v.findAllByType(TouchableOpacity);
      return (
        dedans.some((b) => b.props.accessibilityLabel === 'Passer en 3D') &&
        dedans.some((b) =>
          String(b.props.accessibilityLabel ?? '').startsWith('Contrôle'),
        )
      );
    });
    expect(rangee).toBeDefined();
    // L'ancienne pastille de la colonne a vécu : plus aucun TEXTE
    // « Contrôle » à l'écran — la nouvelle parle par son contour.
    const mots = tree.root
      .findAllByType(Text)
      .map((n) => n.props.children)
      .filter((x: unknown) => typeof x === 'string');
    expect(mots).not.toContain('Contrôle');
    act(() => tree.unmount());
  });
});

/**
 * ON NE PERCE PAS DANS UN COFFRE DE VOLET.
 *
 * Relevé du chantier : le scan ne voit pas les coffres, on les déclare donc
 * à la main — et dès qu'ils sont là, le contrôle en tire la conséquence
 * qui compte. Derrière la trappe : la coulisse, le tablier enroulé, le
 * tube. Une sortie de câble percée là-dedans, c'est le tablier bloqué au
 * premier usage, et le percement se voit de la rue.
 */
describe('le coffre de volet au contrôle', () => {
  const { checkElectrical: check } = require('../src/geometry/nfc15100');

  const murs = carre('w');
  const rooms = [piece('r1', 'Séjour', murs)];
  /** Une baie de 1,40 m sur le mur nord, allège 0,90, coffre de 25 cm. */
  const baie = {
    id: 'f1',
    type: 'window' as const,
    a: { x: 1, z: 0 },
    b: { x: 2.4, z: 0 },
    height: 1.35,
    yCenter: 0.9 + 1.35 / 2,
    coffre: 0.25,
  };

  const fixture = (along: number, height: number) => ({
    id: 'f',
    kind: 'sortieCable' as const,
    wallId: 'w1',
    along,
    height,
    side: 1 as const,
  });

  it('signale l’appareil posé dans l’emprise du coffre', () => {
    const issues = check(
      rooms,
      [fixture(1.7, 2.35)],
      wallToRooms(rooms),
      undefined,
      undefined,
      undefined,
      [],
      { walls: murs, openings: [baie] },
    );
    const dedans = issues.find((i: { message: string }) =>
      i.message.toLowerCase().includes('coffre'),
    );
    expect(dedans).toBeDefined();
    expect(dedans!.severity).toBe('alerte');
  });

  it('et se tait pour le même appareil posé plus bas', () => {
    const issues = check(
      rooms,
      [fixture(1.7, 1.1)],
      wallToRooms(rooms),
      undefined,
      undefined,
      undefined,
      [],
      { walls: murs, openings: [baie] },
    );
    expect(
      issues.filter((i: { message: string }) =>
        i.message.toLowerCase().includes('coffre'),
      ),
    ).toHaveLength(0);
  });
});

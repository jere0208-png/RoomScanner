/**
 * Les poignées d'un meuble : leur geste doit SURVIVRE au déplacement.
 *
 * C'est la panne qu'on n'aurait jamais trouvée à la lecture. Le meuble bouge
 * → le store le recrée → la prop `raw` est un objet neuf → le `useMemo` qui
 * fabriquait le `PanResponder` se ré-exécutait → un responder tout neuf, dont
 * le `dx` cumulé repart de zéro alors que le doigt, lui, n'a pas quitté
 * l'écran. Résultat à l'usage : le meuble tressaute, revient à sa position de
 * départ, et paraît impossible à déplacer.
 *
 * Le test ne simule pas des touches : il vérifie l'invariant qui compte —
 * les gestionnaires ne changent pas d'identité quand le meuble bouge.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import {
  FloorplanEditor,
  ObjectDragHandle,
  RotateHandle,
} from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';
import type { ObjectData } from 'react-native-room-scan';

const mapping = {
  scale: 100,
  toPx: (p: { x: number; z: number }) => ({ x: p.x * 100, y: p.z * 100 }),
  deltaToMeters: (dx: number, dy: number) => ({ x: dx / 100, z: dy / 100 }),
  toMeters: (px: { x: number; y: number }) => ({ x: px.x / 100, z: px.y / 100 }),
};

/** Matrice colonne-major d'un meuble posé en (x, z), sans rotation. */
const tf = (x: number, z: number) => [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1,
];

const handlersOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(View)[0].props;

describe('la poignée de déplacement', () => {
  const rendre = (x: number, z: number) => (
    <ObjectDragHandle
      objectId="o1"
      center={{ x: x * 100, y: z * 100 }}
      half={{ x: 70, y: 95 }}
      mapping={mapping}
      raw={{ transform: tf(x, z), width: 1.4 }}
    />
  );

  it('garde le MÊME responder quand le meuble se déplace', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(rendre(1.75, 1.22));
    });
    const avant = handlersOf(tree);
    // Vingt images de glissement : autant de props `raw` différentes.
    for (let i = 1; i <= 20; i++) {
      const dz = 1.22 - i * 0.01;
      act(() => {
        tree.update(rendre(1.75, dz));
      });
    }
    const apres = handlersOf(tree);
    expect(apres.onResponderMove).toBe(avant.onResponderMove);
    expect(apres.onResponderGrant).toBe(avant.onResponderGrant);
    expect(apres.onStartShouldSetResponder).toBe(avant.onStartShouldSetResponder);
  });

  it('ne rend jamais le geste au plan', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(rendre(1.75, 1.22));
    });
    const h = handlersOf(tree);
    const evt = { nativeEvent: { touches: [] }, touchHistory: {} } as never;
    // Le plan redemande la main à chaque mouvement : on refuse.
    expect(h.onResponderTerminationRequest(evt)).toBe(false);
    // Et on prend la main dès le premier pixel, sans attendre.
    expect(h.onStartShouldSetResponder(evt)).toBe(true);
    expect(h.onMoveShouldSetResponder(evt)).toBe(true);
  });
});

describe('la poignée de rotation', () => {
  const rendre = (yaw: number) => (
    <RotateHandle
      objectId="o1"
      center={{ x: 175, y: 122 }}
      at={{ x: 175 + 70 * Math.cos(yaw), y: 122 + 70 * Math.sin(yaw) }}
      raw={{ transform: tf(1.75, 1.22) }}
      viewRot={0}
      frame={0}
    />
  );

  it('garde le MÊME responder pendant que le meuble tourne', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(rendre(0));
    });
    const avant = handlersOf(tree);
    for (let i = 1; i <= 12; i++) {
      act(() => {
        tree.update(rendre((i * Math.PI) / 24));
      });
    }
    expect(handlersOf(tree).onResponderMove).toBe(avant.onResponderMove);
  });
});

/**
 * LES COMMANDES DU MEUBLE — collées à lui, et pas ailleurs.
 *
 * Relevé du chantier, capture à l'appui : la croix rouge flottait à l'autre
 * bout du plan, posée sur un AUTRE meuble, et la poignée de rotation sur un
 * troisième. Elles étaient bornées au cadre : dès que le meuble approchait
 * d'un bord, elles s'en détachaient et restaient plantées là.
 *
 * Ce banc monte le vrai plan et MESURE les distances au contour. Une
 * disposition ne se relit pas, elle se compte.
 */
describe('les commandes suivent le meuble', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
    roomId: 'r1',
  });
  const MURS = [
    mur('n', 0, 0, 5, 0),
    mur('e', 5, 0, 5, 4),
    mur('s', 5, 4, 0, 4),
    mur('w', 0, 4, 0, 0),
  ];
  /** Un meuble d'un mètre sur deux, posé où on le demande. */
  const meuble = (x: number, z: number): ObjectData => ({
    id: 'o1',
    category: 'storage',
    width: 1,
    depth: 2,
    height: 1,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.5, z, 1],
  });

  function planAvec(x: number, z: number, cotes: boolean) {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        walls: MURS,
        openings: [],
        objects: [meuble(x, z)],
        rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
        fixtures: [],
        ceiling: [],
        photos: [],
        showFurniture: true,
      });
      tree = TestRenderer.create(
        <FloorplanEditor
          editable
          showMeasures={false}
          selectedWallId={null}
          onSelectWall={() => {}}
          selectedObjectId="o1"
          showObjectDims={cotes}
          onSelectObject={() => {}}
          onDeleteObject={() => {}}
          onToggleObjectDims={() => {}}
        />,
      );
    });
    act(() => {
      for (const n of tree.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({
            nativeEvent: { layout: { width: 340, height: 460 } },
          });
        }
      }
    });
    return tree;
  }

  /** La position d'un élément repéré par son étiquette. */
  const pose = (tree: TestRenderer.ReactTestRenderer, label: string) => {
    const n = tree.root
      .findAll((x) => x.props?.accessibilityLabel === label)
      .map((x) => x.props.style)
      .map((st) => (Array.isArray(st) ? Object.assign({}, ...st.filter(Boolean)) : st))
      .find((st) => st && typeof st.left === 'number');
    return n ? { left: n.left as number, top: n.top as number } : null;
  };

  it('pose ses trois commandes en rangée, à quelques points du meuble', () => {
    const tree = planAvec(2.5, 2, false);
    const tourne = pose(tree, 'Pivoter le meuble');
    const coter = pose(tree, 'Cotes du meuble');
    const retirer = pose(tree, 'Retirer le meuble');
    expect(tourne).not.toBeNull();
    expect(coter).not.toBeNull();
    expect(retirer).not.toBeNull();
    // Sur UNE ligne : les trois pastilles font 34 points, elles partagent
    // donc le même bord haut.
    expect(coter!.top).toBeCloseTo(tourne!.top, 0);
    expect(retirer!.top).toBeCloseTo(tourne!.top, 0);
    // Régulièrement espacées, et dans l'ordre : pivoter, coter, retirer.
    const e1 = coter!.left - tourne!.left;
    const e2 = retirer!.left - coter!.left;
    expect(e1).toBeGreaterThan(0);
    expect(Math.abs(e1 - e2)).toBeLessThan(1);
    // ET PRÈS DU MEUBLE. La poignée de déplacement épouse son emprise :
    // c'est elle qui donne le contour, à l'écran, sans refaire la
    // projection à la main.
    const emprise = tree.root.findByType(ObjectDragHandle).props;
    const hautDuMeuble = emprise.center.y - emprise.half.y;
    const basDesBoutons = tourne!.top + 34;
    // La rangée est AU-DESSUS du meuble, et le frôle : quelques points, pas
    // la moitié du plan.
    expect(basDesBoutons).toBeLessThanOrEqual(hautDuMeuble);
    expect(hautDuMeuble - basDesBoutons).toBeLessThan(30);
    // Centrée sur lui, aussi : la rangée ne penche pas d'un côté.
    const milieuRangee = (tourne!.left + retirer!.left + 34) / 2;
    expect(Math.abs(milieuRangee - emprise.center.x)).toBeLessThan(2);
  });

  /**
   * ET RIEN NE SE SUPERPOSE.
   *
   * Avec les cotes, la rangée de commandes mordait sur la poignée du bord
   * haut : deux cibles au même endroit, dont on ne sait laquelle répondra.
   */
  it('ne pose aucune commande sur une poignée', () => {
    const tree = planAvec(2.5, 2, true);
    const rangee = pose(tree, 'Cotes du meuble')!;
    const haut = pose(tree, 'Étirer le côté profondeur-')!;
    // La pastille fait 34 points, la zone de la poignée 40.
    const basRangee = rangee.top + 34;
    expect(basRangee).toBeLessThanOrEqual(haut.top);
  });

  it('n’offre les poignées de côté qu’avec les cotes', () => {
    const sans = planAvec(2.5, 2, false);
    const cotes = ['largeur+', 'largeur-', 'profondeur+', 'profondeur-'];
    for (const c of cotes) {
      expect(pose(sans, `Étirer le côté ${c}`)).toBeNull();
    }
    const avec = planAvec(2.5, 2, true);
    for (const c of cotes) {
      expect(pose(avec, `Étirer le côté ${c}`)).not.toBeNull();
    }
  });

  /**
   * ET ELLES DISPARAISSENT AVEC LUI.
   *
   * Un meuble poussé hors du cadre laissait ses boutons collés au bord,
   * sans plus rien à commander de visible.
   */
  it('efface tout quand le meuble sort du champ', () => {
    const dedans = planAvec(2.5, 2, true);
    expect(pose(dedans, 'Retirer le meuble')).not.toBeNull();
    // Très loin sur la droite : le meuble n'est plus dans le cadre.
    const dehors = planAvec(60, 2, true);
    expect(pose(dehors, 'Retirer le meuble')).toBeNull();
    expect(pose(dehors, 'Pivoter le meuble')).toBeNull();
    expect(pose(dehors, 'Étirer le côté largeur+')).toBeNull();
  });
});
/**
 * LES DEUX POIGNÉES D'UN MUR.
 *
 * Le magasin sait pousser et tourner un mur ; encore faut-il que le doigt
 * atteigne ces gestes. Ce banc vérifie le chemin complet — la poignée
 * existe, elle prend la main, et le mur bouge pour de bon.
 */
describe('le mur choisi', () => {
  const CARRE = [
    { id: 'n', a: { x: 0, z: 0 }, b: { x: 4, z: 0 } },
    { id: 'e', a: { x: 4, z: 0 }, b: { x: 4, z: 4 } },
    { id: 's', a: { x: 4, z: 4 }, b: { x: 0, z: 4 } },
    { id: 'o', a: { x: 0, z: 4 }, b: { x: 0, z: 0 } },
  ].map((w) => ({
    ...w,
    type: 'wall' as const,
    height: 2.5,
    yCenter: 1.25,
    roomId: 'r1',
  }));

  const monterMur = (selection: string | null) => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        walls: CARRE.map((w) => ({ ...w, a: { ...w.a }, b: { ...w.b } })),
        openings: [],
        objects: [],
        rooms: [
          {
            id: 'r1',
            name: 'Séjour',
            floor: null,
            wallIds: CARRE.map((w) => w.id),
          },
        ],
        fixtures: [],
        ceiling: [],
        photos: [],
      });
      tree = TestRenderer.create(
        <FloorplanEditor
          showMeasures
          editable
          selectedWallId={selection}
          onSelectWall={() => {}}
        />,
      );
    });
    act(() => {
      for (const n of tree.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({
            nativeEvent: { layout: { width: 390, height: 620 } },
          });
        }
      }
    });
    return tree;
  };

  /**
   * Un événement tactile COMPLET.
   *
   * `PanResponder` ne lit pas que l'événement : il remonte l'historique
   * tactile de React Native pour calculer le centre du geste. Sans lui, il
   * lève avant même d'avoir bougé.
   */
  const doigt = (x: number, y: number, x0 = x, y0 = y) => ({
    nativeEvent: {
      touches: [{ pageX: x, pageY: y }],
      locationX: x,
      locationY: y,
    },
    touchHistory: {
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: 100,
      touchBank: [
        {
          touchActive: true,
          // Le départ et l'arrivée sont DISTINCTS : c'est de leur écart que
          // `PanResponder` déduit `dx`/`dy`, et il recalcule ces valeurs
          // lui-même — les passer en argument ne servirait à rien.
          startPageX: x0,
          startPageY: y0,
          startTimeStamp: 0,
          currentPageX: x,
          currentPageY: y,
          currentTimeStamp: 100,
          previousPageX: x0,
          previousPageY: y0,
          previousTimeStamp: 0,
        },
      ],
    },
  });

  const rotation = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root
      .findAllByType(View)
      .find((n) => n.props.accessibilityLabel === 'Tourner le mur');

  it('n’offre ses poignées qu’une fois choisi', () => {
    const nu = monterMur(null);
    expect(rotation(nu)).toBeUndefined();
    act(() => nu.unmount());
    const pris = monterMur('n');
    expect(rotation(pris)).toBeDefined();
    act(() => pris.unmount());
  });

  it('se pousse au doigt, et ses voisins suivent', () => {
    const tree = monterMur('n');
    // La zone de prise du mur : elle ne répond qu'au MOUVEMENT, jamais à
    // l'appui — sinon désélectionner déplacerait le mur d'un cheveu.
    const prise = tree.root
      .findAllByType(View)
      .find(
        (n) =>
          typeof n.props.onMoveShouldSetResponder === 'function' &&
          n.props.onStartShouldSetResponder?.() === false &&
          n.props.onResponderTerminationRequest?.() === false,
      );
    expect(prise).toBeDefined();
    act(() => {
      prise!.props.onMoveShouldSetResponder(doigt(200, 320, 200, 300));
      prise!.props.onResponderGrant(doigt(200, 300, 200, 300));
      prise!.props.onResponderMove(doigt(200, 340, 200, 300));
    });
    const murs = useScanStore.getState().walls;
    const n = murs.find((w) => w.id === 'n')!;
    // Il a bougé, il est resté horizontal, et le mur d'en face n'a pas suivi.
    expect(n.a.z).not.toBeCloseTo(0, 3);
    expect(n.a.z).toBeCloseTo(n.b.z, 9);
    expect(murs.find((w) => w.id === 's')!.a.z).toBeCloseTo(4, 6);
    // Et les murs qui le tiennent sont restés soudés.
    expect(murs.find((w) => w.id === 'e')!.a.z).toBeCloseTo(n.b.z, 6);
    act(() => tree.unmount());
  });

  it('se tourne par sa poignée, et l’angle s’affiche', () => {
    const tree = monterMur('n');
    const p = rotation(tree)!;
    act(() => {
      p.props.onStartShouldSetResponder(doigt(300, 90));
      p.props.onResponderGrant(doigt(300, 90));
      p.props.onResponderMove(doigt(300, 190));
    });
    const n = useScanStore.getState().walls.find((w) => w.id === 'n')!;
    // Le mur n'est plus horizontal, et il a gardé sa longueur.
    expect(Math.abs(n.b.z - n.a.z)).toBeGreaterThan(0.05);
    expect(Math.hypot(n.b.x - n.a.x, n.b.z - n.a.z)).toBeCloseTo(4, 6);
    // L'angle s'écrit le temps du geste : sans lui, on tourne à l'aveugle.
    const vus = tree.root
      .findAllByType(Text)
      .map((t) => String(t.props.children))
      .join(' | ');
    expect(vus).toMatch(/-?\d+°/);
    act(() => tree.unmount());
  });
});

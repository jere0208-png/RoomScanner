/**
 * CE QUE FAIT UNE VRAIE MAIN — et ce que l'app en comprend.
 *
 * Relevé du patron : « trouve des améliorations en faisant des tests en
 * smartphone gestures ». Les bancs de gestes qu'on avait vérifiaient des
 * INVARIANTS — un responder qui ne change pas d'identité, une couche qui
 * revient à zéro. Aucun ne rejouait un doigt tel qu'il est vraiment :
 * tremblant, pressé, et jamais parfaitement immobile.
 *
 * DEUX FAITS QU'ON N'A PAS LE DROIT D'OUBLIER :
 *
 *   — UN TAP N'EST JAMAIS IMMOBILE. Une main qui vise dérive de deux à six
 *     points, et davantage debout, en marchant, ou avec des gants de
 *     chantier. C'est pour cela qu'iOS ne déclare un glissement qu'à dix
 *     points de translation, et Android à huit.
 *   — LE GESTE DE BORD APPARTIENT AU SYSTÈME, pas à une bande posée par
 *     dessus : il se CAPTURE en cours de route, sans jamais voler l'appui.
 *
 * ET UNE LEÇON SUR LES BANCS EUX-MÊMES : `PanResponder` ne se sert pas de
 * l'état de geste qu'on lui passe, il le RECALCULE depuis `e.touchHistory`.
 * Un état inventé est ignoré — les premiers essais écrits ici passaient donc
 * sans rien prouver, tous les gestes valant zéro déplacement. La main
 * d'essai ci-dessous écrit l'ARCHIVE des doigts, pas la conclusion.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import {
  FloorplanEditor,
  ObjectDragHandle,
} from '../src/components/FloorplanEditor';
import {
  CAPTURE_MIN,
  RetourGlisse,
  estUnRetour,
} from '../src/components/RetourGlisse';
import { useScanStore } from '../src/store/scanStore';
import { GLISSEMENT_MIN } from '../src/ui/geste';
import {
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

interface Doigt {
  touchActive: boolean;
  startPageX: number;
  startPageY: number;
  startTimeStamp: number;
  currentPageX: number;
  currentPageY: number;
  currentTimeStamp: number;
  previousPageX: number;
  previousPageY: number;
  previousTimeStamp: number;
}

/** La main d'essai : elle tient l'archive des doigts, comme le système. */
function main() {
  let horloge = 1000;
  const bank: (Doigt | null)[] = [];

  const evenement = () => {
    const vivants = bank.filter((t): t is Doigt => !!t?.touchActive);
    return {
      nativeEvent: {
        touches: vivants.map((t, i) => ({
          identifier: i,
          pageX: t.currentPageX,
          pageY: t.currentPageY,
          locationX: t.currentPageX,
          locationY: t.currentPageY,
        })),
        locationX: vivants[0]?.currentPageX ?? 0,
        locationY: vivants[0]?.currentPageY ?? 0,
        pageX: vivants[0]?.currentPageX ?? 0,
        pageY: vivants[0]?.currentPageY ?? 0,
      },
      touchHistory: {
        touchBank: bank,
        numberActiveTouches: vivants.length,
        indexOfSingleActiveTouch: bank.findIndex((t) => t?.touchActive),
        mostRecentTimeStamp: horloge,
      },
    };
  };

  return {
    poser(x: number, y: number, id = 0) {
      horloge += 16;
      bank[id] = {
        touchActive: true,
        startPageX: x,
        startPageY: y,
        startTimeStamp: horloge,
        currentPageX: x,
        currentPageY: y,
        currentTimeStamp: horloge,
        previousPageX: x,
        previousPageY: y,
        previousTimeStamp: horloge,
      };
      return evenement();
    },
    bouger(x: number, y: number, id = 0) {
      horloge += 16;
      const t = bank[id];
      if (!t) throw new Error('ce doigt n’est pas posé');
      bank[id] = {
        ...t,
        previousPageX: t.currentPageX,
        previousPageY: t.currentPageY,
        previousTimeStamp: t.currentTimeStamp,
        currentPageX: x,
        currentPageY: y,
        currentTimeStamp: horloge,
      };
      return evenement();
    },
    lever(id = 0) {
      horloge += 16;
      const t = bank[id];
      if (t) bank[id] = { ...t, touchActive: false, currentTimeStamp: horloge };
      return evenement();
    },
  };
}

type Poignee = Record<string, ((e: unknown) => unknown) | undefined>;

/**
 * Rejoue un geste sur des gestionnaires de vue, COMME LE FAIT LE SYSTÈME.
 *
 * Le système ne pose pas les questions à qui tient déjà le toucher : une vue
 * devenue responder ne reçoit plus que `onResponderMove`. Et `PanResponder`
 * compte là-dessus — il refuse de traiter deux fois le même horodatage :
 *
 *     if (gestureState._accountsForMovesUpTo === touchHistory.mostRecentTimeStamp) return;
 *
 * Un banc qui interroge d'abord `onMoveShouldSetResponderCapture` puis appelle
 * `onResponderMove` consomme donc l'événement dans la question, et le
 * déplacement n'a JAMAIS lieu. C'est ainsi qu'un premier essai a « prouvé »
 * qu'un meuble ne bougeait pas quand on le tirait franchement — alors que
 * l'app, elle, le déplaçait très bien.
 */
function jouer(h: Poignee, chemin: [number, number][]) {
  const m = main();
  const [x0, y0] = chemin[0];
  const e0 = m.poser(x0, y0);
  let tient =
    h.onStartShouldSetResponderCapture?.(e0) === true ||
    h.onStartShouldSetResponder?.(e0) === true;
  if (tient) h.onResponderGrant?.(e0);
  let reclame = tient;
  for (const [x, y] of chemin.slice(1)) {
    const e = m.bouger(x, y);
    if (tient) {
      h.onResponderMove?.(e);
      continue;
    }
    if (
      h.onMoveShouldSetResponderCapture?.(e) === true ||
      h.onMoveShouldSetResponder?.(e) === true
    ) {
      tient = true;
      reclame = true;
      h.onResponderGrant?.(e);
    }
  }
  const fin = m.lever();
  if (tient) h.onResponderRelease?.(fin);
  return { reclame };
}

function planEditable() {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: `Pièce ${i + 1}` })),
      fixtures: [],
      ceiling: [],
      photos: [],
      showFurniture: true,
    });
    tree = TestRenderer.create(
      <FloorplanEditor
        editable
        showMeasures
        selectedWallId={null}
        selectedRoomId={SNAPSHOT_ROOMS[0].id}
        onSelectWall={() => {}}
        onMoveRoom={() => {}}
      />,
    );
  });
  act(() => {
    tree.root.findAllByType(View)[0].props.onLayout?.({
      nativeEvent: { layout: { width: 390, height: 700 } },
    });
  });
  arbre = tree;
  return tree;
}

/** Les vues du plan qui décident EN COURS DE ROUTE de prendre le geste. */
const preneurs = (tree: TestRenderer.ReactTestRenderer): Poignee[] =>
  tree.root
    .findAllByType(View)
    .map((n) => n.props as Poignee)
    .filter(
      (p) =>
        typeof p.onMoveShouldSetResponder === 'function' &&
        p.onStartShouldSetResponder?.({}) !== true,
    );

/** Un chemin qui tremble autour d'un point, sans jamais vraiment partir. */
const tremble = (x: number, y: number): [number, number][] => [
  [x, y],
  [x + 2, y + 1],
  [x + 3.5, y + 3.5],
  [x + 1, y + 4],
  [x + 3, y + 2],
];

/** La poignée d'un meuble, seule, sur un plan à cent points par mètre. */
function poigneeDeMeuble(transform: number[]): Poignee {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <ObjectDragHandle
        objectId="o1"
        center={{ x: 200, y: 150 }}
        half={{ x: 60, y: 30 }}
        mapping={{
          scale: 100,
          toPx: (p: { x: number; z: number }) => ({ x: p.x * 100, y: p.z * 100 }),
          deltaToMeters: (dx: number, dy: number) => ({ x: dx / 100, z: dy / 100 }),
          toMeters: (px: { x: number; y: number }) => ({ x: px.x / 100, z: px.y / 100 }),
        }}
        raw={{ transform, width: 1.2, depth: 0.6 }}
      />,
    );
  });
  arbre = tree;
  return tree.root.findAllByType(View)[0].props as Poignee;
}

/** Un meuble seul au monde, posé à deux mètres sur un mètre cinquante. */
function unMeuble() {
  const transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0, 1.5, 1];
  act(() => {
    useScanStore.setState({
      objects: [
        {
          id: 'o1',
          category: 'table',
          width: 1.2,
          height: 0.75,
          depth: 0.6,
          transform,
        },
      ],
      walls: [],
    });
  });
  return transform;
}

describe('le tremblement d’une main qui vise', () => {
  it('ne fait prendre le geste à personne dans le plan', () => {
    /*
      Le tremblement retenu — quatre points au plus sur chaque axe — est
      celui d'une main qui vise. iOS déclare un glissement à dix points,
      Android à huit ; l'app en comptait QUATRE, et pas en distance : en
      somme des deux axes. Trois points de tremblement sur chaque axe font
      six, et le geste partait. On tapait une pièce pour la choisir, et on
      la déplaçait de cinq centimètres.
    */
    const tree = planEditable();
    for (const p of preneurs(tree)) {
      expect(jouer(p, tremble(180, 300)).reclame).toBe(false);
    }
  });

  it('mais un vrai glissement, lui, est pris', () => {
    const tree = planEditable();
    const chemin: [number, number][] = [
      [180, 300],
      [186, 304],
      [199, 311],
      [214, 318],
    ];
    expect(preneurs(tree).some((p) => jouer(p, chemin).reclame)).toBe(true);
  });

  it('ne déplace pas le meuble dont on tape la poignée', () => {
    /*
      LA POIGNÉE A RAISON DE PRENDRE LE TOUCHER DÈS L'APPUI : on l'a visée.
      Mais elle appliquait le déplacement dès le premier pixel — et taper un
      meuble pour le choisir le poussait de quatre centimètres, à cent points
      par mètre. Le magasin est le seul juge.
    */
    unMeuble();
    const h = poigneeDeMeuble(useScanStore.getState().objects[0].transform);
    act(() => {
      jouer(h, tremble(200, 150));
    });
    const apres = useScanStore.getState().objects[0].transform;
    expect(apres[12]).toBeCloseTo(2, 6);
    expect(apres[14]).toBeCloseTo(1.5, 6);
  });

  it('mais le déplace dès qu’on le tire — et d’autant qu’on a tiré', () => {
    /*
      LE CONTRÔLE QUI MANQUAIT AU BANC PRÉCÉDENT. Un verrou trop serré ne se
      distingue pas d'un geste cassé : il faut prouver que le meuble suit
      TOUJOURS le doigt, et qu'il le suit EXACTEMENT — les dix points de
      course compris, sinon l'objet garderait dix centimètres de retard pour
      toujours, et dans une app de relevé dix centimètres se payent.
    */
    unMeuble();
    const h = poigneeDeMeuble(useScanStore.getState().objects[0].transform);
    act(() => {
      jouer(h, [
        [200, 150],
        [205, 150],
        [230, 150],
        [260, 150],
      ]);
    });
    const apres = useScanStore.getState().objects[0].transform;
    expect(apres[12]).toBeCloseTo(2.6, 2);
    expect(apres[14]).toBeCloseTo(1.5, 2);
  });

  it('repose le meuble où il tenait quand un appel coupe le geste', () => {
    /*
      UN GESTE COUPÉ NE LAISSE PAS LE MEUBLE DANS UN MUR.

      Un appel entrant, une notification tirée du haut, et le système reprend
      le toucher : `Terminate` remplace `Release`. Il éteignait le halo rouge
      mais laissait le meuble là où le doigt l'avait mené — dans la
      maçonnerie, à une place que l'app refuse elle-même au lâcher.
    */
    unMeuble();
    act(() => {
      useScanStore.setState({
        walls: [
          {
            id: 'm1',
            type: 'wall',
            a: { x: 4, z: 0 },
            b: { x: 4, z: 3 },
            height: 2.5,
            yCenter: 1.25,
          },
        ],
      });
    });
    const h = poigneeDeMeuble(useScanStore.getState().objects[0].transform);
    const m = main();
    const e0 = m.poser(200, 150);
    act(() => {
      h.onStartShouldSetResponder?.(e0);
      h.onResponderGrant?.(e0);
      /*
        Le meuble fait 1,20 m de large : il tient tant que son centre reste à
        plus de 67 cm du mur. On l'emmène d'abord à 2,40 m — la dernière
        place qui tienne — puis à 3,50 m, où il mord la maçonnerie. Et c'est
        là que le système coupe.
      */
      h.onResponderMove?.(m.bouger(240, 150));
      h.onResponderMove?.(m.bouger(350, 150));
      h.onResponderTerminate?.(m.bouger(350, 150));
    });
    // Le meuble est revenu à la dernière place qui tenait : pas dans le mur.
    const x = useScanStore.getState().objects[0].transform[12];
    expect(x).toBeLessThan(2.9);
  });

  it('garde le même seuil des deux côtés : ni tap ni glissement n’a de trou', () => {
    // Un seul chiffre pour toute l'app : le glissement commence là où le
    // tap finit, sans zone morte entre les deux.
    expect(GLISSEMENT_MIN).toBeGreaterThanOrEqual(8);
    expect(GLISSEMENT_MIN).toBeLessThanOrEqual(12);
  });
});

describe('le retour au glissement depuis le bord', () => {
  const enveloppe = () => {
    let tree!: TestRenderer.ReactTestRenderer;
    const sortis: number[] = [];
    act(() => {
      tree = TestRenderer.create(
        <RetourGlisse onRetour={() => sortis.push(1)}>
          <View />
        </RetourGlisse>,
      );
    });
    arbre = tree;
    return { h: tree.root.findAllByType(View)[0].props as Poignee, sortis };
  };

  it('reconnaît le geste franc, et refuse l’hésitation', () => {
    expect(estUnRetour(80, 10)).toBe(true);
    expect(estUnRetour(30, 5)).toBe(false);
    expect(estUnRetour(80, 90)).toBe(false);
  });

  it('répond depuis le bord, au MILIEU de l’écran comme en haut', () => {
    /*
      LE GESTE NE MARCHAIT QU'EN HAUT.

      La bande était posée en absolu — `top: 0, bottom: 0` — mais ces zéros
      se comptent dans le PARENT, et son parent était la barre du titre :
      cinquante points de haut sur un écran qui en fait sept cents. Le geste
      demandé « comme sur les apps modernes » ne répondait donc que dans le
      bandeau supérieur, c'est-à-dire nulle part où l'on commence un
      glissement. Le défaut ne se voit pas en lisant le composant : il faut
      regarder QUI le contient.
    */
    const { h, sortis } = enveloppe();
    act(() => {
      jouer(h, [
        [8, 480],
        [30, 482],
        [60, 486],
        [110, 490],
      ]);
    });
    expect(sortis).toHaveLength(1);
  });

  it('prend la main AVANT le plan, sinon il ne l’aurait jamais', () => {
    /*
      LA NÉGOCIATION DU SYSTÈME, ET POURQUOI CE CHIFFRE EST PLUS PETIT.

      Quand une vue veut capturer un toucher que quelqu'un tient déjà, le
      système DEMANDE au tenant de le rendre. Le plan, les poignées et les
      bandeaux répondent tous non — et ils ont raison : un pan en cours ne se
      fait pas voler. Si le bord attendait plus que le seuil de glissement,
      le plan aurait pris la main le premier, refusé de la rendre, et le
      retour n'aurait jamais marché là où l'on s'en sert le plus.

      Ce banc ne peut pas rejouer la négociation — elle vit dans le système
      de responders, pas dans nos composants. Il garde donc l'invariant qui
      la décide, et qu'une retouche de seuil pourrait casser sans bruit.
    */
    expect(CAPTURE_MIN).toBeLessThan(GLISSEMENT_MIN);
  });

  it('ne vole jamais l’appui : un tap au bord reste au contenu', () => {
    const { h, sortis } = enveloppe();
    // Un appui franc au ras du bord, puis rien : le contenu garde la main,
    // et personne ne sort de l'écran.
    const pris = jouer(h, [
      [6, 480],
      [7, 481],
    ]);
    expect(pris.reclame).toBe(false);
    expect(sortis).toHaveLength(0);
  });

  it('laisse passer ce qui n’est pas un retour', () => {
    // Parti du milieu : c'est le plan qu'on promène.
    const a = enveloppe();
    act(() => {
      jouer(a.h, [
        [200, 480],
        [240, 482],
        [300, 486],
      ]);
    });
    expect(a.sortis).toHaveLength(0);

    // Parti du bord mais vers le bas : on fait défiler.
    const b = enveloppe();
    act(() => {
      jouer(b.h, [
        [8, 200],
        [12, 260],
        [16, 340],
      ]);
    });
    expect(b.sortis).toHaveLength(0);

    // Parti du bord, mais lâché à mi-chemin : on a hésité.
    const c = enveloppe();
    act(() => {
      jouer(c.h, [
        [8, 480],
        [24, 482],
        [44, 484],
      ]);
    });
    expect(c.sortis).toHaveLength(0);
  });
});

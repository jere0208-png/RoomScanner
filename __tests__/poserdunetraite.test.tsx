/**
 * LE PLAN SE POSE D'UNE TRAITE — la vidéo du patron, image par image.
 *
 * iPhone 15 Pro, soixante images par seconde, un pincer-relâcher du plan :
 * (a) six images où le plan réapparaît EXACTEMENT à sa position d'avant le
 * geste, puis saute à celle du relâcher ; (b) six images à une position
 * décalée en fin de geste, puis retour.
 *
 * Un banc ne voit pas l'écran. Il peut voir ce que l'écran va recevoir.
 * Sous Fabric, la couche du geste reçoit ses valeurs par DEUX chemins : les
 * images du geste partent par `setNativeProps`, hors de React ; le reste —
 * le dessin, la toile, et la transformation que React croit être celle de
 * la couche — part par les commits de React. Le défaut naît quand ces deux
 * chemins disent des choses différentes au même instant.
 *
 * Le banc rejoue donc le chemin natif tel qu'il est : la doublure de `View`
 * du préréglage Jest porte un `setNativeProps` espion, et hors de
 * `NODE_ENV=test` les valeurs animées y vont sans réveiller React —
 * exactement comme sur le téléphone, débounce de resynchronisation en moins
 * (le pire cas).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import {
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

type Pose = Record<string, unknown>[];

type Poussee = { style?: { transform?: Pose } };
/** L'espion `setNativeProps` de la doublure de `View`, commun à toutes. */
let espion: jest.Mock | null = null;
/** Ce que chaque `setNativeProps` a poussé à l'écran, dans l'ordre. */
const pousses = (): Poussee[] => (espion?.mock.calls ?? []).map((c) => c[0] as Poussee);

/** Le plan, monté avec des vues qui savent recevoir `setNativeProps`. */
function plan(onView?: (v: { zoom: number }) => void) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: [],
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: `Pièce ${i + 1}` })),
      fixtures: [],
      ceiling: [],
      photos: [],
    });
    tree = TestRenderer.create(
      <FloorplanEditor
        editable={false}
        showMeasures
        selectedWallId={null}
        onSelectWall={() => {}}
        onView={onView}
      />,
    );
  });
  act(() => {
    tree.root.findAllByType(View)[0].props.onLayout?.({
      nativeEvent: { layout: { width: 900, height: 620 } },
    });
  });
  arbre = tree;
  espion = (tree.root.findAllByType(View)[0].instance as { setNativeProps: jest.Mock })
    .setNativeProps;
  espion.mockClear();
  return tree;
}

/**
 * LE CHEMIN NATIF, COMME SUR LE TÉLÉPHONE. Hors banc, une valeur animée
 * pilotée en JS ne rend pas le composant : elle part par `setNativeProps`.
 * Le module d'Animated ne prend ce chemin que hors de `NODE_ENV=test`.
 */
function commeSurLeTelephone(f: () => void) {
  const avant = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    f();
  } finally {
    process.env.NODE_ENV = avant;
  }
}

/** Les poses poussées à la COUCHE du geste (elle seule a une échelle). */
const posesDeLaCouche = () =>
  pousses()
    .map((p) => p.style?.transform)
    .filter((t): t is Pose => !!t?.some((x) => 'scale' in x && 'translateX' in (t[0] ?? {})))
    .map((t) => t.slice(0, 4));

/** La transformation que React croit être celle de la couche. */
const poseRendue = (t: TestRenderer.ReactTestRenderer): Pose => {
  const c = t.root
    .findAll((n) => {
      if (typeof n.type !== 'string') return false;
      const st = StyleSheet.flatten(n.props?.style) as { transform?: unknown[] } | undefined;
      return (
        Array.isArray(st?.transform) &&
        n.findAll((x) => typeof x.props?.x1 === 'number').length > 0
      );
    })
    .pop()!;
  // La dernière translation est la MARQUE de la couche (un millième de point,
  // voir `nouvelleCouche`) : la pose, ce sont les quatre premières.
  return (StyleSheet.flatten(c.props.style) as { transform: Pose }).transform.slice(0, 4);
};

const A_PLAT: Pose = [
  { translateX: 0 },
  { translateY: 0 },
  { rotate: '0deg' },
  { scale: 1 },
];

/** Les coordonnées de tous les traits du dessin, en une empreinte. */
const empreinte = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAll((n) => typeof n.props?.x1 === 'number')
    .map((n) => `${n.props.x1},${n.props.y1}`)
    .join('|');

const toileDe = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAll((n) => typeof n.props?.bbWidth === 'number')
    .sort((a, b) => b.props.bbWidth - a.props.bbWidth)[0];

const zoneDuPlan = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(View)
    .find((n) => typeof n.props.onMoveShouldSetResponder === 'function')!;

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
      const t = bank[id]!;
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

/** Un glissement d'un doigt, de (x0, y0) à (x, y), lâcher compris ou non. */
function glisser(
  tree: TestRenderer.ReactTestRenderer,
  de: [number, number],
  a: [number, number],
  lacher: boolean,
) {
  const z = zoneDuPlan(tree).props;
  const m = main();
  z.onMoveShouldSetResponder?.(m.poser(de[0], de[1]));
  const e = m.bouger(de[0] + 10, de[1] + 5);
  z.onMoveShouldSetResponder?.(e);
  z.onResponderGrant?.(e);
  z.onResponderMove?.(m.bouger(a[0], a[1]));
  if (lacher) z.onResponderRelease?.(m.lever());
}

describe('le plan se pose d’une traite', () => {
  /*
    (2) LE LÂCHER NE POUSSE RIEN HORS DE REACT. La couche revient à plat
    dans le MÊME commit que le nouveau dessin — une couche neuve, née à
    plat —, jamais par une valeur animée qui partirait avant lui.
  */
  it('au lâcher, la couche revient à plat avec le dessin, par le même commit', () => {
    const tree = plan();
    const avant = empreinte(tree);
    commeSurLeTelephone(() => {
      act(() => glisser(tree, [400, 300], [470, 340], false));
      const enGeste = posesDeLaCouche().length;
      expect(enGeste).toBeGreaterThan(0);
      act(() => zoneDuPlan(tree).props.onResponderRelease?.(main().lever()));
      // Rien n'est parti par le chemin natif au lâcher…
      expect(posesDeLaCouche()).toHaveLength(enGeste);
    });
    // … et le commit porte, ensemble, le dessin neuf et la couche à plat.
    expect(empreinte(tree)).not.toBe(avant);
    expect(poseRendue(tree)).toEqual(A_PLAT);
  });

  /*
    LE LÂCHER CHANGE TOUJOURS LA TRANSFORMATION QUE REACT REND — diagnostic
    du patron sur la version 735 : au lâcher d'un glissé, le plan partait de
    toute la longueur du geste et n'en revenait qu'au geste suivant. Les
    valeurs de la couche partent à l'écran sans passer par React : s'il rend
    « à plat » après « à plat », il n'envoie rien, et l'écran garde la pose
    du geste par-dessus le dessin neuf. La marque de la couche alterne d'un
    lâcher à l'autre : React envoie donc toujours la couche à plat, avec le
    dessin.
  */
  it('chaque lâcher rend une transformation différente de la précédente', () => {
    const tree = plan();
    const brute = () => {
      const c = tree.root
        .findAll((n) => {
          if (typeof n.type !== 'string') return false;
          const st = StyleSheet.flatten(n.props?.style) as { transform?: unknown[] } | undefined;
          return Array.isArray(st?.transform) && st!.transform!.some((x) => 'scale' in (x as object));
        })
        .pop()!;
      return JSON.stringify((StyleSheet.flatten(c.props.style) as { transform: unknown[] }).transform);
    };
    const vues: string[] = [brute()];
    for (let k = 0; k < 3; k++) {
      act(() => glisser(tree, [400, 300], [420 + k * 30, 310], true));
      vues.push(brute());
    }
    for (let k = 1; k < vues.length; k++) expect(vues[k]).not.toBe(vues[k - 1]);
  });

  /*
    UN GESTE SUR UN PLAN QUI DÉBORDE NE REND RIEN AVANT LE LÂCHER.
    La toile s'ouvrait à la prise : un commit React en plein geste, qui
    repeignait une toile sept fois plus grande que l'écran (l'écran figé du
    diagnostic du patron) et risquait de recopier la couche du dernier rendu.
    Ses marges viennent désormais du rendu : pendant le geste, React ne rend
    rien — la couche bouge seule, la toile reste telle qu'au repos.
  */
  it('sur un plan qui déborde, le geste ne rend rien : la toile est prête depuis le repos', () => {
    const tree = plan();
    // Un premier geste pousse le plan à moitié hors de l'écran.
    act(() => glisser(tree, [400, 300], [800, 300], true));
    const auRepos = toileDe(tree).props.bbWidth;
    commeSurLeTelephone(() => {
      act(() => glisser(tree, [400, 300], [340, 280], false));
    });
    // La toile n'a pas bougé…
    expect(toileDe(tree).props.bbWidth).toBe(auRepos);
    // … la couche, si — par le pilote, pas par un rendu React.
    const poses = posesDeLaCouche();
    expect(poses[poses.length - 1]).not.toEqual(A_PLAT);
    expect(poseRendue(tree)).toEqual(A_PLAT);
  });

  /*
    (1) UN DOIGT QUI SE LÈVE NE DÉFAIT PAS LE PINCEMENT. Deux doigts ne se
    lèvent jamais à la même image : entre les deux, le geste repart sur un
    seul doigt. La couche se calculait depuis cette reprise : elle perdait
    tout le chemin déjà fait sous les doigts, et le plan se décalait jusqu'au
    lâcher, qui le ramenait d'un saut. La vidéo du patron, images 311 à 318.
  */
  it('un doigt qui se lève avant l’autre ne fait pas sauter le plan', () => {
    const vues: { zoom: number; ox: number }[] = [];
    const tree = plan((v) => vues.push({ ...(v as { zoom: number; ox: number }) }));
    const z = () => zoneDuPlan(tree).props;
    const valeur = (cle: string) =>
      Number(poseRendue(tree).find((x) => cle in x)![cle]);
    const m = main();
    act(() => {
      z().onMoveShouldSetResponder?.(m.poser(400, 300));
      const e = m.bouger(410, 300);
      z().onMoveShouldSetResponder?.(e);
      z().onResponderGrant?.(e);
      m.poser(510, 300, 1);
      // On écarte ET on emmène : le plan grandit et glisse vers la droite.
      for (let i = 1; i <= 6; i++) {
        m.bouger(510 + i * 22, 300, 1);
        z().onResponderMove?.(m.bouger(410 - i * 2, 300));
      }
    });
    const echelle = valeur('scale');
    const tx = valeur('translateX');
    expect(echelle).toBeGreaterThan(1.5);
    // La couche a bien bougé (le pincement se fait autour des doigts : voir
    // `pincerrelacher.test.tsx` pour la position exacte sous la main).
    expect(Math.abs(tx)).toBeGreaterThan(10);
    act(() => {
      // Le second doigt part le premier ; l'autre traîne encore un peu.
      m.lever(1);
      z().onResponderMove?.(m.bouger(398, 301));
      z().onResponderMove?.(m.bouger(401, 302));
    });
    // Le plan reste où les deux doigts l'avaient mis, au doigt près.
    expect(Math.abs(valeur('scale') - echelle)).toBeLessThan(0.01);
    expect(Math.abs(valeur('translateX') - tx)).toBeLessThan(6);
    act(() => z().onResponderRelease?.(m.lever()));
    // Et le lâcher pose exactement ce qu'on voyait.
    expect(Math.abs(vues[vues.length - 1].zoom - echelle)).toBeLessThan(0.01);
  });
});

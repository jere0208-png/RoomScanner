/**
 * LA PRISE COMMANDÉE S'ALLUME, ET C'EST ELLE QUI S'ALLUME.
 *
 * Relevé du patron : « j'ai lié une prise à un interrupteur (PC commandée) et
 * au clic, ça allume la lumière alors qu'aucun lien avec cet interrupteur.
 * C'est à revoir. »
 *
 * IL DÉCRIVAIT EXACTEMENT CE QUI SE PASSAIT, ET LA CAUSE ÉTAIT AILLEURS.
 *
 * La vue cherchait ce qu'un interrupteur allume UNIQUEMENT dans la table du
 * plafond. L'interrupteur d'une prise commandée n'avait donc aucune lumière —
 * donc aucune CIBLE, puisqu'un appareil qui ne répond à rien n'en offre pas.
 *
 * Et comme la cible est volontairement PLUS LARGE que le symbole — un
 * mécanisme fait sept centimètres sur un mur de cinq mètres, on vise avec un
 * doigt —, le doigt posé sur cet interrupteur muet tombait dans la cible du
 * voisin. C'est l'autre interrupteur qui recevait l'appui, et c'est sa lampe
 * qui s'allumait. « Aucun lien avec cet interrupteur » : exactement vrai.
 *
 * UN DÉFAUT PLUS GROS DORMAIT À CÔTÉ. L'APPLIQUE est un point lumineux, et
 * elle est au MUR : elle ne s'allumait donc jamais, quel que soit
 * l'interrupteur qu'on touchait. Personne ne l'avait relevé parce qu'on ne
 * pense pas à essayer ce qui ne marche pas du tout — on essaie ce qui marche
 * de travers. Ce banc tient les deux.
 *
 * LA RÈGLE, DÉSORMAIS : ce qui s'allume, c'est ce que dit `seCommande` — les
 * prises 16 A et l'applique —, plus la table du plafond. Une seule liste, celle
 * du modèle électrique, et non la seule table qui était à portée de main.
 */
const canevasPresent = { valeur: false };

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
    return canevasPresent.valeur ? 'RoomScanCanvas' : undefined;
  },
}));

import React from 'react';
import { View } from 'react-native';
import { Circle } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
import { seCommande } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';
import type { CeilingFixture } from '../src/geometry/ceiling';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const MURS: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];

/** L'interrupteur du plafonnier — celui qui allume vraiment une lumière. */
const INTER_LAMPE: Fixture = {
  id: 'i1',
  kind: 'inter',
  wallId: 'n',
  along: 1,
  height: 1.1,
  side: 1,
};
/** L'interrupteur de la PRISE COMMANDÉE : il ne commande aucun plafonnier. */
const INTER_PRISE: Fixture = {
  id: 'i2',
  kind: 'inter',
  wallId: 'n',
  along: 4,
  height: 1.1,
  side: 1,
};
/** La prise commandée : c'est ELLE qui porte le lien vers son interrupteur. */
const PRISE: Fixture = {
  id: 'p1',
  kind: 'prise',
  wallId: 'n',
  along: 2.5,
  height: 0.25,
  side: 1,
  commands: ['i2'],
};
/** Une prise ordinaire : elle n'est commandée par personne. */
const PRISE_NUE: Fixture = {
  id: 'p2',
  kind: 'prise',
  wallId: 'n',
  along: 3.2,
  height: 0.25,
  side: 1,
};
/** L'applique — un point lumineux AU MUR, commandé par le même que le plafond. */
const APPLIQUE: Fixture = {
  id: 'a1',
  kind: 'applique',
  wallId: 'n',
  along: 0.5,
  height: 1.9,
  side: 1,
  commands: ['i1'],
};
const LAMPE: CeilingFixture = {
  id: 'c1',
  kind: 'dcl',
  roomId: 'r1',
  at: { x: 2.5, z: 2 },
  commands: ['i1'],
};

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (murales: Fixture[] = [INTER_LAMPE, INTER_PRISE, PRISE, PRISE_NUE]) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never,
      fixtures: murales,
      ceiling: [LAMPE],
      photos: [],
    });
    t = TestRenderer.create(
      <Iso3DView value={{ theta: -32, tilt: 56, zoom: 1, ox: 0, oy: 0 }} />,
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

const gestes = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAll(
    (n) => typeof n.props?.onStartShouldSetResponder === 'function',
  )[0];

/**
 * UN APPUI SIMPLE, tel que le `PanResponder` le voit.
 *
 * Il IGNORE l'état de geste qu'on lui passe et le recalcule depuis
 * `e.touchHistory` — le piège que la maison connaît par cœur. On lui donne
 * donc un doigt crédible : posé, puis relâché au même endroit.
 */
const taper = (t: TestRenderer.ReactTestRenderer, x: number, y: number) => {
  const v = gestes(t);
  const horloge = 1000;
  const doigt = {
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
  const ev = (actif: boolean) => ({
    nativeEvent: {
      touches: actif ? [{ identifier: 0, pageX: x, pageY: y }] : [],
      changedTouches: [{ identifier: 0, pageX: x, pageY: y }],
      identifier: 0,
      pageX: x,
      pageY: y,
      locationX: x,
      locationY: y,
      timestamp: horloge,
    },
    touchHistory: {
      touchBank: [{ ...doigt, touchActive: actif }],
      numberActiveTouches: actif ? 1 : 0,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: horloge,
    },
  });
  act(() => {
    v.props.onStartShouldSetResponder?.(ev(true));
    v.props.onResponderGrant?.(ev(true));
  });
  act(() => {
    v.props.onResponderRelease?.(ev(false));
  });
};

/** Les halos allumés, par identifiant d'appareil. */
const allumes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Circle)
    .filter((n) => String(n.props.testID ?? '').startsWith('halo-'))
    .map((n) => String(n.props.testID).slice(5))
    .filter((id, i, tous) => tous.indexOf(id) === i)
    .sort();

const cible = (t: TestRenderer.ReactTestRenderer, id: string) =>
  t.root.findAll((n) => String(n.props?.testID ?? '') === `cible-${id}`)[0];

const appuyerSur = (t: TestRenderer.ReactTestRenderer, id: string) => {
  const c = cible(t, id);
  expect(`cible-${id} : ${!!c}`).toBe(`cible-${id} : true`);
  taper(t, c.props.cx, c.props.cy);
};

describe('l’interrupteur d’une prise commandée', () => {
  it('offre une cible — sans quoi le doigt part chez le voisin', () => {
    /*
      C'EST LA CAUSE DU DÉFAUT RELEVÉ, et elle se tient ici. Un appareil qui
      ne répond à rien n'offre aucune cible : la règle est bonne, et c'est
      justement pour ça qu'elle était dangereuse. `i2` commande une prise ; il
      répond donc à quelque chose, et il doit avoir sa cible.
    */
    expect(cible(monter(), 'i2')).toBeDefined();
  });

  it('allume LA PRISE, et rien d’autre', () => {
    const t = monter();
    expect(allumes(t)).toEqual([]);
    appuyerSur(t, 'i2');
    expect(allumes(t)).toEqual(['p1']);
  });

  it('et le plafonnier du voisin reste éteint', () => {
    /*
      LE CONTRÔLE QUI PORTE LE RELEVÉ, mot pour mot : « ça allume la lumière
      alors qu'aucun lien avec cet interrupteur ». Le plafonnier est commandé
      par `i1` ; toucher `i2` ne doit jamais l'atteindre.
    */
    const t = monter();
    appuyerSur(t, 'i2');
    expect(allumes(t)).not.toContain('c1');
  });

  it('un second appui l’éteint : c’est un interrupteur', () => {
    const t = monter();
    appuyerSur(t, 'i2');
    appuyerSur(t, 'i2');
    expect(allumes(t)).toEqual([]);
  });

  it('et l’autre interrupteur, lui, allume bien son plafonnier', () => {
    // Le contrôle en sens inverse : si plus rien ne s'allumait, les épreuves
    // du dessus passeraient sans rien prouver.
    const t = monter();
    appuyerSur(t, 'i1');
    expect(allumes(t)).toEqual(['c1']);
  });

  it('une prise que personne ne commande ne s’allume jamais', () => {
    /*
      L'AUTRE CONTRÔLE EN SENS INVERSE, et il compte : si toute prise portait
      un halo, on aurait remplacé un défaut par un sapin de Noël. Une prise
      ordinaire n'est pas une lumière — elle n'a rien à allumer, et rien ne
      l'allume.
    */
    const t = monter();
    appuyerSur(t, 'i2');
    appuyerSur(t, 'i1');
    expect(allumes(t)).toEqual(['c1', 'p1']);
  });
});

describe('l’applique aussi, et elle ne s’allumait JAMAIS', () => {
  /*
    LE DÉFAUT TROUVÉ EN CHERCHANT L'AUTRE. Une applique est un point lumineux
    au MUR : elle vit dans la table des appareils muraux, pas dans celle du
    plafond, et c'est la seule qu'on lisait. Elle n'a donc jamais pu s'allumer
    depuis que ce geste existe.

    Personne ne l'avait relevé, et c'est logique : on n'essaie pas ce qui ne
    marche pas du tout, on essaie ce qui marche de travers.
  */
  const AVEC = [INTER_LAMPE, INTER_PRISE, PRISE, APPLIQUE];

  it('elle s’allume avec le plafonnier qu’elle partage', () => {
    const t = monter(AVEC);
    appuyerSur(t, 'i1');
    expect(allumes(t)).toEqual(['a1', 'c1']);
  });

  it('et le modèle électrique disait déjà qu’elle se commande', () => {
    /*
      LA LISTE EXISTAIT, ET LA VUE NE LA LISAIT PAS. `seCommande` dit depuis
      toujours ce qui s'allume depuis un interrupteur ; la vue 3D avait sa
      propre idée, plus étroite, écrite nulle part. C'est cet écart-là qu'on
      supprime, et c'est lui qu'on tient ici.
    */
    expect(seCommande('applique')).toBe(true);
    expect(seCommande('prise')).toBe(true);
    expect(seCommande('rj45')).toBe(false);
  });
});

describe('le halo d’un point mural', () => {
  it('est plus petit que celui d’un plafonnier', () => {
    /*
      Une applique éclaire son pan de mur, un plafonnier éclaire la pièce : le
      dessin doit dire cette différence, sinon on lit deux plafonniers dont
      l'un serait accroché au mur.
    */
    const t = monter([INTER_LAMPE, APPLIQUE]);
    appuyerSur(t, 'i1');
    const rayon = (id: string) =>
      Number(
        t.root
          .findAllByType(Circle)
          .find((n) => String(n.props.testID ?? '') === `halo-${id}`)!.props.r,
      );
    expect(rayon('a1')).toBeLessThan(rayon('c1'));
    // Mais il reste un halo : divisé par deux, ce serait une pastille.
    expect(rayon('a1')).toBeGreaterThan(rayon('c1') * 0.5);
  });
});

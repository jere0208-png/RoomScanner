/**
 * LE MEUBLE QUI PERCE LE MUR — l'envers du defaut de la chaise.
 *
 * Releve du patron, capture a l'appui : « les meubles depassent encore
 * parfois des murs selon un angle, comme le meuble interieur qui depasse sur
 * la photo. Cela signifie que les murs ne sont pas strictement positionnes
 * sur les meubles lorsqu'ils sont senses etre devant ». Sur l'image, un coin
 * de meuble affleure au milieu d'un pan de mur qui devrait le cacher tout
 * entier.
 *
 * `chaisecachee` mesurait la faute INVERSE — un mur peint par-dessus un
 * meuble — et il ne trouve rien : le classement, calcule pour l'angle
 * courant, est juste. Celui-ci mesure l'autre sens : un meuble peint
 * par-dessus un mur qui, au point de recouvrement, est plus PRES de l'oeil
 * que lui.
 *
 * ET LE COUPABLE N'EST PAS LE CLASSEMENT, C'EST SA FRAICHEUR. La vue ne le
 * recalcule que tous les quatre degres et reprend le precedent entre-temps —
 * une economie qui vaut pendant un geste, ou l'image suivante arrive dans
 * trente millisecondes. Mais elle valait AUSSI AU REPOS : le doigt se levait
 * a trois degres du dernier calcul, et le modele restait la, immobile, avec
 * un ordre de peinture qui n'etait pas le sien. C'est exactement ce que la
 * capture montre — une image fixe, et un meuble qui perce.
 *
 * Le chiffre ci-dessous dit tout : sur cette scene, l'ordre frais laisse sept
 * angles fautifs sur cent quatre-vingts ; le meme ordre pris quatre degres
 * plus tot en laisse quatre-vingt-neuf. Treize fois plus.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

/*
  ON COMPTE LES CLASSEMENTS, on ne les devine pas : la vue garde le sien en
  memoire, et c'est cette memoire qu'on met a l'epreuve. Le vrai calcul est
  conserve — c'est bien la scene reelle qui se trie.
*/
jest.mock('../src/geometry/scene3d', () => {
  const vrai = jest.requireActual('../src/geometry/scene3d');
  return { ...vrai, ajusterBlocs: jest.fn(vrai.ajusterBlocs) };
});

import {
  ajusterBlocs,
  buildScene,
  faceDepth,
  isHiddenFace,
  masquesDeScene,
  roomRanks,
  sceneFraming,
  type P3,
  type ScenePalette,
} from '../src/geometry/scene3d';
import type { WallSeg } from '../src/geometry/floorplan';
import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';

const PAL: ScenePalette = {
  floor: '#EEEEEE', floorStroke: '#CCCCCC', wall: '#FFFFFF', wallStroke: '#888888',
  wallTop: '#F4F4F4', wallTopStroke: '#949494', opening: '#B9C2CE', door: '#E8A13B',
  window: '#3EB8E5', passage: '#2F6BFF', object: '#D8E1F2', objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  roomId: string,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId,
});

/** Deux pieces separees par un refend : c'est la scene de la capture. */
const MURS = [
  mur('n', 0, 0, 6, 0, 'r1'),
  mur('e1', 6, 0, 6, 3, 'r1'),
  mur('mid', 6, 3, 0, 3, 'r1'),
  mur('o1', 0, 3, 0, 0, 'r1'),
  mur('e2', 6, 3, 6, 6, 'r2'),
  mur('s', 6, 6, 0, 6, 'r2'),
  mur('o2', 0, 6, 0, 3, 'r2'),
];

const meuble = (id: string, x: number, z: number, roomId: string, h = 0.9) => ({
  id,
  roomId,
  category: 'storage',
  width: 0.6,
  depth: 0.5,
  height: h,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, h / 2, z, 1],
});

/** Un de chaque cote du refend, et une armoire haute contre le mur nord. */
const OBJETS = [
  meuble('m1', 2, 2.6, 'r1'),
  meuble('m2', 4, 3.4, 'r2'),
  meuble('m3', 1, 0.4, 'r1', 1.8),
];

const dansLePolygone = (
  p: { sx: number; sy: number },
  poly: { sx: number; sy: number }[],
) => {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (
      a.sy > p.sy !== b.sy > p.sy &&
      p.sx < ((b.sx - a.sx) * (p.sy - a.sy)) / (b.sy - a.sy) + a.sx
    ) {
      dedans = !dedans;
    }
  }
  return dedans;
};

/** La profondeur du plan d'une face au point donne — trait compris. */
const profAu = (
  poly: { sx: number; sy: number; depth: number }[],
  pt: { sx: number; sy: number },
): number | null => {
  if (poly.length === 2) {
    const [a, b] = poly;
    const ex = b.sx - a.sx;
    const ey = b.sy - a.sy;
    const l2 = ex * ex + ey * ey;
    if (l2 < 1e-9) return a.depth;
    const t = Math.max(
      0,
      Math.min(1, ((pt.sx - a.sx) * ex + (pt.sy - a.sy) * ey) / l2),
    );
    return a.depth + (b.depth - a.depth) * t;
  }
  for (let i = 1; i + 1 < poly.length; i++) {
    const [A, B, C] = [poly[0], poly[i], poly[i + 1]];
    const det = (B.sy - C.sy) * (A.sx - C.sx) + (C.sx - B.sx) * (A.sy - C.sy);
    if (Math.abs(det) < 1e-9) continue;
    const l1 =
      ((B.sy - C.sy) * (pt.sx - C.sx) + (C.sx - B.sx) * (pt.sy - C.sy)) / det;
    const l2 =
      ((C.sy - A.sy) * (pt.sx - C.sx) + (A.sx - C.sx) * (pt.sy - C.sy)) / det;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
    return l1 * A.depth + l2 * B.depth + l3 * C.depth;
  }
  return null;
};

const rad = (d: number) => (d * Math.PI) / 180;
const camDe = (theta: number) => ({
  ct: Math.cos(rad(theta)),
  st: Math.sin(rad(theta)),
  cp: Math.cos(rad(45)),
  sp: Math.sin(rad(45)),
});

const { faces, rooms } = buildScene(MURS, [], OBJETS as never, {
  palette: PAL,
  showSurfaces: true,
  rooms: [{ id: 'r1' }, { id: 'r2' }],
});
const centre = sceneFraming(faces).center;
/** Quel pan masque quel meuble : calcule une fois, comme dans la vue. */
const MASQUES = masquesDeScene(faces);

const vuesA = (theta: number) => {
  const cam = camDe(theta);
  const project = (p: P3) => {
    const x = p.x - centre.x;
    const y = p.y - centre.y;
    const z = p.z - centre.z;
    const rx = x * cam.ct - z * cam.st;
    const rz = x * cam.st + z * cam.ct;
    return {
      sx: 200 + rx * 60,
      sy: 260 + (rz * cam.cp - y * cam.sp) * 60,
      depth: rz * cam.sp + y * cam.cp,
    };
  };
  const rangs = roomRanks(rooms, cam);
  return faces
    .filter((f) => !isHiddenFace(f, cam))
    .map((f) => ({
      proj: f.pts.map(project),
      depth: faceDepth(f, project, cam, rangs),
      owner: f.ownerId,
      pan: f.panId,
      bord: f.bordDe,
      meuble: !!f.ownerId,
      room: f.roomId,
      // Le pan dit les meubles qu'il masque : voir `ajusterBlocs`. La liste
      // ne depend pas de l'angle ; seul le « me fait-il face » en depend.
      cache: (() => {
        if (f.panId === undefined) return undefined;
        const m = MASQUES.get(f.panId);
        if (!m) return undefined;
        const vers = m.n.x * cam.st * cam.sp + m.n.y * cam.cp + m.n.z * cam.ct * cam.sp;
        return vers > 0 ? m.cache : undefined;
      })(),
      /*
        MURS PLEINS : TOUT PAN CACHE.

        Le banc jugeait en ecorche, ou un pan qui nous fait face s'efface a
        quinze pour cent — on le retirait donc des coupables. Mais le releve
        du patron est pris avec le reglage « Murs », ou ce meme pan est
        OPAQUE : « on voit clairement des meubles traverser le mur blanc
        opaque ». C'est ce reglage-la qu'on met a l'epreuve, et il est plus
        exigeant.
      */
      mur: !f.ownerId,
    }));
};

/**
 * Les angles ou un meuble perce un mur, l'ordre etant calcule `fige` degres
 * plus tot — zero pour l'ordre de l'angle courant.
 */
const anglesQuiPercent = (fige: number) => {
  let fautes = 0;
  for (let theta = 0; theta < 360; theta += 2) {
    const vues = vuesA(theta);
    if (fige > 0) {
      // Exactement ce que fait la memoire de la vue : chaque pan retrouve sa
      // profondeur par son numero, chaque arete suit le sien.
      const anciennes = vuesA(theta - fige);
      ajusterBlocs(anciennes, false);
      const table = new Map<number, number>();
      for (const p of anciennes) {
        if (p.pan !== undefined) table.set(p.pan, p.depth);
      }
      for (const p of vues) {
        const d = p.pan !== undefined ? table.get(p.pan) : undefined;
        if (d !== undefined) p.depth = d;
        else if (p.bord !== undefined) {
          const dp = table.get(p.bord);
          if (dp !== undefined) p.depth = dp + 1e-6;
        }
      }
    } else {
      ajusterBlocs(vues, false);
    }
    const perce = vues.filter((v) => v.meuble).some((m) => {
      const g = {
        sx: m.proj.reduce((s, p) => s + p.sx, 0) / m.proj.length,
        sy: m.proj.reduce((s, p) => s + p.sy, 0) / m.proj.length,
      };
      // Le centre ET les sommets rentres d'un cheveu : ce qui perce est
      // souvent un COIN, et le milieu n'en dit rien.
      const points = [
        g,
        ...m.proj.map((p) => ({
          sx: p.sx + (g.sx - p.sx) * 0.08,
          sy: p.sy + (g.sy - p.sy) * 0.08,
        })),
      ];
      return points.some((c) => {
        const dM = profAu(m.proj, c);
        if (dM === null) return false;
        return vues.some((v) => {
          // Peint AVANT le meuble alors qu'il est plus PRES : voila la faute.
          if (!v.mur || v.depth >= m.depth || !dansLePolygone(c, v.proj)) {
            return false;
          }
          const dW = profAu(v.proj, c);
          return dW !== null && dW > dM + 0.01;
        });
      });
    });
    if (perce) fautes += 1;
  }
  return fautes;
};

describe('un meuble ne perce pas le mur qui le cache', () => {
  /*
    AUCUNE PERCEE, SOUS AUCUN ANGLE. C'est la correction stricte demandee.

    Le premier remede — reclasser des que la vue se pose — avait ramene les
    fautes de vingt-trois a sept sur cent quatre-vingts (murs pleins). Sept
    de trop : « on voit clairement des meubles traverser le mur blanc
    opaque… fais une correction stricte ».

    Ce qui restait tenait au principe meme du classement : il tranche au
    PIXEL, et quand trois faces se recouvrent en ronde, il faut bien choisir.
    Or dans ce cas precis il n'y a rien a choisir. Un pan est un morceau de
    plan ; si ce plan nous fait face, tout ce qui est de l'autre cote est
    derriere lui — le rayon qui va du meuble a l'oeil traverse forcement le
    plan. C'est vrai sous tous les angles, et ca ne se discute pas.

    Le classement recoit donc ces couples-la comme des FLECHES IMPOSEES (le
    meuble d'abord, le pan ensuite), au meme titre que le lien entre une
    arete et son pan. Le pixel garde tout le reste.
  */
  it('n’en laisse aucune, sous aucun angle', () => {
    expect(anglesQuiPercent(0)).toBe(0);
  });

  /*
    ET C'EST BIEN LA FRAICHEUR QUI FAISAIT LE RESTE.

    Le meme calcul, pris quatre degres plus tot, en laisse encore passer :
    les fleches imposees valent pour l'angle ou elles ont ete posees, pas
    pour le suivant. C'est la mesure qui interdit de reprendre cette economie
    au repos — sous le doigt, elle reste bonne.
  */
  it('mais un classement vieux de quatre degres en laisse passer', () => {
    expect(anglesQuiPercent(4)).toBeGreaterThan(0);
  });
});

/**
 * ET LA VUE, ELLE, RECLASSE DES QU'ELLE SE POSE.
 *
 * Le compte ci-dessus dit ce que coute un ordre vieux de quatre degres ;
 * celui-ci verifie que la vue ne le sert plus au repos. Pendant un geste,
 * l'economie reste — l'image suivante arrive dans trente millisecondes, et
 * un trait de dos qui parait le temps d'un clignement ne se voit pas. Une
 * image FIXE, elle, se regarde : elle doit etre juste.
 */
describe('la vue 3D reclasse des qu’elle se pose', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  let arbre: TestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => arbre?.unmount());
    arbre = null;
  });

  const vue = (theta: number) => (
    <Iso3DView value={{ theta, tilt: 58, zoom: 1, ox: 0, oy: 0 }} />
  );

  function monter() {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        walls: MURS,
        openings: [],
        objects: OBJETS as never,
        rooms: [
          { id: 'r1', name: 'Sejour', floor: null },
          { id: 'r2', name: 'Chambre', floor: null },
        ],
        fixtures: [],
        ceiling: [],
        showFurniture: true,
      });
      t = TestRenderer.create(vue(35));
    });
    act(() => {
      const z = t.root
        .findAllByType(View)
        .find((n) => typeof n.props.onLayout === 'function')!;
      z.props.onLayout({ nativeEvent: { layout: { width: 390, height: 620 } } });
    });
    arbre = t;
    return t;
  }

  const comptes = () => (ajusterBlocs as jest.Mock).mock.calls.length;

  it('reclasse pour un demi-degre de plus, une fois le doigt leve', () => {
    const t = monter();
    const avant = comptes();
    act(() => t.update(vue(35.5)));
    // Un demi-degre : l'ancienne regle gardait la memoire jusqu'a quatre.
    expect(comptes()).toBeGreaterThan(avant);
  });

  it('et le fait a chaque angle ou l’on s’arrete', () => {
    const t = monter();
    for (const theta of [36, 37, 38, 39]) {
      const avant = comptes();
      act(() => t.update(vue(theta)));
      expect(comptes()).toBeGreaterThan(avant);
    }
  });

  /**
   * MAIS PENDANT LE GESTE, LA MEMOIRE SERT — c'est elle qui tient les trente
   * images par seconde sur un logement meuble.
   */
  it('garde sa memoire tant que le doigt est sur l’ecran', () => {
    const t = monter();
    const zone = t.root
      .findAllByType(View)
      .find((n) => typeof n.props.onStartShouldSetResponder === 'function')!;
    const toucher = {
      nativeEvent: {
        touches: [{ pageX: 10, pageY: 10, identifier: 1, timestamp: 0 }],
        changedTouches: [],
        locationX: 10,
        locationY: 10,
        identifier: 1,
        timestamp: 0,
      },
      touchHistory: {
        touchBank: [
          undefined,
          {
            touchActive: true,
            startPageX: 10,
            startPageY: 10,
            startTimeStamp: 0,
            currentPageX: 10,
            currentPageY: 10,
            currentTimeStamp: 0,
            previousPageX: 10,
            previousPageY: 10,
            previousTimeStamp: 0,
          },
        ],
        numberActiveTouches: 1,
        indexOfSingleActiveTouch: 1,
        mostRecentTimeStamp: 0,
      },
    } as never;
    act(() => {
      zone.props.onStartShouldSetResponder?.(toucher);
      zone.props.onResponderGrant?.(toucher);
    });
    const avant = comptes();
    act(() => t.update(vue(36)));
    // Un degre en plein geste : on repeint avec l'ordre deja calcule.
    expect(comptes()).toBe(avant);
  });
});

/**
 * MAJ « PLAN 2D » — point 7 de la synthèse des testeurs : la fluidité de
 * l'édition du plan 2D.
 *
 * Relevé : « chaque image d'un coin, d'un côté ou d'une pièce tirée
 * redessine deux fois tout l'écran et tout l'éditeur. Mesuré : environ
 * 210 ms par image sur l'exemple, 370 ms sur 30 pièces, 1,3 s sur
 * 100 pièces. Une simple sélection coûte de 75 à 170 ms ».
 *
 * Ce qui a changé :
 *   — les murs et les pièces tirés vivent « en vol » pendant le geste
 *     (`store/planEnVol`), comme le meuble : l'action du magasin est
 *     exécutée À BLANC (`simuler`) pour montrer exactement ce que le lâcher
 *     écrira, et le magasin n'est écrit qu'au lâcher — une écriture, une
 *     entrée d'historique ;
 *   — seuls les morceaux qui dessinent ce qui bouge s'y abonnent (le mur et
 *     ses voisins, leurs poignées, la pièce, ses meubles, son sol) ; le poché
 *     se refait une fois au début du geste, sans les murs emportés ;
 *   — l'éditeur est mémoïsé derrière une enveloppe qui stabilise les rappels
 *     de l'écran ; ses couches (poché, sols, meubles, appareillage, cotes…)
 *     sont gardées d'un rendu à l'autre, et une sélection ne refait que ce
 *     qu'elle colore ; `useDeferredValue` (deux rendus complets par image)
 *     est retiré.
 *
 * MESURÉ SUR CE BANC (jest, React de développement sous Node, machine
 * partagée : des ordres de grandeur, c'est le rapport qui compte). Médiane
 * par image, AVANT → APRÈS, et rendus de l'éditeur par image :
 *
 *                                   exemple              30 pièces
 *   éditeur — tirer un coin         140 → 8-10 ms        435 → 15-32 ms
 *   éditeur — tourner un mur        174 → 11-12 ms       466 → 16-21 ms
 *   éditeur — glisser une pièce     156 → 24-27 ms       528 → 12-16 ms
 *     (rendus de l'éditeur)         2 → 0 par image      2 → 0 par image
 *   éditeur — choisir un mur        81 → 10-12 ms        172 → 11-12 ms
 *   éditeur — choisir une pièce     67 → 5-8 ms          160 → 16-33 ms
 *   écran — tirer un coin           249 → 10-14 ms       604 → 22 ms
 *     (rendus écran + éditeur)      1 + 2 → 0 + 0        1 + 2 → 0 + 0
 *   écran — choisir un mur          157 → 75-92 ms       285 → 104-109 ms
 *
 * Le lâcher paie le rendu qu'on ne paie plus à chaque image : un seul,
 * 100 ms sur l'exemple, 290 ms sur trente pièces (écran compris). Le choix
 * d'un mur dans l'écran reste dominé par le rendu de l'écran lui-même (ses
 * bandeaux et ses feuilles), que ce lot ne touche pas : l'éditeur, lui, n'y
 * compte plus que pour une dizaine de millisecondes. Les chiffres du jour
 * s'impriment à chaque passage.
 *
 * Le pincer-glisser du plan, lui, ne change pas : sa couche, sa marque et
 * `poserLeGeste` ont leurs bancs (pincerrelacher, poserdunetraite,
 * ecranfidele, fluidite, meublefluide), qui restent verts.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
  multiGet: jest.fn(async (k: string[]) => k.map((x) => [x, null])),
}));

/*
  QUI SE REND, ET COMBIEN DE FOIS — comme `meublefluide` : chaque composant
  lit sa palette par `useTheme()` en tête de rendu.
*/
jest.mock('../src/theme', () => {
  const vrai = jest.requireActual('../src/theme');
  return {
    ...vrai,
    useTheme: () => {
      const g = globalThis as unknown as { __rendus?: Map<string, number> };
      if (g.__rendus) {
        const ligne = (new Error().stack ?? '').split('\n')[2] ?? '';
        const nom = /at (\w+)/.exec(ligne)?.[1] ?? '?';
        g.__rendus.set(nom, (g.__rendus.get(nom) ?? 0) + 1);
      }
      return vrai.useTheme();
    },
  };
});

import React from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import { ResultScreen } from '../src/screens/ResultScreen';
import { finirLeGeste } from '../src/store/geste';
import { atterrir, usePlanEnVol, volerLAction } from '../src/store/planEnVol';
import { simuler, useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';

beforeAll(() => jest.useFakeTimers({ doNotFake: ['hrtime', 'performance'] }));
afterAll(() => jest.useRealTimers());

const g = globalThis as unknown as { __rendus?: Map<string, number> };
const maintenant = () => Number(process.hrtime.bigint()) / 1e6;
const st = () => useScanStore.getState();

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  g.__rendus = undefined;
  atterrir();
  finirLeGeste();
});

/** Trente pièces en grille, six sur cinq : 71 murs, 71 baies. */
function grille30() {
  const L = 4;
  const P = 3.2;
  const mur = (id: string, a: { x: number; z: number }, b: { x: number; z: number }): WallSeg => ({
    id,
    type: 'wall',
    a,
    b,
    height: 2.5,
    yCenter: 1.25,
  });
  const walls: WallSeg[] = [];
  for (let r = 0; r <= 5; r++) {
    for (let c = 0; c < 6; c++) walls.push(mur(`h-${r}-${c}`, { x: c * L, z: r * P }, { x: (c + 1) * L, z: r * P }));
  }
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c <= 6; c++) walls.push(mur(`v-${r}-${c}`, { x: c * L, z: r * P }, { x: c * L, z: (r + 1) * P }));
  }
  const rooms = [];
  let n = 1;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 6; c++) {
      rooms.push({
        id: `p-${r}-${c}`,
        name: `Pièce ${n++}`,
        wallIds: [`h-${r}-${c}`, `h-${r + 1}-${c}`, `v-${r}-${c}`, `v-${r}-${c + 1}`],
      });
    }
  }
  const openings: WallSeg[] = walls.map((w) => {
    const ext = w.id.startsWith('h-') ? /^h-(0|5)-/.test(w.id) : /-(0|6)$/.test(w.id);
    const larg = ext ? 1.2 : 0.83;
    const l = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
    const u = { x: (w.b.x - w.a.x) / l, z: (w.b.z - w.a.z) / l };
    const m = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
    return {
      id: `o-${w.id}`,
      type: ext ? 'window' : 'door',
      a: { x: m.x - (u.x * larg) / 2, z: m.z - (u.z * larg) / 2 },
      b: { x: m.x + (u.x * larg) / 2, z: m.z + (u.z * larg) / 2 },
      height: ext ? 1.2 : 2.1,
      yCenter: ext ? 1.5 : 1.05,
    };
  });
  return { walls, rooms, openings };
}

type Plan = 'exemple' | 'grille';
function charger(plan: Plan) {
  useUsage.setState({ modeElec: false, charge: true, choisi: true });
  act(() => {
    st().ouvrirExemple();
    if (plan === 'grille') useScanStore.setState({ ...grille30(), objects: [], fixtures: [], ceiling: [], photos: [] });
  });
}
/** Un refend : le mur partagé par deux pièces, au milieu du plan. */
const unRefend = (plan: Plan) =>
  plan === 'grille' ? 'v-2-3' : st().walls.find((w) => st().rooms.filter((r) => r.wallIds?.includes(w.id)).length === 2)!.id;
const unePiece = (plan: Plan) => (plan === 'grille' ? 'p-2-2' : st().rooms[0].id);

/** Un doigt, avec l'archive tactile que `PanResponder` relit. */
function doigt() {
  let horloge = 1000;
  let t: Record<string, number | boolean> = {};
  const ev = () => ({
    nativeEvent: {
      touches: t.touchActive ? [{ identifier: 0, pageX: t.currentPageX, pageY: t.currentPageY }] : [],
      locationX: t.currentPageX as number,
      locationY: t.currentPageY as number,
      pageX: t.currentPageX as number,
      pageY: t.currentPageY as number,
    },
    touchHistory: {
      touchBank: [t],
      numberActiveTouches: t.touchActive ? 1 : 0,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: horloge,
    },
  });
  return {
    poser(x: number, y: number) {
      horloge += 16;
      t = {
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
      return ev();
    },
    bouger(x: number, y: number) {
      horloge += 16;
      t = { ...t, previousPageX: t.currentPageX, previousPageY: t.currentPageY, currentPageX: x, currentPageY: y, currentTimeStamp: horloge };
      return ev();
    },
    lever() {
      horloge += 16;
      t = { ...t, touchActive: false, currentTimeStamp: horloge };
      return ev();
    },
  };
}

/** Les rendus de chaque composant pendant `faire`. */
function compter(faire: () => void) {
  g.__rendus = new Map();
  try {
    faire();
  } finally {
    // Les rendus sont relevés même si `faire` échoue.
  }
  const r = g.__rendus;
  g.__rendus = undefined;
  return { de: (nom: string) => r.get(nom) ?? 0 };
}

/** Le temps par image (médiane, ms) et les rendus par image de l'éditeur et de l'écran. */
function chronometrer(n: number, faire: (i: number) => void) {
  const durees: number[] = [];
  const r = compter(() => {
    for (let i = 1; i <= n; i++) {
      const t0 = maintenant();
      act(() => faire(i));
      durees.push(maintenant() - t0);
    }
  });
  durees.sort((a, b) => a - b);
  return {
    ms: Math.round(durees[n >> 1] * 10) / 10,
    editeur: r.de('FloorplanEditor') / n,
    ecran: r.de('ResultScreen') / n,
  };
}

const poserLeCadre = (tree: TestRenderer.ReactTestRenderer) =>
  act(() => {
    for (const n of tree.root.findAllByType(View)) {
      n.props.onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } } });
    }
  });

/** L'éditeur seul, en édition, comme l'écran le monte. */
function editeurSeul(plan: Plan) {
  charger(plan);
  const props = (p: { mur?: string | null; piece?: string | null }) => ({
    editable: true,
    showMeasures: true,
    selectedWallId: p.mur ?? null,
    selectedRoomId: p.piece ?? null,
    onSelectWall: () => {},
    onSelectRoom: () => {},
    onSelectObject: () => {},
    onSelectOpening: () => {},
    onMoveRoom: (dx: number, dz: number, aimant?: boolean) => {
      if (p.piece) st().moveRoom(p.piece, dx, dz, aimant);
    },
  });
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<FloorplanEditor {...props({})} />);
  });
  arbre = tree;
  poserLeCadre(tree);
  /** Sans `act` : pour `chronometrer`, qui l'apporte (un `act` dans un `act` s'emmêle). */
  const rendre = (p: { mur?: string | null; piece?: string | null }) =>
    tree.update(<FloorplanEditor {...props(p)} />);
  const montrer = (p: { mur?: string | null; piece?: string | null }) => act(() => rendre(p));
  return { tree, montrer, rendre, props };
}

/** La poignée (vue qui prend le geste) d'après son libellé, et son centre. */
function poignee(tree: TestRenderer.ReactTestRenderer, label: string) {
  const v = tree.root.findAll(
    (n) => n.props?.accessibilityLabel === label && typeof n.props?.onResponderMove === 'function',
  )[0];
  const s = Object.assign({}, ...[v.props.style].flat(3).filter(Boolean));
  return { h: v.props, x: s.left + 16, y: s.top + 16, gauche: () => s.left as number };
}
const gaucheDe = (tree: TestRenderer.ReactTestRenderer, label: string) => {
  const v = tree.root.findAll(
    (n) => n.props?.accessibilityLabel === label && typeof n.props?.onResponderMove === 'function',
  )[0];
  return Object.assign({}, ...[v.props.style].flat(3).filter(Boolean)).left as number;
};

/** La couche du plan, qui prend le glissement de la pièce choisie. */
const coucheDuPlan = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(FloorplanEditor)[0].findAll(
    (n) =>
      typeof n.type === 'string' &&
      typeof n.props.onMoveShouldSetResponder === 'function' &&
      typeof n.props.onTouchStart !== 'function' &&
      n.findAllByType(Svg).length > 0,
  )[0].props;

/** Le cadrage du plan, lu sur une poignée de coin (un mur choisi). */
const cadrageDe = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAll((n) => n.props?.corner && n.props?.mapping)[0].props.mapping as {
    toPx: (p: { x: number; z: number }) => { x: number; y: number };
    deltaToMeters: (dx: number, dy: number) => { x: number; z: number };
  };

const coords = (ws: WallSeg[]) =>
  ws.map((w) => [w.a.x, w.a.z, w.b.x, w.b.z].map((v) => Math.round(v * 1e6) / 1e6).join(',')).sort();

describe('le magasin à blanc (`simuler`)', () => {
  it('rend l’état d’après sans rien écrire, sans réveiller personne, sans historique', () => {
    charger('exemple');
    const mur = unRefend('exemple');
    const avant = st().walls;
    const peutAnnuler = st().canUndo;
    const reveils = jest.fn();
    const fin = useScanStore.subscribe(reveils);
    const apres = simuler((s) => s.moveWallPoint(mur, 'a', { x: 1.234, z: 0.5 }));
    fin();
    expect(apres).not.toBeNull();
    expect(apres!.walls.find((w) => w.id === mur)!.a).not.toEqual(avant.find((w) => w.id === mur)!.a);
    expect(st().walls).toBe(avant);
    expect(reveils).not.toHaveBeenCalled();
    expect(st().canUndo).toBe(peutAnnuler);
    // Une action qui ne change rien rend `null` ; un essai dans un essai aussi.
    expect(simuler((s) => s.moveWallPoint('pas-de-mur', 'a', { x: 0, z: 0 }))).toBeNull();
    let dedans: unknown = 'non appelé';
    simuler((s) => {
      dedans = simuler((t) => t.moveWallPoint(mur, 'b', { x: 0, z: 0 }));
      s.moveWallPoint(mur, 'a', { x: 2, z: 2 });
    });
    expect(dedans).toBeNull();
    // Le magasin sert de nouveau normalement après l'essai.
    act(() => st().moveWallPoint(mur, 'a', { x: 1.234, z: 0.5 }));
    expect(st().walls).not.toBe(avant);
  });

  it('le vol montre ce que le lâcher écrit, et le lâcher n’écrit qu’une entrée', () => {
    charger('exemple');
    const id = unePiece('exemple');
    const murs0 = coords(st().walls);
    act(() => {
      volerLAction((s) => s.moveRoom(id, 0.4, -0.2, false), { id, dx: 0.4, dz: -0.2 });
    });
    const plan = usePlanEnVol.getState().plan!;
    expect(plan.piece).toEqual({ id, dx: 0.4, dz: -0.2 });
    expect(plan.murs.size).toBeGreaterThan(0);
    expect(coords(st().walls)).toEqual(murs0);
    act(() => atterrir((s) => s.moveRoom(id, 0.4, -0.2, false)));
    expect(usePlanEnVol.getState().plan).toBeNull();
    // Les murs posés sont ceux que montrait le vol.
    for (const [mid, w] of plan.murs) {
      const pose = st().walls.find((x) => x.id === mid)!;
      expect([pose.a, pose.b]).toEqual([w.a, w.b]);
    }
    act(() => st().undo());
    expect(coords(st().walls)).toEqual(murs0);
  });
});

describe('tirer un coin, tourner un mur : en vol, écrit au lâcher', () => {
  it('le coin suit le doigt sans rendre l’éditeur ; le lâcher pose, en un « Annuler »', () => {
    const { tree, montrer } = editeurSeul('exemple');
    const mur = unRefend('exemple');
    montrer({ mur });
    const murs0 = coords(st().walls);
    const avant = st().walls;
    const { h, x, y } = poignee(tree, 'Tirer le coin du mur');
    const gauche0 = gaucheDe(tree, 'Tirer le coin du mur');
    const m = doigt();
    act(() => {
      h.onStartShouldSetResponder(m.poser(x, y));
      h.onResponderGrant(m.poser(x, y));
      h.onResponderMove(m.bouger(x + 12, y + 2));
    });
    const poche = () => tree.root.findAll((n) => n.props?.testID === 'poche-des-murs')[0].props.d as string;
    const poche1 = poche();
    const r = compter(() => {
      for (let i = 1; i <= 8; i++) act(() => h.onResponderMove(m.bouger(x + 12 + i * 4, y + 2 + i)));
    });
    // Ni l'éditeur ni le poché ne se refont ; le magasin n'a rien appris.
    expect(r.de('FloorplanEditor')).toBe(0);
    expect(poche()).toBe(poche1);
    expect(st().walls).toBe(avant);
    // Ce qui bouge se dessine : le mur en vol, et la poignée suit.
    const enVol = usePlanEnVol.getState().plan!.murs.get(mur)!;
    expect(enVol).toBeDefined();
    expect(gaucheDe(tree, 'Tirer le coin du mur')).not.toBe(gauche0);
    expect(r.de('WallBody')).toBeGreaterThan(0);

    const l = compter(() => act(() => h.onResponderRelease(m.lever())));
    /*
      UN SEUL REDESSIN AU LÂCHER : les deux tracés de chaque mur, plus le mur
      choisi par-dessus le voile. (React repasse ensuite une fois sur
      l'éditeur seul, mur choisi, sans rien redessiner dessous — mesuré à
      zéro milliseconde au Profiler ; c'était déjà le cas avant ce lot.)
    */
    expect(l.de('WallBody')).toBe(2 * st().walls.length + 1);
    expect(l.de('FloorplanEditor')).toBeLessThanOrEqual(2);
    expect(usePlanEnVol.getState().plan).toBeNull();
    const pose = st().walls.find((w) => w.id === mur)!;
    expect([pose.a, pose.b]).toEqual([enVol.a, enVol.b]);
    act(() => st().undo());
    expect(coords(st().walls)).toEqual(murs0);
  });

  it('le mur tourne en vol, le magasin reçoit l’angle au lâcher', () => {
    const { tree, montrer } = editeurSeul('exemple');
    const mur = unRefend('exemple');
    montrer({ mur });
    const murs0 = coords(st().walls);
    const { h, x, y } = poignee(tree, 'Tourner le mur');
    const m = doigt();
    act(() => {
      h.onStartShouldSetResponder(m.poser(x, y));
      h.onResponderGrant(m.poser(x, y));
    });
    const r = compter(() => {
      for (let i = 1; i <= 6; i++) act(() => h.onResponderMove(m.bouger(x + 20 + i * 6, y + i * 4)));
    });
    expect(r.de('FloorplanEditor')).toBe(0);
    expect(coords(st().walls)).toEqual(murs0);
    const enVol = usePlanEnVol.getState().plan!.murs.get(mur)!;
    act(() => h.onResponderRelease(m.lever()));
    const pose = st().walls.find((w) => w.id === mur)!;
    expect(pose.a.x).toBeCloseTo(enVol.a.x, 9);
    expect(pose.b.z).toBeCloseTo(enVol.b.z, 9);
    expect(coords(st().walls)).not.toEqual(murs0);
    act(() => st().undo());
    expect(coords(st().walls)).toEqual(murs0);
  });

  it('deux coins tirés coup sur coup font deux « Annuler »', () => {
    const { tree, montrer } = editeurSeul('exemple');
    const mur = unRefend('exemple');
    montrer({ mur });
    const murs0 = coords(st().walls);
    const tirer = (dx: number) => {
      const { h, x, y } = poignee(tree, 'Tirer le coin du mur');
      const m = doigt();
      act(() => {
        h.onStartShouldSetResponder(m.poser(x, y));
        h.onResponderGrant(m.poser(x, y));
        h.onResponderMove(m.bouger(x + dx, y));
        h.onResponderRelease(m.lever());
      });
    };
    tirer(30);
    const murs1 = coords(st().walls);
    tirer(30);
    expect(coords(st().walls)).not.toEqual(murs1);
    act(() => st().undo());
    expect(coords(st().walls)).toEqual(murs1);
    act(() => st().undo());
    expect(coords(st().walls)).toEqual(murs0);
  });

  it('un plan démonté en plein geste pose ce qu’il montrait, et ne laisse rien en vol', () => {
    const { tree, montrer } = editeurSeul('exemple');
    const mur = unRefend('exemple');
    montrer({ mur });
    const { h, x, y } = poignee(tree, 'Tirer le coin du mur');
    const m = doigt();
    act(() => {
      h.onStartShouldSetResponder(m.poser(x, y));
      h.onResponderGrant(m.poser(x, y));
      h.onResponderMove(m.bouger(x + 40, y + 10));
    });
    const enVol = usePlanEnVol.getState().plan!.murs.get(mur)!;
    act(() => tree.unmount());
    arbre = null;
    expect(usePlanEnVol.getState().plan).toBeNull();
    const pose = st().walls.find((w) => w.id === mur)!;
    expect([pose.a, pose.b]).toEqual([enVol.a, enVol.b]);
  });
});

describe('glisser une pièce, étirer une pièce neuve : en vol', () => {
  it('dans l’écran du plan : ni l’écran ni l’éditeur ne se rendent, la pièce et ses meubles suivent', () => {
    charger('exemple');
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<ResultScreen />);
    });
    arbre = tree;
    poserLeCadre(tree);
    const edition = tree.root.findAll((n) => n.props?.label === 'Édition' && typeof n.props?.onPress === 'function')[0];
    act(() => edition.props.onPress());
    const ed = () => tree.root.findAllByType(FloorplanEditor)[0];
    // Le cadrage, lu sur une poignée de coin, puis la pièce choisie.
    act(() => ed().props.onSelectWall(unRefend('exemple')));
    const cadrage = cadrageDe(tree);
    act(() => ed().props.onSelectWall(null));
    const id = unePiece('exemple');
    act(() => ed().props.onSelectRoom(id));
    const part = roomParts(st().walls, st().rooms).find((p) => p.roomId === id)!;
    const meuble = st().objects.find((o) => o.roomId === id)!;
    expect(meuble).toBeDefined();
    const transformDuMeuble = () =>
      tree.root.findAll((n) => n.props?.testID === `meuble-${meuble.id}`)[0].props.transform as string;
    const t0 = transformDuMeuble();
    const murs0 = coords(st().walls);
    const c = cadrage.toPx(part.labelAt);
    const h = coucheDuPlan(tree);
    const m = doigt();
    const e0 = m.poser(c.x + 4, c.y + 4);
    h.onStartShouldSetResponderCapture?.(e0);
    const e1 = m.bouger(c.x + 34, c.y + 4);
    h.onMoveShouldSetResponderCapture?.(e1);
    expect(h.onMoveShouldSetResponder(e1)).toBe(true);
    act(() => h.onResponderGrant(e1));
    const r = compter(() => {
      for (let i = 1; i <= 6; i++) act(() => h.onResponderMove(m.bouger(c.x + 34 + i * 5, c.y + 4 + i)));
    });
    expect(`écran ${r.de('ResultScreen')}, éditeur ${r.de('FloorplanEditor')}`).toBe('écran 0, éditeur 0');
    expect(coords(st().walls)).toEqual(murs0);
    // La pièce suit : son sol en vol, ses meubles.
    expect(usePlanEnVol.getState().plan!.piece!.id).toBe(id);
    expect(tree.root.findAll((n) => n.props?.testID === 'sol-en-vol').length).toBeGreaterThan(0);
    expect(transformDuMeuble()).not.toBe(t0);
    const course = usePlanEnVol.getState().plan!.piece!;

    const l = compter(() => act(() => h.onResponderRelease(m.lever())));
    // Un rendu de l'écran, un redessin du plan (les deux tracés de chaque mur
    // de l'étage, une fois) — voir le coin tiré pour le second passage à vide.
    expect(l.de('ResultScreen')).toBe(1);
    expect(l.de('WallBody')).toBe(2 * st().walls.length);
    expect(l.de('FloorplanEditor')).toBeLessThanOrEqual(2);
    expect(usePlanEnVol.getState().plan).toBeNull();
    expect(tree.root.findAll((n) => n.props?.testID === 'sol-en-vol').length).toBe(0);
    const murs1 = coords(st().walls);
    expect(murs1).not.toEqual(murs0);
    // Ce que le lâcher a écrit : la course entière, avec l'aimant.
    act(() => st().undo());
    expect(coords(st().walls)).toEqual(murs0);
    act(() => st().moveRoom(id, course.dx, course.dz, true));
    expect(coords(st().walls)).toEqual(murs1);
  });

  it('les poignées d’une pièce neuve suivent son bord, et l’étirement s’écrit au lâcher', () => {
    const { tree, montrer } = editeurSeul('exemple');
    let id: string | null = null;
    act(() => {
      id = st().addRoomLibre(3, 3, 'Placard');
    });
    expect(id).not.toBeNull();
    montrer({ piece: id });
    expect(st().rooms.find((r) => r.id === id)!.neuve).toBe(true);
    const label = 'Étirer le côté largeur+ de la pièce';
    const { h, x, y } = poignee(tree, label);
    const gauche0 = gaucheDe(tree, label);
    const murs0 = coords(st().walls);
    const m = doigt();
    act(() => {
      h.onStartShouldSetResponder(m.poser(x, y));
      h.onResponderGrant(m.poser(x, y));
    });
    const r = compter(() => {
      for (let i = 1; i <= 5; i++) act(() => h.onResponderMove(m.bouger(x + 12 + i * 6, y)));
    });
    expect(r.de('FloorplanEditor')).toBe(0);
    expect(coords(st().walls)).toEqual(murs0);
    expect(gaucheDe(tree, label)).toBeGreaterThan(gauche0);
    act(() => h.onResponderRelease(m.lever()));
    expect(usePlanEnVol.getState().plan).toBeNull();
    expect(coords(st().walls)).not.toEqual(murs0);
    act(() => st().undo());
    expect(coords(st().walls)).toEqual(murs0);
  });
});

describe('la sélection ne redessine pas tout', () => {
  it('choisir un mur ne refait que ce qu’il colore', () => {
    const { tree, montrer } = editeurSeul('exemple');
    const mur = unRefend('exemple');
    const poche0 = tree.root.findAll((n) => n.props?.testID === 'poche-des-murs')[0];
    const r = compter(() => montrer({ mur }));
    expect(r.de('FloorplanEditor')).toBe(1);
    // Le mur choisi (son trait, et son tracé par-dessus le voile) : pas les
    // deux tracés de chacun des seize murs.
    expect(r.de('WallBody')).toBeLessThanOrEqual(3);
    // Les meubles et le poché ne se refont pas.
    expect(r.de('SuitLeDoigt')).toBe(0);
    expect(r.de('CoucheDuPoche')).toBe(0);
    expect(tree.root.findAll((n) => n.props?.testID === 'poche-des-murs')[0].props.d).toBe(poche0.props.d);
  });

  it('un rendu de l’écran qui ne touche pas au plan ne rend pas le plan', () => {
    charger('exemple');
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<ResultScreen />);
    });
    arbre = tree;
    poserLeCadre(tree);
    const ed = tree.root.findAllByType(FloorplanEditor)[0];
    // Une vignette de photo ouverte : un état de l'écran, rien pour le plan.
    const r = compter(() => act(() => ed.props.onSelectPhoto('aucune')));
    expect(r.de('ResultScreen')).toBeGreaterThan(0);
    expect(r.de('FloorplanEditor')).toBe(0);
  });

  it('le rappel relayé est toujours celui du dernier rendu de l’écran', () => {
    const { tree } = editeurSeul('exemple');
    const premier = jest.fn();
    const second = jest.fn();
    const base = { editable: true, showMeasures: true, selectedWallId: null, onSelectWall: () => {} };
    act(() => tree.update(<FloorplanEditor {...base} onSelectRoom={premier} />));
    const r = compter(() => act(() => tree.update(<FloorplanEditor {...base} onSelectRoom={second} />)));
    // Un rappel neuf ne redessine pas le plan…
    expect(r.de('FloorplanEditor')).toBe(0);
    // … et c'est pourtant lui que le plan appelle.
    const sol = tree.root.findAll(
      (n) => typeof n.props?.onPress === 'function' && n.findAll((x) => x.props?.fill === 'url(#floorDots)').length > 0,
    )[0];
    act(() => sol.props.onPress());
    expect(second).toHaveBeenCalled();
    expect(premier).not.toHaveBeenCalled();
  });
});

describe('le temps par image, avant → après (voir l’en-tête)', () => {
  const N = 10;
  const lignes: string[] = [];
  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log(`Temps par image (médiane, ms ; rendus éditeur/écran par image)\n${lignes.join('\n')}`);
  });

  for (const plan of ['exemple', 'grille'] as Plan[]) {
    const nom = plan === 'grille' ? '30 pièces' : 'exemple';
    it(`éditeur seul — ${nom}`, () => {
      const { tree, montrer, rendre } = editeurSeul(plan);
      const mur = unRefend(plan);
      const id = unePiece(plan);
      const selMur = chronometrer(N, (i) => rendre({ mur: i % 2 ? mur : null }));
      const selPiece = chronometrer(N, (i) => rendre({ piece: i % 2 ? id : null }));
      montrer({ mur });
      const cadrage = cadrageDe(tree);
      const geste = (label: string, pas: (i: number) => [number, number]) => {
        const { h, x, y } = poignee(tree, label);
        const m = doigt();
        act(() => {
          h.onStartShouldSetResponder(m.poser(x, y));
          h.onResponderGrant(m.poser(x, y));
          h.onResponderMove(m.bouger(x + 10, y));
        });
        const mesure = chronometrer(N, (i) => {
          const [dx, dy] = pas(i);
          h.onResponderMove(m.bouger(x + dx, y + dy));
        });
        act(() => h.onResponderRelease(m.lever()));
        return mesure;
      };
      const coin = geste('Tirer le coin du mur', (i) => [12 + i * 2, i]);
      const rotation = geste('Tourner le mur', (i) => [12 + i * 3, i * 2]);
      montrer({ piece: id });
      const part = roomParts(st().walls, st().rooms).find((p) => p.roomId === id)!;
      const c = cadrage.toPx(part.labelAt);
      const h = coucheDuPlan(tree);
      const m = doigt();
      const e0 = m.poser(c.x + 4, c.y + 4);
      h.onStartShouldSetResponderCapture?.(e0);
      const e1 = m.bouger(c.x + 34, c.y + 4);
      h.onMoveShouldSetResponderCapture?.(e1);
      expect(h.onMoveShouldSetResponder(e1)).toBe(true);
      act(() => h.onResponderGrant(e1));
      act(() => h.onResponderMove(m.bouger(c.x + 36, c.y + 4)));
      const piece = chronometrer(N, (i) => h.onResponderMove(m.bouger(c.x + 36 + i * 3, c.y + 4 + i)));
      act(() => h.onResponderRelease(m.lever()));

      for (const [quoi, x] of Object.entries({ coin, rotation, piece })) {
        lignes.push(`  éditeur ${nom.padEnd(9)} ${quoi.padEnd(16)} ${String(x.ms).padStart(6)} ms  ${x.editeur}`);
        // Aucun rendu de l'éditeur pendant le geste.
        expect(x.editeur).toBe(0);
        // La seule borne de temps, très large : un rendu complet par image
        // en coûtait 140 à 530 sur ce banc.
        expect(x.ms).toBeLessThan(80);
      }
      for (const [quoi, x] of Object.entries({ choisirUnMur: selMur, choisirUnePiece: selPiece })) {
        lignes.push(`  éditeur ${nom.padEnd(9)} ${quoi.padEnd(16)} ${String(x.ms).padStart(6)} ms  ${x.editeur}`);
        expect(x.editeur).toBe(1);
      }
    });

    it(`écran du plan — ${nom}`, () => {
      charger(plan);
      let tree!: TestRenderer.ReactTestRenderer;
      act(() => {
        tree = TestRenderer.create(<ResultScreen />);
      });
      arbre = tree;
      poserLeCadre(tree);
      const edition = tree.root.findAll((n) => n.props?.label === 'Édition' && typeof n.props?.onPress === 'function')[0];
      act(() => edition.props.onPress());
      const ed = () => tree.root.findAllByType(FloorplanEditor)[0];
      const mur = unRefend(plan);
      const selMur = chronometrer(N, (i) => ed().props.onSelectWall(i % 2 ? mur : null));
      act(() => ed().props.onSelectWall(mur));
      const { h, x, y } = poignee(tree, 'Tirer le coin du mur');
      const m = doigt();
      act(() => {
        h.onStartShouldSetResponder(m.poser(x, y));
        h.onResponderGrant(m.poser(x, y));
        h.onResponderMove(m.bouger(x + 10, y));
      });
      const coin = chronometrer(N, (i) => h.onResponderMove(m.bouger(x + 12 + i * 2, y + i)));
      const t0 = maintenant();
      act(() => h.onResponderRelease(m.lever()));
      const lacher = Math.round((maintenant() - t0) * 10) / 10;
      lignes.push(`  écran   ${nom.padEnd(9)} ${'coin'.padEnd(16)} ${String(coin.ms).padStart(6)} ms  ${coin.editeur}/${coin.ecran}`);
      lignes.push(`  écran   ${nom.padEnd(9)} ${'lâcher du coin'.padEnd(16)} ${String(lacher).padStart(6)} ms`);
      lignes.push(`  écran   ${nom.padEnd(9)} ${'choisirUnMur'.padEnd(16)} ${String(selMur.ms).padStart(6)} ms  ${selMur.editeur}/${selMur.ecran}`);
      expect(`écran ${coin.ecran}, éditeur ${coin.editeur}`).toBe('écran 0, éditeur 0');
      expect(coin.ms).toBeLessThan(80);
    });
  }
});

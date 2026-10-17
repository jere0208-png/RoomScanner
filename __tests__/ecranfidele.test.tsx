/**
 * L'ÉCRAN FIDÈLE — ce que le téléphone AFFICHE, et non ce que React croit.
 *
 * Diagnostic du patron sur la version 735, vidéo image par image : après un
 * glisser rapide et large, au lâcher, le plan part plus loin de TOUTE la
 * longueur du geste et n'en revient qu'au premier mouvement du geste
 * suivant. Les bancs d'alors (`pincerrelacher`, `poserdunetraite`,
 * `fluidite`) passaient : ils lisaient les props React ou les valeurs
 * d'Animated, pas l'écran. Ce banc-ci modélise l'écran natif de Fabric.
 *
 * LE MODÈLE (React Native 0.86.2, nouvelle architecture), relu dans :
 *
 *   — `src/private/animated/createAnimatedPropsHook.js` : une valeur animée
 *     pilotée en JS, sur une instance Fabric (`__nativeTag`), part par
 *     `instance.setNativeProps(node.__getAnimatedValue())` — hors de React
 *     — puis un `scheduleUpdate` débouncé à 48 ms resynchronise React (le
 *     drapeau `shouldUseSetNativePropsInFabric` vaut vrai). Sous Jest, la
 *     garde `NODE_ENV === 'test'` remplace tout cela par un rendu React à
 *     chaque `setValue` : c'est ce qui rendait les anciens bancs aveugles.
 *     Le banc lève la garde et donne un `__nativeTag` à la doublure de
 *     `View` : Animated prend alors, ligne pour ligne, le chemin du
 *     téléphone, débounce compris.
 *   — `ReactCommon/react/renderer/uimanager/UIManager.cpp`
 *     (`setNativeProps_DEPRECATED`, `cloneNode`) et
 *     `ReactCommon/react/renderer/core/ShadowNode.cpp` (`clone`) : chaque
 *     `setNativeProps` est UNE révision de l'arbre (un `commit`) ; ses
 *     valeurs sont aussi rangées dans `family.nativeProps_DEPRECATED`, et
 *     tout clonage ultérieur du nœud les réapplique — le clonage de React
 *     (`cloneNode`) ne les remplace QUE pour les clés présentes dans sa
 *     charge, et les clonages internes (`ShadowNode::clone`, appelés par la
 *     réconciliation d'état `progressState` de `mounting/ShadowTree.cpp` à
 *     chaque commit React) les réappliquent telles quelles.
 *   — `Libraries/Renderer/implementations/ReactFabric-dev.js`
 *     (`completeWork`, cas 5) et
 *     `Libraries/ReactNative/ReactFabricPublicInstance/ReactNativeAttributePayload.js` :
 *     au commit, React ne clone le nœud qu'avec la DIFFÉRENCE entre ses
 *     props précédentes et les nouvelles (`diffAttributePayloads`), et la
 *     transformation d'un `style` se compare en profondeur (`deepDiffer`,
 *     attribut `{process: processTransform}` de `ReactNativeStyleAttributes`).
 *
 * D'où l'écran simulé, nœud natif par nœud natif (une « famille ») :
 *   (a) `setNativeProps(p)` : N ← N ⊕ p ; affiché ← affiché ⊕ p ;
 *   (b) commit React : charge = diff(props React précédentes, nouvelles) ;
 *       si charge vide, RIEN ne change à l'écran (N reste collé) ; sinon
 *       les clés de N présentes dans la charge prennent la valeur React,
 *       et affiché ← affiché ⊕ charge ⊕ N.
 * La position affichée d'un point du plan = le dessin du DERNIER COMMIT
 * React (les `Line` du filigrane, la toile) ∘ la transformation AFFICHÉE de
 * la couche (autour du centre de la vue, l'ordre exact d'un `transform`).
 *
 * Et chaque révision compte : la couche de montage tire la dernière
 * révision quand elle veut (fil principal, image suivante) — une révision
 * intermédiaire, même suivie d'une autre dans la même tâche, PEUT se voir.
 *
 * LES PROMESSES, sans tolérance (un demi-point, le pas du rendu) :
 *   [SOUS LES DOIGTS] à chaque évènement, les repères affichés sont sous
 *       les doigts ;
 *   [POSE ENTIÈRE] aucune révision intermédiaire ne montre une pose qui ne
 *       soit ni celle d'avant ni celle d'après l'évènement ;
 *   [LÂCHER] juste après le lâcher, commit compris, l'écran montre ce qu'il
 *       montrait juste avant ;
 *   [REPOS] puis il n'en bouge plus jusqu'au geste suivant (débounce de
 *       48 ms et minuteries écoulés) ;
 *   [SAUT AU GESTE SUIVANT] et le premier mouvement du geste suivant ne
 *       fait pas sauter le plan.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Line } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

type Pt = { x: number; y: number };
type Attrs = Record<string, unknown>;
type Arbre = TestRenderer.ReactTestRenderer;
type Poignee = Record<string, ((e: unknown) => unknown) | undefined>;

/** Le plan, dans la page : sous un bandeau de cent points. */
const ORIGINE: Pt = { x: 0, y: 100 };
const LARGEUR = 390;
const HAUTEUR = 620;
/** Un demi-point : le pas du rendu. Aucune autre tolérance. */
const TOL = 0.5;

const mur = (id: string, ax: number, az: number, bx: number, bz: number, roomId?: string): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  ...(roomId ? { roomId } : {}),
});

const MURS = [
  mur('n', 0, 0, 10, 0, 'r1'),
  mur('e', 10, 0, 10, 8, 'r1'),
  mur('s', 10, 8, 0, 8, 'r1'),
  mur('o', 0, 8, 0, 0, 'r1'),
];
/** Les points repères : quatre coins en filigrane, lus sur `x1`/`y1`. */
const REPERES = [
  mur('f1', 1, 1, 9, 1),
  mur('f2', 9, 1, 9, 7),
  mur('f3', 9, 7, 1, 7),
  mur('f4', 1, 7, 1, 1),
];

/* ------------------------------------------------------------------ */
/*  L'ÉCRAN NATIF SIMULÉ                                               */
/* ------------------------------------------------------------------ */

/** Les props d'une vue telles que Fabric les reçoit : le style à plat, sans fonctions. */
function aplatir(props: Attrs | null | undefined): Attrs {
  const out: Attrs = {};
  if (!props) return out;
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children' || k === 'style' || typeof v === 'function') continue;
    out[k] = v;
  }
  const st = StyleSheet.flatten(props.style as never) as Attrs | undefined;
  if (st) for (const [k, v] of Object.entries(st)) out[k] = v;
  return out;
}

/** Comparaison profonde, valeur à valeur, comme `deepDiffer`. */
function egaux(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'function' && typeof b === 'function') return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => egaux((a as Attrs)[k], (b as Attrs)[k]));
}

/** La charge d'un commit React : les attributs qui ont changé (`null` : retiré). */
function charge(avant: Attrs, apres: Attrs): Attrs | null {
  let c: Attrs | null = null;
  for (const k of Object.keys(apres)) {
    if (!egaux(avant[k], apres[k])) (c ??= {})[k] = apres[k];
  }
  for (const k of Object.keys(avant)) {
    if (!(k in apres)) (c ??= {})[k] = null;
  }
  return c;
}

interface Famille {
  /** Les props du dernier commit React (`memoizedProps`). */
  memo: Attrs;
  /** `family.nativeProps_DEPRECATED` : ce que `setNativeProps` a posé. */
  N: Attrs | null;
  /** Ce que la dernière révision de l'arbre porte — ce que l'écran affiche. */
  affiche: Attrs;
}

interface Revision {
  origine: 'react' | 'natif';
  ecran: Pt[] | null;
}

const num = (v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v)));
function angle(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v);
  if (s.endsWith('deg')) return (parseFloat(s) * Math.PI) / 180;
  if (s.endsWith('rad')) return parseFloat(s);
  throw new Error(`angle illisible : ${s}`);
}

/** Un `transform` React Native, autour du centre `c` : le dernier élément s'applique le premier. */
function transformer(transform: unknown, p: Pt, c: Pt): Pt {
  const liste = (Array.isArray(transform) ? transform : []) as Attrs[];
  let x = p.x - c.x;
  let y = p.y - c.y;
  for (let i = liste.length - 1; i >= 0; i--) {
    const [k, v] = Object.entries(liste[i])[0];
    if (k === 'translateX') x += num(v);
    else if (k === 'translateY') y += num(v);
    else if (k === 'scale') {
      x *= num(v);
      y *= num(v);
    } else if (k === 'rotate' || k === 'rotateZ') {
      const a = angle(v);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      [x, y] = [x * cos - y * sin, x * sin + y * cos];
    } else throw new Error(`transformation non modélisée : ${k}`);
  }
  return { x: x + c.x, y: y + c.y };
}

class EcranFabric {
  familles = new Map<object, Famille>();
  revisions: Revision[] = [];
  /** Un commit React a commencé et n'a pas encore été photographié. */
  enAttente = false;
  arbre: Arbre | null = null;
  natifs = 0;

  vider() {
    this.familles.clear();
    this.revisions = [];
    this.enAttente = false;
    this.arbre = null;
    this.natifs = 0;
  }

  /** Une vue montée : une famille neuve, sans `nativeProps`. */
  monte(inst: object, props: Attrs) {
    const a = aplatir(props);
    this.familles.set(inst, { memo: a, N: null, affiche: { ...a } });
    this.enAttente = true;
  }

  demonte(inst: object) {
    this.familles.delete(inst);
    this.enAttente = true;
  }

  /** (b) Le commit React d'une vue : seule la charge part, et N reste collé ailleurs. */
  react(inst: object, props: Attrs) {
    this.enAttente = true;
    const f = this.familles.get(inst);
    if (!f) return this.monte(inst, props);
    const neuf = aplatir(props);
    const c = charge(f.memo, neuf);
    f.memo = neuf;
    if (!c) return;
    if (f.N) {
      for (const k of Object.keys(c)) if (k in f.N) f.N[k] = c[k];
      f.affiche = { ...f.affiche, ...c, ...f.N };
    } else {
      f.affiche = { ...f.affiche, ...c };
    }
  }

  /** (a) `setNativeProps` : une révision à lui, hors de React. */
  natif(inst: object, props: Attrs) {
    // Le commit React en cours (effet de mise en page) est passé AVANT.
    if (this.enAttente) this.cliche('react');
    this.natifs++;
    const a = aplatir(props);
    const f = this.familles.get(inst);
    if (!f) throw new Error('setNativeProps sur une vue que l’écran ne connaît pas');
    f.N = { ...(f.N ?? {}), ...a };
    f.affiche = { ...f.affiche, ...a };
    this.cliche('natif');
  }

  /** La fin d'un commit React (le `Profiler`). */
  commitFini() {
    this.cliche('react');
  }

  cliche(origine: Revision['origine']) {
    this.enAttente = false;
    let ecran: Pt[] | null = null;
    try {
      ecran = this.voir();
    } catch {
      ecran = null;
    }
    this.revisions.push({ origine, ecran });
  }

  /** La transformation que l'écran affiche pour une vue. */
  transformeAffichee(inst: object): unknown {
    return this.familles.get(inst)?.affiche.transform;
  }

  /** La couche du geste : la seule vue dont la transformation porte une échelle. */
  couche(): object {
    const t = this.arbre!;
    const c = t.root.findAll((n) => {
      if (n.type !== View || !n.instance) return false;
      const tr = aplatir(n.props as Attrs).transform;
      return Array.isArray(tr) && tr.some((x) => 'scale' in (x as object));
    });
    if (c.length !== 1) throw new Error(`${c.length} couche(s) de geste`);
    return c[0].instance as object;
  }

  /** Où l'œil voit les repères : dessin du dernier commit ∘ transformation affichée. */
  voir(): Pt[] {
    const t = this.arbre;
    if (!t) throw new Error('pas d’arbre');
    const traits = t.root.findAllByType(Line).filter((n) => n.props.strokeOpacity === 0.16);
    if (traits.length !== REPERES.length) throw new Error(`${traits.length} repère(s)`);
    const svg = t.root
      .findAll((n) => typeof n.props?.bbWidth === 'number')
      .sort((a, b) => b.props.bbWidth - a.props.bbWidth)[0];
    const st = aplatir({ style: svg.props.style });
    const toile = {
      x: num(st.marginLeft ?? 0) - (svg.props.minX ?? 0),
      y: num(st.marginTop ?? 0) - (svg.props.minY ?? 0),
    };
    const inst = this.couche();
    if (!this.familles.has(inst)) throw new Error('couche inconnue de l’écran');
    const tr = this.transformeAffichee(inst);
    const c = { x: LARGEUR / 2, y: HAUTEUR / 2 };
    return traits.map((n) =>
      transformer(tr, { x: Number(n.props.x1) + toile.x, y: Number(n.props.y1) + toile.y }, c),
    );
  }
}

const ecran = new EcranFabric();

/*
  LE BRANCHEMENT. La doublure de `View` du préréglage Jest est une classe
  (`mockComponent`) : on lui donne ce qu'une vue Fabric a — un
  `__nativeTag`, un `setNativeProps` qui va à l'écran — et des cycles de
  vie qui annoncent les commits. `getSnapshotBeforeUpdate` tombe AVANT la
  mise en page : la charge React est passée avant tout `setNativeProps`
  qu'un effet de mise en page enverrait — l'ordre du téléphone.
*/
const Proto = (View as unknown as { prototype: Record<string, unknown> }).prototype;
const sauves: Record<string, PropertyDescriptor | undefined> = {};
const BRANCHES = ['__nativeTag', 'setNativeProps', 'componentDidMount', 'getSnapshotBeforeUpdate', 'componentDidUpdate', 'componentWillUnmount'];
let envAvant: string | undefined;

beforeAll(() => {
  jest.useFakeTimers();
  for (const k of BRANCHES) sauves[k] = Object.getOwnPropertyDescriptor(Proto, k);
  const tags = new WeakMap<object, number>();
  let prochain = 1;
  Object.defineProperty(Proto, '__nativeTag', {
    configurable: true,
    get(this: object) {
      if (!tags.has(this)) tags.set(this, prochain++);
      return tags.get(this);
    },
  });
  type Vue = { props: Attrs };
  Object.assign(Proto, {
    setNativeProps(this: object, p: Attrs) {
      ecran.natif(this, p);
    },
    componentDidMount(this: Vue) {
      ecran.monte(this, this.props);
    },
    getSnapshotBeforeUpdate(this: Vue) {
      ecran.react(this, this.props);
      return null;
    },
    componentDidUpdate() {},
    componentWillUnmount(this: object) {
      ecran.demonte(this);
    },
  });
  // Le chemin du téléphone : `createAnimatedPropsHook` ne court-circuite
  // `setNativeProps` que sous `NODE_ENV=test`.
  envAvant = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
});

afterAll(() => {
  process.env.NODE_ENV = envAvant;
  for (const k of BRANCHES) {
    const d = sauves[k];
    if (d) Object.defineProperty(Proto, k, d);
    else delete Proto[k];
  }
  jest.useRealTimers();
});

let arbre: Arbre | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  ecran.vider();
});

/* ------------------------------------------------------------------ */
/*  LA MAIN                                                            */
/* ------------------------------------------------------------------ */

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

/** L'archive des doigts, tenue comme le système la tient. Coordonnées DU PLAN. */
function main() {
  let horloge = 1000;
  const bank: (Doigt | null)[] = [];
  const evenement = (inverse = false) => {
    const vivants = bank
      .map((t, id) => ({ t, id }))
      .filter((x): x is { t: Doigt; id: number } => !!x.t?.touchActive);
    // Sous Fabric, `touches` sort d'un ensemble non ordonné : l'ordre peut
    // changer d'une image à l'autre.
    if (inverse) vivants.reverse();
    return {
      nativeEvent: {
        touches: vivants.map(({ t, id }) => ({
          identifier: id,
          pageX: t.currentPageX,
          pageY: t.currentPageY,
          locationX: t.currentPageX - ORIGINE.x,
          locationY: t.currentPageY - ORIGINE.y,
        })),
        pageX: vivants[0]?.t.currentPageX ?? 0,
        pageY: vivants[0]?.t.currentPageY ?? 0,
        locationX: (vivants[0]?.t.currentPageX ?? 0) - ORIGINE.x,
        locationY: (vivants[0]?.t.currentPageY ?? 0) - ORIGINE.y,
      },
      touchHistory: {
        touchBank: bank,
        numberActiveTouches: vivants.length,
        indexOfSingleActiveTouch: vivants.length === 1 ? vivants[0].id : -1,
        mostRecentTimeStamp: horloge,
      },
    };
  };
  return {
    avancer(dt: number) {
      horloge += dt;
    },
    vivants(): Map<number, Pt> {
      const m = new Map<number, Pt>();
      bank.forEach((t, id) => {
        if (t?.touchActive) m.set(id, { x: t.currentPageX - ORIGINE.x, y: t.currentPageY - ORIGINE.y });
      });
      return m;
    },
    poser(id: number, x: number, y: number) {
      horloge += 1;
      const px = x + ORIGINE.x;
      const py = y + ORIGINE.y;
      bank[id] = {
        touchActive: true,
        startPageX: px,
        startPageY: py,
        startTimeStamp: horloge,
        currentPageX: px,
        currentPageY: py,
        currentTimeStamp: horloge,
        previousPageX: px,
        previousPageY: py,
        previousTimeStamp: horloge,
      };
      return evenement();
    },
    bouger(pas: Record<number, Pt>, inverse = false) {
      horloge += 1;
      for (const [k, p] of Object.entries(pas)) {
        const id = Number(k);
        const t = bank[id];
        if (!t?.touchActive) throw new Error(`le doigt ${id} n’est pas posé`);
        bank[id] = {
          ...t,
          previousPageX: t.currentPageX,
          previousPageY: t.currentPageY,
          previousTimeStamp: t.currentTimeStamp,
          currentPageX: p.x + ORIGINE.x,
          currentPageY: p.y + ORIGINE.y,
          currentTimeStamp: horloge,
        };
      }
      return evenement(inverse);
    },
    lever(id: number) {
      horloge += 1;
      const t = bank[id];
      if (t) bank[id] = { ...t, touchActive: false, currentTimeStamp: horloge };
      return evenement();
    },
  };
}

/** La similitude qui mène deux doigts de (a0, b0) à (a1, b1), appliquée à p. */
function similitude(a0: Pt, b0: Pt, a1: Pt, b1: Pt, p: Pt): Pt {
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const k = Math.hypot(b1.x - a1.x, b1.y - a1.y) / Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const r = Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x);
  const dx = (p.x - m0.x) * k;
  const dy = (p.y - m0.y) * k;
  return {
    x: m1.x + dx * Math.cos(r) - dy * Math.sin(r),
    y: m1.y + dx * Math.sin(r) + dy * Math.cos(r),
  };
}

const ecart = (a: Pt[], b: Pt[]) => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
const fmt = (ps: Pt[]) => ps.map((p) => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).join(' ');

/* ------------------------------------------------------------------ */
/*  LE BANC                                                            */
/* ------------------------------------------------------------------ */

function monter() {
  ecran.vider();
  let tree: Arbre | null = null;
  act(() => {
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never,
      fixtures: [],
      ceiling: [],
      photos: [],
      notes: [],
      niveauCourant: 0,
    });
    tree = TestRenderer.create(
      <React.Profiler id="plan" onRender={() => ecran.commitFini()}>
        <FloorplanEditor
          showMeasures
          editable={false}
          selectedWallId={null}
          onSelectWall={() => {}}
          filigrane={REPERES}
        />
      </React.Profiler>,
    );
  });
  const t = tree as unknown as Arbre;
  arbre = t;
  ecran.arbre = t;
  const cadre = () =>
    t.root
      .findAllByType(View)
      .find(
        (n) => typeof n.props.onLayout === 'function' && typeof n.props.onMoveShouldSetResponder === 'function',
      )!;
  const hote = () => cadre().props as Poignee;
  act(() => {
    hote().onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: LARGEUR, height: HAUTEUR } } });
  });
  (cadre().instance as { measureInWindow: unknown }).measureInWindow = (
    cb: (x: number, y: number, w: number, h: number) => void,
  ) => cb(ORIGINE.x, ORIGINE.y, LARGEUR, HAUTEUR);
  act(() => {
    jest.advanceTimersByTime(1000);
  });

  const m = main();
  let tient = false;
  let attendu: Pt[] = ecran.voir();
  let dernier: Map<number, Pt> | null = null;
  /** Le zoom que les doigts ont donné depuis le montage (pour rester loin des butées). */
  let zoom = 1;
  /** Le prochain mouvement est le premier depuis un lâcher. */
  let premierApresLacher = false;
  /** Le repos qui suit un lâcher : l'écran ne doit plus bouger. */
  let auRepos = false;
  /** Un paquet d'évènements dans une même tâche : tous les attendus du paquet. */
  let paquet: Pt[][] | null = null;
  const fautes: string[] = [];
  let scene = '';

  const faute = (categorie: string, quoi: string, obtenu: Pt[] | null, voulu: Pt[]) => {
    fautes.push(
      obtenu
        ? `[${categorie}] ${scene} — ${quoi} : écart ${ecart(obtenu, voulu).toFixed(2)} pt\n    affiché ${fmt(obtenu)}\n    voulu   ${fmt(voulu)}`
        : `[${categorie}] ${scene} — ${quoi} : écran illisible`,
    );
  };

  /** Les révisions depuis `n0` montrent-elles toutes l'une des poses permises ? */
  const revisionsPermises = (categorie: string, quoi: string, n0: number, permis: Pt[][]) => {
    const rs = ecran.revisions.slice(n0);
    rs.forEach((r, i) => {
      if (!r.ecran || !permis.some((p) => ecart(r.ecran!, p) <= TOL)) {
        const proche = r.ecran ? permis.reduce((a, b) => (ecart(r.ecran!, a) <= ecart(r.ecran!, b) ? a : b)) : permis[0];
        faute(categorie, `${quoi}, révision ${i + 1}/${rs.length} (${r.origine})`, r.ecran, proche);
      }
    });
  };

  const verifierFinal = (categorie: string, quoi: string, voulu: Pt[]) => {
    let vu: Pt[] | null = null;
    try {
      vu = ecran.voir();
    } catch {
      vu = null;
    }
    if (!vu || ecart(vu, voulu) > TOL) {
      faute(categorie, quoi, vu, voulu);
      return false;
    }
    return true;
  };

  /** Une tâche JS : un évènement, ou un paquet. */
  const tache = (nom: string, f: () => void, apres: () => void) => {
    if (paquet) {
      f();
      apres();
      paquet.push(attendu);
      return;
    }
    const avant = attendu;
    const n0 = ecran.revisions.length;
    act(f);
    apres();
    const lacher = nom.startsWith('lâcher');
    if (lacher) {
      if (verifierFinal('LÂCHER', `juste après ${nom}`, avant)) {
        revisionsPermises('LÂCHER', `pendant ${nom}`, n0, [avant]);
      } else revisionsPermises('LÂCHER', `pendant ${nom}`, n0, [avant]);
      return;
    }
    const cat = premierApresLacher && nom.startsWith('bouger') && tient ? 'SAUT AU GESTE SUIVANT' : 'SOUS LES DOIGTS';
    if (verifierFinal(cat, `après ${nom}`, attendu)) {
      revisionsPermises('POSE ENTIÈRE', `pendant ${nom}`, n0, [avant, attendu]);
    }
  };

  const banc = {
    tree: t,
    fautes,
    get tient() {
      return tient;
    },
    get zoom() {
      return zoom;
    },
    attendu: () => attendu,
    vivants: () => m.vivants(),
    scene(nom: string) {
      scene = nom;
    },
    /** Le temps passe — l'écran ne doit pas bouger (débounce, minuteries). */
    attendre(dt: number) {
      if (dt <= 0) return;
      if (paquet) throw new Error('on n’attend pas dans un paquet');
      m.avancer(dt);
      const n0 = ecran.revisions.length;
      act(() => {
        jest.advanceTimersByTime(dt);
      });
      const cat = auRepos ? 'REPOS' : 'SOUS LES DOIGTS';
      const quoi = auRepos ? `${dt} ms après le lâcher` : `pause de ${dt} ms en plein geste`;
      verifierFinal(cat, quoi, attendu);
      revisionsPermises(cat, quoi, n0, [attendu]);
    },
    poser(id: number, x: number, y: number) {
      tache(
        `poser ${id}`,
        () => {
          const e = m.poser(id, x, y);
          hote().onTouchStart?.(e);
          if (tient) {
            hote().onResponderStart?.(e);
          } else if (m.vivants().size === 1) {
            hote().onStartShouldSetResponderCapture?.(e);
            if (hote().onStartShouldSetResponder?.(e) === true) {
              tient = true;
              hote().onResponderGrant?.(e);
            }
          }
        },
        () => {
          // Un doigt de plus en plein geste : le repère se reprend ici, et
          // le mouvement suivant compte EN ENTIER.
          if (tient && dernier) dernier = m.vivants();
        },
      );
    },
    bouger(pas: Record<number, Pt>, inverse = false) {
      let prise = false;
      tache(
        `bouger ${JSON.stringify(pas, (_k, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v))}`,
        () => {
          const e = m.bouger(pas, inverse);
          if (tient) {
            hote().onResponderMove?.(e);
          } else {
            const capte = hote().onMoveShouldSetResponderCapture?.(e) === true;
            if (capte || hote().onMoveShouldSetResponder?.(e) === true) {
              tient = true;
              prise = true;
              hote().onResponderGrant?.(e);
            }
          }
        },
        () => {
          const maintenant = m.vivants();
          if (prise) {
            // La prise ne bouge rien : le geste part d'ici.
            dernier = maintenant;
            auRepos = false;
            return;
          }
          if (tient && dernier && dernier.size === maintenant.size && [...maintenant.keys()].every((k) => dernier!.has(k))) {
            if (maintenant.size === 1) {
              const [id] = [...maintenant.keys()];
              const d = { x: maintenant.get(id)!.x - dernier.get(id)!.x, y: maintenant.get(id)!.y - dernier.get(id)!.y };
              attendu = attendu.map((p) => ({ x: p.x + d.x, y: p.y + d.y }));
            } else {
              const [i, j] = [...maintenant.keys()];
              const a0 = dernier.get(i)!;
              const b0 = dernier.get(j)!;
              const a1 = maintenant.get(i)!;
              const b1 = maintenant.get(j)!;
              zoom *= Math.hypot(b1.x - a1.x, b1.y - a1.y) / Math.hypot(b0.x - a0.x, b0.y - a0.y);
              attendu = attendu.map((p) => similitude(a0, b0, a1, b1, p));
            }
          }
          if (tient) dernier = maintenant;
        },
      );
      // Le contrôle du premier mouvement est fait : la suite est un geste ordinaire.
      if (tient && !prise && !paquet) premierApresLacher = false;
    },
    lever(id: number) {
      const fin = m.vivants().size === 1 && tient;
      tache(
        fin ? `lâcher (doigt ${id})` : `lever ${id}`,
        () => {
          const e = m.lever(id);
          if (!tient) return;
          hote().onResponderEnd?.(e);
          if (m.vivants().size === 0) {
            tient = false;
            hote().onResponderRelease?.(e);
          }
        },
        () => {
          if (fin) {
            dernier = null;
            premierApresLacher = true;
            auRepos = true;
          } else if (tient && dernier) {
            // Un doigt de moins : même chose, le mouvement suivant compte.
            dernier = m.vivants();
          }
        },
      );
    },
    /** Le système reprend le toucher (un appel, une alerte). */
    interrompre() {
      tache(
        'lâcher (interruption)',
        () => {
          const e = m.bouger({});
          tient = false;
          hote().onResponderTerminate?.(e);
        },
        () => {
          dernier = null;
          premierApresLacher = true;
          auRepos = true;
        },
      );
      for (const id of [...m.vivants().keys()]) m.lever(id);
    },
    /**
     * UN PAQUET : plusieurs évènements dans la MÊME tâche JS — un téléphone
     * occupé à monter un dessin reçoit ses touchers par paquets. Pendant le
     * paquet, l'écran ne peut montrer que l'une des poses du paquet ; à la
     * fin, celle des doigts.
     */
    paquet(f: () => void) {
      const avant = attendu;
      const n0 = ecran.revisions.length;
      paquet = [avant];
      let poses: Pt[][] = [];
      act(() => {
        f();
        poses = paquet!;
      });
      paquet = null;
      if (verifierFinal('SOUS LES DOIGTS', 'à la fin du paquet', attendu)) {
        revisionsPermises('POSE ENTIÈRE', 'pendant le paquet', n0, poses);
      }
    },
    /** Le verdict : aucune faute, sinon les catégories et les premières fautes. */
    verdict() {
      if (fautes.length === 0) return;
      // Le compte par promesse, et la première faute de chacune.
      const parCategorie = new Map<string, string[]>();
      for (const f of fautes) {
        const c = f.slice(1, f.indexOf(']'));
        parCategorie.set(c, [...(parCategorie.get(c) ?? []), f]);
      }
      const resume = [...parCategorie].map(([c, fs]) => `${c} ×${fs.length}`).join(', ');
      const premieres = [...parCategorie.values()].map((fs) => fs[0]);
      throw new Error(`${fautes.length} faute(s) d’écran — ${resume}\n${premieres.join('\n')}`);
    },
  };
  return banc;
}

type Banc = ReturnType<typeof monter>;

/* ------------------------------------------------------------------ */
/*  LES GESTES                                                         */
/* ------------------------------------------------------------------ */

/**
 * Un glissé d'un doigt : posé en `de`, puis les pas donnés (des déplacements
 * relatifs), un évènement toutes les `dt` ms, et le lâcher `dtLacher` ms
 * après le dernier mouvement — à pleine vitesse si on ne s'arrête pas.
 */
function glisser(b: Banc, de: Pt, pas: Pt[], o: { dt?: number; dtLacher?: number; lacher?: boolean; pauses?: Record<number, number> } = {}) {
  const dt = o.dt ?? 16;
  b.poser(0, de.x, de.y);
  let p = { ...de };
  pas.forEach((d, i) => {
    b.attendre(o.pauses?.[i] ?? dt);
    p = { x: p.x + d.x, y: p.y + d.y };
    b.bouger({ 0: p });
  });
  if (o.lacher === false) return p;
  b.attendre(o.dtLacher ?? dt);
  b.lever(0);
  return p;
}

/** Des pas réguliers : `n` pas de longueur `l` dans la direction `a` (radians). */
const pasReguliers = (n: number, l: number, a: number): Pt[] =>
  Array.from({ length: n }, () => ({ x: l * Math.cos(a), y: l * Math.sin(a) }));

/**
 * Un pincement : deux doigts autour de `centre`, écartés de `d0`, d'angle
 * `a0` ; en `n` images, l'écart est multiplié par `k`, l'angle tourne de
 * `torsion`, le milieu se déplace de `deplace`. Un doigt se lève avant
 * l'autre ; le restant peut glisser encore (`traine` pas).
 */
function pincer(
  b: Banc,
  o: { centre: Pt; d0: number; a0: number; k: number; torsion: number; deplace: Pt; n: number; dt?: number; traine?: Pt[]; leverEnPremier?: 0 | 1 },
) {
  const dt = o.dt ?? 16;
  const doigts = (t: number) => {
    const d = o.d0 * Math.pow(o.k, t);
    const a = o.a0 + o.torsion * t;
    const m = { x: o.centre.x + o.deplace.x * t, y: o.centre.y + o.deplace.y * t };
    return {
      0: { x: m.x - (d / 2) * Math.cos(a), y: m.y - (d / 2) * Math.sin(a) },
      1: { x: m.x + (d / 2) * Math.cos(a), y: m.y + (d / 2) * Math.sin(a) },
    };
  };
  const p0 = doigts(0);
  b.poser(0, p0[0].x, p0[0].y);
  b.attendre(dt);
  b.poser(1, p0[1].x, p0[1].y);
  b.attendre(dt);
  // Le premier doigt bouge seul assez pour faire prendre le plan (le
  // milieu des doigts franchit le seuil de dix points).
  const prise = { x: p0[0].x - 24 * Math.cos(o.a0), y: p0[0].y - 24 * Math.sin(o.a0) };
  b.bouger({ 0: prise });
  if (!b.tient) throw new Error('le pincement n’a pas pris le plan');
  for (let i = 1; i <= o.n; i++) {
    b.attendre(dt);
    b.bouger(doigts(i / o.n));
  }
  const premier = o.leverEnPremier ?? 0;
  const autre = premier === 0 ? 1 : 0;
  b.attendre(dt);
  b.lever(premier);
  let p = doigts(1)[autre];
  for (const d of o.traine ?? []) {
    b.attendre(dt);
    p = { x: p.x + d.x, y: p.y + d.y };
    b.bouger({ [autre]: p });
  }
  b.attendre(dt);
  b.lever(autre);
}

/** Le repos après un geste : débounce de 48 ms, puis bien au-delà. */
function repos(b: Banc) {
  b.attendre(16);
  b.attendre(48);
  b.attendre(400);
}

/** Un générateur à graine fixe (mulberry32). */
function hasard(graine: number) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/*  LE MODÈLE LUI-MÊME                                                 */
/* ------------------------------------------------------------------ */

describe('le modèle d’écran Fabric', () => {
  const pose = (tx: number) => ({ style: { transform: [{ translateX: tx }, { scale: 1 }] } });

  it('un commit React aux props identiques n’efface pas ce que setNativeProps a posé (le mécanisme du 735)', () => {
    const e = new EcranFabric();
    const vue = {};
    e.monte(vue, pose(0));
    e.natif(vue, pose(120));
    e.react(vue, pose(0));
    expect(e.transformeAffichee(vue)).toEqual([{ translateX: 120 }, { scale: 1 }]);
  });

  it('un commit React qui change la transformation la pose à l’écran, et réécrit nativeProps', () => {
    const e = new EcranFabric();
    const vue = {};
    e.monte(vue, pose(0));
    e.natif(vue, pose(120));
    e.react(vue, pose(0.001));
    expect(e.transformeAffichee(vue)).toEqual([{ translateX: 0.001 }, { scale: 1 }]);
    // Et un commit suivant aux mêmes props ne ramène pas l'ancienne pose native.
    e.react(vue, pose(0.001));
    expect(e.transformeAffichee(vue)).toEqual([{ translateX: 0.001 }, { scale: 1 }]);
  });

  it('chaque setNativeProps est une révision à lui', () => {
    const e = new EcranFabric();
    const vue = {};
    // Le montage est un commit React : sa révision passe avant.
    e.monte(vue, pose(0));
    e.natif(vue, pose(1));
    e.natif(vue, pose(2));
    expect(e.revisions.map((r) => r.origine)).toEqual(['react', 'natif', 'natif']);
  });
});

describe('le banc lui-même', () => {
  it('prend le chemin du téléphone : pendant un glissé, React ne rend rien, setNativeProps porte la couche', () => {
    const b = monter();
    b.scene('chemin');
    const r0 = ecran.revisions.length;
    const n0 = ecran.natifs;
    glisser(b, { x: 100, y: 300 }, pasReguliers(6, 30, 0), { lacher: false });
    const pendant = ecran.revisions.slice(r0);
    expect(ecran.natifs - n0).toBeGreaterThan(0);
    expect(pendant.filter((r) => r.origine === 'react')).toHaveLength(0);
    // Le débounce de 48 ms resynchronise React — sans rien changer à l'écran.
    b.attendre(60);
    expect(ecran.revisions.slice(r0).filter((r) => r.origine === 'react').length).toBeGreaterThan(0);
    b.lever(0);
    repos(b);
    b.verdict();
  });

  it('voit un défaut : une pose native poussée à la main déplace les repères affichés', () => {
    const b = monter();
    b.scene('témoin');
    const couche = ecran.couche();
    act(() => {
      (couche as { setNativeProps: (p: unknown) => void }).setNativeProps({
        style: { transform: [{ translateX: 25 }, { translateY: 0 }, { rotate: '0deg' }, { scale: 1 }] },
      });
    });
    b.attendre(16);
    expect(b.fautes.join('\n')).toMatch(/\[SOUS LES DOIGTS\][\s\S]*écart 25\.00/);
  });
});

/* ------------------------------------------------------------------ */
/*  LES SCÉNARIOS                                                      */
/* ------------------------------------------------------------------ */

describe('l’écran suit les doigts et se pose d’une traite', () => {
  it('glissé lent (pas de 2 pt), avec des arrêts du doigt', () => {
    const b = monter();
    b.scene('glissé lent');
    glisser(b, { x: 150, y: 300 }, pasReguliers(40, 2, 0.4), { pauses: { 12: 90, 25: 120 } });
    repos(b);
    glisser(b, { x: 200, y: 260 }, pasReguliers(30, 2, Math.PI + 0.3));
    repos(b);
    b.verdict();
  });

  it('glissé rapide et large (le diagnostic 735) : 40 à 120 pt par image, lâché en pleine vitesse', () => {
    const b = monter();
    b.scene('glissé rapide et large');
    glisser(b, { x: 60, y: 120 }, [
      { x: 40, y: 50 },
      { x: 70, y: 80 },
      { x: 110, y: 90 },
      { x: 120, y: 100 },
      { x: 80, y: 60 },
      { x: 50, y: 40 },
    ], { dt: 8, dtLacher: 8 });
    repos(b);
    // Le geste suivant : son premier mouvement ne doit rien faire sauter.
    glisser(b, { x: 300, y: 480 }, pasReguliers(7, 90, Math.PI + 0.9), { dt: 16, dtLacher: 4 });
    repos(b);
    b.verdict();
  });

  it('glissé rapide puis glissé lent, enchaînés dès le rendu du lâcher', () => {
    const b = monter();
    b.scene('rapide puis lent, enchaînés');
    glisser(b, { x: 80, y: 200 }, pasReguliers(5, 100, 0.2), { dt: 16, dtLacher: 6 });
    // Pas de repos : le doigt se repose à l'image suivante.
    glisser(b, { x: 250, y: 300 }, pasReguliers(20, 2, -2.5), { dt: 16 });
    glisser(b, { x: 180, y: 320 }, pasReguliers(6, 80, -2.8), { dt: 8, dtLacher: 8 });
    repos(b);
    b.verdict();
  });

  it('pincement lent', () => {
    const b = monter();
    b.scene('pincement lent');
    pincer(b, { centre: { x: 195, y: 310 }, d0: 140, a0: 0.3, k: 1.25, torsion: 0.05, deplace: { x: 10, y: -6 }, n: 24 });
    repos(b);
    b.verdict();
  });

  it('pincement rapide', () => {
    const b = monter();
    b.scene('pincement rapide');
    pincer(b, { centre: { x: 180, y: 300 }, d0: 110, a0: -0.4, k: 2.2, torsion: 0.2, deplace: { x: 60, y: 40 }, n: 6, dt: 8 });
    repos(b);
    pincer(b, { centre: { x: 210, y: 320 }, d0: 220, a0: 0.9, k: 0.5, torsion: -0.15, deplace: { x: -50, y: -30 }, n: 5, dt: 8 });
    repos(b);
    b.verdict();
  });

  it('rotation : deux doigts qui vrillent de quarante degrés', () => {
    const b = monter();
    b.scene('rotation');
    pincer(b, { centre: { x: 200, y: 300 }, d0: 160, a0: Math.PI / 2, k: 1.1, torsion: (40 * Math.PI) / 180, deplace: { x: 12, y: -8 }, n: 12 });
    repos(b);
    b.verdict();
  });

  it('un doigt se lève avant l’autre, le restant glisse encore', () => {
    const b = monter();
    b.scene('un doigt avant l’autre');
    pincer(b, {
      centre: { x: 190, y: 300 },
      d0: 120,
      a0: 0.2,
      k: 1.6,
      torsion: 0.1,
      deplace: { x: 20, y: 10 },
      n: 8,
      leverEnPremier: 1,
      traine: pasReguliers(6, 9, 2.2),
    });
    repos(b);
    b.verdict();
  });

  it('glissé, puis un second doigt se pose : du glissé au pincement', () => {
    const b = monter();
    b.scene('glissé puis pincement');
    const p = glisser(b, { x: 150, y: 300 }, pasReguliers(5, 12, 0), { lacher: false });
    b.attendre(16);
    b.poser(1, 300, 400);
    b.attendre(16);
    b.bouger({ 0: { x: p.x + 1, y: p.y + 1 }, 1: { x: 302, y: 401 } });
    for (let i = 1; i <= 6; i++) {
      b.attendre(16);
      b.bouger({ 0: { x: p.x + 1 - i * 6, y: p.y + 1 - i * 3 }, 1: { x: 302 + i * 6, y: 401 + i * 3 } });
    }
    b.attendre(16);
    b.lever(0);
    b.attendre(16);
    b.lever(1);
    repos(b);
    b.verdict();
  });

  it('pincement dont les doigts arrivent tantôt dans un ordre, tantôt dans l’autre : pas de demi-tour', () => {
    const b = monter();
    b.scene('doigts inversés');
    b.poser(0, 120, 300);
    b.attendre(16);
    b.poser(1, 260, 320);
    b.attendre(16);
    b.bouger({ 0: { x: 90, y: 300 } });
    expect(b.tient).toBe(true);
    for (let i = 1; i <= 10; i++) {
      b.attendre(16);
      b.bouger({ 0: { x: 100 - i * 4, y: 300 - i * 2 }, 1: { x: 260 + i * 5, y: 320 + i * 3 } }, i % 2 === 1);
    }
    b.attendre(16);
    b.lever(1);
    b.attendre(16);
    b.lever(0);
    repos(b);
    b.verdict();
  });

  it('trois doigts, puis deux : la paire suivie change sans que le plan saute', () => {
    const b = monter();
    b.scene('trois doigts à deux');
    b.poser(0, 120, 280);
    b.attendre(16);
    b.poser(1, 250, 300);
    b.attendre(16);
    b.bouger({ 0: { x: 90, y: 280 } });
    expect(b.tient).toBe(true);
    b.attendre(16);
    b.poser(2, 200, 420);
    for (let i = 1; i <= 4; i++) {
      b.attendre(16);
      b.bouger({ 0: { x: 100 - i * 3, y: 280 }, 1: { x: 250 + i * 3, y: 300 + i }, 2: { x: 200, y: 420 + i * 2 } });
    }
    // Le premier doigt se lève : la paire suivie devient (1, 2).
    b.attendre(16);
    b.lever(0);
    for (let i = 1; i <= 5; i++) {
      b.attendre(16);
      b.bouger({ 1: { x: 262 + i * 6, y: 304 + i * 2 }, 2: { x: 200 - i * 4, y: 428 + i * 5 } });
    }
    b.attendre(16);
    b.lever(1);
    b.attendre(16);
    b.lever(2);
    repos(b);
    b.verdict();
  });

  it('lâcher sans mouvement : pris, puis levé sans plus bouger — et le tap', () => {
    const b = monter();
    b.scene('lâcher sans mouvement');
    b.poser(0, 150, 300);
    b.attendre(16);
    b.bouger({ 0: { x: 163, y: 300 } });
    expect(b.tient).toBe(true);
    b.attendre(16);
    b.lever(0);
    repos(b);
    // Un geste franc, puis de nouveau une prise sans mouvement.
    glisser(b, { x: 100, y: 200 }, pasReguliers(6, 60, 0.5), { dt: 8, dtLacher: 8 });
    b.poser(0, 200, 300);
    b.attendre(16);
    b.bouger({ 0: { x: 200, y: 313 } });
    b.attendre(16);
    b.lever(0);
    repos(b);
    // Le tap : sous le seuil, personne ne prend la main.
    b.poser(0, 150, 300);
    b.attendre(16);
    b.bouger({ 0: { x: 153, y: 302 } });
    expect(b.tient).toBe(false);
    b.attendre(16);
    b.lever(0);
    repos(b);
    b.verdict();
  });

  it('geste interrompu par le système', () => {
    const b = monter();
    b.scene('interruption');
    glisser(b, { x: 100, y: 300 }, pasReguliers(6, 50, 0.1), { dt: 8, lacher: false });
    b.attendre(8);
    b.interrompre();
    repos(b);
    glisser(b, { x: 300, y: 300 }, pasReguliers(6, 50, Math.PI), { dt: 8, dtLacher: 8 });
    repos(b);
    b.verdict();
  });

  it('plan zoomé qui déborde, promené à grands traits', () => {
    const b = monter();
    b.scene('zoomé qui déborde');
    pincer(b, { centre: { x: 195, y: 310 }, d0: 90, a0: 0, k: 4, torsion: 0, deplace: { x: 0, y: 0 }, n: 8, dt: 8 });
    repos(b);
    expect(b.zoom).toBeGreaterThan(3);
    glisser(b, { x: 60, y: 100 }, pasReguliers(6, 110, 0.9), { dt: 8, dtLacher: 8 });
    repos(b);
    glisser(b, { x: 340, y: 560 }, pasReguliers(7, 100, Math.PI + 0.9), { dt: 8, dtLacher: 8 });
    repos(b);
    glisser(b, { x: 200, y: 300 }, pasReguliers(25, 2, 1.2));
    repos(b);
    b.verdict();
  });

  it('enchaînement dans la MÊME tâche : le lâcher et le geste suivant arrivent en un paquet', () => {
    const b = monter();
    b.scene('paquet : lâcher + geste suivant');
    glisser(b, { x: 100, y: 300 }, pasReguliers(6, 40, 0), { dt: 8, lacher: false });
    b.attendre(8);
    b.paquet(() => {
      b.lever(0);
      b.poser(0, 200, 300);
      b.bouger({ 0: { x: 214, y: 300 } });
      for (let i = 1; i <= 4; i++) b.bouger({ 0: { x: 214 + i * 30, y: 300 - i * 15 } });
    });
    b.attendre(8);
    b.lever(0);
    repos(b);
    b.verdict();
  });

  it('deux gestes ENTIERS dans la même tâche (deux lâchers avant un seul rendu)', () => {
    const b = monter();
    b.scene('paquet : deux lâchers');
    glisser(b, { x: 100, y: 300 }, pasReguliers(6, 45, 0.2), { dt: 8, lacher: false });
    b.attendre(8);
    b.paquet(() => {
      b.lever(0);
      // Un second coup de doigt, complet, avant que React n'ait rendu le premier lâcher.
      b.poser(0, 220, 320);
      b.bouger({ 0: { x: 236, y: 320 } });
      for (let i = 1; i <= 3; i++) b.bouger({ 0: { x: 236 + i * 40, y: 320 + i * 10 } });
      b.lever(0);
    });
    repos(b);
    // Et le geste suivant part de ce qu'on voit.
    glisser(b, { x: 250, y: 300 }, pasReguliers(5, 30, Math.PI), { dt: 16 });
    repos(b);
    b.verdict();
  });

  it('…et de même quand le second geste du paquet est une prise sans mouvement', () => {
    const b = monter();
    b.scene('paquet : lâcher + prise sans mouvement');
    glisser(b, { x: 100, y: 300 }, pasReguliers(6, 45, 0.2), { dt: 8, lacher: false });
    b.attendre(8);
    b.paquet(() => {
      b.lever(0);
      b.poser(0, 220, 320);
      b.bouger({ 0: { x: 236, y: 320 } });
      b.lever(0);
    });
    repos(b);
    glisser(b, { x: 250, y: 300 }, pasReguliers(5, 30, Math.PI), { dt: 16 });
    repos(b);
    b.verdict();
  });

  it('cinquante gestes au hasard, graine fixe : glissés et pincements, lents et rapides', () => {
    const b = monter();
    const rnd = hasard(735);
    const entre = (a: number, z: number) => a + (z - a) * rnd();
    const centreDuPlan = () => {
      const a = b.attendu();
      return { x: a.reduce((s, p) => s + p.x, 0) / a.length, y: a.reduce((s, p) => s + p.y, 0) / a.length };
    };
    for (let g = 0; g < 50; g++) {
      const rapide = rnd() < 0.5;
      const pinch = rnd() < 0.45;
      b.scene(`geste ${g + 1}/50 (${pinch ? 'pincement' : 'glissé'} ${rapide ? 'rapide' : 'lent'})`);
      // On ramène le plan vers le milieu quand il s'éloigne.
      const c = centreDuPlan();
      const versMilieu = Math.atan2(HAUTEUR / 2 - c.y, LARGEUR / 2 - c.x);
      const loin = Math.hypot(HAUTEUR / 2 - c.y, LARGEUR / 2 - c.x) > 120;
      const direction = loin ? versMilieu + entre(-0.6, 0.6) : entre(-Math.PI, Math.PI);
      const dt = rapide ? (rnd() < 0.5 ? 8 : 16) : 16;
      if (!pinch) {
        const n = rapide ? Math.floor(entre(5, 9)) : Math.floor(entre(12, 31));
        const pas = rapide
          ? Array.from({ length: n }, () => {
              const l = entre(40, 120);
              const a = direction + entre(-0.25, 0.25);
              return { x: l * Math.cos(a), y: l * Math.sin(a) };
            })
          : pasReguliers(n, 2, direction);
        // Le doigt part du côté opposé à la direction, pour rester à l'écran.
        const long = pas.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
        const de = {
          x: Math.min(370, Math.max(20, LARGEUR / 2 - long.x / 2 + entre(-30, 30))),
          y: Math.min(600, Math.max(20, HAUTEUR / 2 - long.y / 2 + entre(-40, 40))),
        };
        const pauses: Record<number, number> = {};
        if (!rapide && rnd() < 0.4) pauses[Math.floor(n / 2)] = Math.floor(entre(50, 160));
        glisser(b, de, pas, { dt, dtLacher: rapide ? Math.floor(entre(2, 10)) : 16, pauses });
      } else {
        // Le zoom reste loin des butées (0,2 et 6) : là, le plan cesse de suivre l'écart des doigts.
        let k = rapide ? entre(0.55, 1.8) : entre(0.85, 1.2);
        if (b.zoom * k > 4.5 || b.zoom * k < 0.35) k = 1 / k;
        const d0 = entre(90, 200);
        pincer(b, {
          centre: { x: entre(140, 250), y: entre(220, 400) },
          d0,
          a0: entre(-Math.PI, Math.PI),
          k,
          torsion: rapide ? entre(-0.5, 0.5) : entre(-0.12, 0.12),
          deplace: rapide
            ? { x: 80 * Math.cos(direction), y: 80 * Math.sin(direction) }
            : { x: 15 * Math.cos(direction), y: 15 * Math.sin(direction) },
          n: rapide ? Math.floor(entre(5, 9)) : Math.floor(entre(15, 31)),
          dt,
          leverEnPremier: rnd() < 0.5 ? 0 : 1,
          traine: rnd() < 0.4 ? pasReguliers(Math.floor(entre(1, 5)), rapide ? 25 : 3, direction) : [],
        });
      }
      // Entre deux gestes : parfois tout de suite, parfois après le débounce.
      const pause = [0, 16, 50, 300][Math.floor(rnd() * 4)];
      b.attendre(pause);
    }
    repos(b);
    b.verdict();
  });
});

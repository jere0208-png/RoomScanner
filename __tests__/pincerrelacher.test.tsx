/**
 * LE PINCER-RELÂCHER, IMAGE PAR IMAGE — le banc de la vidéo du patron.
 *
 * Relevé du patron, vidéo à 60 images par seconde analysée image par image :
 * « au pincer-relâcher, le plan ne se pose pas d'une traite ».
 *
 *   (a) images 68 à 73 : six images où le plan réapparaît EXACTEMENT à sa
 *       position d'avant le geste, puis saute à celle du relâcher ;
 *   (b) images 311 à 318 : pendant ou à la fin d'un geste, six images à une
 *       position décalée, puis retour.
 *
 * Les bancs d'avant vérifiaient des MORCEAUX : la formule de la couche seule
 * (`transformeDuGeste`), la couche à plat après coup, le nombre de nœuds. Aucun
 * ne regardait ce que l'œil regarde : OÙ EST LE PLAN À L'ÉCRAN, à chaque pas
 * du geste et à chaque commit. C'est ce que fait ce banc.
 *
 * LA POSITION À L'ÉCRAN d'un point du plan se compose de trois étages, et le
 * banc les lit tous dans le rendu, sans rien recalculer de l'éditeur :
 *
 *   — le DESSIN : les coordonnées que le dernier rendu a écrites (ici les
 *     quatre coins du filigrane, des `Line` dont on lit `x1`, `y1`) ;
 *   — la TOILE : sa marge et son `viewBox`, qui s'ouvrent pendant le geste
 *     quand le plan déborde (un décalage qui doit valoir zéro) ;
 *   — la COUCHE : les quatre valeurs animées de l'`Animated.View` qui porte
 *     tout le dessin, lues sur les nœuds animés eux-mêmes (`__getValue`) —
 *     c'est ce que le pilote natif affiche, même sans rendu React.
 *
 * Et LA MAIN est une vraie main : le banc écrit l'archive des doigts
 * (`touchHistory`), pas l'état de geste — `PanResponder` le recalcule (voir
 * `doigt.test.tsx`). Le plan est posé SOUS UN BANDEAU de cent points : les
 * doigts sont en coordonnées de page, le dessin en coordonnées du plan.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Animated, View } from 'react-native';
import { Line } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

type Pt = { x: number; y: number };
type Poignee = Record<string, ((e: unknown) => unknown) | undefined>;

/** Le plan, dans la page : sous un bandeau de cent points. */
const ORIGINE: Pt = { x: 0, y: 100 };
const LARGEUR = 390;
const HAUTEUR = 620;
/** La tolérance de l'œil : un demi-point, le pas du rendu. */
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

/** Le logement : dix mètres sur huit. */
const MURS = [
  mur('n', 0, 0, 10, 0, 'r1'),
  mur('e', 10, 0, 10, 8, 'r1'),
  mur('s', 10, 8, 0, 8, 'r1'),
  mur('o', 0, 8, 0, 0, 'r1'),
];
/**
 * LES POINTS REPÈRES : quatre coins posés en filigrane. Un `Line` par coin,
 * dont `x1`/`y1` est exactement `mapping.toPx(coin)` du rendu en cours.
 */
const REPERES = [
  mur('f1', 1, 1, 9, 1),
  mur('f2', 9, 1, 9, 7),
  mur('f3', 9, 7, 1, 7),
  mur('f4', 1, 7, 1, 1),
];

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
  const evenement = () => {
    const vivants = bank
      .map((t, id) => ({ t, id }))
      .filter((x): x is { t: Doigt; id: number } => !!x.t?.touchActive);
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
    /** Les doigts posés, en coordonnées du plan. */
    vivants(): Map<number, Pt> {
      const m = new Map<number, Pt>();
      bank.forEach((t, id) => {
        if (t?.touchActive) m.set(id, { x: t.currentPageX - ORIGINE.x, y: t.currentPageY - ORIGINE.y });
      });
      return m;
    },
    poser(id: number, x: number, y: number) {
      horloge += 16;
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
    /** Plusieurs doigts peuvent bouger dans la même image : un seul évènement. */
    bouger(pas: Record<number, Pt>) {
      horloge += 16;
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
      return evenement();
    },
    lever(id: number) {
      horloge += 16;
      const t = bank[id];
      if (t) bank[id] = { ...t, touchActive: false, currentTimeStamp: horloge };
      return evenement();
    },
  };
}

/* ------------------------------------------------------------------ */
/*  CE QUE L'ŒIL VOIT                                                  */
/* ------------------------------------------------------------------ */

interface Couche {
  tx: number;
  ty: number;
  ech: number;
  rot: number;
  /** Les nœuds animés eux-mêmes : leur identité dit si la couche est neuve. */
  noeuds: { tx: { setValue: (v: number) => void }; ty: { setValue: (v: number) => void }; ech: { setValue: (v: number) => void }; rot: { setValue: (v: number) => void } };
}

type Arbre = TestRenderer.ReactTestRenderer;

/** La couche qui porte le dessin, telle que le pilote natif l'affiche. */
function lireCouche(t: Arbre): Couche {
  const candidats = t.root.findAll((n) => {
    if (n.type !== Animated.View) return false;
    const st = ([] as unknown[]).concat(n.props.style).flat(Infinity) as Record<string, unknown>[];
    return st.some((s) => s && Array.isArray(s.transform));
  });
  expect(candidats).toHaveLength(1);
  const st = ([] as unknown[]).concat(candidats[0].props.style).flat(Infinity) as Record<string, unknown>[];
  const transform = st.find((s) => s && Array.isArray(s.transform))!.transform as Record<string, { __getValue: () => unknown }>[];
  const champ = (k: string) => transform.find((x) => k in x)![k];
  const rot = champ('rotate');
  const deg = String(rot.__getValue());
  expect(deg).toMatch(/deg$/);
  return {
    tx: Number(champ('translateX').__getValue()),
    ty: Number(champ('translateY').__getValue()),
    ech: Number(champ('scale').__getValue()),
    rot: (parseFloat(deg) * Math.PI) / 180,
    noeuds: {
      tx: champ('translateX') as never,
      ty: champ('translateY') as never,
      ech: champ('scale') as never,
      // La rotation passe par une interpolation : le nœud source est la valeur.
      rot: (rot as unknown as { _parent: { setValue: (v: number) => void } })._parent,
    },
  };
}

/** Le décalage de la toile : sa marge moins l'ouverture de son `viewBox`. */
function lireToile(t: Arbre): Pt {
  const svg = t.root
    .findAll((n) => typeof n.props?.bbWidth === 'number')
    .sort((a, b) => b.props.bbWidth - a.props.bbWidth)[0];
  const st = ([] as unknown[]).concat(svg.props.style).flat(Infinity) as Record<string, number>[];
  const marge = (k: string) => st.reduce((acc, s) => (s && typeof s[k] === 'number' ? s[k] : acc), 0);
  const echX = svg.props.bbWidth / (svg.props.vbWidth ?? svg.props.bbWidth);
  const echY = svg.props.bbHeight / (svg.props.vbHeight ?? svg.props.bbHeight);
  expect(echX).toBeCloseTo(1, 9);
  expect(echY).toBeCloseTo(1, 9);
  return {
    x: marge('marginLeft') - (svg.props.minX ?? 0) * echX,
    y: marge('marginTop') - (svg.props.minY ?? 0) * echY,
  };
}

/** Les points repères tels que le dernier rendu les a dessinés. */
function lireDessin(t: Arbre): Pt[] {
  const traits = t.root.findAllByType(Line).filter((n) => n.props.strokeOpacity === 0.16);
  expect(traits).toHaveLength(REPERES.length);
  return traits.map((n) => ({ x: Number(n.props.x1), y: Number(n.props.y1) }));
}

interface Vue {
  dessin: Pt[];
  toile: Pt;
  couche: Couche;
  /** La composition : où l'œil voit chaque point repère. */
  ecran: Pt[];
}

/**
 * Où l'œil voit les repères : la couche agrandit et tourne autour du centre
 * de la vue, puis translate — l'ordre exact d'un `transform` React Native
 * (le dernier de la liste s'applique le premier au point).
 */
function voir(t: Arbre): Vue {
  const dessin = lireDessin(t);
  const toile = lireToile(t);
  const couche = lireCouche(t);
  const c = { x: LARGEUR / 2, y: HAUTEUR / 2 };
  const cos = Math.cos(couche.rot);
  const sin = Math.sin(couche.rot);
  const ecran = dessin.map((p) => {
    const dx = (p.x + toile.x - c.x) * couche.ech;
    const dy = (p.y + toile.y - c.y) * couche.ech;
    return { x: c.x + dx * cos - dy * sin + couche.tx, y: c.y + dx * sin + dy * cos + couche.ty };
  });
  return { dessin, toile, couche, ecran };
}

const fmt = (ps: Pt[]) => ps.map((p) => `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`).join(' ');

/** Les mêmes points à une demi-unité près — le message dit lesquels et de combien. */
function memesPoints(quoi: string, obtenu: Pt[], attendu: Pt[], tol = TOL) {
  const ecart = Math.max(...obtenu.map((p, i) => Math.hypot(p.x - attendu[i].x, p.y - attendu[i].y)));
  if (!(ecart <= tol)) {
    throw new Error(`${quoi} : écart ${ecart.toFixed(2)} pt\n  obtenu  ${fmt(obtenu)}\n  attendu ${fmt(attendu)}`);
  }
}

function aPlat(quoi: string, c: Couche) {
  expect(`${quoi} : tx=${c.tx.toFixed(4)} ty=${c.ty.toFixed(4)} ech=${c.ech.toFixed(4)} rot=${c.rot.toFixed(4)}`).toBe(
    `${quoi} : tx=0.0000 ty=0.0000 ech=1.0000 rot=0.0000`,
  );
}

/* ------------------------------------------------------------------ */
/*  LE BANC                                                            */
/* ------------------------------------------------------------------ */

let arbre: Arbre | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

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

interface Commit {
  apres: string;
  /** `null` : le commit n'a pas pu être lu — c'est un échec, pas un oubli. */
  vue: Vue | null;
}

/** La vue d'un commit, ou l'échec qui dit pourquoi on ne l'a pas lue. */
function vueDu(c: Commit): Vue {
  if (!c.vue) throw new Error(`commit après « ${c.apres} » illisible : couche, toile ou repères introuvables`);
  return c.vue;
}

function monter() {
  const commits: Commit[] = [];
  let tree: Arbre | null = null;
  /** Le dernier évènement envoyé : chaque commit est rangé derrière lui. */
  let etiquette = 'montage';
  const vues: { zoom: number; ox: number; oy: number; rot: number }[] = [];
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
      /*
        LE PROFILER LIT CHAQUE COMMIT : l'œil ne voit que ce qui a été
        commité. Il est appelé une fois l'arbre posé, avant que l'écran ne
        soit peint — exactement l'instant où un rendu intermédiaire
        incohérent se verrait.
      */
      <React.Profiler
        id="plan"
        onRender={() => {
          if (!tree) return;
          let vue: Vue | null = null;
          try {
            vue = voir(tree);
          } catch {
            vue = null;
          }
          // Avant la mise en page, il n'y a pas encore de dessin à lire.
          if (vue || etiquette !== 'montage') commits.push({ apres: etiquette, vue });
        }}>
        <FloorplanEditor
          showMeasures
          editable={false}
          selectedWallId={null}
          onSelectWall={() => {}}
          filigrane={REPERES}
          onView={(v) => vues.push({ ...v })}
        />
      </React.Profiler>,
    );
  });
  const t = tree as unknown as Arbre;
  arbre = t;
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
  /*
    LE CADRE SE MESURE DANS LA FENÊTRE : sous le bandeau. La doublure de
    `View` du banc a un `measureInWindow` muet ; on lui fait répondre ce
    que répondrait le téléphone.
  */
  (cadre().instance as { measureInWindow: unknown }).measureInWindow = (
    cb: (x: number, y: number, w: number, h: number) => void,
  ) => cb(ORIGINE.x, ORIGINE.y, LARGEUR, HAUTEUR);

  const m = main();
  let tient = false;
  /** Ce que le plan doit montrer, recalculé depuis les doigts seuls. */
  let attendu = voir(t).ecran;
  /** Les doigts du dernier mouvement que le plan a traité. */
  let dernier: Map<number, Pt> | null = null;
  const journal: string[] = [];

  /** Envoie un évènement — dans un `act` à lui, sauf si on groupe. */
  const envoyer = (nom: string, f: () => void, groupe: boolean) => {
    etiquette = nom;
    journal.push(nom);
    if (groupe) f();
    else act(f);
  };

  /** Les commits déjà contrôlés. */
  let controles = commits.length;
  /**
   * Ce que l'œil voit MAINTENANT, et ce qu'il a vu à CHAQUE COMMIT depuis le
   * dernier contrôle : tous doivent montrer ce que les doigts disent. Un
   * rendu intermédiaire — vue neuve sous l'ancienne couche, ou l'inverse —
   * serait pris ici, même s'il était rattrapé dans la foulée.
   */
  const verifier = (quoi: string) => {
    for (const c of commits.slice(controles)) memesPoints(`${quoi} — commit après « ${c.apres} »`, vueDu(c).ecran, attendu);
    controles = commits.length;
    memesPoints(quoi, voir(t).ecran, attendu);
  };

  return {
    tree: t,
    commits,
    vues,
    journal,
    hote,
    get tient() {
      return tient;
    },
    attendu: () => attendu,
    voir: () => voir(t),
    verifier,
    poser(id: number, x: number, y: number, groupe = false) {
      envoyer(`poser ${id}`, () => {
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
      }, groupe);
      // Un doigt qui se pose pendant le geste : le plan reprend son repère
      // ici même, et le mouvement suivant compte en entier.
      if (tient) dernier = m.vivants();
      if (!groupe) verifier(`après poser ${id}`);
    },
    bouger(pas: Record<number, Pt>, groupe = false) {
      envoyer(`bouger ${JSON.stringify(pas)}`, () => {
        const e = m.bouger(pas);
        if (tient) {
          hote().onResponderMove?.(e);
        } else {
          const capte = hote().onMoveShouldSetResponderCapture?.(e) === true;
          if (capte || hote().onMoveShouldSetResponder?.(e) === true) {
            tient = true;
            hote().onResponderGrant?.(e);
            // La prise ne bouge rien : le geste part d'ici.
            dernier = m.vivants();
            return;
          }
        }
      }, groupe);
      // Ce que le plan DOIT montrer : il suit les doigts, sauf à l'image où
      // leur nombre change — il reprend alors son repère sans bouger.
      const maintenant = m.vivants();
      if (tient && dernier && dernier.size === maintenant.size && [...maintenant.keys()].every((k) => dernier!.has(k))) {
        if (maintenant.size === 1) {
          const [id] = [...maintenant.keys()];
          const d = { x: maintenant.get(id)!.x - dernier.get(id)!.x, y: maintenant.get(id)!.y - dernier.get(id)!.y };
          attendu = attendu.map((p) => ({ x: p.x + d.x, y: p.y + d.y }));
        } else {
          const [i, j] = [...maintenant.keys()];
          attendu = attendu.map((p) =>
            similitude(dernier!.get(i)!, dernier!.get(j)!, maintenant.get(i)!, maintenant.get(j)!, p),
          );
        }
      }
      if (tient) dernier = maintenant;
      if (!groupe) verifier(`après ${journal[journal.length - 1]}`);
    },
    lever(id: number, groupe = false) {
      envoyer(`lever ${id}`, () => {
        const e = m.lever(id);
        if (!tient) return;
        hote().onResponderEnd?.(e);
        if (m.vivants().size === 0) {
          tient = false;
          dernier = null;
          hote().onResponderRelease?.(e);
        }
      }, groupe);
      // Un doigt qui se lève, les autres restant : même chose.
      if (tient) dernier = m.vivants();
      if (!groupe) verifier(`après lever ${id}`);
    },
    interrompre(groupe = false) {
      envoyer('interrompre', () => {
        const e = m.bouger({});
        tient = false;
        dernier = null;
        hote().onResponderTerminate?.(e);
      }, groupe);
      if (!groupe) verifier('après interruption');
    },
    /** Lève tous les doigts encore posés (le système rend le geste). */
    toutLever() {
      for (const id of [...m.vivants().keys()]) m.lever(id);
    },
  };
}

type Banc = ReturnType<typeof monter>;

/**
 * LE RELÂCHER, SOUS LE MICROSCOPE.
 *
 * `lacher` fait lever le dernier doigt, puis vérifie les trois promesses du
 * relâcher :
 *   — la position vue juste AVANT est celle vue APRÈS, à un demi-point ;
 *   — la couche montée est NEUVE et à plat ;
 *   — l'ancienne couche, celle qui était à l'écran, n'a reçu AUCUN
 *     `setValue` : remise à plat sur-le-champ, elle aurait montré l'ancien
 *     dessin à sa place d'avant le geste (images 68 à 73).
 * Et entre le relâcher et l'état final, UN SEUL commit, cohérent.
 */
function lacher(b: Banc, id: number, comment: 'lever' | 'interrompre' = 'lever') {
  const avant = b.voir();
  const vieille = avant.couche.noeuds;
  const espions = [vieille.tx, vieille.ty, vieille.ech, vieille.rot].map((v) => jest.spyOn(v, 'setValue'));
  const n0 = b.commits.length;
  if (comment === 'lever') b.lever(id);
  else b.interrompre();
  // C'était bien la fin du geste : plus aucun doigt ne tient le plan.
  expect(b.tient).toBe(false);
  const apres = b.voir();
  memesPoints('le relâcher ne fait pas bouger le plan', apres.ecran, avant.ecran);
  aPlat('la couche montée après le relâcher', apres.couche);
  expect(apres.couche.noeuds.tx).not.toBe(vieille.tx);
  for (const s of espions) {
    expect(s).not.toHaveBeenCalled();
    s.mockRestore();
  }
  const neufs = b.commits.slice(n0);
  for (const c of neufs) {
    memesPoints(`commit après « ${c.apres} »`, vueDu(c).ecran, avant.ecran);
    aPlat(`couche du commit après « ${c.apres} »`, vueDu(c).couche);
  }
  expect(`${neufs.length} commit(s) entre le relâcher et l’état final`).toBe('1 commit(s) entre le relâcher et l’état final');
  return { avant, apres };
}

/* ------------------------------------------------------------------ */
/*  LES SCÉNARIOS                                                      */
/* ------------------------------------------------------------------ */

describe('le banc lui-même', () => {
  it('lit un plan posé, couche à plat, et des repères dans le cadre', () => {
    const b = monter();
    const v = b.voir();
    aPlat('au repos', v.couche);
    expect(v.toile).toEqual({ x: 0, y: 0 });
    for (const p of v.ecran) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(LARGEUR);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(HAUTEUR);
    }
  });

  it('sait voir un défaut : une couche poussée à la main déplace les repères', () => {
    const b = monter();
    const avant = b.voir().ecran;
    act(() => {
      (b.voir().couche.noeuds.tx as unknown as Animated.Value).setValue(25);
    });
    const apres = b.voir().ecran;
    expect(apres[0].x - avant[0].x).toBeCloseTo(25, 6);
    expect(() => memesPoints('témoin', apres, avant)).toThrow(/écart 25\.00/);
  });
});

describe('le plan suit les doigts, et se pose d’une traite', () => {
  it('glissement simple', () => {
    const b = monter();

    b.poser(0, 150, 300);
    for (let i = 1; i <= 8; i++) b.bouger({ 0: { x: 150 + i * 9, y: 300 - i * 4 } });
    lacher(b, 0);
    // Et l'écran qui porte le plan a appris le cadrage, une fois.
    expect(b.vues[b.vues.length - 1].ox).not.toBe(0);
  });

  it('pincement : homothétie autour du milieu des doigts', () => {
    const b = monter();
    b.poser(0, 120, 250);
    b.poser(1, 240, 330);
    // Le premier doigt part le premier : c'est lui qui fait prendre le plan.
    b.bouger({ 0: { x: 96, y: 238 } });
    expect(b.tient).toBe(true);
    for (let i = 1; i <= 8; i++) {
      b.bouger({ 0: { x: 96 - i * 7, y: 238 - i * 4 }, 1: { x: 240 + i * 8, y: 330 + i * 5 } });
    }
    expect(b.tient).toBe(true);
    // Deux doigts ne se lèvent jamais à la même image.
    b.lever(0);
    lacher(b, 1);
  });

  it('pincement qui vrille : la rotation suit les doigts aussi', () => {
    const b = monter();
    b.poser(0, 200, 200);
    b.poser(1, 200, 360);
    b.bouger({ 0: { x: 226, y: 200 } });
    expect(b.tient).toBe(true);
    for (let i = 1; i <= 10; i++) {
      const a = (i * 4 * Math.PI) / 180; // quarante degrés en dix images
      const r = 80 + i * 5;
      const m = { x: 207 + i * 3, y: 280 - i * 2 };
      b.bouger({
        0: { x: m.x + r * Math.sin(a), y: m.y - r * Math.cos(a) },
        1: { x: m.x - r * Math.sin(a), y: m.y + r * Math.cos(a) },
      });
    }
    b.lever(1);
    lacher(b, 0);
  });

  it('glissement, puis un second doigt se pose : le passage au pincement ne saute pas', () => {
    const b = monter();
    b.poser(0, 150, 300);
    for (let i = 1; i <= 5; i++) b.bouger({ 0: { x: 150 + i * 10, y: 300 } });
    b.poser(1, 300, 400);
    // L'image où le nombre de doigts change : le repère se reprend, rien ne bouge.
    b.bouger({ 0: { x: 202, y: 301 }, 1: { x: 302, y: 401 } });
    for (let i = 1; i <= 6; i++) b.bouger({ 0: { x: 202 - i * 6, y: 301 - i * 3 }, 1: { x: 302 + i * 6, y: 401 + i * 3 } });
    // Le second doigt se lève le dernier, sans bouger : le relâcher seul.
    b.lever(0);
    lacher(b, 1);
  });

  it('pincement, un doigt levé avant l’autre, puis glissé à un doigt : le passage au glissement ne saute pas (images 311–318)', () => {
    const b = monter();
    b.poser(0, 140, 260);
    b.poser(1, 250, 360);
    b.bouger({ 0: { x: 116, y: 252 } });
    expect(b.tient).toBe(true);
    for (let i = 1; i <= 6; i++) b.bouger({ 0: { x: 116 - i * 8, y: 252 - i * 5 }, 1: { x: 250 + i * 9, y: 360 + i * 4 } });
    // Un doigt se lève AVANT l'autre — toujours, sur un vrai écran.
    b.lever(0);
    // Et le doigt qui reste glisse encore un peu avant de se lever.
    for (let i = 1; i <= 6; i++) b.bouger({ 1: { x: 304 - i * 7, y: 384 + i * 6 } });
    lacher(b, 1);
  });

  it('geste interrompu (le système reprend le toucher) : le plan reste où on le voyait', () => {
    const b = monter();
    b.poser(0, 120, 250);
    b.poser(1, 240, 330);
    b.bouger({ 0: { x: 96, y: 244 } });
    expect(b.tient).toBe(true);
    for (let i = 1; i <= 5; i++) b.bouger({ 0: { x: 96 - i * 6, y: 244 }, 1: { x: 240 + i * 6, y: 330 + i * 2 } });
    lacher(b, 0, 'interrompre');
    b.toutLever();
  });

  it('deux gestes enchaînés : le second part de là où le premier s’est posé', () => {
    const b = monter();
    b.poser(0, 150, 300);
    for (let i = 1; i <= 6; i++) b.bouger({ 0: { x: 150 + i * 10, y: 300 + i * 3 } });
    lacher(b, 0);
    // Le second commence à l'image suivante, à deux doigts.
    b.poser(0, 110, 240);
    b.poser(1, 230, 330);
    b.bouger({ 0: { x: 86, y: 230 } });
    expect(b.tient).toBe(true);
    for (let i = 1; i <= 6; i++) b.bouger({ 0: { x: 86 - i * 5, y: 230 - i * 3 }, 1: { x: 230 + i * 6, y: 330 + i * 4 } });
    b.lever(0);
    lacher(b, 1);
    // Puis un troisième, à un doigt, pour vérifier que rien ne s'accumule.
    b.poser(0, 200, 200);
    for (let i = 1; i <= 4; i++) b.bouger({ 0: { x: 200 - i * 12, y: 200 + i * 7 } });
    lacher(b, 0);
  });

  it('deux gestes enchaînés DANS LA MÊME TÂCHE : le second démarre avant que React ait rendu le lâcher du premier', () => {
    /*
      Le JS d'un téléphone occupé reçoit les évènements tactiles par paquets :
      le lâcher du premier geste, la pose et les premiers mouvements du
      second peuvent arriver dans la même tâche, avant que le rendu du
      lâcher n'ait eu lieu. Le banc les envoie donc dans UN SEUL `act`.
    */
    const b = monter();
    b.poser(0, 150, 300);
    for (let i = 1; i <= 6; i++) b.bouger({ 0: { x: 150 + i * 10, y: 300 + i * 3 } });
    const finDuPremier = b.voir().ecran;
    act(() => {
      b.lever(0, true);
      b.poser(0, 200, 300, true);
      b.bouger({ 0: { x: 214, y: 300 } }, true);
      for (let i = 1; i <= 4; i++) b.bouger({ 0: { x: 214 + i * 10, y: 300 - i * 5 } }, true);
    });
    // Le premier geste n'est pas perdu, et le second l'a prolongé.
    const attendu = finDuPremier.map((p) => ({ x: p.x + 40, y: p.y - 20 }));
    memesPoints('après le paquet d’évènements', b.voir().ecran, attendu);
    lacher(b, 0);
    memesPoints('après le second lâcher', b.voir().ecran, attendu);
  });

  it('…et de même quand le second geste du paquet est un pincement', () => {
    const b = monter();
    b.poser(0, 150, 300);
    for (let i = 1; i <= 6; i++) b.bouger({ 0: { x: 150 + i * 10, y: 300 + i * 3 } });
    act(() => {
      b.lever(0, true);
      b.poser(0, 140, 250, true);
      b.poser(1, 260, 340, true);
      b.bouger({ 0: { x: 116, y: 240 } }, true);
      for (let i = 1; i <= 5; i++) b.bouger({ 0: { x: 116 - i * 6, y: 240 - i * 3 }, 1: { x: 260 + i * 7, y: 340 + i * 4 } }, true);
    });
    // Ce que l'œil voit au sortir du paquet : ce que les doigts disent.
    b.verifier('après le paquet d’évènements');
    b.lever(0);
    lacher(b, 1);
  });

  it('geste sans mouvement : un doigt posé puis levé ne bouge rien', () => {
    const b = monter();
    const avant = b.voir();
    const n0 = b.commits.length;
    b.poser(0, 150, 300);
    b.bouger({ 0: { x: 153, y: 302 } }); // sous le seuil : un tremblement
    expect(b.tient).toBe(false);
    b.lever(0);
    memesPoints('tap', b.voir().ecran, avant.ecran);
    aPlat('couche après un tap', b.voir().couche);
    expect(b.voir().couche.noeuds.tx).toBe(avant.couche.noeuds.tx);
    expect(b.commits.length - n0).toBe(0);
  });

  it('geste pris puis lâché sans plus bouger : le lâcher se pose d’une traite quand même', () => {
    const b = monter();
    b.poser(0, 150, 300);
    b.bouger({ 0: { x: 162, y: 300 } }); // le plan prend la main ici…
    expect(b.tient).toBe(true);
    lacher(b, 0); // …et le doigt se lève sans avoir bougé depuis
  });

  /*
    LA TOILE NE BOUGE PLUS AU GESTE — diagnostic du patron : l'écran se
    figeait au début d'un geste sur un plan qui déborde, le temps de
    repeindre la toile agrandie à la prise. Ses marges viennent désormais du
    rendu (voir `margesDeToile`) : au repos, elle est déjà ouverte du côté où
    le plan dépasse, et le geste n'y touche pas.
  */
  it('plan qui déborde : la toile est ouverte dès le repos, et ni le geste ni le lâcher n’y touchent', () => {
    const b = monter();
    const toile = () =>
      b.tree.root
        .findAll((n) => typeof n.props?.bbWidth === 'number')
        .sort((x, y) => y.props.bbWidth - x.props.bbWidth)[0].props.bbWidth as number;
    // Un premier geste le pousse à moitié hors du cadre, vers la droite.
    b.poser(0, 100, 300);
    for (let i = 1; i <= 10; i++) b.bouger({ 0: { x: 100 + i * 22, y: 300 } });
    lacher(b, 0);
    const auRepos = toile();
    expect(auRepos).toBeGreaterThan(LARGEUR);
    // Le second l'y ramène, en pinçant : la toile ne change pas d'un point.
    b.poser(0, 200, 250);
    b.poser(1, 300, 350);
    b.bouger({ 0: { x: 176, y: 240 } });
    expect(b.tient).toBe(true);
    expect(toile()).toBe(auRepos);
    for (let i = 1; i <= 8; i++) b.bouger({ 0: { x: 176 - i * 12, y: 240 }, 1: { x: 300 - i * 4, y: 350 + i * 3 } });
    expect(toile()).toBe(auRepos);
    b.lever(0);
    lacher(b, 1);
    // Et le lâcher ne la change pas non plus (diagnostic « il se déplace tout
    // seul au relâcher ») : la toile a une taille fixe.
    expect(toile()).toBe(auRepos);
  });
});

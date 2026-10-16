/**
 * LE MEUBLE GLISSE SANS RÉVEILLER L'ÉCRAN.
 *
 * Relevé du patron, sur son iPhone : « optimise la fluidité des déplacements
 * de meubles et du plan 2D lui-même. Ça fait un peu lag pour l'instant. »
 *
 * MESURÉ D'ABORD, sur l'appartement d'exemple (16 murs, 5 pièces,
 * 10 ouvertures, 26 meubles, 27 appareils en mode électricité) et sur un plan
 * trois fois plus gros. Par mouvement du doigt, sur ce banc (des ms de jest,
 * pas d'iPhone — c'est le rapport qui compte) :
 *
 *                          AVANT                          APRÈS
 *   glisser un meuble      150–180 ms, 86–89 rendus       6–12 ms, 2 rendus
 *     (gros plan)          260–340 ms, 150–153 rendus     10–13 ms, 2 rendus
 *   le pivoter             140–190 ms (gros 265–355)      5–12 ms, 2 rendus
 *   l'étirer               170–210 ms (gros 305–365)      20–26 ms, 7 rendus
 *   déplacer le plan       0,3 ms, 0 rendu                inchangé
 *
 * Chaque image du glisser écrivait le magasin : l'écran du plan se rendait
 * tout entier (ses treize feuilles, ses pastilles, ses bandeaux), le plan
 * aussi (deux tracés par mur, ses cotes, ses vingt-six meubles), et l'écran
 * relançait au passage les plans de travail, les surfaces, les portes
 * bloquées. Pour un meuble qui avançait de deux pixels.
 *
 * Le meuble vit désormais « en vol » pendant le geste (`useEnVol`) : seules
 * les vues qui le dessinent le suivent (`SuitLeDoigt`) — son empreinte, ses
 * poignées, ses dégagements, ses puces, sa barre, la porte qu'il bloque — et
 * le magasin l'apprend au lâcher, par les MÊMES actions qu'avant. Le plan,
 * lui, glissait déjà sans se redessiner (voir `fluidite`).
 *
 * Ce banc compte des RENDUS plutôt que des millisecondes : un compte ne
 * dépend pas de la charge de la machine. Une seule borne de temps, très
 * large, attrape le retour d'un rendu complet par image.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
  multiGet: jest.fn(async (k: string[]) => k.map((x) => [x, null])),
}));

/*
  QUI SE REND, ET COMBIEN DE FOIS. Chaque composant de l'app lit sa palette
  par `useTheme()` en tête de rendu : compter ses appelants, c'est compter
  les rendus, composant par composant, sans toucher au code mesuré.
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
import TestRenderer, { act } from 'react-test-renderer';
import type { ObjectData } from 'react-native-room-scan';
import { FloorplanEditor, ObjectDragHandle } from '../src/components/FloorplanEditor';
import { Iso3DView } from '../src/components/Iso3DView';
import { ObjectBar } from '../src/components/ObjectBar';
import { battantsDesPortes, meublesQuiBloquent } from '../src/geometry/passage';
import { ResultScreen } from '../src/screens/ResultScreen';
import { finirLeGeste, mettreEnVol, useEnVol } from '../src/store/geste';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';
import { light } from '../src/theme';

beforeAll(() => jest.useFakeTimers({ doNotFake: ['hrtime', 'performance'] }));
afterAll(() => jest.useRealTimers());

const g = globalThis as unknown as { __rendus?: Map<string, number> };
const maintenant = () => Number(process.hrtime.bigint()) / 1e6;

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  g.__rendus = undefined;
  mettreEnVol(null);
  finirLeGeste();
});

/** Trois appartements d'exemple côte à côte : le plan trois fois plus gros. */
function tripler() {
  const st = useScanStore.getState();
  const decaler = (v: unknown, k: number, dx: number): unknown => {
    if (Array.isArray(v)) return v.map((x) => decaler(x, k, dx));
    if (!v || typeof v !== 'object') return v;
    const o: Record<string, unknown> = {};
    for (const [cle, x] of Object.entries(v as Record<string, unknown>)) {
      if (['id', 'wallId', 'roomId', 'group'].includes(cle) && typeof x === 'string') o[cle] = `${k}-${x}`;
      else if (['wallIds', 'commands'].includes(cle) && Array.isArray(x)) o[cle] = x.map((y) => `${k}-${y}`);
      else if (['a', 'b', 'at'].includes(cle) && x && typeof (x as { x?: unknown }).x === 'number')
        o[cle] = { ...(x as object), x: (x as { x: number }).x + dx };
      else if (cle === 'transform' && Array.isArray(x)) {
        const t = [...(x as number[])];
        t[12] += dx;
        o[cle] = t;
      } else o[cle] = x;
    }
    return o;
  };
  const trois = <T,>(l: T[]) => [0, 1, 2].flatMap((k) => l.map((x) => decaler(x, k, k * 9) as T));
  useScanStore.setState({
    walls: trois(st.walls),
    openings: trois(st.openings),
    rooms: trois(st.rooms),
    objects: trois(st.objects),
    fixtures: trois(st.fixtures),
    ceiling: trois(st.ceiling),
  });
}

/** Un doigt, avec l'archive tactile que `PanResponder` relit. */
function doigt() {
  let horloge = 1000;
  type Trace = Record<string, number | boolean>;
  let t: Trace | null = null;
  const ev = () => ({
    nativeEvent: {
      touches: t?.touchActive ? [{ identifier: 0, pageX: t.currentPageX, pageY: t.currentPageY }] : [],
      locationX: (t?.currentPageX as number) ?? 0,
      locationY: (t?.currentPageY as number) ?? 0,
      pageX: (t?.currentPageX as number) ?? 0,
      pageY: (t?.currentPageY as number) ?? 0,
    },
    touchHistory: {
      touchBank: [t],
      numberActiveTouches: t?.touchActive ? 1 : 0,
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
      t = {
        ...t!,
        previousPageX: t!.currentPageX,
        previousPageY: t!.currentPageY,
        currentPageX: x,
        currentPageY: y,
        currentTimeStamp: horloge,
      };
      return ev();
    },
    lever() {
      horloge += 16;
      t = { ...t!, touchActive: false };
      return ev();
    },
  };
}

/** L'écran du plan, sur l'exemple (ou le gros plan), mode électricité allumé. */
function monter(gros = false) {
  useUsage.setState({ modeElec: true, charge: true, choisi: true });
  act(() => {
    useScanStore.getState().ouvrirExemple();
    if (gros) tripler();
  });
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<ResultScreen />);
  });
  arbre = tree;
  act(() => {
    for (const n of tree.root.findAllByType(View)) {
      n.props.onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 620 } } });
    }
  });
  return tree;
}

const editeur = (t: TestRenderer.ReactTestRenderer) => t.root.findByType(FloorplanEditor);

/** Choisit la table du séjour et rend la poignée demandée, avec son centre. */
function prendre(tree: TestRenderer.ReactTestRenderer, quoi: 'meuble' | 'pivot' | 'etirer') {
  const id = useScanStore.getState().objects.find((o) => o.category === 'table')!.id;
  act(() => editeur(tree).props.onSelectObject(id));
  if (quoi === 'etirer') act(() => editeur(tree).props.onToggleObjectDims());
  const poignee = tree.root.findByType(ObjectDragHandle);
  if (quoi === 'meuble') {
    const { center } = poignee.props;
    return { id, h: poignee.findAllByType(View)[0].props, x: center.x, y: center.y };
  }
  const nom = quoi === 'pivot' ? 'Pivoter le meuble' : 'Étirer le côté largeur+';
  const v = tree.root.findAll(
    (n) => n.props?.accessibilityLabel === nom && typeof n.props?.onResponderMove === 'function',
  )[0];
  const st = Object.assign({}, ...[v.props.style].flat(3).filter(Boolean));
  return { id, h: v.props, x: st.left + 17, y: st.top + 17 };
}

/** Les rendus de chaque composant pendant `faire`. */
function compter(faire: () => void) {
  g.__rendus = new Map();
  faire();
  const r = g.__rendus;
  g.__rendus = undefined;
  return {
    de: (nom: string) => r.get(nom) ?? 0,
    total: [...r.values()].reduce((a, b) => a + b, 0),
  };
}

const N = 20;

describe('glisser un meuble', () => {
  for (const gros of [false, true]) {
    it(`ne rend ni l’écran ni le plan à chaque mouvement${gros ? ' — plan trois fois plus gros' : ''}`, () => {
      const tree = monter(gros);
      const { id, h, x, y } = prendre(tree, 'meuble');
      const m = doigt();
      act(() => {
        h.onStartShouldSetResponder(m.poser(x, y));
        h.onResponderGrant(m.poser(x, y));
      });
      const avant = useScanStore.getState().objects;
      const dessin = () =>
        tree.root.findAll((n) => n.props?.testID === `meuble-${id}`)[0].props.transform as string;
      const position0 = dessin();
      const durees: number[] = [];
      const r = compter(() => {
        for (let i = 1; i <= N; i++) {
          const t0 = maintenant();
          act(() => h.onResponderMove(m.bouger(x + 12 + i * 2, y + i)));
          durees.push(maintenant() - t0);
        }
      });
      // Avant : l'écran et le plan, une fois par image — quatre-vingt-six
      // composants sur l'exemple, cent cinquante sur le gros plan.
      expect(`écran ${r.de('ResultScreen')}, plan ${r.de('FloorplanEditor')}`).toBe('écran 0, plan 0');
      // Ce qui se rend encore : la poignée et la rangée de commandes.
      expect(r.total).toBeLessThanOrEqual(3 * N);
      // Le magasin n'a rien appris, et pourtant le meuble a suivi le doigt.
      expect(useScanStore.getState().objects).toBe(avant);
      expect(dessin()).not.toBe(position0);
      // La seule borne de temps, très large : un rendu complet par image en
      // coûtait 150 à 340 sur ce banc.
      durees.sort((a, b) => a - b);
      expect(durees[N >> 1]).toBeLessThan(80);
    });
  }

  it('pose au lâcher EXACTEMENT ce que posait l’écriture image par image, en un point d’annulation', () => {
    const tree = monter();
    const { id, h, x, y } = prendre(tree, 'meuble');
    const original = useScanStore.getState().objects.find((o) => o.id === id)!;
    // Vers le refend : le meuble finit contre lui, rangé par la collision.
    const chemin = Array.from({ length: 12 }, (_, i) => [x + 15 + i * 9, y + i * 2] as const);
    const m = doigt();
    const vises: { x: number; z: number }[] = [];
    const versMetres = tree.root.findByType(ObjectDragHandle).props.mapping.deltaToMeters;
    act(() => {
      h.onStartShouldSetResponder(m.poser(x, y));
      h.onResponderGrant(m.poser(x, y));
      for (const [px, py] of chemin) {
        h.onResponderMove(m.bouger(px, py));
        const d = versMetres(px - x, py - y);
        vises.push({ x: original.transform[12] + d.x, z: original.transform[14] + d.z });
      }
    });
    const r = compter(() => act(() => h.onResponderRelease(m.lever())));
    // Un seul rendu de l'écran au lâcher, analyses comprises : le geste est
    // fini, rien ne sert d'attendre un cinquième de seconde pour les refaire.
    expect(r.de('ResultScreen')).toBe(1);
    const pose = useScanStore.getState().objects.find((o) => o.id === id)!;
    expect(useEnVol.getState().objet).toBeNull();

    // Un seul « Annuler » rend la place d'avant.
    act(() => useScanStore.getState().undo());
    expect(useScanStore.getState().objects.find((o) => o.id === id)!.transform).toEqual(original.transform);
    // La référence : l'ancien chemin, image par image, sur le même plan.
    act(() => {
      for (const v of vises) useScanStore.getState().setObjectCenter(id, v.x, v.z, true);
      const der = vises[vises.length - 1];
      useScanStore.getState().rangerMeuble(id, der.x, der.z);
    });
    const attendu = useScanStore.getState().objects.find((o) => o.id === id)!;
    expect(pose.transform).toEqual(attendu.transform);
    expect([pose.width, pose.depth, pose.roomId]).toEqual([attendu.width, attendu.depth, attendu.roomId]);
  });

  it('rougit dans le mur sans rendre le plan, et s’éteint au lâcher', () => {
    const tree = monter();
    const { id, h, x, y } = prendre(tree, 'meuble');
    const m = doigt();
    let rouge = false;
    const aplat = () =>
      tree.root.findAll((n) => n.props?.testID === `meuble-${id}`)[0].findAll((n) => n.props?.rx === 3)[0];
    act(() => {
      h.onStartShouldSetResponder(m.poser(x, y));
      h.onResponderGrant(m.poser(x, y));
    });
    const r = compter(() => {
      for (let i = 1; i <= 60 && !rouge; i++) {
        act(() => h.onResponderMove(m.bouger(x + i * 6, y)));
        rouge = useEnVol.getState().refuse;
      }
    });
    expect(rouge).toBe(true);
    expect(aplat().props.fill).toBe(light.danger);
    expect(r.de('FloorplanEditor')).toBe(0);
    act(() => h.onResponderRelease(m.lever()));
    expect(useEnVol.getState().refuse).toBe(false);
    expect(aplat().props.fill).not.toBe(light.danger);
  });
});

describe('pivoter et étirer un meuble', () => {
  it('le pivot ne rend ni l’écran ni le plan, et le cap est posé au lâcher', () => {
    const tree = monter(true);
    const { id, h, x, y } = prendre(tree, 'pivot');
    const cap = () => {
      const t = useScanStore.getState().objects.find((o) => o.id === id)!.transform;
      return Math.atan2(t[2], t[0]);
    };
    const cap0 = cap();
    const m = doigt();
    act(() => {
      h.onStartShouldSetResponder(m.poser(x, y));
      h.onResponderGrant(m.poser(x, y));
    });
    const r = compter(() => {
      for (let i = 1; i <= N; i++) act(() => h.onResponderMove(m.bouger(x + 10 + i * 3, y + 25 + i * 2)));
    });
    expect(`écran ${r.de('ResultScreen')}, plan ${r.de('FloorplanEditor')}`).toBe('écran 0, plan 0');
    const enVol = useEnVol.getState().objet!;
    expect(enVol.id).toBe(id);
    expect(cap()).toBeCloseTo(cap0, 6);
    act(() => h.onResponderRelease(m.lever()));
    expect(cap()).toBeCloseTo(Math.atan2(enVol.transform[2], enVol.transform[0]), 6);
    expect(cap()).not.toBeCloseTo(cap0, 2);
    // Un seul « Annuler » rend le cap d'avant.
    act(() => useScanStore.getState().undo());
    expect(cap()).toBeCloseTo(cap0, 6);
  });

  it('l’étirement ne rend ni l’écran ni le plan, et la barre suit la cote', () => {
    const tree = monter();
    const { id, h, x, y } = prendre(tree, 'etirer');
    const largeur = () => useScanStore.getState().objects.find((o) => o.id === id)!.width;
    const largeur0 = largeur();
    const m = doigt();
    act(() => {
      h.onStartShouldSetResponder(m.poser(x, y));
      h.onResponderGrant(m.poser(x, y));
    });
    const r = compter(() => {
      for (let i = 1; i <= 10; i++) act(() => h.onResponderMove(m.bouger(x - 12 - i * 2, y)));
    });
    expect(`écran ${r.de('ResultScreen')}, plan ${r.de('FloorplanEditor')}`).toBe('écran 0, plan 0');
    // La barre lit la cote en cours, pas celle d'avant le geste.
    const enCours = tree.root.findByType(ObjectBar).props.object as ObjectData;
    expect(enCours.width).not.toBeCloseTo(largeur0, 3);
    expect(largeur()).toBe(largeur0);
    act(() => h.onResponderRelease(m.lever()));
    expect(largeur()).toBeCloseTo(enCours.width, 6);
  });
});

describe('ce qui suit le meuble tenu, sans l’écran', () => {
  /*
    MIS À JOUR — le patron : « enlève le “rentre” lors de la sélection d'un
    meuble ». Un meuble qui tient dans sa pièce ne dit plus rien ; celui
    qu'on sort de la pièce dit de combien il dépasse, en direct, sans que
    l'écran se redessine.
  */
  it('plus de « Rentre ✓ » ; « Dépasse de … cm » suit le meuble tenu, sans l’écran', () => {
    const tree = monter();
    const st = useScanStore.getState();
    const meuble = st.objects.find((o) => o.category === 'table')!;
    act(() => editeur(tree).props.onSelectObject(meuble.id));
    const textes = () =>
      tree.root
        .findAll((n) => typeof n.props?.children === 'string')
        .map((n) => n.props.children as string);
    expect(textes().some((t) => t.startsWith('Rentre'))).toBe(false);
    // Étiré bien plus large que sa pièce : la puce d'alerte apparaît, et
    // l'écran ne bouge pas.
    const r = compter(() => act(() => mettreEnVol({ ...meuble, width: meuble.width + 20 })));
    expect(textes().some((x) => x.startsWith('Dépasse de'))).toBe(true);
    expect(r.de('ResultScreen')).toBe(0);
    act(() => mettreEnVol(null));
  });

  it('la porte rougit dès que le meuble tenu entre dans son battant', () => {
    const tree = monter();
    const st = useScanStore.getState();
    const meuble = st.objects.find((o) => o.category === 'table')!;
    act(() => editeur(tree).props.onSelectObject(meuble.id));
    const b = battantsDesPortes(st.openings, st.walls, st.rooms)[0];
    const t = [...meuble.transform];
    t[12] = (b.pivot.x + b.ferme.x + b.ouvert.x) / 3;
    t[14] = (b.pivot.z + b.ferme.z + b.ouvert.z) / 3;
    const dedans = { ...meuble, transform: t };
    // La géométrie le confirme : posé là, il bloquerait cette porte.
    expect(meublesQuiBloquent([b], [dedans]).has(b.id)).toBe(true);
    const rouges = () =>
      tree.root.findAll(
        (n) => typeof n.props?.d === 'string' && n.props.d.includes(' A ') && n.props.stroke === light.danger,
      ).length;
    const avant = rouges();
    const r = compter(() => act(() => mettreEnVol(dedans)));
    expect(rouges()).toBeGreaterThan(avant);
    expect(`écran ${r.de('ResultScreen')}, plan ${r.de('FloorplanEditor')}`).toBe('écran 0, plan 0');
    act(() => mettreEnVol(null));
    expect(rouges()).toBe(avant);
  });
});

describe('le plan lui-même', () => {
  for (const gros of [false, true]) {
    it(`se déplace sans aucun rendu, et ne se redessine qu’une fois au lâcher${gros ? ' — gros plan' : ''}`, () => {
      const tree = monter(gros);
      const h = editeur(tree).findAllByType(View)[0].props;
      const m = doigt();
      act(() => {
        h.onMoveShouldSetResponder(m.poser(200, 300));
        h.onResponderGrant(m.poser(200, 300));
      });
      const r = compter(() => {
        for (let i = 1; i <= N; i++) act(() => h.onResponderMove(m.bouger(212 + i * 2, 300 + i)));
      });
      expect(r.total).toBe(0);
      const murs = useScanStore.getState().walls.length;
      const l = compter(() => act(() => h.onResponderRelease(m.lever())));
      // Deux tracés par mur (le halo et le trait), une seule fois : un rendu.
      expect(l.de('WallBody')).toBe(2 * murs);
      expect(l.de('ResultScreen')).toBe(0);
    });
  }

  it('aucune 3D ne tourne derrière le plan', () => {
    const tree = monter();
    expect(tree.root.findAllByType(Iso3DView)).toHaveLength(0);
  });
});

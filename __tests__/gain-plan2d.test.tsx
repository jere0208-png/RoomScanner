/**
 * GAINS RAPIDES DU PLAN 2D — lot « plan2d » de la revue experte.
 *
 * 1. Mesurer, spots et notes : le point tombe sous le doigt (la toile du
 *    plan déborde du cadre de sa marge fixe : `locationX` est décalé).
 * 2. Les noms de pièces ne cachent plus le sens d'ouverture des portes.
 * 3. Des cotes toujours nettes : une seule famille à la fois, à 100 %.
 * 4. « Annuler » dit ce qu'il vient d'annuler.
 * 5. Un bouton « Recadrer » pour retrouver le plan droit et entier.
 * 6. « Mesurer » a sa propre icône.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import {
  battantsDuPlan,
  estRecadre,
  familleDesCotes,
  FloorplanEditor,
  margeFixeDeToile,
  SEUIL_GLOBALES,
  SEUIL_TRONCONS,
  vueDroiteDuPlan,
  type VuePlan,
} from '../src/components/FloorplanEditor';
import { ResultScreen } from '../src/screens/ResultScreen';
import { cleDuDernierRetour, useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';
import { direLeRetour, libelleDuGeste } from '../src/store/libelleDuGeste';
import { useAstuce } from '../src/ui/astuce';
import { SOLAIRES } from '../src/ui/solaires';
import { roomParts, type Pt, type WallSeg } from '../src/geometry/floorplan';
import {
  SNAPSHOT_FIXTURES,
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
  act(() => useAstuce.setState({ courante: null, file: [] }));
});

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

/*
  UN WC DE 1,60 × 1,20 m, sa porte de 90 cm au milieu du mur du haut : le
  battant s'ouvre dans la pièce et en couvre le milieu — là où le nom se
  posait d'office.
*/
const WC = [mur('n', 0, 0, 1.6, 0), mur('e', 1.6, 0, 1.6, 1.2), mur('s', 1.6, 1.2, 0, 1.2), mur('o', 0, 1.2, 0, 0)];
const PORTE: WallSeg = {
  id: 'p',
  type: 'door',
  a: { x: 0.35, z: 0 },
  b: { x: 1.25, z: 0 },
  height: 2.04,
  yCenter: 1.02,
  roomId: 'r1',
};

const LARGEUR = 390;
const HAUTEUR = 700;

function poserLeStore(walls: WallSeg[], openings: WallSeg[], nom = 'WC') {
  useScanStore.setState({
    walls,
    openings,
    objects: [],
    rooms: [{ id: 'r1', name: nom, floor: null }],
    fixtures: [],
    ceiling: [],
    photos: [],
    notes: [],
    showFurniture: true,
    showSurfaces: true,
  });
}

/** Monte l'éditeur et lui donne sa taille. */
function monterPlan(element: React.ReactElement) {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(element);
  });
  act(() => {
    t.root.findAllByType(View)[0].props.onLayout?.({
      nativeEvent: { layout: { width: LARGEUR, height: HAUTEUR } },
    });
  });
  arbre = t;
  return t;
}

const base = {
  showMeasures: true,
  editable: true,
  selectedWallId: null,
  onSelectWall: () => {},
};

/** Le point bleu du premier bout de la règle : là où le plan dessine `a`. */
const pointBleu = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Circle).find((n) => n.props.r === 5 && n.props.pointerEvents === 'none')!;

/** Le calque de capture plein cadre (le dernier posé : au-dessus de tout). */
const calqueDeCapture = (t: TestRenderer.ReactTestRenderer) => {
  const calques = t.root
    .findAllByType(Rect)
    .filter(
      (n) =>
        typeof n.props.onPress === 'function' &&
        n.props.width === LARGEUR &&
        n.props.height === HAUTEUR &&
        n.props.fill === 'transparent',
    );
  return calques[calques.length - 1];
};

/** Où la fenêtre place le cadre : la mesure que l'éditeur prend à la pose du doigt. */
function mesurerLeCadre(t: TestRenderer.ReactTestRenderer, origine: { x: number; y: number }) {
  const cadre = t.root.findAll(
    (n) => typeof n.type === 'string' && typeof n.props.onTouchStart === 'function',
  )[0];
  const mesurable = [cadre.parent, cadre].find(
    (n) => n?.instance && typeof n.instance.measureInWindow === 'function',
  );
  mesurable!.instance.measureInWindow = (rendre: (x: number, y: number) => void) =>
    rendre(origine.x, origine.y);
  return cadre;
}

/**
 * L'appui tel que l'iPhone le rapporte : `pageX` dans la fenêtre, et
 * `locationX` relatif à la vue TOUCHÉE — le SVG, dont la toile déborde du
 * cadre de sa marge fixe.
 */
function appui(cadreXY: { x: number; y: number }, origine: { x: number; y: number }) {
  const m = margeFixeDeToile(LARGEUR, HAUTEUR);
  return {
    nativeEvent: {
      pageX: cadreXY.x + origine.x,
      pageY: cadreXY.y + origine.y,
      locationX: cadreXY.x + m.g,
      locationY: cadreXY.y + m.h,
      touches: [],
    },
  };
}

describe('1. la règle, les spots et les notes tombent sous le doigt', () => {
  const ORIGINE = { x: 0, y: 120 };
  const VUES: VuePlan[] = [
    { zoom: 1, ox: 0, oy: 0, rot: 0 },
    { zoom: 2.5, ox: 40, oy: -30, rot: 0 },
    { zoom: 0.6, ox: -12, oy: 18, rot: 0.7 },
    { zoom: 1.8, ox: 0, oy: 0, rot: -1.2 },
  ];
  const VISE: Pt = { x: 2.1, z: 1.3 };

  it.each(VUES)('la règle mesure au centimètre près (zoom %#)', (vue) => {
    poserLeStore(SNAPSHOT_WALLS, SNAPSHOT_OPENINGS);
    const tap = jest.fn();
    const t = monterPlan(
      <FloorplanEditor {...base} vueInitiale={vue} regle={{ a: VISE, b: null }} onRegleTap={tap} />,
    );
    const cadre = mesurerLeCadre(t, ORIGINE);
    // Le doigt se pose là où le plan dessine le point visé.
    const q = { x: pointBleu(t).props.cx, y: pointBleu(t).props.cy };
    const e = appui(q, ORIGINE);
    act(() => cadre.props.onTouchStart(e));
    act(() => calqueDeCapture(t).props.onPress(e));
    expect(tap).toHaveBeenCalledTimes(1);
    const [p] = tap.mock.calls[0];
    expect(Math.hypot(p.x - VISE.x, p.z - VISE.z)).toBeLessThan(0.01);
  });

  it.each(VUES)('un spot, un point lumineux ou une note se pose sous le doigt (zoom %#)', (vue) => {
    poserLeStore(SNAPSHOT_WALLS, SNAPSHOT_OPENINGS);
    // Où le plan dessine le point visé : la règle le montre, puis on la range.
    const repere = monterPlan(
      <FloorplanEditor {...base} vueInitiale={vue} regle={{ a: VISE, b: null }} />,
    );
    const q = { x: pointBleu(repere).props.cx, y: pointBleu(repere).props.cy };
    act(() => repere.unmount());
    const pose = jest.fn();
    const t = monterPlan(<FloorplanEditor {...base} vueInitiale={vue} placing onPlaceAt={pose} />);
    const cadre = mesurerLeCadre(t, ORIGINE);
    const e = appui(q, ORIGINE);
    act(() => cadre.props.onTouchStart(e));
    act(() => calqueDeCapture(t).props.onPress(e));
    expect(pose).toHaveBeenCalledTimes(1);
    const [p] = pose.mock.calls[0];
    expect(Math.hypot(p.x - VISE.x, p.z - VISE.z)).toBeLessThan(0.01);
  });
});

describe('2. le nom de la pièce laisse voir le battant de la porte', () => {
  it('battantsDuPlan : le quart de cercle, du côté de la pièce', () => {
    const parts = roomParts(WC, [{ id: 'r1', name: 'WC' }] as never);
    const partOf = new Map(parts.map((p) => [p.roomId, p]));
    const [coins] = battantsDuPlan([PORTE], partOf);
    expect(coins).toHaveLength(4);
    const zs = coins.map((c) => c.z);
    // Le battant s'ouvre DANS la pièce (z positif), de toute la largeur du vantail.
    expect(Math.min(...zs)).toBeCloseTo(0, 6);
    expect(Math.max(...zs)).toBeCloseTo(0.9, 6);
    // Une fenêtre, une porte de garage ou de placard n'ont pas de battant à garder.
    expect(battantsDuPlan([{ ...PORTE, type: 'window' }], partOf)).toHaveLength(0);
    expect(battantsDuPlan([{ ...PORTE, placard: true } as WallSeg], partOf)).toHaveLength(0);
  });

  it('dans un WC, le cartouche ne se pose pas sur le battant', () => {
    poserLeStore(WC, [PORTE]);
    /*
      Le cadrage du plan, relevé par le point bleu de la règle en trois
      points du monde : il est affine (zoom, rotation, déplacement).
    */
    const ou = (p: Pt) => {
      const t = monterPlan(<FloorplanEditor {...base} regle={{ a: p, b: null }} />);
      const c = pointBleu(t);
      const r = { x: c.props.cx as number, y: c.props.cy as number };
      act(() => t.unmount());
      arbre = null;
      return r;
    };
    const o = ou({ x: 0, z: 0 });
    const ux = ou({ x: 1, z: 0 });
    const uz = ou({ x: 0, z: 1 });
    const versPx = (p: Pt) => ({
      x: o.x + p.x * (ux.x - o.x) + p.z * (uz.x - o.x),
      y: o.y + p.x * (ux.y - o.y) + p.z * (uz.y - o.y),
    });
    const t = monterPlan(<FloorplanEditor {...base} />);
    // Le nom est bien écrit…
    const mots = t.root.findAllByType(SvgText).map((n) => [].concat(n.props.children).join(''));
    expect(mots.some((m) => m === 'WC')).toBe(true);
    // … et sa boîte ne mord pas sur celle du battant.
    const cartouche = t.root.findAllByType(Rect).find((n) => n.props.rx === 5 && n.props.width >= 40)!;
    expect(cartouche).toBeDefined();
    const bx = { x0: cartouche.props.x, y0: cartouche.props.y, x1: cartouche.props.x + cartouche.props.width, y1: cartouche.props.y + cartouche.props.height };
    const coins = [
      { x: 0.35, z: 0 },
      { x: 1.25, z: 0 },
      { x: 0.35, z: 0.9 },
      { x: 1.25, z: 0.9 },
    ].map(versPx);
    const battant = {
      x0: Math.min(...coins.map((c) => c.x)),
      x1: Math.max(...coins.map((c) => c.x)),
      y0: Math.min(...coins.map((c) => c.y)),
      y1: Math.max(...coins.map((c) => c.y)),
    };
    const mord = bx.x0 < battant.x1 && battant.x0 < bx.x1 && bx.y0 < battant.y1 && battant.y0 < bx.y1;
    expect(mord).toBe(false);
  });
});

describe('3. des cotes toujours nettes', () => {
  it('une bascule nette, avec une marge : jamais de fondu', () => {
    expect(SEUIL_GLOBALES).toBeLessThan(SEUIL_TRONCONS);
    // De loin, les globales ; de près, les tronçons.
    expect(familleDesCotes(30, 0)).toBe(0);
    expect(familleDesCotes(30, 1)).toBe(0);
    expect(familleDesCotes(120, 0)).toBe(1);
    expect(familleDesCotes(120, 1)).toBe(1);
    // Entre les deux seuils, la famille d'avant reste : un zoom qui hésite ne clignote pas.
    const entre = (SEUIL_GLOBALES + SEUIL_TRONCONS) / 2;
    expect(familleDesCotes(entre, 0)).toBe(0);
    expect(familleDesCotes(entre, 1)).toBe(1);
    expect(familleDesCotes(SEUIL_TRONCONS, 0)).toBe(1);
    expect(familleDesCotes(SEUIL_GLOBALES, 1)).toBe(0);
  });

  it('à tout zoom, un seul jeu de cotes s’affiche, à pleine opacité', () => {
    poserLeStore(SNAPSHOT_WALLS, SNAPSHOT_OPENINGS);
    for (const zoom of [1, 1.5, 2, 2.5, 3, 4, 6]) {
      const t = monterPlan(<FloorplanEditor {...base} editable={false} vueInitiale={{ zoom, ox: 0, oy: 0, rot: 0 }} />);
      const mots = t.root.findAllByType(SvgText).map((n) => [].concat(n.props.children).join(''));
      const globales = mots.filter((m) => /^\d+,\d\d m$/.test(m));
      const troncons = mots.filter((m) => /^\d+,\d\d$/.test(m));
      expect(globales.length > 0 && troncons.length > 0).toBe(false);
      // Aucun groupe à demi effacé : les opacités valent 0 ou 1.
      const fantomes = t.root
        .findAll((n) => typeof n.props.opacity === 'number' && n.findAllByType(SvgText).some((x) => /^\d+,\d\d( m)?$/.test([].concat(x.props.children).join(''))))
        .filter((n) => n.props.opacity > 0.02 && n.props.opacity < 0.98);
      expect(fantomes).toHaveLength(0);
      act(() => t.unmount());
      arbre = null;
    }
  });
});

describe('4. « Annuler » dit ce qu’il vient d’annuler', () => {
  it('libellés : la clé du geste, traduite ; une clé inconnue reste prudente', () => {
    expect(libelleDuGeste('setWallLength:mur-3')).toBe('longueur du mur');
    expect(libelleDuGeste('epaisseur:mur-3')).toBe('épaisseur du mur');
    expect(libelleDuGeste('teinte-o1')).toBe('teinte');
    expect(libelleDuGeste('removeWall')).toBe('suppression du mur');
    expect(libelleDuGeste('inventé:x')).toBe('dernière retouche');
    expect(libelleDuGeste('')).toBe('dernière retouche');
  });

  it('le magasin garde la clé du geste, sans l’écrire dans son état', () => {
    act(() => {
      poserLeStore(WC, []);
      useScanStore.setState({ canUndo: false, canRedo: false });
    });
    act(() => useScanStore.getState().removeWall('e'));
    expect(useScanStore.getState().walls.some((w) => w.id === 'e')).toBe(false);
    act(() => useScanStore.getState().undo());
    expect(useScanStore.getState().walls.some((w) => w.id === 'e')).toBe(true);
    expect(cleDuDernierRetour()).toBe('removeWall');
    expect('cle' in useScanStore.getState()).toBe(false);
    act(() => useScanStore.getState().redo());
    expect(cleDuDernierRetour()).toBe('removeWall');
    expect('cle' in useScanStore.getState()).toBe(false);
    // Plus rien à défaire au-delà : rien à dire.
    act(() => {
      useScanStore.getState().undo();
      while (useScanStore.getState().canUndo) useScanStore.getState().undo();
      useScanStore.getState().undo();
    });
    expect(cleDuDernierRetour()).toBeNull();
  });

  it('le mot passe, et trois appuis ne laissent que le dernier', () => {
    act(() => direLeRetour('annule', 'setWallLength:m1'));
    expect(useAstuce.getState().courante?.texte).toBe('Annulé : longueur du mur');
    act(() => direLeRetour('annule', 'epaisseur:m1'));
    act(() => direLeRetour('retabli', 'epaisseur:m1'));
    expect(useAstuce.getState().courante?.texte).toBe('Rétabli : épaisseur du mur');
    expect(useAstuce.getState().file).toHaveLength(0);
    // Rien à défaire : pas de mot.
    act(() => useAstuce.setState({ courante: null, file: [] }));
    act(() => direLeRetour('annule', null));
    expect(useAstuce.getState().courante).toBeNull();
  });

  it('une astuce d’une autre famille ne se fait pas écraser', () => {
    act(() => useAstuce.getState().poser({ texte: 'Plan enregistré.' }));
    act(() => direLeRetour('annule', 'removeWall'));
    act(() => direLeRetour('annule', 'addWall'));
    expect(useAstuce.getState().courante?.texte).toBe('Plan enregistré.');
    expect(useAstuce.getState().file.map((a) => a.texte)).toEqual(['Annulé : ajout du mur']);
  });
});

describe('5. « Recadrer » remet le plan droit et entier', () => {
  const PENCHE = [
    mur('a', 0, 0, 4 * Math.cos(0.3), 4 * Math.sin(0.3)),
    mur('b', 4 * Math.cos(0.3), 4 * Math.sin(0.3), 4 * Math.cos(0.3) - 3 * Math.sin(0.3), 4 * Math.sin(0.3) + 3 * Math.cos(0.3)),
    mur('c', 4 * Math.cos(0.3) - 3 * Math.sin(0.3), 4 * Math.sin(0.3) + 3 * Math.cos(0.3), -3 * Math.sin(0.3), 3 * Math.cos(0.3)),
    mur('d', -3 * Math.sin(0.3), 3 * Math.cos(0.3), 0, 0),
  ];

  it('la vue droite redresse les murs, et se reconnaît', () => {
    const droite = vueDroiteDuPlan(PENCHE);
    expect(droite.zoom).toBe(1);
    expect(droite.rot).toBeCloseTo(-0.3, 3);
    expect(estRecadre(droite, droite)).toBe(true);
    expect(estRecadre({ ...droite, zoom: 1.4 }, droite)).toBe(false);
    expect(estRecadre({ ...droite, ox: 20 }, droite)).toBe(false);
    expect(estRecadre({ ...droite, rot: droite.rot + 0.01 }, droite)).toBe(false);
    // Un tour complet, c'est la même vue.
    expect(estRecadre({ ...droite, rot: droite.rot + 2 * Math.PI }, droite)).toBe(true);
  });

  it('plan déplacé : la commande paraît, et un appui le remet d’aplomb', () => {
    poserLeStore(PENCHE, []);
    const recadreur = jest.fn();
    const vue = jest.fn();
    monterPlan(
      <FloorplanEditor
        {...base}
        vueInitiale={{ zoom: 2.2, ox: 35, oy: -50, rot: 0.4 }}
        onView={vue}
        onRecadreur={recadreur}
      />,
    );
    const derniere = () => recadreur.mock.calls[recadreur.mock.calls.length - 1][0];
    expect(typeof derniere()).toBe('function');
    act(() => derniere()());
    const posee = vue.mock.calls[vue.mock.calls.length - 1][0] as VuePlan;
    expect(estRecadre(posee, vueDroiteDuPlan(PENCHE))).toBe(true);
    // Recadré : plus rien à recadrer.
    expect(derniere()).toBeNull();
  });

  it('plan déjà droit : pas de commande', () => {
    poserLeStore(PENCHE, []);
    const recadreur = jest.fn();
    monterPlan(<FloorplanEditor {...base} vueInitiale={vueDroiteDuPlan(PENCHE)} onRecadreur={recadreur} />);
    expect(recadreur.mock.calls.every((c) => c[0] === null)).toBe(true);
  });
});

describe('5 et 6. la rangée du haut de l’écran du plan', () => {
  function monterEcran() {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useUsage.setState({ modeElec: false });
      useScanStore.setState({
        screen: 'result',
        scanName: 'Chantier',
        walls: SNAPSHOT_WALLS,
        openings: SNAPSHOT_OPENINGS,
        objects: SNAPSHOT_OBJECTS,
        rooms: SNAPSHOT_ROOMS.map((r, i) => ({ id: r.id, name: `Pièce ${i + 1}`, floor: null })),
        fixtures: SNAPSHOT_FIXTURES,
        ceiling: [],
        photos: [],
        notes: [],
      });
      t = TestRenderer.create(<ResultScreen />);
    });
    arbre = t;
    return t;
  }
  const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
    t.root.findAllByType(TouchableOpacity).find((b) => b.props.accessibilityLabel === label);
  const motsDe = (n: TestRenderer.ReactTestInstance) =>
    n.findAllByType(Text).map((x) => [].concat(x.props.children).join(''));

  it('« Mesurer » porte sa propre icône, plus la règle des cotes', () => {
    expect(SOLAIRES.cotes3d).not.toBe(SOLAIRES.ruler);
    const t = monterEcran();
    const mesurer = bouton(t, 'Mesurer');
    expect(mesurer).toBeDefined();
    const traces = mesurer!.findAllByType(Path).map((p) => p.props.d);
    expect(traces).toContain(SOLAIRES.cotes3d);
    expect(traces).not.toContain(SOLAIRES.ruler);
    // Toujours sans mot : la rangée tient dans un téléphone (`pointsacorriger`).
    expect(motsDe(mesurer!)).toEqual([]);
  });

  it('« Recadrer » ne paraît que plan déplacé, et recadre d’un appui', () => {
    const t = monterEcran();
    expect(bouton(t, 'Recadrer')).toBeUndefined();
    const plan = t.root.findByType(FloorplanEditor);
    const recadrer = jest.fn();
    act(() => plan.props.onRecadreur(recadrer));
    const b = bouton(t, 'Recadrer');
    expect(b).toBeDefined();
    act(() => b!.props.onPress());
    expect(recadrer).toHaveBeenCalledTimes(1);
    act(() => plan.props.onRecadreur(null));
    expect(bouton(t, 'Recadrer')).toBeUndefined();
  });
});

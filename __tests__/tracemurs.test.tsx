/**
 * TRACER DES MURS, COIN APRÈS COIN — relevé du patron : « le plus difficile
 * pour moi dans l'app est d'ajouter un mur exactement là où on le souhaite ;
 * il est difficile de structurer une pièce à partir de rien, en ajoutant des
 * murs ». Le banc joue le geste comme le pouce le ferait :
 *   — la visée (`viser`) : refermer, s'accrocher à un coin, à un mur, à
 *     l'équerre, à 45°, au centimètre — ou rien, aimant coupé ;
 *   — le magasin (`poserLeTrace`) : une pièce tracée seule se cote au nu,
 *     une pièce en L, une cloison qui divise, un mur soudé sans fente ;
 *   — l'éditeur : un appui pose un coin, un glissé lève le réticule ;
 *   — l'écran du plan, de bout en bout : plan vierge → « Tracer les murs au
 *     doigt » → un rectangle aux cotes tapées → 12,00 m² ; une cloison de mur
 *     à mur ; « Annuler » coin par coin.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Rect } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { roomParts, type Pt, type WallSeg } from '../src/geometry/floorplan';
import { angleEntre, pointALaLongueur, viser, type Visee } from '../src/geometry/traceMurs';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { ResultScreen } from '../src/screens/ResultScreen';
import { ActionSheet, PromptSheet } from '../src/components/Sheet';
import { consigneDuTrace } from '../src/components/TraceMursBar';

const st = () => useScanStore.getState();
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});
const proche = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});
// Les feuilles qui descendent finissent leur animation avant le démontage de Jest.
afterAll(() => new Promise((r) => setTimeout(r, 600)));
beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  useScanStore.setState({ saves: [], currentSaveId: null });
});

describe('la visée : où tombe le coin', () => {
  const PIECE = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3)];

  it('referme la pièce sur le premier coin', () => {
    const coins = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }];
    const v = viser({ x: 0.08, z: 0.05 }, coins, [], 0.15);
    expect(v.accroche).toBe('premier');
    expect(v.p).toEqual({ x: 0, z: 0 });
  });

  it('s’accroche à un coin existant, puis à un mur (jonction en T)', () => {
    const c = viser({ x: 3.92, z: 2.94 }, [{ x: 1, z: 1 }], PIECE, 0.15);
    expect(c.accroche).toBe('coin');
    expect(c.p).toEqual({ x: 4, z: 3 });
    const m = viser({ x: 2.07, z: 0.06 }, [{ x: 2, z: 2 }], PIECE, 0.15);
    expect(m.accroche).toBe('mur');
    proche(m.p.z, 0);
    proche(m.p.x, 2.07);
    expect(m.murId).toBe('n');
  });

  it('se met à l’équerre du mur précédent, au centimètre, et dit la longueur et l’angle', () => {
    const coins = [{ x: 0, z: 0 }, { x: 4, z: 0 }];
    const v = viser({ x: 4.12, z: 2.954 }, coins, [], 0.05);
    expect(v.accroche).toBe('equerre');
    proche(v.p.x, 4);
    expect(v.longueur).toBeCloseTo(2.96, 6);
    expect(Math.round(v.angle!)).toBe(90);
  });

  it('se met à 45°, et ne touche à rien aimant coupé', () => {
    const coins = [{ x: 0, z: 0 }, { x: 4, z: 0 }];
    const b = viser({ x: 5.05, z: 0.95 }, coins, [], 0.05);
    expect(b.accroche).toBe('biais');
    proche(b.p.x - 4, b.p.z, 1e-9);
    const libre = viser({ x: 4.12, z: 2.954 }, coins, PIECE, 0.5, false);
    expect(libre.accroche).toBeNull();
    expect(libre.p.x).toBeGreaterThan(4.05);
  });

  it('la cote tapée : vers la droite au premier mur, puis à l’équerre dans le sens du tour', () => {
    let coins: Pt[] = [{ x: 0, z: 0 }];
    coins = [...coins, pointALaLongueur(coins, 4, null)!];
    coins = [...coins, pointALaLongueur(coins, 3, null)!];
    coins = [...coins, pointALaLongueur(coins, 4, null)!];
    expect(coins.map((p) => [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100])).toEqual([
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ]);
    expect(angleEntre(coins[0], coins[1], coins[2])).toBeCloseTo(90, 6);
  });
});

describe('le magasin : ce que devient le tracé', () => {
  beforeEach(() => st().commencerAuClavier());

  it('une pièce tracée seule se cote au nu : 4 × 3 font 12,00 m²', () => {
    const r = st().poserLeTrace([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }], { ferme: true });
    expect(r?.roomId).toBeTruthy();
    const p = roomParts(st().walls, st().rooms).find((x) => x.roomId === r!.roomId)!;
    expect(p.surface?.exact).toBe(true);
    proche(p.surface!.area, 12, 1e-6);
    expect(st().walls).toHaveLength(4);
    // Un seul « Annuler » la retire.
    st().undo();
    expect(st().walls).toHaveLength(0);
  });

  it('une pièce en L', () => {
    st().poserLeTrace(
      [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 4 }, { x: 0, z: 4 }],
      { ferme: true },
    );
    const parts = roomParts(st().walls, st().rooms);
    expect(parts).toHaveLength(1);
    proche(parts[0].surface!.area, 14, 1e-6);
  });

  it('un contour croisé ne fait pas de pièce', () => {
    expect(st().poserLeTrace([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 3 }, { x: 4, z: 3 }], { ferme: true })).toBeNull();
    expect(st().walls).toHaveLength(0);
  });

  it('une cloison de mur à mur divise la pièce', () => {
    st().poserLeTrace([{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }], { ferme: true });
    const avant = st().rooms.length;
    // Les axes des murs : la cloison va de l'axe nord à l'axe sud.
    const nord = st().walls.find((w) => Math.abs(w.a.z - w.b.z) < 1e-9 && w.a.z < 0)!;
    const sud = st().walls.find((w) => Math.abs(w.a.z - w.b.z) < 1e-9 && w.a.z > 4)!;
    st().poserLeTrace([{ x: 2.5, z: nord.a.z }, { x: 2.5, z: sud.a.z }], { ferme: false, epaisseur: 0.07 });
    expect(st().rooms.length).toBe(avant + 1);
  });

  it('un mur accroché à un coin existant s’y soude, sans fente', () => {
    st().poserLeTrace([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }], { ferme: true });
    const coin = st().walls[1].b;
    st().poserLeTrace([coin, { x: coin.x + 2, z: coin.z }], { ferme: false });
    const neuf = st().walls[st().walls.length - 1];
    const bouts = [neuf.a, neuf.b];
    expect(bouts.some((p) => Math.hypot(p.x - coin.x, p.z - coin.z) < 1e-9)).toBe(true);
  });
});

describe('l’éditeur : le doigt', () => {
  const monter = (coins: Pt[], walls: WallSeg[] = [], recu: Visee[] = []) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({ walls, openings: [], objects: [], rooms: [], fixtures: [], ceiling: [], photos: [], notes: [], niveauCourant: 0 });
      t = TestRenderer.create(
        <FloorplanEditor
          showMeasures
          editable
          selectedWallId={null}
          onSelectWall={() => {}}
          traceMurs={{ coins, aimant: true }}
          onTraceCoin={(v) => recu.push(v)}
        />,
      );
    });
    act(() => {
      const zone = t.root.findAllByType(View).find((n) => typeof n.props.onLayout === 'function')!;
      zone.props.onLayout({ nativeEvent: { layout: { width: 600, height: 480 } } });
    });
    arbre = t;
    return t;
  };
  const capture = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAllByType(Rect).find((n) => n.props.accessibilityLabel === 'Tracer un mur')!;
  const evt = (x: number, y: number) => ({ nativeEvent: { pageX: x, pageY: y } });
  const appuyer = (t: TestRenderer.ReactTestRenderer, x: number, y: number, vers?: [number, number]) => {
    act(() => capture(t).props.onPressIn(evt(x, y)));
    if (vers) act(() => capture(t).props.onResponderMove(evt(vers[0], vers[1])));
    const [fx, fy] = vers ?? [x, y];
    act(() => capture(t).props.onPressOut(evt(fx, fy)));
  };

  it('un appui pose un coin ; les suivants se mettent à l’équerre ; le premier coin referme', () => {
    const recu: Visee[] = [];
    let coins: Pt[] = [];
    const etape = (x: number, y: number) => {
      const t = monter(coins, [], recu);
      appuyer(t, x, y);
      act(() => t.unmount());
      arbre = null;
      const v = recu[recu.length - 1];
      if (v.accroche !== 'premier') coins = [...coins, v.p];
      return v;
    };
    etape(100, 100);
    const v1 = etape(400, 104);
    expect(['equerre', 'aligne']).toContain(v1.accroche);
    proche(v1.p.z, coins[0].z, 1e-9);
    const v2 = etape(403, 300);
    expect(['equerre', 'aligne']).toContain(v2.accroche);
    proche(v2.p.x, coins[1].x, 1e-9);
    const v3 = etape(97, 302);
    // Le dernier coin tombe d'aplomb du premier : le mur qui referme est droit.
    expect(v3.accroche).toBe('aligne');
    proche(v3.p.x, coins[0].x, 1e-9);
    const ferme = etape(102, 99);
    expect(ferme.accroche).toBe('premier');
    // Le rectangle tracé au doigt fait une pièce fermée, d'équerre.
    act(() => st().commencerAuClavier());
    const r = st().poserLeTrace(coins, { ferme: true });
    const p = roomParts(st().walls, st().rooms).find((x) => x.roomId === r!.roomId)!;
    const L = Math.hypot(coins[1].x - coins[0].x, coins[1].z - coins[0].z);
    const H = Math.hypot(coins[2].x - coins[1].x, coins[2].z - coins[1].z);
    expect(p.surface?.exact).toBe(true);
    proche(p.surface!.area, L * H, 1e-6);
  });

  it('un doigt qui glisse lève le réticule au-dessus de lui : le coin tombe sous le réticule, pas sous le pouce', () => {
    const recu: Visee[] = [];
    const t = monter([], [], recu);
    // Glissé jusqu'en (300, 300) : le coin tombe 64 points plus haut.
    appuyer(t, 280, 300, [300, 300]);
    act(() => t.unmount());
    arbre = null;
    const t2 = monter([], [], recu);
    appuyer(t2, 300, 236);
    const [leve, direct] = recu;
    proche(leve.p.x, direct.p.x, 0.011);
    proche(leve.p.z, direct.p.z, 0.011);
  });

  it('le calque dit à quoi l’on s’accroche, et un mur existant reçoit le coin', () => {
    const recu: Visee[] = [];
    const t = monter([{ x: 0, z: -1.5 }], [mur('n', -2, 0, 2, 0)], recu);
    const calque = t.root.find((n) => typeof n.props?.onCoin === 'function' && Array.isArray(n.props?.coins));
    const surLeMur = calque.props.mapping.toPx({ x: 0.5, z: 0.02 });
    appuyer(t, surLeMur.x, surLeMur.y);
    expect(recu[0].accroche).toBe('mur');
    proche(recu[0].p.z, 0, 1e-9);
  });
});

describe('l’écran du plan, de bout en bout', () => {
  const ecran = () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<ResultScreen />);
    });
    arbre = t;
    return t;
  };
  const dimensionner = (t: TestRenderer.ReactTestRenderer) =>
    act(() => {
      for (const n of t.root.findAllByType(View)) {
        if (typeof n.props.onLayout === 'function') {
          n.props.onLayout({ nativeEvent: { layout: { width: 390, height: 560 } } });
        }
      }
    });
  const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
    t.root.findAll((n) => n.type === TouchableOpacity && n.props.accessibilityLabel === label)[0];
  /** La feuille d'actions ouverte (l'écran en a plusieurs, une seule porte des données). */
  const feuilleOuverte = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAllByType(ActionSheet).map((n) => n.props.data).find((d) => !!d) ?? null;
  const calque = (t: TestRenderer.ReactTestRenderer) =>
    t.root.find((n) => typeof n.props?.onCoin === 'function' && Array.isArray(n.props?.coins) && n.type !== Rect);
  const poser = (t: TestRenderer.ReactTestRenderer, p: Pt, accroche: Visee['accroche'] = null) =>
    act(() => calque(t).props.onCoin({ p, accroche, longueur: null, angle: null }));
  const taper = (t: TestRenderer.ReactTestRenderer, valeur: string, suivant = true) => {
    act(() => bouton(t, 'Taper une cote').props.onPress());
    const menu = feuilleOuverte(t);
    if (menu) act(() => menu.actions[suivant ? 0 : 1].onPress());
    const data = t.root.findByType(PromptSheet).props.data;
    act(() => data.onSubmit(valeur));
    act(() => t.root.findByType(PromptSheet).props.onClose());
  };

  it('plan vierge → « Tracer les murs au doigt » → un rectangle aux cotes tapées : 12,00 m², nommé', () => {
    st().commencerAuClavier();
    const t = ecran();
    act(() => bouton(t, 'Tracer les murs au doigt').props.onPress());
    dimensionner(t);
    expect(calque(t).props.coins).toEqual([]);
    poser(t, { x: 0, z: 0 });
    expect(consigneDuTrace(calque(t).props.coins.length)).toMatch(/coin suivant/);
    taper(t, '4');
    taper(t, '3');
    taper(t, '4');
    expect(calque(t).props.coins).toHaveLength(4);
    act(() => bouton(t, 'Fermer la pièce').props.onPress());
    expect(st().rooms).toHaveLength(1);
    expect(st().rooms[0].name).toBeTruthy();
    const p = roomParts(st().walls, st().rooms)[0];
    proche(p.surface!.area, 12, 1e-6);
    // Le tracé repart à vide, prêt pour la pièce suivante.
    expect(calque(t).props.coins).toEqual([]);
  });

  it('« Corriger le dernier mur » : le coin glisse dans l’axe à la cote tapée', () => {
    st().commencerAuClavier();
    const t = ecran();
    act(() => bouton(t, 'Tracer les murs au doigt').props.onPress());
    dimensionner(t);
    poser(t, { x: 0, z: 0 });
    poser(t, { x: 3.87, z: 0 });
    taper(t, '4,12', false);
    const [a, b] = calque(t).props.coins;
    proche(Math.hypot(b.x - a.x, b.z - a.z), 4.12, 1e-9);
    proche(b.z, 0, 1e-9);
  });

  it('« Annuler » retire les coins un à un', () => {
    st().commencerAuClavier();
    const t = ecran();
    act(() => bouton(t, 'Tracer les murs au doigt').props.onPress());
    dimensionner(t);
    poser(t, { x: 0, z: 0 });
    poser(t, { x: 2, z: 0 });
    poser(t, { x: 2, z: 2 });
    act(() => bouton(t, 'Annuler le dernier coin').props.onPress());
    expect(calque(t).props.coins).toHaveLength(2);
    act(() => bouton(t, 'Annuler le dernier coin').props.onPress());
    act(() => bouton(t, 'Annuler le dernier coin').props.onPress());
    expect(calque(t).props.coins).toHaveLength(0);
    expect(st().walls).toHaveLength(0);
  });

  it('une cloison : un coin sur un mur, un coin sur l’autre — elle se pose seule et divise la pièce', () => {
    st().commencerAuClavier();
    st().poserLeTrace([{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }], { ferme: true });
    const nord = st().walls.find((w) => Math.abs(w.a.z - w.b.z) < 1e-9 && w.a.z < 0)!;
    const sud = st().walls.find((w) => Math.abs(w.a.z - w.b.z) < 1e-9 && w.a.z > 4)!;
    const t = ecran();
    dimensionner(t);
    // Le mode s'ouvre depuis les options du plan : « Tracer des murs ».
    const options = t.root.findAll((n) => n.props?.accessibilityLabel === 'Options du plan' && typeof n.props.onPress === 'function')[0];
    act(() => options.props.onPress());
    const feuille = feuilleOuverte(t);
    const tracer = feuille?.actions?.find((x: { label?: string }) => x.label === 'Tracer des murs');
    expect(tracer).toBeTruthy();
    act(() => tracer.onPress());
    for (const n of t.root.findAllByType(ActionSheet)) if (n.props.data) act(() => n.props.onClose?.());
    dimensionner(t);
    const avant = st().rooms.length;
    poser(t, { x: 2.5, z: nord.a.z }, 'mur');
    poser(t, { x: 2.5, z: sud.a.z }, 'mur');
    expect(st().rooms.length).toBe(avant + 1);
    // Le tracé est reparti à vide : on peut en poser une autre.
    expect(calque(t).props.coins).toEqual([]);
  });

  it('« Terminer » pose ce qui est tracé : rien n’est perdu', () => {
    st().commencerAuClavier();
    const t = ecran();
    act(() => bouton(t, 'Tracer les murs au doigt').props.onPress());
    dimensionner(t);
    poser(t, { x: 0, z: 0 });
    poser(t, { x: 3, z: 0 });
    poser(t, { x: 3, z: 2 });
    act(() => bouton(t, 'Terminer le tracé').props.onPress());
    expect(st().walls).toHaveLength(2);
  });
});

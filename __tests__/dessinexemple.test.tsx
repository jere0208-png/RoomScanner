/**
 * LE PLAN DE L'EXEMPLE, TEL QU'ON LE VOIT — revue des six testeurs
 * (captures clair-11, plan 2D, et clair-23, aperçu du PDF).
 *
 * Quatre constats, et ce banc les tient sur le plan d'exemple, à plusieurs
 * cadrages (iPhone SE, iPhone, tablette, la vignette de l'aperçu du PDF),
 * en lecture et en édition :
 *
 *   1. UNE SURFACE NE DISPARAÎT JAMAIS — « Salle d'eau » sans ses m² à
 *      l'écran, « Entrée » sans les siens dans l'aperçu. Le nom s'abrège
 *      (« SdE », plus « Salle d'… ») ou le cartouche sort de sa pièce avec un
 *      trait de rappel ; la surface reste.
 *   2. AUCUNE COTE SUR UN MEUBLE NI UNE MENUISERIE — « 3,60 m » sur le
 *      canapé, « 2,93 m » sur les WC, « 4,93 m » sur le trait des fenêtres.
 *   3. LES PORTES ONT LEUR ARC — elles se dessinaient comme des trous.
 *   4. PAS DE SEMIS DE POINTS EN LECTURE — « ça fait brouillon / debug ».
 *
 * Les boîtes des meubles et des baies sont relevées SUR LE DESSIN (leur
 * transformation, leurs traits), pas recalculées comme le fait l'arbitre :
 * une sonde qui partagerait le calcul qu'elle contrôle ne verrait rien.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import { appartementExemple } from '../src/data/exemple';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';

type R = TestRenderer.ReactTestRenderer;
interface Bte {
  txt: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

let arbre: R | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function plan(w: number, h: number, edition: boolean): R {
  act(() => {
    useScanStore.getState().reset();
    useScanStore.getState().ouvrirExemple();
    useScanStore.setState({ showFurniture: true, showSurfaces: true });
  });
  let t!: R;
  act(() => {
    t = TestRenderer.create(
      <FloorplanEditor editable={edition} showMeasures selectedWallId={null} onSelectWall={() => {}} />,
    );
  });
  act(() => {
    const zone = t.root.findAllByType(View).find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: w, height: h } } });
  });
  arbre = t;
  return t;
}

const texteDe = (n: TestRenderer.ReactTestInstance) =>
  Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '');

/** Les cotes écrites, avec l'emprise que l'œil voit (rotation comprise). */
const cotes = (t: R): Bte[] =>
  t.root
    .findAllByType(SvgText)
    .map((n) => ({ n, txt: texteDe(n) }))
    .filter(({ txt }) => /^\d+,\d{2}( m)?$/.test(txt))
    .map(({ n, txt }) => {
      const f = Number(n.props.fontSize ?? 10);
      const m = /rotate\(\s*(-?[\d.]+)/.exec(String(n.props.transform ?? ''));
      const deg = m ? parseFloat(m[1]) : 0;
      const r = (Math.abs(deg) * Math.PI) / 180;
      const l = txt.length * f * 0.55;
      // La hauteur d'un chiffre, pas de la police : voir `plaqueDeCote`.
      const hc = f * 0.72;
      const w = l * Math.cos(r) + hc * Math.sin(r);
      const h = l * Math.sin(r) + hc * Math.cos(r);
      const x = Number(n.props.x);
      const y = Number(n.props.y);
      // Le centre de la plaque : le texte est posé 3,5 points sous lui.
      const cx = x;
      const cy = deg !== 0 ? y : y - 3.4;
      return { txt, x: cx - w / 2, y: cy - h / 2, w, h };
    });

const boiteDe = (pts: { x: number; y: number }[], txt: string): Bte => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { txt, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

/** Les meubles dessinés (tapis exceptés : on écrit dessus comme sur le sol). */
const meubles = (t: R): Bte[] => {
  const tapis = new Set(
    useScanStore
      .getState()
      .objects.filter((o) => o.category === 'tapis')
      .map((o) => `meuble-${o.id}`),
  );
  return t.root
    .findAllByType(G)
    .filter((n) => String(n.props.testID ?? '').startsWith('meuble-'))
    .filter((g) => !tapis.has(g.props.testID))
    .map((g) => {
      const m = /translate\(\s*([-\d.e]+),\s*([-\d.e]+)\)\s*rotate\(\s*([-\d.e]+)/.exec(String(g.props.transform));
      if (!m) throw new Error(`transformation illisible : ${g.props.transform}`);
      const rect = g.findAllByType(Rect)[0];
      const [cx, cy, deg] = [m![1], m![2], m![3]].map(Number);
      const a = (deg * Math.PI) / 180;
      const hw = Number(rect.props.width) / 2;
      const hd = Number(rect.props.height) / 2;
      const coins = [
        [1, 1],
        [1, -1],
        [-1, -1],
        [-1, 1],
      ].map(([i, j]) => ({
        x: cx + i * hw * Math.cos(a) - j * hd * Math.sin(a),
        y: cy + i * hw * Math.sin(a) + j * hd * Math.cos(a),
      }));
      return boiteDe(coins, g.props.testID);
    });
};

/** Les points d'un arc de porte : pivot, bout du battant, autre tableau. */
const pointsDuChemin = (d: string) => {
  const nb = (d.match(/-?[\d.]+(e-?\d+)?/g) ?? []).map(Number);
  // M x y L x y A r r 0 0 s x y
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 10 < nb.length + 1; i += 11) {
    out.push({ x: nb[i], y: nb[i + 1] }, { x: nb[i + 2], y: nb[i + 3] }, { x: nb[i + 9], y: nb[i + 10] });
  }
  return out;
};

/** Les menuiseries dessinées : dormants, vitrages, battants et leurs arcs. */
const baies = (t: R): Bte[] =>
  t.root
    .findAllByType(G)
    .filter((n) => String(n.props.testID ?? '').startsWith('baie-'))
    .map((g) => {
      const pts = [
        ...g
          .findAllByType(Line)
          .filter((l) => l.props.stroke !== 'transparent')
          .flatMap((l) => [
            { x: Number(l.props.x1), y: Number(l.props.y1) },
            { x: Number(l.props.x2), y: Number(l.props.y2) },
          ]),
        ...g
          .findAllByType(Path)
          .filter((p) => p.props.fill === 'none')
          .flatMap((p) => pointsDuChemin(String(p.props.d))),
      ];
      return pts.length ? boiteDe(pts, g.props.testID) : null;
    })
    .filter((b): b is Bte => !!b);

const chevauche = (a: Bte, b: Bte) =>
  !(a.x >= b.x + b.w - 0.5 || b.x >= a.x + a.w - 0.5 || a.y >= b.y + b.h - 0.5 || b.y >= a.y + a.h - 0.5);

const CADRAGES: [number, number][] = [
  [320, 520],
  [390, 600],
  [430, 700],
  // La vignette de l'aperçu du PDF (`ExportScreen`, 250 de haut).
  [350, 250],
  [700, 620],
  [1100, 800],
];

const ex = appartementExemple();
const PARTS = roomParts(ex.walls as WallSeg[], ex.rooms);
const AIRES = PARTS.map((p) => `${p.surface!.area.toFixed(2).replace('.', ',')} m²`);

describe('aucune surface retirée sur l’exemple', () => {
  for (const [w, h] of CADRAGES) {
    for (const ed of [false, true]) {
      it(`${w}×${h}, ${ed ? 'édition' : 'lecture'}`, () => {
        const t = plan(w, h, ed);
        const ecrits = t.root.findAllByType(SvgText).map(texteDe);
        // Seule, ou sur la ligne du nom d'une pièce étroite (« Couloir · 15,40 m² »).
        for (const aire of AIRES) expect(ecrits.some((e) => e === aire || e.endsWith(` · ${aire}`))).toBe(true);
        // Un nom s'abrège proprement : plus de points de suspension.
        expect(ecrits.filter((x) => x.includes('…'))).toEqual([]);
      });
    }
  }

  it('et un nom trop long pour sa pièce s’abrège à la manière du dossier', () => {
    const t = plan(320, 520, false);
    const ecrits = t.root.findAllByType(SvgText).map(texteDe);
    // Chaque pièce garde un nom, entier ou abrégé.
    for (const [entier, court] of [
      ['Séjour-cuisine', 'Séj.-cuis.'],
      ['Salle d’eau', 'SdE'],
      ['Chambre', 'Ch.'],
      ['Bureau', 'Bur.'],
      ['Entrée', 'Entr.'],
    ]) {
      expect(ecrits.some((x) => x === entier || x === court)).toBe(true);
    }
  });
});

describe('aucune cote sur un meuble ni une menuiserie de l’exemple', () => {
  for (const [w, h] of CADRAGES) {
    for (const ed of [false, true]) {
      it(`${w}×${h}, ${ed ? 'édition' : 'lecture'}`, () => {
        const t = plan(w, h, ed);
        const cs = cotes(t);
        // Un plan qui n'écrirait plus de cote passerait sans rien valoir.
        expect(cs.length).toBeGreaterThan(5);
        const genes = [...meubles(t), ...baies(t)];
        expect(genes.length).toBeGreaterThan(15);
        const chocs = cs.flatMap((c) => genes.filter((g) => chevauche(c, g)).map((g) => `${c.txt} × ${g.txt}`));
        expect(chocs).toEqual([]);
      });
    }
  }

  it('et la sonde voit un chevauchement quand il y en a un', () => {
    // Le contrôle en sens inverse : une sonde qui ne trouve jamais rien peut
    // être une sonde aveugle.
    const c = { txt: '3,60 m', x: 100, y: 100, w: 33, h: 7 };
    expect(chevauche(c, { txt: 'canapé', x: 120, y: 90, w: 40, h: 80 })).toBe(true);
    expect(chevauche(c, { txt: 'canapé', x: 134, y: 90, w: 40, h: 80 })).toBe(false);
  });
});

describe('une très petite cote ne flotte plus au milieu d’une cloison', () => {
  it('le bout de refend de 0,53 m ne s’écrit pas tant qu’il ne tient pas contre son mur', () => {
    const t = plan(390, 600, false);
    const ecrits = t.root.findAllByType(SvgText).map(texteDe);
    expect(ecrits.filter((x) => /^0,[0-5]\d( m)?$/.test(x))).toEqual([]);
  });
});

describe('les portes de l’exemple ont leur arc', () => {
  it('chaque porte connaît la pièce où elle bat, et son bord de pivot', () => {
    const portes = ex.openings.filter((o) => o.type === 'door');
    expect(portes).toHaveLength(4);
    for (const p of portes) {
      expect(ex.rooms.map((r) => r.id)).toContain(p.roomId);
      expect(['a', 'b']).toContain(p.pivot);
    }
  });

  it('et le plan dessine un battant et son quart de cercle pour chacune', () => {
    const t = plan(390, 600, false);
    const arcs = t.root
      .findAllByType(G)
      .filter((n) => /^baie-porte-/.test(String(n.props.testID ?? '')))
      .filter((g) => g.findAllByType(Path).some((p) => / A /.test(String(p.props.d))));
    expect(arcs).toHaveLength(4);
  });
});

describe('le sol de l’exemple', () => {
  const semis = (t: R) =>
    t.root.findAll((n) => n.props?.fill === 'url(#floorDots)' && typeof n.type === 'function').length;

  it('n’a pas de semis de points en lecture', () => {
    expect(semis(plan(390, 600, false))).toBe(0);
  });

  it('le garde en édition, plus discret, pour s’aligner', () => {
    const t = plan(390, 600, true);
    expect(semis(t)).toBeGreaterThan(0);
    const point = t.root.findAllByType(Circle).find((c) => c.props.cx === 1.1 && c.props.cy === 1.1)!;
    expect(Number(point.props.r)).toBeLessThan(1.1);
    expect(Number(point.props.opacity)).toBeLessThan(1);
  });
});

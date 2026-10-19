/**
 * LE PLAN S'ADAPTE À TOUTE SITUATION — demande du patron : « peaufiner au
 * mieux le plan 2D ; il doit être intelligent et s'adapter à toute
 * situation ». Ce que le banc a trouvé à l'écran, et qui ne revient pas :
 *   — trente pièces sur un téléphone : le cartouche « Pièce 12 / 12,80 m² »
 *     était plus large que sa pièce, posé de force au milieu, à travers les
 *     murs. Il se resserre d'abord (85 %, puis 72 %, jamais sous six points
 *     pour le nom) avant d'abréger, de sortir ou de déborder ;
 *   — l'exemple sur un téléphone : « Entrée » sortait avec un trait de
 *     rappel, « Salle d'eau » s'abrégeait — ils tiennent, resserrés ;
 *   — un couloir de quatorze mètres sur un dix sortait son nom avec un trait
 *     de rappel : il l'écrit sur une ligne, « Couloir · 15,40 m² » ;
 *   — une note ou une cote à la règle disparaissait sous le nom de la pièce.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
  multiGet: jest.fn(async (k: string[]) => k.map((x) => [x, null])),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { G, Rect, Text as SvgText } from 'react-native-svg';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore, type PlanNote } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';
import type { WallSeg } from '../src/geometry/floorplan';

const st = () => useScanStore.getState();
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25,
});
function grille30() {
  const L = 4;
  const P = 3.2;
  const walls: WallSeg[] = [];
  for (let r = 0; r <= 5; r++) for (let c = 0; c < 6; c++) walls.push(mur(`h-${r}-${c}`, c * L, r * P, (c + 1) * L, r * P));
  for (let r = 0; r < 5; r++) for (let c = 0; c <= 6; c++) walls.push(mur(`v-${r}-${c}`, c * L, r * P, c * L, (r + 1) * P));
  const rooms = [];
  let n = 1;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 6; c++) {
      rooms.push({ id: `p-${r}-${c}`, name: `Pièce ${n++}`, wallIds: [`h-${r}-${c}`, `h-${r + 1}-${c}`, `v-${r}-${c}`, `v-${r}-${c + 1}`] });
    }
  }
  return { walls, rooms };
}

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});
function monter(W: number, H: number, notes?: PlanNote[]) {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<FloorplanEditor showMeasures editable selectedWallId={null} onSelectWall={() => {}} notes={notes} />);
  });
  act(() => {
    t.root.findAllByType(View)[0].props.onLayout?.({ nativeEvent: { layout: { width: W, height: H } } });
  });
  arbre = t;
  return t;
}
const texteDe = (n: TestRenderer.ReactTestInstance) => ([] as unknown[]).concat(n.props.children ?? []).join('');
/** Les cartouches dessinés : par pièce, sa boîte, ses lignes, et s'il sort ou se pose de force. */
function cartouches(t: TestRenderer.ReactTestRenderer) {
  return t.root
    .findAll((n) => typeof n.props?.piece === 'string' && n.findAll((m) => m.type === Rect).length > 0 && n.findAllByType(SvgText).length > 0)
    .map((n) => {
      const r = n.findAll((m) => m.type === Rect)[0].props;
      const g = n.findAll((m) => m.type === G)[0];
      return {
        piece: n.props.piece as string,
        boite: { x: r.x as number, y: r.y as number, w: r.width as number, h: r.height as number },
        lignes: n.findAllByType(SvgText).map((m) => ({ t: texteDe(m), fs: Number(m.props.fontSize) })),
        sorti: n.findAll((m) => typeof m.props?.testID === 'string' && m.props.testID.startsWith('rappel-')).length > 0,
        deForce: g.props.pointerEvents === 'none',
      };
    });
}
const sechevauchent = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;

beforeEach(() => {
  useUsage.setState({ modeElec: false, charge: true, choisi: true });
  act(() => st().ouvrirExemple());
});

describe('le nom de la pièce se resserre avant de sortir', () => {
  it('trente pièces sur un téléphone : chaque nom tient dans sa pièce, avec sa surface', () => {
    act(() => useScanStore.setState({ ...grille30(), objects: [], fixtures: [], ceiling: [], photos: [], openings: [] }));
    const cs = cartouches(monter(390, 560));
    expect(cs).toHaveLength(30);
    for (const c of cs) {
      expect(c.sorti).toBe(false);
      expect(c.deForce).toBe(false);
      expect(c.lignes.some((l) => /m²/.test(l.t))).toBe(true);
      // Resserré, jamais illisible.
      expect(Math.min(...c.lignes.map((l) => l.fs))).toBeGreaterThanOrEqual(6);
    }
    // Et aucun ne touche son voisin.
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) expect(sechevauchent(cs[i].boite, cs[j].boite)).toBe(false);
  });

  it('l’exemple sur un téléphone : « Entrée » reste dans l’entrée, « Salle d’eau » en toutes lettres', () => {
    const cs = cartouches(monter(390, 560));
    const entree = st().rooms.find((r) => r.name === 'Entrée')!;
    const sdb = st().rooms.find((r) => r.name === 'Salle d’eau')!;
    expect(cs.find((c) => c.piece === entree.id)!.sorti).toBe(false);
    expect(cs.find((c) => c.piece === sdb.id)!.lignes.map((l) => l.t)).toContain('Salle d’eau');
  });

  it('un couloir de quatorze mètres sur un dix : son nom sur une ligne, dedans', () => {
    const rect = (p: string, x: number, z: number, w: number, d: number) => [
      mur(`${p}n`, x, z, x + w, z), mur(`${p}e`, x + w, z, x + w, z + d),
      mur(`${p}s`, x + w, z + d, x, z + d), mur(`${p}o`, x, z + d, x, z),
    ];
    act(() =>
      useScanStore.setState({
        walls: [...rect('a', 0, 0, 14, 1.1), ...rect('b', 0, 1.1, 3, 3)],
        rooms: [
          { id: 'a', name: 'Couloir', wallIds: ['an', 'ae', 'as', 'ao'] },
          { id: 'b', name: 'Chambre', wallIds: ['bn', 'be', 'bs', 'bo'] },
        ],
        objects: [], fixtures: [], ceiling: [], photos: [], openings: [],
      }),
    );
    const couloir = cartouches(monter(390, 560)).find((c) => c.piece === 'a')!;
    expect(couloir.sorti).toBe(false);
    expect(couloir.lignes.map((l) => l.t)).toEqual(['Couloir · 15,40 m²']);
  });

  it('sur une tablette, les grandes pièces gardent la taille normale', () => {
    const cs = cartouches(monter(820, 1000));
    for (const nom of ['Séjour-cuisine', 'Chambre']) {
      const id = st().rooms.find((r) => r.name === nom)!.id;
      expect(cs.find((c) => c.piece === id)!.lignes[0].fs).toBeCloseTo(10.5, 6);
    }
  });
});

describe('les notes et les cotes à la règle gardent leur place', () => {
  it('une note au milieu d’une pièce vide : le nom de la pièce l’évite', () => {
    const walls = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];
    act(() =>
      useScanStore.setState({
        walls,
        rooms: [{ id: 'r', name: 'Chambre', wallIds: ['n', 'e', 's', 'o'] }],
        objects: [], fixtures: [], ceiling: [], photos: [], openings: [],
      }),
    );
    // Sans note, le nom se pose au milieu : la note y va.
    const sans = cartouches(monter(820, 1000))[0].boite;
    act(() => arbre?.unmount());
    const t = monter(820, 1000, [{ id: 'n1', text: 'Tableau', at: { x: 1.9, z: 1.5 } }]);
    const note = t.root.findAll((n) => n.props?.accessibilityLabel === 'Note : Tableau')[0].findAll((m) => m.type === Rect)[0].props;
    const boiteNote = { x: note.x, y: note.y, w: note.width, h: note.height };
    expect(sechevauchent(sans, boiteNote)).toBe(true);
    const c = cartouches(t)[0];
    expect(sechevauchent(c.boite, boiteNote)).toBe(false);
  });
});

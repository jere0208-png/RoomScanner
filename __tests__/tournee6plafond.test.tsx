/**
 * TOURNÉE N°6 — LE PLAFOND : LE VENTILATEUR, LE RUBAN LED, LE CHOIX SOUS LE DOIGT.
 *
 * Relevés du patron :
 * - « Revois l'icône plafond du ventilateur : il y a 3 hélices et l'icône
 *   mal faite. »
 * - « La LED périmétrique n'apparaît pas en visite, ni en 3D. »
 * - « Quand une LED est posée, même si on clique au centre de la pièce, elle
 *   est choisie (…) Elle n'est sélectionnée que si on clique sur le zigzag
 *   bleu, et si plusieurs éléments sont au même emplacement, on demande. »
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { Circle, Path, Polyline } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { CeilingIcon } from '../src/components/CeilingIcon';
import { CeilingLayer } from '../src/components/CeilingLayer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { CEILING_SYMBOL, type CeilingFixture } from '../src/geometry/ceiling';
import { detectRooms, mergeColinear, splitAtJunctions, weldCorners, type WallSeg } from '../src/geometry/floorplan';
import { groupesDesAppareils } from '../src/geometry/appareils3d';
import type { Fixture } from '../src/geometry/electrical';
import { GENRE, basculer, lampesDeLInterrupteur, lampesDeLaScene, rangsDesLampes } from '../src/geometry/lumieres';
import { maillageDeLaMaquette } from '../src/geometry/maquette3d';
import { jalonsDuRuban, longueurDuRuban } from '../src/geometry/ruban';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { maillageDeLaVisite } from '../src/geometry/visite3d';
import { useScanStore } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';
import { light } from '../src/theme';

const nombres = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('le ventilateur', () => {
  it('quatre pales sur le plan, chacune la précédente tournée d’un quart de tour', () => {
    const [moyeu, ...pales] = CEILING_SYMBOL.ventilateur;
    expect(moyeu.d).toMatch(/a2 2/);
    expect(pales).toHaveLength(4);
    // Les sommets (hors rayons et drapeaux de l'arc) : M, L, fin d'arc, L.
    const sommets = (d: string) => {
      const n = nombres(d);
      return [n[0], n[1], n[2], n[3], n[9], n[10], n[11], n[12]];
    };
    for (let k = 0; k < 4; k++) {
      const a = sommets(pales[k].d);
      const b = sommets(pales[(k + 1) % 4].d);
      for (let i = 0; i < a.length; i += 2) {
        // Un quart de tour : (x, z) → (−z, x).
        expect(b[i]).toBeCloseTo(-a[i + 1], 1);
        expect(b[i + 1]).toBeCloseTo(a[i], 1);
      }
    }
  });

  it('l’icône du catalogue est au trait, comme les autres : quatre pales et le moyeu', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<CeilingIcon kind="ventilateur" />);
    });
    expect(t.root.findAllByType(Path)).toHaveLength(4);
    expect(t.root.findAllByType(Circle)).toHaveLength(1);
    for (const p of t.root.findAllByType(Path)) expect(p.props.strokeWidth).toBe(1.9);
  });

  it('le ruban de la légende a des dents qui se voient (±3)', () => {
    const ys = nombres(CEILING_SYMBOL.led[0].d).filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(6);
  });
});

const PAL: ScenePalette = {
  floor: '#EEEEEE', floorStroke: '#CCCCCC', wall: '#FFFFFF', wallStroke: '#888888', wallTop: '#F4F4F4',
  wallTopStroke: '#949494', opening: '#B9C2CE', door: '#E8A13B', window: '#3EB8E5', passage: '#2F6BFF',
  object: '#D8E1F2', objectTop: '#E9EEF9', objectStroke: '#9FACBF',
};
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25,
});
const MURS = mergeColinear(
  splitAtJunctions(weldCorners([mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('w', 0, 3, 0, 0)])),
).map((w) => ({ ...w, roomId: 'room-1' }));
const ROOMS = detectRooms(MURS).map((r, i) => ({ id: `room-${i + 1}`, wallIds: r.wallIds }));
const RUBAN: CeilingFixture = {
  id: 'r',
  kind: 'led',
  roomId: 'room-1',
  at: { x: 0.2, z: 0.2 },
  trace: [{ x: 0.2, z: 0.2 }, { x: 3.8, z: 0.2 }, { x: 3.8, z: 2.8 }, { x: 0.2, z: 2.8 }],
  ferme: true,
};

describe('le ruban LED en 3D et en visite', () => {
  const sc = buildScene(MURS, [], [], { palette: PAL, rooms: ROOMS as never, showSurfaces: true, ceiling: [RUBAN] });
  const ruban = sc.faces.filter((f) => f.ownerId === 'cl-r');

  it('n’a pas de modèle : la carte graphique reçoit ses faces', () => {
    expect(ruban.length).toBeGreaterThan(0);
    expect(ruban.every((f) => f.sansModele)).toBe(true);
    const seul = { ...sc, faces: ruban };
    expect(maillageDeLaMaquette(seul.faces, { sansMeubles: true }).maillage.length + maillageDeLaMaquette(seul.faces, { sansMeubles: true }).orientes.length).toBeGreaterThan(0);
    expect(maillageDeLaVisite(seul.faces, { sansMeubles: true }).maillage.length).toBeGreaterThan(0);
  });

  it('porte une joue, qu’on voit de face à hauteur d’œil', () => {
    expect(ruban.some((f) => Math.abs(f.normal?.y ?? 1) < 1e-6)).toBe(true);
  });

  it('une caisse d’appareil, elle, reste réservée au vrai modèle', () => {
    const caisse = { ...ruban[0], sansModele: undefined };
    expect(maillageDeLaVisite([caisse], { sansMeubles: true }).maillage.length).toBe(0);
  });
});

describe('le ruban LED lié à un interrupteur', () => {
  // Relevé du patron : « la LED s'allume bien si liée à un interrupteur ? »
  const INTER: Fixture = { id: 'i1', kind: 'inter', wallId: MURS[0].id, along: 2, height: 1.1, side: 1 };
  const LIE: CeilingFixture = { ...RUBAN, commands: ['i1'] };
  const sc = buildScene(MURS, [], [], { palette: PAL, rooms: ROOMS as never, showSurfaces: true, ceiling: [LIE], fixtures: [INTER] });
  const lampes = lampesDeLaScene(sc.appareils ?? []);

  it('est une lampe de la visite : une nappe douce, depuis le milieu de son tracé', () => {
    const l = lampes.find((x) => x.id === 'cl-r')!;
    expect(l).toBeDefined();
    expect(l.genre).toBe(GENRE.plafonnier);
    expect(l.x).toBeCloseTo(2, 2);
    expect(l.z).toBeCloseTo(1.5, 2);
  });

  it('son diffuseur court sur tout le tracé, et s’allume avec elle', () => {
    const groupes = groupesDesAppareils(sc.appareils ?? [], rangsDesLampes(lampes));
    const diffuseur = groupes.filter((g) => g.mat === 'lumiere' && g.lampe === lampes.find((x) => x.id === 'cl-r')!.index);
    expect(diffuseur.length).toBeGreaterThan(0);
  });

  it('l’interrupteur qui le commande l’allume, puis l’éteint', () => {
    const siennes = lampesDeLInterrupteur(INTER, [INTER], [LIE], () => 'room-1').filter((id) => lampes.some((x) => x.id === id));
    expect(siennes).toEqual(['cl-r']);
    const allume = basculer(new Set(), siennes);
    expect(allume.has('cl-r')).toBe(true);
    expect(basculer(allume, siennes).has('cl-r')).toBe(false);
  });

  it('ses jalons se répartissent sur toute sa longueur', () => {
    const j = jalonsDuRuban(RUBAN.trace!, true);
    expect(j.length).toBeGreaterThan(8);
    const xs = j.map((q) => q.x);
    const zs = j.map((q) => q.z);
    expect(Math.min(...xs)).toBeLessThan(0.5);
    expect(Math.max(...xs)).toBeGreaterThan(3.5);
    expect(Math.min(...zs)).toBeLessThan(0.5);
    expect(Math.max(...zs)).toBeGreaterThan(2.5);
    expect(longueurDuRuban(RUBAN.trace!, true)).toBeCloseTo(12.4, 6);
  });
});

describe('la cible du ruban sur le plan', () => {
  const mapping = { scale: 100, toPx: (p: { x: number; z: number }) => ({ x: p.x * 100, y: p.z * 100 }) };

  it('ne prend que son tracé, jamais l’intérieur de la pièce', () => {
    const choisi = jest.fn();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
      <CeilingLayer
        ceiling={[RUBAN]}
        showCeiling
        onSelectCeiling={choisi}
        walls={MURS}
        quads={new Map()}
        partOf={new Map()}
        mapping={mapping}
        frame={0}
        c={light}
      />,
      );
    });
    const touchables = t.root.findAll((n) => typeof n.props.onPress === 'function' && (n.type === Path || n.type === Polyline || n.type === Circle));
    expect(touchables).toHaveLength(1);
    const cible = touchables[0];
    expect(cible.type).toBe(Path);
    // Un sous-tracé par segment : deux points chacun, aucun intérieur.
    const sous = String(cible.props.d).split('M').filter(Boolean);
    expect(sous).toHaveLength(4);
    for (const s of sous) expect(nombres(s)).toHaveLength(4);
    // Les dessins du ruban ne se touchent pas.
    for (const p of t.root.findAllByType(Polyline)) expect(p.props.pointerEvents).toBe('none');
  });
});

describe('plusieurs choses sous le doigt', () => {
  const DCL: CeilingFixture = { id: 'dcl', kind: 'dcl', roomId: 'room-1', at: { x: 2, z: 1.5 } };
  function monter(onSelectCeiling: jest.Mock, onSelectObject: jest.Mock) {
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: [
        {
          id: 'table',
          category: 'table',
          width: 1.4,
          depth: 0.8,
          height: 0.75,
          confidence: 'high',
          roomId: 'room-1',
          transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.375, 1.5, 1],
        },
      ],
      rooms: ROOMS.map((r) => ({ ...r, name: 'Séjour', floor: null })),
      fixtures: [],
      ceiling: [DCL],
      photos: [],
      showFurniture: true,
    } as never);
    useUsage.setState({ modeElec: true });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <FloorplanEditor
          showMeasures={false}
          editable
          selectedWallId={null}
          onSelectWall={() => {}}
          ceiling={[DCL]}
          showCeiling
          showFixtures
          onSelectCeiling={onSelectCeiling}
          onSelectObject={onSelectObject}
        />,
      );
    });
    const conteneur = t.root.findAllByType(View)[0];
    act(() => conteneur.props.onLayout?.({ nativeEvent: { layout: { width: 400, height: 300 } } }));
    return { t, conteneur };
  }

  it('la table sous le point lumineux : on demande lequel', () => {
    const plafond = jest.fn();
    const meuble = jest.fn();
    const { t, conteneur } = monter(plafond, meuble);
    // Le point touché : le centre de la pièce, là où sont la table et la DCL.
    const dcl = t.root.findAll((n) => n.props.accessibilityLabel === 'Point lumineux DCL')[0];
    expect(dcl).toBeDefined();
    const rond = dcl.findAllByType(Circle)[0];
    const ici = { pageX: rond.props.cx, pageY: rond.props.cy, locationX: rond.props.cx, locationY: rond.props.cy };
    act(() => conteneur.props.onTouchStart({ nativeEvent: ici }));
    act(() => dcl.props.onPress());
    // Rien n'est choisi d'office : la carte nomme les deux.
    expect(plafond).not.toHaveBeenCalled();
    const lignes = t.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Choisir ') && typeof n.props.onPress === 'function');
    // (Un bouton se lit deux fois dans l'arbre de test : le composant et sa vue.)
    expect([...new Set(lignes.map((n) => n.props.accessibilityLabel))]).toEqual(['Choisir Point lumineux DCL', 'Choisir Table']);
    act(() => lignes.find((n) => n.props.accessibilityLabel === 'Choisir Table')!.props.onPress());
    expect(meuble).toHaveBeenCalledWith('table');
    expect(t.root.findAll((n) => n.props.accessibilityLabel === 'Choisir Table')).toHaveLength(0);
  });

  it('un seul élément sous le doigt : il est pris, sans question', () => {
    const plafond = jest.fn();
    const { t, conteneur } = monter(plafond, jest.fn());
    act(() => conteneur.props.onTouchStart({ nativeEvent: { pageX: 5, pageY: 5, locationX: 5, locationY: 5 } }));
    const dcl = t.root.findAll((n) => n.props.accessibilityLabel === 'Point lumineux DCL')[0];
    act(() => dcl.props.onPress());
    expect(plafond).toHaveBeenCalledWith('dcl');
  });
});

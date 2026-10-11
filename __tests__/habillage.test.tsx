/**
 * L'HABILLAGE DE LA MAQUETTE — le sol, un mur d'accent, la couleur des
 * meubles.
 *
 * Relevé du patron, point 9 de la réflexion « grand public » : « plus de
 * personnalisation en 3D : choix du sol, un mur d'une autre couleur, couleur
 * des meubles ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import TestRenderer, { act } from 'react-test-renderer';
import type { ObjectData } from 'react-native-room-scan';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { mixHex } from '../src/geometry/appearance';
import type { WallSeg } from '../src/geometry/floorplan';
import {
  SOLS,
  TEINTES_MEUBLES,
  accentsDesPieces,
  cleDeTeinte,
  hexDeTeinte,
  solDe,
  solsDesPieces,
} from '../src/ui/habillage';
import { hexDePeinture } from '../src/ui/peintures';
import { useScanStore } from '../src/store/scanStore';
import { PeintureSheet } from '../src/screens/result/PeintureSheet';
import { ObjectBar } from '../src/components/ObjectBar';
import { getStyles } from '../src/screens/result/styles';
import { light } from '../src/theme';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

const PAL: ScenePalette = {
  floor: '#EEEEEE',
  floorStroke: '#CCCCCC',
  wall: '#FFFFFF',
  wallStroke: '#888888',
  wallTop: '#F4F4F4',
  wallTopStroke: '#949494',
  opening: '#B9C2CE',
  door: '#E8A13B',
  window: '#3EB8E5',
  passage: '#2F6BFF',
  object: '#D8E1F2',
  objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};
const mur = (id: string, roomId: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId,
});
/* Deux pièces mitoyennes, séparées par le refend x = 4. */
const MURS: WallSeg[] = [
  mur('n1', 'r1', 0, 0, 4, 0),
  mur('ref', 'r1', 4, 0, 4, 3),
  mur('s1', 'r1', 4, 3, 0, 3),
  mur('o1', 'r1', 0, 3, 0, 0),
  mur('n2', 'r2', 4, 0, 7, 0),
  mur('e2', 'r2', 7, 0, 7, 3),
  mur('s2', 'r2', 7, 3, 4, 3),
];
const PIECES = [
  { id: 'r1', wallIds: ['n1', 'ref', 's1', 'o1'] },
  { id: 'r2', wallIds: ['n2', 'e2', 's2', 'ref'] },
];

const facesDuMur = (scene: ReturnType<typeof buildScene>, id: string) =>
  scene.faces.filter((f) => f.wallId === id && f.pts.length >= 3 && !f.dashed && !!f.fill && Math.abs(f.normal?.y ?? 0) < 0.5);

describe('les palettes', () => {
  it('des sols de magasin, avec leurs joints ; « selon la pièce » ne choisit rien', () => {
    expect(new Set(SOLS.map((s) => s.cle)).size).toBe(SOLS.length);
    expect(solDe('auto')).toBeNull();
    expect(solDe('inconnu-du-futur')).toBeNull();
    expect(solDe('noyer')?.motif).toBe('parquet');
    expect(solDe('beton')?.motif).toBeNull();
  });

  it('des teintes de meubles ; « d’origine » rend la couleur du meuble', () => {
    expect(new Set(TEINTES_MEUBLES.map((t) => t.cle)).size).toBe(TEINTES_MEUBLES.length);
    expect(hexDeTeinte('origine')).toBeNull();
    const vert = hexDeTeinte('sauge')!;
    expect(cleDeTeinte(vert)).toBe('sauge');
    expect(cleDeTeinte(null)).toBe('origine');
  });
});

describe('la scène s’habille', () => {
  it('le sol choisi prend sa teinte, au lieu de la matière devinée', () => {
    const avec = buildScene(MURS, [], [], {
      palette: PAL,
      showSurfaces: true,
      rooms: PIECES,
      sols: solsDesPieces([{ id: 'r1', sol: 'noyer' }]),
      matieres: { r1: 'carrelage', r2: 'carrelage' },
    });
    const sols = avec.faces.filter((f) => f.isFloor);
    const noyer = mixHex(PAL.floor, solDe('noyer')!.hex, 0.85);
    expect(sols.some((f) => f.fill === noyer)).toBe(true);
    // La pièce voisine garde son carrelage deviné.
    expect(sols.filter((f) => f.fill === noyer)).toHaveLength(1);
  });

  it('un mur d’accent ne peint que SA face, côté pièce ; les autres murs gardent la teinte de la pièce', () => {
    const SAUGE = hexDePeinture('sauge')!;
    const TERRA = hexDePeinture('terracotta')!;
    const scene = buildScene(MURS, [], [], {
      palette: PAL,
      showSurfaces: true,
      rooms: PIECES,
      peintures: { r1: SAUGE },
      accents: accentsDesPieces([{ id: 'r1', accents: { ref: 'terracotta' } }]),
    });
    const ref = facesDuMur(scene, 'ref');
    const versSejour = new Set(ref.filter((f) => (f.normal?.x ?? 0) < -0.5).map((f) => f.fill));
    const versChambre = new Set(ref.filter((f) => (f.normal?.x ?? 0) > 0.5).map((f) => f.fill));
    expect([...versSejour]).toEqual([TERRA]);
    expect([...versChambre]).toEqual([PAL.wall]);
    const nord = new Set(facesDuMur(scene, 'n1').filter((f) => (f.normal?.z ?? 0) > 0.5).map((f) => f.fill));
    expect([...nord]).toEqual([SAUGE]);
  });

  it('un meuble teinté porte sa teinte, même sans les couleurs relevées', () => {
    const canape = {
      id: 'k',
      category: 'sofa',
      width: 1.8,
      depth: 0.9,
      height: 0.8,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.4, 1.5, 1],
      roomId: 'r1',
      teinte: hexDeTeinte('bleuNuit')!,
    } as ObjectData;
    const scene = buildScene(MURS, [], [canape], { palette: PAL, showSurfaces: true, rooms: PIECES, showTextures: false });
    expect(scene.meubles?.find((m) => m.id === 'k')?.color).toBe(hexDeTeinte('bleuNuit'));
  });
});

describe('le magasin garde l’habillage', () => {
  beforeEach(() => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({
        screen: 'result',
        walls: MURS,
        rooms: [
          { id: 'r1', name: 'Séjour', floor: null, wallIds: ['n1', 'ref', 's1', 'o1'] },
          { id: 'r2', name: 'Chambre', floor: null, wallIds: ['n2', 'e2', 's2', 'ref'] },
        ] as never,
        objects: [{ id: 'k', category: 'sofa', width: 1, depth: 1, height: 1, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.5, 1.5, 1] }] as never,
      });
    });
  });

  it('le sol, le mur d’accent, la teinte : posés, annulables, et le champ s’efface', () => {
    const st = useScanStore.getState();
    st.setRoomSol('r1', 'chene');
    st.setMurAccent('r1', 'ref', 'terracotta');
    st.setObjectTeinte('k', '#2E3A55');
    let r1 = useScanStore.getState().rooms.find((r) => r.id === 'r1')!;
    expect(r1.sol).toBe('chene');
    expect(r1.accents).toEqual({ ref: 'terracotta' });
    expect(useScanStore.getState().objects[0].teinte).toBe('#2E3A55');
    useScanStore.getState().undo();
    expect(useScanStore.getState().objects[0].teinte).toBeUndefined();
    useScanStore.getState().setRoomSol('r1', null);
    useScanStore.getState().setMurAccent('r1', 'ref', null);
    r1 = useScanStore.getState().rooms.find((r) => r.id === 'r1')!;
    expect('sol' in r1).toBe(false);
    expect('accents' in r1).toBe(false);
  });
});

describe('à l’écran', () => {
  it('le nuancier de la pièce porte aussi son sol', () => {
    const onSol = jest.fn();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <PeintureSheet visible nomPiece="le séjour" choisie={null} onChoisir={jest.fn()} onClose={jest.fn()} sol={{ choisi: null, onChoisir: onSol }} />,
      );
    });
    const noyer = t.root.findAll((n) => n.props.accessibilityLabel === 'Sol : Noyer' && typeof n.props.onPress === 'function', { deep: false })[0];
    act(() => noyer.props.onPress());
    expect(onSol).toHaveBeenCalledWith('noyer');
    const auto = t.root.findAll((n) => n.props.accessibilityLabel === 'Sol : Selon la pièce' && typeof n.props.onPress === 'function', { deep: false })[0];
    act(() => auto.props.onPress());
    expect(onSol).toHaveBeenLastCalledWith(null);
    act(() => t.unmount());
  });

  it('la barre du meuble porte sa pastille de couleur', () => {
    const onTeinte = jest.fn();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <ObjectBar
          object={{ id: 'k', category: 'sofa', width: 1, depth: 1, height: 1, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 1] } as ObjectData}
          styles={getStyles(light) as unknown as Record<string, object>}
          palette={light}
          onPrompt={jest.fn()}
          onResize={jest.fn()}
          onRotate={jest.fn()}
          onCancel={jest.fn()}
          teinte="#2E3A55"
          onTeinte={onTeinte}
        />,
      );
    });
    const puce = t.root.findAll((n) => n.props.accessibilityLabel === 'Couleur du meuble' && typeof n.props.onPress === 'function', { deep: false })[0];
    act(() => puce.props.onPress());
    expect(onTeinte).toHaveBeenCalled();
    act(() => t.unmount());
  });

  it('un mur se peint côté pièce ; la 3D et la visite reçoivent l’habillage', () => {
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).toContain("label: 'Peindre',");
    expect(ecran).toContain('setMurAccent(murAPeindre.roomId, murAPeindre.wallId, cle)');
    expect(ecran).toContain('setObjectTeinte(meuble.id, hexDeTeinte(cle))');
    for (const f of ['src/components/Iso3DView.tsx', 'src/components/Exploration.tsx']) {
      expect([f, lire(f).includes('accentsDesPieces(rooms)') && lire(f).includes('solsDesPieces(rooms)')]).toEqual([f, true]);
    }
  });
});

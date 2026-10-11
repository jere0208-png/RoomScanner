/**
 * LA RÈGLE LIBRE — mesurer entre deux points du plan, et garder la cote.
 *
 * Relevé du patron, point 7 de la réflexion « grand public » : « une règle
 * libre pour mesurer entre deux points du plan ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react-test-renderer';
import type { ObjectData } from 'react-native-room-scan';
import { accrocher, coinsDuMeuble, longueur, texteDeMesure } from '../src/geometry/regle';
import { WALL_T, type WallSeg } from '../src/geometry/floorplan';
import { buildScanPdf } from '../src/export/pdf';
import { useScanStore } from '../src/store/scanStore';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});
const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];
const NU = WALL_T / 2;
const commode = {
  id: 'c',
  category: 'storage',
  width: 1,
  depth: 0.5,
  height: 0.9,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.45, 1.5, 1],
} as ObjectData;

describe('les bouts de la règle s’accrochent', () => {
  it('à un coin de mur, au nu', () => {
    const a = accrocher({ x: NU + 0.05, z: NU + 0.04 }, MURS, [], 0.15);
    expect(a.sur).toBe('coin');
    expect(a.pt.x).toBeCloseTo(NU, 3);
    expect(a.pt.z).toBeCloseTo(NU, 3);
  });

  it('au nu d’un mur, quand on vise son milieu', () => {
    const a = accrocher({ x: 2, z: NU + 0.06 }, MURS, [], 0.15);
    expect(a.sur).toBe('mur');
    expect(a.pt.z).toBeCloseTo(NU, 3);
    expect(a.pt.x).toBeCloseTo(2, 3);
  });

  it('au coin d’un meuble', () => {
    const [c0] = coinsDuMeuble(commode);
    const a = accrocher({ x: c0.x + 0.03, z: c0.z - 0.03 }, MURS, [commode], 0.15);
    expect(a.sur).toBe('meuble');
    expect(a.pt.x).toBeCloseTo(c0.x, 3);
  });

  it('et reste libre loin de tout', () => {
    const a = accrocher({ x: 1, z: 2.2 }, MURS, [], 0.1);
    expect(a.sur).toBeNull();
    expect(a.pt).toEqual({ x: 1, z: 2.2 });
  });

  it('la mesure se lit au centimètre', () => {
    const m = { a: { x: 0, z: 0 }, b: { x: 3, z: 4 } };
    expect(longueur(m)).toBeCloseTo(5, 6);
    expect(texteDeMesure({ a: { x: 0, z: 0 }, b: { x: 2.345, z: 0 } })).toBe('2,35 m');
  });
});

describe('la cote gardée vit avec le plan', () => {
  beforeEach(() => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({ saves: [], screen: 'result', walls: MURS, rooms: [{ id: 'r1', name: 'Séjour', floor: null } as never] });
    });
  });

  it('se garde, s’annule, se retire', () => {
    const st = useScanStore.getState();
    st.addMesure({ x: 0, z: 1 }, { x: 4, z: 1 });
    expect(useScanStore.getState().mesures).toHaveLength(1);
    expect(useScanStore.getState().dirty).toBe(true);
    useScanStore.getState().undo();
    expect(useScanStore.getState().mesures).toHaveLength(0);
    useScanStore.getState().redo();
    const [m] = useScanStore.getState().mesures;
    useScanStore.getState().removeMesure(m.id);
    expect(useScanStore.getState().mesures).toHaveLength(0);
  });

  it('s’enregistre avec le plan et revient avec lui', () => {
    useScanStore.getState().addMesure({ x: 0, z: 1 }, { x: 4, z: 1 });
    useScanStore.getState().commitCurrent();
    const id = useScanStore.getState().currentSaveId!;
    expect(useScanStore.getState().saves[0].mesures).toHaveLength(1);
    act(() => {
      useScanStore.getState().setScreen('library');
      useScanStore.getState().openSave(id);
    });
    expect(useScanStore.getState().mesures).toHaveLength(1);
  });

  it('suit l’étage où on l’a posée', () => {
    act(() => useScanStore.setState({ niveauCourant: 1 }));
    useScanStore.getState().addMesure({ x: 0, z: 1 }, { x: 4, z: 1 });
    expect(useScanStore.getState().mesures[0].niveau).toBe(1);
  });
});

describe('au dossier et à l’écran', () => {
  it('le PDF imprime la cote gardée sur le plan', () => {
    const pdf = latin1(
      buildScanPdf(
        {
          name: 'Plan',
          walls: MURS,
          openings: [],
          objects: [],
          rooms: [{ id: 'r1', wallIds: MURS.map((w) => w.id) }],
          roomNames: { r1: 'Séjour' },
          mesures: [{ a: { x: 0.5, z: 1 }, b: { x: 2.5, z: 1 } }],
        },
        false,
        {},
      ),
    );
    expect(pdf).toContain('(2,00 m)');
  });

  it('l’écran porte le geste « Mesurer » et la barre de la règle', () => {
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).toContain('accessibilityLabel="Mesurer"');
    expect(ecran).toContain('onRegleTap={');
    expect(ecran).toContain("label: 'Garder',");
    const plan = lire('src/components/FloorplanEditor.tsx');
    expect(plan).toContain('function RegleHandle(');
    expect(plan).toContain('texteDeMesure(');
  });
});

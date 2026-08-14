import { create } from 'zustand';
import type { ObjectData, ScanResult, ScanUpdate } from 'react-native-room-scan';
import {
  snapAngle,
  toSegment,
  weldCorners,
  type WallSeg,
} from '../geometry/floorplan';

export type Screen = 'home' | 'scan' | 'result';

interface ScanState {
  screen: Screen;
  supported: boolean | null;
  scanning: boolean;
  paused: boolean;
  processing: boolean;
  error: string | null;

  // Pendant le scan (aperçu temps réel)
  instruction: string;
  wallCount: number;
  objectCount: number;
  doorCount: number;
  windowCount: number;

  // Après le scan — SOURCE DE VÉRITÉ paramétrique :
  // le plan 2D et toute vue 3D se dérivent de `walls`, jamais du maillage.
  modelPath: string | null;
  walls: WallSeg[];
  openings: WallSeg[]; // portes, fenêtres, ouvertures
  objects: ObjectData[];

  setScreen: (s: Screen) => void;
  setSupported: (v: boolean) => void;
  setScanning: (v: boolean) => void;
  setPaused: (v: boolean) => void;
  setProcessing: (v: boolean) => void;
  setError: (m: string | null) => void;
  setInstruction: (i: string) => void;
  applyLiveUpdate: (u: ScanUpdate) => void;
  finalize: (r: ScanResult) => void;
  moveWallPoint: (id: string, end: 'a' | 'b', p: { x: number; z: number }) => void;
  setWallLength: (id: string, length: number) => void;
  reset: () => void;
}

export const useScanStore = create<ScanState>((set, get) => ({
  screen: 'home',
  supported: null,
  scanning: false,
  paused: false,
  processing: false,
  error: null,
  instruction: '',
  wallCount: 0,
  objectCount: 0,
  doorCount: 0,
  windowCount: 0,
  modelPath: null,
  walls: [],
  openings: [],
  objects: [],

  setScreen: (screen) => set({ screen }),
  setSupported: (supported) => set({ supported }),
  setScanning: (scanning) => set({ scanning }),
  setPaused: (paused) => set({ paused }),
  setProcessing: (processing) => set({ processing }),
  setError: (error) => set({ error }),
  setInstruction: (instruction) => set({ instruction }),

  applyLiveUpdate: (u) =>
    set({
      wallCount: u.wallCount,
      objectCount: u.objectCount,
      doorCount: u.doorCount,
      windowCount: u.windowCount,
    }),

  finalize: (r) => {
    const segments = r.surfaces.map(toSegment);
    const walls = weldCorners(segments.filter((s) => s.type === 'wall'));
    const openings = segments.filter((s) => s.type !== 'wall');
    set({
      modelPath: r.modelPath,
      walls,
      openings,
      objects: r.objects ?? [],
      processing: false,
      scanning: false,
      screen: 'result',
    });
  },

  /**
   * Déplace une extrémité de mur. Les extrémités soudées au même coin
   * (autres murs) suivent, et l'angle snappe à l'horizontale/verticale.
   */
  moveWallPoint: (id, end, p) => {
    const { walls } = get();
    const wall = walls.find((w) => w.id === id);
    if (!wall) return;
    const old = wall[end];
    const fixed = wall[end === 'a' ? 'b' : 'a'];
    const snapped = snapAngle(fixed, p);
    set({
      walls: walls.map((w) => {
        const move = (pt: { x: number; z: number }) =>
          Math.hypot(pt.x - old.x, pt.z - old.z) < 1e-4 ? snapped : pt;
        return { ...w, a: move(w.a), b: move(w.b) };
      }),
    });
  },

  /** Modifie la longueur d'un mur en déplaçant son extrémité B le long de sa direction. */
  setWallLength: (id, length) => {
    const { walls, moveWallPoint } = get();
    const wall = walls.find((w) => w.id === id);
    if (!wall || length <= 0) return;
    const dx = wall.b.x - wall.a.x;
    const dz = wall.b.z - wall.a.z;
    const cur = Math.hypot(dx, dz);
    if (cur < 1e-6) return;
    moveWallPoint(id, 'b', {
      x: wall.a.x + (dx / cur) * length,
      z: wall.a.z + (dz / cur) * length,
    });
  },

  reset: () =>
    set({
      screen: 'home',
      scanning: false,
      paused: false,
      processing: false,
      error: null,
      instruction: '',
      wallCount: 0,
      objectCount: 0,
      doorCount: 0,
      windowCount: 0,
      modelPath: null,
      walls: [],
      openings: [],
      objects: [],
    }),
}));

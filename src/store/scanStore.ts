import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ObjectData, ScanResult, ScanUpdate } from 'react-native-room-scan';
import {
  snapAngle,
  toSegment,
  weldCorners,
  type WallSeg,
} from '../geometry/floorplan';

export type Screen = 'home' | 'scan' | 'result' | 'library' | 'export' | 'camera';

export interface SavedScan {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  modelPath: string | null;
  walls: WallSeg[];
  openings: WallSeg[];
  objects: ObjectData[];
}

const STORAGE_KEY = 'roomscanner.saves.v1';
const THEME_KEY = 'roomscanner.themePref.v1';
const COLORS_KEY = 'roomscanner.openingColors.v1';

export type ThemePref = 'light' | 'dark';

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistSoon(saves: SavedScan[]) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(saves)).catch(() => {});
  }, 600);
}

const two = (n: number) => String(n).padStart(2, '0');
function defaultName(d: Date): string {
  return `Scan du ${two(d.getDate())}/${two(d.getMonth() + 1)} à ${two(
    d.getHours(),
  )}h${two(d.getMinutes())}`;
}

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

  // Scan courant — SOURCE DE VÉRITÉ paramétrique :
  // le plan 2D et la vue 3D se dérivent de `walls`, jamais du maillage.
  modelPath: string | null;
  scanName: string;
  currentSaveId: string | null;
  /** Modifications du plan non enregistrées (bouton de sauvegarde visible). */
  dirty: boolean;
  walls: WallSeg[];
  openings: WallSeg[];
  objects: ObjectData[];

  // Bibliothèque persistée
  saves: SavedScan[];

  // Apparence : clair par défaut, bascule manuelle.
  themePref: ThemePref;
  setThemePref: (p: ThemePref) => void;

  // Couleur des portes/fenêtres (2D, 3D, PDF). Décoché par défaut.
  showOpeningColors: boolean;
  setShowOpeningColors: (v: boolean) => void;

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
  renameCurrent: (name: string) => void;
  saveAsCopy: (name: string) => void;
  /** Enregistre les modifications du plan dans la bibliothèque. */
  commitCurrent: () => void;
  loadSaves: () => Promise<void>;
  openSave: (id: string) => void;
  deleteSave: (id: string) => void;
  reset: () => void;
}

export const useScanStore = create<ScanState>((set, get) => {
  /** Recopie le scan courant dans son entrée de bibliothèque et persiste. */
  const syncCurrent = () => {
    const st = get();
    if (!st.currentSaveId) return;
    const saves = st.saves.map((s) =>
      s.id === st.currentSaveId
        ? {
            ...s,
            name: st.scanName,
            walls: st.walls,
            openings: st.openings,
            objects: st.objects,
            modelPath: st.modelPath,
            updatedAt: Date.now(),
          }
        : s,
    );
    set({ saves });
    persistSoon(saves);
  };

  return {
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
    scanName: '',
    currentSaveId: null,
    dirty: false,
    walls: [],
    openings: [],
    objects: [],
    saves: [],
    themePref: 'light',
    showOpeningColors: false,

    setThemePref: (themePref) => {
      set({ themePref });
      AsyncStorage.setItem(THEME_KEY, themePref).catch(() => {});
    },

    setShowOpeningColors: (showOpeningColors) => {
      set({ showOpeningColors });
      AsyncStorage.setItem(COLORS_KEY, showOpeningColors ? '1' : '0').catch(() => {});
    },

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
      const objects = r.objects ?? [];

      if (walls.length === 0) {
        // Rien d'exploitable : on montre l'état vide, sans polluer la bibliothèque.
        set({
          modelPath: r.modelPath ?? null,
          scanName: 'Scan vide',
          currentSaveId: null,
          walls: [],
          openings: [],
          objects: [],
          processing: false,
          scanning: false,
          screen: 'result',
        });
        return;
      }

      // Sauvegarde automatique : aucun scan terminé ne peut se perdre.
      const now = new Date();
      const save: SavedScan = {
        id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
        name: defaultName(now),
        createdAt: now.getTime(),
        updatedAt: now.getTime(),
        modelPath: r.modelPath ?? null,
        walls,
        openings,
        objects,
      };
      const saves = [save, ...get().saves];
      set({
        modelPath: save.modelPath,
        scanName: save.name,
        currentSaveId: save.id,
        dirty: false,
        walls,
        openings,
        objects,
        saves,
        processing: false,
        scanning: false,
        screen: 'result',
      });
      persistSoon(saves);
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
        // Pas de sauvegarde automatique : le bouton d'enregistrement apparaît.
        dirty: true,
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

    renameCurrent: (name) => {
      const clean = name.trim();
      if (!clean) return;
      set({ scanName: clean });
      // Le renommage est une action explicite : il s'enregistre seul,
      // sans emporter les modifications de plan en attente.
      const st = get();
      if (st.currentSaveId) {
        const saves = st.saves.map((s) =>
          s.id === st.currentSaveId ? { ...s, name: clean, updatedAt: Date.now() } : s,
        );
        set({ saves });
        persistSoon(saves);
      }
    },

    commitCurrent: () => {
      syncCurrent();
      set({ dirty: false });
    },

    /** Enregistre l'état courant comme NOUVELLE entrée de bibliothèque
     *  (l'original reste tel quel) et bascule dessus. */
    saveAsCopy: (name) => {
      const st = get();
      if (st.walls.length === 0) return;
      const now = Date.now();
      const clean = name.trim() || `${st.scanName} (copie)`;
      const save: SavedScan = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        name: clean,
        createdAt: now,
        updatedAt: now,
        modelPath: st.modelPath,
        walls: st.walls,
        openings: st.openings,
        objects: st.objects,
      };
      const saves = [save, ...st.saves];
      set({ saves, currentSaveId: save.id, scanName: clean, dirty: false });
      persistSoon(saves);
    },

    loadSaves: async () => {
      try {
        const pref = await AsyncStorage.getItem(THEME_KEY);
        if (pref === 'light' || pref === 'dark') {
          set({ themePref: pref });
        }
        const colors = await AsyncStorage.getItem(COLORS_KEY);
        if (colors === '1' || colors === '0') {
          set({ showOpeningColors: colors === '1' });
        }
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saves = JSON.parse(raw) as SavedScan[];
        if (Array.isArray(saves)) set({ saves });
      } catch {
        // Stockage illisible : on repart des valeurs en mémoire.
      }
    },

    openSave: (id) => {
      const save = get().saves.find((s) => s.id === id);
      if (!save) return;
      set({
        modelPath: save.modelPath,
        scanName: save.name,
        currentSaveId: save.id,
        walls: save.walls,
        openings: save.openings,
        objects: save.objects,
        dirty: false,
        screen: 'result',
      });
    },

    deleteSave: (id) => {
      const saves = get().saves.filter((s) => s.id !== id);
      set({
        saves,
        ...(get().currentSaveId === id ? { currentSaveId: null } : null),
      });
      persistSoon(saves);
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
        scanName: '',
        currentSaveId: null,
        dirty: false,
        walls: [],
        openings: [],
        objects: [],
      }),
  };
});

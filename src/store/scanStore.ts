import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  FloorData,
  ObjectData,
  ScanResult,
  ScanUpdate,
} from 'react-native-room-scan';
import {
  DEFAULT_ROOM_ID,
  detectRooms,
  mergeColinear,
  pointOnSeg,
  roomOf,
  segLength,
  snapAngle,
  splitAtJunctions,
  toSegment,
  weldCorners,
  type WallSeg,
} from '../geometry/floorplan';
import { pointInPolygon } from '../geometry/appearance';
import {
  deduceRoomKind,
  roomKindLabel,
  type RoomKind,
} from '../geometry/furniture';

export type Screen = 'home' | 'scan' | 'result' | 'library' | 'export' | 'camera';

/**
 * Une pièce du scan. La géométrie reste À PLAT dans `walls`/`openings`/
 * `objects` — chaque élément porte son `roomId` — parce que tout le rendu
 * (plan, 3D, PDF) travaille sur des listes de murs. Ici on ne garde que ce
 * qui est propre à la pièce : son nom et le relevé de son sol.
 */
export interface RoomEntry {
  id: string;
  /** Nom affiché sur le plan ; vide = pièce non nommée. */
  name: string;
  /**
   * Murs qui bordent la pièce. C'est la pièce qui liste ses murs, et non
   * l'inverse : un refend borde deux pièces, il figure dans les deux listes.
   * Absent sur les scans d'avant la détection automatique.
   */
  wallIds?: string[];
  /** Type déduit du mobilier (`kitchen`, `bedroom`…), si déduction il y a. */
  kind?: RoomKind;
  /** Couleurs du sol relevées au scan. */
  floor?: FloorData | null;
}

export interface SavedScan {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  modelPath: string | null;
  rooms: RoomEntry[];
  walls: WallSeg[];
  openings: WallSeg[];
  objects: ObjectData[];
  /** Scans d'avant le multi-pièces : nom unique de la pièce. */
  roomName?: string;
  /** Scans d'avant le multi-pièces : sol unique. */
  floor?: FloorData | null;
}

/**
 * Nomme les pièces d'un scan.
 *
 * Le type vient du mobilier (`deduceRoomKind`) ; deux chambres dans le même
 * appartement deviennent « Chambre » et « Chambre 2 ». Quand rien n'est assez
 * net pour trancher, la pièce prend son rang : « Pièce 3 ».
 */
function nameRooms(kinds: (RoomKind | null)[]): string[] {
  const taken: string[] = [];
  return kinds.map((kind, i) => {
    if (!kind) return `Pièce ${i + 1}`;
    const base = roomKindLabel(kind);
    const same = taken.filter(
      (n) => n === base || n.startsWith(`${base} `),
    ).length;
    const name = same === 0 ? base : `${base} ${same + 1}`;
    taken.push(name);
    return name;
  });
}

/** Mur le plus proche d'une ouverture, et à quelle distance. */
function nearestWall(o: WallSeg, walls: WallSeg[]): { dist: number } {
  const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
  let dist = Infinity;
  for (const w of walls) {
    dist = Math.min(dist, pointOnSeg(mid, w.a, w.b).dist);
  }
  return { dist };
}

/** Relevés de sol indexés par pièce, tels que `buildScene` les attend. */
export function floorsOf(
  rooms: RoomEntry[],
): Record<string, FloorData | null | undefined> {
  const out: Record<string, FloorData | null | undefined> = {};
  for (const r of rooms) out[r.id] = r.floor;
  return out;
}

/** Scans enregistrés avant le multi-pièces : une seule pièce, implicite. */
function migrateSave(s: SavedScan): SavedScan {
  if (Array.isArray(s.rooms) && s.rooms.length > 0) return s;
  return {
    ...s,
    rooms: [
      { id: DEFAULT_ROOM_ID, name: s.roomName ?? '', floor: s.floor ?? null },
    ],
  };
}

const STORAGE_KEY = 'roomscanner.saves.v1';
const THEME_KEY = 'roomscanner.themePref.v1';
const COLORS_KEY = 'roomscanner.openingColors.v1';
const FURNITURE_KEY = 'roomscanner.showFurniture.v1';
const SURFACES_KEY = 'roomscanner.showSurfaces.v1';
const TEXTURES_KEY = 'roomscanner.showTextures.v1';

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
  /** Remet à zéro les compteurs au démarrage d'un scan. */
  beginScan: () => void;

  // Scan courant — SOURCE DE VÉRITÉ paramétrique :
  // le plan 2D et la vue 3D se dérivent de `walls`, jamais du maillage.
  modelPath: string | null;
  scanName: string;
  currentSaveId: string | null;
  /** Modifications du plan non enregistrées (bouton de sauvegarde visible). */
  dirty: boolean;
  /** Pièces du scan courant, dans l'ordre de capture. */
  rooms: RoomEntry[];
  /** Renomme une pièce ; nom vide = plus de cartouche nommé. */
  setRoomName: (roomId: string, name: string) => void;
  /** Retire une pièce du scan (sa géométrie part avec elle). */
  removeRoom: (roomId: string) => void;
  /** D'où vient l'écran résultat : le bouton retour y renvoie. */
  resultOrigin: 'scan' | 'library';
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

  // Meubles visibles (sinon : murs et sols seuls). Activé par défaut.
  showFurniture: boolean;
  setShowFurniture: (v: boolean) => void;

  // Surface au sol : fond pointillé + valeur en m². Activée par défaut.
  showSurfaces: boolean;
  setShowSurfaces: (v: boolean) => void;

  // Couleurs et textures relevées au scan (2D, 3D, PDF). Décoché par défaut.
  showTextures: boolean;
  setShowTextures: (v: boolean) => void;

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
  /** Ajoute une ouverture manuelle centrée sur un mur (entrée sans porte, baie…). */
  addOpening: (wallId: string) => void;
  removeObject: (id: string) => void;
  setObjectCenter: (id: string, x: number, z: number) => void;
  resizeObject: (id: string, width: number, depth: number) => void;
  /** Abandonne les modifications : recharge la dernière sauvegarde. */
  revertCurrent: () => void;
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
            rooms: st.rooms,
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
    resultOrigin: 'scan',
    rooms: [],
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

    showFurniture: true,
    setShowFurniture: (showFurniture) => {
      set({ showFurniture });
      AsyncStorage.setItem(FURNITURE_KEY, showFurniture ? '1' : '0').catch(() => {});
    },

    showSurfaces: true,
    setShowSurfaces: (showSurfaces) => {
      set({ showSurfaces });
      AsyncStorage.setItem(SURFACES_KEY, showSurfaces ? '1' : '0').catch(() => {});
    },

    showTextures: false,
    setShowTextures: (showTextures) => {
      set({ showTextures });
      AsyncStorage.setItem(TEXTURES_KEY, showTextures ? '1' : '0').catch(() => {});
    },

    setRoomName: (roomId, name) =>
      set({
        rooms: get().rooms.map((r) =>
          r.id === roomId ? { ...r, name: name.trim() } : r,
        ),
        dirty: true,
      }),

    removeRoom: (roomId) => {
      const st = get();
      if (st.rooms.length <= 1) return;
      const gone = st.rooms.find((r) => r.id === roomId);
      const rooms = st.rooms.filter((r) => r.id !== roomId);
      // Un refend borde deux pièces : il ne part que si plus aucune autre
      // pièce ne s'appuie dessus.
      const stillUsed = new Set(rooms.flatMap((r) => r.wallIds ?? []));
      const doomed = new Set(
        gone?.wallIds
          ? gone.wallIds.filter((id) => !stillUsed.has(id))
          : st.walls.filter((w) => roomOf(w) === roomId).map((w) => w.id),
      );
      const walls = st.walls.filter((w) => !doomed.has(w.id));
      set({
        rooms,
        walls,
        // Les ouvertures des murs supprimés s'en vont avec eux.
        openings: st.openings.filter((o) => {
          const { dist } = nearestWall(o, walls);
          return dist < 0.6;
        }),
        objects: st.objects.filter((o) => roomOf(o) !== roomId),
        dirty: true,
      });
    },

    beginScan: () =>
      set({
        wallCount: 0,
        objectCount: 0,
        doorCount: 0,
        windowCount: 0,
      }),

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
      // Le scan est d'un seul tenant : une liste de surfaces, une liste de
      // meubles. Les pièces, on les trouve nous-mêmes.
      const surfaces = r.rooms?.length
        ? r.rooms.flatMap((x) => x.surfaces ?? [])
        : r.surfaces ?? [];
      const incomingObjects = r.rooms?.length
        ? r.rooms.flatMap((x) => x.objects ?? [])
        : r.objects ?? [];
      const floor = r.floor ?? r.rooms?.[0]?.floor ?? null;

      const segments = surfaces.map((s) => toSegment(s));
      // Souder les coins, COUPER les murs là où une cloison vient buter
      // (sans ça aucun cycle ne passe par elle et tout l'appartement ressort
      // en une seule pièce), recoller les morceaux alignés, PUIS chercher les
      // pièces : le graphe doit être propre avant d'y chercher des faces.
      const walls = mergeColinear(
        splitAtJunctions(weldCorners(segments.filter((s) => s.type === 'wall'))),
      );
      const openings = segments.filter((s) => s.type !== 'wall');

      // Détection automatique : les pièces sont les faces du graphe des murs.
      // Si rien ne se referme (scan trop partiel), tout tient en une pièce.
      const detected = detectRooms(walls);
      const shapes =
        detected.length > 0
          ? detected
          : [{ outline: [], wallIds: walls.map((w) => w.id), area: 0 }];

      // Chaque meuble revient à la pièce qui le contient.
      const objects: ObjectData[] = incomingObjects.map((o) => {
        const p = { x: o.transform[12], z: o.transform[14] };
        const hit = shapes.findIndex(
          (s) => s.outline.length >= 3 && pointInPolygon(p, s.outline),
        );
        return { ...o, roomId: `room-${(hit >= 0 ? hit : 0) + 1}` };
      });

      const kinds = shapes.map((_, i) => {
        const id = `room-${i + 1}`;
        return deduceRoomKind(
          objects.filter((o) => o.roomId === id).map((o) => o.category),
        );
      });
      const names = nameRooms(kinds);
      const kept: RoomEntry[] = shapes.map((s, i) => ({
        id: `room-${i + 1}`,
        name: names[i],
        wallIds: s.wallIds,
        kind: kinds[i] ?? undefined,
        floor,
      }));

      if (walls.length === 0) {
        // Rien d'exploitable : on montre l'état vide, sans polluer la bibliothèque.
        set({
          modelPath: r.modelPath ?? null,
          scanName: 'Scan vide',
          currentSaveId: null,
          rooms: [],
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
        rooms: kept,
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
        resultOrigin: 'scan',
        rooms: kept,
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
      const room = roomOf(wall);
      set({
        walls: walls.map((w) => {
          // Seuls les murs de la MÊME pièce suivent le coin : la cloison
          // d'en face garde la sienne, même si les deux se touchent.
          if (roomOf(w) !== room) return w;
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

    addOpening: (wallId) => {
      const st = get();
      const wall = st.walls.find((w) => w.id === wallId);
      if (!wall) return;
      const wallLen = segLength(wall);
      if (wallLen < 0.4) return;
      const len = Math.min(1, wallLen * 0.6);
      const ux = (wall.b.x - wall.a.x) / wallLen;
      const uz = (wall.b.z - wall.a.z) / wallLen;
      const mid = { x: (wall.a.x + wall.b.x) / 2, z: (wall.a.z + wall.b.z) / 2 };
      const h = Math.min(2.05, wall.height * 0.85);
      const base = wall.yCenter - wall.height / 2;
      const opening: WallSeg = {
        id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'opening',
        roomId: roomOf(wall),
        a: { x: mid.x - (ux * len) / 2, z: mid.z - (uz * len) / 2 },
        b: { x: mid.x + (ux * len) / 2, z: mid.z + (uz * len) / 2 },
        height: h,
        yCenter: base + h / 2,
      };
      set({ openings: [...st.openings, opening], dirty: true });
    },

    removeObject: (id) =>
      set({ objects: get().objects.filter((o) => o.id !== id), dirty: true }),

    setObjectCenter: (id, x, z) =>
      set({
        objects: get().objects.map((o) => {
          if (o.id !== id) return o;
          const t = [...o.transform];
          t[12] = x;
          t[14] = z;
          return { ...o, transform: t };
        }),
        dirty: true,
      }),

    resizeObject: (id, width, depth) => {
      if (width <= 0 || depth <= 0) return;
      set({
        objects: get().objects.map((o) =>
          o.id === id ? { ...o, width, depth } : o,
        ),
        dirty: true,
      });
    },

    revertCurrent: () => {
      const st = get();
      const save = st.saves.find((s) => s.id === st.currentSaveId);
      if (!save) return;
      const migrated = migrateSave(save);
      set({
        walls: migrated.walls,
        openings: migrated.openings,
        objects: migrated.objects,
        rooms: migrated.rooms,
        dirty: false,
      });
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
        rooms: st.rooms,
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
        const furn = await AsyncStorage.getItem(FURNITURE_KEY);
        if (furn === '1' || furn === '0') {
          set({ showFurniture: furn === '1' });
        }
        const surf = await AsyncStorage.getItem(SURFACES_KEY);
        if (surf === '1' || surf === '0') {
          set({ showSurfaces: surf === '1' });
        }
        const tex = await AsyncStorage.getItem(TEXTURES_KEY);
        if (tex === '1' || tex === '0') {
          set({ showTextures: tex === '1' });
        }
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saves = JSON.parse(raw) as SavedScan[];
        if (Array.isArray(saves)) set({ saves: saves.map(migrateSave) });
      } catch {
        // Stockage illisible : on repart des valeurs en mémoire.
      }
    },

    openSave: (id) => {
      const found = get().saves.find((s) => s.id === id);
      if (!found) return;
      const save = migrateSave(found);
      set({
        modelPath: save.modelPath,
        scanName: save.name,
        currentSaveId: save.id,
        rooms: save.rooms,
        walls: save.walls,
        openings: save.openings,
        objects: save.objects,
        dirty: false,
        resultOrigin: 'library',
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
        rooms: [],
        walls: [],
        openings: [],
        objects: [],
      }),
  };
});

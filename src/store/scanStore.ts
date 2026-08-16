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
  perpOf,
  pointOnSeg,
  roomExtent,
  roomHeight,
  roomOf,
  roomParts,
  planFrameAngle,
  reprojectOpenings,
  segLength,
  snapAngle,
  snapToNeighbours,
  splitAtJunctions,
  straightenWalls,
  toSegment,
  wallQuadsOf,
  weldCorners,
  WALL_T,
  type Pt,
  type WallSeg,
} from '../geometry/floorplan';
import {
  catalogTransform,
  type CatalogItem,
} from '../geometry/catalogue';
import {
  FIXTURES,
  faceX,
  fromFaceX,
  interiorSide,
  newFixture,
  wallFace,
  type Fixture,
  type FixtureKind,
} from '../geometry/electrical';
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

/** Un dossier de la bibliothèque. Il ne porte qu'un nom : ce sont les scans
 *  qui désignent le dossier où ils sont rangés. */
export interface ScanFolder {
  id: string;
  name: string;
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
  /** Appareillage électrique ajouté à la main. Absent des scans d'avant. */
  fixtures?: Fixture[];
  /** Dossier qui contient ce scan. Absent = à la racine. */
  folderId?: string;
  /**
   * Cap de l'axe −Z du repère de scan, en degrés depuis le nord. Absent
   * quand le magnétomètre n'a rien donné de sûr — et sur tous les scans
   * d'avant la boussole.
   */
  north?: number;
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

/**
 * Premier point où un rayon parti de `from` rencontre le contour d'une pièce.
 * Sert à poser une cloison qui touche pile les murs, des deux côtés.
 */
function castToOutline(
  from: { x: number; z: number },
  dir: { x: number; z: number },
  poly: { x: number; z: number }[],
): { x: number; z: number } | null {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[j];
    const q = poly[i];
    const ex = q.x - p.x;
    const ez = q.z - p.z;
    const den = dir.x * ez - dir.z * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((p.x - from.x) * ez - (p.z - from.z) * ex) / den;
    const u = ((p.x - from.x) * dir.z - (p.z - from.z) * dir.x) / den;
    if (t > 1e-4 && u >= -1e-6 && u <= 1 + 1e-6 && t < best) best = t;
  }
  if (!isFinite(best)) return null;
  return { x: from.x + dir.x * best, z: from.z + dir.z * best };
}

/**
 * Pièce à laquelle rattacher un point. Un meuble plaqué contre un mur — une
 * télé, une étagère — a souvent son centre HORS du contour : on prend alors
 * la pièce la plus proche, et non la première venue.
 */
function roomIndexAt(p: { x: number; z: number }, outlines: Pt[][]): number {
  const inside = outlines.findIndex(
    (o) => o.length >= 3 && pointInPolygon(p, o),
  );
  if (inside >= 0) return inside;
  let best = 0;
  let bestD = Infinity;
  outlines.forEach((o, i) => {
    for (let a = 0, b = o.length - 1; a < o.length; b = a++) {
      const d = pointOnSeg(p, o[b], o[a]).dist;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  });
  return best;
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
  const fixtures = Array.isArray(s.fixtures) ? s.fixtures : [];
  if (Array.isArray(s.rooms) && s.rooms.length > 0) {
    return s.fixtures === fixtures ? s : { ...s, fixtures };
  }
  return {
    ...s,
    fixtures,
    rooms: [
      { id: DEFAULT_ROOM_ID, name: s.roomName ?? '', floor: s.floor ?? null },
    ],
  };
}

const STORAGE_KEY = 'roomscanner.saves.v1';
const FOLDERS_KEY = 'roomscanner.folders.v1';
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

/**
 * Historique d'annulation : une pile de photos du plan, bornée.
 *
 * Les gestes continus (déplacer un coin, glisser un meuble) appellent leur
 * action des dizaines de fois par seconde : on ne photographie qu'une fois
 * par geste, en regroupant les appels de même nature rapprochés.
 */
interface Snapshot {
  walls: WallSeg[];
  openings: WallSeg[];
  objects: ObjectData[];
  rooms: RoomEntry[];
  fixtures: Fixture[];
}
const HISTORY_MAX = 40;
const history: Snapshot[] = [];
let lastKey = '';
let lastAt = 0;

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
  /** Réunit deux pièces en une : la cloison qui les sépare cesse de les séparer. */
  mergeRooms: (a: string, b: string) => void;
  /** Pose une cloison en travers d'une pièce, puis redétecte : elle se scinde. */
  splitRoom: (roomId: string) => void;
  /** Relit le graphe des murs et refait la liste des pièces. */
  redetectRooms: () => void;
  /** Redresse le plan sur sa propre trame : les angles redeviennent droits. */
  straightenPlan: () => void;
  /** Hauteur sous plafond d'une pièce (applique à tous ses murs). */
  setRoomHeight: (roomId: string, height: number) => void;
  /** Retire un mur du plan (et les ouvertures qu'il portait). */
  removeWall: (wallId: string) => void;
  /**
   * Trace un mur entre deux points choisis sur le plan. Le premier est
   * généralement l'extrémité d'un mur existant, pour que le nouveau s'y
   * raccroche ; le second se déplace ensuite par sa poignée.
   */
  addWallBetween: (a: Pt, b: Pt) => void;
  /** Appareillage électrique posé sur les murs (prises, commandes, RJ45…). */
  fixtures: Fixture[];
  /** Cap du scan : d'où vient le nord. `null` = boussole muette. */
  north: number | null;
  /**
   * Pose un appareil sur un mur, à 20 cm du coin bas gauche de la face qui
   * regarde la pièce. Renvoie son identifiant, pour l'ouvrir aussitôt.
   */
  addFixture: (kind: FixtureKind, wallId: string) => string | null;
  /** Déplace un appareil sur sa face : cote depuis le bord, hauteur d'axe. */
  moveFixture: (id: string, along: number, height: number) => void;
  /** Bascule l'appareil sur l'autre face du mur, sans le déplacer. */
  flipFixture: (id: string) => void;
  removeFixture: (id: string) => void;
  /** Annule la dernière retouche. Vide = plus rien à annuler. */
  undo: () => void;
  canUndo: boolean;
  /** D'où vient l'écran résultat : le bouton retour y renvoie. */
  resultOrigin: 'scan' | 'library';
  walls: WallSeg[];
  openings: WallSeg[];
  objects: ObjectData[];

  // Bibliothèque persistée
  saves: SavedScan[];
  /** Dossiers de la bibliothèque, dans l'ordre de création. */
  folders: ScanFolder[];
  /** Crée un dossier et renvoie son identifiant. */
  addFolder: (name?: string) => string;
  renameFolder: (id: string, name: string) => void;
  /** Supprime le dossier ; les scans qu'il contenait reviennent à la racine. */
  removeFolder: (id: string) => void;
  /** Range un scan dans un dossier, ou l'en sort (`null`). */
  moveToFolder: (scanId: string, folderId: string | null) => void;

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
  /**
   * Retaille une ouverture. La largeur se prend autour de son axe, la
   * hauteur depuis son allège : une fenêtre monte, elle ne descend pas.
   */
  resizeOpening: (id: string, width?: number, height?: number) => void;
  removeOpening: (id: string) => void;
  /**
   * Pose un meuble du catalogue au point donné. Renvoie son identifiant,
   * pour le sélectionner aussitôt : un meuble qu'on vient de poser, on va
   * le déplacer.
   */
  addObject: (item: CatalogItem, x: number, z: number) => string;
  /** Fait pivoter un meuble d'un quart de tour. */
  rotateObject: (id: string, quarts?: number) => void;
  /** Oriente un meuble à l'angle donné (radians). */
  setObjectYaw: (id: string, yaw: number) => void;
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
  /**
   * Photographie le plan avant de le modifier. `key` regroupe les appels
   * rapprochés d'un même geste : un glissement de coin ne doit produire
   * qu'UNE entrée d'historique, pas une par image.
   */
  const pushHistory = (key: string) => {
    const now = Date.now();
    if (key === lastKey && now - lastAt < 800) {
      lastAt = now;
      return;
    }
    lastKey = key;
    lastAt = now;
    const st = get();
    history.push({
      walls: st.walls,
      openings: st.openings,
      objects: st.objects,
      rooms: st.rooms,
      fixtures: st.fixtures,
    });
    if (history.length > HISTORY_MAX) history.shift();
    if (!st.canUndo) set({ canUndo: true });
  };

  /** Repart d'un plan vierge d'historique (nouveau scan, ouverture, revert). */
  const clearHistory = () => {
    history.length = 0;
    lastKey = '';
    set({ canUndo: false });
  };

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
            fixtures: st.fixtures,
            north: st.north ?? undefined,
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
    fixtures: [],
    north: null,
    canUndo: false,
    saves: [],
    folders: [],
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

    setRoomName: (roomId, name) => {
      pushHistory(`roomName:${roomId}`);
      set({
        rooms: get().rooms.map((r) =>
          r.id === roomId ? { ...r, name: name.trim() } : r,
        ),
        dirty: true,
      });
    },

    removeRoom: (roomId) => {
      const st = get();
      if (st.rooms.length <= 1) return;
      pushHistory('removeRoom');
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
        fixtures: st.fixtures.filter((f) => !doomed.has(f.wallId)),
        dirty: true,
      });
    },

    mergeRooms: (aId, bId) => {
      const st = get();
      pushHistory('mergeRooms');
      const a = st.rooms.find((r) => r.id === aId);
      const b = st.rooms.find((r) => r.id === bId);
      if (!a || !b || aId === bId) return;
      // La cloison commune cesse de border : elle devient intérieure à la
      // pièce réunie, et le contour se referme sur l'enveloppe des deux.
      const inA = new Set(a.wallIds ?? []);
      const inB = new Set(b.wallIds ?? []);
      const wallIds = [...new Set([...inA, ...inB])].filter(
        (id) => !(inA.has(id) && inB.has(id)),
      );
      set({
        rooms: st.rooms
          .filter((r) => r.id !== bId)
          .map((r) => (r.id === aId ? { ...r, wallIds } : r)),
        objects: st.objects.map((o) =>
          roomOf(o) === bId ? { ...o, roomId: aId } : o,
        ),
        dirty: true,
      });
    },

    splitRoom: (roomId) => {
      const st = get();
      pushHistory('splitRoom');
      const part = roomParts(st.walls, st.rooms).find((p) => p.roomId === roomId);
      if (!part?.surface) return;
      // Cloison posée en travers, perpendiculaire au grand axe et passant par
      // le point le plus au large. Ses deux bouts s'arrêtent EXACTEMENT sur
      // le contour : sans ça rien ne se soude, aucun nœud n'apparaît et la
      // redétection ne voit pas la coupure. On la déplace ensuite au doigt.
      const { angle } = roomExtent(part.surface.pts);
      const dir = { x: -Math.sin(angle), z: Math.cos(angle) };
      const a = castToOutline(part.labelAt, dir, part.surface.pts);
      const b = castToOutline(
        part.labelAt,
        { x: -dir.x, z: -dir.z },
        part.surface.pts,
      );
      if (!a || !b) return;
      const h = roomHeight(part.walls) || 2.5;
      const wall: WallSeg = {
        id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'wall',
        a,
        b,
        height: h,
        yCenter: h / 2,
      };
      set({ walls: [...st.walls, wall], dirty: true });
      get().redetectRooms();
    },

    straightenPlan: () => {
      const st = get();
      // Même clé que la redétection qui suit : les deux ne comptent que pour
      // une annulation, l'utilisateur n'a fait qu'un geste.
      pushHistory('redetect');
      const droits = straightenWalls(st.walls);
      set({
        walls: droits,
        // Les portes et fenêtres suivent leur mur : sans ça elles restaient
        // sur place, décalées, et le rendu ne les rattachait plus.
        openings: reprojectOpenings(st.walls, droits, st.openings),
        dirty: true,
      });
      get().redetectRooms();
    },

    redetectRooms: () => {
      const st = get();
      pushHistory('redetect');
      const olds = roomParts(st.walls, st.rooms);
      // Le graphe a pu changer (cloison ajoutée, coin déplacé) : on le
      // renettoie avant d'y rechercher les faces.
      const walls = mergeColinear(splitAtJunctions(weldCorners(st.walls)));
      const shapes = detectRooms(walls);
      if (shapes.length === 0) return;
      const floor = st.rooms[0]?.floor ?? null;
      const objects = st.objects.map((o) => ({
        ...o,
        roomId: `room-${roomIndexAt(
          { x: o.transform[12], z: o.transform[14] },
          shapes.map((s) => s.outline),
        ) + 1}`,
      }));
      const kinds = shapes.map((_, i) =>
        deduceRoomKind(
          objects
            .filter((o) => o.roomId === `room-${i + 1}`)
            .map((o) => o.category),
        ),
      );
      const auto = nameRooms(kinds);
      // Les noms donnés à la main survivent : on rattache chaque nouvelle
      // pièce à l'ancienne dont le point de cartouche tombe dedans.
      const rooms: RoomEntry[] = shapes.map((s, i) => {
        const previous = olds.find((p) => pointInPolygon(p.labelAt, s.outline));
        const kept = previous
          ? st.rooms.find((r) => r.id === previous.roomId)
          : undefined;
        return {
          id: `room-${i + 1}`,
          name: kept?.name || auto[i],
          wallIds: s.wallIds,
          kind: kinds[i] ?? undefined,
          floor,
        };
      });
      // Deux pièces peuvent hériter du même nom : on renumérote les doublons.
      const seen = new Map<string, number>();
      for (const r of rooms) {
        const n = (seen.get(r.name) ?? 0) + 1;
        seen.set(r.name, n);
        if (n > 1) r.name = `${r.name} ${n}`;
      }
      set({ walls, rooms, objects, dirty: true });
    },

    removeWall: (wallId) => {
      const st = get();
      pushHistory('removeWall');
      const walls = st.walls.filter((w) => w.id !== wallId);
      set({
        walls,
        rooms: st.rooms.map((r) => ({
          ...r,
          wallIds: r.wallIds?.filter((id) => id !== wallId),
        })),
        // Une ouverture sans mur d'accueil n'a plus de sens.
        openings: st.openings.filter((o) => nearestWall(o, walls).dist < 0.6),
        // Une prise non plus : elle était posée sur la face de ce mur.
        fixtures: st.fixtures.filter((f) => f.wallId !== wallId),
        dirty: true,
      });
    },

    addWallBetween: (a, b) => {
      const st = get();
      if (Math.hypot(b.x - a.x, b.z - a.z) < 0.2) return;
      pushHistory('addWall');
      const h = st.walls[0]?.height ?? 2.5;
      set({
        walls: [
          ...st.walls,
          {
            id: `mur-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'wall',
            a,
            b,
            height: h,
            yCenter: h / 2,
          },
        ],
        dirty: true,
      });
    },

    addFixture: (kind, wallId) => {
      const st = get();
      const wall = st.walls.find((w) => w.id === wallId);
      if (!wall) return null;
      pushHistory('addFixture');
      const id = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const f = newFixture(
        id,
        kind,
        wall,
        wallQuadsOf(st.walls).get(wallId),
        interiorSide(wall, st.walls, st.rooms),
      );
      set({ fixtures: [...st.fixtures, f], dirty: true });
      return id;
    },

    moveFixture: (id, along, height) => {
      const st = get();
      const f = st.fixtures.find((x) => x.id === id);
      const wall = f ? st.walls.find((w) => w.id === f.wallId) : null;
      if (!f || !wall) return;
      // Un appareil ne peut pas sortir de son mur : ses cotes sont bornées à
      // la face, demi-plaque comprise, et à la hauteur sous plafond.
      const face = wallFace(wall, wallQuadsOf(st.walls).get(wall.id), f.side);
      const spec = FIXTURES[f.kind];
      const hw = Math.min(spec.w / 2, face.len / 2);
      const hh = Math.min(spec.h / 2, wall.height / 2);
      const x = Math.max(hw, Math.min(face.len - hw, faceX(face, along)));
      pushHistory(`fixture:${id}`);
      set({
        fixtures: st.fixtures.map((o) =>
          o.id === id
            ? {
                ...o,
                along: fromFaceX(face, x),
                height: Math.max(hh, Math.min(wall.height - hh, height)),
              }
            : o,
        ),
        dirty: true,
      });
    },

    flipFixture: (id) => {
      pushHistory(`flip:${id}`);
      set({
        fixtures: get().fixtures.map((f) =>
          f.id === id ? { ...f, side: (f.side > 0 ? -1 : 1) as 1 | -1 } : f,
        ),
        dirty: true,
      });
    },

    removeFixture: (id) => {
      pushHistory('removeFixture');
      set({
        fixtures: get().fixtures.filter((f) => f.id !== id),
        dirty: true,
      });
    },

    undo: () => {
      const prev = history.pop();
      if (!prev) return;
      set({ ...prev, canUndo: history.length > 0, dirty: true });
    },

    setRoomHeight: (roomId, height) => {
      if (!(height > 1) || height > 6) return;
      const st = get();
      pushHistory('height');
      const ids = new Set(st.rooms.find((r) => r.id === roomId)?.wallIds ?? []);
      set({
        walls: st.walls.map((w) =>
          ids.has(w.id) ? { ...w, height, yCenter: height / 2 } : w,
        ),
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
      const objects: ObjectData[] = incomingObjects.map((o) => ({
        ...o,
        roomId: `room-${roomIndexAt(
          { x: o.transform[12], z: o.transform[14] },
          shapes.map((s) => s.outline),
        ) + 1}`,
      }));

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
          fixtures: [],
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
        fixtures: [],
        north: typeof r.north === 'number' ? r.north : undefined,
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
        fixtures: [],
        north: typeof r.north === 'number' ? r.north : null,
        saves,
        processing: false,
        scanning: false,
        screen: 'result',
      });
      clearHistory();
      persistSoon(saves);
    },

    /**
     * Déplace une extrémité de mur. Les extrémités soudées au même coin
     * (autres murs) suivent, et l'angle snappe à l'horizontale/verticale.
     */
    moveWallPoint: (id, end, p) => {
      pushHistory(`move:${id}:${end}`);
      const { walls } = get();
      const wall = walls.find((w) => w.id === id);
      if (!wall) return;
      const old = wall[end];
      const fixed = wall[end === 'a' ? 'b' : 'a'];
      // Le magnétisme se règle sur la trame du LOGEMENT, jamais sur les axes
      // du repère ARKit — ceux-ci dépendent de l'endroit où le scan a
      // commencé, et le magnétisme ne se déclenchait alors que par hasard.
      const frame = planFrameAngle(walls);
      // D'abord l'alignement sur un mur voisin, puis l'équerre : ainsi un
      // coin tiré « à peu près » dans le prolongement d'un autre mur s'y
      // pose vraiment, au lieu d'un plan qui paraît droit sans l'être.
      const aligned = snapToNeighbours(p, walls, frame, 0.12, old);
      const snapped = snapAngle(fixed, aligned, 5, frame);
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
      pushHistory('addOpening');
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

    resizeOpening: (id, width, height) => {
      const st = get();
      const o = st.openings.find((x) => x.id === id);
      if (!o) return;
      pushHistory(`opening:${id}`);
      const len = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) || 1;
      const ux = (o.b.x - o.a.x) / len;
      const uz = (o.b.z - o.a.z) / len;
      const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
      const l = width !== undefined ? Math.max(0.1, Math.min(6, width)) : len;
      const h =
        height !== undefined ? Math.max(0.2, Math.min(3, height)) : o.height;
      // L'allège ne bouge pas : c'est le linteau qui monte ou descend.
      const base = o.yCenter - o.height / 2;
      set({
        openings: st.openings.map((x) =>
          x.id === id
            ? {
                ...x,
                a: { x: mid.x - (ux * l) / 2, z: mid.z - (uz * l) / 2 },
                b: { x: mid.x + (ux * l) / 2, z: mid.z + (uz * l) / 2 },
                height: h,
                yCenter: base + h / 2,
              }
            : x,
        ),
        dirty: true,
      });
    },

    removeOpening: (id) => {
      pushHistory('removeOpening');
      set({
        openings: get().openings.filter((o) => o.id !== id),
        dirty: true,
      });
    },

    addObject: (item, x, z) => {
      const st = get();
      pushHistory('addObject');
      const id = `mb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      set({
        objects: [
          ...st.objects,
          {
            id,
            category: item.category,
            width: item.w,
            depth: item.d,
            height: item.h,
            transform: catalogTransform(item, x, z),
          },
        ],
        dirty: true,
      });
      return id;
    },

    rotateObject: (id, quarts = 1) => {
      pushHistory(`rotate:${id}`);
      set({
        objects: get().objects.map((o) => {
          if (o.id !== id) return o;
          const t = [...o.transform];
          const yaw = Math.atan2(t[2], t[0]) + (Math.PI / 2) * quarts;
          const cos = Math.cos(yaw);
          const sin = Math.sin(yaw);
          t[0] = cos;
          t[2] = sin;
          t[8] = -sin;
          t[10] = cos;
          return { ...o, transform: t };
        }),
        dirty: true,
      });
    },

    setObjectYaw: (id, yaw) => {
      pushHistory(`yaw:${id}`);
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      set({
        objects: get().objects.map((o) => {
          if (o.id !== id) return o;
          const t = [...o.transform];
          t[0] = cos;
          t[2] = sin;
          t[8] = -sin;
          t[10] = cos;
          return { ...o, transform: t };
        }),
        dirty: true,
      });
    },

    removeObject: (id) => {
      pushHistory('removeObject');
      set({ objects: get().objects.filter((o) => o.id !== id), dirty: true });
    },

    /**
     * Déplace un meuble, avec **attraction des murs**.
     *
     * Un meuble se pose presque toujours contre un mur, et le poser au
     * pixel près au doigt est pénible. Dès que son dos passe à moins de
     * 30 cm d'un mur, il s'y colle et s'aligne dessus : le dos contre le
     * nu, la face vers la pièce. Au-delà, il reste exactement où le doigt
     * l'a laissé — l'aimant aide, il ne décide pas.
     */
    setObjectCenter: (id, x, z) => {
      pushHistory(`moveObject:${id}`);
      const st = get();
      const obj = st.objects.find((o) => o.id === id);
      if (!obj) return;
      const parts = roomParts(st.walls, st.rooms);
      const part =
        parts.find((p) => pointInPolygon({ x, z }, p.surface?.pts ?? [])) ??
        parts.find((p) => p.roomId === roomOf(obj));
      let pose = { x, z, yaw: Math.atan2(obj.transform[2], obj.transform[0]) };
      const demi = obj.depth / 2 + WALL_T / 2;
      let best: { d: number; w: WallSeg } | null = null;
      for (const w of part?.walls ?? st.walls) {
        const { dist } = pointOnSeg({ x, z }, w.a, w.b);
        if (dist > demi + 0.3) continue;
        if (!best || dist < best.d) best = { d: dist, w };
      }
      // L'aimant ne DÉCIDE pas de l'orientation.
      //
      // Il collait le meuble au mur et lui imposait son angle à chaque
      // déplacement. Dans une chambre de 2,44 m, un lit de 1,90 est à moins
      // de 30 cm d'un mur PARTOUT : il restait donc collé en permanence, et
      // toute rotation à la main était effacée au premier glissement. On ne
      // s'aimante plus que si le meuble regarde DÉJÀ à peu près dans le bon
      // sens — à 30° près. Au-delà, l'utilisateur veut visiblement autre
      // chose, et on lui laisse la main.
      if (best) {
        const w = best.w;
        const len = segLength(w) || 1;
        const u = { x: (w.b.x - w.a.x) / len, z: (w.b.z - w.a.z) / len };
        let n = perpOf(u);
        // La normale doit regarder l'intérieur de la pièce : c'est de ce
        // côté-là que le meuble se pose.
        const mid = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
        const dedans = part?.labelAt ?? { x, z };
        if ((dedans.x - mid.x) * n.x + (dedans.z - mid.z) * n.z < 0) {
          n = { x: -n.x, z: -n.z };
        }
        // Projection sur l'axe du mur, puis recul d'une demi-profondeur.
        const t = ((x - w.a.x) * u.x + (z - w.a.z) * u.z) / len;
        const sur = {
          x: w.a.x + u.x * len * Math.max(0, Math.min(1, t)),
          z: w.a.z + u.z * len * Math.max(0, Math.min(1, t)),
        };
        const vise = Math.atan2(-n.x, n.z);
        let ecart = Math.abs(((pose.yaw - vise + Math.PI) % (2 * Math.PI)) - Math.PI);
        if (ecart > Math.PI) ecart = 2 * Math.PI - ecart;
        if (ecart < (30 * Math.PI) / 180) {
          pose = {
            x: sur.x + n.x * demi,
            z: sur.z + n.z * demi,
            // Dos au mur : l'axe de profondeur du meuble (z local) regarde
            // la pièce, ce qui donne cet angle-là.
            yaw: vise,
          };
        }
      }
      const cos = Math.cos(pose.yaw);
      const sin = Math.sin(pose.yaw);
      set({
        objects: st.objects.map((o) => {
          if (o.id !== id) return o;
          const t = [...o.transform];
          t[0] = cos;
          t[2] = sin;
          t[8] = -sin;
          t[10] = cos;
          t[12] = pose.x;
          t[14] = pose.z;
          return { ...o, transform: t };
        }),
        dirty: true,
      });
    },

    resizeObject: (id, width, depth) => {
      if (width <= 0 || depth <= 0) return;
      pushHistory(`resize:${id}`);
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
        fixtures: migrated.fixtures ?? [],
        dirty: false,
      });
      clearHistory();
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
        fixtures: st.fixtures,
        north: st.north ?? undefined,
      };
      const saves = [save, ...st.saves];
      set({ saves, currentSaveId: save.id, scanName: clean, dirty: false });
      persistSoon(saves);
    },

    addFolder: (name) => {
      const id = `dos-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const folders = [
        ...get().folders,
        { id, name: name?.trim() || `Dossier ${get().folders.length + 1}` },
      ];
      set({ folders });
      AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders)).catch(() => {});
      return id;
    },

    renameFolder: (id, name) => {
      const clean = name.trim();
      if (!clean) return;
      const folders = get().folders.map((f) =>
        f.id === id ? { ...f, name: clean } : f,
      );
      set({ folders });
      AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders)).catch(() => {});
    },

    removeFolder: (id) => {
      const folders = get().folders.filter((f) => f.id !== id);
      // Supprimer un dossier ne supprime pas ce qu'il contient : les scans
      // remontent à la racine, où on les retrouve.
      const saves = get().saves.map((s) =>
        s.folderId === id ? { ...s, folderId: undefined } : s,
      );
      set({ folders, saves });
      AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders)).catch(() => {});
      persistSoon(saves);
    },

    moveToFolder: (scanId, folderId) => {
      const saves = get().saves.map((s) =>
        s.id === scanId ? { ...s, folderId: folderId ?? undefined } : s,
      );
      set({ saves });
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
        const dossiers = await AsyncStorage.getItem(FOLDERS_KEY);
        if (dossiers) {
          const parsed = JSON.parse(dossiers) as ScanFolder[];
          if (Array.isArray(parsed)) set({ folders: parsed });
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
        fixtures: save.fixtures ?? [],
        north: save.north ?? null,
        dirty: false,
        resultOrigin: 'library',
        screen: 'result',
      });
      clearHistory();
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
        fixtures: [],
        north: null,
      }),
  };
});

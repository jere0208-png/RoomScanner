import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deletePhotoFiles } from '../ui/photos';
import {
  insetOnRing,
  type CeilingFixture,
  type CeilingKind,
  type SpotAxis,
} from '../geometry/ceiling';
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
  alignToFit,
  fitInNook,
  pushOutOfObjects,
  separerMeubles,
  hugWall,
  pushOutOfWalls,
  snapSideToWalls,
  roomExtent,
  roomHeight,
  roomOf,
  roomParts,
  WALL_T,
  planFrameAngle,
  reprojectOpenings,
  segLength,
  snapAngle,
  snapToNeighbours,
  splitAtJunctions,
  straightenWalls,
  toSegment,
  wallQuadsOf,
  wallRuns,
  weldCorners,
  type Pt,
  type WallSeg,
} from '../geometry/floorplan';
import {
  catalogTransform,
  type CatalogItem,
} from '../geometry/catalogue';
import {
  FIXTURES,
  ENTRAXE,
  faceX,
  fromFaceX,
  masonryRuns,
  snapToMasonry,
  interiorSide,
  newFixture,
  reprojectAnchors,
  reprojectFixtures,
  overlaps,
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

/**
 * Photo de repérage, punaisée sur un mur.
 *
 * Un relevé se fait vite ; sa relecture, trois jours plus tard, achoppe
 * toujours sur la même question — « c'était quoi, ce mur ? ». Le chemin
 * pointe un fichier des Documents de l'app : il ne survit PAS à une
 * réinstallation, comme le `.usdz` du scan, et l'app doit donc supporter
 * qu'il ait disparu.
 */
export interface ScanPhoto {
  id: string;
  wallId: string;
  /** Cote sur le mur (m depuis A), pour la punaise du plan. */
  along: number;
  path: string;
  /** Horodatage de la prise de vue. */
  at: number;
}

/** Ce qu'un brouillon retient : de quoi reprendre là où l'on s'est arrêté. */
export interface BrouillonScan {
  /** Horodatage de l'écriture : c'est lui qu'on montre à l'utilisateur. */
  at: number;
  name: string;
  walls: WallSeg[];
  openings: WallSeg[];
  objects: ObjectData[];
  rooms: RoomEntry[];
  fixtures: Fixture[];
  ceiling: CeilingFixture[];
  photos: ScanPhoto[];
  modelPath: string | null;
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
  /** Photos de repérage. Absentes des scans d'avant. */
  photos?: ScanPhoto[];
  /** Appareils de plafond — points lumineux, détecteurs, VMC. */
  ceiling?: CeilingFixture[];
  /** Dossier qui contient ce scan. Absent = à la racine. */
  folderId?: string;
  /**
   * À QUI EST CE RELEVÉ : le client, et l'adresse du chantier.
   *
   * Un scan ne s'appelait que « Scan du 17/08 à 11h54 ». À trente relevés,
   * plus personne ne sait lequel est le T3 de la rue Pasteur — et le
   * dossier remis au client ne portait que le nom du fichier, là où un
   * devis porte toujours le nom de celui qui le reçoit.
   */
  client?: string;
  address?: string;
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
/**
 * DÉSENCHÊTRE LE MOBILIER D'UN RELEVÉ.
 *
 * Appelé à l'ouverture d'un scan, une fois pour toutes : deux meubles que le
 * scanner a fait se traverser sont écartés du strict nécessaire. Voir
 * `separerMeubles` pour les trois garde-fous — chevauchement franc seulement,
 * le plus petit cède, jamais plus que la pénétration.
 *
 * C'est une modification du relevé, demandée en connaissance de cause : sur le
 * modèle, une table qui traverse un canapé coûte plus cher en crédibilité
 * qu'un meuble déplacé de trois centimètres.
 */
function separerLeMobilier(objects: ObjectData[]): ObjectData[] {
  if (objects.length < 2) return objects;
  const bouges = separerMeubles(
    objects.map((o) => ({
      cx: o.transform[12],
      cz: o.transform[14],
      width: o.width,
      depth: o.depth,
      yaw: Math.atan2(o.transform[2], o.transform[0]),
      y0: o.transform[13] - o.height / 2,
      y1: o.transform[13] + o.height / 2,
    })),
  );
  if (bouges.length === 0) return objects;
  const suite = objects.map((o) => o);
  for (const b of bouges) {
    const o = suite[b.index];
    const t = [...o.transform];
    t[12] += b.dx;
    t[14] += b.dz;
    suite[b.index] = { ...o, transform: t };
  }
  return suite;
}

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

/**
 * L'ancienne clé : TOUTE la bibliothèque dans une seule chaîne JSON.
 *
 * Elle n'est plus écrite, seulement lue une dernière fois pour reprendre les
 * scans d'avant. On la garde nommée ici : un jour où l'autre quelqu'un se
 * demandera pourquoi il traîne une clé « v1 » dans le stockage.
 */
const STORAGE_KEY = 'roomscanner.saves.v1';
/** L'ordre des scans. Le contenu, lui, vit une clé par scan. */
const INDEX_KEY = 'roomscanner.index.v2';
const scanKey = (id: string) => `roomscanner.scan.v2.${id}`;
/**
 * LE BROUILLON — le relevé en cours, écrit sans qu'on le demande.
 *
 * Un scan tenait entièrement en mémoire tant qu'on n'avait pas touché
 * « Enregistrer ». Une app tuée par le système — un appel, une photo, un
 * téléphone à court de mémoire — et la visite était à refaire. C'est le seul
 * défaut de cette application qui coûte un déplacement.
 *
 * Il ne remplace pas la bibliothèque : c'est un filet, effacé dès que le
 * relevé est enregistré pour de bon.
 */
const DRAFT_KEY = 'roomscanner.brouillon.v1';
const FOLDERS_KEY = 'roomscanner.folders.v1';
const THEME_KEY = 'roomscanner.themePref.v1';
const COLORS_KEY = 'roomscanner.openingColors.v1';
const FURNITURE_KEY = 'roomscanner.showFurniture.v1';
const SURFACES_KEY = 'roomscanner.showSurfaces.v1';
const TEXTURES_KEY = 'roomscanner.showTextures.v1';

export type ThemePref = 'light' | 'dark';

/**
 * Ce qui est déjà sur le disque, par scan. Sert à n'écrire QUE ce qui change.
 */
const ecrits = new Map<string, string>();
/** Remis à zéro par l'hydratation, et par les tests qui repartent à neuf. */
export function resetPersistCache() {
  ecrits.clear();
}

/**
 * Relit la bibliothèque, et reprend au passage celle de l'ancien format.
 *
 * L'ancienne clé unique est lue une dernière fois, éclatée en une clé par
 * scan, puis effacée — mais seulement après que tout a été réécrit. Une
 * migration qui efface avant d'avoir fini est une migration qui perd des
 * données le jour où le téléphone s'éteint au mauvais moment.
 */
async function loadLibrary(): Promise<SavedScan[] | null> {
  const index = await AsyncStorage.getItem(INDEX_KEY);
  if (index) {
    const ids = JSON.parse(index) as string[];
    if (!Array.isArray(ids)) return null;
    const out: SavedScan[] = [];
    for (const id of ids) {
      const raw = await AsyncStorage.getItem(scanKey(id));
      if (!raw) continue;
      try {
        out.push(JSON.parse(raw) as SavedScan);
        ecrits.set(id, raw);
      } catch {
        // Un scan corrompu est sauté, les autres restent lisibles — c'est
        // tout l'intérêt de ne plus tout mettre dans la même chaîne.
      }
    }
    return out;
  }

  // --------------------------------------------- reprise de l'ancien format
  const legacy = await AsyncStorage.getItem(STORAGE_KEY);
  if (!legacy) return null;
  const saves = JSON.parse(legacy) as SavedScan[];
  if (!Array.isArray(saves)) return null;
  for (const s of saves) {
    const json = JSON.stringify(s);
    await AsyncStorage.setItem(scanKey(s.id), json);
    ecrits.set(s.id, json);
  }
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(saves.map((s) => s.id)));
  await AsyncStorage.removeItem(STORAGE_KEY);
  return saves;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * Enregistrer un scan ne réécrit plus la bibliothèque entière.
 *
 * Tout tenait dans une seule clé : renommer un scan de 40 ko en réécrivait
 * trente autres avec lui, à chaque sauvegarde, soit plusieurs mégaoctets
 * sérialisés puis écrits sur le disque pour un mot changé. Sur un iPhone
 * chargé de relevés, ça se sent — et c'est le genre d'écriture qui, coupée
 * en plein vol, emporte la bibliothèque plutôt qu'un scan.
 *
 * Désormais : une clé par scan, plus un index qui donne l'ordre. On compare
 * au dernier état écrit et on ne touche qu'aux scans réellement modifiés.
 */
/**
 * UNE ÉCRITURE PERDUE SE DIT.
 *
 * Le disque d'un téléphone se remplit, et le stockage de l'app a ses limites :
 * un relevé chargé en photos peut ne PAS s'écrire. Jusqu'ici, l'échec était
 * avalé en silence — trois `catch` vides — et l'électricien repartait du
 * chantier en croyant son dossier enregistré. C'est le seul défaut de cette
 * application qui pouvait lui coûter une visite entière.
 *
 * Le store porte donc un témoin d'échec, que l'écran affiche. On ne prévient
 * qu'UNE FOIS par incident : une alerte à chaque tentative rendrait l'app
 * inutilisable précisément au moment où il faut sauver ce qui peut l'être.
 */
export type PanneEcriture = { quand: number; message: string } | null;
let signalerPanne: (p: PanneEcriture) => void = () => {};

/**
 * TOUTES LES TRENTE SECONDES, PAS PLUS SOUVENT.
 *
 * Un relevé produit des murs en continu ; écrire à chaque image userait le
 * stockage pour rien. Trente secondes, c'est ce qu'on accepte de refaire —
 * quelques pas dans un couloir — et c'est assez rare pour ne pas peser sur
 * la cadence du scan.
 */
const DRAFT_PERIODE = 30000;
let draftTimer: ReturnType<typeof setInterval> | null = null;
/** Ce qui est déjà écrit : on ne réécrit pas un relevé qui n'a pas bougé. */
let draftEcrit = '';

function arreterBrouillon() {
  if (draftTimer) clearInterval(draftTimer);
  draftTimer = null;
}

function persistSoon(saves: SavedScan[]) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      const vus = new Set<string>();
      for (const s of saves) {
        vus.add(s.id);
        const json = JSON.stringify(s);
        if (ecrits.get(s.id) === json) continue;
        ecrits.set(s.id, json);
        AsyncStorage.setItem(scanKey(s.id), json).catch((e) => {
          // Écriture perdue : on oublie ce qu'on croyait avoir écrit, la
          // prochaine sauvegarde réessaiera — et on le DIT.
          ecrits.delete(s.id);
          signalerPanne({
            quand: Date.now(),
            message:
              `« ${s.name} » n'a pas pu être enregistré : ` +
              `${e?.message ?? 'stockage indisponible'}. ` +
              'Libérez de la place, puis touchez Enregistrer.',
          });
        });
      }
      for (const id of [...ecrits.keys()]) {
        if (vus.has(id)) continue;
        ecrits.delete(id);
        AsyncStorage.removeItem(scanKey(id)).catch(() => {});
      }
      AsyncStorage.setItem(
        INDEX_KEY,
        JSON.stringify(saves.map((s) => s.id)),
      ).catch((e) => {
        signalerPanne({
          quand: Date.now(),
          message:
            `La liste des scans n'a pas pu être écrite : ` +
            `${e?.message ?? 'stockage indisponible'}.`,
        });
      });
    } catch {
      // Un scan illisible ne doit pas emporter les autres.
    }
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
  photos: ScanPhoto[];
  ceiling: CeilingFixture[];
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
  /** Client et adresse du chantier courant (vides = non renseignés). */
  client: string;
  address: string;
  currentSaveId: string | null;
  /** Modifications du plan non enregistrées (bouton de sauvegarde visible). */
  dirty: boolean;
  /** Pièces du scan courant, dans l'ordre de capture. */
  rooms: RoomEntry[];
  /** Renomme une pièce ; nom vide = plus de cartouche nommé. */
  setRoomName: (roomId: string, name: string) => void;
  /** Retire une pièce du scan (sa géométrie part avec elle). */
  removeRoom: (roomId: string) => void;
  /**
   * DÉPLACE UNE PIÈCE ENTIÈRE, avec ce qu'elle porte.
   *
   * Une pièce ajoutée tombe à côté du plan : il faut pouvoir la pousser
   * contre celle qui la jouxte. On translate donc ses murs, son mobilier,
   * son appareillage et ses points lumineux d'un bloc — tout ce qui la
   * compose reste à sa place DANS la pièce.
   *
   * Et à l'arrivée, elle S'AIMANTE : si l'un de ses murs se retrouve à
   * moins de vingt-cinq centimètres d'un mur parallèle du plan, elle se cale
   * dessus exactement. C'est ce qui permet de construire un appartement sans
   * jamais viser au pixel.
   *
   * Une pièce qui PARTAGE déjà un mur ne bouge pas : la déplacer
   * déchirerait sa voisine. Elle est déjà à sa place, par construction.
   */
  moveRoom: (roomId: string, dx: number, dz: number) => void;
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
  /**
   * AJOUTE UNE PIÈCE RECTANGULAIRE au plan, et rend son identifiant.
   *
   * Un logement ne se scanne pas toujours d'un trait : on relève le séjour,
   * on est appelé ailleurs, on revient pour la chambre. Jusqu'ici, la seule
   * porte de sortie était « Nouveau scan » — qui efface tout. On pose donc
   * une pièce de la taille demandée, accolée au plan existant, qu'on ajuste
   * ensuite au doigt comme n'importe quel mur.
   */
  addRoomBox: (
    largeur: number,
    profondeur: number,
    nom: string,
    /**
     * LE MUR CONTRE LEQUEL ON L'ACCOLE, s'il y en a un.
     *
     * C'est ce qui permet de bâtir un appartement de proche en proche :
     * on touche un mur, on ajoute une pièce, elle se pose de l'autre côté
     * en PARTAGEANT ce mur — pas à côté, pas par-dessus, accolée. Le mur
     * mitoyen appartient alors aux deux pièces, comme dans un vrai
     * logement, et la cloison ne se dessine qu'une fois.
     */
    contreWallId?: string | null,
  ) => string;
  /** Appareillage électrique posé sur les murs (prises, commandes, RJ45…). */
  fixtures: Fixture[];
  /** Cap du scan : d'où vient le nord. `null` = boussole muette. */
  north: number | null;
  /**
   * Pose un appareil sur un mur, à 20 cm du coin bas gauche de la face qui
   * regarde la pièce. Renvoie son identifiant, pour l'ouvrir aussitôt.
   */
  /**
   * Pose un appareil sur un mur.
   *
   * `at` vise une abscisse précise SUR LA FACE, en mètres : c'est ce que
   * donne un retour de mur choisi au plan. Sans elle, l'appareil se pose au
   * milieu, comme avant.
   */
  addFixture: (kind: FixtureKind, wallId: string, at?: number) => string | null;
  /** Déplace un appareil sur sa face : cote depuis le bord, hauteur d'axe. */
  moveFixture: (id: string, along: number, height: number) => void;
  /** Bascule l'appareil sur l'autre face du mur, sans le déplacer. */
  flipFixture: (id: string) => void;
  /**
   * Réunit deux appareils sous une même plaque : le second se pose à
   * l'entraxe du premier, du côté demandé. Le premier ne bouge pas.
   */
  joinFixtures: (movedId: string, baseId: string, along: number, height: number) => void;
  /**
   * Repose les DEUX appareils d'un ensemble d'un coup.
   *
   * Choisir « ensemble centré » déplace aussi le premier : il faut donc
   * pouvoir écrire les deux positions dans la même retouche, sinon
   * l'annulation en défait la moitié.
   */
  placeAssembly: (
    baseId: string,
    movedId: string,
    base: { along: number; height: number },
    moved: { along: number; height: number },
  ) => void;
  /** Sort un appareil de son ensemble et l'écarte franchement. */
  splitFixture: (id: string, along: number) => void;
  /** Photos de repérage du scan courant. */
  /**
   * Le PLAFOND : points lumineux, détecteurs, caméras, bouches de VMC.
   *
   * Une liste à part de l'appareillage mural, parce que ce n'est pas le
   * même objet : un appareil de plafond se repère à deux coordonnées dans
   * la pièce, pas sur une face de mur à une hauteur.
   */
  ceiling: CeilingFixture[];
  /** Pose un appareil au plafond, dans la pièce dont on donne le contour. */
  addCeiling: (
    kind: CeilingKind,
    roomId: string,
    at: Pt,
    /** La ligne à laquelle il appartient, quand on pose en série. */
    ligne?: { row: string; axe: SpotAxis },
  ) => string;
  moveCeiling: (id: string, at: Pt) => void;
  removeCeiling: (id: string) => void;
  /** Repose toute une ligne de spots : nouvelles places, nouvel axe. */
  setCeilingRow: (row: string, pts: Pt[], axe: SpotAxis) => void;
  /** Retire la ligne entière, d'un seul repentir. */
  removeCeilingRow: (row: string) => void;
  /**
   * Relie une commande murale à un point de plafond, ou défait le lien.
   *
   * C'est LE trait du plan d'électricien : celui qui dit quel interrupteur
   * allume quoi. Sans lui, un plan montre six commandes et huit points sans
   * jamais dire lequel va avec lequel.
   */
  toggleCeilingCommand: (ceilingId: string, fixtureId: string) => void;
  photos: ScanPhoto[];
  /** Punaise une photo sur un mur, à la cote donnée. */
  addPhoto: (wallId: string, along: number, path: string) => string;
  removePhoto: (id: string) => void;
  /**
   * Presse-papier d'appareillage : le relevé d'un mur, cotes comprises.
   *
   * Dans un couloir ou une chambre symétrique, on repose trois fois le même
   * équipement, à la même cote du coin. Le refaire à la main, c'est trois
   * fois l'occasion de se tromper d'un centimètre.
   */
  wallClip: { from: string; items: { kind: FixtureKind; x: number; height: number; group?: string }[] } | null;
  /** Relève l'appareillage d'un mur (face intérieure). */
  copyWallFixtures: (wallId: string) => number;
  /** Repose le relevé sur un autre mur. Renvoie le nombre d'appareils posés. */
  pasteWallFixtures: (wallId: string) => number;
  /**
   * Un appareil vient d'être rangé à côté d'un autre, sous une plaque
   * commune : l'écran de face le propose à l'utilisateur, qui choisit le
   * côté ou recentre l'ensemble. Consommé une fois lu.
   */
  pendingJoin: { moved: string; base: string } | null;
  clearPendingJoin: () => void;
  /**
   * Oriente le plan à la main, quand le scan n'a pas de cap.
   *
   * Les relevés d'avant la boussole n'en ont pas, et refaire le scan d'un
   * appartement pour une aiguille serait absurde. La valeur suit la même
   * convention que celle du magnétomètre : cap de l'axe −Z du repère de
   * scan, en degrés horaires depuis le nord.
   */
  setNorth: (deg: number | null) => void;
  /** Renseigne le client et l'adresse du chantier courant. */
  setClientInfo: (client: string, address: string) => void;
  /** Renomme une entrée de la bibliothèque sans l'ouvrir. */
  renameSave: (id: string, name: string) => void;
  /** Copie une entrée : même plan, autre nom, autre vie. */
  duplicateSave: (id: string) => void;
  /**
   * Remet l'appareillage tel qu'il était — pour abandonner ce qu'on vient
   * de poser sur un mur sans toucher au reste du plan.
   */
  restoreFixtures: (list: Fixture[]) => void;
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
  /**
   * Murs pleins en 3D, ou écorché.
   *
   * L'écorché efface le mur qui nous fait face pour montrer la pièce ; c'est
   * le bon réglage neuf fois sur dix, mais pas quand on veut juger un volume
   * bâti ou montrer une façade. Le choix reste donc à l'utilisateur.
   */
  solidWalls: boolean;
  toggleSolidWalls: () => void;
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
  /**
   * La dernière écriture qui a échoué, tant que l'électricien ne l'a pas lue.
   * `null` = tout va bien.
   */
  panne: PanneEcriture;
  /** Il a lu l'avertissement : on l'oublie jusqu'au prochain incident. */
  oublierPanne: () => void;
  removeObject: (id: string) => void;
  /** Pose en une fois ce que « Normes auto » propose. */
  poserDAuto: (fixtures: Fixture[], ceiling: CeilingFixture[]) => void;
  /**
   * Pose le meuble à cet endroit.
   *
   * `aimant` commande le PLAQUAGE : au doigt il vaut mieux le garder — on
   * vise à peu près, et un jour de trois centimètres contre un mur n'existe
   * pas sur un chantier. À la flèche, non : le pas d'un centimètre est une
   * demande explicite, et l'aimant le reprenait aussitôt. Le meuble revenait
   * se coller, et le bouton paraissait mort.
   */
  setObjectCenter: (id: string, x: number, z: number, aimant?: boolean) => void;
  resizeObject: (id: string, width: number, depth: number) => void;
  /**
   * ÉTIRE UN MEUBLE PAR UN DE SES CÔTÉS, le côté opposé restant en place.
   *
   * C'est le geste du mètre ruban : on prend un bord et on le tire. Régler
   * une largeur au clavier oblige à faire le calcul dans sa tête — on veut
   * que le meuble aille JUSQU'AU MUR, pas qu'il fasse 1,47 m.
   *
   * `cote` désigne le bord tiré dans le repère du meuble : `largeur+` est
   * celui vers lequel pointe son axe de largeur, `profondeur-` le bord
   * arrière. `distance` est le déplacement de ce bord, en mètres, compté
   * vers l'extérieur : positif, le meuble grandit.
   *
   * Le bord s'accroche au nu des murs qu'il longe (voir `snapSideToWalls`) :
   * viser l'affleurement au doigt, à trois millimètres près, n'est pas un
   * geste humain.
   */
  resizeObjectSide: (
    id: string,
    cote: 'largeur+' | 'largeur-' | 'profondeur+' | 'profondeur-',
    distance: number,
  ) => { accroche: boolean };
  /** Abandonne les modifications : recharge la dernière sauvegarde. */
  revertCurrent: () => void;
  /**
   * Le relevé retrouvé au démarrage, en attente d'une réponse.
   *
   * `null` = rien à reprendre. Sinon, l'écran d'accueil le propose : c'est
   * un choix, jamais une reprise d'office — l'utilisateur peut avoir quitté
   * volontairement un essai raté.
   */
  brouillon: BrouillonScan | null;
  /** Écrit le relevé en cours. Appelée par la minuterie, et à la demande. */
  ecrireBrouillon: () => void;
  /** Reprend le relevé retrouvé : il redevient le scan courant. */
  reprendreBrouillon: () => void;
  /** Jette le brouillon : la question ne se reposera plus. */
  oublierBrouillon: () => void;
  loadSaves: () => Promise<void>;
  openSave: (id: string) => void;
  deleteSave: (id: string) => void;
  reset: () => void;
}

/** Altitude du sol : le pied du mur le plus bas. */
const solDe = (walls: WallSeg[]) =>
  walls.length > 0
    ? Math.min(...walls.map((w) => w.yCenter - w.height / 2))
    : 0;

export const useScanStore = create<ScanState>((set, get) => {
  // Le pont entre l'écriture différée — qui vit hors du store — et l'état que
  // l'écran observe. Une seule alerte par incident : voir `persistSoon`.
  signalerPanne = (p) => {
    if (p && get().panne) return;
    set({ panne: p });
  };
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
      photos: st.photos,
      ceiling: st.ceiling,
    });
    if (history.length > HISTORY_MAX) history.shift();
    if (!st.canUndo) set({ canUndo: true });
  };

  /**
   * La profondeur d'historique au moment du dernier enregistrement.
   *
   * C'est elle qui dit si le plan a VRAIMENT changé. `dirty` était posé à
   * vrai par chaque retouche et jamais repris : en annulant jusqu'à
   * revenir à l'état enregistré, le bouton de sauvegarde restait affiché,
   * proposant d'enregistrer ce qui l'était déjà. Comparer la profondeur
   * répond exactement à la question — et sans effacer l'historique, donc
   * sans priver d'annulation ce qui a été fait avant la sauvegarde.
   */
  let savedDepth = 0;

  /** Repart d'un plan vierge d'historique (nouveau scan, ouverture, revert). */
  const clearHistory = () => {
    history.length = 0;
    lastKey = '';
    savedDepth = 0;
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
            client: st.client || undefined,
            address: st.address || undefined,
            rooms: st.rooms,
            walls: st.walls,
            openings: st.openings,
            objects: st.objects,
            fixtures: st.fixtures,
            photos: st.photos,
            ceiling: st.ceiling,
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
    brouillon: null,
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
    client: '',
    address: '',
    currentSaveId: null,
    pendingJoin: null,
    wallClip: null,
    photos: [],
    ceiling: [],
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
    solidWalls: false,
    toggleSolidWalls: () => set({ solidWalls: !get().solidWalls }),
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

    moveRoom: (roomId, dx, dz) => {
      const st = get();
      const piece = st.rooms.find((r) => r.id === roomId);
      if (!piece) return;
      const aMoi = new Set(
        piece.wallIds ??
          st.walls.filter((w) => roomOf(w) === roomId).map((w) => w.id),
      );
      if (aMoi.size === 0) return;
      // Un mur porté par une AUTRE pièce est mitoyen : on ne déplace pas.
      const partage = st.rooms.some(
        (r) => r.id !== roomId && (r.wallIds ?? []).some((id) => aMoi.has(id)),
      );
      if (partage) return;

      /**
       * L'AIMANT : on cherche le petit réajustement qui aligne.
       *
       * Pour chaque mur déplacé et chaque mur du reste du plan, s'ils sont
       * PARALLÈLES et que leurs projections se recouvrent, l'écart
       * perpendiculaire donne le décalage à rattraper. On garde le plus
       * petit, et on ne l'applique que sous vingt-cinq centimètres : au-delà,
       * c'est que l'électricien voulait bien poser la pièce là.
       */
      const AIMANT = 0.25;
      const bouges = st.walls
        .filter((w) => aMoi.has(w.id))
        .map((w) => ({
          a: { x: w.a.x + dx, z: w.a.z + dz },
          b: { x: w.b.x + dx, z: w.b.z + dz },
        }));
      const autres = st.walls.filter((w) => !aMoi.has(w.id));
      let cale = { x: 0, z: 0 };
      let mieux = AIMANT;
      for (const m of bouges) {
        const lm = Math.hypot(m.b.x - m.a.x, m.b.z - m.a.z) || 1;
        const um = { x: (m.b.x - m.a.x) / lm, z: (m.b.z - m.a.z) / lm };
        for (const o of autres) {
          const lo = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) || 1;
          const uo = { x: (o.b.x - o.a.x) / lo, z: (o.b.z - o.a.z) / lo };
          // Parallèles ? Le produit vectoriel des directions est nul.
          if (Math.abs(um.x * uo.z - um.z * uo.x) > 0.08) continue;
          // Les projections se recouvrent-elles ? Sinon les murs sont
          // alignés mais bout à bout, et il n'y a rien à aimanter.
          const t = (p: Pt) => (p.x - o.a.x) * uo.x + (p.z - o.a.z) * uo.z;
          const t0 = Math.min(t(m.a), t(m.b));
          const t1 = Math.max(t(m.a), t(m.b));
          if (t1 < -0.2 || t0 > lo + 0.2) continue;
          // L'écart perpendiculaire, signé.
          const n = { x: -uo.z, z: uo.x };
          const e = (m.a.x - o.a.x) * n.x + (m.a.z - o.a.z) * n.z;
          if (Math.abs(e) < mieux && Math.abs(e) > 1e-9) {
            mieux = Math.abs(e);
            cale = { x: -n.x * e, z: -n.z * e };
          }
        }
      }
      const ddx = dx + cale.x;
      const ddz = dz + cale.z;

      /**
       * PUIS LA SOUDURE : deux murs superposés n'en font plus qu'un.
       *
       * L'aimant colle la pièce contre sa voisine — et laisse DEUX
       * maçonneries au même endroit, l'une à la nouvelle pièce, l'autre à
       * l'ancienne. Sur le dessin ça ne se voit pas ; dans le métré, si :
       * la cloison est comptée deux fois, et le dossier ment d'un mur.
       *
       * On soude donc ce qui se recouvre : le mur déplacé disparaît, et la
       * pièce récupère celui qui était déjà là. Le mitoyen appartient alors
       * aux deux, comme une cloison de vrai logement — et l'appareillage
       * qu'il portait le suit.
       */
      const soudes = new Map<string, string>();
      for (const w of st.walls) {
        if (!aMoi.has(w.id)) continue;
        const A = { x: w.a.x + ddx, z: w.a.z + ddz };
        const B = { x: w.b.x + ddx, z: w.b.z + ddz };
        for (const o of st.walls) {
          if (aMoi.has(o.id)) continue;
          // Mêmes extrémités, à cinq centimètres près, dans un sens ou dans
          // l'autre : c'est la même maçonnerie.
          const memeSens =
            Math.hypot(A.x - o.a.x, A.z - o.a.z) < 0.05 &&
            Math.hypot(B.x - o.b.x, B.z - o.b.z) < 0.05;
          const inverse =
            Math.hypot(A.x - o.b.x, A.z - o.b.z) < 0.05 &&
            Math.hypot(B.x - o.a.x, B.z - o.a.z) < 0.05;
          if (memeSens || inverse) {
            soudes.set(w.id, o.id);
            break;
          }
        }
      }

      pushHistory(`moveRoom:${roomId}`);
      set({
        walls: st.walls
          .filter((w) => !soudes.has(w.id))
          .map((w) =>
            aMoi.has(w.id)
              ? {
                  ...w,
                  a: { x: w.a.x + ddx, z: w.a.z + ddz },
                  b: { x: w.b.x + ddx, z: w.b.z + ddz },
                }
              : w,
          ),
        // La pièce troque ses murs soudés contre ceux qu'elle a rejoints.
        rooms: st.rooms.map((r) =>
          r.id === roomId && r.wallIds
            ? {
                ...r,
                wallIds: r.wallIds.map((id) => soudes.get(id) ?? id),
              }
            : r,
        ),
        // L'appareillage d'un mur soudé passe sur le mur conservé : il est
        // posé sur la même maçonnerie, il n'a pas bougé d'un centimètre.
        fixtures: st.fixtures.map((f) =>
          soudes.has(f.wallId) ? { ...f, wallId: soudes.get(f.wallId)! } : f,
        ),
        // Les menuiseries de ces murs suivent, sinon elles restent en l'air.
        openings: st.openings.map((o) => {
          const proche = nearestWall(o, st.walls.filter((w) => aMoi.has(w.id)));
          return proche.dist < 0.4
            ? {
                ...o,
                a: { x: o.a.x + ddx, z: o.a.z + ddz },
                b: { x: o.b.x + ddx, z: o.b.z + ddz },
              }
            : o;
        }),
        // Le mobilier et le plafond de la pièce voyagent avec elle.
        objects: st.objects.map((o) =>
          roomOf(o) === roomId
            ? {
                ...o,
                transform: o.transform.map((v, i) =>
                  i === 12 ? v + ddx : i === 14 ? v + ddz : v,
                ),
              }
            : o,
        ),
        ceiling: st.ceiling.map((cl) =>
          cl.roomId === roomId
            ? { ...cl, at: { x: cl.at.x + ddx, z: cl.at.z + ddz } }
            : cl,
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
        // L'appareillage et les photos aussi : ils sont accrochés à un
        // identifiant de mur, et le redressement le change.
        fixtures: reprojectFixtures(st.walls, droits, st.fixtures),
        photos: reprojectAnchors(st.walls, droits, st.photos),
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
      /**
       * Le graphe vient d'être recousu : un mur coupé en deux ne garde son
       * identifiant que sur le premier morceau, un mur fusionné que celui
       * du plus long. Tout ce qui s'accroche à un mur doit donc être
       * reporté sur le nouveau jeu, par sa POSITION — sans quoi une prise
       * de la seconde moitié d'un mur se dessine hors du mur, et une prise
       * de mur fusionné disparaît de l'écran, des comptages et du métré.
       */
      const fixtures = reprojectFixtures(st.walls, walls, st.fixtures);
      const photos = reprojectAnchors(st.walls, walls, st.photos);
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
      set({ walls, rooms, objects, fixtures, photos, dirty: true });
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

    addRoomBox: (largeur, profondeur, nom, contreWallId) => {
      const st = get();
      pushHistory('addRoom');
      const h = st.walls[0]?.height ?? 2.5;
      const cle = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const roomId = `piece-${cle}`;

      /**
       * ACCOLÉE À UN MUR : elle en prend la longueur, et le partage.
       *
       * Le mur choisi devient la cloison mitoyenne — il figure dans les
       * listes des DEUX pièces. On n'ajoute donc que trois murs, et le plan
       * reste cohérent : une seule maçonnerie entre deux pièces, cotée une
       * fois, équipée des deux côtés.
       *
       * La nouvelle pièce prend la LONGUEUR du mur plutôt que celle du
       * modèle : c'est la seule façon d'avoir une cloison qui coïncide
       * exactement. Sa profondeur, elle, est bien celle qu'on a choisie.
       */
      const contre = contreWallId
        ? st.walls.find((w) => w.id === contreWallId)
        : undefined;
      if (contre) {
        const len = Math.hypot(contre.b.x - contre.a.x, contre.b.z - contre.a.z);
        if (len > 0.4) {
          const u = {
            x: (contre.b.x - contre.a.x) / len,
            z: (contre.b.z - contre.a.z) / len,
          };
          // La normale qui S'ÉLOIGNE de la pièce existante : la nouvelle se
          // pose de l'autre côté, jamais par-dessus.
          // `interiorSide` dit de quel côté est la pièce, par rapport à
          // `perpOf(u)` = (−uz, ux). La nouvelle pièce va à l'OPPOSé.
          const dedans = interiorSide(contre, st.walls, st.rooms);
          const n = { x: u.z * dedans, z: -u.x * dedans };
          const p = Math.max(0.6, profondeur);
          const c1 = { x: contre.b.x + n.x * p, z: contre.b.z + n.z * p };
          const c2 = { x: contre.a.x + n.x * p, z: contre.a.z + n.z * p };
          const murs = [
            { a: contre.b, b: c1 },
            { a: c1, b: c2 },
            { a: c2, b: contre.a },
          ].map((seg, i) => ({
            id: `mur-${cle}-${i}`,
            type: 'wall' as const,
            a: seg.a,
            b: seg.b,
            height: h,
            yCenter: h / 2,
            roomId,
          }));
          set({
            walls: [...st.walls, ...murs],
            rooms: [
              ...st.rooms,
              {
                id: roomId,
                name: nom,
                floor: null,
                // Le mur mitoyen d'abord : c'est lui qui les relie.
                wallIds: [contre.id, ...murs.map((w) => w.id)],
              },
            ],
            dirty: true,
          });
          return roomId;
        }
      }
      /**
       * OÙ SE POSE LA NOUVELLE PIÈCE : À DROITE DE CE QUI EXISTE.
       *
       * Au centre, elle recouvrirait le plan ; au hasard, on la chercherait.
       * Collée au bord droit de l'emprise, avec un jeu d'un demi-mètre, elle
       * se voit d'emblée et se pousse ensuite où l'on veut. Le premier scan
       * d'un logement vide, lui, la pose à l'origine.
       */
      const xs = st.walls.flatMap((w) => [w.a.x, w.b.x]);
      const zs = st.walls.flatMap((w) => [w.a.z, w.b.z]);
      const x0 = xs.length > 0 ? Math.max(...xs) + 0.5 : 0;
      const z0 = zs.length > 0 ? Math.min(...zs) : 0;
      const x1 = x0 + Math.max(0.6, largeur);
      const z1 = z0 + Math.max(0.6, profondeur);
      const coins: Pt[] = [
        { x: x0, z: z0 },
        { x: x1, z: z0 },
        { x: x1, z: z1 },
        { x: x0, z: z1 },
      ];
      const murs = coins.map((p, i) => ({
        id: `mur-${cle}-${i}`,
        type: 'wall' as const,
        a: p,
        b: coins[(i + 1) % coins.length],
        height: h,
        yCenter: h / 2,
        roomId,
      }));
      set({
        walls: [...st.walls, ...murs],
        rooms: [
          ...st.rooms,
          { id: roomId, name: nom, floor: null, wallIds: murs.map((w) => w.id) },
        ],
        dirty: true,
      });
      return roomId;
    },

    addFixture: (kind, wallId, at) => {
      const st = get();
      const wall = st.walls.find((w) => w.id === wallId);
      if (!wall) return null;
      pushHistory('addFixture');
      const id = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const side = interiorSide(wall, st.walls, st.rooms);
      const quad = wallQuadsOf(st.walls).get(wallId);
      const f = newFixture(id, kind, wall, quad, side);

      /**
       * Un appareil posé là où il y en a déjà un ne s'EMPILE pas : il se
       * range à côté, à 71 mm d'entraxe, et les deux passent sous la même
       * plaque. C'est ce que fait l'électricien, et c'est ce qu'attend
       * quiconque pose une deuxième prise au même endroit — quatre prises
       * ajoutées de suite donnaient jusqu'ici quatre plaques superposées,
       * illisibles au plan comme en 3D.
       */
      const face = wallFace(wall, quad, side);
      const spec = FIXTURES[kind];
      const mine = st.fixtures.filter(
        (o) => o.wallId === wallId && o.side === side,
      );
      // « Tombe sur un autre » et « la place est prise » ne se mesurent pas
      // pareil : le premier compare les PLAQUES (82 mm, donc deux appareils
      // à 71 mm d'entraxe se chevauchent, et c'est normal — ils partagent
      // une plaque), le second compare les BOÎTES, une par poste.
      const surUnAutre = (px: number) =>
        mine.find((o) =>
          overlaps(
            { x: px, y: f.height, kind },
            { x: faceX(face, o.along), y: o.height, kind: o.kind },
          ),
        );
      const placePrise = (px: number) =>
        mine.some((o) => {
          const ox = faceX(face, o.along);
          return (
            Math.abs(px - ox) < ENTRAXE - 1e-6 &&
            Math.abs(f.height - o.height) < ENTRAXE - 1e-6
          );
        });
      let x = at ?? faceX(face, f.along);
      let group: string | undefined;
      const voisin = surUnAutre(x);
      if (voisin) {
        // On cherche la place libre la plus proche, par pas d'entraxe, à
        // droite d'abord — le sens de lecture d'un tableau d'appareillage.
        let place: number | null = null;
        for (let k = 1; k <= 6 && place === null; k++) {
          for (const sens of [1, -1]) {
            const px = x + sens * k * ENTRAXE;
            if (px - spec.w / 2 < 0 || px + spec.w / 2 > face.len) continue;
            if (placePrise(px)) continue;
            place = px;
            break;
          }
        }
        if (place !== null) {
          x = place;
          group =
            voisin.group ??
            `pl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        } else {
          // Plus de place sous une plaque commune : on s'écarte franchement
          // plutôt que de superposer.
          x = Math.min(face.len - spec.w / 2, x + 0.4);
        }
      }

      /**
       * Et sur de la MAÇONNERIE, comme lors d'un déplacement.
       *
       * Un appareil posé au milieu d'un mur percé d'une porte-fenêtre
       * atterrissait dans la baie : il fallait le rattraper au doigt pour
       * qu'il tienne sur quelque chose.
       */
      const pleins = masonryRuns(
        wallRuns(wall, st.openings),
        segLength(wall),
        face,
      );
      if (pleins.length > 1) x = snapToMasonry(pleins, x, spec.w / 2, face.len);

      const pose = { ...f, along: fromFaceX(face, x), group };
      set({
        fixtures: [
          ...st.fixtures.map((o) =>
            group && voisin && o.id === voisin.id ? { ...o, group } : o,
          ),
          pose,
        ],
        // L'écran de face proposera le côté, ou de recentrer l'ensemble :
        // on range d'abord pour que rien ne se superpose, on demande ensuite.
        pendingJoin: group && voisin ? { moved: id, base: voisin.id } : null,
        dirty: true,
      });
      return id;
    },

    moveFixture: (id, along, height) => {
      const st = get();
      const f = st.fixtures.find((x) => x.id === id);
      const wall = f ? st.walls.find((w) => w.id === f.wallId) : null;
      if (!f || !wall) return;
      const face = wallFace(wall, wallQuadsOf(st.walls).get(wall.id), f.side);

      /**
       * Un ensemble se déplace D'UN BLOC.
       *
       * Deux prises sous une même plaque, ce n'est plus deux appareils :
       * c'est une plaque de 153 mm avec deux mécanismes. En déplacer un
       * seul cassait l'entraxe — l'ensemble n'existait que tant qu'on n'y
       * touchait pas. On déplace donc tout le lot du même vecteur, et on
       * borne le BLOC au mur, pas chaque poste séparément : sans quoi le
       * premier arrivé au bord écrase les autres contre lui.
       */
      const lot =
        f.group
          ? st.fixtures.filter(
              (o) => o.group === f.group && o.wallId === f.wallId && o.side === f.side,
            )
          : [f];

      // Emprise du bloc, mesurée sur la face.
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const o of lot) {
        const sp = FIXTURES[o.kind];
        const cx = faceX(face, o.along);
        x0 = Math.min(x0, cx - sp.w / 2);
        x1 = Math.max(x1, cx + sp.w / 2);
        y0 = Math.min(y0, o.height - sp.h / 2);
        y1 = Math.max(y1, o.height + sp.h / 2);
      }
      const largeur = x1 - x0;
      const hauteur = y1 - y0;

      // Le vecteur demandé, puis ce que le mur en laisse passer.
      const vise = { x: faceX(face, along), y: height };
      let dx = vise.x - faceX(face, f.along);
      let dy = vise.y - f.height;
      dx = Math.min(face.len - x1, Math.max(-x0, dx));
      dy = Math.min(wall.height - y1, Math.max(-y0, dy));
      // Un bloc plus large que son mur : on le colle au bord, sans pousser.
      if (largeur > face.len) dx = -x0;
      if (hauteur > wall.height) dy = -y0;

      /**
       * ET SUR DE LA MAÇONNERIE, pas dans une baie.
       *
       * Le mur vu de face montre bien ses ouvertures, mais le doigt les
       * traversait sans résistance : on posait une prise au milieu d'une
       * porte-fenêtre, et elle partait au métré comme si elle tenait sur
       * du vide. Or les RETOURS — les trente centimètres de mur entre
       * l'angle et l'huisserie — sont justement là où se pose
       * l'interrupteur d'entrée : ce sont des emplacements à viser, pas des
       * zones à éviter. Le bloc se recale donc sur le retour le plus proche
       * capable de l'accueillir en entier.
       */
      const pleins = masonryRuns(
        wallRuns(wall, st.openings),
        segLength(wall),
        face,
      );
      if (pleins.length > 1) {
        const centre = (x0 + x1) / 2 + dx;
        const cale = snapToMasonry(pleins, centre, largeur / 2, face.len);
        dx += cale - centre;
      }

      pushHistory(`fixture:${f.group ?? id}`);
      const ids = new Set(lot.map((o) => o.id));
      set({
        fixtures: st.fixtures.map((o) =>
          ids.has(o.id)
            ? {
                ...o,
                along: fromFaceX(face, faceX(face, o.along) + dx),
                height: o.height + dy,
              }
            : o,
        ),
        dirty: true,
      });
    },

    clearPendingJoin: () => set({ pendingJoin: null }),

    setNorth: (deg) => {
      pushHistory('north');
      set({ north: deg, dirty: true });
    },

    setClientInfo: (client, address) => {
      set({ client: client.trim(), address: address.trim(), dirty: true });
    },

    renameSave: (id, name) => {
      const clean = name.trim();
      if (!clean) return;
      const st = get();
      const saves = st.saves.map((x) =>
        x.id === id ? { ...x, name: clean, updatedAt: Date.now() } : x,
      );
      set({
        saves,
        // Le scan ouvert est le même : son en-tête doit suivre.
        scanName: st.currentSaveId === id ? clean : st.scanName,
      });
      persistSoon(saves);
    },

    /**
     * DUPLIQUER : chiffrer deux variantes de la même installation.
     *
     * On copie l'entrée telle quelle, sans l'ouvrir — les photos restent
     * partagées avec l'original, ce sont des fichiers sur le disque et
     * personne ne veut les voir doubler de poids à chaque copie.
     */
    duplicateSave: (id) => {
      const st = get();
      const source = st.saves.find((x) => x.id === id);
      if (!source) return;
      const now = Date.now();
      const copie: SavedScan = {
        ...source,
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        name: `${source.name} (copie)`,
        createdAt: now,
        updatedAt: now,
      };
      const i = st.saves.findIndex((x) => x.id === id);
      const saves = [...st.saves];
      saves.splice(i + 1, 0, copie);
      set({ saves });
      persistSoon(saves);
    },

    restoreFixtures: (list) => {
      pushHistory('restore');
      set({ fixtures: list, dirty: true });
    },

    addPhoto: (wallId, along, path) => {
      pushHistory('photo');
      const id = `ph-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      set({
        photos: [...get().photos, { id, wallId, along, path, at: Date.now() }],
        dirty: true,
      });
      return id;
    },

    addCeiling: (kind, roomId, at, ligne) => {
      pushHistory('addCeiling');
      const id = `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      set({
        ceiling: [
          ...get().ceiling,
          { id, kind, roomId, at, ...(ligne ? { row: ligne.row, axe: ligne.axe } : {}) },
        ],
        dirty: true,
      });
      return id;
    },

    /**
     * REPOSER UNE LIGNE, d'un seul geste et d'un seul repentir.
     *
     * Retourner une ligne de six spots, c'était six déplacements au
     * centimètre — et six lignes dans l'historique, donc six annulations
     * pour revenir en arrière. Les spots gardent leur ordre : le premier
     * de la liste reçoit la première place, et les liens de commande
     * déjà tirés vers un interrupteur suivent leur point.
     */
    setCeilingRow: (row, pts, axe) => {
      const st = get();
      const dansLaLigne = st.ceiling.filter((c) => c.row === row);
      if (dansLaLigne.length === 0 || pts.length === 0) return;
      pushHistory(`ceilingRow:${row}`);
      let k = 0;
      set({
        ceiling: st.ceiling.map((c) =>
          c.row === row
            ? { ...c, at: pts[Math.min(k++, pts.length - 1)], axe }
            : c,
        ),
        dirty: true,
      });
    },

    removeCeilingRow: (row) => {
      pushHistory('removeCeilingRow');
      set({
        ceiling: get().ceiling.filter((c) => c.row !== row),
        dirty: true,
      });
    },

    moveCeiling: (id, at) => {
      const st = get();
      const cl = st.ceiling.find((c) => c.id === id);
      if (!cl) return;
      /**
       * LES MURS L'ARRÊTENT, comme un meuble.
       *
       * Un point lumineux posé hors de sa pièce n'existe pas : il n'a ni
       * circuit, ni métré, ni sens sur le chantier. Le doigt dépasse
       * pourtant tout le temps — on vise le coin, on sort d'un
       * centimètre. Le contour de la pièce ramène donc la position sur
       * son bord le plus proche, légèrement en retrait pour que le
       * symbole ne chevauche pas la maçonnerie.
       */
      const part = roomParts(st.walls, st.rooms).find(
        (p) => p.roomId === cl.roomId,
      );
      const ring = part?.surface?.pts ?? [];
      const pose =
        ring.length >= 3 && !pointInPolygon(at, ring)
          ? insetOnRing(ring, at, WALL_T / 2 + 0.03)
          : at;
      pushHistory(`ceiling:${id}`);
      set({
        ceiling: st.ceiling.map((c) => (c.id === id ? { ...c, at: pose } : c)),
        dirty: true,
      });
    },

    removeCeiling: (id) => {
      pushHistory('removeCeiling');
      set({ ceiling: get().ceiling.filter((c) => c.id !== id), dirty: true });
    },

    toggleCeilingCommand: (ceilingId, fixtureId) => {
      pushHistory('ceilingCommand');
      set({
        ceiling: get().ceiling.map((c) => {
          if (c.id !== ceilingId) return c;
          const cur = c.commands ?? [];
          return {
            ...c,
            commands: cur.includes(fixtureId)
              ? cur.filter((x) => x !== fixtureId)
              : [...cur, fixtureId],
          };
        }),
        dirty: true,
      });
    },

    removePhoto: (id) => {
      pushHistory('photo');
      set({ photos: get().photos.filter((p) => p.id !== id), dirty: true });
    },

    copyWallFixtures: (wallId) => {
      const st = get();
      const wall = st.walls.find((w) => w.id === wallId);
      if (!wall) return 0;
      const side = interiorSide(wall, st.walls, st.rooms);
      const face = wallFace(wall, wallQuadsOf(st.walls).get(wallId), side);
      const items = st.fixtures
        .filter((f) => f.wallId === wallId && f.side === side)
        // La cote est prise depuis le DÉBUT de la face, celle qu'on lit à
        // l'écran : c'est elle qu'on veut retrouver à l'identique.
        .map((f) => ({
          kind: f.kind,
          x: faceX(face, f.along),
          height: f.height,
          group: f.group,
        }))
        .sort((a, b) => a.x - b.x);
      set({ wallClip: items.length > 0 ? { from: wallId, items } : null });
      return items.length;
    },

    pasteWallFixtures: (wallId) => {
      const st = get();
      const clip = st.wallClip;
      const wall = st.walls.find((w) => w.id === wallId);
      if (!clip || !wall) return 0;
      pushHistory('collerAppareillage');
      const side = interiorSide(wall, st.walls, st.rooms);
      const face = wallFace(wall, wallQuadsOf(st.walls).get(wallId), side);
      // Les ensembles gardent leur cohésion, mais pas leur identifiant :
      // deux plaques distinctes ne peuvent pas porter le même.
      const neufs = new Map<string, string>();
      const poses: Fixture[] = [];
      let n = 0;
      for (const it of clip.items) {
        const spec = FIXTURES[it.kind];
        // Ce qui ne tient pas sur le mur d'arrivée n'est pas posé de force.
        if (it.x - spec.w / 2 < -1e-6 || it.x + spec.w / 2 > face.len + 1e-6) {
          continue;
        }
        if (it.height + spec.h / 2 > wall.height + 1e-6) continue;
        let group: string | undefined;
        if (it.group) {
          group =
            neufs.get(it.group) ??
            `pl-${Date.now()}-${n}-${Math.random().toString(36).slice(2, 5)}`;
          neufs.set(it.group, group);
        }
        poses.push({
          id: `el-${Date.now()}-${n}-${Math.random().toString(36).slice(2, 5)}`,
          kind: it.kind,
          wallId,
          along: fromFaceX(face, it.x),
          height: it.height,
          side,
          group,
        });
        n += 1;
      }
      if (poses.length === 0) return 0;
      set({ fixtures: [...st.fixtures, ...poses], dirty: true });
      return poses.length;
    },

    placeAssembly: (baseId, movedId, base, moved) => {
      const st = get();
      const b = st.fixtures.find((f) => f.id === baseId);
      if (!b) return;
      pushHistory('assemblage');
      const group =
        b.group ?? `pl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      set({
        fixtures: st.fixtures.map((f) => {
          if (f.id === baseId) return { ...f, ...base, group };
          if (f.id === movedId) return { ...f, ...moved, group, side: b.side };
          return f;
        }),
        dirty: true,
      });
    },

    splitFixture: (id, along) => {
      pushHistory('separer');
      set({
        fixtures: get().fixtures.map((f) =>
          f.id === id ? { ...f, along, group: undefined } : f,
        ),
        dirty: true,
      });
    },

    joinFixtures: (movedId, baseId, along, height) => {
      const st = get();
      const base = st.fixtures.find((f) => f.id === baseId);
      if (!base) return;
      pushHistory('joinFixtures');
      const group = base.group ?? `pl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      set({
        fixtures: st.fixtures.map((f) => {
          if (f.id === baseId) return { ...f, group };
          if (f.id === movedId) return { ...f, along, height, group, side: base.side };
          return f;
        }),
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
      // Un ensemble réduit à un poste n'est plus un ensemble : sa plaque
      // redevient simple, et l'appareil restant redevient libre.
      {
        const st0 = get();
        const parti = st0.fixtures.find((f) => f.id === id);
        if (parti?.group) {
          const restants = st0.fixtures.filter(
            (f) => f.group === parti.group && f.id !== id,
          );
          if (restants.length === 1) {
            const seul = restants[0].id;
            set({
              fixtures: st0.fixtures.map((f) =>
                f.id === seul ? { ...f, group: undefined } : f,
              ),
            });
          }
        }
      }
      pushHistory('removeFixture');
      set({
        fixtures: get().fixtures.filter((f) => f.id !== id),
        dirty: true,
      });
    },

    undo: () => {
      const prev = history.pop();
      if (!prev) return;
      set({
        ...prev,
        canUndo: history.length > 0,
        // Revenu à l'état enregistré : il n'y a plus rien à enregistrer, et
        // le bouton de sauvegarde n'a plus lieu d'être.
        dirty: history.length !== savedDepth,
      });
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
    setScanning: (scanning) => {
      set({ scanning });
      /*
        LA MINUTERIE VIT AVEC LE RELEVÉ.

        Elle démarre au premier scan et continue APRÈS : un relevé terminé
        mais non enregistré se perd exactement comme un relevé en cours, et
        c'est même le cas le plus fréquent — on scanne, on regarde le plan,
        le téléphone meurt.
      */
      if (scanning) {
        // On RÉARME, on ne se contente pas de « s'il n'y en a pas déjà un » :
        // une minuterie retenue par une référence morte — un scan repris
        // après un retour de veille, un cycle de vie qui a coupé les
        // horloges — laissait le relevé sans filet, et rien ne l'aurait dit.
        arreterBrouillon();
        draftTimer = setInterval(() => get().ecrireBrouillon(), DRAFT_PERIODE);
      }
    },
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
      // À la sortie du scan comme à l'ouverture d'un dossier : deux meubles que
      // la caméra a fait se traverser sont écartés du strict nécessaire.
      const objects: ObjectData[] = separerLeMobilier(
        incomingObjects.map((o) => ({
          ...o,
          roomId: `room-${roomIndexAt(
            { x: o.transform[12], z: o.transform[14] },
            shapes.map((s) => s.outline),
          ) + 1}`,
        })),
      );

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
          photos: [],
          ceiling: [],
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
        photos: [],
        ceiling: [],
        north: typeof r.north === 'number' ? r.north : undefined,
      };
      const saves = [save, ...get().saves];
      set({
        modelPath: save.modelPath,
        scanName: save.name,
        client: '',
        address: '',
        currentSaveId: save.id,
        dirty: false,
        resultOrigin: 'scan',
        rooms: kept,
        walls,
        openings,
        objects,
        fixtures: [],
        photos: [],
        ceiling: [],
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
      savedDepth = history.length;
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
      // Le meuble RETIENT sa pièce dès la pose. Sans ça, il n'appartenait à
      // rien : c'est le point visé qui décidait, à chaque image, des murs
      // qui devaient l'arrêter — et dès que le doigt sortait de la pièce,
      // plus aucun mur ne le retenait. Il traversait donc la cloison au
      // moment précis où on cherchait à l'y plaquer.
      const accueil = roomParts(st.walls, st.rooms).find((p) =>
        pointInPolygon({ x, z }, p.surface?.pts ?? []),
      );
      set({
        objects: [
          ...st.objects,
          {
            id,
            category: item.category,
            width: item.w,
            depth: item.d,
            height: item.h,
            roomId: accueil?.roomId,
            // Sur LE sol du scan, pas sur l'altitude zéro : ARKit place le
            // plancher où il l'a trouvé, souvent un demi-mètre plus bas, et
            // le meuble se retrouvait sinon suspendu en l'air.
            transform: catalogTransform(item, x, z, solDe(st.walls)),
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

    /**
     * POSE D'UN COUP tout ce que « Normes auto » a calculé.
     *
     * Un seul pas d'historique : c'est UN geste pour l'électricien, même s'il
     * ajoute quinze appareils. Devoir annuler quinze fois serait une punition.
     */
    poserDAuto: (fixtures, ceiling) => {
      if (fixtures.length === 0 && ceiling.length === 0) return;
      pushHistory('normesAuto');
      const st = get();
      set({
        fixtures: [...st.fixtures, ...fixtures],
        ceiling: [...st.ceiling, ...ceiling],
        dirty: true,
      });
    },

    panne: null,
    oublierPanne: () => set({ panne: null }),

    removeObject: (id) => {
      pushHistory('removeObject');
      set({ objects: get().objects.filter((o) => o.id !== id), dirty: true });
    },

    /**
     * Déplace un meuble. Les murs l'ARRÊTENT, ils ne l'attirent pas.
     *
     * L'aimant d'avant collait le meuble au mur et lui imposait son angle à
     * chaque déplacement : dans une chambre de 2,44 m, un lit de 1,90 est à
     * portée d'aimant partout — il restait donc collé, toute rotation était
     * effacée, et le meuble semblait revenir à sa place tout seul. Une
     * simple collision fait mieux et sans surprise : on pousse jusqu'au mur,
     * ça s'arrête pile contre le nu.
     */
    setObjectCenter: (id, x, z, aimant = true) => {
      pushHistory(`moveObject:${id}`);
      const st = get();
      const obj = st.objects.find((o) => o.id === id);
      if (!obj) return;
      const parts = roomParts(st.walls, st.rooms);
      // La pièce du meuble est celle où IL EST, pas celle que le doigt
      // survole : pousser un lit contre un mur, c'est justement viser
      // au-delà du mur. On garde donc, dans l'ordre : sa pièce déclarée,
      // celle qui contient son centre actuel, celle du point visé.
      const ici = { x: obj.transform[12], z: obj.transform[14] };
      const part =
        parts.find((p) => p.roomId === obj.roomId) ??
        parts.find((p) => pointInPolygon(ici, p.surface?.pts ?? [])) ??
        parts.find((p) => pointInPolygon({ x, z }, p.surface?.pts ?? [])) ??
        parts.find((p) => p.roomId === roomOf(obj));
      const yawPose = Math.atan2(obj.transform[2], obj.transform[0]);
      /*
        UN MEUBLE DE BIAIS QUI NE PASSE PAS SE REMET DROIT.

        Le chantier a filmé la scène : un meuble de 62 cm refusait une alcôve
        plus large que lui. Il était en losange — de biais, un carré occupe sa
        diagonale, 88 cm. Plutôt que de le laisser rebondir sur les murs, on
        lui rend le quart de tour qui le fait entrer. Au large, on ne touche
        à rien : son angle est un choix.
      */
      const yaw = part
        ? alignToFit(
            { x, z },
            { width: obj.width, depth: obj.depth, yaw: yawPose },
            part.walls,
            part.labelAt,
            part.surface?.pts,
            ici,
          )
        : yawPose;
      /*
        LE MEUBLE S'ADAPTE AU RECOIN, il ne s'en fait plus chasser.

        On repart TOUJOURS de sa cote d'origine, pas de celle qu'il porte :
        sans ça, un meuble une fois raboté le resterait, et traverser une
        niche l'aurait rétréci un peu plus à chaque passage. Ressorti au
        large, il retrouve donc sa vraie taille tout seul.
      */
      const base = {
        width: obj.baseWidth ?? obj.width,
        depth: obj.baseDepth ?? obj.depth,
      };
      const ajuste = part
        ? fitInNook(
            { x, z },
            { width: base.width, depth: base.depth, yaw },
            part.walls,
            part.surface?.pts,
          )
        : { width: base.width, depth: base.depth, centre: { x, z } };
      const arrete = part
        ? pushOutOfWalls(
              ajuste.centre,
              { width: ajuste.width, depth: ajuste.depth, yaw },
              part.walls,
              part.labelAt,
            part.surface?.pts,
            ici,
          )
        : { x, z };
      /*
        ET UNE FOIS ARRÊTÉ PAR LES MURS, IL SE PLAQUE CONTRE CELUI QU'IL
        FRÔLE — mais seulement quand c'est le doigt qui l'amène.

        Un jour de trois centimètres n'existe pas sur un chantier : il vient
        du doigt qui vise à peu près. La flèche, elle, vise juste, et son
        centimètre doit rester où on l'a mis.
      */
      const pose = part && aimant
        ? hugWall(
            arrete,
            { width: ajuste.width, depth: ajuste.depth, yaw },
            part.walls,
            part.labelAt,
            ici,
          )
        : arrete;
      /*
        ET IL NE SE POSE PAS SUR UN AUTRE.

        Les autres meubles de la même pièce le repoussent comme des caisses :
        il ressort par le côté le plus court, et se cale contre eux quand il
        n'en reste qu'un jour de quelques centimètres. Ceux d'à côté ne le
        regardent pas — une cloison les sépare déjà.
      */
      const voisins = st.objects
        .filter((o) => o.id !== id && roomOf(o) === roomOf(obj))
        .map((o) => ({
          cx: o.transform[12],
          cz: o.transform[14],
          width: o.width,
          depth: o.depth,
          yaw: Math.atan2(o.transform[2], o.transform[0]),
          // Son étage : du dessous au dessus. C'est lui qui autorise une télé
          // à surmonter un meuble bas, et qui interdit à une table de traverser
          // un canapé.
          y0: o.transform[13] - o.height / 2,
          y1: o.transform[13] + o.height / 2,
        }));
      const libre = pushOutOfObjects(
        pose,
        {
          width: ajuste.width,
          depth: ajuste.depth,
          yaw,
          y0: obj.transform[13] - obj.height / 2,
          y1: obj.transform[13] + obj.height / 2,
        },
        voisins,
      );
      /*
        ET LE MUR A LE DERNIER MOT.

        Relevé du chantier : « on voit le meuble légèrement dépassé de l'autre
        côté du mur ». C'était un ordre d'opérations : on repoussait des murs,
        PUIS des meubles voisins — et cette dernière poussée pouvait renvoyer
        le meuble dans la maçonnerie, sans que personne ne repasse. Un meuble
        qui chevauche un voisin se voit ; un meuble qui sort du logement ne se
        pardonne pas.
      */
      const pose2 = part
        ? pushOutOfWalls(
            libre,
            { width: ajuste.width, depth: ajuste.depth, yaw },
            part.walls,
            part.labelAt,
            part.surface?.pts,
            ici,
          )
        : libre;
      set({
        objects: st.objects.map((o) => {
          if (o.id !== id) return o;
          const t = [...o.transform];
          t[12] = pose2.x;
          t[14] = pose2.z;
          if (yaw !== yawPose) {
            const c = Math.cos(yaw);
            const s2 = Math.sin(yaw);
            t[0] = c;
            t[2] = s2;
            t[8] = -s2;
            t[10] = c;
          }
          return {
            ...o,
            width: ajuste.width,
            depth: ajuste.depth,
            baseWidth: base.width,
            baseDepth: base.depth,
            transform: t,
          };
        }),
        dirty: true,
      });
    },

    resizeObjectSide: (id, cote, distance) => {
      const st = get();
      const obj = st.objects.find((o) => o.id === id);
      if (!obj) return { accroche: false };
      pushHistory(`resizeSide:${id}`);
      const yaw = Math.atan2(obj.transform[2], obj.transform[0]);
      // Axe de la largeur, puis celui de la profondeur : la même convention
      // que le plaquage et la poussée.
      const axe =
        cote === 'largeur+' || cote === 'largeur-'
          ? { x: Math.cos(yaw), z: Math.sin(yaw) }
          : { x: -Math.sin(yaw), z: Math.cos(yaw) };
      const sens = cote.endsWith('+') ? 1 : -1;
      const n = { x: axe.x * sens, z: axe.z * sens };
      const surLargeur = cote.startsWith('largeur');
      const avant = surLargeur ? obj.width : obj.depth;
      // Dix centimètres au minimum : en deçà, le meuble devient un trait
      // qu'on ne sait plus attraper.
      let apres = Math.max(0.1, Math.min(12, avant + distance));
      const bouge = apres - avant;
      const centre = {
        x: obj.transform[12] + n.x * (bouge / 2),
        z: obj.transform[14] + n.z * (bouge / 2),
      };
      // L'aimant : le bord tiré se pose sur le nu du mur qu'il longe.
      const bord = {
        x: centre.x + n.x * (apres / 2),
        z: centre.z + n.z * (apres / 2),
      };
      const long = surLargeur ? obj.depth : obj.width;
      const parts = roomParts(st.walls, st.rooms);
      const ici = { x: obj.transform[12], z: obj.transform[14] };
      const part =
        parts.find((p) => p.roomId === obj.roomId) ??
        parts.find((p) => pointInPolygon(ici, p.surface?.pts ?? []));
      const colle = snapSideToWalls(bord, n, long / 2, part?.walls ?? st.walls);
      if (colle !== 0) {
        const vise = Math.max(0.1, Math.min(12, apres + colle));
        centre.x += n.x * ((vise - apres) / 2);
        centre.z += n.z * ((vise - apres) / 2);
        apres = vise;
      }
      set({
        objects: st.objects.map((o) => {
          if (o.id !== id) return o;
          const t = [...o.transform];
          t[12] = centre.x;
          t[14] = centre.z;
          const width = surLargeur ? apres : o.width;
          const depth = surLargeur ? o.depth : apres;
          // La cote tirée à la main devient LA référence, comme celle qu'on
          // tape : elle ne doit pas être reprise par l'ajustement en niche.
          return {
            ...o,
            width,
            depth,
            baseWidth: width,
            baseDepth: depth,
            transform: t,
          };
        }),
        dirty: true,
      });
      return { accroche: colle !== 0 };
    },

    resizeObject: (id, width, depth) => {
      if (width <= 0 || depth <= 0) return;
      pushHistory(`resize:${id}`);
      set({
        objects: get().objects.map((o) =>
          o.id === id
            ? // Une cote saisie à la main devient LA référence : c'est
              // l'électricien qui a mesuré, et son chiffre prime sur celui
              // du scanner comme sur l'ajustement d'une niche.
              { ...o, width, depth, baseWidth: width, baseDepth: depth }
            : o,
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
        photos: st.photos,
        ceiling: st.ceiling,
        north: st.north ?? undefined,
        client: st.client || undefined,
        address: st.address || undefined,
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

    ecrireBrouillon: () => {
      const st = get();
      // Rien à sauver : pas de murs, ou un relevé déjà enregistré tel quel.
      if (st.walls.length === 0 || (st.currentSaveId && !st.dirty)) {
        if (draftEcrit !== '') {
          draftEcrit = '';
          AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
        }
        return;
      }
      const brouillon: BrouillonScan = {
        at: Date.now(),
        name: st.scanName,
        walls: st.walls,
        openings: st.openings,
        objects: st.objects,
        rooms: st.rooms,
        fixtures: st.fixtures,
        ceiling: st.ceiling,
        photos: st.photos,
        modelPath: st.modelPath,
      };
      // L'horodatage change à chaque tick : on compare SANS lui, sinon on
      // réécrirait un relevé identique toutes les trente secondes.
      const empreinte = JSON.stringify({ ...brouillon, at: 0 });
      if (empreinte === draftEcrit) return;
      draftEcrit = empreinte;
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(brouillon)).catch(() => {
        // Un brouillon perdu ne se signale pas : c'est un filet, et
        // l'alerte du disque plein est déjà portée par l'enregistrement.
        draftEcrit = '';
      });
    },

    reprendreBrouillon: () => {
      const b = get().brouillon;
      if (!b) return;
      set({
        screen: 'result',
        resultOrigin: 'scan',
        scanName: b.name,
        walls: b.walls,
        openings: b.openings,
        objects: separerLeMobilier(b.objects),
        rooms: b.rooms,
        fixtures: b.fixtures,
        ceiling: b.ceiling,
        photos: b.photos,
        modelPath: b.modelPath,
        // Il n'a jamais été enregistré : il l'est d'autant moins maintenant.
        currentSaveId: null,
        dirty: true,
        brouillon: null,
      });
    },

    oublierBrouillon: () => {
      draftEcrit = '';
      set({ brouillon: null });
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
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
        const saves = await loadLibrary();
        if (saves) set({ saves: saves.map(migrateSave) });
        /*
          LE RELEVÉ INTERROMPU, retrouvé au démarrage.

          On ne le reprend PAS d'office : l'utilisateur a pu quitter
          volontairement un essai raté, et se voir imposer son retour serait
          pire que de l'avoir perdu. L'écran d'accueil pose la question.
        */
        const brut = await AsyncStorage.getItem(DRAFT_KEY);
        if (brut) {
          const b = JSON.parse(brut) as BrouillonScan;
          // Un brouillon vide n'a rien à proposer.
          if (b && Array.isArray(b.walls) && b.walls.length > 0) {
            set({ brouillon: b });
          } else {
            AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
          }
        }
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
        client: save.client ?? '',
        address: save.address ?? '',
        currentSaveId: save.id,
        rooms: save.rooms,
        walls: save.walls,
        openings: save.openings,
        objects: separerLeMobilier(save.objects),
        fixtures: save.fixtures ?? [],
        photos: save.photos ?? [],
        ceiling: save.ceiling ?? [],
        // Un relevé de mur appartient au plan où il a été pris : le garder
        // d'un scan à l'autre permettrait de coller les cotes d'un autre
        // logement.
        wallClip: null,
        pendingJoin: null,
        north: save.north ?? null,
        dirty: false,
        resultOrigin: 'library',
        screen: 'result',
      });
      clearHistory();
    },

    deleteSave: (id) => {
      const st = get();
      const parti = st.saves.find((s) => s.id === id);
      const saves = st.saves.filter((s) => s.id !== id);
      // Les photos de repérage vivent dans les Documents de l'app : sans
      // ce ménage, elles s'accumulent pour toujours, sans que personne
      // puisse les retrouver ni les effacer. On ne touche qu'à celles que
      // plus aucun scan ne réclame.
      const gardees = new Set(
        saves.flatMap((s) => (s.photos ?? []).map((p) => p.path)),
      );
      const aEffacer = (parti?.photos ?? [])
        .map((p) => p.path)
        .filter((p) => !gardees.has(p));
      deletePhotoFiles(aEffacer);
      set({
        saves,
        ...(st.currentSaveId === id ? { currentSaveId: null } : null),
      });
      persistSoon(saves);
    },

    reset: () => {
      /*
        UN NOUVEAU SCAN EFFACE LE FILET.

        Le brouillon décrit LE relevé en cours ; en repartir un autre le rend
        caduc, et le garder ferait proposer au démarrage suivant un relevé
        que l'utilisateur vient lui-même de jeter.
      */
      arreterBrouillon();
      draftEcrit = '';
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      set({
        screen: 'home',
        brouillon: null,
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
        photos: [],
        ceiling: [],
        north: null,
      });
    },
  };
});

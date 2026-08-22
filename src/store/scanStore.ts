import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  catalogueDesPlans,
  deposerPlan,
  reprendrePlan,
  type Identite,
} from '../net/coffrePlans';
import type { DepartExistant, TableauExistant } from '../geometry/existant';

export type { TableauExistant };
import {
  cleanModelFiles,
  deletePhotoFiles,
  reposerDuCoffre,
} from '../ui/photos';
import { identiteDuCompte, useAccountStore } from './accountStore';
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
  openingsOn,
  pointOnSeg,
  alignToFit,
  fitInNook,
  pushOutOfObjects,
  separerMeubles,
  hugWall,
  castToWall,
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
  soudureAuBout,
  splitAtJunctions,
  straightenWalls,
  toSegment,
  wallQuadsOf,
  wallRuns,
  weldCorners,
  fusionnerMursDoubles,
  NIVEAU_RDC,
  niveauDe,
  deplacerNiveau,
  COFFRE_H,
  type TrouDeReleve,
  type Pt,
  type WallSeg,
} from '../geometry/floorplan';
import {
  catalogTransform,
  type CatalogItem,
} from '../geometry/catalogue';
import {
  COMMANDES_MURALES,
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
  seCommande,
  wallFace,
  type Fixture,
  type FixtureKind,
} from '../geometry/electrical';
import { pointInPolygon } from '../geometry/appearance';
import { ancrerElec } from '../geometry/viseur';
import {
  deduceRoomKind,
  roomKindLabel,
  type RoomKind,
} from '../geometry/furniture';

export type Screen =
  | 'home'
  | 'scan'
  | 'result'
  | 'library'
  | 'export'
  | 'camera'
  | 'profil'
  | 'confidentialite';

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
  /**
   * L'ÉTAGE de la pièce. Absent = rez-de-chaussée, comme pour les murs.
   * Ne pas confondre avec `floor`, qui est la couleur du SOL.
   */
  niveau?: number;
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
  /**
   * Le fichier de cache, dans les Documents de l'app. Il ne survit PAS à une
   * réinstallation : c'est `asset` qui le reconstruit.
   */
  path: string;
  /**
   * L'IDENTIFIANT DURABLE de l'image dans la photothèque de l'utilisateur.
   *
   * Les Documents de l'app disparaissent avec l'app ; la photothèque, elle,
   * appartient à l'utilisateur — l'image y survit à la réinstallation, part
   * dans sa sauvegarde iCloud et se retrouve dans ses Photos. Absent sur les
   * photos d'avant le coffre, et sur celles prises quand l'accès a été
   * refusé : le fichier est alors tout ce qu'on a.
   */
  asset?: string;
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
  /**
   * Absentes des brouillons écrits par les versions d'avant les notes : un
   * relevé sauvé il y a dix minutes par l'ancienne app doit se rouvrir.
   */
  notes?: PlanNote[];
  photos: ScanPhoto[];
  modelPath: string | null;
  /**
   * Le tableau relevé sur place, s'il y en a un. Le brouillon existe pour
   * qu'un téléphone qui meurt ne coûte pas la visite : le quart d'heure
   * passé à noter les départs d'un tableau en fait partie.
   */
  existant?: TableauExistant;
}

/**
 * UNE NOTE POSÉE SUR LE PLAN — le mot qu'on écrivait au crayon dans la marge.
 *
 * « Colonne montante ici », « attente TV à confirmer avec le client »,
 * « gaine à reprendre ». Ces phrases existent sur tous les plans papier du
 * métier, et l'application n'avait aucun endroit pour elles : le nom de
 * pièce nomme, le nom du plan est unique, l'appareillage se compte au métré.
 * Faute de place elles finissaient dans le nom du plan — « T3 Pasteur
 * (vérifier colonne) » — ou nulle part, c'est-à-dire dans la tête de celui
 * qui a fait le relevé, et qui n'est pas toujours celui qui pose.
 *
 * ELLE TIENT À UN POINT, PAS À UNE PIÈCE : ce qu'on signale est souvent
 * justement ce qui n'a pas encore de pièce — une arrivée dans un couloir,
 * un percement dans une cloison qu'on n'a pas fini de tracer.
 */
export interface PlanNote {
  id: string;
  /** Le texte, tel qu'il a été tapé. */
  text: string;
  /** Où elle est posée, dans le repère du plan. */
  at: Pt;
  /** L'étage qui la porte. Absent = le rez, comme partout ailleurs. */
  niveau?: number;
}

/** Un plan porte des mots, pas des paragraphes : au-delà, plus rien ne se lit. */
export const NOTE_MAX = 140;

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
  /** Notes écrites sur le plan. Absentes des relevés d'avant. */
  notes?: PlanNote[];
  /**
   * LE TABLEAU QU'ON A TROUVÉ EN ARRIVANT.
   *
   * Un relevé de rénovation porte deux installations : celle qui existe et
   * celle qu'on va poser. La première ne se dessine pas sur le plan — c'est
   * une liste de départs — mais elle voyage avec le scan et s'imprime dans
   * le dossier. Absente sur un chantier neuf, et sur tous les scans d'avant
   * la rénovation.
   */
  existant?: TableauExistant;
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
/**
 * PURGE LES LIENS MORTS — par TOUS les chemins de suppression.
 *
 * `removeFixture` faisait le ménage, mais un interrupteur part aussi avec
 * son mur ou sa pièce : les `commands` gardaient alors son id, le contrôle
 * croyait le point « commandé » à jamais, et le constat « sans commande »
 * ne tombait plus. La règle vit ici, et chaque suppression la traverse.
 */
function sansLiensMorts(
  fixtures: Fixture[],
  ceiling: CeilingFixture[],
): { fixtures: Fixture[]; ceiling: CeilingFixture[] } {
  const vivants = new Set(fixtures.map((f) => f.id));
  const purge = (commands?: string[]) => {
    if (!commands) return commands;
    const restants = commands.filter((x) => vivants.has(x));
    if (restants.length === commands.length) return commands;
    return restants.length > 0 ? restants : undefined;
  };
  return {
    fixtures: fixtures.map((f) => ({ ...f, commands: purge(f.commands) })),
    ceiling: ceiling.map((c) => ({ ...c, commands: purge(c.commands) })),
  };
}

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
/** La plus grande cote qu'un mur puisse recevoir. Voir `setWallLength`. */
const MUR_MAX_M = 60;
/*
  LA LONGUEUR DES NOMS, BORNÉE À LA SAISIE.

  Le cartouche d'une pièce fait quelques centimètres sur le plan, et la
  ligne d'un scan dans la bibliothèque une largeur d'écran. Deux cents
  caractères n'y tiennent pas : ils se tronquent à l'affichage, mais on les
  traîne dans chaque export, dans chaque sauvegarde et dans le courrier du
  support. On coupe donc une fois pour toutes, là où le nom entre.
*/
const NOM_PIECE_MAX = 40;
const NOM_PLAN_MAX = 60;
const THEME_KEY = 'roomscanner.themePref.v1';
const COLORS_KEY = 'roomscanner.openingColors.v1';
const FURNITURE_KEY = 'roomscanner.showFurniture.v1';
const SURFACES_KEY = 'roomscanner.showSurfaces.v1';
const TEXTURES_KEY = 'roomscanner.showTextures.v1';
/**
 * LE MARQUEUR « J'AI DÉJÀ REPRIS MES PLANS ICI ».
 *
 * Il vit dans le stockage de l'application — donc il PART avec elle. C'est
 * exactement ce qu'on veut : une réinstallation le perd, et la reprise se
 * refait ; une app qui tourne depuis six mois le garde, et ne redemande
 * jamais rien au serveur.
 *
 * Sans lui, chaque lancement reposerait les plans que l'électricien a
 * supprimés la veille : le contraire d'un service.
 */
const REPRISE_KEY = 'roomscanner.reprise.v1';

/**
 * TROIS CHOIX, ET « SYSTÈME » EN FAIT PARTIE.
 *
 * Le thème se bornait à clair ou sombre, choisis à la main sur l'accueil.
 * Un électricien passe sa journée dehors et sa soirée dans un tableau
 * électrique : c'est le téléphone qui sait quand basculer, pas nous. Le
 * réglage rejoint donc la page profil avec l'option qui manquait — suivre
 * l'appareil — et c'est elle qui accueille les nouveaux venus.
 */
export type ThemePref = 'system' | 'light' | 'dark';

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

/**
 * DEUX SECONDES APRÈS LE DERNIER GESTE, LE PLAN MONTE.
 *
 * Enregistrer, renommer, dupliquer : trois gestes qui se suivent souvent à
 * la seconde près, pour un seul et même relevé. Sans ce délai, le même
 * texte partirait trois fois — trois fois le forfait de données du patron,
 * sur un chantier où le réseau est déjà mauvais.
 *
 * Le délai est court exprès : ce qui compte, c'est que le plan soit AU
 * COMPTE avant que le téléphone ne soit rangé dans la poche.
 */
const DEPOT_DELAI = 2000;
/** Un dépôt en attente par plan : deux plans différents ne s'annulent pas. */
const depots = new Map<string, ReturnType<typeof setTimeout>>();

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
  notes: PlanNote[];
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
  /**
   * MURS QUE ROOMPLAN VOIT MAL, en direct.
   *
   * Chaque surface arrive avec la confiance qu'il lui accorde, deux fois
   * par seconde — et l'app n'en gardait que le NOMBRE de murs. C'est
   * pourtant là que tout se joue : un mur douteux se repasse en dix
   * secondes tant qu'on est dans la pièce, et coûte une demi-heure de
   * retouches une fois rentré (trous à combler, linteaux à remonter,
   * pièces qui ne se referment pas).
   */
  mursDouteux: number;
  /**
   * Le scan en cours COMPLÈTE le relevé au lieu de le remplacer : c'est
   * une pièce de plus, et l'appareillage déjà posé doit survivre.
   */
  complementEnCours: boolean;
  /**
   * L'ÉTAGE qu'on regarde. Le plan, le métré et l'établi ne montrent que
   * lui ; le niveau du dessous s'affiche en filigrane, pour se repérer.
   */
  niveauCourant: number;
  /**
   * Le niveau que le prochain scan viendra remplir, quand on a demandé
   * « Ajouter un étage ». `null` = un scan ordinaire.
   */
  etageEnCours: number | null;
  /**
   * LE TABLEAU TROUVÉ SUR PLACE. `null` tant qu'on n'en a pas relevé un :
   * un chantier neuf ne porte pas de feuille « existant ».
   */
  existant: TableauExistant | null;
  /** Note un départ de plus sur le rail ; rend son identifiant. */
  ajouterDepart: (d: Omit<DepartExistant, 'id'>) => string;
  /** Corrige un départ déjà noté. */
  modifierDepart: (id: string, champs: Partial<DepartExistant>) => void;
  retirerDepart: (id: string) => void;
  /** Décrit le contenant : rangées, modules par rangée, note libre. */
  decrireTableau: (t: Partial<Omit<TableauExistant, 'departs'>>) => void;
  /** Change d'étage. */
  allerAuNiveau: (n: number) => void;
  /** Arme le prochain scan pour cet étage ; `null` désarme. */
  scannerUnEtage: (n: number | null) => void;
  /**
   * Glisse un étage entier au-dessus de celui du dessous, murs, meubles et
   * plafonniers compris. Les autres niveaux ne bougent pas.
   */
  recalerNiveau: (n: number, dx: number, dz: number) => void;
  /**
   * Range le relevé qui arrive à l'étage `n`, sans toucher aux niveaux déjà
   * présents. C'est « compléter le relevé » à l'envers : rien à fusionner,
   * ce ne sont pas les mêmes murs.
   */
  finalizeEtage: (r: ScanResult, n: number) => void;
  setComplement: (v: boolean) => void;
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
  /**
   * La hauteur d'UN mur, sans toucher aux autres.
   *
   * Une retombée de poutre, une sous-pente, un muret de cuisine à 1,10 m :
   * la hauteur d'un logement n'est pas une constante par pièce, et c'est
   * elle qui commande le métré du mur, sa surface à peindre et la place
   * qu'on a pour poser un appareil.
   */
  setWallHeight: (wallId: string, height: number) => void;
  /** Retire un mur du plan (et les ouvertures qu'il portait). */
  removeWall: (wallId: string) => void;
  /**
   * COPIE UNE PIÈCE ET TOUT CE QU'ELLE PORTE, à côté d'elle.
   *
   * Trois chambres qui se ressemblent, deux WC : on les équipait une par
   * une, aux mêmes cotes. Le gain n'est pas la géométrie — quatre murs se
   * retracent vite — c'est l'APPAREILLAGE.
   */
  duplicateRoom: (roomId: string) => string | null;
  /**
   * Repose une pièce RECTANGULAIRE à ses cotes, coin haut-gauche fixe.
   *
   * Un contour libre n'a pas de « largeur × profondeur » unique : le geste
   * ne s'applique qu'aux rectangles, et les autres gardent leurs murs.
   */
  resizeRoom: (roomId: string, largeur: number, profondeur: number) => void;
  /**
   * Trace un mur entre deux points choisis sur le plan. Le premier est
   * généralement l'extrémité d'un mur existant, pour que le nouveau s'y
   * raccroche ; le second se déplace ensuite par sa poignée.
   */
  addWallBetween: (a: Pt, b: Pt) => void;
  /**
   * COMBLE UN TROU DU RELEVÉ — le mur manquant, et la porte avec.
   *
   * Le défaut de scan le plus courant : une porte ouverte que la caméra
   * traverse, et le logement sort en deux morceaux. Le geste tend le mur
   * d'un bout à l'autre et, si l'écart a la taille d'une menuiserie, y
   * pose la porte que le scan n'a pas vue — le tout en UN pas d'histoire.
   */
  comblerTrou: (trou: TrouDeReleve) => void;
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
  /**
   * Les mots écrits sur le plan — voir {@link PlanNote}.
   *
   * Ils ne comptent dans aucun métré et ne pèsent sur aucun contrôle : ce
   * sont des mots pour l'humain qui posera. C'est précisément pour ça
   * qu'ils n'avaient nulle part où aller.
   */
  notes: PlanNote[];
  /** Écrit une note à un point du plan. Un texte vide n'en crée aucune. */
  addNote: (text: string, at: Pt) => void;
  /** Déplace une note. */
  moveNote: (id: string, at: Pt) => void;
  /** Corrige le texte d'une note. Le vider la retire. */
  editNote: (id: string, text: string) => void;
  /** Retire une note. */
  removeNote: (id: string) => void;
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
  /**
   * Punaise une photo sur un mur. `asset` est son identifiant durable dans
   * la photothèque, quand l'utilisateur a laissé l'application l'y ranger.
   */
  addPhoto: (
    wallId: string,
    along: number,
    path: string,
    asset?: string,
  ) => string;
  /**
   * Redemande au coffre l'image d'une photo dont le fichier a disparu —
   * après une réinstallation, typiquement — et réécrit le cache.
   */
  reposerPhoto: (id: string) => Promise<void>;
  /**
   * Dépose un relevé sous le compte, pour qu'il survive au téléphone.
   *
   * Silencieux : sans compte, sans serveur ou sans réseau, il ne se passe
   * rien — c'est un filet, jamais une condition pour travailler.
   */
  deposerAuCompte: (id: string, qui: Identite | null) => Promise<void>;
  /**
   * Redescend les relevés que le compte garde et que ce téléphone n'a pas,
   * et rend leur nombre. C'est le geste d'après une réinstallation.
   */
  reprendreDuCompte: (qui: Identite | null) => Promise<number>;
  removePhoto: (id: string) => void;
  /**
   * Presse-papier d'appareillage : le relevé d'un mur, cotes comprises.
   *
   * Dans un couloir ou une chambre symétrique, on repose trois fois le même
   * équipement, à la même cote du coin. Le refaire à la main, c'est trois
   * fois l'occasion de se tromper d'un centimètre.
   */
  /** Relève l'appareillage d'un mur (face intérieure). */
  /**
   * Noue ou dénoue le lien entre un appareil mural et sa commande — le
   * même geste qu'au plafond. Refuse ce qui ne se commande pas (courant
   * faible, circuits spécialisés) et ce qui ne commande pas (une prise
   * n'allume rien) : la garde vit ICI, quel que soit le chemin.
   */
  toggleFixtureCommand: (fixtureId: string, commandeId: string) => void;
  /** Repose le relevé sur un autre mur. Renvoie le nombre d'appareils posés. */
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
  /** Refait ce qu'une annulation vient de retirer. Voir `avenir`. */
  redo: () => void;
  canUndo: boolean;
  /** Y a-t-il quelque chose à refaire ? (une annulation, non suivie d'un
   *  geste neuf) */
  canRedo: boolean;
  /** D'où vient l'écran résultat : le bouton retour y renvoie. */
  resultOrigin: 'scan' | 'library';
  walls: WallSeg[];
  openings: WallSeg[];
  objects: ObjectData[];

  // Bibliothèque persistée
  saves: SavedScan[];
  /**
   * La bibliothèque du téléphone a été RELUE depuis le stockage.
   *
   * Tant que c'est faux, `saves` est vide parce qu'on n'a pas encore lu —
   * pas parce qu'il n'y a rien. La reprise du compte s'y fie : comparer le
   * coffre à une bibliothèque pas encore lue redescendrait en double des
   * plans déjà là.
   */
  savesCharges: boolean;
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
  /**
   * UN PASSAGE DE PLUS, réuni au relevé courant.
   *
   * Le logement se scanne pièce par pièce, et `StructureBuilder` (iOS 17)
   * aligne les passages : le résultat REMPLACE la géométrie. Mais
   * l'électricien a pu poser vingt prises entre-temps — les perdre parce
   * qu'il ajoute une chambre serait pire que tout. On remplace donc les
   * murs, les ouvertures et les meubles ; on GARDE l'appareillage, le
   * plafond et les photos, en reprojetant ce qui s'accroche à un mur.
   *
   * Et l'on ne consomme aucun essai : c'est le MÊME plan qu'on complète.
   */
  finalizeMerge: (r: ScanResult) => void;
  /**
   * L'ARRIVAGE d'un scan qui vient de finir : ce que le popup de choix
   * propose d'intégrer. RoomPlan DÉTECTE les meubles ; l'électricité, elle,
   * ne peut être que PROPOSÉE (l'implantation NF C 15-100, hors meubles) —
   * une prise fait trois centimètres, le LiDAR voit des meubles. `null` =
   * rien à demander (scan vide, ou choix déjà fait).
   */
  arrivage: { meubles: number; posesViseur?: number } | null;
  oublierArrivage: () => void;
  /** Le patron a décoché les meubles : le plan s'en sépare d'un coup. */
  retirerMeubles: () => void;
  moveWallPoint: (id: string, end: 'a' | 'b', p: { x: number; z: number }) => void;
  /**
   * POUSSE un mur entier, ses voisins restant accrochés.
   *
   * Un mur ne se retouchait que par ses coins, un par un : pour décaler une
   * cloison de dix centimètres, il fallait viser deux fois le même
   * déplacement au doigt — ce qui ne donne jamais deux fois le même, et le
   * mur arrivait de travers.
   */
  moveWall: (id: string, dx: number, dz: number) => void;
  /**
   * DESSOUDE UN MUR DE SES VOISINS.
   *
   * Deux murs qui partagent un point bougent ensemble : c'est ce qu'il faut
   * pour le coin d'une pièce — sans quoi le contour s'ouvre, la surface
   * disparaît et le métré avec elle. Mais pour un retour qu'on veut
   * simplement allonger, c'est l'inverse : « si j'essaye de prolonger ce
   * retour, c'est le long mur qui est impacté ».
   *
   * On ne devine pas laquelle des deux intentions on a : on la DIT. Détaché,
   * le mur se déplace seul — et l'aimant le raccroche dès qu'on ramène son
   * extrémité à moins de vingt-cinq centimètres d'une autre.
   */
  detacherMur: (id: string) => void;
  /**
   * POSE l'angle du mur, en degrés absolus, sans rien accrocher.
   *
   * Le geste de rotation empilait des petits pas, chacun re-collé aux crans
   * de quinze degrés : le mur restait scotché à l'équerre pendant que le
   * doigt continuait, et les arrondis dérivaient. L'angle se pose donc
   * d'un coup, tel que le doigt le désigne — c'est le GESTE qui décide de
   * l'accroche, une seule fois, sur l'angle voulu.
   */
  setWallAngle: (id: string, deg: number) => void;
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
  /**
   * DÉCLARE (ou retire) LE COFFRE DE VOLET qui coiffe cette menuiserie.
   *
   * Le scan ne le voit pas — c'est un accident de maçonnerie au-dessus de
   * la baie, pas une surface qu'ARKit sait nommer. Un geste le pose, à la
   * hauteur courante d'un tunnel ; on la corrige ensuite si le chantier
   * en décide autrement.
   */
  toggleCoffre: (id: string, hauteur?: number) => void;
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
  /**
   * Octets rendus par le dernier balayage des modèles 3D, `null` si rien
   * n'a été effacé. La bibliothèque le dit une fois, puis l'oublie : un
   * ménage muet laisse l'électricien devant le même téléphone plein.
   */
  placeRendue: number | null;
  /** Il a lu le chiffre : on n'y revient pas. */
  oublierPlaceRendue: () => void;
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
   * LA TROISIÈME COTE, et la hauteur à laquelle elle commence.
   *
   * `height` est la hauteur du meuble, `base` celle de son DESSOUS au-dessus
   * du sol. Les deux sont indépendantes : rehausser un meuble haut de
   * cuisine ne doit pas décoller son fond du plan de travail, et le monter
   * de dix centimètres ne doit pas le rendre plus grand. Omettre l'une la
   * laisse telle quelle.
   */
  setObjectHeight: (id: string, height?: number, base?: number) => void;
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
    /**
     * L'ÉTAT AU DÉBUT DU GESTE — et pourquoi il ne peut pas s'en passer.
     *
     * Le premier jet appliquait des pas RELATIFS : « agrandis de trois
     * millimètres de plus ». Chaque image repartait donc de la taille que le
     * store venait d'écrire — c'est-à-dire d'une taille déjà corrigée par
     * l'aimant ou par la butée. La correction se rajoutait à la suivante, et
     * le meuble partait en vrille : 0,44 m, puis 1,53, puis 1,93, en
     * traversant les murs. C'est le défaut filmé sur le chantier.
     *
     * La poignée retient donc la taille et le centre à l'appui, et envoie la
     * distance TOTALE parcourue depuis. Rien ne se cumule : à doigt égal,
     * résultat égal, quelle que soit la cadence des images.
     */
    depuis?: { width: number; depth: number; cx: number; cz: number },
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
  /**
   * REDESCEND LES PLANS DU COMPTE, UNE FOIS, APRÈS UNE RÉINSTALLATION.
   *
   * Rend le nombre de relevés repris. Ne fait rien tant que la
   * bibliothèque locale n'est pas relue, ni sans compte connecté — et pose
   * alors son marqueur, pour ne plus jamais reposer un plan que
   * l'électricien aurait supprimé depuis.
   */
  repriseAuBesoin: () => Promise<number>;
  openSave: (id: string) => void;
  deleteSave: (id: string) => void;
  reset: () => void;
  /**
   * OUVRE UN PLAN VIERGE, SANS SCANNER.
   *
   * Trois besoins, une seule réponse. Les appareils SANS LiDAR — iPhone non
   * Pro, iPad d'entrée de gamme, Android — n'avaient accès à rien :
   * l'accueil annonçait « appareil non compatible » et l'application
   * s'arrêtait là, alors que les neuf dixièmes de sa valeur — les normes,
   * les circuits, le métré, le tableau existant, le dossier — ne demandent
   * aucun capteur. Les PETITES INTERVENTIONS ensuite : pour ajouter deux
   * prises dans une cuisine, on ne relève pas l'appartement, on trace la
   * pièce et l'on chiffre. Les ARCHITECTES enfin, qui esquissent au mètre
   * avant d'avoir mis un pied sur le chantier.
   *
   * Le magasin savait déjà bâtir un logement de proche en proche
   * (`addRoomBox`) : il n'y manquait que la porte d'entrée.
   */
  commencerAuClavier: () => void;
  /**
   * Vrai quand le plan a été ouvert AU CLAVIER, sans scanner.
   *
   * L écran vide n a pas le même sens dans les deux cas : après un scan
   * raté, il faut conseiller de balayer autrement ; après « Dessiner un
   * plan », ce conseil n a aucun sens et le geste attendu est d ajouter une
   * pièce. Un booléen franc vaut mieux qu une déduction fragile tirée du
   * nom du dossier ou de la présence d un modèle 3D.
   */
  planVierge: boolean;
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
    /*
      LA FUSION NE VAUT QUE POUR LES GESTES CONTINUS.

      Trouvé en simulant un utilisateur qui équipe un mur : on pose deux
      prises l'une après l'autre, on touche « Annuler »… et les DEUX
      disparaissent. Deux gestes distincts n'en faisaient qu'un.

      La fusion a pourtant une bonne raison d'être, et il faut la garder :
      un mur qu'on fait glisser envoie cinquante états par seconde, et sans
      elle il faudrait cinquante annulations pour revenir en arrière d'un
      seul geste. Mais elle ne concerne QUE ces gestes-là, ceux qui suivent
      le doigt — et ils se reconnaissent à leur clé, qui désigne l'objet
      manipulé (`move:mur-3:a`, `moveObject:o1`).

      Un geste DISCRET — poser une prise, ajouter une pièce, supprimer un
      mur — porte une clé simple, sans deux-points, et ne se fusionne
      jamais avec le suivant : si rapide soit-il, c'est un geste de plus, et
      « Annuler » lui doit un retour en arrière.
    */
    const continu = key.includes(':');
    if (continu && key === lastKey && now - lastAt < 800) {
      lastAt = now;
      return;
    }
    lastKey = key;
    lastAt = now;
    // Un geste neuf ferme l'avenir : voir `avenir`.
    if (avenir.length > 0) {
      avenir.length = 0;
      if (get().canRedo) set({ canRedo: false });
    }
    const st = get();
    history.push({
      walls: st.walls,
      openings: st.openings,
      objects: st.objects,
      rooms: st.rooms,
      fixtures: st.fixtures,
      photos: st.photos,
      ceiling: st.ceiling,
      notes: st.notes,
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

  /*
    CE PLAN A-T-IL DÉJÀ ÉTÉ COMPTÉ ?

    Le palier gratuit se consomme quand une entrée de bibliothèque naît. Or
    on peut supprimer cette entrée et garder le plan sous les yeux — c'est
    voulu, « on ne retire pas la 3D des mains de qui la regarde ». Le
    ré-enregistrer créait alors une SECONDE entrée, et débitait une seconde
    fois : un relevé payé deux fois.

    La règle du projet dit que supprimer ne REND pas le quota ; elle ne dit
    pas qu'il peut se prendre deux fois pour le même travail. La marque
    suit donc le plan à l'écran, et ne se lève qu'en repartant d'un plan
    neuf (`reset`, qui est le passage obligé de tout nouveau relevé).
  */
  let dejaCompte = false;

  /*
    L'AVENIR : CE QU'UNE ANNULATION A RETIRÉ.

    L'application savait revenir en arrière, jamais repartir en avant. Sur
    un chantier, on annule d'un geste de trop — le doigt appuie deux fois,
    ou l'on se ravise — et le travail était perdu pour de bon : le seul
    chemin pour le retrouver était de le refaire à la main. C'est encore une
    perte de travail, et la plus vicieuse : elle vient d'un bouton dont le
    rôle est précisément de rattraper les erreurs.

    Un geste NEUF vide cette pile : on ne refait pas ce qui n'a plus de sens
    dans un plan qui a changé de branche. C'est la règle de tous les
    éditeurs, et l'inverse produirait des états impossibles.
  */
  const avenir: Snapshot[] = [];

  /** Repart d'un plan vierge d'historique (nouveau scan, ouverture, revert). */
  const clearHistory = () => {
    history.length = 0;
    /*
      L'AVENIR PART AVEC LE PASSÉ.

      Sans cette ligne, « Refaire » ressortirait des morceaux du relevé
      PRÉCÉDENT dans le plan qu'on vient d'ouvrir : la pile survit au
      changement de dossier, elle, et rien n'irait dire à l'utilisateur d'où
      sortent ces murs.
    */
    avenir.length = 0;
    lastKey = '';
    savedDepth = 0;
    set({ canUndo: false, canRedo: false });
  };

  /*
    LE DÉCLENCHEUR DE LA MONTÉE.

    Le coffre et le geste `deposerAuCompte` existaient déjà, mais personne
    ne les appelait : le patron pouvait réinstaller l'application et
    retrouver une bibliothèque vide alors qu'il avait un compte. On accroche
    donc le dépôt à l'ENREGISTREMENT — le geste par lequel un relevé devient
    un dossier, et le seul moment où l'électricien considère son travail
    comme acquis.

    Rien n'est attendu : la fonction rend la main tout de suite, et un
    serveur injoignable ne se voit nulle part. Le plan est déjà écrit dans
    le téléphone quand on arrive ici.
  */
  const deposerPlusTard = (id: string) => {
    const enCours = depots.get(id);
    if (enCours) clearTimeout(enCours);
    depots.set(
      id,
      setTimeout(() => {
        depots.delete(id);
        get()
          .deposerAuCompte(id, identiteDuCompte())
          .catch(() => {
            // Un dépôt manqué ne se dit pas : le prochain enregistrement
            // remontera le plan, et l'original n'a jamais quitté le
            // téléphone.
          });
      }, DEPOT_DELAI),
    );
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
        notes: st.notes,
            north: st.north ?? undefined,
            modelPath: st.modelPath,
            updatedAt: Date.now(),
          }
        : s,
    );
    set({ saves });
    persistSoon(saves);
    deposerPlusTard(st.currentSaveId);
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
    mursDouteux: 0,
    complementEnCours: false,
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
    photos: [],
    ceiling: [],
    notes: [],
    existant: null,
    planVierge: false,
    dirty: false,
    resultOrigin: 'scan',
    rooms: [],
    walls: [],
    openings: [],
    objects: [],
    fixtures: [],
    north: null,
    canUndo: false,
    canRedo: false,
    saves: [],
    savesCharges: false,
    folders: [],
    themePref: 'system',
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
          r.id === roomId
            ? { ...r, name: name.trim().slice(0, NOM_PIECE_MAX) }
            : r,
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

      /*
        DÉPLACER UNE PIÈCE MITOYENNE LA DÉTACHE.

        Le déplacement refusait tout net dès qu'un mur était partagé.
        Depuis que l'ajout accole toujours la nouvelle pièce, cela revenait
        à ne plus pouvoir en déplacer AUCUNE. Et laisser passer le geste tel
        quel serait pire : le mur mitoyen appartient aussi à la voisine, le
        tirer déchirerait son contour.

        La cloison se DÉDOUBLE donc — la pièce déplacée emporte sa copie, la
        voisine garde la sienne et ne bouge pas d'un millimètre. C'est ce qui
        arrive quand on décolle deux boîtes qui se touchaient, et c'est
        exactement l'inverse de la soudure qui les recollera.

        L'appareillage, lui, reste sur l'original : il est posé sur la
        maçonnerie qui n'a pas bougé.
      */
      const mitoyens = st.walls.filter(
        (w) =>
          aMoi.has(w.id) &&
          st.rooms.some(
            (r) => r.id !== roomId && (r.wallIds ?? []).includes(w.id),
          ),
      );
      let murs = st.walls;
      let pieces = st.rooms;
      let mesMurs = aMoi;
      if (mitoyens.length > 0) {
        const graine = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const copies = mitoyens.map((w, i) => ({
          ...w,
          id: `mur-${graine}-${i}`,
          roomId,
        }));
        const remap = new Map(mitoyens.map((w, i) => [w.id, copies[i].id]));
        murs = [...st.walls, ...copies];
        mesMurs = new Set([...aMoi].map((id) => remap.get(id) ?? id));
        pieces = st.rooms.map((r) =>
          r.id === roomId && r.wallIds
            ? { ...r, wallIds: r.wallIds.map((id) => remap.get(id) ?? id) }
            : r,
        );
      }

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
      const bouges = murs
        .filter((w) => mesMurs.has(w.id))
        .map((w) => ({
          a: { x: w.a.x + dx, z: w.a.z + dz },
          b: { x: w.b.x + dx, z: w.b.z + dz },
        }));
      const autres = murs.filter((w) => !mesMurs.has(w.id));
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
      for (const w of murs) {
        if (!mesMurs.has(w.id)) continue;
        const A = { x: w.a.x + ddx, z: w.a.z + ddz };
        const B = { x: w.b.x + ddx, z: w.b.z + ddz };
        for (const o of murs) {
          if (mesMurs.has(o.id)) continue;
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
        walls: murs
          .filter((w) => !soudes.has(w.id))
          .map((w) =>
            mesMurs.has(w.id)
              ? {
                  ...w,
                  a: { x: w.a.x + ddx, z: w.a.z + ddz },
                  b: { x: w.b.x + ddx, z: w.b.z + ddz },
                }
              : w,
          ),
        // La pièce troque ses murs soudés contre ceux qu'elle a rejoints.
        rooms: pieces.map((r) =>
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
          const proche = nearestWall(o, murs.filter((w) => mesMurs.has(w.id)));
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
        // Les appareils des murs partis, ET les liens qui les visaient.
        ...sansLiensMorts(
          st.fixtures.filter((f) => !doomed.has(f.wallId)),
          // Le plafond d'une pièce détruite n'a plus rien à éclairer —
          // il restait pourtant dessiné au-dessus du vide, et compté au
          // métré comme aux circuits.
          st.ceiling.filter((c) => c.roomId !== roomId),
        ),
        photos: st.photos.filter((p) => !doomed.has(p.wallId)),
        dirty: true,
      });
      {
        const partis = st.photos
          .filter((p) => doomed.has(p.wallId))
          .map((p) => p.path);
        const gardees = new Set([
          ...get().photos.map((p) => p.path),
          ...st.saves.flatMap((s) => (s.photos ?? []).map((p) => p.path)),
        ]);
        deletePhotoFiles(partis.filter((p) => !gardees.has(p)));
      }
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
      /*
        ON NE FUSIONNE QUE DES VOISINES.

        Sans mur commun, réunir les deux listes produit une pièce faite de
        deux contours DISJOINTS : plus de surface calculable, plus de métré,
        et à l'écran rien d'autre qu'un nom qui disparaît. C'est ce qu'on a
        pris pour « la fusion ne fait que renommer ».
      */
      const mitoyen = [...inA].some((id) => inB.has(id));
      if (!mitoyen) return;
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
        // Le plafond de la pièce absorbée suit ses meubles : sans ça, la
        // pièce fusionnée était signalée « aucun point lumineux » alors
        // qu'elle en porte.
        ceiling: st.ceiling.map((c) =>
          c.roomId === bId ? { ...c, roomId: aId } : c,
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
      // Les menuiseries départagent une petite PIÈCE d'une gaine technique :
      // ce qui s'ouvre est une pièce, si petit soit-il.
      const shapes = detectRooms(walls, undefined, st.openings);
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
      /*
        LE PLAFOND SUIT LA RENUMÉROTATION. Les pièces reçoivent de
        nouveaux identifiants : un point lumineux qui garderait l'ancien
        deviendrait orphelin — la pièce ressortait « sans point lumineux »
        avec un DCL au plafond, et « Poser le DCL » en posait un deuxième.
        Chaque point se rattache à la pièce qui contient son ancrage.
      */
      const ceiling = st.ceiling.map((cl) => {
        const idx = roomIndexAt(cl.at, shapes.map((s) => s.outline));
        return { ...cl, roomId: `room-${idx + 1}` };
      });
      set({ walls, rooms, objects, fixtures, photos, ceiling, dirty: true });
    },

    /*
      DUPLIQUER UNE PIÈCE — avec tout ce qu'on vient d'y poser.

      Un logement a trois chambres qui se ressemblent, deux WC, des combles
      découpés en cellules identiques. On les relevait une par une, et
      surtout on les ÉQUIPAIT une par une : cinq socles, un interrupteur, un
      point lumineux, à chaque fois, aux mêmes cotes.

      Le gain n'est pas la géométrie — quatre murs se retracent vite. C'est
      L'APPAREILLAGE : c'est lui qui prend le temps, et c'est lui que la
      copie emporte, avec les ouvertures, le mobilier et les points de
      plafond. Une chambre dupliquée est une chambre FINIE.
    */
    /*
      REDIMENSIONNER UNE PIÈCE À SES COTES.

      On pose un « Séjour 5,00 × 4,00 » depuis le catalogue, puis le mètre
      donne 5,18 × 4,05. Il fallait alors déplacer QUATRE murs à la main, un
      par un, en veillant à ne pas ouvrir les coins — pour une correction de
      dix-huit centimètres. Le bandeau affichait pourtant ces cotes, juste à
      côté d'une hauteur éditable d'un appui.

      LE GESTE N'A DE SENS QUE SUR UN RECTANGLE : redimensionner un contour
      en L à « largeur × profondeur » n'a pas de réponse unique, et l'on
      n'en invente pas. Les autres pièces gardent leurs murs, qu'on déplace
      un à un — c'est le prix d'une forme libre.

      LE COIN HAUT-GAUCHE NE BOUGE PAS : la pièce grandit vers la droite et
      vers le bas, donc ce qu'on regarde ne saute pas et les pièces voisines
      restent où elles sont.
    */
    resizeRoom: (roomId, largeur, profondeur) => {
      const st = get();
      const murs = st.walls.filter((w) => w.roomId === roomId);
      if (murs.length !== 4) return;
      // Une cote nulle ou négative n'est pas une intention, c'est une
      // saisie ratée : on ne la borne pas, on l'ignore.
      if (!(largeur > 0) || !(profondeur > 0)) return;
      const L = Math.min(MUR_MAX_M, Math.max(0.6, largeur));
      const P = Math.min(MUR_MAX_M, Math.max(0.6, profondeur));
      const xs = murs.flatMap((w) => [w.a.x, w.b.x]);
      const zs = murs.flatMap((w) => [w.a.z, w.b.z]);
      const x0 = Math.min(...xs);
      const z0 = Math.min(...zs);
      const x1 = Math.max(...xs);
      const z1 = Math.max(...zs);
      // Un contour qui n'est pas d'aplomb n'est pas un rectangle : on ne
      // touche pas à ce qu'on ne sait pas reconstruire.
      const droit = murs.every(
        (w) => Math.abs(w.a.x - w.b.x) < 1e-3 || Math.abs(w.a.z - w.b.z) < 1e-3,
      );
      if (!droit || x1 - x0 < 1e-3 || z1 - z0 < 1e-3) return;

      pushHistory('resizeRoom');
      const place = (v: number, min: number, max: number, taille: number) =>
        Math.abs(v - min) < Math.abs(v - max) ? min : min + taille;
      const murs2 = murs.map((w) => ({
        ...w,
        a: {
          x: place(w.a.x, x0, x1, L),
          z: place(w.a.z, z0, z1, P),
        },
        b: {
          x: place(w.b.x, x0, x1, L),
          z: place(w.b.z, z0, z1, P),
        },
      }));
      const apres = new Map(
        murs2.map((w) => [w.id, Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z)]),
      );
      const neufs = new Map(murs2.map((w) => [w.id, w]));

      /*
        CE QUI EST POSÉ SUR UN MUR RACCOURCI REVIENT DEDANS.

        Une prise à 4,50 m sur un mur ramené à 2 m flotterait dans le vide —
        invisible sur le plan, mais bien comptée par le contrôle des normes.
        On la recale au plus près du bord, comme le fait déjà la pose.
      */
      const recaler = (along: number, wallId: string) => {
        const ap = apres.get(wallId) ?? 0;
        if (ap <= 0 || along <= ap) return along;
        return Math.max(0.05, ap - 0.05);
      };

      set({
        walls: st.walls.map((w) => neufs.get(w.id) ?? w),
        fixtures: st.fixtures.map((f) =>
          neufs.has(f.wallId) ? { ...f, along: recaler(f.along, f.wallId) } : f,
        ),
        dirty: true,
      });
    },

    duplicateRoom: (roomId) => {
      const st = get();
      const source = st.rooms.find((r) => r.id === roomId);
      const mursSource = st.walls.filter((w) => w.roomId === roomId);
      if (!source || mursSource.length === 0) return null;

      /*
        ELLE SE POSE À DROITE, comme une pièce neuve — jamais par-dessus
        l'originale : deux pièces au même endroit, c'est un métré qui double
        sans raison et deux cartouches illisibles l'un sur l'autre.
      */
      const xs = st.walls.flatMap((w) => [w.a.x, w.b.x]);
      const dx =
        Math.max(...xs) +
        0.5 -
        Math.min(...mursSource.flatMap((w) => [w.a.x, w.b.x]));
      // Elle se pose SUR LA MÊME LIGNE que l'originale : côte à côte, comme
      // deux chambres d'un couloir — pas en diagonale.
      const dz = 0;

      const cle = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const neufId = `piece-${cle}`;
      /** Chaque mur copié retient d'où il vient : l'appareillage suivra. */
      const parMur = new Map<string, string>();
      const murs = mursSource.map((w, i) => {
        const id = `mur-${cle}-${i}`;
        parMur.set(w.id, id);
        return {
          ...w,
          id,
          a: { x: w.a.x + dx, z: w.a.z + dz },
          b: { x: w.b.x + dx, z: w.b.z + dz },
          roomId: neufId,
          niveau: st.niveauCourant,
        };
      });

      /*
        LE NOM SE NUMÉROTE, il ne se répète pas : deux « Chambre » sur un
        plan, et le dossier ne dit plus laquelle porte quoi. On prend le
        premier rang libre — une troisième copie ne redevient pas « 2 ».
      */
      const base = (source.name || 'Pièce').replace(/\s+\d+$/, '');
      const pris = new Set(st.rooms.map((r) => r.name));
      let n = 2;
      while (pris.has(`${base} ${n}`)) n += 1;

      /*
        LES OUVERTURES SUIVENT LEUR MUR — et elles ne portent pas de pièce :
        c'est la PROXIMITÉ qui les rattache, la même règle que partout
        ailleurs (voir `nearestWall`). Une porte copiée reste une porte, au
        même endroit du même mur.
      */
      const baies = st.openings
        .filter((o) => nearestWall(o, mursSource).dist < 0.6)
        .map((o, i) => ({
          ...o,
          id: `op-${cle}-${i}`,
          a: { x: o.a.x + dx, z: o.a.z + dz },
          b: { x: o.b.x + dx, z: o.b.z + dz },
          roomId: neufId,
        }));

      const appareils = st.fixtures
        .filter((f) => parMur.has(f.wallId))
        .map((f, i) => ({
          ...f,
          id: `fx-${cle}-${i}`,
          wallId: parMur.get(f.wallId)!,
          // Les liens vers une commande resteraient pendus vers l'original.
          commandes: undefined,
          group: undefined,
        }));

      const plafond = st.ceiling
        .filter((c) => c.roomId === roomId)
        .map((c, i) => ({
          ...c,
          id: `pl-${cle}-${i}`,
          roomId: neufId,
          at: c.at ? { x: c.at.x + dx, z: c.at.z + dz } : c.at,
        }));

      const meubles = st.objects
        .filter((o) => roomOf(o) === roomId)
        .map((o, i) => ({
          ...o,
          id: `ob-${cle}-${i}`,
          roomId: neufId,
          transform: o.transform
            ? o.transform.map((v, k) => (k === 12 ? v + dx : k === 14 ? v + dz : v))
            : o.transform,
        }));

      pushHistory('duplicateRoom');
      set({
        walls: [...st.walls, ...murs],
        openings: [...st.openings, ...baies],
        fixtures: [...st.fixtures, ...appareils],
        ceiling: [...st.ceiling, ...plafond],
        objects: [...st.objects, ...meubles],
        rooms: [
          ...st.rooms,
          {
            ...source,
            id: neufId,
            name: `${base} ${n}`,
            niveau: st.niveauCourant,
            wallIds: murs.map((w) => w.id),
          },
        ],
        dirty: true,
      });
      return neufId;
    },

    removeWall: (wallId) => {
      const st = get();
      pushHistory('removeWall');
      const walls = st.walls.filter((w) => w.id !== wallId);
      /*
        UNE PIÈCE SANS UN SEUL MUR N'EST PLUS UNE PIÈCE.

        Elle restait pourtant dans la liste : invisible sur le plan, mais
        bien présente au métré, au contrôle des normes (« Séjour : 0 socle
        sur 5 exigés ») et dans le dossier PDF. Un fantôme qu'on ne peut ni
        voir ni corriger, et qui reproche à l'électricien de ne pas l'avoir
        équipé.

        Elle s'en va donc avec son dernier mur — et elle seule : une pièce à
        qui il reste un pan est une pièce en cours de retouche, pas une
        pièce morte.
      */
      const vivantes = new Set(walls.map((w) => w.roomId).filter(Boolean));
      const rooms = st.rooms
        .filter((r) => vivantes.has(r.id))
        .map((r) => ({
          ...r,
          wallIds: r.wallIds?.filter((id) => id !== wallId),
        }));
      set({
        walls,
        rooms,
        // Une ouverture sans mur d'accueil n'a plus de sens.
        openings: st.openings.filter((o) => nearestWall(o, walls).dist < 0.6),
        // Une prise non plus : elle était posée sur la face de ce mur —
        // et les liens vers un interrupteur parti s'effacent avec lui.
        ...sansLiensMorts(
          st.fixtures.filter((f) => f.wallId !== wallId),
          st.ceiling,
        ),
        // La photo de repérage montrait CE mur : l'épingle n'a plus où
        // vivre, et son fichier part s'il ne sert à personne d'autre.
        photos: st.photos.filter((p) => p.wallId !== wallId),
        dirty: true,
      });
      {
        const partis = st.photos
          .filter((p) => p.wallId === wallId)
          .map((p) => p.path);
        const gardees = new Set([
          ...get().photos.map((p) => p.path),
          ...st.saves.flatMap((s) => (s.photos ?? []).map((p) => p.path)),
        ]);
        deletePhotoFiles(partis.filter((p) => !gardees.has(p)));
      }
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
            // Il naît à l'étage où l'on travaille : voir `addRoomBox`.
            niveau: st.niveauCourant,
          },
        ],
        dirty: true,
      });
    },

    comblerTrou: (trou) => {
      const st = get();
      const ecart = Math.hypot(trou.b.x - trou.a.x, trou.b.z - trou.a.z);
      if (ecart < 0.02) return;
      pushHistory('comblerTrou');
      const h = st.walls[0]?.height ?? 2.5;
      const mur: WallSeg = {
        id: `mur-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'wall',
        a: { ...trou.a },
        b: { ...trou.b },
        height: h,
        yCenter: h / 2,
        // Le morceau neuf appartient à la pièce de ses voisins : sans ça
        // il flotterait hors de tout, et la surface ne se refermerait pas.
        roomId: st.walls.find((w) => w.id === trou.wallA)?.roomId,
      };
      /*
        UNE PORTE MANQUÉE RESTE UNE PORTE.

        Entre soixante centimètres et un mètre trente, un trou de relevé
        n'est pas un défaut de maçonnerie : c'est la menuiserie que la
        caméra a traversée. On la repose donc, sur toute la largeur du
        manque — et si l'on s'est trompé, « Fermer » la referme d'un
        appui, puisque le geste existe.
      */
      const porte: WallSeg[] =
        ecart >= 0.6 && ecart <= 1.3
          ? [
              {
                id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                type: 'door',
                roomId: mur.roomId,
                a: { ...trou.a },
                b: { ...trou.b },
                height: Math.min(2.05, h * 0.85),
                yCenter: Math.min(2.05, h * 0.85) / 2,
              },
            ]
          : [];
      set({
        walls: [...st.walls, mur],
        openings: [...st.openings, ...porte],
        dirty: true,
      });
    },

    addRoomBox: (largeur, profondeur, nom, contreWallId) => {
      const st = get();
      nom = nom?.slice(0, NOM_PIECE_MAX);
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
      /*
        ELLE S'ACCROCHE TOUJOURS À UN MUR.

        Sans mur choisi, elle se posait à droite de l'emprise avec un jeu
        d'un demi-mètre : une boîte flottant dans le vide, reliée à rien. Le
        plan montrait deux logements, la détection n'y voyait aucune cloison
        commune, et « fusionner » n'avait plus rien à réunir.

        À défaut de choix, on prend le mur EXTÉRIEUR LE PLUS LONG : c'est
        celui qui a le plus de chances d'avoir de la place derrière lui, et
        c'est là qu'on agrandit un logement dans la vraie vie. La pièce se
        pose de l'autre côté, et le mur devient mitoyen.
      */
      const choisi = contreWallId
        ? st.walls.find((w) => w.id === contreWallId)
        : undefined;
      const bordures = new Set(
        st.rooms.flatMap((r) => r.wallIds ?? []),
      );
      const auto = [...st.walls]
        .filter((w) => w.type === 'wall' && bordures.has(w.id))
        // Un mur qui borde DEUX pièces est un refend : lui accoler une
        // troisième pièce la poserait dans l'une des deux.
        .filter(
          (w) =>
            st.rooms.filter((r) => (r.wallIds ?? []).includes(w.id)).length === 1,
        )
        .sort((p, q) => segLength(q) - segLength(p))[0];
      const contre = choisi ?? auto;
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
            // À L'ÉTAGE OÙ L'ON TRAVAILLE, pas au rez-de-chaussée.
            //
            // Seul le scan d'un étage posait le niveau ; tout ce qui se
            // dessine à la main l'ignorait — or c'est précisément le chemin
            // de ceux qui n'ont pas de caméra. La chambre ajoutée depuis le
            // premier étage arrivait donc AU REZ-DE-CHAUSSÉE, superposée au
            // séjour : deux pièces au même endroit, un métré faux, et une
            // surface au sol qui double sans raison.
            niveau: st.niveauCourant,
          }));
          set({
            walls: [...st.walls, ...murs],
            rooms: [
              ...st.rooms,
              {
                id: roomId,
                name: nom,
                floor: null,
                niveau: st.niveauCourant,
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
        // À l'étage où l'on travaille : voir le bloc accolé, plus haut.
        niveau: st.niveauCourant,
      }));
      set({
        walls: [...st.walls, ...murs],
        rooms: [
          ...st.rooms,
          {
            id: roomId,
            name: nom,
            floor: null,
            niveau: st.niveauCourant,
            wallIds: murs.map((w) => w.id),
          },
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

    addPhoto: (wallId, along, path, asset) => {
      pushHistory('photo');
      const id = `ph-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      set({
        photos: [
          ...get().photos,
          { id, wallId, along, path, at: Date.now(), ...(asset ? { asset } : null) },
        ],
        dirty: true,
      });
      return id;
    },

    /*
      REPOSE UNE PHOTO DONT LE FICHIER A DISPARU.

      Relevé du chantier : « que les photos soient lues même s'il réinstalle
      l'application ». Les Documents de l'app partent avec l'app ; la
      photothèque de l'utilisateur, non. On redemande donc l'image au coffre
      et l'on réécrit le cache — le reste de l'application ne voit qu'un
      fichier, comme avant.

      Rien à enregistrer au passage : reposer une photo n'est pas modifier le
      plan. Marquer le scan « modifié » ici ferait réclamer une sauvegarde à
      chaque ouverture, pour un travail que l'utilisateur n'a pas fait.
    */
    /*
      LE RELEVÉ MONTE AU COMPTE, LES IMAGES RESTENT AU TÉLÉPHONE.

      Un relevé de logement entier fait quelques dizaines de kilo-octets :
      des murs, des ouvertures, de l'appareillage et les IDENTIFIANTS des
      photos. C'est du texte, il monte sans rien coûter — et les images,
      elles, ne quittent jamais la photothèque de l'électricien.
    */
    deposerAuCompte: async (id, qui) => {
      if (!qui) return;
      const save = get().saves.find((s) => s.id === id);
      if (!save) return;
      await deposerPlan(qui, {
        scan: save.id,
        nom: save.name,
        maj: save.updatedAt,
        contenu: JSON.stringify(save),
      });
    },

    /*
      CE QUE LE COMPTE GARDE ET QUE CE TÉLÉPHONE N'A PAS.

      On ne redescend QUE ce qui manque : un plan déjà présent ici a pu être
      retouché depuis, et l'écraser avec la version du serveur ferait perdre
      le travail de la matinée. En cas de doute, c'est le téléphone qui a
      raison — c'est lui qui était sur le chantier.
    */
    reprendreDuCompte: async (qui) => {
      if (!qui) return 0;
      const liste = await catalogueDesPlans(qui);
      if (!liste?.length) return 0;
      const ici = new Set(get().saves.map((s) => s.id));
      let repris = 0;
      for (const p of liste) {
        if (ici.has(p.scan)) continue;
        const plan = await reprendrePlan(qui, p.scan);
        if (!plan) continue;
        try {
          const lu = JSON.parse(plan.contenu) as SavedScan;
          if (!lu?.id || !Array.isArray(lu.walls)) continue;
          const saves = [migrateSave(lu), ...get().saves];
          set({ saves });
          persistSoon(saves);
          repris += 1;
        } catch {
          // Un plan illisible ne doit pas arrêter les suivants : le compte
          // en garde peut-être neuf autres qui vont très bien.
        }
      }
      return repris;
    },

    reposerPhoto: async (id) => {
      const ph = get().photos.find((p) => p.id === id);
      if (!ph?.asset) return;
      const chemin = await reposerDuCoffre(ph.asset);
      if (!chemin) return;
      set({
        photos: get().photos.map((p) =>
          p.id === id ? { ...p, path: chemin } : p,
        ),
      });
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

    /*
      LES NOTES DU PLAN.

      Elles n'entrent dans aucun calcul : ni surface, ni métré, ni contrôle
      des normes. C'est ce qui les rend simples — et c'est aussi pourquoi
      elles ont attendu si longtemps, chaque fonction de l'app ayant préféré
      ce qui se compte.
    */
    addNote: (text, at) => {
      const propre = text.trim().slice(0, NOTE_MAX);
      // Un appui par mégarde ne sème pas de pastille muette sur le plan.
      if (!propre) return;
      pushHistory('addNote');
      const st = get();
      set({
        notes: [
          ...st.notes,
          {
            id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            text: propre,
            at,
            niveau: st.niveauCourant,
          },
        ],
        dirty: true,
      });
    },

    moveNote: (id, at) => {
      pushHistory(`moveNote:${id}`);
      set({
        notes: get().notes.map((n) => (n.id === id ? { ...n, at } : n)),
        dirty: true,
      });
    },

    editNote: (id, text) => {
      const propre = text.trim().slice(0, NOTE_MAX);
      // Effacer ce qu'on avait écrit, c'est retirer la note : une pastille
      // vide ne se lit plus et ne se vise plus.
      if (!propre) {
        get().removeNote(id);
        return;
      }
      pushHistory('editNote');
      set({
        notes: get().notes.map((n) => (n.id === id ? { ...n, text: propre } : n)),
        dirty: true,
      });
    },

    removeNote: (id) => {
      pushHistory('removeNote');
      set({ notes: get().notes.filter((n) => n.id !== id), dirty: true });
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

    toggleFixtureCommand: (fixtureId, commandeId) => {
      const st = get();
      const cible = st.fixtures.find((f) => f.id === fixtureId);
      const commande = st.fixtures.find((f) => f.id === commandeId);
      // La garde vit au magasin : un lien qui n'existe pas dans la realite
      // ne doit se nouer par AUCUN chemin.
      if (!cible || !commande) return;
      if (!seCommande(cible.kind)) return;
      if (!COMMANDES_MURALES.includes(commande.kind)) return;
      pushHistory('fixtureCommand');
      set({
        fixtures: st.fixtures.map((f) => {
          if (f.id !== fixtureId) return f;
          const cur = f.commands ?? [];
          return {
            ...f,
            commands: cur.includes(commandeId)
              ? cur.filter((x) => x !== commandeId)
              : [...cur, commandeId],
          };
        }),
        dirty: true,
      });
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
      // L'histoire se photographie AVANT le dégroupage : prise après, elle
      // rendait à l'annulation deux prises sans leur plaque commune.
      pushHistory('removeFixture');
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
      /*
        ET SES LIENS PARTENT AVEC LUI. Un interrupteur supprimé restait la
        « commande » des appliques et des points du plafond : le contrôle
        croyait le point commandé alors que sa commande n'existe plus, et
        le constat « sans commande » ne tombait jamais.
      */
      const purge = (commands?: string[]) => {
        if (!commands?.includes(id)) return commands;
        const restants = commands.filter((x) => x !== id);
        return restants.length > 0 ? restants : undefined;
      };
      set({
        fixtures: get()
          .fixtures.filter((f) => f.id !== id)
          .map((f) => ({ ...f, commands: purge(f.commands) })),
        ceiling: get().ceiling.map((cl) => ({
          ...cl,
          commands: purge(cl.commands),
        })),
        dirty: true,
      });
    },

    undo: () => {
      const prev = history.pop();
      if (!prev) return;
      const st = get();
      // Ce qu'on quitte part dans l'avenir : « Refaire » le ressortira.
      avenir.push({
        walls: st.walls,
        openings: st.openings,
        objects: st.objects,
        rooms: st.rooms,
        fixtures: st.fixtures,
        photos: st.photos,
        ceiling: st.ceiling,
        notes: st.notes,
      });
      set({
        ...prev,
        canUndo: history.length > 0,
        canRedo: true,
        // Revenu à l'état enregistré : il n'y a plus rien à enregistrer, et
        // le bouton de sauvegarde n'a plus lieu d'être.
        dirty: history.length !== savedDepth,
      });
    },

    redo: () => {
      const suite = avenir.pop();
      if (!suite) return;
      const st = get();
      // Et le voyage se fait dans les deux sens : ce qu'on quitte en
      // avançant redevient annulable.
      history.push({
        walls: st.walls,
        openings: st.openings,
        objects: st.objects,
        rooms: st.rooms,
        fixtures: st.fixtures,
        photos: st.photos,
        ceiling: st.ceiling,
        notes: st.notes,
      });
      set({
        ...suite,
        canUndo: true,
        canRedo: avenir.length > 0,
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

    setWallHeight: (wallId, height) => {
      /*
        LA BORNE BASSE N'EST PAS CELLE D'UNE PIÈCE.

        Le réglage par pièce refuse tout ce qui est sous le mètre — une
        pièce de 80 cm de haut n'existe pas. Un MUR de 80 cm, si : c'est un
        muret, une allège, un retour de cloison de douche. On garde
        seulement le garde-fou du dessus, et un plancher à 30 cm en dessous
        duquel ce n'est plus un mur mais une plinthe.
      */
      if (!(height >= 0.3) || height > 6) return;
      const st = get();
      const wall = st.walls.find((w) => w.id === wallId);
      if (!wall || Math.abs(wall.height - height) < 1e-6) return;
      pushHistory(`wallHeight:${wallId}`);
      // Le sol reste où il est : c'est le plafond qui monte ou descend.
      const sol = wall.yCenter - wall.height / 2;

      /*
        CE QUI EST ACCROCHÉ AU MUR DESCEND AVEC LUI.

        Abaisser un mur sans rien d'autre laisse une prise flottant DANS le
        plafond et une porte qui dépasse du toit. Ni l'une ni l'autre ne se
        voit sur le plan 2D — on ne s'en aperçoit qu'en élévation, ou au
        métré, c'est-à-dire trop tard.
      */
      const fixtures = st.fixtures.map((f) => {
        if (f.wallId !== wallId) return f;
        const demi = (FIXTURES[f.kind]?.h ?? 0.1) / 2;
        const haut = sol + height - demi;
        const bas = sol + demi;
        if (f.height <= haut) return f;
        return { ...f, height: Math.max(bas, haut) };
      });

      const surCeMur = new Set(
        openingsOn([wall], st.openings).map((o) => o.id),
      );
      const openings = st.openings.map((o) => {
        if (!surCeMur.has(o.id)) return o;
        const base = o.yCenter - o.height / 2;
        const plafond = sol + height;
        if (base + o.height <= plafond) return o;
        // On rabat d'abord le linteau ; si l'allège elle-même est au-dessus
        // du nouveau plafond, la baie redescend jusqu'au sol.
        const h = Math.max(0.2, Math.min(o.height, plafond - base));
        const b = Math.min(base, plafond - h);
        return { ...o, height: h, yCenter: b + h / 2 };
      });

      set({
        walls: st.walls.map((w) =>
          w.id === wallId ? { ...w, height, yCenter: sol + height / 2 } : w,
        ),
        fixtures,
        openings,
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
    setComplement: (v) => set({ complementEnCours: v }),

    applyLiveUpdate: (u) =>
      set({
        wallCount: u.wallCount,
        objectCount: u.objectCount,
        doorCount: u.doorCount,
        windowCount: u.windowCount,
        /*
          « medium » compte AUTANT que « low ». RoomPlan ne réserve pas sa
          confiance haute aux cas parfaits : un mur moyen est un mur qu'on
          ferait mieux de repasser, et le repasser ne coûte rien tant qu'on
          est devant. C'est le compte qui compte, pas le détail : on ne va
          pas demander à quelqu'un qui balaie une pièce de lire une liste.
        */
        mursDouteux: (u.surfaces ?? []).filter((s2) => {
          const c2 = String(s2.confidence ?? '').toLowerCase();
          return (
            (s2.type ?? 'wall') === 'wall' && (c2 === 'low' || c2 === 'medium')
          );
        }).length,
      }),

    arrivage: null,
    oublierArrivage: () => set({ arrivage: null }),
    retirerMeubles: () => {
      pushHistory('retirerMeubles');
      set({ objects: [], dirty: true });
    },

    finalizeMerge: (r) => {
      const st = get();
      const surfaces = r.rooms?.length
        ? r.rooms.flatMap((x) => x.surfaces ?? [])
        : r.surfaces ?? [];
      const entrants = r.rooms?.length
        ? r.rooms.flatMap((x) => x.objects ?? [])
        : r.objects ?? [];
      const segments = surfaces.map((x) => toSegment(x));
      /*
        LA CLOISON MITOYENNE EST VUE DEUX FOIS — une fois depuis chaque
        pièce. Sans les réunir, chaque arête doublée fausse le parcours des
        faces, et le logement ressort en une seule pièce, ou en aucune.
      */
      const walls = mergeColinear(
        splitAtJunctions(
          weldCorners(
            fusionnerMursDoubles(segments.filter((x) => x.type === 'wall')),
          ),
        ),
      );
      if (walls.length === 0) return;
      const openings = segments.filter((x) => x.type !== 'wall');
      pushHistory('completerReleve');

      const detected = detectRooms(walls, undefined, openings);
      const shapes =
        detected.length > 0
          ? detected
          : [{ outline: [], wallIds: walls.map((w) => w.id), area: 0 }];

      /*
        CE QUI S'ACCROCHE À UN MUR SE REPOSE SUR LE NOUVEAU JEU.

        Les murs du second passage portent d'autres identifiants, et la
        fusion a pu les redécouper : sans reprojection, chaque prise posée
        se retrouverait sur un mur qui n'existe plus — disparue de l'écran,
        des comptages et du métré.
      */
      const fixtures = reprojectFixtures(st.walls, walls, st.fixtures);
      const photos = reprojectAnchors(st.walls, walls, st.photos);

      const floor = r.floor ?? r.rooms?.[0]?.floor ?? st.rooms[0]?.floor ?? null;
      const objects: ObjectData[] = separerLeMobilier(
        entrants.map((o) => ({
          ...o,
          roomId: `room-${roomIndexAt(
            { x: o.transform[12], z: o.transform[14] },
            shapes.map((x) => x.outline),
          ) + 1}`,
        })),
      );
      const kinds = shapes.map((_, i) =>
        deduceRoomKind(
          objects
            .filter((o) => o.roomId === `room-${i + 1}`)
            .map((o) => o.category),
        ),
      );
      const auto = nameRooms(kinds);
      // Les noms donnés à la main survivent au second passage : on rattache
      // chaque pièce neuve à l'ancienne dont le cartouche tombe dedans.
      const anciennes = roomParts(st.walls, st.rooms);
      const kept: RoomEntry[] = shapes.map((sh, i) => {
        const avant = anciennes.find((pa) =>
          pointInPolygon(pa.labelAt, sh.outline),
        );
        const garde = avant
          ? st.rooms.find((x) => x.id === avant.roomId)
          : undefined;
        return {
          id: `room-${i + 1}`,
          name: garde?.name || auto[i],
          wallIds: sh.wallIds,
          kind: kinds[i] ?? undefined,
          floor,
        };
      });
      /*
        LE PLAFOND SUIT SA PIÈCE, par la position de son ancrage : les
        identifiants de pièce sont refaits à neuf.
      */
      const ceiling = st.ceiling.map((cl) => ({
        ...cl,
        roomId: `room-${roomIndexAt(cl.at, shapes.map((x) => x.outline)) + 1}`,
      }));

      /* Ce que le viseur a posé PENDANT ce passage vient s'ajouter. */
      const viseMerge = ancrerElec(
        r.elec ?? [],
        walls,
        kept.map((x, i) => ({ id: x.id, outline: shapes[i]?.outline })),
        (prefixe, n) => `${prefixe}-${Date.now().toString(36)}-${n}`,
      );

      set({
        modelPath: r.modelPath ?? st.modelPath,
        rooms: kept,
        walls,
        openings,
        objects,
        fixtures: [...fixtures, ...viseMerge.fixtures],
        photos,
        ceiling: [...ceiling, ...viseMerge.ceiling],
        north: typeof r.north === 'number' ? r.north : st.north,
        processing: false,
        scanning: false,
        screen: 'result',
        dirty: true,
      });
    },

    /*
      LE TABLEAU EXISTANT — il naît du premier départ noté.

      Pas de structure vide posée d'avance : sa seule présence commande la
      feuille « installation existante » du dossier, et un chantier neuf
      n'a rien à en dire. Elle apparaît quand on ouvre un tableau, pas
      quand on ouvre l'application.
    */

    ajouterDepart: (d) => {
      const id = `dep-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 5)}`;
      const ex = get().existant;
      set({
        existant: {
          ...(ex ?? { departs: [] }),
          departs: [...(ex?.departs ?? []), { ...d, id }],
        },
        dirty: true,
      });
      return id;
    },

    modifierDepart: (id, champs) => {
      const ex = get().existant;
      if (!ex) return;
      set({
        existant: {
          ...ex,
          departs: ex.departs.map((d) =>
            d.id === id ? { ...d, ...champs, id } : d,
          ),
        },
        dirty: true,
      });
    },

    retirerDepart: (id) => {
      const ex = get().existant;
      if (!ex) return;
      set({
        existant: { ...ex, departs: ex.departs.filter((d) => d.id !== id) },
        dirty: true,
      });
    },

    decrireTableau: (t) => {
      const ex = get().existant;
      set({
        existant: { ...(ex ?? { departs: [] }), ...t },
        dirty: true,
      });
    },

    niveauCourant: NIVEAU_RDC,
    etageEnCours: null,
    allerAuNiveau: (n) => set({ niveauCourant: n }),
    scannerUnEtage: (n) => set({ etageEnCours: n, complementEnCours: false }),

    recalerNiveau: (n, dx, dz) => {
      const st = get();
      if (dx === 0 && dz === 0) return;
      pushHistory(`recalerNiveau:${n}`);
      const bouge = (p: Pt) => ({ x: p.x + dx, z: p.z + dz });
      const auNiveau = (w: WallSeg) => niveauDe(w) === n;
      const idsDuNiveau = new Set(
        st.walls.filter(auNiveau).map((w) => w.id),
      );
      set({
        walls: deplacerNiveau(st.walls, n, dx, dz),
        openings: deplacerNiveau(st.openings, n, dx, dz),
        // Le mobilier suit sa pièce, et le plafond son ancrage : tout ce qui
        // vit à cet étage voyage avec lui, sinon on recalerait les murs en
        // laissant les meubles vingt mètres plus loin.
        objects: st.objects.map((o) => {
          const piece = st.rooms.find((r) => r.id === o.roomId);
          if (!piece || niveauDe(piece) !== n) return o;
          const t = [...o.transform];
          t[12] += dx;
          t[14] += dz;
          return { ...o, transform: t };
        }),
        ceiling: st.ceiling.map((cl) => {
          const piece = st.rooms.find((r) => r.id === cl.roomId);
          return piece && niveauDe(piece) === n
            ? { ...cl, at: bouge(cl.at) }
            : cl;
        }),
        dirty: true,
      });
      // L'appareillage et les photos tiennent à un mur par une cote le long
      // de ce mur : le mur bouge, elles bougent avec lui sans rien à faire.
      void idsDuNiveau;
    },

    /*
      L'ÉTAGE S'EMPILE, IL NE REMPLACE RIEN.

      « Compléter le relevé » repasse un scan et FUSIONNE avec l'existant :
      ce sont les mêmes murs, vus une seconde fois. Un étage, c'est le
      contraire — d'autres murs, d'autres pièces, et rien à fusionner. On
      ajoute donc, en estampillant le niveau, sans toucher à ce qui est en
      bas.

      Deux précautions qui viennent du terrain :

      — les identifiants de pièce portent le niveau (`room-1-3`). Détectés
        séparément, les deux étages produisaient chacun un « room-1 » : le
        meuble du salon se rattachait à la chambre du dessus, et le métré
        comptait deux fois la même pièce.

      — l'étage est PRÉ-CALÉ sur celui du dessous. ARKit repart de l'endroit
        où l'on a appuyé sur « Scanner » : après l'escalier, le relevé du
        haut tombe à vingt mètres de celui du bas. On aligne les emprises
        pour partir d'un empilement plausible ; le recalage fin se fait
        ensuite à la main, sur le filigrane.
    */
    finalizeEtage: (r, n) => {
      const st = get();
      const surfaces = r.rooms?.length
        ? r.rooms.flatMap((x) => x.surfaces ?? [])
        : r.surfaces ?? [];
      const entrants = r.rooms?.length
        ? r.rooms.flatMap((x) => x.objects ?? [])
        : r.objects ?? [];
      const segments = surfaces.map((s) => toSegment(s));
      const bruts = mergeColinear(
        splitAtJunctions(
          weldCorners(
            fusionnerMursDoubles(segments.filter((s) => s.type === 'wall')),
          ),
        ),
      );
      if (bruts.length === 0) {
        set({ processing: false, scanning: false, etageEnCours: null });
        return;
      }
      const ouverturesBrutes = segments.filter((s) => s.type !== 'wall');

      /* Le pré-calage : les deux emprises, centre sur centre. */
      const emprise = (ws: WallSeg[]) => {
        const xs = ws.flatMap((w) => [w.a.x, w.b.x]);
        const zs = ws.flatMap((w) => [w.a.z, w.b.z]);
        return {
          x: (Math.min(...xs) + Math.max(...xs)) / 2,
          z: (Math.min(...zs) + Math.max(...zs)) / 2,
        };
      };
      const dessous = st.walls.filter((w) => niveauDe(w) === n - 1);
      const reference = dessous.length > 0 ? dessous : st.walls;
      let dx = 0;
      let dz = 0;
      if (reference.length > 0) {
        const cible = emprise(reference);
        const venu = emprise(bruts);
        dx = cible.x - venu.x;
        dz = cible.z - venu.z;
      }
      const pose = <T extends WallSeg>(ws: T[]): T[] =>
        ws.map((w) => ({
          ...w,
          id: `${w.id}-n${n}`,
          a: { x: w.a.x + dx, z: w.a.z + dz },
          b: { x: w.b.x + dx, z: w.b.z + dz },
          niveau: n,
        }));
      const walls = pose(bruts);
      const openings = pose(ouverturesBrutes);

      const detected = detectRooms(walls, undefined, openings);
      const shapes =
        detected.length > 0
          ? detected
          : [{ outline: [], wallIds: walls.map((w) => w.id), area: 0 }];
      const idPiece = (i: number) => `room-${n}-${i + 1}`;

      const objects: ObjectData[] = separerLeMobilier(
        entrants.map((o) => {
          const t = [...o.transform];
          t[12] += dx;
          t[14] += dz;
          return {
            ...o,
            id: `${o.id}-n${n}`,
            transform: t,
            roomId: idPiece(
              roomIndexAt(
                { x: t[12], z: t[14] },
                shapes.map((s) => s.outline),
              ),
            ),
          };
        }),
      );
      const kinds = shapes.map((_, i) =>
        deduceRoomKind(
          objects
            .filter((o) => o.roomId === idPiece(i))
            .map((o) => o.category),
        ),
      );
      const noms = nameRooms(kinds);
      const pieces: RoomEntry[] = shapes.map((s, i) => ({
        id: idPiece(i),
        name: noms[i],
        wallIds: s.wallIds,
        kind: kinds[i] ?? undefined,
        floor: r.floor ?? r.rooms?.[0]?.floor ?? null,
        niveau: n,
      }));

      /* Ce que le viseur a posé pendant la montée arrive avec l'étage. */
      const vise = ancrerElec(
        r.elec ?? [],
        walls,
        pieces.map((x, i) => ({ id: x.id, outline: shapes[i]?.outline })),
        (prefixe, k) => `${prefixe}-${Date.now().toString(36)}-n${n}-${k}`,
      );

      pushHistory('ajouterEtage');
      set({
        walls: [...st.walls, ...walls],
        openings: [...st.openings, ...openings],
        rooms: [...st.rooms, ...pieces],
        objects: [...st.objects, ...objects],
        fixtures: [...st.fixtures, ...vise.fixtures],
        ceiling: [...st.ceiling, ...vise.ceiling],
        // On travaille à l'étage qu'on vient de scanner, pas au
        // rez-de-chaussée qu'on a quitté.
        niveauCourant: n,
        etageEnCours: null,
        processing: false,
        scanning: false,
        screen: 'result',
        planVierge: false,
        dirty: true,
      });
    },

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
      const detected = detectRooms(walls, undefined, openings);
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
          notes: [],
          processing: false,
          scanning: false,
          screen: 'result',
          // Rien d'exploitable : rien à proposer non plus.
          arrivage: null,
        });
        return;
      }

      /*
        CE QU'ON A POSÉ AU VISEUR PENDANT LE RELEVÉ.

        Le natif n'a rendu que des points du monde — c'est tout ce qu'un
        rayon sait dire. `ancrerElec` les rattache : à leur mur et à leur
        hauteur pour l'appareillage, à la pièce qu'ils surplombent pour les
        points de plafond. Ce qui ne tombe nulle part est jeté plutôt que
        posé au hasard.
      */
      const vise = ancrerElec(
        r.elec ?? [],
        walls,
        kept.map((x, i) => ({ id: x.id, outline: shapes[i]?.outline })),
        (prefixe, n) => `${prefixe}-${Date.now().toString(36)}-${n}`,
      );

      // Sauvegarde automatique : aucun scan terminé ne peut se perdre.
      // C'est ICI que le palier gratuit se consomme — « générer un plan »,
      // c'est en garder un. Un essai jeté avant la fin ne compte pas, et
      // supprimer un relevé ne rend pas le quota.
      useAccountStore.getState().noterPlanCree();
      dejaCompte = true;
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
        fixtures: vise.fixtures,
        photos: [],
        ceiling: vise.ceiling,
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
        fixtures: vise.fixtures,
        photos: [],
        ceiling: vise.ceiling,
        north: typeof r.north === 'number' ? r.north : null,
        saves,
        processing: false,
        scanning: false,
        screen: 'result',
        /*
          Le popup de fin de scan demandera quoi intégrer — même sans
          meuble : l'électricité aux normes se propose sur tout relevé. Il
          compte aussi ce qu'on a POSÉ AU VISEUR, pour qu'on sache que
          décocher les normes ne retire rien de ce travail-là.
        */
        arrivage: {
          meubles: objects.length,
          posesViseur: vise.fixtures.length + vise.ceiling.length,
        },
        /*
          LE BROUILLON MEURT AVEC L'ENREGISTREMENT — relevé du chantier :
          « le message de reprise est inutile, on le retrouve dans mes
          scans ». Le filet ne protège que ce qui n'est PAS en bibliothèque ;
          un scan terminé y est. Laisser la carte, c'était proposer de
          reprendre un relevé déjà rangé.
        */
        brouillon: null,
      });
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      clearHistory();
      persistSoon(saves);
      // Un scan terminé est un dossier : il monte comme les autres, sans
      // attendre que le patron pense à toucher « Enregistrer ».
      deposerPlusTard(save.id);
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
      /*
        LA SOUDURE PASSE AVANT TOUT LE RESTE.

        Relevé du chantier : « une facilité pour le joindre à une extrémité
        de mur ». L'aide au doigt alignait PAR AXE — le x d'un bout, le z
        d'un autre — et ne joignait donc jamais rien : le coin se posait à
        l'aplomb de deux extrémités sans en toucher aucune, et le contour
        fuyait par un interstice qu'on ne voit pas à l'écran. Pas de
        contour fermé, pas de surface, pas de métré.

        Un bout de mur à moins de vingt-cinq centimètres, c'est une
        intention : on s'y pose EXACTEMENT, et on ne redresse plus rien
        après — l'équerre déferait la jonction qu'on vient de faire.
      */
      const soudure = soudureAuBout(p, walls, 0.25, old);
      const aligned = soudure ?? snapToNeighbours(p, walls, frame, 0.12, old);
      const snapped = soudure ?? snapAngle(fixed, aligned, 5, frame);
      const room = roomOf(wall);
      /*
        UN MUR DÉTACHÉ SE DÉPLACE SEUL.

        Relevé du chantier : « si j'essaye de prolonger ce retour, c'est le
        long mur qui est impacté ». Les deux comportements sont justes, mais
        pas au même moment — le coin d'une pièce doit entraîner ses murs,
        sinon le contour s'ouvre et la surface disparaît ; un retour qu'on
        allonge ne doit toucher que lui.

        On ne devine pas l'intention, on la lit : « Détacher ce mur » l'a
        dite, et la marque survit jusqu'au raccrochage.
      */
      const seul = wall.libre === true;
      // Raccrocher, c'est ressouder : un bout ramené sur celui d'un autre
      // rend le mur solidaire, sans quoi il resterait libre pour toujours
      // et le contour ne se refermerait jamais vraiment.
      const rendreSolidaire = seul && soudure !== null;
      set({
        walls: walls.map((w) => {
          if (w.id === id) {
            const bouge = { ...w, [end]: snapped };
            return rendreSolidaire ? { ...bouge, libre: undefined } : bouge;
          }
          if (seul) return w;
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

    detacherMur: (id) => {
      const st = get();
      const wall = st.walls.find((w) => w.id === id);
      if (!wall || wall.libre) return;
      /*
        RIEN NE BOUGE — on défait seulement la soudure.

        Les murs ne se tiennent pas par une référence mais par leurs
        COORDONNÉES : deux bouts au même endroit sont un coin. Écarter les
        points pour les séparer déplacerait le mur, ce qu'on ne veut à aucun
        prix — un retour se détache pour être allongé, pas pour sauter de
        deux centimètres.

        On pose donc une marque, et c'est `moveWallPoint` qui la lit : un
        mur libre se déplace seul, ses voisins restent où ils sont.
      */
      const colle = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-4;
      const tientAQuelquun = st.walls.some(
        (w) =>
          w.id !== id &&
          (colle(w.a, wall.a) ||
            colle(w.b, wall.a) ||
            colle(w.a, wall.b) ||
            colle(w.b, wall.b)),
      );
      // Un mur seul au monde n'a rien à détacher : ne pas toucher au plan
      // évite une entrée d'historique et un bouton d'enregistrement pour
      // un geste qui n'a rien fait.
      if (!tientAQuelquun) return;
      pushHistory(`detacher:${id}`);
      set({
        walls: st.walls.map((w) => (w.id === id ? { ...w, libre: true } : w)),
        dirty: true,
      });
    },

    moveWall: (id, dx, dz) => {
      const st = get();
      const wall = st.walls.find((w) => w.id === id);
      if (!wall || (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9)) return;

      /*
        L'AIMANT RATTRAPE LA MAIN, IL NE LA CONTREDIT PAS.

        Une cloison poussée à trois centimètres de l'aplomb d'une autre est
        une cloison qu'on voulait aligner : le doigt ne fait pas mieux sur un
        écran de six pouces. Au-delà de douze centimètres, c'est un choix —
        et le reprendre serait insupportable.

        On ne regarde que les murs PARALLÈLES dont la projection recouvre la
        nôtre : deux murs alignés bout à bout ne s'aimantent pas, ils se
        suivent déjà.
      */
      const AIMANT = 0.12;
      const A = { x: wall.a.x + dx, z: wall.a.z + dz };
      const B = { x: wall.b.x + dx, z: wall.b.z + dz };
      const lm = Math.hypot(B.x - A.x, B.z - A.z) || 1;
      const um = { x: (B.x - A.x) / lm, z: (B.z - A.z) / lm };
      const n = { x: -um.z, z: um.x };
      let cale = 0;
      let mieux = AIMANT;
      for (const o of st.walls) {
        if (o.id === id) continue;
        const lo = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) || 1;
        const uo = { x: (o.b.x - o.a.x) / lo, z: (o.b.z - o.a.z) / lo };
        if (Math.abs(um.x * uo.z - um.z * uo.x) > 0.05) continue;
        const t = (p: Pt) => (p.x - o.a.x) * uo.x + (p.z - o.a.z) * uo.z;
        const t0 = Math.min(t(A), t(B));
        const t1 = Math.max(t(A), t(B));
        if (t1 < 0.05 || t0 > lo - 0.05) continue;
        const e = (A.x - o.a.x) * n.x + (A.z - o.a.z) * n.z;
        if (Math.abs(e) < mieux) {
          mieux = Math.abs(e);
          cale = -e;
        }
      }
      const ddx = dx + n.x * cale;
      const ddz = dz + n.z * cale;

      /*
        LES VOISINS RESTENT ACCROCHÉS.

        Dans un logement, pousser une cloison ÉTIRE les deux murs qui la
        tiennent. Les laisser où ils étaient ouvrirait le contour, et la
        pièce cesserait d'avoir une surface. On déplace donc TOUT point du
        plan qui coïncidait avec un bout du mur — c'est la même règle que
        pour un coin tiré à la main.
      */
      pushHistory(`moveWall:${id}`);
      const colle = (p: Pt, ref: Pt) => Math.hypot(p.x - ref.x, p.z - ref.z) < 1e-4;
      const glisse = (p: Pt) => ({ x: p.x + ddx, z: p.z + ddz });
      set({
        walls: st.walls.map((w) => {
          if (w.id === id) return { ...w, a: glisse(w.a), b: glisse(w.b) };
          const suit = (p: Pt) =>
            colle(p, wall.a) || colle(p, wall.b) ? glisse(p) : p;
          return { ...w, a: suit(w.a), b: suit(w.b) };
        }),
        // Ce qui est PERCÉ dans ce mur voyage avec lui : une baie restée en
        // arrière serait une baie dans le vide.
        openings: st.openings.map((o) => {
          const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
          return pointOnSeg(mid, wall.a, wall.b).dist < 0.4
            ? { ...o, a: glisse(o.a), b: glisse(o.b) }
            : o;
        }),
        dirty: true,
      });
    },

    /*
      L'ANGLE SE POSE, IL NE S'ACCUMULE PAS.

      Relevé du chantier : « la rotation ne suit pas bien le mouvement ».
      Le geste envoyait des petits pas — un demi-degré, parfois moins — et
      CHACUN était re-collé aux crans de quinze degrés avant d'être appliqué,
      le pas suivant repartant du cran atteint. Deux conséquences : le mur
      restait scotché à l'équerre pendant que le doigt s'en éloignait, et
      cent arrondis successifs le faisaient dériver.

      On pose donc l'angle voulu, d'un seul coup, tel quel. L'accroche
      appartient au geste, qui la décide UNE FOIS sur l'angle absolu —
      voir `angleAimante`. Et le pivot reste le milieu : autour d'un bout,
      l'autre extrémité part au loin et l'on ne vise plus rien.
    */
    setWallAngle: (id, deg) => {
      const st = get();
      const wall = st.walls.find((w) => w.id === id);
      if (!wall || !Number.isFinite(deg)) return;
      const centre = {
        x: (wall.a.x + wall.b.x) / 2,
        z: (wall.a.z + wall.b.z) / 2,
      };
      const actuel =
        (Math.atan2(wall.b.z - wall.a.z, wall.b.x - wall.a.x) * 180) / Math.PI;
      // Le chemin le plus court : poser 359° après 1° ne fait pas faire un
      // tour complet au mur.
      const ecart = ((deg - actuel + 540) % 360) - 180;
      if (Math.abs(ecart) < 1e-6) return;
      const rot = (ecart * Math.PI) / 180;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const tourne = (p: Pt) => {
        const x = p.x - centre.x;
        const z = p.z - centre.z;
        return {
          x: centre.x + x * cos - z * sin,
          z: centre.z + x * sin + z * cos,
        };
      };
      const na = tourne(wall.a);
      const nb = tourne(wall.b);
      pushHistory(`setWallAngle:${id}`);
      const colle = (p: Pt, ref: Pt) => Math.hypot(p.x - ref.x, p.z - ref.z) < 1e-4;
      set({
        walls: st.walls.map((w) => {
          if (w.id === id) return { ...w, a: na, b: nb };
          // Les voisins suivent le bout auquel ils sont soudés : le contour
          // reste fermé, quitte à ce qu'ils s'allongent ou raccourcissent.
          const suit = (p: Pt) =>
            colle(p, wall.a) ? na : colle(p, wall.b) ? nb : p;
          return { ...w, a: suit(w.a), b: suit(w.b) };
        }),
        openings: st.openings.map((o) => {
          const mid = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 };
          return pointOnSeg(mid, wall.a, wall.b).dist < 0.4
            ? { ...o, a: tourne(o.a), b: tourne(o.b) }
            : o;
        }),
        dirty: true,
      });
    },

    /** Modifie la longueur d'un mur en déplaçant son extrémité B le long de sa direction. */
    setWallLength: (id, length) => {
      const { walls, moveWallPoint } = get();
      const wall = walls.find((w) => w.id === id);
      if (!wall || length <= 0) return;
      /*
        NEUF CENT QUATRE-VINGT-DIX-NEUF MÈTRES.

        La saisie acceptait n'importe quel nombre : un doigt qui tape
        « 999 » au lieu de « 9,99 » — deux touches d'écart — envoyait un mur
        à un kilomètre, et tout le plan devenait un point à l'écran sans
        qu'on comprenne ce qu'on venait de faire. Le minimum était déjà
        borné plus bas (soixante centimètres) ; il manquait l'autre bout.

        Soixante mètres : trois fois la façade d'une maison, bien au-delà du
        plus grand hangar qu'on relèvera avec un téléphone. Au-delà, ce
        n'est plus une cote, c'est une faute de frappe.
      */
      length = Math.min(length, MUR_MAX_M);
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
      const clean = name.trim().slice(0, NOM_PLAN_MAX);
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
        // Le compte garde le NOM avec le plan : un « Chantier Dupont »
        // renommé ici et resté « Sans titre » au coffre serait introuvable
        // après une réinstallation.
        deposerPlusTard(st.currentSaveId);
      }
    },

    commitCurrent: () => {
      /*
        UN PLAN QUI N'A PAS ENCORE D'ENTRÉE S'EN VOIT CRÉER UNE.

        Trouvé en parcourant l'application comme un utilisateur qui la
        découvre : on choisit « Dessiner un plan », on pose un séjour, on
        touche « Enregistrer »… et rien n'est enregistré. `syncCurrent`
        recopie le plan courant DANS SON entrée de bibliothèque, et un plan
        dessiné n'en a jamais eu — la fonction sortait donc sans rien faire,
        puis le drapeau des modifications s'effaçait quand même.
        L'application affirmait que le travail était sauvé alors qu'il
        n'existait nulle part.

        C'est le défaut le plus cher de cette application — le seul qui
        coûte un déplacement. Seul un scan terminé créait une entrée, parce
        que lui s'auto-enregistre à la fin du relevé ; le plan tracé à la
        main n'avait pas son équivalent.

        ET C'EST ICI QUE LE PALIER GRATUIT SE CONSOMME, exactement pour la
        même raison qu'après un scan : « générer un plan, c'est en garder
        un ». La règle ne dépend pas du chemin — un plan tracé à la main est
        un plan. Un plan VIDE, lui, n'est rien : on ne débite pas l'essai de
        quelqu'un qui a seulement ouvert l'écran.
      */
      const st = get();
      if (!st.currentSaveId) {
        if (st.walls.length === 0) return;
        if (!dejaCompte) {
          useAccountStore.getState().noterPlanCree();
          dejaCompte = true;
        }
        const now = Date.now();
        const save: SavedScan = {
          id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
          name: st.scanName || defaultName(new Date(now)),
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
        notes: st.notes,
          existant: st.existant ?? undefined,
          north: st.north ?? undefined,
          client: st.client || undefined,
          address: st.address || undefined,
        };
        const saves = [save, ...st.saves];
        set({ saves, currentSaveId: save.id, dirty: false });
        persistSoon(saves);
        savedDepth = history.length;
        // Le plan monte au compte comme n'importe quel enregistrement.
        deposerPlusTard(save.id);
        return;
      }
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

    toggleCoffre: (id, hauteur) => {
      const st = get();
      const o = st.openings.find((x) => x.id === id);
      if (!o) return;
      pushHistory('coffre');
      const neuf = hauteur ?? (o.coffre ? undefined : COFFRE_H);
      set({
        openings: st.openings.map((x) =>
          x.id === id ? { ...x, coffre: neuf } : x,
        ),
        dirty: true,
      });
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

    placeRendue: null,
    oublierPlaceRendue: () => set({ placeRendue: null }),

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

    resizeObjectSide: (id, cote, distance, depuis) => {
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
      // La direction du bord lui-même : elle sert aux rayons de butée.
      const leLong = { x: -n.z, z: n.x };
      const surLargeur = cote.startsWith('largeur');
      // Tout se calcule depuis l'état du DÉBUT du geste : sans ce point
      // fixe, les corrections de l'aimant et de la butée se cumulent d'une
      // image à l'autre, et le meuble part en vrille.
      const base = depuis ?? {
        width: obj.width,
        depth: obj.depth,
        cx: obj.transform[12],
        cz: obj.transform[14],
      };
      const avant = surLargeur ? base.width : base.depth;
      const long = surLargeur ? base.depth : base.width;
      // Dix centimètres au minimum : en deçà, le meuble devient un trait
      // qu'on ne sait plus attraper.
      let apres = Math.max(0.1, Math.min(12, avant + distance));
      /*
        LE BORD OPPOSÉ NE BOUGE PAS : c'est lui le point fixe du geste, et
        c'est de lui qu'on mesure tout le reste.
      */
      const fixe = {
        x: base.cx - n.x * (avant / 2),
        z: base.cz - n.z * (avant / 2),
      };
      const parts = roomParts(st.walls, st.rooms);
      const ici = { x: base.cx, z: base.cz };
      const part =
        parts.find((p) => p.roomId === obj.roomId) ??
        parts.find((p) => pointInPolygon(ici, p.surface?.pts ?? []));
      const murs = part?.walls ?? st.walls;
      /*
        ET LA MAÇONNERIE ARRÊTE LE GESTE.

        Un meuble qu'on agrandit contre un mur le traversait : on tirait, il
        entrait dans la cloison, et le plan montrait un caisson au milieu du
        béton. Sur le chantier, un meuble qui bute est un meuble qui bute.

        Trois rayons plutôt qu'un — le milieu du bord fixe et ses deux
        bouts : un seul rayon manque le mur qu'un coin touche déjà, sur un
        logement dont les angles ne sont jamais droits.
      */
      if (distance > 0) {
        let libre = Infinity;
        for (const k of [-0.5, 0, 0.5]) {
          const de = {
            x: fixe.x + leLong.x * (long * k),
            z: fixe.z + leLong.z * (long * k),
          };
          const d = castToWall(de, n, murs);
          if (d !== null) libre = Math.min(libre, d);
        }
        // Une butée qui vaudrait zéro — un bord déjà dans la maçonnerie —
        // écraserait le meuble : on ne la retient que si elle laisse de quoi
        // exister.
        if (isFinite(libre) && libre > 0.1) apres = Math.min(apres, libre);
      }
      // L'aimant : le bord tiré se pose sur le nu du mur qu'il longe, ou sur
      // le bout de celui qui se termine.
      const bord = {
        x: fixe.x + n.x * apres,
        z: fixe.z + n.z * apres,
      };
      const colle = snapSideToWalls(bord, n, long / 2, murs);
      if (colle !== 0) {
        apres = Math.max(0.1, Math.min(12, apres + colle));
      }
      const centre = {
        x: fixe.x + n.x * (apres / 2),
        z: fixe.z + n.z * (apres / 2),
      };
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

    setObjectHeight: (id, height, base) => {
      const o = get().objects.find((x) => x.id === id);
      if (!o) return;
      // Un meuble de deux centimètres ou de neuf mètres est une faute de
      // frappe, pas un relevé ; une pose négative enfoncerait le meuble dans
      // la dalle.
      if (height !== undefined && !(height > 0.05 && height <= 4)) return;
      if (base !== undefined && !(base >= 0 && base <= 6)) return;
      if (height === undefined && base === undefined) return;
      const h = height ?? o.height;
      const b = base ?? o.transform[13] - o.height / 2;
      pushHistory(`objectHeight:${id}`);
      set({
        objects: get().objects.map((x) => {
          if (x.id !== id) return x;
          const t = [...x.transform];
          // L'altitude vit dans la matrice, à l'index 13 : c'est le centre
          // du volume, donc le dessous plus la moitié de la hauteur.
          t[13] = b + h / 2;
          return { ...x, height: h, transform: t };
        }),
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
        // TOUT revient, pas les cinq premières listes : abandonner les
        // modifications laissait les spots ajoutés, les photos prises et
        // le nord tourné — et `dirty: false` promettait au prochain
        // enregistrement d'écrire ce mélange dans la bibliothèque.
        ceiling: migrated.ceiling ?? [],
        photos: migrated.photos ?? [],
        north: migrated.north ?? null,
        client: migrated.client ?? '',
        address: migrated.address ?? '',
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
        notes: st.notes,
        existant: st.existant ?? undefined,
        north: st.north ?? undefined,
        client: st.client || undefined,
        address: st.address || undefined,
      };
      const saves = [save, ...st.saves];
      set({ saves, currentSaveId: save.id, scanName: clean, dirty: false });
      persistSoon(saves);
      deposerPlusTard(save.id);
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
        notes: st.notes,
        existant: st.existant ?? undefined,
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
        if (pref === 'light' || pref === 'dark' || pref === 'system') {
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
        /*
          LE GRAND BALAYAGE DES MODÈLES, une fois par ouverture.

          Effacer le modèle d'un scan supprimé ne rend rien à qui ne supprime
          jamais de scan — et ce sont justement les modèles entassés par les
          versions précédentes, quand rien n'était effacé, qui ont fini par
          remplir le téléphone du patron au point qu'une mise à jour ne
          tenait plus.

          On balaie donc au démarrage, en donnant tout ce que la bibliothèque
          et le brouillon réclament encore. Le natif ne touche qu'aux
          `scan-….usdz` de la racine des Documents : rien de ce que l'app
          n'a pas écrit elle-même n'est en jeu.
        */
        const apres = get();
        cleanModelFiles(
          [
            ...apres.saves.map((s) => s.modelPath),
            apres.brouillon?.modelPath ?? null,
            apres.modelPath,
          ].filter((m): m is string => !!m),
        ).then((octets) => {
          if (octets > 0) set({ placeRendue: octets });
        });
      } catch {
        // Stockage illisible : on repart des valeurs en mémoire.
      }
      // Lue ou illisible, la question est tranchée : ce que `saves` contient
      // maintenant est TOUT ce que le téléphone avait. La reprise du compte
      // peut s'y comparer sans risquer le doublon.
      set({ savesCharges: true });
    },

    /*
      LE LENDEMAIN D'UNE RÉINSTALLATION.

      Le téléphone est neuf ou l'app a été réinstallée : les Documents sont
      vides, mais le compte, lui, garde les relevés. On les redescend une
      seule fois — et le marqueur qui le dit part avec l'application, donc
      une vraie réinstallation le refera, et un lancement ordinaire jamais.

      L'ordre compte : sans compte connecté, on ne marque RIEN. Le patron
      ouvre souvent l'app avant de se connecter, et une reprise déclarée
      faite alors qu'elle n'a rien repris serait une bibliothèque perdue
      pour de bon.
    */
    repriseAuBesoin: async () => {
      if (!get().savesCharges) return 0;
      const qui = identiteDuCompte();
      if (!qui) return 0;
      try {
        if (await AsyncStorage.getItem(REPRISE_KEY)) return 0;
      } catch {
        // Marqueur illisible : mieux vaut une reprise de trop qu'une
        // bibliothèque vide. `reprendreDuCompte` ne pose que ce qui manque.
      }
      const repris = await get().reprendreDuCompte(qui);
      AsyncStorage.setItem(REPRISE_KEY, String(Date.now())).catch(() => {});
      return repris;
    },

    openSave: (id) => {
      const found = get().saves.find((s) => s.id === id);
      if (!found) return;
      // Ce plan existe déjà : il a été payé le jour de sa création.
      dejaCompte = true;
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
        // Les relevés d'avant les notes n'en portent aucune, et c'est bien.
        notes: save.notes ?? [],
        // Un dossier ouvert n est pas un plan vierge, meme s il est vide.
        planVierge: false,
        // Le tableau trouvé sur place revient avec son relevé.
        existant: save.existant ?? null,
        pendingJoin: null,
        // L'arrivage appartient au scan qui vient de finir : ouvert sur un
        // autre dossier, le popup proposerait d'y intégrer les meubles
        // d'un autre logement.
        arrivage: null,
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
      /*
        LE MODÈLE 3D PART AVEC SON SCAN.

        Chaque relevé écrit un `scan-….usdz` de plusieurs mégaoctets dans les
        Documents, et rien ne l'effaçait jamais : la place ne revenait qu'en
        désinstallant l'app. Une mise à jour a fini par ne plus tenir sur le
        téléphone.

        On envoie les modèles ENCORE réclamés plutôt que celui qui part : le
        natif efface tout le reste, ce qui emporte du même coup les orphelins
        laissés par les versions d'avant. Le modèle du plan à l'écran reste
        gardé même si sa sauvegarde s'en va — on ne retire pas la 3D des mains
        de qui la regarde.
      */
      if (parti?.modelPath) {
        const modeles = saves
          .map((s) => s.modelPath)
          .concat(st.modelPath)
          .filter((m): m is string => !!m);
        cleanModelFiles(modeles);
      }
      set({
        saves,
        // Supprimer le scan courant emporte aussi sa question de fin de
        // scan : l'arrivage appartient au scan qui vient de finir.
        ...(st.currentSaveId === id
          ? { currentSaveId: null, arrivage: null }
          : null),
      });
      persistSoon(saves);
    },

    commencerAuClavier: () => {
      /*
        On repart d'un plan VIERGE, comme après un scan raté : le dossier
        ouvert précédemment n'a rien à faire ici, et son nom encore moins.
        `resultOrigin` dit « scan » parce que c'est un relevé qui commence,
        même sans caméra — c'est ce qui commande le retour de l'écran.
      */
      get().reset();
      set({
        planVierge: true,
        screen: 'result',
        scanName: `Plan du ${new Date().toLocaleDateString('fr-FR')}`,
        resultOrigin: 'scan',
        niveauCourant: NIVEAU_RDC,
      });
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
      /*
        LE PASSÉ NE SURVIT PAS À UN NOUVEAU RELEVÉ.

        L'historique était de portée MODULE : il traversait le « Nouveau
        scan » sans broncher, et une annulation ramenait alors le plan
        précédent — sans son entrée de bibliothèque, sans son nom, sorti de
        nulle part. Le filet s'était transformé en piège.
      */
      clearHistory();
      // Un nouveau relevé se paie, lui : la marque tombe avec l'ancien.
      dejaCompte = false;
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      set({
        screen: 'home',
        brouillon: null,
        scanning: false,
        paused: false,
        processing: false,
        error: null,
        instruction: '',
        mursDouteux: 0,
        complementEnCours: false,
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
        notes: [],
        existant: null,
        north: null,
        // Le popup de fin de scan appartient au scan qui vient de finir.
        arrivage: null,
      });
    },
  };
});

import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  requireNativeComponent,
  type ViewProps,
} from 'react-native';

/**
 * Grille de couleurs relevée sur une surface pendant le scan.
 * `texels` est ordonné ligne par ligne : ligne 0 = HAUT du mur,
 * colonne 0 = extrémité A. Couleurs au format `#RRGGBB`.
 */
export interface SurfaceTexture {
  cols: number;
  rows: number;
  texels: string[];
}

/**
 * Couleurs du sol : même grille, mais projetée sur l'emprise au sol
 * indiquée (repère monde, mètres). Ligne 0 = minZ, colonne 0 = minX.
 */
export interface FloorTexture extends SurfaceTexture {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** Surface détectée (mur, porte, fenêtre, ouverture). */
export interface SurfaceData {
  id: string;
  type: 'wall' | 'door' | 'window' | 'opening';
  /** Longueur en mètres. */
  length: number;
  /** Hauteur en mètres. */
  height: number;
  confidence?: string;
  /** Catégorie RoomPlan brute, ex. `door(isOpen: true)`. */
  category?: string;
  /** iOS uniquement : matrice 4x4 colonne-major (16 floats). */
  transform?: number[];
  /** Android uniquement : extrémités au sol, en mètres. */
  ax?: number;
  az?: number;
  bx?: number;
  bz?: number;
  /** Couleur moyenne relevée par la caméra (#RRGGBB), si captée. */
  color?: string;
  /** Détail des couleurs de la face intérieure, si captée. */
  texture?: SurfaceTexture;
}

/** Objet détecté (iOS/RoomPlan uniquement). */
export interface ObjectData {
  id: string;
  category: string;
  width: number;
  height: number;
  depth: number;
  confidence?: string;
  transform: number[];
  /** Couleur moyenne relevée par la caméra (#RRGGBB), si captée. */
  color?: string;
  /** Pièce d'appartenance, estampillée côté JS après le scan. */
  roomId?: string;
  /**
   * TAILLE DE RÉFÉRENCE, quand le meuble s'est ajusté à un recoin.
   *
   * Un meuble posé dans une niche plus étroite que lui s'y adapte au lieu
   * d'être éjecté (voir `fitInNook`). Il faut donc se souvenir de ce qu'il
   * mesurait AVANT, sinon il resterait rabougri une fois ressorti. Ces deux
   * cotes sont la vérité du relevé ; `width` et `depth` sont ce qu'on
   * dessine ici et maintenant.
   */
  baseWidth?: number;
  baseDepth?: number;
}

/** Relevé colorimétrique du sol de la pièce. */
export interface FloorData {
  color: string;
  texture?: FloorTexture;
}

export interface ScanUpdate {
  wallCount: number;
  objectCount: number;
  doorCount: number;
  windowCount: number;
  surfaces: SurfaceData[];
}

/**
 * Résultat d'un scan : le logement d'un seul tenant.
 *
 * Le natif ne cherche PAS à découper en pièces — c'est le JS qui les déduit
 * du graphe des murs (`detectRooms`) puis les nomme d'après le mobilier.
 */
export interface ScanResult {
  /**
   * Ce qu'on a posé au viseur pendant le relevé : des points du monde,
   * que le JS rattache aux murs et aux plafonds (`ancrerElec`).
   */
  elec?: {
    kind: string;
    /**
     * Le mur visé et la cote relevée SUR LUI, quand le natif a su le
     * nommer : un identifiant survit au recalage du modèle, un point du
     * monde non.
     */
    wallId?: string;
    along?: number;
    height?: number;
    x: number;
    y: number;
    z: number;
  }[];
  /**
   * Nombre de passages réunis dans ce relevé. Deux ou plus : le logement a
   * été scanné pièce par pièce, et les passages ont été alignés.
   */
  passages?: number;
  /** Chemin local du modèle 3D (.usdz sur iOS, .obj sur Android). */
  modelPath: string;
  surfaces?: SurfaceData[];
  objects?: ObjectData[];
  /** Couleurs du sol relevées pendant le scan (iOS avec LiDAR). */
  floor?: FloorData;
  /**
   * Cap de l'axe −Z du repère de scan, en degrés horaires depuis le nord
   * magnétique. Absent si le magnétomètre n'a rien donné de sûr.
   */
  north?: number;
  /** Compat : anciens résultats déjà découpés en pièces. */
  rooms?: {
    id: string;
    surfaces?: SurfaceData[];
    objects?: ObjectData[];
    floor?: FloorData;
  }[];
}

const RoomScanModule = NativeModules.RoomScanModule;

/** Vue caméra AR native (RoomCaptureView sur iOS, ARSceneView sur Android). */
export const RoomScanView = requireNativeComponent<ViewProps>('RoomScanView');

/**
 * Émetteur d'événements du scan : 'onScanUpdate', 'onInstruction', 'onScanError'.
 * iOS émet via le module RoomScanEvents, Android via le DeviceEventEmitter.
 */
export const scanEvents = new NativeEventEmitter(
  Platform.OS === 'ios' ? NativeModules.RoomScanEvents : undefined,
);

export const RoomScan = {
  /** false = pas de LiDAR (iOS) ou pas d'ARCore (Android). */
  isSupported: (): Promise<boolean> =>
    RoomScanModule ? RoomScanModule.isSupported() : Promise.resolve(false),

  start: (): Promise<void> => RoomScanModule.startRoomScan(),

  /**
   * UN PASSAGE DE PLUS, réuni au relevé déjà fait.
   *
   * Le logement se scanne alors pièce par pièce : `StructureBuilder`
   * (iOS 17) aligne les passages en une structure unique, au lieu de
   * laisser recoller les murs à la main. Rejette sous iOS 16 — l'app
   * garde alors le geste manuel « Ajouter une pièce ».
   */
  startAdditional: (): Promise<void> =>
    RoomScanModule?.startAdditionalScan
      ? RoomScanModule.startAdditionalScan()
      : Promise.reject(new Error('Non disponible sur cet appareil')),

  /** Autorisation caméra : 'granted' | 'denied' | 'undetermined'. */
  cameraStatus: (): Promise<'granted' | 'denied' | 'undetermined'> =>
    RoomScanModule?.cameraStatus
      ? RoomScanModule.cameraStatus()
      : Promise.resolve('granted'),

  requestCamera: (): Promise<boolean> =>
    RoomScanModule?.requestCamera
      ? RoomScanModule.requestCamera()
      : Promise.resolve(true),

  /** Torche pendant le scan (false si l'appareil n'en a pas). */
  setTorch: (on: boolean): Promise<boolean> =>
    RoomScanModule?.setTorch ? RoomScanModule.setTorch(on) : Promise.resolve(false),

  /** Arrête, post-traite et exporte. Compte quelques secondes sur iOS. */
  stop: (): Promise<ScanResult> => RoomScanModule.stopRoomScan(),

  /**
   * POSE UN APPAREIL À L'ENDROIT VISÉ, pendant le scan.
   *
   * Le viseur est au centre de l'écran : on aligne, on appuie. `false`
   * quand le rayon ne rencontre aucune surface — l'app le dit plutôt que
   * de poser au jugé.
   */
  poserAuViseur: (kind: string): Promise<boolean> =>
    RoomScanModule?.poserAuViseur
      ? RoomScanModule.poserAuViseur(kind)
      : Promise.resolve(false),

  /** Retire le dernier appareil posé : on vise mal une fois sur dix. */
  retirerDerniereAncre: (): Promise<boolean> =>
    RoomScanModule?.retirerDerniereAncre
      ? RoomScanModule.retirerDerniereAncre()
      : Promise.resolve(false),

  pause: (): void => RoomScanModule.pauseRoomScan(),
  resume: (): void => RoomScanModule.resumeRoomScan(),

  /**
   * Photo de repérage : l'appareil photo du système, puis le chemin du
   * fichier écrit dans Documents. `null` si l'utilisateur annule ou si
   * l'appareil n'a pas de caméra (simulateur).
   */
  async takePhoto(): Promise<string | null> {
    if (Platform.OS !== 'ios' || !NativeModules.RoomScanPhoto) return null;
    // La caméra a pu être refusée au scan : sans cette demande, le
    // sélecteur s'ouvrait sur un écran noir, sans un mot d'explication.
    const etat = await RoomScan.cameraStatus();
    if (etat === 'denied') return null;
    if (etat !== 'granted') {
      const ok = await RoomScan.requestCamera();
      if (!ok) return null;
    }
    return NativeModules.RoomScanPhoto.takePhoto();
  },

  /**
   * Relit une photo de repérage, réduite, en JPEG base64 — de quoi la
   * poser dans un PDF, qui ne sait rien faire d'un chemin de fichier.
   * `null` si le fichier a disparu ou hors iOS.
   */
  readPhoto(path: string, maxSide = 900): Promise<string | null> {
    if (Platform.OS === 'ios' && NativeModules.RoomScanPhoto?.readPhoto) {
      return NativeModules.RoomScanPhoto.readPhoto(path, maxSide);
    }
    return Promise.resolve(null);
  },

  /**
   * LA BOUSSOLE EN DIRECT, pour la couronne cardinale du plan.
   *
   * `startHeading` ouvre le magnétomètre, `heading` donne le cap courant
   * en degrés horaires depuis le nord (`null` si le relèvement n'est pas
   * sûr — téléphone à plat, capteur pas encore prêt), `stopHeading` le
   * referme. À l'appelant de fermer : un magnétomètre qui tourne pour un
   * écran qu'on a quitté ne coûte que de la batterie.
   */
  startHeading(): Promise<boolean> {
    if (Platform.OS === 'ios' && NativeModules.RoomScanHeading) {
      return NativeModules.RoomScanHeading.start();
    }
    return Promise.resolve(false);
  },

  stopHeading(): Promise<boolean> {
    if (Platform.OS === 'ios' && NativeModules.RoomScanHeading) {
      return NativeModules.RoomScanHeading.stop();
    }
    return Promise.resolve(false);
  },

  heading(): Promise<number | null> {
    if (Platform.OS === 'ios' && NativeModules.RoomScanHeading) {
      return NativeModules.RoomScanHeading.heading();
    }
    return Promise.resolve(null);
  },

  /** Efface des photos de repérage (chemins rendus par `takePhoto`). */
  deletePhotos(paths: string[]): Promise<number> {
    if (Platform.OS === 'ios' && NativeModules.RoomScanPhoto) {
      return NativeModules.RoomScanPhoto.deletePhotos(paths);
    }
    return Promise.resolve(0);
  },

  /**
   * Efface les modèles 3D (`scan-….usdz`) qu'aucun scan ne réclame plus, et
   * rend les octets libérés.
   *
   * On donne la liste des modèles À GARDER, jamais celle à effacer : les
   * versions précédentes de l'app n'effaçaient aucun modèle, et leurs
   * orphelins — un par relevé, plusieurs mégaoctets pièce — dorment encore
   * dans les Documents. Personne ne connaît leurs chemins ; les nommer un
   * par un serait donc impossible. Le natif, lui, sait ce qu'il trouve.
   */
  cleanModels(gardes: string[]): Promise<number> {
    if (Platform.OS === 'ios' && NativeModules.RoomScanPhoto?.cleanModels) {
      return NativeModules.RoomScanPhoto.cleanModels(gardes);
    }
    return Promise.resolve(0);
  },

  /** iOS : écrit le PDF (base64) en fichier temporaire et ouvre le partage. */
  sharePDF: (base64: string, filename: string): Promise<boolean> => {
    if (!NativeModules.RoomScanExport) {
      return Promise.reject(new Error('Export PDF disponible sur iOS uniquement'));
    }
    return NativeModules.RoomScanExport.sharePDF(base64, filename);
  },

  /** iOS : écrit un texte dans un fichier temporaire et ouvre le partage. */
  shareText: (content: string, filename: string): Promise<boolean> => {
    if (!NativeModules.RoomScanExport) {
      return Promise.reject(new Error('Partage disponible sur iOS uniquement'));
    }
    return NativeModules.RoomScanExport.shareText(content, filename);
  },

  /** iOS : partage un fichier local (image, .usdz…) via la feuille de partage. */
  shareFile: (path: string): Promise<boolean> => {
    if (!NativeModules.RoomScanExport) {
      return Promise.reject(new Error('Partage disponible sur iOS uniquement'));
    }
    return NativeModules.RoomScanExport.shareFile(path);
  },
};

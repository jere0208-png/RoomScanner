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
  /** Chemin local du modèle 3D (.usdz sur iOS, .obj sur Android). */
  modelPath: string;
  surfaces?: SurfaceData[];
  objects?: ObjectData[];
  /** Couleurs du sol relevées pendant le scan (iOS avec LiDAR). */
  floor?: FloorData;
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

  pause: (): void => RoomScanModule.pauseRoomScan(),
  resume: (): void => RoomScanModule.resumeRoomScan(),

  /** iOS : ouvre le .usdz dans QuickLook (visionneuse 3D + AR native).
   *  Rejette si le fichier du modèle n'existe plus. */
  viewModel: (path: string): Promise<boolean> => {
    if (Platform.OS === 'ios' && NativeModules.RoomScanPreview) {
      return NativeModules.RoomScanPreview.presentUSDZ(path);
    }
    return Promise.resolve(false);
  },

  /** iOS : écrit le PDF (base64) en fichier temporaire et ouvre le partage. */
  sharePDF: (base64: string, filename: string): Promise<boolean> => {
    if (!NativeModules.RoomScanExport) {
      return Promise.reject(new Error('Export PDF disponible sur iOS uniquement'));
    }
    return NativeModules.RoomScanExport.sharePDF(base64, filename);
  },

  /** iOS : partage un fichier local (image, .usdz…) via la feuille de partage. */
  shareFile: (path: string): Promise<boolean> => {
    if (!NativeModules.RoomScanExport) {
      return Promise.reject(new Error('Partage disponible sur iOS uniquement'));
    }
    return NativeModules.RoomScanExport.shareFile(path);
  },
};

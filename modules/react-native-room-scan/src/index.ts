import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  requireNativeComponent,
  type ViewProps,
} from 'react-native';

/** Surface détectée (mur, porte, fenêtre, ouverture). */
export interface SurfaceData {
  id: string;
  type: 'wall' | 'door' | 'window' | 'opening';
  /** Longueur en mètres. */
  length: number;
  /** Hauteur en mètres. */
  height: number;
  confidence?: string;
  /** iOS uniquement : matrice 4x4 colonne-major (16 floats). */
  transform?: number[];
  /** Android uniquement : extrémités au sol, en mètres. */
  ax?: number;
  az?: number;
  bx?: number;
  bz?: number;
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
}

export interface ScanUpdate {
  wallCount: number;
  objectCount: number;
  doorCount: number;
  windowCount: number;
  surfaces: SurfaceData[];
}

export interface ScanResult {
  /** Chemin local du modèle 3D (.usdz sur iOS, .obj sur Android). */
  modelPath: string;
  surfaces: SurfaceData[];
  objects: ObjectData[];
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

  /** Arrête, post-traite et exporte. Compte quelques secondes sur iOS. */
  stop: (): Promise<ScanResult> => RoomScanModule.stopRoomScan(),

  pause: (): void => RoomScanModule.pauseRoomScan(),
  resume: (): void => RoomScanModule.resumeRoomScan(),

  /** iOS : ouvre le .usdz dans QuickLook (visionneuse 3D + AR native). */
  viewModel: (path: string): void => {
    if (Platform.OS === 'ios') {
      NativeModules.RoomScanPreview?.presentUSDZ(path);
    }
  },
};

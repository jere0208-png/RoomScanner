import { useEffect } from 'react';
import { RoomScan, scanEvents, type ScanUpdate } from 'react-native-room-scan';
import { useScanStore } from '../store/scanStore';

/** Instructions RoomPlan (enum Swift) → libellés français. */
const INSTRUCTIONS_FR: Record<string, string> = {
  normal: 'Balayez lentement la pièce',
  moveCloseToWall: 'Rapprochez-vous du mur',
  moveAwayFromWall: 'Éloignez-vous du mur',
  slowDown: 'Ralentissez',
  turnOnLight: 'Il faut plus de lumière',
  lowTexture: 'Surface difficile à détecter',
};

/**
 * UNE PIÈCE DE PLUS, réunie au relevé courant.
 *
 * `StructureBuilder` (iOS 17) aligne les passages : on relève le séjour, on
 * ferme la porte, on relève la chambre — et le plan se complète tout seul,
 * au lieu qu'on recolle les murs à la main.
 *
 * Fonction LIBRE, pas une commande du hook : l'écran des résultats l'appelle
 * sans avoir à s'abonner au flux du scan, dont il n'a que faire.
 */
export async function demarrerComplement(): Promise<void> {
  await RoomScan.startAdditional();
  const st = useScanStore.getState();
  st.setComplement(true);
  st.setScreen('scan');
  st.setScanning(true);
}

/** Abonne le store aux événements natifs et expose les commandes du scan. */
export function useRoomScan() {
  const store = useScanStore();

  useEffect(() => {
    const subs = [
      scanEvents.addListener('onScanUpdate', (u: ScanUpdate) =>
        useScanStore.getState().applyLiveUpdate(u),
      ),
      scanEvents.addListener('onInstruction', (e: { instruction: string }) =>
        useScanStore
          .getState()
          .setInstruction(INSTRUCTIONS_FR[e.instruction] ?? e.instruction),
      ),
      scanEvents.addListener('onScanError', (e: { message: string }) =>
        useScanStore.getState().setError(e.message),
      ),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  /** Démarre réellement la session (caméra déjà accordée). */
  const begin = async () => {
    store.setError(null);
    store.beginScan();
    await RoomScan.start();
    store.setScanning(true);
    store.setPaused(false);
    store.setScreen('scan');
  };

  return {
    begin,
    /** Point d'entrée : passe par la page caméra si l'accès n'est pas accordé. */
    start: async () => {
      const status = await RoomScan.cameraStatus();
      if (status === 'granted') return begin();
      store.setScreen('camera');
    },
    pause: () => {
      RoomScan.pause();
      store.setPaused(true);
    },
    resume: () => {
      RoomScan.resume();
      store.setPaused(false);
    },
    /**
     * Termine le scan. Il n'y a rien à découper à la main : l'appartement se
     * scanne d'une traite, et les pièces sont ensuite déduites du graphe des
     * murs puis nommées d'après le mobilier (`finalize`).
     */
    stop: async () => {
      store.setProcessing(true);
      const complement = useScanStore.getState().complementEnCours;
      try {
        // Le post-traitement RoomPlan prend quelques secondes.
        const result = await RoomScan.stop();
        /*
          UN PASSAGE DE PLUS COMPLÈTE le relevé, il ne le remplace pas :
          l'appareillage déjà posé survit, reprojeté sur les murs neufs.
          Un scan ordinaire, lui, ouvre un dossier.
        */
        if (complement) {
          useScanStore.getState().finalizeMerge(result);
          useScanStore.getState().setComplement(false);
        } else {
          useScanStore.getState().finalize(result);
        }
      } catch (e: any) {
        store.setProcessing(false);
        store.setComplement(false);
        store.setError(e?.message ?? 'Échec du traitement du scan');
      }
    },
    startComplement: demarrerComplement,
    /** Abandonne le scan en cours sans post-traitement ni sauvegarde. */
    cancel: () => {
      RoomScan.pause();
      useScanStore.getState().reset();
    },
  };
}

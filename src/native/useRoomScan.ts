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

  return {
    start: async () => {
      store.setError(null);
      await RoomScan.start();
      store.setScanning(true);
      store.setPaused(false);
      store.setScreen('scan');
    },
    pause: () => {
      RoomScan.pause();
      store.setPaused(true);
    },
    resume: () => {
      RoomScan.resume();
      store.setPaused(false);
    },
    stop: async () => {
      store.setProcessing(true);
      try {
        // Le post-traitement RoomPlan prend quelques secondes.
        const result = await RoomScan.stop();
        useScanStore.getState().finalize(result);
      } catch (e: any) {
        store.setProcessing(false);
        store.setError(e?.message ?? 'Échec du traitement du scan');
      }
    },
    /** Abandonne le scan en cours sans post-traitement ni sauvegarde. */
    cancel: () => {
      RoomScan.pause();
      useScanStore.getState().reset();
    },
  };
}

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

  // L'enchaînement de pièces n'existe qu'à partir d'iOS 17 : on le demande
  // une fois, le bouton « Pièce suivante » n'apparaît que si c'est possible.
  useEffect(() => {
    RoomScan.canMultiRoom()
      .then((ok) => useScanStore.getState().setMultiRoomAvailable(ok))
      .catch(() => useScanStore.getState().setMultiRoomAvailable(false));
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
     * Clôt la pièce courante et enchaîne sur la suivante. La session ARKit
     * reste vivante : le repère monde est conservé, c'est lui qui recale les
     * pièces entre elles. Il faut donc MARCHER jusqu'à la pièce suivante
     * sans couper l'app ni masquer la caméra.
     */
    nextRoom: async () => {
      const st = useScanStore.getState();
      if (st.closingRoom) return;
      st.setClosingRoom(true);
      try {
        await RoomScan.finishRoom();
        useScanStore.getState().roomFinished();
        await RoomScan.nextRoom();
        useScanStore.getState().setPaused(false);
      } catch (e: any) {
        useScanStore.getState().setClosingRoom(false);
        useScanStore
          .getState()
          .setError(e?.message ?? 'Échec de l’enregistrement de la pièce');
      }
    },

    stop: async () => {
      const multi = useScanStore.getState().multiRoomAvailable;
      store.setProcessing(true);
      try {
        // Le post-traitement RoomPlan prend quelques secondes.
        let result;
        if (multi) {
          // La dernière pièce n'est pas encore close : on la ferme, puis on
          // assemble. Une pièce vide (bouton pressé sans rien scanner) fait
          // échouer la clôture — ce n'est pas une raison de perdre les autres.
          await RoomScan.finishRoom().catch(() => {});
          result = await RoomScan.finishScan();
        } else {
          result = await RoomScan.stop();
        }
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

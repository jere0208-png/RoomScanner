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

/**
 * SCANNER UN ÉTAGE, et l'empiler sur le relevé ouvert.
 *
 * Le geste du chantier : on relève le rez-de-chaussée, on monte l'escalier,
 * on relève l'étage — et c'est le MÊME dossier.
 *
 * Le scan repart À NEUF, jamais en additif : ce sont d'autres murs, et
 * `StructureBuilder` chercherait à les recoller à ceux du bas. On aurait un
 * seul plan monstrueux au lieu de deux niveaux. Le rez-de-chaussée, lui,
 * reste dans le magasin — le natif oublie ses passages, pas le JS son plan.
 */
export async function demarrerEtage(n: number): Promise<void> {
  const st = useScanStore.getState();
  st.scannerUnEtage(n);
  st.beginScan();
  await RoomScan.start();
  st.setScreen('scan');
  st.setScanning(true);
  st.setPaused(false);
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
      const etage = useScanStore.getState().etageEnCours;
      try {
        // Le post-traitement RoomPlan prend quelques secondes.
        const result = await RoomScan.stop();
        /*
          TROIS ISSUES, ET UNE SEULE OUVRE UN DOSSIER.

          Un ÉTAGE s'empile sur le relevé ouvert : d'autres murs, d'autres
          pièces, rien à fusionner. UN PASSAGE DE PLUS complète le relevé au
          lieu de le remplacer — l'appareillage déjà posé survit, reprojeté
          sur les murs neufs. Un scan ordinaire, lui, ouvre un dossier.
        */
        if (etage !== null) {
          useScanStore.getState().finalizeEtage(result, etage);
        } else if (complement) {
          useScanStore.getState().finalizeMerge(result);
          useScanStore.getState().setComplement(false);
        } else {
          useScanStore.getState().finalize(result);
        }
      } catch (e: any) {
        store.setProcessing(false);
        store.setComplement(false);
        // Un scan qui échoue ne laisse pas l'application armée pour
        // l'étage : sans ça, le scan SUIVANT — celui d'un autre logement —
        // atterrirait au premier étage d'un dossier qui n'a rien demandé.
        useScanStore.getState().scannerUnEtage(null);
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

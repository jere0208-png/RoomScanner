import { useEffect } from 'react';
import { RoomScan, scanEvents, type ScanUpdate } from 'react-native-room-scan';
import { useScanStore } from '../store/scanStore';
import { roomSurface } from '../geometry/floorplan';
import { astuce } from '../ui/astuce';
import { useAccountStore } from '../store/accountStore';

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
  /*
    LE PALIER GRATUIT SE JUGE ICI, À LA PORTE COMMUNE.

    Relevé du patron : « vérifie que pour un utilisateur pas abonné, il ne peut
    scanner qu'un seul plan, et même pas ajouter d'étage etc. » La règle était
    juste et tenue par deux bancs — et TROIS boutons ne la consultaient pas :
    « Scanner un étage de plus », « Scanner un étage », « Scanner un sous-sol ».
    Le palier s'arrêtait à l'accueil, et l'on montait autant d'étages qu'on
    voulait sur le plan qu'on avait le droit de faire.

    Le verrou est posé à la fonction que les trois appellent, et non dans
    chacun des trois : un quatrième bouton demain retombe sur le même verrou.
    C'est la règle de la maison sur les sources uniques, appliquée à une porte.

    ET C'EST L'OFFRE QUI S'OUVRE, PAS UN REFUS. Exactement comme à l'accueil :
    le popup « Surprise ! » et son −20 % tendent la page Pro. On ne met pas un
    mur devant quelqu'un qui vient de relever un logement.
  */
  const compte = useAccountStore.getState();
  if (!compte.peutCreerPlan()) {
    compte.ouvrirSurprise();
    return;
  }
  st.scannerUnEtage(n);
  st.beginScan();
  await RoomScan.start();
  st.setScreen('scan');
  st.setScanning(true);
  st.setPaused(false);
}

/**
 * Abonne le store aux événements natifs et expose les commandes du scan.
 *
 * SANS S'ABONNER LUI-MÊME. Ce crochet appelait `useScanStore()` sans
 * sélecteur — l'abonnement intégral : chaque écriture du magasin re-rendait
 * l'écran porteur. Or il est porté par les trois écrans les plus sensibles,
 * l'écran de scan en tête, où le natif écrit plusieurs fois par seconde
 * pendant que le téléphone se bat déjà pour suivre le LiDAR. Le crochet ne
 * rend que des COMMANDES, et une commande lit le magasin au moment du geste :
 * `getState()`, jamais un abonnement.
 */
export function useRoomScan() {
  const store = useScanStore.getState();

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
/**
 * LE RÉSUMÉ D'UN RELEVÉ QUI VIENT D'ABOUTIR.
 *
 * On compte les pièces et l'on additionne leurs surfaces. Si le relevé n'a
 * rien donné de nommable — un balayage trop court, un couloir seul — on ne dit
 * rien : une fête sur un plan vide serait une moquerie.
 */
function resumerLeReleve() {
  const st = useScanStore.getState();
  const pieces = st.rooms.length;
  if (pieces === 0) return;
  const aire = st.rooms.reduce((total, r) => {
    const murs = st.walls.filter((w) => w.roomId === r.id);
    return total + (roomSurface(murs)?.area ?? 0);
  }, 0);
  const m2 = Math.round(aire);
  astuce(
    `${pieces} pièce${pieces > 1 ? 's' : ''} relevée${pieces > 1 ? 's' : ''}` +
      (m2 > 0 ? ` · ${m2} m²` : ''),
    { icone: 'rooms', fete: true },
  );
}

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
          ET SI L'ON A ABANDONNÉ ENTRE-TEMPS, ON N'OUVRE RIEN.

          L'assemblage dure quelques secondes. Un abandon pendant ce
          moment-là remettait le magasin à zéro, puis le résultat arrivait
          et ouvrait le plan qu'on venait de jeter. Le drapeau `scanning`
          suffit à le dire : `cancel` et `reset` l'éteignent tous les deux.
        */
        if (!useScanStore.getState().scanning) {
          store.setProcessing(false);
          return;
        }
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
        /*
          CE QU'ON VIENT DE TROUVER, DIT TOUT DE SUITE.

          Relevé du patron : « on doit rendre la chose ludique. » C'est LE
          moment de l'application — celui où l'on découvre ce que le balayage
          a donné —, et le plan s'ouvrait sans un mot. Deux nombres suffisent :
          combien de pièces, combien de mètres carrés. C'est court, c'est vrai,
          et c'est exactement ce qu'on cherche des yeux en arrivant.

          ELLE EST POSÉE ICI, ET NON DANS L'ÉCRAN DU PLAN. Trois chemins
          mènent au même endroit — un scan neuf, un étage de plus, un passage
          complémentaire — et ils convergent trois lignes plus haut. L'écran,
          lui, ne saurait pas d'où l'on vient.
        */
        resumerLeReleve();
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
    /**
     * ABANDONNE LE SCAN EN COURS — ET RIEN D'AUTRE.
     *
     * Relevé au doigt, sur l'écran de scan : la croix est en haut à GAUCHE,
     * exactement là où se pose l'index de la main qui tient le téléphone
     * pendant qu'on balaie une pièce. Elle appelait `reset`, c'est-à-dire
     * la remise à zéro du magasin : murs, pièces, appareillage, notes.
     *
     * Sur un scan neuf, c'est le bon geste — il n'y a rien d'autre à jeter
     * que le scan lui-même. Sur les DEUX autres entrées, c'est une perte
     * sèche : « Scanner une pièce » et « Monter un étage » partent d'un
     * logement déjà relevé, souvent pas encore enregistré. Un doigt qui
     * frotte la croix, et le chantier de la matinée disparaît.
     *
     * On revient donc au plan, intact, dès qu'il y a un plan. Le natif, lui,
     * reste en pause comme avant : la session suivante repart de zéro.
     */
    cancel: () => {
      RoomScan.pause();
      const s = useScanStore.getState();
      if (s.complementEnCours || s.etageEnCours !== null || s.walls.length > 0) {
        s.setComplement(false);
        // Sans ça, le scan SUIVANT atterrirait à l'étage qu'on vient
        // d'abandonner : c'est la même précaution que sur l'échec du
        // post-traitement.
        s.scannerUnEtage(null);
        s.setScanning(false);
        s.setPaused(false);
        s.setProcessing(false);
        s.setScreen('result');
        return;
      }
      s.reset();
    },
  };
}

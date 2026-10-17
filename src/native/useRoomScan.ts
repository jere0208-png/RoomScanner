import { useEffect } from 'react';
import { RoomScan, scanEvents, type ScanResult, type ScanUpdate } from 'react-native-room-scan';
import { useScanStore } from '../store/scanStore';
import { roomSurface } from '../geometry/floorplan';
import { astuce } from '../ui/astuce';
import { useAccountStore } from '../store/accountStore';
import { useUsage } from '../store/usage';
import { usePremieresFois } from '../store/premieresFois';
import { usePannes } from '../ui/journalPannes';
import { phraseEnergie } from '../ui/energie';
import { bilanDuReleve } from '../geometry/bilan';
import { useBilanStore, type BilanAffiche } from '../store/bilanStore';
import { filtrerAuNiveau, niveauDe, nomDuNiveau } from '../geometry/floorplan';
import { sansCeQuOnAVuParLaPorte, type Ecartes } from '../geometry/traversee';
import { garderLeReleveBrut } from '../ui/relevesBruts';

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
/**
 * LE SCAN EST PARTI D'UN PLAN — et l'abandon y ramène, même après un échec.
 *
 * Revue « Inès » : un scan de cave raté désarmait le niveau en cours ;
 * « Quitter le scan » ne savait plus d'où l'on venait, remettait tout à zéro
 * et renvoyait à l'accueil, dossier refermé, brouillon effacé. On retient
 * le départ jusqu'à la sortie, quelle qu'elle soit.
 */
let partiDUnPlan = false;

/**
 * LE TOUR DU SCAN — un de plus à chaque abandon. L'écran d'attente offre de
 * quitter un assemblage qui s'éternise ; s'il aboutit après coup, alors
 * qu'un AUTRE scan a commencé (et rallumé `scanning`), son résultat
 * ouvrirait le plan qu'on avait quitté au milieu du nouveau relevé, ou
 * poserait son échec sur lui. Chaque « Terminer » retient son tour.
 */
let tourDuScan = 0;

/**
 * LA CAMÉRA AVANT LE SCAN D'UN PLAN OUVERT — relevé App Store : « Scanner un
 * étage » partait sans demander l'autorisation caméra. RoomPlan échouait
 * alors en silence, ou laissait l'étage « en cours » sur un refus.
 *
 * On ne passe PAS par la page caméra : son « Autoriser » lance un relevé
 * NEUF (`begin` → `repartirANeuf`), et l'étage qu'on voulait ajouter
 * effacerait le plan ouvert. On pose donc la question du système ici même
 * quand elle n'a jamais été posée ; refusée, on le DIT, et rien n'est
 * commencé — comme sans LiDAR.
 */
async function exigerLaCamera(): Promise<void> {
  const etat = await RoomScan.cameraStatus();
  if (etat === 'granted') return;
  if (etat === 'undetermined' && (await RoomScan.requestCamera())) return;
  throw new Error('Le scan demande l’accès à la caméra : autorisez-le dans Réglages › EchoPlan.');
}

export async function demarrerComplement(): Promise<void> {
  const st = useScanStore.getState();
  await exigerLaCamera();
  partiDUnPlan = true;
  /*
    L'ÉCHEC D'AVANT NE S'INVITE PAS AU SCAN SUIVANT — un scan de pièce raté,
    « Quitter le scan », puis « Scanner une autre pièce » : le nouvel écran
    s'ouvrait directement sur « Le relevé n'a pas abouti », par-dessus la
    caméra. Comme `lancerUnScan` et `begin`, on part d'une ardoise propre.
  */
  st.setError(null);
  /*
    ADDITIF SEULEMENT AVEC LES PASSAGES DU PLAN — revue « Agathe ». L'iPhone
    ne garde les passages qu'en mémoire : après un redémarrage il n'en a
    plus, après un autre chantier ce sont ceux de l'autre. Réunir la pièce
    du jour à ceux-là remplaçait le plan, ou y faisait entrer les pièces
    d'un autre client. Sans les passages du plan à l'écran, on scanne à
    neuf, et la pièce s'ajoute à côté (voir `finalizeMerge`).
  */
  if (st.passagesDuPlanOuvert()) await RoomScan.startAdditional();
  else await RoomScan.start();
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
  // Sans LiDAR, on le DIT — et rien n'est commencé (l'étage restait « en cours »).
  if (st.supported === false) {
    throw new Error('Le scan demande un iPhone Pro (capteur LiDAR).');
  }
  await exigerLaCamera();
  st.scannerUnEtage(n);
  st.beginScan();
  partiDUnPlan = true;
  // L'échec d'un scan précédent ne rouvre pas l'étage sur son panneau.
  st.setError(null);
  try {
    await RoomScan.start();
  } catch (e) {
    useScanStore.setState({ etageEnCours: null });
    throw e;
  }
  st.setScreen('scan');
  st.setScanning(true);
  st.setPaused(false);
}

/**
 * LANCER UN SCAN DEPUIS N'IMPORTE OÙ — « Refaire un scan », « Nouveau scan »
 * ramenaient à l'accueil au lieu de scanner. Sans LiDAR, on le dit ; sans
 * caméra, on passe par sa page.
 */
export async function lancerUnScan(): Promise<void> {
  const st = useScanStore.getState();
  if (st.supported === false) {
    throw new Error('Le scan demande un iPhone Pro (capteur LiDAR).');
  }
  const status = await RoomScan.cameraStatus();
  if (status !== 'granted') {
    st.setScreen('camera');
    return;
  }
  // Un relevé neuf : rien du chantier d'avant (voir `repartirANeuf`).
  st.repartirANeuf();
  partiDUnPlan = false;
  st.setError(null);
  st.beginScan();
  await RoomScan.start();
  st.setScanning(true);
  st.setPaused(false);
  st.setScreen('scan');
}

type EtatDuScan = ReturnType<typeof useScanStore.getState>;

/** Ce qu'un niveau contient, et rien des autres (même filtre que le plan). */
function jeuDuNiveau(st: EtatDuScan, n: number) {
  const jeu = filtrerAuNiveau(
    {
      walls: st.walls,
      openings: st.openings,
      rooms: st.rooms,
      fixtures: st.fixtures,
      photos: st.photos,
      objects: st.objects,
      ceiling: st.ceiling,
    },
    n,
  );
  return { rooms: jeu.rooms, walls: jeu.walls, openings: jeu.openings, objects: jeu.objects };
}

/** Le compte d'un niveau, pour lire ce qu'un passage de plus y a ajouté. */
export interface Totaux {
  pieces: number;
  /** Surface au sol, au dixième de mètre carré. */
  surface: number;
}

function totauxDuNiveau(st: EtatDuScan, n: number): Totaux {
  const b = bilanDuReleve(jeuDuNiveau(st, n));
  return b ? { pieces: b.pieces, surface: b.surfaceAuDixieme ?? b.surface } : { pieces: 0, surface: 0 };
}

const enM2 = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

/**
 * L'APPORT D'UN PASSAGE DE PLUS, PAR DIFFÉRENCE DE TOTAUX — avis de
 * l'architecte : `finalizeMerge` reconstruit les murs et les pièces de tout
 * le niveau, et leurs identifiants peuvent changer. Compter les « pièces
 * nouvelles » par identifiant annoncerait quatre pièces pour un mur repris.
 * Deux totaux, avant et après, ne mentent pas : « +1 pièce · +11,6 m² ».
 */
export function apportDuPassage(avant: Totaux, apres: Totaux): string | undefined {
  const dp = apres.pieces - avant.pieces;
  const ds = Math.round((apres.surface - avant.surface) * 10) / 10;
  const bouts: string[] = [];
  if (dp !== 0) {
    const k = Math.abs(dp);
    bouts.push(`${dp > 0 ? '+' : '−'}${k} pièce${k > 1 ? 's' : ''}`);
  }
  if (Math.abs(ds) >= 0.1) bouts.push(`${ds > 0 ? '+' : '−'}${enM2(Math.abs(ds))} m²`);
  return bouts.length > 0 ? bouts.join(' · ') : undefined;
}

/**
 * TOUT LE LOGEMENT, EN PETIT — seulement quand il a plusieurs niveaux (sinon
 * c'est le bilan lui-même). « Au sol » écrit en clair : c'est une somme de
 * surfaces au sol, pas une surface habitable ni une surface Carrez, et
 * personne ne doit la recopier comme telle.
 */
function ligneDuLogement(st: EtatDuScan): string | undefined {
  const niveaux = new Set(st.rooms.map((r) => niveauDe(r))).size;
  if (niveaux < 2) return undefined;
  const tout = bilanDuReleve({ rooms: st.rooms, walls: st.walls, openings: st.openings, objects: st.objects });
  if (!tout) return undefined;
  return (
    `Tout le logement : ${niveaux} niveaux · ${tout.pieces} pièce${tout.pieces > 1 ? 's' : ''} · ` +
    `${enM2(tout.surfaceAuDixieme ?? tout.surface)} m² au sol`
  );
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
/**
 * CE QUE LE SCAN A COÛTÉ, DIT TOUT DE SUITE.
 *
 * Relevé du patron : « je ne vois pas le diagnostic sur l'app ». Il est au
 * fond de la page Profil — la bonne place pour un journal, la mauvaise pour
 * une mesure qu'on veut lire en posant le téléphone. Elle se dit donc aussi
 * juste après le scan : en note au bas du bilan, ou en bandeau sans bilan.
 */
function phraseDeLaDepense(r: ScanResult | null | undefined): string | null {
  if (!r?.energie) return null;
  const bouts = [phraseEnergie(r.energie)];
  // Revue « Léa » : « maillage LiDAR 3 ancres » ne dit rien au particulier.
  // La durée et la batterie se lisent par tous ; le maillage reste au métier.
  if (r.maillage && useUsage.getState().modeElec) {
    bouts.push(
      r.maillage.ancres > 0
        ? `maillage LiDAR ${r.maillage.ancres} ancre${r.maillage.ancres > 1 ? 's' : ''}`
        : 'pas de maillage LiDAR',
    );
  }
  return bouts.join(' · ');
}

/** La fête du premier plan, en bandeau : voir `cEstLePremierPlan`. */
const FETE_DU_PREMIER_PLAN = 'Votre premier logement est dans la poche.';

/**
 * LA FÊTE DU PREMIER PLAN — revue « Léa » : l'écran du plan ne fêtait qu'un
 * plan gardé PENDANT qu'il était ouvert. Or `finalize` garde le plan et
 * ouvre l'écran d'un même geste : la fête ne venait jamais. On la décide
 * ici, là où l'on sait qu'un plan vient de s'ajouter (même clé : jamais deux
 * fois). Elle se dit dans le bilan quand il s'ouvre, en bandeau sinon.
 */
function cEstLePremierPlan(plansAvant: number): boolean {
  if (useScanStore.getState().saves.length <= plansAvant) return false;
  const premieres = usePremieresFois.getState();
  if (!premieres.estNeuve('planGarde')) return false;
  premieres.marquer('planGarde');
  return true;
}

/**
 * LE BILAN DU RELEVÉ, MIS EN SCÈNE — voir `geometry/bilan` et la carte
 * `BilanDuReleve`. Sans rien de nommable (aucun mur), le bandeau d'avant.
 *
 * LE BILAN D'UN ÉTAGE PARLE DE CET ÉTAGE. Il comptait tout le logement :
 * après « Scanner un étage », la carte annonçait « 8 pièces · 92 m² » et
 * une note qui mêlait le rez-de-chaussée et l'étage — un étage incomplet
 * se cachait derrière un rez-de-chaussée parfait. On contrôle un relevé
 * niveau par niveau : la note et les jauges portent sur l'étage seul, sous
 * le nom qu'il porte partout ailleurs (`nomDuNiveau`).
 *
 * UN PASSAGE DE PLUS SE JUGE SUR SON NIVEAU ENTIER (il peut avoir refermé
 * un contour voisin), et son apport se lit par différence de totaux.
 *
 * CE QUE LA FIN DU SCAN AVAIT À DIRE VA DANS LA CARTE : la fête, la
 * dépense, la pièce vue par la porte passaient en bandeaux SOUS la fenêtre
 * du bilan, et défilaient sans être lus. Rend `false` quand il n'y a pas de
 * carte : l'appelant les dit alors en bandeaux, comme avant.
 */
function montrerLeBilan(scene: {
  etage: number | null;
  complement: boolean;
  avant: Totaux | null;
  premier: boolean;
  depense: string | null;
  porte: string | null;
}): boolean {
  const st = useScanStore.getState();
  let base: ReturnType<typeof bilanDuReleve>;
  let titre: string | undefined;
  let apport: string | undefined;
  let logement: string | undefined;
  if (scene.etage !== null) {
    base = bilanDuReleve(jeuDuNiveau(st, scene.etage));
    titre = `${nomDuNiveau(scene.etage)} relevé`;
    logement = ligneDuLogement(st);
  } else if (scene.complement) {
    const n = st.niveauCourant;
    base = bilanDuReleve(jeuDuNiveau(st, n));
    const apres = totauxDuNiveau(st, n);
    const gagne = scene.avant ? apres.pieces - scene.avant.pieces : 0;
    // « Pièce ajoutée » seulement si le compte a VRAIMENT monté.
    titre = gagne > 1 ? 'Pièces ajoutées' : gagne === 1 ? 'Pièce ajoutée' : 'Relevé complété';
    apport = scene.avant ? apportDuPassage(scene.avant, apres) : undefined;
    logement = ligneDuLogement(st);
  } else {
    base = bilanDuReleve({ rooms: st.rooms, walls: st.walls, openings: st.openings, objects: st.objects });
  }
  if (base && base.pieces > 0) {
    const bilan: BilanAffiche = {
      ...base,
      ...(titre ? { titre } : {}),
      ...(apport ? { apport } : {}),
      ...(logement ? { logement } : {}),
      ...(scene.premier ? { premier: true } : {}),
      ...(scene.depense ? { noteEnergie: scene.depense } : {}),
      ...(scene.porte ? { conseilPrioritaire: scene.porte } : {}),
    };
    useBilanStore.getState().montrer(bilan);
    return true;
  }
  resumerLeReleve();
  return false;
}

/**
 * CE QU'ON N'A VU QUE PAR UNE PORTE, DIT EN UNE PHRASE — sinon on croirait
 * le scan incomplet, alors qu'il a fait exactement ce qu'on attend de lui.
 * Rien si rien n'a été écarté.
 */
function direCeQuiEstEcarte(e: Ecartes): string | null {
  if (e.murs + e.ouvertures + e.meubles === 0) return null;
  return 'La pièce vue par la porte n’est pas relevée : entrez-y pour la scanner.';
}

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
    // Un relevé neuf : rien du chantier d'avant (voir `repartirANeuf`).
    store.repartirANeuf();
    partiDUnPlan = false;
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
      /*
        UN SEUL ARRÊT — revue I5 : deux appuis sur « Terminer » dans la même
        image appelaient deux fois `RoomScan.stop`, et le second tombait sur
        une session déjà en train de s'assembler (au mieux une erreur, au
        pire un second dossier). Le drapeau est lu AU MAGASIN, pas dans une
        fermeture : il est vrai dès le premier appel, de façon synchrone.
      */
      if (useScanStore.getState().processing) return;
      store.setProcessing(true);
      const complement = useScanStore.getState().complementEnCours;
      const etage = useScanStore.getState().etageEnCours;
      const plansAvant = useScanStore.getState().saves.length;
      // Le niveau qu'un passage de plus vient compléter, compté AVANT lui :
      // son apport se lira par différence (voir `apportDuPassage`).
      const avant = complement
        ? totauxDuNiveau(useScanStore.getState(), useScanStore.getState().niveauCourant)
        : null;
      const tour = tourDuScan;
      try {
        // Le post-traitement RoomPlan prend quelques secondes.
        const brut = await RoomScan.stop();
        // Le relevé tel que RoomPlan l'a rendu, pour pouvoir l'envoyer
        // (profil › Diagnostic) avec les cotes prises au mètre.
        if (brut) garderLeReleveBrut(brut, etage !== null ? 'etage' : complement ? 'complement' : 'scan');
        /*
          CE QU'ON A VU PAR LA PORTE N'EST PAS RELEVÉ : il faut traverser
          l'ouvrant (voir `geometry/traversee`). Écarté ici, une fois, avant
          les trois issues — scan neuf, étage, passage de plus.
        */
        const { releve: result, ecartes } = brut
          ? sansCeQuOnAVuParLaPorte(brut)
          : { releve: brut, ecartes: null };
        // Ce que ce scan a coûté : noté même si l'on abandonne ensuite, c'est
        // une mesure, pas un dossier.
        if (result?.energie) {
          usePannes.getState().noterScan(result.energie, result.maillage);
        }
        /*
          ET SI L'ON A ABANDONNÉ ENTRE-TEMPS, ON N'OUVRE RIEN.

          L'assemblage dure quelques secondes. Un abandon pendant ce
          moment-là remettait le magasin à zéro, puis le résultat arrivait
          et ouvrait le plan qu'on venait de jeter. Le drapeau `scanning`
          suffit à le dire : `cancel` et `reset` l'éteignent tous les deux.
        */
        // Quitté, puis un autre scan commencé : rien de ce relevé ne le touche.
        if (tour !== tourDuScan) return;
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
        // Arrivé au plan : le prochain scan dira lui-même d'où il part.
        partiDUnPlan = false;
        const premier = cEstLePremierPlan(plansAvant);
        const depense = phraseDeLaDepense(result);
        const porte = ecartes ? direCeQuiEstEcarte(ecartes) : null;
        const enCarte = montrerLeBilan({ etage, complement, avant, premier, depense, porte });
        if (!enCarte) {
          // Pas de carte : les bandeaux d'avant, que rien ne recouvre.
          if (premier) astuce(FETE_DU_PREMIER_PLAN, { fete: true });
          if (depense) astuce(depense, { icone: 'elec' });
          if (porte) astuce(porte, { icone: 'ouvertures' });
        }
      } catch (e: any) {
        // L'échec d'un scan quitté ne se pose pas sur le suivant.
        if (tour !== tourDuScan) return;
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
     * On revient donc au plan, intact, quand le scan partait D'UN PLAN. Le
     * natif, lui, reste en pause comme avant : la session suivante repart
     * de zéro.
     *
     * « PARTAIT D'UN PLAN » SE SAIT, IL NE SE DEVINE PAS. La garde regardait
     * aussi s'il restait des murs dans le magasin — et il en reste presque
     * toujours : le plan qu'on vient de regarder, l'appartement témoin, un
     * relevé de la veille. Relevé du patron : « lorsqu'on commence un scan
     * et qu'on le quitte, ça mène directement au plan témoin, ça devrait
     * afficher le menu ». Seuls « Scanner une pièce » et « Scanner un
     * étage » partent d'un plan, et tous deux le disent
     * (`complementEnCours`, `etageEnCours`) ; tout autre scan est un relevé
     * neuf, lancé de l'accueil, et l'abandonner y ramène.
     */
    cancel: () => {
      RoomScan.pause();
      tourDuScan += 1;
      const s = useScanStore.getState();
      if (partiDUnPlan || s.complementEnCours || s.etageEnCours !== null) {
        partiDUnPlan = false;
        s.setComplement(false);
        // Le panneau d'échec reste au scan qu'il concernait : revenu au plan,
        // le prochain scan d'étage ou de pièce ne doit pas s'ouvrir dessus.
        s.setError(null);
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

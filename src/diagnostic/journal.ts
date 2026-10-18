/**
 * LE JOURNAL DU MODE DIAGNOSTIC — le fil de ce que l'app vit pendant une
 * session.
 *
 * Relevé du patron : « le diagnostic ne doit pas agir sur seulement 10 s ;
 * le bouton doit agir comme un bouton ON […] il enregistre tout ce qui se
 * passe, et au clic de nouveau on clôt ». Côté JavaScript, « tout ce qui se
 * passe » ce sont les évènements de l'app : l'écran qu'on regarde, une
 * feuille qui s'ouvre, le plan qui change, une alerte posée, une erreur. Le
 * natif tient la vidéo et les touchers (voir `RoomScanDiagnostic.swift`) ;
 * ici, on tient le fil de ce que l'app a VÉCU, horodaté.
 *
 * LA SESSION REMET LE FIL À ZÉRO (`viderJournal` au premier appui) et l'envoi
 * prend tout ce qui s'est passé entre le premier et le second appui
 * (`evenementsDeLaSession`). BORNÉ QUAND MÊME : trente minutes (une session
 * en dure vingt au plus, plus le temps de taper la note) et JAMAIS plus de
 * cinquante mille évènements (une boucle d'erreurs pourrait en cracher mille
 * par seconde ; on ne laisse pas un diagnostic manger la mémoire du
 * téléphone qu'il surveille).
 *
 * LES FONCTIONS SONT PURES, pour se vérifier au banc : `elaguer` et `entre`
 * ne touchent rien, elles rendent un nouveau tableau. Le singleton (`noter`,
 * `evenementsDeLaSession`) n'est qu'un tableau qui les appelle.
 */

/** Un évènement du fil : quand, de quel genre, et ce qu'il porte. */
export interface EvenementJournal {
  /** Millisecondes depuis 1970, comme les gestes du natif. */
  t: number;
  /** Le genre : `ecran`, `feuille`, `plan`, `alerte`, `avert`, `erreur`… */
  type: string;
  /** Ce qui situe l'évènement, déjà nettoyé (ni jeton ni e-mail). */
  donnees?: Record<string, unknown>;
}

/** La fenêtre gardée (trente minutes) et le plafond d'évènements. */
export const FENETRE_JOURNAL_MS = 30 * 60_000;
export const PLAFOND_JOURNAL = 50_000;

/**
 * ÉLAGUE : retire ce qui déborde de la fenêtre, puis ce qui déborde du
 * plafond (on garde les plus RÉCENTS). Rend un nouveau tableau ; l'entrée
 * n'est jamais modifiée.
 */
export function elaguer(
  evs: EvenementJournal[],
  maintenant: number,
  fenetreMs: number = FENETRE_JOURNAL_MS,
  plafond: number = PLAFOND_JOURNAL,
): EvenementJournal[] {
  const depuis = maintenant - fenetreMs;
  const dansLaFenetre = evs.filter((e) => e.t >= depuis);
  return dansLaFenetre.length > plafond
    ? dansLaFenetre.slice(dansLaFenetre.length - plafond)
    : dansLaFenetre;
}

/** Les évènements entre `debut` et `fin` (inclus), dans l'ordre. */
export function entre(evs: EvenementJournal[], debut: number, fin: number): EvenementJournal[] {
  return evs.filter((e) => e.t >= debut && e.t <= fin);
}

/* ---- LE SINGLETON : un tampon, et deux gestes dessus. ---- */

let tampon: EvenementJournal[] = [];

/**
 * Note un évènement, horodaté à l'instant. Élague à chaque ajout : le tampon
 * ne grandit jamais au-delà de sa fenêtre ni de son plafond.
 */
export function noter(type: string, donnees?: Record<string, unknown>): void {
  const t = Date.now();
  tampon.push(donnees ? { t, type, donnees } : { t, type });
  tampon = elaguer(tampon, t);
}

/**
 * LES ÉVÈNEMENTS DE LA SESSION — du premier appui au second, pas jusqu'à
 * « Envoyer » : la note se tape APRÈS la fin, et ce qu'elle fait vivre à
 * l'app (le clavier, l'alerte) n'est pas le défaut qu'on montre.
 */
export function evenementsDeLaSession(debut: number, fin: number = Date.now()): EvenementJournal[] {
  return entre(tampon, debut, fin);
}

/** Vide le fil — au début d'une session et à l'arrêt du mode : rien ne traîne entre deux sessions. */
export function viderJournal(): void {
  tampon = [];
}

/** Pour le banc : l'état brut du tampon. */
export function tamponBrut(): EvenementJournal[] {
  return tampon;
}

/**
 * LE JOURNAL DU MODE DIAGNOSTIC — un tampon circulaire, et rien de plus.
 *
 * Relevé du patron : « n'importe quelle action que je fais sera analysée, et
 * au clic sur un bouton, les 10 dernières secondes de mes faits et gestes te
 * seront envoyés […] pour corriger ». Côté JavaScript, « mes faits et gestes »
 * ce sont les évènements de l'app : l'écran qu'on regarde, une feuille qui
 * s'ouvre, le plan qui change, une alerte posée, une erreur. Le natif tient
 * la vidéo et les touchers (voir `RoomScanDiagnostic.swift`) ; ici, on tient
 * le fil de ce que l'app a VÉCU, horodaté.
 *
 * CIRCULAIRE, ET BORNÉ DEUX FOIS. On ne garde qu'une MINUTE (l'appui vient
 * après coup, dix secondes suffisent, mais une marge se paie en mémoire, pas
 * en justesse) et JAMAIS plus de trois mille évènements (une boucle d'erreurs
 * pourrait en cracher mille par seconde ; on ne laisse pas un diagnostic
 * manger la mémoire du téléphone qu'il surveille).
 *
 * LES FONCTIONS SONT PURES, pour se vérifier au banc : `elaguer` et `recents`
 * ne touchent rien, elles rendent un nouveau tableau. Le singleton (`noter`,
 * `evenements`) n'est qu'un tableau qui les appelle.
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

/** La fenêtre gardée (une minute) et le plafond d'évènements. */
export const FENETRE_JOURNAL_MS = 60_000;
export const PLAFOND_JOURNAL = 3000;
/** Ce que l'appui envoie : les dix dernières secondes. */
export const FENETRE_ENVOI_MS = 10_000;

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

/** Les évènements des `fenetreMs` dernières millisecondes, dans l'ordre. */
export function recents(
  evs: EvenementJournal[],
  maintenant: number,
  fenetreMs: number = FENETRE_ENVOI_MS,
): EvenementJournal[] {
  const depuis = maintenant - fenetreMs;
  return evs.filter((e) => e.t >= depuis);
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

/** Les évènements des dix dernières secondes — ce que l'appui envoie. */
export function evenementsAEnvoyer(): EvenementJournal[] {
  return recents(tampon, Date.now());
}

/** Vide le fil — à l'arrêt du mode : rien ne traîne entre deux sessions. */
export function viderJournal(): void {
  tampon = [];
}

/** Pour le banc : l'état brut du tampon. */
export function tamponBrut(): EvenementJournal[] {
  return tampon;
}

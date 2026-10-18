/**
 * L'ENVOI D'UN DIAGNOSTIC — ce que la fin d'une session déclenche.
 *
 * Le natif a enregistré la session (les tranches de vidéo, une par minute,
 * et tous les gestes) et l'émet par l'événement `envoyer`, avec la note
 * tapée. Ici on AJOUTE ce que seul le JavaScript sait : le fil des évènements
 * de l'app pendant la session (journal), un instantané (version, appareil,
 * écran, mode électricité), le plan TEL QU'IL ÉTAIT au premier appui et tel
 * qu'il est au second — de quoi reproduire le défaut, avant et après.
 *
 * LA VIDÉO PART PAR TRANCHES. La première requête porte le journal, la note
 * et la première minute ; le serveur rend le dossier du rapport, et chaque
 * minute suivante y est déposée par sa propre requête (`diagnostic-video`) :
 * aucune ne dépasse ce qu'un envoi mobile et le serveur supportent.
 *
 * RIEN DU COMPTE, hormis son identifiant interne : pas de nom, pas d'e-mail.
 * L'identifiant et le jeton partent comme pour toute action du serveur (voir
 * `coffrePlans`), en multipart puisque la vidéo est un fichier.
 *
 * SI LE RÉSEAU LÂCHE, le diagnostic ne se perd pas : on propose la feuille de
 * partage d'iOS (la première tranche, ou à défaut le dossier .json), avec ce
 * que l'app sait déjà faire (`RoomScan.shareFile` / `shareText`).
 */
import {
  Diagnostic,
  RoomScan,
  diagnosticEvents,
  type EnvoiDiagnostic,
  type GesteDiagnostic,
} from 'react-native-room-scan';
import { SERVEUR } from '../config/serveur';
import { identiteDuCompte } from '../store/accountStore';
import type { Identite } from '../net/coffrePlans';
import { useScanStore } from '../store/scanStore';
import { useUsage } from '../store/usage';
import { infosDeLApp } from '../native/support';
import { astuce } from '../ui/astuce';
import { alerte } from '../ui/alerte';
import { evenementsDeLaSession, noter, viderJournal, type EvenementJournal } from './journal';

/** Le plan courant, réduit à ce qui sert à reproduire un défaut. */
function planCourant() {
  const s = useScanStore.getState();
  return {
    scanName: s.scanName,
    walls: s.walls,
    openings: s.openings,
    rooms: s.rooms,
    objects: s.objects,
    fixtures: s.fixtures,
    ceiling: s.ceiling,
  };
}

/** L'instantané : où en est l'app, et sur quel appareil. */
async function instantané() {
  const s = useScanStore.getState();
  const infos = await infosDeLApp();
  return {
    app: infos.version,
    appareil: infos.appareil,
    systeme: infos.systeme,
    ecran: s.screen,
    modeElec: useUsage.getState().modeElec,
    // L'identifiant interne du compte, et LUI SEUL — de quoi savoir que c'est
    // bien l'administrateur, rien de plus.
    identifiant: identiteDuCompte()?.identifiant,
    plan: {
      murs: s.walls.length,
      pieces: s.rooms.length,
      ouvertures: s.openings.length,
      meubles: s.objects.length,
      appareils: s.fixtures.length,
    },
  };
}

/** Ce que le journal dit de la session elle-même. */
export interface SessionDiagnostic {
  debut: number;
  fin: number;
  /** Secondes enregistrées. */
  duree: number;
  /** Le nombre de tranches de vidéo envoyées. */
  parties: number;
  /** Le plan au premier appui (le plan d'arrivée est `plan`). */
  planDebut?: Record<string, unknown> | null;
}

/**
 * LE JOURNAL ENVOYÉ — l'instantané, le plan au second appui, les gestes du
 * natif, les évènements de l'app, et la session (début, fin, durée, plan au
 * premier appui). Le serveur en relit `instant`, `gestes`, `evenements` et
 * `session` pour le résumé (voir `diagResume`).
 */
export function construireJournal(
  instant: Record<string, unknown>,
  plan: Record<string, unknown>,
  gestes: GesteDiagnostic[],
  evenements: EvenementJournal[],
  session?: SessionDiagnostic,
): string {
  return JSON.stringify(session ? { instant, plan, gestes, evenements, session } : { instant, plan, gestes, evenements });
}

/** Un fichier pour fetch : uri, type, nom. */
const fichierVideo = (video: string, nom: string) =>
  ({ uri: video.startsWith('file://') ? video : 'file://' + video, type: 'video/mp4', name: nom }) as unknown as Blob;

/**
 * Le corps de la première requête : identité, note, journal, la première
 * tranche si elle existe, et le nombre de tranches annoncées.
 */
export function construireFormData(
  qui: Identite,
  message: string,
  journal: string,
  video: string | null,
  parties?: number,
): FormData {
  const fd = new FormData();
  fd.append('action', 'diagnostic');
  fd.append('identifiant', qui.identifiant);
  fd.append('jeton', qui.jeton);
  fd.append('message', message);
  fd.append('journal', journal);
  if (parties !== undefined) fd.append('parties', String(parties));
  if (video) fd.append('video', fichierVideo(video, 'ecran.mp4'));
  return fd;
}

/** Le corps d'une tranche suivante, déposée dans le dossier du rapport. */
export function construirePartie(qui: Identite, dossier: string, rang: number, video: string): FormData {
  const fd = new FormData();
  fd.append('action', 'diagnostic-video');
  fd.append('identifiant', qui.identifiant);
  fd.append('jeton', qui.jeton);
  fd.append('dossier', dossier);
  fd.append('rang', String(rang));
  fd.append('video', fichierVideo(video, `ecran-${rang}.mp4`));
  return fd;
}

export type IssueEnvoi = 'envoye' | 'partiel' | 'partage' | 'echec';

/** Le plan au premier appui de la session en cours (voir `demarrerEnvoi`). */
let planAuDebut: Record<string, unknown> | null = null;

/** Le journal d'une session close. */
async function journalDe(envoi: EnvoiDiagnostic): Promise<string> {
  const fin = envoi.fin ?? Date.now();
  const debut = envoi.debut ?? fin;
  return construireJournal(await instantané(), planCourant(), envoi.gestes, evenementsDeLaSession(debut, fin), {
    debut,
    fin,
    duree: Math.round((fin - debut) / 1000),
    parties: envoi.videos.length,
    planDebut: planAuDebut,
  });
}

async function poster(fd: FormData): Promise<{ ok?: boolean; raison?: string; dossier?: string }> {
  const reponse = await fetch(`${SERVEUR.url}/api.php`, { method: 'POST', body: fd });
  return reponse.json();
}

/**
 * Envoie le diagnostic : la première requête, puis une par tranche de vidéo.
 * Rend ce qui s'est passé, et le DIT à l'utilisateur (astuce si c'est parti,
 * alerte avec partage sinon).
 */
export async function envoyerDiagnostic(envoi: EnvoiDiagnostic): Promise<IssueEnvoi> {
  const qui = identiteDuCompte();
  if (!qui || !SERVEUR.url) {
    return proposerLePartage(envoi, 'Connexion au serveur indisponible.');
  }
  const journal = await journalDe(envoi);
  const n = envoi.videos.length;
  try {
    if (n > 1) astuce(`Envoi du diagnostic : 1 sur ${n}…`, { icone: 'sirene' });
    const r = await poster(construireFormData(qui, envoi.message, journal, envoi.videos[0] ?? null, n));
    if (r?.ok !== true) {
      return proposerLePartage(envoi, String(r?.raison ?? 'Le serveur a refusé le diagnostic.'));
    }
    if (n > 1) {
      /*
        UN SERVEUR D'AVANT LES TRANCHES ne rend pas de dossier : il a rangé
        le journal et la première minute. On le dit plutôt que de perdre la
        suite en silence.
      */
      if (typeof r.dossier !== 'string' || r.dossier === '') {
        alerte(
          'Envoi incomplet',
          `Le journal et la première minute sont partis ; les ${n - 1} minutes suivantes attendent la mise à jour du serveur (api.php).`,
        );
        return 'partiel';
      }
      for (let k = 1; k < n; k++) {
        astuce(`Envoi du diagnostic : ${k + 1} sur ${n}…`, { icone: 'sirene' });
        const rk = await poster(construirePartie(qui, r.dossier, k + 1, envoi.videos[k]));
        if (rk?.ok !== true) {
          alerte(
            'Envoi incomplet',
            `${k} minute${k > 1 ? 's' : ''} d’écran sur ${n} sont parties : ${String(rk?.raison ?? 'le serveur a refusé la suite.')}`,
          );
          return 'partiel';
        }
      }
    }
    astuce('Envoyé au développeur', { icone: 'sirene', fete: true });
    planAuDebut = null;
    return 'envoye';
  } catch {
    return proposerLePartage(envoi, 'Le serveur n’a pas répondu.');
  }
}

/**
 * LE PARTAGE DE SECOURS — le diagnostic ne se perd pas : on propose la feuille
 * de partage d'iOS. La vidéo d'abord (c'est elle qui montre le défaut) ; sans
 * vidéo, le dossier .json (plan, gestes, évènements).
 */
async function proposerLePartage(envoi: EnvoiDiagnostic, pourquoi: string): Promise<IssueEnvoi> {
  const partager = async () => {
    try {
      const premiere = envoi.videos[0];
      if (premiere) {
        await RoomScan.shareFile(premiere.startsWith('file://') ? premiere.slice(7) : premiere);
        return;
      }
      await RoomScan.shareText(await journalDe(envoi), 'diagnostic.json');
    } catch {
      astuce('Partage impossible', { icone: 'sirene' });
    }
  };
  alerte('Envoi impossible', `${pourquoi} Vous pouvez partager le fichier à la main.`, [
    { label: 'Plus tard' },
    { label: 'Partager le fichier', onPress: partager },
  ]);
  return 'partage';
}

let desabonner: (() => void) | null = null;

/**
 * Branche l'écoute du bouton : `debut` remet le fil à zéro et retient le plan
 * du premier appui ; `envoyer` envoie ; `jete` oublie tout. Idempotent.
 */
export function demarrerEnvoi(): void {
  if (desabonner) return;
  const debut = diagnosticEvents.addListener('debut', (e: { debut?: number }) => {
    viderJournal();
    planAuDebut = planCourant();
    noter('session', { debut: typeof e?.debut === 'number' ? e.debut : Date.now() });
    // D'où l'on part : l'écran au premier appui.
    noter('ecran', { ecran: useScanStore.getState().screen });
  });
  const jete = diagnosticEvents.addListener('jete', () => {
    viderJournal();
    planAuDebut = null;
  });
  const envoyer = diagnosticEvents.addListener('envoyer', (e: Partial<EnvoiDiagnostic>) => {
    envoyerDiagnostic({
      message: typeof e?.message === 'string' ? e.message : '',
      videos: Array.isArray(e?.videos) ? e.videos.filter((v): v is string => typeof v === 'string') : [],
      gestes: Array.isArray(e?.gestes) ? e.gestes : [],
      debut: typeof e?.debut === 'number' ? e.debut : undefined,
      fin: typeof e?.fin === 'number' ? e.fin : undefined,
    }).catch(() => {});
  });
  desabonner = () => {
    debut.remove();
    jete.remove();
    envoyer.remove();
  };
}

/** Coupe l'écoute. */
export function arreterEnvoi(): void {
  desabonner?.();
  desabonner = null;
}

/** Exposé pour que l'app puisse figer sans attendre l'événement, au besoin. */
export { Diagnostic };

/**
 * L'ENVOI D'UN DIAGNOSTIC — ce que l'appui sur le bouton déclenche.
 *
 * Le natif a déjà figé l'instant (la vidéo des dix dernières secondes et les
 * gestes) et l'émet par l'événement `envoyer`, avec le message tapé. Ici on
 * AJOUTE ce que seul le JavaScript sait : le fil des évènements de l'app
 * (journal), un instantané (version, appareil, écran, mode électricité), le
 * résumé du plan ET le plan courant complet — de quoi reproduire le défaut.
 *
 * RIEN DU COMPTE, hormis son identifiant interne : pas de nom, pas d'e-mail.
 * L'identifiant et le jeton partent comme pour toute action du serveur (voir
 * `coffrePlans`), en multipart puisque la vidéo est un fichier.
 *
 * SI LE RÉSEAU LÂCHE, le diagnostic ne se perd pas : on propose la feuille de
 * partage d'iOS (la vidéo, ou à défaut le dossier .json), avec ce que l'app
 * sait déjà faire (`RoomScan.shareFile` / `shareText`).
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
import { evenementsAEnvoyer, type EvenementJournal } from './journal';

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

/**
 * LE JOURNAL ENVOYÉ — l'instantané, le plan complet, les gestes du natif et
 * les évènements de l'app des dix dernières secondes. Le serveur en relit
 * `instant`, `gestes` et `evenements` pour le résumé (voir `diagResume`).
 */
export function construireJournal(
  instant: Record<string, unknown>,
  plan: Record<string, unknown>,
  gestes: GesteDiagnostic[],
  evenements: EvenementJournal[],
): string {
  return JSON.stringify({ instant, plan, gestes, evenements });
}

/** Le corps multipart : identité, message, journal, et la vidéo si elle existe. */
export function construireFormData(
  qui: Identite,
  message: string,
  journal: string,
  video: string | null,
): FormData {
  const fd = new FormData();
  fd.append('action', 'diagnostic');
  fd.append('identifiant', qui.identifiant);
  fd.append('jeton', qui.jeton);
  fd.append('message', message);
  fd.append('journal', journal);
  if (video) {
    const uri = video.startsWith('file://') ? video : 'file://' + video;
    // La forme qu'attend fetch pour un fichier : uri, type, nom.
    fd.append('video', { uri, type: 'video/mp4', name: 'ecran.mp4' } as unknown as Blob);
  }
  return fd;
}

/**
 * L'INSTANT DE L'APPUI : celui que le natif a figé ; à défaut (binaire plus
 * ancien), le dernier toucher du bouton rouge ; à défaut, maintenant.
 */
export function instantDeLAppui(envoi: Pick<EnvoiDiagnostic, 'instant' | 'gestes'>): number {
  if (typeof envoi.instant === 'number' && Number.isFinite(envoi.instant)) return envoi.instant;
  const bouton = [...(envoi.gestes ?? [])]
    .reverse()
    .find((g) => typeof g.cible === 'string' && g.cible.startsWith('Diagnostic'));
  return bouton?.at ?? Date.now();
}

export type IssueEnvoi = 'envoye' | 'partage' | 'echec';

/**
 * Envoie le diagnostic. Rend ce qui s'est passé, et le DIT à l'utilisateur
 * (astuce si c'est parti, alerte avec partage sinon).
 */
export async function envoyerDiagnostic(envoi: EnvoiDiagnostic): Promise<IssueEnvoi> {
  const qui = identiteDuCompte();
  if (!qui || !SERVEUR.url) {
    return proposerLePartage(envoi, 'Connexion au serveur indisponible.');
  }
  const journal = construireJournal(
    await instantané(),
    planCourant(),
    envoi.gestes,
    evenementsAEnvoyer(instantDeLAppui(envoi)),
  );
  const fd = construireFormData(qui, envoi.message, journal, envoi.video);
  try {
    const reponse = await fetch(`${SERVEUR.url}/api.php`, {
      method: 'POST',
      body: fd,
    });
    const r = await reponse.json();
    if (r?.ok === true) {
      astuce('Envoyé au développeur', { icone: 'sirene', fete: true });
      return 'envoye';
    }
    return proposerLePartage(envoi, String(r?.raison ?? 'Le serveur a refusé le diagnostic.'));
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
      if (envoi.video) {
        await RoomScan.shareFile(
          envoi.video.startsWith('file://') ? envoi.video.slice(7) : envoi.video,
        );
        return;
      }
      const journal = construireJournal(
        await instantané(),
        planCourant(),
        envoi.gestes,
        evenementsAEnvoyer(instantDeLAppui(envoi)),
      );
      await RoomScan.shareText(journal, 'diagnostic.json');
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

/** Branche l'écoute de l'événement `envoyer`. Idempotent. */
export function demarrerEnvoi(): void {
  if (desabonner) return;
  const abonne = diagnosticEvents.addListener('envoyer', (e: EnvoiDiagnostic) => {
    envoyerDiagnostic({
      message: typeof e?.message === 'string' ? e.message : '',
      video: typeof e?.video === 'string' ? e.video : null,
      gestes: Array.isArray(e?.gestes) ? e.gestes : [],
      instant: typeof e?.instant === 'number' ? e.instant : undefined,
    }).catch(() => {});
  });
  desabonner = () => abonne.remove();
}

/** Coupe l'écoute. */
export function arreterEnvoi(): void {
  desabonner?.();
  desabonner = null;
}

/** Exposé pour que l'app puisse figer sans attendre l'événement, au besoin. */
export { Diagnostic };

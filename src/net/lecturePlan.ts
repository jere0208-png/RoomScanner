/**
 * ENVOYER LE PLAN À LIRE — la page part sur le serveur, qui la fait lire par
 * Claude et rend ce qu'il a vu (voir `server/lecture-plan.php`).
 *
 * La lecture prend du temps : une IA qui regarde un plan chargé peut mettre
 * une minute. On l'attend deux minutes et demie, pas cinq secondes comme une
 * vérification de compte — et l'écran le dit pendant ce temps.
 *
 * Nous ne gardons rien, ni ici ni sur le serveur : la page part, la lecture
 * revient. Anthropic, lui, la garde un temps limité (contrôles de sécurité) —
 * c'est déclaré au manifeste de confidentialité (« Photos ou vidéos »).
 *
 * L'ABONNEMENT PART EN PREUVE, PLUS EN DÉCLARATION — revue « sécurité » :
 * le drapeau `abonne` que le serveur croyait est remplacé par `preuve`, la
 * transaction signée par Apple ; jointe seulement quand le téléphone en
 * détient une.
 */
import type { LectureBrute } from '../geometry/lecturePlan';
import type { PageDePlan } from '../native/lecturePlan';
import { SERVEUR } from '../config/serveur';

export type ReponseDeLecture =
  | { ok: true; lecture: LectureBrute; essai: boolean }
  | {
      ok: false;
      /** Ce qui bloque : il faut le Pro, le plafond du jour, ou autre chose. */
      motif: 'pro' | 'quota' | 'compte' | 'reseau' | 'refus';
      message: string;
    };

/** Deux minutes et demie : le temps qu'il faut à la lecture d'un plan chargé. */
export const DELAI_DE_LECTURE = 150_000;

export async function envoyerLePlan(
  page: PageDePlan,
  qui: { identifiant: string; jeton: string } | null,
  preuve: string | null,
  delai = DELAI_DE_LECTURE,
): Promise<ReponseDeLecture> {
  if (!SERVEUR.url) {
    return { ok: false, motif: 'reseau', message: 'La lecture de plans demande le serveur d’EchoPlan.' };
  }
  if (!qui) {
    return { ok: false, motif: 'compte', message: 'Connectez-vous pour faire lire un plan : la lecture d’essai est attachée à votre compte.' };
  }
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  try {
    const reponse = await Promise.race([
      fetch(`${SERVEUR.url}/api.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'lire_plan',
          identifiant: qui.identifiant,
          jeton: qui.jeton,
          image: page.base64,
          media: 'image/jpeg',
          textes: page.textes,
          ...(preuve ? { preuve } : {}),
        }),
      }),
      new Promise<never>((_, rej) => {
        minuteur = setTimeout(() => rej(new Error('délai')), delai);
      }),
    ]);
    const r = (await reponse.json()) as {
      ok?: boolean;
      lecture?: LectureBrute;
      essai?: boolean;
      raison?: string;
      message?: string;
    };
    if (r.ok && r.lecture) return { ok: true, lecture: r.lecture, essai: !!r.essai };
    if (r.raison === 'pro') return { ok: false, motif: 'pro', message: r.message ?? 'La lecture de plans papier est réservée au Pro.' };
    if (r.raison === 'quota') return { ok: false, motif: 'quota', message: r.message ?? 'Le plafond de lectures du jour est atteint.' };
    if (r.raison === 'Jeton invalide.' || r.raison === 'Compte inconnu.') {
      return { ok: false, motif: 'compte', message: 'Votre session a expiré : reconnectez-vous, puis recommencez.' };
    }
    return { ok: false, motif: 'refus', message: r.raison ?? 'Le plan n’a pas pu être lu : réessayez.' };
  } catch {
    return { ok: false, motif: 'reseau', message: 'La lecture n’a pas abouti : vérifiez la connexion, puis réessayez.' };
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }
}

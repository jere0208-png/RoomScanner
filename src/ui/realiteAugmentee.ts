/**
 * LA MAQUETTE CHEZ SOI, EN RÉALITÉ AUGMENTÉE.
 *
 * Relevé du patron : « améliore encore nativement l'application pour être au
 * top de la concurrence ». Les applications de relevé exportent un fichier
 * 3D ; aucune ne pose LE LOGEMENT TEL QU'ON LE VOIT DANS L'APP — murs en
 * vraies images, meubles à leurs cotes, portes et fenêtres en volume — sur la
 * table du client, en un geste.
 *
 * Le natif (`RoomScanVisiteRegie.realiteAugmentee`) écrit la maquette à
 * l'écran en USDZ, réduite pour tenir sur une table, et l'ouvre dans AR Quick
 * Look : on la pose, on tourne autour, on l'agrandit jusqu'à la taille réelle.
 * Sans maquette à l'écran, il se rabat sur le modèle que RoomPlan a écrit au
 * scan (`secours`).
 */
import { NativeModules, Platform } from 'react-native';

/** La clé de la maquette native affichée, pour que la régie la retrouve. */
let cleCourante: string | null = null;

/** La vue 3D annonce sa maquette en montant, et la retire en partant. */
export function annoncerLaMaquette(cle: string | null): void {
  cleCourante = cle;
}

export function cleDeLaMaquette(): string | null {
  return cleCourante;
}

export type IssueDeLaRA =
  | { ok: true; source: 'maquette' | 'releve' }
  | { ok: false; message: string };

const regie = ():
  | {
      realiteAugmentee?: (
        cle: string,
        secours: string | null,
      ) => Promise<string>;
    }
  | undefined =>
  Platform.OS === 'ios' ? NativeModules.RoomScanVisiteRegie : undefined;

const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Ouvre la maquette en réalité augmentée.
 *
 * `attente` : on vient de basculer en 3D, la maquette n'est pas encore
 * montée — on lui laisse ce temps pour s'annoncer, puis pour se bâtir.
 */
export async function voirEnRealiteAugmentee(
  o: { secours?: string | null; attente?: number } = {},
): Promise<IssueDeLaRA> {
  const m = regie();
  if (!m?.realiteAugmentee) {
    return {
      ok: false,
      message:
        'La réalité augmentée arrive avec la prochaine mise à jour de l’app.',
    };
  }
  const attente = o.attente ?? 0;
  if (attente > 0) {
    const debut = Date.now();
    while (!cleCourante && Date.now() - debut < attente) await pause(100);
    // Annoncée, elle se bâtit encore : un souffle de plus.
    await pause(450);
  }
  try {
    const source = await m.realiteAugmentee(
      cleCourante ?? '',
      o.secours ?? null,
    );
    return { ok: true, source: source === 'releve' ? 'releve' : 'maquette' };
  } catch {
    return {
      ok: false,
      message:
        'Impossible d’ouvrir la réalité augmentée : passez en vue 3D et réessayez.',
    };
  }
}

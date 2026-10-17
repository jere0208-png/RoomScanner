/**
 * Fichiers des photos de repérage.
 *
 * Le store ne peut pas importer `react-native-room-scan` : le module crée un
 * `NativeEventEmitter` au chargement, ce qui fait tomber tous les tests du
 * store — et, sur un appareil sans le module natif, l'app entière. On passe
 * donc par `NativeModules`, cherché À CHAQUE APPEL comme pour l'haptique :
 * l'ordre d'enregistrement des modules n'est pas garanti, et un `undefined`
 * capturé une fois pour toutes couperait la fonction pour de bon.
 */
import { Linking, NativeModules, Platform } from 'react-native';
import { alerte } from './alerte';

/**
 * L'ACCÈS À LA PHOTOTHÈQUE, tel que le natif le rend (`RoomScanPhoto.swift`,
 * `mot`) — même liste que `AccesPhotos` du module, qu'on ne peut pas
 * importer d'ici (voir plus haut) :
 *
 * - `complet` : les photos de repérage vont dans l'album « EchoPlan » ;
 * - `limite` : elles vont dans la pellicule, et l'app ne relit que celles
 *   qu'elle a créées (pas d'album : iOS ne le permet pas dans ce mode) ;
 * - `refuse` : elles restent dans l'app, et partent avec elle ;
 * - `indetermine` : la question n'a pas encore été posée.
 */
export type AccesPhotos = 'complet' | 'limite' | 'refuse' | 'indetermine';

/**
 * Ce que le natif rend pour une photo à retrouver : l'ancien natif rendait
 * un chemin nu (ou `null`), le nouveau dit aussi l'état de l'accès.
 */
type Relue = string | null | { path?: string | null; acces?: AccesPhotos };

const natif = ():
  | {
      deletePhotos?: (p: string[]) => Promise<number>;
      cleanModels?: (gardes: string[]) => Promise<number>;
      restorePhoto?: (asset: string) => Promise<Relue>;
      photoAccess?: () => Promise<AccesPhotos>;
      pickLimitedPhotos?: () => Promise<AccesPhotos>;
    }
  | undefined => (Platform.OS === 'ios' ? NativeModules.RoomScanPhoto : undefined);

/**
 * Efface des photos de repérage devenues inutiles.
 *
 * Ne lève jamais : perdre une image orpheline est un incident de ménage, pas
 * une raison d'interrompre la suppression d'un scan.
 */
export function deletePhotoFiles(paths: string[]): void {
  if (paths.length === 0) return;
  try {
    natif()?.deletePhotos?.(paths)?.catch?.(() => {});
  } catch {
    // Rien à faire : le fichier restera, l'app continue.
  }
}

/**
 * Redemande au coffre — la photothèque de l'utilisateur — l'image d'une
 * photo dont le fichier de cache a disparu, et rend son nouveau chemin.
 *
 * `chemin` vaut `null` si l'image n'y est plus (l'utilisateur l'a effacée de
 * ses Photos), si l'accès est refusé ou limité à d'autres photos, ou hors
 * iOS ; `acces` dit lequel, pour que l'écran l'explique. La punaise reste,
 * sans vignette, comme pour toute photo dont le fichier manque : une photo
 * perdue n'a jamais empêché de lire un plan.
 */
export function reposerDuCoffre(
  asset: string,
): Promise<{ chemin: string | null; acces?: AccesPhotos }> {
  const rien = { chemin: null };
  try {
    const p = natif()?.restorePhoto?.(asset);
    if (!p) return Promise.resolve(rien);
    return p.then(lireRelue).catch(() => rien);
  } catch {
    return Promise.resolve(rien);
  }
}

/** Ramène les deux formes de réponse du natif à une seule. */
function lireRelue(r: Relue): { chemin: string | null; acces?: AccesPhotos } {
  if (typeof r === 'string') return { chemin: r || null };
  if (!r || typeof r !== 'object') return { chemin: null };
  const chemin = typeof r.path === 'string' && r.path ? r.path : null;
  return r.acces ? { chemin, acces: r.acces } : { chemin };
}

/**
 * L'issue d'une photo qu'on est allé rechercher dans la photothèque (voir
 * `reposerPhoto` dans le store) : reposée, ou pourquoi elle ne l'a pas été.
 */
export type IssueRepose = 'repose' | 'refuse' | 'limite' | 'introuvable' | 'sans-coffre';

/**
 * CE QUE DIT LA FICHE D'UNE PHOTO QU'ON N'A PAS PU RETROUVER, et le geste
 * qui peut y remédier : cocher ses photos (accès limité) ou ouvrir les
 * Réglages (refus). Une image noire sans un mot laissait croire à une
 * panne ; un accès limité se répare pourtant en deux touches.
 */
export function messagePhotoManquante(
  issue: IssueRepose | null | undefined,
): { texte: string; geste?: 'choisir' | 'reglages' } | null {
  switch (issue) {
    case 'limite':
      return {
        texte:
          'Cette photo n’est pas dans les photos qu’EchoPlan a le droit de ' +
          'voir. Ajoutez-la à la sélection pour la retrouver.',
        geste: 'choisir',
      };
    case 'refuse':
      return {
        texte:
          'L’accès à vos Photos est refusé : EchoPlan ne peut pas y ' +
          'retrouver cette photo. Autorisez-le dans les Réglages.',
        geste: 'reglages',
      };
    case 'introuvable':
      return { texte: 'Photo introuvable : elle a été supprimée de vos Photos.' };
    case 'sans-coffre':
      return {
        texte:
          'Photo introuvable : elle n’avait pas été rangée dans vos Photos, ' +
          'et l’application a été réinstallée depuis.',
      };
    default:
      return null;
  }
}

/**
 * L'ÉTAT DE L'ACCÈS AUX PHOTOS, sans rien demander. `null` hors iOS ou sans
 * natif : il n'y a alors rien à dire.
 */
export function lireAccesPhotos(): Promise<AccesPhotos | null> {
  try {
    const p = natif()?.photoAccess?.();
    return p ? p.catch(() => null) : Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
}

/**
 * ÉLARGIR UN ACCÈS LIMITÉ : la feuille du système où l'on coche les photos
 * qu'EchoPlan peut voir — c'est ainsi qu'on lui rend ses propres photos
 * après une réinstallation. Rend l'état d'accès une fois la feuille fermée.
 */
export function choisirPhotosVisibles(): Promise<AccesPhotos | null> {
  try {
    const p = natif()?.pickLimitedPhotos?.();
    return p ? p.catch(() => null) : Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
}

/**
 * Les Réglages d'EchoPlan : le seul endroit où l'on passe d'un refus ou
 * d'un accès limité à l'accès complet — iOS ne repose jamais la question.
 */
export function ouvrirReglagesPhotos(): void {
  try {
    Promise.resolve(Linking.openSettings()).catch(() => {});
  } catch {
    // Pas de Réglages à ouvrir (hors iOS) : le message a été lu, c'est déjà ça.
  }
}

/**
 * CE QU'ON DIT APRÈS UNE PHOTO, selon l'accès accordé — relevé du patron :
 * « les photos de repérage vont dans un album EchoPlan qui survit à une
 * réinstallation ». Quand ce n'est pas le cas, on le DIT, au lieu de
 * laisser croire qu'elles y sont.
 *
 * `null` quand tout va bien (accès complet), ou quand rien n'a été décidé.
 */
export function messageAccesPhotos(
  acces: AccesPhotos | null | undefined,
): { titre: string; message: string } | null {
  if (acces === 'refuse') {
    return {
      titre: 'Photo gardée dans EchoPlan',
      message:
        'L’accès à vos Photos est refusé : la photo reste dans l’application, ' +
        'sur ce téléphone. Elle sera perdue si vous supprimez EchoPlan. Pour ' +
        'la ranger dans l’album « EchoPlan » de votre photothèque, autorisez ' +
        'l’accès complet dans les Réglages.',
    };
  }
  if (acces === 'limite') {
    return {
      titre: 'Accès limité à vos Photos',
      message:
        'La photo est bien enregistrée dans votre photothèque, et EchoPlan ' +
        'ne relit que les photos qu’il a prises. Mais l’album « EchoPlan » ' +
        'demande l’accès complet : sans lui, vos photos de repérage restent ' +
        'mêlées à la pellicule.',
    };
  }
  return null;
}

/**
 * Ce qui a déjà été dit depuis le lancement : une photo sur deux qui
 * rouvre la même fenêtre, c'est un chantier qu'on interrompt pour rien.
 */
const dejaDit = new Set<AccesPhotos>();

/**
 * Explique, UNE fois par lancement et par état, un refus ou un accès limité
 * — juste après la photo qui l'a révélé (la prise rendue par
 * `RoomScan.takePhoto`, qui porte l'état de l'accès). Propose les Réglages, seul chemin
 * vers l'accès complet.
 */
export function annoncerAccesPhotos(
  prise: { path: string; acces?: AccesPhotos } | null | undefined,
): void {
  const acces = prise?.acces;
  const m = messageAccesPhotos(acces);
  if (!m || !acces || dejaDit.has(acces)) return;
  dejaDit.add(acces);
  alerte(m.titre, m.message, [
    { label: 'Plus tard' },
    { label: 'Réglages', onPress: ouvrirReglagesPhotos },
  ]);
}

/** Pour les bancs d'essai : oublie ce qui a déjà été dit. */
export function oublierAnnoncesPhotos(): void {
  dejaDit.clear();
}

/**
 * Efface les modèles 3D qu'aucun scan ne réclame plus.
 *
 * On passe les modèles À GARDER : le natif balaie les Documents et fait le
 * reste. Un modèle pèse plusieurs mégaoctets, et jusqu'ici aucun n'était
 * jamais effacé — de quoi remplir un téléphone en une saison de chantiers.
 *
 * Ne lève jamais, pour la même raison que le ménage des photos.
 */
export function cleanModelFiles(gardes: string[]): Promise<number> {
  try {
    const p = natif()?.cleanModels?.(gardes);
    return p ? p.catch(() => 0) : Promise.resolve(0);
  } catch {
    // Le modèle restera sur le disque, l'app continue.
    return Promise.resolve(0);
  }
}

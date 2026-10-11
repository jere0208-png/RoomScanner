/**
 * LE PLAN PAPIER, CÔTÉ TÉLÉPHONE — le scanner de documents d'iOS, la
 * photothèque, et les textes lus sur la page (voir
 * `RoomScanLecturePlan.swift`).
 *
 * `null` partout où l'utilisateur renonce, ou sans module natif : renoncer
 * n'est pas une panne, l'écran revient simplement à son invitation.
 */
import { NativeModules, Platform } from 'react-native';

/** Un mot reconnu sur la page, et son centre en millièmes de l'image. */
export interface TexteLu {
  t: string;
  x: number;
  y: number;
}

/** La page prête à partir : son JPEG, sa taille, ses textes. */
export interface PageDePlan {
  base64: string;
  largeur: number;
  hauteur: number;
  textes: TexteLu[];
  /** Pour un PDF : la page rendue, et le nombre de pages du fichier. */
  page?: number;
  pages?: number;
}

/** Pourquoi un fichier ne s'ouvre pas : pas un PDF ni une image, protégé, vide. */
export type ErreurDeFichier = 'format' | 'protege' | 'vide';

const natif = () =>
  (Platform.OS === 'ios' ? NativeModules.RoomScanLecturePlan : undefined) as
    | {
        disponible?: () => Promise<boolean>;
        scanner?: () => Promise<PageDePlan | null>;
        importer?: () => Promise<PageDePlan | null>;
        ouvrirUnFichier?: () => Promise<PageDePlan | { erreur?: string } | null>;
        pageDuPdf?: (n: number) => Promise<PageDePlan | null>;
      }
    | undefined;

/** Une page vraiment exploitable : de l'image, une taille. */
const valide = (p: PageDePlan | null | undefined): PageDePlan | null =>
  p && typeof p.base64 === 'string' && p.base64.length > 1000 && p.largeur > 0 && p.hauteur > 0
    ? { ...p, textes: Array.isArray(p.textes) ? p.textes : [] }
    : null;

/** Le scanner de documents existe-t-il ici ? */
export async function scannerDisponible(): Promise<boolean> {
  try {
    return !!(await natif()?.disponible?.());
  } catch {
    return false;
  }
}

/** Ouvre le scanner : la feuille détectée, prise, redressée. */
export async function scannerUnPlan(): Promise<PageDePlan | null> {
  const fn = natif()?.scanner;
  if (!fn) return null;
  try {
    return valide(await fn());
  } catch {
    return null;
  }
}

/** Une photo de plan déjà prise, ou reçue. */
export async function importerUnPlan(): Promise<PageDePlan | null> {
  const fn = natif()?.importer;
  if (!fn) return null;
  try {
    return valide(await fn());
  } catch {
    return null;
  }
}

/**
 * UN PLAN EN FICHIER — relevé du patron : « on doit aussi pouvoir lire un
 * fichier PDF ou image au lieu de scanner le papier à l'appareil photo ».
 *
 * Le sélecteur de fichiers d'iOS (iCloud Drive, pièces jointes enregistrées,
 * Dropbox…) ; un PDF se rend à haute définition, et sa page la plus cotée
 * est retenue. `null` : on a renoncé. `{ erreur }` : le fichier ne s'ouvre
 * pas, et l'écran dit pourquoi — ce n'est pas un renoncement.
 */
export async function ouvrirUnFichier(): Promise<PageDePlan | { erreur: ErreurDeFichier } | null> {
  const fn = natif()?.ouvrirUnFichier;
  if (!fn) return null;
  try {
    const r = await fn();
    if (!r) return null;
    if ('erreur' in r && r.erreur) {
      const e = r.erreur;
      return { erreur: e === 'protege' || e === 'vide' ? e : 'format' };
    }
    return valide(r as PageDePlan) ?? { erreur: 'format' };
  } catch {
    return { erreur: 'format' };
  }
}

/** Une autre page du PDF ouvert : on change de page avant de dépenser une lecture. */
export async function pageDuPdf(n: number): Promise<PageDePlan | null> {
  const fn = natif()?.pageDuPdf;
  if (!fn) return null;
  try {
    return valide(await fn(n));
  } catch {
    return null;
  }
}

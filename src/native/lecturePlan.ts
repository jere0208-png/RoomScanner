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
}

const natif = () =>
  (Platform.OS === 'ios' ? NativeModules.RoomScanLecturePlan : undefined) as
    | {
        disponible?: () => Promise<boolean>;
        scanner?: () => Promise<PageDePlan | null>;
        importer?: () => Promise<PageDePlan | null>;
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

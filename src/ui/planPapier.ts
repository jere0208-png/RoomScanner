/**
 * LA PHOTO DU PLAN PAPIER — le pont vers le natif.
 *
 * Deux choses seulement viennent du téléphone : une image en niveaux de gris
 * et les TEXTES qu'il y a lus. Le reste — murs, menuiseries, symboles,
 * échelle — se déduit en JavaScript, dans `src/papier/`, parce que ce qui se
 * déduit se teste.
 *
 * L'OCR RESTE NATIF, et c'est un choix, pas un renoncement : iOS sait lire un
 * texte imprimé depuis dix ans (`VNRecognizeTextRequest`), gratuitement, hors
 * ligne, mieux que tout ce qu'on écrirait ici. Ce sont ces textes qui donnent
 * l'échelle du plan — les cotes écrites — et les noms des pièces.
 *
 * ON PASSE PAR `NativeModules`, cherché À CHAQUE APPEL, comme pour les photos
 * de repérage et l'haptique : l'ordre d'enregistrement des modules n'est pas
 * garanti, et un `undefined` capturé une fois pour toutes couperait la
 * fonction pour de bon. Sur un appareil dont l'app n'a pas encore été
 * recompilée, `disponible()` rend faux et l'écran le dit — plutôt que de
 * planter sur un module absent.
 */
import { NativeModules, Platform } from 'react-native';
import type { PhotoDePlan, TexteLu } from '../papier/entree';

/** Ce que le natif rend : l'image en gris, encodée, et ce qu'il a lu. */
interface PhotoNative {
  largeur: number;
  hauteur: number;
  /** `largeur × hauteur` octets, en base64 — un octet par pixel. */
  gris: string;
  textes?: TexteLu[];
  dpi?: number;
}

const natif = ():
  | {
      choisirPlan?: (source: 'camera' | 'galerie') => Promise<PhotoNative | null>;
    }
  | undefined => (Platform.OS === 'ios' ? NativeModules.RoomScanPlan : undefined);

/** Le module est-il là ? Faux tant que l'app n'a pas été recompilée. */
export function disponible(): boolean {
  try {
    return typeof natif()?.choisirPlan === 'function';
  } catch {
    return false;
  }
}

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Décode le base64 en octets.
 *
 * On ne passe PAS par un tableau de nombres à travers le pont : une photo
 * de plan fait un à trois millions de pixels, et le pont React Native
 * sérialise chaque nombre en JSON. Le base64 coûte un tiers de plus en
 * octets et cent fois moins en temps.
 */
export function decoderGris(b64: string): Uint8Array {
  const propre = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const n = Math.floor((propre.length * 3) / 4);
  const out = new Uint8Array(n);
  let bits = 0;
  let compte = 0;
  let i = 0;
  for (const c of propre) {
    bits = (bits << 6) | ALPHABET.indexOf(c);
    compte += 6;
    if (compte >= 8) {
      compte -= 8;
      out[i++] = (bits >> compte) & 0xff;
    }
  }
  return out.subarray(0, i);
}

/**
 * Demande une photo de plan : l'appareil ou la photothèque.
 *
 * Rend `null` si l'utilisateur renonce, si l'accès est refusé, ou si le
 * module natif n'est pas là. Ne lève jamais : un écran qui plante parce
 * qu'on a fermé un sélecteur d'images serait indéfendable.
 */
export async function choisirPlan(
  source: 'camera' | 'galerie',
): Promise<PhotoDePlan | null> {
  try {
    const brut = await natif()?.choisirPlan?.(source);
    if (!brut) return null;
    const px = decoderGris(brut.gris);
    if (px.length < brut.largeur * brut.hauteur) return null;
    return {
      image: { l: brut.largeur, h: brut.hauteur, px },
      textes: brut.textes ?? [],
      dpi: brut.dpi,
    };
  } catch {
    return null;
  }
}

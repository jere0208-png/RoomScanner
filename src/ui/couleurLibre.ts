/**
 * LA COULEUR LIBRE — les conversions du sélecteur RGB (`NuancierLibre`).
 *
 * Relevé du patron : « donne la possibilité de choisir beaucoup de couleurs
 * pour meubles, murs, sols, dans une palette de sélection RGB ». Les
 * nuanciers restent (ce sont des raccourcis) ; une couleur libre s'enregistre
 * en `#RRGGBB`, majuscules, et rien d'autre : c'est ce qui permet de la
 * reconnaître d'une clé de palette (« sauge ») au premier caractère.
 *
 * Tout est BORNÉ : une teinte hors de [0, 360[, une saturation négative, un
 * canal à 300 ne sortent jamais d'ici autrement que ramenés dans leurs
 * bornes. Et l'aller-retour hexa → TSV → hexa rend exactement l'hexa de
 * départ (le banc le vérifie sur tout le cube, par pas de 17).
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Teinte en degrés [0, 360[, saturation et valeur dans [0, 1]. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Une couleur libre bien formée : `#RRGGBB`. */
export function estHex(s: string | null | undefined): s is string {
  return typeof s === 'string' && HEX.test(s);
}

/**
 * LA SAISIE DU CHAMP HEXADÉCIMAL — « #a1b2c3 », « A1B2C3 », avec des
 * espaces autour. Rend `#A1B2C3`, ou `null` si ce n'est pas six chiffres
 * hexadécimaux : une saisie invalide est REFUSÉE, jamais devinée.
 */
export function lireHex(saisie: string | null | undefined): string | null {
  if (typeof saisie !== 'string') return null;
  const t = saisie.trim();
  const m = /^#?([0-9A-Fa-f]{6})$/.exec(t);
  return m ? `#${m[1].toUpperCase()}` : null;
}

const borner = (x: number, min: number, max: number) => (Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : min);
const canal = (x: number) => Math.round(borner(x, 0, 255));

/** Trois canaux (bornés, arrondis) → `#RRGGBB`. */
export function rgbVersHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((x) => canal(x).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** `#RRGGBB` → trois canaux 0–255 ; `null` si l'hexa est mal formé. */
export function hexVersRgb(hex: string): Rgb | null {
  if (!estHex(hex)) return null;
  const v = parseInt(hex.slice(1), 16);
  // eslint-disable-next-line no-bitwise
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

/** Une teinte ramenée dans [0, 360[. */
export function bornerTeinte(h: number): number {
  if (!Number.isFinite(h)) return 0;
  const x = h % 360;
  return x < 0 ? x + 360 : x;
}

/** TSV → RGB (canaux réels 0–255, non arrondis). Entrées bornées. */
export function hsvVersRgb({ h, s, v }: Hsv): Rgb {
  const hh = bornerTeinte(h) / 60;
  const ss = borner(s, 0, 1);
  const vv = borner(v, 0, 1);
  const c = vv * ss;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = vv - c;
  const [r, g, b] =
    hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/** RGB (0–255, bornés) → TSV. Un gris garde la teinte 0. */
export function rgbVersHsv({ r, g, b }: Rgb): Hsv {
  const R = borner(r, 0, 255) / 255;
  const G = borner(g, 0, 255) / 255;
  const B = borner(b, 0, 255) / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === R) h = 60 * (((G - B) / d) % 6);
    else if (max === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  return { h: bornerTeinte(h), s: max === 0 ? 0 : d / max, v: max };
}

export const hsvVersHex = (c: Hsv): string => rgbVersHex(hsvVersRgb(c));

/** `#RRGGBB` → TSV ; un hexa mal formé rend le blanc. */
export function hexVersHsv(hex: string): Hsv {
  const rgb = hexVersRgb(hex);
  return rgb ? rgbVersHsv(rgb) : { h: 0, s: 0, v: 1 };
}

/** Une teinte foncée (luminance perçue) : ce qui se pose dessus s'écrit en blanc. */
export function estSombre(hex: string): boolean {
  const c = hexVersRgb(hex);
  if (!c) return false;
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b < 140;
}

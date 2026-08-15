/**
 * Apparence relevée pendant le scan : couleurs moyennes et grilles de
 * couleurs (« textures ») des murs, du sol et des meubles.
 *
 * Le natif ne renvoie que des couleurs `#RRGGBB` ; tout le rendu — plan 2D,
 * vue 3D, PDF — passe par les helpers d'ici pour rester cohérent.
 */
import type { FloorData, SurfaceTexture } from 'react-native-room-scan';
import type { Pt, WallSeg } from './floorplan';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Mélange linéaire de deux couleurs `#RRGGBB`. */
export function mixHex(a: string, b: string, t: number): string {
  const k = clamp01(t);
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa
    .map((v, i) =>
      Math.round(v + (pb[i] - v) * k)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Luminance perçue (0 = noir, 1 = blanc). */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Encre lisible sur un fond donné. */
export function inkOn(hex: string): string {
  return luminance(hex) > 0.55 ? '#0B0D12' : '#F4F6FA';
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const valid = (c?: string): c is string => !!c && HEX.test(c);

/**
 * Couleur d'un texel. `u` = 0 à l'extrémité A, 1 à l'extrémité B ;
 * `v` = 0 en haut de la surface, 1 en bas.
 */
export function sampleTexture(
  tex: SurfaceTexture | undefined,
  u: number,
  v: number,
): string | undefined {
  if (!tex || tex.cols < 1 || tex.rows < 1) return undefined;
  const col = Math.min(tex.cols - 1, Math.max(0, Math.floor(clamp01(u) * tex.cols)));
  const row = Math.min(tex.rows - 1, Math.max(0, Math.floor(clamp01(v) * tex.rows)));
  const c = tex.texels[row * tex.cols + col];
  return valid(c) ? c : undefined;
}

/** Couleur du sol au point (x, z) du monde, à défaut sa moyenne. */
export function floorColorAt(floor: FloorData | null | undefined, p: Pt): string | undefined {
  if (!floor) return undefined;
  const t = floor.texture;
  if (t && t.maxX > t.minX && t.maxZ > t.minZ) {
    const c = sampleTexture(
      t,
      (p.x - t.minX) / (t.maxX - t.minX),
      (p.z - t.minZ) / (t.maxZ - t.minZ),
    );
    if (c) return c;
  }
  return valid(floor.color) ? floor.color : undefined;
}

/** Vrai si le scan porte au moins une couleur exploitable (toutes pièces). */
export function hasCapturedColors(
  walls: WallSeg[],
  floors: (FloorData | null | undefined)[],
): boolean {
  return walls.some((w) => valid(w.color)) || floors.some((f) => valid(f?.color));
}

// ------------------------------------------------------- semis du sol

/** Test d'appartenance d'un point à un polygone (lancer de rayon). */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Pas du semis, en mètres : choisi pour que les points soient espacés
 * d'environ `targetPx` à l'écran, sur une échelle « ronde » (0,125 m, 0,25 m…).
 */
export function dotStep(scalePxPerM: number, targetPx = 15): number {
  let step = 0.25;
  if (scalePxPerM <= 0) return step;
  while (step * scalePxPerM < targetPx * 0.7) step *= 2;
  while (step * scalePxPerM > targetPx * 1.6) step /= 2;
  return Math.min(2, Math.max(0.0625, step));
}

/**
 * Semis régulier de points couvrant l'intérieur d'un polygone : c'est le
 * « fond du sol » qui distingue au premier coup d'œil la surface des murs.
 */
export function floorDots(poly: Pt[], step: number, max = 1800): Pt[] {
  if (poly.length < 3 || step <= 0) return [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  // Semis calé sur l'origine du monde : il ne glisse pas quand on édite le plan.
  const x0 = Math.ceil(minX / step) * step;
  const z0 = Math.ceil(minZ / step) * step;
  const out: Pt[] = [];
  for (let z = z0; z <= maxZ && out.length < max; z += step) {
    for (let x = x0; x <= maxX && out.length < max; x += step) {
      const p = { x, z };
      if (pointInPolygon(p, poly)) out.push(p);
    }
  }
  return out;
}

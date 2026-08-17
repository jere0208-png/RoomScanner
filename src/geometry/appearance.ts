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

const rgbDe = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const hexDe = (c: [number, number, number]) =>
  `#${c
    .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0'))
    .join('')}`;

/**
 * LA GRILLE RELEVÉE EST BRUYANTE : on la lisse avant de s'en servir.
 *
 * Une case de mur, c'est une poignée de pixels lus au vol pendant que le
 * téléphone bouge. Un reflet, une ombre portée, un passage de main, et la
 * case sort d'une teinte franchement différente de ses voisines. Sur six
 * cases par quatre, ça se voit immédiatement : un damier de gris aléatoires
 * là où il n'y a qu'un mur peint.
 *
 * On corrige en deux temps, comme le ferait n'importe quel traitement
 * d'image : la MÉDIANE du voisinage remplace ce qui s'en écarte trop
 * (c'est le remède classique au bruit ponctuel, et il ne bave pas sur les
 * vraies frontières), puis un léger flou réunit ce qui reste. Un vrai mur
 * d'accent garde sa couleur : il occupe plusieurs cases, donc c'est LUI la
 * médiane.
 */
function lisser(tex: SurfaceTexture): SurfaceTexture {
  const { cols, rows, texels } = tex;
  const pixels = texels.map((t) => (valid(t) ? rgbDe(t) : null));
  const voisins = (col: number, row: number, rayon = 1) => {
    const out: [number, number, number][] = [];
    for (let dy = -rayon; dy <= rayon; dy++) {
      for (let dx = -rayon; dx <= rayon; dx++) {
        const x = col + dx;
        const y = row + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const p = pixels[y * cols + x];
        if (p) out.push(p);
      }
    }
    return out;
  };
  const mediane = (liste: [number, number, number][]) =>
    [0, 1, 2].map((k) => {
      const v = liste.map((p) => p[k]).sort((x, y) => x - y);
      return v[Math.floor((v.length - 1) / 2)];
    }) as [number, number, number];

  /**
   * LA TEINTE DE LA SURFACE, ET LA PREUVE QU'ON S'EN ÉCARTE.
   *
   * Le lissage local ne suffisait pas, et le chantier l'a dit deux fois :
   * « on voit encore une formation de carrés de couleurs différentes ». La
   * médiane du voisinage rattrape la case aberrante ; elle ne rattrape pas
   * un mur où CHAQUE case est à quinze unités de sa voisine — ce qui est
   * l'ordinaire d'un relévé fait en marchant, où l'exposition de la caméra
   * bouge d'une seconde à l'autre. Le résultat reste un patchwork, et un
   * mur peint d'une seule couleur n'a pas à sortir en patchwork.
   *
   * On renverse donc la charge de la preuve. La surface a UNE teinte — la
   * médiane de tout ce qu'on en a vu — et chaque case doit la porter, SAUF
   * si elle s'en écarte franchement ET que ses voisines s'en écartent dans
   * le même sens. Un lambris, un pan d'accent, une trace d'humidité : ces
   * choses-là couvrent plusieurs cases, elles survivent. Le bruit
   * d'exposition, non : il change de signe d'une case à l'autre.
   */
  const tous = pixels.filter(Boolean) as [number, number, number][];
  const dominante = tous.length > 0 ? mediane(tous) : null;
  /** Au-delà : la case a peut-être quelque chose à dire. */
  const SEUIL = 30;

  const out: string[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const p = pixels[row * cols + col];
      const autour = voisins(col, row);
      if (!p || autour.length === 0 || !dominante) {
        out.push(texels[row * cols + col]);
        continue;
      }
      const med = mediane(autour);
      // Franchement hors du lot : c'est du bruit, pas une couleur de mur.
      const ecartVoisins = Math.max(...[0, 1, 2].map((k) => Math.abs(p[k] - med[k])));
      const base = ecartVoisins > 46 ? med : p;
      // Puis un flou léger : deux tiers la case, un tiers son voisinage.
      const moyenne = [0, 1, 2].map(
        (k) => autour.reduce((t, q) => t + q[k], 0) / autour.length,
      ) as [number, number, number];
      const lisse2 = [0, 1, 2].map(
        (k) => base[k] * 0.67 + moyenne[k] * 0.33,
      ) as [number, number, number];

      // Ce qui sépare cette case de la teinte de la surface, et le CANAL
      // sur lequel ça se joue.
      let canal = 0;
      let ecart = 0;
      for (const k of [0, 1, 2]) {
        const d = Math.abs(lisse2[k] - dominante[k]);
        if (d > ecart) {
          ecart = d;
          canal = k;
        }
      }
      if (ecart <= SEUIL) {
        // Dans la famille : c'est la teinte de la surface, pas une autre.
        // On garde un souffle de la case (un dixième) pour que le mur ne
        // sorte pas plat comme un aplat de peinture numérique.
        out.push(
          hexDe([0, 1, 2].map((k) => dominante[k] * 0.9 + lisse2[k] * 0.1) as [
            number,
            number,
            number,
          ]),
        );
        continue;
      }
      // Écart franc : il faut qu'il soit PARTAGÉ. On regarde les quatre
      // voisines directes : au moins deux doivent s'écarter dans le même
      // sens, sur le même canal.
      const sens = Math.sign(lisse2[canal] - dominante[canal]);
      let accord = 0;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as [number, number][]) {
        const x = col + dx;
        const y = row + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const q = pixels[y * cols + x];
        if (!q) continue;
        const d = q[canal] - dominante[canal];
        if (Math.sign(d) === sens && Math.abs(d) > SEUIL * 0.6) accord += 1;
      }
      if (accord >= 2) {
        /*
          UN VRAI PAN GARDE SA COULEUR, ENTIÈREMENT.

          Une première version le ramenait à mi-chemin de la teinte
          dominante « pour rester en famille ». Sur un mur peint en deux
          couleurs — la moitié verte, la moitié bleue — la médiane tombe
          d'un côté ou de l'autre, et l'autre moitié virait au gris-bleu :
          le pan d'accent perdait précisément ce qui en fait un pan
          d'accent. Ce que ses voisines confirment, on le garde tel quel.
        */
        out.push(hexDe(lisse2));
        continue;
      }
      // Seule de son avis : c'est un reflet, pas une couleur de mur.
      out.push(
        hexDe([0, 1, 2].map((k) => dominante[k] * 0.85 + lisse2[k] * 0.15) as [
          number,
          number,
          number,
        ]),
      );
    }
  }
  return { ...tex, texels: out };
}

/**
 * Le lissage coûte quelques dizaines d'opérations ; le rendu, lui, échantillonne
 * des milliers de fois par image. On le fait donc UNE fois par texture, et on
 * s'en souvient — la grille ne change pas d'une image à l'autre.
 */
const lisses = new WeakMap<SurfaceTexture, SurfaceTexture>();
function lisse(tex: SurfaceTexture): SurfaceTexture {
  const connu = lisses.get(tex);
  if (connu) return connu;
  const fait = lisser(tex);
  lisses.set(tex, fait);
  return fait;
}

/**
 * Couleur d'un texel. `u` = 0 à l'extrémité A, 1 à l'extrémité B ;
 * `v` = 0 en haut de la surface, 1 en bas.
 *
 * L'échantillonnage est BILINÉAIRE : on mélange les quatre cases voisines
 * au prorata de la distance, au lieu de prendre la plus proche. Une grille
 * de six cases par quatre étalée sur trois mètres de mur donnait sinon des
 * carrés de cinquante centimètres, francs comme un carrelage — et c'est
 * exactement ce qu'on voyait : un damier, là où le mur est uni.
 */
export function sampleTexture(
  tex: SurfaceTexture | undefined,
  u: number,
  v: number,
): string | undefined {
  if (!tex || tex.cols < 1 || tex.rows < 1) return undefined;
  const t = lisse(tex);
  // Les couleurs valent au CENTRE des cases : entre deux centres on
  // interpole, au-delà des bords on prend la case du bord.
  const fx = clamp01(u) * t.cols - 0.5;
  const fy = clamp01(v) * t.rows - 0.5;
  const x0 = Math.max(0, Math.min(t.cols - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(t.rows - 1, Math.floor(fy)));
  const x1 = Math.max(0, Math.min(t.cols - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(t.rows - 1, y0 + 1));
  const ax = Math.max(0, Math.min(1, fx - x0));
  const ay = Math.max(0, Math.min(1, fy - y0));
  const coin = (cx: number, cy: number) => {
    const c = t.texels[cy * t.cols + cx];
    return valid(c) ? rgbDe(c) : null;
  };
  const c00 = coin(x0, y0);
  const c10 = coin(x1, y0);
  const c01 = coin(x0, y1);
  const c11 = coin(x1, y1);
  if (!c00 && !c10 && !c01 && !c11) return undefined;
  const p00 = c00 ?? c10 ?? c01 ?? c11!;
  const melange = [0, 1, 2].map((k) => {
    const h0 = (c00 ?? p00)[k] * (1 - ax) + (c10 ?? p00)[k] * ax;
    const h1 = (c01 ?? p00)[k] * (1 - ax) + (c11 ?? p00)[k] * ax;
    return h0 * (1 - ay) + h1 * ay;
  }) as [number, number, number];
  return hexDe(melange);
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

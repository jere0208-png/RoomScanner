/**
 * LA VIGNETTE D'UN MEUBLE, TELLE QU'ON LE VERRA EN 3D.
 *
 * Relevé du patron : « change l'affichage des icônes des meubles lors du
 * choix par ce que l'on voit réellement dans le plan 3D ». Le catalogue
 * montrait le symbole du meuble vu de dessus — celui du plan d'architecte —,
 * et l'on choisissait un canapé sur un rectangle à coussins. La vignette est
 * maintenant LE MÊME MODÈLE que la maquette (`fabriquer`), vu de trois
 * quarts et éclairé : on choisit ce qu'on va voir.
 *
 * UNE IMAGE, PAS DES TRACÉS. Un premier essai dessinait chaque triangle en
 * SVG, triés « à la manière du peintre » : mille tracés pour un lit, un
 * plateau de table entaillé par sa tablette, des liserés entre les morceaux.
 * La vignette se calcule donc comme le ferait une carte graphique — chaque
 * pixel garde ce qui est le plus près de l'œil (tampon de profondeur), les
 * teintes se lissent d'un sommet à l'autre — sur une image deux fois plus
 * fine, ramenée ensuite à sa taille (les bords s'adoucissent), et rendue en
 * PNG. Une image par meuble, calculée une fois.
 */
import { fabriquer, graineDe, PAR_SOMMET } from './modeles3d';

/** Le meuble à dessiner : ce que le catalogue en sait. */
export interface MeubleAVoir {
  key: string;
  category: string;
  w: number;
  d: number;
  h: number;
  teinte?: string;
}

/** Les deux angles du trois-quarts : un peu de face, un peu de dessus. */
const LACET = (-32 * Math.PI) / 180;
const TANGAGE = (24 * Math.PI) / 180;
/** La lumière, dans le repère de la vue : de haut, de gauche, de face. */
const LUMIERE = (() => {
  const l = [-0.45, 0.8, -0.4];
  const n = Math.hypot(l[0], l[1], l[2]);
  return l.map((v) => v / n);
})();
/** L'ombre la plus profonde : une face dans le dos de la lumière. */
const AMBIANTE = 0.58;
/** Le verre se laisse traverser. */
const OPACITE_VERRE = 0.45;

const rgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return [200, 200, 200];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

// ------------------------------------------------------------ l'image

export interface ImageRGBA {
  largeur: number;
  hauteur: number;
  /** Quatre octets par pixel, ligne après ligne. */
  pixels: Uint8Array;
}

/**
 * L'image du meuble, `largeur` × `hauteur` pixels, fond transparent, avec
 * une marge. Calculée `sur` fois plus fine, puis ramenée.
 */
export function rendreLeMeuble(m: MeubleAVoir, largeur: number, hauteur: number, marge = 6, sur = 2): ImageRGBA {
  const modele = fabriquer(
    m.category,
    { W: m.w, D: m.d, H: m.h },
    { modele: m.key, teinte: m.teinte, attributs: [], hasard: graineDe(m.key) },
  );
  const cy = Math.cos(LACET);
  const sy = Math.sin(LACET);
  const cp = Math.cos(TANGAGE);
  const sp = Math.sin(TANGAGE);

  // Les sommets dans le repère de la vue, et leur teinte éclairée.
  type Sommet = { x: number; u: number; p: number; r: number; g: number; b: number };
  type Tri = [Sommet, Sommet, Sommet];
  const opaques: Tri[] = [];
  const verres: Tri[] = [];
  let x0 = Infinity;
  let x1 = -Infinity;
  let u0 = Infinity;
  let u1 = -Infinity;
  for (const g of modele.groupes) {
    if (g.i.length === 0) continue;
    const [cr, cg, cb] = rgb(g.couleur);
    const propre = g.mat === 'lumiere';
    const verre = g.mat === 'verre' || g.mat === 'vitrage';
    const sommets: Sommet[] = [];
    for (let k = 0; k < g.v.length; k += PAR_SOMMET) {
      const x = g.v[k];
      const y = g.v[k + 1];
      const z = g.v[k + 2];
      const xv = x * cy + z * sy;
      const zv = -x * sy + z * cy;
      const nx = g.v[k + 3];
      const ny = g.v[k + 4];
      const nz = g.v[k + 5];
      const nxv = nx * cy + nz * sy;
      const nzv = -nx * sy + nz * cy;
      const n = [nxv, ny * cp + nzv * sp, nzv * cp - ny * sp];
      const lambert = Math.max(0, n[0] * LUMIERE[0] + n[1] * LUMIERE[1] + n[2] * LUMIERE[2]);
      const f = propre ? 1 : AMBIANTE + (1 - AMBIANTE) * lambert;
      const s: Sommet = { x: xv, u: y * cp + zv * sp, p: zv * cp - y * sp, r: cr * f, g: cg * f, b: cb * f };
      sommets.push(s);
      if (s.x < x0) x0 = s.x;
      if (s.x > x1) x1 = s.x;
      if (s.u < u0) u0 = s.u;
      if (s.u > u1) u1 = s.u;
    }
    for (let t = 0; t + 2 < g.i.length; t += 3) {
      const A = sommets[g.i[t]];
      const B = sommets[g.i[t + 1]];
      const C = sommets[g.i[t + 2]];
      if (!A || !B || !C) continue;
      (verre ? verres : opaques).push([A, B, C]);
    }
  }

  const L = largeur * sur;
  const H = hauteur * sur;
  const couleur = new Float32Array(L * H * 3);
  const couvert = new Uint8Array(L * H);
  const profondeur = new Float32Array(L * H).fill(Infinity);
  if (opaques.length + verres.length > 0 && isFinite(x0)) {
    const k = Math.min((L - 2 * marge * sur) / Math.max(1e-6, x1 - x0), (H - 2 * marge * sur) / Math.max(1e-6, u1 - u0));
    const ox = (L - (x1 - x0) * k) / 2 - x0 * k;
    const oy = (H + (u1 - u0) * k) / 2 + u0 * k;
    const dessiner = (tri: Tri, transparent: boolean) => {
      const P = tri.map((s) => ({ X: ox + s.x * k, Y: oy - s.u * k, s }));
      const [a, b, c] = P;
      const aire = (b.X - a.X) * (c.Y - a.Y) - (c.X - a.X) * (b.Y - a.Y);
      if (Math.abs(aire) < 1e-9) return;
      const minX = Math.max(0, Math.floor(Math.min(a.X, b.X, c.X)));
      const maxX = Math.min(L - 1, Math.ceil(Math.max(a.X, b.X, c.X)));
      const minY = Math.max(0, Math.floor(Math.min(a.Y, b.Y, c.Y)));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(a.Y, b.Y, c.Y)));
      for (let py = minY; py <= maxY; py++) {
        const Y = py + 0.5;
        for (let px = minX; px <= maxX; px++) {
          const X = px + 0.5;
          const w0 = ((b.X - X) * (c.Y - Y) - (c.X - X) * (b.Y - Y)) / aire;
          const w1 = ((c.X - X) * (a.Y - Y) - (a.X - X) * (c.Y - Y)) / aire;
          const w2 = 1 - w0 - w1;
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
          const z = w0 * a.s.p + w1 * b.s.p + w2 * c.s.p;
          const i = py * L + px;
          if (z >= profondeur[i] - 1e-5) continue;
          const r = w0 * a.s.r + w1 * b.s.r + w2 * c.s.r;
          const g = w0 * a.s.g + w1 * b.s.g + w2 * c.s.g;
          const bl = w0 * a.s.b + w1 * b.s.b + w2 * c.s.b;
          if (transparent) {
            // Le verre teinte ce qui est derrière lui, sans le cacher.
            if (couvert[i]) {
              couleur[i * 3] = couleur[i * 3] * (1 - OPACITE_VERRE) + r * OPACITE_VERRE;
              couleur[i * 3 + 1] = couleur[i * 3 + 1] * (1 - OPACITE_VERRE) + g * OPACITE_VERRE;
              couleur[i * 3 + 2] = couleur[i * 3 + 2] * (1 - OPACITE_VERRE) + bl * OPACITE_VERRE;
            } else {
              couleur[i * 3] = r;
              couleur[i * 3 + 1] = g;
              couleur[i * 3 + 2] = bl;
              couvert[i] = 2;
            }
            continue;
          }
          profondeur[i] = z;
          couleur[i * 3] = r;
          couleur[i * 3 + 1] = g;
          couleur[i * 3 + 2] = bl;
          couvert[i] = 1;
        }
      }
    };
    for (const t of opaques) dessiner(t, false);
    // Le verre après le reste, du plus loin au plus proche.
    verres.sort((s, t) => (t[0].p + t[1].p + t[2].p) - (s[0].p + s[1].p + s[2].p));
    for (const t of verres) dessiner(t, true);
  }

  // Ramené à sa taille : chaque pixel est la moyenne de son carré de `sur`².
  const pixels = new Uint8Array(largeur * hauteur * 4);
  const n = sur * sur;
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < sur; dy++) {
        for (let dx = 0; dx < sur; dx++) {
          const i = (y * sur + dy) * L + (x * sur + dx);
          if (!couvert[i]) continue;
          const alpha = couvert[i] === 2 ? OPACITE_VERRE : 1;
          r += couleur[i * 3] * alpha;
          g += couleur[i * 3 + 1] * alpha;
          b += couleur[i * 3 + 2] * alpha;
          a += alpha;
        }
      }
      const o = (y * largeur + x) * 4;
      if (a > 0) {
        pixels[o] = Math.min(255, Math.round(r / a));
        pixels[o + 1] = Math.min(255, Math.round(g / a));
        pixels[o + 2] = Math.min(255, Math.round(b / a));
        pixels[o + 3] = Math.min(255, Math.round((a / n) * 255));
      }
    }
  }
  return { largeur, hauteur, pixels };
}

// ------------------------------------------------------------ le PNG

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(octets: Uint8Array, debut: number, fin: number): number {
  let c = 0xffffffff;
  for (let i = debut; i < fin; i++) c = CRC[(c ^ octets[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Un PNG sans compression : des blocs « stockés » de zlib. L'image est
 * petite, et un compresseur n'apporterait qu'une dépendance de plus.
 */
export function encoderPng(img: ImageRGBA): Uint8Array {
  const { largeur, hauteur, pixels } = img;
  const ligne = largeur * 4 + 1;
  const brut = new Uint8Array(ligne * hauteur);
  for (let y = 0; y < hauteur; y++) {
    brut[y * ligne] = 0;
    brut.set(pixels.subarray(y * largeur * 4, (y + 1) * largeur * 4), y * ligne + 1);
  }
  const blocs = Math.max(1, Math.ceil(brut.length / 65535));
  const zlib = new Uint8Array(2 + blocs * 5 + brut.length + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  let o = 2;
  for (let b = 0; b < blocs; b++) {
    const debut = b * 65535;
    const taille = Math.min(65535, brut.length - debut);
    zlib[o++] = b === blocs - 1 ? 1 : 0;
    zlib[o++] = taille & 255;
    zlib[o++] = taille >>> 8;
    zlib[o++] = ~taille & 255;
    zlib[o++] = (~taille >>> 8) & 255;
    zlib.set(brut.subarray(debut, debut + taille), o);
    o += taille;
  }
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < brut.length; i++) {
    s1 = (s1 + brut[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  const adler = ((s2 << 16) | s1) >>> 0;
  zlib[o++] = adler >>> 24;
  zlib[o++] = (adler >>> 16) & 255;
  zlib[o++] = (adler >>> 8) & 255;
  zlib[o++] = adler & 255;

  const morceaux: { type: string; donnees: Uint8Array }[] = [];
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, largeur);
  dv.setUint32(4, hauteur);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 6; // RGBA
  morceaux.push({ type: 'IHDR', donnees: ihdr });
  morceaux.push({ type: 'IDAT', donnees: zlib });
  morceaux.push({ type: 'IEND', donnees: new Uint8Array(0) });
  const total = 8 + morceaux.reduce((t, m) => t + 12 + m.donnees.length, 0);
  const out = new Uint8Array(total);
  out.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  let p = 8;
  for (const m of morceaux) {
    const n = m.donnees.length;
    out[p] = n >>> 24;
    out[p + 1] = (n >>> 16) & 255;
    out[p + 2] = (n >>> 8) & 255;
    out[p + 3] = n & 255;
    for (let i = 0; i < 4; i++) out[p + 4 + i] = m.type.charCodeAt(i);
    out.set(m.donnees, p + 8);
    const c = crc32(out, p + 4, p + 8 + n);
    out[p + 8 + n] = c >>> 24;
    out[p + 9 + n] = (c >>> 16) & 255;
    out[p + 10 + n] = (c >>> 8) & 255;
    out[p + 11 + n] = c & 255;
    p += 12 + n;
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64(octets: Uint8Array): string {
  let out = '';
  for (let i = 0; i < octets.length; i += 3) {
    const a = octets[i];
    const b = i + 1 < octets.length ? octets[i + 1] : 0;
    const c = i + 2 < octets.length ? octets[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < octets.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < octets.length ? B64[c & 63] : '=';
  }
  return out;
}

const CACHE = new Map<string, string>();
const cleDe = (m: MeubleAVoir, largeur: number, hauteur: number) =>
  `${m.key}|${m.category}|${m.w}|${m.d}|${m.h}|${m.teinte ?? ''}|${largeur}|${hauteur}`;

/** La vignette si elle est déjà calculée — sans rien calculer. */
export function vignetteEnCache(m: MeubleAVoir, largeur: number, hauteur: number): string | null {
  return CACHE.get(cleDe(m, largeur, hauteur)) ?? null;
}

/**
 * La vignette en adresse d'image (`data:image/png;base64,…`), calculée une
 * fois par meuble et par taille.
 */
export function vignetteDuMeuble(m: MeubleAVoir, largeur: number, hauteur: number): string {
  const cle = cleDe(m, largeur, hauteur);
  const deja = CACHE.get(cle);
  if (deja) return deja;
  const uri = `data:image/png;base64,${base64(encoderPng(rendreLeMeuble(m, largeur, hauteur)))}`;
  if (CACHE.size > 300) CACHE.clear();
  CACHE.set(cle, uri);
  return uri;
}

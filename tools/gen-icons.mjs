// Génère les icônes EchoPlan (iOS + Android) sans aucune dépendance :
// rendu par champs de distance (anticrénelage 2×2) + encodeur PNG maison
// (zlib natif de Node). Relancer : node tools/gen-icons.mjs
import { deflateSync } from 'zlib';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- PNG
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = ~0;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
function chunk(type, data) {
  const head = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(head.length + 8);
  out.writeUInt32BE(data.length, 0);
  head.copy(out, 4);
  out.writeUInt32BE(crc32(head), head.length + 4);
  return out;
}
function encodePNG(size, rgba, withAlpha) {
  const bpp = withAlpha ? 4 : 3;
  const raw = Buffer.alloc(size * (size * bpp + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * bpp + 1);
    raw[row] = 0; // filtre "None"
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 4;
      const d = row + 1 + x * bpp;
      raw[d] = rgba[s];
      raw[d + 1] = rgba[s + 1];
      raw[d + 2] = rgba[s + 2];
      if (withAlpha) raw[d + 3] = rgba[s + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = withAlpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------- géométrie (SDF)
const rad = (d) => (d * Math.PI) / 180;
const distSeg = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
};
// couverture 0..1 ; `aa` = largeur d'un pixel en unités glyphe (anticrénelage)
const cov = (d, aa) => Math.max(0, Math.min(1, 0.5 - d / aa));

// Glyphe dans le repère 76×76 du logo (mêmes tracés que l'app).
// Boîte du glyphe (traits compris) : x 22,5–55,5 · y 20,5–53,5 → centre (39, 37).
// On le recentre sur (38, 38) et on l'agrandit : marges égales sur les 4 côtés.
const ZOOM = 1.45, CX = 39, CY = 37;
// Centre d'émission des ondes (le point n'est plus dessiné).
const DOT = { x: 25, y: 51 };
// Balayage symétrique autour de la diagonale (-45°) : le radar vise l'angle.
const ARCS = [
  { r: 11, w: 4.5, a0: -85, a1: -5, o: 0.7 },
  { r: 19, w: 4.5, a0: -85, a1: -5, o: 0.9 },
];
const CORNER = { pts: [[25, 23], [53, 23], [53, 51]], w: 5 };

function glyphAlpha(gx, gy, aa) {
  // dé-zoom : on échantillonne le glyphe d'origine
  // dé-zoom autour du centre de l'icône (38,38), recalé sur le centre du glyphe
  const x = (gx - 38) / ZOOM + CX;
  const y = (gy - 38) / ZOOM + CY;
  let a = 0;
  for (const arc of ARCS) {
    const dx = x - DOT.x, dy = y - DOT.y;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const hw = arc.w / 2;
    let d;
    if (ang >= arc.a0 && ang <= arc.a1) {
      d = Math.abs(Math.hypot(dx, dy) - arc.r) - hw;
    } else {
      const e0 = [DOT.x + arc.r * Math.cos(rad(arc.a0)), DOT.y + arc.r * Math.sin(rad(arc.a0))];
      const e1 = [DOT.x + arc.r * Math.cos(rad(arc.a1)), DOT.y + arc.r * Math.sin(rad(arc.a1))];
      d = Math.min(Math.hypot(x - e0[0], y - e0[1]), Math.hypot(x - e1[0], y - e1[1])) - hw;
    }
    a = Math.max(a, cov(d, aa) * arc.o);
  }
  const hw = CORNER.w / 2;
  for (let i = 0; i < CORNER.pts.length - 1; i++) {
    const [ax, ay] = CORNER.pts[i];
    const [bx, by] = CORNER.pts[i + 1];
    a = Math.max(a, cov(distSeg(x, y, ax, ay, bx, by) - hw, aa));
  }
  return a;
}

// Fond blanc (léger dégradé vers gris très clair), glyphe noir.
const TOP = [0xff, 0xff, 0xff];
const BOT = [0xf1, 0xf3, 0xf6];
const INK = [0x0b, 0x0d, 0x12];

/**
 * LE LISERÉ DU BORD — ce qui pose l'icône sur le fond d'écran.
 *
 * Sans lui, une icône claire n'a pas de bord : elle se termine là où le
 * système la découpe, et sur un fond d'écran clair elle se dilue. Les icônes
 * du système en portent toutes un — c'est ce trait, et non l'ombre portée,
 * qui donne le contour net qu'on voit sur l'écran d'accueil.
 *
 * Il est peint DANS l'image, pas ajouté par-dessus : iOS refuse la
 * transparence sur une icône d'application, et découpe lui-même le carré au
 * squircle. Le trait suit donc cette découpe, débordant légèrement au-delà
 * (`DEBORD`) : ce qui dépasse est rogné, et il ne peut pas rester un filet
 * de fond entre le liseré et le bord si notre forme et celle du système
 * diffèrent d'un cheveu.
 *
 * Plus dense en bas qu'en haut : la lumière vient du haut, comme le dégradé
 * du fond. Un liseré d'épaisseur et de teinte constantes fait cadre — c'est
 * la différence entre un bord et un encadrement.
 *
 * IL DOIT SE VOIR. Un premier essai l'avait posé en gris clair, par crainte
 * d'alourdir : sur un fond blanc, un gris clair sur du blanc ne se voit pas,
 * et le relevé du chantier a été net — « on ne voit pas le liseré ». Le
 * contraste d'une icône SOMBRE cernée de clair (Gemini, TikTok) ne se
 * transpose pas tel quel sur une icône claire : il faut l'inverser, et
 * franchement.
 */
/*
  LE BORD EST SOMBRE PARTOUT, ET LA LUMIÈRE PASSE DERRIÈRE LUI.

  Deuxième version, relevé du patron : « refais le liseré contour du logo de
  l'application, qui match avec un thème noir comme blanc, mais différent de
  celui-là, un peu comme Gemini ».

  La première allait du BLANC au sommet à l'ardoise au pied, en suivant la
  lumière — le raisonnement était que le haut clair détacherait l'icône d'un
  fond noir et le bas sombre d'un fond blanc. Sauf qu'une icône CLAIRE se
  détache déjà toute seule d'un fond noir : son corps est blanc. Ce que le
  haut clair produisait, sur un fond d'écran blanc, c'était un bord absent —
  blanc sur blanc — et une icône qui paraît coupée en biais.

  Le liseré de Gemini est un corps SOMBRE cerné d'un fil CLAIR. Transposé
  sur une icône claire, c'est l'inverse qu'il faut : un fil sombre tout
  autour. Il ne change plus de nature avec la hauteur — seulement
  d'intensité, du gris ardoise au sommet au presque-noir au pied, comme une
  arête qui s'enfonce dans l'ombre.

  Et la lumière du haut ne disparaît pas pour autant : elle passe DERRIÈRE
  le fil, en un second liseré blanc à l'intérieur, qui s'éteint à
  mi-hauteur. C'est lui qui donne le relief — le bord posé sous une lumière
  zénithale — pendant que le fil sombre, lui, fait le travail de séparation
  sur tous les fonds d'écran.
*/
const BORD_HAUT = [0x5a, 0x64, 0x74];
const BORD_FLANC = [0x3a, 0x43, 0x51];
const BORD_BAS = [0x14, 0x19, 0x21];
/** Épaisseur vers l'intérieur, et débord rogné, en fraction du côté. */
const TRAIT = 0.019;
const DEBORD = 0.006;
/**
 * LE REFLET INTÉRIEUR — juste derrière le fil sombre.
 *
 * Il ne sert pas à séparer l'icône du fond : c'est le fil sombre qui s'en
 * charge. Il sert à dire que le bord a une épaisseur, et qu'il est éclairé
 * d'en haut. Il s'éteint donc avant la mi-hauteur : un reflet qui ferait le
 * tour complet serait un cadre, pas une lumière.
 */
const REFLET = 0.013;
const REFLET_FORCE = 0.8;
const REFLET_FIN = 0.55;

/**
 * DISTANCE AU BORD DE LA DÉCOUPE, en pixels, négative à l'intérieur.
 *
 * Le squircle d'iOS n'est pas un carré à coins ronds : ses coins n'ont pas
 * de rayon constant, la courbure y entre progressivement. Une superellipse
 * d'ordre 5 en est l'approximation d'usage. Elle ne donne pas directement
 * une distance — seulement un « dedans / dehors » —, alors on la divise par
 * la pente du champ : près du bord, c'est la distance au premier ordre, et
 * c'est tout ce qu'il faut pour un trait d'un pixel. Sans cette division, le
 * trait s'épaissirait dans les coins.
 */
function distBord(fx, fy, size, mask) {
  const R = size / 2;
  const x = fx - R;
  const y = fy - R;
  if (mask === 'circle') return Math.hypot(x, y) - R;
  if (mask === 'round') {
    const cr = size * 0.18;
    const qx = Math.abs(x) - (R - cr);
    const qy = Math.abs(y) - (R - cr);
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - cr;
  }
  const n = 5;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const somme = Math.pow(ax, n) + Math.pow(ay, n);
  if (somme === 0) return -R;
  const rayon = Math.pow(somme, 1 / n);
  // Pente du champ (|∇f|) : elle vaut 1 sur les côtés droits et tombe dans
  // les coins, ce qui y étirerait le trait.
  const pente =
    Math.hypot(Math.pow(ax, n - 1), Math.pow(ay, n - 1)) * Math.pow(somme, 1 / n - 1);
  return (rayon - R) / Math.max(pente, 1e-6);
}

/**
 * mask : 'none'     → plein cadre opaque (iOS, le système arrondit lui-même)
 *        'round'    → carré arrondi avec alpha (Android classique)
 *        'circle'   → rond avec alpha (Android "round")
 *        'squircle' → la découpe d'iOS, cuite avec alpha — pour l'écran de
 *                     lancement, où AUCUN système ne viendra la faire : une
 *                     UIImageView affiche le carré tel quel.
 */
function render(size, mask) {
  const rgba = Buffer.alloc(size * size * 4);
  const S = 76 / size;
  const cr = size * 0.18; // rayon du carré arrondi Android
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const fx = px + ox, fy = py + oy;
        // masque de forme (en pixels)
        let shape = 1;
        if (mask === 'circle') {
          shape = Math.max(0, Math.min(1, size / 2 - Math.hypot(fx - size / 2, fy - size / 2) + 0.5));
        } else if (mask === 'round') {
          const qx = Math.abs(fx - size / 2) - (size / 2 - cr);
          const qy = Math.abs(fy - size / 2) - (size / 2 - cr);
          const d = Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - cr;
          shape = Math.max(0, Math.min(1, -d + 0.5));
        } else if (mask === 'squircle') {
          // La même superellipse d'ordre 5 que le liseré : la découpe et le
          // trait qui la longe sortent du même champ, donc ne divergent pas.
          shape = Math.max(0, Math.min(1, -distBord(fx, fy, size, 'squircle') + 0.5));
        }
        if (shape <= 0) continue;
        const gx = fx * S, gy = fy * S;
        const t = gy / 76;
        let cr_ = TOP[0] + (BOT[0] - TOP[0]) * t;
        let cg_ = TOP[1] + (BOT[1] - TOP[1]) * t;
        let cb_ = TOP[2] + (BOT[2] - TOP[2]) * t;
        const w = glyphAlpha(gx, gy, Math.max(S, 0.08));
        cr_ = cr_ + (INK[0] - cr_) * w;
        cg_ = cg_ + (INK[1] - cg_) * w;
        cb_ = cb_ + (INK[2] - cb_) * w;
        // Le liseré passe DEVANT le glyphe : il borde l'icône, et rien ne
        // vient s'appuyer dessus par en dessous.
        const db = distBord(fx, fy, size, mask);
        const trait = size * TRAIT;
        const bande = Math.min(
          Math.max(0, Math.min(1, (size * DEBORD - db) / 1)),
          Math.max(0, Math.min(1, (db + trait) / 1)),
        );
        /*
          LE REFLET SE PEINT AVANT LE FIL : il est DERRIÈRE lui, à
          l'intérieur. Peint après, il mordrait sur le fil et le bord
          s'éclaircirait justement là où il doit être net.
        */
        const reflet = size * REFLET;
        const halo = Math.min(
          Math.max(0, Math.min(1, (-db - trait) / 1)),
          Math.max(0, Math.min(1, (db + trait + reflet) / 1)),
        );
        if (halo > 0) {
          // Il s'éteint en descendant : la lumière vient du haut.
          const force =
            REFLET_FORCE * Math.max(0, 1 - fy / size / REFLET_FIN) * halo;
          cr_ = cr_ + (0xff - cr_) * force;
          cg_ = cg_ + (0xff - cg_) * force;
          cb_ = cb_ + (0xff - cb_) * force;
        }
        if (bande > 0) {
          // Le fil ne change plus de nature avec la hauteur, seulement
          // d'intensité : ardoise au sommet, presque noir au pied — une
          // arête qui s'enfonce dans l'ombre.
          const u = fy / size;
          const [c0, c1, t] =
            u < 0.5
              ? [BORD_HAUT, BORD_FLANC, u / 0.5]
              : [BORD_FLANC, BORD_BAS, (u - 0.5) / 0.5];
          cr_ = cr_ + (c0[0] + (c1[0] - c0[0]) * t - cr_) * bande;
          cg_ = cg_ + (c0[1] + (c1[1] - c0[1]) * t - cg_) * bande;
          cb_ = cb_ + (c0[2] + (c1[2] - c0[2]) * t - cb_) * bande;
        }
        r += cr_ * shape;
        g += cg_ * shape;
        b += cb_ * shape;
        a += shape;
      }
      const i = (py * size + px) * 4;
      const alpha = a / 4;
      rgba[i] = Math.round(alpha > 0 ? r / a : 0);
      rgba[i + 1] = Math.round(alpha > 0 ? g / a : 0);
      rgba[i + 2] = Math.round(alpha > 0 ? b / a : 0);
      rgba[i + 3] = Math.round(alpha * 255);
    }
  }
  return rgba;
}

// ------------------------------------------------------------------ iOS
const iosDir = join(ROOT, 'ios/RoomScanner/Images.xcassets/AppIcon.appiconset');
const iosSizes = [
  ['20x20', '2x', 40], ['20x20', '3x', 60],
  ['29x29', '2x', 58], ['29x29', '3x', 87],
  ['40x40', '2x', 80], ['40x40', '3x', 120],
  ['60x60', '2x', 120], ['60x60', '3x', 180],
  ['1024x1024', '1x', 1024],
];
const done = new Set();
for (const [, , px] of iosSizes) {
  if (done.has(px)) continue;
  done.add(px);
  writeFileSync(join(iosDir, `icon-${px}.png`), encodePNG(px, render(px, 'none'), false));
  console.log(`iOS icon-${px}.png`);
}
const contents = {
  images: iosSizes.map(([size, scale, px]) => ({
    idiom: size === '1024x1024' ? 'ios-marketing' : 'iphone',
    scale,
    size,
    filename: `icon-${px}.png`,
  })),
  info: { author: 'xcode', version: 1 },
};
writeFileSync(join(iosDir, 'Contents.json'), JSON.stringify(contents, null, 2));

// ---------------------------------------------------- écran de lancement
/*
  L'ICÔNE DE L'APP, EN GRAND, AU CENTRE — et rien d'autre.

  L'écran de lancement portait le logo composé (glyphe + mot) : le lancement
  est pourtant le moment où l'on vient d'APPUYER sur l'icône, et la
  retrouver seule au centre fait une continuité — le mot, lui, vit sur
  l'accueil. L'image est DÉRIVÉE du même rendu que l'icône : même glyphe,
  même liseré, et la découpe squircle est cuite ici avec son alpha,
  puisqu'une UIImageView n'arrondit rien.
*/
const launchDir = join(ROOT, 'ios/RoomScanner/Images.xcassets/LaunchIcon.imageset');
mkdirSync(launchDir, { recursive: true });
const LAUNCH_PT = 180;
for (const scale of [1, 2, 3]) {
  const px = LAUNCH_PT * scale;
  const suffix = scale === 1 ? '' : `@${scale}x`;
  writeFileSync(
    join(launchDir, `LaunchIcon${suffix}.png`),
    encodePNG(px, render(px, 'squircle'), true),
  );
  console.log(`iOS LaunchIcon${suffix}.png (${px}px)`);
}
writeFileSync(
  join(launchDir, 'Contents.json'),
  JSON.stringify(
    {
      images: [1, 2, 3].map((s) => ({
        idiom: 'universal',
        scale: `${s}x`,
        filename: `LaunchIcon${s === 1 ? '' : `@${s}x`}.png`,
      })),
      info: { author: 'xcode', version: 1 },
    },
    null,
    2,
  ),
);

// -------------------------------------------------------------- Android
const densities = [
  ['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192],
];
for (const [name, px] of densities) {
  const dir = join(ROOT, `android/app/src/main/res/mipmap-${name}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'ic_launcher.png'), encodePNG(px, render(px, 'round'), true));
  writeFileSync(join(dir, 'ic_launcher_round.png'), encodePNG(px, render(px, 'circle'), true));
  console.log(`Android ${name} (${px}px)`);
}
console.log('Icônes générées.');

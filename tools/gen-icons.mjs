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
 * mask : 'none'  → plein cadre opaque (iOS, le système arrondit lui-même)
 *        'round' → carré arrondi avec alpha (Android classique)
 *        'circle'→ rond avec alpha (Android "round")
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

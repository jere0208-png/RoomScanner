/**
 * Rend en SVG les feuilles d'un PDF EchoPlan, pour les REGARDER hors ligne.
 *
 *   node tools/pdf-vers-svg.mjs <fichier.pdf> <dossier-de-sortie>
 *
 * Ghostscript n'est pas installé sur la machine de développement, et les
 * relectures « au flux » ne voient pas ce qui saute aux yeux sur l'image —
 * c'est ainsi qu'ont été trouvés le chiffre de conducteurs recouvert par sa
 * pastille et les cotes de perspective tranchées par la maçonnerie. Nos PDF
 * sortent de la classe `Draw` (src/export/pdf.ts), qui n'émet qu'un petit
 * jeu d'opérateurs non compressés : ce script les interprète, et ImageMagick
 * fait le reste (`magick feuille.svg feuille.png`).
 *
 * CE RENDU MENT SUR LES ESPACES — piège payé une fois, noté ici.
 *
 * Le PDF pose chaque chaîne à une position ; ce script les rend en `<text>`
 * SVG et laisse le moteur composer. Les espaces se resserrent, et « NF C
 * 15-100 » se lit « NFC15-100 » sur l'image. On a failli « corriger » une
 * faute qui n'existait pas : le code écrivait la norme correctement depuis
 * le début.
 *
 * DONC : ce qu'on voit ici vaut pour les POSITIONS, les TAILLES et les
 * CHEVAUCHEMENTS — c'est pour ça qu'il existe, et il a trouvé un plan trop
 * petit, des pastilles perçant un mur, une note en travers d'un cartouche et
 * un battant qui faisait le tour de la pièce. Pour un LIBELLÉ, on retourne
 * au flux : `grep -a` dans le PDF dit la vérité.
 *
 * Trois pièges du flux, tous payés une fois : les points d'un chemin vont
 * par PAIRES (x y), l'axe y du PDF est inversé (y' = 842 − y), et les
 * accents sont des octets Windows-1252 bruts dans les chaînes `(…) Tj`.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const PAGE_W = 595;
const PAGE_H = 842;

const CP1252 = {
  0x85: '…', 0x91: '‘', 0x92: '’', 0x96: '–', 0x97: '—', 0xb0: '°', 0xb2: '²',
};
const unByte = (b) => CP1252[b] ?? String.fromCharCode(b);

function decodeText(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\') {
      out += unByte(s.charCodeAt(i));
      continue;
    }
    const n = s[i + 1];
    if (n === '\\' || n === '(' || n === ')') {
      out += n;
      i += 1;
    } else if (/[0-7]/.test(n)) {
      const oct = s.slice(i + 1).match(/^[0-7]{1,3}/)[0];
      out += unByte(parseInt(oct, 8));
      i += oct.length;
    }
  }
  return out;
}

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');

function streamToSvg(stream) {
  const parts = [];
  let stroke = '#000000';
  let fill = '#000000';
  let width = 1;
  let dash = '';
  let alpha = 1;
  let fontSize = 10;
  let bold = false;
  // L'état sauvé par `q` : profondeur de groupes SVG ouverts, tireté, alpha.
  const stack = [];
  let open = { groups: 0, dash: '', alpha: 1 };
  let clipId = 0;
  let lastRect = null;
  let pendingClip = false;
  let tm = [1, 0, 0, 1, 0, 0];
  let cm = null;

  const Y = (y) => PAGE_H - y;
  const operands = [];
  const tokens =
    stream.match(/\((?:[^()\\]|\\.)*\)|\[[^\]]*\]|\/[A-Za-z0-9]+|[-.\d]+|[A-Za-z'"*]+/g) ??
    [];
  const flushPath = (op) => {
    const pts = [];
    for (let i = 0; i + 1 < operands.length + 1; i += 2) {
      const x = parseFloat(operands[i]);
      const y = parseFloat(operands[i + 1]);
      if (Number.isNaN(x) || Number.isNaN(y)) break;
      pts.push(`${x},${Y(y)}`);
    }
    if (pts.length < 2) return;
    const closed = op !== 'S';
    const strokeIt = op !== 'f';
    const fillIt = op === 'f' || op === 'b';
    const attrs =
      (alpha < 1 ? ` opacity="${alpha}"` : '') +
      ` fill="${fillIt ? fill : 'none'}"` +
      (strokeIt
        ? ` stroke="${stroke}" stroke-width="${width}"` +
          (dash ? ` stroke-dasharray="${dash}"` : '') +
          ' stroke-linecap="round" stroke-linejoin="round"'
        : '');
    parts.push(
      closed
        ? `<polygon points="${pts.join(' ')}"${attrs}/>`
        : `<polyline points="${pts.join(' ')}"${attrs}/>`,
    );
  };

  for (const t of tokens) {
    switch (t) {
      case 'RG':
        stroke = `#${toHex(+operands.at(-3))}${toHex(+operands.at(-2))}${toHex(+operands.at(-1))}`;
        operands.length = 0;
        break;
      case 'rg':
        fill = `#${toHex(+operands.at(-3))}${toHex(+operands.at(-2))}${toHex(+operands.at(-1))}`;
        operands.length = 0;
        break;
      case 'w':
        width = +operands.at(-1);
        operands.length = 0;
        break;
      case 'd': {
        const inside = (operands.at(-2) ?? '[]').replace(/[[\]]/g, '').trim();
        dash = inside ? inside.split(/\s+/).join(' ') : '';
        operands.length = 0;
        break;
      }
      case 'gs': {
        const ga = /^\/GA(\d)$/.exec(operands.at(-1) ?? '');
        if (ga) alpha = Number(ga[1]) / 10;
        operands.length = 0;
        break;
      }
      case 'J':
      case 'j':
        operands.length = 0;
        break;
      case 'm':
      case 'l':
        break;
      case 'S':
      case 's':
      case 'f':
      case 'b':
        flushPath(t);
        operands.length = 0;
        break;
      case 're':
        lastRect = operands.slice(-4).map(Number);
        operands.length = 0;
        break;
      case 'W':
        pendingClip = true;
        break;
      case 'n':
        if (pendingClip && lastRect) {
          clipId += 1;
          const [x, y, w2, h2] = lastRect;
          parts.push(
            `<clipPath id="c${clipId}"><rect x="${x}" y="${Y(y + h2)}" width="${w2}" height="${h2}"/></clipPath>` +
              `<g clip-path="url(#c${clipId})">`,
          );
          open.groups += 1;
          pendingClip = false;
        }
        operands.length = 0;
        break;
      case 'q':
        stack.push(open);
        open = { groups: 0, dash, alpha };
        operands.length = 0;
        break;
      case 'Q':
        for (let k = 0; k < open.groups; k++) parts.push('</g>');
        dash = open.dash;
        alpha = open.alpha;
        open = stack.pop() ?? { groups: 0, dash: '', alpha: 1 };
        operands.length = 0;
        break;
      case 'BT':
      case 'ET':
        operands.length = 0;
        break;
      case 'Tf':
        bold = operands.at(-2) === '/F2';
        fontSize = +operands.at(-1);
        operands.length = 0;
        break;
      case 'Tm':
        tm = operands.slice(-6).map(Number);
        operands.length = 0;
        break;
      case 'Tj': {
        const raw = operands.at(-1) ?? '()';
        const txt = decodeText(raw.slice(1, -1));
        const [a, b2, , , e, f2] = tm;
        const ang = (Math.atan2(b2, a) * 180) / Math.PI;
        const rot = ang ? ` transform="rotate(${-ang} ${e} ${Y(f2)})"` : '';
        parts.push(
          `<text x="${e}" y="${Y(f2)}" font-size="${fontSize}"` +
            ` font-family="Helvetica, Arial, sans-serif"` +
            (bold ? ' font-weight="bold"' : '') +
            ` fill="${fill}"${rot}>${esc(txt)}</text>`,
        );
        operands.length = 0;
        break;
      }
      case 'cm':
        cm = operands.slice(-6).map(Number);
        operands.length = 0;
        break;
      case 'Do': {
        if (cm) {
          const [w2, , , h2, x, y] = cm;
          parts.push(
            `<rect x="${x}" y="${Y(y + h2)}" width="${w2}" height="${h2}" fill="#DDDDDD" stroke="#999999"/>`,
          );
        }
        operands.length = 0;
        break;
      }
      default:
        operands.push(t);
    }
  }
  while (stack.length) {
    for (let k = 0; k < open.groups; k++) parts.push('</g>');
    open = stack.pop();
  }
  for (let k = 0; k < open.groups; k++) parts.push('</g>');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">\n` +
    `<rect width="${PAGE_W}" height="${PAGE_H}" fill="#FFFFFF"/>\n` +
    parts.join('\n') +
    '\n</svg>\n'
  );
}

const [fichier, dossier] = process.argv.slice(2);
if (!fichier || !dossier) {
  console.error('usage : node tools/pdf-vers-svg.mjs <fichier.pdf> <dossier>');
  process.exit(1);
}
const pdf = readFileSync(fichier, 'latin1');
mkdirSync(dossier, { recursive: true });
const nom = basename(fichier).replace(/\.pdf$/i, '');
let i = 0;
for (const m of pdf.matchAll(/<< \/Length \d+ >>\nstream\n([\s\S]*?)\nendstream/g)) {
  i += 1;
  const sortie = join(dossier, `${nom}-p${String(i).padStart(2, '0')}.svg`);
  writeFileSync(sortie, streamToSvg(m[1]), 'utf8');
  console.log(sortie);
}
if (i === 0) console.error('aucun flux de page trouvé — PDF compressé ?');

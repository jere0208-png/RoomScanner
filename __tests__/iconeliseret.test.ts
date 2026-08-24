/**
 * LE LISERÉ DE L'ICÔNE — il doit tenir sur un fond noir COMME sur un blanc.
 *
 * Relevé du patron : « refais le liseré contour du logo de l'application,
 * qui match avec un thème noir comme blanc, mais différent de celui-là, un
 * peu comme Gemini ».
 *
 * Le premier liseré passait du BLANC au sommet à l'ardoise au pied, en
 * suivant la lumière. C'est joli sur un fond d'écran sombre, et ça se
 * dissout sur un fond clair : le haut de l'icône, blanc sur blanc, n'a plus
 * de bord du tout — l'icône paraît coupée en biais. Un liseré qui change de
 * teinte doit choisir son fond d'écran.
 *
 * La règle est donc double, et elle se compte sur le fichier livré :
 *
 *   — le BORD est sombre TOUT AUTOUR, y compris en haut : c'est lui qui
 *     détache l'icône d'un fond d'écran clair ;
 *   — le CORPS reste clair : c'est lui qui la détache d'un fond noir.
 *
 * Une icône qui porte les deux extrêmes à son bord n'a pas à choisir. C'est
 * le principe du liseré de Gemini, transposé : là-bas le corps est sombre et
 * le liseré clair, ici c'est l'inverse.
 */
/*
  Le format PNG est défini en bits : filtres, canaux, entiers gros-boutistes.
  Les opérateurs de bits sont ici le vocabulaire de la norme.
*/
/* eslint-disable no-bitwise */
import { readFileSync } from 'fs';
import { inflateSync } from 'zlib';
import { join } from 'path';

const FICHIER = join(
  __dirname,
  '..',
  'ios/RoomScanner/Images.xcassets/AppIcon.appiconset/icon-1024.png',
);

interface Image {
  size: number;
  /** Luminance perçue, 0 (noir) à 1 (blanc). */
  lum: Float32Array;
}

/** Décodeur PNG minimal : 8 bits, RGB ou RGBA, non entrelacé. */
function decode(buf: Buffer): Image {
  let p = 8;
  let width = 0;
  let height = 0;
  let canaux = 3;
  const morceaux: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      canaux = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') morceaux.push(data);
    p += len + 12;
  }
  const raw = inflateSync(Buffer.concat(morceaux));
  const ligne = width * canaux;
  const px = Buffer.alloc(height * ligne);
  for (let y = 0; y < height; y++) {
    const filtre = raw[y * (ligne + 1)];
    const src = y * (ligne + 1) + 1;
    const dst = y * ligne;
    for (let i = 0; i < ligne; i++) {
      const a = i >= canaux ? px[dst + i - canaux] : 0;
      const b = y > 0 ? px[dst - ligne + i] : 0;
      const c = y > 0 && i >= canaux ? px[dst - ligne + i - canaux] : 0;
      const x = raw[src + i];
      let v = x;
      if (filtre === 1) v = x + a;
      else if (filtre === 2) v = x + b;
      else if (filtre === 3) v = x + ((a + b) >> 1);
      else if (filtre === 4) {
        const q = a + b - c;
        const pa = Math.abs(q - a);
        const pb = Math.abs(q - b);
        const pc = Math.abs(q - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      px[dst + i] = v & 0xff;
    }
  }
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const s = i * canaux;
    lum[i] = (0.299 * px[s] + 0.587 * px[s + 1] + 0.114 * px[s + 2]) / 255;
  }
  return { size: width, lum };
}

const image = decode(readFileSync(FICHIER));
const at = (fx: number, fy: number) =>
  image.lum[Math.round(fy * (image.size - 1)) * image.size + Math.round(fx * (image.size - 1))];

/**
 * LE MILIEU DE CHAQUE CÔTÉ, à un cheveu du bord.
 *
 * On ne s'approche des coins ni ne les traverse : la découpe du système
 * rogne l'icône selon SA courbe, et un pixel de coin appartient à personne.
 * Au milieu d'un côté, en revanche, le bord de la découpe est droit et sa
 * position ne fait aucun doute.
 */
const PROFONDEUR = 0.014;
const echantillons = (cote: 'haut' | 'bas' | 'gauche' | 'droite') => {
  const out: number[] = [];
  for (let k = 0; k <= 20; k++) {
    const t = 0.3 + (k / 20) * 0.4;
    if (cote === 'haut') out.push(at(t, PROFONDEUR));
    else if (cote === 'bas') out.push(at(t, 1 - PROFONDEUR));
    else if (cote === 'gauche') out.push(at(PROFONDEUR, t));
    else out.push(at(1 - PROFONDEUR, t));
  }
  return out;
};

describe('le liseré de l’icône', () => {
  /** Au-dessus de ce gris, un bord ne se distingue plus d'un fond blanc. */
  const SUR_BLANC = 0.8;

  it('borde l’icône d’un trait sombre sur ses quatre côtés', () => {
    const clairs: string[] = [];
    for (const cote of ['haut', 'bas', 'gauche', 'droite'] as const) {
      const pire = Math.max(...echantillons(cote));
      if (pire > SUR_BLANC) clairs.push(`${cote} (${pire.toFixed(2)})`);
    }
    expect(`bords qui se diluent sur un fond blanc : ${clairs.join(', ') || 'aucun'}`).toBe(
      'bords qui se diluent sur un fond blanc : aucun',
    );
  });

  it('et garde un corps clair, qui se détache d’un fond noir', () => {
    // Un point de fond, au-dessus du glyphe : ni liseré, ni tracé.
    expect(at(0.5, 0.09)).toBeGreaterThan(0.85);
  });

  /*
    LE TRAIT RESTE UN TRAIT.

    Un bord sombre qui mordrait sur un dixième de l'icône ne serait plus un
    liseré mais un cadre — et le cadre, c'est justement ce que le patron
    avait écarté à la première version.
  */
  it('sans mordre sur l’icône : à un pas du bord, on est chez soi', () => {
    expect(at(0.5, 0.055)).toBeGreaterThan(0.85);
    expect(at(0.055, 0.5)).toBeGreaterThan(0.85);
  });
});

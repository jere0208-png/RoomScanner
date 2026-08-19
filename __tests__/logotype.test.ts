/**
 * LE LOGOTYPE — il se regarde, donc il se compte.
 *
 * Le mot « EchoPlan » n'est pas composé : c'est une image détourée du fond
 * gris de l'original, par luminance. Un détourage par seuil ne garde pas que
 * les lettres — il garde tout ce qui était sombre, y compris ce qui traînait
 * au bord du scan d'origine. Deux traits de trois pixels de large ont ainsi
 * survécu dans les six fichiers livrés : un contre le « e » d'echo, l'autre
 * sous le « n » de plan. À la taille où le logo s'affiche, ils passent pour
 * de la poussière sur l'écran.
 *
 * On ne relit pas une image, on la compte : chaque tache d'encre du fichier
 * est une COMPOSANTE CONNEXE. Les lettres et les ondes en font une dizaine,
 * toutes massives ; une saleté de détourage est, par construction, minuscule
 * devant la plus petite d'entre elles. Le banc refuse donc toute composante
 * qui pèse moins d'un dixième de la plus grande — un critère qui tient même
 * si la typo est un jour redessinée, là où un nombre de taches figé
 * casserait au premier retouchage.
 */
/*
  Le format PNG est défini en bits : filtres, canaux, entiers gros-boutistes.
  Les opérateurs de bits sont ici le vocabulaire de la norme, pas une
  optimisation — la règle qui les décourage ne s'applique pas à un décodeur.
*/
/* eslint-disable no-bitwise */
import { readFileSync } from 'fs';
import { inflateSync } from 'zlib';
import { join } from 'path';

const FICHIERS = [
  'echoplan.png',
  'echoplan@2x.png',
  'echoplan@3x.png',
  'echoplan-dark.png',
  'echoplan-dark@2x.png',
  'echoplan-dark@3x.png',
];

interface Image {
  width: number;
  height: number;
  /** Canal alpha seul : c'est tout ce qui nous intéresse ici. */
  alpha: Uint8Array;
}

/**
 * Un décodeur PNG minimal — 8 bits, RGBA, non entrelacé.
 *
 * C'est exactement ce que produit `tools/gen-icons.mjs`, et le seul format
 * présent dans `src/assets`. Écrire les cinq filtres de la norme coûte
 * trente lignes ; ajouter une dépendance de test pour les lire en coûterait
 * bien davantage à l'installation.
 */
function decodePNG(buf: Buffer): Image {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('pas un PNG');
  let width = 0;
  let height = 0;
  let depth = 0;
  let color = 0;
  const morceaux: Buffer[] = [];
  let p = 8;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      color = data[9];
      if (data[12] !== 0) throw new Error('PNG entrelacé');
    } else if (type === 'IDAT') {
      morceaux.push(data);
    } else if (type === 'IEND') {
      break;
    }
    p += 12 + len;
  }
  if (depth !== 8 || color !== 6) {
    throw new Error(`PNG attendu en 8 bits RGBA, reçu profondeur ${depth} type ${color}`);
  }
  const brut = inflateSync(Buffer.concat(morceaux));
  const bpp = 4;
  const ligne = width * bpp;
  const pixels = Buffer.alloc(height * ligne);
  for (let y = 0; y < height; y++) {
    const filtre = brut[y * (ligne + 1)];
    const src = y * (ligne + 1) + 1;
    const dst = y * ligne;
    for (let x = 0; x < ligne; x++) {
      const raw = brut[src + x];
      const a = x >= bpp ? pixels[dst + x - bpp] : 0;
      const b = y > 0 ? pixels[dst - ligne + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[dst - ligne + x - bpp] : 0;
      let val: number;
      switch (filtre) {
        case 0:
          val = raw;
          break;
        case 1:
          val = raw + a;
          break;
        case 2:
          val = raw + b;
          break;
        case 3:
          val = raw + ((a + b) >> 1);
          break;
        case 4: {
          const q = a + b - c;
          const pa = Math.abs(q - a);
          const pb = Math.abs(q - b);
          const pc = Math.abs(q - c);
          val = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`filtre PNG inconnu : ${filtre}`);
      }
      pixels[dst + x] = val & 0xff;
    }
  }
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) alpha[i] = pixels[i * 4 + 3];
  return { width, height, alpha };
}

/** Les taches d'encre de l'image, de la plus grosse à la plus petite. */
function composantes({ width, height, alpha }: Image, seuil = 24): number[] {
  const vus = new Uint8Array(width * height);
  const tailles: number[] = [];
  const pile = new Int32Array(width * height);
  for (let d = 0; d < width * height; d++) {
    if (vus[d] || alpha[d] <= seuil) continue;
    let n = 0;
    let haut = 0;
    pile[haut++] = d;
    vus[d] = 1;
    while (haut > 0) {
      const i = pile[--haut];
      n++;
      const x = i % width;
      const y = (i / width) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (vus[j] || alpha[j] <= seuil) continue;
          vus[j] = 1;
          pile[haut++] = j;
        }
      }
    }
    tailles.push(n);
  }
  return tailles.sort((a, b) => b - a);
}

describe('le logotype EchoPlan', () => {
  for (const nom of FICHIERS) {
    it(`${nom} ne porte aucune tache de détourage`, () => {
      const img = decodePNG(readFileSync(join(__dirname, '..', 'src', 'assets', nom)));
      const tailles = composantes(img);
      expect(tailles.length).toBeGreaterThan(5);
      const plusGrande = tailles[0];
      const restes = tailles.filter((t) => t < plusGrande / 10);
      // Le message dit COMBIEN de pixels pesait la saleté : c'est ce qu'on
      // relit quand le banc rougit après un nouveau détourage.
      expect({ nom, restes }).toEqual({ nom, restes: [] });
    });
  }

  it('garde les trois densités dans le même rapport', () => {
    const lu = FICHIERS.slice(0, 3).map((nom) =>
      decodePNG(readFileSync(join(__dirname, '..', 'src', 'assets', nom))),
    );
    // @2x et @3x sont l'image de base, deux et trois fois : un logotype dont
    // le rapport change d'une densité à l'autre s'étire sur la moitié des
    // iPhone, et personne ne compare deux téléphones côte à côte.
    expect(lu[1].width).toBe(lu[0].width * 2);
    expect(lu[1].height).toBe(lu[0].height * 2);
    expect(lu[2].width).toBe(lu[0].width * 3);
    expect(lu[2].height).toBe(lu[0].height * 3);
  });
});

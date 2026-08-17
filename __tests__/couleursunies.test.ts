/**
 * UN MUR UNI SORT UNI.
 *
 * Relevé deux fois sur le chantier, et deux fois la même phrase : « les
 * carrés de couleur de toutes sortes représentent mon mur, totalement vert
 * uni », puis « on voit encore une formation de carrés de couleurs
 * différentes, ça ne fait pas réaliste ».
 *
 * Le lissage local ne pouvait pas y répondre. La médiane du voisinage
 * rattrape UNE case aberrante ; elle ne rattrape pas un mur où chaque case
 * est à quinze unités de sa voisine — l'ordinaire d'un relevé fait en
 * marchant, où l'exposition de la caméra bouge d'une seconde à l'autre.
 *
 * La règle est maintenant renversée : la surface a UNE teinte, et une case
 * ne s'en écarte que si ses voisines s'en écartent dans le même sens. Ce
 * fichier éprouve les deux moitiés de la règle — l'uni doit sortir uni, et
 * un vrai pan d'accent doit survivre.
 */
import { sampleTexture } from '../src/geometry/appearance';

import type { SurfaceTexture } from 'react-native-room-scan';

/** Un tirage reproductible : le même bruit à chaque exécution. */
function dé(graine: number) {
  let x = graine;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
    .join('')}`;

const rgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/** L'écart maximal, canal par canal, entre deux couleurs. */
const ecart = (a: string, b: string) => {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.max(...[0, 1, 2].map((k) => Math.abs(x[k] - y[k])));
};

/** Les couleurs rendues aux centres de chaque case. */
function rendu(tex: SurfaceTexture): string[] {
  const out: string[] = [];
  for (let r = 0; r < tex.rows; r++) {
    for (let c = 0; c < tex.cols; c++) {
      const s = sampleTexture(tex, (c + 0.5) / tex.cols, (r + 0.5) / tex.rows);
      if (s) out.push(s);
    }
  }
  return out;
}

describe('le relevé d’un mur uni', () => {
  it('ressort d’une seule teinte, malgré le bruit d’exposition', () => {
    // Un vert sauge, relevé case par case avec ±22 d'écart : c'est ce que
    // donne un scan fait en marchant.
    const r = dé(7);
    const texels: string[] = [];
    for (let i = 0; i < 24; i++) {
      const d = () => (r() - 0.5) * 44;
      texels.push(hex(150 + d(), 168 + d(), 138 + d()));
    }
    const tex: SurfaceTexture = { cols: 6, rows: 4, texels };
    const vu = rendu(tex);
    expect(vu.length).toBe(24);
    // Toutes les cases dans un mouchoir : plus de damier.
    let pire = 0;
    for (const a of vu) for (const b of vu) pire = Math.max(pire, ecart(a, b));
    expect(`écart maximal ${pire}`).toBe(`écart maximal ${Math.min(pire, 12)}`);
    // Et la teinte reste celle du mur, pas une moyenne grise.
    const [rr, gg, bb] = rgb(vu[0]);
    expect(gg).toBeGreaterThan(rr);
    expect(gg).toBeGreaterThan(bb);
  });

  it('absorbe une case aberrante — un reflet, une main qui passe', () => {
    const texels = Array.from({ length: 24 }, () => '#9AA88A');
    texels[9] = '#3A2F55'; // une case violette au milieu du vert
    const vu = rendu({ cols: 6, rows: 4, texels });
    for (const c of vu) expect(ecart(c, '#9AA88A')).toBeLessThan(20);
  });

  /**
   * MAIS UN VRAI PAN D'ACCENT SURVIT.
   *
   * C'est la contrepartie, et elle compte autant : un mur peint en deux
   * couleurs doit sortir en deux couleurs. La règle ne dit pas « tout
   * aplatir », elle dit « s'écarter, mais avec ses voisines ».
   */
  it('garde un pan d’accent, qui couvre plusieurs cases', () => {
    const texels: string[] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        texels.push(c < 3 ? '#9AA88A' : '#3C5A8C');
      }
    }
    const vu = rendu({ cols: 6, rows: 4, texels });
    const gauche = vu.filter((_, i) => i % 6 < 2);
    const droite = vu.filter((_, i) => i % 6 > 3);
    // Les deux familles restent franchement distinctes.
    const separation = Math.min(
      ...gauche.map((a) => Math.min(...droite.map((b) => ecart(a, b)))),
    );
    expect(`séparation ${separation >= 40 ? 'nette' : 'perdue'}`).toBe(
      'séparation nette',
    );
    // Et chacune reste dans sa teinte : vert d'un côté, bleu de l'autre.
    for (const c of gauche) {
      const [rr, gg, bb] = rgb(c);
      expect(gg).toBeGreaterThan(bb);
      expect(rr).toBeLessThan(gg + 30);
    }
    for (const c of droite) {
      const [, gg, bb] = rgb(c);
      expect(bb).toBeGreaterThan(gg);
    }
  });
});

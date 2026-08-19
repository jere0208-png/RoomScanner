/**
 * L'ANIMATION DE LA VITRINE — et son garde-fou.
 *
 * Les images de l'accueil sont CUITES AU BUILD (`npm run showcase`) puis
 * embarquées : le téléphone ne fait que les feuilleter. C'est ce qui garantit
 * qu'elles ne rament pas et qu'elles sont identiques d'un appareil à l'autre.
 *
 * Le revers, c'est qu'une image cuite ne se corrige pas toute seule : si la
 * géométrie change et que personne ne relance l'outil, l'accueil montre un
 * logement qui n'a plus rien à voir avec ce que produit l'application. Ce
 * banc tient donc les invariants du scénario — ce qu'on doit voir, et quand.
 *
 * Il sert aussi d'outil : avec `UPDATE_SHOWCASE=1`, il écrit les images.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  avancement,
  frameSvg,
  PLAN,
  SHOWCASE_FRAMES,
} from '../src/export/showcaseFrames';

/** La taille des images : celle de l'écran du téléphone, en double densité. */
const W = 264;
const H = 536;

describe('le scénario de la vitrine', () => {
  it('commence à plat, finit en volume, et revient', () => {
    expect(avancement(0)).toBe(0);
    // Le palier du plan tient assez longtemps pour qu'on lise les cotes.
    expect(avancement(4)).toBe(0);
    // Quelque part au milieu, le plan est levé.
    const sommet = Math.max(
      ...Array.from({ length: SHOWCASE_FRAMES }, (_, i) => avancement(i)),
    );
    expect(sommet).toBe(1);
    // Et le cycle boucle : la dernière image rejoint la première.
    expect(avancement(SHOWCASE_FRAMES)).toBe(avancement(0));
    expect(avancement(SHOWCASE_FRAMES - 1)).toBeLessThan(0.35);
  });

  it('monte et redescend sans à-coup', () => {
    const suite = Array.from({ length: SHOWCASE_FRAMES }, (_, i) =>
      avancement(i),
    );
    for (let i = 1; i < suite.length; i++) {
      // Aucun saut brutal : la levée se fait en douceur, jamais en deux
      // images. C'est ce qui distingue une transition d'un changement d'écran.
      expect(Math.abs(suite[i] - suite[i - 1])).toBeLessThan(0.2);
    }
  });
});

describe('les images de la vitrine', () => {
  const svg = (t: number) => frameSvg(t, W, H);

  /*
    PLUS DE COTES — NULLE PART.

    Elles disaient la taille d'un logement inventé, ce qui n'apprend rien, et
    elles étaient le seul élément de l'image qui devait s'effacer en cours de
    route : un fondu à régler, un écart à la maçonnerie à régler, et deux
    corrections déjà. La vitrine montre un logement qui se lève ; les cotes,
    c'est dans l'app.
  */
  it('ne cote plus rien, ni à plat ni en volume', () => {
    for (const t of [0, 0.5, 1]) expect(svg(t)).not.toContain(' m</text>');
  });

  /*
    LE MOBILIER ARRIVE EN FONDU, PAS D'UN COUP.

    Il sortait du sol à pleine opacité : d'une image à l'autre, un logement
    vide devenait un logement meublé. L'œil ne relie pas ces deux images, il
    voit une coupure — et une coupure au milieu d'un mouvement se lit comme
    un défaut d'affichage.

    Le fondu est RAPIDE — quelques images — mais c'en est un : le mobilier
    monte en opacité pendant que les murs se lèvent, et l'on comprend que
    c'est le même logement qui se remplit.
  */
  it('fait apparaître le mobilier en fondu', () => {
    // Le trait du mobilier : c'est le seul bleu du dessin, et il n'est pas
    // ombré — donc lisible tel quel, contrairement au remplissage.
    const opacite = (t: number) => {
      const m = svg(t).match(
        /stroke="#2F6BFF" stroke-width="[\d.]+" stroke-opacity="([\d.]+)"/,
      );
      return m ? parseFloat(m[1]) : 0;
    };
    const suite = Array.from({ length: SHOWCASE_FRAMES }, (_, i) =>
      opacite(avancement(i)),
    );
    expect(Math.max(...suite)).toBeGreaterThan(0.9);
    expect(suite[0]).toBeLessThan(0.05);
    // Au moins trois images à mi-chemin : sans elles, le fondu tient en une
    // image et n'en est plus un.
    expect(suite.filter((o) => o > 0.05 && o < 0.95).length).toBeGreaterThanOrEqual(3);
    // Et aucun saut brutal d'une image à la suivante.
    for (let i = 1; i < suite.length; i++) {
      expect(Math.abs(suite[i] - suite[i - 1])).toBeLessThan(0.5);
    }
  });

  it('lève le plan en gardant ses appareils', () => {
    const volume = svg(1);
    expect(volume).toContain('>PC<');
    expect(volume).toContain('>I<');
    // Et il y a plus de matière qu'à plat : les murs ont poussé, les meubles
    // sont sortis.
    const faces = (s: string) => (s.match(/<polygon/g) ?? []).length;
    expect(faces(volume)).toBeGreaterThan(faces(svg(0)));
  });

  /*
    UN APPARTEMENT QUI TIENT DEBOUT.

    Le refend s'arrêtait au milieu du logement : la chambre n'était pas
    fermée, et l'armoire flottait à cinquante centimètres de son mur. On
    montrait un plan que personne n'a jamais relevé. Ce banc tient les deux
    règles qui font qu'un plan se lit comme un logement : les pièces se
    ferment, et le mobilier est CONTRE quelque chose.
  */
  it('ferme ses pièces et plaque ses meubles', () => {
    for (const [id, , cx, cz, w, d] of PLAN.meubles) {
      // Une table basse est au milieu du salon : c'est sa place.
      if (id === 'table') continue;
      const bords = [cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2];
      const contre =
        Math.abs(bords[0]) < 0.12 ||
        Math.abs(bords[2] - 4.2) < 0.12 ||
        Math.abs(bords[1]) < 0.12 ||
        Math.abs(bords[3] - 6.4) < 0.12 ||
        Math.abs(bords[1] - 2.7) < 0.12 ||
        Math.abs(bords[3] - 2.7) < 0.12;
      expect({ id, contre }).toEqual({ id, contre: true });
    }
    // Le refend traverse : sans quoi la chambre n'existe pas.
    const refend = PLAN.murs.find((m) => m[0] === 'refend')!;
    expect(Math.abs(refend[3] - refend[1])).toBeCloseTo(4.2);
  });

  it('tient dans le cadre de l’écran', () => {
    for (const t of [0, 0.5, 1]) {
      const s = svg(t);
      const nombres = [...s.matchAll(/points="([^"]+)"/g)].flatMap((m) =>
        m[1]
          .split(' ')
          .flatMap((p) => p.split(',').map(Number)),
      );
      // Une marge de tolérance : un mur peut mordre le bord, jamais partir
      // à deux écrans de là.
      for (const n of nombres) {
        expect(n).toBeGreaterThan(-W);
        expect(n).toBeLessThan(H + W);
      }
    }
  });

  /** L'outil : `UPDATE_SHOWCASE=1 npx jest showcase` écrit les images. */
  it('écrit les images quand on le demande', () => {
    if (!process.env.UPDATE_SHOWCASE) {
      expect(SHOWCASE_FRAMES).toBeGreaterThan(20);
      return;
    }
    const dir = join(__dirname, '..', 'assets', 'showcase');
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < SHOWCASE_FRAMES; i++) {
      const nom = `frame-${String(i).padStart(2, '0')}.svg`;
      writeFileSync(join(dir, nom), frameSvg(avancement(i), W, H));
    }
    expect(true).toBe(true);
  });
});

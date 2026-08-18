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

  it('dessine un plan coté à plat, appareils compris', () => {
    const plat = svg(0);
    // Les cotes : quatre murs extérieurs, chacun sa valeur en mètres.
    expect((plat.match(/ m<\/text>/g) ?? []).length).toBeGreaterThanOrEqual(4);
    // Et l'appareillage, qui est le sujet de l'application.
    expect(plat).toContain('>PC<');
    expect(plat).toContain('>I<');
  });

  /**
   * EN VOLUME, LES COTES S'EFFACENT — les appareils, non.
   *
   * On ne cote pas une perspective : un volume couvert de chiffres ne se lit
   * pas. Mais les prises restent, parce que c'est ce qu'on vient chercher.
   */
  it('lève le plan sans ses cotes, mais avec ses appareils', () => {
    const volume = svg(1);
    expect(volume).not.toContain(' m</text>');
    expect(volume).toContain('>PC<');
    // Et il y a plus de matière qu'à plat : les murs ont poussé, les meubles
    // sont sortis.
    const faces = (s: string) => (s.match(/<polygon/g) ?? []).length;
    expect(faces(volume)).toBeGreaterThan(faces(svg(0)));
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

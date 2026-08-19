/**
 * L'ÉCRAN DE LANCEMENT — l'icône de l'app, en grand, au centre.
 *
 * Le lancement est le moment où l'on vient d'APPUYER sur l'icône : la
 * retrouver seule, au centre de l'écran, fait une continuité — c'est le
 * geste de tout iOS. Le logo composé (glyphe + mot) vivait ici en petit,
 * au tiers haut ; le mot, lui, a sa place sur l'accueil.
 *
 * Ce banc tient le storyboard et l'image cuite : un storyboard ne se
 * regarde pas dans un simulateur sous Windows, il se vérifie ici. Et iOS
 * met l'écran de lancement en CACHE : sans banc, une image absente ou mal
 * nommée ne se verrait qu'à la réinstallation — c'est-à-dire trop tard.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const IOS = join(__dirname, '..', 'ios', 'RoomScanner');
const storyboard = () =>
  readFileSync(join(IOS, 'LaunchScreen.storyboard'), 'utf8');

/** Le côté d'un PNG, lu dans son en-tête IHDR (largeur, hauteur). */
const cotesPng = (chemin: string): [number, number] => {
  const png = readFileSync(chemin);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

describe("l'écran de lancement", () => {
  it("montre l'icône de l'app, et plus le logo composé", () => {
    const s = storyboard();
    expect(s).toContain('image="LaunchIcon"');
    expect(s).not.toContain('LaunchLogo');
    // L'ancien imageset est parti avec lui : un asset orphelin pèse dans
    // l'IPA et laisse croire qu'il sert encore.
    expect(
      existsSync(join(IOS, 'Images.xcassets', 'LaunchLogo.imageset')),
    ).toBe(false);
  });

  it('la pose en grand, au centre — plus au tiers haut', () => {
    const s = storyboard();
    expect(s).not.toContain('multiplier="1/3"');
    expect(s).toMatch(
      /firstAttribute="centerY" secondItem="Ze5-6b-2t3" secondAttribute="centerY"/,
    );
    // Carrée et grande : une icône est carrée, 180 points tiennent le
    // centre sans toucher les bords du plus petit écran.
    expect(s).toMatch(/firstAttribute="width" constant="180"/);
    expect(s).toMatch(/firstAttribute="height" constant="180"/);
  });

  it("l'image existe aux trois densités, carrée, à la bonne taille", () => {
    const dir = join(IOS, 'Images.xcassets', 'LaunchIcon.imageset');
    expect(existsSync(join(dir, 'Contents.json'))).toBe(true);
    const attendus: [string, number][] = [
      ['LaunchIcon.png', 180],
      ['LaunchIcon@2x.png', 360],
      ['LaunchIcon@3x.png', 540],
    ];
    for (const [nom, cote] of attendus) {
      const chemin = join(dir, nom);
      expect({ nom, present: existsSync(chemin) }).toEqual({
        nom,
        present: true,
      });
      expect({ nom, cotes: cotesPng(chemin) }).toEqual({
        nom,
        cotes: [cote, cote],
      });
    }
  });
});

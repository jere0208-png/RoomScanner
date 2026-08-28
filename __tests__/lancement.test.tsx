/**
 * L'OUVERTURE DE L'APPLICATION — trois images qui s'enchaînent.
 *
 * Elles se suivent en une seconde, et la coupure entre deux se remarque plus
 * que chacune d'elles :
 *
 *   1. L'ÉCRAN DE LANCEMENT d'iOS — l'icône de l'app, en grand, au centre.
 *      C'est un storyboard natif, cuit dans l'IPA ;
 *   2. L'ÉCRAN D'ATTENTE, en JavaScript, le temps de lire le compte dans le
 *      stockage. Il était VIDE : un fond nu entre deux images de marque, ce
 *      qui se lit comme un plantage. Relevé du patron : « au chargement de
 *      l'app, mets les 2 logos superposés comme on a fait pour l'accueil,
 *      mais centré à l'écran » ;
 *   3. L'ACCUEIL, qui porte la même composition — le glyphe en filigrane, le
 *      logotype par-dessus — mais posée en haut de page.
 *
 * Ce banc tient les trois, et surtout leur CONTINUITÉ : le filigrane et le
 * logotype de l'attente sont ceux de l'accueil, aux mêmes valeurs. Un
 * filigrane qui change de force entre deux écrans qui se suivent se voit.
 *
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
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

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

/*
  L'ÉCRAN D'ATTENTE — celui qui était vide.
*/
describe("l'écran d'attente, entre le lancement et l'accueil", () => {
  const React = require('react');
  const TestRenderer = require('react-test-renderer');
  const { Image, StyleSheet, View } = require('react-native');
  const { EcranChargement } = require('../src/components/EcranChargement');
  const { LogoMark } = require('../src/components/LogoMark');

  const monter = () => {
    let t!: { root: { findAllByType: (x: unknown) => any[]; findAll: (f: (n: unknown) => boolean) => any[] } };
    TestRenderer.act(() => {
      t = TestRenderer.create(React.createElement(EcranChargement));
    });
    return t;
  };

  it('porte les DEUX marques, le glyphe derrière le mot', () => {
    const t = monter();
    const glyphe = t.root.findAllByType(LogoMark);
    expect(glyphe).toHaveLength(1);
    const mot = t.root.findAllByType(Image);
    expect(mot).toHaveLength(1);
    /*
      L'ORDRE DES FRÈRES SUFFIT : le filigrane est rendu AVANT le logotype,
      donc il passe derrière. On mesure la cause — la position dans l'arbre —
      et non une couleur ou une opacité qui ne dirait pas qui couvre qui.
    */
    const plats = t.root.findAll(() => true);
    const rangGlyphe = plats.indexOf(glyphe[0]);
    const rangMot = plats.indexOf(mot[0]);
    expect(rangGlyphe).toBeLessThan(rangMot);
  });

  it('les superpose, et les centre SUR L’ÉCRAN', () => {
    const t = monter();
    // La page occupe tout et centre son contenu sur les deux axes : c'est ce
    // qui distingue cet écran de l'accueil, où la marque est posée en haut.
    const page = t.root.findAllByType(View)[0];
    const st = StyleSheet.flatten(page.props.style) as {
      flex?: number;
      alignItems?: string;
      justifyContent?: string;
      backgroundColor?: string;
    };
    expect({
      flex: st.flex,
      x: st.alignItems,
      y: st.justifyContent,
    }).toEqual({ flex: 1, x: 'center', y: 'center' });
    /*
      ET LE FOND EST PEINT. Cette vue est la SEULE chose à l'écran : sans
      couleur, on verrait le fond du système — blanc en thème sombre, ce qui
      donne un éclair blanc juste avant un accueil noir.
    */
    expect(typeof st.backgroundColor).toBe('string');
    // SUPERPOSÉS, pas empilés : le filigrane est en absolu, il ne pousse rien.
    const filigrane = t.root
      .findAllByType(View)
      .find((n: { props: { style?: unknown } }) => {
        const s2 = StyleSheet.flatten(n.props.style) as { position?: string };
        return s2?.position === 'absolute';
      });
    expect(filigrane).toBeDefined();
  });

  /*
    LA CONTINUITÉ AVEC L'ACCUEIL — mesurée par NATURE, pas par le chiffre.

    On ne compare pas « 240 » à « 240 » : le jour où le filigrane changera de
    taille, on veut que les deux écrans changent ENSEMBLE, pas qu'un banc
    tombe. On lit donc la valeur sur l'accueil et on exige la même ici.
  */
  it('reprend le filigrane de l’accueil, à la même taille et au même retrait', () => {
    const source = readFileSync(
      join(__dirname, '..', 'src', 'screens', 'HomeScreen.tsx'),
      'utf8',
    );
    const attendu = {
      taille: /FILIGRANE_LOGO = (\d+)/.exec(source)?.[1],
      opacite: /FILIGRANE_OPACITE = ([\d.]+)/.exec(source)?.[1],
    };
    const attente = readFileSync(
      join(__dirname, '..', 'src', 'components', 'EcranChargement.tsx'),
      'utf8',
    );
    expect({
      taille: /FILIGRANE_LOGO = (\d+)/.exec(attente)?.[1],
      opacite: /FILIGRANE_OPACITE = ([\d.]+)/.exec(attente)?.[1],
    }).toEqual(attendu);
    expect(attendu.taille).toBeTruthy();
  });
});

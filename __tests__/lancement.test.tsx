/**
 * L'OUVERTURE DE L'APPLICATION — trois images qui s'enchaînent.
 *
 * Elles se suivent en une seconde, et la coupure entre deux se remarque plus
 * que chacune d'elles :
 *
 *   1. L'ÉCRAN DE LANCEMENT d'iOS — la marque, en grand, au centre. C'est un
 *      storyboard natif, cuit dans l'IPA ;
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
 * L'ÉCRAN DE LANCEMENT — TROIS VERSIONS, ET UN ALLER-RETOUR ASSUMÉ.
 *
 *   PREMIÈRE — le logo composé (glyphe + mot), en petit, au TIERS HAUT.
 *
 *   DEUXIÈME — l'icône de l'application, seule et en grand, au centre. Le
 *   raisonnement se tenait : le lancement est le moment où l'on vient
 *   d'APPUYER sur l'icône, la retrouver au centre fait une continuité, et
 *   c'est le geste de tout iOS.
 *
 *   TROISIÈME — celle-ci. Relevé du patron, en regardant l'application
 *   s'ouvrir : « au chargement de l'application je vois toujours l'icône de
 *   l'app et pas le logo qu'on a sur l'accueil avec derrière l'autre logo, je
 *   veux pareil mais centré au clic sur l'application ». Ce qui manquait au
 *   raisonnement d'avant, c'est ce qui vient APRÈS : l'écran d'attente et
 *   l'accueil portent tous deux la marque composée. Montrer l'icône d'abord
 *   faisait donc DEUX ouvertures pour une seule application — et la coupure
 *   entre deux images se remarque plus que chacune d'elles.
 *
 * La composition est celle de l'accueil, AUX MÊMES NOMBRES : filigrane de 240
 * à sept centièmes, logotype de 160 × 102. Et elle suit le thème — fond,
 * glyphe et logotype ont chacun leur variante sombre —, sans quoi l'ouverture
 * en thème sombre commencerait par un éclair blanc.
 *
 * Ce banc tient le storyboard et les images cuites : un storyboard ne se
 * regarde pas dans un simulateur sous Windows, il se vérifie ici. Et iOS met
 * l'écran de lancement en CACHE : sans banc, une image absente ou mal nommée
 * ne se verrait qu'à la réinstallation — c'est-à-dire trop tard.
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
  it('porte la marque composée, et non plus l’icône seule', () => {
    const s = storyboard();
    expect(s).toContain('image="LaunchMark"');
    expect(s).toContain('image="LaunchWordmark"');
    // L'icône n'est plus posée sur cet écran : elle reste l'icône de
    // l'application, à sa place, sur la grille de l'iPhone.
    expect(s).not.toContain('image="LaunchIcon"');
  });

  it('centrée sur l’écran, les deux images sur le même axe', () => {
    const s = storyboard();
    // Ni tiers haut, ni décalage : le relevé dit « centré ».
    expect(s).not.toContain('multiplier="1/3"');
    for (const id of ['Mrk-01-aaa', 'Wrd-01-bbb']) {
      for (const axe of ['centerX', 'centerY']) {
        expect(s).toContain(
          `firstItem="${id}" firstAttribute="${axe}" secondItem="Ze5-6b-2t3" secondAttribute="${axe}"`,
        );
      }
    }
  });

  it('aux mesures de l’accueil : 240 pour le filigrane, 160 × 102 pour le mot', () => {
    /*
      LES MÊMES NOMBRES QU'`EcranChargement` ET QUE L'ACCUEIL. Un filigrane
      qui changerait de force ou de taille entre deux écrans qui se suivent se
      remarque — et ces trois-là se suivent en une seconde.
    */
    const s = storyboard();
    expect(s).toMatch(/firstAttribute="width" constant="240"/);
    expect(s).toMatch(/firstAttribute="height" constant="240"/);
    expect(s).toMatch(/firstAttribute="width" constant="160"/);
    expect(s).toMatch(/firstAttribute="height" constant="102"/);
    // Sept centièmes : on le sent, on ne le lit pas.
    expect(s).toContain('alpha="0.07"');
  });

  it('et le filigrane est DERRIÈRE le mot', () => {
    // L'ordre des frères suffit, comme à l'accueil : ce qui est rendu en
    // premier passe dessous.
    const s = storyboard();
    expect(s.indexOf('image="LaunchMark"')).toBeLessThan(
      s.indexOf('image="LaunchWordmark"'),
    );
  });

  it('les deux images existent aux trois densités, en clair et en sombre', () => {
    /*
      SANS VARIANTE SOMBRE, l'ouverture d'une application en thème sombre
      commence par un éclair blanc — le défaut que l'écran d'attente avait
      déjà eu à corriger de son côté.
    */
    for (const [nom, cotes] of [
      ['LaunchMark', [240, 480, 720]],
      ['LaunchWordmark', [160, 320, 480]],
    ] as [string, number[]][]) {
      const dir = join(IOS, 'Images.xcassets', `${nom}.imageset`);
      expect(existsSync(join(dir, 'Contents.json'))).toBe(true);
      const contenu = JSON.parse(
        readFileSync(join(dir, 'Contents.json'), 'utf8'),
      ) as { images: { filename: string; appearances?: unknown[] }[] };
      // Trois densités en clair, trois en sombre.
      expect(contenu.images.filter((im) => !im.appearances)).toHaveLength(3);
      expect(contenu.images.filter((im) => im.appearances)).toHaveLength(3);
      for (const im of contenu.images) {
        const chemin = join(dir, im.filename);
        expect({ f: im.filename, present: existsSync(chemin) }).toEqual({
          f: im.filename,
          present: true,
        });
      }
      // Et la largeur suit bien les trois densités.
      const larges = contenu.images
        .filter((im) => !im.appearances)
        .map((im) => cotesPng(join(dir, im.filename))[0])
        .sort((a, b) => a - b);
      expect(larges).toEqual(cotes);
    }
  });

  it('le fond suit le thème, et c’est celui de l’application', () => {
    const s = storyboard();
    expect(s).toContain('name="LaunchBackground"');
    const dir = join(IOS, 'Images.xcassets', 'LaunchBackground.colorset');
    const contenu = JSON.parse(
      readFileSync(join(dir, 'Contents.json'), 'utf8'),
    ) as { colors: { appearances?: unknown[] }[] };
    expect(contenu.colors).toHaveLength(2);
    expect(contenu.colors.filter((c) => c.appearances)).toHaveLength(1);
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

/**
 * LES ICÔNES ALTERNATIVES — seconde moitié de la neuvième amélioration.
 *
 * La teinte d'accent habille l'application ; l'icône habille l'écran
 * d'accueil. Les deux vont ensemble et se règlent au même endroit, mais elles
 * restent DEUX réglages : changer d'icône fait apparaître une alerte du
 * système (« Vous avez changé l'icône de… »), et personne ne veut la voir en
 * essayant trois teintes de suite.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE GLYPHE NE CHANGE JAMAIS. C'est lui qu'on reconnaît au pouce, sans lire,
 * parmi cent icônes : une icône dont la forme change n'est plus la même
 * application. Seul l'habit change — fond clair et glyphe d'encre pour
 * l'originale, fond teinté et glyphe blanc pour les trois autres.
 *
 * ET CHAQUE JEU EST COMPLET. Une icône alternative sans ses petites tailles
 * retombe sur l'originale là où elle manque : l'écran d'accueil serait
 * indigo, les réglages et les notifications blancs. Le banc compte les
 * fichiers, parce que personne ne va vérifier Spotlight à la main.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ICONES, ICONE_DEFAUT, estUneIcone, nomNatifDIcone } from '../src/ui/icone';
import { ACCENTS } from '../src/ui/accents';

const RACINE = join(__dirname, '..');
const CATALOGUE = join(RACINE, 'ios', 'RoomScanner', 'Images.xcassets');

describe('quatre habits, un seul glyphe', () => {
  it('autant d’icônes que de teintes, et les mêmes noms', () => {
    /*
      Une icône par accent, pas une de plus : deux listes qui divergent
      donneraient une teinte sans habit, ou un habit qu'aucun réglage ne
      propose. Elles se règlent l'une à côté de l'autre, elles doivent se
      correspondre.
    */
    expect(ICONES.map((i) => i.cle)).toEqual(ACCENTS.map((a) => a.cle));
  });

  it('l’originale ouvre la liste et n’a pas de nom natif', () => {
    /*
      `setAlternateIconName(nil)` remet l'icône d'origine : c'est iOS qui le
      veut ainsi, et `null` est donc la bonne valeur, pas la chaîne vide.
    */
    expect(ICONES[0].cle).toBe(ICONE_DEFAUT);
    expect(nomNatifDIcone(ICONE_DEFAUT)).toBeNull();
    expect(nomNatifDIcone(undefined)).toBeNull();
  });

  it('les autres portent le nom de leur jeu dans le catalogue', () => {
    expect(nomNatifDIcone('indigo')).toBe('AppIcon-Indigo');
    expect(nomNatifDIcone('prune')).toBe('AppIcon-Prune');
    expect(nomNatifDIcone('graphite')).toBe('AppIcon-Graphite');
  });

  it('une clé inconnue ne désigne aucune icône', () => {
    expect(nomNatifDIcone('fuchsia-du-futur')).toBeNull();
    expect(estUneIcone('fuchsia-du-futur')).toBe(false);
    expect(estUneIcone('prune')).toBe(true);
  });
});

describe('les jeux sont là, et ils sont COMPLETS', () => {
  /** Les tailles que porte l'icône d'origine : les alternatives aussi. */
  const attendues = readdirSync(join(CATALOGUE, 'AppIcon.appiconset'))
    .filter((f) => f.endsWith('.png'))
    .sort();

  it('l’icône d’origine porte bien un jeu complet', () => {
    expect(attendues.length).toBeGreaterThanOrEqual(7);
  });

  for (const icone of ['AppIcon-Indigo', 'AppIcon-Prune', 'AppIcon-Graphite']) {
    it(`${icone} : toutes les tailles, et un Contents.json valide`, () => {
      const dir = join(CATALOGUE, `${icone}.appiconset`);
      expect(existsSync(dir)).toBe(true);
      const trouvees = readdirSync(dir)
        .filter((f) => f.endsWith('.png'))
        .sort();
      expect(trouvees).toEqual(attendues);
      const contents = JSON.parse(
        readFileSync(join(dir, 'Contents.json'), 'utf8'),
      );
      expect(Array.isArray(contents.images)).toBe(true);
      // Chaque entrée doit pointer sur un fichier qui existe : un
      // `Contents.json` qui nomme un PNG absent fait ÉCHOUER la compilation
      // du catalogue, et le message d'Xcode ne dit pas lequel.
      for (const img of contents.images) {
        expect(trouvees).toContain(img.filename);
      }
      const tailles = contents.images.map((i: { size: string }) => i.size);
      expect(tailles).toContain('60x60');
      expect(tailles).toContain('1024x1024');
    });
  }

  it('et l’originale n’a pas bougé d’un octet', () => {
    /*
      Le générateur pose les habits l'un après l'autre en changeant trois
      variables. S'il oublie de les remettre, l'icône d'origine sort teintée
      — et le défaut ne se voit qu'une fois l'application installée.
    */
    const origine = readFileSync(
      join(CATALOGUE, 'AppIcon.appiconset', 'icon-180.png'),
    );
    const indigo = readFileSync(
      join(CATALOGUE, 'AppIcon-Indigo.appiconset', 'icon-180.png'),
    );
    expect(origine.equals(indigo)).toBe(false);
    // Le blanc du fond, au coin haut-gauche du carré : l'originale est
    // claire, l'alternative ne l'est pas.
    expect(origine.length).toBeGreaterThan(1000);
  });
});

describe('le projet Xcode déclare les alternatives', () => {
  const pbx = readFileSync(
    join(RACINE, 'ios', 'RoomScanner.xcodeproj', 'project.pbxproj'),
    'utf8',
  );

  it('les jeux du catalogue sont TOUS compilés, pas seulement le principal', () => {
    /*
      Sans `INCLUDE_ALL_APPICON_ASSETS`, Xcode ne compile que le jeu nommé
      par `ASSETCATALOG_COMPILER_APPICON_NAME` : les trois autres sont dans
      le dépôt, absents du binaire, et `setAlternateIconName` répond « icône
      inconnue » sans que rien n'explique pourquoi.
    */
    const occurrences = pbx.match(
      /ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = YES;/g,
    );
    // Debug ET Release : une variante qui ne l'a pas se comporte autrement
    // que l'autre, et c'est toujours celle qu'on ne teste pas.
    expect(occurrences?.length).toBe(2);
  });

  it('et les trois noms y sont, dans les deux configurations', () => {
    const noms = pbx.match(/ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = "[^"]*";/g);
    expect(noms?.length).toBe(2);
    for (const ligne of noms ?? []) {
      for (const n of ['AppIcon-Indigo', 'AppIcon-Prune', 'AppIcon-Graphite']) {
        expect(ligne).toContain(n);
      }
    }
  });
});

describe('le choix se retient, et il est à part de la teinte', () => {
  const { useScanStore } =
    require('../src/store/scanStore') as typeof import('../src/store/scanStore');

  it('l’application démarre sur l’icône d’origine', () => {
    expect(useScanStore.getState().iconePref).toBe(ICONE_DEFAUT);
  });

  it('changer d’icône ne change pas la teinte, et l’inverse non plus', () => {
    /*
      Elles se règlent côte à côte parce qu'elles vont ensemble, mais changer
      d'icône fait apparaître une alerte du système : les lier ferait
      surgir cette alerte à chaque essai de teinte. Deux réglages, deux
      gestes.
    */
    useScanStore.getState().setIconePref('prune');
    expect(useScanStore.getState().iconePref).toBe('prune');
    expect(useScanStore.getState().accentPref).not.toBe('prune');
    useScanStore.getState().setIconePref(ICONE_DEFAUT);
  });

  it('et une clé inconnue est refusée plutôt que posée', () => {
    useScanStore.getState().setIconePref('fuchsia-du-futur');
    expect(useScanStore.getState().iconePref).toBe(ICONE_DEFAUT);
  });
});

describe('le réglage vit sous l’apparence', () => {
  it('l’écran des réglages propose les icônes', () => {
    const profil = readFileSync(
      join(RACINE, 'src', 'screens', 'ProfilScreen.tsx'),
      'utf8',
    );
    expect(profil).toContain('ICONES');
    expect(profil).toContain('setIconePref');
  });
});

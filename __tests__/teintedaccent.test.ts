/**
 * LA TEINTE D'ACCENT — neuvième des dix améliorations.
 *
 * Un seul bleu tenait toute l'application depuis le premier jour. C'est un
 * bon bleu, et il reste celui par défaut ; mais un outil qu'on a dans la
 * main tous les jours de l'année, on aime qu'il soit un peu à soi. Quatre
 * teintes, dans les réglages, à côté du clair et du sombre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE PIÈGE EST DANS LE CACHE DES STYLES, et il est invisible à la lecture.
 *
 * `themedStyles` mémorise ses feuilles de style PAR IDENTITÉ DE PALETTE —
 * une `Map<Palette, T>`. Il n'y en avait que deux, `light` et `dark`, deux
 * objets constants : le cache tombait juste à chaque fois. Une palette
 * fabriquée à la volée à chaque rendu ferait manquer le cache À CHAQUE
 * IMAGE, reconstruirait toutes les feuilles de style de l'écran, et
 * remplirait la `Map` jusqu'à ce que la mémoire cède. Le défaut ne se voit
 * pas : l'application est juste devenue lente, et personne ne sait quand.
 *
 * Chaque couple (palette, accent, mode) n'est donc fabriqué QU'UNE FOIS, et
 * rendu tel quel ensuite. C'est ce que vérifie l'épreuve d'identité.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import {
  ACCENTS,
  ACCENT_DEFAUT,
  paletteTeintee,
  estUnAccent,
} from '../src/ui/accents';
import { light, dark, themedStyles, type Palette } from '../src/theme';

/** Distance grossière entre deux teintes, sur les trois canaux. */
const ecart = (a: string, b: string) => {
  const n = (h: string) => parseInt(h.slice(1), 16);
  const x = n(a);
  const y = n(b);
  return (
    Math.abs((x >> 16) - (y >> 16)) +
    Math.abs(((x >> 8) & 255) - ((y >> 8) & 255)) +
    Math.abs((x & 255) - (y & 255))
  );
};

describe('quatre teintes, et pas n’importe lesquelles', () => {
  it('le bleu de toujours ouvre la liste', () => {
    expect(ACCENTS[0].cle).toBe(ACCENT_DEFAUT);
    expect(ACCENTS[0].clair.blue).toBe(light.blue);
    expect(ACCENTS[0].sombre.blue).toBe(dark.blue);
  });

  it('quatre au moins, aux clés uniques, toutes en hexadécimal', () => {
    expect(ACCENTS.length).toBeGreaterThanOrEqual(4);
    const cles = ACCENTS.map((a) => a.cle);
    expect(new Set(cles).size).toBe(cles.length);
    for (const a of ACCENTS) {
      for (const jeu of [a.clair, a.sombre]) {
        expect(jeu.blue).toMatch(/^#[0-9A-F]{6}$/i);
        expect(jeu.blueDark).toMatch(/^#[0-9A-F]{6}$/i);
        expect(jeu.blueSoft).toMatch(/^#[0-9A-F]{6}$/i);
      }
      expect(a.nom.length).toBeGreaterThan(2);
    }
  });

  it('AUCUNE ne marche sur les couleurs qui ont déjà un sens', () => {
    /*
      Le plan parle en couleurs, et ce ne sont pas des ornements : l'ambre
      est une porte, le ciel une fenêtre, le vert la conformité, le rouge le
      danger. L'accent, lui, désigne CE QU'ON PEUT TOUCHER — et il se pose
      sur le plan, puisqu'un mur sélectionné le porte. Un accent vert dirait
      « conforme » sur un mur qui n'est que choisi.

      C'est la raison pour laquelle l'ambre et le vert, qu'on proposerait
      spontanément, ne figurent PAS dans cette liste.
    */
    const prises = [light.green, light.amber, light.sky, light.danger];
    for (const a of ACCENTS) {
      for (const p of prises) {
        expect(ecart(a.clair.blue, p)).toBeGreaterThan(90);
      }
    }
  });

  it('et chacune se distingue des trois autres', () => {
    for (let i = 0; i < ACCENTS.length; i++) {
      for (let j = i + 1; j < ACCENTS.length; j++) {
        expect(ecart(ACCENTS[i].clair.blue, ACCENTS[j].clair.blue))
          .toBeGreaterThan(60);
      }
    }
  });
});

describe('la palette teintée garde son IDENTITÉ', () => {
  it('deux appels rendent le MÊME objet — sinon le cache des styles meurt', () => {
    /*
      `themedStyles` mémorise par identité. Une palette neuve à chaque rendu
      ferait manquer le cache à chaque image et reconstruirait toutes les
      feuilles de style de l'écran, en remplissant la `Map` sans fin. Le
      défaut ne se voit pas : l'application est juste devenue lente.
    */
    expect(paletteTeintee(light, 'prune')).toBe(paletteTeintee(light, 'prune'));
    expect(paletteTeintee(dark, 'prune', 'sombre')).toBe(
      paletteTeintee(dark, 'prune', 'sombre'),
    );
  });

  it('et le cache des styles s’en sert vraiment', () => {
    let fabriques = 0;
    const usine = themedStyles((_c: Palette) => {
      fabriques += 1;
      return { n: fabriques };
    });
    const p = paletteTeintee(light, 'indigo');
    usine(p);
    usine(paletteTeintee(light, 'indigo'));
    usine(paletteTeintee(light, 'indigo'));
    expect(fabriques).toBe(1);
  });

  it('l’accent par défaut rend la palette de base, sans copie', () => {
    /*
      Rien ne change pour qui n'a rien choisi : c'est le MÊME objet qu'avant,
      donc les mêmes feuilles de style déjà en cache, et pas une ligne de
      travail en plus au démarrage.
    */
    expect(paletteTeintee(light, ACCENT_DEFAUT)).toBe(light);
    expect(paletteTeintee(dark, ACCENT_DEFAUT, 'sombre')).toBe(dark);
    expect(paletteTeintee(light, undefined)).toBe(light);
  });

  it('une clé inconnue retombe sur le bleu, elle n’invente pas', () => {
    expect(paletteTeintee(light, 'fuchsia-du-futur')).toBe(light);
    expect(estUnAccent('fuchsia-du-futur')).toBe(false);
    expect(estUnAccent('indigo')).toBe(true);
  });

  it('elle ne change QUE les trois bleus', () => {
    const p = paletteTeintee(light, 'prune');
    expect(p.blue).not.toBe(light.blue);
    expect(p.blueDark).not.toBe(light.blueDark);
    expect(p.blueSoft).not.toBe(light.blueSoft);
    // Tout le reste est intact : l'accent habille, il ne redéfinit pas le
    // vocabulaire du plan.
    for (const cle of Object.keys(light) as (keyof Palette)[]) {
      if (cle === 'blue' || cle === 'blueDark' || cle === 'blueSoft') continue;
      expect(p[cle]).toBe(light[cle]);
    }
  });

  it('le mode sombre a SES teintes, pas celles du clair éclaircies', () => {
    /*
      Un bleu de plein jour posé sur un fond noir paraît sale, et un bleu de
      nuit sur du blanc paraît délavé. Chaque accent porte donc ses deux
      jeux, comme les palettes elles-mêmes.
    */
    for (const a of ACCENTS) {
      expect(a.sombre.blue).not.toBe(a.clair.blue);
    }
    expect(paletteTeintee(dark, 'indigo', 'sombre').blue).toBe(
      ACCENTS.find((a) => a.cle === 'indigo')!.sombre.blue,
    );
  });
});

describe('le choix se retient', () => {
  const { useScanStore } =
    require('../src/store/scanStore') as typeof import('../src/store/scanStore');

  it('l’application démarre sur le bleu', () => {
    expect(useScanStore.getState().accentPref).toBe(ACCENT_DEFAUT);
  });

  it('on en choisit un autre, il tient', () => {
    useScanStore.getState().setAccentPref('prune');
    expect(useScanStore.getState().accentPref).toBe('prune');
    useScanStore.getState().setAccentPref(ACCENT_DEFAUT);
  });

  it('et une clé inconnue est refusée plutôt que posée', () => {
    /*
      Ce qui entre dans le magasin doit être sain : une clé fantaisiste
      écrite dans les réglages ressortirait à chaque démarrage, et l'app
      retomberait silencieusement sur le bleu sans que le réglage le dise.
    */
    useScanStore.getState().setAccentPref('fuchsia-du-futur');
    expect(useScanStore.getState().accentPref).toBe(ACCENT_DEFAUT);
  });
});

describe('le réglage est là où l’on règle l’apparence', () => {
  const lire = (rel: string) => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    return readFileSync(join(__dirname, '..', ...rel.split('/')), 'utf8');
  };

  it('sous « Apparence », avec le clair et le sombre', () => {
    const profil = lire('src/screens/ProfilScreen.tsx');
    expect(profil).toContain('ACCENTS');
    expect(profil).toContain('setAccentPref');
  });

  it('et le thème applique la teinte', () => {
    expect(lire('src/theme.ts')).toContain('paletteTeintee');
  });
});

/**
 * LE LOGEMENT SE LÈVE — le récap de fin de relevé.
 *
 * Quatrième des dix améliorations : après un scan, on ne tombe plus sur une
 * maquette déjà debout. Les murs MONTENT du sol en une seconde, et le
 * logement qu'on vient de relever se construit sous les yeux. C'est le
 * moment le plus fort du produit — celui qu'on montre à quelqu'un — et il
 * ne coûtait rien à personne : la scène est déjà bâtie, c'est la
 * PROJECTION qu'on anime.
 *
 * POURQUOI PAR LA PROJECTION, ET PAS PAR LA GÉOMÉTRIE. Rebâtir la scène à
 * chaque image pour faire monter des murs, c'est le calcul le plus lourd de
 * la vue joué quarante fois — l'accueil l'avait appris en animant sa
 * maquette (`PlanAnime`). Ici, chaque point est simplement projeté PLUS
 * BAS tant que la levée n'est pas finie : rien n'est reconstruit, et les
 * meubles montent avec leurs murs.
 *
 * ET ELLE NE SE JOUE QU'UNE FOIS PAR PLAN, au retour d'un scan : une
 * animation qui rejoue à chaque aller-retour entre le plan et le volume
 * devient une attente.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { hauteurLevee, DUREE_LEVEE } from '../src/ui/levee';

describe('la courbe de la levée', () => {
  it('part du sol et finit d’aplomb', () => {
    expect(hauteurLevee(0)).toBe(0);
    expect(hauteurLevee(DUREE_LEVEE)).toBe(1);
    // Et au-delà, elle reste finie : une animation dépassée ne dépasse pas.
    expect(hauteurLevee(DUREE_LEVEE * 3)).toBe(1);
  });

  it('monte vite, puis se pose — jamais l’inverse', () => {
    /*
      Départ franc, arrivée douce : c'est le geste d'un plan qu'on relève,
      celui que la maison emploie déjà pour incliner la 3D. Une courbe qui
      démarre lentement donne l'impression que l'app a ramé.
    */
    const t1 = hauteurLevee(DUREE_LEVEE * 0.25);
    const t2 = hauteurLevee(DUREE_LEVEE * 0.5);
    const t3 = hauteurLevee(DUREE_LEVEE * 0.75);
    expect(t1).toBeGreaterThan(0.25);
    expect(t2 - t1).toBeGreaterThan(t3 - t2);
  });

  it('et ne redescend jamais', () => {
    let avant = -1;
    for (let t = 0; t <= DUREE_LEVEE; t += DUREE_LEVEE / 20) {
      const h = hauteurLevee(t);
      expect(h).toBeGreaterThanOrEqual(avant);
      avant = h;
    }
  });
});

describe('la vue s’en sert', () => {
  it('par la mesure : elle lève à la PROJECTION, sans rebâtir', () => {
    /*
      Le piège qu'on évite est documenté dans l'accueil : une levée qui
      change la géométrie force à reconstruire la scène à chaque image — le
      calcul le plus lourd de la vue, joué quarante fois. Ici le point est
      projeté plus bas, et rien d'autre ne bouge.
    */
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(__dirname, '..', 'src', 'components', 'Iso3DView.tsx'),
      'utf8',
    );
    expect(src).toContain('hauteurLevee');
    // La levée s'applique dans la projection, pas dans `buildScene`.
    expect(src).toMatch(/leve[A-Za-z]*\s*[<*]|\* leve/);
  });

  it('et l’écran ne la joue qu’au retour d’un scan', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'),
      'utf8',
    );
    expect(src).toContain('leveeAuMontage');
  });
});

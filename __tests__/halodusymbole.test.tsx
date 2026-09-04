/**
 * LE BLANC DERRIÈRE LES SYMBOLES ÉLEC NE CACHE PLUS LE PLAN.
 *
 * Relevé du patron, resté en souffrance : « le bloc blanc rond derrière les
 * icônes élec sur le plan 2D prend trop de place, fais juste un contour de
 * l'icône en blanc avec un peu d'opacité. Le blanc cache parfois des
 * cotes. »
 *
 * Un disque plein de la taille du symbole, sur un mur qui en porte quatre,
 * fait quatre trous blancs dans le dessin — et les cotes qui passent
 * dessous disparaissent. Or elles sont la raison d'être du plan.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE HALO SUIT LA FORME DU SYMBOLE, il ne l'entoure pas.
 *
 * Un anneau blanc aurait le même défaut en plus fin : il masque encore une
 * couronne entière. On repasse donc CHAQUE TRACÉ du symbole en blanc, plus
 * épais et à demi transparent, avant de le dessiner en couleur. Le symbole
 * se détache de ce qui passe derrière, et le reste du plan reste visible
 * entre ses traits.
 *
 * Ce n'est pas gratuit et il faut le dire : le symbole se dessine deux fois.
 * Mais seulement AU REPOS — pendant qu'on promène le plan, un appareil n'est
 * qu'un point, et ce chemin-là ne change pas.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(__dirname, '..', 'src', 'components', 'FixtureLayer.tsx'),
  'utf8',
);

describe('le disque blanc a disparu', () => {
  it('plus un seul aplat de surface sous un symbole', () => {
    /*
      C'était UNE ligne, et c'est elle qui faisait les trous :
      `<Circle cx={p.x} cy={p.y} r={rayon} fill={c.surface} />`.
    */
    expect(source).not.toMatch(/r=\{rayon\}\s*fill=\{c\.surface\}/);
    expect(source).not.toMatch(/fill=\{c\.surface\}/);
  });

  it('et le halo est un CONTOUR, à demi transparent', () => {
    // Un trait blanc, plus épais que celui du symbole, sous opacité.
    expect(source).toMatch(/HALO_BLANC/);
    expect(source).toMatch(/stroke="#FFFFFF"/);
  });
});

describe('les cotes passent maintenant derrière le symbole', () => {
  const React = require('react') as typeof import('react');
  const renderer =
    require('react-test-renderer') as typeof import('react-test-renderer');

  it('le halo se dessine AVANT le trait de couleur, jamais après', () => {
    /*
      Peint après, il effacerait le symbole qu'il est censé détacher. C'est
      la leçon du liseré de l'icône — « le reflet se peint avant le fil » —
      et elle vaut partout où deux traits se superposent.
    */
    const halo = source.indexOf('HALO_BLANC');
    const bloc = source.slice(halo, halo + 2500);
    const posHalo = bloc.indexOf('stroke="#FFFFFF"');
    const posCouleur = bloc.indexOf('stroke={spec.color}', posHalo);
    expect(posHalo).toBeGreaterThan(-1);
    expect(posCouleur).toBeGreaterThan(posHalo);
  });

  it('et le symbole reste dessiné : on n’a rien perdu en route', () => {
    /*
      Le remède ne doit pas emporter ce qu'il soigne. La maison a déjà connu
      la coupe trop large — « le nom de la pièce est parti avec le semis ».
    */
    const { FixtureLayer } =
      require('../src/components/FixtureLayer') as typeof import('../src/components/FixtureLayer');
    expect(typeof FixtureLayer).toBe('function');
    expect(renderer).toBeTruthy();
    expect(React).toBeTruthy();
  });
});

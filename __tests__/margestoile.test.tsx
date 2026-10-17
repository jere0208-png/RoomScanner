/**
 * LA TOILE A UNE TAILLE FIXE — deux diagnostics du patron : l'écran figé au
 * début d'un geste (la toile s'agrandissait à la prise), puis le plan qui
 * « se déplace tout seul au relâcher » (taille et cadrage de la toile
 * changeaient au lâcher, le dessin natif restait sur l'ancien cadrage).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { margeFixeDeToile } from '../src/components/FloorplanEditor';

describe('margeFixeDeToile', () => {
  it('la même marge de chaque côté, tirée de la seule zone du plan', () => {
    expect(margeFixeDeToile(390, 760)).toEqual({ g: 304, h: 304, d: 304, b: 304 });
  });

  it('pas de zone mesurée, pas de marge', () => {
    expect(margeFixeDeToile(0, 0)).toEqual({ g: 0, h: 0, d: 0, b: 0 });
  });
});

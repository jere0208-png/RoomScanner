/**
 * LES MARGES DE LA TOILE — diagnostic du patron : l'écran se figeait au
 * début d'un geste sur un plan zoomé, le temps de repeindre une toile
 * agrandie à la prise du doigt. Ses marges se calculent désormais au rendu,
 * du seul côté où le plan dépasse, et bornées.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { margesDeToile } from '../src/components/FloorplanEditor';

describe('margesDeToile', () => {
  it('un plan qui tient dans l’écran n’a aucune marge', () => {
    expect(margesDeToile([{ x: 60, y: 60 }, { x: 330, y: 700 }], 390, 760)).toEqual({ g: 0, h: 0, d: 0, b: 0 });
  });

  it('seulement du côté où il dépasse, avec l’air d’une cote', () => {
    const m = margesDeToile([{ x: 100, y: 100 }, { x: 500, y: 600 }], 390, 760);
    expect(m.g).toBe(0);
    expect(m.h).toBe(0);
    expect(m.b).toBe(0);
    expect(m.d).toBe(110 + 48);
  });

  it('bornée : un plan très zoomé ne fait pas peindre dix écrans', () => {
    const m = margesDeToile([{ x: -3000, y: -3000 }, { x: 4000, y: 4000 }], 390, 760);
    const max = Math.round(0.6 * 760);
    expect(m).toEqual({ g: max, h: max, d: max, b: max });
  });
});

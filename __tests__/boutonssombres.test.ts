/** En sombre, un bouton posé sur une surface se détache (captures du simulateur). */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
import { dark, light, themedStyles, SURFACE_BOUTON_SOMBRE, ombreBouton, shadowCard } from '../src/theme';
it('un bouton, pas une carte, s’éclaircit en sombre', () => {
  const g = themedStyles((c) => ({ b: { backgroundColor: c.surface, ...ombreBouton }, k: { backgroundColor: c.surface, ...shadowCard } }));
  expect(g(dark).b.backgroundColor).toBe(SURFACE_BOUTON_SOMBRE);
  expect(g(dark).k.backgroundColor).toBe(dark.surface);
  expect(g(light).b.backgroundColor).toBe(light.surface);
});

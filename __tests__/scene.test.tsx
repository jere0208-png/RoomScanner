/**
 * LA SCÈNE — l'entrée d'un écran, à la façon d'iOS.
 *
 * Relevé du patron : « des mouvements fluides de motion design ». Les écrans
 * se remplaçaient d'une coupe sèche. Chaque page qu'on ouvre depuis l'accueil
 * vient maintenant de la droite avec un ressort ; l'accueil et le plan se
 * fondent ; la caméra et le scan restent à l'image même.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Animated, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RECUL_POUSSEE, Scene } from '../src/components/Scene';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (entree: 'poussee' | 'fondu') => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <Scene entree={entree}>
        <Text>Page</Text>
      </Scene>,
    );
  });
  arbre = t;
  return t;
};

it('porte sa page, et l’amène par un mouvement — pas une coupe', () => {
  const t = monter('poussee');
  expect(t.root.findAllByType(Text).some((n) => n.props.children === 'Page')).toBe(true);
  const scene = t.root.findAllByType(Animated.View)[0];
  const style = Array.isArray(scene.props.style) ? Object.assign({}, ...scene.props.style) : scene.props.style;
  // L'opacité et la translation sont des valeurs animées, pas des nombres figés.
  expect(typeof style.opacity).toBe('object');
  expect(Array.isArray(style.transform)).toBe(true);
  expect('translateX' in style.transform[0]).toBe(true);
  expect(RECUL_POUSSEE).toBeGreaterThan(0);
});

it('le fondu grandit d’un rien au lieu de glisser', () => {
  const t = monter('fondu');
  const scene = t.root.findAllByType(Animated.View)[0];
  const style = Array.isArray(scene.props.style) ? Object.assign({}, ...scene.props.style) : scene.props.style;
  expect('scale' in style.transform[0]).toBe(true);
});

it('dans l’app : les pages poussées, l’accueil et le plan fondus, la caméra et le scan à l’image même', () => {
  const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
  for (const page of ['profil', 'confidentialite', 'library', 'export', 'devis', 'magasin', 'gamme']) {
    expect(app).toMatch(new RegExp(`screen === '${page}' && \\(\\s*<Scene entree="poussee"`));
  }
  for (const page of ['home', 'result']) {
    expect(app).toMatch(new RegExp(`screen === '${page}' && \\(\\s*<Scene entree="fondu"`));
  }
  expect(app).toContain("{screen === 'scan' && <ScanScreen />}");
  expect(app).toContain("{screen === 'camera' && <CameraScreen />}");
});

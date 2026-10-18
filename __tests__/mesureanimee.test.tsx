/**
 * LA RÈGLE SE MONTRE AVANT DE S'ESSAYER.
 *
 * Diagnostic du patron : « le bouton de mesure est peu explicite ; faire une
 * animation dans le pop-up qui indique point, trait qui se construit, point,
 * et mesure qui apparaît ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { Animated, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { AnimationDeMesure } from '../src/components/AnimationDeMesure';

const lire = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

describe('la règle animée', () => {
  it('joue le geste : deux points, un trait, une cote, et le dit à VoiceOver', () => {
    const debut = jest.spyOn(Animated, 'loop');
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<AnimationDeMesure cote="2,40 m" />);
    });
    expect(debut).toHaveBeenCalled();
    expect(r.root.findAllByType(Text).some((t) => t.props.children === '2,40 m')).toBe(true);
    const cadre = r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string')[0];
    expect(cadre.props.accessibilityLabel).toContain('premier point');
    act(() => r.unmount());
    debut.mockRestore();
  });

  it('le bandeau de la règle la montre tant qu’aucun point n’est posé', () => {
    const src = lire('src', 'screens', 'ResultScreen.tsx');
    expect(src).toContain('illustration={!regle.a ? <AnimationDeMesure /> : undefined}');
    expect(lire('src', 'components', 'StripBar.tsx')).toContain('{illustration}');
  });

  it('« Réduire les animations » : le dessin s’arrête sur sa fin', () => {
    const src = lire('src', 'components', 'AnimationDeMesure.tsx');
    expect(src).toContain('useReduceMotion()');
    expect(src).toContain('for (const v of [pointA, trait, pointB, texte, tout]) v.setValue(1);');
  });
});

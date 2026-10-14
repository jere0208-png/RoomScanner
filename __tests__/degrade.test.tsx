/**
 * LE FOND D'UN BOUTON VA JUSQU'À SON BORD — relevé du patron : sur la carte
 * de fin de scan, le dégradé du score et des boutons « Voir en 3D » et
 * « Chez moi » s'arrêtait avant le bord droit.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { Degrade } from '../src/components/Degrade';

it('se dessine à la taille mesurée du bloc, et sa couleur le remplit avant', () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<Degrade id="g" de="#000000" a="#2563EB" />);
  });
  const fond = t.root.findAllByType(View).find((n) => typeof n.props.onLayout === 'function')!;
  expect(JSON.stringify(fond.props.style)).toContain('#2563EB');
  act(() => fond.props.onLayout({ nativeEvent: { layout: { width: 172, height: 104 } } }));
  const svg = t.root.findByType(Svg);
  expect([svg.props.width, svg.props.height]).toEqual([172, 104]);
  expect(t.root.findByType(Rect).props.width).toBe(172);
});

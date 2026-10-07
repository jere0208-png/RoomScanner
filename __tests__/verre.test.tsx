/**
 * LE VERRE — la matière translucide d'iOS, et ce qui en tient lieu au banc.
 *
 * Relevé du patron : « un effet "glass" transparent (...) sans gêner la
 * vision ». Sur l'iPhone, `RoomScanVerre` est un `UIVisualEffectView` ; ici,
 * sans natif, un voile clair porte les mêmes enfants et le même style — le
 * dessin ne change pas, seule la matière.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Verre } from '../src/components/Verre';

it('sans natif, un voile qui porte ses enfants et son style', () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <Verre style={{ borderRadius: 20 }} accessibilityLabel="Carte">
        <Text>Plan</Text>
      </Verre>,
    );
  });
  const v = t.root.findAllByType(View).find((n) => n.props.accessibilityLabel === 'Carte')!;
  expect(v).toBeDefined();
  expect(t.root.findAllByType(Text).some((n) => n.props.children === 'Plan')).toBe(true);
  act(() => t.unmount());
});

it('le natif : un UIVisualEffectView sous les enfants, qui suit le rayon', () => {
  const s = readFileSync(
    join(__dirname, '..', 'modules/react-native-room-scan/ios/RoomScanVerre.swift'),
    'utf8',
  );
  expect(s).toContain('UIVisualEffectView');
  expect(s).toContain('systemUltraThinMaterial');
  expect(s).toContain('didUpdateReactSubviews');
  expect(s).toContain('effet.layer.cornerRadius = layer.cornerRadius');
  const m = readFileSync(join(__dirname, '..', 'modules/react-native-room-scan/ios/RoomScan.m'), 'utf8');
  expect(m).toContain('RCT_EXTERN_MODULE(RoomScanVerreManager, RCTViewManager)');
  expect(m).toContain('RCT_EXPORT_VIEW_PROPERTY(epais, BOOL)');
});

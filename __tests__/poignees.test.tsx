/**
 * Les poignées d'un meuble : leur geste doit SURVIVRE au déplacement.
 *
 * C'est la panne qu'on n'aurait jamais trouvée à la lecture. Le meuble bouge
 * → le store le recrée → la prop `raw` est un objet neuf → le `useMemo` qui
 * fabriquait le `PanResponder` se ré-exécutait → un responder tout neuf, dont
 * le `dx` cumulé repart de zéro alors que le doigt, lui, n'a pas quitté
 * l'écran. Résultat à l'usage : le meuble tressaute, revient à sa position de
 * départ, et paraît impossible à déplacer.
 *
 * Le test ne simule pas des touches : il vérifie l'invariant qui compte —
 * les gestionnaires ne changent pas d'identité quand le meuble bouge.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ObjectDragHandle, RotateHandle } from '../src/components/FloorplanEditor';

const mapping = {
  scale: 100,
  toPx: (p: { x: number; z: number }) => ({ x: p.x * 100, y: p.z * 100 }),
  deltaToMeters: (dx: number, dy: number) => ({ x: dx / 100, z: dy / 100 }),
  toMeters: (px: { x: number; y: number }) => ({ x: px.x / 100, z: px.y / 100 }),
};

/** Matrice colonne-major d'un meuble posé en (x, z), sans rotation. */
const tf = (x: number, z: number) => [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1,
];

const handlersOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(View)[0].props;

describe('la poignée de déplacement', () => {
  const rendre = (x: number, z: number) => (
    <ObjectDragHandle
      objectId="o1"
      center={{ x: x * 100, y: z * 100 }}
      half={{ x: 70, y: 95 }}
      mapping={mapping}
      raw={{ transform: tf(x, z), width: 1.4 }}
    />
  );

  it('garde le MÊME responder quand le meuble se déplace', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(rendre(1.75, 1.22));
    });
    const avant = handlersOf(tree);
    // Vingt images de glissement : autant de props `raw` différentes.
    for (let i = 1; i <= 20; i++) {
      const dz = 1.22 - i * 0.01;
      act(() => {
        tree.update(rendre(1.75, dz));
      });
    }
    const apres = handlersOf(tree);
    expect(apres.onResponderMove).toBe(avant.onResponderMove);
    expect(apres.onResponderGrant).toBe(avant.onResponderGrant);
    expect(apres.onStartShouldSetResponder).toBe(avant.onStartShouldSetResponder);
  });

  it('ne rend jamais le geste au plan', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(rendre(1.75, 1.22));
    });
    const h = handlersOf(tree);
    const evt = { nativeEvent: { touches: [] }, touchHistory: {} } as never;
    // Le plan redemande la main à chaque mouvement : on refuse.
    expect(h.onResponderTerminationRequest(evt)).toBe(false);
    // Et on prend la main dès le premier pixel, sans attendre.
    expect(h.onStartShouldSetResponder(evt)).toBe(true);
    expect(h.onMoveShouldSetResponder(evt)).toBe(true);
  });
});

describe('la poignée de rotation', () => {
  const rendre = (yaw: number) => (
    <RotateHandle
      objectId="o1"
      center={{ x: 175, y: 122 }}
      at={{ x: 175 + 70 * Math.cos(yaw), y: 122 + 70 * Math.sin(yaw) }}
      raw={{ transform: tf(1.75, 1.22) }}
      viewRot={0}
      frame={0}
    />
  );

  it('garde le MÊME responder pendant que le meuble tourne', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(rendre(0));
    });
    const avant = handlersOf(tree);
    for (let i = 1; i <= 12; i++) {
      act(() => {
        tree.update(rendre((i * Math.PI) / 24));
      });
    }
    expect(handlersOf(tree).onResponderMove).toBe(avant.onResponderMove);
  });
});

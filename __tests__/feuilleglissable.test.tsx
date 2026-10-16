/**
 * LA POIGNEE SE TIRE.
 *
 * Releve de la revue : « la barre en haut des feuilles ne fait rien ».
 * C'etait un dessin. Toutes les feuilles d'iOS se referment en la tirant
 * vers le bas — c'est le premier geste qu'on tente. Assez loin (30 % de la
 * hauteur) ou assez vite (0,8 point par milliseconde), la feuille part ;
 * sinon elle revient. Et le defilement interne garde son doigt : la
 * poignee n'est pas dans la vue qui defile.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { ScrollView, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { SheetShell, glisserFerme } from '../src/components/Sheet';
import { useAlerte } from '../src/ui/alerte';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());
beforeEach(() => useAlerte.setState({ courante: null, file: [], hotes: [] }));

/** L'historique de toucher que le repondeur de React Native tient. */
const histoire = (y: number, yAvant: number, t: number, tAvant: number) => ({
  numberActiveTouches: 1,
  indexOfSingleActiveTouch: 0,
  mostRecentTimeStamp: t,
  touchBank: [
    {
      touchActive: true,
      startPageX: 100,
      startPageY: 0,
      startTimeStamp: 0,
      currentPageX: 100,
      currentPageY: y,
      currentTimeStamp: t,
      previousPageX: 100,
      previousPageY: yAvant,
      previousTimeStamp: tAvant,
    },
  ],
});
const ev = (h: ReturnType<typeof histoire>) => ({
  nativeEvent: { touches: [], changedTouches: [], pageX: 100, pageY: 0, timestamp: h.mostRecentTimeStamp },
  touchHistory: h,
});

const monter = () => {
  const fermetures: number[] = [];
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <SheetShell visible onClose={() => fermetures.push(1)}>
        <Text>Contenu</Text>
      </SheetShell>,
    );
  });
  act(() => {
    jest.advanceTimersByTime(300);
  });
  const carte = t.root.findAll((n) => n.props?.testID === 'carte-feuille' && typeof n.type === 'string')[0];
  act(() => carte.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 400 } } }));
  const poignee = t.root.findAll((n) => n.props?.testID === 'poignee-feuille' && typeof n.type === 'string')[0];
  return { t, fermetures, poignee };
};

/** Un geste : posé en haut, tiré de `dy` en `ms` millisecondes, lâché. */
const tirer = (poignee: TestRenderer.ReactTestInstance, dy: number, ms: number) => {
  const p = poignee.props;
  expect(p.onStartShouldSetResponder(ev(histoire(0, 0, 1, 0)))).toBe(true);
  act(() => p.onResponderGrant(ev(histoire(0, 0, 1, 0))));
  act(() => p.onResponderMove(ev(histoire(dy, 0, 1 + ms, 1))));
  act(() => p.onResponderRelease(ev(histoire(dy, dy, 2 + ms, 1 + ms))));
};

describe('la regle', () => {
  it('assez loin ou assez vite, et jamais vers le haut', () => {
    expect(glisserFerme(130, 0, 400)).toBe(true);
    expect(glisserFerme(100, 0.2, 400)).toBe(false);
    expect(glisserFerme(30, 1.2, 400)).toBe(true);
    expect(glisserFerme(-200, 2, 400)).toBe(false);
  });
});

describe('la poignee', () => {
  it('tiree loin vers le bas, ferme la feuille', () => {
    const { t, fermetures, poignee } = monter();
    tirer(poignee, 200, 400);
    expect(fermetures).toHaveLength(1);
    act(() => t.unmount());
  });

  it('une pichenette suffit', () => {
    const { t, fermetures, poignee } = monter();
    tirer(poignee, 40, 20);
    expect(fermetures).toHaveLength(1);
    act(() => t.unmount());
  });

  it('un doigt qui hesite ne ferme rien : la feuille revient', () => {
    const { t, fermetures, poignee } = monter();
    tirer(poignee, 50, 500);
    expect(fermetures).toHaveLength(0);
    act(() => t.unmount());
  });

  it('n’est pas dans la vue qui defile : le defilement garde son doigt', () => {
    const { t, poignee } = monter();
    for (const d of t.root.findAllByType(ScrollView)) {
      expect(d.findAll((n) => n === poignee)).toHaveLength(0);
    }
    act(() => t.unmount());
  });
});

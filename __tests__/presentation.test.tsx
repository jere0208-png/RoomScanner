/**
 * LA PRÉSENTATION — le cadre commun du premier lancement et du guide.
 *
 * Relevé du patron : « des gros titres avec grandes images très visuelles ».
 * Un visuel grand dans une carte, un titre sur deux lignes, des tirets,
 * « Passer », un bouton — et le geste de tourner la page au pouce. Ce banc
 * tient le cadre ; ce que chaque présentation y met se vérifie chez elle
 * (`premierlancement`, `guidepose`).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Presentation, SEUIL_BALAYAGE, type PageDePresentation } from '../src/components/Presentation';
import { light } from '../src/theme';

const PAGES: PageDePresentation[] = [
  { cle: 'a', titre: 'Balayez la pièce', phrase: 'Un.', visuel: ({ w, h }) => <View testID="visuel" style={{ width: w, height: h }} /> },
  { cle: 'b', titre: 'Aménagez-la', phrase: 'Deux.', visuel: () => <View testID="visuel" /> },
  { cle: 'c', titre: 'Question', phrase: '', sansBouton: true, corps: <Text>Corps libre</Text> },
];
const LABELS = { passer: 'Passer', suivant: 'Suivant', finir: 'Commencer', finirTexte: 'C’est parti' };

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (rang: number, onRang = jest.fn(), onFinir = jest.fn(), onPasser = jest.fn()) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <Presentation pages={PAGES} rang={rang} onRang={onRang} onPasser={onPasser} onFinir={onFinir} labels={LABELS} />,
    );
  });
  arbre = t;
  return { t, onRang, onFinir, onPasser };
};
const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root.findAll((n) => n.props?.accessibilityLabel === nom && typeof n.props?.onPress === 'function')[0];
const mots = (t: TestRenderer.ReactTestRenderer) => t.root.findAllByType(Text).map((n) => String(n.props.children));

it('le visuel reçoit une taille dès la première image, et le titre tient sur deux lignes', () => {
  const { t } = monter(0);
  const v = t.root.findAll((n) => n.props?.testID === 'visuel')[0];
  const st = StyleSheet.flatten(v.props.style) as { width: number; height: number };
  expect(st.width).toBeGreaterThan(200);
  expect(st.height).toBeGreaterThan(200);
  const titre = t.root.findAllByType(Text).find((n) => n.props.children === 'Balayez la pièce')!;
  expect(titre.props.numberOfLines).toBe(2);
  expect(StyleSheet.flatten(titre.props.style).fontSize).toBeGreaterThanOrEqual(32);
});

it('les tirets : un par page, le vif suit', () => {
  const { t } = monter(1);
  const points = t.root.findAll((n) => String(n.props?.testID ?? '').startsWith('point-') && n.type === View);
  expect(points).toHaveLength(3);
  const vifs = points.map((p) => (StyleSheet.flatten(p.props.style) as { backgroundColor?: string }).backgroundColor === light.blue);
  expect(vifs).toEqual([false, true, false]);
});

it('« Suivant » tourne, « Passer » sort, la dernière page lance', () => {
  const a = monter(0);
  act(() => bouton(a.t, 'Suivant').props.onPress());
  expect(a.onRang).toHaveBeenCalledWith(1);
  act(() => bouton(a.t, 'Passer').props.onPress());
  expect(a.onPasser).toHaveBeenCalled();
  act(() => arbre?.unmount());
  arbre = null;
  // Une page « corps libre » sans bouton : elle se conclut d'elle-même.
  const b = monter(2);
  expect(mots(b.t)).toContain('Corps libre');
  expect(bouton(b.t, 'Commencer')).toBeUndefined();
  expect(bouton(b.t, 'Suivant')).toBeUndefined();
});

/*
  UN DOIGT CRÉDIBLE POUR LE `PanResponder` — le piège que la maison connaît :
  il recalcule le geste depuis `touchHistory`. On lui donne un doigt parti
  d'un point et arrivé à un autre.
*/
const doigt = (x0: number, x: number, actif = true) => ({
  nativeEvent: {
    touches: actif ? [{ identifier: 0, pageX: x, pageY: 300, locationX: x, locationY: 300 }] : [],
    changedTouches: [{ identifier: 0, pageX: x, pageY: 300 }],
    identifier: 0,
    pageX: x,
    pageY: 300,
    locationX: x,
    locationY: 300,
    timestamp: 2000,
  },
  touchHistory: {
    touchBank: [
      {
        touchActive: actif,
        startPageX: x0,
        startPageY: 300,
        startTimeStamp: 1000,
        currentPageX: x,
        currentPageY: 300,
        currentTimeStamp: 2000,
        previousPageX: x0,
        previousPageY: 300,
        previousTimeStamp: 1900,
      },
    ],
    numberActiveTouches: actif ? 1 : 0,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: 2000,
  },
});
const balayer = (t: TestRenderer.ReactTestRenderer, dx: number) => {
  const zone = t.root.findAll((n) => typeof n.props?.onResponderRelease === 'function')[0];
  act(() => {
    zone.props.onStartShouldSetResponder(doigt(300, 300));
    zone.props.onResponderGrant(doigt(300, 300));
    zone.props.onResponderMove(doigt(300, 300 + dx));
    zone.props.onResponderRelease(doigt(300, 300 + dx, false));
  });
};

it('on balaie pour tourner la page : vers la gauche la suivante, vers la droite la précédente', () => {
  const a = monter(1);
  balayer(a.t, -(SEUIL_BALAYAGE + 20));
  expect(a.onRang).toHaveBeenLastCalledWith(2);
  balayer(a.t, SEUIL_BALAYAGE + 20);
  expect(a.onRang).toHaveBeenLastCalledWith(0);
  // Un doigt qui hésite ne tourne rien.
  a.onRang.mockClear();
  balayer(a.t, -(SEUIL_BALAYAGE - 20));
  expect(a.onRang).not.toHaveBeenCalled();
  act(() => arbre?.unmount());
  arbre = null;
  // À la première page, vers la droite : rien avant.
  const b = monter(0);
  balayer(b.t, SEUIL_BALAYAGE + 20);
  expect(b.onRang).not.toHaveBeenCalled();
});

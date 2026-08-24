/**
 * LE CONTOUR DU BOUTON D'ÉDITION — DES POINTILLÉS QUI TOURNENT.
 *
 * Relevé du patron : « autour du bouton éditer, fais un contour de
 * pointillés bleus de notre app, et fais-les tourner en animation ».
 *
 * C'est la marque du logiciel de dessin depuis toujours : un contour de
 * fourmis qui défilent dit « ceci est en cours de modification », là où un
 * trait posé dit seulement « ceci est sélectionné ». On entre en édition,
 * le contour se met à tourner ; on en sort, il s'arrête et disparaît.
 *
 * Trois choses se comptent ici, parce qu'aucune ne se voit dans un banc :
 *
 *   — le contour est POINTILLÉ, et de la couleur de la maison ;
 *   — son décalage est une valeur ANIMÉE, pas un nombre : c'est ce qui fait
 *     défiler les tirets. Un nombre en dur voudrait dire qu'ils sont
 *     immobiles, et le banc passerait quand même ;
 *   — le motif RETOMBE JUSTE sur le tour du contour. Un cycle qui ne divise
 *     pas le périmètre laisse un tiret coupé au raccord, qui saute à chaque
 *     tour : c'est le genre de défaut qu'on ne voit qu'après l'avoir livré.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Rect } from 'react-native-svg';
import { ToolPill } from '../src/components/ToolPill';
import { light } from '../src/theme';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (actif: boolean) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <ToolPill
        icon="edit"
        label="Édition"
        active={actif}
        halo
        onPress={() => {}}
      />,
    );
  });
  act(() => jest.advanceTimersByTime(200));
  arbre = t;
  return t;
};

/** L'anneau : le seul tracé qui porte un pointillé. */
const anneau = (t: TestRenderer.ReactTestRenderer) =>
  t.root.findAllByType(Rect).find((n) => !!n.props.strokeDasharray);

describe('le contour du bouton d’édition', () => {
  it('cerne la pastille de pointillés bleus quand on édite', () => {
    const r = anneau(monter(true));
    expect(r).toBeDefined();
    expect(r!.props.stroke).toBe(light.blue);
    expect(r!.props.fill).toBe('none');
  });

  it('et les fait défiler : le décalage bouge tout seul', () => {
    const t = monter(true);
    const avant = Number(anneau(t)!.props.strokeDashoffset);
    act(() => jest.advanceTimersByTime(300));
    const apres = Number(anneau(t)!.props.strokeDashoffset);
    // Le composant animé rend la valeur RÉSOLUE : ce n'est donc pas sa
    // nature qui prouve le mouvement, c'est qu'elle ait changé entre deux
    // images. Un décalage figé passerait tous les autres bancs.
    expect(`décalage : ${avant} → ${apres}`).not.toBe(
      `décalage : ${avant} → ${avant}`,
    );
  });

  it('sur un motif qui retombe juste au bout du tour', () => {
    const r = anneau(monter(true))!;
    const [tiret, vide] = r.props.strokeDasharray as [number, number];
    // Le contour : un carré de 36 aux angles arrondis de 12.
    const perimetre = 4 * (36 - 2 * 12) + 2 * Math.PI * 12;
    const cycle = tiret + vide;
    const tours = perimetre / cycle;
    expect(Math.abs(tours - Math.round(tours))).toBeLessThan(1e-9);
  });

  it('et rien du tout quand on n’édite pas', () => {
    expect(anneau(monter(false))).toBeUndefined();
  });
});

/**
 * LES COTES DE LA PIÈCE SE TOUCHENT — et se voient se toucher.
 *
 * Le bandeau affichait « 20,0 m2 · 5,00 x 4,00 m » juste à cote d'une
 * hauteur sous plafond, elle, éditable d'un appui. Deux nombres de meme
 * nature, un seul modifiable : on posait un « Sejour 5,00 x 4,00 » depuis
 * le catalogue, le metre donnait 5,18, et corriger dix-huit centimetres
 * demandait de deplacer QUATRE murs a la main.
 *
 * Le crayon est ce qui fait la difference entre un nombre qu'on lit et un
 * nombre qu'on change : sans lui, personne n'essaie de toucher.
 *
 * ET IL N'APPARAIT PAS SUR UN CONTOUR LIBRE. « Largeur x profondeur » ne
 * decrit qu'un rectangle ; sur un L, les deux memes nombres admettent une
 * infinite de dessins. L'ecran ne propose alors rien — un bouton qui ne
 * peut pas aboutir est pire qu'un bouton absent.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { RoomBar } from '../src/components/RoomBar';
import { getStyles } from '../src/screens/result/styles';
import { light } from '../src/theme';

const styles = getStyles(light) as unknown as Record<string, object>;

const monter = (onCotes?: () => void) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <RoomBar
        room={{ id: 'r1', name: 'Sejour', wallIds: [] } as never}
        surface={{ area: 20, exact: true } as never}
        extent={{ width: 5, depth: 4 } as never}
        hauteur={2.5}
        styles={styles}
        onName={() => {}}
        onCotes={onCotes}
        onHeight={() => {}}
        onDupliquer={() => {}}
        onScinder={() => {}}
        onPeindre={() => {}}
      />,
    );
  });
  return t;
};

/** Le nœud qui porte le libellé donné, s'il existe. */
const par = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAll((n) => n.props?.accessibilityLabel === label)[0];

describe('les cotes du bandeau de piece', () => {
  it('s’ouvrent d’un appui sur un rectangle', () => {
    const vus: string[] = [];
    const t = monter(() => vus.push('touche'));
    const cible = par(t, 'Cotes de la piece'.replace('piece', 'pièce'));
    expect(cible).toBeDefined();
    act(() => cible.props.onPress());
    expect(vus).toEqual(['touche']);
    act(() => t.unmount());
  });

  it('portent le crayon, sinon personne n’essaie', () => {
    const t = monter(() => {});
    // Le crayon est un tracé SVG : on le cherche par sa présence, pas par
    // sa forme — c'est le signe qui compte, pas ses courbes.
    const traces = t.root.findAll(
      (n) => typeof n.type !== 'string' && !!n.props?.d,
    );
    expect(traces.length).toBeGreaterThan(0);
    act(() => t.unmount());
  });

  it('ne proposent rien sur un contour libre', () => {
    const t = monter(undefined);
    expect(par(t, 'Cotes de la pièce')).toBeUndefined();
    act(() => t.unmount());
  });
});

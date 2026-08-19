/**
 * LES APPAREILS S'ÉCRIVENT, ils ne se posent plus en points de couleur.
 *
 * Vu de loin, un appareil se réduisait à une pastille de quatre pixels : on
 * savait qu'il y avait quelque chose, jamais quoi. Sur un mur qui en porte
 * trois, on comptait des confettis. Le sigle tient dans la même place et dit
 * la nature — « PC », « I », « RJ » — dans la couleur de sa famille.
 *
 * Deux choses à tenir, et les planches de rendu ne les voient pas : elles
 * cadrent le plan à un zoom où le symbole complet est déjà dessiné, donc là
 * où le point n'existait pas.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FixtureLayer } from '../src/components/FixtureLayer';
import { wallQuads } from '../src/geometry/floorplan';
import { light } from '../src/theme';
import { FIXTURES } from '../src/geometry/electrical';
import type { Fixture } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const MURS = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];

const APPAREILS: Fixture[] = [
  { id: 'f1', kind: 'prise', wallId: 'n', along: 1.2, height: 0.25, side: 1 },
  { id: 'f2', kind: 'inter', wallId: 'n', along: 2.4, height: 1.1, side: 1 },
  { id: 'f3', kind: 'rj45', wallId: 'e', along: 1.5, height: 0.25, side: 1 },
];

/**
 * Le plan à un niveau de détail donné.
 *
 * `elecLod` va de 0 — trop loin pour lire un symbole, on écrit le sigle — à
 * 1, où le symbole complet se dessine. C'est la seule chose qui décide de ce
 * qu'on voit.
 */
function rendre(scale: number, elecLod: number) {
  const mapping = {
    scale,
    toPx: (p: { x: number; z: number }) => ({ x: p.x * scale, y: p.z * scale }),
    toMeters: (px: { x: number; y: number }) => ({
      x: px.x / scale,
      z: px.y / scale,
    }),
    deltaToMeters: (dx: number, dy: number) => ({ x: dx / scale, z: dy / scale }),
  };
  let arbre!: TestRenderer.ReactTestRenderer;
  act(() => {
    arbre = TestRenderer.create(
      <Svg width={400} height={400}>
        <FixtureLayer
          walls={MURS}
          fixtures={APPAREILS}
          quads={wallQuads(MURS)}
          mapping={mapping}
          viewRot={0}
          elecLod={elecLod}
          c={light}
        />
      </Svg>,
    );
  });
  return arbre;
}

const textes = (a: TestRenderer.ReactTestRenderer) =>
  a.root.findAllByType(SvgText).map((n) => String(n.props.children));

/*
  D'ABORD LE SYMBOLE, LE MOT VIENT AU ZOOM.

  Première règle, et son défaut : on écrivait le SIGLE de loin — « PC »,
  « I », « RJ » — pour remplacer une pastille de quatre pixels qui ne disait
  rien. C'était juste sur un appareil isolé. Sur un mur qui en porte trois,
  relevé du chantier à l'appui, les mots se chevauchent et donnent
  « PC2TAB » : une bouillie que ni l'œil ni le zoom ne démêlent.

  Un symbole, lui, ne se chevauche pas de la même façon : il occupe une
  place fixe et se reconnaît à sa forme. C'est donc lui qui tient le plan de
  loin, et la dénomination n'apparaît qu'en zoomant — la règle de tout
  logiciel de plan : c'est petit d'abord, et plus on agrandit, plus on lit.
*/
describe('les repères d’appareils, vus de loin', () => {
  it('montrent leur symbole, et aucun mot', () => {
    const a = rendre(45, 0);
    // Le symbole est là : des tracés, pas un point.
    expect(a.root.findAllByType(Path).length).toBeGreaterThan(0);
    // Et pas un seul sigle : c'est ce qui formait la bouillie.
    const vus = textes(a);
    expect(vus).not.toContain('PC');
    expect(vus).not.toContain('RJ');
    act(() => a.unmount());
  });

  /**
   * ET PLUS UN SEUL DISQUE DE COULEUR.
   *
   * Les cercles qui restent sont la cible tactile (transparente) et le fond
   * clair du symbole ; aucun ne porte la couleur de l'appareil.
   */
  it('ne pose plus de pastille colorée', () => {
    const a = rendre(45, 0);
    const couleurs = new Set(
      Object.values(FIXTURES).map((s) => s.color.toLowerCase()),
    );
    const pastilles = a.root
      .findAllByType(Circle)
      .filter((n) => couleurs.has(String(n.props.fill).toLowerCase()));
    expect(pastilles).toHaveLength(0);
    act(() => a.unmount());
  });

  it('grossissent avec le zoom, sans jamais devenir un point', () => {
    const loin = rendre(45, 0);
    const petit = loin.root.findAllByType(Circle).map((n) => Number(n.props.r));
    act(() => loin.unmount());
    const pres = rendre(140, 1);
    const grand = pres.root.findAllByType(Circle).map((n) => Number(n.props.r));
    act(() => pres.unmount());
    // Le fond du symbole grandit : de loin il reste lisible, de près il a la
    // place de porter son dessin.
    expect(Math.max(...grand)).toBeGreaterThan(Math.max(...petit));
    expect(Math.min(...petit.filter((r) => r > 0))).toBeGreaterThan(3);
  });

  /** De près, la dénomination paraît : c'est là qu'on a la place de lire. */
  it('écrivent leur nom une fois qu’on a zoomé', () => {
    const a = rendre(140, 1);
    const vus = textes(a).join(' | ');
    expect(vus).toContain('PC');
    act(() => a.unmount());
  });
});

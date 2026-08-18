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
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
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

describe('les repères d’appareils, vus de loin', () => {
  it('écrivent leur sigle au lieu de poser un point', () => {
    const a = rendre(45, 0);
    const vus = textes(a);
    expect(vus).toContain('PC');
    expect(vus).toContain('I');
    expect(vus).toContain('RJ');
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

  /**
   * LE SIGLE PORTE SA COULEUR, ET UN LISERÉ CLAIR.
   *
   * Sans ce contour, un sigle ambre posé sur le poché d'un mur disparaît
   * dans le noir — c'est le défaut qu'on vient de corriger sur les cotes de
   * la vitrine, et il se pose ici de la même façon.
   */
  it('colore le sigle et le cerne de clair', () => {
    const a = rendre(45, 0);
    const pc = a.root
      .findAllByType(SvgText)
      .filter((n) => String(n.props.children) === 'PC');
    // Deux passes : le liseré, puis le texte.
    expect(pc.length).toBeGreaterThanOrEqual(2);
    const couleurs = pc.map((n) => String(n.props.fill).toLowerCase());
    expect(couleurs).toContain(FIXTURES.prise.color.toLowerCase());
    expect(pc.some((n) => n.props.stroke && n.props.strokeWidth >= 2)).toBe(true);
    act(() => a.unmount());
  });

  /** De près, le symbole complet reprend la main : on ne double pas. */
  it('cède la place au symbole quand on zoome', () => {
    const a = rendre(140, 1);
    const cercles = a.root.findAllByType(Circle).length;
    expect(cercles).toBeGreaterThan(0);
    act(() => a.unmount());
  });
});

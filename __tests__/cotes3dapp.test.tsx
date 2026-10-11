/**
 * LES COTES DE LA 3D DE L'APP, À LA FAÇON D'UN ARCHITECTE.
 *
 * Relevé du patron : « rends les cotes 3D plus professionnelles, sans gêner
 * le plan avec les délimitations et sans gros bloc blanc arrière ; un rendu
 * clean et compréhensible ».
 *
 * Le bouton « Cotes » de la 3D noircissait TOUTES les arêtes du modèle et
 * posait un chiffre détouré de blanc sur chaque mur, cloisons comprises, et
 * une hauteur sur chaque angle. Il cote désormais l'enveloppe, hors du
 * volume (voir `geometry/cotes3d`), comme le dossier PDF ; le modèle garde
 * ses traits.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { Line, Path, Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { Iso3DView } from '../src/components/Iso3DView';
import { useScanStore } from '../src/store/scanStore';
import { detectRooms, type WallSeg } from '../src/geometry/floorplan';

let n = 0;
const mur = (ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id: `m${n++}`,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
});
// Deux pièces, 4 × 3 et 5 × 3, un refend, et un muret isolé dans la seconde.
const MURS = [
  mur(0, 0, 4, 0),
  mur(4, 0, 9, 0),
  mur(9, 0, 9, 3),
  mur(9, 3, 4, 3),
  mur(4, 3, 0, 3),
  mur(0, 3, 0, 0),
  mur(4, 0, 4, 3),
  mur(6, 1, 7.37, 1),
];
const ROOMS = detectRooms(MURS).map((r, i) => ({ id: `r${i}`, name: i ? 'Séjour' : 'Chambre', wallIds: r.wallIds, floor: null }));

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (showMeasures: boolean) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: MURS,
      openings: [],
      objects: [],
      rooms: ROOMS as never,
      fixtures: [],
      ceiling: [],
      photos: [],
      niveauCourant: 0,
    } as never);
    t = TestRenderer.create(
      <Iso3DView value={{ theta: -32, tilt: 56, zoom: 1, ox: 0, oy: 0 }} showMeasures={showMeasures} />,
    );
  });
  act(() => {
    const zone = t.root.findAllByType(View).find((x) => typeof x.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: 600, height: 480 } } });
  });
  arbre = t;
  return t;
};

const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(SvgText)
    .map((x) =>
      (Array.isArray(x.props.children) ? x.props.children : [x.props.children])
        .filter((v: unknown) => typeof v === 'string' || typeof v === 'number')
        .join(''),
    );

describe('les cotes de la 3D', () => {
  it('cotent l’enveloppe, pas la cloison ni le muret, et la hauteur une fois', () => {
    const vus = mots(monter(true)).filter((m) => /^\d+,\d{2} m$/.test(m));
    expect(vus.filter((m) => m !== '2,50 m').sort()).toEqual(['3,00 m', '3,00 m', '4,00 m', '4,00 m', '5,00 m', '5,00 m']);
    expect(vus.filter((m) => m === '2,50 m')).toHaveLength(1);
    expect(vus).not.toContain('1,37 m');
  });

  it('sans pavé ni détourage blanc sous les chiffres', () => {
    const t = monter(true);
    const chiffres = t.root.findAllByType(SvgText).filter((x) => /\d+,\d{2} m/.test(String(x.props.children)));
    expect(chiffres.length).toBeGreaterThan(0);
    for (const c of chiffres) expect(c.props.stroke).toBeUndefined();
  });

  it('avec leurs lignes de cote et de rappel', () => {
    const t = monter(true);
    // Six longueurs et une hauteur : une ligne de cote, deux rappels, deux obliques chacune.
    expect(t.root.findAllByType(Line).length).toBeGreaterThanOrEqual(7 * 5);
  });

  it('le modèle garde ses traits : le bouton ne noircit plus toutes les arêtes', () => {
    const noires = (t: TestRenderer.ReactTestRenderer) =>
      t.root.findAllByType(Path).filter((p) => p.props.stroke === '#0B0D12').length;
    expect(noires(monter(true))).toBe(noires(monter(false)));
  });
});

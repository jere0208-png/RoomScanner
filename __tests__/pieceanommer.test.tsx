/**
 * UNE PIÈCE SANS NOM N'EST PAS UNE PIÈCE CONFORME.
 *
 * Passe au doigt sur l'établi, mur par mur, pièce par pièce. Sur un relevé
 * frais, les pièces s'appellent « Pièce 1 », « Pièce 2 » tant qu'on ne les a
 * pas nommées — c'est le cas NORMAL au retour du chantier, le nommage se
 * fait au calme.
 *
 * Et l'établi annonçait, pour ces pièces-là : « Pièce 1 · 2/1 socle ».
 * C'est-à-dire CONFORME. La même pièce nommée « Chambre » en exige trois, et
 * nommée « Cuisine », six. Le relevé passait, le chantier non.
 *
 * La faute n'est pas dans le calcul : `roomUse` rend « autre » faute de
 * mieux, et « autre » exige bien un socle — c'est le bon minimum à appliquer
 * en attendant de savoir. La faute est dans l'AFFICHAGE : un objectif atteint
 * se lit comme une conformité acquise, alors qu'on ne sait pas encore de
 * quelle pièce il s'agit.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, View } from 'react-native';
import { Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { WallElevation } from '../src/components/WallElevation';
import { usageConnu } from '../src/geometry/nfc15100';
import { useScanStore } from '../src/store/scanStore';
import type { Fixture } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const W: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];

/** Deux socles posés : de quoi satisfaire le minimum, et lui seul. */
const FX: Fixture[] = [
  { id: 'f1', kind: 'prise', wallId: 'n', along: 1.2, height: 0.25, side: 1 },
  { id: 'f2', kind: 'prise', wallId: 'n', along: 3.6, height: 0.25, side: 1 },
];

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const etabli = (nom: string) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: W,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: nom, floor: null }],
      fixtures: FX,
      photos: [],
      showFurniture: true,
    });
    t = TestRenderer.create(
      <WallElevation
        wallId="n"
        selectedId={null}
        onSelect={() => {}}
        onAddRequest={() => {}}
        onLinkRequest={() => {}}
        onClose={() => {}}
      />,
    );
  });
  act(() => {
    const zone = t.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: 390, height: 380 } } });
  });
  arbre = t;
  return [...t.root.findAllByType(Text), ...t.root.findAllByType(SvgText)]
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string')
        .join(''),
    )
    .join(' | ');
};

describe('l’usage d’une pièce, connu ou déduit', () => {
  it('se reconnaît au nom', () => {
    for (const n of ['Chambre', 'Cuisine', 'Séjour', 'WC', 'Salle de bain', 'Dégagement', 'Cellier']) {
      expect(usageConnu(n)).toBe(true);
    }
  });

  it('ou à ce que le scan a reconnu', () => {
    expect(usageConnu('', 'bedroom')).toBe(true);
    expect(usageConnu('Pièce 2', 'kitchen')).toBe(true);
  });

  /** Le cas normal au retour du chantier : rien ne dit ce qu'est la pièce. */
  it('et reste inconnu sur une pièce non nommée', () => {
    expect(usageConnu('')).toBe(false);
    expect(usageConnu('Pièce 1')).toBe(false);
    expect(usageConnu('Piece 12', null)).toBe(false);
  });
});

describe('l’établi devant une pièce non nommée', () => {
  it('n’annonce pas un objectif atteint', () => {
    const vu = etabli('Pièce 1');
    // Ni « 2/1 socle », ni rien qui se lise comme une conformité.
    expect(vu).not.toMatch(/2\/1 socle/);
    expect(vu).toMatch(/Pièce à nommer/);
    expect(vu).toMatch(/exigences dépendent de son usage/);
  });

  it('mais le dit franchement dès qu’elle est nommée', () => {
    const vu = etabli('Chambre');
    // Trois socles en chambre : deux posés, l'objectif se voit.
    expect(vu).toMatch(/Chambre · 2\/3 socles/);
    expect(vu).not.toMatch(/Pièce à nommer/);
  });

  it('et le minimum reste appliqué pendant ce temps', () => {
    // On ne fait pas semblant d'ignorer la règle : une pièce non nommée doit
    // au moins un socle, et ce compte-là continue de tourner.
    const vu = etabli('');
    expect(vu).toMatch(/Pièce à nommer/);
  });
});

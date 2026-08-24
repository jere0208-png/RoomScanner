/**
 * L'ÉCRAN « SCANNER UN PLAN PAPIER », ET LES NOMS QU'IL RECOPIE.
 *
 * Ce que ce banc défend n'est pas la mise en page — je ne peux pas la voir —
 * mais la STRUCTURE et l'honnêteté de l'écran :
 *
 *   — les deux portes d'entrée sont là, l'appareil photo et la
 *     photothèque ;
 *   — sur un appareil dont l'app n'a pas encore été recompilée, l'écran le
 *     DIT au lieu de planter sur un module natif absent ;
 *   — l'icône de scan balaye pendant la lecture, et se fige une fois le
 *     plan lu : c'est la seule chose qui vit pendant que le fil JS mouline
 *     plusieurs secondes ;
 *   — les noms écrits sur le plan se recopient sur les bonnes pièces, et
 *     RIEN d'autre ne se recopie : un plan porte « VR MOT », « B-B' » et
 *     « S : 12.73 m² » à côté de « Chambre 1 », et aucun de ces trois-là
 *     n'est un nom de pièce.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { PapierScreen } from '../src/screens/PapierScreen';
import { estUnNomDePiece, nommerLesPieces } from '../src/papier/lecture';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<PapierScreen />);
  });
  arbre = t;
  return t;
};

/** Les textes affichés, mis bout à bout. */
const lu = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : n.props.children))
    .filter((x) => typeof x === 'string')
    .join(' | ');

const parLabel = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.find((n) => n.props?.accessibilityLabel === label && !!n.props?.onPress);

describe('l’écran du plan papier', () => {
  it('propose les deux portes : l’appareil photo et la photothèque', () => {
    const t = monter();
    expect(lu(t)).toMatch(/Photographier le plan/);
    expect(lu(t)).toMatch(/Choisir une image/);
  });

  it('dit qu’il faut recompiler plutôt que de planter sur un module absent', async () => {
    // Dans un banc, `NativeModules.RoomScanPlan` n'existe pas — exactement
    // comme sur un téléphone dont l'app n'a pas encore été reconstruite.
    const t = monter();
    await act(async () => {
      parLabel(t, 'Photographier le plan').props.onPress();
    });
    expect(lu(t)).toMatch(/recompil/i);
    // Et l'on peut repartir : un cul-de-sac n'est pas un écran.
    expect(lu(t)).toMatch(/Reprendre une photo/);
  });

  it('fait balayer l’icône pendant qu’on attend', () => {
    const t = monter();
    // La ligne de balayage porte une valeur ANIMÉE tant que rien n'est lu :
    // c'est ce qui tourne pendant que la lecture bloque le fil JS.
    const anime = t.root
      .findAll((n) => Array.isArray(n.props.style))
      .map((n) =>
        (n.props.style as unknown[]).find((x) => !!(x as { transform?: unknown })?.transform),
      )
      .find(Boolean) as { transform: Record<string, unknown>[] } | undefined;
    expect(anime).toBeDefined();
    const glisse = anime!.transform[0].translateY as { __getValue?: () => number };
    expect(typeof glisse?.__getValue).toBe('function');
  });
});

describe('les noms lus sur le plan', () => {
  it('reconnaît un nom de pièce, et refuse tout le reste', () => {
    expect(estUnNomDePiece('Chambre 1')).toBe(true);
    expect(estUnNomDePiece('SALLE DE BAIN')).toBe(true);
    expect(estUnNomDePiece('Dgt')).toBe(true);
    expect(estUnNomDePiece('Séjour')).toBe(true);
    // Ce qu'un plan porte aussi, et qui n'est pas une pièce.
    expect(estUnNomDePiece('VR MOT')).toBe(false);
    expect(estUnNomDePiece('B-B’')).toBe(false);
    expect(estUnNomDePiece('10.83')).toBe(false);
    // Le cartouche de surface accompagne le nom : il ne doit pas le doubler.
    expect(estUnNomDePiece('S : 12.73 m²')).toBe(false);
  });

  it('pose chaque nom sur la pièce qu’il désigne', () => {
    const murs = [
      { id: 'w1', a: { x: 0, z: 0 }, b: { x: 4, z: 0 } },
      { id: 'w2', a: { x: 4, z: 0 }, b: { x: 4, z: 3 } },
      { id: 'w3', a: { x: 10, z: 0 }, b: { x: 14, z: 0 } },
      { id: 'w4', a: { x: 14, z: 0 }, b: { x: 14, z: 3 } },
    ];
    const pieces = [
      { id: 'r1', name: '', wallIds: ['w1', 'w2'] },
      { id: 'r2', name: '', wallIds: ['w3', 'w4'] },
    ];
    const noms = nommerLesPieces(
      [
        { at: { x: 2, z: 1 }, texte: 'Chambre 1' },
        { at: { x: 12, z: 1 }, texte: 'Cuisine' },
        { at: { x: 2, z: 2 }, texte: 'VR MOT' },
      ],
      pieces,
      murs,
    );
    expect(noms).toEqual([
      { roomId: 'r1', nom: 'Chambre 1' },
      { roomId: 'r2', nom: 'Cuisine' },
    ]);
  });

  it('ne renomme pas une pièce que quelqu’un a déjà nommée', () => {
    const murs = [{ id: 'w1', a: { x: 0, z: 0 }, b: { x: 4, z: 0 } }];
    const noms = nommerLesPieces(
      [{ at: { x: 2, z: 0 }, texte: 'Chambre 1' }],
      [{ id: 'r1', name: 'Atelier de Paul', wallIds: ['w1'] }],
      murs,
    );
    expect(noms).toHaveLength(0);
  });

  it('ne va pas chercher un nom à l’autre bout du plan', () => {
    const murs = [{ id: 'w1', a: { x: 0, z: 0 }, b: { x: 4, z: 0 } }];
    const noms = nommerLesPieces(
      [{ at: { x: 40, z: 40 }, texte: 'Cuisine' }],
      [{ id: 'r1', name: '', wallIds: ['w1'] }],
      murs,
    );
    expect(noms).toHaveLength(0);
  });
});

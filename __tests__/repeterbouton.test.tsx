/**
 * LE BOUTON QUI RÉPÈTE — ce que l'établi en montre, et quand il se tait.
 *
 * Le geste lui-même a son banc (`repeterappareil`) ; ici, c'est l'écran qui
 * est en cause, et trois choses ne se voient nulle part ailleurs :
 *
 *   — IL N'EXISTE QUE POUR UN APPAREIL TENU. Sans sélection, il n'y a rien à
 *     répéter, et la rangée du bas est déjà courte ;
 *   — IL SE TAIT QUAND IL NE PEUT RIEN FAIRE. Sur un pan où il ne reste
 *     aucune place, un bouton qui échoue donne à l'écran l'air d'être en
 *     panne. C'est la règle de cette rangée depuis toujours — « un bouton qui
 *     ne commande rien ne s'affiche pas » —, et elle vaut aussi pour lui ;
 *   — LA COPIE DEVIENT LA SÉLECTION. C'est CE qui fait la série : le prochain
 *     appui pose la suivante, au même pas. Sans cela, six appuis poseraient
 *     six socles au même endroit — six fois le même pas depuis le même
 *     modèle — et l'on n'aurait rien gagné.
 *
 * ET LE BOUTON QUI A ÉTÉ RETIRÉ NE REVIENT PAS. Relevé du patron : « enlève le
 * bouton copier, remplace-le par un bouton lien... prise ou éclairage mural ».
 * Le lien garde sa place ; ce banc le vérifie, sans quoi on aurait remplacé
 * une demande par une autre sans s'en apercevoir.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { WallElevation } from '../src/components/WallElevation';
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

/** Un séjour de 6 × 4 : de la place pour une série. */
const LARGE: WallSeg[] = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 4),
  mur('s', 6, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];

/** Un placard de 50 cm : il n'y a de place pour rien. */
const ETROIT: WallSeg[] = [
  mur('n', 0, 0, 0.5, 0),
  mur('e', 0.5, 0, 0.5, 4),
  mur('s', 0.5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function rendu(opts: {
  walls?: WallSeg[];
  fixtures?: Fixture[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    /*
      LE MAGASIN SURVIT D'UN BANC À L'AUTRE, ET SON HISTORIQUE AUSSI : seul
      `reset()` efface le filet d'annulation.
    */
    useScanStore.getState().reset();
    useScanStore.setState({
      walls: opts.walls ?? LARGE,
      openings: [],
      objects: [],
      rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never,
      fixtures: opts.fixtures ?? [],
      photos: [],
      showFurniture: true,
    });
    t = TestRenderer.create(
      <WallElevation
        wallId="n"
        selectedId={opts.selectedId ?? null}
        onSelect={opts.onSelect ?? (() => {})}
        onAddRequest={() => {}}
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
  return t;
}

/** Un bouton de la rangée, par son mot parlé — ou rien. */
const bouton = (t: TestRenderer.ReactTestRenderer, nom: string) =>
  t.root.findAll(
    (n) =>
      typeof n.props?.onPress === 'function' &&
      n.props?.accessibilityLabel === nom,
  )[0];

const prise = (id: string, along: number): Fixture => ({
  id,
  kind: 'prise',
  wallId: 'n',
  along,
  height: 1.1,
  side: 1,
});

describe('le bouton « Répéter »', () => {
  it('n’existe pas tant qu’aucun appareil n’est tenu', () => {
    const t = rendu({ fixtures: [prise('a', 1)], selectedId: null });
    expect(bouton(t, 'Répéter')).toBeUndefined();
    // Le contrôle en sens inverse : la rangée est bien là, elle porte
    // « Ajouter ». Sans lui, l'épreuve passerait sur un écran vide.
    expect(bouton(t, 'Ajouter')).toBeDefined();
  });

  it('apparaît dès qu’on en tient un', () => {
    const t = rendu({ fixtures: [prise('a', 1)], selectedId: 'a' });
    expect(bouton(t, 'Répéter')).toBeDefined();
  });

  it('et se tait sur un pan où il n’y a de place pour rien', () => {
    const t = rendu({
      walls: ETROIT,
      fixtures: [{ ...prise('a', 0.25), wallId: 'n' }],
      selectedId: 'a',
    });
    expect(bouton(t, 'Répéter')).toBeUndefined();
    // Et les autres gestes, eux, restent : c'est bien LUI qui se retire.
    expect(bouton(t, 'Retirer')).toBeDefined();
  });
});

describe('un appui pose la copie et la tient', () => {
  it('le plan gagne un appareil, et l’écran le sélectionne', () => {
    const vus: (string | null)[] = [];
    const t = rendu({
      fixtures: [prise('a', 1)],
      selectedId: 'a',
      onSelect: (id) => vus.push(id),
    });
    act(() => bouton(t, 'Répéter').props.onPress());
    const fixtures = useScanStore.getState().fixtures;
    expect(fixtures).toHaveLength(2);
    /*
      LA COPIE DEVIENT LA SÉLECTION, et c'est CE qui fait la série : le
      prochain appui pose la suivante, au même pas. Sans cela, six appuis
      poseraient six fois le même écart depuis le même modèle.
    */
    const neuf = fixtures.find((f) => f.id !== 'a')!;
    expect(vus).toEqual([neuf.id]);
  });
});

describe('et le lien garde sa place', () => {
  /*
    Relevé du patron, à l'époque : « enlève le bouton copier, remplace-le par
    un bouton lien... prise ou éclairage mural ». On rend un geste de
    répétition ; on ne reprend pas la place de celui qui l'avait remplacé.
  */
  it('« Lier » est toujours là, à côté de « Répéter »', () => {
    const t = rendu({
      fixtures: [prise('a', 1)],
      selectedId: 'a',
      onSelect: () => {},
    });
    // `onLinkRequest` conditionne le bouton : on le fournit, comme l'écran.
    act(() => arbre?.unmount());
    arbre = null;
    let u!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({
        walls: LARGE,
        openings: [],
        objects: [],
        rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never,
        fixtures: [prise('a', 1)],
        photos: [],
        showFurniture: true,
      });
      u = TestRenderer.create(
        <WallElevation
          wallId="n"
          selectedId="a"
          onSelect={() => {}}
          onAddRequest={() => {}}
          onLinkRequest={() => {}}
          onClose={() => {}}
        />,
      );
    });
    act(() => {
      const zone = u.root
        .findAllByType(View)
        .find((n) => typeof n.props.onLayout === 'function')!;
      zone.props.onLayout({
        nativeEvent: { layout: { width: 390, height: 380 } },
      });
    });
    arbre = u;
    expect(bouton(u, 'Lier')).toBeDefined();
    expect(bouton(u, 'Répéter')).toBeDefined();
    // Et le « Copier » d'autrefois n'est pas revenu par la bande.
    expect(bouton(u, 'Copier')).toBeUndefined();
    expect(t).toBeDefined();
  });
});

/**
 * « DÉCORER », UN APERÇU SANS INTRUS.
 *
 * Relevé du patron : « le mode décorer affiche les repères des éléments
 * élec et des éléments plafond, même ceux en dehors de la pièce ». L'aperçu
 * de la feuille ne montre plus que la pièce choisie : ses murs, ses baies,
 * son sol et ses meubles — ni appareil, ni plafonnier, ni meuble sans pièce,
 * ni fenêtre d'un mur voisin.
 *
 * On ne désigne pas « un repère » dans le rendu : on compare deux rendus,
 * avec et sans l'intrus. S'il était dessiné, l'arbre changerait.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Iso3DView, DEFAULT_VIEW3D } from '../src/components/Iso3DView';
import { DecorSheet } from '../src/components/DecorSheet';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const mur = (id: string, roomId: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25, roomId,
});
// Deux pièces côte à côte, la cloison x = 4 partagée.
const MURS: WallSeg[] = [
  mur('n1', 'room-1', 0, 0, 4, 0), mur('c', 'room-1', 4, 0, 4, 3), mur('s1', 'room-1', 4, 3, 0, 3), mur('o1', 'room-1', 0, 3, 0, 0),
  mur('n2', 'room-2', 4, 0, 8, 0), mur('e2', 'room-2', 8, 0, 8, 3), mur('s2', 'room-2', 8, 3, 4, 3),
];
const ROOMS = [
  { id: 'room-1', name: 'Séjour', floor: null, wallIds: ['n1', 'c', 's1', 'o1'] },
  { id: 'room-2', name: 'Chambre', floor: null, wallIds: ['n2', 'e2', 's2', 'c'] },
];
const meuble = (id: string, x: number, roomId?: string) => ({
  id, category: 'table', width: 1, depth: 0.8, height: 0.75,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.375, 1.5, 1],
  ...(roomId ? { roomId } : {}),
});
// Une fenêtre sur le mur nord, dans l'alignement de celui du séjour.
const fenetre = (id: string, ax: number, bx: number) =>
  ({ id, type: 'window', a: { x: ax, z: 0 }, b: { x: bx, z: 0 }, height: 1.2, yCenter: 1.5 }) as WallSeg;

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function apercu(etat: Record<string, unknown>, props: Record<string, unknown> = { decor: true }) {
  act(() => arbre?.unmount());
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: MURS, rooms: ROOMS, openings: [], objects: [], fixtures: [], ceiling: [],
      showFurniture: false, showSol: false, niveauCourant: 0, ...etat,
    } as never);
    t = TestRenderer.create(
      <Iso3DView value={DEFAULT_VIEW3D} onChange={() => {}} showMeasures={false} focusRoomId="room-1" cutaway {...props} />,
    );
  });
  act(() => {
    t.root.findAllByType(View)[0].props.onLayout?.({ nativeEvent: { layout: { width: 390, height: 520 } } });
  });
  arbre = t;
  return t;
}

/** L'empreinte du dessin : chaque tracé et chaque texte, dans l'ordre. */
const empreinte = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAll((n) => typeof n.props?.d === 'string' || typeof n.props?.points === 'string' || typeof n.props?.children === 'string')
    .map((n) => String(n.props.d ?? n.props.points ?? n.props.children))
    .join('|');

describe('l’aperçu de « Décorer » ne montre que la pièce choisie', () => {
  it('ni prise, ni interrupteur, ni repère électrique', () => {
    const sans = empreinte(apercu({}));
    const avec = empreinte(
      apercu({
        fixtures: [
          { id: 'p1', kind: 'prise', wallId: 'n1', along: 1, height: 0.3, side: 1 },
          { id: 'i1', kind: 'inter', wallId: 'o1', along: 1, height: 1.1, side: 1 },
        ],
      }),
    );
    expect(avec).toBe(sans);
  });

  it('ni plafonnier, d’ici ou d’à côté', () => {
    const sans = empreinte(apercu({}));
    const avec = empreinte(
      apercu({
        ceiling: [
          { id: 'l1', kind: 'dcl', roomId: 'room-1', x: 2, z: 1.5 },
          { id: 'l2', kind: 'dcl', roomId: 'room-2', x: 6, z: 1.5 },
        ],
      }),
    );
    expect(avec).toBe(sans);
  });

  it('ni meuble sans pièce, ni meuble de la pièce voisine', () => {
    // Le réglage « meubles » de la maquette allumé : c'est là que le meuble
    // sans pièce se glissait dans « room-1 ».
    const sans = empreinte(apercu({ showFurniture: true, objects: [meuble('a', 2, 'room-1')] }));
    const avec = empreinte(apercu({ showFurniture: true, objects: [meuble('a', 2, 'room-1'), meuble('b', 6), meuble('c', 6.5, 'room-2')] }));
    expect(avec).toBe(sans);
  });

  it('ni la fenêtre de la chambre, posée près du coin du séjour', () => {
    const sans = empreinte(apercu({}));
    const avec = empreinte(apercu({ openings: [fenetre('w2', 4.1, 4.7)] }));
    expect(avec).toBe(sans);
    // Celle du séjour, elle, est bien dessinée.
    expect(empreinte(apercu({ openings: [fenetre('w1', 1.4, 2.6)] }))).not.toBe(sans);
  });

  it('les meubles et le sol se voient, même masqués sur la maquette', () => {
    const vide = empreinte(apercu({}));
    expect(empreinte(apercu({ objects: [meuble('a', 2, 'room-1')] }))).not.toBe(vide);
    // Hors « Décorer », le réglage de la maquette s'applique.
    const horsDecor = { decor: false };
    expect(empreinte(apercu({ objects: [meuble('a', 2, 'room-1')] }, horsDecor))).toBe(empreinte(apercu({}, horsDecor)));
  });

  it('la feuille passe bien en mode « décor » à son aperçu', () => {
    act(() => {
      useScanStore.setState({ walls: MURS, rooms: ROOMS, objects: [], openings: [], fixtures: [], ceiling: [] } as never);
    });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<DecorSheet visible onClose={() => {}} pieceInitiale="room-1" />);
    });
    const vue = t.root.findAllByType(Iso3DView)[0];
    expect(vue.props.decor).toBe(true);
    expect(vue.props.focusRoomId).toBe('room-1');
    act(() => t.unmount());
  });
});

describe('les teintes et le retour en arrière', () => {
  const monter = () => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({ screen: 'result', walls: MURS, rooms: ROOMS, objects: [meuble('a', 2, 'room-1')] } as never);
    });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<DecorSheet visible onClose={() => {}} pieceInitiale="room-1" />);
    });
    arbre = t;
    return t;
  };
  const appuyer = (t: TestRenderer.ReactTestRenderer, label: string) => {
    const b = t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false })[0];
    expect([label, !!b]).toEqual([label, true]);
    act(() => b.props.onPress());
  };
  const peinture = () => useScanStore.getState().rooms.find((r) => r.id === 'room-1')!.peinture ?? null;
  const annuler = (t: TestRenderer.ReactTestRenderer) =>
    t.root.findAll((n) => n.props.accessibilityLabel === 'Annuler le dernier changement' && typeof n.props.onPress === 'function')[0];

  it('« Blanc » se distingue de « D’origine » : un relevé gris devient blanc', () => {
    const t = monter();
    appuyer(t, 'Murs : Blanc cassé');
    expect(peinture()).toBe('blanc');
    appuyer(t, 'Murs : D’origine');
    expect(peinture()).toBeNull();
  });

  it('deux teintes coup sur coup s’annulent une à une', () => {
    const t = monter();
    appuyer(t, 'Murs : Vert sauge');
    appuyer(t, 'Murs : Terracotta');
    act(() => annuler(t).props.onPress());
    expect(peinture()).toBe('sauge');
    act(() => annuler(t).props.onPress());
    expect(peinture()).toBeNull();
    // Plus rien de fait dans la feuille : « Annuler » s'éteint, il ne défait
    // pas ce qui précédait son ouverture.
    expect(annuler(t).props.disabled).toBe(true);
  });

  it('« Annuler » ne remonte pas avant l’ouverture de la feuille', () => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({ screen: 'result', walls: MURS, rooms: ROOMS, objects: [] } as never);
      useScanStore.getState().setRoomPeinture('room-1', 'sauge');
    });
    expect(useScanStore.getState().canUndo).toBe(true);
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<DecorSheet visible onClose={() => {}} pieceInitiale="room-1" />);
    });
    arbre = t;
    expect(annuler(t).props.disabled).toBe(true);
  });
});

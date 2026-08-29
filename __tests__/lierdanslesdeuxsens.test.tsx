/**
 * LE LIEN SE NOUE DANS LES DEUX SENS — depuis la prise, OU depuis l'inter.
 *
 * Relevé du patron : « ajoute aussi ce bouton pour le mode édition : si on
 * clique sur un interrupteur, on ne voit pas "lier", alors que sur prise et
 * éclairage si. »
 *
 * LE GESTE N'EXISTAIT QUE DANS UN SENS, ET C'EST UNE ASYMÉTRIE QUE RIEN NE
 * JUSTIFIE. On tenait la prise, on fermait l'établi, on touchait
 * l'interrupteur. L'inverse — tenir l'interrupteur et désigner ce qu'il allume
 * — était impossible, alors que c'est le sens NATUREL quand on pose une
 * installation : on sait qu'il y a un interrupteur à l'entrée, on cherche ce
 * qu'il va commander.
 *
 * CE QU'ON CHANGE, ET POURQUOI C'EST PLUS QUE DEUX BOUTONS. La règle
 * s'écrivait dans l'écran, à l'endroit du geste : « la cible reçoit, la
 * commande est touchée ». Elle vit maintenant DANS LE MAGASIN, sur la PAIRE :
 * on lui donne deux identifiants, il trouve tout seul lequel commande et
 * lequel s'allume.
 *
 * L'ORDRE DES APPUIS CESSE DONC D'AVOIR UN SENS — ce qui est la bonne réponse,
 * parce qu'il n'en a jamais eu pour l'utilisateur. Et l'écran n'a plus qu'un
 * seul chemin à tenir au lieu de deux, ce qui est la seule façon de garantir
 * qu'ils se comportent pareil.
 */
const mockCap = { valeur: null as string | null };

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('react-native-room-scan', () => ({
  RoomScan: {
    isSupported: jest.fn(async () => true),
    viewModel: jest.fn(async () => false),
  },
  scanEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  laserEvents: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
  RoomScanView: 'RoomScanView',
  get RoomScanCanvas() {
    return mockCap.valeur;
  },
}));

import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { WallElevation } from '../src/components/WallElevation';
import { useScanStore } from '../src/store/scanStore';
import type { Fixture } from '../src/geometry/electrical';
import type { CeilingFixture } from '../src/geometry/ceiling';
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

const MURS: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];

const INTER: Fixture = {
  id: 'i1',
  kind: 'inter',
  wallId: 'n',
  along: 1,
  height: 1.1,
  side: 1,
};
const PRISE: Fixture = {
  id: 'p1',
  kind: 'prise',
  wallId: 'n',
  along: 2.5,
  height: 0.25,
  side: 1,
};
const RJ: Fixture = {
  id: 'rj1',
  kind: 'rj45',
  wallId: 'n',
  along: 3.5,
  height: 0.25,
  side: 1,
};
const LAMPE: CeilingFixture = {
  id: 'c1',
  kind: 'dcl',
  roomId: 'r1',
  at: { x: 2.5, z: 2 },
};

const poser = (fixtures: Fixture[], ceiling: CeilingFixture[] = [LAMPE]) => {
  useScanStore.getState().reset();
  useScanStore.setState({
    walls: MURS,
    openings: [],
    objects: [],
    rooms: [{ id: 'r1', name: 'Séjour', floor: null }] as never,
    fixtures,
    ceiling,
    photos: [],
  });
};

// ─────────────────────────────────────────────── LA RÈGLE, DANS LE MAGASIN

describe('c’est la PAIRE qui décide, pas l’ordre des appuis', () => {
  const lier = (a: string, b: string) =>
    useScanStore.getState().lierElements(a, b);
  const commandesDe = (id: string) => {
    const st = useScanStore.getState();
    return (
      st.fixtures.find((f) => f.id === id)?.commands ??
      st.ceiling.find((c) => c.id === id)?.commands ??
      []
    );
  };

  beforeEach(() => poser([INTER, PRISE, RJ]));

  it('prise puis interrupteur : la prise garde le lien', () => {
    expect(lier('p1', 'i1')).toBe(true);
    expect(commandesDe('p1')).toEqual(['i1']);
  });

  it('interrupteur puis prise : LE MÊME lien, au même endroit', () => {
    /*
      C'EST TOUT LE SUJET. Le lien vit sur ce qui S'ALLUME — c'est le modèle
      électrique, et il ne change pas selon la main de celui qui le noue.
      Deux gestes, un seul état : sans quoi on aurait deux liens là où il n'y
      a qu'un fil.
    */
    expect(lier('i1', 'p1')).toBe(true);
    expect(commandesDe('p1')).toEqual(['i1']);
    expect(commandesDe('i1')).toEqual([]);
  });

  it('et le second appui DÉNOUE, dans les deux sens aussi', () => {
    lier('p1', 'i1');
    expect(lier('i1', 'p1')).toBe(true);
    expect(commandesDe('p1')).toEqual([]);
  });

  it('un point du plafond se noue pareil, dans les deux sens', () => {
    expect(lier('i1', 'c1')).toBe(true);
    expect(commandesDe('c1')).toEqual(['i1']);
    expect(lier('c1', 'i1')).toBe(true);
    expect(commandesDe('c1')).toEqual([]);
  });

  it('deux interrupteurs ne se lient pas l’un à l’autre', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, et il porte la règle du métier : un
      interrupteur ne s'allume pas. Une fonction qui lie n'importe quoi à
      n'importe quoi passerait toutes les épreuves du dessus.
    */
    poser([INTER, { ...INTER, id: 'i2', along: 4 }, PRISE]);
    expect(lier('i1', 'i2')).toBe(false);
    expect(commandesDe('i1')).toEqual([]);
    expect(commandesDe('i2')).toEqual([]);
  });

  it('deux prises non plus', () => {
    poser([PRISE, { ...PRISE, id: 'p2', along: 4 }, INTER]);
    expect(lier('p1', 'p2')).toBe(false);
  });

  it('et le courant faible n’a rien à allumer', () => {
    // Une RJ45 ne s'allume pas : « prise ou éclairage mural, mais pas le
    // courant faible » — c'est un relevé antérieur, et il tient.
    expect(lier('i1', 'rj1')).toBe(false);
    expect(commandesDe('rj1')).toEqual([]);
  });

  it('un identifiant inconnu ne casse rien', () => {
    expect(lier('i1', 'fantome')).toBe(false);
    expect(lier('i1', 'i1')).toBe(false);
  });
});

// ─────────────────────────────────────────────────── LE BOUTON DE L'ÉTABLI

describe('l’établi montre « Lier » sur l’interrupteur aussi', () => {
  let arbre: TestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => arbre?.unmount());
    arbre = null;
  });

  const rendu = (fixtures: Fixture[], choisi: string) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      poser(fixtures);
      t = TestRenderer.create(
        <WallElevation
          wallId="n"
          selectedId={choisi}
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
      zone.props.onLayout({
        nativeEvent: { layout: { width: 390, height: 380 } },
      });
    });
    arbre = t;
    return t;
  };

  const lier = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Lier');

  it('un interrupteur choisi porte le bouton', () => {
    /*
      L'ASYMÉTRIE RELEVÉE PAR LE PATRON. Le bouton ne s'affichait que pour ce
      qui S'ALLUME. Or c'est depuis l'interrupteur qu'on pense l'installation
      — « celui-ci commandera quoi ? » — et c'était le seul appareil de
      l'établi à ne rien pouvoir faire de ce geste.
    */
    expect(lier(rendu([INTER, PRISE], 'i1'))).toBeDefined();
  });

  it('une prise le garde, comme avant', () => {
    expect(lier(rendu([INTER, PRISE], 'p1'))).toBeDefined();
  });

  it('mais une RJ45 ne le montre toujours pas', () => {
    // Le contrôle en sens inverse : un geste impossible ne prend pas de place.
    expect(lier(rendu([INTER, RJ], 'rj1'))).toBeUndefined();
  });

  it('et il rend l’appareil tenu au parent', () => {
    const onLink = jest.fn();
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      poser([INTER, PRISE]);
      t = TestRenderer.create(
        <WallElevation
          wallId="n"
          selectedId="i1"
          onSelect={() => {}}
          onAddRequest={() => {}}
          onLinkRequest={onLink}
          onClose={() => {}}
        />,
      );
    });
    act(() => {
      const zone = t.root
        .findAllByType(View)
        .find((n) => typeof n.props.onLayout === 'function')!;
      zone.props.onLayout({
        nativeEvent: { layout: { width: 390, height: 380 } },
      });
    });
    arbre = t;
    act(() => lier(t)!.props.onPress());
    expect(onLink).toHaveBeenCalledWith('i1');
  });
});

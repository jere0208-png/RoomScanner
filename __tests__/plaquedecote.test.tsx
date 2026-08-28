/**
 * LA PLAQUE BLANCHE SOUS UN CHIFFRE DE COTE.
 *
 * Deux relevés du patron, sur la même capture :
 *
 *   « Pour les chiffres des cotes, fais en sorte que le bloc blanc arrière
 *   soit pas si gros, il doit dépasser de 2px les chiffres sur les côtés. »
 *
 *   « Aussi, les chiffres sont cachés par le passage de la gaine, les
 *   pointillés gênent la lecture de la cote entre spots par exemple ; trouve
 *   une solution. »
 *
 * TROIS DÉFAUTS, ET ILS N'ONT PAS LA MÊME CAUSE.
 *
 *   1. LA PLAQUE ÉTAIT ÉCRITE EN DUR. « 26 de large sur 14 de haut » pour un
 *      texte de trois chiffres à 9,5 : plus de six points de blanc de chaque
 *      côté, et quatre au-dessus. Sur un plan, chaque point de blanc est un
 *      point de dessin en moins — et la plaque d'une cote à deux chiffres
 *      était encore plus large par rapport à elle. Elle se CALCULE désormais
 *      sur le texte, et ne déborde que de deux points.
 *
 *   2. ELLE ÉTAIT TRANSLUCIDE (0,90 ; 0,94 ; et `#FFFFFFDD` dans le dossier).
 *      Un tireté de gaine passait donc AU TRAVERS du chiffre : on lisait
 *      « 117 » barré de pointillés. Une plaque de cote est opaque en dessin
 *      technique — c'est sa raison d'être : la cote INTERROMPT ce qu'elle
 *      survole.
 *
 *   3. ET LA GAINE ÉTAIT DESSINÉE APRÈS. C'est la vraie cause de « les
 *      chiffres sont cachés par le passage de la gaine » : même opaque, une
 *      plaque ne protège rien de ce qui se peint par-dessus. Le cheminement
 *      passe donc AVANT le calque du plafond — il passait déjà sous les
 *      symboles d'appareil, « c'est un cheminement, pas une annotation ».
 *
 * ON MESURE LA CAUSE, PAS LE CHIFFRE. La plaque se cherche par sa relation au
 * texte qu'elle porte (elle en dépend), et l'ordre de tracé par le RANG dans
 * l'arbre — jamais par une valeur écrite à la main qui dériverait au premier
 * changement de police.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { DEBORD_PLAQUE, plaqueDeCote } from '../src/geometry/cotes';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';
import type { CeilingFixture } from '../src/geometry/ceiling';

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const PIECE = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 4),
  mur('s', 6, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];

const spot = (id: string, x: number, z: number): CeilingFixture => ({
  id,
  kind: 'spot',
  roomId: 'r1',
  at: { x, z },
  row: 'ln1',
});

/** Trois spots alignés : la chaîne écrit « 150 » entre chacun. */
const LIGNE = [spot('a', 1.5, 2), spot('b', 3, 2), spot('c', 4.5, 2)];

/** Une gaine qui traverse la pièce en passant PILE sur la chaîne. */
const GAINE = [
  {
    id: 'g1',
    path: [
      { x: 0.2, z: 2 },
      { x: 5.8, z: 2 },
    ],
  },
];

describe('la plaque se taille sur son texte', () => {
  it('déborde de deux points de chaque côté, et pas plus', () => {
    const p = plaqueDeCote('117', 9.5);
    // La largeur du texte, telle que le plan l'estime partout ailleurs
    // (`encombrement`), plus le débord des deux côtés.
    expect(p.w).toBeCloseTo(3 * 9.5 * 0.55 + 2 * DEBORD_PLAQUE, 5);
    expect(DEBORD_PLAQUE).toBe(2);
  });

  /*
    LE CONTRÔLE EN SENS INVERSE — et c'est LE contrôle de cette suite : une
    plaque écrite en dur passerait la vérification du dessus pour peu qu'on
    ait choisi le bon nombre. Elle doit SUIVRE le texte.
  */
  it('et elle suit le texte : un chiffre de plus, une plaque plus large', () => {
    const trois = plaqueDeCote('117', 9.5);
    const quatre = plaqueDeCote('1170', 9.5);
    expect(quatre.w).toBeGreaterThan(trois.w);
    // Exactement d'un signe : elle ne grandit pas par paliers.
    expect(quatre.w - trois.w).toBeCloseTo(9.5 * 0.55, 5);
  });

  it('et la police : plus gros le chiffre, plus haute la plaque', () => {
    expect(plaqueDeCote('117', 12).h).toBeGreaterThan(
      plaqueDeCote('117', 9.5).h,
    );
  });

  it('mais elle serre le chiffre : jamais plus haute que sa police', () => {
    // Un chiffre n'occupe pas toute sa police en hauteur — pas de jambages,
    // pas d'accents. Une plaque à la hauteur de la police laisse donc du
    // blanc en haut et en bas, et c'est ce qu'on venait corriger.
    const F = 9.5;
    expect(plaqueDeCote('117', F).h).toBeLessThan(F + 2 * DEBORD_PLAQUE);
  });
});

describe('sur le plan, la plaque et les pointillés', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  let arbre: TestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => arbre?.unmount());
    arbre = null;
  });

  function plan() {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        walls: PIECE,
        openings: [],
        objects: [],
        rooms: [{ id: 'r1', name: 'Séjour', floor: null }],
        fixtures: [],
        ceiling: LIGNE,
        photos: [],
        showFurniture: true,
        showSurfaces: false,
      });
      tree = TestRenderer.create(
        <FloorplanEditor
          showMeasures
          editable={false}
          selectedWallId={null}
          onSelectWall={() => {}}
          ceiling={LIGNE}
          showCeiling
          cableRoutes={GAINE}
        />,
      );
    });
    act(() => {
      tree.root.findAllByType(View)[0].props.onLayout?.({
        nativeEvent: { layout: { width: 900, height: 620 } },
      });
    });
    arbre = tree;
    return tree;
  }

  /**
   * La plaque d'un chiffre : le `Rect` qui partage son groupe.
   *
   * On la cherche par sa RELATION au texte, jamais par sa taille : c'est
   * précisément la taille qu'on vient mesurer.
   */
  const plaqueDe = (t: TestRenderer.ReactTestRenderer, chiffre: string) => {
    const texte = t.root
      .findAllByType(SvgText)
      .find((n) => String(n.props.children) === chiffre);
    expect(texte).toBeDefined();
    const parent = texte!.parent!;
    const rects = parent.findAllByType(Rect);
    expect(rects.length).toBeGreaterThan(0);
    return { rect: rects[0].props, texte: texte!.props };
  };

  it('la plaque d’un écart de chaîne serre son chiffre', () => {
    const { rect, texte } = plaqueDe(plan(), '150');
    const attendu = plaqueDeCote('150', texte.fontSize as number);
    expect(rect.width).toBeCloseTo(attendu.w, 3);
    expect(rect.height).toBeCloseTo(attendu.h, 3);
  });

  it('et elle est OPAQUE : un tireté ne la traverse plus', () => {
    const { rect } = plaqueDe(plan(), '150');
    // Pas d'opacité, ou une opacité pleine : les deux disent la même chose.
    expect(rect.opacity ?? 1).toBe(1);
  });

  /*
    L'ORDRE DE TRACÉ, MESURÉ DANS L'ARBRE.

    C'est la vraie cause de « les chiffres sont cachés par le passage de la
    gaine » : la plaque a beau être opaque, elle ne protège rien de ce qui se
    peint APRÈS elle. Un banc qui ne mesurerait que l'opacité aurait déclaré
    le défaut corrigé alors que le tireté passait toujours dessus.
  */
  it('le cheminement passe AVANT les cotes du plafond, pas dessus', () => {
    const t = plan();
    const tout = t.root.findAll(() => true);
    const gaine = t.root
      .findAllByType(Polyline)
      .find((n) => !!n.props.strokeDasharray);
    expect(gaine).toBeDefined();
    const chiffre = t.root
      .findAllByType(SvgText)
      .find((n) => String(n.props.children) === '150');
    expect(chiffre).toBeDefined();
    expect(tout.indexOf(gaine!)).toBeLessThan(tout.indexOf(chiffre!));
  });

  /*
    LE CONTRÔLE EN SENS INVERSE : la gaine n'est pas passée DERRIÈRE TOUT.
    Elle doit rester au-dessus du plancher et des surfaces — c'est un
    cheminement qu'on suit à l'œil, pas un fond. Si elle était remontée
    jusqu'en tête, l'épreuve du dessus passerait sans rien valoir.
  */
  it('sans pour autant passer sous le plan lui-même', () => {
    const t = plan();
    const tout = t.root.findAll(() => true);
    const gaine = t.root
      .findAllByType(Polyline)
      .find((n) => !!n.props.strokeDasharray)!;
    // Les murs sont dessinés bien avant : la gaine reste par-dessus eux.
    const murs = t.root
      .findAll(
        (n) =>
          typeof n.props.d === 'string' && String(n.props.fill ?? '') !== '',
      )
      .slice(0, 1);
    if (murs.length > 0) {
      expect(tout.indexOf(gaine)).toBeGreaterThan(tout.indexOf(murs[0]));
    }
  });
});

/**
 * L'ANNEAU DE PROGRESSION — équiper devient une partie à finir.
 *
 * Deuxième des dix améliorations demandées : sur le cartouche de chaque
 * pièce, un petit anneau qui se remplit — socles posés contre socles exigés
 * par la norme. « Séjour 3/5 » qui devient un anneau plein et vert.
 *
 * LE CALCUL EXISTAIT DÉJÀ, MAIS À UN SEUL ENDROIT : l'établi du mur
 * l'affichait pour LE mur ouvert (`objectif`). Or c'est une information de
 * PIÈCE, et on la veut là où l'on travaille — sur le plan. On l'extrait
 * donc en une lecture partagée (`avancementDesPieces`), et l'établi la
 * reprend : deux comptages du même nombre finissent toujours par diverger.
 *
 * CE QU'IL NE FAIT PAS : juger. Une pièce dont la norme n'exige rien
 * (couloir, cellier) n'a pas d'anneau — un anneau vide sur un dégagement se
 * lirait comme un reproche, alors qu'il n'y a rien à poser.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { Circle } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import { avancementDesPieces } from '../src/geometry/nfc15100';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});
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

/** Une chambre de 4 × 3 : la norme y exige trois socles. */
const MURS = [
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 3),
  mur('s', 4, 3, 0, 3),
  mur('o', 0, 3, 0, 0),
];
const CHAMBRE = [
  { id: 'r1', name: 'Chambre', floor: null, wallIds: ['n', 'e', 's', 'o'] },
];

const prise = (id: string, along: number): Fixture => ({
  id,
  kind: 'prise',
  wallId: 'n',
  along,
  height: 0.25,
  side: 1,
});

describe('l’avancement d’une pièce', () => {
  it('compte ce qui est posé contre ce que la norme exige', () => {
    const av = avancementDesPieces(
      CHAMBRE as never,
      MURS,
      [prise('a', 1), prise('b', 2)],
    );
    const chambre = av.get('r1')!;
    expect(chambre).toBeTruthy();
    expect(chambre.exiges).toBe(3);
    expect(chambre.poses).toBe(2);
    expect(chambre.fini).toBe(false);
  });

  it('et se déclare FINI dès que le compte y est — jamais avant', () => {
    const av = avancementDesPieces(
      CHAMBRE as never,
      MURS,
      [prise('a', 1), prise('b', 2), prise('c', 3)],
    );
    expect(av.get('r1')!.fini).toBe(true);
  });

  it('et il compte comme la maison compte — pas comme on l’imagine', () => {
    /*
      LE BANC S'EST TROMPÉ ICI, ET LA MAISON AVAIT RAISON. Sa première
      version exigeait « un socle double compte pour DEUX » ; or la règle
      est écrite depuis longtemps dans `socketsOf`, et la note de la fiche
      avait même été corrigée dans ce sens : « deux socles sous une plaque :
      compte pour un socle au circuit » — c'est un seul point
      d'alimentation. L'anneau ne peut pas compter autrement que le
      contrôle et le devis qui l'entourent.
    */
    const doublePrise: Fixture = {
      id: 'd',
      kind: 'prise2',
      wallId: 'n',
      along: 1,
      height: 0.25,
      side: 1,
    };
    const avecDouble = avancementDesPieces(CHAMBRE as never, MURS, [doublePrise]);
    const avecSimple = avancementDesPieces(CHAMBRE as never, MURS, [prise('a', 1)]);
    expect(avecDouble.get('r1')!.poses).toBe(avecSimple.get('r1')!.poses);
  });

  it('une pièce que la norme n’équipe pas n’a pas d’anneau', () => {
    /*
      LE REFUS QUI COMPTE : un anneau vide sur un dégagement se lirait comme
      un reproche, alors qu'il n'y a rien à poser. Pas d'exigence, pas
      d'anneau.
    */
    // Un WC : la norme n'y exige aucun socle, quelle que soit sa taille.
    // (Un dégagement de plus de 4 m², lui, en exige un — il aurait donc
    // son anneau, et c'est juste.)
    const couloir = [
      { id: 'r1', name: 'WC', floor: null, wallIds: ['n', 'e', 's', 'o'] },
    ];
    expect(avancementDesPieces(couloir as never, MURS, []).get('r1')).toBeUndefined();
  });

  it('et une pièce sans nom non plus : on ne juge pas ce qu’on ignore', () => {
    /*
      `roomUse` rend « autre » faute de mieux, et « autre » n'exige presque
      rien : une pièce sans nom afficherait « 2/1 », c'est-à-dire FINI,
      alors que la même nommée « Chambre » en exige trois. L'établi connaît
      déjà ce piège — l'anneau ne doit pas le rouvrir.
    */
    const anonyme = [
      { id: 'r1', name: '', floor: null, wallIds: ['n', 'e', 's', 'o'] },
    ];
    expect(avancementDesPieces(anonyme as never, MURS, []).get('r1')).toBeUndefined();
  });
});

describe('il ne paraît QUE là où l’on équipe', () => {
  /*
    LE REFUS ANTÉRIEUR EST RESPECTÉ. Un relevé du patron avait chassé le
    point de conformité du cartouche : « rien sur le nom de la pièce ». Ce
    refus reste juste — quand on MONTRE son plan, rien ne doit ressembler à
    un reproche. Mais quand on POSE des prises, la même information devient
    l'aide qu'on cherchait. C'est le contexte qui décide : édition ouverte
    ET calque électrique allumé.
  */
  const monter = (props: { editable: boolean; showFixtures: boolean }) => {
    /*
      ON PASSE PAR LE MAGASIN, pas par un `setState` de murs bruts : une
      pièce posée à la main sans son NIVEAU est filtrée par la vue (elle ne
      dessine qu'un étage), et le cartouche n'existe alors nulle part — la
      première version de ce banc cherchait un anneau sur un plan sans
      cartouche, et accusait l'anneau.
    */
    let wallIds: string[] = [];
    act(() => {
      useScanStore.getState().reset();
      useScanStore.getState().commencerAuClavier();
      useScanStore.getState().addRoomRect({ x: 0, z: 0 }, { x: 4, z: 3 }, 'Chambre');
      wallIds = useScanStore.getState().rooms[0].wallIds ?? [];
      useScanStore.setState({
        fixtures: [{ ...prise('a', 1), wallId: wallIds[0] }],
        /*
          LE CALQUE DES SURFACES ALLUME LE CARTOUCHE — et l'anneau vit
          dessus. Il part ÉTEINT (`CALQUES_DE_BASE`) : la deuxième version
          de ce banc cherchait donc un anneau sur un plan sans cartouche,
          et accusait l'anneau. Le dessin n'avait rien à se reprocher.
        */
        showSurfaces: true,
      });
    });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <FloorplanEditor
          showMeasures
          selectedWallId={null}
          onSelectWall={() => {}}
          {...props}
        />,
      );
    });
    act(() => {
      const zone = t.root
        .findAllByType(View)
        .find((n) => typeof n.props.onLayout === 'function')!;
      zone.props.onLayout({
        nativeEvent: { layout: { width: 390, height: 600 } },
      });
    });
    arbre = t;
    return t;
  };
  const anneaux = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAllByType(Circle)
      .filter((n) => String(n.props.testID ?? '').startsWith('anneau-'));

  it('en édition, calque élec allumé : la jauge est là', () => {
    expect(anneaux(monter({ editable: true, showFixtures: true })).length).toBe(1);
  });

  it('en lecture — le plan qu’on montre — rien', () => {
    expect(anneaux(monter({ editable: false, showFixtures: true }))).toHaveLength(0);
  });

  it('calque électrique éteint : rien non plus', () => {
    expect(anneaux(monter({ editable: true, showFixtures: false }))).toHaveLength(0);
  });
});

describe('l’établi lit le MÊME compte', () => {
  it('par la mesure : il ne recompte pas dans son coin', () => {
    /*
      Deux comptages du même nombre finissent toujours par diverger — et
      celui-ci se lit à deux endroits, à trente centimètres l'un de
      l'autre : l'anneau sur le plan, le guide dans l'établi. L'établi
      appelle donc la lecture partagée.
    */
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(__dirname, '..', 'src', 'components', 'WallElevation.tsx'),
      'utf8',
    );
    expect(src).toContain('avancementDesPieces');
  });
});

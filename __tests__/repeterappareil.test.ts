/**
 * SIX SOCLES IDENTIQUES NE SONT PLUS SIX POSES.
 *
 * Relevé du patron : « duplication d'un appareil — six socles identiques,
 * c'est six poses ; il n'existe aucun geste de duplication ».
 *
 * C'EST LE CAS LE PLUS COURANT D'UN CHANTIER, et c'était celui qui coûtait le
 * plus de gestes : un plan de travail de cuisine, quatre à six socles alignés
 * au même entraxe, à la même hauteur, sur la même face. On les posait un par
 * un depuis le catalogue, puis on les traînait un par un à leur place.
 *
 * UN « COPIER » A DÉJÀ VÉCU ICI, ET IL A ÉTÉ RETIRÉ — relevé du patron :
 * « enlève le bouton copier, remplace-le par un bouton lien ». Ce qu'on
 * remet n'est donc PAS le bouton d'avant. Un copier pose un jumeau à côté et
 * laisse l'électricien le placer ; celui-ci pose la copie AU PAS, là où la
 * suivante doit tomber, et se resélectionne. Six appuis font six socles
 * régulièrement espacés, sans toucher une seule fois au doigt — et le lien,
 * lui, garde sa place.
 *
 * LE PAS SE DEVINE, IL NE SE REDEMANDE PAS. La première copie prend l'entraxe
 * d'un plan de travail (`PAS_SERIE`) ; **dès la deuxième, elle reprend l'écart
 * réel de la précédente**. C'est ce qui fait qu'on ne règle rien : on pose le
 * premier socle où on le veut, le deuxième au pas qu'on veut — au doigt s'il
 * le faut — et les quatre suivants suivent tout seuls.
 *
 * ET UNE COPIE NE SE POSE PAS N'IMPORTE OÙ. Elle reste sur la maçonnerie, dans
 * son mur, et ne s'empile pas sur une voisine : ce sont les mêmes règles qu'une
 * pose ordinaire, et il n'y a aucune raison qu'elles s'assouplissent parce que
 * le geste est plus rapide. Quand la place manque à droite, elle repart à
 * gauche ; quand il n'y a de place nulle part, elle ne se pose pas — un
 * appareil dans une baie vitrée est pire qu'un appareil absent.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { useScanStore } from '../src/store/scanStore';
import { PAS_SERIE } from '../src/geometry/electrical';
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

/** Un séjour de 6 × 4 : de quoi aligner une série sans buter sur un angle. */
const MURS: WallSeg[] = [
  mur('n', 0, 0, 6, 0),
  mur('e', 6, 0, 6, 4),
  mur('s', 6, 4, 0, 4),
  mur('o', 0, 4, 0, 0),
];
const ROOMS = [{ id: 'r1', name: 'Séjour', wallIds: MURS.map((w) => w.id) }];

/*
  LE MAGASIN SURVIT D'UN BANC À L'AUTRE, ET SON HISTORIQUE AUSSI : `setState`
  ne touche pas le filet d'annulation, seul `reset()` l'efface. Une épreuve qui
  annulerait remonterait dans le plan de la précédente.
*/
const planNeuf = (openings: WallSeg[] = []) => {
  useScanStore.getState().reset();
  useScanStore.setState({
    walls: MURS,
    openings,
    objects: [],
    rooms: ROOMS as never,
    fixtures: [],
    ceiling: [],
    photos: [],
    notes: [],
    niveauCourant: 0,
  });
};

const st = () => useScanStore.getState();

/** L'abscisse d'un appareil sur son mur, en mètres. */
const ou = (id: string) => st().fixtures.find((f) => f.id === id)!.along;

describe('répéter un appareil', () => {
  it('pose une copie au pas d’un plan de travail, et la rend', () => {
    planNeuf();
    const un = st().addFixture('prise', 'n', 1)!;
    const deux = st().repeterFixture(un)!;
    expect(deux).toBeTruthy();
    expect(deux).not.toBe(un);
    expect(Math.abs(ou(deux) - ou(un))).toBeCloseTo(PAS_SERIE, 2);
  });

  it('la copie est le MÊME appareil : type, hauteur, face', () => {
    planNeuf();
    const un = st().addFixture('prise20', 'n', 1)!;
    st().moveFixture(un, st().fixtures[0].along, 1.1);
    const deux = st().repeterFixture(un)!;
    const a = st().fixtures.find((f) => f.id === un)!;
    const b = st().fixtures.find((f) => f.id === deux)!;
    expect(b.kind).toBe(a.kind);
    expect(b.height).toBe(a.height);
    expect(b.side).toBe(a.side);
    expect(b.wallId).toBe(a.wallId);
  });

  it('mais ce n’est PAS un poste de plus sous la même plaque', () => {
    /*
      Deux appareils qui partagent une plaque portent le même `group` : ils se
      dessinent sous un seul enjoliveur et se comptent comme un ensemble au
      bordereau. Une série le long d'un plan de travail, ce sont des boîtes
      SÉPARÉES, à soixante centimètres l'une de l'autre.
    */
    planNeuf();
    const un = st().addFixture('prise', 'n', 1)!;
    const deux = st().repeterFixture(un)!;
    expect(st().fixtures.find((f) => f.id === deux)!.group).toBeUndefined();
  });
});

describe('le pas se devine', () => {
  it('la deuxième copie reprend l’écart de la première, pas le pas d’usine', () => {
    planNeuf();
    const un = st().addFixture('prise', 'n', 1)!;
    const deux = st().repeterFixture(un)!;
    // On règle le deuxième à la main, comme on le ferait au doigt.
    st().moveFixture(deux, 2.0, st().fixtures[0].height);
    const trois = st().repeterFixture(deux)!;
    /*
      ON NE NOMME PAS L'ÉCART, ON LE MESURE. La première version de ce banc
      écrivait « un mètre » parce que le doigt avait posé le second socle à
      `along = 2`. C'était faux, et d'un chiffre rond : l'abscisse d'un
      appareil se compte le long du MUR, celle d'une pose le long de la FACE,
      et les deux se décalent de la demi-épaisseur des retours d'angle. Le
      banc mesurait donc un écart qu'il croyait connaître.

      Ce qui compte n'est pas la valeur : c'est que le troisième reprenne
      L'ÉCART DU DEUXIÈME, quel qu'il soit, et qu'il ait bien oublié le pas
      d'usine.
    */
    const premier = ou(deux) - ou(un);
    const second = ou(trois) - ou(deux);
    expect(second).toBeCloseTo(premier, 3);
    // Et c'est bien un écart réglé à la main, pas le pas par défaut : sans
    // cela, l'épreuve passerait sans rien montrer.
    expect(Math.abs(premier - PAS_SERIE)).toBeGreaterThan(0.1);
  });

  it('et six appuis font six socles régulièrement espacés', () => {
    planNeuf();
    let courant = st().addFixture('prise', 'n', 0.5)!;
    const suite = [courant];
    for (let i = 0; i < 5; i++) {
      const n = st().repeterFixture(courant);
      expect(n).toBeTruthy();
      courant = n!;
      suite.push(courant);
    }
    const places = suite.map(ou);
    const ecarts = places.slice(1).map((x, i) => x - places[i]);
    for (const e of ecarts) expect(e).toBeCloseTo(PAS_SERIE, 2);
    // Six socles, et six boîtes distinctes.
    expect(new Set(suite).size).toBe(6);
  });
});

describe('une copie ne se pose pas n’importe où', () => {
  it('quand la place manque à droite, elle repart à gauche', () => {
    planNeuf();
    // Tout au bout du mur : à droite, il n'y a plus de mur.
    const un = st().addFixture('prise', 'n', 5.8)!;
    const deux = st().repeterFixture(un)!;
    expect(deux).toBeTruthy();
    expect(ou(deux)).toBeLessThan(ou(un));
  });

  it('elle reste sur la maçonnerie, jamais dans une baie', () => {
    /*
      Une porte-fenêtre au milieu du mur nord : la copie ne doit pas atterrir
      dedans. C'est déjà la règle d'une pose ordinaire ; elle ne s'assouplit
      pas parce que le geste est plus rapide.
    */
    planNeuf([
      {
        ...mur('baie', 1.6, 0, 4.4, 0),
        type: 'window',
      } as WallSeg,
    ]);
    const un = st().addFixture('prise', 'n', 1.2)!;
    const deux = st().repeterFixture(un);
    if (deux) {
      const x = ou(deux);
      expect(x < 1.6 || x > 4.4).toBe(true);
    }
  });

  it('et quand il n’y a de place nulle part, elle ne se pose pas', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE. Un geste qui réussit toujours ne prouve
      rien : on lui donne un mur où il ne PEUT pas réussir — un tout petit
      pan, déjà occupé — et l'on exige qu'il renonce. Un appareil posé hors
      du mur serait pire que pas de copie du tout.
    */
    useScanStore.getState().reset();
    useScanStore.setState({
      walls: [
        mur('n', 0, 0, 0.5, 0),
        mur('e', 0.5, 0, 0.5, 4),
        mur('s', 0.5, 4, 0, 4),
        mur('o', 0, 4, 0, 0),
      ],
      openings: [],
      objects: [],
      rooms: [
        { id: 'r1', name: 'Placard', wallIds: ['n', 'e', 's', 'o'] },
      ] as never,
      fixtures: [],
      ceiling: [],
      photos: [],
      notes: [],
      niveauCourant: 0,
    });
    const un = st().addFixture('prise', 'n', 0.25)!;
    expect(st().repeterFixture(un)).toBeNull();
    // Et rien ne s'est ajouté au plan.
    expect(st().fixtures).toHaveLength(1);
  });

  it('un appareil qu’on ne connaît pas ne fabrique rien', () => {
    planNeuf();
    expect(st().repeterFixture('pas-un-appareil')).toBeNull();
    expect(st().fixtures).toHaveLength(0);
  });
});

describe('et le geste s’annule d’un coup', () => {
  it('une copie retirée par « annuler » rend le plan d’avant', () => {
    planNeuf();
    const un = st().addFixture('prise', 'n', 1)!;
    st().repeterFixture(un);
    expect(st().fixtures).toHaveLength(2);
    st().undo();
    expect(st().fixtures).toHaveLength(1);
    expect(st().fixtures[0].id).toBe(un);
  });
});

/**
 * FACE AU MUR : ce qu'on voit, et ce qui ne prend plus la place.
 *
 * Trois défauts, un même symptôme — l'écran d'un téléphone se remplit vite :
 *
 *  1. la conformité tenait en six lignes, dont la MÊME phrase deux fois, et
 *     mangeait le tiers de l'écran juste au-dessus des boutons ;
 *  2. trois champs à « — » et cinq boutons éteints occupaient le bas dès
 *     l'ouverture, alors qu'il n'y a qu'un geste à faire sur un mur vide ;
 *  3. le dessin montrait une belle surface libre là où se dresse une
 *     bibliothèque — et la prise partait au chantier derrière le meuble.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Rect, Text as SvgText } from 'react-native-svg';
import { light } from '../src/theme';
import TestRenderer, { act } from 'react-test-renderer';
import { WallElevation } from '../src/components/WallElevation';
import { wallFace } from '../src/geometry/electrical';
import { wallFurniture } from '../src/geometry/nfc15100';
import { wallQuads } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';

import type { ObjectData } from 'react-native-room-scan';
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

/** Une bibliothèque de 1,20 m adossée au mur nord, à 2 m du coin. */
const BIBLIO: ObjectData = {
  id: 'o1',
  category: 'storage',
  width: 1.2,
  depth: 0.4,
  height: 1.8,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.9, 0.28, 1],
};

let precedent: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => precedent?.unmount());
  precedent = null;
});

function rendu(
  opts: {
    fixtures?: Fixture[];
    objects?: ObjectData[];
    onLink?: (id: string) => void;
  } = {},
) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: W,
      openings: [],
      objects: opts.objects ?? [],
      rooms: [{ id: 'r1', name: 'Chambre', floor: null }],
      fixtures: opts.fixtures ?? [],
      photos: [],
      showFurniture: true,
    });
    tree = TestRenderer.create(
      <WallElevation
        wallId="n"
        selectedId={opts.fixtures?.[0]?.id ?? null}
        onSelect={() => {}}
        onAddRequest={() => {}}
        onLinkRequest={opts.onLink}
        onClose={() => {}}
      />,
    );
  });
  act(() => {
    const zone = tree.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: 390, height: 380 } } });
  });
  precedent = tree;
  return tree;
}

const textes = (tree: TestRenderer.ReactTestRenderer) =>
  [...tree.root.findAllByType(Text), ...tree.root.findAllByType(SvgText)]
    .map((n) => n.props.children)
    .filter((x) => typeof x === 'string')
    .join(' | ');

describe('les meubles devant le mur', () => {
  /*
   * CONTRE LE MUR, LE MEUBLE SE VOIT FRANCHEMENT — relevé du patron :
   * « affiche aussi les meubles qui sont contre ce mur à quelques
   * centimètres près ». Ils s'affichaient déjà, mais en creux (9 %
   * d'opacité, tirets pâles) : invisibles. À douze centimètres ou moins
   * du nu, la silhouette prend la convention du plan — bleu, trait
   * plein ; la lointaine reste en creux.
   */
  it('dessine franchement le meuble contre le mur, en creux le lointain', () => {
    const contre: ObjectData = {
      id: 'c1',
      category: 'storage',
      width: 1,
      depth: 0.4,
      height: 2,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3.6, 1, 0.2, 1],
    };
    const loin: ObjectData = {
      id: 'l1',
      category: 'table',
      width: 1,
      depth: 0.6,
      height: 0.75,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0.375, 0.9, 1],
    };
    const tree = rendu({ objects: [contre, loin] });
    const rects = tree.root.findAllByType(Rect);
    expect(
      rects.filter(
        (n) => n.props.stroke === light.blue && !n.props.strokeDasharray,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      rects.filter((n) => n.props.strokeDasharray === '5 4').length,
    ).toBeGreaterThan(0);
  });

  it('se projettent à leur place et à leur hauteur', () => {
    const face = wallFace(W[0], wallQuads(W).get('n'), 1);
    const vus = wallFurniture(face, [BIBLIO]);
    expect(vus).toHaveLength(1);
    // 1,20 m de large centré à 2 m : de 1,40 à 2,60 sur l'axe du mur, moins
    // la demi-épaisseur mangée par le tableau du coin.
    expect(vus[0].to - vus[0].from).toBeCloseTo(1.2, 2);
    expect(vus[0].top).toBeCloseTo(1.8, 2);
  });

  it('et le meuble d’une autre pièce ne compte pas', () => {
    const face = wallFace(W[0], wallQuads(W).get('n'), 1);
    // Le même meuble, deux mètres plus loin dans la pièce : hors de portée.
    const loin = {
      ...BIBLIO,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.9, 2.6, 1],
    };
    expect(wallFurniture(face, [loin])).toHaveLength(0);
  });

  it('s’annoncent sur l’établi, avec leur nom et leur hauteur', () => {
    const vu = textes(rendu({ objects: [BIBLIO] }));
    expect(vu).toContain('1 meuble');
    // Le nom français de la catégorie, et sa hauteur en centimètres.
    expect(vu).toMatch(/180/);
  });

  it('et l’interrupteur ne paraît pas quand le mur est dégagé', () => {
    expect(textes(rendu())).not.toContain('meuble');
  });
});

describe('le bas de l’établi', () => {
  it('ne montre ni cotes ni pavé tant que rien n’est choisi', () => {
    const vu = textes(rendu());
    expect(vu).not.toContain('Gauche');
    expect(vu).not.toContain('Droite');
  });

  it('les montre dès qu’un appareil est tenu', () => {
    const vu = textes(
      rendu({
        fixtures: [
          { id: 'a', kind: 'prise', wallId: 'n', along: 1, height: 0.25, side: 1 },
        ],
      }),
    );
    expect(vu).toContain('Gauche');
    expect(vu).toContain('Hauteur');
  });

  /**
   * LE COPIER A VÉCU, LE LIEN LE REMPLACE — relevé du patron : « enlève le
   * bouton copier, et remplace-le par un bouton lien... prise ou éclairage
   * mural. Mais ça ne doit pas être possible pour le courant faible. »
   *
   * Une prise commandée, une applique : ils s'allument par un interrupteur,
   * comme un point du plafond — le lien se noue depuis l'établi, puis se
   * désigne sur le plan. Une RJ45, elle, n'a rien à commander.
   */
  it('dit « Lier », plus jamais « Copier »', () => {
    const vu = textes(
      rendu({
        fixtures: [
          { id: 'a', kind: 'prise', wallId: 'n', along: 1, height: 0.25, side: 1 },
        ],
        // Le geste n'existe que si un parent sait le recevoir : sans lui,
        // le bouton ne s'affiche pas du tout — un bouton qui ne commande
        // rien prenait la place et donnait l'écran pour cassé.
        onLink: () => {},
      }),
    );
    expect(vu).toContain('Lier');
    expect(vu).not.toContain('Copier');
    expect(vu).not.toContain('Coller');
  });

  it('rend l’appareil tenu au parent, qui nouera le lien sur le plan', () => {
    const onLink = jest.fn();
    const tree = rendu({
      fixtures: [
        { id: 'ap1', kind: 'applique', wallId: 'n', along: 2, height: 1.8, side: 1 },
      ],
      onLink,
    });
    const lier = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Lier')!;
    expect(lier.props.disabled).toBeFalsy();
    act(() => lier.props.onPress());
    expect(onLink).toHaveBeenCalledWith('ap1');
  });

  it('refuse le courant faible : une RJ45 n’a rien à commander', () => {
    const tree = rendu({
      fixtures: [
        { id: 'rj', kind: 'rj45', wallId: 'n', along: 1, height: 0.25, side: 1 },
      ],
      onLink: () => {},
    });
    // Le bouton ne s'ÉTEINT plus, il n'est plus là : c'est la refonte
    // « optimisé smartphone » — un geste impossible ne prend pas de place.
    const lier = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Lier');
    expect(lier).toBeUndefined();
  });
});

describe('le bandeau de conformité', () => {
  it('tient en une ligne, sans répéter la règle', () => {
    const vu = textes(rendu());
    // L'objectif de la pièce, chiffré.
    expect(vu).toMatch(/Chambre · 0\/\d socles/);
    // Et la règle n'est PAS dépliée : elle attend qu'on la demande.
    expect(vu).not.toContain('trois socles 16 A au minimum');
  });

  it('et la règle se déplie d’un appui', () => {
    const tree = rendu();
    // Le bandeau est le bouton qui PORTE le titre de la pièce.
    const cible = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) =>
        n
          .findAllByType(Text)
          .some((x) => String(x.props.children).includes('Chambre')),
      )!;
    act(() => cible.props.onPress());
    expect(textes(tree)).toContain('socles 16 A');
  });
});

/**
 * DEUX SORTIES, ET ELLES NE FONT PAS LA MÊME CHOSE.
 *
 * Tout ce qu'on pose face au mur part dans le plan à l'instant même — c'est
 * ce qui permet de voir la cote bouger en glissant le doigt. La croix ne
 * fermait donc rien : une prise posée à côté restait dans le plan sans
 * qu'on sache comment l'annuler.
 */
describe('quitter l’établi', () => {
  it('propose d’enregistrer, et une croix pour renoncer', () => {
    const vu = textes(rendu());
    expect(vu).toContain('Enregistrer');
  });

  it('la croix rend le mur tel qu’on l’a ouvert', () => {
    const avant: Fixture[] = [
      { id: 'a', kind: 'prise', wallId: 'n', along: 1, height: 0.25, side: 1 },
    ];
    const tree = rendu({ fixtures: avant });
    // On pose un appareil de plus, comme le ferait le catalogue.
    act(() => {
      useScanStore.setState({
        fixtures: [
          ...avant,
          { id: 'b', kind: 'inter', wallId: 'n', along: 2, height: 1.1, side: 1 },
        ],
      });
    });
    expect(useScanStore.getState().fixtures).toHaveLength(2);

    // La croix : un ordre de restauration part vers le magasin.
    const croix = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Fermer sans garder')!;
    expect(croix).toBeDefined();
    const alerte = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    act(() => croix.props.onPress());
    // Elle DEMANDE d'abord : abandonner un quart d'heure de pose sur un
    // appui malheureux serait pire que le défaut d'origine.
    expect(alerte).toHaveBeenCalled();
    const boutons = alerte.mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];
    const abandon = boutons.find((b) => b.text === 'Abandonner')!;
    act(() => abandon.onPress?.());
    expect(useScanStore.getState().fixtures).toHaveLength(1);
    alerte.mockRestore();
  });

  it('et ne demande rien quand rien n’a bougé', () => {
    const tree = rendu();
    const croix = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === 'Fermer sans garder')!;
    const alerte = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    act(() => croix.props.onPress());
    expect(alerte).not.toHaveBeenCalled();
    alerte.mockRestore();
  });
});

/**
 * LE PAVÉ DE FLÈCHES : un appui maintenu vaut cent appuis.
 *
 * Traverser un mur de trois mètres au centimètre demandait trois cents
 * appuis — personne ne le faisait : on repartait au doigt, et on perdait la
 * précision qu'on était venu chercher. Et les traits d'alignement, eux,
 * n'apparaissaient qu'au glissement : au pavé, on passait DEVANT un
 * alignement sans le voir.
 */
describe('les flèches de réglage', () => {
  const PRISE: Fixture = {
    id: 'a',
    kind: 'prise',
    wallId: 'n',
    along: 1,
    height: 0.25,
    side: 1,
  };
  const fleche = (tree: TestRenderer.ReactTestRenderer, sens: string) =>
    tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === sens)!;

  it('un appui déplace d’un pas', () => {
    const tree = rendu({ fixtures: [PRISE] });
    const avant = useScanStore.getState().fixtures[0].along;
    act(() => fleche(tree, 'droite').props.onPressIn());
    act(() => fleche(tree, 'droite').props.onPressOut());
    const apres = useScanStore.getState().fixtures[0].along;
    expect(Math.abs(apres - avant)).toBeCloseTo(0.01, 3);
  });

  it('et l’appui maintenu les enchaîne, de plus en plus vite', () => {
    const tree = rendu({ fixtures: [PRISE] });
    const avant = useScanStore.getState().fixtures[0].along;
    act(() => fleche(tree, 'droite').props.onPressIn());
    // Une seconde de doigt posé : bien plus d'un pas, et la cadence
    // s'accélère — on ne compte donc pas un nombre exact, on vérifie
    // qu'on a franchi une distance qu'un seul appui ne donnerait jamais.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    act(() => fleche(tree, 'droite').props.onPressOut());
    const apres = useScanStore.getState().fixtures[0].along;
    expect(Math.abs(apres - avant)).toBeGreaterThan(0.04);

    // Et le doigt levé arrête tout : rien ne bouge plus.
    const fige = useScanStore.getState().fixtures[0].along;
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(useScanStore.getState().fixtures[0].along).toBe(fige);
  });
});

/**
 * L'EN-TÊTE DE L'ÉTABLI — trois sorties, une légende, et rien qui se marche
 * dessus.
 *
 * Le relevé du chantier : « la croix doit être un bloc de la même hauteur
 * que le Enregistrer », « 1 meuble cache du texte », « en bas trop de marge
 * de bloc inutile ». Trois défauts de mise en page, tous vérifiables sans
 * capture d'écran — et donc tenus ici.
 */
describe('la mise en page de l’établi', () => {
  /** Le style aplati d'un nœud, quel que soit son empilement de tableaux. */
  const style = (n: TestRenderer.ReactTestInstance) => {
    const plats = Array.isArray(n.props.style) ? n.props.style : [n.props.style];
    return Object.assign({}, ...plats.filter(Boolean).flat(Infinity));
  };

  const boutonNommé = (tree: TestRenderer.ReactTestRenderer, label: string) =>
    tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => n.props.accessibilityLabel === label);

  it('donne à la croix le gabarit du bouton d’enregistrement', () => {
    const tree = rendu();
    const croix = boutonNommé(tree, 'Fermer sans garder');
    expect(croix).toBeDefined();
    const enregistrer = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) =>
        n
          .findAllByType(Text)
          .some((t) => t.props.children === 'Enregistrer'),
      );
    expect(enregistrer).toBeDefined();
    const sc = style(croix!);
    const se = style(enregistrer!);
    /*
      LES DEUX SORTIES NE SE RESSEMBLENT PLUS, ET C'EST VOULU.

      Elles étaient voisines dans l'en-tête, donc de même gabarit. La
      refonte les sépare par ce qu'elles font : « Enregistrer » est
      l'action principale — pleine largeur, en bas, sous le pouce ; la
      croix est le geste rare qui ABANDONNE, et reste petite en haut.
    */
    expect(se.height).toBeGreaterThan(sc.height);
    expect(se.width).toBe('100%');
    // Et un bloc, pas une pastille : le rayon n'est plus la moitié du côté.
    expect(sc.borderRadius).toBeLessThan(sc.height / 2);
    // La règle des 44 points tient pour les deux.
    expect(sc.height).toBeGreaterThanOrEqual(44);
    expect(se.height).toBeGreaterThanOrEqual(44);
  });

  it('pose la pastille des meubles DANS le flux, sous la légende', () => {
    const tree = rendu({ objects: [BIBLIO] });
    const pastille = boutonNommé(tree, 'Meubles devant ce mur');
    expect(pastille).toBeDefined();
    const sp = style(pastille!);
    // Flottante, elle tombait sur la légende du mur et en cachait la
    // moitié : plus rien ne se superpose.
    expect(sp.position).toBeUndefined();
    expect(sp.alignSelf).toBe('flex-start');
  });

  it('ne réserve plus toute la hauteur de l’écran', () => {
    const tree = rendu();
    // La feuille : le premier View, celui qui porte l'ombre et le fond.
    const feuille = tree.root.findAllByType(View)[0];
    const sf = style(feuille);
    expect(sf.flex).toBeUndefined();
    expect(sf.maxHeight).toBe('100%');
  });
});

/**
 * PLUSIEURS PHOTOS PAR MUR, ET LA PHOTO D'UN RETOUR.
 *
 * Relevé du patron : « ajoute la possibilité de prendre plusieurs photos
 * d'un mur, et un retour de mur doit aussi pouvoir avoir sa photo, sans
 * prendre tout le mur ». Le magasin savait déjà en garder plusieurs ; ce
 * qui manquait, c'est que la photo vise CE QU'ON REGARDE — sans quoi elles
 * se punaisaient toutes au même endroit, au milieu du mur.
 */
describe('la photo de repérage', () => {
  const RoomScan = require('react-native-room-scan').RoomScan;

  beforeEach(() => {
    RoomScan.takePhoto.mockImplementation(async () => '/tmp/p.jpg');
  });
  afterEach(() => {
    RoomScan.takePhoto.mockImplementation(async () => null);
  });

  /** Le mur nord percé d'une porte : deux retours de maçonnerie. */
  const PORTE: WallSeg = {
    id: 'p1',
    type: 'door',
    a: { x: 2, z: 0 },
    b: { x: 2.9, z: 0 },
    height: 2.04,
    yCenter: 1.02,
    roomId: 'r1',
  };

  const rendreAvecPorte = (focusX?: number) => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        walls: W,
        openings: [PORTE],
        objects: [],
        rooms: [{ id: 'r1', name: 'Chambre', floor: null }],
        fixtures: [],
        photos: [],
        showFurniture: true,
      });
      tree = TestRenderer.create(
        <WallElevation
          wallId="n"
          focusX={focusX}
          selectedId={null}
          onSelect={() => {}}
          onAddRequest={() => {}}
          onClose={() => {}}
        />,
      );
    });
    act(() => {
      const zone = tree.root
        .findAllByType(View)
        .find((n) => typeof n.props.onLayout === 'function')!;
      zone.props.onLayout({
        nativeEvent: { layout: { width: 390, height: 380 } },
      });
    });
    precedent = tree;
    return tree;
  };

  const bouton = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root
      .findAllByType(TouchableOpacity)
      .find((n) =>
        String(n.props.accessibilityLabel ?? '').startsWith('Photo'),
      )!;

  it('en garde PLUSIEURS, sans écraser la précédente', async () => {
    const tree = rendreAvecPorte();
    await act(async () => {
      await bouton(tree).props.onPress();
    });
    await act(async () => {
      await bouton(tree).props.onPress();
    });
    expect(useScanStore.getState().photos).toHaveLength(2);
  });

  it('vise le RETOUR regardé, pas le milieu du mur', async () => {
    // Le retour de droite : entre la porte (2,90 m) et l'angle (5 m).
    const tree = rendreAvecPorte(3.5);
    await act(async () => {
      await bouton(tree).props.onPress();
    });
    const [ph] = useScanStore.getState().photos;
    expect(ph).toBeDefined();
    // La punaise tombe dans le retour visé, pas au milieu du mur (2,50 m).
    expect(ph.along).toBeGreaterThan(2.9);
    expect(ph.along).toBeLessThan(5);
    // Et le bouton dit ce qu'il va photographier.
    expect(bouton(tree).props.accessibilityLabel).toContain('retour');
  });

  it('sans retour visé, elle prend le mur entier', async () => {
    const tree = rendreAvecPorte();
    expect(bouton(tree).props.accessibilityLabel).not.toContain('retour');
    await act(async () => {
      await bouton(tree).props.onPress();
    });
    const [ph] = useScanStore.getState().photos;
    expect(ph.along).toBeCloseTo(2.5, 1);
  });
});

/**
 * L'ÉTABLI REPENSÉ POUR LE POUCE — relevé du patron : « repense un peu
 * cette page pour plus de simplicité, plus ergonomique et moderne, optimisé
 * smartphone ».
 *
 * Trois défauts se voyaient sur sa capture :
 *
 * - le TITRE était tronqué deux fois (« Face au… », « mur sud-est de
 *   2,8… ») : trois boutons se partageaient l'en-tête avec lui, dont un
 *   « Enregistrer » vert qui prenait le tiers de la largeur ;
 * - quatre boutons ÉTEINTS occupaient le bas dès l'ouverture — le défaut
 *   que cet écran avait déjà corrigé une fois, et qui était revenu ;
 * - l'action principale vivait EN HAUT, là où le pouce n'atteint pas sur
 *   un téléphone tenu d'une main.
 */
describe('l’établi tient dans une main', () => {
  const enTete = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root
      .findAll((n) => {
        const st = StyleSheet.flatten(n.props?.style) as
          | { flexDirection?: string }
          | undefined;
        return (
          st?.flexDirection === 'row' &&
          n.findAllByType(Text).some((t) =>
            String(t.props.children ?? '').includes('mur'),
          )
        );
      })[0];

  it('ne garde qu’une sortie dans l’en-tête : le titre a la place', () => {
    const tree = rendu();
    const tete = enTete(tree);
    expect(tete).toBeDefined();
    const boutons = tete
      .findAllByType(TouchableOpacity)
      .filter((n) => !String(n.props.accessibilityLabel ?? '').includes('Meubles'));
    // La croix, et rien d'autre : « Enregistrer » et la photo sont
    // descendus à portée de pouce.
    expect(boutons).toHaveLength(1);
    expect(String(boutons[0].props.accessibilityLabel)).toContain('Fermer');
  });

  it('n’affiche aucun bouton éteint quand rien n’est tenu', () => {
    const tree = rendu();
    const morts = tree.root
      .findAllByType(TouchableOpacity)
      .filter((n) => n.props.disabled === true);
    expect(morts).toHaveLength(0);
  });

  it('garde le geste d’ajout et la photo sous le pouce', () => {
    const vu = textes(rendu());
    expect(vu).toContain('Ajouter');
    // La photo devient un geste comme les autres, dans la même rangée.
    const tree = rendu();
    const photo = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) => String(n.props.accessibilityLabel ?? '').startsWith('Photo'));
    expect(photo).toBeDefined();
  });

  it('pose « Enregistrer » en bas, sur toute la largeur', () => {
    const tree = rendu();
    const valider = tree.root
      .findAllByType(TouchableOpacity)
      .find((n) =>
        n.findAllByType(Text).some((t) => t.props.children === 'Enregistrer'),
      )!;
    expect(valider).toBeDefined();
    const st = StyleSheet.flatten(valider.props.style) as {
      alignSelf?: string;
      width?: number | string;
      flexGrow?: number;
    };
    // Pleine largeur : c'est l'action principale, elle se vise sans regarder.
    expect(st.width === '100%' || st.alignSelf === 'stretch').toBe(true);
  });
});

/**
 * LA COTE DU MUR TIENT DANS LE CADRE.
 *
 * Relevé du chantier : « la longueur du mur, sa cote est cachée en haut du
 * bloc ». La ligne de cote se pose vingt-six points au-dessus du plafond
 * (`COTE_H`) et la marge du dessin en valait autant (`PAD_TOP`) : le nombre
 * écrit dessus débordait donc du cadre, et « 2,72 m » sortait coupé en deux
 * dans le sens de la hauteur.
 *
 * Une marge doit contenir ce qu'elle marge : le texte compte, pas seulement
 * le trait.
 */
describe('la cote de longueur', () => {
  it('a la place de s’écrire au-dessus du mur', () => {
    const { COTE_H, PAD_TOP } = require('../src/components/WallElevation');
    // La ligne, PLUS son nombre : une douzaine de points de texte.
    expect(PAD_TOP).toBeGreaterThanOrEqual(COTE_H + 12);
  });
});

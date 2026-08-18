/**
 * LES BANDEAUX DE RÉGLAGE — le banc d'essai qui manquait.
 *
 * Sous le plan, cinq bandeaux se relaient : les cotes d'un meuble, la place
 * d'un appareil de plafond, le nom d'une pièce, la largeur d'une menuiserie,
 * la longueur d'un mur. Ce sont eux qu'on retouche à chaque demande
 * d'ergonomie — et rien ne les couvrait : les planches de rendu ne
 * surveillent que le plan et le modèle 3D.
 *
 * Ce fichier monte l'écran des résultats avec un vrai scan et vérifie ce qui
 * compte : le bon bandeau paraît au bon moment, il porte les bonnes valeurs,
 * et il n'y en a jamais deux à la fois — ils occupent la même place au bas
 * de l'écran.
 *
 * Il sert aussi à découper cet écran de trois mille quatre cents lignes sans
 * rien casser : déplacer du code qu'aucun test ne regarde, c'est échanger
 * une dette contre un risque.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { PILL_CELL_H } from '../src/components/ToolPill';
import { Circle, Path, Text as SvgText } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { ResultScreen } from '../src/screens/ResultScreen';
import { useScanStore } from '../src/store/scanStore';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

import { castToWall, planFrameAngle } from '../src/geometry/floorplan';

import type { CeilingFixture } from '../src/geometry/ceiling';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

/** Un point lumineux dans la première pièce : de quoi ouvrir son bandeau. */
const PLAFOND: CeilingFixture[] = [
  {
    id: 'pl1',
    kind: 'dcl',
    roomId: SNAPSHOT_ROOMS[0].id,
    at: { x: 1.6, z: 1.4 },
  },
];

/** Et une LIGNE de trois spots, posée d'un geste, dans la même pièce. */
const LIGNE: CeilingFixture[] = [0, 1, 2].map((i) => ({
  id: `sp${i}`,
  kind: 'spot' as const,
  roomId: SNAPSHOT_ROOMS[0].id,
  at: { x: 1.2 + i * 0.7, z: 2.4 },
  row: 'ln-test',
  axe: 'longueur' as const,
}));

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

function monter() {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      screen: 'result',
      scanName: 'Chantier test',
      walls: SNAPSHOT_WALLS,
      openings: SNAPSHOT_OPENINGS,
      objects: SNAPSHOT_OBJECTS,
      rooms: SNAPSHOT_ROOMS.map((r, i) => ({
        id: r.id,
        name: `Pièce ${i + 1}`,
        floor: null,
      })),
      fixtures: SNAPSHOT_FIXTURES,
      ceiling: [...PLAFOND, ...LIGNE],
      photos: [],
      showFurniture: true,
      showSurfaces: true,
      north: 0,
    });
    tree = TestRenderer.create(<ResultScreen />);
  });
  // Le plan a besoin de sa taille pour dessiner quoi que ce soit.
  act(() => {
    for (const n of tree.root.findAllByType(View)) {
      if (typeof n.props.onLayout === 'function') {
        n.props.onLayout({
          nativeEvent: { layout: { width: 390, height: 520 } },
        });
      }
    }
  });
  arbre = tree;
  return tree;
}

/**
 * Tous les textes visibles, plans compris.
 *
 * Un libellé comme « Hauteur 2,50 m » arrive en TROIS morceaux — le mot,
 * la valeur interpolée, l'unité. Ne garder que les enfants déjà chaînes
 * reviendrait à ne jamais voir ces libellés-là, et à croire un bandeau
 * vide alors qu'il est plein.
 */
const textes = (tree: TestRenderer.ReactTestRenderer) =>
  [...tree.root.findAllByType(Text), ...tree.root.findAllByType(SvgText)]
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .filter((t) => t.length > 0)
    .join(' | ');

/** Le bouton portant cette étiquette d'accessibilité. */
const bouton = (tree: TestRenderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAllByType(TouchableOpacity)
    .find((n) => n.props.accessibilityLabel === label);

describe('l’écran des résultats', () => {
  it('s’ouvre sur le plan, sans aucun bandeau de réglage', () => {
    const vu = textes(monter());
    expect(vu).toContain('Chantier test');
    // Aucun réglage tant que rien n'est sélectionné.
    expect(vu).not.toContain('Longueur du mur');
    expect(vu).not.toContain('Renommer');
  });

  /**
   * LA BOUSSOLE SE DEMANDE, ELLE NE S'IMPOSE PAS.
   *
   * On ouvre un plan pour lire des cotes. Les quatre lettres au bord du
   * cadre servent à désigner un mur — un besoin ponctuel, pas permanent —
   * et elles occupent justement la place où tombent les cotes de rive. Le
   * calque part donc éteint, et le bouton le rallume en un appui.
   */
  it('s’ouvre SANS les points cardinaux, et le bouton les rallume', () => {
    const tree = monter();
    const lettres = () =>
      tree.root
        .findAllByType(SvgText)
        .map((n) => n.props.children)
        .filter((c) => c === 'N' || c === 'E' || c === 'S' || c === 'O');
    expect(lettres()).toHaveLength(0);
    const b = bouton(tree, 'Nord');
    expect(b).toBeDefined();
    act(() => b?.props.onPress());
    // Quatre lettres par vue affichée : la couronne est bien là.
    expect(lettres().length).toBeGreaterThanOrEqual(4);
    act(() => b?.props.onPress());
    expect(lettres()).toHaveLength(0);
  });

  it('porte ses calques et son bouton d’édition', () => {
    const tree = monter();
    expect(bouton(tree, 'Édition')).toBeDefined();
    expect(bouton(tree, 'Meubles')).toBeDefined();
    expect(bouton(tree, 'Surfaces')).toBeDefined();
    // Le plafond est équipé : son calque doit être proposé.
    expect(bouton(tree, 'Plafond')).toBeDefined();
  });

  /**
   * LE BANDEAU DU PLAFOND.
   *
   * Il s'ouvre en touchant l'appareil sur le plan, et porte ses distances
   * aux murs — les mêmes que les pointillés du dessin, en centimètres.
   */
  /**
   * UNE LIGNE SE PREND ENTIÈRE, PUIS SPOT PAR SPOT.
   *
   * Toucher un spot d'une ligne de quatre pour n'en attraper qu'un seul,
   * c'était condamner l'utilisateur à quatre réglages là où il voulait
   * retourner la ligne. Le premier appui la prend donc tout entière — le
   * bandeau annonce le nombre de spots et propose les deux axes — et un
   * second appui sur le même spot l'en détache pour le réglage fin.
   */
  it('prend la LIGNE au premier appui, le spot au second', () => {
    const tree = monter();
    // Un SPOT, reconnu à son symbole : le disque cerné de quatre rayons.
    // Chercher « un groupe touchable » ne suffit pas — l'appareillage mural
    // en pose aussi, et le banc attrapait une prise TV.
    const RAYON = 'M-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0';
    const spots = () =>
      tree.root
        .findAll((n) => typeof n.props?.onPress === 'function')
        .filter((n) =>
          n.findAllByType(Path).some((p) => p.props.d === RAYON),
        );
    const spot = spots()[0];
    expect(spot).toBeDefined();
    act(() => spot.props.onPress());
    let vu = textes(tree);
    expect(vu).toContain('3 spots');
    expect(vu).toContain('sur la longueur');
    expect(bouton(tree, 'Largeur')).toBeDefined();
    expect(bouton(tree, 'Longueur')).toBeDefined();

    // Retourner la ligne : le bandeau le dit aussitôt.
    act(() => bouton(tree, 'Largeur')?.props.onPress());
    expect(textes(tree)).toContain('sur la largeur');

    // Second appui sur le même spot : il sort de sa ligne.
    const encore = spots()[0];
    act(() => encore.props.onPress());
    vu = textes(tree);
    expect(vu).not.toContain('3 spots');
    // Le bandeau d'un appareil seul parle de sa place, en centimètres.
    expect(bouton(tree, 'Retirer')).toBeDefined();
  });

  it('ouvre le bandeau du plafond quand on touche l’appareil', () => {
    const tree = monter();
    // Le calque de plafond enveloppe chaque appareil dans un groupe
    // touchable : c'est lui qui porte le geste, pas le disque.
    const groupe = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) =>
        n
          .findAllByType(Circle)
          .some((cercle) => cercle.props.fill === 'transparent'),
      );
    expect(groupe).toBeDefined();
    act(() => groupe!.props.onPress());
    const vu = textes(tree);

    /**
     * LES VALEURS SONT CELLES DU PLAN, pas des nombres décoratifs.
     *
     * Le bandeau a déjà menti une fois : il comptait depuis le coin de
     * l'emprise de la pièce quand les pointillés du dessin, eux,
     * mesuraient jusqu'aux MURS. Deux quantités différentes affichées
     * côte à côte. On recalcule donc ici ce que la géométrie doit rendre,
     * et on l'exige à l'écran.
     */
    const trame = planFrameAngle(SNAPSHOT_WALLS);
    const cos = Math.cos(trame);
    const sin = Math.sin(trame);
    for (const axe of [
      { x: -cos, z: -sin },
      { x: sin, z: -cos },
    ]) {
      const d = castToWall(PLAFOND[0].at, axe, SNAPSHOT_WALLS);
      expect(d).not.toBeNull();
      expect(vu).toContain(String(Math.round(d! * 100)));
    }
    // Et de quoi agir sans quitter le bandeau.
    expect(bouton(tree, 'Relier à une commande')).toBeDefined();
  });

  /**
   * LE BANDEAU DU MUR.
   *
   * Il ne paraît qu'en édition — hors édition, toucher un mur ne fait
   * rien, c'est ce qui permet de lire un plan sans le modifier par
   * mégarde — et porte la longueur du mur choisi.
   */
  it('n’ouvre le bandeau du mur qu’en édition', () => {
    const tree = monter();
    /**
     * Le corps d'un mur : il porte une zone de toucher élargie — un trait
     * transparent de trente points — que rien d'autre ne dessine.
     */
    const murTouchable = () =>
      tree.root
        .findAll((n) => typeof n.props?.onPress === 'function')
        .find(
          (n) => n.findAll((x) => x.props?.strokeWidth === 30).length > 0,
        );

    // Hors édition : rien à toucher.
    expect(murTouchable()).toBeUndefined();

    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const cible = murTouchable();
    expect(cible).toBeDefined();
    act(() => cible!.props.onPress());

    // Le menu du mur paraît : ses quatre gestes, dont l'établi électrique.
    const vu = textes(tree);
    expect(vu).toContain('Élec');
    expect(vu).toContain('Supprimer');
    // Et le bandeau du bas donne ses cotes, avec de quoi les changer.
    expect(vu).toContain('sous plafond');
    expect(vu).toContain('Coter');
  });

  /**
   * LE BANDEAU NE PASSE JAMAIS SOUS LA RANGÉE DE CALQUES.
   *
   * Relevé du chantier : « il y a des superpositions de boutons ». Le
   * bandeau et les outils partageaient la même ligne de fond ; le bouton
   * « Coter » finissait derrière une pastille, et on appuyait à côté.
   * Trois étages, désormais, du bas vers le haut : l'indicateur d'accueil,
   * la rangée des calques, puis le bandeau. On vérifie l'ordre, pas les
   * chiffres — pour qu'il tienne quel que soit le téléphone.
   */
  it('pose le bandeau AU-DESSUS de la rangée d’outils', () => {
    const tree = monter();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const mur = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) => n.findAll((x) => x.props?.strokeWidth === 30).length > 0);
    act(() => mur!.props.onPress());

    const plat = (n: TestRenderer.ReactTestInstance) => {
      const st = n.props.style;
      return Object.assign(
        {},
        ...(Array.isArray(st) ? st : [st]).filter(Boolean).flat(Infinity),
      );
    };
    /** La ligne de fond de la rangée de calques. */
    const rail = tree.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          plat(n).position === 'absolute' &&
          plat(n).flexDirection === 'row' &&
          plat(n).left === 0,
      )
      .map(plat)[0];
    expect(rail).toBeDefined();
    /** Le bandeau : la barre blanche qui porte les cotes du mur. */
    const bandeau = tree.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          plat(n).position === 'absolute' &&
          typeof plat(n).bottom === 'number' &&
          plat(n).left === 12,
      )
      .map(plat)[0];
    expect(bandeau).toBeDefined();
    // Un étage complet le sépare des pastilles : hauteur d'une cellule, et
    // l'écart habituel.
    expect(bandeau.bottom).toBeGreaterThanOrEqual(rail.bottom + PILL_CELL_H);
    // Et il s'arrête avant la colonne d'actions, sur sa droite.
    expect(bandeau.marginRight).toBeGreaterThanOrEqual(50);
  });

  /**
   * L'ASTUCE DU RETOUR DE MUR SE LIT.
   *
   * Relevé du chantier : « le message qui dit qu'on peut sélectionner tout le
   * mur est caché derrière l'interface ». Il était en bas à gauche, c'est-à-
   * dire, depuis la refonte, sous la rangée de calques. Et « l'appui long ne
   * fonctionne pas bien » : neuf cents millisecondes, c'est plus long que ce
   * qu'un doigt tient immobile sur un écran.
   */
  it('pose l’astuce en haut du plan, et rend l’appui long prenable', () => {
    const tree = monter();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    // Le retour de mur se prend en touchant sa maçonnerie.
    const retour = tree.root
      .findAll((n) => typeof n.props?.onLongPress === 'function')
      .find((n) => n.props.strokeWidth === 6);
    expect(retour).toBeDefined();
    // Un tiers de seconde : au-delà, le doigt a bougé et l'appui est perdu.
    expect(retour!.props.delayLongPress).toBeLessThanOrEqual(400);
    act(() => retour!.props.onPress());

    const plat = (n: TestRenderer.ReactTestInstance) => {
      const st = n.props.style;
      return Object.assign(
        {},
        ...(Array.isArray(st) ? st : [st]).filter(Boolean).flat(Infinity),
      );
    };
    const note = tree.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          plat(n).position === 'absolute' &&
          typeof plat(n).top === 'number' &&
          plat(n).maxWidth === 230,
      )
      .map(plat)[0];
    expect(note).toBeDefined();
    // En HAUT : le bas appartient aux calques et aux bandeaux.
    expect(note.top).toBeLessThan(40);
    expect(note.bottom).toBeUndefined();
  });

  /**
   * LES QUATRE FLÈCHES DU MEUBLE.
   *
   * Relevé du chantier : « au-dessus de ce bloc, affiche quatre flèches qui
   * permettent de modifier au pixel près l'emplacement d'un meuble ». Le doigt
   * déplace de trois centimètres quand on en voulait un, et il cache ce qu'il
   * pousse. Les flèches poussent d'un centimètre, DANS L'AXE DE L'ÉCRAN — pas
   * dans celui du scan, qui n'a aucun sens pour l'œil.
   */
  it('déplace le meuble d’un centimètre à la flèche', () => {
    const tree = monter();
    // On touche le meuble sur le plan, puis on ouvre ses cotes : c'est là que
    // les flèches se trouvent.
    const meuble = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) => n.findAll((x) => x.props?.rx === 3).length > 0);
    expect(meuble).toBeDefined();
    act(() => meuble!.props.onPress());
    const cotes = bouton(tree, 'Cotes du meuble');
    expect(cotes).toBeDefined();
    act(() => cotes!.props.onPress());

    const avant = useScanStore.getState().objects[0].transform.slice();
    const droite = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) => n.props.accessibilityLabel === 'Déplacer vers la droite');
    expect(droite).toBeDefined();
    act(() => droite!.props.onPress());
    const apres = useScanStore.getState().objects[0].transform;
    const pas = Math.hypot(apres[12] - avant[12], apres[14] - avant[14]);
    // Un centimètre, pas un de plus : c'est la promesse.
    expect(pas).toBeGreaterThan(0.005);
    expect(pas).toBeLessThan(0.015);
  });

  /**
   * LE BANDEAU DU MEUBLE.
   *
   * On touche le meuble, puis sa pastille de cotes : le bandeau donne sa
   * largeur et sa profondeur. Elles se saisissaient dans deux champs posés
   * au bas de l'écran — c'est-à-dire là où le clavier vient se mettre.
   */
  it('ouvre le bandeau du meuble, avec ses cotes', () => {
    const tree = monter();
    /** Un meuble : un groupe touchable qui porte son emprise arrondie. */
    const meuble = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) => n.findAll((x) => x.props?.rx === 3).length > 0);
    expect(meuble).toBeDefined();
    act(() => meuble!.props.onPress());
    const cotes = bouton(tree, 'Cotes du meuble');
    expect(cotes).toBeDefined();
    act(() => cotes!.props.onPress());

    // Les deux cotes du meuble, en mètres, telles que le scan les donne.
    const o = SNAPSHOT_OBJECTS[0];
    const vu = textes(tree);
    expect(vu).toContain(o.width.toFixed(2).replace('.', ','));
    expect(vu).toContain(o.depth.toFixed(2).replace('.', ','));
  });

  /**
   * AUCUNE SAISIE NE SE FAIT SOUS LE CLAVIER.
   *
   * Les bandeaux vivent en bas de l'écran, où le clavier se pose : un champ
   * qui s'y trouve est un champ qu'on ne voit pas pendant qu'on tape. La
   * saisie passe donc par la feuille, qui monte AVEC le clavier — et le
   * bandeau ne porte plus que des pastilles qu'on touche.
   */
  it('ne pose aucun champ de saisie dans les bandeaux', () => {
    const tree = monter();
    const meuble = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) => n.findAll((x) => x.props?.rx === 3).length > 0);
    act(() => meuble!.props.onPress());
    act(() => bouton(tree, 'Cotes du meuble')!.props.onPress());
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  /**
   * LE BANDEAU DE LA PIÈCE.
   *
   * On touche le SOL, en édition : la pièce se nomme, sa hauteur sous
   * plafond se règle, et on peut la retirer du scan. Hors édition, le sol
   * ne répond pas — on lit un plan sans le modifier par mégarde.
   */
  it('ouvre le bandeau de la pièce quand on touche son sol', () => {
    const tree = monter();
    /** Le sol : deux polygones superposés, dont un semis de points. */
    const sol = () =>
      tree.root
        .findAll((n) => typeof n.props?.onPress === 'function')
        .find(
          (n) =>
            n.findAll((x) => x.props?.fill === 'url(#floorDots)').length > 0,
        );

    expect(sol()).toBeUndefined();
    act(() => bouton(tree, 'Édition')!.props.onPress());
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const cible = sol();
    expect(cible).toBeDefined();
    act(() => cible!.props.onPress());

    const vu = textes(tree);
    expect(vu).toContain('Nommer');
    // La hauteur tient en trois caractères : « H 2,50 m ». Le mot entier
    // poussait le troisième bouton hors du bandeau.
    expect(vu).toMatch(/H \d/);
    // Le bandeau annonce la pièce qu'il règle, avec sa surface.
    expect(vu).toMatch(/Pièce \d/);
  });

  /**
   * ET JAMAIS DEUX À LA FOIS.
   *
   * Ils occupent la même place au bas de l'écran : deux bandeaux ouverts,
   * c'est l'un sous l'autre, et le second illisible.
   */
  it('ne montre jamais deux bandeaux à la fois', () => {
    const tree = monter();
    const groupe = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function')
      .find((n) =>
        n
          .findAllByType(Circle)
          .some((cercle) => cercle.props.fill === 'transparent'),
      );
    act(() => groupe!.props.onPress());
    // Le bandeau du plafond est ouvert : celui du mur ne doit pas l'être.
    expect(bouton(tree, 'Relier à une commande')).toBeDefined();
    expect(bouton(tree, 'Élec')).toBeUndefined();
  });
});
